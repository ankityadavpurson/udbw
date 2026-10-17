const { normalizeSqlResult, buildSqlMutation, mutationResult } = require('./sql');

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
  client.on('error', err => console.error('[mysql] connection error', err.message));
  try { await client.query('SELECT 1'); } catch (err) { await client.end().catch(() => {}); throw err; }
  return client;
}

async function connect(dial, tunnel) {
  return { type: 'mysql', client: await openChecked(dial, tunnel) };
}

// A second connection used for the object browser, so a long-running query never blocks a refresh.
function meta(session) {
  if (!session.meta) session.meta = openChecked(session.dial, session.tunnel).catch(err => { session.meta = null; throw err; });
  return session.meta;
}

async function close(session) {
  if (session.meta) await session.meta.then(client => client.end()).catch(() => {});
  if (session.client) await session.client.end();
}

async function query(session, text) {
  const [rows, fields] = await session.client.query(text);
  return normalizeSqlResult(rows, fields);
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
  const [columns] = selected ? await client.query('SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM information_schema.columns WHERE TABLE_SCHEMA = ? ORDER BY ORDINAL_POSITION', [selected]) : [[]];
  const [keys] = selected ? await client.query("SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM information_schema.key_column_usage WHERE TABLE_SCHEMA = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION", [selected]) : [[]];
  return {
    databases, schemas: [selected].filter(Boolean), message: '',
    objects: rows.map(r => ({
      name: r.name, schema: r.schemaName, type: String(r.objectType).toLowerCase() === 'view' ? 'view' : 'table', metadata: r.engine || '',
      columns: columns.filter(c => c.tableName === r.name).map(c => c.columnName),
      primaryKey: keys.filter(k => k.tableName === r.name).map(k => k.columnName)
    }))
  };
}

module.exports = { connect, close, query, mutate, switchDatabase, discover };
