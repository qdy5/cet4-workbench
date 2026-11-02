// 离线适配器：网页完全静态，进度存 IndexedDB。断网、断电脑都能用。
import { idb } from './idb.js';
import { normalizeCard, review, newCard } from '../core/fsrs.js';
import { mergeCards, mergeEvents, normalizeEvent } from '../core/stats.js';

// 相对站点根解析（GitHub Pages 是 /cet4-workbench/ 这种子路径，不能用 ../data/）
const base = () => new URL('data/', document.baseURI).href;
const cache = new Map();

async function json(name) {
  if (cache.has(name)) return cache.get(name);
  // 加超时：弱网下卡住不该把整个页面钉死
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 16000);
    try {
      const res = await fetch(base() + name, { cache: 'no-cache', signal: ctl.signal });
      if (!res.ok) throw new Error(`加载 ${name} 失败（${res.status}）`);
      const data = await res.json();
      cache.set(name, data);
      return data;
    } catch (err) {
      if (attempt === 1) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`加载 ${name} 失败`);
}

export function createLocalAdapter() {
  let cfg = { retention: 0.9, newPerDay: 30, learningSteps: [1, 10] };
  let contentCache = null;

  return {
    mode: 'local',
    get canAsk() { return false; },

    async init() {
      const meta = await json('meta.json');
      cfg = { ...cfg, ...(meta.schedule || {}) };
      const saved = await idb.get('meta', 'cfg');
      if (saved && saved.value) cfg = { ...cfg, ...saved.value };
      return meta;
    },

    async getConfig() {
      return cfg;
    },

    async setConfig(patch) {
      cfg = { ...cfg, ...patch };
      await idb.put('meta', { k: 'cfg', value: cfg });
      return cfg;
    },

    async content() {
      if (contentCache) return contentCache;
      const [meta, words, reading, listening, translation, writing] = await Promise.all([
        json('meta.json'), json('words.json'), json('reading.json'),
        json('listening.json'), json('translation.json'), json('writing.json'),
      ]);
      contentCache = { meta, words, reading, listening, translation, writing };
      return contentCache;
    },

    /** 音标/例句单独一份，首屏不必等它 */
    async wordInfo() {
      try {
        return await json('info.json');
      } catch (_) {
        return [];
      }
    },

    async cards() {
      const list = await idb.all('cards');
      return list.map(c => normalizeCard(c));
    },

    async card(wordId) {
      const c = await idb.get('cards', wordId);
      return c ? normalizeCard(c) : newCard();
    },

    async grade(wordId, rating, now = Date.now()) {
      const cur = await idb.get('cards', wordId);
      const before = cur ? normalizeCard(cur) : newCard(now);
      const next = review(before, rating, now, cfg);
      await idb.put('cards', { wordId, ...next, lastBefore: before.last });
      return next;
    },

    async events(limit = 0) {
      const all = (await idb.all('events')).map(normalizeEvent).sort((a, b) => b.ts - a.ts);
      return limit ? all.slice(0, limit) : all;
    },

    async logEvent(ev) {
      const e = normalizeEvent(ev);
      await idb.put('events', {
        ...e,
        id: e.id || `${e.ts}-${Math.random().toString(36).slice(2, 8)}`,
      });
    },

    async draft(key) {
      const d = await idb.get('drafts', key);
      return d ? d.text : '';
    },

    async saveDraft(key, text) {
      await idb.put('drafts', { key, text, ts: Date.now() });
    },

    async exportAll() {
      const [cards, events, drafts] = await Promise.all([idb.all('cards'), idb.all('events'), idb.all('drafts')]);
      return { version: 2, mode: 'local', exportedAt: Date.now(), cards, events, drafts };
    },

    async importAll(obj, { merge = true } = {}) {
      const cards = Array.isArray(obj.cards) ? obj.cards : [];
      const events = Array.isArray(obj.events) ? obj.events.map(normalizeEvent) : [];
      if (merge) {
        const [oldCards, oldEvents] = await Promise.all([idb.all('cards'), idb.all('events')]);
        await idb.bulkPut('cards', mergeCards(oldCards, cards));
        await idb.bulkPut('events', mergeEvents(oldEvents.map(normalizeEvent), events));
      } else {
        await idb.clear('cards');
        await idb.clear('events');
        await idb.bulkPut('cards', cards);
        await idb.bulkPut('events', events);
      }
      return { cards: cards.length, events: events.length };
    },

    async reset() {
      await Promise.all(Object.keys({ cards: 1, events: 1, drafts: 1 }).map(s => idb.clear(s)));
    },

    async ask() {
      return null;
    },
  };
}
