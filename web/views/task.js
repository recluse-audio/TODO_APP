import { state, el } from '../core/state.js';
import { post } from '../core/api.js';
import { goalById, taskById, allGroups, byPriorityDesc } from '../core/data.js';
import { sectionTitle, renderRefs } from '../ui/detail.js';
import { select } from '../ui/render.js';
import { closeModal } from '../ui/modal.js';
import { formField } from '../ui/form.js';
import { TodoItemView } from './base.js';

export class TaskView extends TodoItemView {
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
