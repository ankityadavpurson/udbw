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
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`);
};

// ---- a fake database ---------------------------------------------------------------------------------------------
const received = [];
const columns = ['id', 'name', 'note'];
const makeRows = n => Array.from({ length: n }, (_, i) => [String(i + 1), `user ${i + 1}`, i % 7 === 0 ? null : `note ${i + 1}`]);
const fake = {
  async connect() {
    return { type: 'mysql', client: {} };
  },
  async close() {},
  async query(_session, text, { maxRows } = {}) {
    received.push({ kind: 'query', text, maxRows });
    if (/sleep/i.test(text))
      await new Promise((resolve, reject) => {
        fake.interrupt = () => reject(new Error('Query execution was interrupted'));
        setTimeout(resolve, 5000);
      });
    const limit = /LIMIT (\d+)/i.exec(text);
    const all = makeRows(limit ? Number(limit[1]) : 5000);
    const truncated = all.length > maxRows;
    const rows = truncated ? all.slice(0, maxRows) : all;
    return { columns, rows, rowCount: rows.length, truncated, maxRows, message: `${rows.length} rows returned` };
  },
  async mutate(_session, op) {
    received.push({ kind: 'mutate', op });
    return { columns: [], rows: [], rowCount: 1, message: 'Updated 1 row(s)' };
  },
  async mutateBatch(_session, ops) {
    received.push({ kind: 'mutateBatch', ops });
    return { columns: [], rows: [], rowCount: ops.length, message: 'Updated 1 row(s) in one transaction' };
  },
  async cancel() {
    received.push({ kind: 'cancel' });
    fake.interrupt?.();
    return true;
  },
  async discover() {
    return {
      databases: ['shop'],
      schemas: ['shop'],
      message: '',
      objects: [
        { name: 'users', schema: 'shop', type: 'table' },
        { name: 'orders', schema: 'shop', type: 'table' }
      ]
    };
  },
  async describe(_session, object) {
    received.push({ kind: 'describe', object: object.name });
    return { columns, columnInfo: [], primaryKey: ['id'], indexes: [] };
  },
  async switchDatabase() {},
  isWrite: text => !/^\s*(select|show|describe|explain)/i.test(text)
};
// A second fake, for MongoDB: one collection with one document.
const doc = { _id: 'd1', name: 'Asha', age: 30, address: { city: 'Pune' }, tags: ['vip'] };
const fakeMongo = {
  async connect() {
    return { type: 'mongodb', client: {} };
  },
  async close() {},
  async query(_session, text) {
    received.push({ kind: 'mquery', text });
    return { json: [doc], columns: ['_id', 'document'], rows: [['d1', JSON.stringify(doc)]], rowCount: 1, message: '1 document' };
  },
  async mutate(_session, op) {
    received.push({ kind: 'mmutate', op });
    return { columns: [], rows: [], rowCount: 1, message: 'Updated 1 document' };
  },
  async cancel() {
    return true;
  },
  async discover() {
    return { databases: ['shop'], schemas: [], message: '', objects: [{ name: 'people', type: 'collection' }] };
  },
  async describe() {
    return { columns: [], columnInfo: [], primaryKey: ['_id'], indexes: [] };
  },
  async switchDatabase() {},
  isWrite: () => false
};
const mongoPath = require.resolve(path.join(root, 'src', 'main', 'connectors', 'mongodb.js'));
require.cache[mongoPath] = { id: mongoPath, filename: mongoPath, loaded: true, exports: fakeMongo };
const fakePath = require.resolve(path.join(root, 'src', 'main', 'connectors', 'mysql.js'));
require.cache[fakePath] = { id: fakePath, filename: fakePath, loaded: true, exports: fake };

app.whenReady().then(async () => {
  try {
    let win;
    for (let i = 0; i < 100 && !win; i++) {
      await sleep(100);
      win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html'));
    }
    if (!win) throw new Error('the main window never loaded (did you run `yarn build:ui`?)');
    const problems = [];
    win.webContents.on('console-message', (_event, level, message) => {
      // The page asks before unloading while a debounced save of the settings is still pending; a test that reloads
      // right after changing state can hit that window on a slow machine. It is not an error in the app.
      if (/beforeunload/.test(message)) return;
      if (level >= 2 || /Content Security|Uncaught/.test(message)) problems.push(message);
    });
    const run = code => win.webContents.executeJavaScript(code);
    await sleep(1500);

    // The page talks to the main process only through window.workbench, and secrets stay masked.
    const profile = {
      id: 'p1',
      name: 'Shop DB',
      type: 'mysql',
      host: 'h',
      port: '3306',
      database: 'shop',
      username: 'u',
      password: 'pw',
      environment: 'production',
      readOnly: false
    };
    const saved = await run(`window.workbench.saveConnections(${JSON.stringify({ profiles: [profile], activeId: 'p1', lastQueries: {} })})`);
    check('connections save', saved.ok && saved.profiles[0].password !== 'pw');
    win.webContents.reload();
    await sleep(2500);

    const helpers = `void (window.__t = {
      buttons: () => [...document.querySelectorAll('button')],
      byText: t => [...document.querySelectorAll('button, [role=menuitem], [role=tab], li, [role=treeitem]')].filter(el => el.textContent.trim().toLowerCase().includes(t.toLowerCase())).sort((a, b) => a.textContent.length - b.textContent.length)[0],
      click: t => { const el = window.__t.byText(t); if (!el) return false; (el.getAttribute('role') === 'treeitem' ? el.querySelector('div') : el).click(); return true; },
      setEditor: v => { const ta = document.querySelector('textarea[aria-label="Query editor"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, v); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); ta.setSelectionRange(v.length, v.length); },
      editor: () => document.querySelector('textarea[aria-label="Query editor"]')?.value,
      text: () => document.body.innerText
    })`;
    await run(helpers);
    const text = () => run('window.__t.text()');
    const lastQuery = () => received.filter(r => r.kind === 'query').pop();

    check('a run from source is marked [DEV] in the title bar', /\[DEV\]/.test(await text()));
    check('UI renders the saved connection and its environment', /production/.test(await text()));
    await run(`window.__t.click('Connect')`);
    await sleep(1500);
    check('connecting lists the objects', /users/.test(await text()) && /orders/.test(await text()));

    await run(`window.__t.click('users')`);
    await sleep(1500);
    check(
      'opening a table loads its columns first',
      received.some(r => r.kind === 'describe' && r.object === 'users')
    );
    check('and browses page 1 with one extra row', lastQuery()?.text === 'SELECT * FROM `shop`.`users` LIMIT 101 OFFSET 0;', lastQuery()?.text);
    const page = await text();
    check('the page shows 100 rows and a page indicator', /Page 1/.test(page) && /user 100/.test(page) && !/user 101\b/.test(page));
    // Inline editing: change a cell, see it pending, then apply it as one transaction.
    await run(`void (() => {
      const cell = [...document.querySelectorAll('td div[title*="F2"]')].find(el => el.textContent.trim() === 'user 2');
      cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    })()`);
    await sleep(300);
    await run(`void (() => {
      const input = document.querySelector('input[aria-label="Edit name"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'renamed');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    })()`);
    await sleep(300);
    check('an edited cell shows as a pending change', /1 pending change/.test(await text()) && /renamed/.test(await text()));
    await run(`window.__t.click('Apply changes')`);
    await sleep(1200);
    const batch = received.filter(r => r.kind === 'mutateBatch').pop();
    check(
      'Apply sends one batch with only the changed column',
      batch?.ops.length === 1 &&
        batch.ops[0].action === 'update' &&
        JSON.stringify(batch.ops[0].key) === '{"id":"2"}' &&
        JSON.stringify(batch.ops[0].changes) === '{"name":"renamed"}',
      JSON.stringify(batch)
    );
    check('the pending bar clears once the changes are saved', !/pending change/.test(await text()));
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
    check(
      'confirming sends it',
      received.some(r => r.kind === 'query' && /drop table/i.test(r.text))
    );

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

    // Document tree editor on a MongoDB collection.
    const mongo = {
      id: 'p2',
      name: 'Docs',
      type: 'mongodb',
      host: 'h',
      port: '27017',
      database: 'shop',
      username: 'u',
      password: 'pw',
      environment: 'development',
      readOnly: false
    };
    await run(
      `window.workbench.saveConnections(${JSON.stringify({ profiles: [{ ...profile, password: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' }, mongo], activeId: 'p2', lastQueries: {} })})`
    );
    await sleep(1200); // let the debounced save of the restored tabs finish, or the page asks before it unloads
    win.webContents.reload();
    await sleep(2500);
    await run(helpers);
    await run(`window.__t.click('Connect')`);
    await sleep(1500);
    await run(`window.__t.click('people')`);
    await sleep(1500);
    check('a collection opens as a document list', /1 document/.test(await text()) && /Asha/.test(await text()));
    await run(`document.querySelector('button[aria-label^="Edit d1"]')?.click()`);
    await sleep(400);
    check(
      'Edit opens the tree editor with typed fields',
      await run(`!!document.querySelector('[aria-label="Document fields"]') && !!document.querySelector('[aria-label="Value of age"]')`)
    );
    check('the identifier is locked', await run(`!document.querySelector('[aria-label="Value of _id"]') && !document.querySelector('[aria-label="Remove _id"]')`));
    await run(`void (() => {
      const input = document.querySelector('input[aria-label="Value of age"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '31');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(300);
    await run(`window.__t.buttons().find(b => /^Changes/.test(b.textContent.trim()))?.click()`);
    await sleep(300);
    const windowState = require(path.join(root, 'src', 'main', 'window.js'));
    check('an open document edit counts as unsaved, so closing would ask', windowState.hasUnsavedChanges());
    check('the Changes view lists the edit', /- age: 30/.test(await text()) && /\+ age: 31/.test(await text()));
    await run(`window.__t.buttons().find(b => b.textContent.trim() === 'Update')?.click()`);
    await sleep(1000);
    check('saving clears the unsaved state', !windowState.hasUnsavedChanges());
    const docUpdate = received.filter(r => r.kind === 'mmutate').pop();
    check(
      'Update sends only the changed field',
      docUpdate?.op.action === 'update' && JSON.stringify(docUpdate.op.changes) === '{"age":31}' && docUpdate.op.id === 'd1',
      JSON.stringify(docUpdate)
    );

    check('no console errors or CSP violations', problems.length === 0, problems.join(' || '));
    check('the app wrote a log file', fs.existsSync(path.join(userData, 'logs', 'main.log')));
  } catch (error) {
    check('the run completed', false, error.stack || String(error));
  } finally {
    const failed = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failed} passed, ${failed} failed`);
    setTimeout(() => {
      app.exit(failed ? 1 : 0);
    }, 200);
  }
});
