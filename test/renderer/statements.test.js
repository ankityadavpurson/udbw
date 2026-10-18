import { describe, expect, it } from 'vitest';
import { buildDocumentUpdate, buildRecordOp, canEditRecord, inferObject, selectStatement } from '../../src/renderer/lib/statements.js';

const mysql = { type: 'mysql' };
const postgres = { type: 'postgres' };
const mongo = { type: 'mongodb' };
const firestore = { type: 'firestore' };
const rest = { type: 'supabase' };
const table = { name: 'users', schema: 'public', primaryKey: ['id'] };

describe('selectStatement', () => {
  it('quotes identifiers per engine', () => {
    expect(selectStatement(mysql, { name: 'we`ird' })).toBe('SELECT * FROM `we``ird` LIMIT 100;');
    expect(selectStatement(postgres, { name: 'users', schema: 'public' })).toBe('SELECT * FROM "public"."users" LIMIT 100;');
    expect(selectStatement(mongo, { name: 'users' })).toBe('find users LIMIT 100');
    expect(selectStatement(firestore, { name: 'users' })).toBe('read users LIMIT 100');
    expect(selectStatement(rest, { name: 'items' })).toBe('REST: items LIMIT 100');
    expect(selectStatement(postgres, { type: 'function', oid: 42 })).toBe('SELECT pg_get_functiondef(42);');
  });
});

describe('canEditRecord', () => {
  it('needs every primary key column for SQL, nothing for document stores', () => {
    expect(canEditRecord(postgres, table, { id: '1' })).toBe(true);
    expect(canEditRecord(postgres, table, { name: 'x' })).toBe(false);
    expect(canEditRecord(postgres, { name: 't' }, { id: '1' })).toBe(false);
    expect(canEditRecord(mongo, null, {})).toBe(true);
  });
});

describe('buildRecordOp (SQL)', () => {
  const row = { id: '1', name: null, age: '5' };
  it('sends only changed fields, so untouched NULLs are never rewritten', () => {
    const { op } = buildRecordOp({ active: mysql, object: table, action: 'edit', record: { ...row, age: '6' }, selectedJson: row });
    expect(op).toEqual({ action: 'update', object: { name: 'users', schema: 'public' }, key: { id: '1' }, changes: { age: '6' } });
  });
  it('refuses an edit that changes nothing, or a table without a key', () => {
    expect(buildRecordOp({ active: mysql, object: table, action: 'edit', record: row, selectedJson: row }).error).toMatch(/Change at least one/);
    expect(buildRecordOp({ active: mysql, object: { name: 't' }, action: 'delete', record: {}, selectedJson: row }).error).toMatch(/primary key/);
  });
  it('builds inserts and deletes', () => {
    expect(buildRecordOp({ active: mysql, object: table, action: 'insert', record: { name: 'x' }, selectedJson: null }).op).toMatchObject({
      action: 'insert',
      record: { name: 'x' }
    });
    expect(buildRecordOp({ active: mysql, object: table, action: 'insert', record: {}, selectedJson: null }).error).toMatch(/at least one field/);
    expect(buildRecordOp({ active: mysql, object: table, action: 'delete', record: {}, selectedJson: row }).op).toMatchObject({ action: 'delete', key: { id: '1' } });
  });
});

describe('buildRecordOp (documents and REST)', () => {
  it('updates a MongoDB document with only the changes and removed keys', () => {
    const doc = { _id: 'a1', keep: 1, change: 'x', gone: true };
    const { op } = buildRecordOp({ active: mongo, object: { name: 'c' }, action: 'edit', record: { _id: 'a1', keep: 1, change: 'y' }, selectedJson: doc });
    expect(op).toEqual({ action: 'update', object: { name: 'c', schema: undefined }, id: 'a1', changes: { change: 'y' }, unset: ['gone'] });
  });
  it('treats an unchanged document as a no-op', () => {
    expect(buildDocumentUpdate({ active: mongo, object: { name: 'c' }, doc: { _id: 'a', x: 1 }, edited: { _id: 'a', x: 1 } })).toEqual({ noChange: true });
  });
  it('protects the identifier', () => {
    expect(buildDocumentUpdate({ active: mongo, object: { name: 'c' }, doc: { _id: 'a' }, edited: { _id: 'b' } }).error).toMatch(/cannot be changed/);
    expect(buildDocumentUpdate({ active: mongo, object: { name: 'c' }, doc: {}, edited: { x: 1 } }).error).toMatch(/no identifier/);
  });
  it('splits the id off a Firestore insert', () => {
    expect(buildRecordOp({ active: firestore, object: { name: 'c' }, action: 'insert', record: { id: 'abc', a: 1 }, selectedJson: null }).op).toMatchObject({
      id: 'abc',
      record: { a: 1 }
    });
  });
  it('uses the table primary key for REST, not a fixed "id"', () => {
    const object = { name: 'items', primaryKey: ['sku'] };
    expect(buildRecordOp({ active: rest, object, action: 'delete', record: {}, selectedJson: { sku: 'x y' } }).op).toMatchObject({ keyColumn: 'sku', id: 'x y' });
    expect(buildRecordOp({ active: rest, object, action: 'edit', record: { sku: 'x', n: 2 }, selectedJson: { sku: 'x', n: 1 } }).op).toMatchObject({
      keyColumn: 'sku',
      changes: { n: 2 }
    });
  });
});

describe('inferObject', () => {
  it.each([
    [mongo, 'find users', 'users'],
    [mongo, 'find users {a:1} LIMIT 5', 'users'],
    [mongo, 'db.users.find({a:1})', 'users'],
    [mongo, 'db.a.b.find()', 'a.b'],
    [firestore, 'read users LIMIT 3', 'users'],
    [rest, 'REST: items LIMIT 5', 'items']
  ])('%o %s', (active, query, name) => expect(inferObject(active, query)?.name).toBe(name));
  it('returns null for other text and engines', () => {
    expect(inferObject(mongo, 'collections')).toBeNull();
    expect(inferObject(mysql, 'select 1')).toBeNull();
  });
});
