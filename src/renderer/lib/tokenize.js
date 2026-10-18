// Tokenizers for the query editor. Each returns one array of { kind, text } segments per line, where
// kind is one of xedonium's token kinds (comment | string | keyword | tag | attr | number | fn) or null.

export const SQL_KEYWORDS = new Set(
  `select from where and or not null insert into values update set delete create table alter drop join left right inner
outer full cross on group by order having limit offset as distinct union all in is like ilike between exists case when then else end asc desc
primary key foreign references index view database schema use show describe explain with returning default true false truncate begin commit
rollback grant revoke if unique check constraint add column to using natural over partition window rename replace temporary temp cascade
restrict engine charset collate auto_increment`.split(/\s+/)
);

const COMMANDS = new Set(['find', 'insert', 'update', 'delete', 'collections', 'read', 'create', 'rest:', 'count', 'aggregate', 'distinct']);
const CLAUSES = new Set(['limit', 'offset', 'skip', 'sort', 'project', 'projection', 'where', 'and', 'order', 'by', 'asc', 'desc', 'true', 'false', 'null']);

const SQL_TOKEN_MYSQL = /(--[^\n]*|#[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:[^'\\]|\\.|'')*'?)|("(?:[^"\\]|\\.|"")*"?)|(`[^`]*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w$]*)(\s*\()?/g;
// `#` starts a comment only in MySQL; in PostgreSQL it is an operator.
const SQL_TOKEN_PG = new RegExp(SQL_TOKEN_MYSQL.source.replace('|#[^\\n]*', ''), 'g');

function splitLines(segments) {
  const lines = [[]];
  for (const segment of segments) {
    const parts = segment.text.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ kind: segment.kind, text: part });
    });
  }
  return lines;
}

function tokenizeSql(code, dialect) {
  const out = [];
  let last = 0;
  for (const match of code.matchAll(dialect === 'mysql' ? SQL_TOKEN_MYSQL : SQL_TOKEN_PG)) {
    if (match.index > last) out.push({ kind: null, text: code.slice(last, match.index) });
    const [text, comment, single, double, backtick, number, word, paren] = match;
    if (comment) out.push({ kind: 'comment', text });
    else if (single) out.push({ kind: 'string', text });
    else if (double) out.push({ kind: dialect === 'mysql' ? 'string' : 'attr', text });
    else if (backtick) out.push({ kind: 'attr', text });
    else if (number) out.push({ kind: 'number', text });
    else if (word) {
      if (paren) {
        out.push({ kind: 'fn', text: word });
        out.push({ kind: null, text: paren });
      } else out.push({ kind: SQL_KEYWORDS.has(word.toLowerCase()) ? 'keyword' : null, text: word });
    }
    last = match.index + text.length;
  }
  if (last < code.length) out.push({ kind: null, text: code.slice(last) });
  return splitLines(out);
}

const COMMAND_TOKEN = /("(?:[^"\\\n]|\\.)*"?)(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?![\w$]))|([A-Za-z0-9_$][\w.$-]*:?)|(\n)/g;

// MongoDB / Firestore / Supabase REST commands: `find users {"age":{"$gt":30}} LIMIT 20`.
function tokenizeCommand(code) {
  const out = [];
  let last = 0;
  let wordIndex = 0;
  for (const match of code.matchAll(COMMAND_TOKEN)) {
    if (match.index > last) out.push({ kind: null, text: code.slice(last, match.index) });
    const [text, string, colon, number, word, newline] = match;
    if (newline) {
      wordIndex = 0;
      out.push({ kind: null, text });
    } else if (string) {
      out.push({ kind: colon ? 'attr' : 'string', text: string });
      if (colon) out.push({ kind: null, text: colon });
    } else if (number) out.push({ kind: 'number', text });
    else if (word) {
      const lower = word.toLowerCase();
      let kind = null;
      if (wordIndex === 0 && COMMANDS.has(lower)) kind = 'keyword';
      else if (wordIndex === 1 && !word.endsWith(':')) kind = 'tag';
      else if (CLAUSES.has(lower)) kind = 'keyword';
      out.push({ kind, text });
      wordIndex += 1;
    }
    last = match.index + text.length;
  }
  if (last < code.length) out.push({ kind: null, text: code.slice(last) });
  return splitLines(out);
}

// language: 'mysql' | 'postgres' | 'command'
export default function tokenizeQuery(code, language) {
  return language === 'command' ? tokenizeCommand(code) : tokenizeSql(code, language);
}

export function languageFor(active) {
  if (!active) return 'mysql';
  if (active.type === 'mongodb' || active.type === 'firestore') return 'command';
  if (active.type === 'supabase' && !active.connectionString) return 'command';
  return active.type === 'mysql' ? 'mysql' : 'postgres';
}
