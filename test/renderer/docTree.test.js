import { describe, expect, it } from 'vitest';
import { addField, convertType, diffDocs, freshKey, removeAt, renameKey, setAt, specialOf, typeOf } from '../../src/renderer/lib/docTree.js';

const doc = { _id: { $oid: 'abc' }, name: 'Asha', age: 30, address: { city: 'Pune', geo: [1, 2] }, tags: ['vip'] };

describe('typeOf / specialOf', () => {
  it('tells JSON types and typed leaves apart', () => {
    expect(typeOf('x')).toBe('string');
    expect(typeOf(3)).toBe('number');
    expect(typeOf(false)).toBe('boolean');
    expect(typeOf(null)).toBe('null');
    expect(typeOf([])).toBe('array');
    expect(typeOf({ a: 1 })).toBe('object');
    expect(typeOf({ $oid: 'abc' })).toBe('special');
  });
  it('recognises Mongo and Firestore typed values', () => {
    expect(specialOf({ $date: '2026-01-01T00:00:00Z' })).toMatchObject({ label: 'Date', field: '$date', editable: true });
    expect(specialOf({ __type: 'timestamp', value: 'x' })).toMatchObject({ label: 'Timestamp', field: 'value' });
    expect(specialOf({ __type: 'geopoint', latitude: 1, longitude: 2 })).toMatchObject({ label: 'GeoPoint', editable: false, display: '1, 2' });
    expect(specialOf({ $oid: 5 })).toBeNull();
    expect(specialOf({ a: 1 })).toBeNull();
  });
});

describe('editing helpers', () => {
  it('sets, removes and adds without touching the original', () => {
    const next = setAt(doc, ['address', 'city'], 'Delhi');
    expect(next.address.city).toBe('Delhi');
    expect(doc.address.city).toBe('Pune');
    expect(removeAt(doc, ['tags', 0]).tags).toEqual([]);
    expect(Object.keys(removeAt(doc, ['age']))).not.toContain('age');
    expect(addField(doc, ['tags'], null, 'beta').tags).toEqual(['vip', 'beta']);
    expect(addField(doc, ['address'], 'zip', '1').address.zip).toBe('1');
  });
  it('renames a field in place and refuses a taken name', () => {
    expect(Object.keys(renameKey(doc, ['name'], 'fullName'))).toEqual(['_id', 'fullName', 'age', 'address', 'tags']);
    expect(renameKey(doc, ['name'], 'age')).toBe(doc);
    expect(renameKey(doc, ['name'], '')).toBe(doc);
  });
  it('makes fresh keys', () => {
    expect(freshKey({ field: 1, field2: 2 })).toBe('field3');
  });
  it('converts between types', () => {
    expect(convertType('42', 'number')).toBe(42);
    expect(convertType('abc', 'number')).toBe(0);
    expect(convertType(5, 'string')).toBe('5');
    expect(convertType('true', 'boolean')).toBe(true);
    expect(convertType({ a: 1 }, 'string')).toBe('{"a":1}');
    expect(convertType('x', 'array')).toEqual([]);
  });
});

describe('diffDocs', () => {
  it('lists added, removed and changed fields with nested paths', () => {
    const edited = { ...doc, age: 31, address: { city: 'Pune', geo: [1, 3], zip: '1' }, tags: ['vip', 'beta'] };
    delete edited.name;
    const changes = diffDocs(doc, edited);
    expect(changes.map(c => [c.kind, c.path])).toEqual([
      ['removed', 'name'],
      ['changed', 'age'],
      ['changed', 'address.geo[1]'],
      ['added', 'address.zip'],
      ['added', 'tags[1]']
    ]);
  });
  it('finds nothing when equal and treats a typed leaf as one value', () => {
    expect(diffDocs(doc, JSON.parse(JSON.stringify(doc)))).toEqual([]);
    expect(diffDocs({ d: { $date: 'a' } }, { d: { $date: 'b' } })).toHaveLength(1);
  });
});
