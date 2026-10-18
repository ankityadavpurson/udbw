> This is a hobby-grade tool, not a security-audited product.

## How secrets are handled

- Saved connection profiles, including passwords, API keys and SSH secrets, are encrypted with Electron `safeStorage` (the OS keychain, or DPAPI on Windows). If secure storage is unavailable, connections are not saved to disk.
- Secrets stay in the Electron main process. The UI only receives masked values and connects by connection id, so passwords are never sent back to the page. Typing over a masked field replaces the stored secret.
- Never commit service-account JSON, passwords, connection strings or API keys.

## How the app is locked down

- A Content-Security-Policy, no pop-up windows, no navigation away from the app, and only the main window may call the database APIs.
- Developer tools exist only when running from source.
- Record inserts, edits and deletes are sent as structured operations and run as parameterized SQL or driver calls, not assembled into query text.

## Network security

- TLS certificates are verified when TLS/SSL is enabled. The "Allow untrusted / self-signed certificate" option turns verification off, so use it only for hosts you trust.
- SSH host keys use trust-on-first-use, and a changed key is refused.

## Your responsibility

- SQL and document commands run against the selected live database. Review them before running.
- Supabase REST calls are subject to Row Level Security and the permissions of the API key.
- The Firestore Admin SDK uses privileged service-account access, so Security Rules do not restrict it.

## Reporting a problem

Open an issue on [GitHub](https://github.com/ankityadavpurson/udbw/issues). For a vulnerability, avoid posting exploit details publicly: use GitHub's private vulnerability reporting on the repository's Security tab if it is enabled.
