# Universal DB Workbench

A cross-platform Electron desktop starter with connection forms and working connector paths for:

- MySQL (SQL via `mysql2`)
- PostgreSQL (SQL via `pg`)
- Supabase (SQL via its PostgreSQL connection string, plus optional REST table access)
- MongoDB (collection listing and find queries)
- Firebase Firestore (service-account JSON, collection listing and document reads)

## Requirements

- Node.js 20 or newer (Node.js 22 LTS recommended)
- npm or yarn
- Internet/network access to your database endpoints

## Run

```bash
npm install
npm start
```

Build an installer for your current operating system:

```bash
npm run dist
```

Build output is written to `release/`. Build each OS on that OS (or use an appropriate CI runner); macOS signing/notarization may need extra configuration.

## Connection setup

### MySQL
Enter host, port (3306 by default), database, username, and password.

### PostgreSQL
Enter host, port (5432 by default), database, username, and password. Enable SSL if your provider requires it.

### Supabase
For SQL access, use the PostgreSQL connection string from **Supabase Dashboard → Project Settings → Database → Connection string**. Paste it into the connection string field. A direct connection may not work from networks that block IPv6 or if your plan/provider requires the session pooler; try the Supavisor session pooler connection string when needed.

Optional REST access: enter your project URL and an API key. Use a publishable/anon key for user-scoped access. A secret/service-role key bypasses Row Level Security and should only be used if you understand the risk. Keys are saved with the connection, encrypted by the OS keychain (see Security notes), and are kept in the app's main process rather than the UI.

### MongoDB
Paste a MongoDB connection URI (for example, an Atlas `mongodb+srv://...` URI) and optionally specify a database name.

### Firebase Firestore
Create a service account for a Firebase project and download its JSON key file. Select the file in the app. The file path is used locally; the key contents are not copied into this project. Use a least-privilege service account. Firestore access via Admin SDK bypasses Firestore Security Rules, so only use trusted credentials and projects.

## Features

- SQL editor for MySQL, PostgreSQL, and Supabase SQL; command-style editors for MongoDB, Firestore, and Supabase REST.
- Object browser: databases, schemas, tables/views/collections, columns, and primary keys; switch database in a live session.
- Record insert/update/delete for MongoDB, Firestore, and Supabase REST (e.g. `update coll <id> {...}`, `create coll <id> {...}`).
- SSH tunneling (password or private key) for MySQL, PostgreSQL, Supabase (connection string), and MongoDB.
- Saved connections, encrypted at rest with Electron `safeStorage` (OS keychain / DPAPI) in the app's user-data folder.
- Result table with filter, sort, pagination, cell/record viewer, and JSON view.
- Results are capped (1,000 rows by default; a plain `SELECT` gets a `LIMIT` added) with a **Load more** button, so a huge table never freezes the app.
- Tables opened from the sidebar get a server-side page / sort / filter bar (`LIMIT … OFFSET`, `ORDER BY`, a `WHERE` filter).
- **Run** executes the selection or the statement at the cursor (Ctrl/⌘+Enter); **Run all** runs every statement (Ctrl/⌘+Shift+Enter); **Stop** cancels a running query on MySQL, PostgreSQL/Supabase and Supabase REST.
- Safety: a confirmation before `DELETE`/`UPDATE` without `WHERE`, `DROP`, `TRUNCATE`, and before any data change on a connection marked **Production**; connections can be **Read-only** (enforced in the main process and, for MySQL/PostgreSQL, by a read-only database session).
- Editor: line numbers, Tab / Shift+Tab indentation (press Esc, then Tab, to move focus out), autocomplete for tables, columns, aliases and keywords (Ctrl/⌘+Space), SQL formatter (Ctrl/⌘+Shift+F), and Explain / Explain analyze under **Tools**.
- Query history (per connection) and saved queries, under Tools → History and saved queries. Open tabs are restored on the next start. All of it is stored encrypted with the connections.
- Export results as JSON, CSV (UTF-8 with BOM for Excel), Excel (.xlsx) or SQL INSERTs; the file name is based on the table and the time, and you choose where it goes in a native save dialog.
- Results grid: drag a column edge to resize, double-click a cell to copy it, search across the loaded rows.
- The window remembers its size, position and maximized state, and only one instance runs at a time.
- PostgreSQL browser lists tables, views, materialized and foreign views, sequences and functions; columns, keys and indexes load when a table is opened.
- MongoDB: `find <coll> {filter} SORT {…} PROJECT {…} SKIP n LIMIT n`, `count`, `aggregate`, `distinct`, or shell style `db.users.find({ status: 'active' }).sort({ age: -1 }).limit(20)` (also `insertOne/Many`, `updateOne/Many`, `deleteOne/Many`; `ObjectId()`, `ISODate()` and regex literals work).
- Firestore: `read <path> WHERE field >= 18 AND … ORDER BY field DESC LIMIT n OFFSET n`, `count <path> WHERE …`, `collections [docPath]` for subcollections, and document paths like `read users/abc`.

## Security notes

- This is a starter, not a security-audited product.
- Saved connection profiles (including passwords, API keys, and SSH secrets) are stored encrypted via `safeStorage`; if secure storage is unavailable, connections are not saved.
- Secrets stay in the Electron main process: the UI only receives masked values (`••••••••`) and connects by connection id, so passwords are never sent back to the page. Typing over a masked field replaces the stored secret.
- The window is locked down: a Content-Security-Policy, no pop-up windows or navigation away from the app, only the main window may call the database APIs, and developer tools exist only when running from source.
- Record inserts, edits and deletes are sent as structured operations and run as parameterized SQL (or driver calls), not assembled into query text.
- A dropped connection is re-opened automatically on the next request (reads are retried once); a second connection serves the object browser so a long query never blocks it.
- TLS certificates are verified when TLS/SSL is enabled. The "Allow untrusted/self-signed certificate" option disables verification; use it only for hosts you trust.
- SSH host keys use trust-on-first-use: you confirm the fingerprint the first time, it is stored in `known_hosts.json` in the app data folder, and a changed key is refused.
- Never commit service-account JSON, passwords, connection strings, or API keys.
- SQL and document commands execute against the selected live database. Review commands before running them.
- Supabase REST calls are subject to Row Level Security and the permissions of the API key.
- Firestore Admin SDK uses privileged service-account access; Security Rules do not restrict it.

## Not yet included

Inline cell editing, cancelling MongoDB / Firestore queries, true streaming of very large results, schema diagrams, a plugin SDK, and automated tests.
