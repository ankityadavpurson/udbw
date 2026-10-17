const MAX_DOCUMENT_COLUMNS = 30;

// MongoDB / Firestore reads come back as { columns: ['_id' | 'id', 'document'], json: [doc, ...] }.
export function isDocumentResult(result) {
  const columns = result?.columns || [];
  return columns.length === 2 && (columns[0] === '_id' || columns[0] === 'id') && columns[1] === 'document' && Array.isArray(result.json);
}

// Which view suits a result: documents read best as JSON, everything else as a table.
export function autoView(result) {
  return isDocumentResult(result) ? 'json' : 'table';
}

const cell = value => {
  if (value === null) return 'NULL';
  if (value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};

// Table form of a result. Documents are flattened to one column per top-level field.
export function toTable(result) {
  if (!result) return { columns: [], rows: [] };
  if (!isDocumentResult(result)) return { columns: result.columns || [], rows: result.rows || [] };
  const keys = [];
  for (const doc of result.json) for (const key of Object.keys(doc || {})) if (!keys.includes(key)) keys.push(key);
  const idKeys = ['_id', 'id'].filter(key => keys.includes(key));
  const columns = [...idKeys, ...keys.filter(key => !idKeys.includes(key))].slice(0, MAX_DOCUMENT_COLUMNS);
  return { columns, rows: result.json.map(doc => columns.map(column => cell(doc?.[column]))) };
}

const LABEL_KEYS = ['name', 'title', 'fullname', 'username', 'email', 'label', 'status', 'type'];

// Short "key: value" pairs that help recognise a document at a glance (scalars only, id excluded).
export function summarizeDocument(doc, max = 4) {
  const entries = Object.entries(doc || {}).filter(([key, value]) => key !== '_id' && key !== 'id' && (value === null || typeof value !== 'object'));
  entries.sort(([a], [b]) => {
    const rank = key => { const i = LABEL_KEYS.indexOf(key.toLowerCase()); return i === -1 ? LABEL_KEYS.length : i; };
    return rank(a) - rank(b);
  });
  return entries.slice(0, max).map(([key, value]) => [key, value === null ? 'null' : String(value).length > 28 ? `${String(value).slice(0, 27)}…` : String(value)]);
}
