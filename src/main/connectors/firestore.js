const fs = require('fs');

const MAX_LIMIT = 1000;
// The Admin SDK is loaded on first use to keep app start-up light.
const admin = () => require('firebase-admin');

function decodeId(value) {
  try { return decodeURIComponent(value); } catch (_) { return value; }
}

// Firestore types that JSON cannot carry are shown as { __type, … } objects and turned back into real values on write.
function encode(value) {
  const FS = admin().firestore;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof FS.Timestamp) {
    const iso = new Date(value.seconds * 1000).toISOString().replace('.000Z', `.${String(value.nanoseconds).padStart(9, '0')}Z`);
    return { __type: 'timestamp', value: iso };
  }
  if (value instanceof Date) return { __type: 'timestamp', value: value.toISOString() };
  if (value instanceof FS.GeoPoint) return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  if (value instanceof FS.DocumentReference) return { __type: 'reference', path: value.path };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { __type: 'bytes', base64: Buffer.from(value).toString('base64') };
  if (Array.isArray(value)) return value.map(encode);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
}

function decode(value, db) {
  const FS = admin().firestore;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => decode(item, db));
  if (value.__type === 'timestamp' && typeof value.value === 'string') {
    const match = /^(.*?)(?:\.(\d{1,9}))?Z$/.exec(value.value);
    const ms = match ? Date.parse(`${match[1]}Z`) : NaN;
    if (Number.isNaN(ms)) throw new Error(`Invalid timestamp "${value.value}". Use an ISO 8601 UTC value such as 2024-01-31T12:00:00Z.`);
    return new FS.Timestamp(Math.floor(ms / 1000), Number((match[2] || '').padEnd(9, '0')));
  }
  if (value.__type === 'geopoint') return new FS.GeoPoint(Number(value.latitude), Number(value.longitude));
  if (value.__type === 'reference' && typeof value.path === 'string') return db.doc(value.path);
  if (value.__type === 'bytes' && typeof value.base64 === 'string') return Buffer.from(value.base64, 'base64');
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item, db)]));
}

function docResult(docs, message, rowCount) {
  return { json: docs, columns: ['id', 'document'], rows: docs.map(d => [String(d.id), JSON.stringify(d)]), rowCount, message };
}

function parseCommand(query) {
  const text = query.trim();
  if (/^collections\s*;?$/i.test(text)) return { action: 'collections' };
  let m = text.match(/^(create|update)\s+([a-zA-Z0-9_.-]+)\s+(\S+)\s+(\{.*\})$/is);
  if (m) {
    const data = JSON.parse(m[4]);
    return m[1].toLowerCase() === 'create'
      ? { action: 'insert', collection: m[2], id: decodeId(m[3]), record: data }
      : { action: 'update', collection: m[2], id: decodeId(m[3]), changes: data };
  }
  m = text.match(/^delete\s+([a-zA-Z0-9_.-]+)\s+(\S+)$/i);
  if (m) return { action: 'delete', collection: m[1], id: decodeId(m[2]) };
  // read collection_name LIMIT 100
  m = text.match(/^read\s+([a-zA-Z0-9_.-]+)(?:\s+LIMIT\s+(\d+))?$/i);
  if (!m) throw new Error('Firestore commands: "collections" or "read collection_name LIMIT 100"');
  return { action: 'read', collection: m[1], limit: Math.min(Number(m[2] || 100), MAX_LIMIT) };
}

async function connect(dial) {
  if (!dial.serviceAccountPath) throw new Error('Select a Firebase service-account JSON file.');
  const raw = JSON.parse(fs.readFileSync(dial.serviceAccountPath, 'utf8'));
  const appName = `workbench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sdk = admin();
  const app = sdk.initializeApp({ credential: sdk.credential.cert(raw), projectId: dial.projectId || raw.project_id }, appName);
  const session = { type: 'firestore', db: sdk.firestore(app), appName, projectId: dial.projectId || raw.project_id };
  try { await session.db.listCollections(); } catch (err) { await app.delete().catch(() => {}); throw err; }
  return session;
}

async function close(session) {
  if (!session.appName) return;
  const app = admin().apps.find(x => x && x.name === session.appName);
  if (app) await app.delete();
}

// Writes: { action: 'insert' | 'update' | 'delete', collection, id, record | changes, unset }, values in the { __type } form.
async function write(session, command) {
  const { FieldValue } = admin().firestore;
  const collection = session.db.collection(command.collection);
  if (command.action === 'insert') {
    const ref = command.id ? collection.doc(command.id) : collection.doc();
    const data = decode(command.record || {}, session.db);
    await ref.set(data);
    return docResult([{ id: ref.id, ...encode(data) }], 'Created 1 document', 1);
  }
  if (!command.id) throw new Error('This document has no identifier.');
  const ref = collection.doc(command.id);
  if (command.action === 'delete') {
    await ref.delete();
    return { json: [], columns: [], rows: [], rowCount: 1, message: 'Deleted document' };
  }
  const data = decode(command.changes || {}, session.db);
  for (const key of command.unset || []) data[key] = FieldValue.delete();
  if (!Object.keys(data).length) throw new Error('Nothing to update.');
  await ref.set(data, { merge: true });
  const snap = await ref.get();
  return docResult([{ id: snap.id, ...encode(snap.data()) }], 'Updated 1 document', 1);
}

async function query(session, text) {
  const parsed = parseCommand(text);
  if (parsed.action === 'collections') {
    const collections = await session.db.listCollections();
    return { json: collections.map(c => ({ name: c.id })), columns: ['name'], rows: collections.map(c => [c.id]), message: `${collections.length} top-level collections` };
  }
  if (parsed.action !== 'read') return write(session, parsed);
  const snap = await session.db.collection(parsed.collection).limit(parsed.limit).get();
  const docs = snap.docs.map(d => ({ id: d.id, ...encode(d.data()) }));
  return docResult(docs, `${docs.length} documents`);
}

// Structured edit from the UI: { action, object: { name }, id?, record?, changes?, unset? }.
async function mutate(session, op) {
  const collection = op.object?.name;
  if (!collection) throw new Error('No collection is selected.');
  return write(session, { action: op.action, collection, id: op.id, record: op.record, changes: op.changes, unset: op.unset });
}

async function discover(session) {
  const collections = await session.db.listCollections();
  return { databases: [session.projectId].filter(Boolean), schemas: [], objects: collections.map(c => ({ name: c.id, type: 'collection' })), message: collections.length ? '' : 'No top-level collections are available.' };
}

module.exports = { connect, close, query, mutate, discover, parseCommand, encode, decode };
