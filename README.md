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

Optional REST access: enter your project URL and an API key. Use a publishable/anon key for user-scoped access. A secret/service-role key bypasses Row Level Security and should only be used if you understand the risk. Keys are held in memory by this app session and are not written to disk.

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

## Security notes

- This is a starter, not a security-audited product.
- Saved connection profiles (including passwords, API keys, and SSH secrets) are stored encrypted via `safeStorage`; if secure storage is unavailable, connections are not saved.
- TLS certificates are verified when TLS/SSL is enabled. The "Allow untrusted/self-signed certificate" option disables verification; use it only for hosts you trust.
- SSH host keys use trust-on-first-use: you confirm the fingerprint the first time, it is stored in `known_hosts.json` in the app data folder, and a changed key is refused.
- Never commit service-account JSON, passwords, connection strings, or API keys.
- SQL and document commands execute against the selected live database. Review commands before running them.
- Supabase REST calls are subject to Row Level Security and the permissions of the API key.
- Firestore Admin SDK uses privileged service-account access; Security Rules do not restrict it.

## Not yet included

Inline cell editing, query cancellation, result streaming for large SQL results, SSH host-key verification, schema diagrams, a plugin SDK, and automated tests.
