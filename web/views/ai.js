// AI 批改客户端：桌面走 /api/ai/grade（DeepSeek），离线版返回 null 由调用方降级。
export async function aiGrade(kind, payload) {
  try {
    const r = await fetch('api/ai/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, payload }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data && data.ok ? data : null;
  } catch (_) {
    return null;
  }
}

export function renderGrade(box, g, max) {
  if (!g) {
    box.innerHTML = '<div class="mini-note">AI 批改不可用（离线版或服务没开），先看上面的规则批改。</div>';
    return;
  }
  const score = g.score == null ? '—' : g.score;
  const total = max || 15;
  box.innerHTML = `
    <div class="ai-card">
      <div class="ai-head">
        <span class="ai-badge">AI 批改</span>
        <span class="ai-score">${score}<em>/${total}</em></span>
        <span class="mini-note">${g.source ? esc(g.source) : ''}</span>
      </div>
      ${g.comment ? `<div class="ai-comment">${esc(g.comment)}</div>` : ''}
      ${Array.isArray(g.issues) && g.issues.length
        ? `<ul class="ai-issues">${g.issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
      ${g.better ? `<div class="ai-better"><b>改进</b>${esc(g.better)}</div>` : ''}
    </div>`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
