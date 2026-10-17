import { useEffect, useRef, useState } from 'react';
import { engines, SECRET_FIELDS, SECRET_MASK } from '../constants.js';

// True when the list still holds plaintext secrets (just typed in the dialog) or a duplicate's pointer to its source.
const needsMasking = profiles => profiles.some(p => p.secretsFrom || SECRET_FIELDS.some(field => p[field] && p[field] !== SECRET_MASK));

// Saved connection profiles, the active selection, live connection state and encrypted persistence.
export default function useConnections({ setStatus, setBusy }) {
  const [profiles, setProfiles] = useState([]);
  const [lastQueries, setLastQueries] = useState({});
  const [savedTabs, setSavedTabs] = useState({});     // connection id -> { tabs: [{ title, query, selectedObject, browse }], active }
  const [history, setHistory] = useState({});          // connection id -> [{ id, text, at, ok, ms, rows, error }]
  const [snippets, setSnippets] = useState([]);        // saved queries: { id, name, text, family }
  const [activeId, setActiveId] = useState(null);
  const [connected, setConnected] = useState([]);
  const [connectionStates, setConnectionStates] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const pendingSaveRef = useRef(false);
  const latestRef = useRef(null);
  const saveTimerRef = useRef(null);

  const active = profiles.find(p => p.id === activeId);
  const isConnected = Boolean(active && connected.includes(active.id));
  const engine = active ? engines[active.type] : null;
  const connectionStatus = id => connectionStates[id] || (connected.includes(id) ? 'connected' : 'disconnected');

  useEffect(() => {
    let cancelled = false;
    window.workbench.loadConnections().then(saved => {
      if (cancelled) return;
      if (saved.ok) {
        setStorageReady(true);
        setProfiles(saved.profiles || []); setLastQueries(saved.lastQueries || {});
        setSavedTabs(saved.tabs || {}); setHistory(saved.history || {}); setSnippets(saved.snippets || []);
        setActiveId(saved.activeId && saved.profiles?.some(p => p.id === saved.activeId) ? saved.activeId : null);
      } else setStatus(`Could not restore saved connections: ${saved.error?.message || 'Secure storage unavailable'}`);
      setLoaded(true);
    }).catch(err => { if (!cancelled) { setLoaded(true); setStatus(`Could not restore connections: ${err.message}`); } });
    return () => { cancelled = true; };
  }, []);

  // Sends the latest state to the main process, which keeps the secrets and answers with the masked list.
  function persist() {
    clearTimeout(saveTimerRef.current);
    const data = latestRef.current;
    if (!data) return Promise.resolve();
    return window.workbench.saveConnections(data).then(saved => {
      if (saved.profiles && latestRef.current === data && needsMasking(data.profiles)) setProfiles(saved.profiles);
      if (!saved.ok) setStatus(`Could not securely save connections: ${saved.error?.message || 'Unknown error'}`);
      else pendingSaveRef.current = false;
    });
  }

  useEffect(() => {
    if (!loaded || !storageReady) return undefined;
    latestRef.current = { profiles, activeId, lastQueries, tabs: savedTabs, history, snippets };
    pendingSaveRef.current = true;
    saveTimerRef.current = setTimeout(persist, 250);
    return () => clearTimeout(saveTimerRef.current);
  }, [profiles, activeId, lastQueries, savedTabs, history, snippets, loaded, storageReady]);

  // Makes sure the main process has the saved settings before they are used to connect.
  async function flushSave() { if (pendingSaveRef.current && latestRef.current) await persist(); }

  useEffect(() => {
    const onBeforeUnload = event => {
      if (!pendingSaveRef.current) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const updateProfile = (id, patch) => setProfiles(all => all.map(p => p.id === id ? { ...p, ...patch } : p));
  const setLastQuery = (id, value) => setLastQueries(queries => ({ ...queries, [id]: value }));

  // Open tabs of one connection, remembered for the next start. Ignored when nothing changed.
  function rememberTabs(connId, entry) {
    setSavedTabs(all => (JSON.stringify(all[connId]) === JSON.stringify(entry) ? all : { ...all, [connId]: entry }));
  }

  const HISTORY_LIMIT = 200;
  function addHistory(connId, entry) {
    setHistory(all => {
      const list = all[connId] || [];
      const rest = list[0] && list[0].text === entry.text ? list.slice(1) : list;   // the same statement run again just moves up
      return { ...all, [connId]: [{ id: crypto.randomUUID(), at: Date.now(), ...entry }, ...rest].slice(0, HISTORY_LIMIT) };
    });
  }
  const clearHistory = connId => setHistory(all => { const next = { ...all }; delete next[connId]; return next; });
  const addSnippet = snippet => setSnippets(all => [{ id: crypto.randomUUID(), at: Date.now(), ...snippet }, ...all]);
  const removeSnippet = id => setSnippets(all => all.filter(item => item.id !== id));

  async function refreshConnections() {
    const saved = await window.workbench.loadConnections();
    if (!saved.ok) { setStatus(`Connection refresh failed: ${saved.error?.message || 'Secure storage unavailable'}`); return; }
    setStorageReady(true); setProfiles(saved.profiles || []); setLastQueries(saved.lastQueries || {}); setSavedTabs(saved.tabs || {}); setHistory(saved.history || {}); setSnippets(saved.snippets || []); setStatus('Connections refreshed from secure storage');
  }

  function chooseConnection(p) {
    updateProfile(p.id, { lastUsedAt: Date.now() });
    setActiveId(p.id); setStatus(`Selected ${p.name}`);
  }

  // Adds a new profile or replaces the one being edited. Returns { next, existing }.
  async function saveProfile({ profile, editingId }) {
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
    return { next, existing };
  }

  function toggleFavorite(id) { setProfiles(all => all.map(p => p.id === id ? { ...p, favorite: !p.favorite } : p)); }

  function duplicateConnection(p) {
    const copy = { ...p, id: crypto.randomUUID(), name: `${p.name} copy`, favorite: false, lastUsedAt: null, secretsFrom: p.id };
    setProfiles(all => [...all, copy]);
    setLastQueries(all => ({ ...all, [copy.id]: lastQueries[p.id] || engines[p.type].query }));
    setStorageReady(true); setStatus(`Duplicated ${p.name}.`);
  }

  async function deleteConnection(p) {
    if (connected.includes(p.id)) await window.workbench.disconnect({ id: p.id });
    setConnected(all => all.filter(id => id !== p.id));
    setConnectionStates(states => { const next = { ...states }; delete next[p.id]; return next; });
    setProfiles(all => all.filter(item => item.id !== p.id)); setStorageReady(true);
    setLastQueries(all => { const next = { ...all }; delete next[p.id]; return next; });
    setSavedTabs(all => { const next = { ...all }; delete next[p.id]; return next; });
    clearHistory(p.id);
    if (activeId === p.id) setActiveId(null);
    setStatus(`Deleted ${p.name}.`);
  }

  // Resolves { ok: true, id, database } or { ok: false, message }.
  async function connect() {
    if (!active || connectionStates[active.id] === 'connecting') return { ok: false };
    const connectionId = active.id;
    setConnectionStates(states => ({ ...states, [connectionId]: 'connecting' })); setBusy(true); setStatus(`Connecting to ${active.name}…`);
    await flushSave();
    const res = await window.workbench.connect({ id: connectionId }); setBusy(false);
    if (res.ok) {
      setConnected(c => c.includes(connectionId) ? c : [...c, connectionId]);
      setConnectionStates(states => ({ ...states, [connectionId]: 'connected' }));
      updateProfile(connectionId, { lastUsedAt: Date.now() });
      setStatus(`Connected to ${active.name}`);
      return { ok: true, id: connectionId, database: active.database || '' };
    }
    setConnectionStates(states => ({ ...states, [connectionId]: 'failed' }));
    setStatus(`Connection failed: ${res.error.message}`);
    return { ok: false, message: res.error.message };
  }

  async function disconnect() {
    if (!active) return;
    const id = active.id;
    const res = await window.workbench.disconnect({ id });
    setConnected(c => c.filter(item => item !== id)); setConnectionStates(states => ({ ...states, [id]: 'disconnected' }));
    setStatus(res.ok ? `Disconnected from ${active.name}` : 'Disconnect failed');
  }

  // The driver reported a dropped connection: mark it failed so the UI offers to reconnect.
  function markLost(id) {
    setConnected(all => all.filter(item => item !== id));
    setConnectionStates(states => ({ ...states, [id]: 'failed' }));
  }

  return {
    profiles, lastQueries, savedTabs, history, snippets, rememberTabs, addHistory, clearHistory, addSnippet, removeSnippet, activeId, active, isConnected, engine, connected, loaded, connectionStatus,
    chooseConnection, saveProfile, toggleFavorite, duplicateConnection, deleteConnection, connect, disconnect,
    markLost, refreshConnections, updateProfile, setLastQuery
  };
}
