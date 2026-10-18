import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import tokenizeQuery from '../../lib/tokenize.js';
import { suggest } from '../../lib/completions.js';

// Segment colours come from xedonium's theme-aware token variables (--xd-tok-*), so they follow light / dark.
const colorOf = kind => (kind ? `var(--xd-tok-${kind})` : undefined);
const INDENT = '  ';
const LINE_HEIGHT = 20; // leading-5
const GUTTER = 40; // w-10

const KIND_BADGE = { table: 'T', column: 'C', keyword: 'K' };

// Plain textarea with a coloured copy of its text drawn underneath: the textarea's own text is transparent,
// so you see the colours while the caret, selection and typing all stay native. Adds a line-number gutter, Tab
// indentation and a completion popup (tables, columns, keywords).
// `objects` feed the completions; `loadColumns(object)` asks for a table's columns when they are not known yet.
const QueryEditor = forwardRef(function QueryEditor({ value, onChange, onRun, onFormat, language, objects = [], loadColumns }, ref) {
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);
  const gutterRef = useRef(null);
  const probeRef = useRef(null);
  const pendingSelection = useRef(null);
  const escapeArmed = useRef(false); // after Escape the next Tab moves focus on instead of indenting
  const [popup, setPopup] = useState(null); // { start, caret, items, index }
  const lines = tokenizeQuery(value, language);
  const lineCount = value.split('\n').length;

  // What a Run should use: the selected text if there is any, otherwise the cursor position.
  useImperativeHandle(
    ref,
    () => ({
      getTarget() {
        const textarea = textareaRef.current;
        const start = textarea?.selectionStart ?? 0;
        const end = textarea?.selectionEnd ?? 0;
        return { selection: end > start ? value.slice(start, end) : '', cursor: end, start, end };
      }
    }),
    [value]
  );

  useLayoutEffect(() => {
    const target = pendingSelection.current;
    if (target && textareaRef.current) {
      textareaRef.current.setSelectionRange(target[0], target[1]);
      pendingSelection.current = null;
    }
  });

  const syncScroll = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = textarea.scrollTop;
      highlightRef.current.scrollLeft = textarea.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = textarea.scrollTop;
    if (popup) setPopup(null);
  };

  const edit = (next, selectionStart, selectionEnd = selectionStart) => {
    pendingSelection.current = [selectionStart, selectionEnd];
    onChange(next);
  };

  // ---- completions --------------------------------------------------------------------------------------------
  function refreshPopup(text, caret, force = false) {
    const result = suggest({ text, caret, language, objects, force });
    if (result.needColumnsFor && loadColumns) {
      loadColumns(result.needColumnsFor).then(() => {
        const textarea = textareaRef.current;
        if (textarea && document.activeElement === textarea) refreshPopup(textarea.value, textarea.selectionStart, true);
      });
    }
    setPopup(result.items.length ? { start: result.start, caret, items: result.items, index: 0 } : null);
  }

  // The popup follows the objects as they load (e.g. columns arriving after a describe).
  useEffect(() => {
    if (popup) setPopup(null);
  }, [language]);

  function accept(item) {
    const textarea = textareaRef.current;
    const caret = textarea.selectionStart;
    const next = value.slice(0, popup.start) + item.label + value.slice(caret);
    setPopup(null);
    edit(next, popup.start + item.label.length);
  }

  function popupPosition() {
    const textarea = textareaRef.current;
    const charWidth = (probeRef.current?.getBoundingClientRect().width || 70) / 10;
    const before = value.slice(0, popup.caret);
    const line = before.split('\n').length - 1;
    const column = before.length - (before.lastIndexOf('\n') + 1);
    const left = Math.max(GUTTER + 8, Math.min(GUTTER + 8 + column * charWidth - (textarea?.scrollLeft || 0), (textarea?.clientWidth || 400) - 200));
    const top = 8 + (line + 1) * LINE_HEIGHT - (textarea?.scrollTop || 0);
    return { left, top: Math.max(LINE_HEIGHT, top) };
  }

  // ---- keys ---------------------------------------------------------------------------------------------------
  function indent(textarea, outdent) {
    const { selectionStart: start, selectionEnd: end } = textarea;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const multi = value.slice(start, end).includes('\n');
    if (!outdent && !multi) {
      edit(value.slice(0, start) + INDENT + value.slice(end), start + INDENT.length);
      return;
    }
    const blockEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
    const block = value.slice(lineStart, blockEnd).split('\n');
    let first = 0;
    let total = 0;
    const changed = block.map((text, i) => {
      if (!outdent) {
        total += INDENT.length;
        if (i === 0) first = INDENT.length;
        return INDENT + text;
      }
      const remove = /^ {1,2}|^\t/.exec(text)?.[0].length || 0;
      total -= remove;
      if (i === 0) first = -remove;
      return text.slice(remove);
    });
    const next = value.slice(0, lineStart) + changed.join('\n') + value.slice(blockEnd);
    edit(next, Math.max(lineStart, start + first), end + total);
  }

  function onKeyDown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      setPopup(null);
      onRun(e.shiftKey ? 'all' : 'current');
      return;
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      onFormat?.();
      return;
    }
    if (mod && e.key === ' ') {
      e.preventDefault();
      refreshPopup(value, e.target.selectionStart, true);
      return;
    }
    if (popup) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setPopup(p => ({ ...p, index: (p.index + (e.key === 'ArrowDown' ? 1 : p.items.length - 1)) % p.items.length }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        accept(popup.items[popup.index]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setPopup(null);
        return;
      }
    }
    if (e.key === 'Escape') {
      escapeArmed.current = true;
      return;
    }
    if (e.key === 'Tab' && !mod && !e.altKey) {
      if (escapeArmed.current) {
        escapeArmed.current = false;
        return;
      } // let focus leave the editor
      e.preventDefault();
      indent(e.target, e.shiftKey);
      return;
    }
    escapeArmed.current = false;
  }

  const layer = 'absolute inset-0 m-0 whitespace-pre py-2 pl-12 pr-2 font-mono text-xs leading-5';
  const position = popup ? popupPosition() : null;
  return (
    <div className="relative">
      <div className="relative h-24 min-h-[4.5rem] resize-y overflow-hidden border-b border-app-border bg-app-card">
        <pre
          ref={gutterRef}
          aria-hidden="true"
          className="absolute inset-y-0 left-0 m-0 w-10 select-none overflow-hidden border-r border-app-border py-2 pr-2 text-right font-mono text-xs leading-5 text-app-muted"
        >
          {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
        </pre>
        <pre ref={highlightRef} aria-hidden="true" className={`${layer} overflow-hidden text-app-text`}>
          {lines.map((line, i) => (
            <span key={i}>
              {line.map((segment, j) => (
                <span key={j} style={{ color: colorOf(segment.kind) }}>
                  {segment.text}
                </span>
              ))}
              {i < lines.length - 1 ? '\n' : ' '}
            </span>
          ))}
        </pre>
        <textarea
          ref={textareaRef}
          aria-label="Query editor"
          spellCheck={false}
          value={value}
          onScroll={syncScroll}
          onChange={e => {
            onChange(e.target.value);
            refreshPopup(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setPopup(null)}
          onClick={() => setPopup(null)}
          className={`${layer} resize-none overflow-auto border-0 bg-transparent text-transparent caret-[rgb(var(--color-app-text))] outline-none selection:bg-app-soft/40 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-app-strong`}
        />
        <span ref={probeRef} aria-hidden="true" className="invisible absolute left-0 top-0 whitespace-pre font-mono text-xs">
          0000000000
        </span>
      </div>
      {popup && (
        <ul
          role="listbox"
          aria-label="Suggestions"
          className="absolute z-30 max-h-48 min-w-[11rem] max-w-xs overflow-auto rounded border border-app-border bg-app-card py-1 text-xs shadow-lg"
          style={{ left: position.left, top: position.top }}
        >
          {popup.items.map((item, i) => (
            <li
              key={`${item.kind}:${item.label}`}
              role="option"
              aria-selected={i === popup.index}
              onMouseDown={e => {
                e.preventDefault();
                accept(item);
              }}
              className={`flex cursor-pointer items-center gap-2 px-2 py-1 ${i === popup.index ? 'bg-app-soft/40' : ''}`}
            >
              <span className="w-3 shrink-0 text-center text-[9px] font-bold text-app-muted">{KIND_BADGE[item.kind]}</span>
              <span className="truncate font-mono">{item.label}</span>
              {item.detail ? <span className="ml-auto truncate pl-3 text-[10px] text-app-muted">{item.detail}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default QueryEditor;
