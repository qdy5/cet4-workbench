import { $, $$, esc } from '../core/dom.js';
import { buildOptions } from '../core/quiz.js';
import { aiGrade } from './ai.js';
import { review, preview, RATING, describe } from '../core/fsrs.js';
import { fmtInterval } from '../core/date.js';

const session = { list: [], i: 0, mode: 'due', chapter: '', right: 0, total: 0, pending: null, answered: false };
let activeCtx = null;

function poolFor(ctx, mode) {
  const ch = session.chapter;
  const keep = w => !ch || w.ch === ch;
  if (mode === 'new') return ctx.newWords().filter(x => keep(x.word));
  if (mode === 'wrong') {
    return [...ctx.S.cards.values()]
      .filter(c => c.lapses > 0)
      .sort((a, b) => b.lapses - a.lapses)
      .map(c => ctx.word(c.wordId))
      .filter(w => w && keep(w))
      .map(word => ({ word, card: ctx.S.cards.get(word.id) }));
  }
  if (mode === 'all') {
    const arr = ctx.content.words.filter(keep).map(word => ({ word, card: ctx.S.cards.get(word.id) }));
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, 80);
  }
  // 待复习空了就自动接新词：新用户第一次打开不会看到一片空白
  const due = ctx.dueWords().filter(x => keep(x.word));
  if (due.length) return due;
  return ctx.newWords().filter(x => keep(x.word));
}

function rebuild(ctx) {
  session.list = poolFor(ctx, session.mode);
  session.i = 0;
  session.right = 0;
  session.total = 0;
}

function current() {
  return session.list[session.i] || null;
}

// 收藏夹：只做「回顾 + 朗读 + 删除」，不掺进 FSRS 练习队列
function renderFav(ctx) {
  const favs = (ctx.S.favorites || []);
  const words = favs.filter(f => f.kind === 'word');
  const sents = favs.filter(f => f.kind !== 'word');
  document.getElementById('app').innerHTML = `
    <div class="section-head">
      <div class="tabs" id="wmodes">
        ${[['due', '待复习'], ['new', '新词'], ['wrong', '错词'], ['all', '随机 80'], ['fav', '★ 收藏']]
          .map(([m, t]) => `<button data-m="${m}" class="${m === session.mode ? 'on' : ''}">${t}</button>`).join('')}
      </div>
      <span class="mini-note">单词 ${words.length} 个 · 句子 ${sents.length} 条 · 在阅读里划词就能收藏</span>
    </div>
    <div class="card card-pad fav-wrap">
      ${favs.length ? favs.map(f => `
        <div class="fav-row" data-fid="${f.id}">
          <div class="fav-main">
            <b class="fav-word">${esc(f.text)}</b>
            ${f.pos ? `<span class="fav-pos">${esc(f.pos)}</span>` : ''}
            <span class="fav-cn">${esc(f.cn || '')}</span>
            ${f.ctx ? `<div class="fav-ctx">…${esc(f.ctx)}…</div>` : ''}
          </div>
          <div class="fav-ops">
            <button class="fav-say" data-say="${esc(f.text)}" title="朗读">🔊</button>
            <button class="fav-del" data-del="${f.id}" title="删除">×</button>
          </div>
        </div>`).join('')
      : '<div class="mini-note" style="padding:16px 0">还没收藏。<br>去「阅读」里用鼠标选中一个单词或一句话，弹出来的小浮层里点「☆ 收藏」。</div>'}
    </div>`;

  const bindModes = () => $$('#wmodes button').forEach(b => b.addEventListener('click', () => {
    session.mode = b.dataset.m;
    rebuild(ctx);
    ctx.go('words');   // go 会重新 render，练习模式自然接上
  }));
  bindModes();

  $$('.fav-say').forEach(b => b.addEventListener('click', () => {
    try {
      const u = new SpeechSynthesisUtterance(b.dataset.say);
      u.lang = 'en-US'; u.rate = 0.9;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (_) {}
  }));
  $$('.fav-del').forEach(b => b.addEventListener('click', async () => {
    const id = Number(b.dataset.del);
    await ctx.removeFavorite(id);
    ctx.S.favorites = (ctx.S.favorites || []).filter(x => x.id !== id);
    renderFav(ctx);
  }));
}

export default {
  render(ctx) {
    activeCtx = ctx;
    if (session.mode === 'fav') return renderFav(ctx);
    const chapters = [...new Set(ctx.content.words.map(w => w.ch).filter(Boolean))];
    document.getElementById('app').innerHTML = `
    <div class="section-head">
      <div class="tabs" id="wmodes">
        ${[['due', '待复习'], ['new', '新词'], ['wrong', '错词'], ['all', '随机 80'], ['fav', '★ 收藏']]
          .map(([m, t]) => `<button data-m="${m}" class="${m === session.mode ? 'on' : ''}">${t}</button>`).join('')}
      </div>
      <select id="wchap" class="select">
        <option value="">全部章节</option>
        ${chapters.map(c => `<option value="${esc(c)}" ${c === session.chapter ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
    </div>
    <div class="quiz-wrap">
      <div id="wcard"></div>
      <div class="card card-pad side-list">
        <div class="stat-row"><span>本轮答对</span><b id="w-right">${session.right}</b></div>
        <div class="stat-row"><span>本轮已答</span><b id="w-total">${session.total}</b></div>
        <div class="stat-row"><span>剩余到期</span><b id="w-left">${ctx.dueWords().length}</b></div>
        <div class="stat-row"><span>今日新词</span><b id="w-newleft">${ctx.newWordsLeft()}</b></div>
        <div class="mini-note" style="margin-top:8px">
          键盘 1-4 选答案，回车下一题，E 标记太简单。答错 1 分钟后重来，答对按 FSRS 排到几天后。
        </div>
      </div>
    </div>`;

    $$('#wmodes button').forEach(b => b.addEventListener('click', () => {
      $$('#wmodes button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      session.mode = b.dataset.m;
      // 收藏夹是独立视图（不是练习队列），要走整个 render
      if (session.mode === 'fav') { ctx.go('words'); return; }
      rebuild(ctx);
      paint(ctx);
    }));
    $('#wchap').addEventListener('change', e => {
      session.chapter = e.target.value;
      rebuild(ctx);
      paint(ctx);
    });
    if (!session.list.length) rebuild(ctx);
    paint(ctx);
  },

  refresh(ctx) {
    const left = $('#w-left');
    if (left) left.textContent = ctx.dueWords().length;
    const nl = $('#w-newleft');
    if (nl) nl.textContent = ctx.newWordsLeft();
  },
};

async function paint(ctx) {
  const box = $('#wcard');
  if (!box) return;
  const item = current();
  session.answered = false;
  session.pending = null;

  if (!item) {
    box.innerHTML = `<div class="card card-pad"><div class="empty">
      ${session.mode === 'due' ? '到期的词清完了。' : session.mode === 'new' ? '今天的新词额度用完了，明天再来。' : '这个范围里没有词。'}
      <br><button class="btn primary small" style="margin-top:14px" data-go="reading">去做篇阅读</button></div></div>`;
    return;
  }

  const { word } = item;
  const card = ctx.S.cards.get(word.id);
  const opts = buildOptions(word, ctx.content.words, id => ctx.word(id));
  await ctx.info();
  const extra = ctx.infoFor(word);
  const st = describe(card || { state: 'new' }, Date.now(), ctx.cfg);

  box.innerHTML = `
  <div class="card card-pad quiz-card">
    <div class="quiz-top">
      <div>
        <div class="word-en2">${esc(word.w)}</div>
        <div class="word-ph2">${esc(extra.ph || '')}</div>
        <div class="word-tags">
          <span class="tag">${esc(word.p || '—')}</span>
          <span class="tag ${st.state === 'new' ? 'warm' : ''}">${stateLabel(st.state)}</span>
          ${word.ch ? `<span class="tag ghost">${esc(word.ch)}</span>` : ''}
        </div>
      </div>
      <button class="speak" id="w-speak" title="朗读">🔊</button>
    </div>
    <div class="opts" id="wopts">
      ${opts.opts.map((o, i) => `<button class="opt" data-i="${i}"><span class="k">${'ABCD'[i]}</span><span>${esc(o)}</span></button>`).join('')}
    </div>
    <div class="submit-row">
      <button class="btn primary" id="wsubmit" disabled>提交批改</button>
      <span class="mini-note" id="whint">先选一个意思，再提交</span>
    </div>
    <div id="wans"></div>
  </div>`;

  $('#w-speak').addEventListener('click', () => speak(word.w));
  let pick = -1;
  const submit = $('#wsubmit');
  const hint = $('#whint');
  $$('#wopts .opt').forEach(el => el.addEventListener('click', () => {
    if (session.answered) return;
    pick = +el.dataset.i;
    $$('#wopts .opt').forEach((x, i) => x.classList.toggle('pick', i === pick));
    submit.disabled = false;
    hint.textContent = `已选 ${'ABCD'[pick]}，点提交批改`;
  }));
  submit.addEventListener('click', () => {
    if (pick < 0 || session.answered) return;
    answer(ctx, pick, opts.ans, item, extra);
  });
  session.submit = submit;
  session.hint = hint;
}

function stateLabel(s) {
  return { new: '新词', learning: '学习中', review: '复习中', relearning: '重学' }[s] || s;
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

async function answer(ctx, pick, ans, item, extra) {
  if (session.answered) return;
  session.answered = true;
  const ok = pick === ans;
  if (session.submit) session.submit.disabled = true;
  if (session.hint) session.hint.textContent = ok ? '批改完成：答对' : '批改完成：答错';
  const { word } = item;
  const card = ctx.S.cards.get(word.id) || { state: 'new' };
  session.pending = ok ? RATING.good : RATING.again;

  $$('#wopts .opt').forEach((el, i) => {
    el.classList.add('locked');
    if (i === ans) el.classList.add('ok');
    else if (i === pick) el.classList.add('no');
  });

  session.total += 1;
  if (ok) session.right += 1;
  const rightEl = $('#w-right');
  const totalEl = $('#w-total');
  if (rightEl) rightEl.textContent = session.right;
  if (totalEl) totalEl.textContent = session.total;

  const pv = preview(card, Date.now(), ctx.cfg);
  const nextMs = pv[ok ? 'good' : 'again'];
  $('#wans').innerHTML = `
    <div class="answer ${ok ? 'good' : 'bad'}">
      <div class="ans-head">${ok ? '答对' : '答错'} · <b>${esc(word.c)}</b>
        <span class="mini-note">${ok ? `下次复习：${fmtInterval(nextMs)} 后` : '1 分钟后重新练这个词'}</span></div>
      ${word.k ? `<div class="mini-note">搭配：${esc(word.k)}</div>` : ''}
      ${extra.e ? `<div class="ans-ex">${esc(extra.e)}${extra.ec ? `<span>${esc(extra.ec)}</span>` : ''}</div>` : ''}
      <div class="ans-actions">
        <button class="btn primary small" id="wnext">下一个（回车）</button>
        ${ok ? '<button class="btn ghost small" id="weasy">太简单（E）</button>'
             : '<button class="btn ghost small" id="wai">让 AI 讲讲</button>'}
      </div>
    </div>
    <div id="waiout"></div>`;

  const aiBtn = $('#wai');
  if (aiBtn) {
    aiBtn.addEventListener('click', async () => {
      aiBtn.disabled = true;
      const out = $('#waiout');
      out.innerHTML = '<div class="mini-note">AI 正在批改…</div>';
      const opts = buildOptions(word, ctx.content.words, id => ctx.word(id));
      const g = await aiGrade('word', {
        word: word.w,
        correct: word.c,
        picked: opts.opts[pick],
      });
      if (g) {
        out.innerHTML = `<div class="ai-card"><div class="ai-comment">${esc(g.comment || '')}</div></div>`;
      } else {
        out.innerHTML = '<div class="mini-note">AI 不可用，看上面的释义和例句。</div>';
      }
      aiBtn.disabled = false;
    });
  }
  $('#wnext').addEventListener('click', () => next(ctx));
  const easy = $('#weasy');
  if (easy) easy.addEventListener('click', () => { session.pending = RATING.easy; easy.textContent = '已标记：太简单'; easy.disabled = true; });
  document.dispatchEvent(new CustomEvent('word-answered'));
}

async function next(ctx) {
  if (!session.answered) return;
  const item = current();
  session.answered = false;
  const rating = session.pending || RATING.good;
  session.pending = null;
  if (item) {
    const before = ctx.S.cards.get(item.word.id);
    const isNew = !before || before.state === 'new';
    await ctx.gradeWord(item.word, rating, isNew);
  }
  session.i += 1;
  if (session.i >= session.list.length) rebuild(ctx);
  paint(ctx);
}

document.addEventListener('keydown', e => {
  if (!activeCtx || !document.querySelector('#wmodes')) return;
  if (e.key === 'Enter' && session.answered) { next(activeCtx); return; }
  if (e.key.toLowerCase() === 'e' && session.answered && session.pending === RATING.good) {
    const btn = $('#weasy');
    if (btn) btn.click();
    return;
  }
  if (['1', '2', '3', '4'].includes(e.key) && !session.answered) {
    const el = $(`#wopts .opt[data-i="${Number(e.key) - 1}"]`);
    if (el) el.click();
  }
});

export { session };
