import { useEffect, useState } from 'react';
import { Button, Flex, XIcon } from 'xedonium';

// The automatic update check reports here, never in a dialog: a toast that stays until it is dismissed.
// The main process sends { kind: 'available' | 'downloading' | 'ready' | 'error', version?, percent?, message? } (or null).
export default function UpdateToast() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    window.workbench.updateToastState().then(state => state && setToast(state));
    return window.workbench.onUpdateToast(setToast);
  }, []);

  if (!toast) return null;
  const dismiss = () => {
    setToast(null);
    window.workbench.dismissUpdate();
  };
  const version = toast.version ? ` ${toast.version}` : '';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[90] flex w-[min(24rem,calc(100vw-2.5rem))] items-start gap-3 border border-app-strong bg-app-card p-3 text-sm text-app-text shadow-xl"
    >
      <div className="min-w-0 flex-1 space-y-2">
        {toast.kind === 'available' && (
          <>
            <p className="font-semibold">Update available</p>
            <p className="text-xs text-app-muted">Version{version} is ready to download. It installs when you restart the app.</p>
            <Flex gap={2} className="compact-buttons">
              <Button
                onClick={() => {
                  window.workbench.downloadUpdate();
                  setToast({ kind: 'downloading', version: toast.version, percent: 0 });
                }}
              >
                Download
              </Button>
              <Button variant="flat" onClick={dismiss}>
                Later
              </Button>
            </Flex>
          </>
        )}
        {toast.kind === 'downloading' && (
          <>
            <p className="font-semibold">Downloading update{version}…</p>
            <div className="h-1.5 w-full bg-app-border/40" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={toast.percent} aria-label="Download progress">
              <div className="h-full bg-app-strong transition-[width]" style={{ width: `${toast.percent}%` }} />
            </div>
            <p className="text-xs text-app-muted">{toast.percent}% · you can keep working, you will be asked before the app restarts.</p>
          </>
        )}
        {toast.kind === 'ready' && (
          <>
            <p className="font-semibold">Update ready</p>
            <p className="text-xs text-app-muted">Version{version} has been downloaded. Restart the app to finish updating.</p>
            <Flex gap={2} className="compact-buttons">
              <Button onClick={() => window.workbench.installUpdate()}>Restart now</Button>
              <Button variant="flat" onClick={dismiss}>
                Later
              </Button>
            </Flex>
          </>
        )}
        {toast.kind === 'error' && (
          <>
            <p className="font-semibold text-[#e96770]">Update failed</p>
            <p className="break-words text-xs text-app-muted">{toast.message}</p>
          </>
        )}
      </div>
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="shrink-0 text-app-muted hover:text-app-text [&>svg]:h-4 [&>svg]:w-4">
        <XIcon />
      </button>
    </div>
  );
}
