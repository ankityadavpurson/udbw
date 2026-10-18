const { isTransportError } = require('./errors');
const { openTunnelFor, closeTunnel } = require('./tunnel');
const store = require('./store');

// Live connections by profile id, kept in memory only. A connection that drops is remembered in `lost` and is
// re-opened from the saved profile on the next request instead of leaving the UI stuck on a dead session.
const sessions = new Map();
const lost = new Set();
const connecting = new Set();
const reconnecting = new Map();

// Each connector is loaded on first use, so its database driver is not read at app start.
function connectorFor(type) {
  if (type === 'mysql') return require('./connectors/mysql');
  if (type === 'postgres' || type === 'supabase') return require('./connectors/postgres');
  if (type === 'supabase-rest') return require('./connectors/supabase-rest');
  if (type === 'mongodb') return require('./connectors/mongodb');
  if (type === 'firestore') return require('./connectors/firestore');
  throw new Error('Unsupported database type.');
}

const notConnected = () => Object.assign(new Error('Not connected.'), { unreachable: true });

async function closeSession(s) {
  if (!s) return;
  try {
    await connectorFor(s.type).close(s);
  } finally {
    await closeTunnel(s.tunnel);
  }
}

// Resolves a live session object for a (resolved, secrets included) profile.
async function connectProfile(profile) {
  const { dial, tunnel } = await openTunnelFor(profile);
  let s;
  try {
    if (profile.type === 'mysql') s = await require('./connectors/mysql').connect(dial, tunnel);
    else if (profile.type === 'postgres') s = await require('./connectors/postgres').connect(dial, tunnel, 'postgres');
    else if (profile.type === 'supabase') {
      if (dial.connectionString) s = await require('./connectors/postgres').connect(dial, tunnel, 'supabase');
      else if (dial.restUrl && dial.apiKey) s = await require('./connectors/supabase-rest').connect(dial);
      else throw new Error('Enter a Supabase PostgreSQL connection string, or both Project URL and API key.');
    } else if (profile.type === 'mongodb') s = await require('./connectors/mongodb').connect(dial);
    else if (profile.type === 'firestore') s = await require('./connectors/firestore').connect(dial);
    else throw new Error('Unsupported database type.');
  } catch (err) {
    await closeTunnel(tunnel);
    throw err;
  }
  s.profile = { ...profile };
  s.dial = dial;
  s.tunnel = tunnel;
  return s;
}

function savedProfile(id) {
  const profile = store.getProfile(id);
  if (!profile) throw new Error('This connection no longer exists.');
  return profile;
}

async function connect(id) {
  if (connecting.has(id)) throw new Error('A connection attempt is already in progress.');
  if (sessions.has(id)) return;
  connecting.add(id);
  try {
    sessions.set(id, await connectProfile(savedProfile(id)));
    lost.delete(id);
  } finally {
    connecting.delete(id);
  }
}

async function disconnect(id) {
  lost.delete(id);
  const s = sessions.get(id);
  sessions.delete(id);
  await closeSession(s);
}

// The saved profile, with `profile` (from the connection dialog) layered over it, tested and closed straight away.
async function test(profile, id) {
  const resolved = store.resolveSecrets(profile, id);
  const s = await connectProfile(resolved);
  await closeSession(s).catch(() => {});
}

async function liveSession(id) {
  const existing = sessions.get(id);
  if (existing) return existing;
  if (!lost.has(id)) throw notConnected();
  if (!reconnecting.has(id)) {
    reconnecting.set(
      id,
      (async () => {
        try {
          const s = await connectProfile(savedProfile(id));
          sessions.set(id, s);
          lost.delete(id);
          return s;
        } catch (err) {
          lost.delete(id);
          err.unreachable = true;
          throw err;
        } finally {
          reconnecting.delete(id);
        }
      })()
    );
  }
  return reconnecting.get(id);
}

async function dropSession(id, s) {
  if (sessions.get(id) === s) {
    sessions.delete(id);
    lost.add(id);
  }
  try {
    await closeSession(s);
  } catch (_) {
    /* already gone */
  }
}

// Runs `run(session)`. When the connection turns out to be dead it is dropped, and `retry` (reads only) replays the
// request once on a fresh connection; otherwise the error is flagged `lost` and the next request reconnects.
async function withSession(id, run, { retry = false } = {}) {
  let s = await liveSession(id);
  s.cancelRequested = false;
  try {
    return await run(s);
  } catch (err) {
    if (s.cancelRequested) {
      s.cancelRequested = false;
      throw Object.assign(new Error('Query cancelled.'), { cancelled: true });
    }
    if (!isTransportError(err, s.type)) throw err;
    await dropSession(id, s);
    if (!retry) {
      err.lost = true;
      throw err;
    }
    s = await liveSession(id);
    try {
      return await run(s);
    } catch (second) {
      if (isTransportError(second, s.type)) {
        await dropSession(id, s);
        second.lost = true;
      }
      throw second;
    }
  }
}

// Stops the statement a connection is running. Resolves false when the database cannot do that.
async function cancel(id) {
  const s = sessions.get(id);
  if (!s) throw notConnected();
  const connector = connectorFor(s.type);
  if (!connector.cancel) return false;
  s.cancelRequested = true;
  try {
    return await connector.cancel(s);
  } catch (err) {
    s.cancelRequested = false;
    throw err;
  }
}

// PostgreSQL cannot change database on a live connection, so it reconnects; MySQL switches in place.
async function switchDatabase(id, database) {
  const s = sessions.get(id);
  if (!s) throw notConnected();
  const connector = connectorFor(s.type);
  if (connector.switchDatabase) {
    await connector.switchDatabase(s, database);
    return;
  }
  if (s.type !== 'postgres' && s.type !== 'supabase') throw new Error('This database does not support switching databases in a live session.');
  const profile = { ...s.profile, database };
  if (profile.connectionString) {
    const url = new URL(profile.connectionString);
    url.pathname = `/${encodeURIComponent(database)}`;
    profile.connectionString = url.toString();
  }
  const replacement = await connectProfile(profile);
  sessions.set(id, replacement);
  await closeSession(s);
}

async function closeAll() {
  const open = [...sessions.values()];
  sessions.clear();
  lost.clear();
  await Promise.all(open.map(s => closeSession(s).catch(() => {})));
}

module.exports = { connectorFor, connect, disconnect, test, withSession, cancel, switchDatabase, closeAll };
