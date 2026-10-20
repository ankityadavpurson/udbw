import { useEffect, useState } from 'react';
import { Button, Flex, Modal } from 'xedonium';

// Answers to checks the user asked for (no updates, errors, "update available" from Settings), in the app's own theme.
// The main process sends a notice and waits for the answer: 'primary' (the main button) or 'secondary'.
export default function UpdateDialog() {
  const [notice, setNotice] = useState(null);

  useEffect(() => window.workbench.onUpdateNotice(setNotice), []);

  const answer = choice => {
    setNotice(null);
    window.workbench.answerUpdate(choice);
  };

  if (!notice) return null;
  return (
    <Modal
      open
      onClose={() => answer(notice.secondary ? 'secondary' : 'primary')}
      title={notice.title}
      tone={notice.tone === 'danger' ? 'danger' : 'default'}
      maxWidth="max-w-md"
      footer={
        <Flex justify="end" gap={2} className="compact-buttons">
          {notice.secondary && (
            <Button variant="flat" onClick={() => answer('secondary')}>
              {notice.secondary}
            </Button>
          )}
          <Button autoFocus onClick={() => answer('primary')}>
            {notice.primary}
          </Button>
        </Flex>
      }
    >
      <div className="space-y-2 p-5">
        <p className="text-sm font-semibold">{notice.message}</p>
        {notice.detail && <p className="select-text whitespace-pre-wrap break-words text-sm text-app-muted">{notice.detail}</p>}
      </div>
    </Modal>
  );
}
