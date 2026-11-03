import { $, $$, esc } from '../core/dom.js';


const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

function locateSent(ev, scope = '.passage .sent') {
  const target = norm(ev).slice(0, 70);
  const nodes = [...document.querySelectorAll(scope)];
  let hit = nodes.find(n => norm(n.textContent).includes(target));
  if (!hit) {
    const words = new Set(target.split(' ').filter(w => w.length > 3));
    let best = null, bestScore = 0;
    for (const n of nodes) {
      const text = norm(n.textContent);
      let sc = 0;
      for (const w of words) if (text.includes(w)) sc += 1;
      if (sc > bestScore) { best = n; bestScore = sc; }
    }
    if (bestScore >= 2) hit = best;
  }
  document.querySelectorAll('.hl').forEach(n => n.classList.remove('hl'));
  if (!hit) return false;
  hit.classList.add('hl');
  hit.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return true;
}

const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default {
  render(ctx) {
    const list = ctx.content.reading;
    document.getElementById('app').innerHTML = `
      <div class="section-head"><div><b>阅读</b>
        <span class="mini-note">${list.length} 篇 · 仔细阅读型 · 计时不计分到总成绩</span></div></div>
      <div class="modules">
        ${list.map(x => `
          <div class="card module" data-read="${x.id}">
            <h3 class="serif">${esc(x.title_en)}</h3>
            <p>${esc(x.title_zh)}</p>
            <p class="mini-note">${esc(x.topic || '')} · ${x.vocab.length} 个重点词 · ${x.questions.length} 题</p>
          </div>`).join('')}
      </div>`;
    $$('[data-read]').forEach(el => el.addEventListener('click', () => open(ctx, Number(el.dataset.read))));
  },
};

function open(ctx, id) {
  const x = ctx.content.reading.find(v => v.id === id);
  if (!x) return;
  const answers = new Array(x.questions.length).fill(-1);
  let sec = 0;
  let timer = null;

  document.getElementById('app').innerHTML = `
  <div class="section-head">
    <div><b class="serif">${esc(x.title_en)}</b>
      <div class="mini-note">${esc(x.title_zh)} · ${esc(x.topic || '')}</div></div>
    <div class="head-actions">
      <span class="pill" id="rtime">00:00</span>
      <button class="btn ghost small" id="rread">朗读</button>
      <button class="btn ghost small" data-back="reading">返回列表</button>
    </div>
  </div>
  <div class="reader">
    <div class="card card-pad passage">
      ${x.paras.map(p => `<p>${p.split(/(?<=[.!?])\s+/).map(s => `<span class="sent">${esc(s)}</span>`).join(' ')}</p>`).join('')}
      <div class="mini-note" style="margin-top:12px">重点词</div>
      <div class="vocab">${x.vocab.map(v => `<span><b>${esc(v[0])}</b> ${esc(v[1])}</span>`).join('')}</div>
    </div>
    <div>
      <div class="qs" id="rqs">
        ${x.questions.map((q, qi) => `<div class="q" data-q="${qi}">
          <div class="stem">${qi + 1}. ${esc(q.q)}</div>
          <div class="opts">${q.opts.map((o, oi) => `<button class="opt" data-i="${oi}"><span class="k">${'ABCD'[oi]}</span><span>${esc(o)}</span></button>`).join('')}</div>
        </div>`).join('')}
      </div>
      <button class="btn primary" id="rsubmit" style="width:100%">提交</button>
    </div>
  </div>`;

  timer = setInterval(() => { sec += 1; const el = $('#rtime'); if (el) el.textContent = fmt(sec); }, 1000);

  $$('#rqs .q').forEach(qEl => qEl.addEventListener('click', e => {
    const opt = e.target.closest('.opt');
    if (!opt || qEl.dataset.done) return;
    $$('.opt', qEl).forEach(o => o.classList.remove('on'));
    opt.classList.add('on');
    answers[Number(qEl.dataset.q)] = Number(opt.dataset.i);
    const done = answers.filter(a => a >= 0).length;
    const sb = $('#rsubmit');
    if (sb && !sb.disabled) sb.textContent = `提交（已答 ${done}/x.questions.length）`;
  }));

  $('#rread').addEventListener('click', () => {
    if (!('speechSynthesis' in window)) return ctx.toast('这台设备不支持朗读');
    window.speechSynthesis.cancel();
    let i = 0;
    const nextLine = () => {
      if (i >= x.paras.length) return;
      const u = new SpeechSynthesisUtterance(x.paras[i]);
      u.lang = 'en-US';
      u.rate = 0.95;
      u.onend = () => { i += 1; nextLine(); };
      window.speechSynthesis.speak(u);
    };
    nextLine();
  });

  $('#rsubmit').addEventListener('click', async () => {
    clearInterval(timer);
    window.speechSynthesis.cancel();
    let correct = 0;
    x.questions.forEach((q, i) => {
      const qEl = $(`.q[data-q="${i}"]`);
      qEl.dataset.done = '1';
      $$('.opt', qEl).forEach((o, oi) => {
        if (oi === q.ans) o.classList.add('ok');
        else if (oi === answers[i]) o.classList.add('no');
      });
      if (answers[i] === q.ans) correct += 1;
      qEl.insertAdjacentHTML('beforeend', `
        <div class="explain ${answers[i] === q.ans ? 'okx' : 'nox'}">
          <div class="explain-head">正确答案 ${'ABCD'[q.ans]}${answers[i] === q.ans ? ' · 你答对了' : answers[i] >= 0 ? ` · 你选了 ${'ABCD'[answers[i]]}` : ' · 未作答'}</div>
          <div>${esc(q.why || '')}</div>
          ${q.ev ? `<button class="btn ghost small ev-btn" data-ev="${esc(q.ev)}">定位原文</button>` : ''}
        </div>`);
    });
    $$('.ev-btn').forEach(btn => btn.addEventListener('click', () => locateSent(btn.dataset.ev)));
    $('#rsubmit').disabled = true;
    $('#rsubmit').textContent = `已提交：${correct} / ${x.questions.length}`;
    await ctx.logAttempt({
      type: 'reading', ref: String(x.id), correct, total: x.questions.length, seconds: sec,
    });
    ctx.toast(`阅读：${correct} / ${x.questions.length}，用时 ${fmt(sec)}`);
  });
}
