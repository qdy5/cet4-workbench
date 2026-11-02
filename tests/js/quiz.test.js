import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOptions, fallbackDistractors } from '../../web/core/quiz.js';

const pool = [
  { id: 1, w: 'abandon', p: 'v.', c: '放弃，抛弃', dz: [2, 3, 4] },
  { id: 2, w: 'absorb', p: 'v.', c: '吸收；吸引' },
  { id: 3, w: 'achieve', p: 'v.', c: '实现，达到' },
  { id: 4, w: 'admit', p: 'v.', c: '承认，准许进入' },
  { id: 5, w: 'annual', p: 'adj.', c: '每年的' },
];
const byId = new Map(pool.map(w => [w.id, w]));
const resolve = id => byId.get(id);

test('四个选项、互不重复、含正确答案', () => {
  for (let i = 0; i < 50; i += 1) {
    const { opts, ans } = buildOptions(pool[0], pool, resolve);
    assert.equal(opts.length, 4);
    assert.equal(new Set(opts).size, 4);
    assert.equal(opts[ans], pool[0].c);
  }
});

test('选项顺序会打乱', () => {
  const seen = new Set();
  for (let i = 0; i < 40; i += 1) seen.add(buildOptions(pool[0], pool, resolve).ans);
  assert.ok(seen.size >= 2, '答案位置应该变化');
});

test('缺 dz 时按词性 + 长度兜底', () => {
  const word = { id: 9, w: 'beta', p: 'v.', c: '测试用的释义' };
  const opts = buildOptions(word, pool, resolve);
  assert.equal(opts.opts.length, 4);
  assert.ok(opts.opts.includes('测试用的释义'));
});

test('dz 里的失效 id 被忽略而不是渲染成 undefined', () => {
  const word = { id: 6, w: 'x', p: 'v.', c: '答案', dz: [999, 998, 2] };
  const { opts } = buildOptions(word, pool, resolve);
  assert.ok(!opts.includes(undefined));
  assert.ok(opts.every(o => typeof o === 'string' && o.length > 0));
});

test('fallbackDistractors 优先同词性', () => {
  const d = fallbackDistractors({ id: 10, w: 'y', p: 'v.', c: '含义含义' }, pool);
  assert.equal(d.length, 3);
  assert.ok(d.includes('吸收；吸引'));
});
