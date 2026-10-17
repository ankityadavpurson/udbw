const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const mysql = require('mysql2/promise');
const { Client } = require('pg');
const { MongoClient } = require('mongodb');
const { createClient } = require('@supabase/supabase-js');
const admin = require('firebase-admin');

let mainWindow;
const sessions = new Map(); // Connection credentials live in memory only.

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
  return { message: err?.message || String(err), code: err?.code || null };
}

async function closeSession(s) {
  if (!s) return;
  if (s.type === 'mysql' && s.client) await s.client.end();
  if (s.type === 'postgres' && s.client) await s.client.end();
  if (s.type === 'mongodb' && s.client) await s.client.close();
  if (s.type === 'supabase' && s.pgClient) await s.pgClient.end();
  if (s.type === 'firestore' && s.appName) {
    const a = admin.apps.find(x => x && x.name === s.appName);
    if (a) await a.delete();
  }
}

async function connectProfile(profile) {
  let s;
  if (profile.type === 'mysql') {
    const client = await mysql.createConnection({
      host: profile.host, port: Number(profile.port || 3306),
      user: profile.username, password: profile.password,
      database: profile.database || undefined,
      connectTimeout: 10000, ssl: profile.ssl ? { minVersion: 'TLSv1.2' } : undefined
    });
    s = { type: 'mysql', client };
    await client.query('SELECT 1');
  } else if (profile.type === 'postgres') {
    const client = new Client({
      host: profile.host, port: Number(profile.port || 5432),
      user: profile.username, password: profile.password,
      database: profile.database || 'postgres',
      connectionTimeoutMillis: 10000,
      ssl: profile.ssl ? { rejectUnauthorized: false } : undefined
    });
    await client.connect();
    await client.query('SELECT 1');
    s = { type: 'postgres', client };
  } else if (profile.type === 'supabase') {
    if (profile.connectionString) {
      const pgClient = new Client({
        connectionString: profile.connectionString,
        connectionTimeoutMillis: 10000,
        ssl: profile.ssl ? { rejectUnauthorized: false } : { rejectUnauthorized: true }
      });
      await pgClient.connect();
      await pgClient.query('SELECT 1');
      s = { type: 'supabase', pgClient, restUrl: profile.restUrl || '', apiKey: profile.apiKey || '' };
    } else if (profile.restUrl && profile.apiKey) {
      const rest = createClient(profile.restUrl, profile.apiKey);
      const { error } = await rest.from('___workbench_connection_test___').select('*').limit(1);
      // A missing table is an expected proof that the API endpoint is reachable.
      if (error && !/does not exist|schema cache|could not find the table/i.test(error.message)) {
        throw new Error(`Supabase REST connection check failed: ${error.message}`);
      }
      s = { type: 'supabase-rest', rest, restUrl: profile.restUrl, apiKey: profile.apiKey };
    } else {
      throw new Error('Enter a Supabase PostgreSQL connection string, or both Project URL and API key.');
    }
  } else if (profile.type === 'mongodb') {
    const client = new MongoClient(profile.uri, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    const dbName = profile.database || new URL(profile.uri.replace('mongodb+srv://', 'https://').replace('mongodb://', 'http://')).pathname.replace('/', '') || 'admin';
    s = { type: 'mongodb', client, database: profile.database || dbName };
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
    s = { type: 'firestore', db, appName, projectId: profile.projectId || raw.project_id };
  } else {
    throw new Error('Unsupported database type.');
  }
  return s;
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

ipcMain.handle('db:connect', async (_event, { id, profile }) => {
  try {
    if (sessions.has(id)) {
      try { await closeSession(sessions.get(id)); } catch (_) {}
      sessions.delete(id);
    }
    const session = await connectProfile(profile);
    sessions.set(id, session);
    return { ok: true, label: profile.name || profile.type };
  } catch (err) {
    return { ok: false, error: safeError(err) };
  }
});

ipcMain.handle('db:disconnect', async (_event, { id }) => {
  try {
    const s = sessions.get(id);
    await closeSession(s);
    sessions.delete(id);
    return { ok: true };
  } catch (err) {
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
      const { data, error, count } = await s.rest.from(parsed.table).select(parsed.columns, { count: 'exact' }).limit(parsed.limit);
      if (error) throw error;
      return { ok: true, result: { columns: inferColumns(data), rows: (data || []).map(x => Object.values(x)), json: data, rowCount: count, message: `Read ${data?.length || 0} rows from ${parsed.table}` } };
    }
    if (s.type === 'mongodb') {
      const db = s.client.db(s.database);
      const parsed = parseMongoCommand(query);
      if (parsed.action === 'collections') {
        const names = await db.listCollections({}, { nameOnly: true }).toArray();
        return { ok: true, result: { json: names, columns: ['name'], rows: names.map(x => [x.name]), message: `${names.length} collections` } };
      }
      const docs = await db.collection(parsed.collection).find(parsed.filter).limit(parsed.limit).toArray();
      return { ok: true, result: { json: docs, columns: ['_id', 'document'], rows: docs.map(d => [String(d._id ?? ''), JSON.stringify(d)]), message: `${docs.length} documents` } };
    }
    if (s.type === 'firestore') {
      const parsed = parseFirestoreCommand(query);
      if (parsed.action === 'collections') {
        const collections = await s.db.listCollections();
        return { ok: true, result: { json: collections.map(c => ({ name: c.id })), columns: ['name'], rows: collections.map(c => [c.id]), message: `${collections.length} top-level collections` } };
      }
      const snap = await s.db.collection(parsed.collection).limit(parsed.limit).get();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return { ok: true, result: { json: docs, columns: ['id', 'document'], rows: docs.map(d => [String(d.id), JSON.stringify(d)]), message: `${docs.length} documents` } };
    }
    throw new Error('This connector does not support this operation.');
  } catch (err) {
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
  // Deliberately limited safe grammar: REST: table_name [LIMIT n]
  const m = query.trim().match(/^REST:\s*([a-zA-Z0-9_.-]+)(?:\s+LIMIT\s+(\d+))?$/i);
  if (!m) throw new Error('Supabase REST mode accepts: REST: table_name [LIMIT 100]');
  return { table: m[1], limit: Math.min(Number(m[2] || 100), 1000), columns: '*' };
}
function parseMongoCommand(query) {
  if (/^collections\s*;?$/i.test(query.trim())) return { action: 'collections' };
  // find collection_name {"field":"value"} LIMIT 100
  const m = query.trim().match(/^find\s+([a-zA-Z0-9_.-]+)(?:\s+(\{.*\}))?(?:\s+LIMIT\s+(\d+))?$/is);
  if (!m) throw new Error('MongoDB commands: "collections" or \'find collection_name {"status":"active"} LIMIT 100\'');
  let filter = {};
  if (m[2]) filter = JSON.parse(m[2]);
  return { action: 'find', collection: m[1], filter, limit: Math.min(Number(m[3] || 100), 1000) };
}
function parseFirestoreCommand(query) {
  if (/^collections\s*;?$/i.test(query.trim())) return { action: 'collections' };
  // read collection_name LIMIT 100
  const m = query.trim().match(/^read\s+([a-zA-Z0-9_.-]+)(?:\s+LIMIT\s+(\d+))?$/i);
  if (!m) throw new Error('Firestore commands: "collections" or "read collection_name LIMIT 100"');
  return { action: 'read', collection: m[1], limit: Math.min(Number(m[2] || 100), 1000) };
}
