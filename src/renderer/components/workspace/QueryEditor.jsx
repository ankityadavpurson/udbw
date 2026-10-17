import { TextArea } from 'xedonium';

export default function QueryEditor({ value, onChange, onRun }) {
  return (
    <div className="compact-fields [&_textarea]:font-mono [&_textarea]:!border-x-0 [&_textarea]:!border-t-0">
      <TextArea aria-label="Query editor" rows={3} spellCheck={false} value={value} onChange={onChange}
        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onRun(); } }} />
    </div>
  );
}
