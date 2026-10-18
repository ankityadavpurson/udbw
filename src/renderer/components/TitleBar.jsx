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
      <svg className="h-4 w-4 shrink-0 text-app-strong" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M4 2H2v8h2V2zm16 0h2v8h-2V2zm-6 6h-4V2H4v2h4v4H4v2h4v4H4v2h4v4H4v2h6v-6h4v6h2v-6h4v-2h-4v-4h4V8h-4V2h-2v6zm-4 6v-4h4v4h-4zM20 2h-4v2h4V2zM2 14h2v8H2v-8zm14 6h4v2h-4v-2zm6-6h-2v8h2v-8z" />
      </svg>
      <span className="truncate text-xs font-semibold">UDBW</span>
    </div>
  );
}
