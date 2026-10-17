import { useRef } from 'react';
import tokenizeQuery from '../../lib/tokenize.js';

// Segment colours come from xedonium's theme-aware token variables (--xd-tok-*), so they follow light / dark.
const colorOf = kind => (kind ? `var(--xd-tok-${kind})` : undefined);

// Plain textarea with a coloured copy of its text drawn underneath: the textarea's own text is transparent,
// so you see the colours while the caret, selection and typing all stay native.
export default function QueryEditor({ value, onChange, onRun, language }) {
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);
  const lines = tokenizeQuery(value, language);

  const syncScroll = () => {
    const textarea = textareaRef.current;
    const highlight = highlightRef.current;
    if (textarea && highlight) { highlight.scrollTop = textarea.scrollTop; highlight.scrollLeft = textarea.scrollLeft; }
  };

  const layer = 'absolute inset-0 m-0 whitespace-pre p-2 font-mono text-xs leading-5';
  return (
    <div className="relative h-24 min-h-[4.5rem] resize-y overflow-hidden border-b border-app-border bg-app-card">
      <pre ref={highlightRef} aria-hidden="true" className={`${layer} overflow-hidden text-app-text`}>
        {lines.map((line, i) => (
          <span key={i}>
            {line.map((segment, j) => <span key={j} style={{ color: colorOf(segment.kind) }}>{segment.text}</span>)}
            {i < lines.length - 1 ? '\n' : ' '}
          </span>
        ))}
      </pre>
      <textarea ref={textareaRef} aria-label="Query editor" spellCheck={false} value={value} onScroll={syncScroll}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onRun(); } }}
        className={`${layer} resize-none overflow-auto border-0 bg-transparent text-transparent caret-[rgb(var(--color-app-text))] outline-none selection:bg-app-soft/40 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-app-strong`} />
    </div>
  );
}
