// Turns what describe() reports about a table into what the Structure dialog shows.

// MySQL reports `columns` and `unique`; PostgreSQL only an index definition ("CREATE UNIQUE INDEX … USING btree (a, b)").
export function indexInfo(index, primaryKey = []) {
  const definition = index.definition || '';
  const columns = index.columns?.length
    ? index.columns
    : (/\(([^)]*)\)/.exec(definition)?.[1] || '')
        .split(',')
        .map(part =>
          part
            .trim()
            .split(/\s+/)[0]
            .replace(/^"(.*)"$/, '$1')
        )
        .filter(Boolean);
  const unique = index.unique ?? /\bUNIQUE\b/i.test(definition);
  const primary = index.name === 'PRIMARY' || (/_pkey$/.test(index.name) && primaryKey.length > 0 && columns.join() === primaryKey.join());
  const method = /USING\s+(\w+)/i.exec(definition)?.[1] || '';
  return { name: index.name, columns, unique: unique || primary, primary, method, definition };
}

// For every column: is it part of the primary key, of a unique index, of another index; and which indexes.
export function columnMarks(columnInfo, primaryKey, indexes) {
  const infos = indexes.map(index => indexInfo(index, primaryKey));
  return Object.fromEntries(
    columnInfo.map(column => {
      const inKey = primaryKey.includes(column.name);
      const using = infos.filter(index => index.columns.includes(column.name) && !index.primary);
      return [column.name, { pk: inKey, unique: using.some(index => index.unique), indexed: using.some(index => !index.unique), indexes: using.map(index => index.name) }];
    })
  );
}

// "int(11) unsigned" -> { base: 'int', detail: '(11) unsigned' } so the type name stands out.
export function splitType(type = '') {
  const text = type.trim();
  const paren = text.indexOf('(');
  if (paren > 0) return { base: text.slice(0, paren).trim(), detail: text.slice(paren).trim() };
  const modifier = /^(.+?)\s+((?:unsigned|signed|zerofill)\b.*)$/i.exec(text);
  return modifier ? { base: modifier[1], detail: modifier[2] } : { base: text, detail: '' };
}
