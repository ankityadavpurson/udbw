import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, Button, Card, Badge, Alert } from 'xedonium';
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
const blankProfile = { name: '', type: 'mysql', host: '', port: '3306', database: '', username: '', password: '', uri: '', connectionString: '', restUrl: '', apiKey: '', projectId: '', serviceAccountPath: '', ssl: false };

function App() {
  const [profiles, setProfiles] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [connected, setConnected] = useState([]);
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
  const active = profiles.find(p => p.id === activeId);
  const isConnected = active && connected.includes(active.id);
  const engine = active ? engines[active.type] : null;

  useEffect(() => {
    const iconLink = document.querySelector('link[rel="icon"]');
    if (iconLink) iconLink.href = commandMark;
  }, []);

  useEffect(() => {
    const node = formDialog.current;
    if (!node) return;
    if (dialogOpen && !node.open) node.showModal();
    if (!dialogOpen && node.open) node.close();
  }, [dialogOpen]);

  function openDialog() { setProfile({ ...blankProfile }); setFormError(''); setDialogOpen(true); }
  function selectEngine(type) { setProfile(p => ({ ...p, type, port: type === 'postgres' ? '5432' : '3306' })); }
  async function chooseFile() {
    const path = await window.workbench.pickServiceAccount();
    if (path) setProfile(p => ({ ...p, serviceAccountPath: path }));
  }
  function addConnection(e) {
    e.preventDefault(); setFormError('');
    if (profile.type === 'supabase' && !profile.connectionString && !(profile.restUrl && profile.apiKey)) return setFormError('Enter a PostgreSQL connection string or both the Project URL and API key.');
    if (profile.type === 'firestore' && !profile.serviceAccountPath) return setFormError('Choose a service-account JSON file.');
    const next = { ...profile, id: crypto.randomUUID(), name: profile.name.trim() };
    setProfiles(p => [...p, next]); setActiveId(next.id); setQuery(engines[next.type].query);
    setDialogOpen(false); setStatus('Connection profile added. Select Connect to test credentials.');
  }
  function chooseConnection(p) { setActiveId(p.id); setQuery(engines[p.type].query); setResult(null); setError(''); setMeta('No query executed'); setStatus(`Selected ${p.name}`); }
  async function connect() {
    if (!active) return; setBusy(true); setStatus(`Connecting to ${active.name}…`);
    const res = await window.workbench.connect({ id: active.id, profile: active }); setBusy(false);
    if (res.ok) { setConnected(c => c.includes(active.id) ? c : [...c, active.id]); setStatus(`Connected to ${active.name}`); }
    else { setStatus(`Connection failed: ${res.error.message}`); setError(res.error.message); }
  }
  async function disconnect() {
    if (!active) return; const res = await window.workbench.disconnect({ id: active.id });
    setConnected(c => c.filter(id => id !== active.id)); setStatus(res.ok ? `Disconnected from ${active.name}` : 'Disconnect failed');
  }
  async function runQuery() {
    if (!active || !isConnected || !query.trim()) return;
    setBusy(true); setStatus('Executing…'); setError(''); const started = performance.now();
    const res = await window.workbench.query({ id: active.id, query: query.trim() }); setBusy(false);
    if (!res.ok) { setError(res.error.message || 'Unknown error'); setMeta('Query failed'); setResult(null); setStatus(`Error: ${res.error.message}`); return; }
    const data = { ...res.result, elapsedMs: Math.round(performance.now() - started) };
    setResult(data); setMeta(`${data.message || 'Completed'} · ${data.elapsedMs} ms`); setStatus('Query completed');
  }
  function exportResult() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result.json ?? result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'query-results.json'; a.click(); URL.revokeObjectURL(url);
  }
  function field(label, key, placeholder, type = 'text', required = false) {
    return <label className="form-field" key={key}>{label}<input type={type} required={required} placeholder={placeholder} value={profile[key] || ''} onChange={e => setProfile(p => ({ ...p, [key]: e.target.value }))} /></label>;
  }
  function dynamicFields() {
    if (profile.type === 'mysql' || profile.type === 'postgres') return <>
      <div className="field-grid">{field('Host','host','db.example.com','text',true)}{field('Port','port',profile.type === 'mysql' ? '3306' : '5432','text',true)}</div>
      <div className="field-grid">{field('Database','database','database_name','text',true)}{field('Username','username','db_user','text',true)}</div>
      {field('Password','password','Password','password')}
      <label className="check-row"><input type="checkbox" checked={profile.ssl} onChange={e => setProfile(p => ({ ...p, ssl: e.target.checked }))} /> Use TLS/SSL</label>
    </>;
    if (profile.type === 'mongodb') return <>{field('MongoDB URI','uri','mongodb+srv://user:password@cluster.example.mongodb.net/','text',true)}{field('Database (optional)','database','database_name')}<p className="field-note">URI credentials are held in memory for this session.</p></>;
    if (profile.type === 'supabase') return <>{field('PostgreSQL connection string','connectionString','postgresql://user:password@host:5432/postgres')}<p className="field-note">Find it in Project Settings → Database → Connection string.</p><div className="field-grid">{field('Project URL (optional REST)','restUrl','https://your-project.supabase.co')}{field('API key (optional REST)','apiKey','Publishable / anon key')}</div><p className="field-note">Without a connection string, both REST fields are required. REST mode supports read-only table preview.</p><label className="check-row"><input type="checkbox" checked={profile.ssl} onChange={e => setProfile(p => ({ ...p, ssl: e.target.checked }))} /> Use TLS/SSL for PostgreSQL</label></>;
    return <><label className="form-field">Service-account JSON file<div className="file-picker"><input readOnly required value={profile.serviceAccountPath} placeholder="Choose a JSON key file" /><Button type="button" onClick={chooseFile}>Choose file</Button></div></label>{field('Firebase project ID (optional)','projectId','my-firebase-project')}<Alert tone="warning">Firestore Admin SDK credentials bypass Firestore Security Rules. Use a dedicated, least-privilege service account.</Alert></>;
  }
  function resultPanel() {
    if (error) return <Alert tone="danger" className="result-error">{error}</Alert>;
    if (!result) return <div className="welcome"><div className="welcome-icon">⌘</div><h2>Your databases, one workspace.</h2><p>Create a connection, test it, then run a query or browse data.</p><div className="feature-chips">{Object.values(engines).map(x => <Badge key={x.label}>{x.label}</Badge>)}</div></div>;
    if (view === 'json') return <pre className="json-view">{JSON.stringify(result.json ?? { columns: result.columns, rows: result.rows, message: result.message }, null, 2)}</pre>;
    const cols = result.columns || [], rows = result.rows || [];
    if (!cols.length) return <div className="welcome"><h2>{result.message || 'Command completed'}</h2><p>No tabular rows returned.</p></div>;
    return <div className="table-scroll"><table className="result-table"><thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((row,i) => <tr key={i}>{cols.map((_,j) => <td key={j} title={row[j] ?? ''}>{row[j] ?? ''}</td>)}</tr>)}</tbody></table></div>;
  }

  return <ThemeProvider storageKey="universal-db-theme"><div className="app-shell">
    <header className="topbar"><div className="brand"><img className="brand-mark" src={commandMark} alt="Command key logo" /><div><strong>Universal DB Workbench</strong><small>One workspace · multiple data engines</small></div></div><div className="top-actions"><Badge color={isConnected ? 'success' : 'secondary'}>{isConnected ? 'Connected' : active ? 'Profile selected' : 'No active connection'}</Badge><Button onClick={openDialog}>＋ New connection</Button></div></header>
    <main className="layout"><aside className="sidebar"><div className="side-heading"><span>CONNECTIONS</span><Button className="icon-button" onClick={openDialog}>＋</Button></div><div className="connections-list">{profiles.length ? profiles.map(p => <button key={p.id} className={`connection-item ${p.id === activeId ? 'selected' : ''}`} onClick={() => chooseConnection(p)}><span className="db-icon">{engines[p.type].icon}</span><span className="connection-text"><strong>{p.name}</strong><small>{engines[p.type].label}</small></span><span className={`state-dot ${connected.includes(p.id) ? 'connected' : ''}`} /></button>) : <div className="empty-side">Add a connection to get started.</div>}</div><div className="sidebar-footer"><span className="dot" />Credentials stay in memory for this session</div></aside>
      <section className="workspace"><div className="tabbar"><div className="tab active">Query workspace</div><div className="tab-hint">{engine ? `${engine.label} · ${isConnected ? 'connected' : 'not connected'}` : 'Select a connection to begin'}</div></div>
        <div className="toolbar"><div className="selected-connection"><span className={`connection-dot ${isConnected ? 'online' : ''}`} />{active?.name || 'No connection selected'}</div><div className="toolbar-actions"><Button disabled={!active || isConnected || busy} onClick={connect}>Connect</Button><Button disabled={!isConnected || busy} onClick={disconnect}>Disconnect</Button><Button disabled={!isConnected || busy} onClick={runQuery}>{busy ? 'Working…' : '▶ Run'}</Button></div></div>
        <section className="editor-area"><div className="editor-label"><span>{engine ? `${engine.label.toUpperCase()} · QUERY` : 'QUERY EDITOR'}</span><span>Ctrl / ⌘ + Enter to run</span></div><textarea spellCheck="false" aria-label="Query editor" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); } }} /><div className="editor-help">{engine?.help || 'SQL mode · Run a query against the selected SQL connection.'}</div></section>
        <section className="result-area"><Card className="result-card" title={<span>Results <small className="result-meta">{meta}</small></span>} actions={<div className="result-actions"><Button className={view === 'table' ? 'view-active' : ''} onClick={() => setView('table')}>Table</Button><Button className={view === 'json' ? 'view-active' : ''} onClick={() => setView('json')}>JSON</Button><Button disabled={!result} onClick={exportResult}>Export JSON</Button></div>} padded={false}>{resultPanel()}</Card></section>
        <footer className="statusbar"><span>{status}</span><span>Local desktop app · v0.1.0</span></footer>
      </section>
    </main>
    <dialog ref={formDialog} className="modal" onCancel={e => { e.preventDefault(); setDialogOpen(false); }}><form onSubmit={addConnection}><div className="modal-head"><div><h2>New connection</h2><p>Connection details are not saved to disk.</p></div><Button type="button" className="icon-button" onClick={() => setDialogOpen(false)}>✕</Button></div>{field('Connection name','name','Development database','text',true)}<label className="form-field">Database type<select value={profile.type} onChange={e => selectEngine(e.target.value)}>{Object.entries(engines).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label><div className="dynamic-fields">{dynamicFields()}</div>{formError && <Alert tone="danger">{formError}</Alert>}<div className="modal-actions"><Button type="button" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit">Add connection</Button></div></form></dialog>
  </div></ThemeProvider>;
}

createRoot(document.getElementById('root')).render(<App />);
