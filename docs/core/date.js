// 本地日期工具：全部按设备本地时区计算，禁止使用 toISOString 取日期。
const pad = n => String(n).padStart(2, '0');

export const DAY = 86400000;

/** 本地日历日 key，形如 2026-11-02 */
export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' -> 本地零点时间戳 */
export function dayStart(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

export function addDays(key, n) {
  const d = new Date(dayStart(key));
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysBetween(aKey, bKey) {
  return Math.round((dayStart(bKey) - dayStart(aKey)) / DAY);
}

/** 距考试天数（按本地日历日算，不按 24 小时算） */
export function daysUntil(dateKey, now = Date.now()) {
  return daysBetween(dayKey(now), dateKey);
}

export function isSameDay(ts, key) {
  return dayKey(ts) === key;
}

/** 相对时间，用于「上次复习 3 天前」 */
export function relTime(ts, now = Date.now()) {
  const diff = now - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / 3600000)} 小时前`;
  const n = Math.floor(diff / DAY);
  if (n < 30) return `${n} 天前`;
  return dayKey(ts);
}

/** 到下次复习的间隔，人类可读 */
export function fmtInterval(ms) {
  if (ms <= 0) return '现在';
  const min = ms / 60000;
  if (min < 60) return `${Math.max(1, Math.round(min))} 分钟`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)} 小时`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)} 天`;
  const mo = d / 30;
  if (mo < 12) return `${Math.round(mo)} 个月`;
  return `${(d / 365).toFixed(1)} 年`;
}
