import { useEffect, useRef, useState } from 'react';
import { engines } from '../constants.js';

// Saved connection profiles, the active selection, live connection state and encrypted persistence.
export default function useConnections({ setStatus, setBusy }) {
  const [profiles, setProfiles] = useState([]);
  const [lastQueries, setLastQueries] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [connected, setConnected] = useState([]);
  const [connectionStates, setConnectionStates] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const pendingSaveRef = useRef(false);

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
        setActiveId(saved.activeId && saved.profiles?.some(p => p.id === saved.activeId) ? saved.activeId : null);
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

  const updateProfile = (id, patch) => setProfiles(all => all.map(p => p.id === id ? { ...p, ...patch } : p));
  const setLastQuery = (id, value) => setLastQueries(queries => ({ ...queries, [id]: value }));

  async function refreshConnections() {
    const saved = await window.workbench.loadConnections();
    if (!saved.ok) { setStatus(`Connection refresh failed: ${saved.error?.message || 'Secure storage unavailable'}`); return; }
    setStorageReady(true); setProfiles(saved.profiles || []); setLastQueries(saved.lastQueries || {}); setStatus('Connections refreshed from secure storage');
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
    const copy = { ...p, id: crypto.randomUUID(), name: `${p.name} copy`, favorite: false, lastUsedAt: null };
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
    if (activeId === p.id) setActiveId(null);
    setStatus(`Deleted ${p.name}.`);
  }

  // Resolves { ok: true, id, database } or { ok: false, message }.
  async function connect() {
    if (!active || connectionStates[active.id] === 'connecting') return { ok: false };
    const connectionId = active.id;
    setConnectionStates(states => ({ ...states, [connectionId]: 'connecting' })); setBusy(true); setStatus(`Connecting to ${active.name}…`);
    const res = await window.workbench.connect({ id: connectionId, profile: active }); setBusy(false);
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
    profiles, lastQueries, activeId, active, isConnected, engine, connected, loaded, connectionStatus,
    chooseConnection, saveProfile, toggleFavorite, duplicateConnection, deleteConnection, connect, disconnect,
    markLost, refreshConnections, updateProfile, setLastQuery
  };
}
