# -*- coding: utf-8 -*-
"""一键验收：跑测试 → 构建 → 审计产物。

这是「改完就算完」的守门人，任何一条不过就不算交付。
用法：python tools/verify.py
"""
import io
import json
import os
import re
import subprocess
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))

OK = []
BAD = []


def check(cond, name, detail=''):
    if cond:
        OK.append(name)
    else:
        BAD.append(f'{name}{(" — " + detail) if detail else ""}')
    return cond


def run(cmd, label):
    print(f'\n» {label}')
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    tail = '\n'.join((p.stdout or '').strip().splitlines()[-6:])
    if p.returncode != 0:
        print(tail)
        print((p.stderr or '')[-1200:])
    check(p.returncode == 0, label, tail.replace('\n', ' | ')[-200:])
    return p.returncode == 0


def audit_static():
    from enrich import enrich

    docs = os.path.join(ROOT, 'docs')
    web = os.path.join(ROOT, 'web')
    content = enrich()

    check(os.path.isfile(os.path.join(docs, 'index.html')), 'docs/index.html 存在')
    check(os.path.isfile(os.path.join(docs, '.nojekyll')), 'docs/.nojekyll 存在（Pages 不走 Jekyll）')
    check(os.path.isfile(os.path.join(docs, 'sw.js')), 'docs/sw.js 存在')
    check(os.path.isfile(os.path.join(docs, 'manifest.webmanifest')), 'manifest 存在')

    # 预缓存清单必须覆盖所有产物
    sw = open(os.path.join(docs, 'sw.js'), encoding='utf-8').read()
    m = re.search(r'const ASSETS = (\[.*?\]);', sw, re.S)
    assets = set(json.loads(m.group(1))) if m else set()
    on_disk = set()
    for dp, _dn, fns in os.walk(docs):
        for fn in fns:
            rel = os.path.relpath(os.path.join(dp, fn), docs).replace('\\', '/')
            if rel == 'sw.js' or os.path.basename(rel).startswith('.'):
                continue
            on_disk.add('./' + rel)
    missing = sorted(on_disk - assets)
    extra = sorted(assets - on_disk)
    check(not missing, 'SW 预缓存覆盖全部文件', f'缺 {missing[:5]}')
    check(not extra, 'SW 预缓存没有死链', f'多 {extra[:5]}')
    check("VER = 'cet4-" in sw, 'SW 版本号带构建哈希（不再是固定 v1）')
    check('skipWaiting' in sw and 'caches.delete' in sw, 'SW 有升级与旧缓存清理')

    # 离线版不许有任何外网请求
    offenders = []
    for dp, _dn, fns in os.walk(docs):
        for fn in fns:
            if not fn.endswith(('.js', '.css', '.html', '.json', '.webmanifest', '.md')):
                continue
            p = os.path.join(dp, fn)
            txt = open(p, encoding='utf-8', errors='ignore').read()
            for pat in ('http://', 'https://', '//api.', 'api.dictionaryapi', 'youdao'):
                if pat in txt:
                    offenders.append(f'{os.path.relpath(p, docs)}:{pat}')
    check(not offenders, '静态产物无任何外网依赖', str(offenders[:4]))

    # 词表结构
    words = content['words']
    ids = {w['id'] for w in words}
    bad_dz = [w['id'] for w in words if len(w['dz']) != 3 or len(set(w['dz'])) != 3
              or any(i not in ids or i == w['id'] for i in w['dz'])]
    check(not bad_dz, '每个单词都有 3 个合法干扰项', f'{len(bad_dz)} 个异常')

    lens = []
    by_id = {w['id']: w for w in words}
    for w in words:
        for i in w['dz']:
            lens.append(abs(len(by_id[i]['c']) - len(w['c'])) <= max(6, len(w['c'])))
    ratio = sum(lens) / max(1, len(lens))
    check(ratio > 0.98, '干扰项长度与答案对齐', f'{ratio:.3f}')

    # 没有失效的外部发音
    check(all('audio' not in w for w in words), '单词表不再带外部发音 URL')

    # 翻译采分点能自我闭环：参考译文必须 100% 覆盖
    def hit(text, point):
        low = text.lower()
        for alt in point.get('any') or []:
            parts = [re.escape(x) for x in alt.lower().split()]
            if re.search(r'\b' + r'\W+(?:\w+\W+){0,2}?'.join(parts) + r'\w*', low):
                return True
        if point.get('re'):
            try:
                if re.search(point['re'], text, re.I):
                    return True
            except re.error:
                return False
        return False

    broken = [it['id'] for it in content['translation']
              if not it.get('points') or not all(hit(it['ref'], p) for p in it['points'])]
    check(not broken, '每道翻译的参考译文都能命中全部采分点', f'题号 {broken}')

    # 老问题回归检查
    sources = {}
    for dp, _dn, fns in os.walk(web):
        for fn in fns:
            if fn.endswith('.js'):
                p = os.path.join(dp, fn)
                sources[os.path.relpath(p, web)] = open(p, encoding='utf-8').read()
    def strip_comments(code):
        code = re.sub(r'/\*.*?\*/', '', code, flags=re.S)
        return re.sub(r'(?m)^\s*//.*$', '', code)

    clean = {k: strip_comments(v) for k, v in sources.items()}
    check(all('localStorage' not in s for s in clean.values()), '前端不再用 localStorage 存进度')
    check(all('toISOString()' not in s for s in clean.values()), '前端不用 UTC 取日期')
    check(all('api.dictionaryapi' not in s for s in clean.values()), '前端不依赖外部词典接口')

    single = os.path.join(web, 'adapters', 'local.js')
    check(os.path.isfile(single), '离线适配器存在（单源 + 适配层）')
    check(os.path.isfile(os.path.join(web, 'core', 'fsrs.js')), 'FSRS 调度器存在')
    check(not os.path.isdir(os.path.join(ROOT, 'static', 'js')), '旧的双份前端已下线')

    # 配置单点
    meta = json.load(open(os.path.join(ROOT, 'data', 'meta.json'), encoding='utf-8'))
    check(re.fullmatch(r'\d{4}-\d{2}-\d{2}', meta['exam']['date']) is not None, '考试日期格式正确')
    check(meta['exam']['date'] not in open(os.path.join(ROOT, 'app.py'), encoding='utf-8').read(),
          '考试日期不再硬编码在 app.py')

    # 音频本地化
    audio = os.path.join(docs, 'audio')
    n_audio = len(os.listdir(audio)) if os.path.isdir(audio) else 0
    check(n_audio >= 5, f'听力音频已随站点打包（{n_audio} 个文件）')
    check(all(x['audio_url'] for x in content['listening']), '每组听力都指向本地音频')


def main():
    print('=== CET4 工作台验收 ===')
    run(['node', '--test'], 'JS 单元 + 集成测试（node --test）')
    run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests/py'], '接口测试（unittest）')
    run([sys.executable, 'build_static.py'], '构建静态站（docs/）')
    print('\n» 产物审计')
    audit_static()

    print(f'\n通过 {len(OK)} 项')
    if BAD:
        print(f'失败 {len(BAD)} 项:')
        for b in BAD:
            print('  ✗', b)
        return 1
    for o in OK:
        print('  ✓', o)
    print('\n全部通过。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
