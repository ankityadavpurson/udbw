import { Button, Flex, HelperText, Loader, Menu, MenuIcon, MoreVerticalIcon, PlayIcon, PowerIcon } from 'xedonium';
import StatusDot from '../StatusDot.jsx';

export default function ConnectionToolbar({ active, engine, status, isConnected, busy, showMenuButton, onOpenMenu, onConnect, onDisconnect, onRun, menuItems }) {
  return (
    <Flex gap={2} align="center" justify="between" wrap className="px-2 py-1.5">
      <Flex gap={2} align="center" className="min-w-0">
        {showMenuButton && <Button variant="secondary" aria-label="Open menu" onClick={onOpenMenu}><MenuIcon /></Button>}
        {active && <StatusDot state={status} />}
        <strong className="truncate text-sm">{active?.name || 'No connection selected'}</strong>
        <HelperText className="truncate">{engine?.help || 'Select or create a connection to begin'}</HelperText>
      </Flex>
      <Flex gap={2} align="center" className="compact-buttons">
        <Button variant={isConnected ? 'secondary' : 'default'} disabled={!active || busy} onClick={isConnected ? onDisconnect : onConnect}>
          {status === 'connecting' ? <><Loader variant="spinner" size="sm" label="Connecting" /> Connecting…</> : <><PowerIcon /> {isConnected ? 'Disconnect' : 'Connect'}</>}
        </Button>
        <Button disabled={!isConnected || busy} tooltip="Ctrl / ⌘ + Enter" onClick={onRun}>{busy ? <><Loader variant="spinner" size="sm" label="Working" /> Working…</> : <><PlayIcon /> Run</>}</Button>
        <Menu label="Connection actions" variant="secondary" placement="bottom-end" trigger={<MoreVerticalIcon />} items={menuItems} />
      </Flex>
    </Flex>
  );
}
