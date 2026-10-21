import { useEffect, useState } from 'react';
import Logo from './Logo.jsx';

// Our own title bar (the window runs with a hidden native one). The system window buttons sit on the left (macOS traffic
// lights) or are drawn by Electron's title bar overlay on the right, so the bar leaves room for them on both sides to keep
// the title centred, and is a drag handle for the window. Keep the height in step with TITLE_BAR in src/main/window.js.
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
const SIDE = isMac ? '5.5rem' : 'max(0.75rem, calc(100vw - env(titlebar-area-width, 100vw)))';

// A pending update, shown at the far edge of the bar. It follows the same state as the toast.
function UpdateBadge() {
  const [update, setUpdate] = useState(null);
  useEffect(() => {
    window.workbench.updateToastState().then(state => state && setUpdate(state));
    return window.workbench.onUpdateToast(setUpdate);
  }, []);
  if (!update || update.kind === 'error') return null;
  const label = { available: 'Update available', downloading: `Updating ${update.percent ?? 0}%`, ready: 'Restart to update' }[update.kind];
  const onClick = () => {
    if (update.kind === 'available') {
      window.workbench.downloadUpdate();
      setUpdate({ kind: 'downloading', version: update.version, percent: 0 });
    } else if (update.kind === 'ready') window.workbench.installUpdate();
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={update.kind === 'downloading'}
      className="shrink-0 border border-app-border px-2 text-[11px] font-semibold leading-5 text-app-text hover:bg-app-border/40 disabled:cursor-default disabled:hover:bg-transparent"
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      {label}
    </button>
  );
}

export default function TitleBar({ connectionName }) {
  const isDev = Boolean(window.workbench?.isDev);
  useEffect(() => {
    document.title = `${connectionName ? `${connectionName} · ` : ''}UDBW${isDev ? ' [DEV]' : ''}`;
  }, [isDev, connectionName]);
  return (
    <div
      className={`grid shrink-0 select-none grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-app-border bg-app-card text-app-text ${isMac ? 'h-[38px]' : 'h-[30px]'}`}
      style={{ WebkitAppRegion: 'drag', paddingLeft: SIDE, paddingRight: SIDE }}
    >
      <span />
      <div className="flex min-w-0 items-center justify-center gap-2">
        <Logo />
        <span className="shrink-0 text-xs font-semibold">UDBW</span>
        {connectionName && (
          <>
            <span className="shrink-0 text-xs text-app-muted">—</span>
            <span className="truncate text-xs text-app-muted">{connectionName}</span>
          </>
        )}
        {isDev && <span className="shrink-0 text-xs font-semibold text-[#8f6d00] dark:text-[#e0bf00]">[DEV]</span>}
      </div>
      <div className="flex min-w-0 justify-end">
        <UpdateBadge />
      </div>
    </div>
  );
}
