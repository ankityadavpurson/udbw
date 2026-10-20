import { describe, expect, it } from 'vitest';
import { rowsToCsv } from '../../src/renderer/lib/exporters.js';

const result = {
  columns: ['id', 'name', 'note'],
  rows: [
    ['1', 'Asha', null],
    ['2', 'Liam "L" Chen', 'line one, two'],
    ['3', 'Noor', 'x']
  ]
};

describe('rowsToCsv', () => {
  it('copies only the chosen rows, with the column names first', () => {
    expect(rowsToCsv(result, [0, 2])).toBe('"id","name","note"\r\n"1","Asha",""\r\n"3","Noor","x"');
  });
  it('quotes commas and doubles quotes', () => {
    expect(rowsToCsv(result, [1]).split('\r\n')[1]).toBe('"2","Liam ""L"" Chen","line one, two"');
  });
  it('has no byte-order mark, so it pastes cleanly', () => {
    expect(rowsToCsv(result, [0]).charCodeAt(0)).not.toBe(0xfeff);
  });
  it('flattens documents to one column per field', () => {
    const docs = { columns: ['_id', 'document'], json: [{ _id: 'a', name: 'x', tags: ['t'] }], rows: [['a', '{}']] };
    expect(rowsToCsv(docs, [0])).toBe('"_id","name","tags"\r\n"a","x","[""t""]"');
  });
});
