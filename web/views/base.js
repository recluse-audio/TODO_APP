import { state, el } from '../core/state.js';
import { deleteItem } from '../core/api.js';
import { badge, statusSelect, sectionTitle } from '../ui/detail.js';
import { select } from '../ui/render.js';

export class TodoItemView {
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
