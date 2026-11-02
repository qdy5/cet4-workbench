/* CET4 学习工作台 · 静态离线版（GitHub Pages / 手机）
   数据来自 data/*.json，进度存在 localStorage。 */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TODAY = () => new Date().toISOString().slice(0, 10);
const EXAM = { date: '2026-12-01', target: 450 };
const BOX = [0, 1, 2, 4, 7, 15, 30];

const TITLES = {
  home: ['总览', '今天先把该复习的复习掉'],
  words: ['单词', '看单词，选意思'],
  listening: ['听力', '先盲听一遍，再对原文'],
  reading: ['阅读', '先看题再读文，控制时间'],
  translation: ['翻译', '先自己写，再看参考译文'],
  writing: ['写作', '计时写，写完再看范文'],
  stats: ['数据', '看得见的进步才算进步'],
};

const S = { words: [], reading: [], listening: [], translation: [], writing: [], view: 'home', card: null, answered: false, session: { right: 0, total: 0 } };

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1700); }
function fmt(sec) { return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); }
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

/* ---------- 本地进度 ---------- */
const PKEY = 'cet4.progress.v1';
let P = JSON.parse(localStorage.getItem(PKEY) || '{"w":{},"days":{}}');
function saveP() { localStorage.setItem(PKEY, JSON.stringify(P)); }
function st(w) { return P.w[w] || (P.w[w] = { b: 0, due: TODAY(), ok: 0, wrong: 0, seen: 0 }); }
function dueList() { return S.words.filter(x => { const s = P.w[x.w]; return !s || s.due <= TODAY(); }); }
function learnedCount() { return Object.values(P.w).filter(s => s.seen > 0).length; }
function streak() {
  let n = 0, d = new Date();
  for (;;) {
    const k = d.toISOString().slice(0, 10);
    if (P.days[k]) { n++; d.setDate(d.getDate() - 1); } else break;
  }
  return n;
}
function touchDay() { P.days[TODAY()] = (P.days[TODAY()] || 0) + 1; saveP(); }

function paintChrome() {
  const due = dueList().length;
  $('#sf-due').textContent = due; $('#sf-streak').textContent = streak();
  $('#pill-date').textContent = TODAY();
  $('#pill-due').textContent = '待复习 ' + due;
  $('#pill-streak').textContent = '连续 ' + streak() + ' 天';
}

/* ---------- 路由 ---------- */
function go(v) {
  S.view = v;
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $('#page-title').textContent = TITLES[v][0];
  $('#page-sub').textContent = TITLES[v][1];
  speechSynthesis && speechSynthesis.cancel();
  paintChrome();
  R[v]();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- 总览 ---------- */
const R = {};
R.home = () => {
  const days = Math.max(0, Math.ceil((new Date(EXAM.date) - new Date()) / 86400000));
  const due = dueList().length, learned = learnedCount();
  const todayN = P.days[TODAY()] || 0;
  $('#app').innerHTML = `
  <div class="hero">
    <div class="hero-main">
      <div class="eyebrow">Today's focus</div>
      <div class="hero-stats">
        <div><b>${days}</b><span>天后考试 · ${EXAM.date}</span></div>
        <div><b>${EXAM.target}</b><span>目标分（425 过线）</span></div>
      </div>
      <h2>${due ? `先把 ${due} 个词清掉，<br>再谈别的。` : '今天没有到期词，<br>去拿一篇阅读。'}</h2>
      <p>四级 710 分：写作 15%、听力 35%、阅读 35%、翻译 15%，总时长 125 分钟。</p>
      <div class="hero-actions">
        <button class="btn light" onclick="go('${due ? 'words' : 'reading'}')">${due ? '开始复习' : '开始阅读'}</button>
        <button class="btn light" onclick="go('stats')">看数据</button>
      </div>
    </div>
    <div class="card card-pad today">
      <div style="font-size:12px;letter-spacing:1px;color:var(--muted)">今日</div>
      <div class="task"><span class="dot" style="background:${todayN ? 'var(--accent)' : '#d9d3c6'}"></span><span>今日练习</span><span class="meta">${todayN} 次</span></div>
      <div class="task"><span class="dot"></span><span>已学单词</span><span class="meta">${learned} / ${S.words.length}</span></div>
      <div class="task"><span class="dot"></span><span>连续学习</span><span class="meta">${streak()} 天</span></div>
      <div class="progress" style="margin-top:8px"><i style="width:${Math.round(learned / S.words.length * 100)}%"></i></div>
    </div>
  </div>
  <div class="modules">
    ${[['words', '单词', '4,559 词 · 选择题复习'], ['listening', '听力', '5 组对话 · 可朗读'], ['reading', '阅读', '4 篇 · 20 题'], ['translation', '翻译', '10 句汉译英'], ['writing', '写作', '6 篇 + 范文'], ['stats', '数据', '进度都在本机']]
      .map(([v, t, d]) => `<div class="card module" onclick="go('${v}')"><h3>${t}</h3><p>${d}</p></div>`).join('')}
  </div>`;
};

/* ---------- 单词（选择题） ---------- */
R.words = () => {
  const due = dueList();
  $('#app').innerHTML = `
  <div class="section-head">
    <div class="tabs" id="wmodes">
      <button data-m="due" class="on">待复习</button>
      <button data-m="all">随机</button>
      <button data-m="wrong">错词</button>
    </div>
  </div>
  <div class="quiz-wrap">
    <div id="wcard"></div>
    <div class="card card-pad side-list" style="align-self:start">
      <div class="stat-row"><span>本轮答对</span><b id="w-right">0</b></div>
      <div class="stat-row"><span>本轮答题</span><b id="w-total">0</b></div>
      <div class="stat-row"><span>剩余待复习</span><b id="w-left">${due.length}</b></div>
      <div class="mini-note" style="margin-top:6px">答对推后 1/2/4/7/15/30 天，答错明天重来。键盘 1-4 选。</div>
    </div>
  </div>`;
  S.session = { right: 0, total: 0 };
  $$('#wmodes button').forEach(b => b.addEventListener('click', () => {
    $$('#wmodes button').forEach(x => x.classList.remove('on')); b.classList.add('on');
    S.mode = b.dataset.m; loadCard();
  }));
  S.mode = 'due';
  loadCard();
};

function loadCard() {
  let pool = S.words;
  if (S.mode === 'due') pool = dueList();
  else if (S.mode === 'wrong') pool = S.words.filter(x => P.w[x.w] && P.w[x.w].wrong > 0);
  if (!pool.length) { $('#wcard').innerHTML = '<div class="card card-pad"><div class="empty">这个范围没有词了。</div></div>'; return; }
  const it = pool[Math.floor(Math.random() * pool.length)];
  const opts = [it.c];
  let guard = 0;
  while (opts.length < 4 && guard++ < 200) {
    const o = S.words[Math.floor(Math.random() * S.words.length)].c;
    if (o && !opts.includes(o)) opts.push(o);
  }
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  S.card = { it, opts, ans: opts.indexOf(it.c) };
  S.answered = false;
  $('#w-left').textContent = S.mode === 'due' ? dueList().length : '-';
  $('#w-total').textContent = S.session.total;
  $('#w-right').textContent = S.session.right;
  $('#wcard').innerHTML = `
  <div class="card card-pad quiz-card">
    <div class="quiz-top">
      <div>
        <div class="word-en2">${esc(it.w)}</div>
        <div class="word-ph2">${esc(it.ph || '')}</div>
        <div class="mini-note" style="margin-top:4px">${esc(it.p || '')} · 选出正确的中文意思</div>
      </div>
      <button class="speak" id="w-speak" style="position:static"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg></button>
    </div>
    <div class="opts" id="wopts" style="margin-top:18px">
      ${opts.map((o, i) => `<div class="opt" data-i="${i}"><span class="k">${'ABCD'[i]}</span><span>${esc(o)}</span></div>`).join('')}
    </div>
    <div id="wans"></div>
  </div>`;
  $('#w-speak').addEventListener('click', () => speak(it.a, it.w));
  $$('#wopts .opt').forEach(e => e.addEventListener('click', () => answer(+e.dataset.i)));
}

function answer(i) {
  if (S.answered) return;
  S.answered = true;
  const c = S.card, ok = i === c.ans;
  $$('#wopts .opt').forEach((e, k) => { if (k === c.ans) e.classList.add('ok'); else if (k === i) e.classList.add('no'); });
  const s = st(c.it.w);
  s.seen++; if (ok) { s.ok++; s.b = Math.min(6, s.b + 1); } else { s.wrong++; s.b = 0; }
  s.due = addDays(TODAY(), ok ? BOX[s.b] : 1);
  S.session.total++; if (ok) S.session.right++;
  touchDay(); paintChrome();
  $('#w-total').textContent = S.session.total;
  $('#w-right').textContent = S.session.right;
  $('#w-left').textContent = dueList().length;
  $('#wans').innerHTML = `
    <div class="answer ${ok ? 'good' : 'bad'}">
      <div class="ans-head">${ok ? '答对' : '答错'} · ${esc(c.it.w)} ${esc(c.it.ph || '')} <b>${esc(c.it.c)}</b></div>
      ${c.it.k ? `<div class="mini-note">搭配：${esc(c.it.k)}</div>` : ''}
      ${c.it.e ? `<div class="ans-ex">${esc(c.it.e)}${c.it.ec ? `<span>${esc(c.it.ec)}</span>` : ''}</div>` : ''}
      <button class="btn primary small" id="wnext" style="margin-top:12px">下一题</button>
    </div>`;
  $('#wnext').addEventListener('click', loadCard);
}

function speak(audio, text) {
  if (audio) { new Audio(audio).play().catch(() => tts(text)); return; }
  tts(text);
}
function tts(text, rate = 0.9) {
  if (!speechSynthesis) return toast('这台设备不支持朗读');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; u.rate = rate;
  speechSynthesis.speak(u);
}
document.addEventListener('keydown', e => {
  if (S.view !== 'words' || !S.card) return;
  if (['1', '2', '3', '4'].includes(e.key)) answer(+e.key - 1);
  if (e.key === 'Enter' && S.answered) loadCard();
});

/* ---------- 听力 ---------- */
R.listening = () => {
  $('#app').innerHTML = `<div class="modules">${S.listening.map(x => `
    <div class="card module" onclick="openListen(${x.id})">
      <h3>${esc(x.title)}</h3><p>${esc(x.scene)} · ${x.lines.length} 句 · ${x.qs.length} 题</p></div>`).join('')}</div>`;
};
function openListen(id) {
  const x = S.listening.find(v => v.id === id);
  if (!x) return;
  $('#page-sub').textContent = x.scene;
  $('#app').innerHTML = `
  <div style="display:grid;grid-template-columns:1.05fr .95fr;gap:16px;align-items:start">
    <div>
      <div class="audio-card">
        <div class="t">${esc(x.title)}</div><div class="s">${esc(x.scene)}</div>
        <div class="player">
          <button class="play" id="play"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
          <select id="rate" style="background:transparent;border:1px solid rgba(255,255,255,.25);color:#dfeae5;padding:3px 6px;border-radius:6px">
            <option value="0.75">0.75×</option><option value="1" selected>1.0×</option><option value="1.25">1.25×</option>
          </select>
        </div>
      </div>
      <div class="card card-pad" style="margin-top:14px">
        <div class="section-head"><b>原文</b><button class="btn ghost small" id="showScript">显示 / 隐藏</button></div>
        <div class="script" id="script" style="display:none">
          ${x.lines.map((l, i) => `<div class="line" data-i="${i}"><span class="sp">${esc(l.sp)}</span>${esc(l.en)}</div>`).join('')}
        </div>
      </div>
    </div>
    <div>
      <div class="qs" id="lqs">${x.qs.map((q, qi) => `<div class="q" data-q="${qi}">
        <div class="stem">${qi + 1}. ${esc(q.q)}</div>
        <div class="opts">${q.opts.map((o, oi) => `<div class="opt" data-i="${oi}"><span class="k">${'ABCD'[oi]}</span><span>${esc(o)}</span></div>`).join('')}</div>
      </div>`).join('')}</div>
      <button class="btn primary" id="lsubmit" style="width:100%">提交并看解析</button>
    </div>
  </div>`;
  const answers = [];
  $$('#lqs .q').forEach(qe => qe.addEventListener('click', e => {
    const o = e.target.closest('.opt'); if (!o || qe.dataset.done) return;
    $$('.opt', qe).forEach(x => x.classList.remove('on')); o.classList.add('on');
    answers[+qe.dataset.q] = +o.dataset.i;
  }));
  $('#showScript').addEventListener('click', () => { const s = $('#script'); s.style.display = s.style.display === 'none' ? 'block' : 'none'; });
  $('#play').addEventListener('click', () => {
    speechSynthesis.cancel();
    let i = 0; const rate = +$('#rate').value;
    const next = () => {
      if (i >= x.lines.length) return;
      $$('.line').forEach(l => l.classList.toggle('on', +l.dataset.i === i));
      const u = new SpeechSynthesisUtterance(x.lines[i].en);
      u.lang = 'en-US'; u.rate = rate; u.onend = () => { i++; next(); };
      speechSynthesis.speak(u);
    };
    next();
  });
  $('#lsubmit').addEventListener('click', () => {
    let score = 0;
    x.qs.forEach((q, i) => {
      const qe = $(`.q[data-q="${i}"]`); qe.dataset.done = '1';
      $$('.opt', qe).forEach((o, k) => { if (k === q.ans) o.classList.add('ok'); else if (k === answers[i]) o.classList.add('no'); });
      if (answers[i] === q.ans) score++;
      qe.insertAdjacentHTML('beforeend', `<div class="explain">正确答案 ${'ABCD'[q.ans]} · ${esc(q.why)}</div>`);
    });
    touchDay(); paintChrome();
    toast(`听力：${score} / ${x.qs.length}`);
    $('#lsubmit').disabled = true; $('#lsubmit').textContent = '已提交';
  });
}

/* ---------- 阅读 ---------- */
R.reading = () => {
  $('#app').innerHTML = `<div class="modules">${S.reading.map(x => `
    <div class="card module" onclick="openRead(${x.id})">
      <h3 style="font-family:var(--serif);font-size:15.5px">${esc(x.title_en)}</h3>
      <p>${esc(x.title_zh)}</p><p class="mini-note" style="margin-top:6px">${x.vocab.length} 个词</p></div>`).join('')}</div>`;
};
function openRead(id) {
  const x = S.reading.find(v => v.id === id);
  if (!x) return;
  const answers = [];
  $('#page-sub').textContent = x.title_zh;
  $('#app').innerHTML = `
  <div class="section-head"><div><b style="font-family:var(--serif);font-size:17px">${esc(x.title_en)}</b>
    <div class="mini-note">${esc(x.title_zh)}</div></div>
    <div style="display:flex;gap:8px"><button class="btn ghost small" id="rread">朗读全文</button>
    <button class="btn ghost small" onclick="R.reading()">返回列表</button></div></div>
  <div class="reader">
    <div class="card card-pad passage">${x.paras.map(p => `<p>${esc(p)}</p>`).join('')}
      <div class="mini-note" style="margin-top:10px">重点词</div>
      <div class="vocab">${x.vocab.map(v => `<span><b>${esc(v[0])}</b> ${esc(v[1])}</span>`).join('')}</div>
    </div>
    <div><div class="qs" id="rqs">${x.questions.map((q, qi) => `<div class="q" data-q="${qi}">
      <div class="stem">${qi + 1}. ${esc(q.q)}</div>
      <div class="opts">${q.opts.map((o, oi) => `<div class="opt" data-i="${oi}"><span class="k">${'ABCD'[oi]}</span><span>${esc(o)}</span></div>`).join('')}</div>
    </div>`).join('')}</div>
    <button class="btn primary" id="rsubmit" style="width:100%">提交</button></div>
  </div>`;
  $$('#rqs .q').forEach(qe => qe.addEventListener('click', e => {
    const o = e.target.closest('.opt'); if (!o || qe.dataset.done) return;
    $$('.opt', qe).forEach(x => x.classList.remove('on')); o.classList.add('on');
    answers[+qe.dataset.q] = +o.dataset.i;
  }));
  $('#rread').addEventListener('click', () => { speechSynthesis.cancel(); let i = 0; const next = () => { if (i >= x.paras.length) return; const u = new SpeechSynthesisUtterance(x.paras[i]); u.lang = 'en-US'; u.rate = .95; u.onend = () => { i++; next(); }; speechSynthesis.speak(u); }; next(); });
  $('#rsubmit').addEventListener('click', () => {
    let score = 0;
    x.questions.forEach((q, i) => {
      const qe = $(`.q[data-q="${i}"]`); qe.dataset.done = '1';
      $$('.opt', qe).forEach((o, k) => { if (k === q.ans) o.classList.add('ok'); else if (k === answers[i]) o.classList.add('no'); });
      if (answers[i] === q.ans) score++;
      qe.insertAdjacentHTML('beforeend', `<div class="explain">正确答案 ${'ABCD'[q.ans]} · ${esc(q.why)}</div>`);
    });
    touchDay(); paintChrome();
    toast(`阅读：${score} / ${x.questions.length}`);
    $('#rsubmit').disabled = true; $('#rsubmit').textContent = '已提交';
  });
}

/* ---------- 翻译 ---------- */
R.translation = () => {
  $('#app').innerHTML = `<div class="editor"><div class="list" id="tlist">
    ${S.translation.map((x, i) => `<button data-id="${x.id}" class="${i === 0 ? 'on' : ''}">第 ${x.id} 题<small>${esc(x.zh.slice(0, 20))}…</small></button>`).join('')}
    </div><div id="teditor"></div></div>`;
  $$('#tlist button').forEach(b => b.addEventListener('click', () => {
    $$('#tlist button').forEach(x => x.classList.remove('on')); b.classList.add('on'); openTrans(+b.dataset.id);
  }));
  openTrans(S.translation[0].id);
};
function openTrans(id) {
  const x = S.translation.find(v => v.id === id);
  const draft = localStorage.getItem('cet4.tr.' + id) || '';
  $('#teditor').innerHTML = `
  <div class="card card-pad">
    <div class="mini-note">汉译英 · 第 ${id} 题</div>
    <div style="font-size:16px;line-height:1.8;margin:8px 0 14px">${esc(x.zh)}</div>
    <textarea id="tin" style="min-height:200px">${esc(draft)}</textarea>
    <div class="meta-row"><span class="mini-note" id="tcount">0 词</span>
      <button class="btn primary" id="tsubmit">对照参考译文</button></div>
    <div id="tresult"></div>
  </div>`;
  const ta = $('#tin');
  const cnt = () => { $('#tcount').textContent = `${(ta.value.match(/[A-Za-z']+/g) || []).length} 词`; };
  cnt(); ta.addEventListener('input', () => { cnt(); localStorage.setItem('cet4.tr.' + id, ta.value); });
  $('#tsubmit').addEventListener('click', () => {
    const low = ta.value.toLowerCase();
    const hit = x.keys.filter(k => low.includes(k.toLowerCase()));
    touchDay(); paintChrome();
    $('#tresult').innerHTML = `<div class="ref"><div style="display:flex;justify-content:space-between;align-items:center">
      <h4>参考译文</h4><div class="score-ring">${Math.round(hit.length / x.keys.length * 100)}<span style="font-size:13px;color:var(--muted)">分</span></div></div>
      <div>${esc(x.ref)}</div><div class="keys">${x.keys.map(k => `<span class="${hit.includes(k) ? '' : 'miss'}">${esc(k)}</span>`).join('')}</div>
      <div class="mini-note" style="margin-top:10px">${esc(x.tip)}</div></div>`;
  });
}

/* ---------- 写作 ---------- */
R.writing = () => {
  $('#app').innerHTML = `<div class="editor"><div class="list" id="wlist">
    ${S.writing.map((x, i) => `<button data-id="${x.id}" class="${i === 0 ? 'on' : ''}">${esc(x.title)}<small>${esc(x.type)} · ${x.words} 词</small></button>`).join('')}
    </div><div id="weditor"></div></div>`;
  $$('#wlist button').forEach(b => b.addEventListener('click', () => {
    $$('#wlist button').forEach(x => x.classList.remove('on')); b.classList.add('on'); openWrite(+b.dataset.id);
  }));
  openWrite(S.writing[0].id);
};
function openWrite(id) {
  const x = S.writing.find(v => v.id === id);
  const draft = localStorage.getItem('cet4.wr.' + id) || '';
  let left = x.minutes * 60;
  $('#weditor').innerHTML = `
  <div class="card card-pad">
    <div class="mini-note">${esc(x.type)} · ${x.words} 词 · ${x.minutes} 分钟</div>
    <div style="font-family:var(--serif);font-size:21px;margin:6px 0 8px">${esc(x.title)}</div>
    <div style="font-size:13.5px;color:#45535c;line-height:1.75">${esc(x.prompt)}</div>
    <div class="mini-note" style="margin-top:12px">提纲</div>
    <ol style="margin:6px 0 0 18px;font-size:13px;color:#45535c;line-height:1.8">${x.outline.map(o => `<li>${esc(o)}</li>`).join('')}</ol>
    <div class="keys" style="margin-top:10px">${x.useful.map(u => `<span>${esc(u)}</span>`).join('')}</div>
    <textarea id="win" style="margin-top:14px;min-height:220px">${esc(draft)}</textarea>
    <div class="meta-row"><span class="timer" id="wtimer">${fmt(left)}</span>
      <span class="mini-note" id="wcount">0 词</span>
      <button class="btn primary" id="wsubmit">看范文</button></div>
    <div id="wresult"></div>
  </div>`;
  const ta = $('#win');
  const cnt = () => { $('#wcount').textContent = `${(ta.value.match(/[A-Za-z']+/g) || []).length} 词`; };
  cnt(); ta.addEventListener('input', () => { cnt(); localStorage.setItem('cet4.wr.' + id, ta.value); });
  clearInterval(S.timer);
  S.timer = setInterval(() => { left = Math.max(0, left - 1); $('#wtimer').textContent = fmt(left); if (!left) { clearInterval(S.timer); toast('时间到'); } }, 1000);
  $('#wsubmit').addEventListener('click', () => {
    touchDay(); paintChrome();
    $('#wresult').innerHTML = `<div class="ref"><h4>范文</h4>${x.sample.split('\n\n').map(p => `<p style="margin-bottom:10px">${esc(p)}</p>`).join('')}</div>`;
  });
}

/* ---------- 数据 ---------- */
R.stats = () => {
  const learned = learnedCount(), wrong = Object.values(P.w).filter(s => s.wrong > 0).length;
  const totalSeen = Object.values(P.w).reduce((a, s) => a + s.seen, 0);
  const totalOk = Object.values(P.w).reduce((a, s) => a + s.ok, 0);
  const acc = totalSeen ? Math.round(totalOk / totalSeen * 100) : 0;
  const days = Object.keys(P.days).sort().slice(-7);
  const max = Math.max(1, ...days.map(d => P.days[d]));
  $('#app').innerHTML = `
  <div class="kpi">
    <div class="card"><div class="label">已学词</div><div class="value">${learned}<small>词</small></div></div>
    <div class="card"><div class="label">连续</div><div class="value">${streak()}<small>天</small></div></div>
    <div class="card"><div class="label">累计答题</div><div class="value">${totalSeen}<small>次</small></div></div>
    <div class="card"><div class="label">正确率</div><div class="value">${acc}<small>%</small></div></div>
  </div>
  <div class="card card-pad">
    <div class="section-head"><b>最近 7 天</b></div>
    <div class="chart">${days.length ? days.map((d, i) => `<div class="bar ${i === days.length - 1 ? 'today' : ''}"><i style="height:${Math.max(4, P.days[d] / max * 90)}px"></i><span>${d.slice(5)}</span></div>`).join('') : '<div class="mini-note">还没有记录。</div>'}</div>
  </div>
  <div class="card card-pad" style="margin-top:16px">
    <div class="section-head"><b>薄弱词</b> <span class="mini-note">错得越多越靠前</span></div>
    <table><thead><tr><th>单词</th><th>释义</th><th>错</th><th>对</th></tr></thead><tbody>
      ${Object.entries(P.w).filter(([, s]) => s.wrong > 0).sort((a, b) => b[1].wrong - a[1].wrong).slice(0, 12)
        .map(([w, s]) => { const it = S.words.find(x => x.w === w) || {}; return `<tr><td><b>${esc(w)}</b></td><td>${esc(it.c || '')}</td><td>${s.wrong}</td><td>${s.ok}</td></tr>`; }).join('') || '<tr><td colspan="4" class="mini-note">还没有错词</td></tr>'}
    </tbody></table>
  </div>`;
};

/* ---------- 启动 ---------- */
async function loadJSON(name) {
  const r = await fetch('data/' + name, { cache: 'no-cache' });
  if (!r.ok) throw new Error(name + ' ' + r.status);
  return r.json();
}

(async () => {
  try {
    const [w, r, l, t, wr] = await Promise.all([
      loadJSON('words.json'), loadJSON('reading.json'), loadJSON('listening.json'),
      loadJSON('translation.json'), loadJSON('writing.json'),
    ]);
    S.words = w; S.reading = r; S.listening = l; S.translation = t; S.writing = wr;
    if (!P.seeded) {
      w.forEach((x, i) => {
        if (!P.w[x.w]) P.w[x.w] = { b: 0, due: addDays(TODAY(), i % 30), ok: 0, wrong: 0, seen: 0 };
      });
      P.seeded = true;
      saveP();
    }
  } catch (e) {
    $('#app').innerHTML = `<div class="empty">数据没加载出来：${esc(e.message)}<br>首次打开需要联网下载一次。</div>`;
    return;
  }
  $$('#nav button').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
  window.go = go; window.R = R; window.openListen = openListen; window.openRead = openRead;
  paintChrome();
  go('home');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
