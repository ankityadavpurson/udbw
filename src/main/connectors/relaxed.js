// Converts the loose JSON people type in a shell ({status: 'active', _id: ObjectId("…"), d: ISODate("…")}) into
// strict (Extended) JSON text. Strict JSON passes through unchanged, so this is safe to run on any value.

const unquote = text => {
  const t = text.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) return t.slice(1, -1);
  return t;
};

// Reads a quoted string starting at `start`; returns { json (as a JSON string literal), end (index after the closing quote) }.
function readString(src, start) {
  const quote = src[start];
  let i = start + 1;
  let json = '"';
  while (i < src.length && src[i] !== quote) {
    const c = src[i];
    if (c === '\\') {
      json += src[i + 1] === "'" ? "'" : c + (src[i + 1] ?? '');
      i += 2;
      continue;
    }
    json += c === '"' ? '\\"' : c; // a double quote inside a single-quoted string needs escaping
    i++;
  }
  if (i >= src.length) throw new Error('Unterminated string.');
  return { json: `${json}"`, end: i + 1 };
}

// Finds the ")" that closes the "(" at `open`, ignoring parentheses inside strings.
function closingParen(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      i = readString(src, i).end - 1;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error('Missing ")".');
}

function callToJson(name, args) {
  const arg = unquote(args);
  switch (name) {
    case 'ObjectId':
      return `{"$oid":${JSON.stringify(arg)}}`;
    case 'ISODate':
    case 'Date':
      return `{"$date":${JSON.stringify(arg || new Date().toISOString())}}`;
    case 'NumberLong':
      return `{"$numberLong":${JSON.stringify(arg)}}`;
    case 'NumberDecimal':
      return `{"$numberDecimal":${JSON.stringify(arg)}}`;
    case 'NumberInt':
    case 'NumberDouble':
      return String(Number(arg));
    case 'UUID':
      return `{"$uuid":${JSON.stringify(arg)}}`;
    default:
      throw new Error(`Unknown function ${name}().`);
  }
}

function relaxedToJson(src) {
  let out = '';
  let i = 0;
  const prevSignificant = () => {
    const t = out.trimEnd();
    return t[t.length - 1];
  };
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      const s = readString(src, i);
      out += s.json;
      i = s.end;
      continue;
    }
    if (ch === '/' && ['', ':', ',', '[', '(', undefined].includes(prevSignificant() ?? '')) {
      let j = i + 1;
      while (j < src.length && src[j] !== '/') j += src[j] === '\\' ? 2 : 1;
      if (j >= src.length) throw new Error('Unterminated regular expression.');
      const flags = /^[a-z]*/.exec(src.slice(j + 1))[0];
      out += `{"$regularExpression":{"pattern":${JSON.stringify(src.slice(i + 1, j))},"options":${JSON.stringify(flags)}}}`;
      i = j + 1 + flags.length;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < src.length && /[\w$.]/.test(src[j])) j++;
      const word = src.slice(i, j);
      let k = j;
      while (/\s/.test(src[k] || '')) k++;
      if (src[k] === ':') {
        out += JSON.stringify(word);
        i = j;
        continue;
      }
      if (word === 'new') {
        i = j;
        continue;
      }
      if (src[k] === '(') {
        const close = closingParen(src, k);
        out += callToJson(word, src.slice(k + 1, close));
        i = close + 1;
        continue;
      }
      if (word === 'true' || word === 'false' || word === 'null') out += word;
      else if (word === 'undefined') out += 'null';
      else throw new Error(`Unexpected "${word}". Put text values in quotes.`);
      i = j;
      continue;
    }
    if (ch === ',') {
      // trailing commas are allowed
      let k = i + 1;
      while (/\s/.test(src[k] || '')) k++;
      if (src[k] === '}' || src[k] === ']') {
        i++;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

module.exports = { relaxedToJson, closingParen, readString };
