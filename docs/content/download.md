Get the latest version from the [GitHub releases page](https://github.com/ankityadavpurson/udbw/releases/latest).

| System | File |
| --- | --- |
| Windows | `Universal-DB-Workbench-Setup-<version>.exe` (installer with an uninstaller) |
| macOS | `.dmg` (drag to Applications) or `.zip` |
| Linux | `.AppImage` (make it executable, then run it) |

Every release is built automatically from the source code in this repository by GitHub Actions. See the [development page](/development/) for how releases are made.

## Code signing

Installers are currently **not signed**, so Windows SmartScreen shows "Unknown publisher" and macOS Gatekeeper warns on first launch. Free code signing will be provided by [SignPath.io](https://signpath.io), with the certificate issued by [SignPath Foundation](https://signpath.org), once our application is approved. See the [code signing policy](/code-signing/) for the current status.

**Windows:** on the SmartScreen warning choose **More info**, then **Run anyway**.

**macOS:** right-click the app, choose **Open**, then confirm.

## Updates

Release builds check for updates a few seconds after start, and under **Help → Check for updates**. You are asked before anything is downloaded. Builds you make yourself have no update settings.

## Uninstall

Use **Apps → Installed apps** on Windows (the installer registers an uninstaller), drag the app to the Trash on macOS, or delete the AppImage on Linux. Saved connections stay in the app's user-data folder until you delete it.
