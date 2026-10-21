// What "New …" can create on a connection, and the checks the create dialog makes before it asks the main process.
// The main process validates and quotes everything again (src/main/connectors/create.js).

const isRestSupabase = active => active?.type === 'supabase' && !active.connectionString;

// The kinds of object a connection can create, in menu order.
export function createKinds(active) {
  if (!active || isRestSupabase(active)) return [];
  if (active.type === 'mysql') return ['database', 'table'];
  if (active.type === 'postgres') return ['database', 'schema', 'table'];
  if (active.type === 'supabase') return ['schema', 'table']; // hosted projects do not allow CREATE DATABASE
  if (active.type === 'mongodb') return ['database', 'collection'];
  if (active.type === 'firestore') return ['collection'];
  return [];
}

export const KIND_LABEL = { database: 'database', schema: 'schema', table: 'table', collection: 'collection' };

export const COLUMN_TYPES = {
  postgres: [
    'integer',
    'bigint',
    'smallint',
    'serial',
    'bigserial',
    'numeric',
    'real',
    'double precision',
    'boolean',
    'text',
    'varchar(255)',
    'char(1)',
    'uuid',
    'date',
    'time',
    'timestamp',
    'timestamptz',
    'json',
    'jsonb',
    'bytea'
  ],
  mysql: [
    'int',
    'bigint',
    'smallint',
    'tinyint',
    'decimal(10,2)',
    'float',
    'double',
    'boolean',
    'varchar(255)',
    'char(1)',
    'text',
    'longtext',
    'json',
    'date',
    'time',
    'datetime',
    'timestamp',
    'blob'
  ]
};
export const columnTypesFor = active => COLUMN_TYPES[active?.type === 'mysql' ? 'mysql' : 'postgres'];

export const AUTO_TYPES = /^(smallint|integer|bigint|int|tinyint)$/;

export function blankColumn(active, index = 0) {
  const first = columnTypesFor(active)[0];
  return index === 0
    ? { name: 'id', type: first, nullable: false, primaryKey: true, autoIncrement: true, defaultValue: '' }
    : { name: '', type: columnTypesFor(active).find(t => t.startsWith('varchar')) || 'text', nullable: true, primaryKey: false, autoIncrement: false, defaultValue: '' };
}

export const blankCreate = (active, kind) => ({
  kind,
  name: '',
  schema: '',
  collection: '', // MongoDB: the first collection of a new database
  documentId: '', // Firestore: the first document of a new collection
  documentText: '{}',
  columns: kind === 'table' ? [blankColumn(active, 0)] : []
});

const baseType = type =>
  String(type || '')
    .replace(/\(.*$/, '')
    .replace(/\[\]$/, '')
    .trim()
    .toLowerCase();

// The message to show for an incomplete or impossible form, or '' when it can be submitted.
export function validateCreate(active, values) {
  const name = values.name.trim();
  if (!name) return `Enter a ${KIND_LABEL[values.kind]} name.`;
  if (values.kind === 'database' && active.type === 'mongodb' && !values.collection.trim())
    return 'MongoDB keeps a database only once it holds a collection. Enter the first collection name.';
  if (values.kind === 'collection' && active.type === 'firestore') {
    try {
      const doc = JSON.parse(values.documentText || '{}');
      if (!doc || Array.isArray(doc) || typeof doc !== 'object') throw new Error();
    } catch {
      return 'Enter the first document as a valid JSON object.';
    }
  }
  if (values.kind === 'table') {
    if (!values.columns.length) return 'Add at least one column.';
    const names = values.columns.map(column => column.name.trim().toLowerCase());
    if (names.some(n => !n)) return 'Every column needs a name.';
    if (new Set(names).size !== names.length) return 'Two columns have the same name.';
    const bad = values.columns.find(column => column.autoIncrement && !AUTO_TYPES.test(baseType(column.type)) && !/^(big)?serial$/.test(baseType(column.type)));
    if (bad) return `Column ${bad.name}: auto-increment needs an integer type.`;
  }
  return '';
}

// The payload for window.workbench.create.
export function buildCreateSpec(active, values) {
  const name = values.name.trim();
  if (values.kind === 'table')
    return {
      kind: 'table',
      name,
      schema: values.schema || undefined,
      columns: values.columns.map(column => ({
        name: column.name.trim(),
        type: column.type,
        nullable: Boolean(column.nullable) && !column.primaryKey,
        primaryKey: Boolean(column.primaryKey),
        autoIncrement: Boolean(column.autoIncrement),
        defaultValue: column.autoIncrement ? undefined : column.defaultValue || undefined
      }))
    };
  if (values.kind === 'database' && active.type === 'mongodb') return { kind: 'database', name, collection: values.collection.trim() };
  if (values.kind === 'collection' && active.type === 'firestore')
    return { kind: 'collection', name, id: values.documentId.trim() || undefined, document: JSON.parse(values.documentText || '{}') };
  return { kind: values.kind, name };
}
