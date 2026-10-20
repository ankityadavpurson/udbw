import { useEffect, useState } from 'react';
import { Button, Flex, Modal } from 'xedonium';

// The updater's messages (update available, ready, no updates, errors) and the download progress, in the app's own theme.
// The main process sends a notice and waits for the answer: 'primary' (the main button) or 'secondary'.
export default function UpdateDialog() {
  const [notice, setNotice] = useState(null);
  const [percent, setPercent] = useState(null);
  const [hidden, setHidden] = useState(false); // the progress dialog was closed; the download carries on

  useEffect(() => window.workbench.onUpdateNotice(setNotice), []);
  useEffect(
    () =>
      window.workbench.onUpdateProgress(value => {
        setPercent(value);
        if (value === null) setHidden(false);
      }),
    []
  );

  const answer = choice => {
    setNotice(null);
    window.workbench.answerUpdate(choice);
  };

  if (notice)
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
          {notice.detail && <p className="whitespace-pre-wrap break-words text-sm text-app-muted">{notice.detail}</p>}
        </div>
      </Modal>
    );

  if (percent !== null && !hidden)
    return (
      <Modal open onClose={() => setHidden(true)} title="Downloading update" maxWidth="max-w-md">
        <div className="space-y-3 p-5" role="status">
          <p className="text-sm text-app-muted">{percent}% downloaded. Close this to keep working; the download continues and you will be asked before the app restarts.</p>
          <div className="h-2 w-full bg-app-border/40" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Download progress">
            <div className="h-full bg-app-strong transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </Modal>
    );

  return null;
}
