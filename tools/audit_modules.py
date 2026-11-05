# -*- coding: utf-8 -*-
"""全模块体检：逐个视图点开，收集 console 报错 + 页面文本特征 + 关键按钮是否存在。
用法: python tools/audit_modules.py
产出: C:\tmp\cet4_audit\<view>.png + 打印报告
"""
import os
import sys
import time

sys.path.insert(0, r"C:\tmp\toutiao_v3")
sys.stdout.reconfigure(encoding="utf-8")
from publish import open_ctx

OUT = r"C:\tmp\cet4_audit"
os.makedirs(OUT, exist_ok=True)
BASE = "http://127.0.0.1:5173/"
VIEWS = ["home", "words", "listening", "reading", "translation", "writing", "stats", "settings"]

pw, ctx = open_ctx(headless=True)
page = ctx.new_page()
errors = []
page.on("console", lambda m: errors.append((m.type, m.text[:160])) if m.type in ("error", "warning") else None)
page.on("pageerror", lambda e: errors.append(("pageerror", str(e)[:200])))

page.goto(BASE, timeout=60000, wait_until="domcontentloaded")
time.sleep(6)

for v in VIEWS:
    errors.clear()
    # nav 用 data-view，首页卡片用 data-go，两种都试
    ok = page.evaluate("""(v) => {
        const el = document.querySelector(`[data-view="${v}"]`) || document.querySelector(`[data-go="${v}"]`);
        if (!el) return false;
        el.click(); return true;
    }""", v)
    time.sleep(2.2)
    info = page.evaluate("""() => ({
        title: (document.querySelector('#title') || {}).textContent || '',
        h1: (document.querySelector('h1,h2') || {}).textContent || '',
        textLen: (document.body.innerText || '').length,
        buttons: [...document.querySelectorAll('button')].map(b => (b.innerText||'').trim()).filter(Boolean).slice(0, 10),
        inputs: document.querySelectorAll('input,textarea,select').length,
        emptyHint: /暂无|没有|空|加载|出错了|undefined|null|NaN/.test(document.body.innerText || '')
    })""")
    page.screenshot(path=os.path.join(OUT, f"{v}.png"))
    flag = "!" if (errors or not ok) else " "
    print(f"{flag} {v:12} 点击={ok} 正文{info['textLen']:5}字 控件{info['inputs']:2}个 "
          f"按钮={info['buttons'][:4]}")
    if errors:
        for t, m in errors[:3]:
            print(f"     [{t}] {m}")
    if info["emptyHint"]:
        print(f"     ⚠ 页面出现 暂无/加载/undefined 之类字样")
ctx.close()
pw.stop()
print(f"\n截图在 {OUT}")