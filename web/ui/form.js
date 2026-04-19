import { el } from '../core/state.js';

export function formField(labelText, required, input) {
  const wrap = el('div', { class: 'form-field' });
  const label = el('label', { class: 'form-label' }, labelText);
  if (required) label.appendChild(el('span', { class: 'text-rose-400' }, ' *'));
  wrap.appendChild(label);
  wrap.appendChild(input);
  return wrap;
}

export function buildDynamicList(placeholder) {
  const rows = el('div', { class: 'space-y-1 mb-1' });
  const wrap = el('div');
  wrap.appendChild(rows);
  const addBtn = el('button', { type: 'button', class: 'form-add-btn' }, '+ Add');
  addBtn.onclick = () => {
    const row = el('div', { class: 'dynamic-row' });
    const input = el('input', { type: 'text', class: 'form-input', placeholder });
    const rm = el('button', { type: 'button', class: 'dynamic-remove' }, '×');
    rm.onclick = () => row.remove();
    row.appendChild(input);
    row.appendChild(rm);
    rows.appendChild(row);
    input.focus();
  };
  wrap.appendChild(addBtn);
  wrap.getValues = () => Array.from(rows.querySelectorAll('input')).map(i => i.value.trim()).filter(Boolean);
  return wrap;
}
