const { normalizePgResult, buildSqlMutation, mutationResult } = require('./sql');

// When the form's TLS options are on they decide verification, so drop `sslmode=` from the string: pg would otherwise
// let it override them (sslmode=require acts as verify-full and rejects Supabase's own CA).
function pgConnectionString(dial) {
  if (!dial.ssl) return dial.connectionString;
  try {
    const url = new URL(dial.connectionString);
    url.searchParams.delete('sslmode'); url.searchParams.delete('uselibpqcompat');
    return url.toString();
  } catch (_) { return dial.connectionString; }
}

// `defaultSsl` applies when the TLS box is off (Supabase always verifies TLS).
async function openChecked(dial, tunnel, defaultSsl) {
  const { Client } = require('pg');   // loaded on first use to keep app start-up light
  const ssl = dial.ssl ? { rejectUnauthorized: !dial.sslAllowUntrusted, servername: tunnel?.remoteHost } : defaultSsl;
  const client = new Client(dial.connectionString
    ? { connectionString: pgConnectionString(dial), connectionTimeoutMillis: 10000, ssl }
    : { host: dial.host, port: Number(dial.port || 5432), user: dial.username, password: dial.password, database: dial.database || 'postgres', connectionTimeoutMillis: 10000, ssl });
  // Without a listener a dropped connection would be an uncaught exception in the main process.
  client.on('error', err => console.error('[pg] connection error', err.message));
  await client.connect();
  try { await client.query('SELECT 1'); } catch (err) { await client.end().catch(() => {}); throw err; }
  return client;
}

// `type` is 'postgres', or 'supabase' for a Supabase connection string.
async function connect(dial, tunnel, type = 'postgres') {
  const defaultSsl = type === 'supabase' ? { rejectUnauthorized: true } : undefined;
  return { type, client: await openChecked(dial, tunnel, defaultSsl), defaultSsl };
}

// A second connection used for the object browser, so a long-running query never blocks a refresh.
function meta(session) {
  if (!session.meta) session.meta = openChecked(session.dial, session.tunnel, session.defaultSsl).catch(err => { session.meta = null; throw err; });
  return session.meta;
}

async function close(session) {
  if (session.meta) await session.meta.then(client => client.end()).catch(() => {});
  if (session.client) await session.client.end();
}

async function query(session, text) {
  return normalizePgResult(await session.client.query(text));
}

async function mutate(session, op) {
  const { sql, params } = buildSqlMutation('postgres', op);
  const result = await session.client.query(sql, params);
  return mutationResult(op.action, result.rowCount);
}

async function discover(session, database, schema) {
  const client = await meta(session);
  const dbResult = await client.query('SELECT datname AS name FROM pg_database WHERE datistemplate = false ORDER BY datname');
  const selected = database || session.profile.database || 'postgres';
  const schemaResult = await client.query("SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema','pg_catalog') ORDER BY schema_name");
  const params = schema ? [selected, schema] : [selected];
  const tableResult = await client.query(
    `SELECT table_schema AS schema, table_name AS name, table_type AS "objectType" FROM information_schema.tables WHERE table_catalog = $1 AND table_schema NOT IN ('information_schema','pg_catalog')${schema ? ' AND table_schema = $2' : ''} ORDER BY table_schema, table_name`, params
  );
  const columnResult = await client.query(`SELECT table_schema AS schema, table_name AS table, column_name AS column FROM information_schema.columns WHERE table_catalog = $1 AND table_schema NOT IN ('information_schema','pg_catalog')${schema ? ' AND table_schema = $2' : ''} ORDER BY ordinal_position`, params);
  const keyResult = await client.query(`SELECT tc.table_schema AS schema, tc.table_name AS table, kcu.column_name AS column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema AND tc.table_name=kcu.table_name WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_catalog=$1${schema ? ' AND tc.table_schema=$2' : ''}`, params);
  return {
    databases: dbResult.rows.map(r => r.name), schemas: schemaResult.rows.map(r => r.name), message: '',
    objects: tableResult.rows.map(r => ({
      name: r.name, schema: r.schema, type: String(r.objectType).toLowerCase() === 'view' ? 'view' : 'table',
      columns: columnResult.rows.filter(c => c.schema === r.schema && c.table === r.name).map(c => c.column),
      primaryKey: keyResult.rows.filter(k => k.schema === r.schema && k.table === r.name).map(k => k.column)
    }))
  };
}

module.exports = { connect, close, query, mutate, discover };
