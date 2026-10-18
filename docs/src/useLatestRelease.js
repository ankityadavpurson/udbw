import { useEffect, useState } from 'react';
import { REPO } from './pages.js';

const API = `${REPO.replace('https://github.com/', 'https://api.github.com/repos/')}/releases/latest`;
const KEY = 'udbw-latest-release';
const MAX_AGE = 10 * 60 * 1000;   // GitHub allows 60 anonymous requests an hour per visitor, so remember the answer for a while

const read = () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY));
    return saved && Date.now() - saved.at < MAX_AGE ? saved.release : null;
  } catch { return null; }
};
const remember = release => { try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), release })); } catch { /* storage can be blocked */ } };

// The newest published GitHub release, read in the browser so the site never shows a stale version: { status, release }.
// status is 'loading', 'ready' or 'error' (rate limit, offline, no release yet).
export default function useLatestRelease() {
  const [state, setState] = useState(() => { const release = read(); return release ? { status: 'ready', release } : { status: 'loading', release: null }; });

  useEffect(() => {
    if (state.status === 'ready') return undefined;
    const controller = new AbortController();
    fetch(API, { signal: controller.signal, headers: { Accept: 'application/vnd.github+json' } })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`GitHub answered ${res.status}`))))
      .then(data => {
        const release = {
          version: String(data.tag_name || '').replace(/^v/, ''),
          date: data.published_at,
          url: data.html_url,
          assets: (data.assets || []).map(asset => ({ name: asset.name, url: asset.browser_download_url }))
        };
        remember(release);
        setState({ status: 'ready', release });
      })
      .catch(err => { if (err.name !== 'AbortError') setState({ status: 'error', release: null }); });
    return () => controller.abort();
  }, [state.status]);

  return state;
}
