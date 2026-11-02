# CET4 学习工作台

给自己用的四级备考工作台：单词、听力、阅读、翻译、写作、数据。

两种用法，共用**同一份前端 + 同一份内容**：

| | 跑在哪 | 进度存哪 | 断网可用 |
|---|---|---|---|
| 本机版 | `python app.py` → http://127.0.0.1:5173 | 电脑上的 SQLite（`workbench.db`） | 可以（同一台电脑） |
| 离线版 | GitHub Pages / 任意静态服务器（`docs/`） | 浏览器 IndexedDB | 可以，装到主屏幕后**电脑关机也能用** |

在线地址：<https://qdy5.github.io/cet4-workbench/>

## 先看这里：它解决了什么

1. **复习排程用 FSRS-5，不是固定 7 盒**。答错 1 分钟后重来（不会当场又被抽到），答对按稳定度推 1 天到几个月，每天有 30 个新词额度。
2. **一套前端源码，两种后端**。`web/adapters/api.js` 走 Flask + SQLite，`web/adapters/local.js` 走静态 JSON + IndexedDB。视图层不知道自己在哪种模式下跑，所以两个版本不会悄悄分叉。
3. **统计口径只有一套**。所有练习写进事件流，连续天数、7 日曲线、模块正确率、薄弱词全部由事件派生——只背单词的日子也算活跃。
4. **离线版零外网请求**。词库、音频、图标全部随站点打包，Service Worker 预缓存整套资源，版本号带构建哈希，升级时会清旧缓存。
5. **日期按本地时区算**。不用 `toISOString()` 取日期，凌晨 0–8 点不会把今天算成昨天。

## 目录

```
web/                 唯一的前端源码（ES modules，无框架、无构建步骤）
  core/date.js       本地日期工具
  core/fsrs.js       FSRS-5 调度器（排程只在这里算）
  core/stats.js      事件流 → 统计
  core/scoring.js    翻译采分点 / 写作自查
  core/quiz.js       选择题选项组装
  adapters/          api.js（Flask）/ local.js（IndexedDB）/ idb.js
  views/             8 个页面
app.py               本机服务：发内容、存进度、流式接本地模型
docs/                构建产物，GitHub Pages 直接托管这一层
data/                内容源（词表、阅读、听力、翻译、写作、meta.json）
  details.json       音标/例句，构建时并进 info.json
audio/               听力 mp3（构建时复制进 docs/audio）
tools/enrich.py      内容整形：干扰项、拆包、音频路径
tools/verify.py      一键验收
tools/gen_content.py 用本地模型批量补阅读/翻译/写作（可选）
tests/js/            node --test：日期、FSRS、统计、评分 + jsdom 端到端
tests/py/            接口测试（临时数据库，不碰真实进度）
```

## 本机版

```bash
pip install -r requirements.txt
python app.py            # 或双击 启动.bat
```

答疑用本机 Ollama（可选）：

```bash
ollama pull qwen2.5:1.5b  # 机器够力就换 7b，模型名可在 设置 页调整
ollama serve
```

没装也能用，只是「让 AI 点评」按钮会提示连不上。

## 离线版 / 部署

```bash
python build_static.py      # 产出 docs/
cd docs && python -m http.server 8765   # 本地预览
```

部署到 GitHub Pages：仓库 Settings → Pages → Branch 选 `main`、目录选 `/docs`。

如果本机到 `github.com:443` 连不上（git push 超时）但 `api.github.com` 能通，用 API 提交：

```bash
git add -A && git commit -m "..."
python tools/publish_api.py "提交说明"    # blob → tree → commit → 更新 main
```
推到 `main` 之后 `docs/` 就是线上版本；手机打开后「添加到主屏幕」，首次加载完即可断网使用。

## 手机和电脑之间搬进度

设置页 →「导出进度」得到一个 JSON，另一台设备「导入合并」。
合并规则：同一次答题不重复计，单词卡取复习次数多的那份。

## 验收

```bash
python tools/verify.py
```

跑 JS 测试（含 jsdom 里的端到端：打开 → 背单词 → 落库）、接口测试、重新构建，再审计产物：
预缓存清单是否齐全、静态包有没有外网依赖、干扰项是否合法且长度对齐、参考译文能否命中全部采分点、
前端有没有退回 localStorage / UTC 日期。任何一条不过都算没交付。

```bash
node tools/check_live.mjs                  # 发布后冒烟：拉线上站点跑一遍，查音标/选项/落库/站外请求
node --test                                # 只跑前端逻辑测试
python -m unittest discover -s tests/py     # 只跑接口测试
```

## 内容怎么改

- 考试日期、目标分、新词上限、保持率：`data/meta.json`（改一处，两端同步）
- 单词表：`data/words.json`；音标例句：`data/details.json`
- 阅读/听力/翻译/写作：`data/*.json`，改完跑 `python build_static.py`
- 听力音频：`audio/listen_<id>.mp3`，重新生成用 `python tools/generate_audio.py`（需要 `pip install edge-tts` 和 ffmpeg）

## 已知取舍

- 干扰项按**词性 + 释义长度 + 共用汉字**在构建期生成，不是语义模型选的；偶尔会出现「一眼能排除」的选项，但不会再出现「正确答案总是最短」的破绽。
- 翻译只看**采分点覆盖 + 硬检查**（中文残留、a/an、标点、长度、重复词），不合成一个假分数；真要有人评语得点「让 AI 点评」（仅本机版）。
- 静态版没有 AI 点评：浏览器里跑不了模型，不假装能跑。
- 听力是本机合成的对话（edge-tts），不是真题原声，练的是句子理解不是口音适应。
- 单词发音用系统 TTS；原先抓的那批外链发音地址已经 502，全部弃用。

## 词库来源

自有整理的高频词 + 开源词表（KyleBing/english-vocabulary、qwerty-learner），音标和例句抓自公开词典接口，仅供个人学习。
