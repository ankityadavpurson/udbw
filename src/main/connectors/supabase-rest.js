// Supabase through its REST API (Project URL + API key), for connections that have no PostgreSQL string.

function decodeId(value) {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

function parseCommand(query) {
  const text = query.trim();
  const write = text.match(/^(INSERT|UPDATE|DELETE)\s+([a-zA-Z0-9_.-]+)(?:\s+([a-zA-Z0-9_.-]+)=([^\s]+))?\s*(\{.*\})?$/is);
  if (write) {
    const document = write[5] ? JSON.parse(write[5]) : undefined;
    return {
      action: write[1].toLowerCase(),
      table: write[2],
      keyColumn: write[3],
      id: write[4] === undefined ? undefined : decodeId(write[4]),
      record: document,
      changes: document
    };
  }
  // REST reads: REST: table [WHERE column op value [AND …]] [ORDER BY column [ASC|DESC]] [LIMIT n] [OFFSET n]
  const m = text.match(/^REST:\s*([a-zA-Z0-9_.-]+)(?:\s+([\s\S]*))?$/i);
  if (!m) throw new Error(HELP);
  return { action: 'read', table: m[1], ...parseReadClauses(m[2] || '') };
}

const HELP = 'Supabase REST mode accepts: REST: table [WHERE column = value [AND …]] [ORDER BY column DESC] [LIMIT 100] [OFFSET 0]';
const FILTERS = { '=': 'eq', '==': 'eq', '!=': 'neq', '<>': 'neq', '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte', like: 'like', ilike: 'ilike', is: 'is' };

// A value is a quoted string, or a bare word (numbers stay as text; the API converts them to the column type).
function filterValue(raw, op) {
  const text = raw.trim();
  const quoted = /^(['"])([\s\S]*)\1$/.exec(text);
  if (quoted) return quoted[2];
  if (op === 'is') return /^null$/i.test(text) ? null : /^true$/i.test(text) ? true : /^false$/i.test(text) ? false : text;
  return text;
}

function parseReadClauses(rest) {
  const out = { filters: [], orderBy: [], limit: 100, offset: 0 };
  const text = rest.trim();
  if (!text) return out;
  const parts = text.split(/\s+(?=(?:WHERE|ORDER\s+BY|LIMIT|OFFSET)\b)/i).map(part => part.trim());
  for (const part of parts) {
    const head = /^(WHERE|ORDER\s+BY|LIMIT|OFFSET)\b\s*([\s\S]*)$/i.exec(part);
    if (!head) throw new Error(HELP);
    const kind = head[1].toUpperCase().replace(/\s+/g, ' ');
    const body = head[2].trim();
    if (kind === 'WHERE') {
      for (const condition of body.split(/\s+AND\s+/i)) {
        const c = /^([a-zA-Z0-9_.-]+)\s*(==|=|!=|<>|<=|>=|<|>)\s*([\s\S]+)$/.exec(condition) || /^([a-zA-Z0-9_.-]+)\s+(ilike|like|is)\s+([\s\S]+)$/i.exec(condition);
        if (!c) throw new Error('WHERE needs: column operator value, e.g. WHERE age >= 18');
        const op = FILTERS[c[2].toLowerCase()];
        out.filters.push({ column: c[1], op, value: filterValue(c[3], c[2].toLowerCase()) });
      }
    } else if (kind === 'ORDER BY') {
      for (const item of body.split(',')) {
        const o = /^([a-zA-Z0-9_.-]+)(?:\s+(ASC|DESC))?$/i.exec(item.trim());
        if (!o) throw new Error('ORDER BY needs a column name, optionally followed by ASC or DESC.');
        out.orderBy.push({ column: o[1], ascending: (o[2] || 'asc').toLowerCase() === 'asc' });
      }
    } else {
      if (!/^\d+$/.test(body)) throw new Error(`${kind} needs a number.`);
      if (kind === 'LIMIT') out.limit = Math.min(Number(body), 1000);
      else out.offset = Number(body);
    }
  }
  return out;
}

// Applies the parsed filters, ordering and paging to a select builder.
function applyRead(builder, command) {
  let b = builder;
  for (const f of command.filters || []) b = b[f.op](f.column, f.value);
  for (const o of command.orderBy || []) b = b.order(o.column, { ascending: o.ascending });
  const limit = command.limit ?? 100;
  const offset = command.offset || 0;
  return b.range(offset, offset + limit - 1);
}

async function connect(dial) {
  const { createClient } = require('@supabase/supabase-js'); // loaded on first use to keep app start-up light
  const rest = createClient(dial.restUrl, dial.apiKey);
  const { error } = await rest.from('___workbench_connection_test___').select('*').limit(1);
  // A missing table is an expected proof that the API endpoint is reachable.
  if (error && !/does not exist|schema cache|could not find the table/i.test(error.message)) {
    throw new Error(`Supabase REST connection check failed: ${error.message}`);
  }
  return { type: 'supabase-rest', rest, restUrl: dial.restUrl, apiKey: dial.apiKey };
}

async function close() {}

const WRITES = new Set(['insert', 'update', 'delete']);
const isWrite = text => {
  try {
    return WRITES.has(parseCommand(text).action);
  } catch (_) {
    return false;
  }
};

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
    else response = await applyRead(rest.from(command.table).select('*', { count: 'exact' }), command).abortSignal(signal);
  } finally {
    session.abort = null;
  }
  const { data, error, count } = response;
  if (error) throw error;
  const rows = data || [];
  return {
    columns: rows.length ? Object.keys(rows[0]) : [],
    rows: rows.map(x => Object.values(x)),
    json: rows,
    rowCount: count ?? rows.length,
    message: `${VERBS[command.action]} ${rows.length} rows in ${command.table}`
  };
}

const query = (session, text) => run(session, parseCommand(text));

// Structured edit from the UI: { action, object: { name }, keyColumn?, id?, record?, changes? }.
function mutate(session, op) {
  if (!op.object?.name) throw new Error('No table is selected.');
  return run(session, { action: op.action, table: op.object.name, keyColumn: op.keyColumn, id: op.id, record: op.record, changes: op.changes });
}

// Tables are read from the API's own description (PostgREST serves an OpenAPI document at the root). Some projects only
// allow that to the service-role key; then the list stays empty and tables are opened by typing `REST: table`.
async function discover(session) {
  const message = 'No tables could be listed with this API key. Type REST: table_name to read one.';
  try {
    const base = session.restUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/rest/v1/`, { headers: { apikey: session.apiKey, Authorization: `Bearer ${session.apiKey}` }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { databases: [], schemas: [], objects: [], message };
    const spec = await res.json();
    const names = Object.keys(spec.definitions || {}).sort();
    return { databases: [], schemas: [], objects: names.map(name => ({ name, type: 'table' })), message: names.length ? '' : message };
  } catch (_) {
    return { databases: [], schemas: [], objects: [], message };
  }
}

module.exports = { connect, close, query, cancel, mutate, discover, isWrite, parseCommand };
