# -*- coding: utf-8 -*-
"""生成 GitHub Pages 用的静态数据（docs/data），并从词库合并音标/例句。"""
import io, json, os, shutil, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(ROOT, 'docs')
DATA = os.path.join(DOCS, 'data')
os.makedirs(DATA, exist_ok=True)

words = json.load(open(os.path.join(ROOT, 'data', 'words.json'), encoding='utf-8'))
detail = json.load(open(os.path.join(ROOT, 'data', 'detail.json'), encoding='utf-8'))

out = []
for w in words:
    d = detail.get(w['word'], {})
    out.append({
        'w': w['word'], 'p': w['pos'], 'c': w['cn'],
        'k': w.get('coll', ''), 'ch': w.get('chapter', ''),
        'ph': d.get('phonetic', ''), 'e': d.get('example', ''),
        'ec': d.get('example_cn', ''), 'a': d.get('audio', ''),
    })
json.dump(out, open(os.path.join(DATA, 'words.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
print('words:', len(out), f'{os.path.getsize(os.path.join(DATA, "words.json"))/1024:.0f}KB')

for name in ('reading.json', 'listening.json', 'translation.json', 'writing.json'):
    shutil.copy(os.path.join(ROOT, 'data', name), os.path.join(DATA, name))
    print('copied', name)

# app.css 复制
shutil.copy(os.path.join(ROOT, 'static', 'css', 'app.css'), os.path.join(DOCS, 'app.css'))
print('css copied')
