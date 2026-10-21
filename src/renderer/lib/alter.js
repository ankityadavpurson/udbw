// Editing the structure of an existing table: the dialog works on one row per column, and the difference from what the
// table has now becomes the list of changes sent to the main process (which writes and quotes the SQL itself).

let nextId = 1;
const newId = () => `col-${nextId++}`;

const defaultText = value => (value === null || value === undefined ? '' : String(value));

// One editable row per column the table has now.
export function rowsFromObject(object) {
  return (object?.columnInfo || []).map(column => ({
    id: newId(),
    isNew: false,
    removed: false,
    original: { name: column.name, type: column.type, nullable: Boolean(column.nullable), defaultValue: defaultText(column.defaultValue) },
    name: column.name,
    type: column.type,
    nullable: Boolean(column.nullable),
    defaultValue: defaultText(column.defaultValue),
    auto: Boolean(column.auto)
  }));
}

export const newRow = type => ({ id: newId(), isNew: true, removed: false, name: '', type, nullable: true, defaultValue: '', auto: false });

// Changes in the order they must run: drops, renames, edits of the columns that stay, new columns, then the table name.
export function diffStructure({ rows, tableName, newTableName }) {
  const ops = [];
  for (const row of rows) if (row.removed && !row.isNew) ops.push({ op: 'drop', name: row.original.name });
  const kept = rows.filter(row => !row.removed);
  for (const row of kept) if (!row.isNew && row.name.trim() !== row.original.name) ops.push({ op: 'rename', name: row.original.name, to: row.name.trim() });
  for (const row of kept) {
    if (row.isNew) continue;
    const change = {};
    if (row.type !== row.original.type) change.type = row.type;
    if (row.nullable !== row.original.nullable) change.nullable = row.nullable;
    if (row.defaultValue !== row.original.defaultValue) change.defaultValue = row.defaultValue;
    if (Object.keys(change).length) ops.push({ op: 'modify', name: row.name.trim(), ...change });
  }
  for (const row of kept)
    if (row.isNew) ops.push({ op: 'add', column: { name: row.name.trim(), type: row.type, nullable: row.nullable, defaultValue: row.defaultValue || undefined } });
  if (newTableName.trim() && newTableName.trim() !== tableName) ops.push({ op: 'renameTable', to: newTableName.trim() });
  return ops;
}

// The message to show for an impossible form, or '' when it can be submitted.
export function validateStructure({ rows, newTableName }) {
  if (!newTableName.trim()) return 'The table needs a name.';
  const kept = rows.filter(row => !row.removed);
  if (!kept.length) return 'A table needs at least one column.';
  if (kept.some(row => !row.name.trim())) return 'Every column needs a name.';
  const names = kept.map(row => row.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return 'Two columns have the same name.';
  return '';
}
