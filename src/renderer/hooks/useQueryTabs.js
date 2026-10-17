import { useEffect, useRef, useState } from 'react';
import { engines, blankTab } from '../constants.js';
import { autoView } from '../lib/results.js';

const CONNECTION_LOST = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|57P01|08006|08001|14 UNAVAILABLE|4 DEADLINE_EXCEEDED|connection terminated|not connected|server closed the connection/i;

// Query tabs (one set per connection) and the query runner. Results always land in the tab that started the query.
export default function useQueryTabs({ activeId, active, isConnected, loaded, lastQueries, setBusy, setStatus, onConnectionLost }) {
  const tabCounter = useRef({});
  const makeTab = (connId, queryText, extra = {}) => ({
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, connId,
    title: extra.title ?? `Query ${(tabCounter.current[connId] = (tabCounter.current[connId] || 0) + 1)}`,
    query: queryText, result: null, error: '', meta: 'No query executed', view: 'table', viewPinned: false, running: false, selected: [], selectedObject: null, ...extra
  });
  const [initialTab] = useState(() => makeTab(null, engines.mysql.query));
  const [tabs, setTabs] = useState([initialTab]);
  const [activeTabId, setActiveTabId] = useState(initialTab.id);

  const connTabs = tabs.filter(t => t.connId === activeId);
  const tab = connTabs.find(t => t.id === activeTabId) ?? connTabs[0] ?? blankTab;
  const patchTab = (patch, id = tab.id) => setTabs(all => all.map(t => t.id === id ? { ...t, ...patch } : t));
  const setQuery = value => patchTab({ query: value });
  const setError = value => patchTab({ error: value });
  // A manual choice sticks to the tab; until then the view follows the shape of each result.
  const setView = value => patchTab({ view: value, viewPinned: true });
  const setSelected = value => patchTab({ selected: value });

  // Every connection always has at least one tab.
  useEffect(() => {
    if (!loaded) return;
    const mine = tabs.filter(t => t.connId === activeId);
    if (!mine.length) {
      const fresh = makeTab(activeId, (active && (lastQueries[activeId] || engines[active.type].query)) || engines.mysql.query);
      setTabs(all => [...all, fresh]); setActiveTabId(fresh.id);
    } else if (!mine.some(t => t.id === activeTabId)) setActiveTabId(mine[0].id);
  }, [tabs, activeId, activeTabId, loaded]);

  function addTab(extra = {}, queryText) {
    if (!activeId || !active) return null;
    const fresh = makeTab(activeId, queryText ?? engines[active.type].query, extra);
    setTabs(all => [...all, fresh]); setActiveTabId(fresh.id);
    return fresh;
  }

  function closeTab(id) {
    const mine = tabs.filter(t => t.connId === activeId);
    if (mine.length <= 1) { patchTab({ query: active ? engines[active.type].query : '', result: null, error: '', meta: 'No query executed', selected: [], selectedObject: null }, id); return; }
    const index = mine.findIndex(t => t.id === id);
    setTabs(all => all.filter(t => t.id !== id));
    if (id === tab.id) setActiveTabId((mine[index + 1] ?? mine[index - 1]).id);
  }

  const removeConnectionTabs = connId => setTabs(all => all.filter(t => t.connId !== connId));
  const resetConnectionTabs = (connId, type) => setTabs(all => all.map(t => t.connId === connId ? { ...t, query: engines[type].query, result: null, error: '', selected: [] } : t));

  async function runQuery(statement = tab.query, tabId = tab.id) {
    if (!active || !isConnected || !statement.trim()) return false;
    const patch = changes => patchTab(changes, tabId);
    setBusy(true); setStatus('Executing…'); patch({ error: '', running: true }); const started = performance.now();
    const res = await window.workbench.query({ id: active.id, query: statement.trim() }); setBusy(false);
    if (!res.ok) {
      const message = res.error.message || 'Unknown error';
      patch({ error: `${message}${res.error.code ? `\n\nCode: ${res.error.code}` : ''}`, meta: 'Query failed', result: null, running: false }); setStatus(`Error: ${message}`);
      if (CONNECTION_LOST.test(`${res.error.code || ''} ${message}`)) onConnectionLost(active.id);
      return false;
    }
    const data = { ...res.result, elapsedMs: Math.round(performance.now() - started) };
    setTabs(all => all.map(t => t.id === tabId ? { ...t, result: data, meta: `${data.message || 'Completed'} · ${data.elapsedMs} ms`, selected: [], running: false, view: t.viewPinned ? t.view : autoView(data) } : t));
    setStatus('Query completed');
    return true;
  }

  return {
    tab, connTabs, setActiveTabId, patchTab, setQuery, setError, setView, setSelected,
    addTab, closeTab, removeConnectionTabs, resetConnectionTabs, runQuery
  };
}
