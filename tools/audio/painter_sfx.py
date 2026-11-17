"""화가 2차 스킬 효과음 10개를 합성한다 (numpy + scipy, ffmpeg로 MP3). 2026-11-16 '그린 그림을 현실로'.

Usage:  python3 tools/audio/painter_sfx.py   ->  assets/audio/sfx_pt_*.mp3  (+ /tmp/painter_sfx/*.wav)

Runway 크레딧이 없어 직접 합성(시드 고정 — 다시 돌리면 같은 파일). 출처 assets/audio/painter-sfx-credits.json.
  pt_sketch  0.7 s  종이 펼침(바스락) + 붓이 빠르게 스치는 소리 두 번 + 마지막 콕(그림 소환·궁극기 준비)
  pt_brush   0.4 s  굵은 붓이 넓게 휩쓰는 소리(낮은 대역 잡음이 커졌다 줄어듦) + 젖은 끈적임(임파스토·기사 베기)
  pt_wash    0.8 s  물감이 번지는 소리: 부드러운 물결 + 작은 물방울(워터컬러·풍경 그리기)
  pt_dot     0.12 s 붓끝 톡(짧은 나무·물 소리, 점묘)
  pt_mix     0.7 s  팔레트를 휘젓는 끈적한 소리 + 꽃 피는 화음(팔레트 퓨전·스펙트럼 걸작)
  pt_ink     0.6 s  먹물이 터지며 번짐(낮은 철퍽 + 퍼지는 쉬익, 화룡점정 숨결·점묘 마무리)
  pt_frame   0.9 s  액자에서 걸어 나옴: 나무 액자 '똑' + 낮은 금빛 울림(만상갤러리)
  pt_fold    0.5 s  종이가 접히고 펴지는 소리(종이학·성벽)
  pt_bolt    0.5 s  번개: 날카로운 딱 + 짧은 우르릉(뇌운)
  pt_bite    0.2 s  먹 늑대가 무는 짧은 소리·용 관통(어두운 탁 + 잡음)
2026-11-17 fx2: Runway 로 다시 만드는 스크립트는 tools/audio/painter_runway_sfx.py — 이 파일은 그 전까지의 임시 합성(새 8개 pt_sigil·pt_twinkle·pt_howl·pt_roar·pt_flap·pt_clank·pt_splash·pt_bloom 포함).
  Usage 바뀜: 인자 없이 = 새 8개만, --force = 18개 모두(Runway 로 받은 것도 덮어씀), 이름… = 그것만.
게임은 같은 소리를 짧게 반복하지 않음(js/painter.js PAINT.sfxGap), 음량은 js/io.js(pt_*).
"""
import os, subprocess, wave
import numpy as np
from scipy import signal
SR = 44100; ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); OUT = os.path.join(ROOT, 'assets', 'audio'); TMP = '/tmp/painter_sfx'; os.makedirs(TMP, exist_ok=True)
rng = np.random.default_rng(1617)
def T(d): return np.arange(int(SR * d)) / SR
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'lowpass', fs=SR, output='sos'), x)
def place(buf, x, at, g=1.0):
    i = int(at * SR); n = min(len(x), len(buf) - i)
    if n > 0: buf[i:i + n] += x[:n] * g
def fade(x, a=0.005, b=0.05):
    n = len(x); t = np.arange(n) / SR; return x * np.minimum(1, t / a) * np.minimum(1, (n / SR - t) / b)
def norm(x): return x / (np.max(np.abs(x)) or 1)
def swish(d, lo, hi, peak):
    t = T(d); return bp(rng.standard_normal(len(t)), lo, hi) * np.exp(-((t - peak) / (d * 0.28)) ** 2)
def crinkle(d, n):
    t = T(d); x = np.zeros(len(t))
    for k in range(n):
        at = rng.uniform(0, d - 0.02); L = int(SR * rng.uniform(0.002, 0.008)); place(x, bp(rng.standard_normal(L), 2000, 8000) * np.hanning(L), at, rng.uniform(0.2, 0.6))
    return x
def tap(f, d=0.06):
    t = T(d); return np.sin(2 * np.pi * f * t) * np.exp(-t / 0.012) + bp(rng.standard_normal(len(t)), 800, 3000) * np.exp(-t / 0.006) * 0.5

def sketch():
    d = 0.7; x = crinkle(d, 26) * 0.5
    place(x, swish(0.16, 1200, 5000, 0.08), 0.06, 0.8); place(x, swish(0.14, 1500, 6000, 0.07), 0.2, 0.7); place(x, tap(900), 0.34, 0.9)
    return fade(norm(x), 0.004, 0.12)
def brush():
    d = 0.4; t = T(d); x = swish(d, 250, 2200, 0.16) * 1.4 + bp(rng.standard_normal(len(t)), 80, 300) * np.exp(-((t - 0.16) / 0.08) ** 2) * 0.8
    x += np.sin(2 * np.pi * 70 * t) * np.exp(-np.maximum(0, t - 0.15) / 0.06) * (t > 0.15) * 0.3
    return fade(norm(x), 0.01, 0.1)
def wash():
    d = 0.8; t = T(d); x = lp(rng.standard_normal(len(t)), 900) * (0.5 + 0.5 * np.sin(2 * np.pi * 2.2 * t)) * np.exp(-t / 0.5) * 0.7
    for k in range(9):
        at = rng.uniform(0.05, 0.6); dd = rng.uniform(0.03, 0.06); tt = T(dd); f = rng.uniform(600, 1400) * (1 + 1.2 * tt / dd); place(x, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / (dd * 0.3)), at, rng.uniform(0.2, 0.4))
    return fade(norm(x), 0.03, 0.2)
def dot():
    x = tap(1200, 0.12) + tap(2400, 0.12) * 0.3; return fade(norm(x), 0.001, 0.04)
def mix():
    d = 0.7; t = T(d); x = lp(rng.standard_normal(len(t)), 500) * (0.5 + 0.5 * np.sin(2 * np.pi * 7 * t)) * np.exp(-t / 0.4) * 0.6
    for i, fq in enumerate((392.0, 493.9, 587.3, 784.0)):
        tt = T(d - 0.3 - i * 0.06); place(x, np.sin(2 * np.pi * fq * tt) * np.exp(-tt / 0.25) * np.minimum(1, tt / 0.01), 0.3 + i * 0.06, 0.35)
    return fade(norm(x), 0.01, 0.15)
def ink():
    d = 0.6; t = T(d); x = lp(rng.standard_normal(len(t)), 220) * np.exp(-t / 0.12) * 1.2 + np.sin(2 * np.pi * 60 * t) * np.exp(-t / 0.15) * 0.6
    x += bp(rng.standard_normal(len(t)), 1500, 6000) * np.exp(-((t - 0.2) / 0.15) ** 2) * 0.35
    return fade(norm(x), 0.003, 0.15)
def frame():
    d = 0.9; t = T(d); x = np.zeros(len(t)); place(x, tap(520, 0.1), 0.0, 1.0)
    x += (np.sin(2 * np.pi * 196 * t) + 0.6 * np.sin(2 * np.pi * 294 * t) + 0.3 * np.sin(2 * np.pi * 588 * t)) * np.exp(-t / 0.4) * np.minimum(1, t / 0.05) * 0.5
    for k in range(10):
        at = rng.uniform(0.1, 0.7); L = int(SR * 0.04); place(x, np.sin(2 * np.pi * rng.uniform(2500, 5000) * np.arange(L) / SR) * np.exp(-np.arange(L) / SR / 0.01), at, 0.05)
    return fade(norm(x), 0.002, 0.2)
def fold():
    d = 0.5; x = crinkle(d, 34) * 0.7; place(x, swish(0.2, 600, 3000, 0.1), 0.15, 0.6); place(x, tap(300, 0.08), 0.32, 0.5)
    return fade(norm(x), 0.004, 0.1)
def bolt():
    d = 0.5; t = T(d); x = bp(rng.standard_normal(len(t)), 2000, 9000) * np.exp(-t / 0.01) * 1.5
    x += lp(rng.standard_normal(len(t)), 160) * np.exp(-t / 0.18) * np.minimum(1, t / 0.02) * 1.2
    return fade(norm(x), 0.001, 0.12)
def bite():
    d = 0.2; t = T(d); x = lp(rng.standard_normal(len(t)), 900) * np.exp(-t / 0.03) + np.sin(2 * np.pi * 110 * t) * np.exp(-t / 0.04) * 0.6
    return fade(norm(x), 0.001, 0.05)

def save(name, x):
    wav = os.path.join(TMP, name + '.wav'); mp3 = os.path.join(OUT, 'sfx_' + name + '.mp3')
    y = (np.clip(x, -1, 1) * 0.89 * 32767).astype(np.int16)
    with wave.open(wav, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '128k', mp3], check=True)
    print('wrote', mp3, os.path.getsize(mp3))

# ---- fx2(2026-11-17) 그림용 새 소리 8개의 임시 합성(Runway tools/audio/painter_runway_sfx.py --run 이 같은 이름으로 대체). 자기 난수(r2)라 위 10개는 그대로.
r2 = np.random.default_rng(1117)
def chime(fs, d, decay=0.35, gap=0.05, g=0.4):
    t = T(d); x = np.zeros(len(t))
    for i, fq in enumerate(fs):
        tt = T(d - i * gap); place(x, (np.sin(2 * np.pi * fq * tt) + 0.3 * np.sin(4 * np.pi * fq * tt)) * np.exp(-tt / decay) * np.minimum(1, tt / 0.005), i * gap, g)
    return x
def sigil():
    d = 1.2; t = T(d); x = chime((523.3, 659.3, 784.0, 1046.5, 1318.5), d, 0.5, 0.09) + bp(r2.standard_normal(len(t)), 3000, 9000) * np.minimum(1, t / 0.6) * np.exp(-np.maximum(0, t - 0.6) / 0.2) * 0.15
    return fade(norm(x), 0.02, 0.3)
def twinkle():
    return fade(norm(chime((1568.0, 2093.0, 2637.0, 3136.0), 0.6, 0.12, 0.06, 0.4)), 0.002, 0.15)
def howl():
    d = 1.2; t = T(d); f = 380 + 180 * np.sin(np.pi * np.minimum(1, t / 0.9)); x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.15) * np.exp(-np.maximum(0, t - 0.7) / 0.18)
    x += 0.3 * np.sin(4 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.15) * np.exp(-np.maximum(0, t - 0.7) / 0.18) + lp(r2.standard_normal(len(t)), 1500) * 0.1
    return fade(norm(x), 0.05, 0.25)
def roar():
    d = 1.4; t = T(d); x = lp(r2.standard_normal(len(t)), 400) * (0.6 + 0.4 * np.sin(2 * np.pi * 23 * t)) * np.minimum(1, t / 0.1) * np.exp(-t / 0.6) * 1.2
    x += np.sin(2 * np.pi * np.cumsum(90 - 30 * t) / SR) * np.exp(-t / 0.5) * 0.6 + bp(r2.standard_normal(len(t)), 800, 4000) * np.exp(-((t - 0.5) / 0.3) ** 2) * 0.3
    return fade(norm(x), 0.02, 0.3)
def flap():
    d = 0.6; t = T(d); x = np.zeros(len(t))
    for k in range(5): place(x, bp(r2.standard_normal(int(SR * 0.07)), 500, 3500) * np.hanning(int(SR * 0.07)), 0.05 + k * 0.1, 0.8)
    return fade(norm(x), 0.004, 0.1)
def clank():
    d = 0.8; t = T(d); x = np.zeros(len(t)); place(x, tap(260, 0.15), 0.0, 1.0); place(x, tap(330, 0.12), 0.12, 0.8)
    x += chime((392.0, 587.3, 784.0), d, 0.3, 0.05, 0.3)
    return fade(norm(x), 0.002, 0.2)
def splash():
    d = 0.6; t = T(d); x = lp(r2.standard_normal(len(t)), 1800) * np.exp(-t / 0.12)
    for k in range(6):
        at = r2.uniform(0.03, 0.4); dd = 0.05; tt = T(dd); f = r2.uniform(700, 1500) * (1 + tt / dd); place(x, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.015), at, 0.3)
    return fade(norm(x), 0.002, 0.15)
def bloom():
    d = 1.0; t = T(d); x = chime((392.0, 523.3, 659.3, 784.0, 1046.5), d, 0.4, 0.1, 0.35) + bp(r2.standard_normal(len(t)), 400, 2500) * np.exp(-((t - 0.3) / 0.2) ** 2) * 0.2
    return fade(norm(x), 0.01, 0.25)
NEW = (('pt_sigil', sigil), ('pt_twinkle', twinkle), ('pt_howl', howl), ('pt_roar', roar), ('pt_flap', flap), ('pt_clank', clank), ('pt_splash', splash), ('pt_bloom', bloom))
OLD = (('pt_sketch', sketch), ('pt_brush', brush), ('pt_wash', wash), ('pt_dot', dot), ('pt_mix', mix), ('pt_ink', ink), ('pt_frame', frame), ('pt_fold', fold), ('pt_bolt', bolt), ('pt_bite', bite))

if __name__ == '__main__':
    import sys
    # 기본: 새 8개만(Runway 로 아직 대체하지 않은 것) — Runway 로 바꾼 파일을 덮어쓰지 않게. --force = 예전 10개까지 모두 다시.
    want = sys.argv[1:]
    for n, f in (OLD + NEW if '--force' in want else NEW):
        if want and '--force' not in want and n not in want: continue
        save(n, f())
