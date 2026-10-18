import { Button, CloseIcon, Flex, PlusIcon, Tabs } from 'xedonium';

export default function QueryTabs({ tabs, activeTabId, canAdd, onSelect, onClose, onAdd }) {
  if (!tabs.length) return null;
  const items = tabs.map(t => ({
    key: t.id,
    label: (
      <span className="inline-flex max-w-[12rem] items-center gap-2">
        <span className="truncate">{t.title}</span>
        <span
          role="button"
          aria-label={`Close ${t.title}`}
          className="shrink-0 rounded p-0.5 opacity-60 hover:bg-app-border hover:opacity-100 [&>svg]:h-3 [&>svg]:w-3"
          onClick={e => {
            e.stopPropagation();
            onClose(t.id);
          }}
        >
          <CloseIcon />
        </span>
      </span>
    )
  }));
  return (
    <Flex gap={1} align="center" className="compact-tabs">
      <div className="min-w-0 flex-1">
        <Tabs value={activeTabId} onChange={onSelect} items={items} />
      </div>
      <span className="compact-buttons compact-icons">
        <Button variant="flat" tooltip="New query tab (Ctrl+T)" aria-label="New query tab" disabled={!canAdd} onClick={onAdd}>
          <PlusIcon />
        </Button>
      </span>
    </Flex>
  );
}
