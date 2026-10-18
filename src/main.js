const { app, BrowserWindow } = require('electron');
const windowState = require('./main/window');
const { registerIpc } = require('./main/ipc');
const sessions = require('./main/sessions');
const { installCrashHandlers, logger } = require('./main/logger');
const { checkForUpdates } = require('./main/updater');

installCrashHandlers();

registerIpc();

// One window per user: starting the app again just brings the existing one forward.
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on('second-instance', () => {
  const win = windowState.getMainWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
});

app.whenReady().then(() => {
  if (!primary) return;
  windowState.hardenWebContents();
  windowState.buildAppMenu();
  windowState.createSplash();
  windowState.createWindow();
  logger.info(`Started UDBW ${app.getVersion()} on ${process.platform} (Electron ${process.versions.electron})`);
  setTimeout(() => checkForUpdates({ silent: true }), 15000);   // only does something in a release build
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) windowState.createWindow();
  });
});

// Quit is held back (once) until sessions and SSH tunnels are closed, with a cap so a hung server cannot block exit.
let quitting = false;
app.on('before-quit', event => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  Promise.race([sessions.closeAll(), new Promise(resolve => setTimeout(resolve, 3000))]).finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
