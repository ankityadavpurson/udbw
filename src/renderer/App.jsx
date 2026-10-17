import { useEffect, useState } from 'react';
import { ConfirmDialog, CopyIcon, Drawer, EditIcon, RefreshIcon, Stack, StarIcon, Trash2Icon } from 'xedonium';
import useMediaQuery from 'xedonium/hooks/useMediaQuery';
import useConnections from './hooks/useConnections.js';
import useObjectTree from './hooks/useObjectTree.js';
import useQueryTabs from './hooks/useQueryTabs.js';
import useRecordEditor from './hooks/useRecordEditor.js';
import useConnectionDialog from './hooks/useConnectionDialog.js';
import { selectStatement } from './lib/statements.js';
import { copyToClipboard, downloadCsv, downloadJson } from './lib/exporters.js';
import AppSidebar from './components/sidebar/AppSidebar.jsx';
import ObjectBrowser from './components/sidebar/ObjectBrowser.jsx';
import ConnectionToolbar from './components/workspace/ConnectionToolbar.jsx';
import QueryTabs from './components/workspace/QueryTabs.jsx';
import QueryEditor from './components/workspace/QueryEditor.jsx';
import ResultsPanel from './components/workspace/ResultsPanel.jsx';
import ConnectionDialog from './components/dialogs/ConnectionDialog.jsx';
import RecordEditorDialog from './components/dialogs/RecordEditorDialog.jsx';
import RecordViewerDialog from './components/dialogs/RecordViewerDialog.jsx';

const objectId = item => `${item.schema || ''}.${item.name}`;

export default function App() {
  const [status, setStatus] = useState('Ready');
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const isMd = useMediaQuery('(min-width: 768px)');
  const isLg = useMediaQuery('(min-width: 1024px)');

  const conn = useConnections({ setStatus, setBusy });
  const { active, activeId, isConnected } = conn;
  const tree = useObjectTree({ active, activeId, markLost: conn.markLost, updateProfile: conn.updateProfile, setStatus });
  const tabsApi = useQueryTabs({
    activeId, active, isConnected, loaded: conn.loaded, lastQueries: conn.lastQueries, setBusy, setStatus,
    onConnectionLost: id => { conn.markLost(id); tree.clear(); }
  });
  const { tab } = tabsApi;
  const records = useRecordEditor({ active, tab, runQuery: tabsApi.runQuery, setQuery: tabsApi.setQuery, setStatus });
  const dialog = useConnectionDialog({
    connected: conn.connected, saveProfile: conn.saveProfile,
    onSaved: (next, existing) => { if (existing && existing.type !== next.type) tabsApi.resetConnectionTabs(next.id, next.type); }
  });

  const chooseConnection = p => { conn.chooseConnection(p); tree.resetFor(p, conn.connected.includes(p.id)); };

  async function connect() {
    const res = await conn.connect();
    if (res.ok) await tree.loadObjectTree(res.id, res.database);
    else if (res.message) tabsApi.setError(res.message);
  }

  async function disconnect() {
    await conn.disconnect();
    if (active) tree.clear();
  }

  async function deleteConnection(p) {
    setDeleteTarget(null);
    await conn.deleteConnection(p);
    tabsApi.removeConnectionTabs(p.id);
  }

  // Objects open in their own tab; opening the same object again re-runs it in that tab.
  async function openObject(object) {
    const statement = selectStatement(active, object);
    let target = tabsApi.connTabs.find(t => t.selectedObject && objectId(t.selectedObject) === objectId(object));
    if (target) tabsApi.setActiveTabId(target.id);
    else { target = tabsApi.addTab({ title: object.name, selectedObject: object }, statement); if (!target) return; }
    tabsApi.patchTab({ query: statement, selectedObject: object, selected: [] }, target.id);
    setStatus(`Browsing ${object.name}…`); await tabsApi.runQuery(statement, target.id);
  }

  async function copyText(value) {
    if (value == null) return;
    setStatus((await copyToClipboard(value)) ? 'Copied to clipboard' : 'Clipboard access is unavailable');
  }

  const refreshObjectsOrConnections = () => (activeId ? tree.loadObjectTree() : conn.refreshConnections());

  useEffect(() => {
    const onShortcut = event => {
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;
      if (mod && key === 't' && !event.altKey) { event.preventDefault(); tabsApi.addTab(); return; }
      if (mod && key === 'r' && !event.altKey) { event.preventDefault(); refreshObjectsOrConnections(); return; }
      if (!mod || !event.altKey || !['c', 'd', 'r'].includes(key)) return;
      event.preventDefault();
      if (key === 'c') connect();
      if (key === 'd') disconnect();
      if (key === 'r') refreshObjectsOrConnections();
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  });

  const connectionMenu = [
    { key: 'edit', label: 'Edit connection', icon: <EditIcon />, disabled: !active, onClick: () => dialog.openDialog(active) },
    { key: 'duplicate', label: 'Duplicate', icon: <CopyIcon />, disabled: !active, onClick: () => conn.duplicateConnection(active) },
    { key: 'favorite', label: active?.favorite ? 'Remove favorite' : 'Add favorite', icon: <StarIcon />, disabled: !active, onClick: () => conn.toggleFavorite(active.id) },
    { key: 'refresh', label: 'Refresh objects', icon: <RefreshIcon />, disabled: !isConnected, onClick: () => tree.loadObjectTree() },
    { key: 'delete', label: 'Delete connection', icon: <Trash2Icon />, tone: 'danger', disabled: !active, onClick: () => setDeleteTarget(active) }
  ];

  const sidebar = (close, inDrawer, autoCollapsed) => (
    <AppSidebar close={close} inDrawer={inDrawer} autoCollapsed={autoCollapsed} profiles={conn.profiles} activeId={activeId} connectionStatus={conn.connectionStatus}
      onChoose={chooseConnection} onNew={() => dialog.openDialog()} onRefresh={conn.refreshConnections}>
      <ObjectBrowser active={active} isConnected={isConnected} tree={tree} selectedObject={tab.selectedObject} onOpen={openObject} />
    </AppSidebar>
  );

  return (
    <>
      <div className="flex h-full overflow-hidden bg-app-bg text-app-text">
        {isMd && <aside className="shrink-0">{sidebar(() => {}, false, !isLg)}</aside>}
        <main className="min-w-0 flex-1 overflow-y-auto p-2">
          <Stack gap={2}>
            <ConnectionToolbar active={active} engine={conn.engine} status={active ? conn.connectionStatus(active.id) : undefined} isConnected={isConnected} busy={busy}
              showMenuButton={!isMd} onOpenMenu={() => setDrawerOpen(true)} onConnect={connect} onDisconnect={disconnect} onRun={() => tabsApi.runQuery()} menuItems={connectionMenu} />
            <QueryTabs tabs={tabsApi.connTabs} activeTabId={tab.id} canAdd={Boolean(active)} onSelect={tabsApi.setActiveTabId} onClose={tabsApi.closeTab} onAdd={() => tabsApi.addTab()} />
            <QueryEditor value={tab.query} onRun={() => tabsApi.runQuery()}
              onChange={value => { tabsApi.setQuery(value); if (activeId) conn.setLastQuery(activeId, value); }} />
            <ResultsPanel tab={tab} status={status} records={records} isConnected={isConnected} busy={busy}
              onViewChange={tabsApi.setView} onSelect={tabsApi.setSelected} onRerun={() => tabsApi.runQuery()} onCopyRows={copyText}
              onExportJson={() => downloadJson(tab.result)} onExportCsv={() => downloadCsv(tab.result)} />
          </Stack>
        </main>
      </div>

      <Drawer open={drawerOpen && !isMd} onClose={() => setDrawerOpen(false)} title="Connections" side="left" width="max-w-xs" padded={false}>
        {sidebar(() => setDrawerOpen(false), true, false)}
      </Drawer>

      <ConnectionDialog dialog={dialog} groups={[...new Set(conn.profiles.map(p => p.group?.trim() || 'Connections'))]} />
      <RecordEditorDialog records={records} objectName={tab.selectedObject?.name} />
      <RecordViewerDialog open={records.viewerOpen} onClose={() => records.setViewerOpen(false)} record={records.selectedJson} onCopy={copyText} />
      <ConfirmDialog open={records.bulkOpen} tone="danger" title="Delete records" confirmLabel="Delete" busy={records.bulkBusy} error={records.bulkError} onClose={() => records.setBulkOpen(false)} onConfirm={records.bulkDelete}>
        Delete {records.selectedCount} selected records? This cannot be undone.
      </ConfirmDialog>
      <ConfirmDialog open={!!deleteTarget} tone="danger" title="Delete connection" confirmLabel="Delete" onClose={() => setDeleteTarget(null)} onConfirm={() => deleteConnection(deleteTarget)}>
        Delete connection “{deleteTarget?.name}”? This cannot be undone.
      </ConfirmDialog>
    </>
  );
}
