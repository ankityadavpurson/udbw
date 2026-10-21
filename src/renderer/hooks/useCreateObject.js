import { useState } from 'react';
import { blankColumn, blankCreate, buildCreateSpec, validateCreate } from '../lib/create.js';

// State of the "New database / schema / table / collection" dialog. After a successful create the object list is
// reloaded, and a new database becomes the current one.
export default function useCreateObject({ active, tree, markLost, setStatus }) {
  const [values, setValues] = useState(null); // null while closed
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [statements, setStatements] = useState(null); // the SQL preview, when asked for

  function openDialog(kind) {
    if (!active) return;
    const next = blankCreate(active, kind);
    // A new table or schema-level object goes into the schema being browsed.
    if (kind === 'table' && tree.currentSchema) next.schema = tree.currentSchema;
    setValues(next);
    setError('');
    setStatements(null);
  }
  const close = () => !busy && setValues(null);
  const edit = change => {
    setStatements(null);
    setValues(change);
  };
  const update = (key, value) => edit(v => ({ ...v, [key]: value }));
  const updateColumn = (index, patch) => edit(v => ({ ...v, columns: v.columns.map((column, i) => (i === index ? { ...column, ...patch } : column)) }));
  const addColumn = () => edit(v => ({ ...v, columns: [...v.columns, blankColumn(active, v.columns.length)] }));
  const removeColumn = index => edit(v => ({ ...v, columns: v.columns.filter((_, i) => i !== index) }));

  // Shows the SQL the database would be sent (SQL engines), without creating anything.
  async function previewSql() {
    const problem = validateCreate(active, values);
    if (problem) return setError(problem);
    setError('');
    setBusy(true);
    const res = await window.workbench.create({ id: active.id, spec: buildCreateSpec(active, values), preview: true });
    setBusy(false);
    if (!res.ok) return setError(res.error?.message || 'Could not build the statement.');
    setStatements(res.result?.statements || []);
  }

  async function submit(event) {
    event.preventDefault();
    const problem = validateCreate(active, values);
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    const spec = buildCreateSpec(active, values);
    const res = await window.workbench.create({ id: active.id, spec });
    setBusy(false);
    if (!res.ok) {
      if (res.error?.unreachable || /not connected/i.test(res.error?.message || '')) markLost(active.id);
      return setError(res.error?.message || 'Could not create it.');
    }
    setValues(null);
    setStatus(res.result?.message || `Created ${spec.name}`);
    if (spec.kind === 'database') {
      await tree.loadObjectTree(active.id, tree.currentDatabase, tree.currentSchema);
      await tree.changeDatabase(res.result?.database || spec.name);
    } else await tree.loadObjectTree(active.id, tree.currentDatabase, tree.currentSchema);
  }

  return { open: values !== null, values, error, busy, statements, previewSql, openDialog, close, update, updateColumn, addColumn, removeColumn, submit };
}
