export const state = {
  data: { goals: [], tasks: [], decisions: [] },
  selected: null, // { kind: 'goal'|'task'|'decision', id: '...' }
  tab: 'hierarchy',
  lastSelectedByTab: { hierarchy: null, tasks: null, groups: null, decisions: null },
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'onclick') e.onclick = v;
    else if (k === 'onchange') e.onchange = v;
    else if (k.startsWith('data-')) e.setAttribute(k, v);
    else {
      try { e[k] = v; }
      catch { e.setAttribute(k, v); }
    }
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
};
