// 阅读标注层：画笔 / 橡皮 / 撤销 / 清空，按文章 id 存到后端。
// 2026-11-06 加。canvas 绝对定位盖在 .passage 上，不进文档流，不影响排版。
//
// 坐标系统一用「相对 canvas 左上角的 CSS 像素」，存库也是这个，换设备/换屏宽会按比例缩放绘制。

const COLORS = ['#d94f3d', '#e8a33d', '#2f8f5b', '#3b7dd8'];

export function mountAnnotator(host, articleId, store) {
  if (!host) return null;

  // 容器要能定位
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

  const cv = document.createElement('canvas');
  cv.className = 'anno-canvas';
  cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:5;' +
                     'pointer-events:none;cursor:crosshair;border-radius:inherit';
  host.appendChild(cv);

  const ctx2d = cv.getContext('2d');
  let strokes = [];          // [{c, w, pts:[{x,y}]}]
  let mode = 'off';          // off | pen | eraser
  let color = COLORS[0];
  let drawing = null;
  let dirty = false;
  let saveTimer = 0;
  let dpr = Math.min(2, window.devicePixelRatio || 1);

  function fit() {
    const w = host.clientWidth;
    const h = host.scrollHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.height = h + 'px';
    redraw();
  }

  function redraw() {
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, cv.width, cv.height);
    ctx2d.lineCap = 'round';
    ctx2d.lineJoin = 'round';
    for (const st of strokes) {
      if (!st.pts || st.pts.length < 2) continue;
      ctx2d.strokeStyle = st.c || color;
      ctx2d.lineWidth = st.w || 2.5;
      ctx2d.globalAlpha = 0.85;
      ctx2d.beginPath();
      ctx2d.moveTo(st.pts[0].x, st.pts[0].y);
      for (let i = 1; i < st.pts.length; i++) ctx2d.lineTo(st.pts[i].x, st.pts[i].y);
      ctx2d.stroke();
    }
    ctx2d.globalAlpha = 1;
  }

  function pos(e) {
    const r = cv.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: Math.round((t.clientX - r.left) * 10) / 10,
             y: Math.round((t.clientY - r.top) * 10) / 10 };
  }

  function hit(p) {
    // 从后往前找，命中一条就删一条
    for (let i = strokes.length - 1; i >= 0; i--) {
      const pts = strokes[i].pts || [];
      for (const q of pts) {
        if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 < 15 ** 2) return i;
      }
    }
    return -1;
  }

  function scheduleSave() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (!dirty) return;
      dirty = false;
      try { await store.saveAnnotations(articleId, strokes); } catch (_) {}
    }, 700);
  }

  function onDown(e) {
    if (mode === 'off') return;
    e.preventDefault();
    const p = pos(e);
    if (mode === 'eraser') {
      const i = hit(p);
      if (i >= 0) { strokes.splice(i, 1); redraw(); scheduleSave(); }
      return;
    }
    drawing = { c: color, w: 2.5, pts: [p] };
    strokes.push(drawing);
    cv.setPointerCapture && e.pointerId != null && cv.setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    if (mode === 'off') return;
    const p = pos(e);
    if (mode === 'eraser') {
      if (e.buttons) { const i = hit(p); if (i >= 0) { strokes.splice(i, 1); redraw(); scheduleSave(); } }
      return;
    }
    if (!drawing) return;
    e.preventDefault();
    const last = drawing.pts[drawing.pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 1.2) return;   // 点太密不记
    drawing.pts.push(p);
    ctx2d.strokeStyle = drawing.c;
    ctx2d.lineWidth = drawing.w;
    ctx2d.globalAlpha = 0.85;
    ctx2d.lineCap = 'round';
    ctx2d.beginPath();
    ctx2d.moveTo(last.x, last.y);
    ctx2d.lineTo(p.x, p.y);
    ctx2d.stroke();
    ctx2d.globalAlpha = 1;
  }

  function onUp() {
    if (drawing) { drawing = null; scheduleSave(); }
  }

  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  cv.addEventListener('touchstart', onDown, { passive: false });
  cv.addEventListener('touchmove', onMove, { passive: false });
  cv.addEventListener('touchend', onUp);

  const ro = new ResizeObserver(() => fit());
  ro.observe(host);

  fit();
  // 拉已有标注
  (async () => {
    try {
      const r = await store.annotations(articleId);
      if (r && Array.isArray(r.strokes) && r.strokes.length) {
        strokes = r.strokes;
        redraw();
      }
    } catch (_) {}
  })();

  return {
    setMode(m) {
      mode = m;
      cv.style.pointerEvents = m === 'off' ? 'none' : 'auto';
      cv.style.cursor = m === 'eraser' ? 'cell' : 'crosshair';
      if (m === 'off') { drawing = null; }
    },
    setColor(c) { color = c; },
    undo() { strokes.pop(); redraw(); scheduleSave(); },
    clear() { strokes = []; redraw(); scheduleSave(); },
    count() { return strokes.length; },
    destroy() { ro.disconnect(); window.removeEventListener('pointerup', onUp); },
  };
}