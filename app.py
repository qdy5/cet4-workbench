# -*- coding: utf-8 -*-
"""CET4 学习工作台 · 本机服务（Flask + SQLite）

职责只有三件事：把内容发出去、把进度存下来、把本地模型接上。
排程算法在前端 core/fsrs.js 里算，后端不重复实现，避免两端算出不同结果。
"""
import json
import os
import sqlite3
import sys
from datetime import datetime

from flask import Flask, Response, g, jsonify, request, send_from_directory, stream_with_context

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, 'web')
AUDIO = os.path.join(ROOT, 'audio')
DB = os.environ.get('CET4_DB') or os.path.join(ROOT, 'workbench.db')
sys.path.insert(0, os.path.join(ROOT, 'tools'))

from enrich import enrich  # noqa: E402
from ai_grade import grade as ai_grade  # noqa: E402

app = Flask(__name__, static_folder=None)
app.json.ensure_ascii = False

CONTENT = {}
DEFAULT_SETTINGS = {'newPerDay': 30, 'retention': 0.9, 'model': 'qwen2.5:1.5b'}


def content():
    global CONTENT
    if not CONTENT:
        CONTENT = enrich()
    return CONTENT


# ---------------- 数据库 ----------------

SCHEMA = '''
CREATE TABLE IF NOT EXISTS cards(
  word_id INTEGER PRIMARY KEY,
  s REAL DEFAULT 0, d REAL DEFAULT 0,
  state TEXT DEFAULT 'new', reps INTEGER DEFAULT 0, lapses INTEGER DEFAULT 0,
  due INTEGER DEFAULT 0, last INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events(
  id TEXT PRIMARY KEY, ts INTEGER, type TEXT, ref TEXT,
  correct INTEGER DEFAULT 0, total INTEGER DEFAULT 0, seconds INTEGER DEFAULT 0, detail TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS drafts(key TEXT PRIMARY KEY, text TEXT DEFAULT '', ts INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due);
CREATE INDEX IF NOT EXISTS idx_cards_state ON cards(state);
'''


def db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB, timeout=10)
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA journal_mode=WAL')
        g.db.execute('PRAGMA synchronous=NORMAL')
        g.db.execute('PRAGMA busy_timeout=5000')
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop('db', None)
    if conn is not None:
        conn.close()


def init_db():
    conn = sqlite3.connect(DB, timeout=10)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


# ---------------- 基础 ----------------

@app.get('/api/health')
def health():
    return jsonify({'ok': True, 'mode': 'api', 'time': datetime.now().isoformat(timespec='seconds')})


@app.get('/api/meta')
def meta():
    return jsonify(content()['meta'])


@app.get('/api/words')
def words():
    return jsonify(content()['words'])


@app.get('/api/info')
def info():
    return jsonify(content()['info'])


@app.get('/api/reading')
def reading():
    return jsonify(content()['reading'])


@app.get('/api/listening')
def listening():
    return jsonify(content()['listening'])


@app.get('/api/translation')
def translation():
    return jsonify(content()['translation'])


@app.get('/api/writing')
def writing():
    return jsonify(content()['writing'])


# ---------------- 卡片 ----------------

def row_card(r):
    return {
        'wordId': r['word_id'], 's': r['s'], 'd': r['d'], 'state': r['state'],
        'reps': r['reps'], 'lapses': r['lapses'], 'due': r['due'], 'last': r['last'],
    }


@app.get('/api/cards')
def cards():
    rows = db().execute('SELECT * FROM cards').fetchall()
    return jsonify([row_card(r) for r in rows])


@app.get('/api/cards/<int:wid>')
def card_one(wid):
    r = db().execute('SELECT * FROM cards WHERE word_id=?', (wid,)).fetchone()
    return jsonify(row_card(r) if r else {})


@app.post('/api/cards/<int:wid>')
def card_save(wid):
    b = request.get_json(silent=True) or {}
    db().execute(
        '''INSERT INTO cards(word_id,s,d,state,reps,lapses,due,last) VALUES(?,?,?,?,?,?,?,?)
           ON CONFLICT(word_id) DO UPDATE SET s=excluded.s, d=excluded.d, state=excluded.state,
           reps=excluded.reps, lapses=excluded.lapses, due=excluded.due, last=excluded.last''',
        (wid, b.get('s', 0), b.get('d', 0), b.get('state', 'new'), int(b.get('reps', 0)),
         int(b.get('lapses', 0)), int(b.get('due', 0)), int(b.get('last', 0))))
    db().commit()
    return jsonify({'ok': True})


# ---------------- 事件 ----------------

def fetch_events(limit=0):
    sql = 'SELECT * FROM events ORDER BY ts DESC'
    args = ()
    if limit:
        sql += ' LIMIT ?'
        args = (limit,)
    out = []
    for r in db().execute(sql, args).fetchall():
        out.append({
            'id': r['id'], 'ts': r['ts'], 'type': r['type'], 'ref': r['ref'],
            'correct': r['correct'], 'total': r['total'], 'seconds': r['seconds'],
            'detail': json.loads(r['detail'] or '{}'),
        })
    return out


@app.get('/api/events')
def events():
    limit = min(int(request.args.get('limit', 0) or 0), 20000)
    return jsonify(fetch_events(limit))


@app.post('/api/events')
def event_add():
    b = request.get_json(silent=True) or {}
    ts = int(b.get('ts') or 0) or int(datetime.now().timestamp() * 1000)
    eid = str(b.get('id') or f"{ts}-{os.urandom(3).hex()}")
    db().execute(
        'INSERT OR REPLACE INTO events(id,ts,type,ref,correct,total,seconds,detail) VALUES(?,?,?,?,?,?,?,?)',
        (eid, ts, b.get('type', ''), str(b.get('ref', '')), int(b.get('correct', 0)),
         int(b.get('total', 0)), int(b.get('seconds', 0)),
         json.dumps(b.get('detail') or {}, ensure_ascii=False)))
    db().commit()
    return jsonify({'ok': True, 'id': eid})


# ---------------- 草稿 / 设置 ----------------

@app.get('/api/drafts/<path:key>')
def draft_get(key):
    r = db().execute('SELECT text,ts FROM drafts WHERE key=?', (key,)).fetchone()
    return jsonify({'text': r['text'] if r else '', 'ts': r['ts'] if r else 0})


@app.post('/api/drafts/<path:key>')
def draft_put(key):
    b = request.get_json(silent=True) or {}
    db().execute('INSERT INTO drafts(key,text,ts) VALUES(?,?,?) '
                 'ON CONFLICT(key) DO UPDATE SET text=excluded.text, ts=excluded.ts',
                 (key, b.get('text', ''), int(datetime.now().timestamp() * 1000)))
    db().commit()
    return jsonify({'ok': True})


def read_settings():
    out = dict(DEFAULT_SETTINGS)
    for r in db().execute('SELECT k,v FROM settings').fetchall():
        try:
            out[r['k']] = json.loads(r['v'])
        except json.JSONDecodeError:
            out[r['k']] = r['v']
    return out


@app.get('/api/settings')
def settings_get():
    return jsonify(read_settings())


@app.post('/api/settings')
def settings_put():
    b = request.get_json(silent=True) or {}
    for k, v in b.items():
        if k not in DEFAULT_SETTINGS:
            continue
        db().execute('INSERT INTO settings(k,v) VALUES(?,?) '
                     'ON CONFLICT(k) DO UPDATE SET v=excluded.v', (k, json.dumps(v)))
    db().commit()
    return jsonify(read_settings())


# ---------------- 备份 ----------------

@app.get('/api/export')
def export_all():
    cards_ = [row_card(r) for r in db().execute('SELECT * FROM cards').fetchall()]
    events_ = fetch_events(0)
    drafts_ = [{'key': r['key'], 'text': r['text'], 'ts': r['ts']}
               for r in db().execute('SELECT * FROM drafts').fetchall()]
    return jsonify({'version': 2, 'mode': 'api', 'exportedAt': int(datetime.now().timestamp() * 1000),
                    'cards': cards_, 'events': events_, 'drafts': drafts_})


@app.post('/api/import')
def import_all():
    b = request.get_json(silent=True) or {}
    conn = db()
    if not b.get('merge', True):
        conn.execute('DELETE FROM cards')
        conn.execute('DELETE FROM events')
    for c in b.get('cards') or []:
        wid = int(c.get('wordId') or 0)
        if not wid:
            continue
        old = conn.execute('SELECT reps FROM cards WHERE word_id=?', (wid,)).fetchone()
        if old and old['reps'] > int(c.get('reps', 0)) and b.get('merge', True):
            continue
        conn.execute(
            '''INSERT INTO cards(word_id,s,d,state,reps,lapses,due,last) VALUES(?,?,?,?,?,?,?,?)
               ON CONFLICT(word_id) DO UPDATE SET s=excluded.s, d=excluded.d, state=excluded.state,
               reps=excluded.reps, lapses=excluded.lapses, due=excluded.due, last=excluded.last''',
            (wid, c.get('s', 0), c.get('d', 0), c.get('state', 'new'), int(c.get('reps', 0)),
             int(c.get('lapses', 0)), int(c.get('due', 0)), int(c.get('last', 0))))
    for e in b.get('events') or []:
        ts = int(e.get('ts') or 0)
        eid = str(e.get('id') or f"{ts}-{os.urandom(3).hex()}")
        conn.execute(
            'INSERT OR IGNORE INTO events(id,ts,type,ref,correct,total,seconds,detail) VALUES(?,?,?,?,?,?,?,?)',
            (eid, ts, e.get('type', ''), str(e.get('ref', '')), int(e.get('correct', 0)),
             int(e.get('total', 0)), int(e.get('seconds', 0)),
             json.dumps(e.get('detail') or {}, ensure_ascii=False)))
    for d in b.get('drafts') or []:
        if not d.get('key'):
            continue
        conn.execute('INSERT OR REPLACE INTO drafts(key,text,ts) VALUES(?,?,?)',
                     (d['key'], d.get('text', ''), int(d.get('ts') or 0)))
    conn.commit()
    n_cards = conn.execute('SELECT COUNT(*) c FROM cards').fetchone()['c']
    n_events = conn.execute('SELECT COUNT(*) c FROM events').fetchone()['c']
    return jsonify({'cards': n_cards, 'events': n_events})


@app.post('/api/reset')
def reset():
    conn = db()
    conn.execute('DELETE FROM cards')
    conn.execute('DELETE FROM events')
    conn.execute('DELETE FROM drafts')
    conn.commit()
    return jsonify({'ok': True})


# ---------------- 本地模型答疑（SSE 流式） ----------------

SYSTEM_PROMPT = (
    '你是中国大学英语四级（CET4）助教。只用简体中文回答，先给结论再给一句例句或理由。'
    '不确定就直说，不要编造。回答控制在 150 字以内。'
)


@app.post('/api/ask')
def ask():
    import urllib.request

    body = request.get_json(silent=True) or {}
    q = (body.get('q') or '').strip()[:800]
    model = read_settings().get('model', DEFAULT_SETTINGS['model'])
    if not q:
        return jsonify({'error': 'empty'}), 400

    payload = json.dumps({
        'model': model,
        'stream': True,
        'messages': [{'role': 'system', 'content': SYSTEM_PROMPT}, {'role': 'user', 'content': q}],
        'options': {'temperature': 0.3, 'num_predict': 320},
    }).encode('utf-8')

    def gen():
        try:
            req = urllib.request.Request(
                'http://127.0.0.1:11434/api/chat', data=payload,
                headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=120) as resp:
                for line in resp:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    delta = (obj.get('message') or {}).get('content', '')
                    if delta:
                        yield 'data: ' + json.dumps({'delta': delta}, ensure_ascii=False) + '\n\n'
                    if obj.get('done'):
                        break
        except Exception as exc:  # Ollama 没启动
            msg = f'本地模型没连上（{type(exc).__name__}）。先在终端跑 ollama serve。'
            yield 'data: ' + json.dumps({'delta': msg}, ensure_ascii=False) + '\n\n'
        yield 'data: [DONE]\n\n'

    return Response(stream_with_context(gen()), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})



# ---------------- AI 批改 ----------------

@app.post('/api/ai/grade')
def api_ai_grade():
    body = request.get_json(silent=True) or {}
    kind = (body.get('kind') or '').strip()
    payload = body.get('payload') or {}
    if not kind:
        return jsonify({'ok': False, 'error': 'kind_required'}), 400
    try:
        return jsonify(ai_grade(kind, payload))
    except Exception as exc:
        return jsonify({'ok': False, 'error': f'{type(exc).__name__}: {exc}'}), 500


@app.get('/api/ai/status')
def api_ai_status():
    from ai_grade import load_config
    cfg = load_config()
    return jsonify({'model': cfg['model'], 'base_url': cfg['base_url'],
                    'has_key': bool(cfg.get('api_key')),
                    'fallback': cfg['fallback_model']})


# ---------------- 静态文件 ----------------

@app.get('/')
def index():
    return send_from_directory(WEB, 'index.html')


@app.get('/audio/<path:name>')
def audio(name):
    return send_from_directory(AUDIO, name, conditional=True)


@app.get('/<path:name>')
def static_file(name):
    return send_from_directory(WEB, name, conditional=True)


def main():
    init_db()
    port = int(os.environ.get('CET4_PORT', 5173))
    host = os.environ.get('CET4_HOST', '0.0.0.0')
    url = f'http://127.0.0.1:{port}'
    lan = ''
    if host == '0.0.0.0':
        import socket
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(('8.8.8.8', 80))
            lan = f'http://{s.getsockname()[0]}:{port}'
            s.close()
        except OSError:
            lan = ''
    print(f'CET4 工作台: {url}')
    if lan:
        print(f'手机（同一 WiFi）: {lan}')
    if '--open' in sys.argv:
        # 起服务之后再开浏览器，避免首屏 ERR_CONNECTION_REFUSED
        import threading
        import webbrowser
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    try:
        from waitress import serve
        serve(app, host=host, port=port, threads=8)
    except ImportError:
        print('（没装 waitress，用 Flask 自带服务器，仅适合临时用：pip install waitress）')
        app.run(host=host, port=port, threaded=True)


if __name__ == '__main__':
    main()
