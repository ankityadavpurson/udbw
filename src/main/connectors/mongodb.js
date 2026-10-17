const MAX_LIMIT = 1000;

// The driver is loaded on first use to keep app start-up light.
const driver = () => require('mongodb');
const ejson = () => driver().BSON.EJSON;
const parseEjson = text => ejson().parse(text, { relaxed: true });
const fromPlain = value => ejson().deserialize(value, { relaxed: true });

// Ids inside text commands are percent-encoded by the UI so spaces and symbols survive; typed plain ids work too.
function decodeId(value) {
  try { return decodeURIComponent(value); } catch (_) { return value; }
}

// Matches a document by _id whatever its stored type: ObjectId, string or number.
function idFilter(value) {
  const { ObjectId } = driver();
  const text = String(value);
  if (/^[a-f\d]{24}$/i.test(text)) return { _id: { $in: [new ObjectId(text), text] } };
  if (/^-?\d+(\.\d+)?$/.test(text)) return { _id: { $in: [text, Number(text)] } };
  return { _id: text };
}

// Documents are shown as relaxed Extended JSON ({"$oid": …}, {"$date": …}) so editing and cloning keep BSON types;
// the top-level _id stays a plain string because it identifies the row.
function plain(doc) {
  const { ObjectId } = driver();
  const out = JSON.parse(ejson().stringify(doc, { relaxed: true }));
  if (doc && doc._id !== undefined && (doc._id instanceof ObjectId || typeof doc._id !== 'object')) out._id = String(doc._id);
  return out;
}

function docResult(docs, message, rowCount) {
  const json = docs.map(plain);
  return { json, columns: ['_id', 'document'], rows: json.map(d => [String(d._id ?? ''), JSON.stringify(d)]), rowCount, message };
}

function parseCommand(query) {
  const text = query.trim();
  if (/^collections\s*;?$/i.test(text)) return { action: 'collections' };
  let m = text.match(/^insert\s+([a-zA-Z0-9_.-]+)\s+(\{.*\})$/is);
  if (m) return { action: 'insert', collection: m[1], record: parseEjson(m[2]) };
  m = text.match(/^update\s+([a-zA-Z0-9_.-]+)\s+(\S+)\s+(\{.*\})$/is);
  if (m) {
    const document = parseEjson(m[3]);
    const update = Object.keys(document).some(key => key.startsWith('$')) ? document : { $set: document };
    return { action: 'update', collection: m[1], id: decodeId(m[2]), update };
  }
  m = text.match(/^delete\s+([a-zA-Z0-9_.-]+)\s+(\S+)$/i);
  if (m) return { action: 'delete', collection: m[1], id: decodeId(m[2]) };
  // find collection_name {"field":"value"} LIMIT 100
  m = text.match(/^find\s+([a-zA-Z0-9_.-]+)(?:\s+(\{.*\}))?(?:\s+LIMIT\s+(\d+))?$/is);
  if (!m) throw new Error('MongoDB commands: "collections" or \'find collection_name {"status":"active"} LIMIT 100\'');
  let filter = m[2] ? parseEjson(m[2]) : {};
  if (typeof filter._id === 'string') filter = { ...filter, ...idFilter(filter._id) };   // a plain id string also matches an ObjectId
  return { action: 'find', collection: m[1], filter, limit: Math.min(Number(m[3] || 100), MAX_LIMIT) };
}

async function connect(dial) {
  const { MongoClient } = driver();
  const client = new MongoClient(dial.uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  try {
    const dbName = dial.database || new URL(dial.uri.replace('mongodb+srv://', 'https://').replace('mongodb://', 'http://')).pathname.replace('/', '') || 'admin';
    const session = { type: 'mongodb', client, database: dial.database || dbName };
    await client.db(session.database).command({ ping: 1 });
    return session;
  } catch (err) { await client.close().catch(() => {}); throw err; }
}

async function close(session) { if (session.client) await session.client.close(); }

function switchDatabase(session, database) { session.database = database; }

// Writes: { action: 'insert' | 'update' | 'delete', collection, record | update | id }, with BSON values already built.
async function write(session, command) {
  const collection = session.client.db(session.database).collection(command.collection);
  if (command.action === 'insert') {
    const doc = { ...command.record };
    await collection.insertOne(doc);
    return docResult([doc], 'Inserted 1 document', 1);
  }
  if (command.action === 'update') {
    const filter = idFilter(command.id);
    const updated = await collection.updateOne(filter, command.update);
    const docs = await collection.find(filter).limit(1).toArray();
    return docResult(docs, `Updated ${updated.modifiedCount} document(s)`, updated.modifiedCount);
  }
  const deleted = await collection.deleteOne(idFilter(command.id));
  return { json: [], columns: [], rows: [], rowCount: deleted.deletedCount, message: `Deleted ${deleted.deletedCount} document(s)` };
}

async function query(session, text) {
  const parsed = parseCommand(text);
  const db = session.client.db(session.database);
  if (parsed.action === 'collections') {
    const names = await db.listCollections({}, { nameOnly: true }).toArray();
    return { json: names, columns: ['name'], rows: names.map(x => [x.name]), message: `${names.length} collections` };
  }
  if (parsed.action !== 'find') return write(session, parsed);
  const docs = await db.collection(parsed.collection).find(parsed.filter).limit(parsed.limit).toArray();
  return docResult(docs, `${docs.length} documents`);
}

// Structured edit from the UI: { action, object: { name }, record?, id?, changes?, unset? } (values in Extended JSON).
async function mutate(session, op) {
  const collection = op.object?.name;
  if (!collection) throw new Error('No collection is selected.');
  if (op.action === 'insert') return write(session, { action: 'insert', collection, record: fromPlain(op.record || {}) });
  if (op.id === undefined || op.id === null || op.id === '') throw new Error('This document has no identifier.');
  if (op.action === 'delete') return write(session, { action: 'delete', collection, id: op.id });
  const update = {};
  if (op.changes && Object.keys(op.changes).length) update.$set = fromPlain(op.changes);
  if (op.unset?.length) update.$unset = Object.fromEntries(op.unset.map(key => [key, '']));
  if (!Object.keys(update).length) throw new Error('Nothing to update.');
  return write(session, { action: 'update', collection, id: op.id, update });
}

async function discover(session, database) {
  const adminDb = session.client.db('admin');
  let databases = [], message = '';
  try { const listed = await adminDb.admin().listDatabases(); databases = listed.databases.map(d => d.name); }
  catch { message = 'Your account cannot list databases. Showing objects in the configured database.'; }
  const selected = database || session.database;
  const collections = await session.client.db(selected).listCollections({}, { nameOnly: false }).toArray();
  return { databases, schemas: [], objects: collections.map(c => ({ name: c.name, type: 'collection', metadata: c.type || '' })), message };
}

module.exports = { connect, close, query, mutate, switchDatabase, discover, parseCommand, idFilter, plain };
