import { $, $$, esc } from '../core/dom.js';
import { scoreTranslation, words } from '../core/scoring.js';
import { aiGrade, renderGrade } from './ai.js';

let cur = 0;

export default {
  render(ctx) {
    const list = ctx.content.translation;
    if (!cur) cur = list[0].id;
    document.getElementById('app').innerHTML = `
    <div class="editor">
      <div class="list" id="tlist">
        ${list.map(x => `<button data-id="${x.id}" class="${x.id === cur ? 'on' : ''}">第 ${x.id} 题<small>${esc(x.zh.slice(0, 22))}…</small></button>`).join('')}
      </div>
      <div id="teditor"></div>
    </div>`;
    $$('#tlist button').forEach(b => b.addEventListener('click', () => {
      $$('#tlist button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      cur = Number(b.dataset.id);
      open(ctx, cur);
    }));
    open(ctx, cur);
  },
};

async function open(ctx, id) {
  const x = ctx.content.translation.find(v => v.id === id);
  if (!x) return;
  const draft = await ctx.store.draft(`tr-${id}`);
  const started = Date.now();
  $('#teditor').innerHTML = `
  <div class="card card-pad">
    <div class="mini-note">汉译英 · 第 ${id} 题 · 采分点 ${x.points.length} 个</div>
    <div class="zh-src">${esc(x.zh)}</div>
    <textarea id="tin" placeholder="在这里写你的译文…">${esc(draft)}</textarea>
    <div class="meta-row">
      <span class="mini-note" id="tcount"></span>
      <button class="btn primary" id="tsubmit">提交自查</button>
      <button class="btn ghost small" id="tclear">清空</button>
    </div>
    <div id="tresult"></div>
  </div>`;

  const ta = $('#tin');
  const count = () => {
    const n = words(ta.value).length;
    const ref = words(x.ref).length;
    $('#tcount').textContent = `${n} 词${ref ? ` / 参考 ${ref} 词` : ''}`;
  };
  count();

  let saveTimer = null;
  ta.addEventListener('input', () => {
    count();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => ctx.store.saveDraft(`tr-${id}`, ta.value), 400);
  });
  $('#tclear').addEventListener('click', () => {
    ta.value = '';
    count();
    ctx.store.saveDraft(`tr-${id}`, '');
  });

  $('#tsubmit').addEventListener('click', async () => {
    if (!ta.value.trim()) return ctx.toast('先写点东西');
    await ctx.store.saveDraft(`tr-${id}`, ta.value);
    const r = scoreTranslation(ta.value, x);
    $('#tresult').innerHTML = `
      <div class="ref">
        <div class="ref-head">
          <h4>采分点覆盖</h4>
          <div class="score-ring">${Math.round(r.coverage * 100)}<span>%</span></div>
        </div>
        <div class="mini-note">命中 ${r.stats.covered} / ${r.stats.total} 个采分点 · 你 ${r.stats.words} 词 / 参考 ${r.stats.refWords} 词</div>
        <div class="keys">
          ${r.points.map(p => `<span class="${p.ok ? '' : 'miss'}">${esc(p.label || '')}</span>`).join('')}
        </div>
        <div class="checklist">
          ${r.checks.map(c => `<div class="check ${c.ok ? 'ok' : 'bad'}"><i>${c.ok ? '✓' : '✕'}</i><span>${esc(c.name)}</span><em>${esc(c.hint || '')}</em></div>`).join('')}
        </div>
        <h4 style="margin-top:14px">参考译文</h4>
        <div class="ref-text">${esc(x.ref)}</div>
        <div class="mini-note" style="margin-top:10px">${esc(x.tip || '')}</div>
        <div class="ai-review">
          <button class="btn primary small" id="tai">AI 批改（评分 + 逐条点评）</button>
          <div id="taiout" class="ai-out"></div>
        </div>
      </div>`;

    const ai = $('#tai');
    if (ai) {
      ai.addEventListener('click', async () => {
        ai.disabled = true;
        const out = $('#taiout');
        out.innerHTML = '<div class="mini-note">AI 正在批改…（约 5-15 秒）</div>';
        const g = await aiGrade('translation', { zh: x.zh, ref: x.ref, answer: ta.value });
        renderGrade(out, g, 15);
        ai.disabled = false;
      });
    }

    await ctx.logAttempt({
      type: 'translation', ref: String(id), correct: r.stats.covered, total: r.stats.total,
      seconds: Math.round((Date.now() - started) / 1000),
      detail: { coverage: r.stats.covered, passRate: r.stats.passRate, words: r.stats.words },
    });
  });
}
