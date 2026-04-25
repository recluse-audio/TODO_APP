import { state, el } from '../core/state.js';
import { deleteItem, post } from '../core/api.js';
import { allGroups, groupColor } from '../core/data.js';
import { badge, statusSelect, sectionTitle } from '../ui/detail.js';
import { select, render } from '../ui/render.js';

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
        el('span', { class: 'text-xs pal-muted font-mono' }, this.id),
        deleteBtn,
      ),
      el('div', { class: 'mt-3 flex items-center gap-2 flex-wrap' },
        badge(this.status, this.status || 'unknown'),
        statusSelect(kind, this.status, statuses),
        typeof this.priority === 'number' ? badge('priority', `priority ${this.priority}`) : null,
        this.target_date ? badge('date', `target ${this.target_date}`) : null,
        this.created ? badge('date', `created ${this.created}`) : null,
        ...(this.groups || []).map(g => this.renderGroupBadge(g)),
        this.renderAddGroupControl(),
      ),
    );
  }

  renderGroupBadge(g) {
    const remove = async () => {
      try { await post('/api/groups/remove', { kind: this.constructor.kind, id: this.id, group: g }); }
      catch (e) { alert('Remove failed: ' + e.message); }
    };
    const rm = el('button', { type: 'button', class: 'group-remove', title: 'Remove group', onclick: remove }, '×');
    const b = badge('group', g);
    const c = groupColor(g);
    if (c) b.style.cssText = `background:${c.bg};color:${c.fg};border:1px solid ${c.border}`;
    b.appendChild(rm);
    return b;
  }

  renderAddGroupControl() {
    const wrap = el('span', { class: 'add-group-wrap' });
    if (this._addingGroup) {
      const input = el('input', {
        type: 'text',
        class: 'add-group-input',
        placeholder: 'group…',
        list: `add-group-dl-${this.id}`,
      });
      const dl = el('datalist', { id: `add-group-dl-${this.id}` });
      for (const g of allGroups()) {
        if (!(this.groups || []).includes(g)) dl.appendChild(el('option', { value: g }));
      }
      const commit = async () => {
        const v = input.value.trim().toLowerCase();
        this._addingGroup = false;
        if (!v) { render(); return; }
        try { await post('/api/groups/add', { kind: this.constructor.kind, id: this.id, group: v }); }
        catch (e) { alert('Add failed: ' + e.message); render(); }
      };
      input.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); this._addingGroup = false; render(); }
      };
      input.onblur = commit;
      wrap.appendChild(input);
      wrap.appendChild(dl);
      setTimeout(() => input.focus(), 0);
    } else {
      const btn = el('button', {
        type: 'button',
        class: 'add-group-btn',
        title: 'Add group',
        onclick: () => { this._addingGroup = true; render(); },
      }, '+ group');
      wrap.appendChild(btn);
    }
    return wrap;
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
