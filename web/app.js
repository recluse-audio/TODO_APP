// TODO viewer — frontend entry point.

import { state, $, $$ } from './core/state.js';
import { api } from './core/api.js';
import { topLevelGoals } from './core/data.js';
import { wrapSnapshot } from './views/index.js';
import { initModal } from './ui/modal.js';
import { render, setTab } from './ui/render.js';

async function bootstrap() {
  initModal();
  $$('.tab-btn').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  try {
    state.data = wrapSnapshot(await api('/api/data'));
    const savedLastByTab = JSON.parse(localStorage.getItem('todo_last_by_tab') || 'null');
    if (savedLastByTab && typeof savedLastByTab === 'object') {
      for (const k of ['hierarchy', 'tasks', 'groups', 'decisions']) {
        if (savedLastByTab[k]) state.lastSelectedByTab[k] = savedLastByTab[k];
      }
    }
    const savedTab = localStorage.getItem('todo_tab');
    const initialTab = ['hierarchy', 'tasks', 'groups', 'decisions'].includes(savedTab) ? savedTab : 'hierarchy';
    state.tab = initialTab;
    $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === initialTab));

    const allIds = new Set([
      ...state.data.goals.map(g => g.id),
      ...state.data.tasks.map(t => t.id),
      ...(state.data.decisions || []).map(d => d.id),
    ]);
    const remembered = state.lastSelectedByTab[initialTab];
    const saved = JSON.parse(localStorage.getItem('todo_selected') || 'null');
    if (remembered && allIds.has(remembered.id)) {
      state.selected = remembered;
    } else if (saved && allIds.has(saved.id)) {
      state.selected = saved;
    } else {
      const first = topLevelGoals()[0];
      if (first) state.selected = { kind: 'goal', id: first.id };
    }
    render();
  } catch (e) {
    $('#detail').textContent = 'Failed to load data: ' + e.message;
  }
  const es = new EventSource('/api/events');
  es.onopen = () => { $('#conn-indicator').textContent = 'live'; $('#conn-indicator').className = 'text-xs text-emerald-400'; };
  es.onerror = () => { $('#conn-indicator').textContent = 'disconnected'; $('#conn-indicator').className = 'text-xs text-rose-400'; };
  es.onmessage = (msg) => {
    const event = JSON.parse(msg.data);
    if (event.snapshot) {
      state.data = wrapSnapshot(event.snapshot);
      render();
    }
  };
}

bootstrap();
