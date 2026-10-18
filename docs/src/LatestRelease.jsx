import { useState } from 'react';
import { ButtonLink, Card, DownloadIcon, HelperText, Select } from 'xedonium';
import { REPO } from './pages.js';
import useLatestRelease from './useLatestRelease.js';

// One direct download per system, picked from the release's files by extension (the update metadata and blockmaps have others).
const SYSTEMS = [
  { key: 'windows', label: 'Windows', match: name => /\.exe$/i.test(name) },
  { key: 'macos', label: 'macOS', match: name => /\.dmg$/i.test(name) },
  { key: 'linux', label: 'Linux', match: name => /\.AppImage$/i.test(name) }
];

// The visitor's system, for the default choice. Phones and tablets are not desktop targets, so they get no default.
export function detectSystem(nav = typeof navigator === 'undefined' ? null : navigator) {
  if (!nav) return null;
  const text = `${nav.userAgentData?.platform || ''} ${nav.platform || ''} ${nav.userAgent || ''}`;
  if (/android|iphone|ipad|ipod|cros/i.test(text)) return null;
  if (/win/i.test(text)) return 'windows';
  if (/mac/i.test(text)) return 'macos';
  if (/linux|x11/i.test(text)) return 'linux';
  return null;
}

// Simple one-colour marks for each system, drawn in the button's own colour.
const OS_LOGOS = {
  windows: <path d="M3 5.5l8-1.1v6.6H3zM12 4.3L21 3v8h-9zM3 12h8v6.6l-8-1.1zM12 12h9v8.9l-9-1.3z" />,
  macos: <path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.15-2.8.85-3.5.85s-1.8-.8-3-.8C6.9 7.4 5.4 8.3 4.6 9.7c-1.6 2.8-.4 6.9 1.2 9.2.8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.75 3-.75s1.8.75 3 .73c1.25 0 2-1.1 2.8-2.2.9-1.3 1.25-2.5 1.27-2.6-.03 0-2.4-.9-2.4-3.6zM14.2 5.8c.65-.8 1.1-1.9.97-3 0 0-1 .04-2 .65-.6.6-1.1 1.7-.95 2.7 1 .08 2-.5 1.98-.35z" />,
  linux: <path fillRule="evenodd" d="M12 2C9.8 2 8.5 3.8 8.5 6.2c0 1.2-.5 2.2-1.3 3.6C6 11.7 5 13.5 5 15.8c0 2.8 1.6 4.2 3 4.8.6.5 1.4.9 2 .9h4c.6 0 1.4-.4 2-.9 1.4-.6 3-2 3-4.8 0-2.3-1-4.1-2.2-6C16.5 8.4 16 7.4 16 6.2 16 3.8 14.2 2 12 2zm0 8c-1.7 0-2.8 2.3-2.8 4.8S10.4 19 12 19s2.8-1.7 2.8-4.2S13.7 10 12 10zM10.6 5.5a.8.8 0 100 1.6.8.8 0 000-1.6zm2.8 0a.8.8 0 100 1.6.8.8 0 000-1.6z" />
};
const OsLogo = ({ system }) => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {OS_LOGOS[system]}
  </svg>
);

const formatDate = iso => new Date(iso).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });

// variant "badge": a small "Latest release 1.2.3" link for the home page. variant "card": the version, its date and a
// download button per system for the download page. Shows nothing (badge) or a plain link (card) if GitHub cannot be reached.
export default function LatestRelease({ variant = 'card' }) {
  const { status, release } = useLatestRelease();
  const [picked, setPicked] = useState('');

  if (variant === 'badge') {
    if (status !== 'ready' || !release.version) return null;
    return (
      <a href={release.url} className="inline-flex items-center gap-2 border border-app-border px-3 py-1 text-xs text-app-muted transition-colors hover:text-app-text">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden="true" />
        Latest release <strong className="font-semibold text-app-text">v{release.version}</strong>
      </a>
    );
  }

  if (status !== 'ready' || !release.version) {
    return status === 'loading'
      ? <HelperText>Checking for the latest release…</HelperText>
      : <ButtonLink href={`${REPO}/releases/latest`} variant="secondary"><DownloadIcon /> View the latest release on GitHub</ButtonLink>;
  }

  const files = SYSTEMS.map(system => ({ ...system, asset: release.assets.find(asset => system.match(asset.name)) })).filter(item => item.asset);
  const chosen = files.find(item => item.key === picked) || files.find(item => item.key === detectSystem()) || files[0];
  return (
    <Card title={`Latest version: ${release.version}`} subtitle={release.date ? `Released ${formatDate(release.date)}` : undefined}
      actions={<a href={release.url} className="text-xs underline">Release notes</a>}>
      {chosen ? (
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href={chosen.asset.url} title={chosen.asset.name}>
            <DownloadIcon /> Download
          </ButtonLink>
          {files.length > 1 && (
            <div className="w-36">
              <Select value={chosen.key} onChange={setPicked} aria-label="Choose your system" options={files.map(item => ({
                  value: item.key,
                  label: (
                    <span className="inline-flex items-center gap-2">
                      <OsLogo system={item.key} /> {item.label}
                    </span>
                  )
                }))} />
            </div>
          )}
          <span className="text-xs text-app-muted">{chosen.asset.name}</span>
        </div>
      ) : (
        <ButtonLink href={release.url} variant="secondary"><DownloadIcon /> Files on GitHub</ButtonLink>
      )}
    </Card>
  );
}
