**This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.**

## What the app connects to

- **Your databases.** The app connects only to the database servers, SSH hosts and Supabase or Firebase projects that you configure.
- **Update checks.** Release builds ask the project's public GitHub releases whether a newer version exists, a few seconds after start and when you choose **Help → Check for updates**. This is a normal HTTPS request to GitHub, which can see your IP address as for any web request. Nothing is downloaded until you agree. Builds made from source have no update settings and make no such request.

## What the app stores on your computer

- Saved connections, encrypted with your operating system's secure storage.
- Query history, saved queries and open tabs, stored encrypted in the app's user-data folder.
- SSH known-host fingerprints in `known_hosts.json`.
- A local log file (`main.log`). Passwords inside connection URLs are masked.

None of this is sent anywhere.

## What the app does not do

- No telemetry, analytics or crash reporting.
- No accounts, and no advertising.
- No sharing of your data with the maintainers or third parties.

## Third-party components

The app uses open-source database drivers and libraries (such as `mysql2`, `pg`, `mongodb`, `firebase-admin`, `ssh2`, `electron-updater`). They connect only to the servers you configure. Release downloads are hosted by GitHub, whose own [privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) applies.

## Changes

Changes to this policy are made in this repository and visible in its history.
