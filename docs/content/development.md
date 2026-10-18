## Requirements

- Node.js 20 or newer (22 LTS recommended)
- [Yarn 1](https://classic.yarnpkg.com/) (the repository uses `yarn.lock`)
- Network access to your database endpoints

## Run from source

```bash
yarn install
yarn start      # builds the UI, then opens the app
yarn dev        # Vite dev server with hot reload
```

## Commands

| Command | What it does |
| --- | --- |
| `yarn dev` | Vite dev server with hot reload, and Electron pointed at it |
| `yarn start` | Production-style run: `vite build`, then Electron on `dist/` |
| `yarn test` | Unit tests (Vitest) for the connectors' text handling and the UI helpers |
| `yarn test:e2e` | Boots the real app against a fake database and drives the UI (needs a display and `yarn build:ui` first) |
| `yarn lint` / `yarn lint:fix` | ESLint |
| `yarn format` / `yarn format:check` | Prettier (not enforced yet) |
| `yarn check` | Lint, tests and a UI build, as CI does |
| `yarn pack` | Packages an unpacked app into `release/` (quick check of the installer config) |
| `yarn dist` | Builds installers for the current operating system into `release/` |

## Code layout

```
src/main.js            Electron entry point
src/main/              Main process: windows, IPC, saved-connection store, sessions, SSH tunnels, logging, updates
src/main/connectors/   One file per database plus shared SQL helpers
src/preload.js         The only API the page can call (window.workbench)
src/renderer/          The React UI (hooks/ for state, lib/ for pure helpers, components/)
test/                  Unit tests (test/main, test/renderer) and the end-to-end smoke test (test/e2e)
docs/                  This website (Vite + React + xedonium, published with GitHub Pages)
```

The page never sees saved secrets and never builds SQL for edits: it sends structured operations and the main process runs them as parameterized statements or driver calls.

## CI/CD

One workflow, `.github/workflows/ci.yml`, does everything.

1. **check:** lint, unit tests and a UI build.
2. **e2e:** the UI smoke test on Windows.
3. **version:** on a push to `main`, works out the next version from the commit messages since the last `v*` tag and pushes the tag.
4. **build:** installers for Ubuntu, Windows and macOS, uploaded to a draft GitHub release.
5. **publish:** turns the draft into a published release once all three builds succeeded.

Pull requests run steps 1 and 2 plus a packaging check, and never release.

### Commit messages decide the version

| Commit message | Version bump |
| --- | --- |
| `feat!:`, `fix!:` or a `BREAKING CHANGE:` footer | major |
| `feat:` | minor |
| `fix:`, `perf:`, `revert:` | patch |
| `docs:`, `chore:`, `refactor:`, `test:`, `ci:`, `style:`, `build:` | no release |

The first release uses the version in `package.json`. That file is not edited by the pipeline: the version is injected at build time.

### Signing and updates

Windows and macOS signing read the repository secrets `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`, `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`. Without them the installers are unsigned. See the [code signing policy](/code-signing/).

Updates use `electron-updater`. A release built by the workflow contains update settings that point at this repository's releases.

## This website

The site lives in the `docs/` folder. It is a small Vite + React app built with [xedonium](https://ankityadavpurson.github.io/xedonium-ui/), the same UI library as the desktop app. Each page is a Markdown file in `docs/content/`, listed in `docs/src/pages.js`.

```bash
cd docs
yarn install
yarn dev        # http://localhost:5173/udbw/
yarn build      # static site in docs/dist, one HTML file per page
```

Pushing changes under `docs/` to `main` publishes the site with the `Docs` workflow.

## Roadmap

Not built yet: browse controls for Firestore and Supabase REST, cancelling MongoDB and Firestore queries, inline cell editing, streaming of very large results, schema diagrams, importing data, enforcing Prettier across the code base, and a plugin SDK.
