## 1. Install

Download an installer from the [download page](/download/). To run from source instead, see the [development page](/development/).

## 2. Add a connection

1. Click **New** in the sidebar.
2. Pick the database type and fill in the fields. Each type is described under [Connections](/connections/).
3. Use **Test** to check the settings, then save.
4. Optionally mark the connection **Production** (asks before any data change) or **Read-only**.

Saved connections are encrypted with your operating system's secure storage.

## 3. Browse

Select the connection and click **Connect**. The sidebar lists databases, schemas, tables, views and collections. Click a table to open it in a tab with paging, sorting and filtering. Columns, keys and indexes load when you open it, and the **Structure** button shows them.

## 4. Run a query

Type in the editor and press **Ctrl/⌘+Enter** to run the selection or the statement at the cursor. **Ctrl/⌘+Shift+Enter** runs every statement. **Stop** cancels a running query on MySQL and PostgreSQL.

Results are capped at 1,000 rows by default. Use **Load more** for a bigger slice.

## 5. Export

Use **Export** above the results for JSON, CSV, Excel or SQL INSERT statements.

## Shortcuts

| Action | Shortcut |
| --- | --- |
| Run | Ctrl/⌘+Enter |
| Run all | Ctrl/⌘+Shift+Enter |
| Autocomplete | Ctrl/⌘+Space |
| Format SQL | Ctrl/⌘+Shift+F |
| Move focus out of the editor | Esc, then Tab |
