import { useState } from 'react';
import { buildDocumentUpdate, buildRecordStatement, canEditRecord, inferObject, selectStatement } from '../lib/statements.js';

// Row selection helpers plus the record viewer and insert / edit / delete dialogs.
export default function useRecordEditor({ active, tab, runQuery, setQuery, setStatus }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [action, setAction] = useState('insert');
  const [jsonText, setJsonText] = useState('{}');
  const [error, setError] = useState('');

  const { result, selectedIndex } = tab;
  // The collection/table being viewed: the one opened from the sidebar, or the one named in a typed find/read.
  const selectedObject = tab.selectedObject ?? inferObject(active, tab.query);
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

  // Runs a change, then re-runs the tab's own query so filters stay in place.
  async function runDocumentChange(built, doing) {
    if (built.error) return { ok: false, error: built.error };
    setStatus(`${doing}…`);
    if (!(await runQuery(built.statement))) return { ok: false, error: 'The database rejected the change. See the result panel for details.' };
    await runQuery(tab.query);
    return { ok: true };
  }

  const needsCollection = { ok: false, error: 'Open a collection from the sidebar, or run "find <collection>", to edit documents.' };

  async function updateDocument(doc, text) {
    let edited;
    try { edited = JSON.parse(text); if (!edited || Array.isArray(edited) || typeof edited !== 'object') throw new Error(); }
    catch { return { ok: false, error: 'Enter a valid JSON object.' }; }
    if (!selectedObject) return needsCollection;
    const built = buildDocumentUpdate({ active, object: selectedObject, doc, edited });
    if (built.noChange) return { ok: true };
    return runDocumentChange(built, 'Updating document');
  }

  async function deleteDocument(doc) {
    if (!selectedObject) return needsCollection;
    return runDocumentChange(buildRecordStatement({ active, object: selectedObject, action: 'delete', record: {}, selectedJson: doc }), 'Deleting document');
  }

  async function cloneDocument(doc) {
    if (!selectedObject) return needsCollection;
    const { _id, id, ...copy } = doc;
    return runDocumentChange(buildRecordStatement({ active, object: selectedObject, action: 'insert', record: copy, selectedJson: null }), 'Cloning document');
  }

  return {
    selectedObject, updateDocument, deleteDocument, cloneDocument,
    viewerOpen, setViewerOpen, editorOpen, setEditorOpen, action, jsonText, setJsonText, error,
    hasSelection, selectedJson, canEditSelected, openEditor, apply
  };
}
