// End-to-end smoke test: boots the real app (Electron + the built UI in dist/) with a throw-away user-data folder
// and a FAKE MySQL connector, then drives the UI. It needs a display (on Linux CI use xvfb-run) and `yarn build:ui`
// first. Run with: yarn test:e2e   (exit code 0 = all checks passed)
const { app, BrowserWindow, safeStorage } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const root = path.join(__dirname, '..', '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'udw-e2e-'));
app.setPath('userData', userData);
require(path.join(root, 'src', 'main.js'));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`); };

// ---- a fake database ---------------------------------------------------------------------------------------------
const received = [];
const columns = ['id', 'name', 'note'];
const makeRows = n => Array.from({ length: n }, (_, i) => [String(i + 1), `user ${i + 1}`, i % 7 === 0 ? null : `note ${i + 1}`]);
const fake = {
  async connect() { return { type: 'mysql', client: {} }; },
  async close() {},
  async query(_session, text, { maxRows } = {}) {
    received.push({ kind: 'query', text, maxRows });
    if (/sleep/i.test(text)) await new Promise((resolve, reject) => { fake.interrupt = () => reject(new Error('Query execution was interrupted')); setTimeout(resolve, 5000); });
    const limit = /LIMIT (\d+)/i.exec(text);
    const all = makeRows(limit ? Number(limit[1]) : 5000);
    const truncated = all.length > maxRows;
    const rows = truncated ? all.slice(0, maxRows) : all;
    return { columns, rows, rowCount: rows.length, truncated, maxRows, message: `${rows.length} rows returned` };
  },
  async mutate(_session, op) { received.push({ kind: 'mutate', op }); return { columns: [], rows: [], rowCount: 1, message: 'Updated 1 row(s)' }; },
  async cancel() { received.push({ kind: 'cancel' }); fake.interrupt?.(); return true; },
  async discover() { return { databases: ['shop'], schemas: ['shop'], message: '', objects: [{ name: 'users', schema: 'shop', type: 'table' }, { name: 'orders', schema: 'shop', type: 'table' }] }; },
  async describe(_session, object) { received.push({ kind: 'describe', object: object.name }); return { columns, columnInfo: [], primaryKey: ['id'], indexes: [] }; },
  async switchDatabase() {},
  isWrite: text => !/^\s*(select|show|describe|explain)/i.test(text)
};
const fakePath = require.resolve(path.join(root, 'src', 'main', 'connectors', 'mysql.js'));
require.cache[fakePath] = { id: fakePath, filename: fakePath, loaded: true, exports: fake };

app.whenReady().then(async () => {
  try {
    let win;
    for (let i = 0; i < 100 && !win; i++) { await sleep(100); win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html')); }
    if (!win) throw new Error('the main window never loaded (did you run `yarn build:ui`?)');
    const problems = [];
    win.webContents.on('console-message', (_event, level, message) => { if (level >= 2 || /Content Security|Uncaught/.test(message)) problems.push(message); });
    const run = code => win.webContents.executeJavaScript(code);
    await sleep(1500);

    // The page talks to the main process only through window.workbench, and secrets stay masked.
    const profile = { id: 'p1', name: 'Shop DB', type: 'mysql', host: 'h', port: '3306', database: 'shop', username: 'u', password: 'pw', environment: 'production', readOnly: false };
    const saved = await run(`window.workbench.saveConnections(${JSON.stringify({ profiles: [profile], activeId: 'p1', lastQueries: {} })})`);
    check('connections save', saved.ok && saved.profiles[0].password !== 'pw');
    win.webContents.reload();
    await sleep(2500);

    await run(`void (window.__t = {
      buttons: () => [...document.querySelectorAll('button')],
      byText: t => [...document.querySelectorAll('button, [role=menuitem], [role=tab], li, [role=treeitem]')].filter(el => el.textContent.trim().toLowerCase().includes(t.toLowerCase())).sort((a, b) => a.textContent.length - b.textContent.length)[0],
      click: t => { const el = window.__t.byText(t); if (!el) return false; (el.getAttribute('role') === 'treeitem' ? el.querySelector('div') : el).click(); return true; },
      setEditor: v => { const ta = document.querySelector('textarea[aria-label="Query editor"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, v); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); ta.setSelectionRange(v.length, v.length); },
      editor: () => document.querySelector('textarea[aria-label="Query editor"]')?.value,
      text: () => document.body.innerText
    })`);
    const text = () => run('window.__t.text()');
    const lastQuery = () => received.filter(r => r.kind === 'query').pop();

    check('UI renders the saved connection and its environment', /production/.test(await text()));
    await run(`window.__t.click('Connect')`);
    await sleep(1500);
    check('connecting lists the objects', /users/.test(await text()) && /orders/.test(await text()));

    await run(`window.__t.click('users')`);
    await sleep(1500);
    check('opening a table loads its columns first', received.some(r => r.kind === 'describe' && r.object === 'users'));
    check('and browses page 1 with one extra row', lastQuery()?.text === 'SELECT * FROM `shop`.`users` LIMIT 101 OFFSET 0;', lastQuery()?.text);
    const page = await text();
    check('the page shows 100 rows and a page indicator', /Page 1/.test(page) && /user 100/.test(page) && !/user 101\b/.test(page));
    await run(`document.querySelector('button[aria-label="Next page"]')?.click()`);
    await sleep(800);
    check('next page asks for OFFSET 100', /OFFSET 100/.test(lastQuery()?.text || ''), lastQuery()?.text);

    await run(`window.__t.setEditor("select * from users;\\nselect 2;")`);
    await sleep(200);
    await run(`window.__t.click('Run')`);
    await sleep(800);
    check('Run sends only the statement at the cursor', lastQuery()?.text === 'select 2', lastQuery()?.text);
    const before = received.length;
    await run(`window.__t.buttons().find(b => b.textContent.trim() === 'Run all').click()`);
    await sleep(1200);
    check('Run all sends every statement', received.length - before === 2);
    check('a big result is capped with a Load more banner', /load up to/i.test(await text()));

    await run(`window.__t.setEditor("drop table users")`);
    await sleep(200);
    const sentBefore = received.length;
    await run(`window.__t.click('Run')`);
    await sleep(600);
    check('a DROP on production asks first and sends nothing yet', /run anyway/i.test(await text()) && received.length === sentBefore);
    await run(`window.__t.buttons().find(b => /run anyway/i.test(b.textContent))?.click()`);
    await sleep(700);
    check('confirming sends it', received.some(r => r.kind === 'query' && /drop table/i.test(r.text)));

    await run(`window.__t.setEditor("select sleep")`);
    await sleep(200);
    await run(`window.__t.click('Run')`);
    await sleep(600);
    await run(`window.__t.buttons().find(b => b.textContent.trim().toLowerCase() === 'stop')?.click()`);
    await sleep(800);
    check('Stop cancels the running query', received.some(r => r.kind === 'cancel') && /cancelled/i.test(await text()));

    await run(`window.__t.setEditor("select * from us")`);
    await sleep(500);
    check('autocomplete offers the table', /users/.test(await run(`[...document.querySelectorAll('[role=listbox] [role=option]')].map(o => o.textContent).join('|')`)));
    await run(`window.__t.setEditor("select a,b from t where x=1 and y=2")`);
    await run(`window.__t.buttons().find(b => /Tools/.test(b.textContent))?.click()`);
    await sleep(300);
    await run(`window.__t.click('Format SQL')`);
    await sleep(300);
    check('Format SQL rewrites the editor', (await run('window.__t.editor()')).startsWith('SELECT\n  a,\n  b\nFROM t'));

    await sleep(800);
    const stored = JSON.parse(safeStorage.decryptString(Buffer.from(fs.readFileSync(path.join(userData, 'connections.enc'), 'utf8'), 'base64')));
    check('open tabs and history are stored (encrypted)', stored.tabs?.p1?.tabs?.length >= 2 && stored.history?.p1?.length >= 3);
    win.webContents.reload();
    await sleep(2500);
    check('tabs come back after a restart', /users/.test(await run(`[...document.querySelectorAll('[role=tab]')].map(t => t.textContent).join('|')`)));

    check('no console errors or CSP violations', problems.length === 0, problems.join(' || '));
    check('the app wrote a log file', fs.existsSync(path.join(userData, 'logs', 'main.log')));
  } catch (error) {
    check('the run completed', false, error.stack || String(error));
  } finally {
    const failed = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failed} passed, ${failed} failed`);
    setTimeout(() => { app.exit(failed ? 1 : 0); }, 200);
  }
});
