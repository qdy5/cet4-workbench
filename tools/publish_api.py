# -*- coding: utf-8 -*-
"""网络到 github.com:443 不通时，用 GitHub REST Git Data API 提交并更新 main。

用法：python tools/publish_api.py "提交说明"
走 api.github.com（可连通），凭证复用 git credential manager 里存的 token。
提交前先 git add -A 并本地 commit，脚本按 git 索引里的文件生成 tree。
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OWNER, REPO, BRANCH = 'qdy5', 'cet4-workbench', 'main'
API = f'https://api.github.com/repos/{OWNER}/{REPO}'


def token():
    out = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n',
                         capture_output=True, text=True, cwd=ROOT).stdout
    for line in out.splitlines():
        if line.startswith('password='):
            return line.split('=', 1)[1]
    raise SystemExit('拿不到 GitHub 凭证')


TOKEN = token()
print('token ok', TOKEN[:4] + '…')


def call(method, path, payload=None, retries=3):
    url = path if path.startswith('http') else API + path
    data = json.dumps(payload).encode() if payload is not None else None
    for i in range(retries):
        req = urllib.request.Request(url, data=data, method=method, headers={
            'Authorization': f'token {TOKEN}',
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'cet4-workbench-publisher',
        })
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                body = r.read()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            detail = e.read()[:300].decode('utf-8', 'ignore')
            if e.code in (502, 503, 504) and i < retries - 1:
                time.sleep(2)
                continue
            raise SystemExit(f'{method} {path} -> {e.code} {detail}')
        except Exception as exc:
            if i < retries - 1:
                time.sleep(2)
                continue
            raise SystemExit(f'{method} {path} -> {exc}')


CACHE = os.path.join(ROOT, '.pushcache.json')
_cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}


def save_cache():
    json.dump(_cache, open(CACHE, 'w', encoding='utf-8'))


def local_files():
    """返回 [(路径, git 模式)]。模式必须取索引里的值：
    Windows 上 os.access(X_OK) 永远为真，否则会把所有文件标成可执行。"""
    out = subprocess.run(['git', 'ls-files', '-s', '-z'], cwd=ROOT, capture_output=True).stdout
    rows = []
    for entry in out.decode('utf-8').split('\0'):
        if not entry:
            continue
        meta, path = entry.split('\t', 1)
        mode = meta.split()[0]
        rows.append((path, '100755' if mode == '100755' else '100644'))
    return rows


def walk_tree(sha):
    data = call('GET', f'/git/trees/{sha}?recursive=1')
    return {e['path']: e for e in data['tree']}


def main():
    msg = sys.argv[1] if len(sys.argv) > 1 else 'publish via api'
    ref = call('GET', f'/git/ref/heads/{BRANCH}')
    head = ref['object']['sha']
    base_tree = call('GET', f'/git/commits/{head}')['tree']['sha']
    print('远端 head', head[:8], 'tree', base_tree[:8])

    files = local_files()
    paths = [p for p, _m in files]
    modes = dict(files)
    print('本地文件', len(paths))

    remote = walk_tree(base_tree)
    print('远端条目', len(remote))

    blobs = []
    uploaded = reused = 0
    t0 = time.time()
    for i, p in enumerate(paths, 1):
        full = os.path.join(ROOT, p)
        local_sha = subprocess.run(['git', 'hash-object', p], cwd=ROOT,
                                   capture_output=True, text=True).stdout.strip()
        mode = modes.get(p, '100644')
        old = remote.get(p)
        key = f'{p}@{local_sha}'
        # 只比内容：模式变了不用重传，改 tree 里的 mode 就行
        if old and old.get('type') == 'blob' and old.get('sha') == local_sha:
            blobs.append({'path': p, 'mode': mode, 'type': 'blob', 'sha': old['sha']})
            reused += 1
            continue
        if key in _cache:
            blobs.append({'path': p, 'mode': mode, 'type': 'blob', 'sha': _cache[key]})
            reused += 1
            continue
        with open(full, 'rb') as f:
            content = f.read()
        sha = call('POST', '/git/blobs', {
            'content': base64.b64encode(content).decode(),
            'encoding': 'base64',
        })['sha']
        _cache[key] = sha
        save_cache()
        blobs.append({'path': p, 'mode': mode, 'type': 'blob', 'sha': sha})
        uploaded += 1
        print(f'  ↑ {p}  {len(content) // 1024}KB  {time.time() - t0:.0f}s', flush=True)
    print(f'新增/更新 {uploaded} 个，复用 {reused} 个')

    keep = set(paths)
    removed = [{'path': p, 'mode': e['mode'], 'type': 'blob', 'sha': None}
               for p, e in remote.items() if e['type'] == 'blob' and p not in keep]
    print('删除', len(removed), '个远端文件')

    tree = call('POST', '/git/trees', {'base_tree': base_tree, 'tree': blobs + removed})
    commit = call('POST', '/git/commits', {'message': msg, 'tree': tree['sha'], 'parents': [head]})
    call('PATCH', f'/git/refs/heads/{BRANCH}', {'sha': commit['sha'], 'force': False})
    print('已提交', commit['sha'][:8])
    print(f'https://github.com/{OWNER}/{REPO}/commit/{commit["sha"]}')


if __name__ == '__main__':
    main()
