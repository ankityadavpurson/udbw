import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { relaxedToJson } = require('../../src/main/connectors/relaxed.js');
const mongo = require('../../src/main/connectors/mongodb.js');
const firestore = require('../../src/main/connectors/firestore.js');
const rest = require('../../src/main/connectors/supabase-rest.js');
const { EJSON } = require('mongodb').BSON;

describe('relaxedToJson', () => {
  it('turns shell-style values into strict Extended JSON', () => {
    const json = relaxedToJson("{status: 'active', n: {$gt: 5,}, id: ObjectId('65a1b2c3d4e5f6a7b8c9d0e1'), d: ISODate('2024-01-01T00:00:00Z'), big: NumberLong(5), re: /ab+c/i}");
    const parsed = JSON.parse(json);
    expect(parsed.status).toBe('active');
    expect(parsed.n).toEqual({ $gt: 5 });
    expect(parsed.id).toEqual({ $oid: '65a1b2c3d4e5f6a7b8c9d0e1' });
    expect(parsed.d).toEqual({ $date: '2024-01-01T00:00:00Z' });
    expect(parsed.big).toEqual({ $numberLong: '5' });
    expect(parsed.re).toEqual({ $regularExpression: { pattern: 'ab+c', options: 'i' } });
  });
  it('leaves strict JSON unchanged and handles quotes', () => {
    expect(JSON.parse(relaxedToJson('{"a":[1,2,{"b":null}]}'))).toEqual({ a: [1, 2, { b: null }] });
    expect(JSON.parse(relaxedToJson(String.raw`{a:'it\'s', q:'say "x"'}`))).toEqual({ a: "it's", q: 'say "x"' });
  });
  it('rejects bare words', () => {
    expect(() => relaxedToJson('{a: hello}')).toThrow(/Unexpected "hello"/);
  });
});

describe('MongoDB commands', () => {
  const parse = mongo.parseCommand;
  it('parses the keyword forms', () => {
    expect(parse('collections')).toEqual({ action: 'collections' });
    expect(parse('find users')).toEqual({ action: 'find', collection: 'users' });
    expect(parse('find users {"age":{"$gt":3}} SORT {"age":-1} SKIP 5 LIMIT 10')).toEqual({
      action: 'find', collection: 'users', filter: { age: { $gt: 3 } }, sort: { age: -1 }, skip: 5, limit: 10
    });
    expect(parse('count users {a:1}')).toEqual({ action: 'count', collection: 'users', filter: { a: 1 } });
    expect(parse('distinct users country {a:1}')).toMatchObject({ action: 'distinct', field: 'country', filter: { a: 1 } });
    expect(parse('aggregate users [{$match:{a:1}}]').pipeline).toEqual([{ $match: { a: 1 } }]);
  });
  it('parses the shell forms, including chained calls', () => {
    expect(parse('db.users.find({name: "x"}, {name: 1}).sort({age: -1}).skip(2).limit(5)')).toMatchObject({
      action: 'find', collection: 'users', filter: { name: 'x' }, projection: { name: 1 }, sort: { age: -1 }, skip: 2, limit: 5
    });
    expect(parse('db.users.countDocuments({a:1})')).toMatchObject({ action: 'count', filter: { a: 1 } });
    expect(parse('db.users.updateMany({a:1},{$set:{b:2}})')).toMatchObject({ action: 'updateMany', filter: { a: 1 }, update: { $set: { b: 2 } } });
    expect(parse('db.users.insertMany([{a:1},{a:2}])').records).toHaveLength(2);
    expect(parse('db.a.b.find().limit(1)')).toMatchObject({ collection: 'a.b', limit: 1 });
  });
  it('decodes ids in the id-based commands', () => {
    expect(parse('update users a%20b {"x":1}')).toMatchObject({ id: 'a b', update: { $set: { x: 1 } } });
    expect(parse('delete users 5')).toEqual({ action: 'delete', collection: 'users', id: '5' });
  });
  it('gives clear errors', () => {
    expect(() => parse('find users garbage')).toThrow(/After the filter use SORT/);
    expect(() => parse('nonsense')).toThrow(/MongoDB commands/);
  });
  it('knows which commands write', () => {
    expect(['find x', 'count x', 'db.x.find()', 'aggregate x [{$match:{}}]'].map(mongo.isWrite)).toEqual([false, false, false, false]);
    expect(['insert x {"a":1}', 'db.x.deleteMany({})', 'aggregate x [{$out:"y"}]', 'delete x 1'].map(mongo.isWrite)).toEqual([true, true, true, true]);
    expect(mongo.isWrite('not a command')).toBe(false);
  });
  it('matches an _id of any stored type', () => {
    const hex = '65a1b2c3d4e5f6a7b8c9d0e1';
    expect(mongo.idFilter(hex)._id.$in.map(String)).toEqual([hex, hex]);
    expect(mongo.idFilter('42')).toEqual({ _id: { $in: ['42', 42] } });
    expect(mongo.idFilter('abc')).toEqual({ _id: 'abc' });
  });
  it('shows documents as relaxed Extended JSON with a plain string _id', () => {
    const { ObjectId } = require('mongodb');
    const doc = mongo.plain({ _id: new ObjectId('65a1b2c3d4e5f6a7b8c9d0e1'), ref: new ObjectId('65a1b2c3d4e5f6a7b8c9d0e2'), d: new Date(0), n: 5 });
    expect(doc._id).toBe('65a1b2c3d4e5f6a7b8c9d0e1');
    expect(doc.ref).toEqual({ $oid: '65a1b2c3d4e5f6a7b8c9d0e2' });
    expect(doc.d).toEqual({ $date: '1970-01-01T00:00:00Z' });
    expect(EJSON.deserialize(doc.ref, { relaxed: true }).toString()).toBe('65a1b2c3d4e5f6a7b8c9d0e2');
  });
});

describe('Firestore commands', () => {
  const parse = firestore.parseCommand;
  it('parses reads with WHERE / ORDER BY / LIMIT / OFFSET', () => {
    expect(parse('read users')).toEqual({ action: 'read', path: 'users', where: [], orderBy: [] });
    expect(parse('read users WHERE age >= 18 AND name == "bob" ORDER BY age DESC LIMIT 5 OFFSET 2')).toEqual({
      action: 'read', path: 'users', limit: 5, offset: 2, orderBy: [{ field: 'age', direction: 'desc' }],
      where: [{ field: 'age', op: '>=', value: 18 }, { field: 'name', op: '==', value: 'bob' }]
    });
    expect(parse('count users WHERE tags array-contains "x"')).toMatchObject({ action: 'count', where: [{ op: 'array-contains', value: 'x' }] });
    expect(parse('read users/abc/orders where total > 5').path).toBe('users/abc/orders');
  });
  it('parses collections, writes and ids', () => {
    expect(parse('collections users/abc')).toEqual({ action: 'collections', path: 'users/abc' });
    expect(parse('create a/b/c x%2Fy {"a":1}')).toEqual({ action: 'insert', collection: 'a/b/c', id: 'x/y', record: { a: 1 } });
    expect(parse('update users id1 {"a":1}')).toMatchObject({ action: 'update', changes: { a: 1 } });
    expect(parse('delete users id1')).toEqual({ action: 'delete', collection: 'users', id: 'id1' });
  });
  it('gives clear errors and knows which commands write', () => {
    expect(() => parse('read users WHERE x ~ 1')).toThrow(/Use one of/);
    expect(() => parse('whatever')).toThrow(/Firestore commands/);
    expect(['read x', 'count x', 'collections'].map(firestore.isWrite)).toEqual([false, false, false]);
    expect(['create x a {"b":1}', 'delete x a'].map(firestore.isWrite)).toEqual([true, true]);
  });
  it('round-trips Firestore types through the { __type } form', () => {
    const admin = require('firebase-admin');
    const ts = admin.firestore.Timestamp.fromMillis(1700000000123);
    const encoded = firestore.encode({ t: ts, g: new admin.firestore.GeoPoint(1, 2), list: [ts], plain: 'x' });
    expect(encoded.t).toEqual({ __type: 'timestamp', value: '2023-11-14T22:13:20.123000000Z' });
    expect(encoded.g).toEqual({ __type: 'geopoint', latitude: 1, longitude: 2 });
    const decoded = firestore.decode(encoded, { doc: path => ({ path }) });
    expect(decoded.t.isEqual(ts)).toBe(true);
    expect(decoded.list[0].isEqual(ts)).toBe(true);
    expect(decoded.g.latitude).toBe(1);
    expect(firestore.decode({ r: { __type: 'reference', path: 'a/b' } }, { doc: path => ({ path }) }).r).toEqual({ path: 'a/b' });
    expect(() => firestore.decode({ t: { __type: 'timestamp', value: 'nope' } }, {})).toThrow(/Invalid timestamp/);
  });
});

describe('Supabase REST commands', () => {
  it('parses reads and writes', () => {
    expect(rest.parseCommand('REST: items LIMIT 5')).toEqual({ action: 'read', table: 'items', limit: 5 });
    expect(rest.parseCommand('REST: items')).toMatchObject({ limit: 100 });
    expect(rest.parseCommand('DELETE items sku=a%20b')).toMatchObject({ action: 'delete', keyColumn: 'sku', id: 'a b' });
    expect(rest.parseCommand('UPDATE items id=5 {"x":1}')).toMatchObject({ action: 'update', id: '5', changes: { x: 1 } });
    expect(() => rest.parseCommand('nope')).toThrow(/REST mode accepts/);
  });
  it('knows which commands write', () => {
    expect(rest.isWrite('REST: items')).toBe(false);
    expect(rest.isWrite('INSERT items {"a":1}')).toBe(true);
  });
});
