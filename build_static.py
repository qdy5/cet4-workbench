# -*- coding: utf-8 -*-
"""构建 GitHub Pages 用的静态站（docs/）。

单源：web/ 是唯一前端源码，data/ 是唯一内容源。
产出：docs/ = 可直接离线运行、可直接 Pages 托管的 PWA，且不依赖任何外部域名。
"""
import hashlib
import io
import json
import os
import shutil
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, 'tools'))

from enrich import enrich  # noqa: E402

WEB = os.path.join(ROOT, 'web')
DOCS = os.path.join(ROOT, 'docs')
AUDIO = os.path.join(ROOT, 'audio')

SW_TEMPLATE = '''/* 自动生成，勿手改。assets {ver} (data build {build}) */
const VER = 'cet4-{ver}';
const ASSETS = {assets};

self.addEventListener('install', e => {{
  e.waitUntil(caches.open(VER).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
}});

self.addEventListener('activate', e => {{
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
}});

function isData(url) {{ return url.pathname.includes('/data/'); }}

self.addEventListener('fetch', e => {{
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {{
    e.respondWith(
      fetch(req).then(res => {{
        const copy = res.clone();
        caches.open(VER).then(c => c.put('./index.html', copy)).catch(() => {{}});
        return res;
      }}).catch(() => caches.match('./index.html'))
    );
    return;
  }}

  if (isData(url)) {{
    e.respondWith((async () => {{
      const cache = await caches.open(VER);
      const hit = await cache.match(req);
      const net = fetch(req).then(res => {{
        cache.put(req, res.clone()).catch(() => {{}});
        return res;
      }}).catch(() => null);
      return hit || (await net) || new Response('[]', {{ headers: {{ 'Content-Type': 'application/json' }} }});
    }})());
    return;
  }}

  e.respondWith((async () => {{
    const cache = await caches.open(VER);
    const hit = await cache.match(req);
    if (hit) {{
      fetch(req).then(res => cache.put(req, res)).catch(() => {{}});
      return hit;
    }}
    const res = await fetch(req).catch(() => null);
    if (res) cache.put(req, res.clone()).catch(() => {{}});
    return res || new Response('', {{ status: 504 }});
  }})());
}});
'''


def file_hash(path):
    h = hashlib.sha1()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()[:10]


TEXT_EXT = {'.js', '.css', '.html', '.json', '.webmanifest', '.md', '.txt', '.svg'}


def copy_tree(src, dst):
    for name in os.listdir(src):
        s = os.path.join(src, name)
        d = os.path.join(dst, name)
        if os.path.isdir(s):
            os.makedirs(d, exist_ok=True)
            copy_tree(s, d)
            continue
        ext = os.path.splitext(name)[1].lower()
        if ext in TEXT_EXT:
            # 统一 LF：Windows 上检出是 CRLF，直接复制会让 CI 的「产物一致」检查误报
            with open(s, 'rb') as f:
                data = f.read().replace(b'\r\n', b'\n')
            with open(d, 'wb') as f:
                f.write(data)
        else:
            shutil.copy2(s, d)


def write_json(path, data, indent=None):
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':') if indent is None else None,
                  indent=indent)
    return os.path.getsize(path)


def main():
    content = enrich()
    build = content['meta']['build']

    if os.path.isdir(DOCS):
        shutil.rmtree(DOCS)
    os.makedirs(os.path.join(DOCS, 'data'), exist_ok=True)

    # 前端
    copy_tree(WEB, DOCS)

    # 数据
    sizes = {}
    sizes['meta'] = write_json(os.path.join(DOCS, 'data', 'meta.json'), content['meta'])
    sizes['words'] = write_json(os.path.join(DOCS, 'data', 'words.json'), content['words'])
    sizes['info'] = write_json(os.path.join(DOCS, 'data', 'info.json'), content['info'])
    for key in ('reading', 'listening', 'translation', 'writing'):
        sizes[key] = write_json(os.path.join(DOCS, 'data', f'{key}.json'), content[key])

    # 音频
    if os.path.isdir(AUDIO):
        os.makedirs(os.path.join(DOCS, 'audio'), exist_ok=True)
        for name in os.listdir(AUDIO):
            if name.lower().endswith(('.mp3', '.m4a', '.wav', '.ogg')):
                shutil.copy2(os.path.join(AUDIO, name), os.path.join(DOCS, 'audio', name))

    # 收集需要预缓存的资源（排除 sw.js 自己）
    assets = []
    for dirpath, _dirnames, filenames in os.walk(DOCS):
        for name in filenames:
            if name == 'sw.js' or name.startswith('.'):
                continue
            rel = os.path.relpath(os.path.join(dirpath, name), DOCS).replace('\\', '/')
            assets.append('./' + rel)
    assets.sort()

    # 版本号取全部资源的哈希：改代码或改数据都会让缓存整体换新，不会出现「改了但手机还是旧的」
    digest = hashlib.sha1()
    for rel in assets:
        digest.update(rel.encode())
        digest.update(file_hash(os.path.join(DOCS, rel[2:])).encode())
    ver = digest.hexdigest()[:10]

    sw = SW_TEMPLATE.format(ver=ver, build=build,
                            assets=json.dumps(assets, ensure_ascii=False, indent=1))
    with open(os.path.join(DOCS, 'sw.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(sw)

    # GitHub Pages 不需要 Jekyll
    open(os.path.join(DOCS, '.nojekyll'), 'w').close()

    total = sum(os.path.getsize(os.path.join(dp, n)) for dp, _d, ns in os.walk(DOCS) for n in ns)
    print(f'assets {ver} (data {build}) → docs/  {total / 1024 / 1024:.2f} MB, {len(assets)} 个文件预缓存')
    for k, v in sizes.items():
        print(f'  data/{k}.json  {v / 1024:.0f} KB')


if __name__ == '__main__':
    main()
