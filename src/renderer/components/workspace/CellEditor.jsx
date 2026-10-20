import { useRef, useState } from 'react';
import { Tooltip } from 'xedonium';

// Inline editor of one grid cell. Enter or leaving the cell keeps the value, Esc drops it. NULL is its own value,
// distinct from an empty string.
export default function CellEditor({ value, label, onCommit, onCancel }) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value));
  const [isNull, setIsNull] = useState(value === null);
  const done = useRef(false);

  const finish = next => {
    if (done.current) return;
    done.current = true;
    if (next === undefined) onCancel();
    else onCommit(next);
  };
  const current = () => (isNull ? null : text);

  return (
    <div className="flex min-w-[8rem] items-center gap-1">
      <input
        autoFocus
        aria-label={label}
        value={isNull ? '' : text}
        placeholder={isNull ? 'NULL' : ''}
        spellCheck={false}
        onChange={e => {
          setText(e.target.value);
          setIsNull(false);
        }}
        onFocus={e => e.target.select()}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(current());
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            finish(undefined);
          }
        }}
        onBlur={() => finish(current())}
        className="h-6 min-w-0 flex-1 rounded-none border border-app-strong bg-app-bg px-1.5 font-mono text-xs text-app-text outline-none placeholder:italic placeholder:text-app-muted"
      />
      <Tooltip text="Set to NULL" placement="top">
        <button
          type="button"
          aria-label="Set to NULL"
          onMouseDown={e => {
            e.preventDefault();
            finish(null);
          }}
          className="h-6 shrink-0 border border-app-border px-1.5 text-[11px] text-app-muted hover:text-app-text"
        >
          NULL
        </button>
      </Tooltip>
    </div>
  );
}
