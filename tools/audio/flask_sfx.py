"""약사 약병 효과음 3개를 합성한다 (numpy + scipy, ffmpeg로 MP3). 2026-11-14 약병 연출 개편.

Usage:  python3 tools/audio/flask_sfx.py   ->  assets/audio/sfx_ph_glass_fire.mp3, sfx_ph_glass_ice.mp3, sfx_ph_glass_acid.mp3

Runway 크레딧이 0이라 직접 합성했다(시드 고정 — 다시 돌리면 같은 파일). 화염·냉각·부식 약병이 떨어지는 순간(실제 폭발 = 피해 순간) 한 번 재생.
한 파일에 층을 겹침(유리 깨짐 -> 액체 철퍽 -> 반응음): 짧고 밝은 유리 깨짐(3 ~ 9 kHz 잡음 + 고음 감쇠 사인 여러 개, 10 ms 어택) 은 셋 다 같고,
  ph_glass_fire  0.70 s  + 낮은 '훅' 불붙는 소리(대역 잡음 120 -> 900 Hz로 부풀었다 줄어듦) + 탁탁 튀는 불티
  ph_glass_ice   0.70 s  + 높은 결정음(2.6 ~ 5.3 kHz 사인이 빠르게 이어짐 = 얼어붙는 소리) + 짧은 쉿 소리
  ph_glass_acid  0.80 s  + 끈적한 철퍽(저역 잡음, 느린 감쇠) + 크기가 다른 거품 '뽁' 6개
약병폭격은 원래의 sfx_ph_flask(Runway)를 그대로 쓰고 재생할 때 음높이를 조금씩 바꿈(js/io.js).
"""
import os, sys, subprocess, wave
import numpy as np
from scipy import signal
SR = 44100; ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); OUT = os.path.join(ROOT, 'assets', 'audio'); TMP = '/tmp/flask_sfx'; os.makedirs(TMP, exist_ok=True)
rng = np.random.default_rng(1114)
def T(d): return np.arange(int(SR * d)) / SR
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'lowpass', fs=SR, output='sos'), x)
def hp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'highpass', fs=SR, output='sos'), x)
def place(buf, x, at, g=1.0):
    i = int(at * SR); n = min(len(x), len(buf) - i)
    if n > 0: buf[i:i + n] += x[:n] * g

def glass(d):
    t = T(d); x = np.zeros(len(t))
    x += hp(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.035) * 0.9                      # the crack
    for k in range(9):                                                                        # pieces ringing / tinkling after it
        f = rng.uniform(3200, 8800); at = rng.uniform(0.0, 0.16); tt = np.maximum(0, t - at)
        x += np.sin(2 * np.pi * f * tt) * np.exp(-tt / rng.uniform(0.02, 0.06)) * (t >= at) * rng.uniform(0.12, 0.3)
    x += bp(rng.standard_normal(len(t)), 900, 2600) * np.exp(-t / 0.02) * 0.5                  # body of the bottle
    return x

def splash(d, lo, hi, dec, g):
    t = T(d); n = bp(rng.standard_normal(len(t)), lo, hi)
    return n * (np.minimum(1, t / 0.008) * np.exp(-np.maximum(0, t - 0.01) / dec)) * g

def fire():
    d = 0.7; t = T(d); x = glass(d)
    out = np.zeros(len(t)); B = 512; H = 128; win = np.hanning(B); n = rng.standard_normal(len(t))
    for s in range(0, len(t) - B, H):
        u = (s + B / 2) / len(t); fc = 140 + 760 * np.exp(-((u - 0.18) / 0.16) ** 2)
        out[s:s + B] += bp(n[s:s + B] * win, fc * 0.6, fc * 1.6) * win
    x += out * np.exp(-((t - 0.11) / 0.12) ** 2) * 1.1 + lp(rng.standard_normal(len(t)), 160) * np.exp(-t / 0.18) * 1.4
    for k in range(10):                                                                       # crackle
        at = rng.uniform(0.05, 0.5); place(x, hp(rng.standard_normal(int(SR * 0.004)), 1500) * np.hanning(int(SR * 0.004)), at, rng.uniform(0.2, 0.5))
    x += splash(d, 300, 1500, 0.05, 0.4)
    x *= np.minimum(1, (d - t) / 0.12); return x / np.max(np.abs(x))

def ice():
    d = 0.7; t = T(d); x = glass(d)
    for k, f in enumerate((2637, 3136, 3951, 4699, 5274)):                                     # crystals forming one after another
        at = 0.03 + k * 0.035; tt = np.maximum(0, t - at)
        x += np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.09) * (t >= at) * 0.22
    x += hp(rng.standard_normal(len(t)), 4500) * np.exp(-np.maximum(0, t - 0.05) / 0.16) * (t > 0.05) * 0.25   # cold hiss
    x += splash(d, 500, 2200, 0.04, 0.45)
    x *= np.minimum(1, (d - t) / 0.12); return x / np.max(np.abs(x))

def acid():
    d = 0.8; t = T(d); x = glass(d) * 0.8
    x += splash(d, 120, 900, 0.12, 1.2)                                                      # thick splat
    for k in range(6):                                                                        # bubbles of different sizes popping
        at = rng.uniform(0.12, 0.62); f0 = rng.uniform(300, 900); dd = rng.uniform(0.03, 0.06); tt = T(dd)
        b = np.sin(2 * np.pi * (f0 * tt + f0 * 2.5 * tt * tt / dd)) * np.exp(-tt / (dd * 0.35)); place(x, b, at, rng.uniform(0.25, 0.5))
    x *= np.minimum(1, (d - t) / 0.12); return x / np.max(np.abs(x))

def save(name, x):
    st = np.stack([x, x], 1); pcm = (np.clip(st, -1, 1) * 0.89 * 32767).astype('<i2')
    wav = os.path.join(TMP, name + '.wav')
    with wave.open(wav, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    mp3 = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '128k', mp3], check=True)
    print(name, '%.2f s' % (len(x) / SR), os.path.getsize(mp3), 'bytes')

if __name__ == '__main__':
    save('sfx_ph_glass_fire', fire()); save('sfx_ph_glass_ice', ice()); save('sfx_ph_glass_acid', acid())
