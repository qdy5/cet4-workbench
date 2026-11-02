// 应用外壳：导航、路由、公共状态。桌面版与离线版共用这一份。
import { detect } from './adapters/index.js';
import { dayKey, daysUntil, fmtInterval } from './core/date.js';
import { summarize, newWordsToday } from './core/stats.js';
import { normalizeCard } from './core/fsrs.js';

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5',
  words: 'M4 5h7v15H4zM13 5h7v15h-7z',
  listening: 'M4 13v-1a8 8 0 0 1 16 0v1M3 13h4v7H5a2 2 0 0 1-2-2zM21 13h-4v7h2a2 2 0 0 0 2-2z',
  reading: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM8 7h8M8 11h6',
  translation: 'M4 5h9M8.5 5c0 5-2 9-4.5 11M6 10c1.5 3 4 5 7 6M14 20l3.5-9 3.5 9M15.2 17h4.6',
  writing: 'M15.5 4.5 19.5 8.5 8 20H4v-4zM13.5 6.5l4 4',
  stats: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13.6H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 17 4.7l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
};

const NAV = [
  ['home', '总览'], ['words', '单词'], ['listening', '听力'], ['reading', '阅读'],
  ['translation', '翻译'], ['writing', '写作'], ['stats', '数据'], ['settings', '设置'],
];

const TITLES = {
  home: ['总览', '今天先把该复习的复习掉'],
  words: ['单词', '四档评分，按真实感觉点'],
  listening: ['听力', '先盲听，再对原文，注意连读'],
  reading: ['阅读', '先看题再读文，卡住就先跳过'],
  translation: ['翻译', '先自己写，再看采分点和参考译文'],
  writing: ['写作', '计时写完，对着自查清单改一遍'],
  stats: ['数据', '看得见的进步才算进步'],
  settings: ['设置', '同步、备份、参数都在这'],
};

export const S = {
  view: 'home',
  meta: null,
  cfg: { retention: 0.9, newPerDay: 30, learningSteps: [1, 10] },
  content: null,
  cards: new Map(),
  events: [],
  stats: null,
  info: null,
  busy: false,
};

let store = null;
const views = {};

export function toast(msg, ms = 1800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('on'), ms);
}

const byId = new Map();

export const ctx = {
  get store() { return store; },
  get S() { return S; },
  get content() { return S.content; },
  get meta() { return S.meta; },
  get cfg() { return S.cfg; },
  word(id) { return byId.get(Number(id)); },
  async info() {
    // 空数组说明上次没拿到，别缓存失败结果，下次再试
    if (!S.info || !S.info.length) S.info = await store.wordInfo();
    return S.info;
  },
  /** info.json 是「[音标, 例句, 例句中文, 搭配]」数组，这里统一转成对象 */
  infoFor(word) {
    if (!S.info || !word || !S.info.length) return {};
    const row = S.info[Number(word.id) - 1];
    if (!row) return {};
    if (!Array.isArray(row)) return row;
    return { ph: row[0] || '', e: row[1] || '', ec: row[2] || '', k: row[3] || '' };
  },
  dueWords(now = Date.now()) {
    const out = [];
    for (const w of S.content.words) {
      const c = S.cards.get(w.id);
      if (!c || c.state === 'new') continue;
      if (c.due <= now) out.push({ word: w, card: c });
    }
    out.sort((a, b) => a.card.due - b.card.due);
    return out;
  },
  newWordsLeft(now = Date.now()) {
    return Math.max(0, S.cfg.newPerDay - newWordsToday(S.events, now));
  },
  newWords(now = Date.now()) {
    const left = this.newWordsLeft(now);
    if (left <= 0) return [];
    const out = [];
    for (const w of S.content.words) {
      const c = S.cards.get(w.id);
      if (!c || c.state === 'new') out.push({ word: w, card: c || normalizeCard({}, now) });
      if (out.length >= left) break;
    }
    return out;
  },
  async gradeWord(word, rating, isNew) {
    const card = await store.grade(word.id, rating, Date.now());
    S.cards.set(word.id, card);
    await store.logEvent({
      ts: Date.now(), type: 'word', ref: String(word.id),
      correct: rating >= 3 ? 1 : 0, total: 1,
      detail: { rating, isNew: !!isNew, interval: card.due - Date.now() },
    });
    await this.reload({ soft: true });
    return card;
  },
  async logAttempt(ev) {
    await store.logEvent({ ts: Date.now(), ...ev });
    await this.reload({ soft: true });
  },
  async reload({ soft = false } = {}) {
    const [cards, events] = await Promise.all([store.cards(), store.events(4000)]);
    S.cards = new Map(cards.map(c => [c.wordId, c]));
    S.events = events;
    S.stats = summarize(S.events, [...S.cards.values()], Date.now());
    paintChrome();
    if (!soft && views[S.view] && views[S.view].refresh) views[S.view].refresh(ctx);
  },
  go,
  toast,
  fmtInterval,
};

function paintChrome() {
  const s = S.stats;
  if (!s) return;
  const due = ctx.dueWords().length;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('sf-streak', s.streak);
  set('sf-due', due);
  set('sf-today', s.today.total);
  set('pill-date', dayKey());
  set('pill-due', `待复习 ${due}`);
  set('pill-streak', `连续 ${s.streak} 天`);
  const left = S.meta ? daysUntil(S.meta.exam.date) : 0;
  set('page-sub', S.meta && S.view === 'home' ? `距 ${S.meta.exam.date} 还有 ${left} 天` : (TITLES[S.view] || ['', ''])[1]);
}

export function go(view) {
  if (!views[view]) view = 'home';
  S.view = view;
  for (const b of document.querySelectorAll('#nav button')) b.classList.toggle('on', b.dataset.view === view);
  const [title, sub] = TITLES[view] || ['', ''];
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-sub').textContent = sub;
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const v = views[view];
  v.render(ctx);
}

function buildNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = NAV.map(([v, label]) => `
    <button data-view="${v}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="${ICONS[v]}"/></svg><span>${label}</span></button>`).join('');
  nav.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) go(b.dataset.view);
  });
}

async function main() {
  buildNav();
  document.addEventListener('click', e => {
    const go_ = e.target.closest('[data-go]');
    if (go_) { e.preventDefault(); go(go_.dataset.go); return; }
    const back = e.target.closest('[data-back]');
    if (back) { e.preventDefault(); go(back.dataset.back); }
  });
  try {
    store = await detect();
    const meta = await store.init();
    S.meta = meta;
    const saved = await store.getConfig().catch(() => ({}));
    S.cfg = { ...S.cfg, ...(meta.schedule || {}), ...(saved || {}) };
    S.content = await store.content();
    for (const w of S.content.words) byId.set(Number(w.id), w);
    document.getElementById('brand-mode').textContent = store.mode === 'api' ? 'SQLITE' : 'OFFLINE';
    document.getElementById('sf-mode').textContent = store.mode === 'api'
      ? '本机数据库 · 可与手机互相导入导出'
      : '离线模式 · 进度存在这台设备';
    const mod = await import('./views/index.js');
    Object.assign(views, mod.default);
    await ctx.reload();
    go('home');
    if (store.mode === 'local' && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  } catch (e) {
    console.error(e);
    document.getElementById('app').innerHTML = `<div class="empty">加载失败：${e.message}<br>如果是第一次打开，需要联网加载一次数据。</div>`;
  }
}

main();
