import { $, $$, esc } from '../core/dom.js';
import { analyzeWriting } from '../core/scoring.js';

let cur = 0;
let timer = null;

const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default {
  render(ctx) {
    clearInterval(timer);
    const list = ctx.content.writing;
    if (!cur) cur = list[0].id;
    document.getElementById('app').innerHTML = `
    <div class="editor">
      <div class="list" id="wlist">
        ${list.map(x => `<button data-id="${x.id}" class="${x.id === cur ? 'on' : ''}">${esc(x.title)}
          <small>${esc(x.type)} · ${x.words} 词 · ${x.minutes} 分钟</small></button>`).join('')}
      </div>
      <div id="weditor"></div>
    </div>`;
    $$('#wlist button').forEach(b => b.addEventListener('click', () => {
      clearInterval(timer);
      $$('#wlist button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      cur = Number(b.dataset.id);
      open(ctx, cur);
    }));
    open(ctx, cur);
  },
};

async function open(ctx, id) {
  clearInterval(timer);
  const x = ctx.content.writing.find(v => v.id === id);
  if (!x) return;
  const draft = await ctx.store.draft(`wr-${id}`);
  const started = Date.now();
  let left = x.minutes * 60;

  $('#weditor').innerHTML = `
  <div class="card card-pad">
    <div class="mini-note">${esc(x.type)} · 建议 ${x.words} 词 · ${x.minutes} 分钟</div>
    <div class="serif" style="font-size:21px;margin:6px 0 8px">${esc(x.title)}</div>
    <div class="prompt-text">${esc(x.prompt)}</div>
    <div class="mini-note" style="margin-top:12px">提纲</div>
    <ol class="outline">${x.outline.map(o => `<li>${esc(o)}</li>`).join('')}</ol>
    <div class="keys" style="margin-top:10px">${x.useful.map(u => `<span>${esc(u)}</span>`).join('')}</div>
    <textarea id="win" placeholder="Write here…">${esc(draft)}</textarea>
    <div class="meta-row">
      <span class="timer" id="wtimer">${fmt(left)}</span>
      <span class="mini-note" id="wcount">0 词</span>
      <button class="btn primary" id="wsubmit">看范文</button>
      <button class="btn ghost small" id="wclear">清空</button>
    </div>
    <div id="wcheck" class="checklist"></div>
    <div id="wresult"></div>
  </div>`;

  const ta = $('#win');
  let saveTimer = null;

  const update = () => {
    const a = analyzeWriting(ta.value, x);
    $('#wcount').textContent = `${a.words} 词 · ${a.sentences} 句 · ${a.paragraphs} 段`;
    $('#wcheck').innerHTML = `
      <div class="checklist-head">自查清单 <b>${a.passed}/${a.total}</b>
        <span class="mini-note">平均 ${a.avgSentence} 词/句 · 连接词 ${a.connectives.length} 种</span></div>
      ${a.checks.map(c => `<div class="check ${c.ok ? 'ok' : 'bad'}"><i>${c.ok ? '✓' : '✕'}</i><span>${esc(c.name)}</span><em>${esc(c.hint || '')}</em></div>`).join('')}`;
    return a;
  };
  update();

  ta.addEventListener('input', () => {
    update();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => ctx.store.saveDraft(`wr-${id}`, ta.value), 400);
  });
  $('#wclear').addEventListener('click', () => { ta.value = ''; update(); ctx.store.saveDraft(`wr-${id}`, ''); });

  const tick = () => {
    left = Math.max(0, left - 1);
    const el = $('#wtimer');
    if (!el) return clearInterval(timer);
    el.textContent = fmt(left);
    el.classList.toggle('warn', left <= 300);
    if (left === 0) { clearInterval(timer); ctx.toast('时间到，停笔对照清单改一遍'); }
  };
  timer = setInterval(tick, 1000);

  $('#wsubmit').addEventListener('click', async () => {
    if (!ta.value.trim()) return ctx.toast('先写点东西');
    clearInterval(timer);
    await ctx.store.saveDraft(`wr-${id}`, ta.value);
    const a = update();
    $('#wresult').innerHTML = `
      <div class="ref">
        <div class="ref-head"><h4>范文</h4><div class="mini-note">自查清单过了 ${a.passed}/${a.total} 项</div></div>
        <div class="ref-text">${x.sample.split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join('')}</div>
        <div class="ai-review">
          <button class="btn ghost small" id="wai" ${ctx.store.canAsk ? '' : 'disabled title="离线版没有本地模型"'}>让 AI 按四级标准点评</button>
          <div id="waiout" class="ai-out"></div>
        </div>
      </div>`;
    const ai = $('#wai');
    if (ai && ctx.store.canAsk) {
      ai.addEventListener('click', async () => {
        ai.disabled = true;
        const out = $('#waiout');
        out.textContent = '正在生成…';
        const prompt = `你是四级写作阅卷老师。题目：${x.title}\n要求：${x.prompt}\n学生作文：\n${ta.value}\n`
          + '用 150 字以内中文点评：分数档（满分 106.5 折算 15%）、最该改的一处语法、一个可替换的高级表达。不要寒暄。';
        const text = await ctx.store.ask(prompt, (_d, all) => { out.textContent = all; });
        out.textContent = text || '本地模型没启动（ollama serve）。';
      });
    }
    await ctx.logAttempt({
      type: 'writing', ref: String(id), correct: a.passed, total: a.total,
      seconds: Math.round((Date.now() - started) / 1000),
      detail: { words: a.words, checkPassed: a.passed },
    });
    ctx.toast('已保存到练习记录');
  });
}

export { timer };
