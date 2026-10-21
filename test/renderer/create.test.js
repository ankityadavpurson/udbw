import { describe, expect, it } from 'vitest';
import { blankCreate, buildCreateSpec, createKinds, validateCreate } from '../../src/renderer/lib/create.js';

const pg = { type: 'postgres' };
const mongo = { type: 'mongodb' };
const firestore = { type: 'firestore' };

describe('createKinds', () => {
  it('lists what each engine can create', () => {
    expect(createKinds({ type: 'mysql' })).toEqual(['database', 'table']);
    expect(createKinds(pg)).toEqual(['database', 'schema', 'table']);
    expect(createKinds({ type: 'supabase', connectionString: 'postgres://x' })).toEqual(['schema', 'table']);
    expect(createKinds({ type: 'supabase' })).toEqual([]);
    expect(createKinds(mongo)).toEqual(['database', 'collection']);
    expect(createKinds(firestore)).toEqual(['collection']);
    expect(createKinds(null)).toEqual([]);
  });
});

describe('validateCreate', () => {
  it('needs a name', () => expect(validateCreate(pg, blankCreate(pg, 'database'))).toMatch(/name/));

  it('needs a first collection for a new MongoDB database', () => {
    const values = { ...blankCreate(mongo, 'database'), name: 'shop' };
    expect(validateCreate(mongo, values)).toMatch(/first collection/);
    expect(validateCreate(mongo, { ...values, collection: 'orders' })).toBe('');
  });

  it('needs a JSON object for the first Firestore document', () => {
    const values = { ...blankCreate(firestore, 'collection'), name: 'users' };
    expect(validateCreate(firestore, values)).toBe('');
    expect(validateCreate(firestore, { ...values, documentText: '[1]' })).toMatch(/JSON object/);
    expect(validateCreate(firestore, { ...values, documentText: '{' })).toMatch(/JSON object/);
  });

  it('checks the columns of a table', () => {
    const values = { ...blankCreate(pg, 'table'), name: 't' };
    expect(validateCreate(pg, values)).toBe('');
    expect(validateCreate(pg, { ...values, columns: [] })).toMatch(/at least one/);
    expect(validateCreate(pg, { ...values, columns: [...values.columns, { ...values.columns[0], name: 'ID' }] })).toMatch(/same name/);
    expect(validateCreate(pg, { ...values, columns: [{ ...values.columns[0], name: '' }] })).toMatch(/needs a name/);
  });
});

describe('buildCreateSpec', () => {
  it('builds the payload for each kind', () => {
    expect(buildCreateSpec(pg, { ...blankCreate(pg, 'database'), name: ' app ' })).toEqual({ kind: 'database', name: 'app' });
    expect(buildCreateSpec(mongo, { ...blankCreate(mongo, 'database'), name: 'shop', collection: 'orders' })).toEqual({ kind: 'database', name: 'shop', collection: 'orders' });
    expect(buildCreateSpec(firestore, { ...blankCreate(firestore, 'collection'), name: 'users', documentText: '{"a":1}' })).toEqual({
      kind: 'collection',
      name: 'users',
      id: undefined,
      document: { a: 1 }
    });
    const table = buildCreateSpec(pg, { ...blankCreate(pg, 'table'), name: 't', schema: 'sales' });
    expect(table.schema).toBe('sales');
    expect(table.columns[0]).toMatchObject({ name: 'id', primaryKey: true, nullable: false, autoIncrement: true });
  });
});
