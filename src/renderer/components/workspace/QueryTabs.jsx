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
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-none opacity-60 hover:bg-app-border hover:opacity-100 [&>svg]:h-3 [&>svg]:w-3"
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
  // Middle-click anywhere on a tab closes it.
  const tabOf = e => {
    const el = e.target.closest?.('[role="tab"]');
    return el && tabs.find(t => el.id.endsWith(`-tab-${t.id}`));
  };
  return (
    <Flex gap={1} align="center" className="compact-tabs shadow-[inset_0_-1px_0_rgb(var(--color-app-border))]">
      <div
        className="min-w-0 flex-1"
        onMouseDown={e => e.button === 1 && tabOf(e) && e.preventDefault()}
        onAuxClick={e => {
          const t = e.button === 1 && tabOf(e);
          if (t) {
            e.preventDefault();
            onClose(t.id);
          }
        }}
      >
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
