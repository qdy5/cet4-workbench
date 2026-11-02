# -*- coding: utf-8 -*-
"""把 5 组听力对话用 edge-tts 合成为 MP3，并记录每句起始时间。"""
import asyncio, io, json, os, subprocess, sys, tempfile
import edge_tts

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = r'C:\Users\twe19\Desktop\CET4学习工作台'
AUDIO = os.path.join(ROOT, 'audio')
os.makedirs(AUDIO, exist_ok=True)
FFMPEG = r'C:\Users\twe19\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-full_build\bin\ffmpeg.exe'
FFPROBE = FFMPEG.replace('ffmpeg.exe', 'ffprobe.exe')
VOICES = ['en-US-AriaNeural', 'en-US-GuyNeural', 'en-US-JennyNeural']
SIL = 0.35


def dur(path):
    r = subprocess.run([FFPROBE, '-v', 'error', '-show_entries', 'format=duration',
                        '-of', 'default=nw=1:nk=1', path], capture_output=True, text=True)
    return float(r.stdout.strip())


async def synth(text, voice, out):
    c = edge_tts.Communicate(text, voice, rate='-5%')
    await c.save(out)


def main():
    data = json.load(open(os.path.join(ROOT, 'data', 'listening.json'), encoding='utf-8'))
    silence = os.path.join(tempfile.gettempdir(), 'sil.mp3')
    subprocess.run([FFMPEG, '-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono',
                    '-t', str(SIL), '-q:a', '9', silence], capture_output=True)

    for item in data:
        tmp = tempfile.mkdtemp()
        speakers = []
        for l in item['lines']:
            if l['sp'] not in speakers:
                speakers.append(l['sp'])
        vmap = {sp: VOICES[i % len(VOICES)] for i, sp in enumerate(speakers)}
        parts, times, t = [], [], 0.0
        for i, l in enumerate(item['lines']):
            p = os.path.join(tmp, f'{i}.mp3')
            asyncio.run(synth(l['en'], vmap[l['sp']], p))
            times.append(round(t, 2))
            t += dur(p) + SIL
            parts.append(p)
            parts.append(silence)
        lst = os.path.join(tmp, 'list.txt')
        with open(lst, 'w', encoding='utf-8') as f:
            for p in parts:
                f.write("file '%s'\n" % p.replace('\\', '/'))
        out = os.path.join(AUDIO, f"listen_{item['id']}.mp3")
        subprocess.run([FFMPEG, '-y', '-f', 'concat', '-safe', '0', '-i', lst,
                        '-codec:a', 'libmp3lame', '-b:a', '64k', '-ac', '1', out],
                       capture_output=True)
        item['times'] = times
        print(f"listen_{item['id']}.mp3  {dur(out):.1f}s  {os.path.getsize(out)//1024}KB  lines={len(times)}")

    json.dump(data, open(os.path.join(ROOT, 'data', 'listening.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('listening.json updated with times')


main()
