// 统计全部从事件流派生：桌面版和离线版共用同一套口径，避免「只背单词不算连续」这类分叉。
import { dayKey, addDays, DAY } from './date.js';

export function normalizeEvent(e = {}) {
  return {
    id: e.id || '',
    ts: Number(e.ts) || 0,
    type: e.type || 'unknown',
    ref: String(e.ref ?? ''),
    correct: Number(e.correct) || 0,
    total: Number(e.total) || 0,
    seconds: Number(e.seconds) || 0,
    detail: e.detail || {},
  };
}

/** 事件流里出现过的日期集合 */
export function activeDays(events) {
  const s = new Set();
  for (const e of events) if (e.ts) s.add(dayKey(e.ts));
  return s;
}

/**
 * 连续天数：今天有记录就从今天往前数；今天还没开始就从昨天往前数（当天不算断）。
 */
export function streak(days, now = Date.now()) {
  const today = dayKey(now);
  let cursor = days.has(today) ? today : addDays(today, -1);
  if (!days.has(cursor)) return 0;
  let n = 0;
  while (days.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/** 最近 n 天的每日练习次数（含今天，最后一项是今天） */
export function lastDays(events, n = 7, now = Date.now()) {
  const map = new Map();
  for (const e of events) {
    const k = dayKey(e.ts);
    map.set(k, (map.get(k) || 0) + 1);
  }
  const out = [];
  const today = dayKey(now);
  for (let i = n - 1; i >= 0; i -= 1) {
    const k = addDays(today, -i);
    out.push({ day: k, count: map.get(k) || 0 });
  }
  return out;
}

export function byModule(events) {
  const out = {};
  for (const e of events) {
    const m = (out[e.type] = out[e.type] || { n: 0, correct: 0, total: 0, seconds: 0 });
    m.n += 1;
    m.correct += e.correct || 0;
    m.total += e.total || 0;
    m.seconds += e.seconds || 0;
  }
  for (const m of Object.values(out)) m.acc = m.total ? m.correct / m.total : null;
  return out;
}

export function todayCount(events, now = Date.now()) {
  const k = dayKey(now);
  const out = { total: 0, words: 0, newWords: 0 };
  for (const e of events) {
    if (dayKey(e.ts) !== k) continue;
    out.total += 1;
    if (e.type === 'word') {
      out.words += 1;
      if (e.detail && e.detail.isNew) out.newWords += 1;
    }
  }
  return out;
}

/** 今天已经引入的新词数量，用来卡每日新词上限 */
export function newWordsToday(events, now = Date.now()) {
  return todayCount(events, now).newWords;
}

/**
 * @param {Array} events
 * @param {Array} cards [{wordId, s, d, due, state, reps, lapses, last}]
 */
export function summarize(events, cards = [], now = Date.now()) {
  const days = activeDays(events);
  const mods = byModule(events);
  const weak = cards
    .filter(c => (c.lapses || 0) > 0)
    .sort((a, b) => b.lapses - a.lapses || b.reps - a.reps)
    .slice(0, 20);
  return {
    streak: streak(days, now),
    activeDays: days.size,
    totalEvents: events.length,
    days: lastDays(events, 7, now),
    modules: mods,
    today: todayCount(events, now),
    weak,
  };
}

/** 合并两份进度（导入备份 / 双端合并用）：同一天同类型事件去重，卡片取复习次数多的 */
export function mergeEvents(a, b) {
  const key = e => `${e.ts}|${e.type}|${e.ref}|${e.correct}`;
  const map = new Map();
  for (const e of [...a, ...b]) map.set(key(e), e);
  return [...map.values()].sort((x, y) => x.ts - y.ts);
}

export function mergeCards(a, b) {
  const map = new Map();
  for (const c of a) map.set(c.wordId, c);
  for (const c of b) {
    const old = map.get(c.wordId);
    if (!old || (c.reps || 0) > (old.reps || 0)) map.set(c.wordId, c);
  }
  return [...map.values()];
}

export const DAY_MS = DAY;
