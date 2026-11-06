// 划词释义：在阅读页（以及其他正文区）选中英文 → 自动查词/翻译 → 小浮层。
// 2026-11-06 加。浮层挂在 body 上，不参与视图重渲染，所以切页面不会残留。

const SEL_SCOPE = '.passage, .reader, .q-text, .sent, .article-body';
let pop = null;
let hideTimer = 0;
let lastText = '';

function ensurePop() {
  if (pop) return pop;
  pop = document.createElement('div');
  pop.id = 'dictPop';
  pop.className = 'dict-pop';
  pop.innerHTML = `
    <div class="dp-head"><b class="dp-word"></b><span class="dp-pos"></span>
      <button class="dp-close" title="关闭">×</button></div>
    <div class="dp-cn"></div>
    <div class="dp-coll"></div>
    <div class="dp-actions">
      <button class="dp-btn dp-fav">☆ 收藏</button>
      <button class="dp-btn dp-say" title="朗读">🔊</button>
      <span class="dp-tag"></span>
    </div>`;
  document.body.appendChild(pop);
  pop.querySelector('.dp-close').addEventListener('click', hide);
  return pop;
}

function hide() {
  if (pop) pop.classList.remove('on');
  lastText = '';
}

function place(rect) {
  const p = ensurePop();
  const pad = 10;
  const w = 320;
  let x = rect.left + rect.width / 2 - w / 2;
  let y = rect.bottom + 10;
  x = Math.max(pad, Math.min(x, window.innerWidth - w - pad));
  if (y + 210 > window.innerHeight) y = Math.max(pad, rect.top - 220);
  p.style.left = x + 'px';
  p.style.top = y + 'px';
}

function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (_) {}
}

async function lookup(text, rect, store) {
  const p = ensurePop();
  place(rect);
  p.classList.add('on', 'loading');
  p.querySelector('.dp-word').textContent = text.length > 40 ? text.slice(0, 40) + '…' : text;
  p.querySelector('.dp-pos').textContent = '';
  p.querySelector('.dp-cn').textContent = '查词中…';
  p.querySelector('.dp-coll').textContent = '';
  p.querySelector('.dp-tag').textContent = '';

  let r = null;
  try {
    const res = await fetch('api/lookup?q=' + encodeURIComponent(text), { cache: 'no-store' });
    r = await res.json();
  } catch (_) {
    p.querySelector('.dp-cn').textContent = '查词失败（后端没连上）';
    p.classList.remove('loading');
    return;
  }
  p.classList.remove('loading');
  if (!r || !r.ok) {
    p.querySelector('.dp-cn').textContent = '没查到，换个词试试';
    return;
  }

  p.querySelector('.dp-word').textContent = r.word || text;
  p.querySelector('.dp-pos').textContent = r.pos || (r.kind === 'sentence' ? '句子' : '');
  p.querySelector('.dp-cn').textContent = r.cn || '';
  p.querySelector('.dp-coll').textContent = r.coll ? '搭配：' + r.coll : (r.note || '');
  p.querySelector('.dp-tag').textContent = r.hit ? '词表命中' : (r.ai ? 'AI 释义' : '');

  const fav = p.querySelector('.dp-fav');
  fav.textContent = '☆ 收藏';
  fav.disabled = false;
  fav.onclick = async () => {
    fav.disabled = true;
    try {
      await store.addFavorite({
        kind: r.kind, text: r.word || text, cn: r.cn || '',
        pos: r.pos || '', ctx: text !== r.word ? text.slice(0, 120) : '',
      });
      fav.textContent = '★ 已收藏';
      hideTimer = window.setTimeout(hide, 900);
    } catch (_) {
      fav.textContent = '收藏失败';
      fav.disabled = false;
    }
  };
  p.querySelector('.dp-say').onclick = () => speak(r.word || text);
}

export function installDict(store) {
  const onUp = e => {
    if (pop && pop.contains(e.target)) return;   // 点浮层自己不重新查
    window.setTimeout(async () => {
      const sel = window.getSelection();
      const text = (sel ? sel.toString() : '').trim().replace(/\s+/g, ' ');
      if (!text || text.length < 2 || !/[A-Za-z]/.test(text)) {
        if (!pop || !pop.contains(document.activeElement)) hide();
        return;
      }
      // 只在正文区域生效，避免在输入框/题目选项里误触
      const anchor = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
      if (!anchor || !anchor.closest(SEL_SCOPE)) return;
      if (text === lastText && pop.classList.contains('on')) return;
      lastText = text;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      await lookup(text, rect, store);
    }, 120);
  };

  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchend', onUp);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  document.addEventListener('scroll', () => { if (pop && pop.classList.contains('on')) hide(); }, true);
}