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

const pref = { rate: 1, loop: false, hideScript: false };
let active = null;

const fmt = s => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '--:--');

function audioURL(x) {
  if (!x.audio_url) return '';
  return new URL(x.audio_url, document.baseURI).href;
}

export default {
  render(ctx) {
    active = ctx;
    const list = ctx.content.listening;
    document.getElementById('app').innerHTML = `
      <div class="section-head"><div><b>听力训练</b>
        <span class="mini-note">${list.length} 组对话 · 先盲听一遍，再点原文逐句跟读</span></div></div>
      <div class="modules">
        ${list.map(x => `
          <div class="card module" data-listen="${x.id}">
            <h3>${esc(x.title)}</h3>
            <p>${esc(x.scene)} · ${x.lines.length} 句 · ${x.qs.length} 题${x.audio_url ? '' : ' · 无音频（可朗读）'}</p>
          </div>`).join('')}
      </div>`;
    $$('[data-listen]').forEach(el => el.addEventListener('click', () => open(ctx, Number(el.dataset.listen))));
  },
};

function open(ctx, id) {
  const x = ctx.content.listening.find(v => v.id === id);
  if (!x) return;
  const started = Date.now();
  const answers = new Array(x.qs.length).fill(-1);
  const url = audioURL(x);
  const times = x.times || [];

  document.getElementById('app').innerHTML = `
  <div class="section-head">
    <div><b class="serif">${esc(x.title)}</b><div class="mini-note">${esc(x.scene)}</div></div>
    <button class="btn ghost small" data-back="listening">返回列表</button>
  </div>
  <div class="listen-grid">
    <div>
      <div class="audio-card">
        <div class="t">${esc(x.title)}</div>
        <div class="s">${esc(x.scene)} · 共 ${x.lines.length} 句</div>
        <div class="player">
          <button class="play" id="play" aria-label="播放">▶</button>
          <div class="seek-wrap">
            <input type="range" id="seek" min="0" max="100" value="0" step="0.1" aria-label="进度">
            <div class="seek-meta"><span id="tcur">0:00</span><span id="tdur">--:--</span></div>
          </div>
        </div>
        <div class="player-foot">
          <span class="pbtn-label">语速</span>
          ${[0.75, 0.9, 1, 1.25].map(r => `<button class="rate ${r === pref.rate ? 'on' : ''}" data-rate="${r}">${r}×</button>`).join('')}
          <button class="rate ${pref.loop ? 'on' : ''}" id="loop">循环本句</button>
          <button class="rate ${pref.hideScript ? 'on' : ''}" id="toggle-script">遮挡原文</button>
        </div>
        ${url ? `<audio id="aud" src="${url}" preload="metadata"></audio>` : ''}
      </div>

      <div class="card card-pad" style="margin-top:14px">
        <div class="section-head"><b>原文</b><span class="mini-note">点句子跳到那句</span></div>
        <div class="script ${pref.hideScript ? 'blurred' : ''}" id="script">
          ${x.lines.map((l, i) => `<button class="line" data-i="${i}"><span class="sp">${esc(l.sp)}</span>${esc(l.en)}</button>`).join('')}
        </div>
      </div>
    </div>

    <div>
      <div class="qs" id="lqs">
        ${x.qs.map((q, qi) => `<div class="q" data-q="${qi}">
          <div class="stem">${qi + 1}. ${esc(q.q)}</div>
          <div class="opts">${q.opts.map((o, oi) => `<button class="opt" data-i="${oi}"><span class="k">${'ABCD'[oi]}</span><span>${esc(o)}</span></button>`).join('')}</div>
        </div>`).join('')}
      </div>
      <button class="btn primary" id="lsubmit" style="width:100%">提交并看解析</button>
    </div>
  </div>`;

  const aud = $('#aud');
  const playBtn = $('#play');
  const seek = $('#seek');
  let current = -1;

  const highlight = idx => {
    current = idx;
    $$('.line').forEach(l => l.classList.toggle('on', Number(l.dataset.i) === idx));
  };

  const sentenceRange = i => [times[i] || 0, times[i + 1] || (aud ? aud.duration : 0)];

  if (aud) {
    aud.playbackRate = pref.rate;
    aud.addEventListener('loadedmetadata', () => {
      seek.max = Math.max(1, aud.duration);
      $('#tdur').textContent = fmt(aud.duration);
    });
    aud.addEventListener('timeupdate', () => {
      if (document.activeElement !== seek) seek.value = aud.currentTime;
      $('#tcur').textContent = fmt(aud.currentTime);
      if (!times.length) return;
      let idx = 0;
      for (let i = 0; i < times.length; i += 1) if (aud.currentTime >= times[i]) idx = i;
      if (idx !== current) highlight(idx);
      if (pref.loop && current >= 0) {
        const [, end] = sentenceRange(current);
        if (end && aud.currentTime >= end - 0.05) {
          aud.currentTime = times[current];
          aud.play();
        }
      }
    });
    aud.addEventListener('ended', () => { playBtn.textContent = '▶'; });
    seek.addEventListener('input', () => { aud.currentTime = Number(seek.value); });
    playBtn.addEventListener('click', () => {
      if (aud.paused) { aud.play(); playBtn.textContent = '❚❚'; } else { aud.pause(); playBtn.textContent = '▶'; }
    });
  } else {
    // 没有 MP3 时用系统朗读逐句播，仍然可以点句子从某句开始
    let k = 0;
    let playing = false;
    const speakFrom = start => {
      window.speechSynthesis.cancel();
      k = start;
      const step = () => {
        if (!playing || k >= x.lines.length) { playing = false; playBtn.textContent = '▶'; return; }
        highlight(k);
        const u = new SpeechSynthesisUtterance(x.lines[k].en);
        u.lang = 'en-US';
        u.rate = pref.rate;
        u.onend = () => { if (playing) { k += 1; step(); } };
        window.speechSynthesis.speak(u);
      };
      step();
    };
    playBtn.addEventListener('click', () => {
      playing = !playing;
      playBtn.textContent = playing ? '❚❚' : '▶';
      if (playing) speakFrom(Math.max(0, current)); else window.speechSynthesis.cancel();
    });
    seek.addEventListener('input', () => {
      const idx = Math.min(x.lines.length - 1, Math.floor((Number(seek.value) / 100) * x.lines.length));
      highlight(idx);
      if (playing) speakFrom(idx);
    });
  }

  $$('[data-rate]').forEach(b => b.addEventListener('click', () => {
    pref.rate = Number(b.dataset.rate);
    $$('[data-rate]').forEach(x2 => x2.classList.toggle('on', x2 === b));
    if (aud) aud.playbackRate = pref.rate;
  }));
  $('#loop').addEventListener('click', e => {
    pref.loop = !pref.loop;
    e.currentTarget.classList.toggle('on', pref.loop);
  });
  $('#toggle-script').addEventListener('click', e => {
    pref.hideScript = !pref.hideScript;
    $('#script').classList.toggle('blurred', pref.hideScript);
    e.currentTarget.classList.toggle('on', pref.hideScript);
  });

  $$('#script .line').forEach(l => l.addEventListener('click', () => {
    const i = Number(l.dataset.i);
    highlight(i);
    if (aud) {
      aud.currentTime = times[i] ?? aud.currentTime;
      aud.play();
      playBtn.textContent = '❚❚';
    } else {
      speakOne(x.lines[i].en);
    }
  }));

  $$('#lqs .q').forEach(qEl => qEl.addEventListener('click', e => {
    const opt = e.target.closest('.opt');
    if (!opt || qEl.dataset.done) return;
    $$('.opt', qEl).forEach(o => o.classList.remove('on'));
    opt.classList.add('on');
    answers[Number(qEl.dataset.q)] = Number(opt.dataset.i);
    const done = answers.filter(a => a >= 0).length;
    const sb = $('#lsubmit');
    if (sb && !sb.disabled) sb.textContent = `提交（已答 ${done}/x.qs.length）`;
  }));

  $('#lsubmit').addEventListener('click', async () => {
    if (aud) aud.pause();
    window.speechSynthesis.cancel();
    let correct = 0;
    x.qs.forEach((q, i) => {
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
    $$('.ev-btn').forEach(b => b.addEventListener('click', () => locateSent(b.dataset.ev, '#script .line')));
    $('#lsubmit').disabled = true;
    $('#lsubmit').textContent = `已提交：${correct} / ${x.qs.length}`;
    await ctx.logAttempt({
      type: 'listening', ref: String(x.id), correct, total: x.qs.length,
      seconds: Math.round((Date.now() - started) / 1000),
    });
    ctx.toast(`听力：${correct} / ${x.qs.length}`);
  });
}

function speakOne(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = pref.rate;
  window.speechSynthesis.speak(u);
}

export { open as openListening };
