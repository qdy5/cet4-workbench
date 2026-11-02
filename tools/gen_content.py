# -*- coding: utf-8 -*-
"""用本机 Ollama 批量补内容（阅读 / 翻译 / 写作），产出直接写回 data/*.json。

只在「跑之前人工看一眼」的前提下用：脚本负责结构和长度校验，语义得自己抽查。
用法：
  python tools/gen_content.py --kind reading --n 2 --model qwen2.5:latest
  python tools/gen_content.py --kind translation --n 5
  python tools/gen_content.py --kind writing --n 3
  python tools/gen_content.py --kind reading --n 2 --dry     # 只打印不落盘
"""
import argparse
import io
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

PROMPTS = {
    'reading': '''你是中国大学英语四级命题人。写一篇四级仔细阅读长度的英语短文，主题不同于：{existing}。
要求：4 段，每段 90-120 词，句子不过分复杂，难度相当于四级真题；配 5 道单选题，每题 4 个选项，答案分布不要都在 B。
只输出 JSON，不要解释，格式：
{{"title_en":"...","title_zh":"...","topic":"3-5 个英文单词","paras":["段1","段2","段3","段4"],
"vocab":[["word","中文释义"] 共 6 组],
"questions":[{{"q":"英文问题","opts":["A","B","C","D"],"ans":0,"why":"一句中文解析，指明依据在第几段"}} 共 5 题]}}''',
    'translation': '''你是中国大学英语四级翻译命题人。出 1 道汉译英题，主题为中国文化/社会/经济/教育，句子难度相当于四级。
只输出 JSON，不要解释，格式：
{{"zh":"一句中文，20-40 字","ref":"参考译文","tip":"一句中文提示，说清关键句型",
"points":[{{"label":"采分点中文名","any":["英文表达1","英文表达2"]}} 共 4 个采分点]}}
采分点必须是参考译文里真实出现的短语或结构，any 里给 2-3 种可接受表达。''',
    'writing': '''你是中国大学英语四级写作命题人。出 1 道作文题（议论文/图表/书信之一）。
只输出 JSON，不要解释，格式：
{{"type":"议论文","title":"英文标题","zh":"中文题目说明","minutes":30,"words":"120-180",
"prompt":"英文题目要求 30-50 词","outline":["中文提纲1","提纲2","提纲3"],
"useful":["英文可用表达1","2","3","4"],"sample":"范文 120-160 词，分 3 段，段间用空行分隔"}}''',
}


def call(model, prompt, timeout=300):
    payload = json.dumps({
        'model': model, 'stream': False, 'format': 'json',
        'messages': [{'role': 'user', 'content': prompt}],
        'options': {'temperature': 0.8, 'num_predict': 2000},
    }).encode()
    req = urllib.request.Request('http://127.0.0.1:11434/api/chat', data=payload,
                                headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())['message']['content']


def parse_json(text):
    text = re.sub(r'^```(json)?|```$', '', text.strip(), flags=re.M).strip()
    start, end = text.find('{'), text.rfind('}')
    return json.loads(text[start:end + 1])


def check_reading(d):
    errs = []
    if not d.get('title_en') or not d.get('title_zh'):
        errs.append('缺标题')
    paras = d.get('paras') or []
    if len(paras) < 3:
        errs.append('段落不足')
    for p in paras:
        n = len(re.findall(r"[A-Za-z']+", p))
        if n < 70:
            errs.append(f'某段太短 {n} 词')
    if len(d.get('vocab') or []) < 4:
        errs.append('重点词不足')
    qs = d.get('questions') or []
    if len(qs) != 5:
        errs.append('题目数量不是 5')
    for q in qs:
        if len(q.get('opts') or []) != 4:
            errs.append('选项不是 4 个')
        if not isinstance(q.get('ans'), int) or not 0 <= q['ans'] <= 3:
            errs.append('答案索引异常')
        if len(q.get('why') or '') < 6:
            errs.append('缺解析')
    return errs


def check_translation(d):
    errs = []
    if not d.get('zh') or not d.get('ref'):
        errs.append('缺中文或译文')
    pts = d.get('points') or []
    if len(pts) < 3:
        errs.append('采分点不足')
    for p in pts:
        if not p.get('label') or len(p.get('any') or []) < 2:
            errs.append(f'采分点不完整: {p}')
    # 采分点至少要有一个真出现在参考译文里
    low = (d.get('ref') or '').lower()
    for p in pts:
        if not any(a.lower() in low for a in p.get('any') or []):
            errs.append(f'采分点在参考译文里找不到: {p.get("label")}')
    return errs


def check_writing(d):
    errs = []
    for k in ('type', 'title', 'zh', 'prompt', 'sample'):
        if not d.get(k):
            errs.append(f'缺 {k}')
    if len(d.get('outline') or []) < 3:
        errs.append('提纲不足')
    if len(re.findall(r"[A-Za-z']+", d.get('sample') or '')) < 90:
        errs.append('范文太短')
    return errs


CHECK = {'reading': check_reading, 'translation': check_translation, 'writing': check_writing}
FILE = {'reading': 'reading.json', 'translation': 'translation.json', 'writing': 'writing.json'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--kind', required=True, choices=list(CHECK))
    ap.add_argument('--n', type=int, default=1)
    ap.add_argument('--model', default='qwen2.5:latest')
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()

    path = os.path.join(DATA, FILE[a.kind])
    items = json.load(open(path, encoding='utf-8'))
    existing = '、'.join(x.get('title_en') or x.get('zh', '')[:16] for x in items)[:600]
    next_id = max(x['id'] for x in items) + 1

    added = 0
    tries = 0
    while added < a.n and tries < a.n * 3:
        tries += 1
        prompt = PROMPTS[a.kind]
        if a.kind == 'reading':
            prompt = prompt.format(existing=existing)
        try:
            raw = call(a.model, prompt)
            d = parse_json(raw)
        except Exception as exc:
            print(f'  第 {tries} 次生成失败：{exc}')
            continue
        errs = CHECK[a.kind](d)
        if errs:
            print(f'  第 {tries} 次校验不过：{"; ".join(errs[:3])}')
            continue
        d['id'] = next_id + added
        d['source'] = 'ai'
        if a.kind == 'reading':
            d.setdefault('topic', '')
        items.append(d)
        added += 1
        print(f'  ✓ 第 {d["id"]} 篇/题：{(d.get("title_en") or d.get("zh"))[:40]}')

    if not added:
        print('没有产出合格内容。')
        return 1
    if a.dry:
        print(json.dumps(items[-added:], ensure_ascii=False, indent=1)[:2000])
        return 0
    json.dump(items, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{FILE[a.kind]} 追加 {added} 条，共 {len(items)} 条。接着跑 python build_static.py')
    return 0


if __name__ == '__main__':
    sys.exit(main())
