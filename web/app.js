// TODO viewer — frontend.

const state = {
  data: { goals: [], tasks: [] },
  selected: null, // { kind: 'goal'|'task', id: '...' }
  tab: 'hierarchy',
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'onclick') e.onclick = v;
    else if (k === 'onchange') e.onchange = v;
    else if (k.startsWith('data-')) e.setAttribute(k, v);
    else e[k] = v;
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
};

// ---------- data lookups ----------

const goalById = (id) => state.data.goals.find(g => g.id === id);
const taskById = (id) => state.data.tasks.find(t => t.id === id);
const tasksForGoal = (gid) => state.data.tasks.filter(t => Array.isArray(t.goals) && t.goals.includes(gid));
const byPriorityDesc = (a, b) => (b.priority ?? -Infinity) - (a.priority ?? -Infinity);
const subGoalsOf = (gid) => state.data.goals.filter(g => g.parent_goal === gid).sort(byPriorityDesc);
const topLevelGoals = () => state.data.goals.filter(g => !g.parent_goal).sort(byPriorityDesc);
const allGroups = () => {
  const s = new Set();
  for (const g of state.data.goals) for (const grp of (g.groups || [])) s.add(grp);
  for (const t of state.data.tasks) for (const grp of (t.groups || [])) s.add(grp);
  return Array.from(s).sort();
};

// ---------- API ----------

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

async function toggleCriterion(goalId, idx) {
  // optimistic
  const g = goalById(goalId);
  if (g && g.criteria && g.criteria[idx]) g.criteria[idx].done = !g.criteria[idx].done;
  render();
  try {
    await api('/api/criteria/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalId, idx }),
    });
  } catch (e) {
    // revert on error
    if (g && g.criteria && g.criteria[idx]) g.criteria[idx].done = !g.criteria[idx].done;
    render();
  }
}

async function changeStatus(kind, id, newStatus) {
  try {
    await api('/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id, status: newStatus }),
    });
  } catch (e) {
    console.error(e);
  }
}

// ---------- render: sidebar ----------

function renderSidebar() {
  const sb = $('#sidebar');
  sb.innerHTML = '';
  if (state.tab === 'hierarchy') renderHierarchy(sb);
  else if (state.tab === 'groups') renderGroups(sb);
  else if (state.tab === 'tasks') renderTasksList(sb);
}

function goalSidebarItem(g) {
  return el('a', {
    class: 'sb-item' + (state.selected && state.selected.kind === 'goal' && state.selected.id === g.id ? ' active' : ''),
    onclick: () => select('goal', g.id),
  }, g.title || g.id);
}

function taskSidebarItem(t) {
  return el('a', {
    class: 'sb-item' + (state.selected && state.selected.kind === 'task' && state.selected.id === t.id ? ' active' : ''),
    onclick: () => select('task', t.id),
  }, t.title || t.id);
}

function renderHierarchy(sb) {
  sb.appendChild(el('div', { class: 'sb-section-title' }, 'Goals'));
  const renderNode = (g) => {
    const node = el('div', {}, goalSidebarItem(g));
    const subs = subGoalsOf(g.id);
    if (subs.length) {
      const wrap = el('div', { class: 'tree-children' });
      for (const sg of subs) wrap.appendChild(renderNode(sg));
      node.appendChild(wrap);
    }
    return node;
  };
  for (const g of topLevelGoals()) sb.appendChild(renderNode(g));
}

function renderGroups(sb) {
  const groups = allGroups();
  for (const grp of groups) {
    sb.appendChild(el('div', { class: 'sb-section-title' }, grp));
    for (const g of state.data.goals.filter(x => (x.groups || []).includes(grp)).sort(byPriorityDesc)) {
      sb.appendChild(goalSidebarItem(g));
    }
  }
  const ungrouped = state.data.goals.filter(g => !g.groups || g.groups.length === 0).sort(byPriorityDesc);
  if (ungrouped.length) {
    sb.appendChild(el('div', { class: 'sb-section-title' }, '(ungrouped)'));
    for (const g of ungrouped) sb.appendChild(goalSidebarItem(g));
  }
}

function renderTasksList(sb) {
  if (state.data.tasks.length === 0) {
    sb.appendChild(el('div', { class: 'text-xs text-slate-500 p-3' }, 'No tasks yet.'));
    return;
  }
  const byPrimary = {};
  const ungrouped = [];
  for (const t of state.data.tasks) {
    const primary = Array.isArray(t.groups) && t.groups.length ? t.groups[0] : null;
    if (!primary) ungrouped.push(t);
    else (byPrimary[primary] ||= []).push(t);
  }
  for (const grp of Object.keys(byPrimary).sort()) {
    sb.appendChild(el('div', { class: 'sb-section-title' }, grp));
    for (const t of byPrimary[grp]) sb.appendChild(taskSidebarItem(t));
  }
  if (ungrouped.length) {
    sb.appendChild(el('div', { class: 'sb-section-title' }, '(ungrouped)'));
    for (const t of ungrouped) sb.appendChild(taskSidebarItem(t));
  }
}

// ---------- render: detail ----------

function renderDetail() {
  const root = $('#detail');
  root.innerHTML = '';
  if (!state.selected) {
    root.appendChild(el('div', { class: 'text-slate-500 text-sm' }, 'Select a goal or task from the sidebar.'));
    return;
  }
  if (state.selected.kind === 'goal') renderGoalDetail(root, goalById(state.selected.id));
  else renderTaskDetail(root, taskById(state.selected.id));
}

function badge(kind, text) {
  return el('span', { class: `badge badge-${kind}` }, text);
}

function statusSelect(kind, current, options) {
  const sel = el('select', {
    class: 'status-select',
    onchange: (e) => changeStatus(kind, state.selected.id, e.target.value),
  });
  for (const opt of options) {
    const o = el('option', { value: opt }, opt);
    if (opt === current) o.selected = true;
    sel.appendChild(o);
  }
  return sel;
}

function renderHeader(item, kind) {
  const statuses = kind === 'goal'
    ? ['active', 'someday', 'completed', 'abandoned']
    : ['todo', 'in_progress', 'blocked', 'done', 'someday', 'abandoned'];
  return el('div', { class: 'mb-6' },
    el('div', { class: 'flex items-baseline gap-3 flex-wrap' },
      el('h2', { class: 'text-2xl font-semibold tracking-tight' }, item.title || item.id),
      el('span', { class: 'text-xs text-slate-500 font-mono' }, item.id),
    ),
    el('div', { class: 'mt-3 flex items-center gap-2 flex-wrap' },
      badge(item.status, item.status || 'unknown'),
      statusSelect(kind, item.status, statuses),
      typeof item.priority === 'number' ? badge('priority', `priority ${item.priority}`) : null,
      item.target_date ? badge('date', `target ${item.target_date}`) : null,
      item.created ? badge('date', `created ${item.created}`) : null,
      ...(item.groups || []).map(g => badge('group', g)),
    ),
  );
}

function renderGoalDetail(root, g) {
  if (!g) { root.appendChild(el('div', { class: 'text-slate-500' }, 'Goal not found.')); return; }
  root.appendChild(renderHeader(g, 'goal'));

  if (g.measurable_outcome) {
    root.appendChild(el('div', { class: 'mb-6 px-4 py-3 border-l-2 border-slate-700 italic text-slate-300' },
      g.measurable_outcome));
  }

  if (Array.isArray(g.criteria) && g.criteria.length) {
    const done = g.criteria.filter(c => c.done).length;
    const total = g.criteria.length;
    const pct = Math.round((done / total) * 100);
    const sect = el('div', { class: 'mb-8' });
    sect.appendChild(el('div', { class: 'flex items-center justify-between mb-2' },
      el('h3', { class: 'text-xs uppercase tracking-wider text-slate-400 font-semibold' }, 'Criteria'),
      el('div', { class: 'text-xs text-slate-400' }, `${done} / ${total} · ${pct}%`),
    ));
    sect.appendChild(el('div', { class: 'progress-track mb-3' },
      el('div', { class: 'progress-fill', style: `width: ${pct}%` })));
    const list = el('div', { class: 'space-y-1' });
    g.criteria.forEach((c, idx) => {
      const wrap = el('label', { class: 'criterion' + (c.done ? ' done' : '') });
      const cb = el('input', { type: 'checkbox' });
      cb.checked = !!c.done;
      cb.onchange = () => toggleCriterion(g.id, idx);
      wrap.appendChild(cb);
      wrap.appendChild(el('span', { class: 'text-sm' }, c.text));
      list.appendChild(wrap);
    });
    sect.appendChild(list);
    root.appendChild(sect);
  }

  if (g.body) {
    root.appendChild(sectionTitle('Description'));
    root.appendChild(el('div', { class: 'body-md mb-8' }, ...g.body.split(/\n\n+/).map(p => el('p', {}, p))));
  }

  // Cross-references
  const refs = [];
  if (g.parent_goal) {
    const pg = goalById(g.parent_goal);
    if (pg) refs.push({ label: 'Parent goal', items: [pg], kind: 'goal' });
  }
  const subs = subGoalsOf(g.id);
  if (subs.length) refs.push({ label: 'Sub-goals', items: subs, kind: 'goal' });

  const tasks = tasksForGoal(g.id);
  if (tasks.length) refs.push({ label: 'Tasks', items: tasks, kind: 'task' });

  if (Array.isArray(g.related_goals) && g.related_goals.length) {
    const items = g.related_goals.map(goalById).filter(Boolean);
    if (items.length) refs.push({ label: 'Related goals', items, kind: 'goal' });
  }

  for (const ref of refs) {
    root.appendChild(sectionTitle(ref.label));
    const grid = el('div', { class: 'grid grid-cols-1 md:grid-cols-2 gap-2 mb-6' });
    for (const item of ref.items) grid.appendChild(refCard(item, ref.kind));
    root.appendChild(grid);
  }
}

function renderTaskDetail(root, t) {
  if (!t) { root.appendChild(el('div', { class: 'text-slate-500' }, 'Task not found.')); return; }
  root.appendChild(renderHeader(t, 'task'));

  if (t.contribution_summary) {
    root.appendChild(el('div', { class: 'mb-6 px-4 py-3 border-l-2 border-slate-700 italic text-slate-300' },
      t.contribution_summary));
  }

  if (t.estimated_effort) {
    root.appendChild(el('div', { class: 'mb-4 text-xs text-slate-400' }, `Estimated effort: ${t.estimated_effort}`));
  }

  if (t.body) {
    root.appendChild(sectionTitle('Description'));
    root.appendChild(el('div', { class: 'body-md mb-8' }, ...t.body.split(/\n\n+/).map(p => el('p', {}, p))));
  }

  const refs = [];
  if (Array.isArray(t.goals) && t.goals.length) {
    const items = t.goals.map(goalById).filter(Boolean);
    refs.push({ label: 'Advances goals', items, kind: 'goal' });
  }
  if (Array.isArray(t.blocked_by) && t.blocked_by.length) {
    const items = t.blocked_by.map(taskById).filter(Boolean);
    refs.push({ label: 'Blocked by', items, kind: 'task' });
  }
  if (Array.isArray(t.related_tasks) && t.related_tasks.length) {
    const items = t.related_tasks.map(taskById).filter(Boolean);
    refs.push({ label: 'Related tasks', items, kind: 'task' });
  }

  for (const ref of refs) {
    root.appendChild(sectionTitle(ref.label));
    const grid = el('div', { class: 'grid grid-cols-1 md:grid-cols-2 gap-2 mb-6' });
    for (const item of ref.items) grid.appendChild(refCard(item, ref.kind));
    root.appendChild(grid);
  }
}

function sectionTitle(text) {
  return el('h3', { class: 'text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2' }, text);
}

function refCard(item, kind) {
  const card = el('div', { class: 'ref-card', onclick: () => select(kind, item.id) });
  card.appendChild(el('div', { class: 'flex items-baseline gap-2' },
    el('span', { class: 'text-sm font-medium text-slate-200' }, item.title || item.id),
    el('span', { class: 'text-xs text-slate-500 font-mono ml-auto' }, item.id),
  ));
  const meta = el('div', { class: 'mt-1 flex gap-2 text-xs' });
  if (item.status) meta.appendChild(badge(item.status, item.status));
  if (typeof item.priority === 'number') meta.appendChild(badge('priority', `p${item.priority}`));
  card.appendChild(meta);
  return card;
}

// ---------- selection ----------

function select(kind, id) {
  state.selected = { kind, id };
  render();
}

// ---------- tabs ----------

function setTab(tab) {
  state.tab = tab;
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  render();
}

// ---------- top-level render ----------

function render() {
  renderSidebar();
  renderDetail();
}

// ---------- bootstrap ----------

async function bootstrap() {
  $$('.tab-btn').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  setTab('hierarchy');
  try {
    state.data = await api('/api/data');
    // Default selection: first top-level goal
    const first = topLevelGoals()[0];
    if (first) state.selected = { kind: 'goal', id: first.id };
    render();
  } catch (e) {
    $('#detail').textContent = 'Failed to load data: ' + e.message;
  }
  // SSE for live updates
  const es = new EventSource('/api/events');
  es.onopen = () => { $('#conn-indicator').textContent = 'live'; $('#conn-indicator').className = 'text-xs text-emerald-400'; };
  es.onerror = () => { $('#conn-indicator').textContent = 'disconnected'; $('#conn-indicator').className = 'text-xs text-rose-400'; };
  es.onmessage = (msg) => {
    const event = JSON.parse(msg.data);
    if (event.snapshot) {
      state.data = event.snapshot;
      render();
    }
  };
}

bootstrap();
