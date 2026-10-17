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

  // Columns, keys and indexes are read when a table is opened, not for the whole schema up front.
  const sameObject = (a, b) => a.name === b.name && (a.schema || '') === (b.schema || '') && a.type === b.type;
  async function describeObject(object) {
    const sql = active && ['mysql', 'postgres', 'supabase'].includes(active.type);
    if (!sql || !['table', 'view'].includes(object.type) || object.columns) return object;
    const res = await window.workbench.describe({ id: active.id, object: { name: object.name, schema: object.schema, type: object.type } });
    if (!res.ok) {
      if (connectionGone(res.error)) markLost(active.id);
      setStatus(`Could not read the structure of ${object.name}: ${res.error?.message || 'unknown error'}`);
      return object;
    }
    const described = { ...object, ...res.result };
    setObjectTree(tree => (tree ? { ...tree, objects: tree.objects.map(item => (sameObject(item, object) ? described : item)) } : tree));
    return described;
  }

  const clear = () => setObjectTree(null);

  return {
    objectTree, treeLoading, currentDatabase, currentSchema, objectSearch, setObjectSearch,
    loadObjectTree, changeDatabase, changeSchema, resetFor, describeObject, clear
  };
}
