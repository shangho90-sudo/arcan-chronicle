"""양약사 2차 6종 교체(2026-11-20) 효과음 14개 합성 (numpy + scipy, ffmpeg로 MP3 — tools/audio/smith_sfx.py 와 같은 도구, 시드 고정).
Runway 효과음 대신 합성(크레딧 0). 소리 정체성: 맑은 유리·정제·탄산·천·작은 금속 릴.

Usage:  python3 tools/audio/wp2_sfx.py [이름…]  ->  assets/audio/sfx_<이름>.mp3 (+ /tmp/wp2_sfx/*.wav)
  wp_flick   이중정을 손가락으로 튕김: 작은 '틱' + 짧은 바람
  wp_shell   외층이 깨짐: 단단한 정제가 쪼개지는 '딱' + 유리 조각
  wp_blink   내핵 깜빡임(남은 시간): 맑은 짧은 '삥' (두 번 들림)
  wp_core    내핵 폭발(자연): 푸른 유리 '퐁' + 결정 파쇄 + 낮은 쿵
  wp_crack   긴급 방출(깨지는 내핵·큰 기포를 지금): 금 가는 '찌직' -> 날카로운 파쇄
  wp_fizz    발포정이 닿아 녹기 시작: 탄산 '쉬익' 거품
  wp_bubble  작은 기포 여러 개가 톡톡 터짐
  wp_bigpop  가운데 큰 기포가 터짐: 둥근 '뽀옹' + 물보라
  wp_kit     구급함을 내려놓고 뚜껑이 열림: 가죽 '툭' + 경첩 '딸깍'
  wp_patch   패치가 붙으며 회복: 부드러운 '착' + 맑은 회복 화음
  wp_tick    서방 패치 칸 하나 회복: 작은 맑은 '띵'
  wp_reel    붕대를 쏨: 천이 펄럭이며 '휙'
  wp_wind    릴이 감김: 작은 톱니 '드르륵'
  wp_wrap    붕대로 나를 감음: 천 스치는 소리 + 회복 화음
"""
import os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import smith_sfx as B
from smith_sfx import T, bp, lp, hp, noise, place, fin, metal, thud, click, save
B.TMP = '/tmp/wp2_sfx'; os.makedirs(B.TMP, exist_ok=True)
B.rng = np.random.default_rng(1120)

def glass(t, f, dec, g=1.0, at=0.0): return metal(t, f, dec, g, ratios=(1.0, 2.32, 4.25, 6.63), at=at)
def tone(t, f, dec, g=1.0, at=0.0):
    u = np.maximum(0, t - at); return np.sin(2 * np.pi * f * u) * np.exp(-u / dec) * (t >= at) * np.minimum(1, u / 0.004) * g
def chime(t, at=0.0, g=1.0, root=880):   # 회복: 장3화음(라 장조) 맑은 종
    return sum(tone(t, root * r, 0.35, g * w, at + i * 0.03) for i, (r, w) in enumerate([(1, 0.5), (1.26, 0.4), (1.5, 0.35), (2, 0.2)]))
def wp_flick():
    d = 0.25; t = T(d); x = click(t, 3500, 12000, 0.004, 1.0) + glass(t, 3200, 0.03, 0.4) + bp(noise(len(t)), 800, 4000) * np.exp(-t / 0.06) * np.minimum(1, t / 0.02) * 0.35
    return fin(x, d) * 0.75
def wp_shell():
    d = 0.45; t = T(d); x = click(t, 1500, 9000, 0.008, 1.2) + thud(t, 300, 150, 0.04, 0.6)
    for _ in range(6): x += glass(t, B.rng.uniform(2200, 5600), B.rng.uniform(0.03, 0.09), B.rng.uniform(0.15, 0.3), at=B.rng.uniform(0.0, 0.06))
    return fin(x, d) * 0.85
def wp_blink():
    d = 0.3; t = T(d); x = tone(t, 1760, 0.08, 0.8) + tone(t, 2637, 0.05, 0.35) + glass(t, 3520, 0.03, 0.2)
    return fin(x, d) * 0.6
def wp_core():
    d = 0.9; t = T(d); x = glass(t, 900, 0.12, 0.7) + thud(t, 200, 70, 0.1, 1.0) + click(t, 2000, 10000, 0.012, 0.9)
    for _ in range(9): x += glass(t, B.rng.uniform(1800, 5200), B.rng.uniform(0.05, 0.16), B.rng.uniform(0.12, 0.3), at=B.rng.uniform(0.0, 0.1))
    return fin(x, d)
def wp_crack():
    d = 0.8; t = T(d); x = np.zeros(len(t))
    for k in range(5): place(x, click(T(0.03), 2500, 11000, 0.004, 1.0), 0.005 + k * 0.016, 0.5)
    x += click(t, 1500, 10000, 0.015, 1.2, at=0.09) + thud(t, 220, 70, 0.1, 1.1, at=0.09) + glass(t, 1100, 0.14, 0.6, at=0.09)
    for _ in range(10): x += glass(t, B.rng.uniform(2000, 6000), B.rng.uniform(0.04, 0.14), B.rng.uniform(0.12, 0.3), at=0.09 + B.rng.uniform(0, 0.08))
    return fin(x, d)
def wp_fizz():
    d = 1.1; t = T(d); env = np.minimum(1, t / 0.03) * np.exp(-t / 0.5)
    x = hp(noise(len(t)), 3000) * env * 0.6 + thud(t, 180, 90, 0.05, 0.5)
    for _ in range(26): place(x, glass(T(0.04), B.rng.uniform(3000, 7000), 0.01, 0.4), B.rng.uniform(0.02, 0.9), B.rng.uniform(0.2, 0.6))
    return fin(x, d) * 0.7
def bub(t, f, at, g):
    u = np.maximum(0, t - at); ff = f * (1 + 1.6 * np.exp(-u / 0.012)); return np.sin(2 * np.pi * np.cumsum(ff) / B.SR) * np.exp(-u / 0.03) * (t >= at) * g
def wp_bubble():
    d = 0.5; t = T(d); x = np.zeros(len(t))
    for _ in range(5): x += bub(t, B.rng.uniform(500, 1300), B.rng.uniform(0, 0.25), B.rng.uniform(0.4, 0.9))
    x += hp(noise(len(t)), 4000) * np.exp(-t / 0.12) * 0.15
    return fin(x, d) * 0.7
def wp_bigpop():
    d = 0.9; t = T(d); x = bub(t, 260, 0.0, 1.4) + thud(t, 160, 60, 0.12, 0.9) + click(t, 800, 6000, 0.02, 0.8)
    x += lp(noise(len(t)), 2500) * np.exp(-np.maximum(0, t - 0.03) / 0.18) * (t > 0.03) * 0.6
    for _ in range(12): x += bub(t, B.rng.uniform(700, 1800), B.rng.uniform(0.05, 0.4), B.rng.uniform(0.15, 0.35))
    return fin(x, d)
def wp_kit():
    d = 0.7; t = T(d); x = thud(t, 140, 80, 0.06, 1.0) + lp(noise(len(t)), 900) * np.exp(-t / 0.04) * 0.6
    x += metal(t, 2400, 0.03, 0.5, at=0.32) + click(t, 2000, 8000, 0.006, 0.7, at=0.32) + chime(t, 0.36, 0.25, 1320)
    return fin(x, d) * 0.85
def wp_patch():
    d = 0.8; t = T(d); x = bp(noise(len(t)), 500, 3000) * np.exp(-t / 0.03) * 0.8 + chime(t, 0.03, 0.6)
    return fin(x, d) * 0.7
def wp_tick():
    d = 0.4; t = T(d); x = tone(t, 1318, 0.12, 0.7) + tone(t, 1976, 0.08, 0.35) + bp(noise(len(t)), 1000, 4000) * np.exp(-t / 0.01) * 0.3
    return fin(x, d) * 0.55
def wp_reel():
    d = 0.45; t = T(d); env = np.sin(np.pi * np.clip(t / 0.35, 0, 1)) ** 1.5
    x = bp(noise(len(t)), 600, 3500) * env * (0.7 + 0.3 * np.sin(2 * np.pi * 34 * t)) + click(t, 1500, 7000, 0.01, 0.6)
    return fin(x, d) * 0.75
def wp_wind():
    d = 0.5; t = T(d); x = np.zeros(len(t))
    for k in range(16): place(x, click(T(0.02), 2000, 8000, 0.003, 1.0) + metal(T(0.02), 3000, 0.006, 0.4), 0.01 + k * 0.026, 0.55 * (1 - k / 22))
    x += bp(noise(len(t)), 300, 1500) * np.exp(-t / 0.3) * 0.2
    return fin(x, d) * 0.6
def wp_wrap():
    d = 0.9; t = T(d); env = np.sin(np.pi * np.clip(t / 0.4, 0, 1))
    x = bp(noise(len(t)), 700, 4000) * env * (0.6 + 0.4 * np.sin(2 * np.pi * 9 * t)) * 0.8 + chime(t, 0.32, 0.5)
    return fin(x, d) * 0.75

NAMES = ['wp_flick', 'wp_shell', 'wp_blink', 'wp_core', 'wp_crack', 'wp_fizz', 'wp_bubble', 'wp_bigpop', 'wp_kit', 'wp_patch', 'wp_tick', 'wp_reel', 'wp_wind', 'wp_wrap']
if __name__ == '__main__':
    for n in (sys.argv[1:] or NAMES): save('sfx_' + n, globals()[n]())
