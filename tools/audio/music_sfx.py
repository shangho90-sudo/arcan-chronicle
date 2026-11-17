"""음악가 2차 스킬 효과음 21개를 합성한다 (numpy + scipy, ffmpeg로 MP3). 2026-11-16 '마에스트로'.

Usage:  python3 tools/audio/music_sfx.py [이름…]   ->  assets/audio/sfx_mu_*.mp3  (+ /tmp/music_sfx/*.wav)

Runway 크레딧이 없어 직접 합성(시드 고정 — 다시 돌리면 같은 파일). 출처 assets/audio/musician-sfx-credits.json.
공통 조성: 라장조 5음(D·E·F#·A·B) — 겹쳐도 불협화가 적게. 짧은 악기 한두 음 + 적중음, 지속 선율은 켜는 소리만(유지음 없음), 궁극기는 짧은 합주 구절.
  현악: mu_pluck(현 튕김 A4+D5) mu_bow(활 한 번, 크레셴도 한 타) mu_string(짧은 현 트레몰로) mu_harp(하프 아르페지오) mu_harp_tick(하프 한 음, 아리아 회복 틱)
        mu_cello(첼로 낮은 D3 활) mu_note(환영 연주자 한 음)
  타악: mu_cymbal(심벌즈 맞부딪침) mu_burst(공명막 파열: 낮은 쿵 + 금빛 여운)
  관악: mu_horn(나팔 짧은 두 음) mu_fanfare(행진 시작 세 음) mu_flute(플루트 두 음) mu_flute_tick(플루트 숨 한 음, 세레나데 틱)
  공통: mu_wave_hit(음파 적중 '팅') mu_chord(합주 화음 D 장3화음 + 저음) mu_tune(조율 파동: 올라가는 A 두 음) mu_echo(메아리: 낮게 울리는 두 음)
        mu_trio(트리오 합주 짧은 화음) mu_coda(코다 시작: 내려가는 금관 3음 + 팀파니) mu_encore(앙코르: 하프 상행 + 화음) mu_symph(심포니 시작: 현 트레몰로 상승)
음량은 js/io.js(mu_*), 같은 소리 반복은 js/musician.js MU.sfxGap.
"""
import os, sys, subprocess, wave
import numpy as np
from scipy import signal
SR = 44100; ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); OUT = os.path.join(ROOT, 'assets', 'audio'); TMP = '/tmp/music_sfx'; os.makedirs(TMP, exist_ok=True)
rng = np.random.default_rng(1601)
N = dict(D3=146.83, A3=220.0, D4=293.66, E4=329.63, Fs4=369.99, A4=440.0, B4=493.88, D5=587.33, E5=659.25, Fs5=739.99, A5=880.0, D6=1174.66)
def T(d): return np.arange(int(SR * d)) / SR
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'lowpass', fs=SR, output='sos'), x)
def place(buf, x, at, g=1.0):
    i = int(at * SR); n = min(len(x), len(buf) - i)
    if n > 0: buf[i:i + n] += x[:n] * g
def fade(x, a=0.005, b=0.05):
    n = len(x); t = np.arange(n) / SR; return x * np.minimum(1, t / a) * np.minimum(1, (n / SR - t) / b)
def norm(x): return x / (np.max(np.abs(x)) or 1)

def pluck(f, d, damp=0.996, bright=0.5):   # Karplus-Strong
    n = int(SR * d); L = int(SR / f); buf = rng.uniform(-1, 1, L) * 1.0; buf = lp(buf, 2000 + 6000 * bright, 1); out = np.zeros(n)
    for i in range(n): v = buf[i % L]; out[i] = v; buf[i % L] = damp * 0.5 * (v + buf[(i + 1) % L])
    return out
def bowed(f, d, vib=5.5, bright=3000, att=0.06):
    t = T(d); ph = 2 * np.pi * np.cumsum(f * (1 + 0.006 * np.sin(2 * np.pi * vib * t))) / SR
    saw = sum(np.sin(k * ph) / k for k in range(1, 12)); x = lp(saw, bright) + bp(rng.standard_normal(len(t)), 1500, 5000) * 0.04
    return x * np.minimum(1, t / att) * np.exp(-np.maximum(0, t - d * 0.6) / (d * 0.25))
def brass(f, d, att=0.03):
    t = T(d); env = np.minimum(1, t / att) * np.exp(-np.maximum(0, t - d * 0.5) / (d * 0.3)); br = 1 + 2.5 * np.exp(-t / 0.08)
    x = sum(np.sin(2 * np.pi * f * k * t) * (1 / k) ** (1.2 / br) for k in range(1, 10)); return lp(x, 4500) * env
def flute(f, d):
    t = T(d); x = np.sin(2 * np.pi * f * t * (1 + 0.004 * np.sin(2 * np.pi * 5 * t))) + 0.15 * np.sin(4 * np.pi * f * t)
    x += bp(rng.standard_normal(len(t)), f * 1.5, min(12000, f * 6)) * 0.12 * np.exp(-t / 0.08)
    return x * np.minimum(1, t / 0.04) * np.exp(-np.maximum(0, t - d * 0.6) / (d * 0.2))
def bell(f, d, tau=0.35):
    t = T(d); return sum(np.sin(2 * np.pi * f * r * t) * g for r, g in ((1, 1), (2.01, 0.35), (3.02, 0.15))) * np.exp(-t / tau) * np.minimum(1, t / 0.003)
def cym(d=0.9):
    t = T(d); x = bp(rng.standard_normal(len(t)), 3000, 11000, 2) * np.exp(-t / 0.35) + bp(rng.standard_normal(len(t)), 600, 3000) * np.exp(-t / 0.08) * 0.8
    for fq in (2350, 3610, 5130): x += np.sin(2 * np.pi * fq * t) * np.exp(-t / 0.5) * 0.12
    return x

def S_pluck(): x = np.zeros(int(SR * 0.7)); place(x, pluck(N['A4'], 0.65), 0, 1); place(x, pluck(N['D5'], 0.55), 0.04, 0.7); return fade(norm(x), 0.001, 0.12)
def S_bow(): return fade(norm(bowed(N['D5'], 0.32, att=0.03)), 0.005, 0.08)
def S_string(): t = T(0.35); x = bowed(N['A4'], 0.35, att=0.02) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 14 * t))); return fade(norm(x), 0.005, 0.08)
def S_harp():
    x = np.zeros(int(SR * 1.0))
    for i, k in enumerate(('D4', 'Fs4', 'A4', 'D5', 'Fs5')): place(x, pluck(N[k], 0.8, 0.997, 0.8), i * 0.06, 0.6)
    return fade(norm(x), 0.001, 0.2)
def S_harp_tick(): return fade(norm(pluck(N['A5'], 0.5, 0.996, 0.8)), 0.001, 0.15) * 0.8
def S_cello(): x = bowed(N['D3'], 0.75, bright=1800, att=0.08) + 0.5 * bowed(N['A3'], 0.75, bright=1800, att=0.1); return fade(norm(x), 0.01, 0.2)
def S_note(): return fade(norm(pluck(N['E5'], 0.25, 0.993, 0.6) + 0.4 * bell(N['E5'], 0.25, 0.08)), 0.001, 0.06)
def S_cymbal(): return fade(norm(cym(0.9)), 0.001, 0.25)
def S_burst():
    t = T(0.8); x = np.sin(2 * np.pi * (70 + 60 * np.exp(-t / 0.05)) * t) * np.exp(-t / 0.18) * 1.2 + lp(rng.standard_normal(len(t)), 400) * np.exp(-t / 0.08)
    place(x, bell(N['D5'], 0.7, 0.3), 0.02, 0.35); place(x, bell(N['A5'], 0.6, 0.25), 0.03, 0.2); return fade(norm(x), 0.001, 0.2)
def S_horn(): x = np.zeros(int(SR * 0.5)); place(x, brass(N['A4'], 0.18), 0, 0.8); place(x, brass(N['D5'], 0.3), 0.16, 1); return fade(norm(x), 0.003, 0.1)
def S_fanfare():
    x = np.zeros(int(SR * 0.7))
    for i, (k, d) in enumerate((('D4', 0.12), ('Fs4', 0.12), ('A4', 0.4))): place(x, brass(N[k], d), i * 0.12, 1)
    return fade(norm(x), 0.003, 0.15)
def S_flute(): x = np.zeros(int(SR * 0.6)); place(x, flute(N['B4'] * 2, 0.22), 0, 0.8); place(x, flute(N['Fs5'], 0.35), 0.2, 1); return fade(norm(x), 0.005, 0.12)
def S_flute_tick(): return fade(norm(flute(N['A5'], 0.3)), 0.01, 0.1) * 0.8
def S_wave_hit(): x = bell(N['D6'], 0.22, 0.06) + bp(rng.standard_normal(int(SR * 0.22)), 2000, 8000) * np.exp(-T(0.22) / 0.015) * 0.5; return fade(norm(x), 0.001, 0.05)
def S_chord():
    t = T(1.0); x = np.zeros(len(t))
    for k, g in (('D3', 0.7), ('D4', 0.6), ('Fs4', 0.5), ('A4', 0.5), ('D5', 0.4)): x += brass(N[k], 1.0, 0.02) * g
    x += np.sin(2 * np.pi * 60 * t) * np.exp(-t / 0.15) * 0.8; place(x, cym(0.9), 0, 0.25); return fade(norm(x), 0.003, 0.3)
def S_tune(): x = np.zeros(int(SR * 0.5)); place(x, bell(N['A4'], 0.3, 0.12), 0, 0.6); place(x, bell(N['A5'], 0.35, 0.15), 0.1, 0.8); return fade(norm(x), 0.002, 0.1)
def S_echo(): x = np.zeros(int(SR * 0.8)); place(x, bell(N['D5'], 0.5, 0.2), 0, 0.8); place(x, bell(N['A4'], 0.5, 0.25), 0.18, 0.5); return fade(norm(lp(x, 4000)), 0.002, 0.2)
def S_trio():
    x = np.zeros(int(SR * 0.6))
    place(x, bowed(N['D5'], 0.45, att=0.02), 0, 0.6); place(x, bowed(N['D3'], 0.45, bright=1500, att=0.02), 0, 0.7); place(x, flute(N['Fs5'], 0.45), 0, 0.5)
    return fade(norm(x), 0.003, 0.12)
def S_coda():
    x = np.zeros(int(SR * 1.0))
    for i, k in enumerate(('A4', 'Fs4', 'D4')): place(x, brass(N[k], 0.22), i * 0.18, 0.9)
    t = T(0.5); timp = np.sin(2 * np.pi * (N['D3'] / 2 + 20 * np.exp(-t / 0.03)) * t) * np.exp(-t / 0.25); place(x, timp, 0.54, 1.2)
    return fade(norm(x), 0.003, 0.2)
def S_encore():
    x = np.zeros(int(SR * 1.2))
    for i, k in enumerate(('D4', 'E4', 'Fs4', 'A4', 'B4', 'D5', 'Fs5', 'A5')): place(x, pluck(N[k], 0.7, 0.997, 0.8), i * 0.045, 0.45)
    for k in ('D4', 'Fs4', 'A4'): place(x, bowed(N[k], 0.8, att=0.15), 0.35, 0.3)
    return fade(norm(x), 0.002, 0.3)
def S_symph():
    t = T(1.0); f = N['D4'] * 2 ** (t * 1.0); ph = 2 * np.pi * np.cumsum(f) / SR; x = lp(sum(np.sin(k * ph) / k for k in range(1, 9)), 3500) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 16 * t)))
    x *= np.minimum(1, t / 0.3) * np.exp(-np.maximum(0, t - 0.8) / 0.1); return fade(norm(x), 0.01, 0.15)

# fx2(2026-11-17) 그림 순간 소리 임시 합성음 — Runway(tools/audio/music_runway_sfx.py)로 만들면 같은 이름으로 덮어씀. 만들기: python3 tools/audio/music_sfx.py sigil sparkle staff phantom
def S_sigil():
    t = T(0.9); x = np.zeros(len(t)); hum = np.sin(2 * np.pi * (N['D4'] * (1 + 0.5 * t)) * t) * np.minimum(1, t / 0.3) * np.exp(-np.maximum(0, t - 0.5) / 0.2) * 0.4
    x += hum
    for i, k in enumerate(('D5', 'Fs5', 'A5', 'D6')): place(x, bell(N[k], 0.5, 0.18), 0.08 + i * 0.1, 0.45)
    return fade(norm(x), 0.01, 0.15)
def S_sparkle():
    x = np.zeros(int(SR * 0.5))
    for i, k in enumerate(('A5', 'D6', 'Fs5')): place(x, bell(N[k] * 1.0, 0.35, 0.09), i * 0.035, 0.6)
    x[:int(SR * 0.05)] += bp(rng.standard_normal(int(SR * 0.05)), 5000, 12000) * np.exp(-T(0.05) / 0.01) * 0.4
    return fade(norm(x), 0.001, 0.1)
def S_staff():
    x = np.zeros(int(SR * 0.8))
    for i, k in enumerate(('D5', 'E5', 'Fs5', 'A5', 'B4', 'D6')): place(x, bell(N[k], 0.3, 0.1), i * 0.07, 0.5)
    return fade(norm(x), 0.001, 0.15)
def S_phantom():
    t = T(0.8); air = bp(rng.standard_normal(len(t)), 600, 3500) * np.sin(np.pi * t / 0.8) * 0.5
    pad = sum(np.sin(2 * np.pi * N[k] * t * (1 + 0.003 * np.sin(2 * np.pi * 4 * t))) for k in ('D4', 'Fs4', 'A4')) * np.minimum(1, t / 0.2) * np.exp(-np.maximum(0, t - 0.5) / 0.15) * 0.3
    return fade(norm(air + pad), 0.02, 0.15)

ALL = {k[2:]: v for k, v in globals().items() if k.startswith('S_')}
def save(name, x):
    wav = os.path.join(TMP, 'mu_' + name + '.wav'); mp3 = os.path.join(OUT, 'sfx_mu_' + name + '.mp3')
    y = (np.clip(x, -1, 1) * 0.89 * 32767).astype(np.int16)
    with wave.open(wav, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '128k', mp3], check=True)
    print('wrote', mp3, os.path.getsize(mp3))

if __name__ == '__main__':
    names = sys.argv[1:] or sorted(ALL)
    for n in names: save(n, ALL[n]())
