const { app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const windowState = require('./window');
const { logger } = require('./logger');

// Trust-on-first-use host keys: the first fingerprint seen for host:port is stored after the user confirms it,
// and a different key later is refused.
const knownHostsPath = () => path.join(app.getPath('userData'), 'known_hosts.json');

function readKnownHosts() {
  try { return JSON.parse(fs.readFileSync(knownHostsPath(), 'utf8')) || {}; } catch (_) { return {}; }
}

function writeKnownHosts(hosts) {
  const file = knownHostsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(hosts, null, 2), { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
}

const fingerprintOf = hex => `SHA256:${Buffer.from(hex, 'hex').toString('base64').replace(/=+$/, '')}`;

// Resolves { ok: true } or { ok: false, message }.
async function verifyHostKey(host, port, hex) {
  const id = `${host}:${port}`;
  const fingerprint = fingerprintOf(hex);
  const hosts = readKnownHosts();
  if (hosts[id]) {
    if (hosts[id] === fingerprint) return { ok: true };
    return { ok: false, message: `The SSH host key for ${id} has changed (expected ${hosts[id]}, got ${fingerprint}). This could be a man-in-the-middle attack. If the server was reinstalled, remove the "${id}" entry from ${knownHostsPath()} and try again.` };
  }
  const choice = await dialog.showMessageBox(windowState.getMainWindow() || undefined, {
    type: 'question', buttons: ['Trust and continue', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true,
    title: 'Unknown SSH host', message: `The authenticity of ${id} cannot be established.`,
    detail: `Key fingerprint: ${fingerprint}\n\nOnly continue if you recognise this fingerprint. It will be remembered and checked on future connections.`
  });
  if (choice.response !== 0) return { ok: false, message: `SSH host key for ${id} was not trusted.` };
  writeKnownHosts({ ...hosts, [id]: fingerprint });
  return { ok: true };
}

async function createSshTunnel(profile, remoteHost, remotePort) {
  if (!profile.sshHost || !profile.sshUsername) throw new Error('Enter an SSH host and username.');
  const { Client: SSHClient } = require('ssh2');   // loaded on first use to keep app start-up light
  const client = new SSHClient();
  const sshPort = Number(profile.sshPort || 22);
  let hostProblem = '';
  const options = {
    host: profile.sshHost, port: sshPort, username: profile.sshUsername, readyTimeout: 12000,
    keepaliveInterval: 15000, keepaliveCountMax: 3, hostHash: 'sha256',
    hostVerifier: (hash, callback) => {
      verifyHostKey(profile.sshHost, sshPort, hash).then(
        result => { if (!result.ok) hostProblem = result.message; callback(result.ok); },
        err => { hostProblem = `Could not verify the SSH host key: ${err.message}`; callback(false); }
      );
    }
  };
  if (profile.sshAuthMethod === 'privateKey') {
    if (!profile.sshKeyPath) throw new Error('Choose an SSH private key file.');
    options.privateKey = fs.readFileSync(profile.sshKeyPath);
    if (profile.sshPassphrase) options.passphrase = profile.sshPassphrase;
  } else {
    if (!profile.sshPassword) throw new Error('Enter the SSH password.');
    options.password = profile.sshPassword;
  }
  // A permanent 'error' listener: without one, an SSH error after the handshake would crash the main process.
  client.on('error', err => logger.warn('[ssh] connection error:', err.message));
  await new Promise((resolve, reject) => {
    const fail = err => reject(hostProblem ? new Error(hostProblem) : err);
    client.once('error', fail);
    client.once('ready', () => { client.removeListener('error', fail); resolve(); });
    client.connect(options);
  });
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    client.forwardOut('127.0.0.1', socket.remotePort || 0, remoteHost, Number(remotePort), (err, stream) => {
      if (err || socket.destroyed) { if (stream) stream.destroy(); socket.destroy(); return; }
      stream.on('error', () => socket.destroy());
      stream.on('close', () => socket.destroy());
      socket.on('close', () => stream.destroy());
      socket.pipe(stream).pipe(socket);
    });
  });
  // When the SSH link drops, cut the forwarded sockets so the database driver sees the failure and the session reconnects.
  client.once('close', () => { for (const socket of sockets) socket.destroy(); try { server.close(); } catch (_) { /* not listening */ } });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  } catch (err) { client.end(); throw err; }
  return { client, server, sockets, port: server.address().port, remoteHost, remotePort: Number(remotePort) };
}

function closeTunnel(tunnel) {
  if (!tunnel) return Promise.resolve();
  return new Promise(resolve => {
    for (const socket of tunnel.sockets || []) socket.destroy();
    try { tunnel.server.close(() => { try { tunnel.client.end(); } catch (_) { /* already closed */ } resolve(); }); }
    catch (_) { try { tunnel.client.end(); } catch (_ignored) { /* already closed */ } resolve(); }
  });
}

// Returns { dial, tunnel }: `dial` is a copy of the profile that points at the local tunnel port when SSH is on.
async function openTunnelFor(profile) {
  const dial = { ...profile };
  if (!profile.sshEnabled) return { dial, tunnel: null };
  if (profile.type === 'firestore' || (profile.type === 'supabase' && !profile.connectionString)) throw new Error('SSH tunneling requires a TCP database connection.');
  const uri = profile.connectionString ? new URL(profile.connectionString) : (profile.type === 'mongodb' && profile.uri ? new URL(profile.uri) : null);
  const remoteHost = profile.sshRemoteHost || uri?.hostname || profile.host;
  const remotePort = uri?.port || profile.port || (profile.type === 'mysql' ? 3306 : profile.type === 'mongodb' ? 27017 : 5432);
  const tunnel = await createSshTunnel(profile, remoteHost, remotePort);
  try {
    if (profile.type === 'mysql') {
      if (profile.connectionString) {
        dial.username ||= decodeURIComponent(uri.username); dial.password ||= decodeURIComponent(uri.password);
        dial.database ||= decodeURIComponent(uri.pathname.replace(/^\//, ''));
        dial.connectionString = '';
      }
      dial.host = '127.0.0.1'; dial.port = tunnel.port;
    } else if (profile.type === 'postgres' || profile.type === 'supabase') {
      if (profile.connectionString) { uri.hostname = '127.0.0.1'; uri.port = String(tunnel.port); dial.connectionString = uri.toString(); }
      else { dial.host = '127.0.0.1'; dial.port = tunnel.port; }
    } else if (profile.type === 'mongodb') {
      // Keep the server's own TLS choice: SRV URIs and tls=/ssl=true use TLS, plain mongodb:// URIs don't unless asked.
      const mongoUrl = new URL(profile.uri);
      const tlsParam = mongoUrl.searchParams.get('tls') ?? mongoUrl.searchParams.get('ssl');
      const useTls = tlsParam != null ? tlsParam === 'true' : (mongoUrl.protocol === 'mongodb+srv:' || Boolean(profile.ssl));
      mongoUrl.protocol = 'mongodb:'; mongoUrl.hostname = '127.0.0.1'; mongoUrl.port = String(tunnel.port);
      mongoUrl.searchParams.delete('ssl'); mongoUrl.searchParams.set('tls', String(useTls));
      mongoUrl.searchParams.set('directConnection', 'true');   // replica-set members are not reachable through the tunnel
      if (useTls) mongoUrl.searchParams.set('servername', remoteHost);
      dial.uri = mongoUrl.toString();
      if (!dial.database) dial.database = decodeURIComponent(mongoUrl.pathname.replace(/^\//, ''));
    }
  } catch (err) { await closeTunnel(tunnel); throw err; }
  return { dial, tunnel };
}

module.exports = { openTunnelFor, closeTunnel };
