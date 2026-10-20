import { Alert, Button, Flex, Modal, Stack, TextArea } from 'xedonium';
import DocumentEditor from '../workspace/DocumentEditor.jsx';

const verbs = { insert: 'Insert', edit: 'Edit', delete: 'Delete' };

// `records` is the object returned by useRecordEditor.
export default function RecordEditorDialog({ records, objectName, documentMode = false }) {
  const { editorOpen, setEditorOpen, action, jsonText, setJsonText, error, apply } = records;
  const close = () => setEditorOpen(false);
  const danger = action === 'delete';
  // Documents (MongoDB, Firestore, Supabase REST) are edited as a tree; table rows stay a plain JSON record.
  const tree = documentMode && action !== 'delete';
  return (
    <Modal
      open={editorOpen}
      onClose={close}
      as="form"
      noValidate
      onSubmit={apply}
      maxWidth={tree ? 'max-w-4xl' : 'max-w-2xl'}
      tone={danger ? 'danger' : 'default'}
      title={`${verbs[action]} record · ${objectName || ''}`}
      footer={
        <Flex justify="end" gap={2}>
          <Button type="button" variant="flat" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'default'}>
            {action === 'insert' ? 'Insert' : action === 'edit' ? 'Save changes' : 'Delete'}
          </Button>
        </Flex>
      }
    >
      <Stack gap={3} className="compact-fields p-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {danger && <Alert tone="warning">Confirm the record below. Deleting cannot be undone.</Alert>}
        {tree ? (
          <DocumentEditor
            key={`${action}-${editorOpen}`}
            text={jsonText}
            onChange={setJsonText}
            original={action === 'edit' ? records.selectedJson : null}
            idKey={records.selectedJson?._id !== undefined ? '_id' : 'id'}
          />
        ) : (
          <div className="[&_textarea]:font-mono [&_textarea]:text-xs">
            <TextArea label="Record JSON" rows={14} spellCheck={false} value={jsonText} onChange={setJsonText} />
          </div>
        )}
      </Stack>
    </Modal>
  );
}
