import { daysUntil, dayKey } from '../core/date.js';

export default {
  render(ctx) {
    const { S } = ctx;
    const meta = S.meta;
    const s = S.stats;
    const left = daysUntil(meta.exam.date);
    const due = ctx.dueWords().length;
    const learned = [...S.cards.values()].filter(c => c.state !== 'new').length;
    const total = S.content.words.length;
    const pct = Math.round((learned / total) * 1000) / 10;
    const max = Math.max(1, ...s.days.map(d => d.count));
    const mods = s.modules;
    const tasks = [
      ['单词', due ? `${due} 个到期` : (ctx.newWordsLeft() ? `新词 ${ctx.newWordsLeft()} 个额度` : '今日已清空'), !!mods.word, 'words'],
      ['听力', s.today.total && mods.listening ? '今天练过' : '先听一组', !!mods.listening, 'listening'],
      ['阅读', mods.reading ? '今天练过' : '一篇 15 分钟', !!mods.reading, 'reading'],
      ['翻译', mods.translation ? '今天练过' : '一句 10 分钟', !!mods.translation, 'translation'],
      ['写作', mods.writing ? '今天写过' : '一篇 30 分钟', !!mods.writing, 'writing'],
    ];

    document.getElementById('app').innerHTML = `
    <div class="hero">
      <div class="hero-main">
        <div class="eyebrow">Today's focus</div>
        <div class="hero-stats">
          <div><b>${left}</b><span>天后考试 · ${meta.exam.date}</span></div>
          <div><b>${meta.exam.target}</b><span>目标分（425 过线）</span></div>
          <div><b>${s.streak}</b><span>连续天数</span></div>
        </div>
        <h2>${due ? `先把 ${due} 个到期的词清掉，<br>再谈别的。` : (ctx.newWordsLeft() ? `今天的新词还有 ${ctx.newWordsLeft()} 个额度。` : '今天的词清完了，<br>去拿一篇阅读。')}</h2>
        <p>四级 710 分：写作 15%、听力 35%、阅读 35%、翻译 15%，125 分钟。每天推进一点，比周末突击有效。</p>
        <div class="hero-actions">
          <button class="btn light" data-go="${due || ctx.newWordsLeft() ? 'words' : 'reading'}">${due ? '开始复习' : '开始单词'}</button>
          <button class="btn light" data-go="stats">看数据</button>
        </div>
      </div>
      <div class="card card-pad today">
        <div class="mini-head">今日任务</div>
        ${tasks.map(([t, m, done, v]) => `
          <div class="task ${done ? 'done' : ''}">
            <span class="dot"></span><a href="#" data-go="${v}">${t}</a><span class="meta">${done ? '已完成' : m}</span>
          </div>`).join('')}
        <div class="progress-line">
          <div class="progress"><i style="width:${pct}%"></i></div>
          <div class="mini-note">已学 ${learned} / ${total} 词（${pct}%）</div>
        </div>
      </div>
    </div>

    <div class="kpi">
      <div class="card"><div class="label">待复习</div><div class="value">${due}<small>词</small></div><div class="hint">到期就复习，别攒</div></div>
      <div class="card"><div class="label">新词额度</div><div class="value">${ctx.newWordsLeft()}<small>个</small></div><div class="hint">每天上限 ${S.cfg.newPerDay}</div></div>
      <div class="card"><div class="label">今日练习</div><div class="value">${s.today.total}<small>次</small></div><div class="hint">单词 ${s.today.words} · 新词 ${s.today.newWords}</div></div>
      <div class="card"><div class="label">错词</div><div class="value">${[...S.cards.values()].filter(c => c.lapses > 0).length}<small>词</small></div><div class="hint">在「错词」里可以重练</div></div>
    </div>

    <div class="card card-pad" style="margin-bottom:16px">
      <div class="section-head"><div><b>最近 7 天</b> <span class="mini-note">每天完成的练习次数</span></div>
        <span class="mini-note">共 ${s.days.reduce((a, b) => a + b.count, 0)} 次</span></div>
      <div class="chart">
        ${s.days.map((d, i) => `<div class="bar ${i === s.days.length - 1 ? 'today' : ''}" title="${d.day}">
          <i style="height:${Math.max(4, (d.count / max) * 90)}px"></i><span>${d.day.slice(5)}</span></div>`).join('')}
      </div>
    </div>

    <div class="modules">
      ${[['words', '单词', `${total} 词 · 四档评分`], ['listening', '听力', `${S.content.listening.length} 组 · 可调速`],
        ['reading', '阅读', `${S.content.reading.length} 篇 · 限时`], ['translation', '翻译', `${S.content.translation.length} 句 · 采分点`],
        ['writing', '写作', `${S.content.writing.length} 篇 · 自查清单`], ['stats', '数据', '全部本机，不联网']]
        .map(([v, t, d]) => `<div class="card module" data-go="${v}"><h3>${t}</h3><p>${d}</p></div>`).join('')}
    </div>`;
  },
};

export { dayKey };
