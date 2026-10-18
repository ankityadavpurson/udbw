# Universal DB Workbench: Remaining Work

Only items that are not finished are listed here.

"Checked" means unit tests (`yarn test`) and/or the UI smoke test (`yarn test:e2e`, which uses a fake database). Nothing has been run against real MySQL, PostgreSQL, MongoDB, Firestore or SSH servers, so the new Firestore and Supabase REST browse controls, the MongoDB/Firestore Stop button and the MySQL routine parameters are covered by unit tests only.

## Partly done

36. Crash and error log, crash screen, update checking with `electron-updater`, macOS entitlements, signing through environment variables, and a tag-triggered release workflow exist. The workflows, auto-update and signing/notarization have never been run; they need your certificates and a published release.

## Still open

- Run the app against real databases and an SSH server, and try the release workflow with a test tag.
- The results grid pages rows client-side (at most 100 rendered at once) rather than virtualizing them, because it uses the `xedonium` DataGrid.
- Supabase REST lists tables only when the API key may read the API description; otherwise type `REST: table`.
