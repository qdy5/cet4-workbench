# -*- coding: utf-8 -*-
"""给每道题生成「原文依据句」：必须能在原文里逐字找到，否则丢弃。"""
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_grade import _call, load_config  # noqa: E402

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = load_config()

PROMPT = '''下面是一篇英语文章和它的选择题（已给出正确答案）。
请为每道题从原文中找出**能直接支撑正确答案的那一句**，必须逐字照抄原文，不能改写、不能拼接两句。

返回 JSON 数组，每项：{"i": 题号从0开始, "quote": "原文原句"}

文章：
%s

题目：
%s
'''


def norm(s):
    return re.sub(r'\s+', ' ', s).strip().lower()


def pick_quote(text, quote, key_hint=''):
    """确保引文能在原文里找到；找不到就退一步用关键词句。"""
    t, q = norm(text), norm(quote)
    if q and q in t:
        return quote.strip()
    # 去掉首尾标点再试
    q2 = q.strip(' .,;:"\'')
    if q2 and q2 in t:
        return quote.strip()
    return ''


def split_sentences(text):
    parts = re.split(r'(?<=[.!?])\s+', text)
    return [p.strip() for p in parts if len(p.strip()) > 15]


def keyword_quote(text, q):
    ans = (q.get('opts') or [''])[q.get('ans', 0)]
    words = {w.lower() for w in re.findall(r'[A-Za-z]{4,}', ans)}
    best, score = '', 0
    for s in split_sentences(text):
        sc = len(words & {w.lower() for w in re.findall(r'[A-Za-z]{4,}', s)})
        if sc > score:
            best, score = s, sc
    return best if score >= 2 else ''


def evidence_for(text, questions, label):
    qs = '\n'.join(
        f'{i}. {q.get("q") or q.get("stem") or ""}\n   答案: {q.get("opts", ["?"] * 4)[q.get("ans", 0)]}'
        for i, q in enumerate(questions))
    out = []
    for attempt in range(2):
        try:
            raw = _call(CFG['base_url'], CFG['api_key'], CFG['model'],
                        [{'role': 'system', 'content': '只输出 JSON 数组，不要解释。'},
                         {'role': 'user', 'content': PROMPT % (text[:6000], qs)}],
                        60, 1200)
            m = re.search(r'\[.*\]', raw, re.S)
            if not m:
                raise ValueError('no json')
            rows = json.loads(m.group(0))
            out = []
            sents = split_sentences(text)
            for i in range(len(questions)):
                row = next((r for r in rows if int(r.get('i', -1)) == i), None)
                quote = (row or {}).get('quote', '')
                good = pick_quote(text, quote)
                if not good:
                    # 兜底：用与正确答案词重合度最高的那句
                    ans = (questions[i].get('opts') or [''])[questions[i].get('ans', 0)]
                    words = {w.lower() for w in re.findall(r'[A-Za-z]{4,}', ans)}
                    best, score = '', 0
                    for s in sents:
                        sc = len(words & {w.lower() for w in re.findall(r'[A-Za-z]{4,}', s)})
                        if sc > score:
                            best, score = s, sc
                    good = best if score >= 2 else ''
                out.append(good)
            if sum(1 for x in out if x) >= max(1, len(questions) // 2):
                return out
        except Exception as exc:
            print(f'  {label} 第{attempt+1}次失败: {type(exc).__name__} {str(exc)[:80]}')
    if not out or sum(1 for x in out if x) == 0:
        out = [keyword_quote(text, q) for q in questions]
    return out


def main():
    # 阅读
    p = os.path.join(ROOT, 'data', 'reading.json')
    data = json.load(open(p, encoding='utf-8'))
    for x in data:
        text = ' '.join(x['paras'])
        ev = ([q.get('ev', '') for q in x['questions']]
              if all(q.get('ev') for q in x['questions'])
              else evidence_for(text, x['questions'], f"reading{x['id']}"))
        for q, e in zip(x['questions'], ev):
            if e:
                q['ev'] = e
        print(f"reading {x['id']}: {sum(1 for e in ev if e)}/{len(ev)} 有依据句")
    json.dump(data, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    # 听力
    p = os.path.join(ROOT, 'data', 'listening.json')
    data = json.load(open(p, encoding='utf-8'))
    for x in data:
        text = ' '.join(l['en'] for l in x['lines'])
        ev = ([q.get('ev', '') for q in x['qs']]
              if all(q.get('ev') for q in x['qs'])
              else evidence_for(text, x['qs'], f"listening{x['id']}"))
        for q, e in zip(x['qs'], ev):
            if e:
                q['ev'] = e
        print(f"listening {x['id']}: {sum(1 for e in ev if e)}/{len(ev)} 有依据句")
    json.dump(data, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    # 同步到 docs/ 和 web/
    for base in ('docs', 'web'):
        for name in ('reading.json', 'listening.json'):
            src = os.path.join(ROOT, 'data', name)
            dst = os.path.join(ROOT, base, 'data', name)
            if os.path.isdir(os.path.dirname(dst)):
                with open(src, encoding='utf-8') as f:
                    obj = json.load(f)
                json.dump(obj, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('synced to docs/ and web/')


main()