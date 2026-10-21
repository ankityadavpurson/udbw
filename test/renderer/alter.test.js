import { describe, expect, it } from 'vitest';
import { diffStructure, newRow, rowsFromObject, validateStructure } from '../../src/renderer/lib/alter.js';

const object = {
  name: 'users',
  columnInfo: [
    { name: 'id', type: 'integer', nullable: false, defaultValue: null, auto: true },
    { name: 'email', type: 'varchar(255)', nullable: false, defaultValue: null },
    { name: 'age', type: 'integer', nullable: true, defaultValue: '0' }
  ]
};
const run = (rows, newTableName = 'users') => diffStructure({ rows, tableName: 'users', newTableName });
const byName = (rows, name) => rows.find(row => row.original?.name === name);

describe('diffStructure', () => {
  it('has nothing to do for an untouched table', () => expect(run(rowsFromObject(object))).toEqual([]));

  it('lists drops, renames, edits, adds and the table rename in running order', () => {
    const rows = rowsFromObject(object);
    byName(rows, 'age').removed = true;
    Object.assign(byName(rows, 'email'), { name: 'mail', type: 'text', nullable: true, defaultValue: 'none' });
    rows.push({ ...newRow('text'), name: 'bio', defaultValue: 'hi' });
    expect(run(rows, 'people')).toEqual([
      { op: 'drop', name: 'age' },
      { op: 'rename', name: 'email', to: 'mail' },
      { op: 'modify', name: 'mail', type: 'text', nullable: true, defaultValue: 'none' },
      { op: 'add', column: { name: 'bio', type: 'text', nullable: true, defaultValue: 'hi' } },
      { op: 'renameTable', to: 'people' }
    ]);
  });

  it('clearing a default is a change that removes it', () => {
    const rows = rowsFromObject(object);
    byName(rows, 'age').defaultValue = '';
    expect(run(rows)).toEqual([{ op: 'modify', name: 'age', defaultValue: '' }]);
  });
});

describe('validateStructure', () => {
  it('rejects empty and duplicate names and a table with no columns', () => {
    const rows = rowsFromObject(object);
    expect(validateStructure({ rows, newTableName: 'users' })).toBe('');
    expect(validateStructure({ rows, newTableName: ' ' })).toMatch(/needs a name/);
    expect(validateStructure({ rows: [...rows, { ...newRow('text'), name: 'ID' }], newTableName: 'users' })).toMatch(/same name/);
    expect(validateStructure({ rows: [...rows, newRow('text')], newTableName: 'users' })).toMatch(/needs a name/);
    expect(validateStructure({ rows: rows.map(row => ({ ...row, removed: true })), newTableName: 'users' })).toMatch(/at least one/);
  });
});
