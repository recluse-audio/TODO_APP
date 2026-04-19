import { el } from '../core/state.js';
import { post } from '../core/api.js';
import { goalById, taskById, tasksForGoal, subGoalsOf, allGroups } from '../core/data.js';
import { sectionTitle, renderRefs } from '../ui/detail.js';
import { select, render } from '../ui/render.js';
import { openModal, closeModal } from '../ui/modal.js';
import { formField, buildDynamicList } from '../ui/form.js';
import { TodoItemView } from './base.js';

export class GoalView extends TodoItemView {
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
