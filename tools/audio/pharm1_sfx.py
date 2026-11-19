"""약사 1차 5종 교체(2026-11-19) 효과음 15개를 합성한다 (numpy + scipy, ffmpeg로 MP3). Runway 효과음 모델 하루 한도가 다 차서 직접 합성(시드 고정 — 다시 돌리면 같은 파일).

Usage:  python3 tools/audio/pharm1_sfx.py [이름…]   ->  assets/audio/sfx_<이름>.mp3 (인자 없이 = 15개 모두)

  유봉 되던지기   ph_rang_throw   휙 — 던지는 바람 소리(대역 잡음이 위로 쓸림)
                  ph_rang_hit     퍽 — 나무 유봉이 몸에 맞는 둔탁한 소리(짧게, 여러 번 나도 귀찮지 않게)
                  ph_rang_catch   탁 — 손바닥에 자루가 감기는 가벼운 나무 소리
  불꽃심지병      ph_wick_break   유리 깨짐 + 철퍽(반응음 없음 — 불은 나중에)
                  ph_wick_sizzle  심지가 타들어 가는 지지직(0.35 s, 작은 불티 탁탁)
                  ph_wick_whoomp  확 — 약액에 불이 붙는 낮은 '훅'
                  ph_wick_crackle 불꽃 틱마다 작게 타닥
  서리병 굴리기   ph_frost_roll   둥근 유리병이 바닥을 구르는 소리(구를 때 생기는 낮은 떨림 + 유리 딸깍, 1 s)
                  ph_frost_shatter 깨지며 얼음 파편이 부채꼴로 흩어지는 쨍그랑 + 차가운 쉿
  결정침 개화     ph_crystal_grow  결정이 자라는 맑은 소리(올라가는 종소리 3개)
                  ph_crystal_pierce 날카롭게 꽂히는 짧은 '칭'
                  ph_crystal_shatter 마지막 굵은 결정이 꽃잎처럼 갈라지는 '쨍'(높은 배음 + 흩어지는 조각)
                  ph_crystal_scatter 표적을 잃은 결정이 힘없이 흩어지는 작은 소리
  꿈꽃가루        ph_dream_blow    후 — 부드러운 숨 + 반짝이 소리
                  ph_dream_sleep   잠드는 순간 낮게 울리는 자장 종소리(두 음)
출처는 assets/audio/pharmacist-sfx-credits.json 의 synthesized.
"""
import os, sys, subprocess, wave
import numpy as np
from scipy import signal
SR = 44100; ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); OUT = os.path.join(ROOT, 'assets', 'audio'); TMP = '/tmp/pharm1_sfx'; os.makedirs(TMP, exist_ok=True)
def T(d): return np.arange(int(SR * d)) / SR
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'lowpass', fs=SR, output='sos'), x)
def hp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'highpass', fs=SR, output='sos'), x)
def place(buf, x, at, g=1.0):
    i = int(at * SR); n = min(len(x), len(buf) - i)
    if n > 0: buf[i:i + n] += x[:n] * g
def env(t, a, d): return np.minimum(1, t / max(1e-4, a)) * np.exp(-np.maximum(0, t - a) / d)
def fade(x, d=0.05): n = int(SR * d); x[-n:] *= np.linspace(1, 0, n); return x
def norm(x, g=1.0): return fade(x / (np.max(np.abs(x)) + 1e-9) * g)
def ping(f, d, dec, rng, partials=((1, 1), (2.76, 0.4), (5.4, 0.18))):
    t = T(d); return sum(np.sin(2 * np.pi * f * k * t + rng.uniform(0, 6)) * a * np.exp(-t / (dec / k ** 0.5)) for k, a in partials)
def sweep(d, f0, f1, rng, q=1.6):
    t = T(d); n = rng.standard_normal(len(t)); out = np.zeros(len(t)); B = 512; H = 128; win = np.hanning(B)
    for s in range(0, len(t) - B, H):
        u = (s + B / 2) / len(t); fc = f0 * (f1 / f0) ** u
        out[s:s + B] += bp(n[s:s + B] * win, fc / q, min(fc * q, SR / 2 - 100)) * win
    return out

def rang_throw(rng):
    d = 0.42; t = T(d); x = sweep(d, 380, 2200, rng) * np.sin(np.pi * np.minimum(1, t / d)) ** 1.5
    return norm(x, 0.9)
def rang_hit(rng):
    d = 0.22; t = T(d); x = lp(rng.standard_normal(len(t)), 900) * env(t, 0.002, 0.03) * 1.4
    x += np.sin(2 * np.pi * 150 * t) * env(t, 0.002, 0.05) + np.sin(2 * np.pi * 420 * t) * env(t, 0.001, 0.02) * 0.5
    return norm(x, 0.95)
def rang_catch(rng):
    d = 0.16; t = T(d); x = bp(rng.standard_normal(len(t)), 900, 3600) * env(t, 0.001, 0.012) * 1.2
    x += np.sin(2 * np.pi * 620 * t) * env(t, 0.001, 0.025) * 0.6 + np.sin(2 * np.pi * 1180 * t) * env(t, 0.001, 0.015) * 0.3
    return norm(x, 0.8)
def glass(d, rng):
    t = T(d); x = hp(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.035) * 0.9
    for k in range(9):
        f = rng.uniform(3200, 8800); at = rng.uniform(0.0, 0.16); tt = np.maximum(0, t - at)
        x += np.sin(2 * np.pi * f * tt) * np.exp(-tt / rng.uniform(0.02, 0.06)) * (t >= at) * rng.uniform(0.12, 0.3)
    x += bp(rng.standard_normal(len(t)), 900, 2600) * np.exp(-t / 0.02) * 0.5
    return x
def wick_break(rng):
    d = 0.5; t = T(d); x = glass(d, rng) + bp(rng.standard_normal(len(t)), 250, 1400) * env(t, 0.006, 0.06) * 0.6
    return norm(x, 0.95)
def wick_sizzle(rng):
    d = 0.4; t = T(d); x = hp(rng.standard_normal(len(t)), 2500) * (0.25 + 0.15 * np.sin(2 * np.pi * 23 * t)) * np.sin(np.pi * t / d) ** 0.5
    for k in range(9):
        n = int(SR * 0.003); place(x, hp(rng.standard_normal(n), 1800) * np.hanning(n), rng.uniform(0.02, 0.36), rng.uniform(0.4, 0.9))
    return norm(x, 0.7)
def wick_whoomp(rng):
    d = 0.75; t = T(d); x = sweep(d, 90, 700, rng, 1.8) * np.exp(-((t - 0.13) / 0.13) ** 2) * 1.2
    x += lp(rng.standard_normal(len(t)), 180) * env(t, 0.02, 0.2) * 1.3
    for k in range(8):
        n = int(SR * 0.004); place(x, hp(rng.standard_normal(n), 1500) * np.hanning(n), rng.uniform(0.15, 0.65), rng.uniform(0.15, 0.4))
    return norm(x, 0.95)
def wick_crackle(rng):
    d = 0.3; t = T(d); x = lp(rng.standard_normal(len(t)), 600) * env(t, 0.03, 0.1) * 0.4
    for k in range(5):
        n = int(SR * 0.003); place(x, hp(rng.standard_normal(n), 1500) * np.hanning(n), rng.uniform(0.0, 0.25), rng.uniform(0.4, 1.0))
    return norm(x, 0.6)
def frost_roll(rng):
    d = 1.0; t = T(d); rumble = lp(rng.standard_normal(len(t)), 260) * (0.6 + 0.4 * np.sin(2 * np.pi * 9 * t)) * 0.8
    x = rumble * np.minimum(1, t / 0.05) * np.minimum(1, (d - t) / 0.2)
    for k in range(10):                                                                       # glass clinks as the stripes turn
        at = 0.04 + k * 0.095 + rng.uniform(-0.01, 0.01); place(x, ping(rng.uniform(2400, 3400), 0.08, 0.025, rng), at, 0.25)
    x += hp(rng.standard_normal(len(t)), 5000) * 0.05
    return norm(x, 0.75)
def frost_shatter(rng):
    d = 0.8; t = T(d); x = glass(d, rng) * 1.1
    for k, f in enumerate((2637, 3520, 4186, 5274, 6272)):
        at = 0.02 + k * 0.03; place(x, ping(f, 0.4, 0.08, rng), at, 0.22)
    x += hp(rng.standard_normal(len(t)), 4500) * np.exp(-np.maximum(0, t - 0.05) / 0.2) * (t > 0.05) * 0.3
    x += lp(rng.standard_normal(len(t)), 300) * env(t, 0.003, 0.06) * 0.7
    return norm(x, 0.95)
def crystal_grow(rng):
    d = 0.6; x = np.zeros(len(T(d)))
    for k, f in enumerate((1568, 1976, 2349)): place(x, ping(f, 0.45, 0.16, rng), 0.03 + k * 0.1, 0.5)
    x += hp(rng.standard_normal(len(x)), 6000) * np.sin(np.pi * T(d) / d) * 0.06
    return norm(x, 0.6)
def crystal_pierce(rng):
    d = 0.3; t = T(d); x = ping(3136, d, 0.05, rng) * 0.8 + hp(rng.standard_normal(len(t)), 3500) * env(t, 0.001, 0.012) * 0.9
    x += np.sin(2 * np.pi * 220 * t) * env(t, 0.001, 0.03) * 0.4
    return norm(x, 0.85)
def crystal_shatter(rng):
    d = 0.9; t = T(d); x = ping(2093, d, 0.35, rng, ((1, 1), (2.0, 0.5), (3.0, 0.3), (4.2, 0.2))) * 0.9
    x += np.sin(2 * np.pi * 110 * t) * env(t, 0.002, 0.08) * 0.8 + lp(rng.standard_normal(len(t)), 500) * env(t, 0.002, 0.04) * 0.8
    for k in range(12):
        at = rng.uniform(0.04, 0.4); place(x, ping(rng.uniform(3500, 7500), 0.12, 0.03, rng), at, rng.uniform(0.08, 0.2))
    return norm(x, 0.95)
def crystal_scatter(rng):
    d = 0.4; x = np.zeros(len(T(d)))
    for k in range(6): place(x, ping(rng.uniform(2500, 5000), 0.1, 0.025, rng), rng.uniform(0, 0.25), rng.uniform(0.1, 0.25))
    return norm(x, 0.45)
def dream_blow(rng):
    d = 0.9; t = T(d); x = bp(rng.standard_normal(len(t)), 500, 2600) * np.sin(np.pi * np.minimum(1, t / 0.6)) ** 2 * (t < 0.6) * 0.9
    for k in range(8): place(x, ping(rng.uniform(2600, 5200), 0.3, 0.09, rng), 0.12 + rng.uniform(0, 0.6), rng.uniform(0.06, 0.14))
    return norm(x, 0.7)
def dream_sleep(rng):
    d = 0.9; x = np.zeros(len(T(d)))
    place(x, ping(784, 0.8, 0.3, rng, ((1, 1), (2, 0.25), (3, 0.1))), 0.0, 0.6); place(x, ping(587, 0.7, 0.3, rng, ((1, 1), (2, 0.25))), 0.16, 0.55)
    return norm(x, 0.55)

SOUNDS = dict(ph_rang_throw=rang_throw, ph_rang_hit=rang_hit, ph_rang_catch=rang_catch, ph_wick_break=wick_break, ph_wick_sizzle=wick_sizzle, ph_wick_whoomp=wick_whoomp,
              ph_wick_crackle=wick_crackle, ph_frost_roll=frost_roll, ph_frost_shatter=frost_shatter, ph_crystal_grow=crystal_grow, ph_crystal_pierce=crystal_pierce,
              ph_crystal_shatter=crystal_shatter, ph_crystal_scatter=crystal_scatter, ph_dream_blow=dream_blow, ph_dream_sleep=dream_sleep)

def save(name, x):
    st = np.stack([x, x], 1); pcm = (np.clip(st, -1, 1) * 0.89 * 32767).astype('<i2')
    wav = os.path.join(TMP, name + '.wav')
    with wave.open(wav, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    mp3 = os.path.join(OUT, 'sfx_' + name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', mp3], check=True)
    print(name, '%.2f s' % (len(x) / SR), os.path.getsize(mp3), 'bytes')

if __name__ == '__main__':
    names = sys.argv[1:] or list(SOUNDS)
    for i, n in enumerate(SOUNDS):
        rng = np.random.default_rng(1119 + i)   # 이름마다 자기 시드(일부만 다시 만들어도 같은 소리)
        if n in names: save(n, SOUNDS[n](rng))
