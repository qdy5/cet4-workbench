import test from 'node:test';
import assert from 'node:assert/strict';
import { newCard, review, RATING, nextIntervalDays, retrievability, normalizeCard } from '../../web/core/fsrs.js';

const MIN = 60000;
const DAY = 86400000;
const cfg = { retention: 0.9, learningSteps: [1, 10] };

test('新词答对：先进 learning 步，10 分钟后再来', () => {
  const now = Date.now();
  const c = review(newCard(now), RATING.good, now, cfg);
  assert.equal(c.state, 'learning');
  assert.equal(c.due - now, 10 * MIN);
  assert.equal(c.reps, 1);
});

test('新词答错：不写 stability，1 分钟后重来', () => {
  const now = Date.now();
  const c = review(newCard(now), RATING.again, now, cfg);
  assert.equal(c.s, 0);
  assert.equal(c.state, 'learning');
  assert.equal(c.due - now, 1 * MIN);
});

test('learning 毕业：间隔至少 1 天，进入 review', () => {
  const now = Date.now();
  let c = review(newCard(now), RATING.good, now, cfg);
  c = review(c, RATING.good, c.due, cfg);
  assert.equal(c.state, 'review');
  assert.ok(c.due - c.last >= DAY);
  assert.ok(c.s > 0);
});

test('review 阶段答错：lapses+1、1 分钟后重来，不会当场又抽到', () => {
  const now = Date.now();
  let c = review(newCard(now), RATING.good, now, cfg);
  c = review(c, RATING.good, c.due, cfg);
  const later = c.due;
  const before = { ...c };
  c = review(c, RATING.again, later, cfg);
  assert.equal(c.lapses, 1);
  assert.equal(c.state, 'relearning');
  assert.equal(c.due - later, 10 * MIN);
  assert.ok(c.s < before.s, '遗忘后稳定度应变小');
});

test('连续答对间隔单调变长', () => {
  let now = Date.now();
  let c = review(newCard(now), RATING.good, now, cfg);
  const gaps = [];
  for (let i = 0; i < 6; i += 1) {
    c = review(c, RATING.good, c.due, cfg);
    gaps.push(c.due - c.last);
  }
  for (let i = 1; i < gaps.length; i += 1) {
    assert.ok(gaps[i] > gaps[i - 1], `第 ${i} 次间隔应更长: ${gaps}`);
  }
});

test('easy 比 good 间隔长，hard 比 good 短', () => {
  const now = Date.now();
  const base = { s: 12, d: 5.5, state: 'review', reps: 4, lapses: 0, due: now, last: now - 10 * DAY };
  const g = review(base, RATING.good, now, cfg).due - now;
  const e = review(base, RATING.easy, now, cfg).due - now;
  const h = review(base, RATING.hard, now, cfg).due - now;
  assert.ok(e > g, 'easy 应该更久');
  assert.ok(h < g, 'hard 应该更短');
});

test('保持率越高间隔越短', () => {
  const now = Date.now();
  const card = { s: 20, d: 5, state: 'review', reps: 5, lapses: 0, due: now, last: now - 20 * DAY };
  const a = review(card, RATING.good, now, { ...cfg, retention: 0.85 }).due - now;
  const b = review(card, RATING.good, now, { ...cfg, retention: 0.95 }).due - now;
  assert.ok(a > b);
});

test('难度始终夹在 1..10，稳定度为正', () => {
  let c = { s: 1, d: 5, state: 'review', reps: 1, lapses: 0, due: Date.now(), last: Date.now() - DAY };
  for (let i = 0; i < 40; i += 1) {
    const rating = i % 7 === 0 ? RATING.again : RATING.easy;
    c = review(c, rating, c.last + DAY, cfg);
    assert.ok(c.d >= 1 && c.d <= 10, `difficulty 越界: ${c.d}`);
    assert.ok(c.s > 0, 'stability 必须为正');
  }
});

test('nextIntervalDays 有界', () => {
  assert.equal(nextIntervalDays(0.01), 1);
  assert.ok(nextIntervalDays(10000) <= 3650);
});

test('retrievability 随时间下降', () => {
  assert.ok(retrievability(0, 10) > 0.99);
  assert.ok(retrievability(10, 10) < 0.95);
  assert.ok(retrievability(100, 10) < 0.6);
});

test('normalizeCard 兼容旧数据', () => {
  assert.equal(normalizeCard({}).state, 'new');
  assert.equal(normalizeCard({ s: 3 }).state, 'review');
});
