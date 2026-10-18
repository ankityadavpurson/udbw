import { SQL_KEYWORDS } from './tokenize.js';

const COMMAND_WORDS = [
  'find',
  'count',
  'aggregate',
  'distinct',
  'insert',
  'update',
  'delete',
  'create',
  'read',
  'collections',
  'WHERE',
  'AND',
  'ORDER BY',
  'SORT',
  'PROJECT',
  'SKIP',
  'LIMIT',
  'OFFSET'
];
const SQL_WORDS = [...SQL_KEYWORDS].map(word => word.toUpperCase()).sort();
const MAX_ITEMS = 12;

// The word being typed, and the `name.` in front of it (a table, alias or schema) when there is one.
export function completionContext(text, caret) {
  const before = text.slice(0, caret);
  const prefix = /[A-Za-z_][\w$]*$/.exec(before)?.[0] ?? '';
  const start = caret - prefix.length;
  const qualifier = /([A-Za-z_][\w$]*)\.$/.exec(before.slice(0, start))?.[1] ?? null;
  return { prefix, start, qualifier };
}

// alias -> table name, from `FROM users u`, `JOIN orders AS o`, `UPDATE t x` …
function aliasMap(text) {
  const map = {};
  for (const match of text.matchAll(/\b(?:from|join|update|into)\s+([\w."`]+)(?:\s+(?:as\s+)?([A-Za-z_]\w*))?/gi)) {
    const table = match[1].replace(/[`"]/g, '').split('.').pop();
    if (match[2] && !SQL_KEYWORDS.has(match[2].toLowerCase())) map[match[2].toLowerCase()] = table;
  }
  return map;
}

const startsWith = (label, prefix) => label.toLowerCase().startsWith(prefix.toLowerCase());

// Suggestions for the caret position. `objects` are the sidebar's tables / views / collections (columns are known
// for the ones that were opened). Returns { start, items, needColumnsFor } where `needColumnsFor` is an object whose
// columns should be loaded before suggesting again.
export function suggest({ text, caret, language, objects = [], force = false }) {
  const { prefix, start, qualifier } = completionContext(text, caret);
  const tables = objects.filter(o => o.type === 'table' || o.type === 'view' || o.type === 'collection');

  if (qualifier && language !== 'command') {
    const target = aliasMap(text)[qualifier.toLowerCase()] || qualifier;
    const object = tables.find(o => o.name.toLowerCase() === target.toLowerCase());
    if (object) {
      if (!object.columns) return { start, items: [], needColumnsFor: object };
      const items = object.columns
        .filter(c => startsWith(c, prefix))
        .slice(0, MAX_ITEMS * 3)
        .map(label => ({ label, kind: 'column', detail: object.name }));
      return { start, items };
    }
    const inSchema = tables.filter(o => (o.schema || '').toLowerCase() === qualifier.toLowerCase() && startsWith(o.name, prefix));
    return { start, items: inSchema.slice(0, MAX_ITEMS * 3).map(o => ({ label: o.name, kind: 'table', detail: o.type })) };
  }
  if (prefix.length < 2 && !force) return { start, items: [] };

  const items = [];
  const seen = new Set();
  const add = item => {
    const key = `${item.kind}:${item.label}`;
    if (!seen.has(key)) {
      seen.add(key);
      items.push(item);
    }
  };
  for (const o of tables) if (startsWith(o.name, prefix)) add({ label: o.name, kind: 'table', detail: o.schema || o.type });
  if (language !== 'command') for (const o of tables) for (const c of o.columns || []) if (startsWith(c, prefix)) add({ label: c, kind: 'column', detail: o.name });
  for (const word of language === 'command' ? COMMAND_WORDS : SQL_WORDS) if (startsWith(word, prefix)) add({ label: word, kind: 'keyword', detail: '' });
  const exactOnly = items.length === 1 && items[0].label === prefix;
  return { start, items: exactOnly ? [] : items.slice(0, MAX_ITEMS) };
}
