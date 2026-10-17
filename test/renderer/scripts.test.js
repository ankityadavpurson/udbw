import { describe, expect, it } from 'vitest';
import { assessCommand, assessStatement, splitStatements, statementAt } from '../../src/renderer/lib/sqlScript.js';
import { buildBrowseQuery, canBrowse, DEFAULT_BROWSE } from '../../src/renderer/lib/browse.js';
import { formatSql } from '../../src/renderer/lib/sqlFormat.js';
import { completionContext, suggest } from '../../src/renderer/lib/completions.js';

describe('splitStatements / statementAt', () => {
  const sql = "select 1; -- note; here\nupdate t set a='x;y' where id=1;\n/* c; */ delete from t;\nCREATE FUNCTION f() RETURNS int AS $$ select 1; select 2; $$ LANGUAGE sql;";
  const parts = splitStatements(sql, 'postgres');
  it('splits on semicolons that are real, not in strings, comments or $$ bodies', () => {
    expect(parts).toHaveLength(4);
    expect(parts[1].text).toContain("a='x;y'");
    expect(parts[3].text.startsWith('CREATE FUNCTION')).toBe(true);
  });
  it('skips comment-only parts and trims', () => {
    expect(splitStatements('  -- only a comment\n', 'postgres')).toEqual([]);
    expect(splitStatements('select 1;;  select 2', 'postgres').map(p => p.text)).toEqual(['select 1', 'select 2']);
  });
  it('treats # as a comment in MySQL only', () => {
    expect(splitStatements('select 1 # c;\n; select 2', 'mysql').map(p => p.text)).toEqual(['select 1 # c;', 'select 2']);
  });
  it('finds the statement under the cursor', () => {
    expect(statementAt(parts, 3).text).toBe('select 1');
    expect(statementAt(parts, sql.indexOf('x;y')).text).toContain('update t');
    expect(statementAt(parts, sql.length).text).toContain('CREATE FUNCTION');
    expect(statementAt([], 0)).toBeNull();
  });
});

describe('assessStatement', () => {
  it.each([
    ['select 1', false, 0], ['delete from t', true, 1], ['delete from t where id = 1', true, 0], ['UPDATE t SET a = 1', true, 1], ['drop table x', true, 1],
    ['truncate t', true, 1], ['alter table t drop column a', true, 1], ["select 'delete from t'", false, 0], ['with x as (select 1) delete from t', true, 0],
    ['explain select 1', false, 0], ['  -- c\n insert into t values (1)', true, 0], ['create table t (a int)', true, 0]
  ])('%s -> write %s, %i warning(s)', (sql, write, warnings) => {
    const result = assessStatement(sql, 'postgres');
    expect(result.write).toBe(write);
    expect(result.danger).toHaveLength(warnings);
  });
  it('judges MongoDB / Firestore commands', () => {
    expect(assessCommand('find users')).toEqual({ write: false, danger: [] });
    expect(assessCommand('delete users 5')).toEqual({ write: true, danger: [] });
    expect(assessCommand('db.users.deleteMany({})').danger).toHaveLength(1);
    expect(assessCommand('db.users.deleteMany({a:1})').danger).toHaveLength(0);
  });
});

describe('browse queries', () => {
  const state = { ...DEFAULT_BROWSE, page: 2, pageSize: 100, orderBy: 'created at', orderDir: 'desc', where: "status = 'a';" };
  it('builds one page plus one row, to detect a next page', () => {
    expect(buildBrowseQuery({ type: 'postgres' }, { name: 'users', schema: 'public' }, state)).toBe(`SELECT * FROM "public"."users" WHERE status = 'a' ORDER BY "created at" DESC LIMIT 101 OFFSET 200;`);
    expect(buildBrowseQuery({ type: 'mysql' }, { name: 'us`ers', schema: 'db' }, { ...state, orderBy: '', where: '' })).toBe('SELECT * FROM `db`.`us``ers` LIMIT 101 OFFSET 200;');
    expect(buildBrowseQuery({ type: 'mongodb' }, { name: 'users' }, { ...state, where: '{"a":1}' })).toBe('find users {"a":1} SORT {"created at":-1} SKIP 200 LIMIT 101');
  });
  it('knows what can be browsed', () => {
    expect(canBrowse({ type: 'postgres' }, { type: 'table' })).toBe(true);
    expect(canBrowse({ type: 'postgres' }, { type: 'function' })).toBe(false);
    expect(canBrowse({ type: 'supabase' }, { type: 'table' })).toBe(false);   // REST mode
    expect(canBrowse({ type: 'supabase', connectionString: 'x' }, { type: 'table' })).toBe(true);
    expect(canBrowse({ type: 'firestore' }, { type: 'collection' })).toBe(false);
  });
});

describe('formatSql', () => {
  it('puts clauses on their own lines and capitalises keywords', () => {
    const out = formatSql("select u.id, u.name, count(o.id) as orders from users u left join orders o on o.user_id = u.id and o.status = 'paid' where u.age >= 18 and u.vip = true group by u.id order by orders desc limit 10;", 'postgres');
    expect(out).toBe([
      'SELECT', '  u.id,', '  u.name,', '  count(o.id) AS orders', 'FROM users u',
      "LEFT JOIN orders o ON o.user_id = u.id AND o.status = 'paid'", 'WHERE u.age >= 18', '  AND u.vip = TRUE', 'GROUP BY u.id', 'ORDER BY orders DESC', 'LIMIT 10;'
    ].join('\n'));
  });
  it('does not split BETWEEN ... AND, and indents subqueries', () => {
    expect(formatSql('select * from t where a between 1 and 5 and b = 2', 'postgres')).toContain('WHERE a BETWEEN 1 AND 5\n  AND b = 2');
    expect(formatSql('select * from (select id from a) s', 'postgres')).toBe('SELECT *\nFROM (\n  SELECT id\n  FROM a\n) s');
  });
  it('leaves strings, comments and identifiers called like keywords alone', () => {
    const out = formatSql("select name, 'select from where' from t -- trailing\n", 'postgres');
    expect(out).toContain("'select from where'");
    expect(out).toContain('name');
    expect(out).toContain('-- trailing');
  });
  it('separates statements with a blank line', () => {
    expect(formatSql('delete from t where id=1; update t set a=1', 'postgres')).toBe('DELETE FROM t\nWHERE id = 1;\n\nUPDATE t\nSET\n  a = 1');
  });
});

describe('completions', () => {
  const objects = [
    { name: 'users', schema: 'public', type: 'table', columns: ['id', 'email', 'created_at'] },
    { name: 'orders', schema: 'public', type: 'table' },
    { name: 'fn()', type: 'function' }
  ];
  it('finds the word and qualifier at the caret', () => {
    expect(completionContext('select u.em', 11)).toEqual({ prefix: 'em', start: 9, qualifier: 'u' });
    expect(completionContext('select ', 7)).toEqual({ prefix: '', start: 7, qualifier: null });
  });
  it('suggests tables, then columns of described tables, then keywords', () => {
    const labels = suggest({ text: 'select * from us', caret: 16, language: 'postgres', objects }).items.map(i => i.label);
    expect(labels[0]).toBe('users');
    expect(labels).toContain('USING');
    expect(suggest({ text: 'select em', caret: 9, language: 'postgres', objects }).items[0]).toMatchObject({ label: 'email', kind: 'column' });
  });
  it('resolves aliases to columns, and asks for columns it does not have yet', () => {
    const aliased = suggest({ text: 'select u.e from users u', caret: 10, language: 'postgres', objects });
    expect(aliased.items.map(i => i.label)).toEqual(['email']);
    const unknown = suggest({ text: 'select o. from orders o', caret: 9, language: 'postgres', objects });
    expect(unknown.needColumnsFor.name).toBe('orders');
  });
  it('waits for two characters unless forced', () => {
    expect(suggest({ text: 's', caret: 1, language: 'postgres', objects }).items).toEqual([]);
    expect(suggest({ text: 's', caret: 1, language: 'postgres', objects, force: true }).items.length).toBeGreaterThan(0);
  });
  it('offers command words and collections for command languages', () => {
    const labels = suggest({ text: 'fi', caret: 2, language: 'command', objects: [{ name: 'fish', type: 'collection' }] }).items.map(i => i.label);
    expect(labels).toEqual(['fish', 'find']);
  });
});
