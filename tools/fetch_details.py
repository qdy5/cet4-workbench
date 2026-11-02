# -*- coding: utf-8 -*-
"""用有道 jsonapi 补音标 + 双语例句，写进 data/details.json。

可重复运行，已抓过的词跳过（--force 强制重抓）。
只抓音标和例句，不再保存外部发音链接（那批域名已经挂了）。
"""
import io
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DETAIL = os.path.join(ROOT, 'data', 'details.json')
WORDS = os.path.join(ROOT, 'data', 'words.json')
FORCE = '--force' in sys.argv

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

cache = json.load(open(DETAIL, encoding='utf-8')) if os.path.exists(DETAIL) else {}
words = [w['word'] for w in json.load(open(WORDS, encoding='utf-8'))]
todo = [w for w in words if FORCE or not cache.get(w, {}).get('example')]
print(f'总词 {len(words)}，待补 {len(todo)}')

s = requests.Session()
s.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
t0 = time.time()


def fetch(w):
    try:
        r = s.get('https://dict.youdao.com/jsonapi', params={'q': w}, timeout=8)
        d = r.json()
        ph = ''
        ec = d.get('ec') or {}
        if isinstance(ec, dict):
            arr = ec.get('word') or []
            if arr:
                ph = arr[0].get('usphone') or arr[0].get('ukphone') or ''
        en = cn = ''
        bp = d.get('blng_sents_part') or {}
        for p in (bp.get('sentence-pair') or []):
            e = (p.get('sentence') or '').strip()
            c = (p.get('sentence-translation') or '').strip()
            if e and 15 < len(e) < 170:
                en, cn = e, c
                break
        return w, ph, en, cn
    except Exception:
        return w, '', '', ''


done = 0
with ThreadPoolExecutor(max_workers=16) as pool:
    for w, ph, en, cn in pool.map(fetch, todo):
        old = cache.get(w, {})
        cache[w] = {
            'phonetic': ph or old.get('phonetic', ''),
            'example': en or old.get('example', ''),
            'example_cn': cn or old.get('example_cn', ''),
        }
        done += 1
        if done % 300 == 0:
            json.dump(cache, open(DETAIL, 'w', encoding='utf-8'), ensure_ascii=False)
            print(f'{done}/{len(todo)}  {time.time() - t0:.0f}s', flush=True)

json.dump(cache, open(DETAIL, 'w', encoding='utf-8'), ensure_ascii=False)
print('有音标', sum(1 for v in cache.values() if v.get('phonetic')),
      '| 有例句', sum(1 for v in cache.values() if v.get('example')))
print('接着跑 python build_static.py')
