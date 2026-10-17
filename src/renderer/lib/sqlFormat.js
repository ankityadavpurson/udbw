// A small SQL formatter: keywords in capitals, one clause per line, one select item per line, AND / OR indented under
// WHERE, subqueries indented. It does not change what a statement means; comments and quoted text are kept as typed.

// Only structural keywords are capitalised, so a column that happens to be called `key` or `name` is left alone.
const UPPER = new Set(`select from where and or not null insert into values update set delete create table alter drop join left right inner outer
full cross natural on group by order having limit offset as distinct union all intersect except in is like ilike between exists case when then else end
asc desc with returning default true false using over partition fetch next rows only`.split(/\s+/));
const CLAUSES = new Set(['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT', 'VALUES', 'SET', 'RETURNING', 'INSERT INTO', 'UPDATE', 'DELETE FROM']);
const TABLE_WORDS = new Set(['INSERT INTO', 'INTO', 'TABLE', 'FROM', 'JOIN', 'UPDATE', 'AS', 'ON', 'IN', 'EXISTS']);
const JOIN_PREFIX = new Set(['NATURAL', 'LEFT', 'RIGHT', 'FULL', 'INNER', 'CROSS', 'OUTER']);

function lex(sql, dialect) {
  const tokens = [];
  let i = 0;
  const push = (type, text) => tokens.push({ type, text });
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (/\s/.test(ch)) { while (/\s/.test(sql[i] || '')) i++; continue; }
    if ((ch === '-' && next === '-') || (dialect === 'mysql' && ch === '#')) {
      let end = sql.indexOf('\n', i); if (end === -1) end = sql.length;
      push('line', sql.slice(i, end).trimEnd()); i = end; continue;
    }
    if (ch === '/' && next === '*') {
      let end = sql.indexOf('*/', i + 2); end = end === -1 ? sql.length : end + 2;
      push('block', sql.slice(i, end)); i = end; continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '\\' && dialect === 'mysql' && ch !== '`') { j += 2; continue; }
        if (sql[j] === ch) { if (sql[j + 1] === ch) { j += 2; continue; } break; }
        j++;
      }
      push(ch === "'" ? 'string' : 'ident', sql.slice(i, j + 1)); i = j + 1; continue;
    }
    if (ch === '$' && dialect !== 'mysql') {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (tag) {
        let end = sql.indexOf(tag[0], i + tag[0].length); end = end === -1 ? sql.length : end + tag[0].length;
        push('string', sql.slice(i, end)); i = end; continue;
      }
    }
    const word = /^[A-Za-z_][\w$]*/.exec(sql.slice(i));
    if (word) { push('word', word[0]); i += word[0].length; continue; }
    const number = /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(sql.slice(i));
    if (number) { push('number', number[0]); i += number[0].length; continue; }
    if ('(),;.'.includes(ch)) { push('punct', ch); i++; continue; }
    const op = /^(?:::|->>|->|#>>|#>|<=>|<>|<=|>=|!=|\|\||[<>=!+\-*/%&|^~@#:?]+)/.exec(sql.slice(i));
    const text = op ? op[0] : ch;
    push('op', text); i += text.length;
  }
  return tokens;
}

// Merges words that form one keyword ("GROUP BY", "LEFT OUTER JOIN", "UNION ALL", ...).
function merge(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const up = t.type === 'word' ? t.text.toUpperCase() : '';
    const peek = k => (tokens[i + k]?.type === 'word' ? tokens[i + k].text.toUpperCase() : '');
    let parts = null;
    if ((up === 'GROUP' || up === 'ORDER') && peek(1) === 'BY') parts = 2;
    else if (up === 'INSERT' && peek(1) === 'INTO') parts = 2;
    else if (up === 'DELETE' && peek(1) === 'FROM') parts = 2;
    else if (up === 'UNION' && peek(1) === 'ALL') parts = 2;
    else if (JOIN_PREFIX.has(up) || up === 'JOIN') {
      let k = 0;
      while (JOIN_PREFIX.has(peek(k))) k++;
      if (peek(k) === 'JOIN') parts = k + 1;
    }
    if (parts) { out.push({ type: 'kw', text: tokens.slice(i, i + parts).map(x => x.text.toUpperCase()).join(' ') }); i += parts - 1; }
    else out.push(t.type === 'word' && UPPER.has(t.text.toLowerCase()) ? { type: 'kw', text: t.text.toUpperCase() } : t);
  }
  return out;
}

export function formatSql(sql, dialect = 'postgres') {
  const tokens = merge(lex(sql, dialect));
  const stack = [{ indent: 0, clause: '', multi: false }];
  let lines = [];
  let line = '';
  let prev = null;
  let prev2 = null;
  let between = false;
  const top = () => stack[stack.length - 1];
  const breakLine = indent => { if (line.trim()) lines.push(line.trimEnd()); line = '  '.repeat(Math.max(0, indent)); prev2 = prev; prev = null; };
  const atLineStart = () => !line.trim();
  const space = t => {
    if (!prev || atLineStart()) return false;
    if (t.text === ')' || t.text === ',' || t.text === ';' || t.text === '.') return false;
    if (prev.text === '(' || prev.text === '.' || t.text === '::' || prev.text === '::') return false;
    if (t.text === '(') {
      // f(x) hugs its name; `IN (…)`, `VALUES (…)` and `INTO t (…)` keep a space
      if (prev.type === 'kw' || prev.type === 'op' || prev.text === ',') return true;
      if (prev.type === 'word' || prev.type === 'ident') return Boolean(prev2 && prev2.type === 'kw' && TABLE_WORDS.has(prev2.text));
      return true;
    }
    return true;
  };
  const emit = t => {
    if (space(t)) line += ' ';
    line += t.text;
    prev2 = prev; prev = t;
  };
  // Does the select list that starts after index `from` contain a top-level comma?
  const multiItem = from => {
    let depth = 0;
    for (let k = from; k < tokens.length; k++) {
      const t = tokens[k];
      if (t.text === '(') depth++;
      else if (t.text === ')') { if (depth === 0) return false; depth--; }
      else if (depth === 0 && (t.text === ',')) return true;
      else if (depth === 0 && (t.text === ';' || (t.type === 'kw' && ['FROM', 'WHERE', 'UNION', 'UNION ALL'].includes(t.text)))) return false;
    }
    return false;
  };

  tokens.forEach((t, index) => {
    const ctx = top();
    if (t.type === 'line') { if (line.trim()) { line += ` ${t.text}`; } else line += t.text; breakLine(ctx.indent); return; }
    if (t.type === 'kw' && CLAUSES.has(t.text)) {
      breakLine(ctx.indent);
      ctx.clause = t.text; between = false;
      emit(t);
      if (t.text === 'SELECT') { ctx.multi = multiItem(index + 1); if (ctx.multi) breakLine(ctx.indent + 1); }
      if (t.text === 'SET') { ctx.multi = true; breakLine(ctx.indent + 1); }
      return;
    }
    if (t.type === 'kw' && (t.text.endsWith('JOIN'))) { breakLine(ctx.indent); emit(t); return; }
    if (t.type === 'kw' && t.text === 'BETWEEN') between = true;
    if (t.type === 'kw' && (t.text === 'AND' || t.text === 'OR')) {
      if (t.text === 'AND' && between) between = false;
      else if (ctx.clause === 'WHERE' || ctx.clause === 'HAVING') { breakLine(ctx.indent + 1); emit(t); return; }
    }
    if (t.text === ',' && t.type === 'punct' && ctx.multi && (ctx.clause === 'SELECT' || ctx.clause === 'SET')) { emit(t); breakLine(ctx.indent + 1); return; }
    if (t.text === '(') {
      const subquery = tokens[index + 1]?.type === 'kw' && tokens[index + 1].text === 'SELECT';
      emit(t);
      stack.push({ indent: ctx.indent + (subquery ? 1 : 0), clause: '', multi: false, sub: subquery });
      if (subquery) breakLine(ctx.indent + 1);
      return;
    }
    if (t.text === ')') {
      const closed = stack.length > 1 ? stack.pop() : null;
      if (closed?.sub) breakLine(closed.indent - 1);
      emit(t); return;
    }
    if (t.text === ';') {
      emit(t);
      lines.push(line.trimEnd()); lines.push(''); line = ''; prev = null; prev2 = null;
      stack.length = 1; stack[0].clause = ''; stack[0].multi = false; between = false;
      return;
    }
    emit(t);
  });
  if (line.trim()) lines.push(line.trimEnd());
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.join('\n');
}
