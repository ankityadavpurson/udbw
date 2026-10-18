import { afterEach, describe, expect, it, vi } from 'vitest';
import { autoView, isDocumentResult, recordAt, summarizeDocument, toRecords, toTable } from '../../src/renderer/lib/results.js';
import { exportFileName, exportResult } from '../../src/renderer/lib/exporters.js';
import { buildXlsx } from '../../src/renderer/lib/xlsx.js';
import tokenizeQuery, { languageFor } from '../../src/renderer/lib/tokenize.js';
import { validateForSave, validateForTest } from '../../src/renderer/lib/validation.js';

const sqlResult = {
  columns: ['id', 'name'],
  rows: [
    ['1', 'Ann'],
    ['2', null]
  ]
};
const documentResult = {
  columns: ['_id', 'document'],
  json: [
    { _id: 'a', name: 'x', nested: { k: 1 } },
    { _id: 'b', other: true }
  ],
  rows: []
};

describe('results', () => {
  it('recognises document results and picks a view', () => {
    expect(isDocumentResult(documentResult)).toBe(true);
    expect(isDocumentResult(sqlResult)).toBe(false);
    expect(autoView(documentResult)).toBe('json');
    expect(autoView(sqlResult)).toBe('table');
  });
  it('builds records from rows on demand', () => {
    expect(recordAt(sqlResult, 1)).toEqual({ id: '2', name: null });
    expect(toRecords(sqlResult)).toEqual([
      { id: '1', name: 'Ann' },
      { id: '2', name: null }
    ]);
    expect(toRecords(documentResult)).toBe(documentResult.json);
    expect(recordAt(sqlResult, 9)).toBeUndefined();
  });
  it('flattens documents into columns, ids first', () => {
    const table = toTable(documentResult);
    expect(table.columns).toEqual(['_id', 'name', 'nested', 'other']);
    expect(table.rows[0]).toEqual(['a', 'x', { k: 1 }, undefined]);
  });
  it('summarises a document by its most recognisable scalars', () => {
    expect(summarizeDocument({ _id: '1', zeta: 1, name: 'Ann', email: 'a@b', nested: {} }, 2)).toEqual([
      ['name', 'Ann'],
      ['email', 'a@b']
    ]);
  });
});

describe('exports', () => {
  afterEach(() => {
    delete globalThis.window;
  });
  const capture = () => {
    const saveFile = vi.fn(async () => ({ ok: true, saved: true, path: 'C:/x' }));
    globalThis.window = { workbench: { saveFile } };
    return saveFile;
  };
  const tab = { title: 'Query 1', selectedObject: { name: 'users', schema: 'public' }, result: sqlResult };

  it('names files after the table and the time', () => {
    expect(exportFileName(tab, 'csv')).toMatch(/^users_\d{4}-\d{2}-\d{2}_\d{4}\.csv$/);
    expect(exportFileName({ title: 'Weird / name?' }, 'json')).toMatch(/^Weird_name_/);
  });
  it('writes CSV with a BOM, CRLF, escaped quotes and empty NULLs', async () => {
    const saveFile = capture();
    await exportResult('csv', { ...tab, result: { columns: ['a', 'b'], rows: [['say "hi"', null]] } }, { type: 'postgres' });
    const { text, defaultName } = saveFile.mock.calls[0][0];
    expect(text).toBe('\ufeff"a","b"\r\n"say ""hi""",""');
    expect(defaultName.endsWith('.csv')).toBe(true);
  });
  it('writes SQL INSERTs with the right quoting and NULLs', async () => {
    const saveFile = capture();
    await exportResult('sql', tab, { type: 'mysql' });
    expect(saveFile.mock.calls[0][0].text).toBe(
      "INSERT INTO `public`.`users` (`id`, `name`) VALUES ('1', 'Ann');\nINSERT INTO `public`.`users` (`id`, `name`) VALUES ('2', NULL);\n"
    );
    expect(await exportResult('sql', { ...tab, result: documentResult }, { type: 'mongodb' })).toMatch(/only available for table/);
  });
  it('writes JSON records and an .xlsx workbook', async () => {
    const saveFile = capture();
    await exportResult('json', tab, { type: 'postgres' });
    expect(JSON.parse(saveFile.mock.calls[0][0].text)).toEqual([
      { id: '1', name: 'Ann' },
      { id: '2', name: null }
    ]);
    await exportResult('xlsx', tab, { type: 'postgres' });
    expect(Buffer.from(saveFile.mock.calls[1][0].base64, 'base64').subarray(0, 2).toString()).toBe('PK');
  });
  it('reports a cancelled save and nothing to export', async () => {
    globalThis.window = { workbench: { saveFile: async () => ({ ok: true, saved: false }) } };
    expect(await exportResult('csv', tab, {})).toBe('Export cancelled.');
    expect(await exportResult('csv', { result: null }, {})).toMatch(/nothing to export/);
  });
});

describe('buildXlsx', () => {
  // Reads the stored (uncompressed) entries of a zip file: { name: text }.
  function unzip(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const files = {};
    let at = 0;
    while (view.getUint32(at, true) === 0x04034b50) {
      const size = view.getUint32(at + 18, true);
      const nameLength = view.getUint16(at + 26, true);
      const name = Buffer.from(bytes.subarray(at + 30, at + 30 + nameLength)).toString();
      files[name] = Buffer.from(bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size)).toString();
      at += 30 + nameLength + size;
    }
    expect(view.getUint32(at, true)).toBe(0x02014b50); // the central directory follows
    return files;
  }
  it('produces a zip with the parts Excel expects', () => {
    const files = unzip(
      buildXlsx(
        ['id', 'name'],
        [
          ['1', 'Ann <a&b>'],
          ['2.5', null]
        ],
        'My: sheet'
      )
    );
    expect(Object.keys(files)).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']);
    expect(files['xl/workbook.xml']).toContain('name="My  sheet"');
    const sheet = files['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('<c r="A2"><v>1</v></c>'); // numbers stay numbers
    expect(sheet).toContain('Ann &lt;a&amp;b&gt;'); // text is escaped
    expect(sheet).toContain('<c r="A3"><v>2.5</v></c>');
    expect(sheet).not.toContain('r="B3"'); // NULL leaves the cell empty
    expect(sheet).toContain('t="inlineStr" s="1"'); // bold header
  });
  it('keeps numbers with leading zeros as text and names columns past Z', () => {
    const columns = Array.from({ length: 28 }, (_, i) => `c${i}`);
    const sheet = unzip(buildXlsx(columns, [['007', ...Array(27).fill('x')]]))['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('<c r="A2" t="inlineStr"');
    expect(sheet).toContain('r="AB2"');
  });
});

describe('tokenizer', () => {
  const kinds = (code, language) =>
    tokenizeQuery(code, language)[0]
      .filter(t => t.kind)
      .map(t => `${t.kind}:${t.text.trim()}`);
  it('highlights SQL keywords, strings, numbers and functions', () => {
    expect(kinds("select count(1), 'x' from t", 'postgres')).toEqual(['keyword:select', 'fn:count', 'number:1', "string:'x'", 'keyword:from']);
  });
  it('treats # as a comment in MySQL but not in PostgreSQL', () => {
    expect(kinds('a # b', 'mysql')).toEqual(['comment:# b']);
    expect(kinds('a # b', 'postgres')).toEqual([]);
  });
  it('highlights command languages', () => {
    expect(kinds('find users {"age": 5} LIMIT 10', 'command')).toEqual(['keyword:find', 'tag:users', 'attr:"age"', 'number:5', 'keyword:LIMIT', 'number:10']);
  });
  it('picks the language from the connection', () => {
    expect(languageFor(null)).toBe('mysql');
    expect(languageFor({ type: 'postgres' })).toBe('postgres');
    expect(languageFor({ type: 'mongodb' })).toBe('command');
    expect(languageFor({ type: 'supabase' })).toBe('command');
    expect(languageFor({ type: 'supabase', connectionString: 'x' })).toBe('postgres');
  });
});

describe('validation', () => {
  const base = {
    name: 'n',
    type: 'postgres',
    host: 'h',
    port: '5432',
    database: 'd',
    username: 'u',
    connectionString: '',
    uri: '',
    restUrl: '',
    apiKey: '',
    serviceAccountPath: '',
    sshEnabled: false
  };
  it('accepts a complete profile', () => {
    expect(validateForTest(base)).toBe('');
    expect(validateForSave(base)).toBe('');
  });
  it('asks for what is missing', () => {
    expect(validateForTest({ ...base, name: ' ' })).toMatch(/connection name/);
    expect(validateForTest({ ...base, host: '' })).toMatch(/host, port, database/);
    expect(validateForTest({ ...base, port: '70000' })).toMatch(/port/);
    expect(validateForTest({ ...base, type: 'mongodb' })).toMatch(/MongoDB/);
    expect(validateForTest({ ...base, type: 'firestore' })).toMatch(/service-account/);
    expect(validateForSave({ ...base, type: 'supabase' })).toMatch(/connection string/);
  });
  it('checks SSH details when the tunnel is on', () => {
    const ssh = { ...base, sshEnabled: true, sshHost: 'b', sshUsername: 'u', sshPort: '22', sshAuthMethod: 'password', sshPassword: '' };
    expect(validateForTest(ssh)).toMatch(/SSH/);
    expect(validateForTest({ ...ssh, sshPassword: 'x' })).toBe('');
  });
});
