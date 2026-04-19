import { state, $$ } from '../core/state.js';
import { renderSidebar } from './sidebar.js';
import { renderDetail } from './detail.js';

export function render() {
  renderSidebar();
  renderDetail();
}

export function select(kind, id) {
  state.selected = { kind, id };
  state.lastSelectedByTab[state.tab] = { kind, id };
  localStorage.setItem('todo_selected', JSON.stringify({ kind, id }));
  localStorage.setItem('todo_last_by_tab', JSON.stringify(state.lastSelectedByTab));
  render();
}

export function setTab(tab) {
  state.tab = tab;
  localStorage.setItem('todo_tab', tab);
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const remembered = state.lastSelectedByTab[tab];
  const allIds = new Set([
    ...state.data.goals.map(g => g.id),
    ...state.data.tasks.map(t => t.id),
    ...(state.data.decisions || []).map(d => d.id),
  ]);
  if (remembered && allIds.has(remembered.id)) {
    state.selected = remembered;
  }
  render();
}
