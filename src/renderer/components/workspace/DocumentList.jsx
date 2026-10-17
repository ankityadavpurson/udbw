import React, { useState } from 'react';
import { Alert, Button, ChevronDownIcon, ChevronRightIcon, CodeDisplay, ConfirmDialog, CopyIcon, EditIcon, Flex, HelperText, PlusIcon, Stack, TextArea, Trash2Icon } from 'xedonium';
import { summarizeDocument } from '../../lib/results.js';

const PAGE = 25;
const idOf = doc => String(doc?._id ?? doc?.id ?? '');

// Documents as a compact list, edited in place like MongoDB Compass: every row shows the id and a few
// recognisable fields, and expands to the full document. onUpdate / onClone / onDelete resolve { ok, error }.
export default function DocumentList({ documents, canEdit, onUpdate, onClone, onDelete, onInsert }) {
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState(() => new Set());  // indexes of expanded documents
  const [editing, setEditing] = useState(null);       // { index, text, error, saving }
  const [removing, setRemoving] = useState(null);     // { doc, error, busy }
  const [notice, setNotice] = useState('');

  const visible = documents.slice(0, limit);
  const toggle = index => setOpen(prev => { const next = new Set(prev); if (next.has(index)) next.delete(index); else next.add(index); return next; });
  const startEdit = (index, doc) => { setNotice(''); setOpen(prev => new Set(prev).add(index)); setEditing({ index, text: JSON.stringify(doc, null, 2), error: '', saving: false }); };

  async function save(doc) {
    setEditing(e => ({ ...e, saving: true, error: '' }));
    const res = await onUpdate(doc, editing.text);
    if (res.ok) setEditing(null); else setEditing(e => ({ ...e, saving: false, error: res.error }));
  }
  async function clone(doc) {
    setNotice('');
    const res = await onClone(doc);
    if (!res.ok) setNotice(res.error);
  }
  async function confirmRemove() {
    setRemoving(r => ({ ...r, busy: true, error: '' }));
    const res = await onDelete(removing.doc);
    if (res.ok) setRemoving(null); else setRemoving(r => ({ ...r, busy: false, error: res.error }));
  }

  return (
    <Stack gap={2} className="py-2">
      <Flex justify="between" align="center" wrap gap={2} className="px-2">
        <HelperText>{documents.length} document{documents.length === 1 ? '' : 's'}</HelperText>
        <Flex gap={2} wrap>
          <Button variant="flat" onClick={() => setOpen(new Set(visible.map((_, i) => i)))}>Expand all</Button>
          <Button variant="flat" onClick={() => { setOpen(new Set()); setEditing(null); }}>Collapse all</Button>
          <Button variant="secondary" disabled={!canEdit} onClick={onInsert}><PlusIcon /> Add document</Button>
        </Flex>
      </Flex>
      {notice && <div className="px-2"><Alert tone="danger" onClose={() => setNotice('')}>{notice}</Alert></div>}
      <div className="divide-y divide-app-border border-y border-app-border">
        {visible.map((doc, index) => {
          const isOpen = open.has(index);
          const isEditing = editing?.index === index;
          return (
            <div key={idOf(doc) || index}>
              <div role="button" tabIndex={0} aria-expanded={isOpen} className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-app-bg"
                onClick={() => toggle(index)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(index); } }}>
                <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}</span>
                <span className="w-6 shrink-0 text-right text-[10px] text-app-muted">{index + 1}</span>
                <span className="shrink-0 font-mono text-xs font-semibold" title={idOf(doc)}>{idOf(doc).length > 10 ? `…${idOf(doc).slice(-8)}` : idOf(doc) || '—'}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-app-muted">
                  {summarizeDocument(doc).map(([key, value], i) => <span key={key}>{i ? '  ·  ' : ''}<span className="text-app-text">{key}</span>: {value}</span>)}
                </span>
                {canEdit && !isEditing && (
                  <span className="flex shrink-0 gap-1" onClick={e => e.stopPropagation()}>
                    <Button variant="flat" tooltip="Edit document" aria-label={`Edit ${idOf(doc)}`} onClick={() => startEdit(index, doc)}><EditIcon /></Button>
                    <Button variant="flat" tooltip="Clone document" aria-label={`Clone ${idOf(doc)}`} onClick={() => clone(doc)}><CopyIcon /></Button>
                    <Button variant="flat" tooltip="Delete document" aria-label={`Delete ${idOf(doc)}`} onClick={() => setRemoving({ doc, error: '', busy: false })}><Trash2Icon /></Button>
                  </span>
                )}
              </div>
              {isOpen && (isEditing ? (
                <Stack gap={2} className="bg-app-bg p-3">
                  {editing.error && <Alert tone="danger">{editing.error}</Alert>}
                  <div className="[&_textarea]:font-mono [&_textarea]:text-xs">
                    <TextArea aria-label={`Edit document ${idOf(doc)}`} rows={Math.min(24, Math.max(6, editing.text.split(String.fromCharCode(10)).length + 1))} spellCheck={false}
                      value={editing.text} onChange={text => setEditing(e => ({ ...e, text }))} />
                  </div>
                  <Flex gap={2} justify="end">
                    <Button variant="flat" disabled={editing.saving} onClick={() => setEditing(null)}>Cancel</Button>
                    <Button disabled={editing.saving} onClick={() => save(doc)}>{editing.saving ? 'Updating…' : 'Update'}</Button>
                  </Flex>
                </Stack>
              ) : (
                <div className="bg-app-bg p-2"><CodeDisplay language="json" code={JSON.stringify(doc, null, 2)} maxHeight={320} copyable /></div>
              ))}
            </div>
          );
        })}
      </div>
      {documents.length > limit && <Button className="mx-2" variant="secondary" onClick={() => setLimit(l => l + PAGE)}>Show more ({documents.length - limit} left)</Button>}
      <ConfirmDialog open={!!removing} tone="danger" title="Delete document" confirmLabel="Delete" busy={removing?.busy} error={removing?.error}
        onClose={() => setRemoving(null)} onConfirm={confirmRemove}>
        Delete document <span className="font-mono">{removing ? idOf(removing.doc) : ''}</span>? This cannot be undone.
      </ConfirmDialog>
    </Stack>
  );
}
