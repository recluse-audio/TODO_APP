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
const TASKS_DIR = path.join(ROOT, 'TASKS');
const DECISIONS_DIR = path.join(ROOT, 'DECISIONS');
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

// ---------- file scanning ----------

const KINDS_META = {
  goal:     { dir: GOALS_DIR,     prefix: 'G-', statuses: ['active', 'todo', 'completed', 'abandoned'] },
  task:     { dir: TASKS_DIR,     prefix: 'T-', statuses: ['todo', 'in_progress', 'blocked', 'done', 'abandoned'] },
  decision: { dir: DECISIONS_DIR, prefix: 'D-', statuses: ['open', 'decided', 'abandoned'] },
};

function listItems(kind) {
  const meta = KINDS_META[kind];
  if (!meta || !fs.existsSync(meta.dir)) return [];
  return fs.readdirSync(meta.dir)
    .filter(f => f.startsWith(meta.prefix) && f.endsWith('.md'))
    .map(f => {
      const filepath = path.join(meta.dir, f);
      const { frontmatter, body } = parseFile(filepath);
      return { ...frontmatter, body: body.trim(), _file: filepath };
    });
}

const listGoals = () => listItems('goal');
const listTasks = () => listItems('task');
const listDecisions = () => listItems('decision');

function snapshot() {
  return { goals: listGoals(), tasks: listTasks(), decisions: listDecisions() };
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
  const meta = KINDS_META[kind];
  if (!meta) throw new Error(`Unknown kind: ${kind}`);
  if (!meta.statuses.includes(newStatus)) throw new Error(`Invalid ${kind} status: ${newStatus}`);
  const filepath = path.join(meta.dir, `${id}.md`);
  if (!fs.existsSync(filepath)) throw new Error(`${kind} ${id} not found`);
  const raw = fs.readFileSync(filepath, 'utf8');
  const updated = raw.replace(/^status:\s*\w+/m, `status: ${newStatus}`);
  fs.writeFileSync(filepath, updated);
}

// ---------- creation helpers ----------

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

function serializeGoalFile({ id, title, priority, created, target_date, measurable_outcome, criteria, why, conclusion, groups, body, data }) {
  let fm = `---\nid: ${id}\ntype: goal\ntitle: ${quoteYaml(title)}\npriority: ${priority}\ncreated: ${created}\n`;
  if (target_date) fm += `target_date: ${target_date}\n`;
  fm += `status: active\nmeasurable_outcome: ${quoteYaml(measurable_outcome)}\n`;
  if (criteria && criteria.length) {
    fm += `criteria:\n`;
    for (const c of criteria) fm += `  - { text: ${quoteYaml(c)}, done: false }\n`;
  }
  fm += `sub_goals: []\ngroups: [${(groups || []).join(', ')}]\nrelated_goals: []\ntasks: []\n`;
  if (data) fm += `data: ${quoteYaml(data)}\n`;
  if (conclusion) fm += `conclusion: ${quoteYaml(conclusion)}\n`;
  if (why && why.length) {
    fm += `why:\n`;
    for (const w of why) fm += `  - ${quoteYaml(w)}\n`;
  }
  fm += `---\n`;
  if (body && body.trim()) fm += `\n${body.trim()}\n`;
  return fm;
}

function serializeTaskFile({ id, title, priority, created, target_date, goals, decisions, contribution_summary, groups, estimated_effort, body }) {
  let fm = `---\nid: ${id}\ntype: task\ntitle: ${quoteYaml(title)}\npriority: ${priority}\ncreated: ${created}\n`;
  if (target_date) fm += `target_date: ${target_date}\n`;
  fm += `status: todo\ngoals: [${(goals || []).join(', ')}]\ndecisions: [${(decisions || []).join(', ')}]\ncontribution_summary: ${quoteYaml(contribution_summary)}\ngroups: [${(groups || []).join(', ')}]\n`;
  if (estimated_effort) fm += `estimated_effort: ${quoteYaml(estimated_effort)}\n`;
  fm += `blocked_by: []\nrelated_tasks: []\n---\n`;
  if (body && body.trim()) fm += `\n${body.trim()}\n`;
  return fm;
}

// ---------- deletion helpers ----------

function removeFromInlineList(raw, field, value) {
  return raw.replace(new RegExp(`^(${field}:\\s*\\[)([^\\]]*)(\\])`, 'm'), (_, open, inner, close) => {
    const kept = inner.split(',').map(s => s.trim()).filter(s => s && s !== value);
    return `${open}${kept.join(', ')}${close}`;
  });
}

function removeSatisfiesForGoal(taskFilepath, goalId) {
  const raw = fs.readFileSync(taskFilepath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  let inSatisfies = false;
  const out = [];
  for (const line of lines) {
    if (/^satisfies:\s*$/.test(line)) { inSatisfies = true; out.push(line); continue; }
    if (inSatisfies) {
      if (/^[A-Za-z_]/.test(line) || line === '---') { inSatisfies = false; out.push(line); continue; }
      if (/^\s+-\s*\{/.test(line) && line.includes(`goal: ${goalId}`)) continue;
    }
    out.push(line);
  }
  fs.writeFileSync(taskFilepath, out.join(eol));
}

function removeSatisfiesEntry(taskFilepath, goalId, criterionIdx) {
  const raw = fs.readFileSync(taskFilepath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  let inSatisfies = false;
  const out = [];
  for (const line of lines) {
    if (/^satisfies:\s*$/.test(line)) { inSatisfies = true; out.push(line); continue; }
    if (inSatisfies) {
      if (/^[A-Za-z_]/.test(line) || line === '---') { inSatisfies = false; out.push(line); continue; }
      if (/^\s+-\s*\{/.test(line) &&
          line.includes(`goal: ${goalId}`) &&
          line.includes(`criterion: ${criterionIdx}`)) continue;
    }
    out.push(line);
  }
  fs.writeFileSync(taskFilepath, out.join(eol));
}

function removeTaskFromAllCriteria(goalFilepath, taskId) {
  const raw = fs.readFileSync(goalFilepath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  let inCriteria = false, modified = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^criteria:\s*$/.test(line)) { inCriteria = true; continue; }
    if (inCriteria) {
      if (/^[A-Za-z_]/.test(line) || line === '---') { inCriteria = false; continue; }
      if (/^\s+-\s*\{/.test(line) && line.includes(taskId)) {
        lines[i] = line.replace(/tasks:\s*\[([^\]]*)\]/, (_, inner) => {
          const kept = inner.split(',').map(s => s.trim()).filter(s => s && s !== taskId);
          return `tasks: [${kept.join(', ')}]`;
        });
        modified = true;
      }
    }
  }
  if (modified) fs.writeFileSync(goalFilepath, lines.join(eol));
}

function deleteGoal(id) {
  const filepath = path.join(GOALS_DIR, `${id}.md`);
  if (!fs.existsSync(filepath)) throw new Error(`Goal ${id} not found`);
  for (const task of listTasks()) {
    const tpath = task._file;
    if (Array.isArray(task.goals) && task.goals.includes(id)) {
      const raw = fs.readFileSync(tpath, 'utf8');
      fs.writeFileSync(tpath, removeFromInlineList(raw, 'goals', id));
    }
    if (Array.isArray(task.satisfies) && task.satisfies.some(s => s.goal === id)) {
      removeSatisfiesForGoal(tpath, id);
    }
  }
  fs.unlinkSync(filepath);
}

function deleteTask(id) {
  const filepath = path.join(TASKS_DIR, `${id}.md`);
  if (!fs.existsSync(filepath)) throw new Error(`Task ${id} not found`);
  for (const goal of listGoals()) {
    const gpath = goal._file;
    if (Array.isArray(goal.tasks) && goal.tasks.includes(id)) {
      const raw = fs.readFileSync(gpath, 'utf8');
      fs.writeFileSync(gpath, removeFromInlineList(raw, 'tasks', id));
    }
    removeTaskFromAllCriteria(gpath, id);
  }
  fs.unlinkSync(filepath);
}

function deleteCriterion(goalId, idx) {
  const filepath = path.join(GOALS_DIR, `${goalId}.md`);
  if (!fs.existsSync(filepath)) throw new Error(`Goal ${goalId} not found`);
  const { frontmatter } = parseFile(filepath);
  const criterion = Array.isArray(frontmatter.criteria) && frontmatter.criteria[idx];
  if (Array.isArray(criterion && criterion.tasks)) {
    for (const taskId of criterion.tasks) {
      const tpath = path.join(TASKS_DIR, `${taskId}.md`);
      if (fs.existsSync(tpath)) removeSatisfiesEntry(tpath, goalId, idx);
    }
  }
  const raw = fs.readFileSync(filepath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  let inCriteria = false, count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^criteria:\s*$/.test(line)) { inCriteria = true; continue; }
    if (inCriteria) {
      if (/^[A-Za-z_]/.test(line) || line === '---') { inCriteria = false; continue; }
      if (/^\s+-\s*\{/.test(line)) {
        if (count === idx) { lines.splice(i, 1); fs.writeFileSync(filepath, lines.join(eol)); return; }
        count++;
      }
    }
  }
}

function addTaskToCriterion(goalId, idx, taskId) {
  const filepath = path.join(GOALS_DIR, `${goalId}.md`);
  if (!fs.existsSync(filepath)) return;
  const raw = fs.readFileSync(filepath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  let inCriteria = false, count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^criteria:\s*$/.test(line)) { inCriteria = true; continue; }
    if (inCriteria) {
      if (/^[A-Za-z_]/.test(line) || line === '---') break;
      if (/^\s+-\s*\{/.test(line)) {
        if (count === idx) {
          if (/tasks:\s*\[([^\]]*)\]/.test(line)) {
            lines[i] = line.replace(/tasks:\s*\[([^\]]*)\]/, (_, inner) => {
              const existing = inner.trim() ? inner.split(',').map(s => s.trim()).filter(Boolean) : [];
              if (!existing.includes(taskId)) existing.push(taskId);
              return `tasks: [${existing.join(', ')}]`;
            });
          } else {
            lines[i] = line.replace(/\s*\}\s*$/, `, tasks: [${taskId}]}`);
          }
          fs.writeFileSync(filepath, lines.join(eol));
          return;
        }
        count++;
      }
    }
  }
}

function serializeDecisionFile({ id, title, priority, created, choices, considerations, summary, why, data, groups, body }) {
  let fm = `---\nid: ${id}\ntype: decision\ntitle: ${quoteYaml(title)}\npriority: ${priority}\ncreated: ${created}\nstatus: open\n`;
  if (choices && choices.length) {
    fm += `choices:\n`;
    for (const c of choices) fm += `  - { text: ${quoteYaml(c)}, chosen: false }\n`;
  }
  if (considerations && considerations.length) {
    fm += `considerations:\n`;
    for (const c of considerations) fm += `  - ${quoteYaml(c)}\n`;
  }
  fm += `groups: [${(groups || []).join(', ')}]\n`;
  if (summary) fm += `summary: ${quoteYaml(summary)}\n`;
  if (why) fm += `why: ${quoteYaml(why)}\n`;
  if (data) fm += `data: ${quoteYaml(data)}\n`;
  fm += `---\n`;
  if (body && body.trim()) fm += `\n${body.trim()}\n`;
  return fm;
}

function selectChoice(decisionId, idx) {
  const filepath = path.join(DECISIONS_DIR, `${decisionId}.md`);
  if (!fs.existsSync(filepath)) throw new Error(`Decision ${decisionId} not found`);
  const raw = fs.readFileSync(filepath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  let inChoices = false, count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^choices:\s*$/.test(line)) { inChoices = true; continue; }
    if (inChoices) {
      if (/^[A-Za-z_]/.test(line) || line === '---') { inChoices = false; continue; }
      if (/^\s+-\s*\{/.test(line)) {
        const shouldBeChosen = (count === idx);
        lines[i] = line.replace(/chosen:\s*(true|false)/, `chosen: ${shouldBeChosen}`);
        count++;
      }
    }
  }
  fs.writeFileSync(filepath, lines.join(eol));
}

function deleteChoice(decisionId, idx) {
  const filepath = path.join(DECISIONS_DIR, `${decisionId}.md`);
  if (!fs.existsSync(filepath)) throw new Error(`Decision ${decisionId} not found`);
  const raw = fs.readFileSync(filepath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  let inChoices = false, count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^choices:\s*$/.test(line)) { inChoices = true; continue; }
    if (inChoices) {
      if (/^[A-Za-z_]/.test(line) || line === '---') { inChoices = false; continue; }
      if (/^\s+-\s*\{/.test(line)) {
        if (count === idx) { lines.splice(i, 1); fs.writeFileSync(filepath, lines.join(eol)); return; }
        count++;
      }
    }
  }
}

function deleteDecision(id) {
  const filepath = path.join(DECISIONS_DIR, `${id}.md`);
  if (!fs.existsSync(filepath)) throw new Error(`Decision ${id} not found`);
  fs.unlinkSync(filepath);
}

function createDecision(data) {
  if (!fs.existsSync(DECISIONS_DIR)) fs.mkdirSync(DECISIONS_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const slug = slugify(data.title);
  const id = `D-${slug}`;
  const filepath = path.join(DECISIONS_DIR, `${id}.md`);
  if (fs.existsSync(filepath)) throw new Error(`Decision ${id} already exists — choose a different title`);
  fs.writeFileSync(filepath, serializeDecisionFile({ ...data, id, created: today }));
  return id;
}

function createGoal(data) {
  const today = new Date().toISOString().slice(0, 10);
  const slug = slugify(data.title);
  const id = `G-${slug}`;
  const filepath = path.join(GOALS_DIR, `${id}.md`);
  if (fs.existsSync(filepath)) throw new Error(`Goal ${id} already exists — choose a different title`);
  fs.writeFileSync(filepath, serializeGoalFile({ ...data, id, created: today }));
  return id;
}

function createTask(data) {
  const today = new Date().toISOString().slice(0, 10);
  const slug = slugify(data.title);
  const id = `T-${slug}`;
  const filepath = path.join(TASKS_DIR, `${id}.md`);
  if (fs.existsSync(filepath)) throw new Error(`Task ${id} already exists — choose a different title`);
  fs.writeFileSync(filepath, serializeTaskFile({ ...data, id, created: today }));
  for (const gid of (data.goals || [])) {
    const gpath = path.join(GOALS_DIR, `${gid}.md`);
    if (!fs.existsSync(gpath)) continue;
    const raw = fs.readFileSync(gpath, 'utf8');
    const updated = raw.replace(/^tasks:\s*\[([^\]]*)\]/m, (_, inner) => {
      const existing = inner.trim() ? inner.split(',').map(s => s.trim()).filter(Boolean) : [];
      existing.push(id);
      return `tasks: [${existing.join(', ')}]`;
    });
    fs.writeFileSync(gpath, updated);
  }
  for (const s of (data.satisfies || [])) {
    addTaskToCriterion(s.goal, s.criterion, id);
  }
  return id;
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

if (!fs.existsSync(DECISIONS_DIR)) fs.mkdirSync(DECISIONS_DIR, { recursive: true });
watchDir(GOALS_DIR);
watchDir(TASKS_DIR);
watchDir(DECISIONS_DIR);

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
    if (u.pathname === '/api/goal/delete' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      deleteGoal(body.id);
      return sendJson(res, 200, { ok: true });
    }
    if (u.pathname === '/api/task/delete' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      deleteTask(body.id);
      return sendJson(res, 200, { ok: true });
    }
    if (u.pathname === '/api/criteria/delete' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      deleteCriterion(body.goalId, body.idx);
      return sendJson(res, 200, { ok: true });
    }
    if (u.pathname === '/api/goal/create' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const id = createGoal(body);
      return sendJson(res, 200, { ok: true, id });
    }
    if (u.pathname === '/api/task/create' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const id = createTask(body);
      return sendJson(res, 200, { ok: true, id });
    }
    if (u.pathname === '/api/decision/create' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const id = createDecision(body);
      return sendJson(res, 200, { ok: true, id });
    }
    if (u.pathname === '/api/decision/delete' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      deleteDecision(body.id);
      return sendJson(res, 200, { ok: true });
    }
    if (u.pathname === '/api/choices/select' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      selectChoice(body.decisionId, body.idx);
      return sendJson(res, 200, { ok: true });
    }
    if (u.pathname === '/api/choices/delete' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      deleteChoice(body.decisionId, body.idx);
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
