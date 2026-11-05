/* 自动生成，勿手改。assets 9b168b7813 (data build 3f3ff5756d) */
const VER = 'cet4-9b168b7813';
const ASSETS = [
 "./adapters/api.js",
 "./adapters/idb.js",
 "./adapters/index.js",
 "./adapters/index.js.bak",
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
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isData(url) { return url.pathname.includes('/data/'); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VER).then(c => c.put('./index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (isData(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(VER);
      const hit = await cache.match(req);
      const net = fetch(req).then(res => {
        cache.put(req, res.clone()).catch(() => {});
        return res;
      }).catch(() => null);
      return hit || (await net) || new Response('[]', { headers: { 'Content-Type': 'application/json' } });
    })());
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(VER);
    const hit = await cache.match(req);
    if (hit) {
      fetch(req).then(res => cache.put(req, res)).catch(() => {});
      return hit;
    }
    const res = await fetch(req).catch(() => null);
    if (res) cache.put(req, res.clone()).catch(() => {});
    return res || new Response('', { status: 504 });
  })());
});
