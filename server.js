#!/usr/bin/env node
// TODO viewer — local server for the goals/tasks/decisions GUI.
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

// ---------- helpers ----------

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

// ---------- model classes ----------

class TodoItem {
  // subclass static fields: type, dir, prefix, statuses, defaultStatus

  constructor(fm, body, filepath) {
    Object.assign(this, fm);
    this.body = (body || '').trim();
    this._file = filepath;
  }

  static list() {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir)
      .filter(f => f.startsWith(this.prefix) && f.endsWith('.md'))
      .map(f => {
        const fp = path.join(this.dir, f);
        const { frontmatter, body } = parseFile(fp);
        return new this(frontmatter, body, fp);
      });
  }

  static load(id) {
    const fp = path.join(this.dir, `${id}.md`);
    if (!fs.existsSync(fp)) throw new Error(`${this.type} ${id} not found`);
    const { frontmatter, body } = parseFile(fp);
    return new this(frontmatter, body, fp);
  }

  static exists(id) {
    return fs.existsSync(path.join(this.dir, `${id}.md`));
  }

  static create(data) {
    const today = new Date().toISOString().slice(0, 10);
    const slug = slugify(data.title);
    const id = `${this.prefix}${slug}`;
    const fp = path.join(this.dir, `${id}.md`);
    if (fs.existsSync(fp)) throw new Error(`${this.type} ${id} already exists — choose a different title`);
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(fp, this.serializeNew({ ...data, id, created: today }));
    this.afterCreate(id, data);
    return id;
  }

  static afterCreate(id, data) {}
  static serializeNew(data) { throw new Error(`${this.type}: subclass must implement serializeNew`); }

  setStatus(newStatus) {
    if (!this.constructor.statuses.includes(newStatus)) {
      throw new Error(`Invalid ${this.constructor.type} status: ${newStatus}`);
    }
    const raw = fs.readFileSync(this._file, 'utf8');
    fs.writeFileSync(this._file, raw.replace(/^status:\s*\w+/m, `status: ${newStatus}`));
    this.status = newStatus;
  }

  delete() {
    fs.unlinkSync(this._file);
  }
}

class Goal extends TodoItem {
  static type = 'goal';
  static dir = GOALS_DIR;
  static prefix = 'G-';
  static statuses = ['active', 'todo', 'completed', 'abandoned'];

  static serializeNew({ id, title, priority, created, target_date, measurable_outcome, criteria, why, conclusion, groups, body, data }) {
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

  toggleCriterion(idx) {
    const { eol, lines } = readLines(this._file);
    let inCriteria = false, count = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^criteria:\s*$/.test(line)) { inCriteria = true; continue; }
      if (inCriteria) {
        if (/^[A-Za-z_]/.test(line) || line === '---') { inCriteria = false; continue; }
        if (/^\s+-\s*\{/.test(line)) {
          if (count === idx) {
            lines[i] = line.replace(/done:\s*(true|false)/, (_, v) => `done: ${v === 'true' ? 'false' : 'true'}`);
            fs.writeFileSync(this._file, lines.join(eol));
            return;
          }
          count++;
        }
      }
    }
    throw new Error(`Criterion idx ${idx} not found on ${this.id}`);
  }

  deleteCriterion(idx) {
    const criterion = Array.isArray(this.criteria) && this.criteria[idx];
    if (criterion && Array.isArray(criterion.tasks)) {
      for (const taskId of criterion.tasks) {
        if (Task.exists(taskId)) Task.load(taskId).removeSatisfiesEntry(this.id, idx);
      }
    }
    const { eol, lines } = readLines(this._file);
    let inCriteria = false, count = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^criteria:\s*$/.test(line)) { inCriteria = true; continue; }
      if (inCriteria) {
        if (/^[A-Za-z_]/.test(line) || line === '---') { inCriteria = false; continue; }
        if (/^\s+-\s*\{/.test(line)) {
          if (count === idx) { lines.splice(i, 1); fs.writeFileSync(this._file, lines.join(eol)); return; }
          count++;
        }
      }
    }
  }

  addTaskToCriterion(idx, taskId) {
    const { eol, lines } = readLines(this._file);
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
            fs.writeFileSync(this._file, lines.join(eol));
            return;
          }
          count++;
        }
      }
    }
  }

  addTaskId(taskId) {
    const raw = fs.readFileSync(this._file, 'utf8');
    const updated = raw.replace(/^tasks:\s*\[([^\]]*)\]/m, (_, inner) => {
      const existing = inner.trim() ? inner.split(',').map(s => s.trim()).filter(Boolean) : [];
      existing.push(taskId);
      return `tasks: [${existing.join(', ')}]`;
    });
    fs.writeFileSync(this._file, updated);
  }

  removeTaskId(taskId) {
    const raw = fs.readFileSync(this._file, 'utf8');
    fs.writeFileSync(this._file, removeFromInlineList(raw, 'tasks', taskId));
  }

  removeTaskFromAllCriteria(taskId) {
    const { eol, lines } = readLines(this._file);
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
    if (modified) fs.writeFileSync(this._file, lines.join(eol));
  }

  delete() {
    for (const task of Task.list()) {
      if (Array.isArray(task.goals) && task.goals.includes(this.id)) {
        task.removeGoalId(this.id);
      }
      if (Array.isArray(task.satisfies) && task.satisfies.some(s => s.goal === this.id)) {
        task.removeSatisfiesForGoal(this.id);
      }
    }
    super.delete();
  }
}

class Task extends TodoItem {
  static type = 'task';
  static dir = TASKS_DIR;
  static prefix = 'T-';
  static statuses = ['todo', 'in_progress', 'blocked', 'done', 'abandoned'];

  static serializeNew({ id, title, priority, created, target_date, goals, decisions, contribution_summary, groups, estimated_effort, body }) {
    let fm = `---\nid: ${id}\ntype: task\ntitle: ${quoteYaml(title)}\npriority: ${priority}\ncreated: ${created}\n`;
    if (target_date) fm += `target_date: ${target_date}\n`;
    fm += `status: todo\ngoals: [${(goals || []).join(', ')}]\ndecisions: [${(decisions || []).join(', ')}]\ncontribution_summary: ${quoteYaml(contribution_summary)}\ngroups: [${(groups || []).join(', ')}]\n`;
    if (estimated_effort) fm += `estimated_effort: ${quoteYaml(estimated_effort)}\n`;
    fm += `blocked_by: []\nrelated_tasks: []\n---\n`;
    if (body && body.trim()) fm += `\n${body.trim()}\n`;
    return fm;
  }

  static afterCreate(id, data) {
    for (const gid of (data.goals || [])) {
      if (Goal.exists(gid)) Goal.load(gid).addTaskId(id);
    }
    for (const s of (data.satisfies || [])) {
      if (Goal.exists(s.goal)) Goal.load(s.goal).addTaskToCriterion(s.criterion, id);
    }
  }

  removeGoalId(goalId) {
    const raw = fs.readFileSync(this._file, 'utf8');
    fs.writeFileSync(this._file, removeFromInlineList(raw, 'goals', goalId));
  }

  removeSatisfiesForGoal(goalId) {
    const { eol, lines } = readLines(this._file);
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
    fs.writeFileSync(this._file, out.join(eol));
  }

  removeSatisfiesEntry(goalId, criterionIdx) {
    const { eol, lines } = readLines(this._file);
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
    fs.writeFileSync(this._file, out.join(eol));
  }

  delete() {
    for (const goal of Goal.list()) {
      if (Array.isArray(goal.tasks) && goal.tasks.includes(this.id)) {
        goal.removeTaskId(this.id);
      }
      goal.removeTaskFromAllCriteria(this.id);
    }
    super.delete();
  }
}

class Decision extends TodoItem {
  static type = 'decision';
  static dir = DECISIONS_DIR;
  static prefix = 'D-';
  static statuses = ['open', 'decided', 'abandoned'];

  static serializeNew({ id, title, priority, created, choices, considerations, summary, why, data, groups, body }) {
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

  selectChoice(idx) {
    const { eol, lines } = readLines(this._file);
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
    fs.writeFileSync(this._file, lines.join(eol));
  }

  deleteChoice(idx) {
    const { eol, lines } = readLines(this._file);
    let inChoices = false, count = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^choices:\s*$/.test(line)) { inChoices = true; continue; }
      if (inChoices) {
        if (/^[A-Za-z_]/.test(line) || line === '---') { inChoices = false; continue; }
        if (/^\s+-\s*\{/.test(line)) {
          if (count === idx) { lines.splice(i, 1); fs.writeFileSync(this._file, lines.join(eol)); return; }
          count++;
        }
      }
    }
  }
}

const KINDS = { goal: Goal, task: Task, decision: Decision };

function snapshot() {
  return { goals: Goal.list(), tasks: Task.list(), decisions: Decision.list() };
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

function kindOrThrow(kind) {
  const cls = KINDS[kind];
  if (!cls) throw new Error(`Unknown kind: ${kind}`);
  return cls;
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
      Goal.load(body.goalId).toggleCriterion(body.idx);
      return sendJson(res, 200, { ok: true });
    }
    if (u.pathname === '/api/status' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      kindOrThrow(body.kind).load(body.id).setStatus(body.status);
      return sendJson(res, 200, { ok: true });
    }
    if (u.pathname === '/api/goal/delete' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      Goal.load(body.id).delete();
      return sendJson(res, 200, { ok: true });
    }
    if (u.pathname === '/api/task/delete' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      Task.load(body.id).delete();
      return sendJson(res, 200, { ok: true });
    }
    if (u.pathname === '/api/criteria/delete' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      Goal.load(body.goalId).deleteCriterion(body.idx);
      return sendJson(res, 200, { ok: true });
    }
    if (u.pathname === '/api/goal/create' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const id = Goal.create(body);
      return sendJson(res, 200, { ok: true, id });
    }
    if (u.pathname === '/api/task/create' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const id = Task.create(body);
      return sendJson(res, 200, { ok: true, id });
    }
    if (u.pathname === '/api/decision/create' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const id = Decision.create(body);
      return sendJson(res, 200, { ok: true, id });
    }
    if (u.pathname === '/api/decision/delete' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      Decision.load(body.id).delete();
      return sendJson(res, 200, { ok: true });
    }
    if (u.pathname === '/api/choices/select' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      Decision.load(body.decisionId).selectChoice(body.idx);
      return sendJson(res, 200, { ok: true });
    }
    if (u.pathname === '/api/choices/delete' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      Decision.load(body.decisionId).deleteChoice(body.idx);
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
