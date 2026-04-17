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

// ---------- modal ----------

let modalEl = null;

function initModal() {
  modalEl = el('div', { id: 'modal', class: 'modal-backdrop hidden' });
  document.body.appendChild(modalEl);
  modalEl.onclick = (e) => { if (e.target === modalEl) closeModal(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

function closeModal() {
  if (!modalEl) return;
  modalEl.innerHTML = '';
  modalEl.classList.add('hidden');
}

function openModal(kind, opts = {}) {
  modalEl.innerHTML = '';
  modalEl.classList.remove('hidden');
  const dialog = el('div', { class: 'modal-dialog' });
  const hdr = el('div', { class: 'modal-header' });
  const title = kind === 'goal' ? 'New Goal'
    : opts.criterionText ? `New Task → ${opts.criterionText}` : 'New Task';
  hdr.appendChild(el('h2', { class: 'text-base font-semibold text-slate-100' }, title));
  hdr.appendChild(el('button', { class: 'modal-close', type: 'button', onclick: closeModal }, '×'));
  dialog.appendChild(hdr);
  dialog.appendChild(kind === 'goal' ? buildGoalForm() : buildTaskForm(opts));
  modalEl.appendChild(dialog);
  const first = dialog.querySelector('input, textarea');
  if (first) setTimeout(() => first.focus(), 0);
}

function formField(labelText, required, input) {
  const wrap = el('div', { class: 'form-field' });
  const label = el('label', { class: 'form-label' }, labelText);
  if (required) label.appendChild(el('span', { class: 'text-rose-400' }, ' *'));
  wrap.appendChild(label);
  wrap.appendChild(input);
  return wrap;
}

function buildDynamicList(placeholder) {
  const rows = el('div', { class: 'space-y-1 mb-1' });
  const wrap = el('div');
  wrap.appendChild(rows);
  const addBtn = el('button', { type: 'button', class: 'form-add-btn' }, '+ Add');
  addBtn.onclick = () => {
    const row = el('div', { class: 'dynamic-row' });
    const input = el('input', { type: 'text', class: 'form-input', placeholder });
    const rm = el('button', { type: 'button', class: 'dynamic-remove' }, '×');
    rm.onclick = () => row.remove();
    row.appendChild(input);
    row.appendChild(rm);
    rows.appendChild(row);
    input.focus();
  };
  wrap.appendChild(addBtn);
  wrap.getValues = () => Array.from(rows.querySelectorAll('input')).map(i => i.value.trim()).filter(Boolean);
  return wrap;
}

function buildGoalForm() {
  const form = el('form', { class: 'modal-form' });
  form.onsubmit = (e) => { e.preventDefault(); submitGoal(form); };

  const titleInput = el('input', { type: 'text', class: 'form-input', placeholder: 'e.g. Ship Pulsar v2' });
  form.appendChild(formField('Title', true, titleInput));

  const twoCol = el('div', { class: 'grid grid-cols-2 gap-3' });
  const priInput = el('input', { type: 'number', class: 'form-input', min: '0', max: '10', placeholder: '0–10' });
  const dateInput = el('input', { type: 'date', class: 'form-input' });
  twoCol.appendChild(formField('Priority', false, priInput));
  twoCol.appendChild(formField('Target Date', false, dateInput));
  form.appendChild(twoCol);

  const outcomeInput = el('textarea', { class: 'form-input', rows: '2', placeholder: 'What does done look like? Be specific and verifiable.' });
  form.appendChild(formField('Measurable Outcome', false, outcomeInput));

  form.appendChild(el('div', { class: 'form-section-label' }, 'Criteria'));
  const critList = buildDynamicList('verifiable criterion');
  form.appendChild(critList);

  form.appendChild(el('div', { class: 'form-section-label' }, 'Why'));
  const whyList = buildDynamicList('reason this goal matters');
  form.appendChild(whyList);

  const groupsInput = el('input', { type: 'text', class: 'form-input', placeholder: 'recluse, audio (comma-separated)', list: 'modal-groups-dl' });
  const dl = el('datalist', { id: 'modal-groups-dl' });
  for (const g of allGroups()) dl.appendChild(el('option', { value: g }));
  form.appendChild(dl);
  form.appendChild(formField('Groups', false, groupsInput));

  const bodyInput = el('textarea', { class: 'form-input', rows: '2', placeholder: 'Optional notes or context' });
  form.appendChild(formField('Description', false, bodyInput));

  const footer = el('div', { class: 'modal-footer' });
  footer.appendChild(el('button', { type: 'button', class: 'modal-btn-cancel', onclick: closeModal }, 'Cancel'));
  footer.appendChild(el('button', { type: 'submit', class: 'modal-btn-primary' }, 'Create Goal'));
  form.appendChild(footer);

  form._f = { titleInput, priInput, dateInput, outcomeInput, critList, whyList, groupsInput, bodyInput };
  return form;
}

async function submitGoal(form) {
  const f = form._f;
  const title = f.titleInput.value.trim();
  const priority = f.priInput.value !== '' ? parseInt(f.priInput.value, 10) : 0;
  const measurable_outcome = f.outcomeInput.value.trim();
  if (!title) { alert('Title is required.'); return; }
  try {
    const { id } = await api('/api/goal/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        priority,
        measurable_outcome,
        target_date: f.dateInput.value || null,
        criteria: f.critList.getValues(),
        why: f.whyList.getValues(),
        groups: f.groupsInput.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
        body: f.bodyInput.value.trim(),
      }),
    });
    closeModal();
    state.selected = { kind: 'goal', id };
  } catch (e) {
    alert('Failed to create goal: ' + e.message);
  }
}

function buildTaskForm(opts = {}) {
  const form = el('form', { class: 'modal-form' });
  form.onsubmit = (e) => { e.preventDefault(); submitTask(form); };
  form._satisfies = (opts.goalId != null && opts.criterionIdx != null)
    ? { goal: opts.goalId, criterion: opts.criterionIdx } : null;

  const titleInput = el('input', { type: 'text', class: 'form-input', placeholder: 'e.g. Add unit tests for Pulsar' });
  form.appendChild(formField('Title', true, titleInput));

  const threeCol = el('div', { class: 'grid grid-cols-3 gap-3' });
  const priInput = el('input', { type: 'number', class: 'form-input', min: '0', max: '10', placeholder: '0–10' });
  const effortInput = el('input', { type: 'text', class: 'form-input', placeholder: 'e.g. 2h, 1d' });
  const dateInput = el('input', { type: 'date', class: 'form-input' });
  threeCol.appendChild(formField('Priority', false, priInput));
  threeCol.appendChild(formField('Est. Effort', false, effortInput));
  threeCol.appendChild(formField('Target Date', false, dateInput));
  form.appendChild(threeCol);

  const summaryInput = el('textarea', { class: 'form-input', rows: '2', placeholder: 'How does this task advance the selected goals?' });
  form.appendChild(formField('Contribution Summary', false, summaryInput));

  form.appendChild(el('div', { class: 'form-section-label' }, 'Goals'));
  const goalsBox = el('div', { class: 'goals-checklist' });
  for (const g of state.data.goals.filter(g => g.status === 'active').sort(byPriorityDesc)) {
    const row = el('label', { class: 'goals-check-row' });
    const locked = opts.goalId === g.id;
    const cb = el('input', { type: 'checkbox', value: g.id });
    if (locked) { cb.checked = true; cb.disabled = true; }
    row.appendChild(cb);
    row.appendChild(el('span', { class: 'text-xs text-slate-500 font-mono mr-2' }, `p${g.priority}`));
    row.appendChild(el('span', { class: 'text-sm' + (locked ? ' text-blue-300 font-medium' : ' text-slate-200') }, g.title || g.id));
    goalsBox.appendChild(row);
  }
  form.appendChild(goalsBox);

  const linkedGoal = opts.goalId ? goalById(opts.goalId) : null;
  const inheritedGroups = linkedGoal && Array.isArray(linkedGoal.groups) ? linkedGoal.groups.join(', ') : '';
  const groupsInput = el('input', { type: 'text', class: 'form-input', placeholder: 'recluse, audio (comma-separated)', list: 'modal-groups-dl-task' });
  groupsInput.value = inheritedGroups;
  const dl = el('datalist', { id: 'modal-groups-dl-task' });
  for (const g of allGroups()) dl.appendChild(el('option', { value: g }));
  form.appendChild(dl);
  form.appendChild(formField('Groups', false, groupsInput));

  const footer = el('div', { class: 'modal-footer' });
  footer.appendChild(el('button', { type: 'button', class: 'modal-btn-cancel', onclick: closeModal }, 'Cancel'));
  footer.appendChild(el('button', { type: 'submit', class: 'modal-btn-primary' }, 'Create Task'));
  form.appendChild(footer);

  form._f = { titleInput, priInput, effortInput, dateInput, summaryInput, goalsBox, groupsInput };
  return form;
}

async function submitTask(form) {
  const f = form._f;
  const title = f.titleInput.value.trim();
  const priority = f.priInput.value !== '' ? parseInt(f.priInput.value, 10) : 0;
  const contribution_summary = f.summaryInput.value.trim();
  if (!title) { alert('Title is required.'); return; }
  try {
    const { id } = await api('/api/task/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        priority,
        contribution_summary,
        target_date: f.dateInput.value || null,
        estimated_effort: f.effortInput.value.trim() || null,
        goals: Array.from(f.goalsBox.querySelectorAll('input:checked')).map(cb => cb.value),
        groups: f.groupsInput.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
        satisfies: form._satisfies ? [form._satisfies] : [],
      }),
    });
    closeModal();
    state.selected = { kind: 'task', id };
  } catch (e) {
    alert('Failed to create task: ' + e.message);
  }
}

// ---------- delete ----------

async function deleteItem(kind, id) {
  const label = kind === 'goal' ? 'goal' : 'task';
  if (!confirm(`Delete this ${label}? Associated ${kind === 'goal' ? 'tasks' : 'goals'} will be unlinked but not deleted.`)) return;
  try {
    await api(`/api/${label}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    state.selected = null;
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}

async function deleteCriterionItem(goalId, idx, text) {
  if (!confirm(`Delete criterion "${text}"? Linked tasks will be unlinked but not deleted.`)) return;
  try {
    await api('/api/criteria/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalId, idx }),
    });
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}

// ---------- render: sidebar ----------

function renderSidebar() {
  const sb = $('#sidebar');
  sb.innerHTML = '';
  const btns = el('div', { class: 'create-btns' });
  btns.appendChild(el('button', { class: 'create-btn', type: 'button', onclick: () => openModal('goal') }, '+ Goal'));
  btns.appendChild(el('button', { class: 'create-btn', type: 'button', onclick: () => openModal('task') }, '+ Task'));
  sb.appendChild(btns);
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
  const sections = [
    { label: 'Active', statuses: ['active'] },
    { label: 'Todo', statuses: ['todo', 'someday'] },
    { label: 'Completed', statuses: ['completed'] },
    { label: 'Abandoned', statuses: ['abandoned'] },
  ];
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
  for (const sec of sections) {
    const goals = state.data.goals
      .filter(g => sec.statuses.includes(g.status) && !g.parent_goal)
      .sort(byPriorityDesc);
    sb.appendChild(el('div', { class: 'sb-section-title' }, sec.label));
    for (const g of goals) sb.appendChild(renderNode(g));
  }
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
  const sections = [
    { label: 'In Progress', statuses: ['in_progress'] },
    { label: 'Blocked',     statuses: ['blocked'] },
    { label: 'Todo',        statuses: ['todo'] },
    { label: 'Done',        statuses: ['done'] },
    { label: 'Abandoned',   statuses: ['abandoned'] },
  ];
  for (const sec of sections) {
    const tasks = state.data.tasks
      .filter(t => sec.statuses.includes(t.status))
      .sort(byPriorityDesc);
    sb.appendChild(el('div', { class: 'sb-section-title' }, sec.label));
    for (const t of tasks) sb.appendChild(taskSidebarItem(t));
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
    ? ['active', 'todo', 'completed', 'abandoned']
    : ['todo', 'in_progress', 'blocked', 'done', 'abandoned'];
  const deleteBtn = el('button', { class: 'delete-btn', type: 'button', title: `Delete ${kind}` }, '🗑');
  deleteBtn.onclick = () => deleteItem(kind, item.id);
  return el('div', { class: 'mb-6' },
    el('div', { class: 'flex items-baseline gap-3 flex-wrap' },
      el('h2', { class: 'text-2xl font-semibold tracking-tight flex-1' }, item.title || item.id),
      el('span', { class: 'text-xs text-slate-500 font-mono' }, item.id),
      deleteBtn,
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
    const sect = el('div', { class: 'mb-8' });
    sect.appendChild(el('div', { class: 'flex items-center justify-between mb-2' },
      el('h3', { class: 'text-xs uppercase tracking-wider text-slate-400 font-semibold' }, 'Criteria'),
      el('div', { class: 'text-xs text-slate-400' }, `${done} / ${total}`),
    ));
    const list = el('div', { class: 'space-y-1' });
    g.criteria.forEach((c, idx) => {
      const row = el('div', { class: 'mb-2' });
      const top = el('div', { class: 'flex items-center gap-1' });
      const wrap = el('label', { class: 'criterion' + (c.done ? ' done' : '') + ' flex-1' });
      const cb = el('input', { type: 'checkbox' });
      cb.checked = !!c.done;
      cb.onchange = () => toggleCriterion(g.id, idx);
      wrap.appendChild(cb);
      wrap.appendChild(el('span', { class: 'text-sm' }, c.text));
      top.appendChild(wrap);
      const addTaskBtn = el('button', {
        type: 'button',
        class: 'criterion-add-task-btn',
        onclick: () => openModal('task', { goalId: g.id, criterionIdx: idx, criterionText: c.text }),
      }, '+');
      top.appendChild(addTaskBtn);
      const delCritBtn = el('button', {
        type: 'button',
        class: 'criterion-delete-btn',
        onclick: () => deleteCriterionItem(g.id, idx, c.text),
      }, '×');
      top.appendChild(delCritBtn);
      row.appendChild(top);
      if (Array.isArray(c.tasks) && c.tasks.length) {
        const taskLinks = el('div', { class: 'ml-6 mt-1 flex flex-wrap gap-1' });
        for (const tid of c.tasks) {
          const t = taskById(tid);
          if (!t) continue;
          taskLinks.appendChild(el('a', {
            class: 'criterion-task-link',
            onclick: () => select('task', t.id),
          }, t.title || t.id));
        }
        row.appendChild(taskLinks);
      }
      list.appendChild(row);
    });
    sect.appendChild(list);
    root.appendChild(sect);
  }

  if (Array.isArray(g.why) && g.why.length) {
    root.appendChild(sectionTitle('Why'));
    root.appendChild(el('div', { class: 'body-md mb-8' }, ...g.why.map(line => el('p', {}, line))));
  }

  if (g.body) {
    root.appendChild(sectionTitle('Description'));
    root.appendChild(el('div', { class: 'body-md mb-8' }, ...g.body.split(/\n\n+/).map(p => el('p', {}, p))));
  }

  if (g.conclusion) {
    root.appendChild(sectionTitle('Conclusion'));
    root.appendChild(el('div', { class: 'body-md mb-8' }, ...g.conclusion.split(/\n\n+/).map(p => el('p', {}, p))));
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

  if (Array.isArray(t.satisfies) && t.satisfies.length) {
    root.appendChild(sectionTitle('Satisfies criteria'));
    const box = el('div', { class: 'space-y-1 mb-6' });
    for (const s of t.satisfies) {
      const g = goalById(s.goal);
      if (!g) continue;
      const idx = typeof s.criterion === 'number' ? s.criterion : parseInt(s.criterion, 10);
      const crit = Array.isArray(g.criteria) && g.criteria[idx];
      const line = el('a', {
        class: 'satisfies-link',
        onclick: () => select('goal', g.id),
      });
      line.appendChild(el('span', { class: 'text-xs text-slate-500 font-mono mr-2' }, `${g.id}#${idx}`));
      line.appendChild(el('span', { class: 'text-sm text-slate-200' }, crit ? crit.text : '(unknown criterion)'));
      box.appendChild(line);
    }
    root.appendChild(box);
  }

  const refs = [];
  if (Array.isArray(t.goals) && t.goals.length) {
    const items = t.goals.map(goalById).filter(Boolean);
    refs.push({ label: 'Advances goals', items, kind: 'goal' });
  } else {
    refs.push({ label: 'Advances goals', items: [], kind: 'goal', empty: '(orphan task — no goal)' });
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
    if (!ref.items.length && ref.empty) {
      root.appendChild(el('div', { class: 'text-xs italic text-slate-500 mb-6' }, ref.empty));
      continue;
    }
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
  initModal();
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
