import { state, el, $ } from '../core/state.js';
import { goalById, taskById, decisionById } from '../core/data.js';
import { changeStatus } from '../core/api.js';
import { select } from './render.js';

export function badge(kind, text) {
  return el('span', { class: `badge badge-${kind}` }, text);
}

export function statusSelect(kind, current, options) {
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

export function sectionTitle(text) {
  return el('h3', { class: 'text-xs uppercase tracking-wider pal-muted font-semibold mb-2' }, text);
}

export function refCard(item, kind) {
  const card = el('div', { class: 'ref-card', onclick: () => select(kind, item.id) });
  card.appendChild(el('div', { class: 'flex items-baseline gap-2' },
    el('span', { class: 'text-sm font-medium pal-text' }, item.title || item.id),
    el('span', { class: 'text-xs pal-muted font-mono ml-auto' }, item.id),
  ));
  const meta = el('div', { class: 'mt-1 flex gap-2 text-xs' });
  if (item.status) meta.appendChild(badge(item.status, item.status));
  if (typeof item.priority === 'number') meta.appendChild(badge('priority', `p${item.priority}`));
  card.appendChild(meta);
  return card;
}

export function renderRefs(root, refs) {
  for (const ref of refs) {
    root.appendChild(sectionTitle(ref.label));
    if (!ref.items.length && ref.empty) {
      root.appendChild(el('div', { class: 'text-xs italic pal-muted mb-6' }, ref.empty));
      continue;
    }
    const grid = el('div', { class: 'grid grid-cols-1 md:grid-cols-2 gap-2 mb-6' });
    for (const item of ref.items) grid.appendChild(refCard(item, ref.kind));
    root.appendChild(grid);
  }
}

export function renderDetail() {
  const root = $('#detail');
  root.innerHTML = '';
  if (!state.selected) {
    root.appendChild(el('div', { class: 'pal-muted text-sm' }, 'Select a goal, task, or decision from the sidebar.'));
    return;
  }
  const { kind, id } = state.selected;
  const item = kind === 'goal' ? goalById(id) : kind === 'task' ? taskById(id) : decisionById(id);
  if (!item) { root.appendChild(el('div', { class: 'pal-muted' }, `${kind} not found.`)); return; }
  item.renderDetail(root);
}
