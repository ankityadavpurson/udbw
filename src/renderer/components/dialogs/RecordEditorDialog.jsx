import { Alert, Button, Flex, Modal, Stack, TextArea } from 'xedonium';

const verbs = { insert: 'Insert', edit: 'Edit', delete: 'Delete' };

// `records` is the object returned by useRecordEditor.
export default function RecordEditorDialog({ records, objectName }) {
  const { editorOpen, setEditorOpen, action, jsonText, setJsonText, error, apply } = records;
  const close = () => setEditorOpen(false);
  const danger = action === 'delete';
  return (
    <Modal open={editorOpen} onClose={close} as="form" noValidate onSubmit={apply} maxWidth="max-w-2xl" tone={danger ? 'danger' : 'default'}
      title={`${verbs[action]} record · ${objectName || ''}`}
      footer={<Flex justify="end" gap={2}>
        <Button type="button" variant="flat" onClick={close}>Cancel</Button>
        <Button type="submit" variant={danger ? 'danger' : 'default'}>{action === 'insert' ? 'Insert' : action === 'edit' ? 'Save changes' : 'Delete'}</Button>
      </Flex>}>
      <Stack gap={3} className="p-5">
        {error && <Alert tone="danger">{error}</Alert>}
        {danger && <Alert tone="warning">Confirm the record below. Deleting cannot be undone.</Alert>}
        <div className="[&_textarea]:font-mono [&_textarea]:text-xs">
          <TextArea label="Record JSON" rows={14} spellCheck={false} value={jsonText} onChange={setJsonText} />
        </div>
      </Stack>
    </Modal>
  );
}
