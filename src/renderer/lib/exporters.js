import { isDocumentResult, toRecords, toTable } from './results.js';
import { buildXlsx } from './xlsx.js';

export const EXPORT_FORMATS = [
  { key: 'json', label: 'Export JSON' },
  { key: 'csv', label: 'Export CSV' },
  { key: 'xlsx', label: 'Export Excel (.xlsx)' },
  { key: 'sql', label: 'Export SQL INSERTs' }
];

const text = value => (value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));

// "users_2024-05-01_1530.csv": the table or tab name plus a timestamp, safe for any file system.
export function exportFileName(tab, extension) {
  const base = (tab?.selectedObject?.name || tab?.title || 'query-results').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'query-results';
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${base}_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.${extension}`;
}

function toCsv(result) {
  const { columns, rows } = toTable(result);
  const lines = [columns, ...rows].map(row => row.map(value => `"${text(value).replace(/"/g, '""')}"`).join(','));
  // The byte-order mark makes Excel read the file as UTF-8 instead of guessing a legacy code page.
  return `\uFEFF${lines.join('\r\n')}`;
}

function toSqlInserts(result, tab, active) {
  const quote = active?.type === 'mysql' ? name => `\`${String(name).replace(/`/g, '``')}\`` : name => `"${String(name).replace(/"/g, '""')}"`;
  const object = tab?.selectedObject;
  const table = object?.name ? `${object.schema ? `${quote(object.schema)}.` : ''}${quote(object.name)}` : quote('table_name');
  const { columns, rows } = toTable(result);
  const literal = value => (value === null || value === undefined ? 'NULL' : `'${text(value).replace(/'/g, "''")}'`);
  const list = columns.map(quote).join(', ');
  return `${rows.map(row => `INSERT INTO ${table} (${list}) VALUES (${row.map(literal).join(', ')});`).join('\n')}\n`;
}

// Builds the chosen format and lets the user pick where to save it. Resolves a short message for the status line.
export async function exportResult(format, tab, active) {
  const result = tab?.result;
  if (!result) return 'There is nothing to export.';
  if (format === 'sql' && isDocumentResult(result)) return 'SQL export is only available for table results.';
  let payload;
  let filter;
  if (format === 'json') { payload = { text: JSON.stringify(toRecords(result), null, 2) }; filter = { name: 'JSON', extensions: ['json'] }; }
  else if (format === 'csv') { payload = { text: toCsv(result) }; filter = { name: 'CSV', extensions: ['csv'] }; }
  else if (format === 'sql') { payload = { text: toSqlInserts(result, tab, active) }; filter = { name: 'SQL', extensions: ['sql'] }; }
  else if (format === 'xlsx') {
    const { columns, rows } = toTable(result);
    const bytes = buildXlsx(columns, rows, tab.selectedObject?.name || tab.title || 'Results');
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    payload = { base64: btoa(binary) };
    filter = { name: 'Excel workbook', extensions: ['xlsx'] };
  } else return 'Unknown export format.';
  const res = await window.workbench.saveFile({ defaultName: exportFileName(tab, format), filters: [filter], ...payload });
  if (!res.ok) return `Export failed: ${res.error?.message || 'unknown error'}`;
  return res.saved ? `Exported to ${res.path}` : 'Export cancelled.';
}

// Resolves true when the text was copied.
export async function copyToClipboard(value) {
  if (value == null) return false;
  try { await navigator.clipboard.writeText(typeof value === 'string' ? value : JSON.stringify(value, null, 2)); return true; }
  catch { return false; }
}
