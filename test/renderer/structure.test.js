import { describe, expect, it } from 'vitest';
import { columnMarks, indexInfo, splitType } from '../../src/renderer/lib/structure.js';

describe('indexInfo', () => {
  it('reads MySQL indexes as they come', () => {
    expect(indexInfo({ name: 'PRIMARY', unique: true, columns: ['id'] })).toMatchObject({ primary: true, unique: true, columns: ['id'] });
    expect(indexInfo({ name: 'by_name', unique: false, columns: ['name', 'city'] })).toMatchObject({ primary: false, unique: false, columns: ['name', 'city'] });
  });
  it('parses a PostgreSQL definition', () => {
    const info = indexInfo({ name: 'orders_pkey', definition: 'CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id)' }, ['id']);
    expect(info).toMatchObject({ primary: true, unique: true, columns: ['id'], method: 'btree' });
    expect(indexInfo({ name: 'idx', definition: 'CREATE INDEX idx ON t USING gin ("Tags" jsonb_path_ops, name DESC)' })).toMatchObject({
      unique: false,
      columns: ['Tags', 'name'],
      method: 'gin'
    });
  });
});

describe('columnMarks', () => {
  it('marks keys, unique and plain indexed columns', () => {
    const marks = columnMarks(
      [{ name: 'id' }, { name: 'email' }, { name: 'city' }, { name: 'note' }],
      ['id'],
      [
        { name: 'PRIMARY', unique: true, columns: ['id'] },
        { name: 'email_uq', unique: true, columns: ['email'] },
        { name: 'city_idx', unique: false, columns: ['city'] }
      ]
    );
    expect(marks.id).toMatchObject({ pk: true, unique: false, indexed: false });
    expect(marks.email).toMatchObject({ pk: false, unique: true, indexes: ['email_uq'] });
    expect(marks.city).toMatchObject({ indexed: true });
    expect(marks.note).toMatchObject({ pk: false, unique: false, indexed: false, indexes: [] });
  });
});

describe('splitType', () => {
  it('separates the type name from its size and modifiers', () => {
    expect(splitType('varchar(100)')).toEqual({ base: 'varchar', detail: '(100)' });
    expect(splitType('int unsigned')).toEqual({ base: 'int', detail: 'unsigned' });
    expect(splitType('timestamp')).toEqual({ base: 'timestamp', detail: '' });
    expect(splitType('character varying(50)')).toEqual({ base: 'character varying', detail: '(50)' });
  });
});
