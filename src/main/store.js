const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

// Saved connections live here, in the main process. The renderer only ever sees them with secrets masked, and it
// refers to a connection by id when it connects, so a password is never sent back and forth.
const SECRET_FIELDS = ['password', 'apiKey', 'sshPassword', 'sshPassphrase', 'connectionString', 'uri'];
const MASK = '••••••••';

const storePath = () => path.join(app.getPath('userData'), 'connections.enc');
// Besides the profiles it keeps the workspace: open tabs, query history and saved queries (all encrypted too).
const emptyStore = () => ({ profiles: [], activeId: null, lastQueries: {}, tabs: {}, history: {}, snippets: [] });
let store = emptyStore();

// Copy kept of a store file that could not be read (one copy per run), so saving a new profile afterwards can
// never destroy saved connections that merely failed to decrypt.
let unreadableBackup = null;

const redactProfile = profile => {
  const out = { ...profile };
  delete out.secretsFrom;
  for (const field of SECRET_FIELDS) if (out[field]) out[field] = MASK;
  return out;
};
const redactedStore = () => ({ ...store, profiles: store.profiles.map(redactProfile) });

const getProfile = id => store.profiles.find(p => p.id === id) || null;

// Replaces masked secret fields in a profile coming from the renderer with the stored values.
// A duplicated profile points at its source with `secretsFrom` until it has been saved once.
function resolveSecrets(profile, id = profile.id) {
  const out = { ...profile };
  const base = getProfile(id) || getProfile(profile.secretsFrom);
  delete out.secretsFrom;
  for (const field of SECRET_FIELDS) if (out[field] === MASK) out[field] = base?.[field] ?? '';
  return out;
}

function load() {
  const file = storePath();
  try {
    if (!fs.existsSync(file)) { store = emptyStore(); return { ok: true, ...redactedStore() }; }
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is unavailable on this device.');
    const saved = JSON.parse(safeStorage.decryptString(Buffer.from(fs.readFileSync(file, 'utf8'), 'base64')));
    const data = Array.isArray(saved) ? { profiles: saved } : saved;
    store = {
      profiles: data.profiles || [], activeId: data.activeId || null, lastQueries: data.lastQueries || {},
      tabs: data.tabs || {}, history: data.history || {}, snippets: Array.isArray(data.snippets) ? data.snippets : []
    };
    unreadableBackup = null;
    return { ok: true, ...redactedStore() };
  } catch (err) {
    let backup = unreadableBackup;
    try {
      if (!backup && fs.existsSync(file)) {
        backup = `${file}.unreadable-${new Date().toISOString().replace(/[:.]/g, '-')}`;
        fs.copyFileSync(file, backup);
        unreadableBackup = backup;
      }
    } catch (_) { backup = null; }
    return { ok: false, profiles: [], message: `${err?.message || 'Could not read saved connections.'}${backup ? ` A copy of the saved file was kept at ${backup}.` : ''}`, code: err?.code ?? null };
  }
}

// `incoming` is { profiles, activeId, lastQueries } from the renderer. The in-memory copy is updated first, so
// connecting works even when the disk write fails. Returns { ok, profiles (masked), error? }.
function save(incoming) {
  if (!Array.isArray(incoming?.profiles)) return { ok: false, profiles: [], error: { message: 'Invalid connection data.' } };
  store = {
    profiles: incoming.profiles.map(profile => resolveSecrets(profile)), activeId: incoming.activeId || null, lastQueries: incoming.lastQueries || {},
    tabs: incoming.tabs || {}, history: incoming.history || {}, snippets: Array.isArray(incoming.snippets) ? incoming.snippets : []
  };
  const profiles = store.profiles.map(redactProfile);
  try {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is unavailable. Connections were not saved.');
    const encrypted = safeStorage.encryptString(JSON.stringify(store)).toString('base64');
    const file = storePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, encrypted, { mode: 0o600 });
    fs.renameSync(temp, file);
    return { ok: true, profiles };
  } catch (err) { return { ok: false, profiles, error: { message: err?.message || 'Unknown error' } }; }
}

module.exports = { MASK, SECRET_FIELDS, load, save, getProfile, resolveSecrets, redactProfile };
