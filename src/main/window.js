const { app, BrowserWindow, Menu, ipcMain, screen, shell, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { logger, logFile } = require('./logger');

// Custom title bar: the native one is hidden and Electron draws only the window buttons, in these colours.
// The overlay is one pixel shorter than the bar so the bar's bottom border shows under the window buttons.
const TITLE_BAR = { height: process.platform === 'darwin' ? 38 : 30, dark: { color: '#141414', symbolColor: '#ffffff' }, light: { color: '#ffffff', symbolColor: '#0d0d0d' } };
const SPLASH_MIN_MS = 700; // avoid a flash when the UI is ready almost immediately
const SPLASH_MAX_MS = 15000; // never leave the splash up if the UI fails to report

const root = path.join(__dirname, '..', '..');
let mainWindow = null;
let splash = null;
let splashShownAt = 0;
let restoredMaximized = false;

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

// Size, position and maximized state of the last session, ignoring a saved position that is no longer on any screen.
function readWindowState() {
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const bounds = {};
    if (Number.isFinite(saved.width) && Number.isFinite(saved.height)) {
      bounds.width = Math.max(1000, saved.width);
      bounds.height = Math.max(680, saved.height);
    }
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y) && bounds.width) {
      const visible = screen
        .getAllDisplays()
        .some(({ workArea: a }) => saved.x < a.x + a.width - 80 && saved.x + bounds.width > a.x + 80 && saved.y >= a.y - 10 && saved.y < a.y + a.height - 80);
      if (visible) {
        bounds.x = saved.x;
        bounds.y = saved.y;
      }
    }
    return { bounds, maximized: Boolean(saved.maximized) };
  } catch (_) {
    return { bounds: {}, maximized: false };
  }
}

function trackWindowState(win) {
  let timer = null;
  const write = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    const maximized = win.isMaximized();
    const bounds = maximized ? readWindowState().bounds : win.getNormalBounds(); // keep the restored size while maximized
    try {
      fs.writeFileSync(stateFile(), JSON.stringify({ ...bounds, maximized }));
    } catch (_) {
      /* not critical */
    }
  };
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(write, 400);
  };
  win.on('resize', later);
  win.on('move', later);
  win.on('maximize', later);
  win.on('unmaximize', later);
  win.on('close', () => {
    clearTimeout(timer);
    write();
  });
}

// Unsaved table edits reported by the UI. Closing or quitting with some asks first.
let unsavedChanges = 0;
let discardConfirmed = false;
const setUnsavedChanges = count => {
  unsavedChanges = Math.max(0, Number(count) || 0);
  if (!unsavedChanges) discardConfirmed = false;
};
const hasUnsavedChanges = () => unsavedChanges > 0 && !discardConfirmed;

// Resolves true when the user agrees to lose the pending changes. The question is asked in the app's own (themed)
// dialog; the native message box is only the fallback when the page cannot show it.
let asking = null;
function confirmDiscard() {
  if (asking) return asking;
  const win = getMainWindow();
  const page = win?.webContents;
  const ask = page && !page.isDestroyed() && !page.isCrashed() && !page.isLoading() ? askInPage(page) : askNatively(win);
  asking = ask
    .then(ok => {
      if (ok) discardConfirmed = true;
      return ok;
    })
    .finally(() => {
      asking = null;
    });
  return asking;
}

function askInPage(page) {
  return new Promise(resolve => {
    const onAnswer = (event, ok) => {
      if (event.sender !== page) return;
      ipcMain.removeListener('unsaved:answer', onAnswer);
      resolve(ok === true);
    };
    ipcMain.on('unsaved:answer', onAnswer);
    page.once('destroyed', () => resolve(false));
    page.send('unsaved:ask', unsavedChanges);
  });
}

async function askNatively(win) {
  const { response } = await dialog.showMessageBox(win || undefined, {
    type: 'warning',
    buttons: ['Keep editing', 'Discard and quit'],
    defaultId: 0,
    cancelId: 0,
    title: 'Unsaved changes',
    message: `You have ${unsavedChanges} unsaved change${unsavedChanges === 1 ? '' : 's'} .`,
    detail: 'They have not been applied to the database. Quitting now discards them.'
  });
  return response === 1;
}

const getMainWindow = () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null);

function createSplash() {
  splash = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0d0d0d',
    title: 'UDBW',
    icon: path.join(root, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  splash.once('ready-to-show', () => {
    if (splash && !splash.isDestroyed()) {
      splash.show();
      splashShownAt = Date.now();
    }
  });
  splash.on('closed', () => {
    splash = null;
  });
  splash.loadFile(path.join(root, 'src', 'splash.html'));
}

// Reveals the main window and drops the splash, once the UI has loaded its data (or a timeout hit).
function showMainWindow() {
  // maximize() on a hidden window also shows it, so it is applied here rather than at creation (else the splash would stay up).
  if (restoredMaximized) {
    restoredMaximized = false;
    mainWindow.maximize();
  }
  mainWindow.show();
}

function revealMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed() || (!splash && mainWindow.isVisible())) return;
  const wait = splash ? Math.max(0, SPLASH_MIN_MS - (Date.now() - splashShownAt)) : 0;
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    showMainWindow();
    if (splash && !splash.isDestroyed()) splash.destroy();
    splash = null;
  }, wait);
}

function createWindow() {
  const restored = readWindowState();
  mainWindow = new BrowserWindow({
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...TITLE_BAR.dark, height: TITLE_BAR.height - 1 },
    trafficLightPosition: { x: 12, y: (TITLE_BAR.height - 12) / 2 }, // macOS: centre the window buttons in the bar
    autoHideMenuBar: true, // the menu bar appears on Alt; its shortcuts keep working while hidden
    width: 1440,
    height: 940,
    ...restored.bounds,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#0d0d0d',
    title: 'UDBW',
    icon: path.join(root, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(root, 'src', 'preload.js'),
      additionalArguments: app.isPackaged ? [] : ['--udbw-dev'], // lets the page mark a run from source
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });
  restoredMaximized = Boolean(restored.maximized);
  trackWindowState(mainWindow);
  mainWindow.on('close', event => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    confirmDiscard().then(ok => {
      if (ok) getMainWindow()?.close();
    });
  });
  mainWindow.once('ready-to-show', () => {
    if (!splash) showMainWindow();
  }); // e.g. reopened from the dock
  mainWindow.webContents.on('did-fail-load', revealMainWindow);
  setTimeout(revealMainWindow, SPLASH_MAX_MS);
  // `yarn dev` serves the UI from Vite (hot reload); a packaged app never honours that variable.
  const devServer = app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL;
  if (devServer) mainWindow.loadURL(devServer);
  else mainWindow.loadFile(path.join(root, 'dist', 'index.html'));
}

// The app never needs to open another window or leave its own page, so both are refused. Web links go to the browser.
function hardenWebContents() {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', event => event.preventDefault());
    contents.on('will-attach-webview', event => event.preventDefault());
    contents.on('render-process-gone', async (_event, details) => {
      logger.error('Renderer process gone:', details);
      if (details.reason === 'clean-exit' || contents.isDestroyed()) return;
      const choice = await dialog.showMessageBox(getMainWindow() || undefined, {
        type: 'error',
        buttons: ['Reload', 'Close'],
        defaultId: 0,
        cancelId: 1,
        title: 'The window stopped working',
        message: 'The window crashed.',
        detail: `Reason: ${details.reason}. Details were written to the log.`
      });
      if (choice.response === 0 && !contents.isDestroyed()) contents.reload();
      else app.quit();
    });
  });
  // No camera, microphone, location etc.; copying text out of the results is the only permission the UI uses.
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'clipboard-sanitized-write'));
}

function showAbout() {
  dialog.showMessageBox(getMainWindow() || undefined, {
    type: 'info',
    title: 'About',
    message: 'UDBW',
    detail: `Universal DB Workbench\nVersion ${app.getVersion()}`,
    buttons: ['OK']
  });
}

function buildAppMenu(theme = 'dark') {
  const setTheme = mode => {
    const win = getMainWindow();
    if (win) win.webContents.send('theme:set', mode);
  };
  // Reload and developer tools exist only when running from source; the app binds Ctrl+R itself.
  const viewMenu = {
    label: 'View',
    submenu: [
      ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }, { type: 'separator' }]),
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { role: 'fileMenu' },
      { role: 'editMenu' },
      viewMenu,
      {
        label: 'Settings',
        submenu: [
          {
            label: 'Theme',
            submenu: [
              { label: 'Light', type: 'radio', checked: theme === 'light', click: () => setTheme('light') },
              { label: 'Dark', type: 'radio', checked: theme === 'dark', click: () => setTheme('dark') }
            ]
          }
        ]
      },
      { role: 'windowMenu' },
      {
        role: 'help',
        submenu: [
          { label: 'Check for updates…', click: () => require('./updater').checkForUpdates() },
          { label: 'Open log folder', click: () => shell.openPath(path.dirname(logFile())) },
          { type: 'separator' },
          { label: 'About UDBW', click: showAbout }
        ]
      }
    ])
  );
}

function applyTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') return;
  buildAppMenu(theme);
  const win = getMainWindow();
  if (win && typeof win.setTitleBarOverlay === 'function') {
    try {
      win.setTitleBarOverlay({ ...TITLE_BAR[theme], height: TITLE_BAR.height - 1 });
    } catch (_) {
      /* not supported here */
    }
  }
}

module.exports = { createSplash, createWindow, revealMainWindow, hardenWebContents, buildAppMenu, applyTheme, getMainWindow, setUnsavedChanges, hasUnsavedChanges, confirmDiscard };
