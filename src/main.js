const { app, BrowserWindow } = require('electron');
const path = require('path');
const windowState = require('./main/window');
const { registerIpc } = require('./main/ipc');
const sessions = require('./main/sessions');
const { installCrashHandlers, logger } = require('./main/logger');
const { scheduleUpdateChecks } = require('./main/updater');

// From source the name would be the package name ("udbw"), which then shows in the app menu ("About udbw", "Quit udbw").
app.setName('UDBW');

// A run from source (`yarn dev` / `yarn start`) keeps its data in its own folder. Otherwise it would share the saved
// connections and the single-instance lock with an installed copy, which would just be brought forward instead of starting.
// (Windows folder names are not case sensitive, so "udbw" and the installed "UDBW" are the same folder.)
if (!app.isPackaged) {
  const standard = path.resolve(app.getPath('appData'), app.getName());
  if (path.resolve(app.getPath('userData')).toLowerCase() === standard.toLowerCase()) app.setPath('userData', `${standard}-dev`);
}

installCrashHandlers();

registerIpc();

// One window per user: starting the app again just brings the existing one forward.
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on('second-instance', () => {
  const win = windowState.getMainWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.whenReady().then(() => {
  if (!primary) return;
  // A run from source shows Electron's own icon in the dock; the packaged app gets its icon from the bundle.
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(path.join(__dirname, '..', 'build', 'icon-mac.png'));
  app.setAboutPanelOptions({ applicationName: 'UDBW', applicationVersion: app.getVersion(), version: '', copyright: 'Universal DB Workbench' });
  windowState.hardenWebContents();
  windowState.buildAppMenu();
  windowState.createSplash();
  windowState.createWindow();
  logger.info(`Started UDBW ${app.getVersion()} on ${process.platform} (Electron ${process.versions.electron})`);
  scheduleUpdateChecks(); // every 24 hours; only does something in a release build
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) windowState.createWindow();
  });
});

// Quit is held back (once) until sessions and SSH tunnels are closed, with a cap so a hung server cannot block exit.
let quitting = false;
app.on('before-quit', event => {
  if (quitting) return;
  if (windowState.hasUnsavedChanges()) {
    event.preventDefault();
    windowState.confirmDiscard().then(ok => ok && app.quit());
    return;
  }
  quitting = true;
  event.preventDefault();
  Promise.race([sessions.closeAll(), new Promise(resolve => setTimeout(resolve, 3000))]).finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
