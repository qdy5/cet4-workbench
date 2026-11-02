/* CET4 学习工作台 · 前端逻辑 */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const api = axios.create({ baseURL: '/', timeout: 15000 });

const state = {
  boot: null,
  view: 'home',
  words: { mode: 'due', chapter: '', list: [], i: 0, flipped: false, loading: false },
  quiz: { list: [], i: 0, answers: [], done: false, score: 0 },
  timer: null,
};

const TITLES = {
  home: ['总览', '今天先把该复习的复习掉'],
  words: ['单词', '认识、模糊、不认识——按真实感觉点'],
  listening: ['听力', '先盲听一遍，再对原文'],
  reading: ['阅读', '先看题再读文，控制时间'],
  translation: ['翻译', '先自己写，再看参考译文'],
  writing: ['写作', '计时写，写完再看范文'],
  assistant: ['答疑', '本地模型，离线也能问'],
  stats: ['数据', '看得见的进步才算进步'],
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('on'), 1800);
}

function fmt(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ---------------- 壳层 ---------------- */

async function boot() {
  const { data } = await api.get('/api/bootstrap');
  state.boot = data;
  paintChrome();
  go('home');
}

function paintChrome() {
  const s = state.boot.stats;
  $('#sf-streak').textContent = s.streak;
  $('#sf-due').textContent = s.due;
  $('#pill-date').textContent = state.boot.date;
  $('#pill-due').textContent = `待复习 ${s.due}`;
  $('#pill-streak').textContent = `连续 ${s.streak} 天`;
}

function go(view) {
  state.view = view;
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  const [t, sub] = TITLES[view];
  $('#page-title').textContent = t;
  $('#page-sub').textContent = sub;
  clearInterval(state.timer);
  state.timer = null;
  window.speechSynthesis && window.speechSynthesis.cancel();
  render[view]();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$$('#nav button').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));

/* ---------------- 总览 ---------------- */

const MODULES = [
  { v: 'words', t: '单词', d: '302 高频 + 4500 大纲', ico: 'M4 5h7v15H4zM13 5h7v15h-7z' },
  { v: 'listening', t: '听力', d: '5 组对话 · 可调速朗读', ico: 'M4 13v-1a8 8 0 0 1 16 0v1M3 13h4v7H5a2 2 0 0 1-2-2zM21 13h-4v7h2a2 2 0 0 0 2-2z' },
  { v: 'reading', t: '阅读', d: '4 篇真题型文章', ico: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z' },
  { v: 'translation', t: '翻译', d: '10 句汉译英 · 关键词打分', ico: 'M4 5h9M8.5 5c0 5-2 9-4.5 11M6 10c1.5 3 4 5 7 6M14 20l3.5-9 3.5 9' },
  { v: 'writing', t: '写作', d: '6 篇 · 计时 + 范文', ico: 'M15.5 4.5 19.5 8.5 8 20H4v-4z' },
  { v: 'stats', t: '数据', d: '7 日曲线 · 薄弱词', ico: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
];

render = {};

render.home = async () => {
  const s = state.boot.stats;
  const { data: st } = await api.get('/api/stats');
  const total = s.total, learned = s.learned;
  const pct = Math.round(learned / total * 100);
  const tasks = [
    ['单词复习', s.due > 0 ? `${s.due} 个待复习` : '今日已清空', s.due === 0, 'words'],
    ['听力一组', '约 8 分钟', !!s.today.listening, 'listening'],
    ['阅读一篇', '约 15 分钟', !!s.today.reading, 'reading'],
    ['翻译一题', '约 10 分钟', !!s.today.translation, 'translation'],
    ['写作一篇', '30 分钟', !!s.today.writing, 'writing'],
  ];
  const max = Math.max(1, ...st.days.map(d => d.count));
  $('#app').innerHTML = `
  <div class="hero">
    <div class="hero-main">
      <div class="eyebrow">Today's focus</div>
      <div class="hero-stats">
        <div><b>${state.boot.days_left}</b><span>天后考试 · ${state.boot.exam.date}</span></div>
        <div><b>${state.boot.exam.target}</b><span>目标分（425 过线）</span></div>
      </div>
      <h2>${s.due > 0 ? `先把 ${s.due} 个词清掉，<br>再谈别的。` : '今天没有到期词，<br>去拿一篇阅读。'}</h2>
      <p>四级 710 分：写作 15%、听力 35%、阅读 35%、翻译 15%，总时长 125 分钟。每天推进一点，比周末突击有效。</p>
      <div class="hero-actions">
        <button class="btn light" onclick="go('${s.due > 0 ? 'words' : 'reading'}')">${s.due > 0 ? '开始复习' : '开始阅读'}</button>
        <button class="btn light" onclick="go('stats')">看数据</button>
      </div>
    </div>
    <div class="card card-pad today">
      <div style="font-size:12px;letter-spacing:1px;color:var(--muted)">今日任务</div>
      ${tasks.map(([t, m, done, v]) => `
        <div class="task ${done ? 'done' : ''}">
          <span class="dot"></span>
          <a href="#" onclick="go('${v}');return false">${t}</a>
          <span class="meta">${done ? '已完成' : m}</span>
        </div>`).join('')}
      <div style="margin-top:4px">
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="mini-note" style="margin-top:6px">已学 ${learned} / ${total} 词（${pct}%）</div>
      </div>
    </div>
  </div>

  <div class="kpi">
    <div class="card"><div class="label">待复习</div><div class="value">${s.due}<small>词</small></div><div class="hint">到期就复习，别攒</div></div>
    <div class="card"><div class="label">连续学习</div><div class="value">${s.streak}<small>天</small></div><div class="hint">断了就从今天重来</div></div>
    <div class="card"><div class="label">今日练习</div><div class="value">${Object.values(s.today).reduce((a, b) => a + b, 0)}<small>次</small></div><div class="hint">单词 · 听力 · 阅读 · 翻译 · 写作</div></div>
    <div class="card"><div class="label">错词本</div><div class="value">${s.wrong}<small>词</small></div><div class="hint">错过的词会优先出现</div></div>
  </div>

  <div class="card card-pad">
    <div class="section-head"><div><b>最近 7 天</b> <span class="mini-note">每天完成的练习次数</span></div><span class="mini-note">共 ${st.days.reduce((a, b) => a + b.count, 0)} 次</span></div>
    <div class="chart">
      ${st.days.map((d, i) => `<div class="bar ${i === st.days.length - 1 ? 'today' : ''}">
        <i style="height:${Math.max(4, d.count / max * 90)}px"></i><span>${d.date}</span></div>`).join('')}
    </div>
  </div>

  <div class="modules">
    ${MODULES.map(m => `<div class="card module" onclick="go('${m.v}')">
      <div class="ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="${m.ico}"/></svg></div>
      <h3>${m.t}</h3><p>${m.d}</p></div>`).join('')}
  </div>`;
};

/* ---------------- 单词 ---------------- */

render.words = async () => {
  const { data: chapters } = await api.get('/api/words/chapters');
  const w = state.words;
  $('#app').innerHTML = `
  <div class="section-head">
    <div class="tabs" id="wmodes">
      <button data-m="due" class="on">待复习</button>
      <button data-m="new">新词</button>
      <button data-m="wrong">错词</button>
      <button data-m="fav">收藏</button>
      <button data-m="all">全部</button>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <select id="wchap"><option value="">全部章节</option>
        ${chapters.map(c => `<option value="${esc(c.chapter)}">${esc(c.chapter)} (${c.c})</option>`).join('')}
      </select>
    </div>
  </div>
  <div class="quiz-wrap">
    <div id="wcard"></div>
    <div class="card card-pad side-list" style="align-self:start">
      <div class="stat-row"><span>本轮答对</span><b id="w-right">0</b></div>
      <div class="stat-row"><span>本轮答题</span><b id="w-total">0</b></div>
      <div class="stat-row"><span>剩余待复习</span><b id="w-left">-</b></div>
      <div class="mini-note" style="margin-top:6px">答对推后 1/2/4/7/15/30 天，答错明天重来。键盘 1-4 选，回车下一题。</div>
    </div>
  </div>`;
  $$('#wmodes button').forEach(b => b.addEventListener('click', () => {
    $$('#wmodes button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    state.words.mode = b.dataset.m;
    loadCard();
  }));
  $('#wchap').addEventListener('change', e => { state.words.chapter = e.target.value; loadCard(); });
  state.words.right = 0; state.words.total = 0;
  await loadCard();
};

async function loadCard() {
  const w = state.words;
  const { data } = await api.get('/api/words/card', { params: { mode: w.mode, chapter: w.chapter } });
  w.card = data;
  w.answered = false;
  paintCard();
}

function paintCard() {
  const w = state.words, c = w.card;
  if (!c || c.done) {
    $('#wcard').innerHTML = `<div class="card card-pad"><div class="empty">这个范围没有待复习的词了。换个范围，或者去做听力和阅读。</div></div>`;
    return;
  }
  $('#w-left').textContent = c.left;
  $('#w-total').textContent = w.total;
  $('#w-right').textContent = w.right;
  $('#wcard').innerHTML = `
  <div class="card card-pad quiz-card">
    <div class="quiz-top">
      <div>
        <div class="word-en2">${esc(c.word)}</div>
        <div class="word-ph2">${esc(c.phonetic || '')}</div>
        <div class="mini-note" style="margin-top:4px">${esc(c.pos || '')} · 选出正确的中文意思</div>
      </div>
      <button class="speak" id="w-speak" style="position:static" title="朗读">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>
      </button>
    </div>
    <div class="opts" id="wopts" style="margin-top:18px">
      ${c.opts.map((o, i) => `<div class="opt" data-i="${i}"><span class="k">${'ABCD'[i]}</span><span>${esc(o)}</span></div>`).join('')}
    </div>
    <div id="wans"></div>
  </div>`;
  $('#w-speak').addEventListener('click', () => speakText(c.audio, c.word));
  $$('#wopts .opt').forEach(el => el.addEventListener('click', () => answerWord(+el.dataset.i)));
}

async function answerWord(i) {
  const w = state.words, c = w.card;
  if (w.answered || !c || c.done) return;
  w.answered = true;
  const ok = i === c.ans;
  $$('#wopts .opt').forEach((el, k) => {
    if (k === c.ans) el.classList.add('ok');
    else if (k === i) el.classList.add('no');
  });
  w.total += 1;
  w.right += ok ? 1 : 0;
  $('#w-total').textContent = w.total;
  $('#w-right').textContent = w.right;
  $('#wans').innerHTML = `
    <div class="answer ${ok ? 'good' : 'bad'}">
      <div class="ans-head">${ok ? '答对' : '答错'} · ${esc(c.word)} ${esc(c.phonetic || '')} <b>${esc(c.cn)}</b></div>
      ${c.coll ? `<div class="mini-note">搭配：${esc(c.coll)}</div>` : ''}
      ${c.example ? `<div class="ans-ex">${esc(c.example)}${c.example_cn ? `<span>${esc(c.example_cn)}</span>` : ''}</div>` : ''}
      <button class="btn primary small" id="wnext" style="margin-top:12px">下一题（回车）</button>
    </div>`;
  $('#wnext').addEventListener('click', loadCard);
  await api.post('/api/words/grade', { id: c.id, grade: ok ? 2 : 0 });
  if (ok) state.boot.stats.due = Math.max(0, state.boot.stats.due - 1);
  paintChrome();
}

function speakText(audio, text) {
  if (audio) { new Audio(audio).play().catch(() => tts(text, 0.9)); return; }
  tts(text, 0.9);
}

document.addEventListener('keydown', e => {
  if (state.view !== 'words') return;
  const c = state.words.card;
  if (!c || c.done) return;
  if (['1', '2', '3', '4'].includes(e.key)) answerWord(+e.key - 1);
  if (e.key === 'Enter' && state.words.answered) loadCard();
});

/* ---------------- 答疑 ---------------- */

const ASK_CHIPS = ['abandon 和 give up 有什么区别？', '虚拟语气怎么用？', '作文开头怎么写才不模板？', '我翻译总是中式英语，怎么办？'];

render.assistant = async () => {
  $('#app').innerHTML = `
  <div class="ask-wrap">
    <div class="card card-pad">
      <div class="section-head"><div><b>答疑</b> <span class="mini-note">本地模型 qwen2.5:1.5b · 不联网也能答</span></div>
        <span class="pill accent">离线</span></div>
      <div class="chips" id="chips">${ASK_CHIPS.map(q => `<button class="chip">${esc(q)}</button>`).join('')}</div>
      <div class="ask-log" id="asklog"><div class="ask-empty">问一个四级相关的问题。模型小，回答短，适合查语法点和用法区别。</div></div>
      <div class="ask-bar">
        <input id="askq" placeholder="例如：affect 和 effect 怎么区分？" />
        <button class="btn primary" id="asksend">提问</button>
      </div>
    </div>
  </div>`;
  const send = async () => {
    const q = $('#askq').value.trim();
    if (!q) return;
    $('#askq').value = '';
    const log = $('#asklog');
    log.insertAdjacentHTML('beforeend', `<div class="msg me">${esc(q)}</div>`);
    const id = 'm' + Date.now();
    log.insertAdjacentHTML('beforeend', `<div class="msg bot" id="${id}"><span class="loading">思考中…</span></div>`);
    log.scrollTop = log.scrollHeight;
    try {
      const { data } = await api.post('/api/ask', { q }, { timeout: 90000 });
      $('#' + id).innerHTML = `<div>${esc(data.answer).replace(/\n/g, '<br>')}</div><div class="mini-note" style="margin-top:6px">${esc(data.model || '')}</div>`;
    } catch (e) {
      $('#' + id).textContent = '请求失败：' + e.message;
    }
    log.scrollTop = log.scrollHeight;
  };
  $('#asksend').addEventListener('click', send);
  $('#askq').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
  $$('#chips .chip').forEach(b => b.addEventListener('click', () => { $('#askq').value = b.textContent; send(); }));
};

/* ---------------- 听力 ---------------- */
/* ---------------- 听力 ---------------- */

render.listening = async () => {
  const { data: list } = await api.get('/api/listening');
  $('#app').innerHTML = `
    <div class="section-head"><div><b>听力训练</b> <span class="mini-note">浏览器朗读，可选语速；先听再看原文</span></div></div>
    <div class="modules">${list.map(x => `
      <div class="card module" onclick="openListening(${x.id})">
        <div class="ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="3" y="13" width="4" height="7" rx="2"/><rect x="17" y="13" width="4" height="7" rx="2"/></svg></div>
        <h3>${esc(x.title)}</h3><p>${esc(x.scene)} · ${x.lines} 句 · ${x.questions} 题</p></div>`).join('')}
    </div>`;
};

window.openListening = async id => {
  const { data: x } = await api.get(`/api/listening/${id}`);
  $('#page-sub').textContent = x.scene;
  const N = x.lines.length;
  const words = [...new Set(x.lines.map(l => l.en).join(' ').match(/[A-Za-z]{4,}/g) || [])];
  const optsFor = i => {
    const bank = [x.blanks[i], ...x.blanks.filter((b, k) => k !== i)];
    for (const w of words) { if (!bank.includes(w)) bank.push(w); if (bank.length >= 4) break; }
    const arr = bank.slice(0, 4);
    for (let k = arr.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [arr[k], arr[j]] = [arr[j], arr[k]]; }
    return arr;
  };
  const picks = {};

  $('#app').innerHTML = `
  <div class="listen-grid">
    <div>
      <div class="audio-card">
        <div class="t">${esc(x.title)}</div><div class="s">${esc(x.scene)} · 共 ${N} 句</div>
        ${x.audio_url ? `
        <div class="player">
          <button class="play" id="play"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
          <div class="seek-wrap">
            <input type="range" id="seek" min="0" max="100" value="0" step="0.1">
            <div class="seek-meta"><span id="tcur">0:00</span><span id="tdur">--:--</span></div>
          </div>
        </div>
        <audio id="aud" src="${x.audio_url}" preload="metadata"></audio>
        ` : `
        <div class="player">
          <button class="play" id="play"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
          <div class="seek-wrap">
            <input type="range" id="seek" min="0" max="${N - 1}" value="0" step="1">
            <div class="seek-meta"><span id="pos">1 / ${N}</span>
              <select id="rate" class="rate-sel"><option value="0.75">0.75×</option><option value="1" selected>1.0×</option><option value="1.25">1.25×</option></select>
            </div>
          </div>
        </div>
        `}
        <div class="player-foot">
          <label class="pbtn" for="pick">${x.audio_url ? '替换 MP3' : '导入 MP3'}</label>
          <input type="file" id="pick" accept=".mp3,.m4a,.wav,.ogg,audio/*" hidden>
          ${x.audio_url ? '<span class="pbtn">拖动进度条可跳到任意位置</span>' : '<span class="pbtn">导入 MP3 后可按秒拖动</span>'}
        </div>
      </div>

      <div class="card card-pad" style="margin-top:14px">
        <div class="section-head"><b>选词填空</b><span class="mini-note">点选，不用打字</span></div>
        <div id="blanks">
          ${x.blanks.map((b, i) => `<div class="blank-item" data-i="${i}">
            <span class="blank-no">第 ${i + 1} 空</span>
            <div class="chips">${optsFor(i).map(o => `<button class="chip" data-w="${esc(o)}">${esc(o)}</button>`).join('')}</div>
          </div>`).join('')}
        </div>
        <div class="meta-row">
          <button class="btn ghost small" id="checkBlank">对答案</button>
          <span class="mini-note" id="blankRes"></span>
          <button class="btn ghost small" id="showScript" style="margin-left:auto">显示 / 隐藏原文</button>
        </div>
        <div class="script" id="script" style="display:none;margin-top:12px">
          ${x.lines.map((l, i) => `<div class="line" data-i="${i}"><span class="sp">${esc(l.sp)}</span>${esc(l.en)}</div>`).join('')}
        </div>
      </div>
    </div>

    <div>
      <div class="qs" id="lqs">
        ${x.qs.map((q, qi) => `<div class="q" data-q="${qi}">
          <div class="stem">${qi + 1}. ${esc(q.q)}</div>
          <div class="opts">${q.opts.map((o, oi) => `<div class="opt" data-i="${oi}"><span class="k">${'ABCD'[oi]}</span><span>${esc(o)}</span></div>`).join('')}</div>
        </div>`).join('')}
      </div>
      <button class="btn primary" id="lsubmit" style="width:100%">提交并看解析</button>
    </div>
  </div>`;

  /* ---- 播放 ---- */
  const playBtn = $('#play');
  const icon = on => on
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const fmtT = s => (isFinite(s) ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '--:--');

  if (x.audio_url) {
    const aud = $('#aud'), seek = $('#seek');
    aud.addEventListener('loadedmetadata', () => { seek.max = Math.max(1, aud.duration); $('#tdur').textContent = fmtT(aud.duration); });
    aud.addEventListener('timeupdate', () => {
      if (document.activeElement !== seek) seek.value = aud.currentTime;
      $('#tcur').textContent = fmtT(aud.currentTime);
    });
    aud.addEventListener('ended', () => { playBtn.innerHTML = icon(false); });
    seek.addEventListener('input', () => { aud.currentTime = +seek.value; $('#tcur').textContent = fmtT(+seek.value); });
    playBtn.addEventListener('click', () => {
      if (aud.paused) { aud.play(); playBtn.innerHTML = icon(true); }
      else { aud.pause(); playBtn.innerHTML = icon(false); }
    });
  } else {
    let playIdx = 0, playing = false;
    const seek = $('#seek'), posEl = $('#pos');
    const paint = () => {
      $$('.line').forEach(l => l.classList.toggle('on', +l.dataset.i === playIdx));
      seek.value = playIdx; posEl.textContent = `${playIdx + 1} / ${N}`;
    };
    const speakFrom = i => {
      speechSynthesis.cancel();
      let k = i;
      const step = () => {
        if (!playing || k >= N) { if (k >= N) { playing = false; playBtn.innerHTML = icon(false); } return; }
        playIdx = k; paint();
        const u = new SpeechSynthesisUtterance(x.lines[k].en);
        u.lang = 'en-US'; u.rate = +$('#rate').value;
        u.onend = () => { if (playing) { k += 1; step(); } };
        speechSynthesis.speak(u);
      };
      step();
    };
    playBtn.addEventListener('click', () => {
      playing = !playing; playBtn.innerHTML = icon(playing);
      if (playing) speakFrom(playIdx); else speechSynthesis.cancel();
    });
    seek.addEventListener('input', () => { playIdx = +seek.value; paint(); if (playing) speakFrom(playIdx); });
    $('#rate').addEventListener('change', () => { if (playing) speakFrom(playIdx); });
    $$('.line').forEach(l => l.addEventListener('click', () => { playIdx = +l.dataset.i; paint(); if (playing) speakFrom(playIdx); }));
  }

  /* ---- 导入 MP3 ---- */
  $('#pick').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f);
    toast('上传中…');
    try {
      await api.post(`/api/listening/${x.id}/audio`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast('已导入');
      openListening(x.id);
    } catch (err) {
      toast('导入失败：' + (err.response?.data?.error || err.message));
    }
  });

  /* ---- 选词填空 ---- */
  $$('#blanks .blank-item').forEach(item => {
    item.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      $$('.chip', item).forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      picks[+item.dataset.i] = chip.dataset.w;
    });
  });
  $('#checkBlank').addEventListener('click', () => {
    let ok = 0;
    $$('#blanks .blank-item').forEach(item => {
      const i = +item.dataset.i;
      const right = (picks[i] || '').toLowerCase() === x.blanks[i].toLowerCase();
      item.classList.toggle('good', right);
      item.classList.toggle('bad', !right && !!picks[i]);
      if (right) ok++;
      $$('.chip', item).forEach(c => {
        if (c.dataset.w.toLowerCase() === x.blanks[i].toLowerCase()) c.classList.add('ok');
      });
    });
    $('#blankRes').textContent = `  填空 ${ok} / ${x.blanks.length}`;
  });
  $('#showScript').addEventListener('click', () => {
    const s = $('#script'); s.style.display = s.style.display === 'none' ? 'block' : 'none';
  });

  /* ---- 题目 ---- */
  const answers = [];
  $$('#lqs .q').forEach(qEl => {
    qEl.addEventListener('click', e => {
      const opt = e.target.closest('.opt'); if (!opt || qEl.dataset.done) return;
      $$('.opt', qEl).forEach(o => o.classList.remove('on'));
      opt.classList.add('on');
      answers[+qEl.dataset.q] = +opt.dataset.i;
    });
  });
  $('#lsubmit').addEventListener('click', async () => {
    speechSynthesis.cancel();
    const aud = $('#aud'); if (aud) aud.pause();
    const { data: r } = await api.post('/api/listening/submit', { id: x.id, answers });
    r.detail.forEach((d, i) => {
      const qEl = $(`.q[data-q="${i}"]`); if (!qEl) return;
      qEl.dataset.done = '1';
      $$('.opt', qEl).forEach((o, oi) => {
        if (oi === d.ans) o.classList.add('ok');
        else if (oi === d.pick) o.classList.add('no');
      });
      qEl.insertAdjacentHTML('beforeend', `<div class="explain">正确答案 ${'ABCD'[d.ans]} · ${esc(d.why)}</div>`);
    });
    state.boot.stats.today.listening = 1;
    toast(`听力：${r.score} / ${r.total}`);
    $('#lsubmit').disabled = true;
    $('#lsubmit').textContent = '已提交';
  });
};

/* ---------------- 阅读 ---------------- */

render.reading = async () => {
  const { data: list } = await api.get('/api/reading');
  $('#app').innerHTML = `
    <div class="section-head"><div><b>阅读</b> <span class="mini-note">四篇四种题材，仔细阅读型</span></div></div>
    <div class="modules">${list.map(x => `
      <div class="card module" onclick="openReading(${x.id})">
        <div class="ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M8 7h8M8 11h6"/></svg></div>
        <h3 style="font-family:var(--serif);font-size:15.5px">${esc(x.title_en)}</h3>
        <p>${esc(x.title_zh)}</p><p class="mini-note" style="margin-top:6px">${esc(x.topic)} · ${x.vocab.length} 个词</p></div>`).join('')}
    </div>`;
};

window.openReading = async id => {
  const { data: x } = await api.get(`/api/reading/${id}`);
  let sec = 0;
  const answers = [];
  $('#page-sub').textContent = x.title_zh;
  $('#app').innerHTML = `
  <div class="section-head">
    <div><b style="font-family:var(--serif);font-size:17px">${esc(x.title_en)}</b>
      <div class="mini-note">${esc(x.title_zh)} · ${esc(x.topic)}</div></div>
    <div style="display:flex;gap:10px;align-items:center">
      <span class="pill" id="rtime">00:00</span>
      <button class="btn ghost small" id="rread">朗读全文</button>
      <button class="btn ghost small" onclick="render.reading()">返回列表</button>
    </div>
  </div>
  <div class="reader">
    <div class="card card-pad passage">
      ${x.paras.map(p => `<p>${esc(p).replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>')}</p>`).join('')}
      <div class="mini-note" style="margin-top:10px">重点词</div>
      <div class="vocab">${x.vocab.map(v => `<span><b>${esc(v[0])}</b> ${esc(v[1])}</span>`).join('')}</div>
    </div>
    <div>
      <div class="qs" id="rqs">
        ${x.questions.map((q, qi) => `<div class="q" data-q="${qi}">
          <div class="stem">${qi + 1}. ${esc(q.q)}</div>
          <div class="opts">${q.opts.map((o, oi) => `<div class="opt" data-i="${oi}"><span class="k">${'ABCD'[oi]}</span><span>${esc(o)}</span></div>`).join('')}</div>
        </div>`).join('')}
      </div>
      <button class="btn primary" id="rsubmit" style="width:100%">提交</button>
    </div>
  </div>`;
  clearInterval(state.timer);
  state.timer = setInterval(() => { sec += 1; $('#rtime').textContent = fmt(sec); }, 1000);
  $$('#rqs .q').forEach(qEl => qEl.addEventListener('click', e => {
    const opt = e.target.closest('.opt'); if (!opt || qEl.dataset.done) return;
    $$('.opt', qEl).forEach(o => o.classList.remove('on'));
    opt.classList.add('on');
    answers[+qEl.dataset.q] = +opt.dataset.i;
  }));
  $('#rread').addEventListener('click', () => readAloud(x.paras));
  $('#rsubmit').addEventListener('click', async () => {
    clearInterval(state.timer);
    const { data: r } = await api.post('/api/reading/submit', { id: x.id, answers, seconds: sec });
    r.detail.forEach((d, i) => {
      const qEl = $(`.q[data-q="${i}"]`);
      qEl.dataset.done = '1';
      $$('.opt', qEl).forEach((o, oi) => {
        if (oi === d.ans) o.classList.add('ok');
        else if (oi === d.pick) o.classList.add('no');
      });
      qEl.insertAdjacentHTML('beforeend', `<div class="explain">正确答案 ${'ABCD'[d.ans]} · ${esc(d.why)}</div>`);
    });
    state.boot.stats.today.reading = 1;
    toast(`阅读：${r.score} / ${r.total}`);
    $('#rsubmit').disabled = true;
    $('#rsubmit').textContent = '已提交';
  });
};

/* ---------------- 翻译 ---------------- */

render.translation = async () => {
  const { data: list } = await api.get('/api/translation');
  $('#app').innerHTML = `
  <div class="editor">
    <div class="list" id="tlist">
      ${list.map((x, i) => `<button data-id="${x.id}" class="${i === 0 ? 'on' : ''}">第 ${x.id} 题<small>${esc(x.zh.slice(0, 22))}…</small></button>`).join('')}
    </div>
    <div id="teditor"></div>
  </div>`;
  $$('#tlist button').forEach(b => b.addEventListener('click', () => {
    $$('#tlist button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    openTranslation(+b.dataset.id);
  }));
  openTranslation(list[0].id);
};

window.openTranslation = async id => {
  const { data: x } = await api.get(`/api/translation/${id}`);
  const draft = localStorage.getItem('tr-' + id) || '';
  $('#teditor').innerHTML = `
  <div class="card card-pad">
    <div class="mini-note">汉译英 · 第 ${id} 题</div>
    <div style="font-size:16px;line-height:1.8;margin:8px 0 14px">${esc(x.zh)}</div>
    <textarea id="tin" placeholder="在这里写你的译文…">${esc(draft)}</textarea>
    <div class="meta-row">
      <span class="mini-note" id="tcount">0 词</span>
      <button class="btn primary" id="tsubmit">提交对照</button>
      <button class="btn ghost small" id="tclear">清空</button>
    </div>
    <div id="tresult"></div>
  </div>`;
  const ta = $('#tin');
  const count = () => { $('#tcount').textContent = `${(ta.value.match(/[A-Za-z']+/g) || []).length} 词`; };
  count();
  ta.addEventListener('input', () => { count(); localStorage.setItem('tr-' + id, ta.value); });
  $('#tclear').addEventListener('click', () => { ta.value = ''; count(); localStorage.removeItem('tr-' + id); });
  $('#tsubmit').addEventListener('click', async () => {
    if (!ta.value.trim()) return toast('先写点东西');
    const { data: r } = await api.post('/api/translation/submit', { id, text: ta.value });
    $('#tresult').innerHTML = `
      <div class="ref">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h4>参考译文</h4><div class="score-ring">${r.score}<span style="font-size:13px;color:var(--muted)">分</span></div>
        </div>
        <div>${esc(r.ref)}</div>
        <div class="keys">${r.keys.map(k => `<span class="${r.hit.includes(k) ? '' : 'miss'}">${esc(k)}</span>`).join('')}</div>
        <div class="mini-note" style="margin-top:10px">${esc(r.tip)}</div>
      </div>`;
    state.boot.stats.today.translation = 1;
    toast('已保存');
  });
};

/* ---------------- 写作 ---------------- */

render.writing = async () => {
  const { data: list } = await api.get('/api/writing');
  $('#app').innerHTML = `
  <div class="editor">
    <div class="list" id="wlist">
      ${list.map((x, i) => `<button data-id="${x.id}" class="${i === 0 ? 'on' : ''}">${esc(x.title)}<small>${esc(x.type)} · ${x.words} 词 · ${x.minutes} 分钟</small></button>`).join('')}
    </div>
    <div id="weditor"></div>
  </div>`;
  $$('#wlist button').forEach(b => b.addEventListener('click', () => {
    $$('#wlist button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    openWriting(+b.dataset.id);
  }));
  openWriting(list[0].id);
};

window.openWriting = async id => {
  const { data: x } = await api.get(`/api/writing/${id}`);
  const draft = localStorage.getItem('wr-' + id) || '';
  let left = x.minutes * 60;
  $('#weditor').innerHTML = `
  <div class="card card-pad">
    <div class="mini-note">${esc(x.type)} · 建议 ${x.words} 词 · ${x.minutes} 分钟</div>
    <div style="font-family:var(--serif);font-size:21px;margin:6px 0 8px">${esc(x.title)}</div>
    <div style="font-size:13.5px;color:#45535c;line-height:1.75">${esc(x.prompt)}</div>
    <div class="mini-note" style="margin-top:12px">提纲</div>
    <ol style="margin:6px 0 0 18px;font-size:13px;color:#45535c;line-height:1.8">${x.outline.map(o => `<li>${esc(o)}</li>`).join('')}</ol>
    <div class="keys" style="margin-top:10px">${x.useful.map(u => `<span>${esc(u)}</span>`).join('')}</div>
    <textarea id="win" style="margin-top:14px" placeholder="Write here…">${esc(draft)}</textarea>
    <div class="meta-row">
      <span class="timer" id="wtimer">${fmt(left)}</span>
      <span class="mini-note" id="wcount">0 词</span>
      <button class="btn primary" id="wsubmit">提交看范文</button>
      <button class="btn ghost small" id="wclear">清空</button>
    </div>
    <div id="wresult"></div>
  </div>`;
  const ta = $('#win');
  const count = () => { $('#wcount').textContent = `${(ta.value.match(/[A-Za-z']+/g) || []).length} 词`; };
  count();
  ta.addEventListener('input', () => { count(); localStorage.setItem('wr-' + id, ta.value); });
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    left = Math.max(0, left - 1);
    $('#wtimer').textContent = fmt(left);
    if (left === 0) { clearInterval(state.timer); toast('时间到，停笔'); }
  }, 1000);
  $('#wclear').addEventListener('click', () => { ta.value = ''; count(); localStorage.removeItem('wr-' + id); });
  $('#wsubmit').addEventListener('click', async () => {
    if (!ta.value.trim()) return toast('先写点东西');
    const { data: r } = await api.post('/api/writing/submit', { id, text: ta.value });
    $('#wresult').innerHTML = `<div class="ref"><h4>范文（${r.words} 词你的 / 参考）</h4>
      ${r.sample.split('\n\n').map(p => `<p style="margin-bottom:10px">${esc(p)}</p>`).join('')}</div>`;
    state.boot.stats.today.writing = 1;
    toast('已保存');
  });
};

/* ---------------- 数据 ---------------- */

render.stats = async () => {
  const { data: boot } = await api.get('/api/bootstrap');
  state.boot = boot; paintChrome();
  const { data: s } = await api.get('/api/stats');
  const max = Math.max(1, ...s.days.map(d => d.count));
  const mods = Object.entries(s.by_module);
  const totalAttempts = mods.reduce((a, [, v]) => a + v.n, 0);
  $('#app').innerHTML = `
  <div class="kpi">
    <div class="card"><div class="label">累计练习</div><div class="value">${totalAttempts}<small>次</small></div></div>
    <div class="card"><div class="label">连续天数</div><div class="value">${state.boot.stats.streak}<small>天</small></div></div>
    <div class="card"><div class="label">已学词</div><div class="value">${state.boot.stats.learned}<small>词</small></div></div>
    <div class="card"><div class="label">错词</div><div class="value">${state.boot.stats.wrong}<small>词</small></div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
    <div class="card card-pad">
      <div class="section-head"><b>7 日活跃</b></div>
      <div class="chart">${s.days.map((d, i) => `<div class="bar ${i === 6 ? 'today' : ''}"><i style="height:${Math.max(4, d.count / max * 90)}px"></i><span>${d.date}</span></div>`).join('')}</div>
    </div>
    <div class="card card-pad">
      <div class="section-head"><b>各模块正确率</b></div>
      <div class="bars">
        ${mods.length ? mods.map(([k, v]) => {
          const pct = Math.round((v.avg || 0) * 100);
          return `<div class="bar-row"><span>${k}</span><div class="track"><i style="width:${pct}%"></i></div><span>${pct}%</span></div>`;
        }).join('') : '<div class="mini-note">还没有记录，先做一次练习。</div>'}
      </div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div class="card card-pad">
      <div class="section-head"><b>薄弱词</b> <span class="mini-note">错得越多越靠前</span></div>
      ${s.weak.length ? `<table><thead><tr><th>单词</th><th>释义</th><th>错</th><th>对</th></tr></thead><tbody>
        ${s.weak.map(w => `<tr><td><b>${esc(w.word)}</b></td><td>${esc(w.cn)}</td><td>${w.wrong}</td><td>${w.correct}</td></tr>`).join('')}
      </tbody></table>` : '<div class="mini-note">还没有错词记录。</div>'}
    </div>
    <div class="card card-pad">
      <div class="section-head"><b>最近练习</b></div>
      ${s.recent.length ? `<table><thead><tr><th>模块</th><th>对象</th><th>成绩</th><th>时间</th></tr></thead><tbody>
        ${s.recent.map(r => `<tr><td>${esc(r.module)}</td><td>${esc(r.ref)}</td><td>${r.total ? r.score + '/' + r.total : r.score}</td><td>${esc((r.ts || '').slice(5, 16).replace('T', ' '))}</td></tr>`).join('')}
      </tbody></table>` : '<div class="mini-note">还没有练习记录。</div>'}
    </div>
  </div>`;
};

/* 启动 */
window.go = go;
window.render = render;
boot().catch(e => {
  console.error(e);
  $('#app').innerHTML = `<div class="empty">后端没有启动，或接口出错：${esc(e.message)}</div>`;
});
