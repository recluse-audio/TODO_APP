// TODO viewer — frontend.

const state = {
  data: { goals: [], tasks: [], decisions: [] },
  selected: null, // { kind: 'goal'|'task'|'decision', id: '...' }
  tab: 'hierarchy',
  lastSelectedByTab: { hierarchy: null, tasks: null, groups: null, decisions: null },
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
const decisionById = (id) => (state.data.decisions || []).find(d => d.id === id);
const tasksForGoal = (gid) => state.data.tasks.filter(t => Array.isArray(t.goals) && t.goals.includes(gid));
const byPriorityDesc = (a, b) => (b.priority ?? -Infinity) - (a.priority ?? -Infinity);
const subGoalsOf = (gid) => state.data.goals.filter(g => g.parent_goal === gid).sort(byPriorityDesc);
const topLevelGoals = () => state.data.goals.filter(g => !g.parent_goal).sort(byPriorityDesc);
const allGroups = () => {
  const s = new Set();
  for (const g of state.data.goals) for (const grp of (g.groups || [])) s.add(grp);
  for (const t of state.data.tasks) for (const grp of (t.groups || [])) s.add(grp);
  for (const d of (state.data.decisions || [])) for (const grp of (d.groups || [])) s.add(grp);
  return Array.from(s).sort();
};

// ---------- API ----------

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

async function post(path, payload) {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function changeStatus(kind, id, newStatus) {
  try { await post('/api/status', { kind, id, status: newStatus }); }
  catch (e) { console.error(e); }
}

async function deleteItem(kind, id) {
  const msg = kind === 'decision'
    ? `Delete this decision?`
    : `Delete this ${kind}? Associated ${kind === 'goal' ? 'tasks' : 'goals'} will be unlinked but not deleted.`;
  if (!confirm(msg)) return;
  try {
    await post(`/api/${kind}/delete`, { id });
    state.selected = null;
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}

// ---------- view classes ----------

class TodoItemView {
  // subclass static fields: kind, statuses, createLabel
  constructor(data) { Object.assign(this, data); }

  isSelected() {
    return state.selected && state.selected.kind === this.constructor.kind && state.selected.id === this.id;
  }

  renderSidebarItem() {
    return el('a', {
      class: 'sb-item' + (this.isSelected() ? ' active' : ''),
      onclick: () => select(this.constructor.kind, this.id),
    }, this.title || this.id);
  }

  renderHeader() {
    const kind = this.constructor.kind;
    const statuses = this.constructor.statuses;
    const deleteBtn = el('button', { class: 'delete-btn', type: 'button', title: `Delete ${kind}` }, '🗑');
    deleteBtn.onclick = () => deleteItem(kind, this.id);
    return el('div', { class: 'mb-6' },
      el('div', { class: 'flex items-baseline gap-3 flex-wrap' },
        el('h2', { class: 'text-2xl font-semibold tracking-tight flex-1' }, this.title || this.id),
        el('span', { class: 'text-xs text-slate-500 font-mono' }, this.id),
        deleteBtn,
      ),
      el('div', { class: 'mt-3 flex items-center gap-2 flex-wrap' },
        badge(this.status, this.status || 'unknown'),
        statusSelect(kind, this.status, statuses),
        typeof this.priority === 'number' ? badge('priority', `priority ${this.priority}`) : null,
        this.target_date ? badge('date', `target ${this.target_date}`) : null,
        this.created ? badge('date', `created ${this.created}`) : null,
        ...(this.groups || []).map(g => badge('group', g)),
      ),
    );
  }

  renderDescription(root) {
    if (this.body) {
      root.appendChild(sectionTitle('Description'));
      const div = el('div', { class: 'body-md mb-8 prose prose-invert prose-sm max-w-none' });
      div.innerHTML = marked.parse(this.body);
      root.appendChild(div);
    }
  }

  renderDetail(root) {
    root.appendChild(this.renderHeader());
  }
}

class GoalView extends TodoItemView {
  static kind = 'goal';
  static statuses = ['active', 'todo', 'completed', 'abandoned'];

  async toggleCriterion(idx) {
    if (this.criteria && this.criteria[idx]) this.criteria[idx].done = !this.criteria[idx].done;
    render();
    try { await post('/api/criteria/toggle', { goalId: this.id, idx }); }
    catch (e) {
      if (this.criteria && this.criteria[idx]) this.criteria[idx].done = !this.criteria[idx].done;
      render();
    }
  }

  async deleteCriterion(idx, text) {
    if (!confirm(`Delete criterion "${text}"? Linked tasks will be unlinked but not deleted.`)) return;
    try { await post('/api/criteria/delete', { goalId: this.id, idx }); }
    catch (e) { alert('Delete failed: ' + e.message); }
  }

  renderDetail(root) {
    super.renderDetail(root);

    if (this.measurable_outcome) {
      root.appendChild(el('div', { class: 'mb-6 px-4 py-3 border-l-2 border-slate-700 italic text-slate-300' },
        this.measurable_outcome));
    }

    if (Array.isArray(this.criteria) && this.criteria.length) {
      const done = this.criteria.filter(c => c.done).length;
      const total = this.criteria.length;
      const sect = el('div', { class: 'mb-8' });
      sect.appendChild(el('div', { class: 'flex items-center justify-between mb-2' },
        el('h3', { class: 'text-xs uppercase tracking-wider text-slate-400 font-semibold' }, 'Criteria'),
        el('div', { class: 'text-xs text-slate-400' }, `${done} / ${total}`),
      ));
      const list = el('div', { class: 'space-y-1' });
      this.criteria.forEach((c, idx) => {
        const row = el('div', { class: 'mb-2' });
        const top = el('div', { class: 'flex items-center gap-1' });
        const wrap = el('label', { class: 'criterion' + (c.done ? ' done' : '') + ' flex-1' });
        const cb = el('input', { type: 'checkbox' });
        cb.checked = !!c.done;
        cb.onchange = () => this.toggleCriterion(idx);
        wrap.appendChild(cb);
        wrap.appendChild(el('span', { class: 'text-sm' }, c.text));
        top.appendChild(wrap);
        top.appendChild(el('button', {
          type: 'button',
          class: 'criterion-add-task-btn',
          onclick: () => openModal('task', { goalId: this.id, criterionIdx: idx, criterionText: c.text }),
        }, '+'));
        top.appendChild(el('button', {
          type: 'button',
          class: 'criterion-delete-btn',
          onclick: () => this.deleteCriterion(idx, c.text),
        }, '×'));
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

    if (Array.isArray(this.why) && this.why.length) {
      root.appendChild(sectionTitle('Why'));
      root.appendChild(el('div', { class: 'body-md mb-8' }, ...this.why.map(line => el('p', {}, line))));
    }

    if (this.data) {
      root.appendChild(sectionTitle('Data'));
      const div = el('div', { class: 'body-md mb-8 prose prose-invert prose-sm max-w-none' });
      div.innerHTML = marked.parse(this.data);
      root.appendChild(div);
    }

    this.renderDescription(root);

    if (this.conclusion) {
      root.appendChild(sectionTitle('Conclusion'));
      const div = el('div', { class: 'body-md mb-8 prose prose-invert prose-sm max-w-none' });
      div.innerHTML = marked.parse(this.conclusion);
      root.appendChild(div);
    }

    const refs = [];
    if (this.parent_goal) {
      const pg = goalById(this.parent_goal);
      if (pg) refs.push({ label: 'Parent goal', items: [pg], kind: 'goal' });
    }
    const subs = subGoalsOf(this.id);
    if (subs.length) refs.push({ label: 'Sub-goals', items: subs, kind: 'goal' });
    const tasks = tasksForGoal(this.id);
    if (tasks.length) refs.push({ label: 'Tasks', items: tasks, kind: 'task' });
    if (Array.isArray(this.related_goals) && this.related_goals.length) {
      const items = this.related_goals.map(goalById).filter(Boolean);
      if (items.length) refs.push({ label: 'Related goals', items, kind: 'goal' });
    }
    renderRefs(root, refs);
  }

  static buildForm() {
    const form = el('form', { class: 'modal-form' });
    form.onsubmit = (e) => { e.preventDefault(); this.submitForm(form); };

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

  static async submitForm(form) {
    const f = form._f;
    const title = f.titleInput.value.trim();
    if (!title) { alert('Title is required.'); return; }
    try {
      const { id } = await post('/api/goal/create', {
        title,
        priority: f.priInput.value !== '' ? parseInt(f.priInput.value, 10) : 0,
        measurable_outcome: f.outcomeInput.value.trim(),
        target_date: f.dateInput.value || null,
        criteria: f.critList.getValues(),
        why: f.whyList.getValues(),
        groups: f.groupsInput.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
        body: f.bodyInput.value.trim(),
      });
      closeModal();
      select('goal', id);
    } catch (e) {
      alert('Failed to create goal: ' + e.message);
    }
  }
}

class TaskView extends TodoItemView {
  static kind = 'task';
  static statuses = ['todo', 'in_progress', 'blocked', 'done', 'abandoned'];

  renderDetail(root) {
    super.renderDetail(root);

    if (this.contribution_summary) {
      root.appendChild(el('div', { class: 'mb-6 px-4 py-3 border-l-2 border-slate-700 italic text-slate-300' },
        this.contribution_summary));
    }

    if (this.estimated_effort) {
      root.appendChild(el('div', { class: 'mb-4 text-xs text-slate-400' }, `Estimated effort: ${this.estimated_effort}`));
    }

    this.renderDescription(root);

    if (Array.isArray(this.satisfies) && this.satisfies.length) {
      root.appendChild(sectionTitle('Satisfies criteria'));
      const box = el('div', { class: 'space-y-1 mb-6' });
      for (const s of this.satisfies) {
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
    if (Array.isArray(this.goals) && this.goals.length) {
      refs.push({ label: 'Advances goals', items: this.goals.map(goalById).filter(Boolean), kind: 'goal' });
    } else {
      refs.push({ label: 'Advances goals', items: [], kind: 'goal', empty: '(orphan task — no goal)' });
    }
    if (Array.isArray(this.blocked_by) && this.blocked_by.length) {
      refs.push({ label: 'Blocked by', items: this.blocked_by.map(taskById).filter(Boolean), kind: 'task' });
    }
    if (Array.isArray(this.related_tasks) && this.related_tasks.length) {
      refs.push({ label: 'Related tasks', items: this.related_tasks.map(taskById).filter(Boolean), kind: 'task' });
    }
    renderRefs(root, refs);
  }

  static buildForm(opts = {}) {
    const form = el('form', { class: 'modal-form' });
    form.onsubmit = (e) => { e.preventDefault(); this.submitForm(form); };
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

  static async submitForm(form) {
    const f = form._f;
    const title = f.titleInput.value.trim();
    if (!title) { alert('Title is required.'); return; }
    try {
      const { id } = await post('/api/task/create', {
        title,
        priority: f.priInput.value !== '' ? parseInt(f.priInput.value, 10) : 0,
        contribution_summary: f.summaryInput.value.trim(),
        target_date: f.dateInput.value || null,
        estimated_effort: f.effortInput.value.trim() || null,
        goals: Array.from(f.goalsBox.querySelectorAll('input:checked')).map(cb => cb.value),
        groups: f.groupsInput.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
        satisfies: form._satisfies ? [form._satisfies] : [],
      });
      closeModal();
      select('task', id);
    } catch (e) {
      alert('Failed to create task: ' + e.message);
    }
  }
}

class DecisionView extends TodoItemView {
  static kind = 'decision';
  static statuses = ['open', 'decided', 'abandoned'];

  async selectChoice(idx) {
    if (Array.isArray(this.choices)) {
      this.choices.forEach((c, i) => { c.chosen = (i === idx); });
    }
    render();
    try { await post('/api/choices/select', { decisionId: this.id, idx }); }
    catch (e) { console.error(e); }
  }

  async deleteChoice(idx, text) {
    if (!confirm(`Delete choice "${text}"?`)) return;
    try { await post('/api/choices/delete', { decisionId: this.id, idx }); }
    catch (e) { alert('Delete failed: ' + e.message); }
  }

  renderDetail(root) {
    super.renderDetail(root);

    if (Array.isArray(this.choices) && this.choices.length) {
      const sect = el('div', { class: 'mb-8' });
      sect.appendChild(el('div', { class: 'flex items-center justify-between mb-2' },
        el('h3', { class: 'text-xs uppercase tracking-wider text-slate-400 font-semibold' }, 'Choices'),
      ));
      const list = el('div', { class: 'space-y-1' });
      const hasChosen = this.choices.some(c => c.chosen);
      this.choices.forEach((c, idx) => {
        const row = el('div', { class: 'mb-1 flex items-center gap-1' });
        const stateClass = c.chosen ? ' chosen' : (hasChosen ? ' unchosen' : '');
        const wrap = el('label', { class: 'choice' + stateClass + ' flex-1' });
        const rb = el('input', { type: 'radio', name: `choices-${this.id}` });
        rb.checked = !!c.chosen;
        rb.onchange = () => this.selectChoice(idx);
        wrap.appendChild(rb);
        wrap.appendChild(el('span', { class: 'text-sm' }, c.text));
        row.appendChild(wrap);
        row.appendChild(el('button', {
          type: 'button',
          class: 'criterion-delete-btn',
          onclick: () => this.deleteChoice(idx, c.text),
        }, '×'));
        list.appendChild(row);
      });
      sect.appendChild(list);
      root.appendChild(sect);
    }

    if (Array.isArray(this.considerations) && this.considerations.length) {
      root.appendChild(sectionTitle('CONSIDERATION'));
      const ul = el('ul', { class: 'body-md mb-8 list-disc pl-5 space-y-1' });
      for (const c of this.considerations) ul.appendChild(el('li', { class: 'text-sm text-slate-200' }, c));
      root.appendChild(ul);
    }

    for (const [field, label] of [['summary', 'Summary'], ['why', 'Why'], ['data', 'Data']]) {
      if (this[field]) {
        root.appendChild(sectionTitle(label));
        const div = el('div', { class: 'body-md mb-8 prose prose-invert prose-sm max-w-none' });
        div.innerHTML = marked.parse(this[field]);
        root.appendChild(div);
      }
    }

    this.renderDescription(root);
  }

  static buildForm() {
    const form = el('form', { class: 'modal-form' });
    form.onsubmit = (e) => { e.preventDefault(); this.submitForm(form); };

    const titleInput = el('input', { type: 'text', class: 'form-input', placeholder: 'e.g. Which audio engine to use' });
    form.appendChild(formField('Title', true, titleInput));

    const priInput = el('input', { type: 'number', class: 'form-input', min: '0', max: '10', placeholder: '0–10' });
    form.appendChild(formField('Priority', false, priInput));

    form.appendChild(el('div', { class: 'form-section-label' }, 'Choices'));
    const choicesList = buildDynamicList('option being considered');
    form.appendChild(choicesList);

    form.appendChild(el('div', { class: 'form-section-label' }, 'Considerations'));
    const considerationsList = buildDynamicList('factor to weigh');
    form.appendChild(considerationsList);

    const summaryInput = el('textarea', { class: 'form-input', rows: '2', placeholder: 'The decision made (once decided)' });
    form.appendChild(formField('Summary', false, summaryInput));

    const whyInput = el('textarea', { class: 'form-input', rows: '3', placeholder: 'Reasoning behind the decision' });
    form.appendChild(formField('Why', false, whyInput));

    const dataInput = el('textarea', { class: 'form-input', rows: '3', placeholder: 'Supporting data, notes, markdown ok' });
    form.appendChild(formField('Data', false, dataInput));

    const groupsInput = el('input', { type: 'text', class: 'form-input', placeholder: 'recluse, audio (comma-separated)', list: 'modal-groups-dl-dec' });
    const dl = el('datalist', { id: 'modal-groups-dl-dec' });
    for (const g of allGroups()) dl.appendChild(el('option', { value: g }));
    form.appendChild(dl);
    form.appendChild(formField('Groups', false, groupsInput));

    const bodyInput = el('textarea', { class: 'form-input', rows: '2', placeholder: 'Optional notes or context' });
    form.appendChild(formField('Description', false, bodyInput));

    const footer = el('div', { class: 'modal-footer' });
    footer.appendChild(el('button', { type: 'button', class: 'modal-btn-cancel', onclick: closeModal }, 'Cancel'));
    footer.appendChild(el('button', { type: 'submit', class: 'modal-btn-primary' }, 'Create Decision'));
    form.appendChild(footer);

    form._f = { titleInput, priInput, choicesList, considerationsList, summaryInput, whyInput, dataInput, groupsInput, bodyInput };
    return form;
  }

  static async submitForm(form) {
    const f = form._f;
    const title = f.titleInput.value.trim();
    if (!title) { alert('Title is required.'); return; }
    try {
      const { id } = await post('/api/decision/create', {
        title,
        priority: f.priInput.value !== '' ? parseInt(f.priInput.value, 10) : 0,
        choices: f.choicesList.getValues(),
        considerations: f.considerationsList.getValues(),
        summary: f.summaryInput.value.trim(),
        why: f.whyInput.value.trim(),
        data: f.dataInput.value.trim(),
        groups: f.groupsInput.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
        body: f.bodyInput.value.trim(),
      });
      closeModal();
      select('decision', id);
    } catch (e) {
      alert('Failed to create decision: ' + e.message);
    }
  }
}

const VIEW_CLASSES = { goal: GoalView, task: TaskView, decision: DecisionView };

function wrapSnapshot(raw) {
  return {
    goals: (raw.goals || []).map(g => new GoalView(g)),
    tasks: (raw.tasks || []).map(t => new TaskView(t)),
    decisions: (raw.decisions || []).map(d => new DecisionView(d)),
  };
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
  const title = kind === 'goal' ? 'New GOAL'
    : kind === 'decision' ? 'New DECISION'
    : opts.criterionText ? `New TASK → ${opts.criterionText}` : 'New TASK';
  hdr.appendChild(el('h2', { class: 'text-base font-semibold text-slate-100' }, title));
  hdr.appendChild(el('button', { class: 'modal-close', type: 'button', onclick: closeModal }, '×'));
  dialog.appendChild(hdr);
  dialog.appendChild(VIEW_CLASSES[kind].buildForm(opts));
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

// ---------- render: sidebar ----------

function renderSidebar() {
  const sb = $('#sidebar');
  sb.innerHTML = '';
  const btns = el('div', { class: 'create-btns' });
  btns.appendChild(el('button', { class: 'create-btn', type: 'button', onclick: () => openModal('decision') }, '+ DECISION'));
  btns.appendChild(el('button', { class: 'create-btn', type: 'button', onclick: () => openModal('goal') }, '+ GOAL'));
  btns.appendChild(el('button', { class: 'create-btn', type: 'button', onclick: () => openModal('task') }, '+ TASK'));
  sb.appendChild(btns);
  if (state.tab === 'hierarchy') renderHierarchy(sb);
  else if (state.tab === 'groups') renderGroups(sb);
  else if (state.tab === 'tasks') renderTasksList(sb);
  else if (state.tab === 'decisions') renderDecisionsList(sb);
}

function renderHierarchy(sb) {
  const sections = [
    { label: 'Active', statuses: ['active'] },
    { label: 'Todo', statuses: ['todo', 'someday'] },
    { label: 'Completed', statuses: ['completed'] },
    { label: 'Abandoned', statuses: ['abandoned'] },
  ];
  const renderNode = (g) => {
    const node = el('div', {}, g.renderSidebarItem());
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
  const all = [...state.data.goals, ...state.data.tasks, ...(state.data.decisions || [])];
  const inGroup = (item, grp) => Array.isArray(item.groups) && item.groups.includes(grp);
  const ungrouped = (item) => !item.groups || item.groups.length === 0;
  for (const grp of allGroups()) {
    sb.appendChild(el('div', { class: 'sb-section-title' }, grp));
    for (const i of all.filter(x => inGroup(x, grp)).sort(byPriorityDesc)) {
      sb.appendChild(i.renderSidebarItem());
    }
  }
  const missing = all.filter(ungrouped).sort(byPriorityDesc);
  if (missing.length) {
    sb.appendChild(el('div', { class: 'sb-section-title' }, '(ungrouped)'));
    for (const i of missing) sb.appendChild(i.renderSidebarItem());
  }
}

function renderStatusSections(sb, items, sections) {
  for (const sec of sections) {
    const picked = items.filter(i => sec.statuses.includes(i.status)).sort(byPriorityDesc);
    sb.appendChild(el('div', { class: 'sb-section-title' }, sec.label));
    for (const i of picked) sb.appendChild(i.renderSidebarItem());
  }
}

function renderTasksList(sb) {
  renderStatusSections(sb, state.data.tasks, [
    { label: 'In Progress', statuses: ['in_progress'] },
    { label: 'Blocked',     statuses: ['blocked'] },
    { label: 'Todo',        statuses: ['todo'] },
    { label: 'Done',        statuses: ['done'] },
    { label: 'Abandoned',   statuses: ['abandoned'] },
  ]);
}

function renderDecisionsList(sb) {
  renderStatusSections(sb, state.data.decisions || [], [
    { label: 'Open',      statuses: ['open'] },
    { label: 'Decided',   statuses: ['decided'] },
    { label: 'Abandoned', statuses: ['abandoned'] },
  ]);
}

// ---------- render: detail ----------

function renderDetail() {
  const root = $('#detail');
  root.innerHTML = '';
  if (!state.selected) {
    root.appendChild(el('div', { class: 'text-slate-500 text-sm' }, 'Select a goal, task, or decision from the sidebar.'));
    return;
  }
  const { kind, id } = state.selected;
  const item = kind === 'goal' ? goalById(id) : kind === 'task' ? taskById(id) : decisionById(id);
  if (!item) { root.appendChild(el('div', { class: 'text-slate-500' }, `${kind} not found.`)); return; }
  item.renderDetail(root);
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

function renderRefs(root, refs) {
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

// ---------- selection ----------

function select(kind, id) {
  state.selected = { kind, id };
  state.lastSelectedByTab[state.tab] = { kind, id };
  localStorage.setItem('todo_selected', JSON.stringify({ kind, id }));
  localStorage.setItem('todo_last_by_tab', JSON.stringify(state.lastSelectedByTab));
  render();
}

// ---------- tabs ----------

function setTab(tab) {
  state.tab = tab;
  localStorage.setItem('todo_tab', tab);
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const remembered = state.lastSelectedByTab[tab];
  const allIds = new Set([...state.data.goals.map(g => g.id), ...state.data.tasks.map(t => t.id), ...(state.data.decisions || []).map(d => d.id)]);
  if (remembered && allIds.has(remembered.id)) {
    state.selected = remembered;
  }
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
  try {
    state.data = wrapSnapshot(await api('/api/data'));
    const savedLastByTab = JSON.parse(localStorage.getItem('todo_last_by_tab') || 'null');
    if (savedLastByTab && typeof savedLastByTab === 'object') {
      for (const k of ['hierarchy', 'tasks', 'groups', 'decisions']) {
        if (savedLastByTab[k]) state.lastSelectedByTab[k] = savedLastByTab[k];
      }
    }
    const savedTab = localStorage.getItem('todo_tab');
    const initialTab = ['hierarchy', 'tasks', 'groups', 'decisions'].includes(savedTab) ? savedTab : 'hierarchy';
    state.tab = initialTab;
    $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === initialTab));

    const allIds = new Set([...state.data.goals.map(g => g.id), ...state.data.tasks.map(t => t.id), ...(state.data.decisions || []).map(d => d.id)]);
    const remembered = state.lastSelectedByTab[initialTab];
    const saved = JSON.parse(localStorage.getItem('todo_selected') || 'null');
    if (remembered && allIds.has(remembered.id)) {
      state.selected = remembered;
    } else if (saved && allIds.has(saved.id)) {
      state.selected = saved;
    } else {
      const first = topLevelGoals()[0];
      if (first) state.selected = { kind: 'goal', id: first.id };
    }
    render();
  } catch (e) {
    $('#detail').textContent = 'Failed to load data: ' + e.message;
  }
  const es = new EventSource('/api/events');
  es.onopen = () => { $('#conn-indicator').textContent = 'live'; $('#conn-indicator').className = 'text-xs text-emerald-400'; };
  es.onerror = () => { $('#conn-indicator').textContent = 'disconnected'; $('#conn-indicator').className = 'text-xs text-rose-400'; };
  es.onmessage = (msg) => {
    const event = JSON.parse(msg.data);
    if (event.snapshot) {
      state.data = wrapSnapshot(event.snapshot);
      render();
    }
  };
}

bootstrap();
