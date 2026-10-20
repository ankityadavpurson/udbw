import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, Table } from 'xedonium';

const MAX_COLUMNS = 12;
const MAX_DEPTH = 3; // deeper levels fall back to JSON text

const isNested = value => value !== null && typeof value === 'object';

// SQL drivers hand JSON columns over as text, so '{"a":1}' is shown as a sub table too.
function asNested(value) {
  if (isNested(value)) return value;
  if (typeof value !== 'string' || value.length > 50000) return null;
  const text = value.trim();
  if (!((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']')))) return null;
  try {
    const parsed = JSON.parse(text);
    return isNested(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Sort / copy value for a cell that may hold nested data.
export const plainText = value => (value === null ? 'NULL' : value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));

function subTable(nested) {
  if (Array.isArray(nested)) {
    if (nested.length && nested.every(item => isNested(item) && !Array.isArray(item))) {
      const keys = [];
      for (const item of nested) for (const key of Object.keys(item)) if (!keys.includes(key)) keys.push(key);
      const columns = keys.slice(0, MAX_COLUMNS);
      return { columns, rows: nested.map((item, i) => ({ __k: String(i), ...item })) };
    }
    return { columns: ['value'], rows: nested.map((item, i) => ({ __k: String(i), value: item })) };
  }
  const entries = Object.entries(nested);
  // A small flat object reads best as one row with its keys as headers.
  if (entries.length <= 6 && entries.every(([, value]) => !isNested(value))) return { columns: entries.map(([key]) => key), rows: [{ __k: '0', ...nested }] };
  return { columns: ['key', 'value'], rows: entries.map(([key, value]) => ({ __k: key, key, value })) };
}

const compact = 'text-xs [&_td]:!px-2 [&_td]:!py-1 [&_th]:!px-2 [&_th]:!py-1 [&_th]:!text-[11px]';

// A cell value. Primitives are plain text; objects and arrays become a small table that can be folded.
export default function NestedValue({ value, depth = 0 }) {
  const nested = depth < MAX_DEPTH ? asNested(value) : null;
  const count = nested ? Object.keys(nested).length : 0;
  const [open, setOpen] = useState(false);

  if (value === null) return <span className="text-app-muted">NULL</span>;
  if (!nested) return <span>{plainText(value)}</span>;
  if (!count) return <span className="text-app-muted">{Array.isArray(nested) ? '[ ]' : '{ }'}</span>;

  const { columns, rows } = subTable(nested);
  const label = Array.isArray(nested) ? `[ ] ${count} item${count === 1 ? '' : 's'}` : `{ } ${count} field${count === 1 ? '' : 's'}`;
  return (
    <div className="min-w-[10rem]">
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1 text-xs text-app-muted hover:text-app-text">
        <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{open ? <ChevronDownIcon /> : <ChevronRightIcon />}</span>
        {label}
      </button>
      {open && (
        <div className="mt-1">
          <Table
            className={compact}
            rowKey="__k"
            empty="empty"
            rows={rows}
            columns={columns.map(column => ({ key: column, header: column, render: row => <NestedValue value={row[column]} depth={depth + 1} /> }))}
          />
        </div>
      )}
    </div>
  );
}
