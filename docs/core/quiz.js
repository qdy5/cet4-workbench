// 选择题选项：干扰项在构建期按「词性一致 + 长度接近 + 共用汉字」预生成（存的是词 id），
// 运行时只做解析与洗牌，避免出现「正确答案最短、一眼排除」的假题。
export function shuffle(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const near = (a, b) => Math.abs(a.length - b.length) <= Math.max(3, Math.round(b.length * 0.45));

/** 兜底：新数据缺 dz 时从词库现挑（只在异常情况下走到） */
export function fallbackDistractors(word, pool) {
  const cand = pool.filter(x => x.c && x.c !== word.c && x.w !== word.w && x.p === word.p && near(x.c, word.c));
  const out = [];
  for (const x of cand) {
    if (!out.includes(x.c)) out.push(x.c);
    if (out.length === 3) break;
  }
  if (out.length < 3) {
    for (const x of pool) {
      if (x.c && x.c !== word.c && !out.includes(x.c)) out.push(x.c);
      if (out.length === 3) break;
    }
  }
  return out;
}

/**
 * @param {object} word {c, dz?: number[], p}
 * @param {Array} pool 词库（兜底用）
 * @param {function} resolve id -> word，用于把 dz 里的 id 还原成释义
 */
export function buildOptions(word, pool = [], resolve = null, rnd = Math.random) {
  let dz = [];
  if (Array.isArray(word.dz)) {
    dz = word.dz
      .map(id => (resolve ? (resolve(id) || {}).c : null))
      .filter(cn => cn && cn !== word.c);
  }
  if (dz.length < 3) dz = [...dz, ...fallbackDistractors(word, pool)];
  const uniq = [...new Set([word.c, ...dz])].slice(0, 4);
  const arr = shuffle(uniq, rnd);
  return { opts: arr, ans: arr.indexOf(word.c) };
}
