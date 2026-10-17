import { useEffect, useState } from 'react';
import {
  ActionMenu, Alert, Button, Card, Chip, CodeDisplay, CopyIcon, DataGrid, DatabaseIcon, Divider, DownloadIcon, EditIcon, EyeIcon, Flex,
  HelperText, Loader, PlusIcon, RefreshIcon, Stack, ToggleButton, ToggleButtonGroup, Trash2Icon
} from 'xedonium';
import { engines } from '../../constants.js';
import { isDocumentResult, toTable } from '../../lib/results.js';
import DocumentList from './DocumentList.jsx';
import NestedValue, { plainText } from './NestedValue.jsx';

export default function ResultsPanel({ tab, status, records, isConnected, busy, onViewChange, onSelect, onRerun, onCopyRows, onExportJson, onExportCsv }) {
  const { result, error, view, meta, selected } = tab;
  // Only show the loader for queries that take a moment, so quick ones don't flash.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!tab.running) { setSlow(false); return undefined; }
    const timer = setTimeout(() => setSlow(true), 250);
    return () => clearTimeout(timer);
  }, [tab.running]);
  const { hasSelection, selectedCount, selectedDocs, selectedJson, canEditSelected, canDeleteSelected, openEditor, setViewerOpen, setBulkOpen } = records;

  const table = toTable(result);
  const columns = table.columns.map((column, j) => ({
    key: `c${j}`, header: column, sortable: true, accessor: row => plainText(row[`c${j}`]),
    render: row => <div className="max-w-[26rem]"><NestedValue value={row[`c${j}`]} /></div>
  }));
  const rows = table.rows.map((row, index) => Object.fromEntries([['__i', index], ...row.map((value, j) => [`c${j}`, value])]));

  const body = () => {
    if (slow) return <Stack className="items-center px-6 py-14"><Loader variant="stacked" size="md" label="Running query…" /></Stack>;
    if (error) return <div className="p-4"><Alert tone="danger" title="Query failed"><span className="whitespace-pre-wrap">{error}</span></Alert></div>;
    if (!result) return (
      <Stack gap={3} className="items-center px-6 py-14 text-center">
        <DatabaseIcon className="h-9 w-9 text-app-muted" />
        <h2 className="text-lg font-semibold">Your databases, one workspace</h2>
        <HelperText>Create a connection, connect, then browse an object or run a query.</HelperText>
        <Flex gap={2} wrap justify="center">{Object.values(engines).map(x => <Chip key={x.label}>{x.label}</Chip>)}</Flex>
      </Stack>
    );
    if (view === 'json' && isDocumentResult(result)) return <DocumentList documents={result.json} canEdit={Boolean(records.selectedObject) && isConnected} onUpdate={records.updateDocument} onClone={records.cloneDocument} onDelete={records.deleteDocument} onInsert={() => records.openEditor('insert')} />;
    if (view === 'json') return <div className="py-2"><CodeDisplay language="json" code={JSON.stringify(result.json ?? { columns: result.columns, rows: result.rows, message: result.message }, null, 2)} maxHeight="70vh" lineNumbers copyable /></div>;
    if (!columns.length) return <Stack gap={1} className="px-6 py-10 text-center"><h2 className="text-base font-semibold">{result.message || 'Command completed'}</h2><HelperText>No tabular rows returned.</HelperText></Stack>;
    return (
      <Stack gap={2} className="py-2">
        <Flex gap={2} wrap align="center" className="compact-buttons px-2">
          <Button variant="secondary" disabled={!records.selectedObject || records.selectedObject.type === 'view'} onClick={() => openEditor('insert')}><PlusIcon /> Insert</Button>
          <Button variant="secondary" disabled={!canEditSelected} onClick={() => openEditor('edit')}><EditIcon /> Edit</Button>
          <Button variant="danger" disabled={!canDeleteSelected} onClick={() => (selectedCount > 1 ? setBulkOpen(true) : openEditor('delete'))}><Trash2Icon /> {selectedCount > 1 ? `Delete ${selectedCount}` : 'Delete'}</Button>
          <Divider orientation="vertical" className="h-6" />
          <Button variant="secondary" disabled={selectedCount !== 1} onClick={() => setViewerOpen(true)}><EyeIcon /> View record</Button>
          <Button variant="secondary" disabled={!hasSelection} onClick={() => onCopyRows(selectedCount === 1 ? selectedJson : selectedDocs)}><CopyIcon /> {selectedCount > 1 ? 'Copy rows' : 'Copy row'}</Button>
          <Button variant="flat" disabled={!isConnected || busy} tooltip="Re-run query" onClick={onRerun}><RefreshIcon /></Button>
        </Flex>
        <DataGrid columns={columns} rows={rows} rowKey="__i" selectable pageSize={50} pageSizeOptions={[25, 50, 100]}
          selected={selected} onSelectionChange={onSelect}
          empty="No rows returned." caption="Query results"
          className="compact-grid !gap-2 [&_div.overflow-x-auto]:!border-x-0 [&>div:last-child]:px-2" />
      </Stack>
    );
  };

  const exportItems = [
    { key: 'json', label: 'Export JSON', icon: <DownloadIcon />, disabled: !result, onClick: onExportJson },
    { key: 'csv', label: 'Export CSV', icon: <DownloadIcon />, disabled: !result, onClick: onExportCsv }
  ];

  return (
    <Card className="compact-card !border-x-0 !border-t-0" title="Results" subtitle={`${meta} · ${status}`} padded={false}
      actions={<Flex gap={2} align="center" wrap className="compact-buttons">
        <ToggleButtonGroup exclusive aria-label="Result view" value={view} onChange={value => value && onViewChange(value)}><ToggleButton value="table">Table</ToggleButton><ToggleButton value="json">JSON</ToggleButton></ToggleButtonGroup>
        <ActionMenu label="Export results" variant="secondary" placement="bottom-end" trigger={<><DownloadIcon /> Export</>} items={exportItems} />
      </Flex>}>
      {body()}
    </Card>
  );
}
