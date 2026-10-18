import { ButtonLink, Card, DownloadIcon, HelperText } from 'xedonium';
import { REPO } from './pages.js';
import useLatestRelease from './useLatestRelease.js';

// One direct download per system, picked from the release's files by extension (the update metadata and blockmaps have others).
const SYSTEMS = [
  { label: 'Windows', match: name => /\.exe$/i.test(name) },
  { label: 'macOS', match: name => /\.dmg$/i.test(name) },
  { label: 'Linux', match: name => /\.AppImage$/i.test(name) }
];

const formatDate = iso => new Date(iso).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });

// variant "badge": a small "Latest release 1.2.3" link for the home page. variant "card": the version, its date and a
// download button per system for the download page. Shows nothing (badge) or a plain link (card) if GitHub cannot be reached.
export default function LatestRelease({ variant = 'card' }) {
  const { status, release } = useLatestRelease();

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
  return (
    <Card title={`Latest version: ${release.version}`} subtitle={release.date ? `Released ${formatDate(release.date)}` : undefined}
      actions={<a href={release.url} className="text-xs underline">Release notes</a>}>
      <div className="flex flex-wrap gap-3">
        {files.map(({ label, asset }) => (
          <ButtonLink key={label} href={asset.url} variant="secondary" title={asset.name}><DownloadIcon /> {label}</ButtonLink>
        ))}
        {!files.length && <ButtonLink href={release.url} variant="secondary"><DownloadIcon /> Files on GitHub</ButtonLink>}
      </div>
    </Card>
  );
}
