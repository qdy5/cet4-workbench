# -*- coding: utf-8 -*-
"""断网可用性测试：先在线加载一次让 service worker 缓存，再离线重载，看能不能用。
用法: python tools/test_offline.py
"""
import sys
import time

sys.path.insert(0, r"C:\tmp\toutiao_v3")
sys.stdout.reconfigure(encoding="utf-8")
from publish import open_ctx

URL = "http://127.0.0.1:5173/"

pw, ctx = open_ctx(headless=False)   # 有头模式，让 sw 正常注册
page = ctx.new_page()
logs = []
page.on("console", lambda m: logs.append((m.type, m.text[:140])))

print("① 在线加载，等 service worker 装好…")
page.goto(URL, timeout=60000, wait_until="domcontentloaded")
time.sleep(8)
sw = page.evaluate("""async () => {
  if (!('serviceWorker' in navigator)) return 'no-sw-api';
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? (reg.active ? 'active' : (reg.installing ? 'installing' : 'waiting')) : 'none';
}""")
print("   SW 状态:", sw)

cached = page.evaluate("""async () => {
  if (!('caches' in window)) return ['no-cache-api'];
  const keys = await caches.keys();
  const out = [];
  for (const k of keys) {
    const c = await caches.open(k);
    const reqs = await c.keys();
    out.push(k + ':' + reqs.length);
  }
  return out;
}""")
print("   缓存:", cached)

print("\n② 断网后重载…")
ctx.set_offline(True)
time.sleep(1)
try:
    page.reload(timeout=30000, wait_until="domcontentloaded")
    time.sleep(9)
except Exception as e:
    print("   重载异常:", str(e)[:100])

for _ in range(3):          # sw 接管时页面可能再跳一次，等稳
    try:
        page.wait_for_load_state("domcontentloaded", timeout=10000)
        break
    except Exception:
        time.sleep(3)
info = page.evaluate("""() => ({
    bodyLen: (document.body.innerText || '').length,
    hasBrand: !!document.getElementById('brand'),
    mode: (document.getElementById('brand-mode') || {}).textContent || '',
    title: document.title,
    firstWords: (document.body.innerText || '').slice(0, 120).replace(/\\s+/g, ' ')
})""")
print("   离线后：标题=%r 正文%d字 brand=%s mode=%r" %
      (info["title"], info["bodyLen"], info["hasBrand"], info["mode"]))
print("   首屏文字:", info["firstWords"][:100])
page.screenshot(path=r"C:\tmp\cet4_offline.png")

errs = [x for x in logs if x[0] == "error"]
print(f"\n   离线期间 console 错误 {len(errs)} 条:")
for t, m in errs[:6]:
    print("   ", m[:110])

ok = info["bodyLen"] > 200 and info["hasBrand"]
print("\n结论:", "✓ 断网可用" if ok else "✗ 断网不可用（白屏或壳没加载）")
ctx.set_offline(False)
ctx.close()
pw.stop()