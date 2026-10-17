import { useEffect, useState } from 'react';
import { Button, Chip, Field, Flex, HelperText, Input, Modal, SearchIcon, Stack, Tabs } from 'xedonium';

const formatTime = at => new Date(at).toLocaleString();

// Query history of the active connection, plus saved queries (shared by every connection of the same kind).
// `draft` is text the user asked to save; when set, a name is requested first.
export default function HistoryDialog({ open, onClose, history, snippets, draft, onUse, onOpenNew, onSave, onRemoveSnippet, onClear }) {
  const [tab, setTab] = useState('history');
  const [search, setSearch] = useState('');
  const [naming, setNaming] = useState(null);   // { text, name }

  useEffect(() => {
    if (!open) return;
    setSearch('');
    if (draft) { setTab('saved'); setNaming({ text: draft, name: '' }); } else { setNaming(null); setTab('history'); }
  }, [open, draft]);

  const needle = search.trim().toLowerCase();
  const matches = item => !needle || item.text.toLowerCase().includes(needle) || (item.name || '').toLowerCase().includes(needle);
  const items = (tab === 'history' ? history : snippets).filter(matches);

  const submitName = event => {
    event.preventDefault();
    if (!naming?.name.trim()) return;
    onSave({ name: naming.name.trim(), text: naming.text });
    setNaming(null); setTab('saved');
  };

  return (
    <Modal open={open} onClose={onClose} title="Query history and saved queries" maxWidth="max-w-3xl">
      <Stack gap={3} className="compact-fields p-4">
        <Tabs value={tab} onChange={setTab} items={[{ key: 'history', label: `History (${history.length})` }, { key: 'saved', label: `Saved (${snippets.length})` }]} />
        <Flex gap={2} align="center">
          <div className="min-w-0 flex-1"><Input value={search} onChange={setSearch} placeholder="Search…" aria-label="Search queries" startAdornment={<SearchIcon className="h-4 w-4" />} /></div>
          {tab === 'history' && !!history.length && <span className="compact-buttons"><Button variant="flat" onClick={onClear}>Clear history</Button></span>}
        </Flex>
        {naming && (
          <form onSubmit={submitName}>
            <Flex gap={2} align="end">
              <div className="min-w-0 flex-1"><Field label="Name for this query" value={naming.name} onChange={name => setNaming(n => ({ ...n, name }))} placeholder="e.g. Orders per customer" required /></div>
              <span className="compact-buttons"><Button type="submit">Save</Button></span>
              <span className="compact-buttons"><Button type="button" variant="flat" onClick={() => setNaming(null)}>Cancel</Button></span>
            </Flex>
            <pre className="mt-2 max-h-20 overflow-auto whitespace-pre-wrap rounded border border-app-border bg-app-card p-2 font-mono text-xs">{naming.text}</pre>
          </form>
        )}
        {!items.length && <HelperText>{tab === 'history' ? 'Statements you run from the editor show up here.' : 'Nothing saved yet. Use “Save” on a history entry, or Tools → Save query.'}</HelperText>}
        <div className="max-h-[50vh] space-y-2 overflow-auto">
          {items.map(item => (
            <div key={item.id} className="rounded border border-app-border p-2">
              <Flex gap={2} align="center" wrap className="text-[11px] text-app-muted">
                {tab === 'saved' ? <strong className="text-app-text">{item.name}</strong> : <>
                  <span>{formatTime(item.at)}</span>
                  <Chip size="sm" tone={item.ok ? 'success' : 'danger'}>{item.ok ? 'ok' : 'failed'}</Chip>
                  {item.ms != null && <span>{item.ms} ms</span>}
                  {item.ok && item.rows != null && <span>{item.rows} rows</span>}
                </>}
              </Flex>
              <pre className="mt-1 max-h-24 overflow-hidden whitespace-pre-wrap font-mono text-xs">{item.text}</pre>
              {!item.ok && item.error && <p className="mt-1 truncate text-[11px] text-red-500">{item.error}</p>}
              <Flex gap={2} className="compact-buttons mt-2">
                <Button variant="secondary" onClick={() => onUse(item.text)}>Use in editor</Button>
                <Button variant="secondary" onClick={() => onOpenNew(item.text)}>Open in new tab</Button>
                {tab === 'history' && <Button variant="flat" onClick={() => setNaming({ text: item.text, name: '' })}>Save</Button>}
                {tab === 'saved' && <Button variant="flat" onClick={() => onRemoveSnippet(item.id)}>Delete</Button>}
              </Flex>
            </div>
          ))}
        </div>
      </Stack>
    </Modal>
  );
}
