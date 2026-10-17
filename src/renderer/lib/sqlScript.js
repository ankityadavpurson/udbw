// Helpers for running parts of the editor: splitting a script into statements, and judging whether a statement
// changes data. Neither is a full SQL parser: comments and quoted text are blanked out first, so a `;` or a
// keyword inside a string never confuses them.

// Same length as the input: comments and string / identifier literals become spaces (newlines are kept).
export function maskSql(sql, dialect = 'postgres') {
  const out = sql.split('');
  const blank = (from, to) => { for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if ((ch === '-' && next === '-') || (dialect === 'mysql' && ch === '#')) {
      let end = sql.indexOf('\n', i); if (end === -1) end = sql.length;
      blank(i, end); i = end;
    } else if (ch === '/' && next === '*') {
      let end = sql.indexOf('*/', i + 2); end = end === -1 ? sql.length : end + 2;
      blank(i, end); i = end;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '\\' && dialect === 'mysql' && ch !== '`') { j += 2; continue; }
        if (sql[j] === ch) { if (sql[j + 1] === ch) { j += 2; continue; } break; }
        j++;
      }
      blank(i, j + 1); i = j + 1;
    } else if (ch === '$' && dialect !== 'mysql') {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (tag) {
        let end = sql.indexOf(tag[0], i + tag[0].length); end = end === -1 ? sql.length : end + tag[0].length;
        blank(i, end); i = end;
      } else i++;
    } else i++;
  }
  return out.join('');
}

// Statements of a script. `start`/`end` bound the trimmed text; `regionEnd` is where its region (up to and including
// the closing `;`) stops, which is what decides which statement the cursor is "in". Comment-only parts are skipped.
export function splitStatements(sql, dialect) {
  const masked = maskSql(sql, dialect);
  const statements = [];
  let from = 0;
  const push = (to, regionEnd) => {
    if (!masked.slice(from, to).trim()) return;
    const raw = sql.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    statements.push({ text, start: from + lead, end: from + lead + text.length, regionEnd });
  };
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === ';') { push(i, i + 1); from = i + 1; }
  }
  push(masked.length, masked.length);
  return statements;
}

// The statement the cursor is in (or the closest one before it).
export function statementAt(statements, offset) {
  return statements.find(s => offset <= s.regionEnd) || statements[statements.length - 1] || null;
}

const READ_WORDS = new Set(['select', 'show', 'describe', 'desc', 'explain', 'values', 'table', 'use', 'set', 'begin', 'start', 'commit', 'rollback']);

// What running this text would do: { write, danger: [reasons] }. `danger` lists things worth a confirmation.
export function assessStatement(sql, dialect) {
  const masked = maskSql(sql, dialect).trim().replace(/;\s*$/, '');
  const first = (/^\(*\s*([a-z_]+)/i.exec(masked)?.[1] || '').toLowerCase();
  const danger = [];
  let write = !READ_WORDS.has(first);
  if (first === 'with') write = /\b(insert|update|delete|merge)\b/i.test(masked);
  if (first === 'explain') write = /\banalyze\b/i.test(masked) && /\b(insert|update|delete|merge)\b/i.test(masked);
  if (first === 'delete' && !/\bwhere\b/i.test(masked)) danger.push('This DELETE has no WHERE clause, so it removes every row.');
  if (first === 'update' && !/\bwhere\b/i.test(masked)) danger.push('This UPDATE has no WHERE clause, so it changes every row.');
  if (first === 'drop') danger.push('DROP permanently removes the object and its data.');
  if (first === 'truncate') danger.push('TRUNCATE removes every row and cannot be undone.');
  if (first === 'alter' && /\bdrop\b/i.test(masked)) danger.push('This ALTER drops part of the table or its data.');
  return { write, danger };
}

// The same judgement for MongoDB / Firestore / Supabase REST commands.
export function assessCommand(text) {
  const t = text.trim();
  const danger = [];
  const write = /^(insert|update|delete|create)\b/i.test(t) || /^db\.[\w.-]+\.(insert|update|delete)\w*\(/i.test(t) || /^(INSERT|UPDATE|DELETE)\s/.test(t) || /\$out|\$merge/.test(t);
  if (/\.(deleteMany|updateMany)\(\s*(\{\s*\})?\s*[,)]/i.test(t)) danger.push('This command has an empty filter, so it affects every document.');
  return { write, danger };
}
