import { useMemo, useState } from 'react';
import { Alert, ChevronDownIcon, ChevronRightIcon, Flex, LockIcon, PlusIcon, TextArea, ToggleButton, ToggleButtonGroup, Tooltip, XIcon } from 'xedonium';
import { addField, convertType, diffDocs, freshKey, getAt, removeAt, renameKey, setAt, specialOf, TYPES, typeOf } from '../../lib/docTree.js';

const field =
  'h-6 min-w-0 rounded-none border border-app-border bg-app-bg px-1.5 font-mono text-xs text-app-text outline-none hover:border-app-strong focus-visible:border-app-strong focus-visible:ring-1 focus-visible:ring-app-strong';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keyOf = path => JSON.stringify(path);

function StringInput({ value, label, onChange }) {
  const lines = Math.min(8, Math.max(1, value.split('\n').length, Math.ceil(value.length / 80)));
  return (
    <textarea
      aria-label={label}
      value={value}
      rows={lines}
      spellCheck={false}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className={`${field} h-auto min-h-6 w-full max-w-xl resize-none py-[3px] leading-4 text-[#86d9a0]`}
    />
  );
}

function NumberInput({ value, label, onChange }) {
  const [draft, setDraft] = useState(String(value));
  const valid = draft.trim() !== '' && Number.isFinite(Number(draft));
  if (valid && Number(draft) !== value) setDraft(String(value));
  return (
    <input
      aria-label={label}
      aria-invalid={!valid}
      inputMode="decimal"
      value={draft}
      onChange={e => {
        setDraft(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(Number(e.target.value))) onChange(Number(e.target.value));
      }}
      className={`${field} w-40 text-[#ff9e9e] ${valid ? '' : 'border-[#e23642]'}`}
    />
  );
}

function KeyInput({ value, label, autoFocus, onCommit }) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    if (draft !== value) onCommit(draft);
    if (!draft) setDraft(value);
  };
  return (
    <input
      aria-label={label}
      value={draft}
      autoFocus={autoFocus}
      onFocus={e => autoFocus && e.target.select()}
      spellCheck={false}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(value);
      }}
      className={`${field} w-36 font-semibold text-[#c29eff]`}
    />
  );
}

function TreeNode({ name, path, value, original, depth, locked, inArray, ops }) {
  const kind = typeOf(value);
  const special = kind === 'special' ? specialOf(value) : null;
  const container = kind === 'object' || kind === 'array';
  const open = !ops.collapsed.has(keyOf(path));
  const state = original === undefined ? 'added' : same(original, value) ? '' : 'changed';
  const label = path.join('.') || 'document';
  const count = container ? Object.keys(value).length : 0;

  return (
    <div>
      <div
        className={`flex items-start gap-2 border-b border-app-border/40 py-1 pr-2 ${state === 'added' ? 'bg-[#00db7c]/10' : state === 'changed' ? 'bg-app-strong/15' : ''}`}
        style={{ paddingLeft: depth * 18 + 8 }}
      >
        <span className="flex h-6 w-4 shrink-0 items-center">
          {container ? (
            <Tooltip text={open ? 'Collapse' : 'Expand'} placement="top">
              <button
                type="button"
                aria-expanded={open}
                aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
                onClick={() => ops.toggle(path)}
                className="[&>svg]:h-4 [&>svg]:w-4"
              >
                {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
              </button>
            </Tooltip>
          ) : null}
        </span>
        <span className="flex h-6 w-40 shrink-0 items-center gap-1">
          {inArray ? (
            <span className="font-mono text-xs text-app-muted">[{name}]</span>
          ) : locked ? (
            <Tooltip text="The identifier cannot be changed" placement="top">
              <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-[#c29eff]">
                {name} <LockIcon className="h-3 w-3 text-app-muted" />
              </span>
            </Tooltip>
          ) : (
            <KeyInput value={name} label={`Field name ${label}`} autoFocus={ops.justAdded === keyOf(path)} onCommit={next => ops.rename(path, next)} />
          )}
        </span>
        <span className="flex h-6 w-28 shrink-0 items-center">
          {special ? (
            <span className="bg-app-border/40 px-1.5 text-[11px] text-app-muted">{special.label}</span>
          ) : locked ? (
            <span className="text-[11px] text-app-muted">{kind}</span>
          ) : (
            <select
              aria-label={`Type of ${label}`}
              value={kind}
              onChange={e => ops.set(path, convertType(value, e.target.value))}
              className="h-6 rounded-none border border-app-border bg-app-bg px-1 text-[11px] text-app-muted hover:border-app-strong"
            >
              {TYPES.map(type => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          )}
        </span>
        <div className="min-w-0 flex-1">
          {kind === 'string' &&
            (locked ? <span className="font-mono text-xs">{value}</span> : <StringInput value={value} label={`Value of ${label}`} onChange={next => ops.set(path, next)} />)}
          {kind === 'number' &&
            (locked ? <span className="font-mono text-xs">{value}</span> : <NumberInput value={value} label={`Value of ${label}`} onChange={next => ops.set(path, next)} />)}
          {kind === 'boolean' && (
            <select aria-label={`Value of ${label}`} value={String(value)} onChange={e => ops.set(path, e.target.value === 'true')} className={`${field} w-24`}>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          )}
          {kind === 'null' && <span className="font-mono text-xs italic leading-6 text-app-muted">null</span>}
          {special &&
            (special.editable && !locked ? (
              <StringInput value={special.display} label={`Value of ${label}`} onChange={next => ops.set(path, { ...value, [special.field]: next })} />
            ) : (
              <span className="font-mono text-xs leading-6">{special.display}</span>
            ))}
          {container && (
            <span className="text-xs leading-6 text-app-muted">
              {kind === 'array' ? '[ ]' : '{ }'} {count} {kind === 'array' ? 'item' : 'field'}
              {count === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {!locked && (
          <Tooltip text="Remove" placement="top">
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={() => ops.remove(path)}
              className="flex h-6 w-6 shrink-0 items-center justify-center text-app-muted hover:text-[#f0989e] [&>svg]:h-3.5 [&>svg]:w-3.5"
            >
              <XIcon />
            </button>
          </Tooltip>
        )}
      </div>
      {container && open && (
        <>
          {Object.entries(value).map(([childName, child]) => {
            const childKey = kind === 'array' ? Number(childName) : childName;
            return (
              <TreeNode
                key={childName}
                name={childKey}
                path={[...path, childKey]}
                value={child}
                original={original === undefined ? undefined : original?.[childKey]}
                depth={depth + 1}
                locked={false}
                inArray={kind === 'array'}
                ops={ops}
              />
            );
          })}
          <div style={{ paddingLeft: (depth + 1) * 18 + 8 + 24 }} className="py-1">
            <button type="button" onClick={() => ops.add(path)} className="inline-flex items-center gap-1 text-xs text-[#aa77fd] hover:underline [&>svg]:h-3 [&>svg]:w-3">
              <PlusIcon /> Add {kind === 'array' ? 'item' : 'field'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const preview = value => {
  const text = JSON.stringify(value);
  return text && text.length > 140 ? `${text.slice(0, 139)}…` : text;
};

// Edits one document as a tree, as JSON text, or as a list of the changes made so far. `text` is the document as JSON and
// `onChange` receives the new JSON text; `original` is the stored document (null for a new one) and `idKey` its identifier field.
export default function DocumentEditor({ text, onChange, original = null, idKey = '_id', rows = 14 }) {
  const [mode, setMode] = useState('tree');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [justAdded, setJustAdded] = useState('');

  const parsed = useMemo(() => {
    try {
      const value = JSON.parse(text);
      return value && typeof value === 'object' && !Array.isArray(value) ? { value } : { error: 'The document must be a JSON object.' };
    } catch (err) {
      return { error: `Not valid JSON: ${err.message}` };
    }
  }, [text]);

  const doc = parsed.value;
  const changes = useMemo(() => (doc ? diffDocs(original || {}, doc) : []), [doc, original]);
  const emit = next => onChange(JSON.stringify(next, null, 2));

  const ops = {
    collapsed,
    justAdded,
    toggle: path =>
      setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(keyOf(path))) next.delete(keyOf(path));
        else next.add(keyOf(path));
        return next;
      }),
    set: (path, value) => emit(setAt(doc, path, value)),
    remove: path => emit(removeAt(doc, path)),
    rename: (path, name) => {
      const next = renameKey(doc, path, name);
      if (next !== doc) emit(next);
    },
    add: path => {
      const target = getAt(doc, path);
      const key = Array.isArray(target) ? target.length : freshKey(target);
      setJustAdded(keyOf([...path, key]));
      setCollapsed(prev => {
        const next = new Set(prev);
        next.delete(keyOf(path));
        return next;
      });
      emit(addField(doc, path, key, ''));
    }
  };

  const tabs = (
    <Flex gap={2} align="center" className="compact-buttons">
      <ToggleButtonGroup
        exclusive
        aria-label="Editor view"
        value={mode}
        onChange={value => {
          if (!value) return;
          if (value === 'tree' && !doc) return;
          setMode(value);
        }}
      >
        <ToggleButton value="tree">Tree</ToggleButton>
        <ToggleButton value="json">JSON</ToggleButton>
        <ToggleButton value="changes">Changes{changes.length ? ` (${changes.length})` : ''}</ToggleButton>
      </ToggleButtonGroup>
    </Flex>
  );

  return (
    <div className="flex flex-col gap-2">
      {tabs}
      {parsed.error && mode !== 'json' && <Alert tone="danger">{parsed.error} Switch to the JSON view to fix it.</Alert>}
      {mode === 'tree' && doc && (
        <div className="max-h-[28rem] overflow-auto border border-app-border bg-app-card" role="group" aria-label="Document fields">
          {Object.entries(doc).map(([name, value]) => (
            <TreeNode
              key={name}
              name={name}
              path={[name]}
              value={value}
              original={original ? original[name] : undefined}
              depth={0}
              locked={Boolean(original) && name === idKey}
              inArray={false}
              ops={ops}
            />
          ))}
          <div className="px-3 py-1.5">
            <button type="button" onClick={() => ops.add([])} className="inline-flex items-center gap-1 text-xs text-[#aa77fd] hover:underline [&>svg]:h-3 [&>svg]:w-3">
              <PlusIcon /> Add field
            </button>
          </div>
        </div>
      )}
      {mode === 'json' && (
        <div className="[&_textarea]:font-mono [&_textarea]:text-xs">
          <TextArea aria-label="Document JSON" rows={rows} spellCheck={false} value={text} onChange={onChange} error={parsed.error} />
        </div>
      )}
      {mode === 'changes' && (
        <div className="max-h-[28rem] overflow-auto border border-app-border bg-app-bg p-3 font-mono text-xs leading-5" aria-label="Changes">
          {!changes.length && <span className="text-app-muted">No changes yet.</span>}
          {changes.map((change, i) => (
            <div key={i} className="break-words">
              {change.kind !== 'added' && (
                <div className="text-[#f0989e]">
                  - {change.path}: {preview(change.before)}
                </div>
              )}
              {change.kind !== 'removed' && (
                <div className="text-[#5cffb8]">
                  + {change.path}: {preview(change.after)}
                </div>
              )}
            </div>
          ))}
          {changes.length > 0 && original && (
            <p className="mt-3 font-sans text-app-muted">Only the changed top-level fields are sent, so dates and ObjectIds you did not touch keep their type.</p>
          )}
        </div>
      )}
    </div>
  );
}
