#!/usr/bin/env node
// TODO viewer — local server for the goals/tasks GUI.
// Run: node tools/server.js
// Then open http://localhost:3737 (in VSCode: Ctrl+Shift+P → "Simple Browser: Show").

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3737;
const ROOT = path.resolve(__dirname, '..');
const GOALS_DIR = path.join(ROOT, 'GOALS');
const PROJECTS_DIR = path.join(ROOT, 'PROJECTS');
const WEB_DIR = path.join(__dirname, 'web');

// ---------- minimal YAML frontmatter parser ----------

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
    // Split on commas at depth 0 (no nested objects expected in our schema)
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
      obj[k] = parseScalar(v);
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
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

// ---------- file scanning ----------

function listGoals() {
  if (!fs.existsSync(GOALS_DIR)) return [];
  return fs.readdirSync(GOALS_DIR)
    .filter(f => f.startsWith('G-') && f.endsWith('.md'))
    .map(f => {
      const filepath = path.join(GOALS_DIR, f);
      const { frontmatter, body } = parseFile(filepath);
      return { ...frontmatter, body: body.trim(), _file: filepath };
    });
}

function listTasks() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const tasks = [];
  for (const cat of fs.readdirSync(PROJECTS_DIR)) {
    const catDir = path.join(PROJECTS_DIR, cat);
    if (!fs.statSync(catDir).isDirectory()) continue;
    for (const f of fs.readdirSync(catDir)) {
      if (!f.startsWith('T-') || !f.endsWith('.md')) continue;
      const filepath = path.join(catDir, f);
      const { frontmatter, body } = parseFile(filepath);
      tasks.push({ ...frontmatter, body: body.trim(), _file: filepath });
    }
  }
  return tasks;
}

function snapshot() {
  return { goals: listGoals(), tasks: listTasks() };
}

// ---------- targeted writers (preserve formatting) ----------

function toggleCriterion(goalId, idx) {
  const filepath = path.join(GOALS_DIR, `${goalId}.md`);
  if (!fs.existsSync(filepath)) throw new Error(`Goal ${goalId} not found`);
  const raw = fs.readFileSync(filepath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  let inCriteria = false;
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^criteria:\s*$/.test(line)) { inCriteria = true; continue; }
    if (inCriteria) {
      if (/^[A-Za-z_]/.test(line) || line === '---') { inCriteria = false; continue; }
      if (/^\s+-\s*\{/.test(line)) {
        if (count === idx) {
          lines[i] = line.replace(/done:\s*(true|false)/, (_, v) => `done: ${v === 'true' ? 'false' : 'true'}`);
          fs.writeFileSync(filepath, lines.join(eol));
          return;
        }
        count++;
      }
    }
  }
  throw new Error(`Criterion idx ${idx} not found on ${goalId}`);
}

function setStatus(kind, id, newStatus) {
  const valid = {
    goal: ['active', 'someday', 'completed', 'abandoned'],
    task: ['todo', 'in_progress', 'blocked', 'done', 'someday', 'abandoned'],
  };
  if (!valid[kind].includes(newStatus)) throw new Error(`Invalid ${kind} status: ${newStatus}`);
  let filepath;
  if (kind === 'goal') {
    filepath = path.join(GOALS_DIR, `${id}.md`);
  } else {
    // Find task across categories
    for (const cat of fs.readdirSync(PROJECTS_DIR)) {
      const candidate = path.join(PROJECTS_DIR, cat, `${id}.md`);
      if (fs.existsSync(candidate)) { filepath = candidate; break; }
    }
  }
  if (!filepath || !fs.existsSync(filepath)) throw new Error(`${kind} ${id} not found`);
  const raw = fs.readFileSync(filepath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const updated = raw.replace(/^status:\s*\w+/m, `status: ${newStatus}`);
  fs.writeFileSync(filepath, updated);
}

// ---------- SSE clients ----------

const sseClients = new Set();

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) {
    try { res.write(data); } catch (e) { /* ignore */ }
  }
}

// ---------- file watcher (debounced) ----------

let pendingBroadcast = null;
function scheduleBroadcast() {
  if (pendingBroadcast) clearTimeout(pendingBroadcast);
  pendingBroadcast = setTimeout(() => {
    pendingBroadcast = null;
    broadcast({ type: 'update', snapshot: snapshot() });
  }, 100);
}

function watchDir(dir, recursive = false) {
  if (!fs.existsSync(dir)) return;
  fs.watch(dir, { recursive }, () => scheduleBroadcast());
}

watchDir(GOALS_DIR);
watchDir(PROJECTS_DIR, true);

// ---------- HTTP server ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function sendStatic(res, filepath) {
  if (!fs.existsSync(filepath)) { res.writeHead(404); res.end('Not found'); return; }
  const ext = path.extname(filepath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filepath).pipe(res);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);
  try {
    if (u.pathname === '/' || u.pathname === '/index.html') {
      return sendStatic(res, path.join(WEB_DIR, 'index.html'));
    }
    if (u.pathname.startsWith('/static/')) {
      const safe = u.pathname.replace(/^\/static\//, '').replace(/\.\./g, '');
      return sendStatic(res, path.join(WEB_DIR, safe));
    }
    if (u.pathname === '/api/data' && req.method === 'GET') {
      return sendJson(res, 200, snapshot());
    }
    if (u.pathname === '/api/criteria/toggle' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      toggleCriterion(body.goalId, body.idx);
      return sendJson(res, 200, { ok: true });
    }
    if (u.pathname === '/api/status' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      setStatus(body.kind, body.id, body.status);
      return sendJson(res, 200, { ok: true });
    }
    if (u.pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write(`data: ${JSON.stringify({ type: 'hello', snapshot: snapshot() })}\n\n`);
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }
    res.writeHead(404); res.end('Not found');
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`TODO viewer running at http://localhost:${PORT}`);
  console.log(`In VSCode: Ctrl+Shift+P → "Simple Browser: Show" → paste URL`);
});
