# -*- coding: utf-8 -*-
"""AI 批改：优先阿里云百炼（OpenAI 兼容），连不通再退本机 Ollama。"""
import json
import os
import re

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(ROOT, 'ai_config.json')

DEFAULTS = {
    'base_url': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    'api_key': '',
    'model': 'deepseek-v4.1-flash',
    'fallback_base': 'http://127.0.0.1:11434/v1',
    'fallback_model': 'qwen2.5:1.5b',
    'timeout': 60,
}


def load_config():
    cfg = dict(DEFAULTS)
    try:
        with open(CONFIG_PATH, encoding='utf-8') as f:
            cfg.update({k: v for k, v in json.load(f).items() if v})
    except (OSError, json.JSONDecodeError):
        pass
    cfg['api_key'] = cfg.get('api_key') or os.environ.get('DASHSCOPE_API_KEY', '')
    return cfg


SYSTEM = (
    '你是中国大学英语四级（CET4）阅卷老师。只输出 JSON，不要 markdown 代码块，不要寒暄。'
)

RUBRICS = {
    'word': (
        '学生在做四级单词选择题，选了错误选项。用不超过 80 字中文说明：'
        '正确释义是什么、学生选的那个词是什么意思（如果是形近/意近词，指出区别）、'
        '给一个记忆点。'
        'JSON 格式：{"score":0-100,"comment":"..."}'
    ),
    'translation': (
        '批改四级汉译英。按 15 分制给分，重点看：意思是否完整、语法是否正确、'
        '是否有中式英语、有没有用上采分点短语。'
        'JSON 格式：{"score":0-15,"comment":"不超过 120 字中文点评","issues":["..."],"better":"一句改进后的译文"}'
    ),
    'writing': (
        '批改四级作文（满分 15 分），看内容切题、结构、词汇句式、语法错误、字数。'
        'JSON 格式：{"score":0-15,"comment":"不超过 150 字中文点评","issues":["..."],"better":"一句示范的开头或结尾"}'
    ),
}


def _call(base, key, model, messages, timeout, max_tokens=700):
    headers = {'Content-Type': 'application/json'}
    if key:
        headers['Authorization'] = f'Bearer {key}'
    r = requests.post(f'{base.rstrip("/")}/chat/completions', headers=headers, timeout=timeout, json={
        'model': model,
        'messages': messages,
        'temperature': 0.2,
        'max_tokens': max_tokens,
    })
    r.raise_for_status()
    data = r.json()
    msg = (data.get('choices') or [{}])[0].get('message') or {}
    text = msg.get('content') or ''
    if not text.strip():
        text = msg.get('reasoning_content') or ''
    return text.strip()


def _parse(text):
    """模型可能带 markdown 或前后废话，尽量把 JSON 抠出来。"""
    m = re.search(r'\{.*\}', text, re.S)
    if m:
        try:
            obj = json.loads(m.group(0))
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass
    return {'score': None, 'comment': text[:400]}


def grade(kind, payload):
    rubric = RUBRICS.get(kind)
    if not rubric:
        return {'ok': False, 'error': 'unknown_kind'}

    user = [rubric]
    for k, label in (('zh', '原文'), ('ref', '参考译文'), ('answer', '学生答案'),
                     ('prompt', '题目'), ('word', '单词'), ('correct', '正确答案'),
                     ('picked', '学生选的')):
        if payload.get(k):
            user.append(f'{label}：{payload[k]}')
    messages = [{'role': 'system', 'content': SYSTEM},
                {'role': 'user', 'content': '\n'.join(user)}]

    cfg = load_config()
    errors = []
    if cfg.get('api_key'):
        try:
            text = _call(cfg['base_url'], cfg['api_key'], cfg['model'], messages, cfg['timeout'])
            out = _parse(text)
            out.update({'ok': True, 'source': cfg['model']})
            return out
        except Exception as exc:  # 401 / 超时 / 额度
            errors.append(f'{cfg["model"]}: {type(exc).__name__} {str(exc)[:80]}')

    try:
        text = _call(cfg['fallback_base'], '', cfg['fallback_model'], messages, 90, 600)
        out = _parse(text)
        out.update({'ok': True, 'source': f'本机 {cfg["fallback_model"]}'})
        return out
    except Exception as exc:
        errors.append(f'ollama: {type(exc).__name__}')

    return {'ok': False, 'error': '; '.join(errors)}