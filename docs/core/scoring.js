// 翻译/写作的本地自查：不假装能打分，给可解释的「采分点命中 + 硬检查」。
// 桌面版可以额外调用本地大模型做点评（见 views/translation.js 的「让 AI 点评」）。

const CJK = /[\u4e00-\u9fa5]/;
const VOWEL = /^[aeiou]/i;

const STOP = new Set(`a an the and or but if so of to in on at for with by from as is are was were be been being
it its this that these those i you he she we they my your his her our their not no do does did have has had will
would can could should may might must there here what which who whom whose when where why how than then also
very more most much many some any all both each other such only just about into over under up down out`.split(/\s+/));

export function words(text) {
  return (String(text).match(/[A-Za-z][A-Za-z'’-]*/g) || []);
}

export function sentences(text) {
  return String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => words(s).length > 1);
}

function phraseRegex(phrase) {
  const parts = String(phrase).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  // 允许词间插入最多 2 个词，覆盖「With the rapid development of」这类改写
  return new RegExp(`\\b${parts.join('\\W+(?:\\w+\\W+){0,2}?')}\\w*`, 'i');
}

export function matchPoint(text, point) {
  const t = String(text);
  if (point.re) {
    try {
      if (new RegExp(point.re, 'i').test(t)) return true;
    } catch (_) { /* 正则写坏了就当没命中 */ }
  }
  for (const alt of point.any || []) {
    const re = phraseRegex(alt);
    if (re && re.test(t)) return true;
  }
  return false;
}

function checkArticles(text) {
  const list = words(text);
  const errs = [];
  for (let i = 0; i < list.length - 1; i += 1) {
    const w = list[i].toLowerCase();
    const next = list[i + 1];
    if (w === 'a' && VOWEL.test(next)) errs.push(`a ${next}`);
    if (w === 'an' && !VOWEL.test(next) && next.toLowerCase() !== 'hour' && next.toLowerCase() !== 'honest') errs.push(`an ${next}`);
  }
  return errs;
}

function repeatedContent(text) {
  const list = words(text).map(w => w.toLowerCase()).filter(w => w.length > 2 && !STOP.has(w));
  const count = new Map();
  for (const w of list) count.set(w, (count.get(w) || 0) + 1);
  return [...count.entries()]
    .filter(([, n]) => n >= 4 && n / Math.max(1, list.length) > 0.12)
    .sort((a, b) => b[1] - a[1]);
}

/**
 * 翻译自查
 * @returns {{score:number, points:Array, checks:Array, stats:object}}
 */
export function scoreTranslation(text, item) {
  const src = String(text || '');
  const refWords = words(item.ref || '').length;
  const mine = words(src);
  const pts = (item.points || []).map(p => ({ label: p.label || (p.any || [])[0], ok: matchPoint(src, p) }));
  const covered = pts.filter(p => p.ok).length;
  const coverage = pts.length ? covered / pts.length : 0;

  const ratio = refWords ? mine.length / refWords : 1;
  const checks = [
    { name: '没有中文残留', ok: !CJK.test(src), hint: '把中文都译成英文' },
    { name: '首字母大写、句末有标点', ok: /^[A-Z"']/.test(src.trim()) && /[.!?]["']?$/.test(src.trim()), hint: '检查大小写和句号' },
    { name: '冠词 a/an 正确', ok: checkArticles(src).length === 0, hint: checkArticles(src).slice(0, 3).join('、') },
    { name: '长度与参考译文相当', ok: ratio >= 0.55 && ratio <= 1.8, hint: `你 ${mine.length} 词 / 参考 ${refWords} 词` },
    { name: '没有词语重复堆砌', ok: repeatedContent(src).length === 0, hint: repeatedContent(src).map(([w, n]) => `${w}×${n}`).join('、') },
  ];
  const passed = checks.filter(c => c.ok).length;
  // 不合成一个「分数」：采分点覆盖和硬检查分开呈现，机器判不了语义就不装判得了。
  return {
    coverage,
    points: pts,
    checks,
    stats: {
      covered, total: pts.length, words: mine.length, refWords,
      ratio: Math.round(ratio * 100) / 100, passRate: passed / checks.length,
    },
  };
}

const CONNECTIVES = ['however', 'therefore', 'moreover', 'furthermore', 'in addition', 'besides', 'as a result',
  'on the one hand', 'on the other hand', 'for example', 'for instance', 'in contrast', 'nevertheless',
  'first', 'second', 'finally', 'in conclusion', 'to sum up', 'although', 'while', 'because', 'since',
  'not only', 'instead', 'meanwhile', 'consequently', 'in short', 'above all'];

export function analyzeWriting(text, item = {}) {
  const src = String(text || '');
  const ws = words(src);
  const ss = sentences(src);
  const paras = src.split(/\n\s*\n/).filter(p => words(p).length > 3);
  const lens = ss.map(s => words(s).length);
  const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const lower = src.toLowerCase();
  const used = CONNECTIVES.filter(c => lower.includes(c));
  const rep = repeatedContent(src);
  const range = String(item.words || '120-180').split('-').map(Number);
  const [lo, hi] = [range[0] || 120, range[1] || 180];

  const checks = [
    { name: `词数落在 ${lo}-${hi}`, ok: ws.length >= lo * 0.85 && ws.length <= hi * 1.25, hint: `当前 ${ws.length} 词` },
    { name: '至少 3 段', ok: paras.length >= 3, hint: `当前 ${paras.length} 段` },
    { name: '平均句长 12-25 词', ok: avg >= 12 && avg <= 25, hint: `当前 ${avg.toFixed(1)} 词/句` },
    { name: '连接词用了 3 种以上', ok: used.length >= 3, hint: `已用 ${used.length} 种` },
    { name: '没有高频词堆砌', ok: rep.length === 0, hint: rep.map(([w, n]) => `${w}×${n}`).join('、') || '—' },
    { name: '没有中文残留', ok: !CJK.test(src), hint: '把中文都去掉' },
    { name: '长句不超过 45 词', ok: lens.every(n => n <= 45), hint: `最长 ${Math.max(0, ...lens)} 词` },
  ];

  return {
    words: ws.length,
    sentences: ss.length,
    paragraphs: paras.length,
    avgSentence: Math.round(avg * 10) / 10,
    connectives: used,
    repeated: rep,
    checks,
    passed: checks.filter(c => c.ok).length,
    total: checks.length,
  };
}

export { CONNECTIVES, STOP };
