import { useEffect, useState } from 'react';
import {
  ActionMenu,
  Alert,
  Button,
  Card,
  Chip,
  CodeDisplay,
  CopyIcon,
  DataGrid,
  Divider,
  DownloadIcon,
  EditIcon,
  EyeIcon,
  Flex,
  HelperText,
  Input,
  ListIcon,
  Loader,
  PlusIcon,
  RefreshIcon,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Trash2Icon
} from 'xedonium';
import { engines } from '../../constants.js';
import { EXPORT_FORMATS } from '../../lib/exporters.js';
import ResizableHeader from './ResizableHeader.jsx';
import { isDocumentResult, toRecords, toTable } from '../../lib/results.js';
import BrowseBar from './BrowseBar.jsx';
import DocumentList from './DocumentList.jsx';
import StructureDialog from '../dialogs/StructureDialog.jsx';
import Logo from '../Logo.jsx';
import NestedValue, { plainText } from './NestedValue.jsx';
import CellEditor from './CellEditor.jsx';
import PendingChangesBar from './PendingChangesBar.jsx';

const MAX_LOAD = 100000;
const MAX_RENDERED_ROWS = 100; // the grid pages rows client-side, so a big browse page never renders every row at once

export default function ResultsPanel({
  tab,
  status,
  records,
  gridEdits,
  onDocumentDirty,
  isConnected,
  busy,
  readOnly,
  language,
  onViewChange,
  onSelect,
  onRerun,
  onCopyRows,
  onExport,
  onLoadMore,
  onBrowse
}) {
  const { result, error, view, meta, selected } = tab;
  const [structureOpen, setStructureOpen] = useState(false);
  const object = tab.selectedObject;
  const hasStructure = Boolean(object?.columnInfo?.length);
  // Only show the loader for queries that take a moment, so quick ones don't flash.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!tab.running) {
      setSlow(false);
      return undefined;
    }
    const timer = setTimeout(() => setSlow(true), 250);
    return () => clearTimeout(timer);
  }, [tab.running]);
  const { hasSelection, selectedCount, selectedDocs, selectedJson, canEditSelected, canDeleteSelected, openEditor, setViewerOpen, setBulkOpen } = records;

  const table = toTable(result);
  // Column widths the user dragged; a new result (other tab or other columns) starts fresh.
  const [widths, setWidths] = useState({});
  const columnsKey = table.columns.join('|');
  // Search over the loaded rows, in every column or in just one.
  const [search, setSearch] = useState({ column: '', text: '' });
  useEffect(() => {
    setWidths({});
    setSearch({ column: '', text: '' });
  }, [tab.id, columnsKey]);
  // Browse mode: the toolbar drives the tab's own query, so it only shows while the query is still the generated one.
  const browsing = Boolean(tab.browse && tab.query === tab.browse.generated);
  const browseColumns = tab.selectedObject?.columns?.length ? tab.selectedObject.columns : table.columns.filter(column => column !== 'document');
  const nextMax = Math.min((result?.maxRows || 1000) * 5, MAX_LOAD);
  const limitNote =
    result?.truncated && !tab.running ? (
      <div className="px-2 pt-2">
        <Alert tone="info" title={`Showing the first ${(result.rowCount ?? result.rows?.length ?? 0).toLocaleString()} rows`}>
          <Flex gap={2} align="center" wrap>
            <span>There are more. Narrow the query, or load a bigger slice.</span>
            {(result.maxRows || 1000) < MAX_LOAD && (
              <span className="compact-buttons">
                <Button variant="secondary" disabled={busy} onClick={() => onLoadMore(nextMax)}>
                  Load up to {nextMax.toLocaleString()}
                </Button>
              </span>
            )}
          </Flex>
        </Alert>
      </div>
    ) : null;
  const copyCell = value => onCopyRows(typeof value === 'object' && value !== null ? value : plainText(value));
  // Inline editing: only for a table opened from the sidebar whose rows can be located by primary key.
  const inline = Boolean(gridEdits?.editable && browsing && !readOnly && isConnected);
  const keyColumns = tab.selectedObject?.primaryKey || [];
  const [cellEditing, setCellEditing] = useState(null); // { key, column }
  const columns = table.columns.map((column, j) => ({
    key: `c${j}`,
    sortable: true,
    accessor: row => plainText(row[`c${j}`]),
    width: widths[`c${j}`],
    header: <ResizableHeader label={column} onResize={width => setWidths(all => ({ ...all, [`c${j}`]: width }))} />,
    // Double-click a cell to copy its value, or to edit it when the table can be edited in place.
    render: row => {
      const editing = inline && cellEditing && cellEditing.key === row.__i && cellEditing.column === column;
      const locked = !inline || row.__deleted || keyColumns.includes(column);
      const dirty = row.__dirty?.has(column) || (row.__new && row[`c${j}`] !== undefined);
      if (editing)
        return (
          <CellEditor
            value={row[`c${j}`]}
            label={`Edit ${column}`}
            onCommit={value => {
              setCellEditing(null);
              gridEdits.setCell(row.__i, column, value);
            }}
            onCancel={() => setCellEditing(null)}
          />
        );
      const startEdit = () => !locked && setCellEditing({ key: row.__i, column });
      return (
        <div
          className={`max-w-[26rem] [overflow-wrap:anywhere] ${dirty ? 'bg-app-strong/20 shadow-[inset_0_0_0_1px_rgb(var(--color-app-strong))]' : ''} ${row.__deleted ? 'text-app-muted line-through' : ''}`}
          style={widths[`c${j}`] ? { maxWidth: widths[`c${j}`] - 24 } : undefined}
          title={locked ? 'Double-click or press Ctrl+C to copy' : 'Double-click or press F2 to edit · Ctrl+C to copy'}
          tabIndex={0}
          onDoubleClick={() => (locked ? copyCell(row[`c${j}`]) : startEdit())}
          onKeyDown={e => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
              e.preventDefault();
              copyCell(row[`c${j}`]);
            } else if (e.key === 'F2' || (e.key === 'Enter' && !locked)) {
              e.preventDefault();
              startEdit();
            }
          }}
        >
          {row.__new && row[`c${j}`] === undefined ? <span className="text-app-muted">default</span> : <NestedValue value={row[`c${j}`]} />}
          {row.__dirty?.has(column) && (
            <span className="ml-1 inline-block max-w-[10rem] truncate align-bottom text-[11px] text-app-muted" title={`Original value: ${plainText(row.__original?.[column])}`}>
              was {plainText(row.__original?.[column])}
            </span>
          )}
        </div>
      );
    }
  }));
  const searchIndex = table.columns.indexOf(search.column);
  const needle = search.text.trim().toLowerCase();
  const pendingEdits = inline ? gridEdits.pending : null;
  const existingRows = table.rows
    .map((row, index) => {
      const changes = pendingEdits?.edits[index];
      const values = changes ? row.map((value, j) => (table.columns[j] in changes ? changes[table.columns[j]] : value)) : row;
      const record = Object.fromEntries([['__i', index], ...values.map((value, j) => [`c${j}`, value])]);
      if (changes) {
        record.__dirty = new Set(Object.keys(changes));
        record.__original = Object.fromEntries(table.columns.map((column, j) => [column, row[j]]));
      }
      if (pendingEdits?.deleted.includes(index)) record.__deleted = true;
      return record;
    })
    .filter(
      row => !needle || (searchIndex >= 0 ? [row[`c${searchIndex}`]] : table.columns.map((_, j) => row[`c${j}`])).some(value => plainText(value).toLowerCase().includes(needle))
    );
  // New rows come first; a column the user has not filled in is left out of the INSERT so the database default applies.
  const newRows = (pendingEdits?.added || []).map(added => ({
    __i: added.id,
    __new: true,
    ...Object.fromEntries(table.columns.map((column, j) => [`c${j}`, added.values[column]]))
  }));
  const rows = [...newRows, ...existingRows];

  const body = () => {
    if (slow)
      return (
        <Stack className="items-center px-6 py-14">
          <Loader variant="stacked" size="md" label="Running query…" />
        </Stack>
      );
    if (error)
      return (
        <div className="p-4" role="alert">
          <Alert tone="danger" title={meta === 'Connection failed' ? 'Connection failed' : 'Query failed'}>
            <span className="whitespace-pre-wrap">{error}</span>
          </Alert>
        </div>
      );
    if (!result)
      return (
        <Stack gap={3} className="flex-1 items-center justify-center px-6 py-14 text-center">
          <Logo className="h-12 w-12" />
          <h2 className="text-lg font-semibold">Your databases, one workspace</h2>
          <HelperText>Create a connection, connect, then browse an object or run a query.</HelperText>
          <Flex gap={2} wrap justify="center">
            {Object.values(engines).map(x => (
              <Chip key={x.label}>{x.label}</Chip>
            ))}
          </Flex>
        </Stack>
      );
    if (view === 'json' && isDocumentResult(result))
      return (
        <DocumentList
          documents={result.json}
          canEdit={Boolean(records.selectedObject) && isConnected && !readOnly}
          onUpdate={records.updateDocument}
          onClone={records.cloneDocument}
          onDelete={records.deleteDocument}
          onInsert={() => records.openEditor('insert')}
          onDirtyChange={onDocumentDirty}
        />
      );
    if (view === 'json')
      return (
        <div className="py-2">
          <CodeDisplay
            language="json"
            code={JSON.stringify(table.columns.length || result.json ? toRecords(result) : { message: result.message }, null, 2)}
            maxHeight="70vh"
            lineNumbers
            copyable
          />
        </div>
      );
    if (!columns.length)
      return (
        <Stack gap={1} className="px-6 py-10 text-center">
          <h2 className="text-base font-semibold">{result.message || 'Command completed'}</h2>
          <HelperText>No tabular rows returned.</HelperText>
        </Stack>
      );
    return (
      <Stack gap={2} className="py-2">
        <Flex gap={2} wrap align="center" className="compact-buttons px-2">
          <Button
            variant="secondary"
            disabled={readOnly || !records.selectedObject || !['table', 'collection'].includes(records.selectedObject.type)}
            onClick={() => (inline ? gridEdits.addRow() : openEditor('insert'))}
          >
            <PlusIcon /> Insert
          </Button>
          <Button variant="secondary" disabled={readOnly || !canEditSelected} onClick={() => openEditor('edit')}>
            <EditIcon /> Edit
          </Button>
          <Button
            variant="danger"
            disabled={readOnly || !canDeleteSelected}
            onClick={() => (inline ? gridEdits.markDeleted(selected.filter(i => typeof i === 'number')) : selectedCount > 1 ? setBulkOpen(true) : openEditor('delete'))}
          >
            <Trash2Icon /> {selectedCount > 1 ? `Delete ${selectedCount}` : 'Delete'}
          </Button>
          <Divider orientation="vertical" className="h-6" />
          <Button variant="secondary" disabled={selectedCount !== 1} onClick={() => setViewerOpen(true)}>
            <EyeIcon /> View record
          </Button>
          <Button variant="secondary" disabled={!hasSelection} onClick={() => onCopyRows(selectedCount === 1 ? selectedJson : selectedDocs)}>
            <CopyIcon /> {selectedCount > 1 ? 'Copy rows' : 'Copy row'}
          </Button>
          <Button variant="flat" disabled={!isConnected || busy} tooltip="Re-run query" onClick={onRerun}>
            <RefreshIcon />
          </Button>
        </Flex>
        {inline && <PendingChangesBar edits={gridEdits} dialect={language} onCopy={onCopyRows} />}
        {inline && !gridEdits.counts.total && <HelperText className="px-2">Double-click a cell or press F2 to edit it. Changes are saved together in one transaction.</HelperText>}
        <Flex gap={2} align="center" className="compact-fields px-2">
          <div className="w-44">
            <Select
              value={search.column}
              onChange={column => setSearch(all => ({ ...all, column }))}
              aria-label="Search in column"
              options={[{ value: '', label: 'All columns' }, ...table.columns.map(column => ({ value: column, label: column }))]}
            />
          </div>
          <div className="min-w-[10rem] flex-1">
            <Input value={search.text} onChange={text => setSearch(all => ({ ...all, text }))} placeholder="Search loaded rows" aria-label="Search loaded rows" />
          </div>
          {needle && (
            <span className="whitespace-nowrap text-xs text-app-muted">
              {rows.length} of {table.rows.length} rows
            </span>
          )}
        </Flex>
        <DataGrid
          columns={columns}
          rows={rows}
          rowKey="__i"
          selectable
          pageSize={browsing ? Math.min(tab.browse.pageSize, MAX_RENDERED_ROWS) : 50}
          pageSizeOptions={browsing ? undefined : [25, 50, 100, 250]}
          hideFooterWhenSinglePage
          selected={selected}
          onSelectionChange={keys => onSelect(keys.filter(key => typeof key === 'number'))}
          empty="No rows returned."
          caption="Query results"
          className="compact-grid !gap-2 [&_div.overflow-x-auto]:!border-x-0 [&>div:last-child]:px-2"
        />
      </Stack>
    );
  };

  const exportItems = EXPORT_FORMATS.map(({ key, label }) => ({
    key,
    label,
    icon: <DownloadIcon />,
    disabled: !result || (key === 'sql' && isDocumentResult(result)),
    onClick: () => onExport(key)
  }));

  return (
    <Card
      className="compact-card flex-1 !border-x-0 !border-t-0 [&>div:last-child]:flex [&>div:last-child]:flex-col"
      title="Results"
      subtitle={`${meta} · ${status}`}
      padded={false}
      actions={
        <Flex gap={2} align="center" wrap className="compact-buttons">
          <ToggleButtonGroup exclusive aria-label="Result view" value={view} onChange={value => value && onViewChange(value)}>
            <ToggleButton value="table">Table</ToggleButton>
            <ToggleButton value="json">JSON</ToggleButton>
          </ToggleButtonGroup>
          {hasStructure && (
            <Button variant="secondary" onClick={() => setStructureOpen(true)}>
              <ListIcon /> Structure
            </Button>
          )}
          <ActionMenu
            label="Export results"
            variant="secondary"
            placement="bottom-end"
            trigger={
              <>
                <DownloadIcon /> Export
              </>
            }
            items={exportItems}
          />
        </Flex>
      }
    >
      {browsing && <BrowseBar browse={tab.browse} columns={browseColumns} language={language} loading={tab.running} hasNext={tab.hasNext} onChange={onBrowse} />}
      {limitNote}
      {body()}
      <StructureDialog open={structureOpen} onClose={() => setStructureOpen(false)} object={object} />
    </Card>
  );
}
