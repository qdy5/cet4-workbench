# CET4 学习工作台

一个给自己用的四级备考工作台：单词、听力、阅读、翻译、写作、数据统计。
两套形态，共用一份内容：

- **桌面版**：Flask + SQLite，带本地 AI 答疑（Ollama qwen2.5:1.5b），进度存在数据库里。
- **离线版（手机）**：纯静态 PWA，放在 `docs/`，进度存在浏览器 localStorage，装到桌面后断网也能用。

在线版：<https://qdy5.github.io/cet4-workbench/>

## 功能

| 模块 | 内容 |
|---|---|
| 单词 | 4,559 词，选择题猜意思；答对推后 1/2/4/7/15/30 天，答错明天重来；带音标、例句、真人发音（缺音频时用浏览器 TTS） |
| 听力 | 5 组对话，逐句朗读 + 高亮，原文可隐藏，选择题带解析 |
| 阅读 | 4 篇 CET4 题材文章，重点词、计时、20 题带解析 |
| 翻译 | 10 句汉译英，参考译文 + 关键词命中率 + 句型提示 |
| 写作 | 6 篇（议论文/图表/书信），倒计时、词数、提纲、范文 |
| 答疑（仅桌面版） | 本地 Ollama 跑 qwen2.5:1.5b，回答语法和用法问题，不联网 |

考试信息按 2026-12-01、目标 450 分写死在 [docs/app.js](docs/app.js) 和 [app.py](app.py) 里，改这两处即可。

## 桌面版

```bash
pip install flask requests
python app.py          # http://127.0.0.1:5173
```

本地答疑需要先装好 Ollama 并拉过模型：

```bash
ollama pull qwen2.5:1.5b
ollama serve
```

## 离线版

`docs/` 是完整的静态站点，直接用任意静态服务器打开即可：

```bash
cd docs && python -m http.server 8765
```

部署到 GitHub Pages：仓库 Settings → Pages → Branch 选 `main`、目录选 `/docs`。

手机浏览器打开后「添加到主屏幕」，首次加载完会由 service worker 缓存，之后断网可用。

## 数据与构建

```
data/words.json       合并后的词库
data/highfreq.json    本地整理的高频词（带搭配）
data/detail.json      音标 / 例句 / 中文翻译 / 音频地址（构建产物，不入库）
data/reading.json     4 篇文章 + 题目
docs/data/*.json      离线版用的同源数据
```

重新构建：

```bash
python prepare_data.py      # 合并词库 + 生成 reading.json
python fetch_examples.py    # 用有道补音标和双语例句（可重复跑，已抓过的跳过）
python build_static.py      # 生成 docs/data
```

外部依赖：`C:\tmp\cet4_github.txt`（大纲词表）、`C:\tmp\cet4_qwerty.json`（音标兜底）。
缺了会退化成只用本地词库，不会崩。

## 说明

- 词库和阅读素材来自自有整理 + 开源词表（KyleBing/english-vocabulary、qwerty-learner）；音标和例句抓自公开词典接口，仅供个人学习使用。
- 桌面版数据库文件 `workbench.db` 不入库，删掉会重建并重新排复习计划。
