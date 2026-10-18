const isRestSupabase = active => active?.type === 'supabase' && !active.connectionString;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const objectRef = object => ({ name: object.name, schema: object.schema });

// SELECT-style statement used when an object is opened from the sidebar.
export function selectStatement(active, object) {
  if (object.type === 'function' && active?.type === 'mysql') {
    const quoted = `\`${object.name.replace(/`/g, '``')}\``;
    return `SHOW CREATE ${object.metadata === 'procedure' ? 'PROCEDURE' : 'FUNCTION'} ${quoted};`;
  }
  if (object.type === 'function') return `SELECT pg_get_functiondef(${Number(object.oid)});`;
  if (active?.type === 'mongodb') return `find ${object.name} LIMIT 100`;
  if (active?.type === 'firestore') return `read ${object.name} LIMIT 100`;
  if (isRestSupabase(active)) return `REST: ${object.name} LIMIT 100`;
  if (active?.type === 'mysql') return `SELECT * FROM \`${object.name.replace(/`/g, '``')}\` LIMIT 100;`;
  return `SELECT * FROM "${object.schema ? `${object.schema.replace(/"/g, '""')}"."` : ''}${object.name.replace(/"/g, '""')}" LIMIT 100;`;
}

// True when the selected row can be edited/deleted for this connection and object.
export function canEditRecord(active, selectedObject, selectedJson) {
  if (active?.type === 'mongodb' || active?.type === 'firestore' || isRestSupabase(active)) return true;
  const keys = selectedObject?.primaryKey;
  return Boolean(keys?.length && keys.every(key => selectedJson?.[key] !== undefined));
}

// Fields of `edited` that differ from `doc`, and keys of `doc` that were removed. Untouched values are never
// re-sent, so dates, ObjectIds and timestamps keep their type.
function diffDocument(idKey, doc, edited) {
  const changes = {};
  const unset = [];
  for (const [key, value] of Object.entries(edited)) if (key !== idKey && (!(key in doc) || !same(value, doc[key]))) changes[key] = value;
  for (const key of Object.keys(doc)) if (key !== idKey && !(key in edited)) unset.push(key);
  return { changes, unset };
}

const isBlank = value => value === undefined || value === null || value === '';
const NO_ID = { error: 'The selected record does not include an identifier needed for this operation.' };

// Builds the structured operation for an insert / edit / delete (the main process turns it into a parameterized
// statement or driver call). Returns { op } or { error }.
export function buildRecordOp({ active, object, action, record, selectedJson }) {
  const verb = { insert: 'insert', edit: 'update', delete: 'delete' }[action];
  const target = objectRef(object);

  if (active.type === 'mongodb' || active.type === 'firestore') {
    const idKey = active.type === 'firestore' ? 'id' : '_id';
    if (action === 'insert') {
      if (active.type === 'mongodb') return { op: { action: 'insert', object: target, record } };
      const { id, ...data } = record;
      return { op: { action: 'insert', object: target, id: id || undefined, record: data } };
    }
    const docId = selectedJson?.[idKey] ?? record[idKey];
    if (isBlank(docId)) return NO_ID;
    if (action === 'delete') return { op: { action: 'delete', object: target, id: docId } };
    return buildDocumentUpdate({ active, object, doc: selectedJson || {}, edited: record });
  }

  if (isRestSupabase(active)) {
    const keyColumn = object.primaryKey?.[0] || 'id';
    if (action === 'insert') return { op: { action: 'insert', object: target, record } };
    const id = selectedJson?.[keyColumn] ?? record[keyColumn];
    if (isBlank(id)) return NO_ID;
    if (action === 'delete') return { op: { action: 'delete', object: target, keyColumn, id } };
    const { changes } = diffDocument(keyColumn, selectedJson || {}, record);
    if (!Object.keys(changes).length) return { error: 'Change at least one field before saving.' };
    return { op: { action: 'update', object: target, keyColumn, id, changes } };
  }

  // SQL: rows are located by their primary key.
  if (action === 'insert') {
    if (!Object.keys(record).length) return { error: 'Add at least one field to the record.' };
    return { op: { action: 'insert', object: target, record } };
  }
  const keys = object.primaryKey || [];
  if (!keys.length || keys.some(key => selectedJson?.[key] === undefined))
    return { error: 'This table has no visible primary key, so a record cannot be updated or deleted safely.' };
  const key = Object.fromEntries(keys.map(name => [name, selectedJson[name]]));
  if (action === 'delete') return { op: { action: 'delete', object: target, key } };
  const changes = Object.fromEntries(Object.entries(record).filter(([name, value]) => !keys.includes(name) && !same(value, selectedJson[name])));
  if (!Object.keys(changes).length) return { error: 'Change at least one non-key field before saving.' };
  return { op: { action: verb, object: target, key, changes } };
}

// A typed `find <collection>` / `read <collection>` / `REST: <table>` still tells us which object is being edited.
export function inferObject(active, query) {
  if (isRestSupabase(active)) {
    const rest = /^\s*REST:\s*([A-Za-z0-9_.-]+)/i.exec(query || '');
    return rest ? { name: rest[1], type: 'table' } : null;
  }
  if (active?.type !== 'mongodb' && active?.type !== 'firestore') return null;
  const match = /^\s*(?:(?:find|read)\s+|db\.)([A-Za-z0-9_.-]+?)(?:\.find\(|\s|$)/i.exec(query || '');
  return match ? { name: match[1], type: 'collection' } : null;
}

// Update for one edited document. Only changed fields are sent, so untouched values (dates, ObjectIds) keep their type.
// Returns { op }, { noChange: true } or { error }.
export function buildDocumentUpdate({ active, object, doc, edited }) {
  const idKey = active.type === 'firestore' ? 'id' : '_id';
  const docId = doc?.[idKey];
  if (isBlank(docId)) return { error: 'This document has no identifier.' };
  if (edited[idKey] !== undefined && String(edited[idKey]) !== String(docId)) return { error: `${idKey} cannot be changed.` };
  const { changes, unset } = diffDocument(idKey, doc, edited);
  if (!Object.keys(changes).length && !unset.length) return { noChange: true };
  return { op: { action: 'update', object: objectRef(object), id: docId, changes, unset } };
}
