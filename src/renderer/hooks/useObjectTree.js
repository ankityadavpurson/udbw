import { useState } from 'react';

// The main process re-opens a dropped connection itself; `unreachable` means that failed (or there was none).
const connectionGone = error => Boolean(error?.unreachable) || /not connected/i.test(error?.message || '');

// Database/schema selection and the object list shown in the sidebar.
export default function useObjectTree({ active, activeId, markLost, updateProfile, setStatus }) {
  const [objectTree, setObjectTree] = useState(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [currentDatabase, setCurrentDatabase] = useState('');
  const [currentSchema, setCurrentSchema] = useState('');
  const [objectSearch, setObjectSearch] = useState('');

  async function loadObjectTree(id = activeId, database = currentDatabase, schema = currentSchema) {
    if (!id) return;
    setTreeLoading(true);
    const response = await window.workbench.discover({ id, database: database || undefined, schema: schema || undefined });
    setTreeLoading(false);
    if (!response.ok) {
      const message = response.error?.message || 'Could not load database objects.';
      if (connectionGone(response.error)) markLost(id);
      setObjectTree({ databases: [], schemas: [], objects: [], message }); return;
    }
    const next = response.result;
    setObjectTree(next); setCurrentDatabase(database || next.databases?.[0] || '');
    if (next.message) setStatus(next.message);
  }

  async function changeDatabase(database) {
    if (!active || !database) return;
    const previousDatabase = currentDatabase;
    setTreeLoading(true); setCurrentDatabase(database);
    const switched = await window.workbench.switchDatabase({ id: active.id, database });
    setTreeLoading(false);
    if (!switched.ok) { setCurrentDatabase(previousDatabase); setStatus(`Database switch failed: ${switched.error?.message || 'Unknown error'}`); return; }
    updateProfile(active.id, { database });
    setCurrentSchema(''); await loadObjectTree(active.id, database, '');
  }

  function changeSchema(schema) {
    setCurrentSchema(schema);
    loadObjectTree(active.id, currentDatabase, schema);
  }

  // A different connection became active: reset the selectors and load (or clear) its objects.
  async function resetFor(profile, isConnected) {
    setCurrentDatabase(profile.database || ''); setCurrentSchema(''); setObjectSearch('');
    if (isConnected) await loadObjectTree(profile.id, profile.database || ''); else setObjectTree(null);
  }

  const clear = () => setObjectTree(null);

  return {
    objectTree, treeLoading, currentDatabase, currentSchema, objectSearch, setObjectSearch,
    loadObjectTree, changeDatabase, changeSchema, resetFor, clear
  };
}
