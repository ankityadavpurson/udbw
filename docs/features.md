---
title: Features
description: Browsing, querying, command syntax and export.
---

## Browsing

- Object browser: databases, schemas, tables, views (including materialized and foreign), sequences, functions and collections. MySQL routines are listed too.
- Columns, keys and indexes load when a table is opened. The **Structure** button shows them.
- Tables opened from the sidebar get a server-side page, sort and filter bar (`LIMIT … OFFSET`, `ORDER BY`, a `WHERE` filter).
- Results are capped (1,000 rows by default, and a plain `SELECT` gets a `LIMIT` added) with a **Load more** button, so a huge table never freezes the app.
- Results grid: sort, search, drag a column edge to resize, double-click a cell to copy it, record viewer and JSON view.
- Record insert, edit and delete for SQL tables with a primary key, MongoDB, Firestore and Supabase REST.

## Querying

- **Run** executes the selection or the statement at the cursor. **Run all** runs every statement. **Stop** cancels a running query on MySQL, PostgreSQL/Supabase and Supabase REST.
- A confirmation appears before `DELETE` or `UPDATE` without `WHERE`, `DROP`, `TRUNCATE`, and before any data change on a Production connection.
- Editor: line numbers, Tab / Shift+Tab indentation, autocomplete for tables, columns, aliases and keywords, a SQL formatter, and Explain / Explain analyze under **Tools**.
- Query history (per connection) and saved queries under **Tools → History and saved queries**. Open tabs are restored on the next start.

## Command syntax

### MongoDB

```
find <coll> {filter} SORT {...} PROJECT {...} SKIP n LIMIT n
count <coll> {filter}
aggregate <coll> [pipeline]
distinct <coll> field {filter}
```

Shell style also works, for example `db.users.find({ status: 'active' }).sort({ age: -1 }).limit(20)`, with `insertOne/Many`, `updateOne/Many` and `deleteOne/Many`. `ObjectId()`, `ISODate()` and regex literals are supported. Documents are shown as relaxed Extended JSON so editing keeps BSON types.

### Firestore

```
read <path> WHERE field >= 18 AND ... ORDER BY field DESC LIMIT n OFFSET n
count <path> WHERE ...
collections [docPath]
read users/abc
```

Timestamps, GeoPoints, references and bytes round-trip through a `{ "__type": ... }` form.

### Supabase REST

```
REST: table LIMIT 100
```

## Export

JSON, CSV (UTF-8 with BOM for Excel), Excel (.xlsx) or SQL INSERTs. The file name is based on the table and the time, and you choose where it goes in a native save dialog.

## The app

- Light and dark themes, remembered window size and position, one instance at a time.
- Logs under **Help → Open log folder** (`main.log`, rotated at 2 MB). Crashes and UI errors are recorded there, and passwords inside connection URLs are masked.
