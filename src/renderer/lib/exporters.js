import { toRecords } from './results.js';

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(result) {
  if (!result) return;
  download(new Blob([JSON.stringify(toRecords(result), null, 2)], { type: 'application/json' }), 'query-results.json');
}

export function downloadCsv(result) {
  if (!result) return;
  const columns = result.columns || [];
  const canMapRecords = result.json?.length && result.json.every(record => columns.every(column => Object.prototype.hasOwnProperty.call(record, column)));
  const rows = canMapRecords ? result.json.map(record => columns.map(column => record[column])) : (result.rows || []);
  const csv = [columns, ...rows].map(row => row.map(value => {
    const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'query-results.csv');
}

// Resolves true when the text was copied.
export async function copyToClipboard(value) {
  if (value == null) return false;
  try { await navigator.clipboard.writeText(typeof value === 'string' ? value : JSON.stringify(value, null, 2)); return true; }
  catch { return false; }
}
