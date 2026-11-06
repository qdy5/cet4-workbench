# -*- coding: utf-8 -*-
"""移动端外观检查：iPhone 尺寸下逐屏截图，看有没有溢出/挤压/需要横向滚动。
用法: python tools/test_mobile.py
"""
import os
import sys
import time

sys.path.insert(0, r"C:\tmp\toutiao_v3")
sys.stdout.reconfigure(encoding="utf-8")
from publish import open_ctx

OUT = r"C:\tmp\cet4_mobile"
os.makedirs(OUT, exist_ok=True)
VIEWS = ["home", "words", "reading", "settings"]

pw, ctx = open_ctx(headless=True)
page = ctx.new_page()
page.set_viewport_size({"width": 390, "height": 844})
page.goto("http://127.0.0.1:5173/", timeout=60000, wait_until="domcontentloaded")
time.sleep(6)

for v in VIEWS:
    page.evaluate("""(v) => {
        const el = document.querySelector(`[data-view="${v}"]`) || document.querySelector(`[data-go="${v}"]`);
        if (el) el.click();
    }""", v)
    time.sleep(2)
    m = page.evaluate("""() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
        bodyH: document.body.scrollHeight,
        // 找出横向溢出的元素
        overflow: [...document.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 2)
            .slice(0, 5).map(e => (e.tagName + '.' + (e.className||'').toString().split(' ')[0]).slice(0, 40))
    })""")
    page.screenshot(path=os.path.join(OUT, f"{v}_390.png"), full_page=True)
    bad = "!" if m["scrollW"] > m["clientW"] + 2 else " "
    print(f"{bad} {v:10} 视口{m['clientW']} 内容宽{m['scrollW']} 高{m['bodyH']:4} 溢出元素={m['overflow']}")
ctx.close()
pw.stop()
print(f"\n截图: {OUT}")