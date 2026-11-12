"""약사 유봉강타 ph1_a1 효과음 2개를 합성한다 (numpy + scipy, ffmpeg로 MP3). 2026-11-12.

Usage:  python3 tools/audio/smash_sfx.py   ->  assets/audio/sfx_ph_smash_swing.mp3, sfx_ph_smash_hit.mp3 (+ /tmp/smash_sfx/*.wav)

Runway 크레딧이 0이라 생성형 대신 직접 합성했다(시드 고정 — 다시 돌리면 같은 파일). 크레딧이 생기면 같은 이름으로 바꿔 넣으면 된다.
  ph_smash_swing  0.30 s  무거운 둔기가 공기를 가르는 짧은 '후웅' (대역 통과 잡음, 중심 주파수 240 -> 900 -> 380 Hz, 0.085 s에 정점 —
                          게임은 타격 0.09 s 전에 틀어 정점이 타격 직전에 온다)
  ph_smash_hit    0.80 s  한 파일에 층을 겹침(타격 순간 한 번만 재생 = 소리가 어긋나거나 겹쳐 쌓이지 않음):
                          ① 저음 '쿵' 96 -> 44 Hz  ② 단단한 몸통 타격음(짧은 잡음 + 290·470·760 Hz 감쇠 사인)
                          ③ 중고음 어택(2 ~ 7 kHz, 12 ms — 휴대폰 스피커에서도 들리게)  ④ 0.05 s 뒤부터 흙·돌가루 떨어지는 알갱이
                          ⑤ 은은한 약력 여운(1319·1976·2637 Hz 종소리, 낮은 음량)
"""
import os, subprocess, wave
import numpy as np
from scipy import signal
SR = 44100; ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); OUT = os.path.join(ROOT, 'assets', 'audio'); TMP = '/tmp/smash_sfx'; os.makedirs(TMP, exist_ok=True)
rng = np.random.default_rng(1112)
def T(d): return np.arange(int(SR * d)) / SR
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'lowpass', fs=SR, output='sos'), x)
def hp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'highpass', fs=SR, output='sos'), x)
def place(buf, x, at, g=1.0):
    i = int(at * SR); n = min(len(x), len(buf) - i)
    if n > 0: buf[i:i + n] += x[:n] * g

def swing():
    d = 0.30; t = T(d); n = rng.standard_normal(len(t))
    # time-varying band-pass: overlap-add of short blocks, each filtered at the centre frequency of its moment
    out = np.zeros(len(t)); B = 512; H = 128; win = np.hanning(B)
    for s in range(0, len(t) - B, H):
        u = (s + B / 2) / len(t); fc = 240 + (900 - 240) * np.exp(-((u - 0.30) / 0.2) ** 2) + 140 * u
        out[s:s + B] += bp(n[s:s + B] * win, fc * 0.62, fc * 1.5) * win
    low = lp(rng.standard_normal(len(t)), 220) * 2.2
    env = np.exp(-((t - 0.085) / 0.055) ** 2) + 0.25 * np.exp(-((t - 0.15) / 0.08) ** 2)
    x = (out * 0.5 + low * 0.5) * env
    x *= np.minimum(1, t / 0.01) * np.minimum(1, (d - t) / 0.04)
    return x / np.max(np.abs(x))

def hit():
    d = 0.80; t = T(d); x = np.zeros(len(t))
    # 1 low thud
    f = 44 + (96 - 44) * np.exp(-t / 0.045); ph = 2 * np.pi * np.cumsum(f) / SR
    x += (np.sin(ph) + 0.35 * np.sin(2 * ph)) * np.exp(-t / 0.085) * 0.8
    # 2 hard body knock
    nb = lp(rng.standard_normal(len(t)), 1100) * np.exp(-t / 0.028); x += nb * 1.3
    for fq, dc, g in ((290, 0.060, 0.8), (470, 0.045, 0.65), (760, 0.032, 0.5), (1180, 0.022, 0.32)):
        x += np.sin(2 * np.pi * fq * t + rng.uniform(0, 6.28)) * np.exp(-t / dc) * g
    # 3 mid / high transient
    tr = bp(rng.standard_normal(len(t)), 2000, 7000) * np.exp(-t / 0.012); x += tr * 1.7
    x[:40] += np.hanning(80)[40:] * 0.6
    # 4 falling grit
    g = np.zeros(len(t))
    for k in range(46):
        at = 0.05 + rng.exponential(0.11); L = int(SR * rng.uniform(0.004, 0.012))
        if at > d - 0.05: continue
        grain = rng.standard_normal(L) * np.exp(-np.arange(L) / (L * 0.3)); place(g, grain, at, rng.uniform(0.3, 1.0) * np.exp(-at / 0.17))
    g = bp(g, 1500, 6000); x += g * 0.42
    x += bp(rng.standard_normal(len(t)), 500, 2400) * np.exp(-np.maximum(0, t - 0.03) / 0.07) * (t > 0.03) * 0.10      # dusty wash under the grains
    # 5 faint magical tail
    tail = np.zeros(len(t))
    for fq, g_, dc in ((1318.5, 1.0, 0.24), (1975.5, 0.7, 0.2), (2637.0, 0.5, 0.16), (3951.0, 0.22, 0.11)):
        tail += np.sin(2 * np.pi * fq * t) * (1 + 0.25 * np.sin(2 * np.pi * 9 * t)) * np.exp(-np.maximum(0, t - 0.035) / dc) * g_
    x += tail * np.minimum(1, np.maximum(0, t - 0.03) / 0.02) * 0.085
    x = np.tanh(x * 1.15)
    x *= np.minimum(1, (d - t) / 0.08)
    return x / np.max(np.abs(x))

def save(name, x):
    st = np.stack([x, x], 1); pcm = (np.clip(st, -1, 1) * 0.89 * 32767).astype('<i2')
    wav = os.path.join(TMP, name + '.wav')
    with wave.open(wav, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    mp3 = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '128k', mp3], check=True)
    print(name, '%.2f s' % (len(x) / SR), os.path.getsize(mp3), 'bytes')

if __name__ == '__main__':
    save('sfx_ph_smash_swing', swing()); save('sfx_ph_smash_hit', hit())
