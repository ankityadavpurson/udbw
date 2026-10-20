const { app, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');
const windowState = require('./window');

// Updates come from the release server the build was configured with (electron-builder writes app-update.yml next to
// the app when `build.publish` is set, which the release workflow does). Development and unconfigured builds skip it.
const configured = () => app.isPackaged && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'));

const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 15000;

const parent = () => windowState.getMainWindow() || undefined;
const pageOf = () => {
  const page = parent()?.webContents;
  return page && !page.isDestroyed() && !page.isCrashed() && !page.isLoading() ? page : null;
};
let wired = false;
let manual = false; // the current check was asked for by the user, so it answers with dialogs
let available = null; // the release found by the last check, waiting to be downloaded

// ---- the toast ------------------------------------------------------------------------------------------------
// The automatic check never opens a dialog: it shows a dismissible toast in the page. { kind: 'available' | 'downloading' |
// 'ready' | 'error', version?, percent?, message? }, or null to clear it. The last one is kept so a reloaded page can show it again.
let toastState = null;
function sendToast(payload) {
  toastState = payload;
  pageOf()?.send('update:toast', payload);
}

// ---- notices for checks the user asked for ----------------------------------------------------------------------
// Shown in the app's own (themed) dialog; resolves 'primary' or 'secondary'. { title, message, detail?, primary, secondary?, tone? }.
// When the page cannot show it, the native message box is the fallback.
function showNotice(notice) {
  const page = pageOf();
  if (!page) return nativeNotice(notice);
  return new Promise(resolve => {
    const onAnswer = (event, answer) => {
      if (event.sender !== page) return;
      ipcMain.removeListener('update:answer', onAnswer);
      resolve(answer === 'primary' ? 'primary' : 'secondary');
    };
    ipcMain.on('update:answer', onAnswer);
    page.once('destroyed', () => resolve('secondary'));
    page.send('update:show', notice);
  });
}

async function nativeNotice({ title, message, detail, primary, secondary, tone }) {
  const buttons = secondary ? [primary, secondary] : [primary];
  const { response } = await dialog.showMessageBox(parent(), {
    type: tone === 'danger' ? 'error' : 'info',
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
    title,
    message,
    detail
  });
  return response === 0 ? 'primary' : 'secondary';
}

function download(autoUpdater) {
  sendToast({ kind: 'downloading', version: available?.version, percent: 0 });
  autoUpdater.downloadUpdate().catch(err => {
    logger.error('[updater] download failed', err);
    sendToast({ kind: 'error', message: `The update could not be downloaded. ${err?.message || ''}`.trim() });
  });
}

function updater() {
  const { autoUpdater } = require('electron-updater'); // loaded on first use to keep app start-up light
  if (wired) return autoUpdater;
  wired = true;
  autoUpdater.autoDownload = false;
  autoUpdater.logger = { info: m => logger.info('[updater]', m), warn: m => logger.warn('[updater]', m), error: m => logger.error('[updater]', m), debug: () => {} };

  autoUpdater.on('update-available', async info => {
    available = info;
    if (!manual) {
      sendToast({ kind: 'available', version: info.version });
      return;
    }
    const choice = await showNotice({
      title: 'Update available',
      message: `Version ${info.version} is available.`,
      detail: `You are running ${app.getVersion()}. Download it now? It installs when you restart the app.`,
      primary: 'Download',
      secondary: 'Later'
    });
    if (choice === 'primary') download(autoUpdater);
  });
  autoUpdater.on('download-progress', progress => sendToast({ kind: 'downloading', version: available?.version, percent: Math.round(progress.percent || 0) }));
  autoUpdater.on('update-not-available', () => {
    if (manual) showNotice({ title: 'No updates', message: 'You are on the latest version.', detail: `Version ${app.getVersion()}`, primary: 'OK' });
  });
  autoUpdater.on('update-downloaded', info => sendToast({ kind: 'ready', version: info.version }));
  autoUpdater.on('error', err => {
    logger.error('[updater] error', err);
    if (manual) showNotice({ title: 'Update check failed', message: 'Could not check for updates.', detail: err?.message || String(err), primary: 'OK', tone: 'danger' });
  });
  return autoUpdater;
}

// What the toast's buttons ask for. Only the app's own window may.
const fromApp = event => event.sender === parent()?.webContents;
ipcMain.on('update:download', event => {
  if (fromApp(event) && available && configured()) download(updater());
});
ipcMain.on('update:install', event => {
  if (fromApp(event) && configured()) updater().quitAndInstall();
});
ipcMain.on('update:dismiss', event => {
  if (fromApp(event)) toastState = null;
});
ipcMain.handle('update:toast-state', event => (fromApp(event) ? toastState : null));

// `silent` is the automatic check: it only speaks up (with a toast) when there is an update.
async function checkForUpdates({ silent = false } = {}) {
  manual = !silent;
  if (!configured()) {
    if (!silent) await showNotice({ title: 'Updates', message: 'Updates are not set up for this build.', detail: 'Install a release build to receive updates.', primary: 'OK' });
    return;
  }
  try {
    await updater().checkForUpdates();
  } catch (err) {
    logger.error('[updater] check failed', err);
  }
}

// ---- the schedule -----------------------------------------------------------------------------------------------
// One automatic check every 24 hours while the app is running. A closed app cannot check, so the time of the last check is
// kept on disk: starting the app after more than a day away checks right away.
const stampFile = () => path.join(app.getPath('userData'), 'update-check.json');
function lastChecked() {
  try {
    return Number(JSON.parse(fs.readFileSync(stampFile(), 'utf8')).lastCheck) || 0;
  } catch {
    return 0;
  }
}
function recordCheck() {
  try {
    fs.writeFileSync(stampFile(), JSON.stringify({ lastCheck: Date.now() }));
  } catch (err) {
    logger.warn('[updater] could not save the time of the last check', err.message);
  }
}
async function automaticCheck() {
  recordCheck();
  await checkForUpdates({ silent: true });
}
function scheduleUpdateChecks() {
  if (!configured()) return;
  setTimeout(() => {
    if (Date.now() - lastChecked() >= CHECK_EVERY_MS) automaticCheck();
  }, FIRST_CHECK_DELAY_MS);
  setInterval(automaticCheck, CHECK_EVERY_MS);
}

module.exports = { checkForUpdates, scheduleUpdateChecks, updatesConfigured: configured, showNotice, sendToast, CHECK_EVERY_MS };
