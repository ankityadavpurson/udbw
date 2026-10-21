const { normalizePgResult, buildSqlMutation, mutationResult, applyBatch } = require('./sql');
const { buildAlterSql, buildCreateSql } = require('./create');
const { capSql, sqlIsWrite } = require('../sqlText');
const { formatBytes, formatCount, group } = require('./info');
const { logger } = require('../logger');

// When the form's TLS options are on they decide verification, so drop `sslmode=` from the string: pg would otherwise
// let it override them (sslmode=require acts as verify-full and rejects Supabase's own CA).
function pgConnectionString(dial) {
  if (!dial.ssl) return dial.connectionString;
  try {
    const url = new URL(dial.connectionString);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    return url.toString();
  } catch (_) {
    return dial.connectionString;
  }
}

// `defaultSsl` applies when the TLS box is off (Supabase always verifies TLS).
async function openChecked(dial, tunnel, defaultSsl) {
  const { Client } = require('pg'); // loaded on first use to keep app start-up light
  const ssl = dial.ssl ? { rejectUnauthorized: !dial.sslAllowUntrusted, servername: tunnel?.remoteHost } : defaultSsl;
  const client = new Client(
    dial.connectionString
      ? { connectionString: pgConnectionString(dial), connectionTimeoutMillis: 10000, ssl }
      : {
          host: dial.host,
          port: Number(dial.port || 5432),
          user: dial.username,
          password: dial.password,
          database: dial.database || 'postgres',
          connectionTimeoutMillis: 10000,
          ssl
        }
  );
  // Without a listener a dropped connection would be an uncaught exception in the main process.
  client.on('error', err => logger.warn('[pg] connection error:', err.message));
  await client.connect();
  try {
    await client.query('SELECT 1');
    if (dial.readOnly) await client.query('SET default_transaction_read_only = on');
  } catch (err) {
    await client.end().catch(() => {});
    throw err;
  }
  return client;
}

// `type` is 'postgres', or 'supabase' for a Supabase connection string.
async function connect(dial, tunnel, type = 'postgres') {
  const defaultSsl = type === 'supabase' ? { rejectUnauthorized: true } : undefined;
  return { type, client: await openChecked(dial, tunnel, defaultSsl), defaultSsl };
}

// A second connection used for the object browser and for cancelling, so a long-running query never blocks them.
function meta(session) {
  if (!session.meta)
    session.meta = openChecked(session.dial, session.tunnel, session.defaultSsl).catch(err => {
      session.meta = null;
      throw err;
    });
  return session.meta;
}

async function close(session) {
  if (session.meta) await session.meta.then(client => client.end()).catch(() => {});
  if (session.client) await session.client.end();
}

const isWrite = text => sqlIsWrite(text, 'postgres');

async function query(session, text, { maxRows = 1000 } = {}) {
  const capped = capSql(text, 'postgres', maxRows) || text;
  return normalizePgResult(await session.client.query({ text: capped, rowMode: 'array' }), maxRows);
}

// Stops the statement the main connection is running (the connection itself stays open).
async function cancel(session) {
  const pid = session.client.processID;
  if (!pid) return false;
  const client = await meta(session);
  await client.query('SELECT pg_cancel_backend($1)', [pid]);
  return true;
}

async function mutate(session, op) {
  const { sql, params } = buildSqlMutation('postgres', op);
  const result = await session.client.query(sql, params);
  return mutationResult(op.action, result.rowCount);
}

async function mutateBatch(session, ops) {
  const client = session.client;
  return applyBatch(ops, {
    dialect: 'postgres',
    begin: () => client.query('BEGIN'),
    run: async (sql, params) => (await client.query(sql, params)).rowCount,
    commit: () => client.query('COMMIT'),
    rollback: () => client.query('ROLLBACK')
  });
}

// Creates a database, schema or table. A new table without a schema goes where the session's search_path puts it.
async function create(session, spec, { preview = false } = {}) {
  const sql = buildCreateSql('postgres', spec);
  if (preview) return { statements: [sql] };
  await session.client.query(sql);
  return { message: `Created ${spec.kind} ${spec.name}`, statements: [sql] };
}

// Changes a table's columns or name, all in one transaction (PostgreSQL can roll DDL back). `preview` only returns the SQL.
async function alter(session, { object, ops }, { preview = false } = {}) {
  const { columnInfo } = await describe(session, object || {});
  const statements = buildAlterSql('postgres', object, ops, Object.fromEntries(columnInfo.map(column => [column.name, column])));
  if (preview) return { statements };
  const client = session.client;
  await client.query('BEGIN');
  try {
    for (const sql of statements) await client.query(sql);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
  return { message: `Changed table ${object.name}`, statements };
}

const KIND = {
  r: { type: 'table', metadata: '' },
  p: { type: 'table', metadata: 'partitioned table' },
  f: { type: 'table', metadata: 'foreign table' },
  v: { type: 'view', metadata: '' },
  m: { type: 'view', metadata: 'materialized view' },
  S: { type: 'sequence', metadata: '' }
};

// Lists tables, views (including materialized and foreign ones), sequences and functions straight from the catalogs, so
// objects the role cannot read still show up. Columns and keys are loaded per table when it is opened (see describe).
async function discover(session, database, schema) {
  const client = await meta(session);
  const dbResult = await client.query('SELECT datname AS name FROM pg_database WHERE datistemplate = false ORDER BY datname');
  const schemaResult = await client.query("SELECT nspname AS name FROM pg_namespace WHERE nspname <> 'information_schema' AND nspname !~ '^pg_' ORDER BY nspname");
  const params = schema ? [schema] : [];
  const only = schema ? ' AND n.nspname = $1' : '';
  const relations = await client.query(
    `SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r','p','v','m','f','S') AND n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'${only} ORDER BY n.nspname, c.relname`,
    params
  );
  const routines = await client.query(
    `SELECT n.nspname AS schema, p.proname AS name, p.oid::int AS oid, p.prokind AS kind, pg_get_function_identity_arguments(p.oid) AS args
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prokind IN ('f','p') AND n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'${only}
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
     ORDER BY n.nspname, p.proname LIMIT 2000`,
    params
  );
  const objects = [
    ...relations.rows.map(r => ({ name: r.name, schema: r.schema, ...KIND[r.kind] })),
    ...routines.rows.map(r => ({ name: `${r.name}(${r.args})`, schema: r.schema, type: 'function', metadata: r.kind === 'p' ? 'procedure' : 'function', oid: r.oid }))
  ];
  return { databases: dbResult.rows.map(r => r.name), schemas: schemaResult.rows.map(r => r.name), objects, message: '' };
}

// Encoding, collation, owner, size and object counts of the current database, plus the server version.
async function info(session) {
  const client = await meta(session);
  const db = await client.query(
    `SELECT d.datname AS name, pg_catalog.pg_get_userbyid(d.datdba) AS owner, pg_encoding_to_char(d.encoding) AS encoding, d.datcollate AS collation,
            d.datctype AS ctype, pg_database_size(d.datname) AS size, d.datconnlimit AS connlimit, version() AS version, current_setting('server_version') AS short
     FROM pg_database d WHERE d.datname = current_database()`
  );
  const row = db.rows[0];
  if (!row) throw new Error('The current database could not be read.');
  const counts = await client.query(
    `SELECT
       count(*) FILTER (WHERE c.relkind IN ('r','p')) AS tables, count(*) FILTER (WHERE c.relkind = 'v') AS views,
       count(*) FILTER (WHERE c.relkind = 'm') AS matviews, count(*) FILTER (WHERE c.relkind = 'S') AS sequences,
       count(*) FILTER (WHERE c.relkind IN ('i','I')) AS indexes
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'`
  );
  const extras = await client.query(
    `SELECT (SELECT count(*) FROM pg_namespace WHERE nspname <> 'information_schema' AND nspname !~ '^pg_') AS schemas,
            (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
               AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')) AS functions,
            (SELECT count(*) FROM pg_extension) AS extensions`
  );
  const c = counts.rows[0];
  const e = extras.rows[0];
  return {
    name: row.name,
    subtitle: `PostgreSQL ${row.short}`,
    groups: [
      group('Database details', [
        { label: 'Owner', value: row.owner },
        { label: 'Encoding', value: row.encoding },
        { label: 'Collation', value: row.collation },
        { label: 'Character type', value: row.ctype },
        { label: 'Database size', value: formatBytes(row.size) },
        { label: 'Connection limit', value: row.connlimit < 0 ? 'Unlimited' : String(row.connlimit) }
      ]),
      group('Contents', [
        { label: 'Schemas', value: formatCount(e.schemas) },
        { label: 'Tables', value: formatCount(c.tables) },
        { label: 'Views', value: formatCount(c.views) },
        { label: 'Materialized views', value: formatCount(c.matviews) },
        { label: 'Sequences', value: formatCount(c.sequences) },
        { label: 'Indexes', value: formatCount(c.indexes) },
        { label: 'Functions and procedures', value: formatCount(e.functions) },
        { label: 'Extensions', value: formatCount(e.extensions) }
      ]),
      group('Server', [{ label: 'Version', value: row.version }])
    ]
  };
}

async function describe(session, object) {
  const client = await meta(session);
  const schema = object.schema || 'public';
  const columns = await client.query(
    `SELECT a.attname AS name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable,
       pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_value, a.attidentity <> '' AS identity
     FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`,
    [schema, object.name]
  );
  const keys = await client.query(
    `SELECT a.attname AS name FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey::int2[])
     WHERE i.indisprimary AND n.nspname = $1 AND c.relname = $2 ORDER BY array_position(i.indkey::int2[], a.attnum)`,
    [schema, object.name]
  );
  const indexes = await client.query('SELECT indexname AS name, indexdef AS definition FROM pg_indexes WHERE schemaname = $1 AND tablename = $2 ORDER BY indexname', [
    schema,
    object.name
  ]);
  return {
    columns: columns.rows.map(c => c.name),
    columnInfo: columns.rows.map(c => ({
      name: c.name,
      type: c.type,
      nullable: c.nullable,
      defaultValue: c.default_value ?? null,
      auto: Boolean(c.identity) || /^nextval\(/i.test(c.default_value || '')
    })),
    primaryKey: keys.rows.map(k => k.name),
    indexes: indexes.rows.map(i => ({ name: i.name, definition: i.definition }))
  };
}

module.exports = { connect, close, query, cancel, mutate, mutateBatch, create, alter, info, discover, describe, isWrite };
