import React from 'react';
import { ActionMenu, Button, Flex, HelperText, MenuIcon, MoreVerticalIcon, PlayIcon, PowerIcon } from 'xedonium';
import StatusDot from '../StatusDot.jsx';

export default function ConnectionToolbar({ active, engine, status, isConnected, busy, showMenuButton, onOpenMenu, onConnect, onDisconnect, onRun, menuItems }) {
  return (
    <Flex gap={2} align="center" justify="between" wrap>
      <Flex gap={2} align="center" className="min-w-0">
        {showMenuButton && <Button variant="secondary" aria-label="Open menu" onClick={onOpenMenu}><MenuIcon /></Button>}
        {active && <StatusDot state={status} />}
        <strong className="truncate text-sm">{active?.name || 'No connection selected'}</strong>
        <HelperText className="truncate">{engine?.help || 'Select or create a connection to begin'}</HelperText>
      </Flex>
      <Flex gap={2} align="center">
        <Button disabled={!active || isConnected || busy} onClick={onConnect}><PowerIcon /> Connect</Button>
        <Button variant="secondary" disabled={!isConnected || busy} onClick={onDisconnect}>Disconnect</Button>
        <Button disabled={!isConnected || busy} tooltip="Ctrl / ⌘ + Enter" onClick={onRun}><PlayIcon /> {busy ? 'Working…' : 'Run'}</Button>
        <ActionMenu label="Connection actions" variant="secondary" placement="bottom-end" trigger={<MoreVerticalIcon />} items={menuItems} />
      </Flex>
    </Flex>
  );
}
