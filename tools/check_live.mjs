// 线上冒烟检查：把 GitHub Pages 上的站点塞进 jsdom，确认能启动、能出词卡、音标对得上。
// 用过一次就抓到「音标取错下标」的线上 bug，所以留着当发布后检查。
// 用法：node tools/check_live.mjs [baseUrl]
import { JSDOM } from 'jsdom';
import { indexedDB } from 'fake-indexeddb';

const BASE = (process.argv[2] || 'https://qdy5.github.io/cet4-workbench/').replace(/\/?$/, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = msg => { console.error('✗', msg); process.exit(1); };

const html = await (await fetch(BASE)).text();
if (!html.includes('CET4 学习工作台')) fail('首页没拿到');

const dom = new JSDOM(html, { url: `${BASE}index.html`, runScripts: 'outside-only', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.indexedDB = indexedDB;
dom.window.scrollTo = () => {};

const requests = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (input, opts) => {
  requests.push(String(input));
  return realFetch(input, opts);
};

await import('../web/app.js');

for (let i = 0; i < 300 && !document.querySelector('.hero'); i += 1) await sleep(100);
const hero = document.querySelector('.hero');
if (!hero) fail('首页没渲染出来');
console.log('✓ 首页渲染，模式', document.getElementById('brand-mode').textContent,
  '，导航', document.querySelectorAll('#nav button').length, '项');

document.querySelector('#nav button[data-view="words"]')
  .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

for (let i = 0; i < 300 && !document.querySelector('.quiz-card'); i += 1) await sleep(100);
const card = document.querySelector('.quiz-card');
if (!card) fail('单词卡没出来');
const opts = [...document.querySelectorAll('#wopts .opt')].map(o => o.textContent.trim());
if (opts.length !== 4 || new Set(opts).size !== 4) fail(`选项异常：${JSON.stringify(opts)}`);

const shown = document.querySelector('.word-en2').textContent.trim();
const info = await (await fetch(`${BASE}data/info.json`)).json();
const words = await (await fetch(`${BASE}data/words.json`)).json();
const idx = words.findIndex(w => w.w === shown);
const ph = document.querySelector('.word-ph2').textContent.trim();
if (idx < 0) fail(`词表里找不到 ${shown}`);
if (ph !== (info[idx][0] || '').trim()) fail(`音标对不上：页面「${ph}」 vs 数据「${info[idx][0]}」`);
console.log('✓ 词卡正常：', shown, ph || '(无音标)', '| 选项 4 个不重复');

// 答题 → 进度落到 IndexedDB
document.querySelector('#wopts .opt').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
for (let i = 0; i < 50 && !document.querySelector('.answer'); i += 1) await sleep(100);
if (!document.querySelector('.answer')) fail('答题反馈没出来');
document.getElementById('wnext').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

const { idb } = await import('../web/adapters/idb.js');
let events = [];
for (let i = 0; i < 50 && !events.length; i += 1) {
  await sleep(100);
  events = await idb.all('events');
}
if (!events.length) fail('答题事件没写进 IndexedDB');
console.log('✓ 答题落库：', events[0].type, events[0].correct ? '对' : '错');

const origin = new URL(BASE).origin;
const external = requests.filter(u => {
  try { return new URL(u, `${BASE}index.html`).origin !== origin; } catch (_) { return true; }
});
if (external.length) fail(`请求跑到站外了：${external.slice(0, 3).join(', ')}`);
console.log('✓ 全部请求都在站内');

const sw = await (await fetch(`${BASE}sw.js`)).text();
const ver = (sw.match(/const VER = '([^']+)'/) || [])[1] || '';
const assets = JSON.parse((sw.match(/const ASSETS = (\[[\s\S]*?\]);/) || [])[1] || '[]');
console.log(`✓ Service Worker ${ver}，预缓存 ${assets.length} 个文件`);
console.log('\n线上检查通过。');
