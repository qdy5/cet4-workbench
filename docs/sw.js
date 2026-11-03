/* 自动生成，勿手改。hash 94c916a756 */
const VER = 'cet4-94c916a756';
const ASSETS = [
  "./adapters/api.js",
  "./adapters/idb.js",
  "./adapters/index.js",
  "./adapters/local.js",
  "./app-v2.css",
  "./app.css",
  "./app.js",
  "./audio/listen_1.mp3",
  "./audio/listen_2.mp3",
  "./audio/listen_3.mp3",
  "./audio/listen_4.mp3",
  "./audio/listen_5.mp3",
  "./core/date.js",
  "./core/dom.js",
  "./core/fsrs.js",
  "./core/quiz.js",
  "./core/scoring.js",
  "./core/stats.js",
  "./data/info.json",
  "./data/listening.json",
  "./data/meta.json",
  "./data/reading.json",
  "./data/translation.json",
  "./data/words.json",
  "./data/writing.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./index.html",
  "./manifest.webmanifest",
  "./views/ai.js",
  "./views/home.js",
  "./views/index.js",
  "./views/listening.js",
  "./views/reading.js",
  "./views/settings.js",
  "./views/stats.js",
  "./views/translation.js",
  "./views/words.js",
  "./views/writing.js"
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // 接口和音频走网络优先，避免离线缓存把批改结果也缓存住
  const url = new URL(req.url);
  if (url.pathname.includes('/api/') || url.pathname.endsWith('.mp3')) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(VER).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
