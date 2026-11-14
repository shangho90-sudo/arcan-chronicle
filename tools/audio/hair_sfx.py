"""미용사 1차 효과음 3개를 합성한다 (numpy + scipy, ffmpeg로 MP3). 2026-11-13.

Usage:  python3 tools/audio/hair_sfx.py   ->  assets/audio/sfx_hd_snip.mp3, sfx_hd_dryer.mp3, sfx_hd_style.mp3 (+ /tmp/hair_sfx/*.wav)

Runway 크레딧이 0이라 생성형 대신 직접 합성했다(시드 고정 — 다시 돌리면 같은 파일). 크레딧이 생기면 같은 이름으로 바꿔 넣으면 된다.
  hd_snip   0.26 s  큰 가위 '싹뚝': 두 날이 스치는 짧은 쇳소리(5~11 kHz 잡음이 위로 쓸림) → 닫히는 순간의 단단한 '착'(금속 공명
                    2.1·3.4·5.2·7.9 kHz + 1.5~8 kHz 어택) → 아주 짧은 울림. 실제 명중 순간에만 재생(허공에서는 안 남)
  hd_dryer  0.70 s  드라이어 바람: 모터 윙(180 Hz + 배음, 살짝 올라감) + 넓은 바람 소리(600~5000 Hz 대역 잡음), 빠르게 켜지고 0.25 s에 걸쳐 잦아듦
  (2026-11-14 드라이어 모드별 시전 소리 — 스킬 데이터 sfx: 드라이 돌풍 hd_gust · 온풍 드라이 hd_hot · 냉풍 드라이 hd_cold; hd_dryer는 예비)
  hd_gust   0.60 s  센 돌풍: 짧은 모터 + 위로 쓸렸다 내려가는 굵은 바람(대역 이동) + 0.07 s의 낮은 '훅' 압력음
  hd_hot    0.90 s  온풍: 낮게 깔린 모터 + 따뜻한(저역) 바람 + 드문드문 타닥이는 불티 소리, 천천히 잦아듦
  hd_cold   0.75 s  냉풍: 모터 + 높고 가는 바람(3~10 kHz) + 얼음 결정이 맺히는 유리 방울 소리 몇 개
  hd_style  0.60 s  스타일링 반짝이: 위로 올라가는 유리 종 4음(1568·1976·2349·3136 Hz) + 고음 반짝이 알갱이
"""
import os, subprocess, wave
import numpy as np
from scipy import signal
SR = 44100; ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); OUT = os.path.join(ROOT, 'assets', 'audio'); TMP = '/tmp/hair_sfx'; os.makedirs(TMP, exist_ok=True)
rng = np.random.default_rng(1113)
def T(d): return np.arange(int(SR * d)) / SR
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'lowpass', fs=SR, output='sos'), x)
def place(buf, x, at, g=1.0):
    i = int(at * SR); n = min(len(x), len(buf) - i)
    if n > 0: buf[i:i + n] += x[:n] * g

def snip():
    d = 0.26; t = T(d); x = np.zeros(len(t)); close = 0.045
    # blades sliding: rising metallic hiss up to the snap
    n = rng.standard_normal(len(t)); B, H = 256, 64; win = np.hanning(B); sl = np.zeros(len(t))
    for s in range(0, len(t) - B, H):
        u = (s + B / 2) / SR / close
        if u > 1.3: break
        fc = 4500 + 5500 * min(1, u); sl[s:s + B] += bp(n[s:s + B] * win, fc * 0.8, min(fc * 1.3, 15000)) * win
    x += sl * np.exp(-((t - close * 0.75) / 0.022) ** 2) * 0.9
    # the snap
    ts = np.maximum(0, t - close); on = (t >= close)
    for fq, dc, g in ((2100, 0.030, 0.9), (3400, 0.024, 0.8), (5200, 0.018, 0.6), (7900, 0.012, 0.45), (980, 0.030, 0.35)):
        x += np.sin(2 * np.pi * fq * ts + rng.uniform(0, 6.28)) * np.exp(-ts / dc) * g * on
    x += bp(rng.standard_normal(len(t)), 1500, 8000) * np.exp(-ts / 0.007) * on * 1.6
    x += np.sin(2 * np.pi * 160 * ts) * np.exp(-ts / 0.03) * on * 0.5          # a little body
    x = np.tanh(x * 1.1); x *= np.minimum(1, t / 0.004) * np.minimum(1, (d - t) / 0.05)
    return x / np.max(np.abs(x))

def dryer():
    d = 0.70; t = T(d)
    f = 150 + 40 * np.minimum(1, t / 0.12); ph = 2 * np.pi * np.cumsum(f) / SR
    motor = np.sin(ph) * 0.5 + np.sin(2 * ph) * 0.35 + np.sin(3 * ph + 1) * 0.2 + np.sin(5.02 * ph) * 0.12
    wind = bp(rng.standard_normal(len(t)), 600, 5000) * 1.2 + bp(rng.standard_normal(len(t)), 2500, 9000) * 0.5
    wind *= 0.75 + 0.25 * np.sin(2 * np.pi * 11 * t + 1)
    env = np.minimum(1, t / 0.05) * np.minimum(1, np.maximum(0, d - t) / 0.26)
    x = (motor * 0.42 + wind * 0.75) * env
    x = np.tanh(x * 0.9)
    return x / np.max(np.abs(x))

def motor(t, f0=150, f1=190, g=1.0):
    f = f0 + (f1 - f0) * np.minimum(1, t / 0.12); ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(ph) * 0.5 + np.sin(2 * ph) * 0.35 + np.sin(3 * ph + 1) * 0.2) * g

def gust():
    d = 0.60; t = T(d); n = rng.standard_normal(len(t)); B, H = 512, 128; win = np.hanning(B); w = np.zeros(len(t))
    for s0 in range(0, len(t) - B, H):
        u = (s0 + B / 2) / SR; fc = 500 + 2600 * np.exp(-((u - 0.12) / 0.10) ** 2) + 400 * (u < 0.12)
        w[s0:s0 + B] += bp(n[s0:s0 + B] * win, fc * 0.5, min(fc * 1.9, 12000)) * win
    env = np.minimum(1, t / 0.03) * np.exp(-np.maximum(0, t - 0.14) / 0.2)
    thump = np.sin(2 * np.pi * 72 * np.maximum(0, t - 0.07)) * np.exp(-np.maximum(0, t - 0.07) / 0.06) * (t >= 0.07)
    x = w * env * 1.6 + motor(t) * 0.22 * np.minimum(1, (d - t) / 0.2) + thump * 0.8
    x = np.tanh(x * 1.1); x *= np.minimum(1, (d - t) / 0.06)
    return x / np.max(np.abs(x))

def hot():
    d = 0.90; t = T(d)
    wind = lp(rng.standard_normal(len(t)), 1800) * 1.6 + bp(rng.standard_normal(len(t)), 300, 1200) * 0.8
    wind *= 0.8 + 0.2 * np.sin(2 * np.pi * 5 * t)
    cr = np.zeros(len(t))
    for k in range(22):
        at = rng.uniform(0.05, 0.8); L = int(SR * 0.012); tt = np.arange(L) / SR
        place(cr, bp(rng.standard_normal(L), 1500, 6000) * np.exp(-tt / 0.002), at, rng.uniform(0.3, 0.9))
    env = np.minimum(1, t / 0.06) * np.minimum(1, np.maximum(0, d - t) / 0.35)
    x = (motor(t, 120, 150) * 0.45 + wind * 0.6 + cr * 0.7) * env
    x = np.tanh(x)
    return x / np.max(np.abs(x))

def cold():
    d = 0.75; t = T(d)
    wind = bp(rng.standard_normal(len(t)), 3000, 10000) * 1.1 + bp(rng.standard_normal(len(t)), 900, 2500) * 0.3
    wind *= 0.85 + 0.15 * np.sin(2 * np.pi * 13 * t)
    tk = np.zeros(len(t))
    for k in range(7):
        at = 0.08 + k * 0.07 + rng.uniform(-0.02, 0.02); fq = rng.uniform(2600, 5200); L = int(SR * 0.18); tt = np.arange(L) / SR
        place(tk, (np.sin(2 * np.pi * fq * tt) + 0.3 * np.sin(2 * np.pi * fq * 2.76 * tt)) * np.exp(-tt / 0.05), at, rng.uniform(0.25, 0.5))
    env = np.minimum(1, t / 0.04) * np.minimum(1, np.maximum(0, d - t) / 0.28)
    x = (motor(t, 170, 210) * 0.3 + wind * 0.7) * env + tk * 0.6 * np.minimum(1, (d - t) / 0.1)
    x = np.tanh(x)
    return x / np.max(np.abs(x))

def style():
    d = 0.60; t = T(d); x = np.zeros(len(t))
    for i, fq in enumerate((1568.0, 1975.5, 2349.3, 3136.0)):
        at = 0.02 + i * 0.055; ts = np.maximum(0, t - at); on = t >= at
        x += (np.sin(2 * np.pi * fq * ts) + 0.4 * np.sin(2 * np.pi * fq * 2.01 * ts) + 0.2 * np.sin(2 * np.pi * fq * 3.0 * ts)) * np.exp(-ts / 0.14) * on * (0.7 - 0.08 * i)
    g = np.zeros(len(t))
    for k in range(26):
        at = rng.uniform(0.03, 0.42); L = int(SR * 0.03); tt = np.arange(L) / SR; fq = rng.uniform(4000, 9000)
        place(g, np.sin(2 * np.pi * fq * tt) * np.exp(-tt / 0.008), at, rng.uniform(0.15, 0.4))
    x += g
    x *= np.minimum(1, t / 0.003) * np.minimum(1, (d - t) / 0.12)
    return x / np.max(np.abs(x))

def save(name, x, gain=0.8):
    st = np.stack([x, x], 1); pcm = (np.clip(st, -1, 1) * gain * 32767).astype('<i2')
    wav = os.path.join(TMP, name + '.wav')
    with wave.open(wav, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    mp3 = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '128k', mp3], check=True)
    print(name, '%.2f s' % (len(x) / SR), os.path.getsize(mp3), 'bytes')

if __name__ == '__main__':
    import sys
    only = sys.argv[1:]
    for name, fn, g in (('sfx_hd_snip', snip, 0.8), ('sfx_hd_dryer', dryer, 0.5), ('sfx_hd_style', style, 0.5), ('sfx_hd_gust', gust, 0.55), ('sfx_hd_hot', hot, 0.45), ('sfx_hd_cold', cold, 0.45)):
        x = fn()   # always run (keeps the seeded noise sequence the same for every file)
        if not only or name.replace('sfx_', '') in only: save(name, x, g)
