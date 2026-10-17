// Small SQL text helpers used to decide how a statement may be run. They never parse SQL fully; they blank out
// comments and quoted text first, so keywords inside strings or comments cannot fool the checks.

// Same length as the input: comments and string / identifier literals become spaces (newlines are kept).
function maskSql(sql, dialect = 'postgres') {
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

const READ_START = /^\(*\s*(select|show|describe|desc|explain|with|values|table)\b/i;

// True unless the text is a single plain read statement. Used by read-only connections (the database session is
// also switched to read-only, which catches data-changing CTEs).
function sqlIsWrite(sql, dialect) {
  const masked = maskSql(String(sql), dialect).trim().replace(/;\s*$/, '');
  if (!masked) return false;
  if (/;/.test(masked)) return true;
  if (!READ_START.test(masked)) return true;
  return /\binto\b/i.test(masked);   // SELECT ... INTO creates a table / writes a file
}

// Appends LIMIT maxRows+1 to a plain single SELECT so a huge table is never pulled in full. Returns null when the
// statement is not obviously safe to limit (it then runs as written and is trimmed afterwards).
function capSql(sql, dialect, maxRows) {
  const text = String(sql).trim().replace(/;\s*$/, '');
  const masked = maskSql(text, dialect).trim();
  if (/;/.test(masked)) return null;
  if (!/^select\b/i.test(masked)) return null;
  if (/\b(limit|offset|fetch|into|union|intersect|except|procedure)\b/i.test(masked) || /\bfor\s+(update|share|no\s+key)\b/i.test(masked) || /\block\s+in\s+share\s+mode\b/i.test(masked)) return null;
  return `${text}\nLIMIT ${maxRows + 1}`;
}

module.exports = { maskSql, sqlIsWrite, capSql };
