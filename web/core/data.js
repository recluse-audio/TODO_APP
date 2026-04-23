import { state } from './state.js';

export const goalById = (id) => state.data.goals.find(g => g.id === id);
export const taskById = (id) => state.data.tasks.find(t => t.id === id);
export const decisionById = (id) => (state.data.decisions || []).find(d => d.id === id);
export const tasksForGoal = (gid) => state.data.tasks.filter(t => Array.isArray(t.goals) && t.goals.includes(gid));
export const byPriorityDesc = (a, b) => (b.priority ?? -Infinity) - (a.priority ?? -Infinity);
export const subGoalsOf = (gid) => state.data.goals.filter(g => g.parent_goal === gid).sort(byPriorityDesc);
export const topLevelGoals = () => state.data.goals.filter(g => !g.parent_goal).sort(byPriorityDesc);

// Deterministic color for a group name. The root segment (before the first '-')
// picks the hue so nested sub-groups ("project-alpha", "project-beta") share a
// color family; depth nudges lightness so sub-groups are visually distinguishable.
export const groupColor = (name) => {
  if (!name) return null;
  const root = name.split('-')[0];
  let h = 0;
  for (let i = 0; i < root.length; i++) h = (h * 31 + root.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const depth = (name.match(/-/g) || []).length;
  const light = Math.max(55, 78 - depth * 6);
  return {
    fg: `hsl(${hue} 85% ${light}%)`,
    bg: `hsl(${hue} 70% ${light}% / 0.15)`,
    border: `hsl(${hue} 70% ${light}% / 0.4)`,
  };
};

export const allGroups = () => {
  const s = new Set();
  for (const g of state.data.goals) for (const grp of (g.groups || [])) s.add(grp);
  for (const t of state.data.tasks) for (const grp of (t.groups || [])) s.add(grp);
  for (const d of (state.data.decisions || [])) for (const grp of (d.groups || [])) s.add(grp);
  return Array.from(s).sort();
};
