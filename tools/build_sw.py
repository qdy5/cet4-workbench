# -*- coding: utf-8 -*-
"""重建 docs/sw.js：按文件内容算版本号，保证改代码后手机端会刷新缓存。"""
import hashlib
import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, 'docs')

SKIP_DIR = {'.git'}
EXT_OK = ('.js', '.css', '.html', '.json', '.webmanifest', '.mp3', '.png', '.woff2')


def rel_files():
    out = []
    for base, dirs, files in os.walk(WEB):
        dirs[:] = [d for d in dirs if d not in SKIP_DIR]
        for f in files:
            if f == 'sw.js' or not f.endswith(EXT_OK):
                continue
            p = os.path.join(base, f)
            rel = './' + os.path.relpath(p, WEB).replace('\\', '/')
            out.append((rel, p))
    return sorted(out)


def main():
    files = rel_files()
    h = hashlib.sha1()
    for rel, p in files:
        with open(p, 'rb') as f:
            h.update(rel.encode())
            h.update(hashlib.sha1(f.read()).digest())
    ver = h.hexdigest()[:10]

    assets = ',\n'.join(f'  "{rel}"' for rel, _ in files)
    js = f'''/* 自动生成，勿手改。hash {ver} */
const VER = 'cet4-{ver}';
const ASSETS = [
{assets}
];

self.addEventListener('install', e => {{
  e.waitUntil(caches.open(VER).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
}});

self.addEventListener('activate', e => {{
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
}});

self.addEventListener('fetch', e => {{
  const req = e.request;
  if (req.method !== 'GET') return;
  // 接口和音频走网络优先，避免离线缓存把批改结果也缓存住
  const url = new URL(req.url);
  if (url.pathname.includes('/api/') || url.pathname.endsWith('.mp3')) {{
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }}
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {{
      const copy = res.clone();
      caches.open(VER).then(c => c.put(req, copy)).catch(() => {{}});
      return res;
    }}).catch(() => caches.match('./index.html')))
  );
}});
'''
    open(os.path.join(WEB, 'sw.js'), 'w', encoding='utf-8', newline='').write(js)
    print('sw.js rebuilt, files:', len(files), 'ver:', ver)


main()