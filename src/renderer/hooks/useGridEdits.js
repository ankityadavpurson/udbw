import { useRef, useState } from 'react';
import { buildBatch, countChanges, describeChanges, emptyPending, previewOp, setAddedValue, setCellEdit, toggleDeleted } from '../lib/gridEdits.js';
import { recordAt } from '../lib/results.js';

// Inline editing of a table opened from the sidebar (MySQL / PostgreSQL / Supabase SQL). Edits, new rows and deletions are
// collected as pending changes, shown in the grid, and sent together as one transaction when applied.
export default function useGridEdits({ active, tab, tabs = [], selectedObject, enabled, runQuery, setStatus }) {
  // Pending changes belong to one result of one tab; running anything else drops them.
  const [store, setStore] = useState({}); // { [tabId]: { result, pending, history } }
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const counter = useRef(0);

  const entry = store[tab.id];
  const live = entry && entry.result === tab.result;
  const pending = live ? entry.pending : emptyPending();
  const history = live ? entry.history : [];
  const counts = countChanges(pending);
  // Pending changes across every tab, so closing the app can warn about edits in a tab that is not showing.
  const totalPending = tabs.reduce((sum, t) => sum + (store[t.id] && store[t.id].result === t.result ? countChanges(store[t.id].pending).total : 0), 0);
  const columns = tab.result?.columns || [];
  const keys = selectedObject?.primaryKey || [];
  const editable = Boolean(enabled && tab.result && !tab.result.json && keys.length && keys.every(key => columns.includes(key)));

  // `change` receives the current pending changes and returns the next ones; the old ones are kept for undo.
  const update = change => {
    setError('');
    setStore(all => {
      const current = all[tab.id] && all[tab.id].result === tab.result ? all[tab.id] : { result: tab.result, pending: emptyPending(), history: [] };
      return { ...all, [tab.id]: { result: tab.result, pending: change(current.pending), history: [...current.history, current.pending].slice(-50) } };
    });
  };

  const original = (index, column) => recordAt(tab.result, index)?.[column];

  const setCell = (rowKey, column, value) => {
    if (typeof rowKey === 'string') update(p => setAddedValue(p, rowKey, column, value));
    else update(p => setCellEdit(p, rowKey, column, value, original(rowKey, column)));
  };

  const addRow = () => {
    counter.current += 1;
    update(p => ({ ...p, added: [{ id: `new-${counter.current}`, values: {} }, ...p.added] }));
  };

  const removeAdded = id => update(p => ({ ...p, added: p.added.filter(row => row.id !== id) }));
  const markDeleted = indexes => update(p => toggleDeleted(p, indexes));

  const undo = () => {
    if (!history.length) return;
    setError('');
    setStore(all => ({ ...all, [tab.id]: { ...all[tab.id], pending: all[tab.id].history.at(-1), history: all[tab.id].history.slice(0, -1) } }));
  };

  const discard = () => {
    setError('');
    setStore(all => {
      const next = { ...all };
      delete next[tab.id];
      return next;
    });
  };

  const dialect = active?.type === 'mysql' ? 'mysql' : 'postgres';
  const build = () => {
    const records = (tab.result?.rows || []).map((_, index) => recordAt(tab.result, index));
    return buildBatch({ active, object: selectedObject, records, pending });
  };
  const preview = () => {
    const built = build();
    return built.error ? [`-- ${built.error}`] : built.ops.map(op => previewOp(dialect, op));
  };

  async function apply() {
    if (applying || !counts.total) return;
    const built = build();
    if (built.error) {
      setError(built.error);
      return;
    }
    setApplying(true);
    setError('');
    setStatus('Applying changes…');
    const res = await window.workbench.mutateBatch({ id: active.id, ops: built.ops });
    setApplying(false);
    if (!res.ok) {
      const note = res.error?.lost ? ' The connection dropped; connect again and retry.' : '';
      setError(`${res.error?.message || 'The changes could not be applied.'}${note}`);
      setStatus('Changes were not applied');
      return;
    }
    discard();
    setStatus(res.result?.message || 'Changes applied');
    await runQuery(tab.query, tab.id);
  }

  return {
    editable,
    pending,
    counts,
    totalPending,
    summary: describeChanges(pending),
    canUndo: history.length > 0,
    applying,
    error,
    setCell,
    addRow,
    removeAdded,
    markDeleted,
    undo,
    discard,
    apply,
    preview
  };
}
