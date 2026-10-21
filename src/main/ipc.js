const { app, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const windowState = require('./window');
const store = require('./store');
const sessions = require('./sessions');
const { safeError, isReadOnlyQuery } = require('./errors');
const { logger } = require('./logger');

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
  try {
    return { ok: true, ...(await work()) };
  } catch (err) {
    return { ok: false, error: safeError(err) };
  }
};

const DEFAULT_MAX_ROWS = 1000;
const MAX_ROWS = 100000;
const rowLimit = value => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.min(Math.floor(Number(value)), MAX_ROWS) : DEFAULT_MAX_ROWS);

function registerIpc() {
  ipcMain.on('app:ready', event => {
    if (fromMainWindow(event)) windowState.revealMainWindow();
  });
  // Errors from the page itself (they never carry query results, only the message and stack).
  ipcMain.on('log:renderer', (event, entry) => {
    if (fromMainWindow(event)) logger.error('[renderer]', String(entry?.message || '').slice(0, 1000), String(entry?.stack || '').slice(0, 3000));
  });
  ipcMain.on('app:check-updates', event => {
    if (fromMainWindow(event)) require('./updater').checkForUpdates();
  });
  ipcMain.handle('app:version', event => (fromMainWindow(event) ? app.getVersion() : ''));
  ipcMain.on('unsaved:report', (event, count) => {
    if (fromMainWindow(event)) windowState.setUnsavedChanges(count);
  });
  ipcMain.on('theme:report', (event, theme) => {
    if (fromMainWindow(event)) windowState.applyTheme(theme);
  });

  handle('db:pick-service-account', async () => {
    const result = await dialog.showOpenDialog(windowState.getMainWindow(), {
      title: 'Choose Firebase service-account JSON',
      properties: ['openFile'],
      filters: [{ name: 'JSON files', extensions: ['json'] }]
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });

  // Export: the user picks where the file goes in a native dialog; the page never chooses a path itself.
  handle('file:save', async ({ defaultName, filters, text, base64 }) => {
    const name = path.basename(String(defaultName || 'export.txt')).replace(/[<>:"/\\|?*]/g, '_');
    const result = await dialog.showSaveDialog(windowState.getMainWindow(), {
      title: 'Save export',
      defaultPath: path.join(app.getPath('downloads'), name),
      filters: Array.isArray(filters) && filters.length ? filters : [{ name: 'All files', extensions: ['*'] }]
    });
    if (result.canceled || !result.filePath) return { ok: true, saved: false };
    try {
      fs.writeFileSync(result.filePath, base64 ? Buffer.from(String(base64), 'base64') : String(text ?? ''));
      return { ok: true, saved: true, path: result.filePath };
    } catch (err) {
      return { ok: false, error: { message: err.message } };
    }
  });

  handle('db:pick-ssh-key', async () => {
    const result = await dialog.showOpenDialog(windowState.getMainWindow(), {
      title: 'Choose SSH private key',
      properties: ['openFile'],
      filters: [{ name: 'Private key files', extensions: ['pem', 'key', 'ppk', ''] }]
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });

  // Saved connections come back with their secrets masked.
  handle('connections:load', async () => {
    const loaded = store.load();
    return loaded.ok ? loaded : { ok: false, profiles: [], error: { message: loaded.message, code: loaded.code } };
  });
  // Reveals one saved secret on request, for the show button of the connection dialog.
  handle('connections:reveal-secret', async ({ id, field }) => {
    if (!store.SECRET_FIELDS.includes(field)) return { ok: false, error: { message: 'Not a secret field.' } };
    return { ok: true, value: String(store.getProfile(id)?.[field] ?? '') };
  });
  handle('connections:save', async payload => store.save(payload));

  handle('db:test', ({ profile, id }) =>
    attempt(async () => {
      try {
        await sessions.test(profile, id);
      } catch (err) {
        logger.warn('[db:test] failed:', err.message);
        throw err;
      }
      return { label: profile.name || profile.type };
    })
  );

  handle('db:connect', ({ id }) =>
    attempt(async () => {
      await sessions.connect(id);
      return { label: store.getProfile(id)?.name || '' };
    })
  );

  handle('db:disconnect', ({ id }) => attempt(() => sessions.disconnect(id).then(() => ({}))));

  handle('db:discover', ({ id, database, schema }) =>
    attempt(async () => ({
      result: await sessions.withSession(id, s => sessions.connectorFor(s.type).discover(s, database, schema), { retry: true })
    }))
  );

  handle('db:switch-database', ({ id, database }) => attempt(() => sessions.switchDatabase(id, database).then(() => ({}))));

  // Read-only connections are enforced here as well as by the UI (and by a read-only database session where supported).
  const readOnlyError = () => new Error('This connection is read-only. Edit the connection to allow changes.');

  handle('db:query', ({ id, query, maxRows }) =>
    attempt(async () => ({
      result: await sessions.withSession(
        id,
        s => {
          const connector = sessions.connectorFor(s.type);
          if (s.profile.readOnly && connector.isWrite(String(query))) throw readOnlyError();
          return connector.query(s, String(query), { maxRows: rowLimit(maxRows) });
        },
        { retry: isReadOnlyQuery(query) }
      )
    }))
  );

  handle('db:cancel', ({ id }) => attempt(async () => ({ cancelled: await sessions.cancel(id) })));

  // Columns, primary key and indexes of one table, loaded when it is opened.
  handle('db:describe', ({ id, object }) =>
    attempt(async () => ({
      result: await sessions.withSession(
        id,
        s => {
          const connector = sessions.connectorFor(s.type);
          return connector.describe ? connector.describe(s, object || {}) : {};
        },
        { retry: true }
      )
    }))
  );

  // Structured insert / update / delete from the record editors; values are never assembled into query text.
  // Several structured changes in one transaction (SQL engines only).
  handle('db:mutate-batch', ({ id, ops }) =>
    attempt(async () => ({
      result: await sessions.withSession(id, s => {
        if (s.profile.readOnly) throw readOnlyError();
        const connector = sessions.connectorFor(s.type);
        if (!connector.mutateBatch) throw new Error('This database does not support applying several changes at once.');
        return connector.mutateBatch(s, ops);
      })
    }))
  );

  // New database, schema, table or collection. The connector validates and quotes every name itself.
  // The "Database info" dialog: size, charset, object counts, server version.
  handle('db:info', ({ id, database }) =>
    attempt(async () => ({
      result: await sessions.withSession(
        id,
        s => {
          const connector = sessions.connectorFor(s.type);
          if (!connector.info) throw new Error('This connection cannot show database info.');
          return connector.info(s, database || undefined);
        },
        { retry: true }
      )
    }))
  );

  // `preview` only returns the SQL that would run (SQL engines), so the dialog can show it before anything changes.
  handle('db:create', ({ id, spec, preview }) =>
    attempt(async () => ({
      result: await sessions.withSession(id, s => {
        if (s.profile.readOnly && !preview) throw readOnlyError();
        const connector = sessions.connectorFor(s.type);
        if (!connector.create) throw new Error('This connection cannot create databases, tables or collections.');
        if (preview && !connector.alter) return { statements: [] }; // only the SQL engines can show what would run
        return connector.create(s, spec || {}, { preview: preview === true });
      })
    }))
  );

  // Changes the columns or the name of a table (SQL engines).
  handle('db:alter', ({ id, object, ops, preview }) =>
    attempt(async () => ({
      result: await sessions.withSession(id, s => {
        if (s.profile.readOnly && !preview) throw readOnlyError();
        const connector = sessions.connectorFor(s.type);
        if (!connector.alter) throw new Error('This connection cannot change a table structure.');
        return connector.alter(s, { object: object || {}, ops }, { preview: preview === true });
      })
    }))
  );

  handle('db:mutate', ({ id, op }) =>
    attempt(async () => ({
      result: await sessions.withSession(id, s => {
        if (s.profile.readOnly) throw readOnlyError();
        return sessions.connectorFor(s.type).mutate(s, op || {});
      })
    }))
  );
}

module.exports = { registerIpc };
