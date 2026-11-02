# -*- coding: utf-8 -*-
"""抓音标 / 例句 / 发音音频。数据源：dictionaryapi.dev，Qwerty 词表做音标兜底。
可重复运行：已抓过的词会跳过。"""
import io
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = os.path.dirname(os.path.abspath(__file__))
DETAIL = os.path.join(ROOT, 'data', 'detail.json')
QWERTY = r'C:\tmp\cet4_qwerty.json'

cache = {}
if os.path.exists(DETAIL):
    cache = json.load(open(DETAIL, encoding='utf-8'))

qmap = {}
if os.path.exists(QWERTY):
    for x in json.load(open(QWERTY, encoding='utf-8')):
        qmap[x['name'].lower()] = x.get('usphone') or x.get('ukphone') or ''

words = [w['word'] for w in json.load(open(os.path.join(ROOT, 'data', 'words.json'), encoding='utf-8'))]
todo = [w for w in words if w.lower() not in cache and ' ' not in w]
print(f'总词 {len(words)}，待抓 {len(todo)}，已有 {len(cache)}')

sess = requests.Session()
sess.headers['User-Agent'] = 'Mozilla/5.0 (CET4 workbench)'
lock = time.time()


def fetch(w):
    try:
        r = sess.get('https://api.dictionaryapi.dev/api/v2/entries/en/' + w.lower(), timeout=8)
        if r.status_code != 200:
            return w, {'phonetic': qmap.get(w.lower(), ''), 'example': '', 'audio': ''}
        d = r.json()
        if not isinstance(d, list) or not d:
            return w, {'phonetic': qmap.get(w.lower(), ''), 'example': '', 'audio': ''}
        e = d[0]
        ph = e.get('phonetic') or ''
        audio = ''
        for p in e.get('phonetics', []):
            if p.get('audio'):
                audio = p['audio']
                break
        ex = ''
        for m in e.get('meanings', []):
            for df in m.get('definitions', []):
                if df.get('example') and len(df['example']) > 10:
                    ex = df['example']
                    break
            if ex:
                break
        return w, {'phonetic': ph or qmap.get(w.lower(), ''), 'example': ex, 'audio': audio}
    except Exception:
        return w, {'phonetic': qmap.get(w.lower(), ''), 'example': '', 'audio': ''}


done = 0
with ThreadPoolExecutor(max_workers=16) as pool:
    for w, info in pool.map(fetch, todo):
        cache[w] = info
        done += 1
        if done % 200 == 0:
            json.dump(cache, open(DETAIL, 'w', encoding='utf-8'), ensure_ascii=False)
            print(f'{done}/{len(todo)}  {time.time() - lock:.0f}s', flush=True)

json.dump(cache, open(DETAIL, 'w', encoding='utf-8'), ensure_ascii=False)
ph = sum(1 for v in cache.values() if v.get('phonetic'))
ex = sum(1 for v in cache.values() if v.get('example'))
print(f'完成：{len(cache)} 词，音标 {ph}，例句 {ex}')
