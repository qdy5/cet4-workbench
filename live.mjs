import { JSDOM } from 'jsdom';
import { indexedDB } from 'fake-indexeddb';
const BASE = 'https://qdy5.github.io/cet4-workbench/';
const html = await (await fetch(BASE)).text();
const dom = new JSDOM(html, { url: BASE + 'index.html', runScripts: 'outside-only', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.indexedDB = indexedDB;
dom.window.scrollTo = () => {};
process.on('unhandledRejection', e => console.log('UNHANDLED', e && e.stack || e));
dom.window.addEventListener('error', e => console.log('WINDOW ERROR', e.message));
const origErr = console.error; console.error = (...a) => origErr('CONSOLE', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const _f = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  const t0 = Date.now();
  try { const r = await _f(u, o); console.log('FETCH', String(u).slice(-40), r.status, (Date.now()-t0)+'ms'); return r; }
  catch (e) { console.log('FETCH FAIL', String(u).slice(-40), e.message); throw e; }
};
await import('./web/app.js');
for (let i = 0; i < 100 && !document.querySelector('.hero'); i++) await sleep(100);
const hero = document.querySelector('.hero');
console.log('hero:', !!hero, '| nav:', document.querySelectorAll('#nav button').length, '| mode:', document.getElementById('brand-mode').textContent);
console.log('kpi:', [...document.querySelectorAll('.kpi .value')].map(e => e.textContent).join(' | '));
document.querySelector('#nav button[data-view="words"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
for (let i = 0; i < 100 && !document.querySelector('.quiz-card'); i++) await sleep(100);
console.log('words html:', document.getElementById('app').innerHTML.slice(0, 300));
const opts = [...document.querySelectorAll('#wopts .opt')].map(o => o.textContent.trim());
console.log('quiz:', !!document.querySelector('.quiz-card'), '| opts:', JSON.stringify(opts));
console.log('word:', document.querySelector('.word-en2')?.textContent, '| phonetic:', document.querySelector('.word-ph2')?.textContent);
