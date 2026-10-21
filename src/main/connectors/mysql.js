const { normalizeSqlResult, buildSqlMutation, mutationResult, applyBatch } = require('./sql');
const { buildAlterSql, buildCreateSql } = require('./create');
const { capSql, sqlIsWrite } = require('../sqlText');
const { formatBytes, formatCount, group } = require('./info');
const { logger } = require('../logger');

// `dial` is the profile as it must be dialled (host/port already point at the SSH tunnel when one is used).
function open(dial, tunnel) {
  const mysql = require('mysql2/promise'); // loaded on first use to keep app start-up light
  const uri = dial.connectionString ? new URL(dial.connectionString) : null;
  return mysql.createConnection({
    host: uri?.hostname || dial.host,
    port: Number(uri?.port || dial.port || 3306),
    user: dial.username || (uri ? decodeURIComponent(uri.username) : ''),
    password: dial.password || (uri ? decodeURIComponent(uri.password) : ''),
    database: dial.database || (uri ? decodeURIComponent(uri.pathname.replace(/^\//, '')) : '') || undefined,
    connectTimeout: 10000,
    ssl: dial.ssl ? { minVersion: 'TLSv1.2', rejectUnauthorized: !dial.sslAllowUntrusted, servername: tunnel?.remoteHost || uri?.hostname } : undefined
  });
}

async function openChecked(dial, tunnel) {
  const client = await open(dial, tunnel);
  // Without a listener a dropped connection would be an uncaught exception in the main process.
  client.on('error', err => logger.warn('[mysql] connection error:', err.message));
  try {
    await client.query('SELECT 1');
    if (dial.readOnly) await client.query('SET SESSION TRANSACTION READ ONLY');
  } catch (err) {
    await client.end().catch(() => {});
    throw err;
  }
  return client;
}

async function connect(dial, tunnel) {
  return { type: 'mysql', client: await openChecked(dial, tunnel) };
}

// A second connection used for the object browser and for cancelling, so a long-running query never blocks them.
function meta(session) {
  if (!session.meta)
    session.meta = openChecked(session.dial, session.tunnel).catch(err => {
      session.meta = null;
      throw err;
    });
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

async function mutateBatch(session, ops) {
  const client = session.client;
  return applyBatch(ops, {
    dialect: 'mysql',
    begin: () => client.query('START TRANSACTION'),
    run: async (sql, params) => (await client.query(sql, params))[0].affectedRows,
    commit: () => client.query('COMMIT'),
    rollback: () => client.query('ROLLBACK')
  });
}

// Creates a database or a table (in the selected database unless `spec.schema` names another).
async function create(session, spec, { preview = false } = {}) {
  const target = spec.kind === 'table' ? { ...spec, schema: spec.schema || session.database || session.profile.database } : spec;
  if (spec.kind === 'table' && !target.schema) throw new Error('Select a database first.');
  const sql = buildCreateSql('mysql', target);
  if (preview) return { statements: [sql] };
  await session.client.query(sql);
  return { message: `Created ${spec.kind} ${spec.name}`, statements: [sql] };
}

// Changes a table's columns or name. MySQL cannot roll DDL back, so the statements run one by one and a failure says
// how many had already been applied. `preview` only returns the SQL.
async function alter(session, { object, ops }, { preview = false } = {}) {
  const target = { ...object, schema: object?.schema || session.database || session.profile.database };
  const { columnInfo } = await describe(session, target);
  const statements = buildAlterSql('mysql', target, ops, Object.fromEntries(columnInfo.map(column => [column.name, column])));
  if (preview) return { statements };
  for (const [index, sql] of statements.entries()) {
    try {
      await session.client.query(sql);
    } catch (err) {
      err.message = `${err.message}${index ? ` (${index} of ${statements.length} changes were already applied)` : ''}`;
      throw err;
    }
  }
  return { message: `Changed table ${object.name}`, statements };
}

async function switchDatabase(session, database) {
  await session.client.changeUser({ database });
  session.database = database;
}

// "IN id int, OUT total decimal(10,2)" per routine; a function's return value has no ordinal position and is skipped.
function routineSignatures(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.kind}:${row.routine}`;
    const part = [row.kind === 'PROCEDURE' ? row.mode : '', row.name, row.type].filter(Boolean).join(' ');
    map.set(key, map.has(key) ? `${map.get(key)}, ${part}` : part);
  }
  return map;
}

async function discover(session, database) {
  const client = await meta(session);
  const [dbRows] = await client.query('SHOW DATABASES');
  const databases = dbRows.map(row => Object.values(row)[0]).filter(Boolean);
  const selected = database || session.database || session.profile.database || databases[0] || '';
  const [rows] = selected
    ? await client.query(
        'SELECT TABLE_SCHEMA AS schemaName, TABLE_NAME AS name, TABLE_TYPE AS objectType, ENGINE AS engine FROM information_schema.tables WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
        [selected]
      )
    : [[]];
  const [routines] = selected
    ? await client.query('SELECT ROUTINE_NAME AS name, ROUTINE_TYPE AS kind FROM information_schema.routines WHERE ROUTINE_SCHEMA = ? ORDER BY ROUTINE_NAME LIMIT 2000', [selected])
    : [[]];
  const [params] = selected
    ? await client.query(
        'SELECT SPECIFIC_NAME AS routine, ROUTINE_TYPE AS kind, PARAMETER_MODE AS mode, PARAMETER_NAME AS name, DTD_IDENTIFIER AS type FROM information_schema.parameters WHERE SPECIFIC_SCHEMA = ? AND ORDINAL_POSITION > 0 ORDER BY SPECIFIC_NAME, ORDINAL_POSITION',
        [selected]
      )
    : [[]];
  const signatures = routineSignatures(params);
  // Columns and keys are loaded per table when it is opened (see describe), so a big schema lists quickly.
  return {
    databases,
    schemas: [selected].filter(Boolean),
    message: '',
    objects: [
      ...rows.map(r => ({ name: r.name, schema: r.schemaName, type: String(r.objectType).toLowerCase() === 'view' ? 'view' : 'table', metadata: r.engine || '' })),
      ...routines.map(r => ({
        name: r.name,
        signature: `${r.name}(${signatures.get(`${r.kind}:${r.name}`) || ''})`,
        schema: selected,
        type: 'function',
        metadata: String(r.kind).toLowerCase()
      }))
    ]
  };
}

// Charset, collation, size and object counts of the selected database, plus the server version.
async function info(session, database) {
  const client = await meta(session);
  const name = database || session.database || session.profile.database;
  if (!name) throw new Error('Select a database first.');
  const [[version]] = await client.query('SELECT VERSION() AS version, @@version_comment AS edition');
  const [schemas] = await client.query('SELECT DEFAULT_CHARACTER_SET_NAME AS charset, DEFAULT_COLLATION_NAME AS collation FROM information_schema.schemata WHERE SCHEMA_NAME = ?', [
    name
  ]);
  if (!schemas.length) throw new Error(`Database ${name} was not found.`);
  const [[tables]] = await client.query(
    `SELECT SUM(TABLE_TYPE = 'BASE TABLE') AS tables, SUM(TABLE_TYPE = 'VIEW') AS views, SUM(DATA_LENGTH) AS data, SUM(INDEX_LENGTH) AS indexes, SUM(TABLE_ROWS) AS roughRows
     FROM information_schema.tables WHERE TABLE_SCHEMA = ?`,
    [name]
  );
  const [routines] = await client.query('SELECT ROUTINE_TYPE AS kind, COUNT(*) AS total FROM information_schema.routines WHERE ROUTINE_SCHEMA = ? GROUP BY ROUTINE_TYPE', [name]);
  const routineCount = kind => Number(routines.find(row => String(row.kind).toUpperCase() === kind)?.total || 0);
  const [[triggers]] = await client.query('SELECT COUNT(*) AS total FROM information_schema.triggers WHERE TRIGGER_SCHEMA = ?', [name]);
  const size = Number(tables.data || 0) + Number(tables.indexes || 0);
  return {
    name,
    subtitle: `MySQL ${version.version}`,
    groups: [
      group('Schema details', [
        { label: 'Default collation', value: schemas[0].collation },
        { label: 'Default character set', value: schemas[0].charset },
        { label: 'Database size (rough estimate)', value: formatBytes(size) }
      ]),
      group('Contents', [
        { label: 'Tables', value: formatCount(tables.tables) },
        { label: 'Views', value: formatCount(tables.views) },
        { label: 'Stored procedures', value: formatCount(routineCount('PROCEDURE')) },
        { label: 'Functions', value: formatCount(routineCount('FUNCTION')) },
        { label: 'Triggers', value: formatCount(triggers.total) },
        { label: 'Rows (rough estimate)', value: formatCount(tables.roughRows) },
        { label: 'Data size', value: formatBytes(tables.data) },
        { label: 'Index size', value: formatBytes(tables.indexes) }
      ]),
      group('Server', [
        { label: 'Version', value: version.version },
        { label: 'Edition', value: version.edition }
      ])
    ]
  };
}

async function describe(session, object) {
  const client = await meta(session);
  const schema = object.schema || session.database || session.profile.database;
  const [columns] = await client.query(
    'SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS defaultValue, EXTRA AS extra FROM information_schema.columns WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
    [schema, object.name]
  );
  const [keys] = await client.query(
    "SELECT COLUMN_NAME AS name FROM information_schema.key_column_usage WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION",
    [schema, object.name]
  );
  const [stats] = await client.query(
    'SELECT INDEX_NAME AS name, NON_UNIQUE AS nonUnique, COLUMN_NAME AS column_name FROM information_schema.statistics WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX',
    [schema, object.name]
  );
  const indexes = [];
  for (const row of stats) {
    let index = indexes.find(item => item.name === row.name);
    if (!index) {
      index = { name: row.name, unique: !row.nonUnique, columns: [] };
      indexes.push(index);
    }
    index.columns.push(row.column_name);
  }
  return {
    columns: columns.map(c => c.name),
    columnInfo: columns.map(c => ({
      name: c.name,
      type: c.type,
      nullable: c.nullable === 'YES',
      defaultValue: c.defaultValue ?? null,
      auto: /auto_increment/i.test(c.extra || ''),
      defaultGenerated: /default_generated/i.test(c.extra || ''),
      generated: /generated/i.test(c.extra || '')
    })),
    primaryKey: keys.map(k => k.name),
    indexes
  };
}

module.exports = { routineSignatures, connect, close, query, cancel, mutate, mutateBatch, create, alter, info, switchDatabase, discover, describe, isWrite };
