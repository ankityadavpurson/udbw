const isRestSupabase = active => active?.type === 'supabase' && !active.connectionString;

// SELECT-style statement used when an object is opened from the sidebar.
export function selectStatement(active, object) {
  if (active?.type === 'mongodb') return `find ${object.name} LIMIT 100`;
  if (active?.type === 'firestore') return `read ${object.name} LIMIT 100`;
  if (isRestSupabase(active)) return `REST: ${object.name} LIMIT 100`;
  if (active?.type === 'mysql') return `SELECT * FROM \`${object.name.replace(/`/g, '``')}\` LIMIT 100;`;
  return `SELECT * FROM "${(object.schema ? `${object.schema}"."` : '')}${object.name.replace(/"/g, '""')}" LIMIT 100;`;
}

export function sqlLiteral(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') value = JSON.stringify(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

// True when the selected row can be edited/deleted for this connection and object.
export function canEditRecord(active, selectedObject, selectedJson) {
  if (active?.type === 'mongodb' || active?.type === 'firestore' || isRestSupabase(active)) return true;
  const keys = selectedObject?.primaryKey;
  return Boolean(keys?.length && keys.every(key => selectedJson?.[key] !== undefined));
}

// Builds the command for an insert / edit / delete. Returns { statement } or { error }.
export function buildRecordStatement({ active, object, action, record, selectedJson }) {
  const docId = selectedJson?.id ?? selectedJson?._id ?? record.id ?? record._id;
  if (action !== 'insert' && !docId) return { error: 'The selected record does not include an identifier needed for this operation.' };

  if (active.type === 'mongodb') {
    const collection = object.name;
    if (action === 'insert') return { statement: `insert ${collection} ${JSON.stringify(record)}` };
    if (action === 'edit') { const { _id, ...changes } = record; return { statement: `update ${collection} ${docId} ${JSON.stringify(changes)}` }; }
    return { statement: `delete ${collection} ${docId}` };
  }
  if (active.type === 'firestore') {
    const collection = object.name;
    if (action === 'insert') { const { id, ...data } = record; return { statement: `create ${collection} ${id || crypto.randomUUID()} ${JSON.stringify(data)}` }; }
    if (action === 'edit') { const { id, ...changes } = record; return { statement: `update ${collection} ${docId} ${JSON.stringify(changes)}` }; }
    return { statement: `delete ${collection} ${docId}` };
  }
  if (isRestSupabase(active)) {
    if (action === 'insert') return { statement: `INSERT ${object.name} ${JSON.stringify(record)}` };
    if (action === 'edit') { const { id, ...changes } = record; return { statement: `UPDATE ${object.name} id=${docId} ${JSON.stringify(changes)}` }; }
    return { statement: `DELETE ${object.name} id=${docId}` };
  }

  const quote = active.type === 'mysql' ? value => `\`${String(value).replace(/`/g, '``')}\`` : value => `"${String(value).replace(/"/g, '""')}"`;
  const table = `${object.schema ? `${quote(object.schema)}.` : ''}${quote(object.name)}`;
  const keys = object.primaryKey || [];
  if (action === 'insert') {
    const entries = Object.entries(record);
    if (!entries.length) return { error: 'Add at least one field to the record.' };
    return { statement: `INSERT INTO ${table} (${entries.map(([key]) => quote(key)).join(', ')}) VALUES (${entries.map(([, value]) => sqlLiteral(value)).join(', ')});` };
  }
  if (!keys.length || keys.some(key => selectedJson?.[key] === undefined)) return { error: 'This table has no visible primary key, so a record cannot be updated or deleted safely.' };
  const where = keys.map(key => `${quote(key)} = ${sqlLiteral(selectedJson[key])}`).join(' AND ');
  if (action === 'edit') {
    const entries = Object.entries(record).filter(([key]) => !keys.includes(key));
    if (!entries.length) return { error: 'Change at least one non-key field before saving.' };
    return { statement: `UPDATE ${table} SET ${entries.map(([key, value]) => `${quote(key)} = ${sqlLiteral(value)}`).join(', ')} WHERE ${where};` };
  }
  return { statement: `DELETE FROM ${table} WHERE ${where};` };
}
