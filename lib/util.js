const fs = require('fs');

function slugify(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .slice(0, 60);
}

function quoteYaml(str) {
  return '"' + String(str || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function removeFromInlineList(raw, field, value) {
  return raw.replace(new RegExp(`^(${field}:\\s*\\[)([^\\]]*)(\\])`, 'm'), (_, open, inner, close) => {
    const kept = inner.split(',').map(s => s.trim()).filter(s => s && s !== value);
    return `${open}${kept.join(', ')}${close}`;
  });
}

function readLines(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  return { raw, eol, lines: raw.split(/\r?\n/) };
}

module.exports = { slugify, quoteYaml, removeFromInlineList, readLines };
