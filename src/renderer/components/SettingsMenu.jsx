import { useEffect, useState } from 'react';
import { Menu, SettingsIcon } from 'xedonium';
import { useTheme } from 'xedonium/theme';

// App settings in a small menu (the native menu bar is hidden until Alt is pressed): the colour theme and updates.
export default function SettingsMenu({ placement = 'bottom-start' }) {
  const { activeTheme, setThemeMode } = useTheme();
  const [version, setVersion] = useState('');
  useEffect(() => {
    window.workbench.appVersion().then(setVersion);
  }, []);
  const mark = mode => (activeTheme === mode ? '✓ ' : ' ');
  const items = [
    {
      key: 'appearance',
      label: 'Appearance',
      children: [
        { key: 'light', label: `${mark('light')}Light`, onClick: () => setThemeMode('light') },
        { key: 'dark', label: `${mark('dark')}Dark`, onClick: () => setThemeMode('dark') }
      ]
    },
    { key: 'updates', label: 'Check for updates…', onClick: () => window.workbench.checkForUpdates() },
    { key: 'version', label: version ? `Version ${version}` : 'Version', disabled: true }
  ];
  return (
    <Menu
      label="Settings"
      variant="flat"
      placement={placement}
      trigger={
        <>
          <SettingsIcon />
          <span className="sr-only">Settings</span>
        </>
      }
      items={items}
    />
  );
}
