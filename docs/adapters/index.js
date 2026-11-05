// 适配器选择：能连上 Flask 就用 SQLite 模式，否则用纯静态 + IndexedDB 模式。
// 视图层只调用 store.xxx，两种模式接口一致。
//
// 2026-11-06 修：后端掉线时前端会降级到 IndexedDB（数据只在这个浏览器里），
// 后端恢复后不会自动搬回去 —— 表现就是「刷新数据就没了」。
// 现在检测到 api 可用时会先把本机离线数据回灌进 SQLite（只灌一次，失败静默）。
import { createApiAdapter } from './api.js';
import { createLocalAdapter } from './local.js';

let current = null;
const MIGRATED_KEY = 'cet4.offlineMergedAt';

async function drainOfflineInto(api) {
  // 已经搬过就跳过，避免每次刷新重复导入
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return;
  } catch (_) { /* 隐私模式拿不到 localStorage，就当没搬过 */ }

  try {
    const local = createLocalAdapter();
    if (local.init) await local.init().catch(() => {});
    const snap = await local.exportAll();
    const n = (snap?.cards?.length || 0) + (snap?.events?.length || 0) + (snap?.drafts?.length || 0);
    if (n > 0) {
      await api.importAll(snap, { merge: true });
      console.info(`[CET4] 已把 ${n} 条离线数据合并进 SQLite`);
      try {
        localStorage.setItem(MIGRATED_KEY, String(Date.now()));
      } catch (_) { /* 存不下就算了，下次再试 */ }
    }
  } catch (e) {
    console.warn('[CET4] 离线数据回灌失败，下次刷新再试', e);
  }
}

export async function detect() {
  if (current) return current;
  try {
    const r = await fetch('api/health', { cache: 'no-store' });
    if (r.ok) {
      const data = await r.json().catch(() => null);
      if (data && data.ok) {
        const api = createApiAdapter();
        current = api;
        drainOfflineInto(api);   // 不 await：回灌不该拖慢首屏
        return api;
      }
    }
  } catch (_) { /* 静态环境下 api/health 不存在，正常降级 */ }
  current = createLocalAdapter();
  return current;
}

export function store() {
  if (!current) throw new Error('store 尚未初始化');
  return current;
}

/** 手动触发「把本机离线数据搬进数据库」，设置页可以放个按钮调它。 */
export async function migrateOffline() {
  try { localStorage.removeItem(MIGRATED_KEY); } catch (_) {}
  const api = createApiAdapter();
  await drainOfflineInto(api);
}