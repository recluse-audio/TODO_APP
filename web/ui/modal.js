import { el } from '../core/state.js';
import { VIEW_CLASSES } from '../views/index.js';

let modalEl = null;

export function initModal() {
  modalEl = el('div', { id: 'modal', class: 'modal-backdrop hidden' });
  document.body.appendChild(modalEl);
  modalEl.onclick = (e) => { if (e.target === modalEl) closeModal(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

export function closeModal() {
  if (!modalEl) return;
  modalEl.innerHTML = '';
  modalEl.classList.add('hidden');
}

export function openModal(kind, opts = {}) {
  modalEl.innerHTML = '';
  modalEl.classList.remove('hidden');
  const dialog = el('div', { class: 'modal-dialog' });
  const hdr = el('div', { class: 'modal-header' });
  const title = kind === 'goal' ? 'New GOAL'
    : kind === 'decision' ? 'New DECISION'
    : opts.criterionText ? `New TASK → ${opts.criterionText}` : 'New TASK';
  hdr.appendChild(el('h2', { class: 'text-base font-semibold text-slate-100' }, title));
  hdr.appendChild(el('button', { class: 'modal-close', type: 'button', onclick: closeModal }, '×'));
  dialog.appendChild(hdr);
  dialog.appendChild(VIEW_CLASSES[kind].buildForm(opts));
  modalEl.appendChild(dialog);
  const first = dialog.querySelector('input, textarea');
  if (first) setTimeout(() => first.focus(), 0);
}
