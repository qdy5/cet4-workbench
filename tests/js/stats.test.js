import test from 'node:test';
import assert from 'node:assert/strict';
import {
  summarize, streak, lastDays, byModule, todayCount, newWordsToday, mergeEvents, mergeCards, normalizeEvent,
} from '../../web/core/stats.js';
import { dayStart, dayKey, DAY } from '../../web/core/date.js';

const at = (dayOffset, hour = 10, now = Date.now()) => dayStart(dayKey(now + dayOffset * DAY)) + hour * 3600000;

function ev(ts, type = 'word', correct = 1, total = 1, detail = {}) {
  return { id: `${ts}-${type}`, ts, type, ref: '1', correct, total, seconds: 5, detail };
}

test('连续天数：今天没练但昨天练了，不算断', () => {
  const now = dayStart('2026-11-02') + 10 * 3600000;
  const days = new Set(['2026-11-01', '2026-10-31']);
  assert.equal(streak(days, now), 2);
});

test('连续天数：断了就是 0', () => {
  const now = dayStart('2026-11-02') + 10 * 3600000;
  assert.equal(streak(new Set(['2026-10-30']), now), 0);
});

test('连续天数：含今天连续 3 天', () => {
  const now = dayStart('2026-11-02') + 10 * 3600000;
  assert.equal(streak(new Set(['2026-11-02', '2026-11-01', '2026-10-31']), now), 3);
});

test('背单词也算活跃（不再依赖 attempts 表）', () => {
  const now = dayStart('2026-11-02') + 20 * 3600000;
  const events = [ev(now - 3600000, 'word'), ev(now - 7200000, 'word')];
  const s = summarize(events, [], now);
  assert.equal(s.streak, 1);
  assert.equal(s.today.words, 2);
  assert.equal(s.today.total, 2);
});

test('新词额度只数 isNew 的事件', () => {
  const now = Date.now();
  const events = [
    ev(now, 'word', 1, 1, { isNew: true }),
    ev(now, 'word', 1, 1, { isNew: true }),
    ev(now, 'word', 1, 1, { isNew: false }),
  ];
  assert.equal(newWordsToday(events, now), 2);
  assert.equal(todayCount(events, now).words, 3);
});

test('7 天序列长度固定、最后一项是今天', () => {
  const now = dayStart('2026-11-02') + 12 * 3600000;
  const days = lastDays([ev(now), ev(at(-3, 9, now))], 7, now);
  assert.equal(days.length, 7);
  assert.equal(days[6].day, '2026-11-02');
  assert.equal(days[6].count, 1);
  assert.equal(days[3].count, 1);
});

test('模块正确率', () => {
  const now = Date.now();
  const m = byModule([ev(now, 'reading', 3, 5), ev(now, 'reading', 4, 5), ev(now, 'translation', 2, 4)]);
  assert.equal(m.reading.n, 2);
  assert.equal(m.reading.acc, 0.7);
  assert.equal(m.translation.acc, 0.5);
});

test('合并事件去重、合并卡片取复习多的', () => {
  const now = Date.now();
  const a = [ev(now, 'word')];
  const b = [ev(now, 'word'), ev(now + 1000, 'word')];
  assert.equal(mergeEvents(a, b).length, 2);
  const cards = mergeCards([{ wordId: 1, reps: 3 }], [{ wordId: 1, reps: 5 }, { wordId: 2, reps: 1 }]);
  assert.equal(cards.find(c => c.wordId === 1).reps, 5);
  assert.equal(cards.length, 2);
});

test('薄弱词按遗忘次数排序', () => {
  const now = Date.now();
  const cards = [
    { wordId: 1, lapses: 3, reps: 5, due: now },
    { wordId: 2, lapses: 0, reps: 5, due: now },
    { wordId: 3, lapses: 7, reps: 9, due: now },
  ];
  const s = summarize([], cards, now);
  assert.deepEqual(s.weak.map(c => c.wordId), [3, 1]);
});

test('normalizeEvent 补齐字段', () => {
  const e = normalizeEvent({ ts: 1 });
  assert.equal(e.total, 0);
  assert.equal(e.type, 'unknown');
  assert.deepEqual(e.detail, {});
});
