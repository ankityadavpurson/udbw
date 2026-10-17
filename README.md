# Universal DB Workbench

A cross-platform desktop workbench (Electron + React) for working with:

- MySQL (`mysql2`)
- PostgreSQL (`pg`)
- Supabase (its PostgreSQL connection string, plus optional REST table access)
- MongoDB
- Firebase Firestore (service-account JSON)

## Requirements

- Node.js 20 or newer (Node.js 22 LTS recommended)
- [Yarn 1](https://classic.yarnpkg.com/) (the repository uses `yarn.lock`)
- Network access to your database endpoints

## Getting started

```bash
yarn install
yarn start      # builds the UI, then opens the app
```

For day-to-day work use the dev server, which hot-reloads the UI as you edit:

```bash
yarn dev
```

## Development

| Command | What it does |
| --- | --- |
| `yarn dev` | Vite dev server with hot reload, and Electron pointed at it |
| `yarn start` | Production-style run: `vite build`, then Electron on `dist/` |
| `yarn test` | Unit tests (Vitest) for the connectors' text handling and the UI helpers |
| `yarn test:e2e` | Boots the real app against a fake database and drives the UI (needs a display and `yarn build:ui` first) |
| `yarn lint` / `yarn lint:fix` | ESLint |
| `yarn format` / `yarn format:check` | Prettier (not enforced yet: the code predates the config, so running it rewrites most files) |
| `yarn check` | Lint, tests and a UI build, as CI does |
| `yarn pack` | Packages an unpacked app into `release/` (quick check of the installer config) |
| `yarn dist` | Builds installers for the current operating system into `release/` |

Layout:

```
src/main.js            Electron entry point
src/main/              Main process: windows, IPC, saved-connection store, sessions, SSH tunnels, logging, updates
src/main/connectors/   One file per database (mysql, postgres, mongodb, firestore, supabase-rest) plus shared SQL helpers
src/preload.js         The only API the page can call (window.workbench)
src/renderer/          The React UI (hooks/ for state, lib/ for pure helpers, components/)
test/                  Vitest unit tests (test/main, test/renderer) and the end-to-end smoke test (test/e2e)
```

The page never sees saved secrets and never builds SQL for edits: it sends structured operations and the main process
runs them as parameterized statements or driver calls.

## Building and releasing

`yarn dist` builds installers for the OS you run it on (Windows NSIS, macOS dmg + zip, Linux AppImage) into `release/`.
Build each OS on that OS, or let CI do it:

- `.github/workflows/ci.yml` runs lint, unit tests and a UI build on every push and pull request, the UI smoke test on Windows,
  and a packaging check on all three systems.
- `.github/workflows/release.yml` runs when you push a tag such as `v0.2.0`. It builds installers on all three systems and
  attaches them to a draft GitHub release.

**Code signing** is optional and read from the usual environment variables / repository secrets: `WIN_CSC_LINK` and
`WIN_CSC_KEY_PASSWORD` (Windows certificate), `MAC_CSC_LINK` and `MAC_CSC_KEY_PASSWORD` (macOS Developer ID certificate),
and `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (notarization). Without them the installers are unsigned, which is fine
for testing but makes Windows SmartScreen and macOS Gatekeeper warn.

**Updates** use `electron-updater`. A release built by the workflow contains the update settings (they point at the GitHub
releases of the repository the workflow runs in), and the app then checks for updates a few seconds after start and under
Help → Check for updates. Builds made on your machine have no update settings and say so. For a private repository the app also
needs a read token; see the electron-updater documentation. Publish a release (not a draft) for users to receive it.

## Connection setup

### MySQL
Enter host, port (3306 by default), database, username, and password.

### PostgreSQL
Enter host, port (5432 by default), database, username, and password. Enable SSL if your provider requires it.

### Supabase
For SQL access, use the PostgreSQL connection string from **Supabase Dashboard → Project Settings → Database → Connection string**. Paste it into the connection string field. A direct connection may not work from networks that block IPv6 or if your plan/provider requires the session pooler; try the Supavisor session pooler connection string when needed. If the connection fails with "self-signed certificate in certificate chain", tick **Use TLS/SSL** and **Allow untrusted / self-signed certificate**.

Optional REST access: enter your project URL and an API key. Use a publishable/anon key for user-scoped access. A secret/service-role key bypasses Row Level Security and should only be used if you understand the risk. Keys are saved with the connection, encrypted by the OS keychain (see Security notes), and are kept in the app's main process rather than the UI.

### MongoDB
Paste a MongoDB connection URI (for example, an Atlas `mongodb+srv://...` URI) and optionally specify a database name.

### Firebase Firestore
Create a service account for a Firebase project and download its JSON key file. Select the file in the app. The file path is used locally; the key contents are not copied into this project. Use a least-privilege service account. Firestore access via Admin SDK bypasses Firestore Security Rules, so only use trusted credentials and projects.

## Features

**Connections**
- Saved connections, encrypted at rest with Electron `safeStorage` (OS keychain / DPAPI) in the app's user-data folder; folders, favourites, duplicate, test before saving.
- Mark a connection **Production** (asks before any data change) or **Read-only** (enforced in the main process and, for MySQL/PostgreSQL, by a read-only database session).
- SSH tunneling (password or private key) for MySQL, PostgreSQL, Supabase (connection string), and MongoDB, with trust-on-first-use host keys.
- A dropped connection is re-opened on the next request; reads are retried once.

**Browsing**
- Object browser: databases, schemas, tables, views (including materialized and foreign), sequences, functions and collections; columns, keys and indexes load when a table is opened.
- Tables opened from the sidebar get a server-side page / sort / filter bar (`LIMIT … OFFSET`, `ORDER BY`, a `WHERE` filter).
- Results are capped (1,000 rows by default; a plain `SELECT` gets a `LIMIT` added) with a **Load more** button, so a huge table never freezes the app.
- Results grid: sort, search, drag a column edge to resize, double-click a cell to copy it, record viewer and JSON view.
- Record insert / edit / delete for SQL tables with a primary key, MongoDB, Firestore and Supabase REST.

**Querying**
- **Run** executes the selection or the statement at the cursor (Ctrl/⌘+Enter); **Run all** runs every statement (Ctrl/⌘+Shift+Enter); **Stop** cancels a running query on MySQL, PostgreSQL/Supabase and Supabase REST.
- A confirmation before `DELETE`/`UPDATE` without `WHERE`, `DROP`, `TRUNCATE`, and before any data change on a Production connection.
- Editor: line numbers, Tab / Shift+Tab indentation (press Esc, then Tab, to move focus out), autocomplete for tables, columns, aliases and keywords (Ctrl/⌘+Space), SQL formatter (Ctrl/⌘+Shift+F), Explain / Explain analyze under **Tools**.
- Query history (per connection) and saved queries (Tools → History and saved queries). Open tabs are restored on the next start.
- MongoDB: `find <coll> {filter} SORT {…} PROJECT {…} SKIP n LIMIT n`, `count`, `aggregate`, `distinct`, or shell style `db.users.find({ status: 'active' }).sort({ age: -1 }).limit(20)` (also `insertOne/Many`, `updateOne/Many`, `deleteOne/Many`; `ObjectId()`, `ISODate()` and regex literals work).
- Firestore: `read <path> WHERE field >= 18 AND … ORDER BY field DESC LIMIT n OFFSET n`, `count <path> WHERE …`, `collections [docPath]` for subcollections, document paths like `read users/abc`.
- Supabase REST: `REST: table LIMIT 100`.

**Export**
- JSON, CSV (UTF-8 with BOM for Excel), Excel (.xlsx) or SQL INSERTs; the file name is based on the table and the time, and you choose where it goes in a native save dialog.

**App**
- Light and dark themes, remembered window size and position, one instance at a time.
- Logs: Help → Open log folder (`main.log`, rotated at 2 MB). Crashes and UI errors are recorded there; passwords inside connection URLs are masked.

## Security notes

- This is a hobby-grade tool, not a security-audited product.
- Saved connection profiles (including passwords, API keys, and SSH secrets) are stored encrypted via `safeStorage`; if secure storage is unavailable, connections are not saved to disk.
- Secrets stay in the Electron main process: the UI only receives masked values (`••••••••`) and connects by connection id, so passwords are never sent back to the page. Typing over a masked field replaces the stored secret.
- The window is locked down: a Content-Security-Policy, no pop-up windows or navigation away from the app, only the main window may call the database APIs, and developer tools exist only when running from source.
- Record inserts, edits and deletes are sent as structured operations and run as parameterized SQL (or driver calls), not assembled into query text.
- TLS certificates are verified when TLS/SSL is enabled. The "Allow untrusted/self-signed certificate" option disables verification; use it only for hosts you trust.
- SSH host keys use trust-on-first-use: you confirm the fingerprint the first time, it is stored in `known_hosts.json` in the app data folder, and a changed key is refused.
- Never commit service-account JSON, passwords, connection strings, or API keys.
- SQL and document commands execute against the selected live database. Review commands before running them.
- Supabase REST calls are subject to Row Level Security and the permissions of the API key.
- Firestore Admin SDK uses privileged service-account access; Security Rules do not restrict it.

## Roadmap

Not built yet: inline cell editing, cancelling MongoDB / Firestore queries, streaming of very large results, a table
structure / index viewer, schema diagrams, importing data, enforcing Prettier across the code base, and a plugin SDK.

## License

Released under the [MIT License](LICENSE).
