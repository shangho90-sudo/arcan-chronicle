"""한약사 처방 5종(2026-11-20) 효과음 7개를 합성한다 (numpy + scipy, ffmpeg로 MP3). 시드 고정 — 다시 돌리면 같은 파일.

Usage:  python3 tools/audio/herbal2_sfx.py [이름…]   ->  assets/audio/sfx_<이름>.mp3  (+ /tmp/herbal2_sfx/*.wav)
  (인자 없이 = 아래 7개 모두. 예전 tools/audio/herbal_sfx.py 는 Runway 소리를 덮어쓰니 돌리지 말 것)
  hb_pour   0.7 s 탕관에서 두 잔에 따름: 물 졸졸 두 번 + 도자기 잔 '딩' 두 번(탕약 나누기)
  hb_steam  1.0 s 금빛 김이 피어오름: 부드러운 바람 휙(위로 올라가는 필터) + 따뜻한 종 화음(보중익기탕 첫 회복)
  hb_leaf   0.6 s 잎이 바깥으로 확 퍼짐: 낮은 '훅' + 잎 바스락 알갱이 + 짧은 바람(구풍해독탕)
  hb_tak    0.14 s 맥 마디 '탁': 마른 나무 두드림 + 짧은 높은 딸깍(소경활혈탕 1·2마디)
  hb_node   0.7 s 마지막 마디가 크게 풀림: 낮은 '쿵' + '탁' + 붉은 종 여운(소경활혈탕 3마디)
  hb_seal   0.5 s 약인 다섯이 찍힘: 종이 펄럭 + 도장 '톡' 다섯 + 물방울(오령산 시작)
  hb_surge  0.9 s 물길이 한 점에서 만나 솟음: 모여드는 물소리(높아짐) + 철썩 + 물보라(오령산 마지막 물결)
음량은 js/io.js(hb_*), 출처 assets/audio/herbalist-sfx-credits.json synthesized2.
"""
import os, subprocess, sys, wave
import numpy as np
from scipy import signal
SR = 44100; ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); OUT = os.path.join(ROOT, 'assets', 'audio'); TMP = '/tmp/herbal2_sfx'; os.makedirs(TMP, exist_ok=True)
def T(d): return np.arange(int(SR * d)) / SR
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'lowpass', fs=SR, output='sos'), x)
def place(buf, x, at, g=1.0):
    i = int(at * SR); n = min(len(x), len(buf) - i)
    if n > 0: buf[i:i + n] += x[:n] * g
def fade(x, a=0.005, b=0.05):
    n = len(x); t = np.arange(n) / SR; return x * np.minimum(1, t / max(a, 1e-4)) * np.minimum(1, (n / SR - t) / b)
def norm(x): return x / (np.max(np.abs(x)) + 1e-9)
def ding(f, d, tau, g=1.0): t = T(d); return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) + 0.15 * np.sin(2 * np.pi * f * 5.4 * t)) * np.exp(-t / tau) * np.minimum(1, t / 0.002) * g

def pour(rng):
    d = 0.7; x = np.zeros(len(T(d)))
    for at in (0.02, 0.24):
        L = 0.18; t = T(L); w = bp(rng.standard_normal(len(t)), 500, 2400) * (0.5 + 0.5 * np.sin(2 * np.pi * 22 * t)) * np.hanning(len(t)) * 0.6
        for k in range(8): bt = T(0.03); b = np.sin(2 * np.pi * np.cumsum(rng.uniform(600, 1100) * (1 + bt / 0.03)) / SR) * np.exp(-bt / 0.01); place(w, b, rng.uniform(0, L - 0.03), 0.4)
        place(x, w, at); place(x, ding(2350 if at < 0.1 else 2640, 0.4, 0.12), at + 0.17, 0.35)
    return fade(norm(x), 0.004, 0.15)

def steam(rng):
    d = 1.0; t = T(d); n = rng.standard_normal(len(t)); env = np.sin(np.pi * np.minimum(1, t / d)) ** 1.5
    fc = 600 + 2600 * (t / d); y = np.zeros(len(t))
    for i in range(0, len(t), 512): y[i:i + 512] = bp(n[i:i + 512], max(200, fc[i] * 0.6), min(15000, fc[i] * 1.6), 1)
    x = y * env * 0.5
    for i, f in enumerate((523.25, 659.25, 783.99, 1046.5)): place(x, ding(f, 0.8, 0.35, 0.22), 0.08 + i * 0.07)
    return fade(norm(x), 0.03, 0.25)

def leaf(rng):
    d = 0.6; t = T(d); x = lp(rng.standard_normal(len(t)), 200) * np.exp(-t / 0.08) * 1.6
    x += bp(rng.standard_normal(len(t)), 900, 4000) * np.exp(-((t - 0.12) / 0.09) ** 2) * 0.5
    for k in range(40):
        at = rng.uniform(0.03, 0.45); L = int(SR * rng.uniform(0.004, 0.012)); g = bp(rng.standard_normal(L), 2500, 8000) * np.hanning(L); place(x, g, at, rng.uniform(0.15, 0.4))
    return fade(norm(x), 0.002, 0.15)

def tak(rng):
    d = 0.14; t = T(d); x = np.sin(2 * np.pi * 820 * t) * np.exp(-t / 0.018) * 0.9 + bp(rng.standard_normal(len(t)), 1500, 6000) * np.exp(-t / 0.006) * 0.8
    x += np.sin(2 * np.pi * 3300 * t) * np.exp(-t / 0.01) * 0.25
    return fade(norm(x), 0.001, 0.04)

def node(rng):
    d = 0.7; t = T(d); x = np.sin(2 * np.pi * 70 * t * (1 - 0.3 * t)) * np.exp(-t / 0.16) * 1.2
    place(x, tak(rng), 0.0, 0.8)
    x += bp(rng.standard_normal(len(t)), 300, 3000) * np.exp(-t / 0.05) * 0.4
    for f, g in ((392, 0.25), (587.3, 0.18), (784, 0.1)): place(x, ding(f, 0.6, 0.25, g), 0.02)
    return fade(norm(x), 0.002, 0.2)

def seal(rng):
    d = 0.5; t = T(d); x = bp(rng.standard_normal(len(t)), 400, 2500) * np.exp(-((t - 0.04) / 0.04) ** 2) * 0.5
    for i in range(5):
        at = 0.08 + i * 0.055; st = T(0.06); s = (np.sin(2 * np.pi * 300 * st) * np.exp(-st / 0.012) + bp(rng.standard_normal(len(st)), 800, 3000) * np.exp(-st / 0.005)); place(x, s, at, 0.6)
        dt = T(0.08); f = 900 + 900 * (dt / 0.08); dr = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-dt / 0.02); place(x, dr, at + 0.02, 0.3)
    return fade(norm(x), 0.002, 0.1)

def surge(rng):
    d = 0.9; t = T(d); n = rng.standard_normal(len(t)); y = np.zeros(len(t))
    for i in range(0, len(t), 512): f = 400 + 2000 * min(1, t[i] / 0.45); y[i:i + 512] = bp(n[i:i + 512], f * 0.5, f * 1.5, 1)
    x = y * np.minimum(1, t / 0.45) * (t < 0.5) * 0.6
    sp = T(0.4); sw = (lp(rng.standard_normal(len(sp)), 900) * 1.2 + bp(rng.standard_normal(len(sp)), 2000, 9000) * 0.6) * np.exp(-sp / 0.12); place(x, sw, 0.45)
    place(x, np.sin(2 * np.pi * 85 * sp) * np.exp(-sp / 0.1), 0.45, 0.8)
    return fade(norm(x), 0.01, 0.2)

ALL = dict(hb_pour=pour, hb_steam=steam, hb_leaf=leaf, hb_tak=tak, hb_node=node, hb_seal=seal, hb_surge=surge)
def save(name, x):
    wav = os.path.join(TMP, name + '.wav'); mp3 = os.path.join(OUT, 'sfx_' + name + '.mp3')
    y = (np.clip(x, -1, 1) * 0.89 * 32767).astype(np.int16)
    with wave.open(wav, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '128k', mp3], check=True)
    print('wrote', mp3, os.path.getsize(mp3))

if __name__ == '__main__':
    for i, (n, f) in enumerate(ALL.items()):
        if len(sys.argv) > 1 and n not in sys.argv[1:]: continue
        save(n, f(np.random.default_rng(1120 + i)))
