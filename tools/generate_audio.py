# -*- coding: utf-8 -*-
"""把听力对话用 edge-tts 合成为 MP3，并记录每句起始时间。

依赖：pip install edge-tts，并把 ffmpeg/ffprobe 放进 PATH（或设 CET4_FFMPEG）。
路径全部相对本仓库，换机器不用改代码。
"""
import asyncio
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, 'audio')
DATA = os.path.join(ROOT, 'data', 'listening.json')
VOICES = ['en-US-AriaNeural', 'en-US-GuyNeural', 'en-US-JennyNeural']
SIL = 0.35

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


def ffmpeg_bin(name):
    env = os.environ.get('CET4_FFMPEG')
    if env:
        return env if os.path.basename(env).lower().startswith(name) else os.path.join(os.path.dirname(env), name)
    found = shutil.which(name)
    if not found:
        sys.exit(f'找不到 {name}，先装 ffmpeg 或设置 CET4_FFMPEG 指向 ffmpeg.exe')
    return found


def dur(path):
    r = subprocess.run([ffmpeg_bin('ffprobe'), '-v', 'error', '-show_entries', 'format=duration',
                        '-of', 'default=nw=1:nk=1', path], capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


async def synth(text, voice, out):
    import edge_tts
    await edge_tts.Communicate(text, voice, rate='-5%').save(out)


def main():
    try:
        import edge_tts  # noqa: F401
    except ImportError:
        sys.exit('缺 edge-tts：pip install edge-tts')

    os.makedirs(AUDIO, exist_ok=True)
    data = json.load(open(DATA, encoding='utf-8'))
    silence = os.path.join(tempfile.gettempdir(), 'cet4-sil.mp3')
    subprocess.run([ffmpeg_bin('ffmpeg'), '-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono',
                    '-t', str(SIL), '-q:a', '9', silence], capture_output=True)

    for item in data:
        tmp = tempfile.mkdtemp()
        speakers = []
        for line in item['lines']:
            if line['sp'] not in speakers:
                speakers.append(line['sp'])
        vmap = {sp: VOICES[i % len(VOICES)] for i, sp in enumerate(speakers)}

        parts, times, t = [], [], 0.0
        for i, line in enumerate(item['lines']):
            p = os.path.join(tmp, f'{i}.mp3')
            asyncio.run(synth(line['en'], vmap[line['sp']], p))
            times.append(round(t, 2))
            t += dur(p) + SIL
            parts.extend([p, silence])

        lst = os.path.join(tmp, 'list.txt')
        with open(lst, 'w', encoding='utf-8') as f:
            for p in parts:
                f.write("file '%s'\n" % p.replace('\\', '/'))
        out = os.path.join(AUDIO, f"listen_{item['id']}.mp3")
        subprocess.run([ffmpeg_bin('ffmpeg'), '-y', '-f', 'concat', '-safe', '0', '-i', lst,
                        '-codec:a', 'libmp3lame', '-b:a', '64k', '-ac', '1', out], capture_output=True)
        item['times'] = times
        print(f"listen_{item['id']}.mp3  {dur(out):.1f}s  {os.path.getsize(out) // 1024}KB  lines={len(times)}")

    json.dump(data, open(DATA, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('listening.json 已更新 times，接着跑 python build_static.py')


if __name__ == '__main__':
    main()
