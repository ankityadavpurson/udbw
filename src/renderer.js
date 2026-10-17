const $ = (id) => document.getElementById(id);
const state = { connections: [], activeId: null, connected: new Set(), view: 'table', lastResult: null };
const dialog = $('connectionDialog');
const typeEl = $('connType');

const types = {
  mysql: { label: 'MySQL', icon: 'MY', mode: 'sql', defaultQuery: 'SELECT 1 AS connection_test;', help: 'SQL mode · MySQL queries execute on the selected database.' },
  postgres: { label: 'PostgreSQL', icon: 'PG', mode: 'sql', defaultQuery: 'SELECT 1 AS connection_test;', help: 'SQL mode · PostgreSQL queries execute on the selected database.' },
  mongodb: { label: 'MongoDB', icon: 'MO', mode: 'mongo', defaultQuery: 'collections', help: 'Mongo mode · Use "collections" or \'find collection_name {"status":"active"} LIMIT 100\'.' },
  supabase: { label: 'Supabase', icon: 'SB', mode: 'supabase', defaultQuery: 'SELECT current_database(), current_user;', help: 'SQL mode uses the PostgreSQL connection string. REST mode: REST: table_name LIMIT 100' },
  firestore: { label: 'Firebase Firestore', icon: 'FS', mode: 'firestore', defaultQuery: 'collections', help: 'Firestore mode · Use "collections" or "read collection_name LIMIT 100".' }
};

function addField(label, id, placeholder, opts = {}) {
  return `<label>${label}<input id="${id}" type="${opts.type || 'text'}" placeholder="${placeholder || ''}" ${opts.required ? 'required' : ''} ${opts.autocomplete ? `autocomplete="${opts.autocomplete}"` : ''}></label>`;
}
function renderFields() {
  const type = typeEl.value;
  let html = '';
  if (type === 'mysql' || type === 'postgres') {
    const port = type === 'mysql' ? '3306' : '5432';
    html = `<div class="field-grid">${addField('Host','host','db.example.com',{required:true})}${addField('Port','port',port,{required:true})}</div>
      <div class="field-grid">${addField('Database','database','database_name',{required:true})}${addField('Username','username','db_user',{required:true})}</div>
      ${addField('Password','password','Password',{type:'password'})}
      <label class="check-row"><input id="ssl" type="checkbox"> Use TLS/SSL (configure provider certificates separately if needed)</label>`;
  } else if (type === 'mongodb') {
    html = `${addField('MongoDB URI','uri','mongodb+srv://user:password@cluster.example.mongodb.net/',{required:true})}
      ${addField('Database (optional)','database','database_name')}
      <p class="field-note">Use a MongoDB connection string from your provider. URI credentials are held in memory for this session.</p>`;
  } else if (type === 'supabase') {
    html = `${addField('PostgreSQL connection string (recommended)','connectionString','postgresql://user:password@host:5432/postgres')}
      <p class="field-note">Find it in Supabase Dashboard → Project Settings → Database → Connection string. If using SQL, this is a PostgreSQL connection.</p>
      <div class="field-grid">${addField('Project URL (optional REST)','restUrl','https://your-project.supabase.co')}${addField('API key (optional REST)','apiKey','Publishable / anon key')}</div>
      <p class="field-note">If no connection string is entered, both REST fields are required. REST mode supports read-only table preview.</p>
      <label class="check-row"><input id="ssl" type="checkbox" checked> Use TLS/SSL for PostgreSQL</label>`;
  } else if (type === 'firestore') {
    html = `<label>Service-account JSON file<input id="serviceAccountPath" readonly placeholder="Choose a JSON key file" required><button type="button" id="pickServiceAccountBtn">Choose file…</button></label>
      ${addField('Firebase project ID (optional)','projectId','my-firebase-project')}
      <div class="danger-note">Firestore Admin SDK credentials bypass Firestore Security Rules. Use a dedicated, least-privilege service account and never share its JSON key.</div>`;
  }
  $('dynamicFields').innerHTML = html;
  const pick = $('pickServiceAccountBtn');
  if (pick) pick.addEventListener('click', async () => {
    const p = await window.workbench.pickServiceAccount();
    if (p) $('serviceAccountPath').value = p;
  });
}

function openDialog() {
  $('formError').textContent = '';
  $('connectionForm').reset();
  renderFields();
  dialog.showModal();
  $('connName').focus();
}
$('newConnectionBtn').addEventListener('click', openDialog);
$('sideAddBtn').addEventListener('click', openDialog);
$('closeDialogBtn').addEventListener('click', () => dialog.close());
$('cancelDialogBtn').addEventListener('click', () => dialog.close());
typeEl.addEventListener('change', renderFields);

$('connectionForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const type = typeEl.value;
  const profile = { id: crypto.randomUUID(), name: $('connName').value.trim(), type };
  const ids = ['host','port','database','username','password','uri','connectionString','restUrl','apiKey','projectId','serviceAccountPath'];
  ids.forEach(id => { const el = $(id); if (el) profile[id] = el.value.trim(); });
  const ssl = $('ssl');
  if (ssl) profile.ssl = ssl.checked;
  if (type === 'supabase' && !profile.connectionString && !(profile.restUrl && profile.apiKey)) {
    $('formError').textContent = 'Enter a PostgreSQL connection string or both the Project URL and API key.';
    return;
  }
  if (type === 'firestore' && !profile.serviceAccountPath) {
    $('formError').textContent = 'Choose a service-account JSON file.';
    return;
  }
  state.connections.push(profile);
  state.activeId = profile.id;
  dialog.close();
  renderConnections();
  setActiveConnection();
  setStatus('Connection profile added. Select Connect to test credentials.');
});

function activeProfile() { return state.connections.find(c => c.id === state.activeId); }
function renderConnections() {
  const list = $('connectionsList');
  if (!state.connections.length) {
    list.innerHTML = '<div class="empty-side">Add a connection to get started.</div>';
    return;
  }
  list.innerHTML = state.connections.map(c => {
    const t = types[c.type];
    return `<button class="connection-item ${c.id === state.activeId ? 'selected' : ''}" data-id="${c.id}">
      <span class="db-icon">${t.icon}</span><span class="connection-text"><strong>${escapeHtml(c.name)}</strong><small>${t.label}</small></span>
      <span class="state-dot ${state.connected.has(c.id) ? 'connected' : ''}"></span>
    </button>`;
  }).join('');
  list.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => {
    state.activeId = btn.dataset.id;
    renderConnections();
    setActiveConnection();
  }));
}
function setActiveConnection() {
  const p = activeProfile();
  if (!p) return;
  const t = types[p.type];
  $('activeConnectionName').textContent = p.name;
  $('globalStatus').textContent = state.connected.has(p.id) ? 'Connected' : 'Profile selected';
  $('connectBtn').disabled = state.connected.has(p.id);
  $('disconnectBtn').disabled = !state.connected.has(p.id);
  $('runBtn').disabled = !state.connected.has(p.id);
  $('queryEditor').value = t.defaultQuery;
  $('editorMode').textContent = `${t.label.toUpperCase()} · QUERY`;
  $('editorHelp').textContent = t.help;
  $('tabbar').querySelector('.tab-hint').textContent = `${t.label} · ${state.connected.has(p.id) ? 'connected' : 'not connected'}`;
  setStatus(`Selected ${p.name}`);
}
function setStatus(s) { $('statusMessage').textContent = s; }

$('connectBtn').addEventListener('click', async () => {
  const p = activeProfile(); if (!p) return;
  $('connectBtn').disabled = true; setStatus(`Connecting to ${p.name}…`);
  const result = await window.workbench.connect({ id: p.id, profile: p });
  if (result.ok) {
    state.connected.add(p.id);
    renderConnections(); setActiveConnection();
    setStatus(`Connected to ${p.name}`);
  } else {
    $('connectBtn').disabled = false;
    setStatus(`Connection failed: ${result.error.message}`);
    showError(result.error);
  }
});
$('disconnectBtn').addEventListener('click', async () => {
  const p = activeProfile(); if (!p) return;
  const result = await window.workbench.disconnect({ id: p.id });
  state.connected.delete(p.id); renderConnections(); setActiveConnection();
  setStatus(result.ok ? `Disconnected from ${p.name}` : `Disconnect failed`);
});
$('runBtn').addEventListener('click', runQuery);
$('queryEditor').addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); }
});
async function runQuery() {
  const p = activeProfile(); if (!p || !state.connected.has(p.id)) return;
  const query = $('queryEditor').value.trim();
  if (!query) return;
  $('runBtn').disabled = true; setStatus('Executing…');
  const started = performance.now();
  const result = await window.workbench.query({ id: p.id, query });
  $('runBtn').disabled = false;
  if (!result.ok) {
    showError(result.error);
    $('resultMeta').textContent = 'Query failed';
    setStatus(`Error: ${result.error.message}`);
    state.lastResult = null; $('exportBtn').disabled = true;
    return;
  }
  state.lastResult = result.result;
  state.lastResult.elapsedMs = Math.round(performance.now() - started);
  $('resultMeta').textContent = `${result.result.message || 'Completed'} · ${state.lastResult.elapsedMs} ms`;
  $('exportBtn').disabled = false;
  renderResult();
  setStatus('Query completed');
}
function showError(err) {
  $('resultContent').innerHTML = `<div class="error-view">${escapeHtml(err.message || 'Unknown error')}${err.code ? `\n\nCode: ${escapeHtml(err.code)}` : ''}</div>`;
}
function renderResult() {
  const r = state.lastResult;
  if (!r) return;
  if (state.view === 'json') {
    $('resultContent').innerHTML = `<pre class="json-view">${escapeHtml(JSON.stringify(r.json ?? {columns:r.columns,rows:r.rows,message:r.message}, null, 2))}</pre>`;
    return;
  }
  const cols = r.columns || [];
  const rows = r.rows || [];
  if (!cols.length) {
    $('resultContent').innerHTML = `<div class="welcome"><h2>${escapeHtml(r.message || 'Command completed')}</h2><p>No tabular rows returned.</p></div>`;
    return;
  }
  $('resultContent').innerHTML = `<table class="result-table"><thead><tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${cols.map((_,i) => `<td title="${escapeHtml(row[i] ?? '')}">${escapeHtml(row[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
$('viewTableBtn').addEventListener('click', () => { state.view = 'table'; $('viewTableBtn').classList.add('active'); $('viewJsonBtn').classList.remove('active'); renderResult(); });
$('viewJsonBtn').addEventListener('click', () => { state.view = 'json'; $('viewJsonBtn').classList.add('active'); $('viewTableBtn').classList.remove('active'); renderResult(); });
$('exportBtn').addEventListener('click', () => {
  if (!state.lastResult) return;
  const blob = new Blob([JSON.stringify(state.lastResult.json ?? state.lastResult, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = 'query-results.json'; a.click(); URL.revokeObjectURL(url);
});
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
renderFields();
