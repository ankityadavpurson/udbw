import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, ChevronLeftIcon, ChevronRightIcon, Divider, Flex, HelperText, PlusIcon, RefreshIcon, Sidebar } from 'xedonium';
import { NAV_STORAGE_KEY, engines } from '../../constants.js';
import SettingsMenu from '../SettingsMenu.jsx';
import StatusDot from '../StatusDot.jsx';

const STATUS_TEXT = { connected: 'Connected', connecting: 'Connecting…', failed: 'Connection failed', disconnected: 'Not connected' };

// What a connection row tells on hover: where it points, how it is set up and what a click does.
function connectionTip(profile, status) {
  const target = [profile.host && `${profile.host}${profile.port ? `:${profile.port}` : ''}`, profile.database].filter(Boolean).join(' / ');
  const flags = [profile.environment, profile.readOnly && 'read-only'].filter(Boolean).join(' · ');
  return {
    title: profile.name,
    lines: [`${engines[profile.type].label}${target ? ` · ${target}` : ''}`, `${STATUS_TEXT[status] || STATUS_TEXT.disconnected}${flags ? ` · ${flags}` : ''}`],
    hint: status === 'connected' ? 'Click to select' : 'Click to select · double-click to connect'
  };
}

const readCollapsed = () => {
  try {
    return localStorage.getItem(NAV_STORAGE_KEY) === '1' ? true : null;
  } catch {
    return null;
  }
};

// Brand, new-connection button, connection list and (as children) the object browser.
// `autoCollapsed` is the responsive default; the user's choice (saved locally) overrides it.
export default function AppSidebar({ close, inDrawer, autoCollapsed, profiles, activeId, connectionStatus, onChoose, onConnect, onNew, onRefresh, children }) {
  const [navCollapsed, setNavCollapsed] = useState(readCollapsed);
  const [tip, setTip] = useState(null); // { tip, left, top } of the connection under the pointer
  const tipTimer = useRef(null);
  const hideTip = () => {
    clearTimeout(tipTimer.current);
    setTip(null);
  };
  useEffect(() => () => clearTimeout(tipTimer.current), []);
  const collapsed = !inDrawer && (navCollapsed ?? autoCollapsed);

  function toggleNav(currentlyCollapsed) {
    const next = !currentlyCollapsed;
    setNavCollapsed(next);
    try {
      localStorage.setItem(NAV_STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }

  const ordered = [...profiles].sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || a.name.localeCompare(b.name));
  const groupOf = p => p.group?.trim() || 'Connections';
  const groups = [...new Set(ordered.map(groupOf))];
  const showSections = groups.length > 1 || groups[0] !== 'Connections';
  const items = groups.flatMap(group => [
    ...(showSections && !collapsed ? [{ key: `section:${group}`, label: group, section: true }] : []),
    ...ordered
      .filter(p => groupOf(p) === group)
      .map(p => ({
        key: p.id,
        label: `${p.favorite ? '★ ' : ''}${p.name}`,
        icon: (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold">
            <StatusDot state={connectionStatus(p.id)} />
            {engines[p.type].icon}
          </span>
        ),
        onClick: () => {
          onChoose(p);
          close();
        }
      }))
  ]);

  return (
    <div className={`flex h-full flex-col border-r border-app-border bg-app-card ${inDrawer ? 'w-full' : collapsed ? 'w-12' : 'w-64'}`}>
      {collapsed && (
        <Flex direction="column" align="center" gap={1} className="compact-buttons compact-icons shrink-0 border-b border-app-border px-1 py-1.5">
          <Button variant="flat" tooltip="Expand sidebar" tooltipPlacement="right" aria-label="Expand sidebar" onClick={() => toggleNav(true)}>
            <ChevronRightIcon />
          </Button>
          <Button
            variant="flat"
            tooltip="New connection"
            tooltipPlacement="right"
            aria-label="New connection"
            onClick={() => {
              onNew();
              close();
            }}
          >
            <PlusIcon />
          </Button>
          <SettingsMenu placement="right-start" />
        </Flex>
      )}
      {/* Double-clicking a connection connects it; the first click of the double click has already selected it. */}
      <div
        className="contents"
        onDoubleClick={event => event.target.closest('li button') && onConnect?.()}
        onMouseOver={event => {
          const button = event.target.closest('li button');
          hideTip();
          if (!button) return;
          const rows = [...event.currentTarget.querySelectorAll('li button')];
          const profile = profiles.find(p => p.id === items.filter(item => !item.section)[rows.indexOf(button)]?.key);
          if (!profile) return;
          const box = button.getBoundingClientRect();
          tipTimer.current = setTimeout(() => setTip({ ...connectionTip(profile, connectionStatus(profile.id)), left: box.right + 8, top: box.top + box.height / 2 }), 450);
        }}
        onMouseLeave={hideTip}
        onMouseDown={hideTip}
        onKeyDown={hideTip}
      >
        <Sidebar
          label="Connections"
          bordered={false}
          density="dense"
          collapsed={collapsed}
          className="!h-auto !w-full max-h-[42%] min-h-0 flex-none [&_li[role=presentation]]:!pt-1"
          activeKey={activeId || undefined}
          items={items}
          headerClassName={collapsed ? 'hidden' : 'px-3 py-1'}
          listClassName="py-0"
          header={
            <Flex justify="between" align="center">
              <span className="text-xs font-semibold uppercase tracking-widest text-app-muted">Connections</span>
              <Flex gap={1} className="compact-buttons compact-icons shrink-0">
                <Button
                  variant="flat"
                  tooltip="New connection"
                  aria-label="New connection"
                  onClick={() => {
                    onNew();
                    close();
                  }}
                >
                  <PlusIcon />
                </Button>
                <Button variant="flat" tooltip="Refresh connections" aria-label="Refresh connections" onClick={onRefresh}>
                  <RefreshIcon />
                </Button>
                <SettingsMenu />
                {!inDrawer && (
                  <Button variant="flat" tooltip="Collapse sidebar" aria-label="Collapse sidebar" onClick={() => toggleNav(false)}>
                    <ChevronLeftIcon />
                  </Button>
                )}
              </Flex>
            </Flex>
          }
        />
      </div>
      {tip &&
        createPortal(
          <div
            aria-hidden="true"
            style={{ left: tip.left, top: tip.top, transform: 'translateY(-50%)' }}
            className="pointer-events-none fixed z-[100] w-max max-w-[18rem] space-y-0.5 border border-app-border bg-app-card px-2.5 py-1.5 text-xs normal-case tracking-normal text-app-text shadow-xl"
          >
            <div className="font-semibold">{tip.title}</div>
            {tip.lines.map(line => (
              <div key={line}>{line}</div>
            ))}
            <div className="pt-0.5 text-app-muted">{tip.hint}</div>
          </div>,
          document.body
        )}
      {!collapsed && (
        <>
          {!items.length && <HelperText className="px-4 pb-3">Add a connection to get started.</HelperText>}
          <Divider />
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          <Divider />
          <HelperText className="px-4 py-2">Credentials are encrypted on this device</HelperText>
        </>
      )}
    </div>
  );
}
