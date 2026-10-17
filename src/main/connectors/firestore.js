const fs = require('fs');
const { relaxedToJson, readString } = require('./relaxed');

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

// Reads one JSON value (string, number, array, object or bare word) at `pos`; returns { text, end }.
function readValue(text, pos) {
  const ch = text[pos];
  if (ch === '"' || ch === "'") { const s = readString(text, pos); return { text: text.slice(pos, s.end), end: s.end }; }
  if (ch === '[' || ch === '{') {
    let depth = 0;
    for (let i = pos; i < text.length; i++) {
      if (text[i] === '"' || text[i] === "'") { i = readString(text, i).end - 1; continue; }
      if (text[i] === '[' || text[i] === '{') depth++;
      else if (text[i] === ']' || text[i] === '}') { depth--; if (depth === 0) return { text: text.slice(pos, i + 1), end: i + 1 }; }
    }
    throw new Error('Unbalanced brackets in the command.');
  }
  const word = /^[^\s]+/.exec(text.slice(pos));
  if (!word) throw new Error('A value is missing.');
  return { text: word[0], end: pos + word[0].length };
}

const OPERATORS = { '=': '==', '==': '==', '!=': '!=', '<': '<', '<=': '<=', '>': '>', '>=': '>=', in: 'in', 'not-in': 'not-in', 'array-contains': 'array-contains', 'array-contains-any': 'array-contains-any' };

// read|count <path> [WHERE field op value [AND …]] [ORDER BY field [ASC|DESC]] [LIMIT n] [OFFSET n]
function parseQueryClauses(rest) {
  const out = { where: [], orderBy: [] };
  let pos = 0;
  const skipSpace = () => { while (/\s/.test(rest[pos] || '')) pos++; };
  while (true) {
    skipSpace();
    if (pos >= rest.length) break;
    const kw = /^(WHERE|AND|ORDER\s+BY|LIMIT|OFFSET)\b\s*/i.exec(rest.slice(pos));
    if (!kw) throw new Error(`Unexpected "${rest.slice(pos).split(/\s/)[0]}". Use WHERE, AND, ORDER BY, LIMIT or OFFSET.`);
    pos += kw[0].length;
    const word = kw[1].toUpperCase().replace(/\s+/g, ' ');
    if (word === 'WHERE' || word === 'AND') {
      const field = /^([A-Za-z0-9_.`"-]+)\s+/.exec(rest.slice(pos));
      if (!field) throw new Error('WHERE needs: field operator value, e.g. WHERE age >= 18');
      pos += field[0].length;
      const op = /^(array-contains-any|array-contains|not-in|==|!=|<=|>=|=|<|>|in)\s+/i.exec(rest.slice(pos));
      if (!op) throw new Error('Use one of == != < <= > >= in not-in array-contains array-contains-any.');
      pos += op[0].length;
      const value = readValue(rest, pos);
      pos = value.end;
      out.where.push({ field: field[1].replace(/[`"]/g, ''), op: OPERATORS[op[1].toLowerCase()], value: JSON.parse(relaxedToJson(value.text)) });
    } else if (word === 'ORDER BY') {
      const field = /^([A-Za-z0-9_.`"-]+)(?:\s+(ASC|DESC)\b)?/i.exec(rest.slice(pos));
      if (!field) throw new Error('ORDER BY needs a field name.');
      pos += field[0].length;
      out.orderBy.push({ field: field[1].replace(/[`"]/g, ''), direction: (field[2] || 'asc').toLowerCase() });
    } else {
      const num = /^\d+/.exec(rest.slice(pos));
      if (!num) throw new Error(`${word} needs a number.`);
      pos += num[0].length;
      out[word.toLowerCase()] = Number(num[0]);
    }
  }
  return out;
}

const PATH = '[a-zA-Z0-9_./-]+';
const HELP = 'Firestore commands: "collections [docPath]", read <collection> [WHERE field >= 1] [ORDER BY field DESC] [LIMIT n] [OFFSET n], count <collection> [WHERE …], create/update/delete.';

function parseCommand(query) {
  const text = query.trim().replace(/;\s*$/, '');
  let m = /^collections(?:\s+(\S+))?$/i.exec(text);
  if (m) return { action: 'collections', path: m[1] };
  m = new RegExp(`^(create|update)\\s+(${PATH})\\s+(\\S+)\\s+(\\{.*\\})$`, 'is').exec(text);
  if (m) {
    const data = JSON.parse(m[4]);
    return m[1].toLowerCase() === 'create'
      ? { action: 'insert', collection: m[2], id: decodeId(m[3]), record: data }
      : { action: 'update', collection: m[2], id: decodeId(m[3]), changes: data };
  }
  m = new RegExp(`^delete\\s+(${PATH})\\s+(\\S+)$`, 'i').exec(text);
  if (m) return { action: 'delete', collection: m[1], id: decodeId(m[2]) };
  m = new RegExp(`^(read|count)\\s+(${PATH})(?:\\s+([\\s\\S]*))?$`, 'i').exec(text);
  if (!m) throw new Error(HELP);
  return { action: m[1].toLowerCase(), path: m[2], ...parseQueryClauses(m[3] || '') };
}

const WRITES = new Set(['insert', 'update', 'delete']);
const isWrite = text => { try { return WRITES.has(parseCommand(text).action); } catch (_) { return false; } };

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

const segments = path => path.split('/').filter(Boolean);

async function query(session, text, { maxRows = 1000 } = {}) {
  const parsed = parseCommand(text);
  if (parsed.action === 'collections') {
    const collections = parsed.path ? await session.db.doc(parsed.path).listCollections() : await session.db.listCollections();
    const label = parsed.path ? `collections under ${parsed.path}` : 'top-level collections';
    return { json: collections.map(c => ({ name: c.id, path: c.path })), columns: ['name'], rows: collections.map(c => [c.id]), message: `${collections.length} ${label}` };
  }
  if (parsed.action !== 'read' && parsed.action !== 'count') return write(session, parsed);

  // An even number of path segments names a single document, an odd number a collection.
  if (parsed.action === 'read' && segments(parsed.path).length % 2 === 0) {
    const snap = await session.db.doc(parsed.path).get();
    const docs = snap.exists ? [{ id: snap.id, ...encode(snap.data()) }] : [];
    return docResult(docs, snap.exists ? '1 document' : 'Document not found', docs.length);
  }
  let ref = session.db.collection(parsed.path);
  for (const clause of parsed.where) ref = ref.where(clause.field === '__name__' ? admin().firestore.FieldPath.documentId() : clause.field, clause.op, decode(clause.value, session.db));
  if (parsed.action === 'count') {
    const snap = await ref.count().get();
    const n = snap.data().count;
    return { columns: ['count'], rows: [[String(n)]], rowCount: 1, message: `${n} matching documents` };
  }
  for (const order of parsed.orderBy) ref = ref.orderBy(order.field, order.direction);
  const limit = Math.min(parsed.limit ?? maxRows, 100000);
  if (parsed.offset) ref = ref.offset(parsed.offset);
  const snap = await ref.limit(limit).get();
  const docs = snap.docs.map(d => ({ id: d.id, ...encode(d.data()) }));
  return docResult(docs, `${docs.length} documents`, docs.length, { truncated: parsed.limit === undefined && docs.length === limit, maxRows });
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

module.exports = { connect, close, query, mutate, discover, isWrite, parseCommand, encode, decode };
