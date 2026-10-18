import { Button, Chip, CodeIcon, Flex, HelperText, Loader, LockIcon, Menu, MenuIcon, MoreVerticalIcon, PlayIcon, PowerIcon, XIcon } from 'xedonium';
import StatusDot from '../StatusDot.jsx';

const ENV_TONE = { production: 'danger', staging: 'warning', development: 'success' };

export default function ConnectionToolbar({
  active,
  engine,
  status,
  isConnected,
  busy,
  showMenuButton,
  onOpenMenu,
  onConnect,
  onDisconnect,
  onRun,
  onRunAll,
  onStop,
  toolItems,
  menuItems
}) {
  return (
    <Flex gap={2} align="center" justify="between" wrap className="px-2 py-1.5">
      <Flex gap={2} align="center" className="min-w-0">
        {showMenuButton && (
          <Button variant="secondary" aria-label="Open menu" onClick={onOpenMenu}>
            <MenuIcon />
          </Button>
        )}
        {active && <StatusDot state={status} />}
        <strong className="truncate text-sm">{active?.name || 'No connection selected'}</strong>
        {active?.environment && (
          <Chip size="sm" tone={ENV_TONE[active.environment]} filled={active.environment === 'production'}>
            {active.environment}
          </Chip>
        )}
        {active?.readOnly && (
          <Chip size="sm" tone="info" leading={<LockIcon className="h-3 w-3" />}>
            read-only
          </Chip>
        )}
        <HelperText className="truncate">{engine?.help || 'Select or create a connection to begin'}</HelperText>
      </Flex>
      <Flex gap={2} align="center" className="compact-buttons">
        <Button variant={isConnected ? 'secondary' : 'default'} disabled={!active || busy} onClick={isConnected ? onDisconnect : onConnect}>
          {status === 'connecting' ? (
            <>
              <Loader variant="spinner" size="sm" label="Connecting" /> Connecting…
            </>
          ) : (
            <>
              <PowerIcon /> {isConnected ? 'Disconnect' : 'Connect'}
            </>
          )}
        </Button>
        {busy && isConnected ? (
          <Button variant="danger" tooltip="Stop the running query" onClick={onStop}>
            <XIcon /> Stop
          </Button>
        ) : (
          <>
            <Button disabled={!isConnected} tooltip="Runs the selection, or the statement at the cursor (Ctrl / ⌘ + Enter)" onClick={onRun}>
              <PlayIcon /> Run
            </Button>
            <Button variant="secondary" disabled={!isConnected} tooltip="Runs every statement in the editor (Ctrl / ⌘ + Shift + Enter)" onClick={onRunAll}>
              Run all
            </Button>
          </>
        )}
        <Menu
          label="Editor tools"
          variant="secondary"
          placement="bottom-end"
          trigger={
            <>
              <CodeIcon /> Tools
            </>
          }
          items={toolItems}
        />
        <Menu label="Connection actions" variant="secondary" placement="bottom-end" trigger={<MoreVerticalIcon />} items={menuItems} />
      </Flex>
    </Flex>
  );
}
