const { relaxedToJson, closingParen, readString } = require('./relaxed');

const HARD_LIMIT = 100000;

// The driver is loaded on first use to keep app start-up light.
const driver = () => require('mongodb');
const ejson = () => driver().BSON.EJSON;
const parseEjson = text => ejson().parse(relaxedToJson(text), { relaxed: true });
const fromPlain = value => ejson().deserialize(value, { relaxed: true });

// Ids inside text commands are percent-encoded by the UI so spaces and symbols survive; typed plain ids work too.
function decodeId(value) {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

// Matches a document by _id whatever its stored type: ObjectId, string or number.
function idFilter(value) {
  const { ObjectId } = driver();
  const text = String(value);
  if (/^[a-f\d]{24}$/i.test(text)) return { _id: { $in: [new ObjectId(text), text] } };
  if (/^-?\d+(\.\d+)?$/.test(text)) return { _id: { $in: [text, Number(text)] } };
  return { _id: text };
}

// A filter written with a plain _id string also matches an ObjectId.
function withIdMatch(filter) {
  return typeof filter?._id === 'string' ? { ...filter, ...idFilter(filter._id) } : filter;
}

// Documents are shown as relaxed Extended JSON ({"$oid": …}, {"$date": …}) so editing and cloning keep BSON types;
// the top-level _id stays a plain string because it identifies the row.
function plain(doc) {
  const { ObjectId } = driver();
  const out = JSON.parse(ejson().stringify(doc, { relaxed: true }));
  if (doc && doc._id !== undefined && (doc._id instanceof ObjectId || typeof doc._id !== 'object')) out._id = String(doc._id);
  return out;
}

function docResult(docs, message, rowCount, extra = {}) {
  const json = docs.map(plain);
  return { json, columns: ['_id', 'document'], rows: json.map(d => [String(d._id ?? ''), JSON.stringify(d)]), rowCount, message, ...extra };
}

// ---- command parsing -------------------------------------------------------------------------------------------

// Reads one { … } or [ … ] value starting at `pos` (strings are skipped). Returns the end index.
function balancedEnd(text, pos) {
  const open = text[pos];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = pos; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      i = readString(text, i).end - 1;
      continue;
    }
    if (ch === open || ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return ch === close ? i + 1 : -1;
    }
  }
  return -1;
}

// Keyword form: find <coll> [filter] [SORT {…}] [PROJECT {…}] [SKIP n] [LIMIT n], count <coll> [filter],
// aggregate <coll> [pipeline], distinct <coll> <field> [filter].
function parseKeywordRead(verb, text) {
  const head = /^\w+\s+([a-zA-Z0-9_.-]+)\s*/.exec(text);
  if (!head) throw new Error(`Usage: ${verb} <collection> …`);
  const out = { action: verb, collection: head[1] };
  let rest = text.slice(head[0].length);
  if (verb === 'distinct') {
    const field = /^("[^"]+"|'[^']+'|\S+)\s*/.exec(rest);
    if (!field) throw new Error('Usage: distinct <collection> <field> [filter]');
    out.field = field[1].replace(/^["']|["']$/g, '');
    rest = rest.slice(field[0].length);
  }
  let pos = 0;
  const skipSpace = () => {
    while (/\s/.test(rest[pos] || '')) pos++;
  };
  const readValue = () => {
    skipSpace();
    if (rest[pos] !== '{' && rest[pos] !== '[') throw new Error('Expected a { } or [ ] value.');
    const end = balancedEnd(rest, pos);
    if (end === -1) throw new Error('Unbalanced brackets in the command.');
    const value = parseEjson(rest.slice(pos, end));
    pos = end;
    return value;
  };
  skipSpace();
  if (verb === 'aggregate') {
    out.pipeline = rest[pos] === '[' ? readValue() : [];
    skipSpace();
    if (pos < rest.length) throw new Error(`Unexpected "${rest.slice(pos)}".`);
    return out;
  }
  if (rest[pos] === '{') out.filter = readValue();
  if (verb === 'find') {
    while (true) {
      skipSpace();
      if (pos >= rest.length) break;
      const kw = /^(SORT|PROJECT|PROJECTION|SKIP|LIMIT)\b\s*/i.exec(rest.slice(pos));
      if (!kw) throw new Error(`Unexpected "${rest.slice(pos).split(/\s/)[0]}". After the filter use SORT, PROJECT, SKIP or LIMIT.`);
      pos += kw[0].length;
      const word = kw[1].toUpperCase();
      if (word === 'SORT') out.sort = readValue();
      else if (word.startsWith('PROJECT')) out.projection = readValue();
      else {
        const num = /^\d+/.exec(rest.slice(pos));
        if (!num) throw new Error(`${word} needs a number.`);
        pos += num[0].length;
        out[word.toLowerCase()] = Number(num[0]);
      }
    }
  } else {
    skipSpace();
    if (pos < rest.length) throw new Error(`Unexpected "${rest.slice(pos)}".`);
  }
  return out;
}

// Shell form: db.<coll>.find({…}, {…}).sort({…}).skip(n).limit(n), .countDocuments, .aggregate, .distinct,
// .insertOne / .insertMany / .updateOne / .updateMany / .deleteOne / .deleteMany.
function parseShell(text) {
  const head = /^db\.([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*?)\.(\w+)\s*\(/.exec(text);
  if (!head) throw new Error('Shell commands look like db.collection.find({ … }).');
  const calls = [];
  let pos = head[0].length - 1;
  let name = head[2];
  while (true) {
    const close = closingParen(text, pos);
    const inner = text.slice(pos + 1, close).trim();
    calls.push({ name, args: inner ? EJSON_ARRAY(inner) : [] });
    pos = close + 1;
    const next = /^\s*\.(\w+)\s*\(/.exec(text.slice(pos));
    if (!next) break;
    name = next[1];
    pos += next[0].length - 1;
  }
  if (text.slice(pos).trim()) throw new Error(`Unexpected "${text.slice(pos).trim()}".`);
  const [main, ...chain] = calls;
  const collection = head[1];
  const arg = i => main.args[i];
  const out = { collection };
  switch (main.name) {
    case 'find':
    case 'findOne':
      Object.assign(out, { action: 'find', filter: arg(0) || {}, projection: arg(1) });
      if (main.name === 'findOne') out.limit = 1;
      for (const call of chain) {
        if (call.name === 'sort') out.sort = call.args[0];
        else if (call.name === 'skip') out.skip = Number(call.args[0]);
        else if (call.name === 'limit') out.limit = Number(call.args[0]);
        else if (call.name === 'project' || call.name === 'projection') out.projection = call.args[0];
        else throw new Error(`.${call.name}() is not supported after find().`);
      }
      return out;
    case 'countDocuments':
    case 'count':
      return { ...out, action: 'count', filter: arg(0) || {} };
    case 'aggregate':
      return { ...out, action: 'aggregate', pipeline: Array.isArray(arg(0)) ? arg(0) : main.args };
    case 'distinct':
      return { ...out, action: 'distinct', field: String(arg(0)), filter: arg(1) || {} };
    case 'insertOne':
      return { ...out, action: 'insertMany', records: [arg(0)] };
    case 'insertMany':
      return { ...out, action: 'insertMany', records: arg(0) };
    case 'updateOne':
    case 'updateMany':
      return { ...out, action: main.name === 'updateOne' ? 'updateOne' : 'updateMany', filter: arg(0) || {}, update: arg(1) };
    case 'deleteOne':
    case 'deleteMany':
      return { ...out, action: main.name === 'deleteOne' ? 'deleteOne' : 'deleteMany', filter: arg(0) || {} };
    default:
      throw new Error(`db.${collection}.${main.name}() is not supported.`);
  }
}
const EJSON_ARRAY = args => parseEjson(`[${args}]`);

const HELP =
  'MongoDB commands: "collections", find <coll> {filter} SORT {…} SKIP n LIMIT n, count <coll>, aggregate <coll> [ … ], distinct <coll> <field>, or db.<coll>.find({…}).';

function parseCommand(query) {
  const text = query.trim().replace(/;\s*$/, '');
  if (/^collections$/i.test(text)) return { action: 'collections' };
  if (/^db\./.test(text)) return parseShell(text);
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
  const verb = /^(find|count|aggregate|distinct)\b/i.exec(text);
  if (verb) return parseKeywordRead(verb[1].toLowerCase(), text);
  throw new Error(HELP);
}

const WRITES = new Set(['insert', 'update', 'delete', 'insertMany', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany']);
function isWrite(text) {
  try {
    const parsed = parseCommand(text);
    if (WRITES.has(parsed.action)) return true;
    return parsed.action === 'aggregate' && (parsed.pipeline || []).some(stage => stage && ('$out' in stage || '$merge' in stage));
  } catch (_) {
    return false;
  } // an unparseable command runs nothing
}

// ---- execution -------------------------------------------------------------------------------------------------

async function connect(dial) {
  const { MongoClient } = driver();
  const client = new MongoClient(dial.uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  try {
    const dbName = dial.database || new URL(dial.uri.replace('mongodb+srv://', 'https://').replace('mongodb://', 'http://')).pathname.replace('/', '') || 'admin';
    const session = { type: 'mongodb', client, database: dial.database || dbName };
    await client.db(session.database).command({ ping: 1 });
    return session;
  } catch (err) {
    await client.close().catch(() => {});
    throw err;
  }
}

async function close(session) {
  if (session.client) await session.client.close();
}

function switchDatabase(session, database) {
  session.database = database;
}

// Aborts the read in flight (the driver stops waiting and asks the server to kill the operation).
async function cancel(session) {
  if (!session.abort) return false;
  session.abort.abort();
  return true;
}

// Writes: { action, collection, … } with BSON values already built.
async function write(session, command) {
  const collection = session.client.db(session.database).collection(command.collection);
  const counts = (n, what, rowCount = n) => ({ json: [], columns: [], rows: [], rowCount, message: `${what} ${n} document(s)` });
  switch (command.action) {
    case 'insert': {
      const doc = { ...command.record };
      await collection.insertOne(doc);
      return docResult([doc], 'Inserted 1 document', 1);
    }
    case 'insertMany': {
      if (!command.records?.length) throw new Error('Nothing to insert.');
      const res = await collection.insertMany(command.records.map(r => ({ ...r })));
      return counts(res.insertedCount, 'Inserted');
    }
    case 'update': {
      const filter = idFilter(command.id);
      const updated = await collection.updateOne(filter, command.update);
      const docs = await collection.find(filter).limit(1).toArray();
      return docResult(docs, `Updated ${updated.modifiedCount} document(s)`, updated.modifiedCount);
    }
    case 'updateOne':
    case 'updateMany': {
      if (!command.update) throw new Error('An update document is required.');
      const update = Object.keys(command.update).some(key => key.startsWith('$')) ? command.update : { $set: command.update };
      const res = await collection[command.action](withIdMatch(command.filter), update);
      return counts(res.modifiedCount, 'Updated');
    }
    case 'deleteOne':
    case 'deleteMany': {
      const res = await collection[command.action](withIdMatch(command.filter));
      return counts(res.deletedCount, 'Deleted');
    }
    default: {
      const deleted = await collection.deleteOne(idFilter(command.id));
      return counts(deleted.deletedCount, 'Deleted');
    }
  }
}

async function query(session, text, { maxRows = 1000 } = {}) {
  const parsed = parseCommand(text);
  const db = session.client.db(session.database);
  if (parsed.action === 'collections') {
    const names = await db.listCollections({}, { nameOnly: true }).toArray();
    return { json: names, columns: ['name'], rows: names.map(x => [x.name]), message: `${names.length} collections` };
  }
  const collection = parsed.collection && db.collection(parsed.collection);
  const controller = new AbortController();
  const { signal } = controller;
  session.abort = WRITES.has(parsed.action) ? null : controller; // a write cannot be stopped half-way
  try {
    return await read(session, parsed, collection, signal, maxRows);
  } finally {
    if (session.abort === controller) session.abort = null;
  }
}

async function read(session, parsed, collection, signal, maxRows) {
  if (parsed.action === 'find') {
    const limit = Math.min(parsed.limit ?? maxRows, HARD_LIMIT);
    let cursor = collection.find(withIdMatch(parsed.filter || {}), { signal, ...(parsed.projection ? { projection: parsed.projection } : {}) });
    if (parsed.sort) cursor = cursor.sort(parsed.sort);
    if (parsed.skip) cursor = cursor.skip(parsed.skip);
    const docs = await cursor.limit(limit).toArray();
    return docResult(docs, `${docs.length} documents`, docs.length, { truncated: parsed.limit === undefined && docs.length === limit, maxRows });
  }
  if (parsed.action === 'count') {
    const n = await collection.countDocuments(withIdMatch(parsed.filter || {}), { signal });
    return { columns: ['count'], rows: [[String(n)]], rowCount: 1, message: `${n} matching documents` };
  }
  if (parsed.action === 'distinct') {
    const values = await collection.distinct(parsed.field, withIdMatch(parsed.filter || {}), { signal });
    const shown = values.slice(0, maxRows).map(v => (v !== null && typeof v === 'object' ? JSON.stringify(JSON.parse(ejson().stringify(v, { relaxed: true }))) : String(v)));
    return { columns: [parsed.field], rows: shown.map(v => [v]), rowCount: shown.length, truncated: values.length > maxRows, maxRows, message: `${values.length} distinct values` };
  }
  if (parsed.action === 'aggregate') {
    const writes = parsed.pipeline.some(stage => stage && ('$out' in stage || '$merge' in stage));
    const pipeline = writes ? parsed.pipeline : [...parsed.pipeline, { $limit: maxRows + 1 }];
    const docs = await collection.aggregate(pipeline, { allowDiskUse: true, signal }).toArray();
    if (writes) return { json: [], columns: [], rows: [], rowCount: 0, message: 'Aggregation written' };
    const truncated = docs.length > maxRows;
    return docResult(truncated ? docs.slice(0, maxRows) : docs, `${Math.min(docs.length, maxRows)} documents`, Math.min(docs.length, maxRows), { truncated, maxRows });
  }
  return write(session, parsed);
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
  let databases = [],
    message = '';
  try {
    const listed = await adminDb.admin().listDatabases();
    databases = listed.databases.map(d => d.name);
  } catch {
    message = 'Your account cannot list databases. Showing objects in the configured database.';
  }
  const selected = database || session.database;
  const collections = await session.client.db(selected).listCollections({}, { nameOnly: false }).toArray();
  return { databases, schemas: [], objects: collections.map(c => ({ name: c.name, type: 'collection', metadata: c.type || '' })), message };
}

module.exports = { connect, close, query, cancel, mutate, switchDatabase, discover, isWrite, parseCommand, idFilter, plain };
