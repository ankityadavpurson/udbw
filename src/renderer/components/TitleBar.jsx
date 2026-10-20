import Logo from './Logo.jsx';

// Our own title bar (the window runs with a hidden native one). The system window buttons are drawn by
// Electron's title bar overlay on the right, so the bar leaves room for them and is a drag handle for the window.
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

export default function TitleBar() {
  return (
    <div
      className="flex h-[30px] shrink-0 select-none items-center gap-2 border-b border-app-border bg-app-card text-app-text"
      style={{
        WebkitAppRegion: 'drag',
        paddingLeft: isMac ? '5rem' : '0.75rem', // macOS traffic lights sit on the left
        paddingRight: 'calc(100vw - env(titlebar-area-width, 100vw))' // the overlay's window buttons sit on the right
      }}
    >
      <Logo />
      <span className="truncate text-xs font-semibold">UDBW</span>
    </div>
  );
}
