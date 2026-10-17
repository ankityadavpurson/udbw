import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, Button, Card, Badge, Alert } from 'xedonium';
import ThemeToggle from 'xedonium/ThemeToggle';
import commandMark from './command-mark.svg';
import 'xedonium/styles.css';
import './styles.css';

const engines = {
  mysql: { label: 'MySQL', icon: 'MY', query: 'SELECT 1 AS connection_test;', help: 'SQL mode · MySQL queries execute on the selected database.' },
  postgres: { label: 'PostgreSQL', icon: 'PG', query: 'SELECT 1 AS connection_test;', help: 'SQL mode · PostgreSQL queries execute on the selected database.' },
  mongodb: { label: 'MongoDB', icon: 'MO', query: 'collections', help: 'Mongo mode · Use “collections” or find collection_name {"status":"active"} LIMIT 100.' },
  supabase: { label: 'Supabase', icon: 'SB', query: 'SELECT current_database(), current_user;', help: 'SQL mode uses PostgreSQL. REST mode: REST: table_name LIMIT 100' },
  firestore: { label: 'Firebase Firestore', icon: 'FS', query: 'collections', help: 'Firestore mode · Use “collections” or “read collection_name LIMIT 100”.' }
};
const blankProfile = { name: '', type: 'mysql', host: '', port: '3306', database: '', username: '', password: '', uri: '', connectionString: '', restUrl: '', apiKey: '', projectId: '', serviceAccountPath: '', ssl: false, sshEnabled: false, sshHost: '', sshPort: '22', sshUsername: '', sshAuthMethod: 'password', sshPassword: '', sshKeyPath: '', sshPassphrase: '', sshRemoteHost: '' };

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
  const [resultFilter, setResultFilter] = useState('');
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState(1);
  const [page, setPage] = useState(0);
  const [selectedCell, setSelectedCell] = useState(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordEditorOpen, setRecordEditorOpen] = useState(false);
  const [recordAction, setRecordAction] = useState('insert');
  const [recordJsonText, setRecordJsonText] = useState('{}');
  const [selectedObject, setSelectedObject] = useState(null);
  const [profile, setProfile] = useState(blankProfile);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [query, setQuery] = useState(engines.mysql.query);
  const [view, setView] = useState('table');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState('No query executed');
  const [status, setStatus] = useState('Ready');
  const [busy, setBusy] = useState(false);
  const formDialog = useRef(null);
  const recordDialog = useRef(null);
  const recordEditorDialog = useRef(null);
  const pendingSaveRef = useRef(false);
  const active = profiles.find(p => p.id === activeId);
  const isConnected = active && connected.includes(active.id);
  const engine = active ? engines[active.type] : null;

  useEffect(() => {
    const iconLink = document.querySelector('link[rel="icon"]');
    if (iconLink) iconLink.href = commandMark;
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.workbench.loadConnections().then(saved => {
      if (cancelled) return;
      if (saved.ok) {
        setStorageReady(true);
        setProfiles(saved.profiles || []); setLastQueries(saved.lastQueries || {});
        const lastId = saved.activeId && saved.profiles?.some(p => p.id === saved.activeId) ? saved.activeId : null;
        setActiveId(lastId);
        if (lastId) {
          const last = saved.profiles.find(p => p.id === lastId);
          if (last) setQuery(saved.lastQueries?.[lastId] || engines[last.type]?.query || engines.mysql.query);
        }
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
    const node = formDialog.current;
    if (!node) return;
    if (dialogOpen && !node.open) node.showModal();
    if (!dialogOpen && node.open) node.close();
  }, [dialogOpen]);

  useEffect(() => {
    const node = recordDialog.current;
    if (!node) return;
    if (recordOpen && !node.open) node.showModal();
    if (!recordOpen && node.open) node.close();
  }, [recordOpen]);

  useEffect(() => {
    const node = recordEditorDialog.current;
    if (!node) return;
    if (recordEditorOpen && !node.open) node.showModal();
    if (!recordEditorOpen && node.open) node.close();
  }, [recordEditorOpen]);

  useEffect(() => {
    const onShortcut = event => {
      const key = event.key.toLowerCase();
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
  }, [activeId, active, connected, connectionStates, currentDatabase, currentSchema, treeLoading, busy]);

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
    setStorageReady(true); setActiveId(next.id); setQuery(lastQueries[next.id] || engines[next.type].query); setDialogOpen(false);
  }
  async function chooseConnection(p) {
    const used = { ...p, lastUsedAt: Date.now() };
    setProfiles(all => all.map(item => item.id === p.id ? used : item));
    setActiveId(p.id); setQuery(lastQueries[p.id] || engines[p.type].query); setResult(null); setError(''); setMeta('No query executed'); setCurrentDatabase(p.database || ''); setCurrentSchema(''); setObjectSearch(''); setStatus(`Selected ${p.name}`);
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
  async function openObject(object) {
    setSelectedObject(object); setSelectedCell(null);
    let statement;
    if (active?.type === 'mongodb') statement = `find ${object.name} LIMIT 100`;
    else if (active?.type === 'firestore') statement = `read ${object.name} LIMIT 100`;
    else if (active?.type === 'supabase' && !active.connectionString) statement = `REST: ${object.name} LIMIT 100`;
    else if (active?.type === 'mysql') statement = `SELECT * FROM \`${object.name.replace(/`/g, '``')}\` LIMIT 100;`;
    else statement = `SELECT * FROM "${(object.schema ? `${object.schema}"."` : '')}${object.name.replace(/"/g, '""')}" LIMIT 100;`;
    setQuery(statement); setStatus(`Browsing ${object.name}…`); await runQuery(statement);
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
    if (recordAction === 'delete' && !window.confirm('Delete this record/document? This cannot be undone.')) return;
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
    if (await runQuery(statement)) await openObject(object);
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
      const tested = await window.workbench.test({ ...profile, name: profile.name.trim() });
      if (tested.ok) { setTestState('success'); setFormError('Connection test succeeded. Save when ready.'); }
      else { setTestState('failed'); setFormError(`Connection test failed: ${tested.error?.message || 'Check the connection settings.'}`); }
    } catch (err) {
      // IPC can reject when the main process or a driver fails before returning
      // its normal { ok, error } response. Always leave the test button usable.
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
    if (!window.confirm(`Delete connection “${p.name}”? This cannot be undone.`)) return;
    if (connected.includes(p.id)) await window.workbench.disconnect({ id: p.id });
    setConnected(all => all.filter(id => id !== p.id));
    setConnectionStates(states => { const next = { ...states }; delete next[p.id]; return next; });
    setProfiles(all => all.filter(item => item.id !== p.id)); setStorageReady(true);
    setLastQueries(all => { const next = { ...all }; delete next[p.id]; return next; });
    if (activeId === p.id) { setActiveId(null); setResult(null); }
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
  async function runQuery(statement = query) {
    if (!active || !isConnected || !statement.trim()) return false;
    setBusy(true); setStatus('Executing…'); setError(''); const started = performance.now();
    const res = await window.workbench.query({ id: active.id, query: statement.trim() }); setBusy(false);
    if (!res.ok) {
      const message = res.error.message || 'Unknown error';
      setError(`${message}${res.error.code ? `\n\nCode: ${res.error.code}` : ''}`); setMeta('Query failed'); setResult(null); setStatus(`Error: ${message}`);
      if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|57P01|08006|08001|connection terminated|not connected|server closed the connection/i.test(`${res.error.code || ''} ${message}`)) {
        setConnected(all => all.filter(id => id !== active.id)); setConnectionStates(states => ({ ...states, [active.id]: 'failed' })); setObjectTree(null);
      }
      return false;
    }
    const data = { ...res.result, elapsedMs: Math.round(performance.now() - started) };
    setResult(data); setMeta(`${data.message || 'Completed'} · ${data.elapsedMs} ms`); setStatus('Query completed');
    setResultFilter(''); setSortColumn(null); setPage(0); setSelectedCell(null);
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
  const allRows = (result?.rows || []).map((row, index) => ({ row, index }));
  const filteredRows = allRows.filter(({ row }) => !resultFilter.trim() || row.some(value => String(value ?? '').toLowerCase().includes(resultFilter.trim().toLowerCase())));
  if (sortColumn !== null) filteredRows.sort((a, b) => String(a.row[sortColumn] ?? '').localeCompare(String(b.row[sortColumn] ?? ''), undefined, { numeric: true, sensitivity: 'base' }) * sortDirection);
  const pageSize = 50;
  const pageRows = filteredRows.slice(page * pageSize, (page + 1) * pageSize);
  const selectedRow = selectedCell ? result?.rows?.[selectedCell.row] : null;
  const selectedJson = selectedCell ? (result?.json?.[selectedCell.row] ?? selectedRow) : null;
  const canEditSelected = Boolean(selectedCell && ((active?.type === 'mongodb' || active?.type === 'firestore' || (active?.type === 'supabase' && !active.connectionString)) || (selectedObject?.primaryKey?.length && selectedObject.primaryKey.every(key => selectedJson?.[key] !== undefined))));
  function field(label, key, placeholder, type = 'text', required = false) {
    const secret = ['password','apiKey','connectionString','uri','sshPassword','sshPassphrase'].includes(key);
    const actualType = secret ? (passwordVisible ? 'text' : 'password') : type;
    const inputType = ['port','sshPort'].includes(key) ? 'number' : actualType;
    return <label className="form-field" key={key}>{label}<span className="input-with-action"><input type={inputType} min={inputType === 'number' ? 1 : undefined} max={inputType === 'number' ? 65535 : undefined} required={required} placeholder={placeholder} value={profile[key] || ''} onChange={e => { setTestState('idle'); setProfile(p => ({ ...p, [key]: e.target.value })); }} />{secret && <button type="button" className="text-action" onClick={() => setPasswordVisible(v => !v)}>{passwordVisible ? 'Hide' : 'Show'}</button>}</span></label>;
  }
  function sshFields() {
    if (profile.type === 'firestore' || (profile.type === 'supabase' && !profile.connectionString)) return null;
    return <div className="ssh-fields"><label className="check-row"><input type="checkbox" checked={profile.sshEnabled} onChange={e => { setTestState('idle'); setProfile(p => ({ ...p, sshEnabled: e.target.checked })); }} /> Connect through an SSH tunnel</label>{profile.sshEnabled && <><div className="field-grid">{field('SSH host','sshHost','bastion.example.com','text',true)}{field('SSH port','sshPort','22','text',true)}</div><div className="field-grid">{field('SSH username','sshUsername','ssh_user','text',true)}<label className="form-field">SSH authentication<select value={profile.sshAuthMethod} onChange={e => { setTestState('idle'); setProfile(p => ({ ...p, sshAuthMethod: e.target.value })); }}><option value="password">Password</option><option value="privateKey">Private key</option></select></label></div>{profile.sshAuthMethod === 'password' ? field('SSH password','sshPassword','Password','password',true) : <><label className="form-field">SSH private key<div className="file-picker"><input readOnly required value={profile.sshKeyPath} placeholder="Choose a private key" /><Button type="button" onClick={chooseSshKey}>Choose key</Button></div></label>{field('Key passphrase (optional)','sshPassphrase','Passphrase','password')}</>}{field('Remote database host (optional)','sshRemoteHost','Defaults to the database host')}</>}</div>;
  }
  function dynamicFields() {
    if (profile.type === 'mysql' || profile.type === 'postgres') return <>
      {field('Connection string (optional)','connectionString',profile.type === 'mysql' ? 'mysql://user:password@host:3306/database' : 'postgresql://user:password@host:5432/database')}
      {!profile.connectionString && <><div className="field-grid">{field('Host','host','db.example.com','text',true)}{field('Port','port',profile.type === 'mysql' ? '3306' : '5432','text',true)}</div>
      <div className="field-grid">{field('Database','database','database_name','text',true)}{field('Username','username','db_user','text',true)}</div>
      {field('Password','password','Password','password')}
      </>}
      <label className="check-row"><input type="checkbox" checked={profile.ssl} onChange={e => { setTestState('idle'); setProfile(p => ({ ...p, ssl: e.target.checked })); }} /> Use TLS/SSL</label>{sshFields()}
    </>;
    if (profile.type === 'mongodb') return <>{field('MongoDB URI','uri','mongodb+srv://user:password@cluster.example.mongodb.net/','text',true)}{field('Database (optional)','database','database_name')}<p className="field-note">Authentication is configured in the URI.</p>{sshFields()}</>;
    if (profile.type === 'supabase') return <>{field('PostgreSQL connection string','connectionString','postgresql://user:password@host:5432/postgres')}<p className="field-note">Find it in Project Settings → Database → Connection string.</p><div className="field-grid">{field('Project URL (optional REST)','restUrl','https://your-project.supabase.co')}{field('API key (optional REST)','apiKey','Publishable / anon key')}</div><p className="field-note">Without a connection string, both REST fields are required. REST mode supports API-authorized operations.</p><label className="check-row"><input type="checkbox" checked={profile.ssl} onChange={e => { setTestState('idle'); setProfile(p => ({ ...p, ssl: e.target.checked })); }} /> Use TLS/SSL for PostgreSQL</label>{sshFields()}</>;
    return <><label className="form-field">Service-account JSON file<div className="file-picker"><input readOnly required value={profile.serviceAccountPath} placeholder="Choose a JSON key file" /><Button type="button" onClick={async () => { setTestState('idle'); await chooseFile(); }}>Choose file</Button></div></label>{field('Firebase project ID (optional)','projectId','my-firebase-project')}<Alert tone="warning">Firestore Admin SDK credentials bypass Firestore Security Rules. Use a dedicated, least-privilege service account.</Alert></>;
  }
  function resultPanel() {
    if (error) return <Alert tone="danger" className="result-error">{error}</Alert>;
    if (!result) return <div className="welcome"><div className="welcome-icon">⌘</div><h2>Your databases, one workspace.</h2><p>Create a connection, test it, then run a query or browse data.</p><div className="feature-chips">{Object.values(engines).map(x => <Badge key={x.label}>{x.label}</Badge>)}</div></div>;
    if (view === 'json') return <pre className="json-view">{JSON.stringify(result.json ?? { columns: result.columns, rows: result.rows, message: result.message }, null, 2)}</pre>;
    const cols = result.columns || [], rows = result.rows || [];
    if (!cols.length) return <div className="welcome"><h2>{result.message || 'Command completed'}</h2><p>No tabular rows returned.</p></div>;
    return <div className="table-scroll"><div className="table-tools"><input className="result-filter" value={resultFilter} onChange={e => { setResultFilter(e.target.value); setPage(0); }} placeholder="Filter results…" aria-label="Filter results" /><span>{filteredRows.length} row{filteredRows.length === 1 ? '' : 's'}</span><Button disabled={!isConnected || busy} onClick={() => runQuery()} tooltip="Refresh results">↻</Button><Button disabled={!selectedCell} onClick={() => copyText(selectedCell ? selectedRow?.[selectedCell.col] : null)}>Copy cell</Button><Button disabled={!selectedCell} onClick={() => copyText(selectedJson)}>Copy row / document</Button><Button disabled={!selectedCell} onClick={() => setRecordOpen(true)}>View record</Button><Button disabled={!selectedObject || selectedObject.type === 'view'} onClick={() => openRecordEditor('insert')}>Insert</Button><Button disabled={!canEditSelected} onClick={() => openRecordEditor('edit')}>Edit</Button><Button disabled={!canEditSelected} onClick={() => openRecordEditor('delete')}>Delete</Button></div>{pageRows.length ? <table className="result-table"><thead><tr>{cols.map((column,index) => <th key={column} onClick={() => { setSortDirection(sortColumn === index ? -sortDirection : 1); setSortColumn(index); setPage(0); }}>{column}{sortColumn === index ? (sortDirection > 0 ? ' ↑' : ' ↓') : ''}</th>)}</tr></thead><tbody>{pageRows.map(({row,index}) => <tr key={index}>{cols.map((_,j) => <td key={j} title={row[j] ?? ''} className={selectedCell?.row === index && selectedCell?.col === j ? 'selected-cell' : ''} onClick={() => setSelectedCell({ row:index, col:j })} onDoubleClick={() => { setSelectedCell({ row:index, col:j }); setRecordOpen(true); }}>{row[j] ?? ''}</td>)}</tr>)}</tbody></table> : <div className="object-empty">{resultFilter ? 'No rows match this filter.' : 'No rows returned.'}</div>}<div className="pagination"><span>Page {page + 1} of {Math.max(1, Math.ceil(filteredRows.length / pageSize))}</span><div><Button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</Button><Button disabled={(page + 1) * pageSize >= filteredRows.length} onClick={() => setPage(p => p + 1)}>Next</Button></div></div></div>;
  }

  function renderObjectBrowser() {
    if (!active || !isConnected) return <div className="object-empty">Connect to browse databases and objects.</div>;
    const objects = (objectTree?.objects || []).filter(item => item.name.toLowerCase().includes(objectSearch.trim().toLowerCase()));
    const objectTypes = [...new Set(objects.map(item => item.type || 'object'))];
    return <section className="object-browser">
      <div className="object-browser-head"><strong>DATABASE OBJECTS</strong><button type="button" title="Refresh objects" disabled={treeLoading} onClick={() => loadObjectTree()}>{treeLoading ? '…' : '↻'}</button></div>
      {!!objectTree?.databases?.length && <label className="tree-select">Database<select value={currentDatabase || objectTree.databases[0]} onChange={e => changeDatabase(e.target.value)} disabled={treeLoading}><option value="">Choose database</option>{objectTree.databases.map(db => <option key={db} value={db}>{db}</option>)}</select></label>}
      {!!objectTree?.schemas?.length && <label className="tree-select">Schema<select value={currentSchema} onChange={e => { setCurrentSchema(e.target.value); loadObjectTree(active.id, currentDatabase, e.target.value); }} disabled={treeLoading}><option value="">All schemas</option>{objectTree.schemas.map(schema => <option key={schema} value={schema}>{schema}</option>)}</select></label>}
      {!!objectTree?.objects?.length && <input className="object-search" value={objectSearch} onChange={e => setObjectSearch(e.target.value)} placeholder="Search objects…" aria-label="Search database objects" />}
      {treeLoading && <div className="object-empty">Loading database objects…</div>}
      {!treeLoading && objectTree?.message && <div className="object-empty">{objectTree.message}</div>}
      {!treeLoading && !objectTree?.message && !objects.length && <div className="object-empty">{objectSearch ? 'No objects match this search.' : 'No databases or objects available.'}</div>}
      {!treeLoading && objectTypes.map(type => <details className="object-type-group" key={type} open><summary>{type === 'table' ? 'Tables' : type === 'view' ? 'Views' : type === 'collection' ? 'Collections' : type} <span>{objects.filter(item => (item.type || 'object') === type).length}</span></summary>{objects.filter(item => (item.type || 'object') === type).map(item => <button className="object-item" type="button" key={`${item.schema || ''}.${item.name}`} onClick={() => openObject(item)}><span>{type === 'view' ? '◫' : type === 'collection' ? '▧' : '▤'}</span><span>{item.name}</span><small>{item.columns?.length ? `${item.columns.length} columns` : item.metadata || type}</small></button>)}</details>)}
    </section>;
  }

  const orderedProfiles = [...profiles].sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || (b.lastUsedAt || 0) - (a.lastUsedAt || 0) || a.name.localeCompare(b.name));
  const connectionStatus = id => connectionStates[id] || (connected.includes(id) ? 'connected' : 'disconnected');
  const profileGroups = [...new Set(orderedProfiles.map(p => p.group?.trim() || 'Connections'))];

  return <ThemeProvider storageKey="universal-db-theme"><div className="app-shell">
    <header className="topbar"><div className="brand"><img className="brand-mark" src={commandMark} alt="Command key logo" /><div><strong>Universal DB Workbench</strong><small>One workspace · multiple data engines</small></div></div><div className="top-actions"><Badge color={isConnected ? 'success' : 'secondary'}>{isConnected ? 'Connected' : active ? 'Profile selected' : 'No active connection'}</Badge><ThemeToggle variant="toolbar" /><Button onClick={openDialog}>＋ New connection</Button></div></header>
    <main className="layout"><aside className="sidebar"><div className="side-heading"><span>CONNECTIONS</span><div className="side-heading-actions"><Button className="icon-button" onClick={refreshConnections} tooltip="Refresh connections">↻</Button><Button className="icon-button" onClick={() => openDialog()} tooltip="New connection">＋</Button></div></div><div className="connections-list">{orderedProfiles.length ? profileGroups.map(group => <section className="connection-group" key={group}><h3>{group}</h3>{orderedProfiles.filter(p => (p.group?.trim() || 'Connections') === group).map(p => <div className="connection-row" key={p.id}><button className={`connection-item ${p.id === activeId ? 'selected' : ''}`} onClick={() => chooseConnection(p)}><span className="db-icon">{engines[p.type].icon}</span><span className="connection-text"><strong>{p.name}</strong><small>{engines[p.type].label} · {connectionStatus(p.id)}{p.lastUsedAt ? ' · recent' : ''}</small></span><span className={`state-dot ${connectionStatus(p.id)}`} /></button><div className="connection-tools"><button type="button" title={p.favorite ? 'Remove favorite' : 'Add favorite'} aria-label={p.favorite ? 'Remove favorite' : 'Add favorite'} onClick={() => toggleFavorite(p.id)}>{p.favorite ? '★' : '☆'}</button><button type="button" title="Edit connection" aria-label="Edit connection" onClick={() => openDialog(p)}>✎</button><button type="button" title="Duplicate connection" aria-label="Duplicate connection" onClick={() => duplicateConnection(p)}>⧉</button><button type="button" title="Delete connection" aria-label="Delete connection" onClick={() => deleteConnection(p)}>×</button></div></div>)}</section>) : <div className="empty-side">Add a connection to get started.</div>}</div><div className="objects-panel">{renderObjectBrowser()}</div><div className="sidebar-footer"><span className="dot" />Credentials are encrypted on this device</div></aside>
      <section className="workspace"><div className="tabbar"><div className="tab active">Query workspace</div><div className="tab-hint">{engine ? `${engine.label} · ${isConnected ? 'connected' : 'not connected'}` : 'Select a connection to begin'}</div></div>
        <div className="toolbar"><div className="selected-connection"><span className={`connection-dot ${isConnected ? 'online' : ''}`} />{active?.name || 'No connection selected'}</div><div className="toolbar-actions"><Button disabled={!active || isConnected || busy} onClick={connect}>Connect</Button><Button disabled={!isConnected || busy} onClick={disconnect}>Disconnect</Button><Button disabled={!isConnected || busy} onClick={runQuery}>{busy ? 'Working…' : '▶ Run'}</Button></div></div>
        <section className="editor-area"><div className="editor-label"><span>{engine ? `${engine.label.toUpperCase()} · QUERY` : 'QUERY EDITOR'}</span><span>Ctrl / ⌘ + Enter to run · Ctrl / ⌘ + Alt + C connect · D disconnect · R refresh tree</span></div><textarea spellCheck="false" aria-label="Query editor" value={query} onChange={e => { setQuery(e.target.value); if (activeId) setLastQueries(queries => ({ ...queries, [activeId]: e.target.value })); }} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); } }} /><div className="editor-help">{engine?.help || 'SQL mode · Run a query against the selected SQL connection.'}</div></section>
        <section className="result-area"><Card className="result-card" title={<span>Results <small className="result-meta">{meta}</small></span>} actions={<div className="result-actions"><Button className={view === 'table' ? 'view-active' : ''} onClick={() => setView('table')}>Table</Button><Button className={view === 'json' ? 'view-active' : ''} onClick={() => setView('json')}>JSON</Button><Button disabled={!result} onClick={exportResult}>Export JSON</Button><Button disabled={!result} onClick={exportCsv}>Export CSV</Button></div>} padded={false}>{resultPanel()}</Card></section>
        <footer className="statusbar"><span>{status}</span><span>Local desktop app · v0.1.0</span></footer>
      </section>
    </main>
    <dialog ref={formDialog} className="modal" onCancel={e => { e.preventDefault(); setDialogOpen(false); }}><form onSubmit={addConnection}><div className="modal-head"><div><h2>{editingId ? 'Edit connection' : 'New connection'}</h2><p>Credentials are encrypted before they are saved on this device.</p></div><Button type="button" className="icon-button" onClick={() => setDialogOpen(false)}>✕</Button></div>{field('Connection name','name','Development database','text',true)}{field('Folder / group','group','Connections')}<label className="form-field">Database type<select value={profile.type} onChange={e => selectEngine(e.target.value)}>{Object.entries(engines).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label><div className="dynamic-fields">{dynamicFields()}</div>{formError && <Alert tone={testState === 'success' ? 'success' : testState === 'failed' ? 'danger' : 'info'}>{formError}</Alert>}<div className="modal-actions"><Button type="button" disabled={testState === 'testing'} onClick={testConnection}>{testState === 'testing' ? 'Testing…' : 'Test connection'}</Button><Button type="button" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit">{editingId ? 'Save changes' : 'Save connection'}</Button></div></form></dialog>
    <dialog ref={recordEditorDialog} className="modal record-dialog" onCancel={e => { e.preventDefault(); setRecordEditorOpen(false); }}><form className="record-dialog-content" onSubmit={applyRecordChange}><div className="modal-head"><div><h2>{recordAction === 'insert' ? 'Insert record' : recordAction === 'edit' ? 'Edit record' : 'Delete record'}</h2><p>{selectedObject?.name} · Enter record data as JSON</p></div><Button type="button" onClick={() => setRecordEditorOpen(false)}>Close</Button></div>{formError && <Alert tone="danger">{formError}</Alert>}<textarea className="record-editor" value={recordJsonText} onChange={e => setRecordJsonText(e.target.value)} spellCheck="false" aria-label="Record JSON" />{recordAction === 'delete' && <p>Confirm the record identity above. The delete action cannot be undone.</p>}<div className="modal-actions"><Button type="button" onClick={() => setRecordEditorOpen(false)}>Cancel</Button><Button type="submit">{recordAction === 'insert' ? 'Insert' : recordAction === 'edit' ? 'Save changes' : 'Delete'}</Button></div></form></dialog>
    <dialog ref={recordDialog} className="modal record-dialog" onCancel={e => { e.preventDefault(); setRecordOpen(false); }}><div className="record-dialog-content"><div className="modal-head"><div><h2>Record contents</h2><p>Complete row or document data</p></div><Button type="button" onClick={() => setRecordOpen(false)}>Close</Button></div><pre className="json-view">{JSON.stringify(selectedJson, null, 2)}</pre><div className="modal-actions"><Button onClick={() => copyText(selectedJson)}>Copy record</Button></div></div></dialog>
  </div></ThemeProvider>;
}

createRoot(document.getElementById('root')).render(<App />);

