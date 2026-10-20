import { buildRecordOp } from './statements.js';

// Pending (not yet saved) changes of a table grid:
//   edits:   { [rowIndex]: { [column]: value } }   changed cells of existing rows
//   deleted: [rowIndex]                            rows marked for deletion
//   added:   [{ id, values: { [column]: value } }] new rows; only the columns the user filled in
export const emptyPending = () => ({ edits: {}, deleted: [], added: [] });

export function countChanges(pending) {
  const edited = Object.values(pending.edits).filter(cells => Object.keys(cells).length).length;
  return { edited, deleted: pending.deleted.length, added: pending.added.length, total: edited + pending.deleted.length + pending.added.length };
}

export function describeChanges(pending) {
  const { edited, deleted, added } = countChanges(pending);
  const parts = [
    edited && `${edited} edited row${edited === 1 ? '' : 's'}`,
    added && `${added} new row${added === 1 ? '' : 's'}`,
    deleted && `${deleted} deleted row${deleted === 1 ? '' : 's'}`
  ].filter(Boolean);
  return parts.join(', ');
}

// Sets one cell of an existing row. Putting the original value back removes the edit.
export function setCellEdit(pending, rowIndex, column, value, original) {
  const cells = { ...(pending.edits[rowIndex] || {}) };
  if (value === original) delete cells[column];
  else cells[column] = value;
  const edits = { ...pending.edits };
  if (Object.keys(cells).length) edits[rowIndex] = cells;
  else delete edits[rowIndex];
  return { ...pending, edits };
}

export function setAddedValue(pending, id, column, value) {
  return { ...pending, added: pending.added.map(row => (row.id === id ? { ...row, values: { ...row.values, [column]: value } } : row)) };
}

export function toggleDeleted(pending, indexes) {
  const marked = new Set(pending.deleted);
  const allMarked = indexes.every(i => marked.has(i));
  for (const i of indexes) {
    if (allMarked) marked.delete(i);
    else marked.add(i);
  }
  return { ...pending, deleted: [...marked].sort((a, b) => a - b) };
}

// The ordered operations for one transaction: updates, then deletes, then inserts. Returns { ops } or { error }.
export function buildBatch({ active, object, records, pending }) {
  const ops = [];
  const deleted = new Set(pending.deleted);
  for (const [key, changes] of Object.entries(pending.edits)) {
    const index = Number(key);
    if (deleted.has(index) || !Object.keys(changes).length) continue;
    const original = records[index];
    const built = buildRecordOp({ active, object, action: 'edit', record: { ...original, ...changes }, selectedJson: original });
    if (built.error) return { error: `Row ${index + 1}: ${built.error}` };
    if (built.op) ops.push(built.op);
  }
  for (const index of pending.deleted) {
    const built = buildRecordOp({ active, object, action: 'delete', record: {}, selectedJson: records[index] });
    if (built.error) return { error: `Row ${index + 1}: ${built.error}` };
    ops.push(built.op);
  }
  for (const [n, row] of pending.added.entries()) {
    const record = Object.fromEntries(Object.entries(row.values).filter(([, value]) => value !== undefined));
    const built = buildRecordOp({ active, object, action: 'insert', record, selectedJson: null });
    if (built.error) return { error: `New row ${n + 1}: ${built.error}` };
    ops.push(built.op);
  }
  return { ops };
}

// Readable SQL for the preview list. For display only: the real statements are built in the main process with bound parameters.
export function previewOp(dialect, op) {
  const quote = dialect === 'mysql' ? v => `\`${v}\`` : v => `"${v}"`;
  const literal = v => (v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
  const table = `${op.object.schema ? `${quote(op.object.schema)}.` : ''}${quote(op.object.name)}`;
  const where = () =>
    Object.entries(op.key)
      .map(([k, v]) => (v === null ? `${quote(k)} IS NULL` : `${quote(k)} = ${literal(v)}`))
      .join(' AND ');
  if (op.action === 'insert') {
    const entries = Object.entries(op.record);
    return `INSERT INTO ${table} (${entries.map(([k]) => quote(k)).join(', ')}) VALUES (${entries.map(([, v]) => literal(v)).join(', ')});`;
  }
  if (op.action === 'update')
    return `UPDATE ${table} SET ${Object.entries(op.changes)
      .map(([k, v]) => `${quote(k)} = ${literal(v)}`)
      .join(', ')} WHERE ${where()};`;
  return `DELETE FROM ${table} WHERE ${where()};`;
}
