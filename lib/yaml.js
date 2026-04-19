const fs = require('fs');

function parseFile(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: raw };
  return { frontmatter: parseYaml(m[1]), body: m[2] };
}

function parseYaml(text) {
  const result = {};
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }
    const m = line.match(/^([A-Za-z_][\w]*):\s*(.*?)\s*$/);
    if (!m) { i++; continue; }
    const key = m[1];
    const val = m[2];
    if (val === '') {
      const items = [];
      i++;
      while (i < lines.length && /^\s+-\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s+-\s+/, '');
        items.push(parseValue(itemText));
        i++;
      }
      result[key] = items;
    } else {
      result[key] = parseValue(val);
      i++;
    }
  }
  return result;
}

function parseValue(text) {
  text = text.trim();
  if (text.startsWith('{') && text.endsWith('}')) {
    const obj = {};
    const inner = text.slice(1, -1);
    let depth = 0, start = 0, inStr = false;
    const pairs = [];
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (c === '"' && inner[i - 1] !== '\\') inStr = !inStr;
      if (!inStr) {
        if (c === '{' || c === '[') depth++;
        if (c === '}' || c === ']') depth--;
        if (c === ',' && depth === 0) { pairs.push(inner.slice(start, i)); start = i + 1; }
      }
    }
    pairs.push(inner.slice(start));
    for (const p of pairs) {
      const idx = p.indexOf(':');
      if (idx < 0) continue;
      const k = p.slice(0, idx).trim();
      const v = p.slice(idx + 1).trim();
      obj[k] = parseValue(v);
    }
    return obj;
  }
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(s => parseScalar(s.trim()));
  }
  return parseScalar(text);
}

function parseScalar(text) {
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null' || text === '') return null;
  if (/^-?\d+$/.test(text)) return parseInt(text, 10);
  if (text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1);
  }
  return text;
}

module.exports = { parseFile, parseYaml, parseValue, parseScalar };
