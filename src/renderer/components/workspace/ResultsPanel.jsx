import React from 'react';
import {
  ActionMenu, Alert, Button, Card, Chip, CodeDisplay, CopyIcon, DataGrid, DatabaseIcon, Divider, DownloadIcon, EditIcon, EyeIcon, Flex,
  HelperText, PlusIcon, RefreshIcon, Stack, ToggleButton, ToggleButtonGroup, Trash2Icon
} from 'xedonium';
import { engines } from '../../constants.js';

export default function ResultsPanel({ tab, status, records, isConnected, busy, onViewChange, onSelectIndex, onRerun, onCopyRow, onExportJson, onExportCsv }) {
  const { result, error, view, meta, selectedObject, selectedIndex } = tab;
  const { hasSelection, selectedJson, canEditSelected, openEditor, setViewerOpen } = records;

  const columns = (result?.columns || []).map((column, j) => ({
    key: `c${j}`, header: column, sortable: true, accessor: row => row[`c${j}`],
    render: row => <span className="block max-w-[22rem] truncate" title={String(row[`c${j}`] ?? '')}>{row[`c${j}`] ?? ''}</span>
  }));
  const rows = (result?.rows || []).map((row, index) => Object.fromEntries([['__i', index], ...row.map((value, j) => [`c${j}`, value])]));

  const body = () => {
    if (error) return <div className="p-4"><Alert tone="danger" title="Query failed"><span className="whitespace-pre-wrap">{error}</span></Alert></div>;
    if (!result) return (
      <Stack gap={3} className="items-center px-6 py-14 text-center">
        <DatabaseIcon className="h-9 w-9 text-app-muted" />
        <h2 className="text-lg font-semibold">Your databases, one workspace</h2>
        <HelperText>Create a connection, connect, then browse an object or run a query.</HelperText>
        <Flex gap={2} wrap justify="center">{Object.values(engines).map(x => <Chip key={x.label}>{x.label}</Chip>)}</Flex>
      </Stack>
    );
    if (view === 'json') return <div className="p-2"><CodeDisplay language="json" code={JSON.stringify(result.json ?? { columns: result.columns, rows: result.rows, message: result.message }, null, 2)} maxHeight="70vh" copyable /></div>;
    if (!columns.length) return <Stack gap={1} className="px-6 py-10 text-center"><h2 className="text-base font-semibold">{result.message || 'Command completed'}</h2><HelperText>No tabular rows returned.</HelperText></Stack>;
    return (
      <Stack gap={2} className="p-2">
        <Flex gap={2} wrap align="center">
          <Button variant="secondary" disabled={!selectedObject || selectedObject.type === 'view'} onClick={() => openEditor('insert')}><PlusIcon /> Insert</Button>
          <Button variant="secondary" disabled={!canEditSelected} onClick={() => openEditor('edit')}><EditIcon /> Edit</Button>
          <Button variant="danger" disabled={!canEditSelected} onClick={() => openEditor('delete')}><Trash2Icon /> Delete</Button>
          <Divider orientation="vertical" className="h-6" />
          <Button variant="secondary" disabled={!hasSelection} onClick={() => setViewerOpen(true)}><EyeIcon /> View record</Button>
          <Button variant="secondary" disabled={!hasSelection} onClick={() => onCopyRow(selectedJson)}><CopyIcon /> Copy row</Button>
          <Button variant="flat" disabled={!isConnected || busy} tooltip="Re-run query" onClick={onRerun}><RefreshIcon /></Button>
        </Flex>
        <DataGrid columns={columns} rows={rows} rowKey="__i" searchable selectable pageSize={50} pageSizeOptions={[25, 50, 100]}
          selected={hasSelection ? [selectedIndex] : []}
          onSelectionChange={keys => { const fresh = keys.filter(k => k !== selectedIndex); onSelectIndex(fresh.length ? fresh[fresh.length - 1] : keys.length ? keys[keys.length - 1] : null); }}
          empty="No rows returned." caption="Query results" />
      </Stack>
    );
  };

  const exportItems = [
    { key: 'json', label: 'Export JSON', icon: <DownloadIcon />, disabled: !result, onClick: onExportJson },
    { key: 'csv', label: 'Export CSV', icon: <DownloadIcon />, disabled: !result, onClick: onExportCsv }
  ];

  return (
    <Card title="Results" subtitle={`${meta} · ${status}`} padded={false}
      actions={<Flex gap={2} align="center" wrap>
        <ToggleButtonGroup exclusive aria-label="Result view" value={view} onChange={value => value && onViewChange(value)}><ToggleButton value="table">Table</ToggleButton><ToggleButton value="json">JSON</ToggleButton></ToggleButtonGroup>
        <ActionMenu label="Export results" variant="secondary" placement="bottom-end" trigger={<><DownloadIcon /> Export</>} items={exportItems} />
      </Flex>}>
      {body()}
    </Card>
  );
}
