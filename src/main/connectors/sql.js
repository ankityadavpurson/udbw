// Helpers shared by the MySQL and PostgreSQL connectors.

function serializeValue(v) {
  // Real nulls stay null so edits never write the text "NULL"; the UI draws them as NULL.
  if (v === null || v === undefined) return v === null ? null : '';
  if (Buffer.isBuffer(v)) return `base64:${v.toString('base64')}`;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Rows are sent once, as arrays in column order (the UI builds records from them when it needs to). At most
// `maxRows` rows are kept; `truncated` tells the UI there were more.
function shape(columns, allRows, maxRows, extra = {}) {
  const truncated = allRows.length > maxRows;
  const rows = (truncated ? allRows.slice(0, maxRows) : allRows).map(row => row.map(serializeValue));
  return { columns, rows, rowCount: rows.length, truncated, maxRows, message: `${rows.length} rows returned${truncated ? ' (limited)' : ''}`, ...extra };
}

// mysql2 with rowsAsArray: rows are arrays and `fields` lists the columns. Write statements return a header object.
function normalizeSqlResult(rows, fields, maxRows) {
  if (!Array.isArray(rows)) {
    const affected = rows?.affectedRows;
    return { columns: [], rows: [], message: affected === undefined ? 'Statement executed' : `${affected} row(s) affected`, rowCount: affected ?? 0 };
  }
  return shape(
    (fields || []).map(f => f.name),
    rows,
    maxRows
  );
}

// pg with rowMode 'array'. A multi-statement text returns one result per statement; the last one is shown.
function normalizePgResult(result, maxRows) {
  const last = Array.isArray(result) ? result[result.length - 1] : result;
  if (!last) return { columns: [], rows: [], rowCount: 0, message: 'Query completed' };
  const columns = (last.fields || []).map(f => f.name);
  if (!columns.length)
    return {
      columns: [],
      rows: [],
      rowCount: last.rowCount,
      message: last.command ? `${last.command}${last.rowCount == null ? '' : ` · ${last.rowCount} row(s)`}` : 'Query completed'
    };
  return shape(columns, last.rows || [], maxRows);
}

const toParam = value => (value === undefined ? null : value !== null && typeof value === 'object' ? JSON.stringify(value) : value);

// Turns a structured insert / update / delete into a parameterized statement. Identifiers are quoted here and
// every value is a bound parameter, so nothing the user typed is ever spliced into the SQL text.
// op: { action, object: { name, schema? }, record?, changes?, key? }
function buildSqlMutation(dialect, op) {
  const quote = dialect === 'mysql' ? value => `\`${String(value).replace(/`/g, '``')}\`` : value => `"${String(value).replace(/"/g, '""')}"`;
  const object = op.object || {};
  if (!object.name) throw new Error('No table is selected.');
  const table = `${object.schema ? `${quote(object.schema)}.` : ''}${quote(object.name)}`;
  const params = [];
  const bind = value => {
    params.push(toParam(value));
    return dialect === 'mysql' ? '?' : `$${params.length}`;
  };
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
  return { columns: [], rows: [], rowCount: count, message: `${verb} ${count ?? 0} row(s)` };
}

module.exports = { serializeValue, normalizeSqlResult, normalizePgResult, buildSqlMutation, mutationResult };
