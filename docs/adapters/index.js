// 适配器选择：能连上 Flask 就用 SQLite 模式，否则用纯静态 + IndexedDB 模式。
// 视图层只调用 store.xxx，两种模式接口一致。
import { createApiAdapter } from './api.js';
import { createLocalAdapter } from './local.js';

let current = null;

export async function detect() {
  if (current) return current;
  try {
    const r = await fetch('api/health', { cache: 'no-store' });
    if (r.ok) {
      const data = await r.json().catch(() => null);
      if (data && data.ok) {
        current = createApiAdapter();
        return current;
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
