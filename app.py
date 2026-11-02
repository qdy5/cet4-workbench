# -*- coding: utf-8 -*-
"""CET4 学习工作台 · Flask + SQLite"""
import io
import json
import os
import random
import re
import sqlite3
import sys
from datetime import date, datetime, timedelta

from flask import Flask, g, jsonify, request, send_from_directory

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, 'data')
DB = os.path.join(ROOT, 'workbench.db')
AUDIO_DIR = os.path.join(ROOT, 'audio')
os.makedirs(AUDIO_DIR, exist_ok=True)

app = Flask(__name__, static_folder='static', template_folder='templates')
app.json.ensure_ascii = False

BOX_DAYS = [0, 1, 2, 4, 7, 15, 30]

EXAM = {
    'total': 710, 'minutes': 125, 'date': '2026-12-01', 'target': 450,
    'parts': [
        {'name': '写作', 'ratio': 15, 'time': 30, 'note': '120-180 词短文，议论文/说明文/应用文'},
        {'name': '听力', 'ratio': 35, 'time': 25, 'note': '短篇新闻 7% / 长对话 8% / 听力篇章 20%'},
        {'name': '阅读', 'ratio': 35, 'time': 40, 'note': '词汇理解 5% / 长篇阅读 10% / 仔细阅读 20%'},
        {'name': '翻译', 'ratio': 15, 'time': 30, 'note': '汉译英段落，中国文化/社会/经济'},
    ],
}


def load(name):
    with open(os.path.join(DATA, name), encoding='utf-8') as f:
        return json.load(f)


def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop('db', None)
    if db is not None:
        db.close()


def today():
    return date.today().isoformat()


def init_db():
    db = sqlite3.connect(DB)
    db.executescript('''
    CREATE TABLE IF NOT EXISTS words(
      id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT UNIQUE, pos TEXT, cn TEXT,
      coll TEXT, chapter TEXT, source TEXT);
    CREATE TABLE IF NOT EXISTS word_state(
      word_id INTEGER PRIMARY KEY, box INTEGER DEFAULT 0, due TEXT,
      seen INTEGER DEFAULT 0, correct INTEGER DEFAULT 0, wrong INTEGER DEFAULT 0,
      favorite INTEGER DEFAULT 0, last TEXT);
    CREATE TABLE IF NOT EXISTS attempts(
      id INTEGER PRIMARY KEY AUTOINCREMENT, module TEXT, ref TEXT, score REAL,
      total INTEGER, seconds INTEGER, detail TEXT, ts TEXT);
    CREATE TABLE IF NOT EXISTS notes(
      id INTEGER PRIMARY KEY AUTOINCREMENT, module TEXT, ref TEXT, body TEXT, ts TEXT);
    CREATE INDEX IF NOT EXISTS idx_attempts_ts ON attempts(ts);
    ''')
    cols = {r[1] for r in db.execute('PRAGMA table_info(words)').fetchall()}
    for c in ('phonetic', 'example', 'example_cn', 'audio'):
        if c not in cols:
            db.execute(f'ALTER TABLE words ADD COLUMN {c} TEXT DEFAULT ""')
    n = db.execute('SELECT COUNT(*) c FROM words').fetchone()[0]
    if n == 0:
        words = load('words.json')
        db.executemany(
            'INSERT OR IGNORE INTO words(word,pos,cn,coll,chapter,source) VALUES(?,?,?,?,?,?)',
            [(w['word'], w['pos'], w['cn'], w['coll'], w['chapter'], w['source']) for w in words])
        db.executemany(
            'INSERT OR IGNORE INTO word_state(word_id,due) VALUES(?,?)',
            [(r[0], today()) for r in db.execute('SELECT id FROM words').fetchall()])
    db.commit()
    sync_details(db)
    db.close()


def sync_details(db):
    p = os.path.join(DATA, 'detail.json')
    if not os.path.exists(p):
        return
    detail = json.load(open(p, encoding='utf-8'))
    rows = [(v.get('phonetic', ''), v.get('example', ''), v.get('example_cn', ''),
             v.get('audio', ''), k) for k, v in detail.items()]
    db.executemany('UPDATE words SET phonetic=?, example=?, example_cn=?, audio=? '
                   'WHERE lower(word)=lower(?)', rows)
    db.commit()


# ---------- 基础接口 ----------

@app.route('/')
def index():
    return send_from_directory(os.path.join(ROOT, 'templates'), 'index.html')


@app.route('/api/bootstrap')
def bootstrap():
    db = get_db()
    t = today()
    due = db.execute(
        'SELECT COUNT(*) c FROM word_state WHERE due<=?', (t,)).fetchone()[0]
    total = db.execute('SELECT COUNT(*) c FROM words').fetchone()[0]
    learned = db.execute('SELECT COUNT(*) c FROM word_state WHERE seen>0').fetchone()[0]
    wrong = db.execute('SELECT COUNT(*) c FROM word_state WHERE wrong>0').fetchone()[0]
    today_rows = db.execute(
        'SELECT module, COUNT(*) c FROM attempts WHERE ts LIKE ? GROUP BY module',
        (t + '%',)).fetchall()
    today_map = {r['module']: r['c'] for r in today_rows}
    today_map['words'] = db.execute(
        'SELECT COUNT(*) FROM word_state WHERE last=?', (t,)).fetchone()[0]
    dates = [r[0] for r in db.execute(
        'SELECT DISTINCT substr(ts,1,10) d FROM attempts ORDER BY d DESC').fetchall()]
    streak = 0
    cur = date.today()
    ds = set(dates)
    while cur.isoformat() in ds:
        streak += 1
        cur -= timedelta(days=1)
    if streak == 0 and (date.today() - timedelta(days=1)).isoformat() in ds:
        cur = date.today() - timedelta(days=1)
        while cur.isoformat() in ds:
            streak += 1
            cur -= timedelta(days=1)
    days_left = (date.fromisoformat(EXAM['date']) - date.today()).days
    return jsonify({
        'exam': EXAM, 'date': t, 'days_left': days_left,
        'stats': {'due': due, 'total': total, 'learned': learned, 'wrong': wrong,
                  'streak': streak, 'today': today_map},
    })


@app.route('/api/words')
def words():
    db = get_db()
    mode = request.args.get('mode', 'due')
    chapter = request.args.get('chapter', '')
    limit = min(int(request.args.get('limit', 60)), 300)
    t = today()
    sql = ('SELECT w.*, s.box, s.due, s.seen, s.correct, s.wrong, s.favorite '
           'FROM words w JOIN word_state s ON s.word_id=w.id')
    args, where = [], []
    if mode == 'due':
        where.append('s.due<=?')
        args.append(t)
    elif mode == 'new':
        where.append('s.seen=0')
    elif mode == 'wrong':
        where.append('s.wrong>0')
    elif mode == 'fav':
        where.append('s.favorite=1')
    if chapter:
        where.append('w.chapter=?')
        args.append(chapter)
    if where:
        sql += ' WHERE ' + ' AND '.join(where)
    sql += ' ORDER BY s.due ASC, w.id ASC LIMIT ?'
    args.append(limit)
    rows = [dict(r) for r in db.execute(sql, args).fetchall()]
    return jsonify(rows)


@app.route('/api/words/chapters')
def chapters():
    db = get_db()
    rows = db.execute(
        'SELECT chapter, COUNT(*) c FROM words GROUP BY chapter ORDER BY c DESC').fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/words/grade', methods=['POST'])
def grade():
    body = request.get_json(force=True)
    wid, g = int(body['id']), int(body['grade'])
    db = get_db()
    row = db.execute('SELECT * FROM word_state WHERE word_id=?', (wid,)).fetchone()
    box = row['box'] if row else 0
    if g == 0:
        box = 0
    elif g == 1:
        box = max(0, box)
    elif g == 2:
        box = min(6, box + 1)
    else:
        box = min(6, box + 2)
    due = (date.today() + timedelta(days=BOX_DAYS[box])).isoformat()
    correct = (row['correct'] if row else 0) + (1 if g >= 2 else 0)
    wrong = (row['wrong'] if row else 0) + (1 if g == 0 else 0)
    db.execute('''INSERT INTO word_state(word_id,box,due,seen,correct,wrong,last)
                  VALUES(?,?,?,1,?,?,?)
                  ON CONFLICT(word_id) DO UPDATE SET box=?,due=?,seen=seen+1,
                  correct=?,wrong=?,last=?''',
               (wid, box, due, correct, wrong, today(), box, due, correct, wrong, today()))
    db.commit()
    return jsonify({'box': box, 'due': due})


@app.route('/api/words/favorite', methods=['POST'])
def favorite():
    body = request.get_json(force=True)
    db = get_db()
    db.execute('UPDATE word_state SET favorite=1-favorite WHERE word_id=?', (int(body['id']),))
    db.commit()
    return jsonify({'ok': True})


@app.route('/api/words/card')
def word_card():
    """复习用：一个词 + 三个干扰义项，直接给选择题。"""
    db = get_db()
    mode = request.args.get('mode', 'due')
    chapter = request.args.get('chapter', '')
    t = today()
    where, args = [], []
    if mode == 'due':
        where.append('s.due<=?')
        args.append(t)
    elif mode == 'new':
        where.append('s.seen=0')
    elif mode == 'wrong':
        where.append('s.wrong>0')
    elif mode == 'fav':
        where.append('s.favorite=1')
    if chapter:
        where.append('w.chapter=?')
        args.append(chapter)
    cond = (' WHERE ' + ' AND '.join(where)) if where else ''
    row = db.execute(
        'SELECT w.* FROM words w JOIN word_state s ON s.word_id=w.id' + cond +
        ' ORDER BY RANDOM() LIMIT 1', args).fetchone()
    if not row:
        return jsonify({'done': True})
    left = db.execute('SELECT COUNT(*) FROM words w JOIN word_state s ON s.word_id=w.id' + cond,
                      args).fetchone()[0]
    distract = [r[0] for r in db.execute(
        'SELECT DISTINCT cn FROM words WHERE id!=? AND cn!="" ORDER BY RANDOM() LIMIT 12',
        (row['id'],)).fetchall()]
    opts = [row['cn']] + [d for d in distract if d != row['cn']][:3]
    random.shuffle(opts)
    return jsonify({
        'done': False, 'left': left,
        'word': row['word'], 'id': row['id'], 'pos': row['pos'],
        'phonetic': row['phonetic'] or '', 'cn': row['cn'],
        'coll': row['coll'] or '', 'example': row['example'] or '',
        'example_cn': row['example_cn'] or '', 'audio': row['audio'] or '',
        'opts': opts, 'ans': opts.index(row['cn']),
    })


@app.route('/api/ask', methods=['POST'])
def ask():
    """本地模型答疑（Ollama qwen2.5:1.5b）。不可用时给降级答复。"""
    b = request.get_json(force=True)
    q = (b.get('q') or '').strip()
    if not q:
        return jsonify({'answer': '先输入问题。'})
    import requests as rq
    payload = {
        'model': 'qwen2.5:1.5b',
        'stream': False,
        'messages': [
            {'role': 'system', 'content':
             '你是中国大学英语四级（CET4）助教。只用简体中文回答，三句话以内，'
             '先给结论再给一句例句或理由。不会的问题直接说不会，不要编。'},
            {'role': 'user', 'content': q[:500]},
        ],
        'options': {'temperature': 0.3, 'num_predict': 220},
    }
    try:
        r = rq.post('http://127.0.0.1:11434/api/chat', json=payload, timeout=60)
        r.raise_for_status()
        data = r.json()
        ans = (data.get('message') or {}).get('content', '').strip()
        return jsonify({'answer': ans or '模型没有返回内容。', 'model': 'qwen2.5:1.5b'})
    except Exception as e:
        return jsonify({'answer': '本地模型没启动（Ollama 未运行或模型未加载）。先执行：ollama serve',
                        'error': str(e)[:120], 'model': 'offline'})


@app.route('/api/words/quiz')
def quiz():
    db = get_db()
    n = min(int(request.args.get('n', 10)), 30)
    scope = request.args.get('scope', 'due')
    t = today()
    if scope == 'due':
        rows = db.execute(
            'SELECT w.id,w.word,w.cn,w.pos FROM words w JOIN word_state s ON s.word_id=w.id '
            'WHERE s.due<=? ORDER BY RANDOM() LIMIT ?', (t, n)).fetchall()
    else:
        rows = db.execute('SELECT id,word,cn,pos FROM words ORDER BY RANDOM() LIMIT ?', (n,)).fetchall()
    all_words = db.execute('SELECT cn FROM words ORDER BY RANDOM() LIMIT 400').fetchall()
    pool = [r[0] for r in all_words]
    out = []
    for r in rows:
        opts = [r['cn']]
        for p in pool:
            if p != r['cn'] and p not in opts:
                opts.append(p)
            if len(opts) == 4:
                break
        import random
        random.shuffle(opts)
        out.append({'id': r['id'], 'word': r['word'], 'answer': r['cn'],
                    'opts': opts, 'pos': r['pos']})
    return jsonify(out)


@app.route('/api/attempt', methods=['POST'])
def attempt():
    b = request.get_json(force=True)
    db = get_db()
    db.execute('INSERT INTO attempts(module,ref,score,total,seconds,detail,ts) VALUES(?,?,?,?,?,?,?)',
               (b.get('module'), str(b.get('ref', '')), b.get('score'), b.get('total'),
                b.get('seconds'), json.dumps(b.get('detail'), ensure_ascii=False),
                datetime.now().isoformat(timespec='seconds')))
    db.commit()
    return jsonify({'ok': True})


# ---------- 各模块 ----------

@app.route('/api/reading')
def reading_list():
    return jsonify([{k: v for k, v in r.items() if k not in ('questions', 'paras')}
                    for r in load('reading.json')])


@app.route('/api/reading/<int:rid>')
def reading_one(rid):
    for r in load('reading.json'):
        if r['id'] == rid:
            return jsonify({**r, 'questions': [{'q': q['q'], 'opts': q['opts']} for q in r['questions']]})
    return jsonify({'error': 'not found'}), 404


@app.route('/api/reading/submit', methods=['POST'])
def reading_submit():
    b = request.get_json(force=True)
    rid, answers = int(b['id']), b.get('answers', [])
    data = next((r for r in load('reading.json') if r['id'] == rid), None)
    if not data:
        return jsonify({'error': 'not found'}), 404
    detail, score = [], 0
    for i, q in enumerate(data['questions']):
        pick = answers[i] if i < len(answers) else -1
        ok = pick == q['ans']
        score += 1 if ok else 0
        detail.append({'i': i, 'pick': pick, 'ans': q['ans'], 'ok': ok, 'why': q['why']})
    db = get_db()
    db.execute('INSERT INTO attempts(module,ref,score,total,seconds,detail,ts) VALUES(?,?,?,?,?,?,?)',
               ('reading', str(rid), score, len(data['questions']), b.get('seconds', 0),
                json.dumps(detail, ensure_ascii=False), datetime.now().isoformat(timespec='seconds')))
    db.commit()
    return jsonify({'score': score, 'total': len(data['questions']), 'detail': detail})




def audio_for(lid):
    for ext in ('.mp3', '.m4a', '.wav', '.ogg'):
        p = os.path.join(AUDIO_DIR, f'listen_{lid}{ext}')
        if os.path.exists(p):
            return f'/audio/listen_{lid}{ext}'
    return None

@app.route('/api/listening')
def listening_list():
    return jsonify([{'id': x['id'], 'title': x['title'], 'scene': x['scene'],
                     'lines': len(x['lines']), 'questions': len(x['qs']),
                     'has_audio': bool(audio_for(x['id']))} for x in load('listening.json')])


@app.route('/api/listening/<int:lid>')
def listening_one(lid):
    for x in load('listening.json'):
        if x['id'] == lid:
            return jsonify({**x, 'audio_url': audio_for(lid),
                            'qs': [{'q': q['q'], 'opts': q['opts']} for q in x['qs']]})
    return jsonify({'error': 'not found'}), 404



@app.route('/api/listening/<int:lid>/audio', methods=['POST'])
def upload_audio(lid):
    f = request.files.get('file')
    if not f or not f.filename:
        return jsonify({'error': '没有文件'}), 400
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ('.mp3', '.m4a', '.wav', '.ogg'):
        return jsonify({'error': '只支持 mp3 / m4a / wav / ogg'}), 400
    for e in ('.mp3', '.m4a', '.wav', '.ogg'):
        old = os.path.join(AUDIO_DIR, f'listen_{lid}{e}')
        if os.path.exists(old):
            os.remove(old)
    name = f'listen_{lid}{ext}'
    f.save(os.path.join(AUDIO_DIR, name))
    return jsonify({'ok': True, 'url': f'/audio/{name}'})


@app.route('/audio/<path:name>')
def audio_file(name):
    return send_from_directory(AUDIO_DIR, name, conditional=True)


@app.route('/api/listening/submit', methods=['POST'])
def listening_submit():
    b = request.get_json(force=True)
    lid, answers = int(b['id']), b.get('answers', [])
    data = next((x for x in load('listening.json') if x['id'] == lid), None)
    if not data:
        return jsonify({'error': 'not found'}), 404
    detail, score = [], 0
    for i, q in enumerate(data['qs']):
        pick = answers[i] if i < len(answers) else -1
        ok = pick == q['ans']
        score += 1 if ok else 0
        detail.append({'i': i, 'pick': pick, 'ans': q['ans'], 'ok': ok, 'why': q['why']})
    db = get_db()
    db.execute('INSERT INTO attempts(module,ref,score,total,seconds,detail,ts) VALUES(?,?,?,?,?,?,?)',
               ('listening', str(lid), score, len(data['qs']), b.get('seconds', 0),
                json.dumps(detail, ensure_ascii=False), datetime.now().isoformat(timespec='seconds')))
    db.commit()
    return jsonify({'score': score, 'total': len(data['qs']), 'detail': detail})


@app.route('/api/translation')
def translation_list():
    return jsonify([{'id': x['id'], 'zh': x['zh']} for x in load('translation.json')])


@app.route('/api/translation/<int:tid>')
def translation_one(tid):
    for x in load('translation.json'):
        if x['id'] == tid:
            return jsonify({'id': x['id'], 'zh': x['zh'], 'tip': x['tip']})
    return jsonify({'error': 'not found'}), 404


@app.route('/api/translation/submit', methods=['POST'])
def translation_submit():
    b = request.get_json(force=True)
    tid, text = int(b['id']), b.get('text', '')
    data = next((x for x in load('translation.json') if x['id'] == tid), None)
    if not data:
        return jsonify({'error': 'not found'}), 404
    low = text.lower()
    hit = [k for k in data['keys'] if k.lower() in low]
    score = round(len(hit) / max(1, len(data['keys'])) * 100)
    db = get_db()
    db.execute('INSERT INTO notes(module,ref,body,ts) VALUES(?,?,?,?)',
               ('translation', str(tid), text, datetime.now().isoformat(timespec='seconds')))
    db.execute('INSERT INTO attempts(module,ref,score,total,seconds,detail,ts) VALUES(?,?,?,?,?,?,?)',
               ('translation', str(tid), score, 100, b.get('seconds', 0),
                json.dumps({'hit': hit}, ensure_ascii=False),
                datetime.now().isoformat(timespec='seconds')))
    db.commit()
    return jsonify({'ref': data['ref'], 'keys': data['keys'], 'hit': hit, 'score': score, 'tip': data['tip']})


@app.route('/api/writing')
def writing_list():
    return jsonify([{k: x[k] for k in ('id', 'type', 'title', 'zh', 'minutes', 'words')}
                    for x in load('writing.json')])


@app.route('/api/writing/<int:wid>')
def writing_one(wid):
    for x in load('writing.json'):
        if x['id'] == wid:
            return jsonify({k: v for k, v in x.items() if k != 'sample'})
    return jsonify({'error': 'not found'}), 404


@app.route('/api/writing/submit', methods=['POST'])
def writing_submit():
    b = request.get_json(force=True)
    wid, text = int(b['id']), b.get('text', '')
    data = next((x for x in load('writing.json') if x['id'] == wid), None)
    if not data:
        return jsonify({'error': 'not found'}), 404
    words = len(re.findall(r"[A-Za-z']+", text))
    db = get_db()
    db.execute('INSERT INTO notes(module,ref,body,ts) VALUES(?,?,?,?)',
               ('writing', str(wid), text, datetime.now().isoformat(timespec='seconds')))
    db.execute('INSERT INTO attempts(module,ref,score,total,seconds,detail,ts) VALUES(?,?,?,?,?,?,?)',
               ('writing', str(wid), words, 0, b.get('seconds', 0),
                json.dumps({'words': words}, ensure_ascii=False),
                datetime.now().isoformat(timespec='seconds')))
    db.commit()
    return jsonify({'words': words, 'sample': data['sample'], 'useful': data['useful']})


@app.route('/api/stats')
def stats():
    db = get_db()
    days = []
    for i in range(6, -1, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        c = db.execute('SELECT COUNT(*) c FROM attempts WHERE ts LIKE ?', (d + '%',)).fetchone()[0]
        days.append({'date': d[5:], 'count': c})
    by_module = {r['module']: {'n': r['c'], 'avg': round(r['a'] or 0, 1)}
                 for r in db.execute(
                     'SELECT module, COUNT(*) c, AVG(score*1.0/total) a FROM attempts '
                     'WHERE total>0 GROUP BY module').fetchall()}
    weak = [dict(r) for r in db.execute(
        'SELECT w.word,w.cn,w.pos,s.wrong,s.correct FROM words w JOIN word_state s ON s.word_id=w.id '
        'WHERE s.wrong>0 ORDER BY s.wrong DESC LIMIT 12').fetchall()]
    recent = [dict(r) for r in db.execute(
        'SELECT module,ref,score,total,ts FROM attempts ORDER BY id DESC LIMIT 12').fetchall()]
    return jsonify({'days': days, 'by_module': by_module, 'weak': weak, 'recent': recent})


@app.after_request
def no_cache(resp):
    resp.headers['Cache-Control'] = 'no-store'
    return resp


if __name__ == '__main__':
    init_db()
    print('CET4 工作台: http://127.0.0.1:5173')
    app.run(host='127.0.0.1', port=5173, debug=False)
