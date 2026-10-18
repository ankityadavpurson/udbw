import { useEffect } from 'react';
import { useTheme } from 'xedonium/theme';

// Keeps the native Settings > Theme menu and the in-app theme in sync.
export default function ThemeBridge() {
  const { activeTheme, setThemeMode } = useTheme();
  useEffect(() => window.workbench.onSetTheme(mode => setThemeMode(mode)), [setThemeMode]);
  useEffect(() => {
    window.workbench.reportTheme(activeTheme);
  }, [activeTheme]);
  return null;
}
