import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIcon, BookmarkIcon, ClockIcon, CodeIcon, ConfirmDialog, CopyIcon, Drawer, EditIcon, RefreshIcon, Stack, StarIcon, Trash2Icon, ZapIcon } from 'xedonium';
import useMediaQuery from 'xedonium/hooks/useMediaQuery';
import useConnections from './hooks/useConnections.js';
import useObjectTree from './hooks/useObjectTree.js';
import useQueryTabs from './hooks/useQueryTabs.js';
import useRecordEditor from './hooks/useRecordEditor.js';
import useGridEdits from './hooks/useGridEdits.js';
import useConnectionDialog from './hooks/useConnectionDialog.js';
import { selectStatement } from './lib/statements.js';
import { assessCommand, assessStatement, splitStatements, statementAt } from './lib/sqlScript.js';
import { buildBrowseQuery, canBrowse, DEFAULT_BROWSE } from './lib/browse.js';
import { languageFor } from './lib/tokenize.js';
import { copyToClipboard, exportResult } from './lib/exporters.js';
import { formatSql } from './lib/sqlFormat.js';
import TitleBar from './components/TitleBar.jsx';
import AppSidebar from './components/sidebar/AppSidebar.jsx';
import ObjectBrowser from './components/sidebar/ObjectBrowser.jsx';
import ConnectionToolbar from './components/workspace/ConnectionToolbar.jsx';
import QueryTabs from './components/workspace/QueryTabs.jsx';
import QueryEditor from './components/workspace/QueryEditor.jsx';
import ResultsPanel from './components/workspace/ResultsPanel.jsx';
import ConnectionDialog from './components/dialogs/ConnectionDialog.jsx';
import RecordEditorDialog from './components/dialogs/RecordEditorDialog.jsx';
import RecordViewerDialog from './components/dialogs/RecordViewerDialog.jsx';
import HistoryDialog from './components/dialogs/HistoryDialog.jsx';
import UpdateDialog from './components/dialogs/UpdateDialog.jsx';
import UpdateToast from './components/UpdateToast.jsx';

const objectId = item => `${item.schema || ''}.${item.name}`;

export default function App() {
  const [status, setStatus] = useState('Ready');
  // Several things can run at once (one per tab, or a connect), so busy is a count, not a flag that one of them could clear for all.
  const [busyCount, setBusyCount] = useState(0);
  const setBusy = useCallback(on => setBusyCount(count => Math.max(0, count + (on ? 1 : -1))), []);
  const busy = busyCount > 0;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyDraft, setHistoryDraft] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [pendingRun, setPendingRun] = useState(null); // statements waiting for a confirmation: { statements, reasons, production }
  const editorRef = useRef(null);
  const isMd = useMediaQuery('(min-width: 768px)');
  const isLg = useMediaQuery('(min-width: 1024px)');

  const conn = useConnections({ setStatus, setBusy });
  const { active, activeId, isConnected } = conn;
  const tree = useObjectTree({ active, activeId, markLost: conn.markLost, updateProfile: conn.updateProfile, setStatus });
  const tabsApi = useQueryTabs({
    activeId,
    active,
    isConnected,
    loaded: conn.loaded,
    lastQueries: conn.lastQueries,
    savedTabs: conn.savedTabs,
    setBusy,
    setStatus,
    onConnectionLost: id => {
      conn.markLost(id);
      tree.clear();
    }
  });
  const { tab } = tabsApi;
  const records = useRecordEditor({ active, tab, runQuery: tabsApi.runQuery, runMutation: tabsApi.runMutation, setQuery: tabsApi.setQuery, setStatus });
  const gridEdits = useGridEdits({
    active,
    tab,
    tabs: tabsApi.tabs,
    selectedObject: tab.selectedObject,
    enabled: Boolean(
      isConnected && !active?.readOnly && languageFor(active) !== 'command' && tab.selectedObject?.type === 'table' && tab.browse && tab.query === tab.browse.generated
    ),
    runQuery: tabsApi.runQuery,
    setStatus
  });
  // Lets the main process ask before the window closes while edits are unsaved.
  const [documentDirty, setDocumentDirty] = useState(0);
  const unsaved = gridEdits.totalPending + documentDirty + (records.editorDirty ? 1 : 0);
  useEffect(() => {
    window.workbench.reportUnsaved(unsaved);
  }, [unsaved]);
  // The main process asks here, in the themed UI, before the window closes with unsaved edits.
  const [discardAsk, setDiscardAsk] = useState(0);
  useEffect(() => window.workbench.onAskDiscard(count => setDiscardAsk(count || 1)), []);
  const answerDiscard = ok => {
    setDiscardAsk(0);
    window.workbench.answerDiscard(ok);
  };
  const dialog = useConnectionDialog({
    connected: conn.connected,
    saveProfile: conn.saveProfile,
    onSaved: (next, existing) => {
      if (existing && existing.type !== next.type) tabsApi.resetConnectionTabs(next.id, next.type);
    }
  });

  // Remember each connection's open tabs (queries and opened tables) for the next start.
  useEffect(() => {
    if (!conn.loaded) return;
    const byConnection = {};
    for (const t of tabsApi.tabs) if (t.connId) (byConnection[t.connId] ||= []).push(t);
    for (const [connId, list] of Object.entries(byConnection)) {
      const activeIndex =
        connId === activeId
          ? Math.max(
              0,
              list.findIndex(t => t.id === tab.id)
            )
          : (conn.savedTabs[connId]?.active ?? 0);
      conn.rememberTabs(connId, { tabs: list.map(t => ({ title: t.title, query: t.query, selectedObject: t.selectedObject, browse: t.browse })), active: activeIndex });
    }
  }, [tabsApi.tabs, tab.id, activeId, conn.loaded]);

  // Tells the main process the saved connections are loaded, so it can swap the splash for this window.
  useEffect(() => {
    if (conn.loaded) window.workbench.appReady();
  }, [conn.loaded]);

  const chooseConnection = p => {
    conn.chooseConnection(p);
    tree.resetFor(p, conn.connected.includes(p.id));
  };

  async function connect() {
    const res = await conn.connect();
    if (res.ok) await tree.loadObjectTree(res.id, res.database);
    else if (res.message) tabsApi.setError(res.message, 'Connection failed');
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
  async function openObject(listed) {
    const object = await tree.describeObject(listed); // loads columns and primary key first
    let browse = null;
    let statement;
    if (canBrowse(active, object)) {
      statement = buildBrowseQuery(active, object, DEFAULT_BROWSE);
      browse = { ...DEFAULT_BROWSE, generated: statement };
    } else statement = selectStatement(active, object);
    let target = tabsApi.connTabs.find(t => t.selectedObject && objectId(t.selectedObject) === objectId(object));
    if (target) tabsApi.setActiveTabId(target.id);
    else {
      target = tabsApi.addTab({ title: object.name, selectedObject: object }, statement);
      if (!target) return;
    }
    tabsApi.patchTab({ query: statement, selectedObject: object, selected: [], browse, hasNext: false }, target.id);
    setStatus(`Browsing ${object.name}…`);
    await tabsApi.runQuery(statement, target.id);
  }

  // Which statements a Run should send: the selection (all of it), else the statement at the cursor, or every
  // statement for Run all. Command languages (MongoDB, Firestore, REST) are never split.
  function editorStatements(mode) {
    const dialect = languageFor(active);
    const target = editorRef.current?.getTarget() || { selection: '', cursor: 0 };
    if (dialect === 'command') return [(target.selection || tab.query).trim()].filter(Boolean);
    if (target.selection.trim()) return splitStatements(target.selection, dialect).map(s => s.text);
    const all = splitStatements(tab.query, dialect);
    if (mode === 'all') return all.map(s => s.text);
    const current = statementAt(all, target.cursor);
    return current ? [current.text] : [];
  }

  // Asks first when a statement is destructive, or changes data on a connection marked as production.
  function runEditor(mode = 'current') {
    if (!active || !isConnected) return;
    const statements = editorStatements(mode);
    if (!statements.length) {
      setStatus('Nothing to run.');
      return;
    }
    const dialect = languageFor(active);
    const assessed = statements.map(text => (dialect === 'command' ? assessCommand(text) : assessStatement(text, dialect)));
    const reasons = assessed.flatMap((item, i) => item.danger.map(reason => (statements.length > 1 ? `Statement ${i + 1}: ${reason}` : reason)));
    const production = active.environment === 'production' && assessed.some(item => item.write);
    if (reasons.length || production) setPendingRun({ statements, reasons, production });
    else runStatements(statements);
  }

  // Every statement run from the editor goes into the connection's history.
  const recordHistory = (info, text) => {
    if (active) conn.addHistory(active.id, { text, ...info });
  };
  const runStatements = statements => tabsApi.runScript(statements, undefined, { record: recordHistory });

  function confirmRun() {
    const run = pendingRun;
    setPendingRun(null);
    if (run) runStatements(run.statements);
  }

  const writeQuery = value => {
    tabsApi.setQuery(value);
    if (activeId) conn.setLastQuery(activeId, value);
  };

  // Formats the selection, or the whole editor when nothing is selected.
  function formatEditor() {
    const dialect = languageFor(active);
    if (dialect === 'command') {
      setStatus('Formatting is available for SQL connections.');
      return;
    }
    const target = editorRef.current?.getTarget() || { selection: '', start: 0, end: 0 };
    const useSelection = target.selection.trim().length > 0;
    const formatted = formatSql(useSelection ? target.selection : tab.query, dialect);
    writeQuery(useSelection ? tab.query.slice(0, target.start) + formatted + tab.query.slice(target.end) : formatted);
    setStatus('Formatted the SQL');
  }

  // EXPLAIN for the statement at the cursor. ANALYZE actually runs it, so a statement that changes data is confirmed first.
  function explainEditor(analyze) {
    if (!active || !isConnected) return;
    const dialect = languageFor(active);
    if (dialect === 'command') {
      setStatus('EXPLAIN is available for SQL connections.');
      return;
    }
    const [statement] = editorStatements('current');
    if (!statement) {
      setStatus('Nothing to explain.');
      return;
    }
    const text = statement.replace(/;\s*$/, '');
    const prefix = analyze ? (active.type === 'mysql' ? 'EXPLAIN ANALYZE ' : 'EXPLAIN (ANALYZE, BUFFERS) ') : 'EXPLAIN ';
    const wrapped = `${prefix}${text}`;
    if (analyze && assessStatement(text, dialect).write)
      setPendingRun({ statements: [wrapped], reasons: ['EXPLAIN ANALYZE really runs the statement, including any change it makes.'], production: false });
    else runStatements([wrapped]);
  }

  function openHistory(draft = null) {
    setHistoryDraft(draft);
    setHistoryOpen(true);
  }
  const snippetFamily = languageFor(active) === 'command' ? 'command' : 'sql';
  const saveDraft = () => (editorRef.current?.getTarget().selection || tab.query).trim() || null;

  async function copyText(value) {
    if (value == null) return;
    setStatus((await copyToClipboard(value)) ? 'Copied to clipboard' : 'Clipboard access is unavailable');
  }

  const refreshObjectsOrConnections = () => (activeId ? tree.loadObjectTree() : conn.refreshConnections());

  useEffect(() => {
    const onShortcut = event => {
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;
      // Select all only makes sense inside a field or a code block, not across the whole window.
      if (mod && key === 'a' && !event.target.closest?.('input, textarea, pre, code, [contenteditable="true"], .select-text, .compact-grid')) {
        event.preventDefault();
        return;
      }
      if (mod && key === 't' && !event.altKey) {
        event.preventDefault();
        tabsApi.addTab();
        return;
      }
      if (mod && key === 's' && !event.altKey && gridEdits.counts.total) {
        event.preventDefault();
        gridEdits.apply();
        return;
      }
      if (mod && key === 'z' && !event.shiftKey && gridEdits.canUndo && !event.target.closest?.('input, textarea')) {
        event.preventDefault();
        gridEdits.undo();
        return;
      }
      if (mod && key === 'w' && !event.altKey && active) {
        event.preventDefault();
        tabsApi.closeTab(tab.id);
        return;
      }
      if (mod && key === 'r' && !event.altKey) {
        event.preventDefault();
        refreshObjectsOrConnections();
        return;
      }
      if (!mod || !event.altKey || !['c', 'd', 'r'].includes(key)) return;
      event.preventDefault();
      if (key === 'c') connect();
      if (key === 'd') disconnect();
      if (key === 'r') refreshObjectsOrConnections();
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  });

  const language = languageFor(active);
  const toolMenu = [
    { key: 'format', label: 'Format SQL', icon: <CodeIcon />, disabled: language === 'command', onClick: formatEditor },
    { key: 'explain', label: 'Explain', icon: <ActivityIcon />, disabled: !isConnected || language === 'command', onClick: () => explainEditor(false) },
    { key: 'analyze', label: 'Explain analyze', icon: <ZapIcon />, disabled: !isConnected || language === 'command', onClick: () => explainEditor(true) },
    { key: 'history', label: 'History and saved queries', icon: <ClockIcon />, disabled: !active, onClick: () => openHistory() },
    { key: 'save', label: 'Save query…', icon: <BookmarkIcon />, disabled: !active, onClick: () => openHistory(saveDraft()) }
  ];

  const connectionMenu = [
    { key: 'edit', label: 'Edit connection', icon: <EditIcon />, disabled: !active, onClick: () => dialog.openDialog(active) },
    { key: 'duplicate', label: 'Duplicate', icon: <CopyIcon />, disabled: !active, onClick: () => conn.duplicateConnection(active) },
    { key: 'favorite', label: active?.favorite ? 'Remove favorite' : 'Add favorite', icon: <StarIcon />, disabled: !active, onClick: () => conn.toggleFavorite(active.id) },
    { key: 'refresh', label: 'Refresh objects', icon: <RefreshIcon />, disabled: !isConnected, onClick: () => tree.loadObjectTree() },
    { key: 'delete', label: 'Delete connection', icon: <Trash2Icon />, tone: 'danger', disabled: !active, onClick: () => setDeleteTarget(active) }
  ];

  const sidebar = (close, inDrawer, autoCollapsed) => (
    <AppSidebar
      close={close}
      inDrawer={inDrawer}
      autoCollapsed={autoCollapsed}
      profiles={conn.profiles}
      activeId={activeId}
      connectionStatus={conn.connectionStatus}
      onChoose={chooseConnection}
      onConnect={() => !isConnected && !busy && connect()}
      onNew={() => dialog.openDialog()}
      onRefresh={conn.refreshConnections}
    >
      <ObjectBrowser
        active={active}
        isConnected={isConnected}
        connecting={active ? conn.connectionStatus(active.id) === 'connecting' : false}
        tree={tree}
        selectedObject={tab.selectedObject}
        onOpen={openObject}
      />
    </AppSidebar>
  );

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden bg-app-bg text-app-text">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          {isMd && <aside className="shrink-0">{sidebar(() => {}, false, !isLg)}</aside>}
          <main className="min-w-0 flex-1 overflow-y-auto">
            <h1 className="sr-only">{active ? `UDBW, ${active.name}` : 'UDBW database workbench'}</h1>
            <div className="sr-only" role="status" aria-live="polite">
              {status}
            </div>
            <Stack gap={0} className="min-h-full">
              <ConnectionToolbar
                active={active}
                engine={conn.engine}
                status={active ? conn.connectionStatus(active.id) : undefined}
                isConnected={isConnected}
                busy={busy}
                showMenuButton={!isMd}
                onOpenMenu={() => setDrawerOpen(true)}
                onConnect={connect}
                onDisconnect={disconnect}
                onRun={() => runEditor('current')}
                onRunAll={() => runEditor('all')}
                onStop={tabsApi.cancelQuery}
                toolItems={toolMenu}
                menuItems={connectionMenu}
              />
              <QueryTabs
                tabs={tabsApi.connTabs}
                activeTabId={tab.id}
                canAdd={Boolean(active)}
                onSelect={tabsApi.setActiveTabId}
                onClose={tabsApi.closeTab}
                onAdd={() => tabsApi.addTab()}
              />
              <QueryEditor
                ref={editorRef}
                language={language}
                value={tab.query}
                onRun={runEditor}
                onFormat={formatEditor}
                onChange={writeQuery}
                objects={tree.objectTree?.objects || []}
                loadColumns={object => tree.describeObject(object)}
              />
              <ResultsPanel
                tab={tab}
                status={status}
                records={records}
                gridEdits={gridEdits}
                onDocumentDirty={setDocumentDirty}
                isConnected={isConnected}
                busy={busy}
                readOnly={Boolean(active?.readOnly)}
                language={languageFor(active)}
                onLoadMore={max => tabsApi.runQuery(tab.query, tab.id, { maxRows: max })}
                onBrowse={tabsApi.browseTo}
                onViewChange={tabsApi.setView}
                onSelect={tabsApi.setSelected}
                onRerun={() => (tab.browse && tab.query === tab.browse.generated ? tabsApi.runQuery() : runEditor('all'))}
                onCopyRows={copyText}
                onExport={async format => setStatus(await exportResult(format, tab, active))}
              />
            </Stack>
          </main>
        </div>
      </div>

      <Drawer open={drawerOpen && !isMd} onClose={() => setDrawerOpen(false)} title="Connections" side="left" width="max-w-xs" padded={false}>
        {sidebar(() => setDrawerOpen(false), true, false)}
      </Drawer>

      <ConnectionDialog dialog={dialog} groups={[...new Set(conn.profiles.map(p => p.group?.trim() || 'Connections'))]} />
      <RecordEditorDialog records={records} objectName={records.selectedObject?.name} documentMode={language === 'command'} />
      <RecordViewerDialog open={records.viewerOpen} onClose={() => records.setViewerOpen(false)} record={records.selectedJson} onCopy={copyText} />
      <UpdateDialog />
      <UpdateToast />
      <ConfirmDialog
        open={discardAsk > 0}
        tone="danger"
        title="Unsaved changes"
        confirmLabel="Discard and quit"
        cancelLabel="Keep editing"
        onClose={() => answerDiscard(false)}
        onConfirm={() => answerDiscard(true)}
      >
        You have {discardAsk} unsaved change{discardAsk === 1 ? '' : 's'} . They have not been applied to the database, and quitting now discards them.
      </ConfirmDialog>
      <ConfirmDialog
        open={records.bulkOpen}
        tone="danger"
        title="Delete records"
        confirmLabel="Delete"
        busy={records.bulkBusy}
        error={records.bulkError}
        onClose={() => records.setBulkOpen(false)}
        onConfirm={records.bulkDelete}
      >
        Delete {records.selectedCount} selected records? This cannot be undone.
      </ConfirmDialog>
      <HistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        draft={historyDraft}
        history={active ? conn.history[active.id] || [] : []}
        snippets={conn.snippets.filter(item => item.family === snippetFamily)}
        onUse={text => {
          writeQuery(text);
          setHistoryOpen(false);
        }}
        onOpenNew={text => {
          tabsApi.addTab({}, text);
          setHistoryOpen(false);
        }}
        onSave={({ name, text }) => conn.addSnippet({ name, text, family: snippetFamily })}
        onRemoveSnippet={conn.removeSnippet}
        onClear={() => active && conn.clearHistory(active.id)}
      />
      <ConfirmDialog
        open={!!pendingRun}
        tone="danger"
        title={pendingRun?.production && !pendingRun?.reasons.length ? 'Change data on production?' : 'Run this?'}
        confirmLabel="Run anyway"
        onClose={() => setPendingRun(null)}
        onConfirm={confirmRun}
      >
        <ul className="list-disc space-y-1 pl-5">
          {pendingRun?.production && <li>“{active?.name}” is marked as a production connection.</li>}
          {pendingRun?.reasons.map(reason => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </ConfirmDialog>
      <ConfirmDialog
        open={!!deleteTarget}
        tone="danger"
        title="Delete connection"
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteConnection(deleteTarget)}
      >
        Delete connection “{deleteTarget?.name}”? This cannot be undone.
      </ConfirmDialog>
    </>
  );
}
