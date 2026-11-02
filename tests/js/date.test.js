import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, addDays, daysUntil, dayStart, fmtInterval, daysBetween } from '../../web/core/date.js';

test('dayKey 用本地时区，凌晨不会被算成前一天', () => {
  const early = new Date(2026, 10, 3, 0, 30, 0); // 本地 11-03 00:30
  assert.equal(dayKey(early.getTime()), '2026-11-03');
  const late = new Date(2026, 10, 2, 23, 59, 0);
  assert.equal(dayKey(late.getTime()), '2026-11-02');
});

test('addDays 跨月、跨年正确', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('daysBetween / daysUntil 按日历日算，不按 24 小时', () => {
  const now = new Date(2026, 11, 12, 0, 5, 0).getTime(); // 考试当天凌晨
  assert.equal(daysUntil('2026-12-12', now), 0);
  assert.equal(daysUntil('2026-12-13', now), 1);
  const lateYesterday = new Date(2026, 11, 11, 23, 50, 0).getTime();
  assert.equal(daysBetween('2026-11-11', '2026-12-11'), 30);
  assert.equal(daysUntil('2026-12-12', lateYesterday), 1);
});

test('dayStart 返回本地零点', () => {
  const d = new Date(dayStart('2026-11-02'));
  assert.equal(d.getHours(), 0);
  assert.equal(d.getDate(), 2);
});

test('fmtInterval 读得懂', () => {
  assert.match(fmtInterval(10 * 60000), /分钟/);
  assert.match(fmtInterval(3 * 86400000), /天/);
  assert.match(fmtInterval(40 * 86400000), /个月/);
});
