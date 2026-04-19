import { state } from './state.js';

export async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

export async function post(path, payload) {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function changeStatus(kind, id, newStatus) {
  try { await post('/api/status', { kind, id, status: newStatus }); }
  catch (e) { console.error(e); }
}

export async function deleteItem(kind, id) {
  const msg = kind === 'decision'
    ? `Delete this decision?`
    : `Delete this ${kind}? Associated ${kind === 'goal' ? 'tasks' : 'goals'} will be unlinked but not deleted.`;
  if (!confirm(msg)) return;
  try {
    await post(`/api/${kind}/delete`, { id });
    state.selected = null;
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}
