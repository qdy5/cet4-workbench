// 桌面适配器：Flask + SQLite。接口和 local 完全一致，视图层不感知差异。
// 排程算法仍然只在 core/fsrs.js 里算，后端只负责存，避免两端算出不同结果。
import { normalizeCard, review, newCard } from '../core/fsrs.js';
import { normalizeEvent } from '../core/stats.js';

const api = (path, opts = {}) => fetch(`api/${path}`, {
  headers: { 'Content-Type': 'application/json' },
  ...opts,
});

async function jget(path) {
  const r = await api(path, { method: 'GET' });
  if (!r.ok) throw new Error(`接口 ${path} 返回 ${r.status}`);
  return r.json();
}

async function jdelete(path) {
  const r = await api(path, { method: 'DELETE' });
  if (!r.ok) throw new Error('DELETE ' + path + ' -> ' + r.status);
  return r.json().catch(() => ({}));
}

async function jpost(path, body) {
  const r = await api(path, { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`接口 ${path} 返回 ${r.status}`);
  return r.json();
}

export function createApiAdapter() {
  let cfg = { retention: 0.9, newPerDay: 30, learningSteps: [1, 10] };
  let contentCache = null;

  return {
    mode: 'api',
    get canAsk() { return true; },

    async init() {
      const meta = await jget('meta');
      cfg = { ...cfg, ...(meta.schedule || {}) };
      try {
        cfg = { ...cfg, ...(await jget('settings')) };
      } catch (_) { /* 老库没有 settings 表时忽略 */ }
      return meta;
    },

    async getConfig() {
      return cfg;
    },

    async setConfig(patch) {
      cfg = { ...cfg, ...(await jpost('settings', patch)) };
      return cfg;
    },

    async content() {
      if (contentCache) return contentCache;
      const [meta, words, reading, listening, translation, writing] = await Promise.all([
        jget('meta'), jget('words'), jget('reading'), jget('listening'),
        jget('translation'), jget('writing'),
      ]);
      contentCache = { meta, words, reading, listening, translation, writing };
      return contentCache;
    },

    async wordInfo() {
      try {
        return await jget('info');
      } catch (_) {
        return [];
      }
    },

    async cards() {
      const list = await jget('cards');
      return list.map(c => normalizeCard(c));
    },

    async card(wordId) {
      const c = await jget(`cards/${wordId}`);
      return c && c.wordId ? normalizeCard(c) : newCard();
    },

    async grade(wordId, rating, now = Date.now()) {
      const cur = await jget(`cards/${wordId}`);
      const before = cur && cur.wordId ? normalizeCard(cur) : newCard(now);
      const next = review(before, rating, now, cfg);
      await jpost(`cards/${wordId}`, next);
      return next;
    },

    async events(limit = 0) {
      const list = await jget(`events${limit ? `?limit=${limit}` : ''}`);
      return list.map(normalizeEvent);
    },

    async logEvent(ev) {
      await jpost('events', normalizeEvent(ev));
    },

    async draft(key) {
      const d = await jget(`drafts/${encodeURIComponent(key)}`);
      return d.text || '';
    },

    async saveDraft(key, text) {
      await jpost(`drafts/${encodeURIComponent(key)}`, { text });
    },

    async lookup(q) {
      return jget('lookup?q=' + encodeURIComponent(q));
    },

    async favorites() {
      return jget('favorites');
    },

    async addFavorite(f) {
      return jpost('favorites', f);
    },

    async removeFavorite(id) {
      return jdelete('favorites/' + id);
    },

    async checkins() {
      return jget('checkins');
    },

    async checkin() {
      return jpost('checkin', {});
    },

    async exportAll() {
      return jget('export');
    },

    async importAll(obj, { merge = true } = {}) {
      return jpost('import', { ...obj, merge });
    },

    async reset() {
      await jpost('reset', {});
    },

    /** SSE 流式答疑，返回完整文本；不可用时返回 null */
    async ask(q, onChunk) {
      try {
        const r = await api('ask', { method: 'POST', body: JSON.stringify({ q }), headers: { 'Content-Type': 'application/json' } });
        if (!r.ok || !r.body) return null;
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        let out = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() || '';
          for (const chunk of parts) {
            const line = chunk.split('\n').find(l => l.startsWith('data:'));
            if (!line) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const { delta } = JSON.parse(payload);
              if (delta) { out += delta; onChunk && onChunk(delta, out); }
            } catch (_) { /* 忽略心跳 */ }
          }
        }
        return out;
      } catch (_) {
        return null;
      }
    },
  };
}
