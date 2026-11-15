"""양약사 2차 스킬 효과음 5개를 합성한다 (numpy + scipy, ffmpeg로 MP3). 2026-11-16.

Usage:  python3 tools/audio/wp_sfx.py  ->  assets/audio/sfx_wp_*.mp3 (+ /tmp/wp_sfx/*.wav)

Runway 크레딧이 없어 tools/audio/smith_sfx.py 와 같은 도구(시드 고정)로 직접 합성. 소리 정체성: 맑은 유리·결정·약액.
  wp_granule   과립 명중: 작고 단단한 유리 '틱' + 짧은 탄산 쉭 (5연타가 겹쳐도 작게)
  wp_ring      반응 고리·연쇄 시작 폭발: 유리 '퐁' + 짧은 불꽃 '화륵'
  wp_crystal   결정 폭발·복합 반응: 얼음 결정이 깨지는 '쨍' + 맑은 종 여운
  wp_ion       이온 관통: 날카로운 전기 '찌직' + 짧은 쿵
  wp_collapse  궁극기 주 타격(대형 캡슐 붕괴·임계 농도): 낮은 '쿵' + 유리 결정 파쇄 + 맑은 여운
"""
import os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import smith_sfx as B
from smith_sfx import T, bp, lp, hp, noise, place, fin, metal, thud, click, save
B.TMP = '/tmp/wp_sfx'; os.makedirs(B.TMP, exist_ok=True)
B.rng = np.random.default_rng(1116)

def glass(t, f, dec, g=1.0, at=0.0): return metal(t, f, dec, g, ratios=(1.0, 2.32, 4.25, 6.63), at=at)
def wp_granule():
    d = 0.22; t = T(d); x = click(t, 3000, 11000, 0.006, 1.0) + glass(t, 2600, 0.05, 0.6) + hp(noise(len(t)), 5000) * np.exp(-t / 0.05) * 0.25
    return fin(x, d) * 0.8
def wp_ring():
    d = 0.6; t = T(d); x = glass(t, 1200, 0.12, 0.7) + thud(t, 220, 90, 0.07, 0.9) + click(t, 1500, 8000, 0.012, 0.8)
    x += lp(noise(len(t)), 1200) * np.minimum(1, t / 0.02) * np.exp(-t / 0.14) * 0.9
    return fin(x, d)
def wp_crystal():
    d = 1.0; t = T(d); x = click(t, 2500, 12000, 0.015, 1.2) + thud(t, 180, 80, 0.05, 0.5)
    for _ in range(10): x += glass(t, B.rng.uniform(1800, 5200), B.rng.uniform(0.06, 0.18), B.rng.uniform(0.15, 0.35), at=B.rng.uniform(0.0, 0.12))
    x += glass(t, 1568, 0.45, 0.35)
    return fin(x, d)
def wp_ion():
    d = 0.5; t = T(d); sq = np.sign(np.sin(2 * np.pi * (90 + 40 * np.sin(2 * np.pi * 37 * t)) * t))
    x = bp(noise(len(t)) * (0.6 + 0.4 * sq), 1500, 9000) * np.exp(-t / 0.08) * 1.4 + thud(t, 140, 60, 0.06, 0.7)
    for k in range(4): place(x, click(T(0.03), 3000, 12000, 0.004, 1.0), 0.02 + k * 0.035, 0.6)
    return fin(x, d)
def wp_collapse():
    d = 1.4; t = T(d); x = thud(t, 120, 38, 0.25, 1.6) + lp(noise(len(t)), 300) * np.exp(-t / 0.18) * 0.8 + click(t, 1500, 9000, 0.02, 0.9)
    for _ in range(14): x += glass(t, B.rng.uniform(1500, 5000), B.rng.uniform(0.08, 0.25), B.rng.uniform(0.1, 0.3), at=B.rng.uniform(0.0, 0.2))
    x += glass(t, 784, 0.8, 0.3) + glass(t, 1175, 0.7, 0.2)
    return fin(x, d)

NAMES = ['wp_granule', 'wp_ring', 'wp_crystal', 'wp_ion', 'wp_collapse']
if __name__ == '__main__':
    for n in NAMES: save('sfx_' + n, globals()[n]())
