import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { SECRET_MASK as RENDERER_MASK, SECRET_FIELDS as RENDERER_FIELDS } from '../../src/renderer/constants.js';

const require = createRequire(import.meta.url);
const { safeError, isTransportError, isReadOnlyQuery } = require('../../src/main/errors.js');
const { MASK, SECRET_FIELDS, redactProfile, restoreSecrets } = require('../../src/main/secrets.js');

describe('safeError', () => {
  it('keeps only what the UI needs', () => {
    expect(safeError(Object.assign(new Error('boom'), { code: 'X1', stack: 'secret', extra: 1 }))).toEqual({ message: 'boom', code: 'X1', lost: false, unreachable: false, cancelled: false });
    expect(safeError(Object.assign(new Error('gone'), { lost: true, unreachable: true, cancelled: true }))).toMatchObject({ lost: true, unreachable: true, cancelled: true });
    expect(safeError('plain').message).toBe('plain');
  });
});

describe('isTransportError', () => {
  it('recognises dropped connections', () => {
    expect(isTransportError({ code: 'ECONNRESET' })).toBe(true);
    expect(isTransportError({ code: 'PROTOCOL_CONNECTION_LOST' })).toBe(true);
    expect(isTransportError({ message: 'Client has encountered a connection error and is not queryable' })).toBe(true);
    expect(isTransportError({ code: 14 }, 'firestore')).toBe(true);
    expect(isTransportError({ code: 14 }, 'mysql')).toBe(false);
    expect(isTransportError(new Error('syntax error at or near'))).toBe(false);
  });
});

describe('isReadOnlyQuery (safe to replay)', () => {
  it.each([
    ['select 1', true], ['  SHOW tables;', true], ['find users {}', true], ['count users', true], ['collections', true],
    ['select 1; delete from t', false], ['insert into t values (1)', false], ['with x as (select 1) delete from t', false], ['delete users 1', false]
  ])('%s -> %s', (text, expected) => expect(isReadOnlyQuery(text)).toBe(expected));
});

describe('secrets', () => {
  const profile = { id: 'p', name: 'n', password: 'pw', connectionString: 'postgres://u:pw@h/db', apiKey: '', host: 'h', secretsFrom: 'other' };
  it('masks non-empty secrets only and drops the duplicate pointer', () => {
    expect(redactProfile(profile)).toEqual({ id: 'p', name: 'n', password: MASK, connectionString: MASK, apiKey: '', host: 'h' });
  });
  it('restores masked fields from the stored profile and keeps new values', () => {
    const edited = { ...redactProfile(profile), password: 'new-pw' };
    const restored = restoreSecrets(edited, profile);
    expect(restored.password).toBe('new-pw');
    expect(restored.connectionString).toBe('postgres://u:pw@h/db');
  });
  it('restores nothing when there is no stored profile', () => {
    expect(restoreSecrets({ password: MASK, host: 'h' }, null)).toEqual({ password: '', host: 'h' });
  });
  it('uses the same mask and field list in the renderer', () => {
    expect(RENDERER_MASK).toBe(MASK);
    expect(RENDERER_FIELDS).toEqual(SECRET_FIELDS);
  });
});
