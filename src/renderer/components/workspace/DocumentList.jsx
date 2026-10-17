import React, { useState } from 'react';
import { Alert, Button, Card, CodeDisplay, ConfirmDialog, CopyIcon, EditIcon, Flex, HelperText, PlusIcon, Stack, TextArea, Trash2Icon } from 'xedonium';

const PAGE = 25;
const idOf = doc => String(doc?._id ?? doc?.id ?? '');

// Documents as cards, edited in place like MongoDB Compass.
// onUpdate / onClone / onDelete resolve { ok, error }.
export default function DocumentList({ documents, canEdit, onUpdate, onClone, onDelete, onInsert }) {
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState(null);   // { index, text, error, saving }
  const [removing, setRemoving] = useState(null); // { doc, error, busy }
  const [notice, setNotice] = useState('');

  const startEdit = (index, doc) => { setNotice(''); setEditing({ index, text: JSON.stringify(doc, null, 2), error: '', saving: false }); };

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
    <Stack gap={2} className="p-2">
      <Flex justify="between" align="center" wrap gap={2}>
        <HelperText>{documents.length} document{documents.length === 1 ? '' : 's'}</HelperText>
        <Button variant="secondary" disabled={!canEdit} onClick={onInsert}><PlusIcon /> Add document</Button>
      </Flex>
      {notice && <Alert tone="danger" onClose={() => setNotice('')}>{notice}</Alert>}
      {documents.slice(0, limit).map((doc, index) => {
        const isEditing = editing?.index === index;
        return (
          <Card key={idOf(doc) || index} title={<span className="font-mono text-xs">{idOf(doc) || `#${index + 1}`}</span>} padded={false}
            actions={canEdit && !isEditing ? <Flex gap={1}>
              <Button variant="flat" tooltip="Edit document" aria-label={`Edit ${idOf(doc)}`} onClick={() => startEdit(index, doc)}><EditIcon /></Button>
              <Button variant="flat" tooltip="Clone document" aria-label={`Clone ${idOf(doc)}`} onClick={() => clone(doc)}><CopyIcon /></Button>
              <Button variant="flat" tooltip="Delete document" aria-label={`Delete ${idOf(doc)}`} onClick={() => setRemoving({ doc, error: '', busy: false })}><Trash2Icon /></Button>
            </Flex> : null}>
            {isEditing ? (
              <Stack gap={2} className="p-3">
                {editing.error && <Alert tone="danger">{editing.error}</Alert>}
                <div className="[&_textarea]:font-mono [&_textarea]:text-xs">
                  <TextArea aria-label={`Edit document ${idOf(doc)}`} rows={Math.min(24, Math.max(6, editing.text.split('\n').length + 1))} spellCheck={false}
                    value={editing.text} onChange={text => setEditing(e => ({ ...e, text }))} />
                </div>
                <Flex gap={2} justify="end">
                  <Button variant="flat" disabled={editing.saving} onClick={() => setEditing(null)}>Cancel</Button>
                  <Button disabled={editing.saving} onClick={() => save(doc)}>{editing.saving ? 'Updating…' : 'Update'}</Button>
                </Flex>
              </Stack>
            ) : (
              <div className="p-2"><CodeDisplay language="json" code={JSON.stringify(doc, null, 2)} maxHeight={260} copyable={false} /></div>
            )}
          </Card>
        );
      })}
      {documents.length > limit && <Button variant="secondary" onClick={() => setLimit(l => l + PAGE)}>Show more ({documents.length - limit} left)</Button>}
      <ConfirmDialog open={!!removing} tone="danger" title="Delete document" confirmLabel="Delete" busy={removing?.busy} error={removing?.error}
        onClose={() => setRemoving(null)} onConfirm={confirmRemove}>
        Delete document <span className="font-mono">{removing ? idOf(removing.doc) : ''}</span>? This cannot be undone.
      </ConfirmDialog>
    </Stack>
  );
}
