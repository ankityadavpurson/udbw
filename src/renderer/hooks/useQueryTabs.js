import { useEffect, useRef, useState } from 'react';
import { engines, blankTab } from '../constants.js';
import { autoView } from '../lib/results.js';
import { buildBrowseQuery } from '../lib/browse.js';

// The main process re-opens a dropped connection on the next request; `unreachable` means that failed (or there was none).
const connectionGone = error => Boolean(error?.unreachable) || /not connected/i.test(error?.message || '');

// Query tabs (one set per connection) and the query runner. Results always land in the tab that started the query.
export default function useQueryTabs({ activeId, active, isConnected, loaded, lastQueries, savedTabs, setBusy, setStatus, onConnectionLost }) {
  const tabCounter = useRef({});
  const makeTab = (connId, queryText, extra = {}) => ({
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    connId,
    title: extra.title ?? `Query ${(tabCounter.current[connId] = (tabCounter.current[connId] || 0) + 1)}`,
    query: queryText,
    result: null,
    error: '',
    meta: 'No query executed',
    view: 'table',
    viewPinned: false,
    running: false,
    selected: [],
    selectedObject: null,
    browse: null,
    hasNext: false,
    ...extra
  });
  const [initialTab] = useState(() => makeTab(null, engines.mysql.query));
  const [tabs, setTabs] = useState([initialTab]);
  const [activeTabId, setActiveTabId] = useState(initialTab.id);

  const connTabs = tabs.filter(t => t.connId === activeId);
  const tab = connTabs.find(t => t.id === activeTabId) ?? connTabs[0] ?? blankTab;
  const patchTab = (patch, id = tab.id) => setTabs(all => all.map(t => (t.id === id ? { ...t, ...patch } : t)));
  const setQuery = value => patchTab({ query: value });
  const setError = (value, meta) => patchTab(meta ? { error: value, meta, result: null } : { error: value });
  // A manual choice sticks to the tab; until then the view follows the shape of each result.
  const setView = value => patchTab({ view: value, viewPinned: true });
  const setSelected = value => patchTab({ selected: value });

  // Every connection always has at least one tab.
  useEffect(() => {
    if (!loaded) return;
    const mine = tabs.filter(t => t.connId === activeId);
    if (!mine.length) {
      const saved = activeId && savedTabs?.[activeId];
      if (saved?.tabs?.length) {
        // Reopen the tabs of the last session (queries and opened tables; results are not kept).
        const restored = saved.tabs.map(t => makeTab(activeId, t.query ?? '', { title: t.title, selectedObject: t.selectedObject ?? null, browse: t.browse ?? null }));
        const highest = Math.max(0, ...saved.tabs.map(t => Number(/^Query (\d+)$/.exec(t.title || '')?.[1] || 0)));
        tabCounter.current[activeId] = Math.max(tabCounter.current[activeId] || 0, highest);
        setTabs(all => [...all, ...restored]);
        setActiveTabId(restored[Math.min(saved.active || 0, restored.length - 1)].id);
        return;
      }
      const fresh = makeTab(activeId, (active && (lastQueries[activeId] || engines[active.type].query)) || engines.mysql.query);
      setTabs(all => [...all, fresh]);
      setActiveTabId(fresh.id);
    } else if (!mine.some(t => t.id === activeTabId)) setActiveTabId(mine[0].id);
  }, [tabs, activeId, activeTabId, loaded]);

  function addTab(extra = {}, queryText) {
    if (!activeId || !active) return null;
    const fresh = makeTab(activeId, queryText ?? engines[active.type].query, extra);
    setTabs(all => [...all, fresh]);
    setActiveTabId(fresh.id);
    return fresh;
  }

  function closeTab(id) {
    const mine = tabs.filter(t => t.connId === activeId);
    if (mine.length <= 1) {
      tabCounter.current[activeId] = 1;
      patchTab(
        {
          title: 'Query 1',
          query: active ? engines[active.type].query : '',
          result: null,
          error: '',
          meta: 'No query executed',
          selected: [],
          selectedObject: null,
          browse: null,
          hasNext: false
        },
        id
      );
      return;
    }
    const index = mine.findIndex(t => t.id === id);
    setTabs(all => all.filter(t => t.id !== id));
    if (id === tab.id) setActiveTabId((mine[index + 1] ?? mine[index - 1]).id);
  }

  const removeConnectionTabs = connId => setTabs(all => all.filter(t => t.connId !== connId));
  const resetConnectionTabs = (connId, type) =>
    setTabs(all => all.map(t => (t.connId === connId ? { ...t, query: engines[type].query, result: null, error: '', selected: [], browse: null, hasNext: false } : t)));

  // Runs one request against the tab's connection and shows its outcome in that tab. `statement` is the text that was
  // sent (used to recognise a browse query); `prefix` labels errors of one statement inside a script.
  async function runCall(call, tabId, { statement, prefix = '', suffix = '', record } = {}) {
    if (!active || !isConnected) return false;
    const patch = changes => patchTab(changes, tabId);
    setBusy(true);
    setStatus('Executing…');
    patch({ error: '', running: true });
    const started = performance.now();
    const res = await call();
    setBusy(false);
    if (!res.ok) {
      const message = res.error.message || 'Unknown error';
      const note = res.error.lost ? '\n\nThe connection dropped. It will reconnect the next time you run something.' : '';
      const head = prefix ? `${prefix}\n\n` : '';
      const code = res.error.code ? `\n\nCode: ${res.error.code}` : '';
      patch({ error: `${head}${message}${code}${note}`, meta: res.error.cancelled ? 'Cancelled' : 'Query failed', result: null, running: false });
      setStatus(res.error.cancelled ? 'Query cancelled' : `Error: ${message}`);
      record?.({ ok: false, error: message, ms: Math.round(performance.now() - started) });
      if (connectionGone(res.error)) onConnectionLost(active.id);
      return false;
    }
    const data = { ...res.result, elapsedMs: Math.round(performance.now() - started) };
    setTabs(all =>
      all.map(t => {
        if (t.id !== tabId) return t;
        // A browse query asks for one row more than a page; the extra row only says "there is a next page".
        const browse = t.browse && statement && statement === t.browse.generated ? t.browse : null;
        let shown = data;
        let hasNext = false;
        if (browse && data.rows?.length > browse.pageSize) {
          hasNext = true;
          shown = { ...data, rows: data.rows.slice(0, browse.pageSize), json: data.json?.slice(0, browse.pageSize), rowCount: browse.pageSize };
        }
        return {
          ...t,
          result: shown,
          hasNext,
          meta: `${data.message || 'Completed'} · ${data.elapsedMs} ms${suffix}`,
          selected: [],
          running: false,
          view: t.viewPinned ? t.view : autoView(shown)
        };
      })
    );
    record?.({ ok: true, ms: data.elapsedMs, rows: data.rowCount ?? data.rows?.length ?? 0 });
    setStatus('Query completed');
    return true;
  }

  // `maxRows` raises the row cap (Load more); without it the default cap applies.
  function runQuery(statement = tab.query, tabId = tab.id, options = {}) {
    if (!active || !statement.trim()) return Promise.resolve(false);
    const text = statement.trim();
    return runCall(() => window.workbench.query({ id: active.id, query: text, maxRows: options.maxRows }), tabId, { statement, ...options });
  }

  // Runs several statements one after the other, stopping at the first failure; the tab ends up showing the last result.
  // `record({ ok, ms, rows, error }, statementText)` is told how each statement went (used for the query history).
  async function runScript(statements, tabId = tab.id, { record } = {}) {
    const total = statements.length;
    for (let i = 0; i < total; i += 1) {
      if (total > 1) setStatus(`Running statement ${i + 1} of ${total}…`);
      const ok = await runQuery(statements[i], tabId, {
        ...(total > 1 ? { prefix: `Statement ${i + 1} of ${total} failed:`, suffix: ` · statement ${i + 1} of ${total}` } : {}),
        record: info => record?.(info, statements[i])
      });
      if (!ok) return false;
    }
    if (total > 1) setStatus(`Ran ${total} statements`);
    return true;
  }

  // Structured insert / update / delete (see lib/statements.js); the caller refreshes the results afterwards.
  function runMutation(op, tabId = tab.id) {
    if (!active) return Promise.resolve(false);
    return runCall(() => window.workbench.mutate({ id: active.id, op }), tabId);
  }

  // Stops the statement that is running on the active connection.
  async function cancelQuery() {
    if (!active) return;
    setStatus('Cancelling…');
    const res = await window.workbench.cancel({ id: active.id });
    if (!res.ok) setStatus(`Could not cancel: ${res.error?.message || 'unknown error'}`);
    else if (!res.cancelled) setStatus('This database cannot cancel a running query.');
  }

  // Changes the page / sort / filter of a browse tab and runs the new query.
  function browseTo(patchState, tabId = tab.id) {
    const target = tabs.find(t => t.id === tabId);
    if (!target?.browse || !active || !target.selectedObject) return Promise.resolve(false);
    const { generated, ...current } = target.browse;
    const state = { ...current, ...patchState };
    const query = buildBrowseQuery(active, target.selectedObject, state);
    patchTab({ query, browse: { ...state, generated: query }, selected: [] }, tabId);
    return runQuery(query, tabId);
  }

  return {
    tab,
    tabs,
    connTabs,
    setActiveTabId,
    patchTab,
    setQuery,
    setError,
    setView,
    setSelected,
    addTab,
    closeTab,
    removeConnectionTabs,
    resetConnectionTabs,
    runQuery,
    runScript,
    runMutation,
    cancelQuery,
    browseTo
  };
}
