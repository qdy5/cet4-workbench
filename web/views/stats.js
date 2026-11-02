import { esc } from '../core/dom.js';
import { dayKey, relTime, DAY } from '../core/date.js';

const MODULE_NAME = {
  word: '单词', listening: '听力', reading: '阅读', translation: '翻译', writing: '写作',
};

export default {
  render(ctx) {
    const { S } = ctx;
    const s = S.stats;
    const cards = [...S.cards.values()];
    const learned = cards.filter(c => c.state !== 'new').length;
    const total = S.content.words.length;
    const max = Math.max(1, ...s.days.map(d => d.count));
    const mods = Object.entries(s.modules).sort((a, b) => b[1].n - a[1].n);
    const weak = s.weak
      .map(c => ({ card: c, word: ctx.word(c.wordId) }))
      .filter(x => x.word)
      .slice(0, 15);
    const recent = S.events.slice(0, 12);
    const forecast = [];
    for (let i = 0; i < 7; i += 1) {
      const from = Date.now() + i * DAY;
      const to = from + DAY;
      forecast.push(cards.filter(c => c.state !== 'new' && c.due >= from && c.due < to).length);
    }

    document.getElementById('app').innerHTML = `
    <div class="kpi">
      <div class="card"><div class="label">已学词</div><div class="value">${learned}<small>/ ${total}</small></div><div class="hint">${Math.round(learned / total * 1000) / 10}%</div></div>
      <div class="card"><div class="label">连续</div><div class="value">${s.streak}<small>天</small></div><div class="hint">累计活跃 ${s.activeDays} 天</div></div>
      <div class="card"><div class="label">累计练习</div><div class="value">${s.totalEvents}<small>次</small></div><div class="hint">来自事件记录</div></div>
      <div class="card"><div class="label">错词</div><div class="value">${cards.filter(c => c.lapses > 0).length}<small>词</small></div><div class="hint">lapses 累计</div></div>
    </div>

    <div class="grid-2">
      <div class="card card-pad">
        <div class="section-head"><b>最近 7 天</b><span class="mini-note">练习次数</span></div>
        <div class="chart">
          ${s.days.map((d, i) => `<div class="bar ${i === s.days.length - 1 ? 'today' : ''}" title="${d.count} 次">
            <i style="height:${Math.max(4, (d.count / max) * 90)}px"></i><span>${d.day.slice(5)}</span></div>`).join('')}
        </div>
      </div>
      <div class="card card-pad">
        <div class="section-head"><b>各模块正确率</b><span class="mini-note">单词按评分≥3 记正确</span></div>
        <div class="bars">
          ${mods.length ? mods.map(([k, v]) => {
            const pct = v.acc == null ? 0 : Math.round(v.acc * 100);
            return `<div class="bar-row"><span>${MODULE_NAME[k] || k}</span>
              <div class="track"><i style="width:${pct}%"></i></div><span>${v.acc == null ? '—' : `${pct}%`}</span></div>`;
          }).join('') : '<div class="mini-note">还没有记录，先做一次练习。</div>'}
        </div>
      </div>
    </div>

    <div class="card card-pad" style="margin-bottom:16px">
      <div class="section-head"><b>未来 7 天复习量预测</b><span class="mini-note">按当前 FSRS 排程</span></div>
      <div class="chart">
        ${forecast.map((n, i) => `<div class="bar ${i === 0 ? 'today' : ''}" title="${n} 词">
          <i style="height:${Math.max(4, (n / Math.max(1, ...forecast)) * 90)}px"></i><span>${i === 0 ? '今天' : `+${i}`}</span></div>`).join('')}
      </div>
    </div>

    <div class="grid-2">
      <div class="card card-pad">
        <div class="section-head"><b>薄弱词</b><span class="mini-note">按遗忘次数排序</span></div>
        ${weak.length ? `<table><thead><tr><th>单词</th><th>释义</th><th>忘</th><th>复习次数</th></tr></thead><tbody>
          ${weak.map(({ card, word }) => `<tr><td><b>${esc(word.w)}</b></td><td>${esc(word.c)}</td><td>${card.lapses}</td><td>${card.reps}</td></tr>`).join('')}
        </tbody></table>` : '<div class="mini-note">还没有错词记录。</div>'}
      </div>
      <div class="card card-pad">
        <div class="section-head"><b>最近练习</b><span class="mini-note">${dayKey()}</span></div>
        ${recent.length ? `<table><thead><tr><th>模块</th><th>结果</th><th>时间</th></tr></thead><tbody>
          ${recent.map(e => `<tr><td>${MODULE_NAME[e.type] || e.type}</td>
            <td>${e.total ? `${e.correct}/${e.total}` : (e.detail && e.detail.words ? `${e.detail.words} 词` : '—')}</td>
            <td class="mini-note">${relTime(e.ts)}</td></tr>`).join('')}
        </tbody></table>` : '<div class="mini-note">还没有练习记录。</div>'}
      </div>
    </div>`;
  },
};
