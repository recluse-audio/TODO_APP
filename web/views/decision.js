import { el } from '../core/state.js';
import { post } from '../core/api.js';
import { allGroups } from '../core/data.js';
import { sectionTitle } from '../ui/detail.js';
import { select, render } from '../ui/render.js';
import { closeModal } from '../ui/modal.js';
import { formField, buildDynamicList } from '../ui/form.js';
import { TodoItemView } from './base.js';

export class DecisionView extends TodoItemView {
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
        el('h3', { class: 'text-xs uppercase tracking-wider pal-muted font-semibold' }, 'Choices'),
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
      for (const c of this.considerations) ul.appendChild(el('li', { class: 'text-sm pal-text' }, c));
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
