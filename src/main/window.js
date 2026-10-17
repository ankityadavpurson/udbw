const { app, BrowserWindow, Menu, screen, shell, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');

// Custom title bar: the native one is hidden and Electron draws only the window buttons, in these colours.
const TITLE_BAR = { height: 30, dark: { color: '#1f1f1f', symbolColor: '#ffffff' }, light: { color: '#ffffff', symbolColor: '#151515' } };
const SPLASH_MIN_MS = 700;      // avoid a flash when the UI is ready almost immediately
const SPLASH_MAX_MS = 15000;    // never leave the splash up if the UI fails to report

const root = path.join(__dirname, '..', '..');
let mainWindow = null;
let splash = null;
let splashShownAt = 0;

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

// Size, position and maximized state of the last session, ignoring a saved position that is no longer on any screen.
function readWindowState() {
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const bounds = {};
    if (Number.isFinite(saved.width) && Number.isFinite(saved.height)) { bounds.width = Math.max(1000, saved.width); bounds.height = Math.max(680, saved.height); }
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y) && bounds.width) {
      const visible = screen.getAllDisplays().some(({ workArea: a }) => saved.x < a.x + a.width - 80 && saved.x + bounds.width > a.x + 80 && saved.y >= a.y - 10 && saved.y < a.y + a.height - 80);
      if (visible) { bounds.x = saved.x; bounds.y = saved.y; }
    }
    return { bounds, maximized: Boolean(saved.maximized) };
  } catch (_) { return { bounds: {}, maximized: false }; }
}

function trackWindowState(win) {
  let timer = null;
  const write = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    const maximized = win.isMaximized();
    const bounds = maximized ? readWindowState().bounds : win.getNormalBounds();   // keep the restored size while maximized
    try { fs.writeFileSync(stateFile(), JSON.stringify({ ...bounds, maximized })); } catch (_) { /* not critical */ }
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(write, 400); };
  win.on('resize', later); win.on('move', later); win.on('maximize', later); win.on('unmaximize', later);
  win.on('close', () => { clearTimeout(timer); write(); });
}

const getMainWindow = () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null);

function createSplash() {
  splash = new BrowserWindow({
    width: 420, height: 260, frame: false, resizable: false, maximizable: false, minimizable: false, show: false,
    alwaysOnTop: true, skipTaskbar: true, backgroundColor: '#252529', title: 'Universal DB Workbench',
    icon: path.join(root, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  splash.once('ready-to-show', () => { if (splash && !splash.isDestroyed()) { splash.show(); splashShownAt = Date.now(); } });
  splash.on('closed', () => { splash = null; });
  splash.loadFile(path.join(root, 'src', 'splash.html'));
}

// Reveals the main window and drops the splash, once the UI has loaded its data (or a timeout hit).
function revealMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) return;
  const wait = splash ? Math.max(0, SPLASH_MIN_MS - (Date.now() - splashShownAt)) : 0;
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
    if (splash && !splash.isDestroyed()) splash.destroy();
    splash = null;
  }, wait);
}

function createWindow() {
  const restored = readWindowState();
  mainWindow = new BrowserWindow({
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...TITLE_BAR.dark, height: TITLE_BAR.height },
    autoHideMenuBar: true,   // the menu bar appears on Alt; its shortcuts keep working while hidden
    width: 1440,
    height: 940,
    ...restored.bounds,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#101116',
    title: 'Universal DB Workbench',
    icon: path.join(root, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(root, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });
  if (restored.maximized) mainWindow.maximize();
  trackWindowState(mainWindow);
  mainWindow.once('ready-to-show', () => { if (!splash) mainWindow.show(); });   // e.g. reopened from the dock
  mainWindow.webContents.on('did-fail-load', revealMainWindow);
  setTimeout(revealMainWindow, SPLASH_MAX_MS);
  mainWindow.loadFile(path.join(root, 'dist', 'index.html'));
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
  });
  // No camera, microphone, location etc.; copying text out of the results is the only permission the UI uses.
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'clipboard-sanitized-write'));
}

function showAbout() {
  dialog.showMessageBox(getMainWindow() || undefined, { type: 'info', title: 'About', message: 'Universal DB Workbench', detail: `Version ${app.getVersion()}`, buttons: ['OK'] });
}

function buildAppMenu(theme = 'dark') {
  const setTheme = mode => { const win = getMainWindow(); if (win) win.webContents.send('theme:set', mode); };
  // Reload and developer tools exist only when running from source; the app binds Ctrl+R itself.
  const viewMenu = { label: 'View', submenu: [
    ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }, { type: 'separator' }]),
    { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }
  ] };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' }, { role: 'editMenu' }, viewMenu,
    { label: 'Settings', submenu: [{ label: 'Theme', submenu: [
      { label: 'Light', type: 'radio', checked: theme === 'light', click: () => setTheme('light') },
      { label: 'Dark', type: 'radio', checked: theme === 'dark', click: () => setTheme('dark') }
    ] }] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'About Universal DB Workbench', click: showAbout }] }
  ]));
}

function applyTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') return;
  buildAppMenu(theme);
  const win = getMainWindow();
  if (win && typeof win.setTitleBarOverlay === 'function') {
    try { win.setTitleBarOverlay({ ...TITLE_BAR[theme], height: TITLE_BAR.height }); } catch (_) { /* not supported here */ }
  }
}

module.exports = { createSplash, createWindow, revealMainWindow, hardenWebContents, buildAppMenu, applyTheme, getMainWindow };
