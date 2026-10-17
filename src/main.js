const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { Client: SSHClient } = require('ssh2');
const mysql = require('mysql2/promise');
const { Client } = require('pg');
const { MongoClient, ObjectId } = require('mongodb');
const { createClient } = require('@supabase/supabase-js');
const admin = require('firebase-admin');

let mainWindow;
const sessions = new Map(); // Connection credentials live in memory only.
const connecting = new Set();
const connectionStorePath = () => path.join(app.getPath('userData'), 'connections.enc');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#101116',
    title: 'Universal DB Workbench',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', async () => {
  for (const [id, session] of sessions) {
    try { await closeSession(session); } catch (_) {}
    sessions.delete(id);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function safeError(err) {
  const message = typeof err?.message === 'string' ? err.message : String(err ?? 'Unknown error');
  const code = ['string', 'number'].includes(typeof err?.code) ? err.code : null;
  return { message, code };
}
function isTransportError(err) {
  return ['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE','57P01','08006','08001'].includes(err?.code) || /connection terminated unexpectedly|server closed the connection|connection lost|socket hang up/i.test(err?.message || '');
}

async function closeSession(s) {
  if (!s) return;
  try {
    if (s.type === 'mysql' && s.client) await s.client.end();
    if (s.type === 'postgres' && s.client) await s.client.end();
    if (s.type === 'mongodb' && s.client) await s.client.close();
    if (s.type === 'supabase' && s.pgClient) await s.pgClient.end();
    if (s.type === 'firestore' && s.appName) {
      const a = admin.apps.find(x => x && x.name === s.appName);
      if (a) await a.delete();
    }
  } finally { await closeTunnel(s.tunnel); }
}

function closeTunnel(tunnel) {
  if (!tunnel) return Promise.resolve();
  return new Promise(resolve => {
    try { tunnel.server.close(() => { try { tunnel.client.end(); } catch (_) {} resolve(); }); }
    catch (_) { try { tunnel.client.end(); } catch (_) {} resolve(); }
  });
}

async function createSshTunnel(profile, remoteHost, remotePort) {
  if (!profile.sshHost || !profile.sshUsername) throw new Error('Enter an SSH host and username.');
  const client = new SSHClient();
  const options = { host: profile.sshHost, port: Number(profile.sshPort || 22), username: profile.sshUsername, readyTimeout: 12000 };
  if (profile.sshAuthMethod === 'privateKey') {
    if (!profile.sshKeyPath) throw new Error('Choose an SSH private key file.');
    options.privateKey = fs.readFileSync(profile.sshKeyPath);
    if (profile.sshPassphrase) options.passphrase = profile.sshPassphrase;
  } else {
    if (!profile.sshPassword) throw new Error('Enter the SSH password.');
    options.password = profile.sshPassword;
  }
  await new Promise((resolve, reject) => {
    client.once('ready', resolve);
    client.once('error', reject);
    client.connect(options);
  });
  const server = net.createServer(socket => {
    client.forwardOut('127.0.0.1', socket.remotePort || 0, remoteHost, Number(remotePort), (err, stream) => {
      if (err) { socket.destroy(err); return; }
      socket.pipe(stream).pipe(socket);
    });
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  } catch (err) { client.end(); throw err; }
  return { client, server, port: server.address().port, remoteHost, remotePort: Number(remotePort) };
}

async function connectProfile(profile) {
  let s;
  const savedProfile = { ...profile };
  let tunnel;
  try {
  if (profile.sshEnabled) {
    if (profile.type === 'firestore' || (profile.type === 'supabase' && !profile.connectionString)) throw new Error('SSH tunneling requires a TCP database connection.');
    let remoteHost, remotePort;
    const uri = profile.connectionString ? new URL(profile.connectionString) : (profile.type === 'mongodb' && profile.uri ? new URL(profile.uri) : null);
    remoteHost = profile.sshRemoteHost || uri?.hostname || profile.host;
    remotePort = uri?.port || profile.port || (profile.type === 'mysql' ? 3306 : profile.type === 'mongodb' ? 27017 : 5432);
    tunnel = await createSshTunnel(profile, remoteHost, remotePort);
    if (profile.type === 'mysql') {
      if (profile.connectionString) {
        profile.username ||= decodeURIComponent(uri.username); profile.password ||= decodeURIComponent(uri.password);
        profile.database ||= decodeURIComponent(uri.pathname.replace(/^\//, ''));
        profile.connectionString = '';
      }
      profile.host = '127.0.0.1'; profile.port = tunnel.port;
    } else if (profile.type === 'postgres' || profile.type === 'supabase') {
      if (profile.connectionString) { uri.hostname = '127.0.0.1'; uri.port = String(tunnel.port); profile.connectionString = uri.toString(); }
      else { profile.host = '127.0.0.1'; profile.port = tunnel.port; }
    } else if (profile.type === 'mongodb') {
      const mongoUrl = new URL(profile.uri); mongoUrl.protocol = 'mongodb:'; mongoUrl.hostname = '127.0.0.1'; mongoUrl.port = String(tunnel.port); mongoUrl.searchParams.set('tls', 'true'); mongoUrl.searchParams.set('servername', remoteHost); profile.uri = mongoUrl.toString();
      if (!profile.database) profile.database = decodeURIComponent(mongoUrl.pathname.replace(/^\//, ''));
    }
  }
  if (profile.type === 'mysql') {
    const uri = profile.connectionString ? new URL(profile.connectionString) : null;
    const client = await mysql.createConnection({
      host: uri?.hostname || profile.host, port: Number(uri?.port || profile.port || 3306),
      user: profile.username || (uri ? decodeURIComponent(uri.username) : ''), password: profile.password || (uri ? decodeURIComponent(uri.password) : ''),
      database: profile.database || (uri ? decodeURIComponent(uri.pathname.replace(/^\//, '')) : '') || undefined,
      connectTimeout: 10000, ssl: profile.ssl ? { minVersion: 'TLSv1.2', rejectUnauthorized: !profile.sslAllowUntrusted, servername: tunnel?.remoteHost || uri?.hostname } : undefined
    });
    s = { type: 'mysql', client, profile: savedProfile };
    await client.query('SELECT 1');
  } else if (profile.type === 'postgres') {
    const client = new Client(profile.connectionString ? {
      connectionString: profile.connectionString,
      connectionTimeoutMillis: 10000,
      ssl: profile.ssl ? { rejectUnauthorized: !profile.sslAllowUntrusted, servername: tunnel?.remoteHost } : undefined
    } : {
      host: profile.host, port: Number(profile.port || 5432),
      user: profile.username, password: profile.password,
      database: profile.database || 'postgres',
      connectionTimeoutMillis: 10000,
      ssl: profile.ssl ? { rejectUnauthorized: !profile.sslAllowUntrusted, servername: tunnel?.remoteHost } : undefined
    });
    await client.connect();
    await client.query('SELECT 1');
    s = { type: 'postgres', client, profile: savedProfile };
  } else if (profile.type === 'supabase') {
    if (profile.connectionString) {
      const pgClient = new Client({
        connectionString: profile.connectionString,
        connectionTimeoutMillis: 10000,
        ssl: profile.ssl ? { rejectUnauthorized: !profile.sslAllowUntrusted, servername: tunnel?.remoteHost } : { rejectUnauthorized: true }
      });
      await pgClient.connect();
      await pgClient.query('SELECT 1');
      s = { type: 'supabase', pgClient, profile: savedProfile, restUrl: profile.restUrl || '', apiKey: profile.apiKey || '' };
    } else if (profile.restUrl && profile.apiKey) {
      const rest = createClient(profile.restUrl, profile.apiKey);
      const { error } = await rest.from('___workbench_connection_test___').select('*').limit(1);
      // A missing table is an expected proof that the API endpoint is reachable.
      if (error && !/does not exist|schema cache|could not find the table/i.test(error.message)) {
        throw new Error(`Supabase REST connection check failed: ${error.message}`);
      }
      s = { type: 'supabase-rest', rest, profile: { ...profile }, restUrl: profile.restUrl, apiKey: profile.apiKey };
    } else {
      throw new Error('Enter a Supabase PostgreSQL connection string, or both Project URL and API key.');
    }
  } else if (profile.type === 'mongodb') {
    const client = new MongoClient(profile.uri, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    const dbName = profile.database || new URL(profile.uri.replace('mongodb+srv://', 'https://').replace('mongodb://', 'http://')).pathname.replace('/', '') || 'admin';
    s = { type: 'mongodb', client, profile: savedProfile, database: profile.database || dbName };
    await client.db(s.database).command({ ping: 1 });
  } else if (profile.type === 'firestore') {
    if (!profile.serviceAccountPath) throw new Error('Select a Firebase service-account JSON file.');
    const fs = require('fs');
    const raw = JSON.parse(fs.readFileSync(profile.serviceAccountPath, 'utf8'));
    const appName = `workbench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(raw),
      projectId: profile.projectId || raw.project_id
    }, appName);
    const db = admin.firestore(firebaseApp);
    await db.listCollections();
    s = { type: 'firestore', db, profile: savedProfile, appName, projectId: profile.projectId || raw.project_id };
  } else {
    throw new Error('Unsupported database type.');
  }
  if (s) s.tunnel = tunnel;
  return s;
  } catch (err) {
    if (s) { try { await closeSession({ ...s, tunnel }); } catch (_) {} }
    else { try { await closeTunnel(tunnel); } catch (_) {} }
    throw err;
  }
}

ipcMain.handle('db:pick-service-account', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Firebase service-account JSON',
    properties: ['openFile'],
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle('db:pick-ssh-key', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose SSH private key', properties: ['openFile'],
    filters: [{ name: 'Private key files', extensions: ['pem', 'key', 'ppk', ''] }]
  });
  return result.canceled ? null : result.filePaths[0] || null;
});

ipcMain.handle('connections:load', async () => {
  try {
    const file = connectionStorePath();
    if (!fs.existsSync(file)) return { ok: true, profiles: [] };
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is unavailable on this device.');
    const encrypted = fs.readFileSync(file, 'utf8');
    const saved = JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64')));
    return { ok: true, profiles: Array.isArray(saved) ? saved : (saved.profiles || []), activeId: Array.isArray(saved) ? null : (saved.activeId || null) };
  } catch (err) { return { ok: false, profiles: [], error: safeError(err) }; }
});

ipcMain.handle('connections:save', async (_event, profiles) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is unavailable. Connections were not saved.');
    if (!Array.isArray(profiles?.profiles)) throw new Error('Invalid connection data.');
    const encrypted = safeStorage.encryptString(JSON.stringify(profiles)).toString('base64');
    const file = connectionStorePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, encrypted, { mode: 0o600 });
    fs.renameSync(temp, file);
    return { ok: true };
  } catch (err) { return { ok: false, error: safeError(err) }; }
});

ipcMain.handle('db:test', async (_event, { profile }) => {
  let session;
  try {
    session = await connectProfile(profile);
    return { ok: true, label: profile.name || profile.type };
  } catch (err) { return { ok: false, error: safeError(err) }; }
  finally { try { await closeSession(session); } catch (_) {} }
});

ipcMain.handle('db:discover', async (_event, { id, database, schema }) => {
  const session = sessions.get(id);
  if (!session) return { ok: false, error: { message: 'Not connected.' } };
  try { return { ok: true, result: await discoverObjects(session, database, schema) }; }
  catch (err) {
    if (isTransportError(err)) { try { await closeSession(session); } catch (_) {} sessions.delete(id); }
    return { ok: false, error: safeError(err) };
  }
});

ipcMain.handle('db:switch-database', async (_event, { id, database }) => {
  const session = sessions.get(id);
  if (!session) return { ok: false, error: { message: 'Not connected.' } };
  try {
    if (session.type === 'mysql') {
      await session.client.changeUser({ database }); session.database = database;
    } else if (session.type === 'postgres' || session.type === 'supabase') {
      const profile = { ...session.profile, database };
      if (profile.connectionString) {
        const url = new URL(profile.connectionString);
        url.pathname = `/${encodeURIComponent(database)}`;
        profile.connectionString = url.toString();
      }
      const replacement = await connectProfile(profile);
      await closeSession(session); sessions.set(id, replacement);
    } else if (session.type === 'mongodb') session.database = database;
    else return { ok: false, error: { message: 'This database does not support switching databases in a live session.' } };
    return { ok: true };
  } catch (err) { return { ok: false, error: safeError(err) }; }
});

async function discoverObjects(session, database, schema) {
  if (session.type === 'mysql') {
    const [dbRows] = await session.client.query('SHOW DATABASES');
    const databases = dbRows.map(row => Object.values(row)[0]).filter(Boolean);
    const selected = database || session.database || session.profile.database || databases[0] || '';
    const [rows] = selected ? await session.client.query(
      'SELECT TABLE_SCHEMA AS schemaName, TABLE_NAME AS name, TABLE_TYPE AS objectType, ENGINE AS engine FROM information_schema.tables WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [selected]
    ) : [[]];
    const [columns] = selected ? await session.client.query('SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM information_schema.columns WHERE TABLE_SCHEMA = ? ORDER BY ORDINAL_POSITION', [selected]) : [[]];
    const [keys] = selected ? await session.client.query("SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM information_schema.key_column_usage WHERE TABLE_SCHEMA = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION", [selected]) : [[]];
    return { databases, schemas: [selected].filter(Boolean), objects: rows.map(r => ({ name:r.name, schema:r.schemaName, type:String(r.objectType).toLowerCase() === 'view' ? 'view' : 'table', metadata:r.engine || '', columns:columns.filter(c => c.tableName === r.name).map(c => c.columnName), primaryKey:keys.filter(k => k.tableName === r.name).map(k => k.columnName) })), message: '' };
  }
  if (session.type === 'postgres' || session.type === 'supabase') {
    const client = session.type === 'postgres' ? session.client : session.pgClient;
    const dbResult = await client.query("SELECT datname AS name FROM pg_database WHERE datistemplate = false ORDER BY datname");
    const selected = database || session.profile.database || 'postgres';
    const schemaResult = await client.query("SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema','pg_catalog') ORDER BY schema_name");
    const params = schema ? [selected, schema] : [selected];
    const tableResult = await client.query(
      `SELECT table_schema AS schema, table_name AS name, table_type AS "objectType" FROM information_schema.tables WHERE table_catalog = $1 AND table_schema NOT IN ('information_schema','pg_catalog')${schema ? ' AND table_schema = $2' : ''} ORDER BY table_schema, table_name`, params
    );
    const columnResult = await client.query(`SELECT table_schema AS schema, table_name AS table, column_name AS column FROM information_schema.columns WHERE table_catalog = $1 AND table_schema NOT IN ('information_schema','pg_catalog')${schema ? ' AND table_schema = $2' : ''} ORDER BY ordinal_position`, params);
    const keyResult = await client.query(`SELECT tc.table_schema AS schema, tc.table_name AS table, kcu.column_name AS column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema AND tc.table_name=kcu.table_name WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_catalog=$1${schema ? ' AND tc.table_schema=$2' : ''}`, params);
    return { databases: dbResult.rows.map(r => r.name), schemas: schemaResult.rows.map(r => r.name), objects: tableResult.rows.map(r => ({ name:r.name, schema:r.schema, type:String(r.objectType).toLowerCase() === 'view' ? 'view' : 'table', columns:columnResult.rows.filter(c => c.schema === r.schema && c.table === r.name).map(c => c.column), primaryKey:keyResult.rows.filter(k => k.schema === r.schema && k.table === r.name).map(k => k.column) })), message: '' };
  }
  if (session.type === 'supabase-rest') return { databases: [], schemas: [], objects: [], message: 'Object discovery requires a PostgreSQL connection string. REST mode only exposes tables allowed by the API key.' };
  if (session.type === 'mongodb') {
    const adminDb = session.client.db('admin');
    let databases = [], message = '';
    try { const listed = await adminDb.admin().listDatabases(); databases = listed.databases.map(d => d.name); }
    catch { message = 'Your account cannot list databases. Showing objects in the configured database.'; }
    const selected = database || session.database;
    const collections = await session.client.db(selected).listCollections({}, { nameOnly: false }).toArray();
    return { databases, schemas: [], objects: collections.map(c => ({ name:c.name, type:'collection', metadata:c.type || '' })), message };
  }
  if (session.type === 'firestore') {
    const collections = await session.db.listCollections();
    return { databases: [session.projectId].filter(Boolean), schemas: [], objects: collections.map(c => ({ name:c.id, type:'collection' })), message: collections.length ? '' : 'No top-level collections are available.' };
  }
  return { databases: [], schemas: [], objects: [], message: 'Object discovery is unavailable for this connection.' };
}

ipcMain.handle('db:connect', async (_event, { id, profile }) => {
  if (connecting.has(id)) return { ok: false, error: { message: 'A connection attempt is already in progress.' } };
  if (sessions.has(id)) return { ok: true, label: profile.name || profile.type };
  connecting.add(id);
  try {
    const session = await connectProfile(profile);
    sessions.set(id, session);
    return { ok: true, label: profile.name || profile.type };
  } catch (err) {
    return { ok: false, error: safeError(err) };
  } finally { connecting.delete(id); }
});

ipcMain.handle('db:disconnect', async (_event, { id }) => {
  const s = sessions.get(id);
  try {
    await closeSession(s);
    sessions.delete(id);
    return { ok: true };
  } catch (err) {
    sessions.delete(id);
    try { await closeSession(s); } catch (_) {}
    return { ok: false, error: safeError(err) };
  }
});

ipcMain.handle('db:query', async (_event, { id, query, options = {} }) => {
  const s = sessions.get(id);
  if (!s) return { ok: false, error: { message: 'Not connected.' } };
  try {
    if (s.type === 'mysql') {
      const [rows, fields] = await s.client.query(query);
      return { ok: true, result: normalizeSqlResult(rows, fields) };
    }
    if (s.type === 'postgres' || s.type === 'supabase') {
      const client = s.type === 'postgres' ? s.client : s.pgClient;
      const result = await client.query(query);
      return { ok: true, result: normalizePgResult(result) };
    }
    if (s.type === 'supabase-rest') {
      const parsed = parseRestCommand(query);
      let response;
      if (parsed.action === 'insert') response = await s.rest.from(parsed.table).insert(parsed.document).select();
      else if (parsed.action === 'update') response = await s.rest.from(parsed.table).update(parsed.document).eq(parsed.idField || 'id', parsed.id).select();
      else if (parsed.action === 'delete') response = await s.rest.from(parsed.table).delete().eq(parsed.idField || 'id', parsed.id).select();
      else response = await s.rest.from(parsed.table).select(parsed.columns, { count: 'exact' }).limit(parsed.limit);
      const { data, error, count } = response;
      if (error) throw error;
      return { ok: true, result: { columns: inferColumns(data), rows: (data || []).map(x => Object.values(x)), json: data || [], rowCount: count ?? data?.length ?? 0, message: `${parsed.action === 'read' ? 'Read' : parsed.action === 'insert' ? 'Inserted' : parsed.action === 'update' ? 'Updated' : 'Deleted'} ${data?.length || 0} rows in ${parsed.table}` } };
    }
    if (s.type === 'mongodb') {
      const db = s.client.db(s.database);
      const parsed = parseMongoCommand(query);
      if (parsed.action === 'collections') {
        const names = await db.listCollections({}, { nameOnly: true }).toArray();
        return { ok: true, result: { json: names, columns: ['name'], rows: names.map(x => [x.name]), message: `${names.length} collections` } };
      }
      if (parsed.action === 'insert') {
        const inserted = await db.collection(parsed.collection).insertOne(parsed.document);
        const doc = { ...parsed.document, _id: inserted.insertedId.toString() };
        return { ok: true, result: { json: [doc], columns: ['_id', 'document'], rows: [[doc._id, JSON.stringify(doc)]], rowCount: 1, message: 'Inserted 1 document' } };
      }
      if (parsed.action === 'update') {
        const filter = { _id: parseMongoId(parsed.id) };
        const update = Object.keys(parsed.document).some(key => key.startsWith('$')) ? parsed.document : { $set: parsed.document };
        const updated = await db.collection(parsed.collection).updateOne(filter, update);
        const docs = await db.collection(parsed.collection).find(filter).limit(1).toArray();
        return { ok: true, result: { json: docs.map(d => JSON.parse(JSON.stringify(d))), columns: ['_id', 'document'], rows: docs.map(d => [String(d._id), JSON.stringify(d)]), rowCount: updated.modifiedCount, message: `Updated ${updated.modifiedCount} document(s)` } };
      }
      if (parsed.action === 'delete') {
        const deleted = await db.collection(parsed.collection).deleteOne({ _id: parseMongoId(parsed.id) });
        return { ok: true, result: { json: [], columns: [], rows: [], rowCount: deleted.deletedCount, message: `Deleted ${deleted.deletedCount} document(s)` } };
      }
      const docs = await db.collection(parsed.collection).find(parsed.filter).limit(parsed.limit).toArray();
      const safeDocs = JSON.parse(JSON.stringify(docs));
      return { ok: true, result: { json: safeDocs, columns: ['_id', 'document'], rows: safeDocs.map(d => [String(d._id ?? ''), JSON.stringify(d)]), message: `${docs.length} documents` } };
    }
    if (s.type === 'firestore') {
      const parsed = parseFirestoreCommand(query);
      if (parsed.action === 'collections') {
        const collections = await s.db.listCollections();
        return { ok: true, result: { json: collections.map(c => ({ name: c.id })), columns: ['name'], rows: collections.map(c => [c.id]), message: `${collections.length} top-level collections` } };
      }
      if (parsed.action === 'create') {
        await s.db.collection(parsed.collection).doc(parsed.id).set(parsed.document);
        const doc = { id: parsed.id, ...parsed.document };
        return { ok: true, result: { json: [doc], columns: ['id', 'document'], rows: [[doc.id, JSON.stringify(doc)]], rowCount: 1, message: 'Created 1 document' } };
      }
      if (parsed.action === 'update') {
        await s.db.collection(parsed.collection).doc(parsed.id).set(parsed.document, { merge: true });
        const snap = await s.db.collection(parsed.collection).doc(parsed.id).get();
        const doc = { id: snap.id, ...snap.data() };
        return { ok: true, result: { json: [doc], columns: ['id', 'document'], rows: [[doc.id, JSON.stringify(doc)]], rowCount: 1, message: 'Updated 1 document' } };
      }
      if (parsed.action === 'delete') {
        await s.db.collection(parsed.collection).doc(parsed.id).delete();
        return { ok: true, result: { json: [], columns: [], rows: [], rowCount: 1, message: 'Deleted document' } };
      }
      const snap = await s.db.collection(parsed.collection).limit(parsed.limit).get();
      const docs = snap.docs.map(d => JSON.parse(JSON.stringify({ id: d.id, ...d.data() })));
      return { ok: true, result: { json: docs, columns: ['id', 'document'], rows: docs.map(d => [String(d.id), JSON.stringify(d)]), message: `${docs.length} documents` } };
    }
    throw new Error('This connector does not support this operation.');
  } catch (err) {
    if (isTransportError(err)) { try { await closeSession(s); } catch (_) {} sessions.delete(id); }
    return { ok: false, error: safeError(err) };
  }
});

function normalizeSqlResult(rows, fields) {
  if (!Array.isArray(rows)) return { columns: [], rows: [], json: [], message: JSON.stringify(rows), rowCount: 0 };
  const columns = fields?.map(f => f.name) || (rows[0] ? Object.keys(rows[0]) : []);
  return { columns, rows: rows.map(r => columns.map(c => serializeValue(r[c]))), json: rows.map(r => Object.fromEntries(Object.entries(r).map(([k,v]) => [k, serializeValue(v)]))), rowCount: rows.length, message: `${rows.length} rows returned` };
}
function normalizePgResult(result) {
  const columns = result.fields?.map(f => f.name) || (result.rows[0] ? Object.keys(result.rows[0]) : []);
  return { columns, rows: (result.rows || []).map(r => columns.map(c => serializeValue(r[c]))), json: (result.rows || []).map(r => Object.fromEntries(Object.entries(r).map(([k,v]) => [k, serializeValue(v)]))), rowCount: result.rowCount, message: result.command ? `${result.command}${result.rowCount == null ? '' : ` · ${result.rowCount} row(s)`}` : 'Query completed' };
}
function serializeValue(v) {
  if (v === null || v === undefined) return v === null ? 'NULL' : '';
  if (Buffer.isBuffer(v)) return `base64:${v.toString('base64')}`;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
function inferColumns(data) { return data?.length ? Object.keys(data[0]) : []; }
function parseRestCommand(query) {
  const write = query.trim().match(/^(INSERT|UPDATE|DELETE)\s+([a-zA-Z0-9_.-]+)(?:\s+([a-zA-Z0-9_.-]+)=([^\s]+))?\s*(\{.*\})?$/is);
  if (write) return { action:write[1].toLowerCase(), table:write[2], idField:write[3], id:write[4], document:write[5] ? JSON.parse(write[5]) : undefined };
  // REST reads: REST: table_name [LIMIT n]
  const m = query.trim().match(/^REST:\s*([a-zA-Z0-9_.-]+)(?:\s+LIMIT\s+(\d+))?$/i);
  if (!m) throw new Error('Supabase REST mode accepts: REST: table_name [LIMIT 100]');
  return { action:'read', table: m[1], limit: Math.min(Number(m[2] || 100), 1000), columns: '*' };
}
function parseMongoCommand(query) {
  if (/^collections\s*;?$/i.test(query.trim())) return { action: 'collections' };
  let m = query.trim().match(/^insert\s+([a-zA-Z0-9_.-]+)\s+(\{.*\})$/is);
  if (m) return { action:'insert', collection:m[1], document:JSON.parse(m[2]) };
  m = query.trim().match(/^update\s+([a-zA-Z0-9_.-]+)\s+(\S+)\s+(\{.*\})$/is);
  if (m) return { action:'update', collection:m[1], id:m[2], document:JSON.parse(m[3]) };
  m = query.trim().match(/^delete\s+([a-zA-Z0-9_.-]+)\s+(\S+)$/i);
  if (m) return { action:'delete', collection:m[1], id:m[2] };
  // find collection_name {"field":"value"} LIMIT 100
  m = query.trim().match(/^find\s+([a-zA-Z0-9_.-]+)(?:\s+(\{.*\}))?(?:\s+LIMIT\s+(\d+))?$/is);
  if (!m) throw new Error('MongoDB commands: "collections" or \'find collection_name {"status":"active"} LIMIT 100\'');
  let filter = {};
  if (m[2]) filter = JSON.parse(m[2]);
  return { action: 'find', collection: m[1], filter, limit: Math.min(Number(m[3] || 100), 1000) };
}
function parseFirestoreCommand(query) {
  if (/^collections\s*;?$/i.test(query.trim())) return { action: 'collections' };
  let m = query.trim().match(/^(create|update)\s+([a-zA-Z0-9_.-]+)\s+(\S+)\s+(\{.*\})$/is);
  if (m) return { action:m[1].toLowerCase(), collection:m[2], id:m[3], document:JSON.parse(m[4]) };
  m = query.trim().match(/^delete\s+([a-zA-Z0-9_.-]+)\s+(\S+)$/i);
  if (m) return { action:'delete', collection:m[1], id:m[2] };
  // read collection_name LIMIT 100
  m = query.trim().match(/^read\s+([a-zA-Z0-9_.-]+)(?:\s+LIMIT\s+(\d+))?$/i);
  if (!m) throw new Error('Firestore commands: "collections" or "read collection_name LIMIT 100"');
  return { action: 'read', collection: m[1], limit: Math.min(Number(m[2] || 100), 1000) };
}
function parseMongoId(value) {
  return /^[a-f\d]{24}$/i.test(String(value)) ? new ObjectId(String(value)) : value;
}
