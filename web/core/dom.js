export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function on(el, ev, fn, opts) {
  if (el) el.addEventListener(ev, fn, opts);
}

export function pickText(arr) {
  return Array.isArray(arr) && arr.length ? String(arr[0]) : '';
}
