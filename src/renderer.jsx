import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ThemeProvider, Drawer, Sidebar, Tabs, Card, Button, Chip, Alert, Modal, ConfirmDialog, Field, PasswordInput,
  Select, Checkbox, TextArea, Input, DataGrid, CodeDisplay, Tree, ActionMenu, ToggleButton, ToggleButtonGroup,
  HelperText, Loader, Flex, Stack, Divider,
  DatabaseIcon, PlayIcon, PlusIcon, SearchIcon, RefreshIcon, StarIcon, CopyIcon, Trash2Icon, DownloadIcon, EditIcon,
  MoreVerticalIcon, TableIcon, PowerIcon, EyeIcon, FolderIcon, ChevronLeftIcon, ChevronRightIcon, MenuIcon, CloseIcon
} from 'xedonium';
import { useTheme } from 'xedonium/theme';
import useMediaQuery from 'xedonium/hooks/useMediaQuery';
import 'xedonium/styles.css';
import './styles.css';

const engines = {
  mysql: { label: 'MySQL', icon: 'MY', query: 'SELECT 1 AS connection_test;', help: 'SQL mode · MySQL queries execute on the selected database.' },
  postgres: { label: 'PostgreSQL', icon: 'PG', query: 'SELECT 1 AS connection_test;', help: 'SQL mode · PostgreSQL queries execute on the selected database.' },
  mongodb: { label: 'MongoDB', icon: 'MO', query: 'collections', help: 'Mongo mode · Use “collections” or find collection_name {"status":"active"} LIMIT 100.' },
  supabase: { label: 'Supabase', icon: 'SB', query: 'SELECT current_database(), current_user;', help: 'SQL mode uses PostgreSQL. REST mode: REST: table_name LIMIT 100' },
  firestore: { label: 'Firebase Firestore', icon: 'FS', query: 'collections', help: 'Firestore mode · Use “collections” or “read collection_name LIMIT 100”.' }
};
const blankProfile = { name: '', type: 'mysql', host: '', port: '3306', database: '', username: '', password: '', uri: '', connectionString: '', restUrl: '', apiKey: '', projectId: '', serviceAccountPath: '', ssl: false, sslAllowUntrusted: false, sshEnabled: false, sshHost: '', sshPort: '22', sshUsername: '', sshAuthMethod: 'password', sshPassword: '', sshKeyPath: '', sshPassphrase: '', sshRemoteHost: '' };

const blankTab = { id: 'blank', connId: null, title: '', query: '', result: null, error: '', meta: 'No query executed', view: 'table', selectedIndex: null, selectedObject: null };

function Logo({ className = 'h-7 w-7' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 2H2v8h2V2zm16 0h2v8h-2V2zm-6 6h-4V2H4v2h4v4H4v2h4v4H4v2h4v4H4v2h6v-6h4v6h2v-6h4v-2h-4v-4h4V8h-4V2h-2v6zm-4 6v-4h4v4h-4zM20 2h-4v2h4V2zM2 14h2v8H2v-8zm14 6h4v2h-4v-2zm6-6h-2v8h2v-8z" /></svg>;
}

function ThemeBridge() {
  const { activeTheme, setThemeMode } = useTheme();
  useEffect(() => window.workbench.onSetTheme(mode => setThemeMode(mode)), [setThemeMode]);
  useEffect(() => { window.workbench.reportTheme(activeTheme); }, [activeTheme]);
  return null;
}

function StatusDot({ state, className = '' }) {
  const color = state === 'connected' ? 'bg-green-500' : state === 'connecting' ? 'animate-pulse bg-amber-500' : state === 'failed' ? 'bg-red-500' : 'bg-app-border';
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color} ${className}`} role="img" aria-label={state || 'disconnected'} />;
}

function App() {
  const [profiles, setProfiles] = useState([]);
  const [lastQueries, setLastQueries] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [connected, setConnected] = useState([]);
  const [connectionStates, setConnectionStates] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [testState, setTestState] = useState('idle');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [objectTree, setObjectTree] = useState(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [currentDatabase, setCurrentDatabase] = useState('');
  const [currentSchema, setCurrentSchema] = useState('');
  const [objectSearch, setObjectSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const tabCounter = useRef({});
  const makeTab = (connId, queryText, extra = {}) => ({ id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, connId, title: extra.title ?? `Query ${(tabCounter.current[connId] = (tabCounter.current[connId] || 0) + 1)}`, query: queryText, result: null, error: '', meta: 'No query executed', view: 'table', selectedIndex: null, selectedObject: null, ...extra });
  const [initialTab] = useState(() => makeTab(null, engines.mysql.query));
  const [tabs, setTabs] = useState([initialTab]);
  const [activeTabId, setActiveTabId] = useState(initialTab.id);
  const isMd = useMediaQuery('(min-width: 768px)');
  const isLg = useMediaQuery('(min-width: 1024px)');
  const [navCollapsed, setNavCollapsed] = useState(() => { try { return localStorage.getItem('udw-nav-collapsed') === '1' ? true : null; } catch { return null; } });
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordEditorOpen, setRecordEditorOpen] = useState(false);
  const [recordAction, setRecordAction] = useState('insert');
  const [recordJsonText, setRecordJsonText] = useState('{}');
  const [profile, setProfile] = useState(blankProfile);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [status, setStatus] = useState('Ready');
  const [busy, setBusy] = useState(false);
  const pendingSaveRef = useRef(false);
  const active = profiles.find(p => p.id === activeId);
  const isConnected = active && connected.includes(active.id);
  const engine = active ? engines[active.type] : null;
  const connTabs = tabs.filter(t => t.connId === activeId);
  const tab = connTabs.find(t => t.id === activeTabId) ?? connTabs[0] ?? blankTab;
  const { query, result, error, meta, view, selectedIndex, selectedObject } = tab;
  const patchTab = (patch, id = tab.id) => setTabs(all => all.map(t => t.id === id ? { ...t, ...patch } : t));
  const setQuery = value => patchTab({ query: value });
  const setResult = value => patchTab({ result: value });
  const setError = value => patchTab({ error: value });
  const setMeta = value => patchTab({ meta: value });
  const setView = value => patchTab({ view: value });
  const setSelectedIndex = value => patchTab({ selectedIndex: value });
  const setSelectedObject = value => patchTab({ selectedObject: value });

  useEffect(() => {
    if (!loaded) return;
    const mine = tabs.filter(t => t.connId === activeId);
    if (!mine.length) {
      const fresh = makeTab(activeId, (active && (lastQueries[activeId] || engines[active.type].query)) || engines.mysql.query);
      setTabs(all => [...all, fresh]); setActiveTabId(fresh.id);
    } else if (!mine.some(t => t.id === activeTabId)) setActiveTabId(mine[0].id);
  }, [tabs, activeId, activeTabId, loaded]);

  function addTab(extra = {}, queryText) {
    if (!activeId || !active) return null;
    const fresh = makeTab(activeId, queryText ?? engines[active.type].query, extra);
    setTabs(all => [...all, fresh]); setActiveTabId(fresh.id);
    return fresh;
  }
  function closeTab(id) {
    const mine = tabs.filter(t => t.connId === activeId);
    if (mine.length <= 1) { patchTab({ query: active ? engines[active.type].query : '', result: null, error: '', meta: 'No query executed', selectedIndex: null, selectedObject: null }, id); return; }
    const index = mine.findIndex(t => t.id === id);
    setTabs(all => all.filter(t => t.id !== id));
    if (id === tab.id) setActiveTabId((mine[index + 1] ?? mine[index - 1]).id);
  }

  useEffect(() => {
    let cancelled = false;
    window.workbench.loadConnections().then(saved => {
      if (cancelled) return;
      if (saved.ok) {
        setStorageReady(true);
        setProfiles(saved.profiles || []); setLastQueries(saved.lastQueries || {});
        const lastId = saved.activeId && saved.profiles?.some(p => p.id === saved.activeId) ? saved.activeId : null;
        setActiveId(lastId);
      } else setStatus(`Could not restore saved connections: ${saved.error?.message || 'Secure storage unavailable'}`);
      setLoaded(true);
    }).catch(err => { if (!cancelled) { setLoaded(true); setStatus(`Could not restore connections: ${err.message}`); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded || !storageReady) return;
    pendingSaveRef.current = true;
    const timer = setTimeout(() => window.workbench.saveConnections({ profiles, activeId, lastQueries }).then(saved => {
      if (!saved.ok) setStatus(`Could not securely save connections: ${saved.error?.message || 'Unknown error'}`);
      else pendingSaveRef.current = false;
    }), 250);
    return () => clearTimeout(timer);
  }, [profiles, activeId, lastQueries, loaded, storageReady]);

  useEffect(() => {
    const onBeforeUnload = event => {
      if (!pendingSaveRef.current) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => {
    const onShortcut = event => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 't' && !event.altKey) { event.preventDefault(); addTab(); return; }
      if ((event.ctrlKey || event.metaKey) && key === 'r' && !event.altKey) {
        event.preventDefault();
        if (activeId) loadObjectTree(); else refreshConnections();
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || !event.altKey) return;
      if (!['c', 'd', 'r'].includes(key)) return;
      event.preventDefault();
      if (key === 'c') connect();
      if (key === 'd') disconnect();
      if (key === 'r') { if (activeId) loadObjectTree(); else refreshConnections(); }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [activeId, active, connected, connectionStates, currentDatabase, currentSchema, treeLoading, busy, tabs]);

  function openDialog(existing = null) {
    setEditingId(existing?.id || null);
    setProfile(existing ? { ...blankProfile, ...existing } : { ...blankProfile });
    setTestState('idle'); setPasswordVisible(false); setFormError(''); setDialogOpen(true);
  }
  function selectEngine(type) { setTestState('idle'); setProfile(p => ({ ...p, type, sshEnabled: type === 'firestore' ? false : p.sshEnabled, port: type === 'postgres' ? '5432' : '3306' })); }
  async function chooseFile() {
    const path = await window.workbench.pickServiceAccount();
    if (path) setProfile(p => ({ ...p, serviceAccountPath: path }));
  }
  async function refreshConnections() {
    const saved = await window.workbench.loadConnections();
    if (!saved.ok) { setStatus(`Connection refresh failed: ${saved.error?.message || 'Secure storage unavailable'}`); return; }
    setStorageReady(true); setProfiles(saved.profiles || []); setLastQueries(saved.lastQueries || {}); setStatus('Connections refreshed from secure storage');
  }
  async function chooseSshKey() {
    const path = await window.workbench.pickSshKey();
    if (path) { setTestState('idle'); setProfile(p => ({ ...p, sshKeyPath: path })); }
  }
  async function addConnection(e) {
    e.preventDefault(); setFormError('');
    if (profile.type === 'supabase' && !profile.connectionString && !(profile.restUrl && profile.apiKey)) return setFormError('Enter a PostgreSQL connection string or both the Project URL and API key.');
    if (profile.type === 'firestore' && !profile.serviceAccountPath) return setFormError('Choose a service-account JSON file.');
    if (['mysql','postgres'].includes(profile.type) && !profile.connectionString && (!Number(profile.port) || Number(profile.port) > 65535)) return setFormError('Enter a valid database port between 1 and 65535.');
    if (profile.sshEnabled && (!Number(profile.sshPort) || Number(profile.sshPort) > 65535)) return setFormError('Enter a valid SSH port between 1 and 65535.');
    if (profile.sshEnabled && (!profile.sshHost.trim() || !profile.sshUsername.trim() || (profile.sshAuthMethod === 'password' ? !profile.sshPassword : !profile.sshKeyPath))) return setFormError('Complete the SSH host, username, and selected authentication details.');
    if (editingId && connected.includes(editingId) && testState !== 'success') return setFormError('Test the edited settings successfully before replacing the active saved configuration.');
    const existing = profiles.find(p => p.id === editingId);
    const next = { ...profile, id: editingId || crypto.randomUUID(), name: profile.name.trim(), favorite: existing?.favorite || false, lastUsedAt: existing?.lastUsedAt || null };
    if (editingId) {
      if (connected.includes(editingId)) await window.workbench.disconnect({ id: editingId });
      setConnected(c => c.filter(id => id !== editingId));
      setConnectionStates(states => ({ ...states, [editingId]: 'disconnected' }));
      setProfiles(p => p.map(item => item.id === editingId ? next : item));
      setStatus(`Saved changes to ${next.name}. Reconnect to use the updated settings.`);
    } else {
      setProfiles(p => [...p, next]);
      setStatus(`Saved ${next.name}. Connect whenever you are ready.`);
    }
    if (editingId && existing?.type !== next.type) setLastQueries(queries => { const updated = { ...queries }; delete updated[next.id]; return updated; });
    setStorageReady(true); setActiveId(next.id);
    if (existing && existing.type !== next.type) setTabs(all => all.map(t => t.connId === next.id ? { ...t, query: engines[next.type].query, result: null, error: '', selectedIndex: null } : t));
    setDialogOpen(false);
  }
  async function chooseConnection(p) {
    const used = { ...p, lastUsedAt: Date.now() };
    setProfiles(all => all.map(item => item.id === p.id ? used : item));
    setActiveId(p.id); setCurrentDatabase(p.database || ''); setCurrentSchema(''); setObjectSearch(''); setStatus(`Selected ${p.name}`);
    if (connected.includes(p.id)) await loadObjectTree(p.id, p.database || ''); else setObjectTree(null);
  }
  async function loadObjectTree(id = activeId, database = currentDatabase, schema = currentSchema) {
    if (!id) return;
    setTreeLoading(true);
    const response = await window.workbench.discover({ id, database: database || undefined, schema: schema || undefined });
    setTreeLoading(false);
    if (!response.ok) {
      const message = response.error?.message || 'Could not load database objects.';
      if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|57P01|08006|08001/i.test(`${response.error?.code || ''} ${message}`)) {
        setConnected(all => all.filter(item => item !== id)); setConnectionStates(states => ({ ...states, [id]: 'failed' }));
      }
      setObjectTree({ databases: [], schemas: [], objects: [], message }); return;
    }
    const next = response.result;
    const resolvedDatabase = database || next.databases?.[0] || '';
    setObjectTree(next); setCurrentDatabase(resolvedDatabase);
    if (next.message) setStatus(next.message);
  }
  async function changeDatabase(database) {
    if (!active || !database) return;
    const previousDatabase = currentDatabase;
    setTreeLoading(true); setCurrentDatabase(database);
    const switched = await window.workbench.switchDatabase({ id: active.id, database });
    setTreeLoading(false);
    if (!switched.ok) { setCurrentDatabase(previousDatabase); setStatus(`Database switch failed: ${switched.error?.message || 'Unknown error'}`); return; }
    setProfiles(all => all.map(p => p.id === active.id ? { ...p, database } : p));
    setCurrentSchema(''); await loadObjectTree(active.id, database, '');
  }
  function selectStatement(object) {
    if (active?.type === 'mongodb') return `find ${object.name} LIMIT 100`;
    if (active?.type === 'firestore') return `read ${object.name} LIMIT 100`;
    if (active?.type === 'supabase' && !active.connectionString) return `REST: ${object.name} LIMIT 100`;
    if (active?.type === 'mysql') return `SELECT * FROM \`${object.name.replace(/`/g, '``')}\` LIMIT 100;`;
    return `SELECT * FROM "${(object.schema ? `${object.schema}"."` : '')}${object.name.replace(/"/g, '""')}" LIMIT 100;`;
  }
  async function openObject(object) {
    const statement = selectStatement(object);
    const objectKey = item => `${item.schema || ''}.${item.name}`;
    let target = connTabs.find(t => t.selectedObject && objectKey(t.selectedObject) === objectKey(object));
    if (target) setActiveTabId(target.id);
    else { target = addTab({ title: object.name, selectedObject: object }, statement); if (!target) return; }
    patchTab({ query: statement, selectedObject: object, selectedIndex: null }, target.id);
    setStatus(`Browsing ${object.name}…`); await runQuery(statement, target.id);
  }
  function openRecordEditor(action) {
    if (!selectedObject) return;
    setRecordAction(action);
    setRecordJsonText(action === 'edit' && selectedJson ? JSON.stringify(selectedJson, null, 2) : '{}');
    setFormError(''); setRecordEditorOpen(true);
  }
  function sqlLiteral(value) {
    if (value === null) return 'NULL';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'object') value = JSON.stringify(value);
    return `'${String(value).replace(/'/g, "''")}'`;
  }
  async function applyRecordChange(e) {
    e.preventDefault();
    let record;
    try { record = JSON.parse(recordJsonText); if (!record || Array.isArray(record) || typeof record !== 'object') throw new Error(); }
    catch { setFormError('Enter a valid JSON object.'); return; }
    const object = selectedObject;
    if (!object) return;
    let statement;
    const isMongo = active.type === 'mongodb';
    const isFirestore = active.type === 'firestore';
    const isRest = active.type === 'supabase' && !active.connectionString;
    const docId = selectedJson?.id ?? selectedJson?._id ?? record.id ?? record._id;
    if (recordAction !== 'insert' && !docId) { setFormError('The selected record does not include an identifier needed for this operation.'); return; }
    if (isMongo) {
      const collection = object.name;
      if (recordAction === 'insert') statement = `insert ${collection} ${JSON.stringify(record)}`;
      else if (recordAction === 'edit') { const { _id, ...changes } = record; statement = `update ${collection} ${docId} ${JSON.stringify(changes)}`; }
      else statement = `delete ${collection} ${docId}`;
    } else if (isFirestore) {
      const collection = object.name;
      if (recordAction === 'insert') { const { id, ...data } = record; const idToUse = id || crypto.randomUUID(); statement = `create ${collection} ${idToUse} ${JSON.stringify(data)}`; }
      else if (recordAction === 'edit') { const { id, ...changes } = record; statement = `update ${collection} ${docId} ${JSON.stringify(changes)}`; }
      else statement = `delete ${collection} ${docId}`;
    } else if (isRest) {
      if (recordAction === 'insert') statement = `INSERT ${object.name} ${JSON.stringify(record)}`;
      else if (recordAction === 'edit') { const { id, ...changes } = record; statement = `UPDATE ${object.name} id=${docId} ${JSON.stringify(changes)}`; }
      else statement = `DELETE ${object.name} id=${docId}`;
    } else {
      const quote = active.type === 'mysql' ? value => `\`${String(value).replace(/`/g, '``')}\`` : value => `"${String(value).replace(/"/g, '""')}"`;
      const table = `${object.schema ? `${quote(object.schema)}.` : ''}${quote(object.name)}`;
      const keys = object.primaryKey || [];
      if (recordAction === 'insert') {
        const entries = Object.entries(record);
        if (!entries.length) { setFormError('Add at least one field to the record.'); return; }
        statement = `INSERT INTO ${table} (${entries.map(([key]) => quote(key)).join(', ')}) VALUES (${entries.map(([,value]) => sqlLiteral(value)).join(', ')});`;
      } else {
        if (!keys.length || keys.some(key => selectedJson?.[key] === undefined)) { setFormError('This table has no visible primary key, so a record cannot be updated or deleted safely.'); return; }
        const where = keys.map(key => `${quote(key)} = ${sqlLiteral(selectedJson[key])}`).join(' AND ');
        if (recordAction === 'edit') {
          const entries = Object.entries(record).filter(([key]) => !keys.includes(key));
          if (!entries.length) { setFormError('Change at least one non-key field before saving.'); return; }
          statement = `UPDATE ${table} SET ${entries.map(([key,value]) => `${quote(key)} = ${sqlLiteral(value)}`).join(', ')} WHERE ${where};`;
        } else statement = `DELETE FROM ${table} WHERE ${where};`;
      }
    }
    setRecordEditorOpen(false); setStatus(`${recordAction === 'insert' ? 'Inserting' : recordAction === 'edit' ? 'Updating' : 'Deleting'} record…`);
    if (await runQuery(statement)) { const select = selectStatement(object); setQuery(select); await runQuery(select); }
  }
  async function testConnection() {
    if (!profile.name.trim()) return setFormError('Enter a connection name before testing.');
    if ((profile.type === 'mysql' || profile.type === 'postgres') && !profile.connectionString && (!profile.host.trim() || !profile.port || !profile.database.trim() || !profile.username.trim())) return setFormError('Enter the host, port, database, and username or provide a connection string.');
    if (['mysql','postgres'].includes(profile.type) && !profile.connectionString && (!Number(profile.port) || Number(profile.port) > 65535)) return setFormError('Enter a valid database port between 1 and 65535.');
    if (profile.type === 'mongodb' && !profile.uri.trim()) return setFormError('Enter a MongoDB connection URI.');
    if (profile.type === 'supabase' && !profile.connectionString && !(profile.restUrl && profile.apiKey)) return setFormError('Enter a PostgreSQL connection string or both the Project URL and API key.');
    if (profile.type === 'firestore' && !profile.serviceAccountPath) return setFormError('Choose a service-account JSON file.');
    if (profile.sshEnabled && (!profile.sshHost.trim() || !profile.sshUsername.trim() || !Number(profile.sshPort) || Number(profile.sshPort) > 65535 || (profile.sshAuthMethod === 'password' ? !profile.sshPassword : !profile.sshKeyPath))) return setFormError('Complete the SSH host, port, username, and authentication details.');
    setTestState('testing'); setFormError('Testing connection…');
    try {
      const payload = { ...profile, name: profile.name.trim() };
      try { structuredClone(payload); } catch (cloneErr) { console.error('[test] payload is not cloneable', cloneErr, payload); }
      const tested = await window.workbench.test(payload);
      if (!tested.ok) console.error('[test] main process reported failure', tested.error);
      if (tested.ok) { setTestState('success'); setFormError('Connection test succeeded. Save when ready.'); }
      else { setTestState('failed'); setFormError(`Connection test failed: ${tested.error?.message || 'Check the connection settings.'}`); }
    } catch (err) {
      // IPC can reject when the main process or a driver fails before returning
      // its normal { ok, error } response. Always leave the test button usable.
      console.error('[test] IPC call rejected', err);
      setTestState('failed');
      setFormError(`Connection test failed: ${err?.message || 'The database driver could not complete the test.'}`);
    }
  }
  function toggleFavorite(id) { setProfiles(all => all.map(p => p.id === id ? { ...p, favorite: !p.favorite } : p)); }
  function duplicateConnection(p) {
    const copy = { ...p, id: crypto.randomUUID(), name: `${p.name} copy`, favorite: false, lastUsedAt: null };
    setProfiles(all => [...all, copy]); setLastQueries(all => ({ ...all, [copy.id]: lastQueries[p.id] || engines[p.type].query })); setStorageReady(true); setStatus(`Duplicated ${p.name}.`);
  }
  async function deleteConnection(p) {
    setDeleteTarget(null);
    if (connected.includes(p.id)) await window.workbench.disconnect({ id: p.id });
    setConnected(all => all.filter(id => id !== p.id));
    setConnectionStates(states => { const next = { ...states }; delete next[p.id]; return next; });
    setProfiles(all => all.filter(item => item.id !== p.id)); setStorageReady(true);
    setLastQueries(all => { const next = { ...all }; delete next[p.id]; return next; });
    setTabs(all => all.filter(t => t.connId !== p.id));
    if (activeId === p.id) setActiveId(null);
    setStatus(`Deleted ${p.name}.`);
  }
  async function connect() {
    if (!active || connectionStates[active.id] === 'connecting') return;
    const connectionId = active.id;
    setConnectionStates(states => ({ ...states, [connectionId]: 'connecting' })); setBusy(true); setStatus(`Connecting to ${active.name}…`);
    const res = await window.workbench.connect({ id: connectionId, profile: active }); setBusy(false);
    if (res.ok) {
      setConnected(c => c.includes(connectionId) ? c : [...c, connectionId]);
      setConnectionStates(states => ({ ...states, [connectionId]: 'connected' }));
      setProfiles(all => all.map(p => p.id === connectionId ? { ...p, lastUsedAt: Date.now() } : p));
      setStatus(`Connected to ${active.name}`);
      await loadObjectTree(connectionId, active.database || '');
    } else {
      setConnectionStates(states => ({ ...states, [connectionId]: 'failed' }));
      setStatus(`Connection failed: ${res.error.message}`); setError(res.error.message);
    }
  }
  async function disconnect() {
    if (!active) return; const id = active.id; const res = await window.workbench.disconnect({ id });
    setConnected(c => c.filter(item => item !== id)); setConnectionStates(states => ({ ...states, [id]: 'disconnected' }));
    if (activeId === id) setObjectTree(null);
    setStatus(res.ok ? `Disconnected from ${active.name}` : 'Disconnect failed');
  }
  async function runQuery(statement = query, tabId = tab.id) {
    if (!active || !isConnected || !statement.trim()) return false;
    const patch = changes => patchTab(changes, tabId);
    setBusy(true); setStatus('Executing…'); patch({ error: '' }); const started = performance.now();
    const res = await window.workbench.query({ id: active.id, query: statement.trim() }); setBusy(false);
    if (!res.ok) {
      const message = res.error.message || 'Unknown error';
      patch({ error: `${message}${res.error.code ? `\n\nCode: ${res.error.code}` : ''}`, meta: 'Query failed', result: null }); setStatus(`Error: ${message}`);
      if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|57P01|08006|08001|connection terminated|not connected|server closed the connection/i.test(`${res.error.code || ''} ${message}`)) {
        setConnected(all => all.filter(id => id !== active.id)); setConnectionStates(states => ({ ...states, [active.id]: 'failed' })); setObjectTree(null);
      }
      return false;
    }
    const data = { ...res.result, elapsedMs: Math.round(performance.now() - started) };
    patch({ result: data, meta: `${data.message || 'Completed'} · ${data.elapsedMs} ms`, selectedIndex: null }); setStatus('Query completed');
    return true;
  }
  function exportResult() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result.json ?? result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'query-results.json'; a.click(); URL.revokeObjectURL(url);
  }
  function exportCsv() {
    if (!result) return;
    const columns = result.columns || [];
    const canMapRecords = result.json?.length && result.json.every(record => columns.every(column => Object.prototype.hasOwnProperty.call(record, column)));
    const rows = canMapRecords ? result.json.map(record => columns.map(column => record[column])) : (result.rows || []);
    const csv = [columns, ...rows].map(row => row.map(value => {
      const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    }).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'query-results.csv'; a.click(); URL.revokeObjectURL(url);
  }
  async function copyText(value) {
    if (value == null) return;
    try { await navigator.clipboard.writeText(typeof value === 'string' ? value : JSON.stringify(value, null, 2)); setStatus('Copied to clipboard'); }
    catch { setStatus('Clipboard access is unavailable'); }
  }
  const hasSelection = selectedIndex !== null;
  const selectedRow = hasSelection ? result?.rows?.[selectedIndex] : null;
  const selectedJson = hasSelection ? (result?.json?.[selectedIndex] ?? selectedRow) : null;
  const canEditSelected = Boolean(hasSelection && ((active?.type === 'mongodb' || active?.type === 'firestore' || (active?.type === 'supabase' && !active.connectionString)) || (selectedObject?.primaryKey?.length && selectedObject.primaryKey.every(key => selectedJson?.[key] !== undefined))));  const upd = key => value => { setTestState('idle'); setProfile(p => ({ ...p, [key]: value })); };
  function textField(label, key, placeholder, { required = false, type = 'text', helperText } = {}) {
    return <Field key={key} label={label} type={type} value={profile[key] || ''} onChange={upd(key)} placeholder={placeholder} required={required} helperText={helperText} />;
  }
  function secretField(label, key, placeholder) {
    return <PasswordInput key={key} label={label} value={profile[key] || ''} onChange={upd(key)} placeholder={placeholder} autoComplete="off" />;
  }
  function pathField(label, key, placeholder, onPick, buttonLabel) {
    return <Flex align="end" gap={2}><div className="min-w-0 flex-1"><Field label={label} value={profile[key] || ''} onChange={() => {}} placeholder={placeholder} readOnly required /></div><Button type="button" onClick={onPick}>{buttonLabel}</Button></Flex>;
  }
  function sslFields(label = 'Use TLS/SSL') {
    return <Stack gap={2}>
      <Checkbox label={label} checked={profile.ssl} onChange={upd('ssl')} />
      {profile.ssl && <Checkbox label="Allow untrusted / self-signed certificate" description="Disables certificate verification. Use only for hosts you trust." checked={profile.sslAllowUntrusted} onChange={upd('sslAllowUntrusted')} />}
    </Stack>;
  }
  function sshFields() {
    if (profile.type === 'firestore' || (profile.type === 'supabase' && !profile.connectionString)) return null;
    return <Stack gap={3}>
      <Divider />
      <Checkbox label="Connect through an SSH tunnel" checked={profile.sshEnabled} onChange={upd('sshEnabled')} />
      {profile.sshEnabled && <>
        <div className="grid grid-cols-2 gap-3">{textField('SSH host', 'sshHost', 'bastion.example.com', { required: true })}{textField('SSH port', 'sshPort', '22', { required: true, type: 'number' })}</div>
        <div className="grid grid-cols-2 gap-3">
          {textField('SSH username', 'sshUsername', 'ssh_user', { required: true })}
          <Select label="SSH authentication" value={profile.sshAuthMethod} onChange={upd('sshAuthMethod')} options={[{ value: 'password', label: 'Password' }, { value: 'privateKey', label: 'Private key' }]} />
        </div>
        {profile.sshAuthMethod === 'password'
          ? secretField('SSH password', 'sshPassword', 'Password')
          : <>{pathField('SSH private key', 'sshKeyPath', 'Choose a private key', chooseSshKey, 'Choose key')}{secretField('Key passphrase (optional)', 'sshPassphrase', 'Passphrase')}</>}
        {textField('Remote database host (optional)', 'sshRemoteHost', 'Defaults to the database host')}
      </>}
    </Stack>;
  }
  function dynamicFields() {
    if (profile.type === 'mysql' || profile.type === 'postgres') return <>
      {secretField('Connection string (optional)', 'connectionString', profile.type === 'mysql' ? 'mysql://user:password@host:3306/database' : 'postgresql://user:password@host:5432/database')}
      {!profile.connectionString && <>
        <div className="grid grid-cols-[1fr_8rem] gap-3">{textField('Host', 'host', 'db.example.com', { required: true })}{textField('Port', 'port', profile.type === 'mysql' ? '3306' : '5432', { required: true, type: 'number' })}</div>
        <div className="grid grid-cols-2 gap-3">{textField('Database', 'database', 'database_name', { required: true })}{textField('Username', 'username', 'db_user', { required: true })}</div>
        {secretField('Password', 'password', 'Password')}
      </>}
      {sslFields()}{sshFields()}
    </>;
    if (profile.type === 'mongodb') return <>
      {secretField('MongoDB URI', 'uri', 'mongodb+srv://user:password@cluster.example.mongodb.net/')}
      {textField('Database (optional)', 'database', 'database_name', { helperText: 'Authentication is configured in the URI.' })}
      {sshFields()}
    </>;
    if (profile.type === 'supabase') return <>
      {secretField('PostgreSQL connection string', 'connectionString', 'postgresql://user:password@host:5432/postgres')}
      <HelperText>Find it in Project Settings → Database → Connection string.</HelperText>
      <div className="grid grid-cols-2 gap-3">{textField('Project URL (optional REST)', 'restUrl', 'https://your-project.supabase.co')}{secretField('API key (optional REST)', 'apiKey', 'Publishable / anon key')}</div>
      <HelperText>Without a connection string, both REST fields are required.</HelperText>
      {sslFields('Use TLS/SSL for PostgreSQL')}{sshFields()}
    </>;
    return <>
      {pathField('Service-account JSON file', 'serviceAccountPath', 'Choose a JSON key file', async () => { setTestState('idle'); await chooseFile(); }, 'Choose file')}
      {textField('Firebase project ID (optional)', 'projectId', 'my-firebase-project')}
      <Alert tone="warning">Firestore Admin SDK credentials bypass Firestore Security Rules. Use a dedicated, least-privilege service account.</Alert>
    </>;
  }

  const gridColumns = (result?.columns || []).map((column, j) => ({
    key: `c${j}`, header: column, sortable: true, accessor: row => row[`c${j}`],
    render: row => <span className="block max-w-[22rem] truncate" title={String(row[`c${j}`] ?? '')}>{row[`c${j}`] ?? ''}</span>
  }));
  const gridRows = (result?.rows || []).map((row, index) => Object.fromEntries([['__i', index], ...row.map((value, j) => [`c${j}`, value])]));

  function resultBody() {
    if (error) return <div className="p-4"><Alert tone="danger" title="Query failed"><span className="whitespace-pre-wrap">{error}</span></Alert></div>;
    if (!result) return <Stack gap={3} className="items-center px-6 py-14 text-center">
      <DatabaseIcon className="h-9 w-9 text-app-muted" />
      <h2 className="text-lg font-semibold">Your databases, one workspace</h2>
      <HelperText>Create a connection, connect, then browse an object or run a query.</HelperText>
      <Flex gap={2} wrap justify="center">{Object.values(engines).map(x => <Chip key={x.label}>{x.label}</Chip>)}</Flex>
    </Stack>;
    if (view === 'json') return <div className="p-2"><CodeDisplay language="json" code={JSON.stringify(result.json ?? { columns: result.columns, rows: result.rows, message: result.message }, null, 2)} maxHeight="70vh" copyable /></div>;
    if (!gridColumns.length) return <Stack gap={1} className="px-6 py-10 text-center"><h2 className="text-base font-semibold">{result.message || 'Command completed'}</h2><HelperText>No tabular rows returned.</HelperText></Stack>;
    return <Stack gap={2} className="p-2">
      <Flex gap={2} wrap align="center">
        <Button variant="secondary" disabled={!selectedObject || selectedObject.type === 'view'} onClick={() => openRecordEditor('insert')}><PlusIcon /> Insert</Button>
        <Button variant="secondary" disabled={!canEditSelected} onClick={() => openRecordEditor('edit')}><EditIcon /> Edit</Button>
        <Button variant="danger" disabled={!canEditSelected} onClick={() => openRecordEditor('delete')}><Trash2Icon /> Delete</Button>
        <Divider orientation="vertical" className="h-6" />
        <Button variant="secondary" disabled={!hasSelection} onClick={() => setRecordOpen(true)}><EyeIcon /> View record</Button>
        <Button variant="secondary" disabled={!hasSelection} onClick={() => copyText(selectedJson)}><CopyIcon /> Copy row</Button>
        <Button variant="flat" disabled={!isConnected || busy} tooltip="Re-run query" onClick={() => runQuery()}><RefreshIcon /></Button>
      </Flex>
      <DataGrid columns={gridColumns} rows={gridRows} rowKey="__i" searchable selectable pageSize={50} pageSizeOptions={[25, 50, 100]}
        selected={hasSelection ? [selectedIndex] : []}
        onSelectionChange={keys => { const fresh = keys.filter(k => k !== selectedIndex); setSelectedIndex(fresh.length ? fresh[fresh.length - 1] : keys.length ? keys[keys.length - 1] : null); }}
        empty="No rows returned." caption="Query results" />
    </Stack>;
  }

  function renderObjectBrowser() {
    if (!active || !isConnected) return <HelperText className="p-4">Connect to browse databases and objects.</HelperText>;
    const objects = (objectTree?.objects || []).filter(item => item.name.toLowerCase().includes(objectSearch.trim().toLowerCase()));
    const objectTypes = [...new Set(objects.map(item => item.type || 'object'))];
    const typeLabel = type => ({ table: 'Tables', view: 'Views', collection: 'Collections' }[type] || type);
    const lookup = new Map();
    const nodes = objectTypes.map(type => {
      const items = objects.filter(item => (item.type || 'object') === type);
      return {
        key: `group:${type}`, label: <span className="font-semibold">{typeLabel(type)} <span className="text-app-muted">({items.length})</span></span>,
        children: items.map(item => {
          const key = `obj:${item.schema || ''}.${item.name}`; lookup.set(key, item);
          return { key, label: <span className="flex min-w-0 items-center gap-2"><span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{type === 'collection' ? <FolderIcon /> : <TableIcon />}</span><span className="truncate">{item.name}</span>{item.columns?.length ? <span className="ml-auto shrink-0 text-[10px] text-app-muted">{item.columns.length} cols</span> : null}</span> };
        })
      };
    });
    const selectedKey = selectedObject ? `obj:${selectedObject.schema || ''}.${selectedObject.name}` : undefined;
    return <Stack gap={2} className="p-2">
      <Flex justify="between" align="center">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-app-muted">Database objects</span>
        <Button variant="flat" tooltip="Refresh objects" aria-label="Refresh objects" disabled={treeLoading} onClick={() => loadObjectTree()}><RefreshIcon /></Button>
      </Flex>
      {!!objectTree?.databases?.length && <Select label="Database" disabled={treeLoading} value={currentDatabase || objectTree.databases[0]} onChange={changeDatabase} options={objectTree.databases.map(db => ({ value: db, label: db }))} />}
      {!!objectTree?.schemas?.length && <Select label="Schema" disabled={treeLoading} value={currentSchema} placeholder="All schemas" onChange={value => { setCurrentSchema(value); loadObjectTree(active.id, currentDatabase, value); }} options={[{ value: '', label: 'All schemas' }, ...objectTree.schemas.map(schema => ({ value: schema, label: schema }))]} />}
      {!!objectTree?.objects?.length && <Input value={objectSearch} onChange={setObjectSearch} placeholder="Search objects…" aria-label="Search database objects" startAdornment={<SearchIcon className="h-4 w-4" />} />}
      {treeLoading && <Loader variant="inline" size="sm" label="Loading objects…" />}
      {!treeLoading && objectTree?.message && <HelperText>{objectTree.message}</HelperText>}
      {!treeLoading && !objectTree?.message && !objects.length && <HelperText>{objectSearch ? 'No objects match this search.' : 'No databases or objects available.'}</HelperText>}
      {!treeLoading && !!nodes.length && <Tree key={`${currentDatabase}|${currentSchema}|${objectTree?.objects?.length}|${objectSearch}`} label="Database objects" nodes={nodes} defaultExpanded={nodes.map(n => n.key)} selected={selectedKey} onSelect={key => { const item = lookup.get(key); if (item) openObject(item); }} />}
    </Stack>;
  }

  const orderedProfiles = [...profiles].sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || (b.lastUsedAt || 0) - (a.lastUsedAt || 0) || a.name.localeCompare(b.name));
  const connectionStatus = id => connectionStates[id] || (connected.includes(id) ? 'connected' : 'disconnected');
  const profileGroups = [...new Set(orderedProfiles.map(p => p.group?.trim() || 'Connections'))];
  const showSections = profileGroups.length > 1 || profileGroups[0] !== 'Connections';
  const connectionItems = profileGroups.flatMap(group => [
    ...(showSections ? [{ key: `section:${group}`, label: group, section: true }] : []),
    ...orderedProfiles.filter(p => (p.group?.trim() || 'Connections') === group).map(p => ({
      key: p.id, label: `${p.favorite ? '★ ' : ''}${p.name}`,
      icon: <span className="inline-flex items-center gap-1.5 text-[10px] font-bold"><StatusDot state={connectionStatus(p.id)} />{engines[p.type].icon}</span>,
      onClick: () => chooseConnection(p)
    }))
  ]);

  function toggleNav(currentlyCollapsed) {
    const next = !currentlyCollapsed;
    setNavCollapsed(next);
    try { localStorage.setItem('udw-nav-collapsed', next ? '1' : '0'); } catch {}
  }
  const renderSidebar = (close, { inDrawer, collapsed: autoCollapsed }) => {
    const collapsed = !inDrawer && (navCollapsed ?? autoCollapsed);
    const items = collapsed ? connectionItems.filter(item => !item.section) : connectionItems;
    return <div className={`flex h-full flex-col border-r border-app-border bg-app-card ${inDrawer ? 'w-full' : collapsed ? 'w-14' : 'w-64'}`}>
      <Flex align="center" justify={collapsed ? 'center' : 'between'} gap={2} className={`shrink-0 border-b border-app-border ${collapsed ? 'px-1 py-2' : 'px-3 py-2'}`}>
        <Flex align="center" gap={2} className="min-w-0"><span className="flex h-9 w-9 shrink-0 items-center justify-center text-app-strong"><Logo className="h-7 w-7" /></span>{!collapsed && <span className="truncate text-sm font-bold" title="Universal DB Workbench">DB Workbench</span>}</Flex>
        {!collapsed && !inDrawer && <Button variant="flat" tooltip="Collapse sidebar" aria-label="Collapse sidebar" onClick={() => toggleNav(false)}><ChevronLeftIcon /></Button>}
      </Flex>
      <Flex direction={collapsed ? 'column' : 'row'} align="center" gap={2} className={`shrink-0 border-b border-app-border ${collapsed ? 'px-1 py-2' : 'px-3 py-2'}`}>
        <Button className={collapsed ? '' : 'flex-1'} tooltip={collapsed ? 'New connection' : undefined} tooltipPlacement="right" aria-label="New connection" onClick={() => { openDialog(); close(); }}><PlusIcon />{!collapsed && ' New connection'}</Button>
        {collapsed && <Button variant="flat" tooltip="Expand sidebar" tooltipPlacement="right" aria-label="Expand sidebar" onClick={() => toggleNav(true)}><ChevronRightIcon /></Button>}
      </Flex>
      <Sidebar label="Connections" bordered={false} density="dense" collapsed={collapsed} className="!h-auto !w-full max-h-[42%] min-h-0 flex-none" activeKey={activeId || undefined}
        items={items.map(item => item.section ? item : { ...item, onClick: () => { item.onClick(); close(); } })}
        headerClassName={collapsed ? 'hidden' : 'px-3 py-2'}
        header={<Flex justify="between" align="center"><span className="text-xs font-semibold uppercase tracking-widest text-app-muted">Connections</span><Button variant="flat" tooltip="Refresh connections" aria-label="Refresh connections" onClick={refreshConnections}><RefreshIcon /></Button></Flex>} />
      {!collapsed && <>
        {!connectionItems.length && <HelperText className="px-4 pb-3">Add a connection to get started.</HelperText>}
        <Divider />
        <div className="min-h-0 flex-1 overflow-y-auto">{renderObjectBrowser()}</div>
        <Divider />
        <HelperText className="px-4 py-2">Credentials are encrypted on this device</HelperText>
      </>}
    </div>;
  };

  const connectionMenu = [
    { key: 'edit', label: 'Edit connection', icon: <EditIcon />, disabled: !active, hasDialog: true, onClick: () => openDialog(active) },
    { key: 'duplicate', label: 'Duplicate', icon: <CopyIcon />, disabled: !active, onClick: () => duplicateConnection(active) },
    { key: 'favorite', label: active?.favorite ? 'Remove favorite' : 'Add favorite', icon: <StarIcon />, disabled: !active, onClick: () => toggleFavorite(active.id) },
    { key: 'refresh', label: 'Refresh objects', icon: <RefreshIcon />, disabled: !isConnected, onClick: () => loadObjectTree() },
    { key: 'delete', label: 'Delete connection', icon: <Trash2Icon />, tone: 'warning', disabled: !active, hasDialog: true, onClick: () => setDeleteTarget(active) }
  ];
  const exportMenu = [
    { key: 'json', label: 'Export JSON', icon: <DownloadIcon />, disabled: !result, onClick: exportResult },
    { key: 'csv', label: 'Export CSV', icon: <DownloadIcon />, disabled: !result, onClick: exportCsv }
  ];

  return <ThemeProvider storageKey="universal-db-theme">
    <ThemeBridge />
    <div className="flex h-screen overflow-hidden bg-app-bg text-app-text">
      {isMd && <aside className="shrink-0">{renderSidebar(() => {}, { inDrawer: false, collapsed: !isLg })}</aside>}
      <main className="min-w-0 flex-1 overflow-y-auto p-2">
      <Stack gap={2}>
        <Flex gap={2} align="center" justify="between" wrap>
          <Flex gap={2} align="center" className="min-w-0">{!isMd && <Button variant="secondary" aria-label="Open menu" onClick={() => setDrawerOpen(true)}><MenuIcon /></Button>}{active && <StatusDot state={connectionStatus(active.id)} />}<strong className="truncate text-sm">{active?.name || 'No connection selected'}</strong><HelperText className="truncate">{engine?.help || 'Select or create a connection to begin'}</HelperText></Flex>
          <Flex gap={2} align="center">
            <Button disabled={!active || isConnected || busy} onClick={() => connect()}><PowerIcon /> Connect</Button>
            <Button variant="secondary" disabled={!isConnected || busy} onClick={() => disconnect()}>Disconnect</Button>
            <Button disabled={!isConnected || busy} tooltip="Ctrl / ⌘ + Enter" onClick={() => runQuery()}><PlayIcon /> {busy ? 'Working…' : 'Run'}</Button>
            <ActionMenu label="Connection actions" variant="secondary" placement="bottom-end" trigger={<MoreVerticalIcon />} items={connectionMenu} />
          </Flex>
        </Flex>
        {!!connTabs.length && <Flex gap={1} align="center">
          <div className="min-w-0 flex-1"><Tabs value={tab.id} onChange={setActiveTabId} items={connTabs.map(t => ({ key: t.id, label: <span className="inline-flex max-w-[12rem] items-center gap-2"><span className="truncate">{t.title}</span><span role="button" aria-label={`Close ${t.title}`} className="shrink-0 rounded p-0.5 opacity-60 hover:bg-app-border hover:opacity-100 [&>svg]:h-3 [&>svg]:w-3" onClick={e => { e.stopPropagation(); closeTab(t.id); }}><CloseIcon /></span></span> }))} /></div>
          <Button variant="flat" tooltip="New query tab (Ctrl+T)" aria-label="New query tab" disabled={!active} onClick={() => addTab()}><PlusIcon /></Button>
        </Flex>}
        <div className="[&_textarea]:font-mono [&_textarea]:text-[13px]">
          <TextArea aria-label="Query editor" rows={3} spellCheck={false} value={query}
            onChange={value => { setQuery(value); if (activeId) setLastQueries(queries => ({ ...queries, [activeId]: value })); }}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); } }} />
        </div>
        <Card title="Results" subtitle={`${meta} · ${status}`} padded={false}
          actions={<Flex gap={2} align="center" wrap>
            <ToggleButtonGroup exclusive aria-label="Result view" value={view} onChange={value => value && setView(value)}><ToggleButton value="table">Table</ToggleButton><ToggleButton value="json">JSON</ToggleButton></ToggleButtonGroup>
            <ActionMenu label="Export results" variant="secondary" placement="bottom-end" trigger={<><DownloadIcon /> Export</>} items={exportMenu} />
          </Flex>}>
          {resultBody()}
        </Card>
      </Stack>
      </main>
    </div>
    <Drawer open={drawerOpen && !isMd} onClose={() => setDrawerOpen(false)} title="Connections" side="left" width="max-w-xs" padded={false}>{renderSidebar(() => setDrawerOpen(false), { inDrawer: true, collapsed: false })}</Drawer>

    <Modal open={dialogOpen} onClose={() => setDialogOpen(false)} title={editingId ? 'Edit connection' : 'New connection'} as="form" noValidate onSubmit={addConnection} maxWidth="max-w-xl" busy={testState === 'testing'}
      footer={<Flex justify="end" gap={2}><Button type="button" variant="secondary" disabled={testState === 'testing'} onClick={testConnection}>{testState === 'testing' ? 'Testing…' : 'Test connection'}</Button><Button type="button" variant="flat" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit">{editingId ? 'Save changes' : 'Save connection'}</Button></Flex>}>
      <Stack gap={3} className="p-5">
        <HelperText>Credentials are encrypted before they are saved on this device.</HelperText>
        <div className="grid grid-cols-2 gap-3">{textField('Connection name', 'name', 'Development database', { required: true })}{textField('Folder / group', 'group', 'Connections')}</div>
        <Select label="Database type" value={profile.type} onChange={selectEngine} options={Object.entries(engines).map(([value, item]) => ({ value, label: item.label }))} />
        {dynamicFields()}
        {formError && <Alert tone={testState === 'success' ? 'success' : testState === 'failed' ? 'danger' : 'info'}>{formError}</Alert>}
      </Stack>
    </Modal>

    <Modal open={recordEditorOpen} onClose={() => setRecordEditorOpen(false)} as="form" noValidate onSubmit={applyRecordChange} maxWidth="max-w-2xl" tone={recordAction === 'delete' ? 'danger' : 'default'}
      title={`${recordAction === 'insert' ? 'Insert' : recordAction === 'edit' ? 'Edit' : 'Delete'} record · ${selectedObject?.name || ''}`}
      footer={<Flex justify="end" gap={2}><Button type="button" variant="flat" onClick={() => setRecordEditorOpen(false)}>Cancel</Button><Button type="submit" variant={recordAction === 'delete' ? 'danger' : 'default'}>{recordAction === 'insert' ? 'Insert' : recordAction === 'edit' ? 'Save changes' : 'Delete'}</Button></Flex>}>
      <Stack gap={3} className="p-5">
        {formError && <Alert tone="danger">{formError}</Alert>}
        {recordAction === 'delete' && <Alert tone="warning">Confirm the record below. Deleting cannot be undone.</Alert>}
        <div className="[&_textarea]:font-mono [&_textarea]:text-xs">
          <TextArea label="Record JSON" rows={14} spellCheck={false} value={recordJsonText} onChange={setRecordJsonText} />
        </div>
      </Stack>
    </Modal>

    <Modal open={recordOpen} onClose={() => setRecordOpen(false)} title="Record contents" maxWidth="max-w-2xl"
      footer={<Flex justify="end" gap={2}><Button variant="secondary" onClick={() => copyText(selectedJson)}><CopyIcon /> Copy record</Button><Button onClick={() => setRecordOpen(false)}>Close</Button></Flex>}>
      <div className="p-5"><CodeDisplay language="json" code={JSON.stringify(selectedJson, null, 2) || ''} maxHeight={420} copyable={false} /></div>
    </Modal>

    <ConfirmDialog open={!!deleteTarget} tone="danger" title="Delete connection" confirmLabel="Delete" onClose={() => setDeleteTarget(null)} onConfirm={() => deleteConnection(deleteTarget)}>
      Delete connection “{deleteTarget?.name}”? This cannot be undone.
    </ConfirmDialog>
  </ThemeProvider>;
}

createRoot(document.getElementById('root')).render(<App />);
