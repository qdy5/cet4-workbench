# -*- coding: utf-8 -*-
"""重建 docs/sw.js。

策略版本 STRATEGY 参与哈希：改了缓存策略一定会生成新版本号，
否则浏览器认为 sw.js 没变，继续用旧的。
"""
import hashlib
import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, 'docs')

STRATEGY = 'v3-network-first'
EXT_OK = ('.js', '.css', '.html', '.json', '.webmanifest', '.mp3', '.png', '.woff2')


def rel_files():
    out = []
    for base, dirs, files in os.walk(WEB):
        dirs[:] = [d for d in dirs if d != '.git']
        for f in files:
            if f == 'sw.js' or not f.endswith(EXT_OK):
                continue
            p = os.path.join(base, f)
            out.append(('./' + os.path.relpath(p, WEB).replace('\\', '/'), p))
    return sorted(out)


TEMPLATE = """/* 自动生成，勿手改。hash __VER__ strategy __STRATEGY__ */
const VER = 'cet4-__VER__';
const ASSETS = [
__ASSETS__
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
  const url = new URL(req.url);
  const isCode = /\\.(js|css|html|json|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');

  if (isCode) {
    // 代码/页面：网络优先，在线永远拿最新的，断网才回退缓存
    e.respondWith(
      fetch(req, { cache: 'no-store' }).then(res => {
        const copy = res.clone();
        caches.open(VER).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // 音频/图片：缓存优先，省流量
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(VER).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }))
  );
});
"""


def main():
    files = rel_files()
    h = hashlib.sha1(STRATEGY.encode())
    for rel, p in files:
        with open(p, 'rb') as f:
            h.update(rel.encode())
            h.update(hashlib.sha1(f.read()).digest())
    ver = h.hexdigest()[:10]

    js = (TEMPLATE
          .replace('__ASSETS__', ',\n'.join('  "%s"' % rel for rel, _ in files))
          .replace('__VER__', ver)
          .replace('__STRATEGY__', STRATEGY))
    open(os.path.join(WEB, 'sw.js'), 'w', encoding='utf-8', newline='').write(js)
    # 局域网（Flask 服务 web/）也放一份，否则手机上注册不到 service worker
    web_dir = os.path.join(ROOT, 'web')
    if os.path.isdir(web_dir):
        open(os.path.join(web_dir, 'sw.js'), 'w', encoding='utf-8', newline='').write(js)
    print('sw.js rebuilt | files', len(files), '| ver', ver, '| strategy', STRATEGY)


main()