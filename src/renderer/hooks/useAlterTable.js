import { useState } from 'react';
import { columnTypesFor } from '../lib/create.js';
import { diffStructure, newRow, rowsFromObject, validateStructure } from '../lib/alter.js';

// State of the "Edit structure" dialog of an open table. `onAltered(object, newName)` reloads what changed.
export default function useAlterTable({ active, markLost, setStatus, onAltered }) {
  const [object, setObject] = useState(null); // the table being edited; null while closed
  const [rows, setRows] = useState([]);
  const [tableName, setTableName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [statements, setStatements] = useState(null); // the SQL preview, when asked for

  const ops = object ? diffStructure({ rows, tableName: object.name, newTableName: tableName }) : [];

  function openDialog(target) {
    if (!active || !target) return;
    setObject(target);
    setRows(rowsFromObject(target));
    setTableName(target.name);
    setError('');
    setStatements(null);
  }
  const close = () => !busy && setObject(null);
  const edited = change => {
    setStatements(null);
    change();
  };
  const updateRow = (id, patch) => edited(() => setRows(all => all.map(row => (row.id === id ? { ...row, ...patch } : row))));
  const addRow = () => edited(() => setRows(all => [...all, newRow(columnTypesFor(active).find(type => type.startsWith('varchar')) || 'text')]));
  const removeRow = id => edited(() => setRows(all => all.flatMap(row => (row.id !== id ? [row] : row.isNew ? [] : [{ ...row, removed: !row.removed }]))));
  const rename = value => edited(() => setTableName(value));

  async function call(preview) {
    const problem = validateStructure({ rows, newTableName: tableName });
    if (problem) {
      setError(problem);
      return null;
    }
    if (!ops.length) {
      setError('There is nothing to change.');
      return null;
    }
    setError('');
    setBusy(true);
    const res = await window.workbench.alter({ id: active.id, object: { name: object.name, schema: object.schema }, ops, preview });
    setBusy(false);
    if (!res.ok) {
      if (res.error?.unreachable || /not connected/i.test(res.error?.message || '')) markLost(active.id);
      setError(res.error?.message || 'Could not change the table.');
      return null;
    }
    return res.result;
  }

  async function previewSql() {
    const result = await call(true);
    if (result) setStatements(result.statements || []);
  }

  async function submit(event) {
    event.preventDefault();
    const result = await call(false);
    if (!result) return;
    const target = object;
    setObject(null);
    setStatus(result.message || `Changed table ${target.name}`);
    await onAltered(target, tableName.trim() || target.name);
  }

  return { open: object !== null, object, rows, tableName, ops, error, busy, statements, openDialog, close, updateRow, addRow, removeRow, rename, previewSql, submit };
}
