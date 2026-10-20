import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { maskSql, sqlIsWrite, capSql } = require('../../src/main/sqlText.js');
const { buildSqlMutation, normalizeSqlResult, normalizePgResult, serializeValue } = require('../../src/main/connectors/sql.js');

describe('maskSql', () => {
  it('blanks comments and quoted text but keeps the length', () => {
    const sql = 'select \'a;b\', "c;d" -- x;y\nfrom t /* z; */';
    const masked = maskSql(sql, 'postgres');
    expect(masked).toHaveLength(sql.length);
    expect(masked).not.toMatch(/[;]/);
    expect(masked).toMatch(/^select\s+,\s+\n\s*from t/);
  });
  it('treats # as a comment only for MySQL', () => {
    expect(maskSql('select 1 # note', 'mysql').trim()).toBe('select 1');
    expect(maskSql('select 1 # note', 'postgres')).toContain('# note');
  });
  it('hides dollar-quoted bodies in PostgreSQL', () => {
    expect(maskSql('do $$ select 1; select 2; $$', 'postgres')).not.toContain(';');
  });
});

describe('sqlIsWrite', () => {
  it.each([
    ['select 1', false],
    ['  -- hi\n select * from t', false],
    ['show tables', false],
    ['explain select 1', false],
    ['with x as (select 1) select * from x', false],
    ["select ';' as semi", false],
    ['select 1;', false],
    ['insert into t values (1)', true],
    ['delete from t', true],
    ['drop table t', true],
    ['select 1; delete from t', true],
    ['select * into copy from t', true],
    ['set role admin', true],
    ['', false]
  ])('%s -> %s', (sql, expected) => expect(sqlIsWrite(sql, 'postgres')).toBe(expected));
});

describe('capSql', () => {
  it('adds a LIMIT to a plain select, without the trailing semicolon', () => {
    expect(capSql('select * from t;', 'postgres', 100)).toBe('select * from t\nLIMIT 101');
    expect(capSql('-- c\nselect a from t order by a', 'mysql', 10)).toBe('-- c\nselect a from t order by a\nLIMIT 11');
  });
  it.each([
    'select * from t limit 5',
    'select * from t offset 5',
    'select 1; select 2',
    'with x as (select 1) select * from x',
    'select * from a union select * from b',
    'select * from t for update',
    'insert into t values (1)',
    'select * into x from t'
  ])('leaves %s alone', sql => expect(capSql(sql, 'postgres', 100)).toBeNull());
  it('ignores the word limit inside a string', () => {
    expect(capSql("select 'limit' from t", 'postgres', 5)).toBe("select 'limit' from t\nLIMIT 6");
  });
});

describe('buildSqlMutation', () => {
  it('builds a parameterized MySQL update with quoted identifiers and IS NULL keys', () => {
    const { sql, params } = buildSqlMutation('mysql', {
      action: 'update',
      object: { name: 't`x', schema: 'db' },
      changes: { a: "o'x", b: { z: 1 }, c: null },
      key: { id: '1', k2: null }
    });
    expect(sql).toBe('UPDATE `db`.`t``x` SET `a` = ?, `b` = ?, `c` = ? WHERE `id` = ? AND `k2` IS NULL');
    expect(params).toEqual(["o'x", '{"z":1}', null, '1']);
  });
  it('numbers PostgreSQL placeholders in order', () => {
    const { sql, params } = buildSqlMutation('postgres', { action: 'update', object: { name: 't', schema: 'public' }, changes: { a: 1 }, key: { id: 'x', k: null, z: 'q' } });
    expect(sql).toBe('UPDATE "public"."t" SET "a" = $1 WHERE "id" = $2 AND "k" IS NULL AND "z" = $3');
    expect(params).toEqual([1, 'x', 'q']);
  });
  it('never puts values in the SQL text', () => {
    const { sql, params } = buildSqlMutation('postgres', { action: 'insert', object: { name: 't' }, record: { a: "'; drop table t;--" } });
    expect(sql).toBe('INSERT INTO "t" ("a") VALUES ($1)');
    expect(params).toEqual(["'; drop table t;--"]);
  });
  it('refuses unsafe operations', () => {
    expect(() => buildSqlMutation('mysql', { action: 'delete', object: { name: 't' }, key: {} })).toThrow(/primary key/);
    expect(() => buildSqlMutation('mysql', { action: 'update', object: { name: 't' }, changes: {}, key: { id: 1 } })).toThrow(/Change at least one/);
    expect(() => buildSqlMutation('mysql', { action: 'insert', object: { name: 't' }, record: {} })).toThrow(/at least one field/);
    expect(() => buildSqlMutation('mysql', { action: 'insert', object: {}, record: { a: 1 } })).toThrow(/No table/);
  });
});

describe('result shaping', () => {
  it('keeps real nulls and serializes other values to text', () => {
    expect(serializeValue(null)).toBeNull();
    expect(serializeValue(undefined)).toBe('');
    expect(serializeValue(5)).toBe('5');
    expect(serializeValue(new Date(0))).toBe('1970-01-01T00:00:00.000Z');
    expect(serializeValue(Buffer.from('hi'))).toBe('base64:aGk=');
    expect(serializeValue({ a: 1 })).toBe('{"a":1}');
  });
  it('caps rows and reports truncation (MySQL arrays)', () => {
    const result = normalizeSqlResult(
      [
        [1, 'a'],
        [2, 'b'],
        [3, 'c']
      ],
      [{ name: 'id' }, { name: 'n' }],
      2
    );
    expect(result).toMatchObject({ columns: ['id', 'n'], rowCount: 2, truncated: true, maxRows: 2 });
    expect(result.rows).toEqual([
      ['1', 'a'],
      ['2', 'b']
    ]);
    expect(result.json).toBeUndefined(); // rows are sent once
  });
  it('describes write results (MySQL header)', () => {
    expect(normalizeSqlResult({ affectedRows: 3 }, undefined, 10)).toMatchObject({ rowCount: 3, message: '3 row(s) affected' });
  });
  it('uses the last result of a multi-statement PostgreSQL query', () => {
    const first = { fields: [{ name: 'a' }], rows: [[1]], rowCount: 1, command: 'SELECT' };
    const second = { fields: [{ name: 'b' }], rows: [['x'], ['y']], rowCount: 2, command: 'SELECT' };
    expect(normalizePgResult([first, second], 10)).toMatchObject({ columns: ['b'], rows: [['x'], ['y']], truncated: false });
    expect(normalizePgResult({ fields: [], rows: [], rowCount: 4, command: 'DELETE' }, 10).message).toBe('DELETE · 4 row(s)');
  });
});

describe('applyBatch', () => {
  const { applyBatch } = require('../../src/main/connectors/sql.js');
  const driver = (affected = [], log = []) => ({
    dialect: 'postgres',
    begin: async () => log.push('begin'),
    run: async sql => {
      log.push(sql);
      return affected.length ? affected.shift() : 1;
    },
    commit: async () => log.push('commit'),
    rollback: async () => log.push('rollback')
  });
  const ops = [
    { action: 'update', object: { name: 't' }, key: { id: 1 }, changes: { a: 'x' } },
    { action: 'insert', object: { name: 't' }, record: { a: 'y' } }
  ];

  it('commits every change in one transaction', async () => {
    const log = [];
    const result = await applyBatch(ops, driver([], log));
    expect(log[0]).toBe('begin');
    expect(log.at(-1)).toBe('commit');
    expect(result.message).toBe('Inserted 1, Updated 1 row(s) in one transaction');
  });
  it('rolls back when an update touches no row', async () => {
    const log = [];
    await expect(applyBatch(ops, driver([0], log))).rejects.toThrow(/Change 1 \(update\) affected 0 rows/);
    expect(log).toContain('rollback');
    expect(log).not.toContain('commit');
  });
  it('rolls back when a statement fails', async () => {
    const log = [];
    const failing = {
      ...driver([], log),
      run: async () => {
        throw new Error('boom');
      }
    };
    await expect(applyBatch(ops, failing)).rejects.toThrow('boom');
    expect(log).toEqual(['begin', 'rollback']);
  });
  it('rejects an empty batch before opening a transaction', async () => {
    const log = [];
    await expect(applyBatch([], driver([], log))).rejects.toThrow(/no changes/);
    expect(log).toEqual([]);
  });
});
