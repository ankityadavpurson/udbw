const { normalizeSqlResult, buildSqlMutation, mutationResult } = require('./sql');
const { capSql, sqlIsWrite } = require('../sqlText');
const { logger } = require('../logger');

// `dial` is the profile as it must be dialled (host/port already point at the SSH tunnel when one is used).
function open(dial, tunnel) {
  const mysql = require('mysql2/promise');   // loaded on first use to keep app start-up light
  const uri = dial.connectionString ? new URL(dial.connectionString) : null;
  return mysql.createConnection({
    host: uri?.hostname || dial.host, port: Number(uri?.port || dial.port || 3306),
    user: dial.username || (uri ? decodeURIComponent(uri.username) : ''), password: dial.password || (uri ? decodeURIComponent(uri.password) : ''),
    database: dial.database || (uri ? decodeURIComponent(uri.pathname.replace(/^\//, '')) : '') || undefined,
    connectTimeout: 10000, ssl: dial.ssl ? { minVersion: 'TLSv1.2', rejectUnauthorized: !dial.sslAllowUntrusted, servername: tunnel?.remoteHost || uri?.hostname } : undefined
  });
}

async function openChecked(dial, tunnel) {
  const client = await open(dial, tunnel);
  // Without a listener a dropped connection would be an uncaught exception in the main process.
  client.on('error', err => logger.warn('[mysql] connection error:', err.message));
  try {
    await client.query('SELECT 1');
    if (dial.readOnly) await client.query('SET SESSION TRANSACTION READ ONLY');
  } catch (err) { await client.end().catch(() => {}); throw err; }
  return client;
}

async function connect(dial, tunnel) {
  return { type: 'mysql', client: await openChecked(dial, tunnel) };
}

// A second connection used for the object browser and for cancelling, so a long-running query never blocks them.
function meta(session) {
  if (!session.meta) session.meta = openChecked(session.dial, session.tunnel).catch(err => { session.meta = null; throw err; });
  return session.meta;
}

async function close(session) {
  if (session.meta) await session.meta.then(client => client.end()).catch(() => {});
  if (session.client) await session.client.end();
}

const isWrite = text => sqlIsWrite(text, 'mysql');

async function query(session, text, { maxRows = 1000 } = {}) {
  const capped = capSql(text, 'mysql', maxRows) || text;
  const [rows, fields] = await session.client.query({ sql: capped, rowsAsArray: true });
  return normalizeSqlResult(rows, fields, maxRows);
}

// Stops the statement the main connection is running (the connection itself stays open).
async function cancel(session) {
  const threadId = Number(session.client.threadId);
  if (!threadId) return false;
  const client = await meta(session);
  await client.query(`KILL QUERY ${threadId}`);
  return true;
}

async function mutate(session, op) {
  const { sql, params } = buildSqlMutation('mysql', op);
  const [res] = await session.client.query(sql, params);
  return mutationResult(op.action, res.affectedRows);
}

async function switchDatabase(session, database) {
  await session.client.changeUser({ database });
  session.database = database;
}

async function discover(session, database) {
  const client = await meta(session);
  const [dbRows] = await client.query('SHOW DATABASES');
  const databases = dbRows.map(row => Object.values(row)[0]).filter(Boolean);
  const selected = database || session.database || session.profile.database || databases[0] || '';
  const [rows] = selected ? await client.query(
    'SELECT TABLE_SCHEMA AS schemaName, TABLE_NAME AS name, TABLE_TYPE AS objectType, ENGINE AS engine FROM information_schema.tables WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [selected]
  ) : [[]];
  // Columns and keys are loaded per table when it is opened (see describe), so a big schema lists quickly.
  return {
    databases, schemas: [selected].filter(Boolean), message: '',
    objects: rows.map(r => ({ name: r.name, schema: r.schemaName, type: String(r.objectType).toLowerCase() === 'view' ? 'view' : 'table', metadata: r.engine || '' }))
  };
}

async function describe(session, object) {
  const client = await meta(session);
  const schema = object.schema || session.database || session.profile.database;
  const [columns] = await client.query('SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable FROM information_schema.columns WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION', [schema, object.name]);
  const [keys] = await client.query("SELECT COLUMN_NAME AS name FROM information_schema.key_column_usage WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION", [schema, object.name]);
  const [stats] = await client.query('SELECT INDEX_NAME AS name, NON_UNIQUE AS nonUnique, COLUMN_NAME AS column_name FROM information_schema.statistics WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX', [schema, object.name]);
  const indexes = [];
  for (const row of stats) {
    let index = indexes.find(item => item.name === row.name);
    if (!index) { index = { name: row.name, unique: !row.nonUnique, columns: [] }; indexes.push(index); }
    index.columns.push(row.column_name);
  }
  return { columns: columns.map(c => c.name), columnInfo: columns.map(c => ({ name: c.name, type: c.type, nullable: c.nullable === 'YES' })), primaryKey: keys.map(k => k.name), indexes };
}

module.exports = { connect, close, query, cancel, mutate, switchDatabase, discover, describe, isWrite };
