import { state, el, $ } from '../core/state.js';
import { subGoalsOf, byPriorityDesc, allGroups, groupColor } from '../core/data.js';

export function renderSidebar() {
  const sb = $('#sidebar');
  sb.innerHTML = '';
  sb.appendChild(renderGroupFilter());

  if (state.tab === 'hierarchy') renderHierarchy(sb);
  else if (state.tab === 'tasks') renderTasksList(sb);
  else if (state.tab === 'decisions') renderDecisionsList(sb);
}

// --- Group filter (global, applied to all tabs) ---

function renderGroupFilter() {
  const sel = state.selectedGroup;
  const groups = allGroups().sort();
  const depthOf = (g) => (g.match(/-/g) || []).length;
  const labelFor = (g) => '    '.repeat(depthOf(g)) + g;

  const dropdown = el('select', {
    class: 'group-select',
    onchange: (e) => {
      const v = e.target.value;
      state.selectedGroup = v === '__all' ? null : v === '__ungrouped' ? '' : v;
      if (state.selectedGroup === null) localStorage.removeItem('todo_selected_group');
      else localStorage.setItem('todo_selected_group', state.selectedGroup);
      renderSidebar();
    },
  });
  const mkOpt = (value, text, selected) => {
    const o = el('option', { value }, text);
    if (selected) o.selected = true;
    return o;
  };
  dropdown.appendChild(mkOpt('__all', '(all groups)', sel === null));
  dropdown.appendChild(mkOpt('__ungrouped', '(ungrouped)', sel === ''));
  for (const g of groups) {
    const o = mkOpt(g, labelFor(g), sel === g);
    const c = groupColor(g);
    if (c) o.style.color = c.fg;
    dropdown.appendChild(o);
  }
  if (sel) {
    const c = groupColor(sel);
    if (c) dropdown.style.color = c.fg;
  } else {
    dropdown.style.color = '';
  }
  return dropdown;
}

function matchesGroup(item) {
  const sel = state.selectedGroup;
  if (sel === null) return true;
  const groups = Array.isArray(item.groups) ? item.groups : [];
  if (sel === '') return groups.length === 0;
  return groups.some(g => g === sel || g.startsWith(sel + '-'));
}

// --- Tab renderers ---

function renderHierarchy(sb) {
  const sections = [
    { label: 'Active', statuses: ['active'] },
    { label: 'Todo', statuses: ['todo', 'someday'] },
    { label: 'Completed', statuses: ['completed'] },
    { label: 'Abandoned', statuses: ['abandoned'] },
  ];
  // Keep a goal if it matches the group filter OR any descendant matches,
  // so the tree retains context when filtering.
  const keepCache = new Map();
  const keep = (g) => {
    if (keepCache.has(g.id)) return keepCache.get(g.id);
    const self = matchesGroup(g);
    const children = subGoalsOf(g.id);
    const any = self || children.some(c => keep(c));
    keepCache.set(g.id, any);
    return any;
  };

  const renderNode = (g) => {
    const node = el('div', {}, g.renderSidebarItem());
    const subs = subGoalsOf(g.id).filter(keep);
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
      .filter(keep)
      .sort(byPriorityDesc);
    sb.appendChild(el('div', { class: 'sb-section-title' }, sec.label));
    for (const g of goals) sb.appendChild(renderNode(g));
  }
}

function renderStatusSections(sb, items, sections) {
  for (const sec of sections) {
    const picked = items.filter(i => sec.statuses.includes(i.status)).filter(matchesGroup).sort(byPriorityDesc);
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
