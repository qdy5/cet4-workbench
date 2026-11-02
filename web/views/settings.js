import { $, esc } from '../core/dom.js';
import { dayKey } from '../core/date.js';

const kb = n => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export default {
  async render(ctx) {
    const { S } = ctx;
    const mode = ctx.store.mode;
    let usage = '';
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        usage = `${kb(est.usage || 0)} / ${kb(est.quota || 0)}`;
      } catch (_) { usage = '—'; }
    }
    const cards = S.cards.size;
    const events = S.events.length;

    document.getElementById('app').innerHTML = `
    <div class="grid-2">
      <div class="card card-pad">
        <div class="section-head"><b>当前模式</b><span class="pill ${mode === 'api' ? 'accent' : 'warm'}">${mode === 'api' ? '本机 SQLite' : '离线 IndexedDB'}</span></div>
        <p class="mini-note" style="line-height:1.8">
          ${mode === 'api'
            ? '数据存在电脑的 workbench.db 里。手机上打开静态版后，可以用下面的「导出/导入」把进度搬过去。'
            : '数据存在这台设备的浏览器里，不联网也能用。装到主屏幕后断网照样打开。换设备或清缓存前记得导出备份。'}
        </p>
        <div class="stat-row"><span>单词卡状态</span><b>${cards} 条</b></div>
        <div class="stat-row"><span>练习事件</span><b>${events} 条</b></div>
        <div class="stat-row"><span>本地占用</span><b>${usage || '—'}</b></div>
      </div>

      <div class="card card-pad">
        <div class="section-head"><b>复习参数</b><span class="mini-note">改完立即生效</span></div>
        <label class="field"><span>每日新词上限</span>
          <input type="number" id="cfg-new" min="0" max="120" step="5" value="${S.cfg.newPerDay}">
        </label>
        <label class="field"><span>目标记忆保持率</span>
          <select id="cfg-ret">
            ${[[0.85, '85%（复习更少）'], [0.9, '90%（默认）'], [0.95, '95%（更牢，复习更多）']]
              .map(([v, t]) => `<option value="${v}" ${Math.abs(S.cfg.retention - v) < 0.001 ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </label>
        <button class="btn primary small" id="cfg-save">保存参数</button>
        <div class="mini-note" style="margin-top:10px">排程用 FSRS-5：答错 1 分钟后重来，答对按稳定度推 1 天到几个月。</div>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:16px">
      <div class="section-head"><b>备份与同步</b><span class="mini-note">导出的 JSON 可以在另一台设备导入合并</span></div>
      <div class="row-actions">
        <button class="btn primary small" id="exp">导出进度</button>
        <label class="btn ghost small" for="imp">导入合并<input type="file" id="imp" accept="application/json,.json" hidden></label>
        <button class="btn ghost small danger" id="reset">清空本机进度</button>
      </div>
      <div class="mini-note" style="margin-top:8px">合并规则：同一次答题不重复计，卡片取复习次数多的那份。</div>
      <div id="sync-out" class="ai-out"></div>
    </div>

    <div class="card card-pad" style="margin-top:16px">
      <div class="section-head"><b>关于</b><span class="mini-note">build ${esc(S.meta.build || 'dev')}</span></div>
      <p class="mini-note" style="line-height:1.9">
        考试日期 ${esc(S.meta.exam.date)}，目标 ${S.meta.exam.target} 分。日期和目标分在 <code>data/meta.json</code>，改那里一处，两端同时生效。<br>
        单词 ${S.content.words.length} 个，干扰项在构建期按词性和长度对齐生成；听力音频本地托管，不走外网。<br>
        离线版数据完全静态，无任何外部请求。
      </p>
    </div>`;

    $('#cfg-save').addEventListener('click', async () => {
      const patch = {
        newPerDay: Math.max(0, Math.min(120, Number($('#cfg-new').value) || 0)),
        retention: Number($('#cfg-ret').value) || 0.9,
      };
      const next = await ctx.store.setConfig(patch);
      S.cfg = { ...S.cfg, ...next };
      ctx.toast('参数已保存');
      ctx.reload();
    });

    $('#exp').addEventListener('click', async () => {
      const data = await ctx.store.exportAll();
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `cet4-progress-${dayKey()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      $('#sync-out').textContent = `已导出 ${data.cards.length} 张卡、${data.events.length} 条事件。`;
    });

    $('#imp').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        const r = await ctx.store.importAll(obj, { merge: true });
        $('#sync-out').textContent = `已合并 ${r.cards} 张卡、${r.events} 条事件。`;
        await ctx.reload();
      } catch (err) {
        $('#sync-out').textContent = `导入失败：${err.message}`;
      }
    });

    $('#reset').addEventListener('click', async () => {
      if (!confirm('清空本机进度？导出的备份不受影响，但这台设备上的记录会没有。')) return;
      await ctx.store.reset();
      $('#sync-out').textContent = '已清空。';
      await ctx.reload();
    });
  },
};
