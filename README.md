# Universal DB Workbench

A cross-platform Electron desktop starter with connection forms and working connector paths for:

- MySQL (SQL via `mysql2`)
- PostgreSQL (SQL via `pg`)
- Supabase (SQL via its PostgreSQL connection string, plus optional REST table access)
- MongoDB (collection listing and find queries)
- Firebase Firestore (service-account JSON, collection listing and document reads)

## Requirements

- Node.js 20 or newer (Node.js 22 LTS recommended)
- npm
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

## Important security notes

- This is a starter, not a security-audited product.
- Database credentials are kept in application memory during the current run and are not persisted.
- Never commit service-account JSON, passwords, connection strings, or API keys.
- SQL and document commands execute against the selected live database. Review commands before running them.
- Avoid exposing the desktop app to untrusted local users.
- TLS behavior depends on each database provider and connection settings. Add certificate verification/custom CA support before production use.
- Supabase REST calls are subject to Row Level Security and the permissions of the API key. Supabase SQL access uses PostgreSQL credentials and privileges.
- Firestore Admin SDK uses privileged service-account access; Security Rules do not restrict Admin SDK access.

## Current scope

- SQL editor for MySQL, PostgreSQL, and Supabase SQL.
- Supabase REST table preview when the table name is known.
- MongoDB list collections and JSON filter-based find.
- Firestore list top-level collections and read documents.
- Connection test, status, basic JSON/table result rendering.

This is an extensible baseline. It is not yet a full commercial workbench: editing cells, safe SQL parameter binding UI, query cancellation, advanced SSH tunnels, schema diagrams, large-result streaming, and a plugin SDK are not included.
