import { TextArea } from 'xedonium';

export default function QueryEditor({ value, onChange, onRun }) {
  return (
    <div className="compact-fields [&_textarea]:font-mono">
      <TextArea aria-label="Query editor" rows={3} spellCheck={false} value={value} onChange={onChange}
        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onRun(); } }} />
    </div>
  );
}
