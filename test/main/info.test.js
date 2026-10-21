import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { formatBytes, formatCount, group } = require('../../src/main/connectors/info.js');

describe('database info helpers', () => {
  it('formats sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(32768)).toBe('32.0 KiB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MiB');
    expect(formatBytes(300 * 1024 ** 3)).toBe('300 GiB');
    expect(formatBytes('x')).toBe('');
    expect(formatBytes(-1)).toBe('');
  });

  it('formats counts', () => {
    expect(formatCount(1234567)).toBe('1,234,567');
    expect(formatCount('2')).toBe('2');
    expect(formatCount(null)).toBe('0');
    expect(formatCount(undefined)).toBe('');
  });

  it('leaves out rows that have no value', () => {
    const rows = group('Details', [
      { label: 'A', value: 'x' },
      { label: 'B', value: '' },
      { label: 'C', value: undefined },
      { label: 'D', value: '0' }
    ]);
    expect(rows.items.map(item => item.label)).toEqual(['A', 'D']);
  });
});
