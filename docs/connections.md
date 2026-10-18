---
title: Connections
description: How to connect to each supported database.
---

## MySQL

Enter host, port (3306 by default), database, username and password.

## PostgreSQL

Enter host, port (5432 by default), database, username and password. Enable SSL if your provider requires it.

## Supabase

For SQL access use the PostgreSQL connection string from **Supabase Dashboard → Project Settings → Database → Connection string** and paste it into the connection string field.

A direct connection may not work from networks that block IPv6, or if your plan requires the session pooler. In that case try the Supavisor session pooler connection string. If the connection fails with "self-signed certificate in certificate chain", tick **Use TLS/SSL** and **Allow untrusted / self-signed certificate**.

Optional REST access: enter your project URL and an API key. Use a publishable or anon key for user-scoped access. A secret or service-role key bypasses Row Level Security, so only use it if you understand the risk. Keys are encrypted with the OS keychain and stay in the app's main process.

## MongoDB

Paste a MongoDB connection URI (for example an Atlas `mongodb+srv://...` URI) and optionally a database name.

## Firebase Firestore

Create a service account for your Firebase project and download its JSON key. Select the file in the app. The file path is used locally. Use a least-privilege service account: access through the Admin SDK bypasses Firestore Security Rules.

## SSH tunnels

MySQL, PostgreSQL, Supabase (connection string) and MongoDB connections can go through an SSH tunnel with a password or a private key. Host keys use trust-on-first-use: you confirm the fingerprint the first time, it is stored in `known_hosts.json` in the app data folder, and a changed key is refused.

## Production and Read-only

- **Production** asks before any data change.
- **Read-only** is enforced in the main process and, for MySQL and PostgreSQL, by a read-only database session.

## Organising connections

Connections can be put in folders, marked as favourites and duplicated. A dropped connection is re-opened on the next request, and reads are retried once.
