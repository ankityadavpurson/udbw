// Shared by the connectors' `info`: the "Database info" dialog shows groups of label / value rows, all as text.

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unit]}`;
}

const formatCount = value => (Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : '');

// Drops rows without a value so a missing detail is not shown as an empty line.
const group = (title, items) => ({ title, items: items.filter(item => item && item.value !== '' && item.value !== null && item.value !== undefined) });

module.exports = { formatBytes, formatCount, group };
