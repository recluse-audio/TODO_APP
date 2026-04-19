import { state, el, $ } from '../core/state.js';
import { subGoalsOf, byPriorityDesc, allGroups } from '../core/data.js';
import { openModal } from './modal.js';

export function renderSidebar() {
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
