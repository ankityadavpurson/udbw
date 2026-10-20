import { describe, expect, it } from 'vitest';
import { buildBatch, countChanges, describeChanges, emptyPending, previewOp, setCellEdit, toggleDeleted } from '../../src/renderer/lib/gridEdits.js';

const active = { type: 'postgres' };
const object = { name: 'orders', schema: 'public', type: 'table', primaryKey: ['id'] };
const records = [
  { id: '1', status: 'pending', total: '10' },
  { id: '2', status: 'paid', total: '20' },
  { id: '3', status: 'paid', total: '30' }
];

describe('pending changes', () => {
  it('drops an edit when the original value is put back', () => {
    let p = setCellEdit(emptyPending(), 0, 'status', 'shipped', 'pending');
    expect(p.edits[0]).toEqual({ status: 'shipped' });
    p = setCellEdit(p, 0, 'status', 'pending', 'pending');
    expect(p.edits).toEqual({});
  });
  it('toggles deletion of a set of rows', () => {
    let p = toggleDeleted(emptyPending(), [1, 2]);
    expect(p.deleted).toEqual([1, 2]);
    p = toggleDeleted(p, [1, 2]);
    expect(p.deleted).toEqual([]);
  });
  it('counts and describes changes', () => {
    let p = setCellEdit(emptyPending(), 0, 'status', 'x', 'pending');
    p = toggleDeleted(p, [2]);
    p = { ...p, added: [{ id: 'n1', values: { status: 'new' } }] };
    expect(countChanges(p).total).toBe(3);
    expect(describeChanges(p)).toBe('1 edited row, 1 new row, 1 deleted row');
  });
});

describe('buildBatch', () => {
  it('orders updates, deletes, then inserts and sends only changed columns', () => {
    let p = setCellEdit(emptyPending(), 0, 'status', 'shipped', 'pending');
    p = toggleDeleted(p, [2]);
    p = { ...p, added: [{ id: 'n1', values: { status: 'new', total: null } }] };
    const { ops } = buildBatch({ active, object, records, pending: p });
    expect(ops.map(op => op.action)).toEqual(['update', 'delete', 'insert']);
    expect(ops[0]).toMatchObject({ key: { id: '1' }, changes: { status: 'shipped' } });
    expect(ops[1].key).toEqual({ id: '3' });
    expect(ops[2].record).toEqual({ status: 'new', total: null });
  });
  it('skips edits of rows that are also deleted', () => {
    let p = setCellEdit(emptyPending(), 1, 'status', 'x', 'paid');
    p = toggleDeleted(p, [1]);
    expect(buildBatch({ active, object, records, pending: p }).ops.map(op => op.action)).toEqual(['delete']);
  });
  it('refuses an empty new row and a table without a primary key', () => {
    const empty = { ...emptyPending(), added: [{ id: 'n1', values: {} }] };
    expect(buildBatch({ active, object, records, pending: empty }).error).toMatch(/New row 1/);
    const keyless = toggleDeleted(emptyPending(), [0]);
    expect(buildBatch({ active, object: { ...object, primaryKey: [] }, records, pending: keyless }).error).toMatch(/primary key/);
  });
});

describe('previewOp', () => {
  it('quotes identifiers per dialect and escapes values', () => {
    const op = { action: 'update', object: { name: 'orders', schema: 'public' }, key: { id: '1' }, changes: { note: "it's" } };
    expect(previewOp('postgres', op)).toBe(`UPDATE "public"."orders" SET "note" = 'it''s' WHERE "id" = '1';`);
    expect(previewOp('mysql', { action: 'delete', object: { name: 'orders' }, key: { id: null } })).toBe('DELETE FROM `orders` WHERE `id` IS NULL;');
  });
  it('writes inserts with NULL', () => {
    expect(previewOp('postgres', { action: 'insert', object: { name: 't' }, record: { a: null } })).toBe('INSERT INTO "t" ("a") VALUES (NULL);');
  });
});
