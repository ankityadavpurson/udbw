// Helpers behind the document tree editor. Documents are plain JSON values; paths are arrays of keys / indexes.

const EXTENDED = [
  ['$oid', 'ObjectId'],
  ['$date', 'Date'],
  ['$numberLong', 'Long'],
  ['$numberDecimal', 'Decimal'],
  ['$numberInt', 'Int'],
  ['$numberDouble', 'Double'],
  ['$uuid', 'UUID']
];

const isContainer = value => value !== null && typeof value === 'object';

// Values JSON has no type for (MongoDB extended JSON, Firestore { __type }) show as one typed leaf, not as an object.
// Returns { label, field, editable, display } or null.
export function specialOf(value) {
  if (!isContainer(value) || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length === 1) {
    const match = EXTENDED.find(([key]) => key === keys[0]);
    if (match && typeof value[match[0]] === 'string') return { label: match[1], field: match[0], editable: true, display: value[match[0]] };
  }
  if (typeof value.__type === 'string') {
    if (value.__type === 'timestamp' && typeof value.value === 'string') return { label: 'Timestamp', field: 'value', editable: true, display: value.value };
    if (value.__type === 'reference' && typeof value.path === 'string') return { label: 'Reference', field: 'path', editable: true, display: value.path };
    if (value.__type === 'geopoint') return { label: 'GeoPoint', field: null, editable: false, display: `${value.latitude}, ${value.longitude}` };
    if (value.__type === 'bytes') return { label: 'Bytes', field: null, editable: false, display: `${String(value.base64 || '').length} base64 chars` };
  }
  return null;
}

export const TYPES = ['string', 'number', 'boolean', 'null', 'object', 'array'];

export function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return specialOf(value) ? 'special' : 'object';
  return typeof value === 'number' || typeof value === 'boolean' ? typeof value : 'string';
}

export function convertType(value, type) {
  const text = isContainer(value) ? JSON.stringify(value) : value === null ? '' : String(value);
  if (type === 'string') return text;
  if (type === 'number') return Number.isFinite(Number(text)) && text.trim() !== '' ? Number(text) : 0;
  if (type === 'boolean') return value === true || /^(true|1|yes)$/i.test(text);
  if (type === 'null') return null;
  if (type === 'object') return {};
  if (type === 'array') return [];
  return value;
}

export const getAt = (root, path) => path.reduce((node, key) => (node == null ? undefined : node[key]), root);

// Immutable update of the value at `path`. An empty path replaces the root.
export function setAt(root, path, value) {
  if (!path.length) return value;
  const [key, ...rest] = path;
  const copy = Array.isArray(root) ? [...root] : { ...root };
  copy[key] = setAt(root[key], rest, value);
  return copy;
}

export function removeAt(root, path) {
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  const parent = getAt(root, parentPath);
  const next = Array.isArray(parent) ? parent.filter((_, i) => i !== key) : Object.fromEntries(Object.entries(parent).filter(([name]) => name !== key));
  return setAt(root, parentPath, next);
}

// A key that is not used in `object` yet: field, field2, field3 …
export function freshKey(object, base = 'field') {
  let name = base;
  for (let n = 2; name in object; n += 1) name = `${base}${n}`;
  return name;
}

export function addField(root, path, key, value = '') {
  const target = getAt(root, path);
  return setAt(root, path, Array.isArray(target) ? [...target, value] : { ...target, [key]: value });
}

// Renames a field and keeps its position. Returns the document unchanged when the new name is empty or taken.
export function renameKey(root, path, newKey) {
  const parentPath = path.slice(0, -1);
  const oldKey = path[path.length - 1];
  const parent = getAt(root, parentPath);
  if (Array.isArray(parent) || !newKey || newKey === oldKey || newKey in parent) return root;
  return setAt(root, parentPath, Object.fromEntries(Object.entries(parent).map(([name, value]) => [name === oldKey ? newKey : name, value])));
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const label = path => path.reduce((out, key) => (typeof key === 'number' ? `${out}[${key}]` : out ? `${out}.${key}` : String(key)), '');

// Field-level differences between two documents: [{ path, kind: 'added' | 'removed' | 'changed', before, after }].
export function diffDocs(before, after, path = []) {
  const changes = [];
  const bothObjects = isContainer(before) && isContainer(after) && Array.isArray(before) === Array.isArray(after) && !specialOf(before) && !specialOf(after);
  if (!bothObjects) {
    if (!same(before, after)) changes.push({ path: label(path), kind: 'changed', before, after });
    return changes;
  }
  const keys = Array.isArray(before)
    ? Array.from({ length: Math.max(before.length, after.length) }, (_, i) => i)
    : [...Object.keys(before), ...Object.keys(after).filter(key => !(key in before))];
  for (const key of keys) {
    const here = [...path, key];
    const had = Array.isArray(before) ? key < before.length : key in before;
    const has = Array.isArray(after) ? key < after.length : key in after;
    if (!had) changes.push({ path: label(here), kind: 'added', after: after[key] });
    else if (!has) changes.push({ path: label(here), kind: 'removed', before: before[key] });
    else changes.push(...diffDocs(before[key], after[key], here));
  }
  return changes;
}
