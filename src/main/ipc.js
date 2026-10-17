const { ipcMain, dialog } = require('electron');
const windowState = require('./window');
const store = require('./store');
const sessions = require('./sessions');
const { safeError, isReadOnlyQuery } = require('./errors');

// Only the app's own main window may call these; anything else (a stray frame, a second window) is refused.
function fromMainWindow(event) {
  const win = windowState.getMainWindow();
  return Boolean(win) && event.sender === win.webContents && event.senderFrame === event.sender.mainFrame;
}

function handle(channel, fn) {
  ipcMain.handle(channel, (event, payload) => {
    if (!fromMainWindow(event)) return { ok: false, error: { message: 'Request refused.' } };
    return fn(payload || {}, event);
  });
}

// Wraps a handler body: { ok: true, ...body } on success, { ok: false, error } on any failure.
const attempt = async work => {
  try { return { ok: true, ...(await work()) }; }
  catch (err) { return { ok: false, error: safeError(err) }; }
};

function registerIpc() {
  ipcMain.on('app:ready', event => { if (fromMainWindow(event)) windowState.revealMainWindow(); });
  ipcMain.on('theme:report', (event, theme) => { if (fromMainWindow(event)) windowState.applyTheme(theme); });

  handle('db:pick-service-account', async () => {
    const result = await dialog.showOpenDialog(windowState.getMainWindow(), {
      title: 'Choose Firebase service-account JSON', properties: ['openFile'], filters: [{ name: 'JSON files', extensions: ['json'] }]
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });

  handle('db:pick-ssh-key', async () => {
    const result = await dialog.showOpenDialog(windowState.getMainWindow(), {
      title: 'Choose SSH private key', properties: ['openFile'], filters: [{ name: 'Private key files', extensions: ['pem', 'key', 'ppk', ''] }]
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });

  // Saved connections come back with their secrets masked.
  handle('connections:load', async () => {
    const loaded = store.load();
    return loaded.ok ? loaded : { ok: false, profiles: [], error: { message: loaded.message, code: loaded.code } };
  });
  handle('connections:save', async payload => store.save(payload));

  handle('db:test', ({ profile, id }) => attempt(async () => {
    try { await sessions.test(profile, id); }
    catch (err) { console.error('[db:test] failed', err); throw err; }
    return { label: profile.name || profile.type };
  }));

  handle('db:connect', ({ id }) => attempt(async () => {
    await sessions.connect(id);
    return { label: store.getProfile(id)?.name || '' };
  }));

  handle('db:disconnect', ({ id }) => attempt(() => sessions.disconnect(id).then(() => ({}))));

  handle('db:discover', ({ id, database, schema }) => attempt(async () => ({
    result: await sessions.withSession(id, s => sessions.connectorFor(s.type).discover(s, database, schema), { retry: true })
  })));

  handle('db:switch-database', ({ id, database }) => attempt(() => sessions.switchDatabase(id, database).then(() => ({}))));

  handle('db:query', ({ id, query }) => attempt(async () => ({
    result: await sessions.withSession(id, s => sessions.connectorFor(s.type).query(s, String(query)), { retry: isReadOnlyQuery(query) })
  })));

  // Structured insert / update / delete from the record editors; values are never assembled into query text.
  handle('db:mutate', ({ id, op }) => attempt(async () => ({
    result: await sessions.withSession(id, s => sessions.connectorFor(s.type).mutate(s, op || {}))
  })));
}

module.exports = { registerIpc };
