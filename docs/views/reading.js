import { $, $$, esc } from '../core/dom.js';

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
      ${x.paras.map(p => `<p>${esc(p)}</p>`).join('')}
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
      qEl.insertAdjacentHTML('beforeend', `<div class="explain">正确答案 ${'ABCD'[q.ans]} · ${esc(q.why)}</div>`);
    });
    $('#rsubmit').disabled = true;
    $('#rsubmit').textContent = `已提交：${correct} / ${x.questions.length}`;
    await ctx.logAttempt({
      type: 'reading', ref: String(x.id), correct, total: x.questions.length, seconds: sec,
    });
    ctx.toast(`阅读：${correct} / ${x.questions.length}，用时 ${fmt(sec)}`);
  });
}
