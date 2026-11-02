# -*- coding: utf-8 -*-
"""把本地素材 + 联网词表整理成 data/*.json，供 app.py 首次启动导入。"""
import html as H
import io
import json
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, 'data')
os.makedirs(DATA, exist_ok=True)

sys.path.insert(0, ROOT)
from content import LISTENING, READING_QUIZ, TRANSLATION, WRITING  # noqa: E402

POS_RE = re.compile(r'^(v|n|adj|adv|a|ad|prep|conj|pron|num|art|int)\.\s*')


def clean(s):
    return re.sub(r'\s+', ' ', s).strip()


def load_local_high_freq():
    p = os.path.join(DATA, 'highfreq.json')
    if not os.path.exists(p):
        return {}
    out = {}
    for w in json.load(open(p, encoding='utf-8')):
        key = w['word'].lower().strip()
        out[key] = {
            'coll': w.get('coll', ''),
            'chapter': (w.get('chapter') or '').strip('【】'),
            'pos': w.get('pos', ''),
            'cn': w.get('cn', ''),
        }
    return out


def load_official():
    p = r'C:\tmp\cet4_github.txt'
    if not os.path.exists(p):
        return []
    rows = []
    for line in open(p, encoding='utf-8', errors='ignore'):
        line = line.strip()
        if not line:
            continue
        parts = line.split('\t')
        word = clean(parts[0])
        rest = clean('\t'.join(parts[1:])) if len(parts) > 1 else ''
        if not word:
            continue
        m = POS_RE.match(rest)
        pos = m.group(0).strip() if m else ''
        cn = rest[m.end():].strip() if m else rest
        rows.append({'word': word, 'pos': pos, 'cn': cn})
    return rows


def build_words():
    local = load_local_high_freq()
    official = load_official()
    merged, seen = [], set()

    def add(word, pos, cn, coll, chapter, source):
        k = word.lower()
        if k in seen or not word:
            return
        seen.add(k)
        merged.append({'word': word, 'pos': pos, 'cn': cn, 'coll': coll,
                       'chapter': chapter or '四级大纲', 'source': source})

    # 本地高频词优先（有搭配）
    for k, v in local.items():
        add(k, v['pos'], v['cn'], v['coll'], v['chapter'], '高频')
    for r in official:
        add(r['word'], r['pos'], r['cn'], '', '四级大纲', '大纲')

    json.dump(merged, open(os.path.join(DATA, 'words.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    return merged


def build_reading():
    src_dir = r'C:\Users\twe19\Desktop\英语四六级产出\阅读\days'
    out = []
    for i in range(1, 5):
        p = os.path.join(src_dir, f'{i:03d}', 'content.json')
        if not os.path.exists(p):
            continue
        d = json.load(open(p, encoding='utf-8'))
        paras = [clean(re.sub(r'<[^>]+>', '', x)) for x in d['paras']]
        def text(x):
            return clean(H.unescape(re.sub(r'<[^>]+>', ' ', x)).replace('\xa0', ' '))
        out.append({
            'id': d['no'],
            'title_en': clean(H.unescape(d['title_en'])),
            'title_zh': clean(H.unescape(d['title_zh'])),
            'topic': text(d.get('vtip', '')),
            'paras': paras,
            'vocab': [[clean(H.unescape(v[0])), text(v[1])] for v in d.get('vocab', [])],
            'questions': READING_QUIZ.get(d['no'], []),
        })
    json.dump(out, open(os.path.join(DATA, 'reading.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    return out


if __name__ == '__main__':
    w = build_words()
    r = build_reading()
    print('words:', len(w), '| 高频:', sum(1 for x in w if x['source'] == '高频'))
    print('reading:', len(r))
    json.dump(LISTENING, open(os.path.join(DATA, 'listening.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    json.dump(TRANSLATION, open(os.path.join(DATA, 'translation.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    json.dump(WRITING, open(os.path.join(DATA, 'writing.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('listening/translation/writing ok')
