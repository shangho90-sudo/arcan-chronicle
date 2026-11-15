"""한약사 2차 스킬 효과음 5개를 합성한다 (numpy + scipy, ffmpeg로 MP3). 2026-11-16 '본초 도사'.

Usage:  python3 tools/audio/herbal_sfx.py   ->  assets/audio/sfx_hb_{simmer,root,needle,resonance,bloom}.mp3  (+ /tmp/herbal_sfx/*.wav)

Runway 크레딧이 없어 직접 합성(시드 고정 — 다시 돌리면 같은 파일). 출처 assets/audio/herbalist-sfx-credits.json.
  hb_simmer     0.9 s  탕관이 보글보글 끓음: 낮은 물 울림 + 작은 거품 터짐 12개(무작위 음높이) + 약한 김 소리(백초 훈증진·제작)
  hb_root       0.6 s  뿌리가 땅을 뚫고 자람: 낮은 흙 울림 + 나무가 삐걱 늘어나는 소리(올라가는 공명) + 흙 알갱이(소환·청룡승근·황정지맥)
  hb_needle     0.25 s 가는 침이 휙 날아가 '팅': 높은 대역 잡음 휙 + 짧은 금속음 4.2·6.1 kHz(백호유침)
  hb_resonance  1.0 s  낮은 공명: 110·165 Hz 맥놀이 + 부드러운 종 여운(대주천·금강 약갑·백초귀원 응집)
  hb_bloom      1.2 s  빛의 꽃이 핌: 위로 펼쳐지는 화음 아르페지오(C·E·G·C) + 반짝임(백초귀원 흡수·신농백초원)
게임은 같은 소리를 짧게 반복하지 않음(js/herbal.js HERB.sfxGap), 음량은 js/io.js(hb_*).
"""
import os, subprocess, wave
import numpy as np
from scipy import signal
SR = 44100; ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); OUT = os.path.join(ROOT, 'assets', 'audio'); TMP = '/tmp/herbal_sfx'; os.makedirs(TMP, exist_ok=True)
rng = np.random.default_rng(1116)
def T(d): return np.arange(int(SR * d)) / SR
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'lowpass', fs=SR, output='sos'), x)
def place(buf, x, at, g=1.0):
    i = int(at * SR); n = min(len(x), len(buf) - i)
    if n > 0: buf[i:i + n] += x[:n] * g
def fade(x, a=0.005, b=0.05):
    n = len(x); t = np.arange(n) / SR; return x * np.minimum(1, t / a) * np.minimum(1, (n / SR - t) / b)

def simmer():
    d = 0.9; t = T(d); x = lp(rng.standard_normal(len(t)), 300) * 0.25 * (0.6 + 0.4 * np.sin(2 * np.pi * 3 * t))
    for k in range(12):
        at = rng.uniform(0.02, d - 0.12); f0 = rng.uniform(380, 900); dd = rng.uniform(0.03, 0.07); tt = T(dd)
        f = f0 * (1 + 0.8 * tt / dd); b = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / (dd * 0.35)); place(x, b, at, rng.uniform(0.35, 0.7))
    x += bp(rng.standard_normal(len(t)), 2500, 7000) * 0.05
    return fade(x / np.max(np.abs(x)), 0.02, 0.15)

def root():
    d = 0.6; t = T(d); x = lp(rng.standard_normal(len(t)), 180) * np.exp(-t / 0.25) * 1.2
    f = 140 + 260 * (t / d) ** 0.7; creak = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.25; creak = bp(creak, 200, 1600) * (np.exp(-((t - 0.22) / 0.13) ** 2))
    x += creak * 1.4
    for k in range(28):
        at = rng.uniform(0.04, 0.5); L = int(SR * rng.uniform(0.003, 0.009)); g = bp(rng.standard_normal(L), 1500, 5000) * np.hanning(L); place(x, g, at, rng.uniform(0.1, 0.3))
    return fade(x / np.max(np.abs(x)), 0.004, 0.12)

def needle():
    d = 0.25; t = T(d); x = np.zeros(len(t))
    w = bp(rng.standard_normal(len(t)), 3000, 9000) * np.exp(-((t - 0.05) / 0.03) ** 2) * 0.7; x += w
    for fq, g in ((4200, 0.6), (6100, 0.4), (8300, 0.2)): x += np.sin(2 * np.pi * fq * t) * np.exp(-np.maximum(0, t - 0.07) / 0.04) * (t > 0.07) * g
    return fade(x / np.max(np.abs(x)), 0.002, 0.05)

def resonance():
    d = 1.0; t = T(d); x = (np.sin(2 * np.pi * 110 * t) + 0.7 * np.sin(2 * np.pi * 111.5 * t) + 0.5 * np.sin(2 * np.pi * 165 * t)) * np.exp(-t / 0.5) * np.minimum(1, t / 0.08)
    for fq, g in ((880, 0.18), (1318.5, 0.12), (1760, 0.08)): x += np.sin(2 * np.pi * fq * t) * np.exp(-t / 0.4) * g
    return fade(x / np.max(np.abs(x)), 0.02, 0.2)

def bloom():
    d = 1.2; t = T(d); x = np.zeros(len(t))
    for i, fq in enumerate((523.25, 659.25, 783.99, 1046.5)):
        tt = T(d - i * 0.09); n = (np.sin(2 * np.pi * fq * tt) + 0.3 * np.sin(4 * np.pi * fq * tt)) * np.exp(-tt / 0.45) * np.minimum(1, tt / 0.01); place(x, n, i * 0.09, 0.5)
    for k in range(18):
        at = rng.uniform(0.1, 0.9); L = int(SR * 0.05); f = rng.uniform(3000, 6000); s = np.sin(2 * np.pi * f * np.arange(L) / SR) * np.exp(-np.arange(L) / SR / 0.012); place(x, s, at, 0.06)
    x += np.sin(2 * np.pi * 130.8 * t) * np.exp(-t / 0.6) * 0.3
    return fade(x / np.max(np.abs(x)), 0.005, 0.25)

def save(name, x):
    wav = os.path.join(TMP, name + '.wav'); mp3 = os.path.join(OUT, 'sfx_' + name + '.mp3')
    y = (np.clip(x, -1, 1) * 0.89 * 32767).astype(np.int16)
    with wave.open(wav, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '128k', mp3], check=True)
    print('wrote', mp3, os.path.getsize(mp3))

if __name__ == '__main__':
    for n, f in (('hb_simmer', simmer), ('hb_root', root), ('hb_needle', needle), ('hb_resonance', resonance), ('hb_bloom', bloom)): save(n, f())
