// Supabase through its REST API (Project URL + API key), for connections that have no PostgreSQL string.

function decodeId(value) {
  try { return decodeURIComponent(value); } catch (_) { return value; }
}

function parseCommand(query) {
  const text = query.trim();
  const write = text.match(/^(INSERT|UPDATE|DELETE)\s+([a-zA-Z0-9_.-]+)(?:\s+([a-zA-Z0-9_.-]+)=([^\s]+))?\s*(\{.*\})?$/is);
  if (write) {
    const document = write[5] ? JSON.parse(write[5]) : undefined;
    return { action: write[1].toLowerCase(), table: write[2], keyColumn: write[3], id: write[4] === undefined ? undefined : decodeId(write[4]), record: document, changes: document };
  }
  // REST reads: REST: table_name [LIMIT n]
  const m = text.match(/^REST:\s*([a-zA-Z0-9_.-]+)(?:\s+LIMIT\s+(\d+))?$/i);
  if (!m) throw new Error('Supabase REST mode accepts: REST: table_name [LIMIT 100]');
  return { action: 'read', table: m[1], limit: Math.min(Number(m[2] || 100), 1000) };
}

async function connect(dial) {
  const { createClient } = require('@supabase/supabase-js');   // loaded on first use to keep app start-up light
  const rest = createClient(dial.restUrl, dial.apiKey);
  const { error } = await rest.from('___workbench_connection_test___').select('*').limit(1);
  // A missing table is an expected proof that the API endpoint is reachable.
  if (error && !/does not exist|schema cache|could not find the table/i.test(error.message)) {
    throw new Error(`Supabase REST connection check failed: ${error.message}`);
  }
  return { type: 'supabase-rest', rest };
}

async function close() {}

const WRITES = new Set(['insert', 'update', 'delete']);
const isWrite = text => { try { return WRITES.has(parseCommand(text).action); } catch (_) { return false; } };

// Aborts the request in flight (the HTTP call is dropped; the server may still finish it).
async function cancel(session) {
  if (!session.abort) return false;
  session.abort.abort();
  return true;
}

const VERBS = { read: 'Read', insert: 'Inserted', update: 'Updated', delete: 'Deleted' };

async function run(session, command) {
  const { rest } = session;
  const needKey = () => {
    if (command.id === undefined || command.id === null || command.id === '') throw new Error('The selected record does not include an identifier needed for this operation.');
    return command.keyColumn || 'id';
  };
  const controller = new AbortController();
  session.abort = controller;
  const { signal } = controller;
  let response;
  try {
    if (command.action === 'insert') response = await rest.from(command.table).insert(command.record).select().abortSignal(signal);
    else if (command.action === 'update') response = await rest.from(command.table).update(command.changes).eq(needKey(), command.id).select().abortSignal(signal);
    else if (command.action === 'delete') response = await rest.from(command.table).delete().eq(needKey(), command.id).select().abortSignal(signal);
    else response = await rest.from(command.table).select('*', { count: 'exact' }).limit(command.limit).abortSignal(signal);
  } finally { session.abort = null; }
  const { data, error, count } = response;
  if (error) throw error;
  const rows = data || [];
  return {
    columns: rows.length ? Object.keys(rows[0]) : [], rows: rows.map(x => Object.values(x)), json: rows,
    rowCount: count ?? rows.length, message: `${VERBS[command.action]} ${rows.length} rows in ${command.table}`
  };
}

const query = (session, text) => run(session, parseCommand(text));

// Structured edit from the UI: { action, object: { name }, keyColumn?, id?, record?, changes? }.
function mutate(session, op) {
  if (!op.object?.name) throw new Error('No table is selected.');
  return run(session, { action: op.action, table: op.object.name, keyColumn: op.keyColumn, id: op.id, record: op.record, changes: op.changes });
}

async function discover() {
  return { databases: [], schemas: [], objects: [], message: 'Object discovery requires a PostgreSQL connection string. REST mode only exposes tables allowed by the API key.' };
}

module.exports = { connect, close, query, cancel, mutate, discover, isWrite, parseCommand };
