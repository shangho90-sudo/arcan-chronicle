"""대장장이 1차 스킬 효과음 16개를 합성한다 (numpy + scipy, ffmpeg로 MP3). 2026-11-13.

Usage:  python3 tools/audio/smith_sfx.py  ->  assets/audio/sfx_bs_*.mp3 (+ /tmp/smith_sfx/*.wav)

Runway 크레딧이 없어 tools/audio/smash_sfx.py와 같은 방식으로 직접 합성(시드 고정 — 다시 돌리면 같은 파일).
소리 정체성: 쇠망치가 쇠를 때리는 '깡'(모드 주파수가 어긋난 금속 공명), 집게 '철컥', 철판 펼침 '촤르륵-텅', 담금질 '치이익'.
  bs_swing       무거운 망치가 공기를 가르는 짧은 '후웅'
  bs_hit         망치 접촉: 짧은 쿵 + 금속 '깡'(짧게)
  bs_hit_heavy   마무리 내려찍기: 더 낮은 쿵 + 긴 금속 울림 + 돌가루
  bs_anvil       모루 착지: 아주 낮은 쿵 + 큰 모루 울림
  bs_anvil_ring  모루 충격파: 맑은 모루 '땡' (짧은 저음 없음)
  bs_tongs       집게가 닫힘: 두 번 겹친 '철컥'
  bs_quench      냉각수 끼얹기: 물 튀김
  bs_steam       수증기: 짧은 '치익'
  bs_steam3      3중첩 수증기: 더 크고 선명한 '치이익' + 높은 쉭 소리
  bs_wall        철판 펼침: 금속 마찰 '촤르륵' + '텅'
  bs_block       철벽이 막음: 둔탁한 '텅'
  bs_rivet       리벳 박기: 작은 '팅' 세 번
  bs_rivet_pop   리벳 튕겨 나감: 높은 '핑'
  bs_rivet_shot  리벳 발사: 빠른 '슉슉슉'
  bs_forge       용광로 개방: 불꽃 '화르륵' + 쇳물 떨어지는 지글
  bs_break       낙인 파괴: 금속 외피가 깨지는 '쨍그랑'
"""
import os, subprocess, wave
import numpy as np
from scipy import signal
SR = 44100; ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); OUT = os.path.join(ROOT, 'assets', 'audio'); TMP = '/tmp/smith_sfx'; os.makedirs(TMP, exist_ok=True)
rng = np.random.default_rng(1113)
def T(d): return np.arange(int(SR * d)) / SR
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'lowpass', fs=SR, output='sos'), x)
def hp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'highpass', fs=SR, output='sos'), x)
def noise(n): return rng.standard_normal(n)
def place(buf, x, at, g=1.0):
    i = int(at * SR); n = min(len(x), len(buf) - i)
    if n > 0: buf[i:i + n] += x[:n] * g
def fin(x, d):
    t = T(d); x = np.tanh(x * 1.1); x *= np.minimum(1, (d - t) / 0.05); return x / (np.max(np.abs(x)) + 1e-9)

def metal(t, base, decay, g=1.0, ratios=(1.0, 2.76, 5.40, 8.93), at=0.0):
    """inharmonic metal partials (free bar ratios), each decays faster the higher it is"""
    x = np.zeros(len(t)); u = np.maximum(0, t - at)
    for i, r in enumerate(ratios):
        x += np.sin(2 * np.pi * base * r * u + rng.uniform(0, 6.28)) * np.exp(-u / (decay / (1 + 0.6 * i))) * (0.8 ** i)
    return x * (t >= at) * g
def thud(t, f0, f1, dec, g=1.0, at=0.0):
    u = np.maximum(0, t - at); f = f1 + (f0 - f1) * np.exp(-u / 0.04); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-u / dec) * (t >= at) * g
def click(t, lo, hi, dec, g=1.0, at=0.0):
    u = np.maximum(0, t - at); return bp(noise(len(t)), lo, hi) * np.exp(-u / dec) * (t >= at) * g
def whoosh(d, fc0, fc1, peak, w=0.06, g=1.0):
    t = T(d); n = noise(len(t)); out = np.zeros(len(t)); B = 512; H = 128; win = np.hanning(B)
    for s in range(0, len(t) - B, H):
        u = (s + B / 2) / SR; fc = fc0 + (fc1 - fc0) * np.exp(-((u - peak) / (w * 2)) ** 2)
        out[s:s + B] += bp(n[s:s + B] * win, fc * 0.6, fc * 1.5) * win
    return out * (np.exp(-((t - peak) / w) ** 2) + 0.2 * np.exp(-((t - peak - 0.06) / 0.07) ** 2)) * g

def bs_swing():
    d = 0.3; t = T(d); x = whoosh(d, 220, 760, 0.09) + lp(noise(len(t)), 200) * np.exp(-((t - 0.09) / 0.06) ** 2) * 1.5
    return fin(x, d)
def bs_hit():
    d = 0.45; t = T(d); x = thud(t, 140, 60, 0.06, 0.9) + click(t, 900, 5000, 0.01, 1.4) + metal(t, 620, 0.16, 0.35)
    return fin(x, d)
def bs_hit_heavy():
    d = 0.9; t = T(d); x = thud(t, 110, 42, 0.11, 1.1) + click(t, 600, 6000, 0.016, 1.6) + metal(t, 410, 0.4, 0.45)
    g = np.zeros(len(t))
    for _ in range(30):
        at = 0.05 + rng.exponential(0.1); L = int(SR * rng.uniform(0.004, 0.01))
        if at < d - 0.05: place(g, noise(L) * np.exp(-np.arange(L) / (L * 0.3)), at, rng.uniform(0.3, 1) * np.exp(-at / 0.2))
    x += bp(g, 1500, 6000) * 0.35
    return fin(x, d)
def bs_anvil():
    d = 1.2; t = T(d); x = thud(t, 80, 34, 0.16, 1.3) + click(t, 300, 3000, 0.03, 1.2) + metal(t, 260, 0.7, 0.5, ratios=(1.0, 2.32, 4.25, 6.63))
    x += bp(noise(len(t)), 300, 1800) * np.exp(-t / 0.18) * 0.25
    return fin(x, d)
def bs_anvil_ring():
    d = 0.9; t = T(d); x = metal(t, 880, 0.45, 1.0, ratios=(1.0, 2.32, 4.25)) + click(t, 2000, 8000, 0.006, 0.8) + thud(t, 180, 90, 0.04, 0.3)
    return fin(x, d)
def bs_tongs():
    d = 0.4; t = T(d); x = np.zeros(len(t))
    for at, g in ((0.0, 1.0), (0.045, 0.75)):
        x += click(t, 1500, 7000, 0.006, 1.6 * g, at) + metal(t, 1650, 0.05, 0.4 * g, at=at) + thud(t, 300, 160, 0.025, 0.4 * g, at)
    return fin(x, d)
def splash_layer(t, dec, g):
    x = bp(noise(len(t)), 600, 5000) * np.exp(-t / dec) * np.minimum(1, t / 0.008)
    dr = np.zeros(len(t))
    for _ in range(26):
        at = rng.uniform(0.01, 0.25); f = rng.uniform(900, 2600); u = T(0.03)
        place(dr, np.sin(2 * np.pi * f * u * (1 + 3 * u)) * np.exp(-u / 0.008), at, rng.uniform(0.2, 0.6))
    return (x + dr * 0.5) * g
def bs_quench():
    d = 0.5; t = T(d); return fin(splash_layer(t, 0.12, 1.0) + lp(noise(len(t)), 400) * np.exp(-t / 0.05) * 0.6, d)
def hiss(t, dec, lo, g, at=0.0):
    u = np.maximum(0, t - at); return hp(noise(len(t)), lo, 3) * np.minimum(1, u / 0.015) * np.exp(-u / dec) * (t >= at) * g
def bs_steam():
    d = 0.6; t = T(d); return fin(hiss(t, 0.16, 3000, 1.0) + bp(noise(len(t)), 1200, 3000) * np.exp(-t / 0.1) * 0.3, d)
def bs_steam3():
    d = 0.85; t = T(d); x = hiss(t, 0.26, 2600, 1.2) + hiss(t, 0.1, 6000, 0.6, 0.02) + click(t, 200, 1500, 0.03, 0.9) + splash_layer(t, 0.08, 0.5)
    x += np.sin(2 * np.pi * 2900 * t) * np.exp(-t / 0.25) * 0.05
    return fin(x, d)
def bs_wall():
    d = 0.7; t = T(d); x = np.zeros(len(t))
    for i in range(7):
        at = 0.02 + i * 0.03; x += click(t, 1800, 6500, 0.009, 0.7, at) + metal(t, 900 + i * 60, 0.03, 0.15, at=at)
    x += thud(t, 150, 70, 0.08, 1.1, 0.24) + metal(t, 340, 0.3, 0.45, ratios=(1.0, 1.73, 3.1), at=0.24) + click(t, 400, 3000, 0.02, 0.9, 0.24)
    return fin(x, d)
def bs_block():
    d = 0.5; t = T(d); x = thud(t, 170, 80, 0.06, 1.0) + metal(t, 360, 0.18, 0.5, ratios=(1.0, 1.73, 3.1)) + click(t, 500, 3500, 0.012, 1.0)
    return fin(x, d)
def bs_rivet():
    d = 0.6; t = T(d); x = np.zeros(len(t))
    for i, at in enumerate((0.0, 0.11, 0.22)): x += metal(t, 2100 + 140 * i, 0.08, 0.7, at=at) + click(t, 3000, 9000, 0.004, 0.8, at)
    return fin(x, d)
def bs_rivet_pop():
    d = 0.35; t = T(d); f = 2600 + 1200 * np.exp(-t / 0.05); x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.07) + click(t, 2500, 9000, 0.004, 0.9)
    return fin(x, d)
def bs_rivet_shot():
    d = 0.45; t = T(d); x = np.zeros(len(t))
    for i, at in enumerate((0.0, 0.05, 0.1)):
        u = T(0.12); w = bp(noise(len(u)), 1500 + 400 * i, 7000) * np.exp(-((u - 0.03) / 0.02) ** 2); place(x, w, at, 1.0)
        x += metal(t, 1900, 0.04, 0.25, at=at)
    return fin(x, d)
def bs_forge():
    d = 0.8; t = T(d); fl = lp(noise(len(t)), 900) * (0.7 + 0.3 * np.sin(2 * np.pi * 13 * t)) * np.minimum(1, t / 0.04) * np.exp(-np.maximum(0, t - 0.25) / 0.18)
    x = fl * 1.2 + thud(t, 90, 50, 0.08, 0.6) + bp(noise(len(t)), 2000, 8000) * np.exp(-t / 0.25) * 0.2
    s = np.zeros(len(t))
    for _ in range(18):
        at = rng.uniform(0.15, 0.6); L = int(SR * 0.06); place(s, hp(noise(L), 4000) * np.exp(-np.arange(L) / (L * 0.4)), at, rng.uniform(0.2, 0.5))
    return fin(x + s * 0.6, d)
def bs_break():
    d = 0.8; t = T(d); x = click(t, 800, 9000, 0.02, 1.6) + thud(t, 160, 70, 0.07, 0.8)
    for _ in range(14):
        at = rng.uniform(0.0, 0.3); x += metal(t, rng.uniform(1400, 4200), rng.uniform(0.04, 0.12), rng.uniform(0.15, 0.4), at=at)
    return fin(x, d)

def save(name, x):
    st = np.stack([x, x], 1); pcm = (np.clip(st, -1, 1) * 0.89 * 32767).astype('<i2')
    wav = os.path.join(TMP, name + '.wav')
    with wave.open(wav, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    mp3 = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '128k', mp3], check=True)
    print(name, '%.2f s' % (len(x) / SR), os.path.getsize(mp3), 'bytes')

NAMES = ['bs_swing', 'bs_hit', 'bs_hit_heavy', 'bs_anvil', 'bs_anvil_ring', 'bs_tongs', 'bs_quench', 'bs_steam', 'bs_steam3',
         'bs_wall', 'bs_block', 'bs_rivet', 'bs_rivet_pop', 'bs_rivet_shot', 'bs_forge', 'bs_break']
if __name__ == '__main__':
    for n in NAMES: save('sfx_' + n, globals()[n]())
