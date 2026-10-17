import React from 'react';
import { Button, CodeDisplay, Flex, Modal, CopyIcon } from 'xedonium';

export default function RecordViewerDialog({ open, onClose, record, onCopy }) {
  return (
    <Modal open={open} onClose={onClose} title="Record contents" maxWidth="max-w-2xl"
      footer={<Flex justify="end" gap={2}>
        <Button variant="secondary" onClick={() => onCopy(record)}><CopyIcon /> Copy record</Button>
        <Button onClick={onClose}>Close</Button>
      </Flex>}>
      <div className="p-5"><CodeDisplay language="json" code={JSON.stringify(record, null, 2) || ''} maxHeight={420} copyable={false} /></div>
    </Modal>
  );
}
