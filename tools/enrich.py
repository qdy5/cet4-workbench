# -*- coding: utf-8 -*-
"""内容整形：桌面版和静态版共用这一份，保证两端拿到完全一样的数据。

做三件事：
1. 给每个单词生成 3 个干扰项（词性一致、长度接近、尽量共用汉字），不再运行时随机抽；
2. 把音标/例句/搭配拆到 info 里，首屏只下轻量词表；
3. 去掉已失效的外部发音 URL，听力音频统一走本地相对路径。
"""
import hashlib
import json
import os
import random
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')

AUDIO_EXTS = ('.mp3', '.m4a', '.wav', '.ogg')


def _read(name):
    with open(os.path.join(DATA, name), encoding='utf-8') as f:
        return json.load(f)


def _read_detail():
    """detail/details 两种命名都兼容；缺失时退化为只有词表，不报错。"""
    for name in ('detail.json', 'details.json'):
        p = os.path.join(DATA, name)
        if os.path.exists(p):
            with open(p, encoding='utf-8') as f:
                return json.load(f)
    return {}


def _shared(a, b):
    return len(set(a) & set(b))


def _length_ok(a, b, tol_ratio):
    return abs(len(a) - len(b)) <= max(3, round(len(b) * tol_ratio))


def _jaccard(a, b):
    sa, sb = set(a), set(b)
    return len(sa & sb) / max(1, len(sa | sb))


def build_distractors(words):
    """为每个词挑 3 个干扰项，返回 {word_id: [word_id, word_id, word_id]}。

    规则：词性一致、长度接近、优先共用汉字（真易混），并排除与答案重叠超过 50% 的
    「近义到说不清」的选项。返回 id 而不是释义，静态包能小 400KB。
    """
    by_pos = defaultdict(list)
    for w in words:
        by_pos[w['p'] or ''].append(w)

    out = {}
    for w in words:
        picked = []
        for tol in (0.35, 0.6, 1.2):
            pool = [x for x in by_pos[w['p'] or ''] if x['id'] != w['id']]
            cands = []
            for x in pool:
                if not x['c'] or x['c'] == w['c']:
                    continue
                if not _length_ok(x['c'], w['c'], tol):
                    continue
                if _jaccard(x['c'], w['c']) > 0.34:
                    continue
                if x['c'] in w['c'] or w['c'] in x['c']:
                    continue
                cands.append(x)
            # 共享字越多越像，但完全一样的不能要：目标是有区分度的「1 个字重叠」
            cands.sort(key=lambda x: (abs(_shared(x['c'], w['c']) - 1),
                                      abs(len(x['c']) - len(w['c'])), x['id']))
            for x in cands:
                if x['id'] not in picked:
                    picked.append(x['id'])
                if len(picked) == 3:
                    break
            if len(picked) == 3:
                break
        # 极端兜底：词性池太小，跨词性按长度取
        if len(picked) < 3:
            rest = [x for x in words if x['id'] != w['id'] and x['c'] and x['c'] != w['c']
                    and _length_ok(x['c'], w['c'], 0.8) and _jaccard(x['c'], w['c']) <= 0.5]
            for x in rest:
                if x['id'] not in picked:
                    picked.append(x['id'])
                if len(picked) == 3:
                    break
        out[w['id']] = picked[:3]
    return out


def enrich():
    meta = _read('meta.json')
    raw_words = _read('words.json')
    detail = _read_detail()
    reading = _read('reading.json')
    listening = _read('listening.json')
    translation = _read('translation.json')
    writing = _read('writing.json')

    words = []
    for i, w in enumerate(raw_words, start=1):
        words.append({
            'id': i,
            'w': w['word'],
            'p': (w.get('pos') or '').strip(),
            'c': (w.get('cn') or '').strip(),
            'ch': (w.get('chapter') or '').strip(),
            'co': (w.get('coll') or '').strip(),   # 常用搭配，划词浮层要显示
        })

    dz = build_distractors(words)
    for w in words:
        w['dz'] = dz[w['id']]

    info = []
    for w in words:
        d = detail.get(w['w'], {})
        raw = raw_words[w['id'] - 1]
        info.append([
            (d.get('phonetic') or '').strip(),
            (d.get('example') or '').strip(),
            (d.get('example_cn') or '').strip(),
            (raw.get('coll') or '').strip(),
        ])

    audio = set(os.listdir(os.path.join(ROOT, 'audio'))) if os.path.isdir(os.path.join(ROOT, 'audio')) else set()
    for x in listening:
        url = None
        for ext in AUDIO_EXTS:
            name = f"listen_{x['id']}{ext}"
            if name in audio:
                url = f'audio/{name}'
                break
        x['audio_url'] = url

    content = {
        'meta': meta,
        'words': words,
        'info': info,
        'reading': reading,
        'listening': listening,
        'translation': translation,
        'writing': writing,
    }
    digest = hashlib.sha1(
        json.dumps(content, ensure_ascii=False, sort_keys=True).encode('utf-8')
    ).hexdigest()[:10]
    content['meta'] = {**meta, 'build': digest}
    return content


if __name__ == '__main__':
    c = enrich()
    print('words', len(c['words']), '| info', len(c['info']),
          '| listening with audio', sum(1 for x in c['listening'] if x['audio_url']),
          '| build', c['meta']['build'])
