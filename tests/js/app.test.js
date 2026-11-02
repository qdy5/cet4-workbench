// 端到端：把静态站塞进 jsdom，走一遍「打开 → 背单词 → 落库」。
// 这条测试保证离线模式（fetch 404 + IndexedDB）真的能跑，而不是只在桌面接口下能跑。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { indexedDB } from 'fake-indexeddb';

const html = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf-8');
const DOCS = fileURLToPath(new URL('../../docs/', import.meta.url));
const requested = [];

const dom = new JSDOM(html, {
  url: 'http://localhost/cet4/index.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.indexedDB = indexedDB;
dom.window.scrollTo = () => {};
dom.window.speechSynthesis = undefined;

globalThis.fetch = async input => {
  const url = new URL(String(input), dom.window.document.baseURI);
  requested.push(url.href);
  if (url.pathname.endsWith('/api/health')) {
    return new Response('{"ok":false}', { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  const rel = url.pathname.replace(/^.*?\/cet4\//, '');
  const fsPath = `${DOCS}${rel}`;
  try {
    const body = readFileSync(fsPath, 'utf-8');
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (_) {
    return new Response('not found', { status: 404 });
  }
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const click = el => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

async function waitFor(fn, { timeout = 8000, label = '条件' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`等待超时：${label}`);
    await sleep(40);
  }
}

test('离线模式能启动、能背单词、进度落到 IndexedDB', async () => {
  await import('../../web/app.js');

  const hero = await waitFor(() => document.querySelector('.hero'), { label: '首页渲染' });
  assert.match(hero.textContent, /天后考试/);

  // 侧栏 8 个入口
  assert.equal(document.querySelectorAll('#nav button').length, 8);
  assert.match(document.getElementById('brand-mode').textContent, /OFFLINE/);

  // 单词页
  click(document.querySelector('#nav button[data-view="words"]'));
  const card = await waitFor(() => document.querySelector('.quiz-card'), { label: '单词卡' });
  assert.ok(card);
  const opts = document.querySelectorAll('#wopts .opt');
  assert.equal(opts.length, 4, '应该有 4 个选项');
  const answers = [...opts].map(o => o.textContent.trim());
  assert.equal(new Set(answers).size, 4, '选项不能重复');

  // 音标要真的渲染出来（info.json 下标错位过一次，加断言防回退）
  const words = JSON.parse(readFileSync(`${DOCS}data/words.json`, 'utf-8'));
  const info = JSON.parse(readFileSync(`${DOCS}data/info.json`, 'utf-8'));
  const shown = document.querySelector('.word-en2').textContent.trim();
  const idx = words.findIndex(w => w.w === shown);
  assert.ok(idx >= 0, `词表里找不到 ${shown}`);
  assert.equal(document.querySelector('.word-ph2').textContent.trim(), (info[idx][0] || '').trim(),
    '音标应与 info.json 对应项一致');

  // 作答
  click(opts[0]);
  const ans = await waitFor(() => document.querySelector('.answer'), { label: '答题反馈' });
  assert.ok(ans.textContent.length > 0);

  // 下一题 → 落库
  click(document.getElementById('wnext'));
  const { idb } = await import('../../web/adapters/idb.js');
  const events = await waitFor(async () => {
    const list = await idb.all('events');
    return list.length ? list : null;
  }, { label: '事件写入' });
  assert.equal(events[0].type, 'word');
  assert.equal(events[0].total, 1);

  const cards = await idb.all('cards');
  assert.equal(cards.length, 1);
  assert.ok(cards[0].due > Date.now() - 1000);
  assert.ok(['learning', 'review'].includes(cards[0].state));

  // 统计口径：背单词也算活跃
  const sub = await waitFor(() => {
    const el = document.getElementById('sf-today');
    return el && el.textContent !== '0' ? el.textContent : null;
  }, { label: '今日计数' });
  assert.equal(sub, '1');

  // 不该有任何外部请求
  const external = requested.filter(u => !u.startsWith('http://localhost/cet4/'));
  assert.deepEqual(external, []);
});
