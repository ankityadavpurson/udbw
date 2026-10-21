import { useMemo, useState } from 'react';
import { Button, CopyIcon, EditIcon, Flex, HelperText, Input, Modal, ToggleButton, ToggleButtonGroup, Tooltip } from 'xedonium';
import { columnMarks, indexInfo, splitType } from '../../lib/structure.js';
import { copyToClipboard } from '../../lib/exporters.js';

const TAGS = {
  pk: { text: 'PK', hint: 'Primary key: identifies each row, never empty, never repeated. Needed to edit or delete a row.', style: 'bg-app-strong text-white border-app-strong' },
  unique: { text: 'UQ', hint: 'Unique: no two rows may share this value.', style: 'border-app-strong text-app-strong' },
  indexed: { text: 'IDX', hint: 'Indexed: searches and sorts on this column are faster.', style: 'border-app-border text-app-muted' },
  auto: { text: 'AUTO', hint: 'Filled in by the database (auto-increment, identity or serial) when you leave it out.', style: 'border-app-border text-app-muted' },
  primary: { text: 'PRIMARY', hint: 'The primary key index.', style: 'bg-app-strong text-white border-app-strong' },
  uniqueIndex: { text: 'UNIQUE', hint: 'Unique index: no two rows may have the same value (or combination of values).', style: 'border-app-strong text-app-strong' },
  plain: { text: 'INDEX', hint: 'A plain index: makes searches and sorts on its columns faster.', style: 'border-app-border text-app-muted' }
};

function Tag({ kind, label }) {
  const tag = TAGS[kind];
  return (
    <Tooltip text={tag.hint} placement="top">
      <span className={`inline-flex h-[18px] shrink-0 cursor-help items-center border px-1.5 text-[10px] font-semibold tracking-wider ${tag.style}`}>{label || tag.text}</span>
    </Tooltip>
  );
}

const Stat = ({ children }) => <span className="border border-app-border px-2 py-0.5 text-xs text-app-muted">{children}</span>;

function ColumnsTable({ columns, marks }) {
  if (!columns.length) return <HelperText>No columns match.</HelperText>;
  return (
    <div className="max-h-[22rem] overflow-auto border border-app-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-app-card text-left text-[11px] uppercase tracking-widest text-app-muted">
          <tr>
            <th className="w-10 px-3 py-1.5 font-medium">#</th>
            <th className="px-3 py-1.5 font-medium">Column</th>
            <th className="px-3 py-1.5 font-medium">Type</th>
            <th className="px-3 py-1.5 font-medium">
              <Tooltip text="NULL means the column may be left empty" placement="top">
                <span className="cursor-help">Allows NULL</span>
              </Tooltip>
            </th>
            <th className="px-3 py-1.5 font-medium">Default</th>
          </tr>
        </thead>
        <tbody>
          {columns.map(column => {
            const mark = marks[column.name] || {};
            const type = splitType(column.type);
            return (
              <tr key={column.name} className="border-t border-app-border/60 hover:bg-app-soft/10">
                <td className="px-3 py-1.5 text-xs text-app-muted">{column.position}</td>
                <td className="px-3 py-1.5">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span className="font-mono font-semibold">{column.name}</span>
                    {mark.pk && <Tag kind="pk" />}
                    {!mark.pk && mark.unique && <Tag kind="unique" />}
                    {!mark.pk && !mark.unique && mark.indexed && <Tag kind="indexed" />}
                    {column.auto && <Tag kind="auto" />}
                  </span>
                </td>
                <td className="px-3 py-1.5 font-mono">
                  {type.base}
                  {type.detail && <span className="text-app-muted"> {type.detail}</span>}
                </td>
                <td className="px-3 py-1.5 text-xs">{column.nullable ? <span className="text-app-muted">yes</span> : <span className="font-semibold">no</span>}</td>
                <td className="max-w-[14rem] px-3 py-1.5 font-mono text-xs text-app-muted">
                  <Tooltip text={column.defaultValue === null || column.defaultValue === undefined ? '' : String(column.defaultValue)} onlyIfTruncated className="max-w-full">
                    <span className="block max-w-full truncate">{column.defaultValue === null || column.defaultValue === undefined ? '—' : String(column.defaultValue)}</span>
                  </Tooltip>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IndexList({ indexes }) {
  if (!indexes.length) return <HelperText>No indexes reported.</HelperText>;
  return (
    <ul className="max-h-[22rem] space-y-2 overflow-auto">
      {indexes.map(index => (
        <li key={index.name} className="border border-app-border p-3">
          <Flex gap={2} align="center" wrap>
            <span className="font-mono text-sm font-semibold">{index.name}</span>
            <Tag kind={index.primary ? 'primary' : index.unique ? 'uniqueIndex' : 'plain'} />
            {index.method && <span className="text-[11px] uppercase tracking-wider text-app-muted">{index.method}</span>}
          </Flex>
          {index.columns.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {index.columns.map((name, i) => (
                <span key={`${name}-${i}`} className="inline-flex items-center gap-1 border border-app-border px-1.5 py-0.5 font-mono text-xs">
                  <span className="text-[10px] text-app-muted">{i + 1}</span>
                  {name}
                </span>
              ))}
            </div>
          )}
          {index.definition && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-app-muted">Definition</summary>
              <code className="mt-1 block break-all text-xs text-app-muted">{index.definition}</code>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

// Columns and indexes of the opened table (read by describe when the table was opened).
export default function StructureDialog({ open, onClose, object, onEdit }) {
  const [view, setView] = useState('columns');
  const [filter, setFilter] = useState('');
  const [copied, setCopied] = useState(false);

  const primaryKey = object?.primaryKey || [];
  const columns = useMemo(() => (object?.columnInfo || []).map((column, i) => ({ ...column, position: i + 1 })), [object]);
  const indexes = useMemo(() => (object?.indexes || []).map(index => indexInfo(index, primaryKey)), [object]);
  const marks = useMemo(() => columnMarks(columns, primaryKey, object?.indexes || []), [columns, object]);
  const needle = filter.trim().toLowerCase();
  const shown = needle ? columns.filter(column => `${column.name} ${column.type}`.toLowerCase().includes(needle)) : columns;

  async function copyNames() {
    if (await copyToClipboard(columns.map(column => column.name).join(', '))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Structure · ${object?.name || ''}`}
      maxWidth="max-w-4xl"
      footer={
        <Flex justify="between" align="center" gap={3} wrap>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-app-muted" aria-label="Legend">
            <span className="inline-flex items-center gap-1.5">
              <Tag kind="pk" /> primary key
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Tag kind="unique" /> unique
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Tag kind="indexed" /> indexed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Tag kind="auto" /> filled in by the database
            </span>
            <span>NULL = may be left empty</span>
          </div>
          <Flex gap={2}>
            {onEdit && (
              <Button
                variant="secondary"
                tooltip="Add, remove or rename columns, change types and defaults"
                onClick={() => {
                  onClose();
                  onEdit(object);
                }}
              >
                <EditIcon /> Edit structure
              </Button>
            )}
            <Button onClick={onClose}>Close</Button>
          </Flex>
        </Flex>
      }
    >
      <div className="space-y-3 p-5">
        <Flex gap={2} wrap align="center">
          <Stat>
            {columns.length} column{columns.length === 1 ? '' : 's'}
          </Stat>
          <Stat>
            {indexes.length} index{indexes.length === 1 ? '' : 'es'}
          </Stat>
          {primaryKey.length ? (
            <Stat>
              Primary key: <span className="font-mono text-app-text">{primaryKey.join(', ')}</span>
            </Stat>
          ) : (
            <Stat>No primary key, so rows cannot be edited or deleted here</Stat>
          )}
        </Flex>

        <Flex gap={2} wrap align="center" justify="between" className="compact-buttons compact-fields">
          <Flex gap={2} align="center">
            <ToggleButtonGroup exclusive aria-label="Structure view" value={view} onChange={value => value && setView(value)}>
              <ToggleButton value="columns">Columns ({columns.length})</ToggleButton>
              <ToggleButton value="indexes">Indexes ({indexes.length})</ToggleButton>
            </ToggleButtonGroup>
            {view === 'columns' && columns.length > 8 && (
              <div className="w-56">
                <Input value={filter} onChange={setFilter} placeholder="Filter columns" aria-label="Filter columns" />
              </div>
            )}
          </Flex>
          {view === 'columns' && (
            <Button variant="secondary" tooltip="Copy every column name, comma separated" onClick={copyNames}>
              <CopyIcon /> {copied ? 'Copied' : 'Copy names'}
            </Button>
          )}
        </Flex>

        {view === 'columns' ? <ColumnsTable columns={shown} marks={marks} /> : <IndexList indexes={indexes} />}
      </div>
    </Modal>
  );
}
