import { Menu, SettingsIcon } from 'xedonium';
import { useTheme } from 'xedonium/theme';

// App settings in a small menu (the native menu bar is hidden until Alt is pressed). Today: the colour theme.
export default function SettingsMenu({ placement = 'bottom-start' }) {
  const { activeTheme, setThemeMode } = useTheme();
  const mark = mode => (activeTheme === mode ? '✓ ' : ' ');
  const items = [
    {
      key: 'appearance',
      label: 'Appearance',
      children: [
        { key: 'light', label: `${mark('light')}Light`, onClick: () => setThemeMode('light') },
        { key: 'dark', label: `${mark('dark')}Dark`, onClick: () => setThemeMode('dark') }
      ]
    }
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
