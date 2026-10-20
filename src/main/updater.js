const { app, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');
const windowState = require('./window');

// Updates come from the release server the build was configured with (electron-builder writes app-update.yml next to
// the app when `build.publish` is set, which the release workflow does). Development and unconfigured builds skip it.
const configured = () => app.isPackaged && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'));

const parent = () => windowState.getMainWindow() || undefined;
const pageOf = () => {
  const page = parent()?.webContents;
  return page && !page.isDestroyed() && !page.isCrashed() && !page.isLoading() ? page : null;
};
let wired = false;
let manual = false;

// Shows a notice in the app's own (themed) dialog and resolves 'primary' or 'secondary'. A notice has a title, a message,
// an optional detail and one or two buttons: { title, message, detail?, primary, secondary?, tone? }. When the page cannot show
// it, the native message box is the fallback.
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

// Download progress for the in-app dialog: a percentage, or null to hide it.
const showProgress = percent => pageOf()?.send('update:progress', percent);

function updater() {
  const { autoUpdater } = require('electron-updater'); // loaded on first use to keep app start-up light
  if (wired) return autoUpdater;
  wired = true;
  autoUpdater.autoDownload = false;
  autoUpdater.logger = { info: m => logger.info('[updater]', m), warn: m => logger.warn('[updater]', m), error: m => logger.error('[updater]', m), debug: () => {} };
  const failed = (title, err) =>
    showNotice({
      title,
      message: title === 'Update failed' ? 'The update could not be downloaded.' : 'Could not check for updates.',
      detail: err?.message || String(err),
      primary: 'OK',
      tone: 'danger'
    });

  autoUpdater.on('update-available', async info => {
    const choice = await showNotice({
      title: 'Update available',
      message: `Version ${info.version} is available.`,
      detail: `You are running ${app.getVersion()}. Download it now? It installs when you restart the app.`,
      primary: 'Download',
      secondary: 'Later'
    });
    if (choice !== 'primary') return;
    showProgress(0);
    autoUpdater.downloadUpdate().catch(err => {
      logger.error('[updater] download failed', err);
      showProgress(null);
      failed('Update failed', err);
    });
  });
  autoUpdater.on('download-progress', progress => showProgress(Math.round(progress.percent || 0)));
  autoUpdater.on('update-not-available', () => {
    if (manual) showNotice({ title: 'No updates', message: 'You are on the latest version.', detail: `Version ${app.getVersion()}`, primary: 'OK' });
  });
  autoUpdater.on('update-downloaded', async info => {
    showProgress(null);
    const choice = await showNotice({
      title: 'Update ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'Restart the app to finish updating.',
      primary: 'Restart now',
      secondary: 'Later'
    });
    if (choice === 'primary') autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', err => {
    logger.error('[updater] error', err);
    if (manual) failed('Update check failed', err);
  });
  return autoUpdater;
}

// `silent` is the automatic check at start-up: it only speaks up when there is an update.
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

module.exports = { checkForUpdates, updatesConfigured: configured, showNotice };
