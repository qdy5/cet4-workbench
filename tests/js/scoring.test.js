import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scoreTranslation, analyzeWriting, matchPoint, words } from '../../web/core/scoring.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const items = JSON.parse(readFileSync(new URL('../../data/translation.json', import.meta.url), 'utf-8'));
const item = items[0];

test('采分点支持同义表达', () => {
  assert.ok(matchPoint(item.ref, item.points[0]));
  assert.ok(matchPoint('As the Internet develops, an increasing number of people opt to study online.',
    item.points[0]));
  assert.ok(!matchPoint('I like apples.', item.points[0]));
});

test('参考译文采分点全中、硬检查全过', () => {
  const r = scoreTranslation(item.ref, item);
  assert.equal(r.coverage, 1);
  assert.equal(r.stats.covered, r.stats.total);
  assert.ok(r.checks.every(c => c.ok), JSON.stringify(r.checks.filter(c => !c.ok)));
});

test('换一种说法也能拿满覆盖，不会被模板句式卡死', () => {
  const alt = 'As the internet develops, an increasing number of people opt to study online.';
  const r = scoreTranslation(alt, item);
  assert.equal(r.coverage, 1);
  assert.ok(r.checks.every(c => c.ok));
});

test('只堆关键词的译文会被硬检查挑出来（不再给一个假分数）', () => {
  const soup = 'With the development of the internet more and more choose to online';
  const r = scoreTranslation(soup, item);
  assert.equal('score' in r, false, '不应该再返回总分');
  assert.ok(r.checks.some(c => !c.ok || /标点|冠词/.test(c.name)), '应当有检查项不通过');
  assert.equal(r.checks.find(c => c.name.includes('标点')).ok, false);
});

test('中文残留会被指出来', () => {
  const r = scoreTranslation('随着 the internet, more and more people choose to study online.', item);
  const cjk = r.checks.find(c => c.name.includes('中文'));
  assert.equal(cjk.ok, false);
});

test('冠词错误能被抓到', () => {
  const r = scoreTranslation('He is a engineer and an teacher.', item);
  const art = r.checks.find(c => c.name.includes('冠词'));
  assert.equal(art.ok, false);
  assert.match(art.hint, /a engineer|an teacher/);
});

test('空文本 0 分', () => {
  assert.equal(scoreTranslation('', item).coverage, 0);
});

test('写作自查能数段、句、连接词', () => {
  const text = `Nowadays, more and more students study online. However, this trend has problems.

First, staring at screens hurts our eyes. Moreover, it is easy to be distracted by games. For example, a short break often becomes an hour.

In conclusion, we should use the internet wisely. Therefore, a clear plan matters most.`;
  const a = analyzeWriting(text, { words: '80-120' });
  assert.equal(a.paragraphs, 3);
  assert.equal(a.sentences, 7);
  assert.ok(a.connectives.includes('however'));
  assert.ok(a.connectives.includes('moreover'));
  assert.ok(a.words > 40);
  assert.equal(a.checks.length, 7);
});

test('写作重复词会被抓出来', () => {
  const text = 'Study study study study is important. Study study study study again and again.';
  const a = analyzeWriting(text, { words: '10-40' });
  assert.ok(a.repeated.length > 0);
});

test('words() 只数英文词', () => {
  assert.equal(words("It's a test, 中文不算.").length, 3);
});
