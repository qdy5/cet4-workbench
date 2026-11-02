// 极简 IndexedDB 封装（无第三方依赖）。
// 换掉浏览器本地存储方案：进度不再每次答题都全量 JSON.stringify，也不受 5MB 配额限制。
const DB_NAME = 'cet4-workbench';
const DB_VERSION = 2;
const STORES = {
  cards: { keyPath: 'wordId' },
  events: { keyPath: 'id' },
  drafts: { keyPath: 'key' },
  meta: { keyPath: 'k' },
};

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('这台浏览器不支持 IndexedDB'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, opts] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, opts);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('打开本地数据库失败'));
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const os = t.objectStore(store);
    let out;
    try {
      out = fn(os);
    } catch (e) {
      reject(e);
      return;
    }
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('事务中止'));
  });
}

export const idb = {
  get: (store, key) => tx(store, 'readonly', os => os.get(key)),
  all: store => tx(store, 'readonly', os => os.getAll()),
  put: (store, val) => tx(store, 'readwrite', os => os.put(val)),
  bulkPut: (store, list) => tx(store, 'readwrite', os => { for (const v of list) os.put(v); }),
  del: (store, key) => tx(store, 'readwrite', os => os.delete(key)),
  clear: store => tx(store, 'readwrite', os => os.clear()),
  count: store => tx(store, 'readonly', os => os.count()),
};

export default idb;
