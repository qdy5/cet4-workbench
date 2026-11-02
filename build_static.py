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

for name in ('reading.json', 'translation.json', 'writing.json'):
    shutil.copy(os.path.join(ROOT, 'data', name), os.path.join(DATA, name))
    print('copied', name)

# 听力：带上导入的音频（相对路径）
listen = json.load(open(os.path.join(ROOT, 'data', 'listening.json'), encoding='utf-8'))
adir = os.path.join(ROOT, 'audio')
os.makedirs(os.path.join(DOCS, 'audio'), exist_ok=True)
for x in listen:
    x['audio_url'] = None
    for ext in ('.mp3', '.m4a', '.wav', '.ogg'):
        src = os.path.join(adir, f"listen_{x['id']}{ext}")
        if os.path.exists(src):
            shutil.copy(src, os.path.join(DOCS, 'audio', f"listen_{x['id']}{ext}"))
            x['audio_url'] = f"audio/listen_{x['id']}{ext}"
            break
json.dump(listen, open(os.path.join(DATA, 'listening.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('listening with audio:', sum(1 for x in listen if x['audio_url']))

# app.css 复制
shutil.copy(os.path.join(ROOT, 'static', 'css', 'app.css'), os.path.join(DOCS, 'app.css'))
print('css copied')
