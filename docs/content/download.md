Get the latest version from the [GitHub releases page](https://github.com/ankityadavpurson/udbw/releases/latest).

| System | File |
| --- | --- |
| Windows | `UDBW-Setup-<version>.exe` (installer with an uninstaller) |
| macOS | `.dmg` (drag to Applications) or `.zip`. The file name ending in `-arm64` is for Apple Silicon Macs (M1 and later), the other one for Intel Macs |
| Linux | `.AppImage` (make it executable, then run it) |

Every release is built automatically from the source code in this repository by GitHub Actions. See the [development page](/development/) for how releases are made.

## Code signing

Installers are currently **not signed**, so Windows SmartScreen shows "Unknown publisher" and macOS Gatekeeper warns on first launch. Free code signing will be provided by [SignPath.io](https://signpath.io), with the certificate issued by [SignPath Foundation](https://signpath.org), once our application is approved. See the [code signing policy](/code-signing/) for the current status.

**Windows:** on the SmartScreen warning choose **More info**, then **Run anyway**.

**macOS:** because the app is not signed or notarized yet, macOS can refuse to open a copy downloaded from the internet and say **"UDBW" is damaged and can't be opened. You should move it to the Trash.** The app is not damaged: macOS marks downloaded files as quarantined, and on Apple Silicon it rejects unsigned apps with this message instead of offering an Open button. Do not move it to the Trash. Instead:

1. Drag **UDBW** from the disk image to your **Applications** folder.
2. Open **Terminal** and remove the quarantine mark:

   ```bash
   xattr -cr /Applications/UDBW.app
   ```

3. Open UDBW from Applications as usual.

If the disk image itself will not open, run `xattr -c ~/Downloads/<the .dmg file>` on it first. Only do this for files you downloaded from the [official releases page](https://github.com/ankityadavpurson/udbw/releases/latest). On older macOS versions, right-clicking the app and choosing **Open** may also work.

## Updates

Release builds check for updates a few seconds after start, and under **Help → Check for updates**. You are asked before anything is downloaded. Builds you make yourself have no update settings.

## Uninstall

Use **Apps → Installed apps** on Windows (the installer registers an uninstaller), drag the app to the Trash on macOS, or delete the AppImage on Linux. Saved connections stay in the app's user-data folder until you delete it.
