import { TextArea } from 'xedonium';

export default function QueryEditor({ value, onChange, onRun }) {
  return (
    <div className="[&_textarea]:font-mono [&_textarea]:text-[13px]">
      <TextArea aria-label="Query editor" rows={3} spellCheck={false} value={value} onChange={onChange}
        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onRun(); } }} />
    </div>
  );
}
