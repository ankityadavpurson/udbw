import { useState } from 'react';
import { buildRecordStatement, canEditRecord, selectStatement } from '../lib/statements.js';

// Row selection helpers plus the record viewer and insert / edit / delete dialogs.
export default function useRecordEditor({ active, tab, runQuery, setQuery, setStatus }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [action, setAction] = useState('insert');
  const [jsonText, setJsonText] = useState('{}');
  const [error, setError] = useState('');

  const { result, selectedIndex, selectedObject } = tab;
  const hasSelection = selectedIndex !== null;
  const selectedRow = hasSelection ? result?.rows?.[selectedIndex] : null;
  const selectedJson = hasSelection ? (result?.json?.[selectedIndex] ?? selectedRow) : null;
  const canEditSelected = hasSelection && canEditRecord(active, selectedObject, selectedJson);

  function openEditor(nextAction) {
    if (!selectedObject) return;
    setAction(nextAction);
    setJsonText(nextAction === 'edit' && selectedJson ? JSON.stringify(selectedJson, null, 2) : '{}');
    setError(''); setEditorOpen(true);
  }

  async function apply(e) {
    e.preventDefault();
    let record;
    try { record = JSON.parse(jsonText); if (!record || Array.isArray(record) || typeof record !== 'object') throw new Error(); }
    catch { setError('Enter a valid JSON object.'); return; }
    const object = selectedObject;
    if (!object) return;
    const built = buildRecordStatement({ active, object, action, record, selectedJson });
    if (built.error) { setError(built.error); return; }
    setEditorOpen(false); setStatus(`${action === 'insert' ? 'Inserting' : action === 'edit' ? 'Updating' : 'Deleting'} record…`);
    if (await runQuery(built.statement)) { const select = selectStatement(active, object); setQuery(select); await runQuery(select); }
  }

  return {
    viewerOpen, setViewerOpen, editorOpen, setEditorOpen, action, jsonText, setJsonText, error,
    hasSelection, selectedJson, canEditSelected, openEditor, apply
  };
}
