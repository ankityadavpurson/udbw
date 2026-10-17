// Helpers shared by the MySQL and PostgreSQL connectors.

function serializeValue(v) {
  // Real nulls stay null so edits never write the text "NULL"; the UI draws them as NULL.
  if (v === null || v === undefined) return v === null ? null : '';
  if (Buffer.isBuffer(v)) return `base64:${v.toString('base64')}`;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function normalizeSqlResult(rows, fields) {
  if (!Array.isArray(rows)) {
    const affected = rows?.affectedRows;
    return { columns: [], rows: [], json: [], message: affected === undefined ? JSON.stringify(rows) : `${affected} row(s) affected`, rowCount: affected ?? 0 };
  }
  const columns = fields?.map(f => f.name) || (rows[0] ? Object.keys(rows[0]) : []);
  return {
    columns,
    rows: rows.map(r => columns.map(c => serializeValue(r[c]))),
    json: rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, serializeValue(v)]))),
    rowCount: rows.length,
    message: `${rows.length} rows returned`
  };
}

function normalizePgResult(result) {
  const columns = result.fields?.map(f => f.name) || (result.rows[0] ? Object.keys(result.rows[0]) : []);
  const rows = result.rows || [];
  return {
    columns,
    rows: rows.map(r => columns.map(c => serializeValue(r[c]))),
    json: rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, serializeValue(v)]))),
    rowCount: result.rowCount,
    message: result.command ? `${result.command}${result.rowCount == null ? '' : ` · ${result.rowCount} row(s)`}` : 'Query completed'
  };
}

const toParam = value => (value === undefined ? null : value !== null && typeof value === 'object' ? JSON.stringify(value) : value);

// Turns a structured insert / update / delete into a parameterized statement. Identifiers are quoted here and
// every value is a bound parameter, so nothing the user typed is ever spliced into the SQL text.
// op: { action, object: { name, schema? }, record?, changes?, key? }
function buildSqlMutation(dialect, op) {
  const quote = dialect === 'mysql'
    ? value => `\`${String(value).replace(/`/g, '``')}\``
    : value => `"${String(value).replace(/"/g, '""')}"`;
  const object = op.object || {};
  if (!object.name) throw new Error('No table is selected.');
  const table = `${object.schema ? `${quote(object.schema)}.` : ''}${quote(object.name)}`;
  const params = [];
  const bind = value => { params.push(toParam(value)); return dialect === 'mysql' ? '?' : `$${params.length}`; };
  const where = () => {
    const entries = Object.entries(op.key || {});
    if (!entries.length) throw new Error('This table has no visible primary key, so a record cannot be updated or deleted safely.');
    return entries.map(([key, value]) => (value === null ? `${quote(key)} IS NULL` : `${quote(key)} = ${bind(value)}`)).join(' AND ');
  };

  if (op.action === 'insert') {
    const entries = Object.entries(op.record || {});
    if (!entries.length) throw new Error('Add at least one field to the record.');
    const columns = entries.map(([key]) => quote(key)).join(', ');
    const values = entries.map(([, value]) => bind(value)).join(', ');
    return { sql: `INSERT INTO ${table} (${columns}) VALUES (${values})`, params };
  }
  if (op.action === 'update') {
    const entries = Object.entries(op.changes || {});
    if (!entries.length) throw new Error('Change at least one non-key field before saving.');
    const assignments = entries.map(([key, value]) => `${quote(key)} = ${bind(value)}`).join(', ');
    return { sql: `UPDATE ${table} SET ${assignments} WHERE ${where()}`, params };
  }
  if (op.action === 'delete') return { sql: `DELETE FROM ${table} WHERE ${where()}`, params };
  throw new Error('Unsupported operation.');
}

function mutationResult(action, count) {
  const verb = { insert: 'Inserted', update: 'Updated', delete: 'Deleted' }[action] || 'Changed';
  return { columns: [], rows: [], json: [], rowCount: count, message: `${verb} ${count ?? 0} row(s)` };
}

module.exports = { serializeValue, normalizeSqlResult, normalizePgResult, buildSqlMutation, mutationResult };
