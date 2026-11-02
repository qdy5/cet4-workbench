// FSRS-5 调度器（单份实现，桌面与离线共用；后端只负责存，不参与计算）
// 参考 open-spaced-repetition/fsrs 默认参数；学习步（learning steps）在 FSRS 外层处理，
// 避免「答错当天立刻又抽到」的死循环。
import { DAY } from './date.js';

export const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621,
];

const DECAY = -0.5;
const FACTOR = 19 / 81;
export const MIN = 60000;

export const RATING = { again: 1, hard: 2, good: 3, easy: 4 };

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round2 = x => Math.round(x * 100) / 100;

export function retrievability(elapsedDays, stability) {
  if (!(stability > 0)) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

const initStability = g => Math.max(0.1, W[g - 1]);
const initDifficulty = g => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);
const nextDifficulty = (d, g) => {
  const nd = d - W[6] * (g - 3);
  return clamp(W[7] * W[4] + (1 - W[7]) * nd, 1, 10);
};

function stabilityAfterRecall(d, s, r, g) {
  const hard = g === RATING.hard ? W[15] : 1;
  const easy = g === RATING.easy ? W[16] : 1;
  const inc = Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1);
  return Math.max(0.1, s * (1 + inc * hard * easy));
}

const stabilityAfterForget = (d, s, r) =>
  Math.max(0.1, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));

export function nextIntervalDays(stability, retention = 0.9) {
  const raw = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return clamp(Math.round(raw), 1, 3650);
}

export function newCard(now = Date.now()) {
  return { s: 0, d: 0, state: 'new', reps: 0, lapses: 0, due: now, last: 0 };
}

/** 归一化，兼容旧数据与后端返回 */
export function normalizeCard(c = {}, now = Date.now()) {
  return {
    s: Number(c.s) || 0,
    d: Number(c.d) || 0,
    state: c.state || (Number(c.s) > 0 ? 'review' : 'new'),
    reps: Number(c.reps) || 0,
    lapses: Number(c.lapses) || 0,
    due: Number(c.due) || now,
    last: Number(c.last) || 0,
  };
}

/**
 * 复习一次，返回新卡。
 * @param {object} card 归一化后的卡
 * @param {number} rating 1..4
 * @param {number} now 时间戳
 * @param {object} cfg { retention, learningSteps:[分钟], graduatingInterval }
 */
export function review(card, rating, now = Date.now(), cfg = {}) {
  const retention = cfg.retention || 0.9;
  const steps = cfg.learningSteps || [1, 10];
  const c = { ...normalizeCard(card, now) };
  const g = clamp(Math.round(rating), 1, 4);
  // 先算距今间隔，再覆盖 last，否则每次都是「刚复习过」，稳定度永远不涨
  const elapsed = Math.max(0, (now - c.last) / DAY);
  c.reps += 1;
  c.last = now;

  if (c.state === 'new' || c.state === 'learning' || c.state === 'relearning') {
    if (g === RATING.again) {
      // 未毕业的卡不写 stability，避免把「刚见过一次」当成已记住
      if (c.state === 'new') c.s = 0;
      c.state = c.state === 'relearning' ? 'relearning' : 'learning';
      c.due = now + steps[0] * MIN;
      return c;
    }
    if (c.state === 'new') {
      c.s = initStability(g > 3 ? 4 : 3);
      c.d = initDifficulty(g > 3 ? 4 : 3);
      c.state = 'learning';
      c.due = now + steps[1] * MIN;
      return c;
    }
    // learning/relearning 走完最后一步 → 毕业进 review
    c.s = c.state === 'learning'
      ? initStability(g === RATING.easy ? 4 : 3)
      : Math.max(c.s, 1);
    c.d = c.d > 0 ? nextDifficulty(c.d, g) : initDifficulty(3);
    c.state = 'review';
    c.due = now + Math.max(1, nextIntervalDays(c.s, retention)) * DAY;
    return c;
  }

  const r = retrievability(elapsed, c.s);
  if (g === RATING.again) {
    c.s = stabilityAfterForget(c.d || 1, c.s || 1, r);
    c.d = nextDifficulty(c.d || 1, g);
    c.lapses += 1;
    c.state = 'relearning';
    // 当天不再回到待复习池，10 分钟后单独再练
    c.due = now + steps[1] * MIN;
    return c;
  }
  c.s = stabilityAfterRecall(c.d || 1, c.s || 1, r, g);
  c.d = nextDifficulty(c.d || 1, g);
  c.due = now + nextIntervalDays(c.s, retention) * DAY;
  return c;
}

/** 预览四个评分对应的下次间隔（毫秒），用于按钮提示 */
export function preview(card, now = Date.now(), cfg = {}) {
  const out = {};
  for (const [k, g] of Object.entries(RATING)) {
    out[k] = review(card, g, now, cfg).due - now;
  }
  return out;
}

export function describe(card, now = Date.now(), cfg = {}) {
  const c = normalizeCard(card, now);
  return {
    state: c.state,
    s: round2(c.s),
    d: round2(c.d),
    reps: c.reps,
    lapses: c.lapses,
    dueIn: c.due - now,
  };
}
