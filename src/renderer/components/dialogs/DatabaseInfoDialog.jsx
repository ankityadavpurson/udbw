import { Alert, Button, DatabaseIcon, Flex, HelperText, Loader, Modal, RefreshIcon } from 'xedonium';

// `dbInfo` is the object returned by useDatabaseInfo: { name, subtitle, groups: [{ title, items: [{ label, value }] }] }.
export default function DatabaseInfoDialog({ dbInfo, connectionName }) {
  const { open, loading, info, error, close, reload } = dbInfo;
  return (
    <Modal
      open={open}
      onClose={close}
      title={`Database info${connectionName ? ` · ${connectionName}` : ''}`}
      maxWidth="max-w-2xl"
      footer={
        <Flex justify="between" align="center" gap={2} className="w-full">
          <div className="compact-buttons">
            <Button variant="secondary" disabled={loading} onClick={reload}>
              <RefreshIcon /> Refresh
            </Button>
          </div>
          <Button onClick={close}>Close</Button>
        </Flex>
      }
    >
      <div className="space-y-5 p-5">
        {loading && !info && <Loader variant="inline" size="sm" label="Reading database info…" />}
        {error && <Alert tone="danger">{error}</Alert>}
        {info && (
          <>
            <Flex gap={3} align="center">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center border border-app-border [&>svg]:h-6 [&>svg]:w-6">
                <DatabaseIcon />
              </span>
              <div className="min-w-0">
                <div className="truncate text-xs text-app-muted">{info.subtitle}</div>
                <div className="truncate text-lg font-semibold">{info.name}</div>
              </div>
            </Flex>
            {info.groups
              .filter(group => group.items.length)
              .map(group => (
                <section key={group.title} aria-label={group.title}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-app-muted">{group.title}</h3>
                  <dl className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
                    {group.items.map(item => (
                      <div key={item.label} className="contents">
                        <dt className="text-app-muted">{item.label}</dt>
                        <dd className="select-text break-words font-semibold">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            {!info.groups.some(group => group.items.length) && <HelperText>This database reports no details.</HelperText>}
          </>
        )}
      </div>
    </Modal>
  );
}
