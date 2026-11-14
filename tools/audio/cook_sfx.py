"""요리사 1차 스킬 효과음 7개를 합성한다 (numpy + scipy, ffmpeg로 MP3). 2026-11-13.

Usage:  python3 tools/audio/cook_sfx.py   ->  assets/audio/sfx_ck_*.mp3 (+ /tmp/cook_sfx/*.wav)

Runway 크레딧이 0이라 생성형 대신 직접 합성했다(시드 고정 — 다시 돌리면 같은 파일).
  ck_flip    뒤집기 명중: 철썩(짧은 잡음) + 통 튀는 '뽀잉'(올라가는 사인) + 낮은 쿵
  ck_board   도마: 나무 '탁' (세울 때·막을 때)
  ck_soup    뜨거운 국물 명중: 촤악 + 지글거리는 김
  ck_pepper  후추 뿌리기(시전): 후추통 흔드는 알갱이 소리 세 번
  ck_flour   밀가루 포대가 터짐: 부드러운 '퍽' + 낮은 쿵
  ck_skewer  꼬치 찌르기 명중: 짧은 쇠 긁힘 + 푹
  ck_eat     한 입: 바삭 씹는 소리
  (2026-11-14 미트볼 던지기, `python3 tools/audio/cook_sfx.py ball`로 이 넷만 — 시드가 따로라 위 7개는 그대로)
  ck_ball_toss  팬을 튕김: 짧은 쇠 '챙'(무쇠 팬의 비조화 배음) + 작은 휙
  ck_ball_fly   미트볼이 날아감: 가볍고 짧은 '슉'
  ck_ball_hit   한 알 명중: 짧고 축축한 '팍' (게임이 재생 속도로 음높이를 조금씩 올림)
  ck_ball_fin   마지막 한 방: 낮고 무거운 '퍽!' + 소스 튀는 소리
"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import smash_sfx as S
from smash_sfx import T, bp, lp, hp, place, SR
S.TMP = '/tmp/cook_sfx'; os.makedirs(S.TMP, exist_ok=True)
rng = np.random.default_rng(1113)
N = lambda t: rng.standard_normal(len(t))
def norm(x, d, t, tail=0.04): x = x * np.minimum(1, (d - t) / tail); return x / np.max(np.abs(x))

def flip():
    d = 0.46; t = T(d); x = bp(N(t), 900, 5200) * np.exp(-t / 0.014) * 1.5
    f = 280 + 520 * (1 - np.exp(-t / 0.07)); ph = 2 * np.pi * np.cumsum(f) / SR
    x += (np.sin(ph) + 0.3 * np.sin(2 * ph)) * np.exp(-t / 0.11) * np.minimum(1, t / 0.008) * 0.75
    x += np.sin(2 * np.pi * 82 * t) * np.exp(-t / 0.06) * 0.8
    w = bp(N(t), 500, 2400) * np.exp(-((t - 0.16) / 0.09) ** 2) * 0.22       # the body going up
    return norm(np.tanh((x + w) * 1.1), d, t)
def board():
    d = 0.30; t = T(d); x = lp(N(t), 2600) * np.exp(-t / 0.006) * 1.6
    for fq, dc, g in ((176, 0.05, 1.0), (415, 0.035, 0.7), (880, 0.02, 0.45), (1560, 0.012, 0.25)): x += np.sin(2 * np.pi * fq * t + rng.uniform(0, 6.28)) * np.exp(-t / dc) * g
    return norm(np.tanh(x), d, t)
def soup():
    d = 0.62; t = T(d); x = bp(N(t), 500, 6500) * (np.exp(-t / 0.05) * np.minimum(1, t / 0.006)) * 1.3
    x += lp(N(t), 420) * np.exp(-t / 0.05) * 1.2
    siz = hp(N(t), 3800) * np.exp(-np.maximum(0, t - 0.04) / 0.2) * (t > 0.04) * (0.6 + 0.4 * np.abs(lp(N(t), 60) * 6).clip(0, 1)); x += siz * 0.5
    g = np.zeros(len(t))
    for k in range(26):
        at = rng.uniform(0.03, 0.4); L = int(SR * rng.uniform(0.003, 0.009)); place(g, rng.standard_normal(L) * np.exp(-np.arange(L) / (L * 0.3)), at, rng.uniform(0.3, 0.9) * np.exp(-at / 0.2))
    return norm(np.tanh(x + bp(g, 1800, 7000) * 0.5), d, t, 0.08)
def pepper():
    d = 0.50; t = T(d); g = np.zeros(len(t))
    for at0, amp in ((0.0, 0.8), (0.165, 1.0), (0.36, 0.7)):
        for k in range(22):
            at = at0 + abs(rng.normal(0, 0.022)); L = int(SR * rng.uniform(0.002, 0.006))
            if at < d - 0.02: place(g, rng.standard_normal(L) * np.exp(-np.arange(L) / (L * 0.35)), at, amp * rng.uniform(0.4, 1.0))
    x = bp(g, 2200, 8500) + bp(g, 600, 1500) * 0.35
    return norm(x, d, t)
def flour():
    d = 0.60; t = T(d); x = bp(N(t), 180, 1500) * np.exp(-t / 0.09) * np.minimum(1, t / 0.012) * 1.4
    x += np.sin(2 * np.pi * (60 + 40 * np.exp(-t / 0.04)) * t) * np.exp(-t / 0.08) * 0.9
    x += hp(N(t), 2500) * np.exp(-t / 0.22) * np.minimum(1, t / 0.03) * 0.16
    return norm(np.tanh(x), d, t, 0.1)
def skewer():
    d = 0.36; t = T(d); x = hp(N(t), 3000) * np.exp(-((t - 0.012) / 0.012) ** 2) * 0.9
    for fq, dc, g in ((2350, 0.06, 0.5), (3520, 0.045, 0.38), (5280, 0.03, 0.22)): x += np.sin(2 * np.pi * fq * t) * np.exp(-t / dc) * g
    x += lp(N(t), 900) * np.exp(-np.maximum(0, t - 0.02) / 0.022) * (t > 0.02) * 1.4
    x += np.sin(2 * np.pi * 96 * t) * np.exp(-np.maximum(0, t - 0.02) / 0.05) * (t > 0.02) * 0.8
    return norm(np.tanh(x * 1.1), d, t)
def eat():
    d = 0.22; t = T(d); g = np.zeros(len(t))
    for at0 in (0.0, 0.085):
        for k in range(12):
            at = at0 + rng.uniform(0, 0.045); L = int(SR * rng.uniform(0.002, 0.006)); place(g, rng.standard_normal(L) * np.exp(-np.arange(L) / (L * 0.3)), at, rng.uniform(0.4, 1.0))
    x = bp(g, 700, 4200) + lp(g, 500) * 0.5
    return norm(x, d, t, 0.02)

rb = np.random.default_rng(1114)
NB = lambda t: rb.standard_normal(len(t))
def ball_toss():
    d = 0.42; t = T(d); x = np.zeros(len(t))
    for fq, dc, g in ((610, 0.16, 0.8), (1475, 0.11, 0.6), (2390, 0.08, 0.45), (3870, 0.05, 0.3), (5210, 0.03, 0.18)): x += np.sin(2 * np.pi * fq * t + rb.uniform(0, 6.28)) * np.exp(-t / dc) * g
    x *= np.minimum(1, t / 0.002); x += hp(NB(t), 2500) * np.exp(-t / 0.006) * 0.9
    x += bp(NB(t), 700, 3000) * np.exp(-((t - 0.09) / 0.05) ** 2) * 0.25
    return norm(np.tanh(x * 1.2), d, t, 0.06)
def ball_fly():
    d = 0.2; t = T(d); env = np.sin(np.pi * np.clip(t / 0.18, 0, 1)) ** 2
    x = bp(NB(t), 1400, 5200) * env * 0.9 + bp(NB(t), 500, 1300) * env * 0.35
    return norm(x, d, t, 0.03)
def ball_hit():
    d = 0.17; t = T(d); x = bp(NB(t), 800, 4200) * np.exp(-t / 0.012) * 1.5
    x += np.sin(2 * np.pi * (180 + 90 * np.exp(-t / 0.02)) * t) * np.exp(-t / 0.03) * 0.9
    x += lp(NB(t), 1400) * np.exp(-np.maximum(0, t - 0.01) / 0.03) * (t > 0.01) * 0.5     # wet squelch
    return norm(np.tanh(x * 1.3), d, t, 0.03)
def ball_fin():
    d = 0.42; t = T(d); x = bp(NB(t), 300, 2600) * np.exp(-t / 0.03) * 1.5
    x += np.sin(2 * np.pi * (62 + 50 * np.exp(-t / 0.03)) * t) * np.exp(-t / 0.1) * 1.3
    x += lp(NB(t), 900) * np.exp(-t / 0.05) * 0.8
    g = np.zeros(len(t))
    for k in range(14):
        at = rb.uniform(0.02, 0.22); L = int(SR * rb.uniform(0.003, 0.008)); place(g, rb.standard_normal(L) * np.exp(-np.arange(L) / (L * 0.3)), at, rb.uniform(0.3, 0.8) * np.exp(-at / 0.12))
    return norm(np.tanh((x + bp(g, 900, 5000) * 0.5) * 1.2), d, t, 0.08)

if __name__ == '__main__':
    if sys.argv[1:] == ['ball']:
        for name, fn in (('ball_toss', ball_toss), ('ball_fly', ball_fly), ('ball_hit', ball_hit), ('ball_fin', ball_fin)): S.save('sfx_ck_' + name, fn())
        sys.exit(0)
    for name, fn in (('flip', flip), ('board', board), ('soup', soup), ('pepper', pepper), ('flour', flour), ('skewer', skewer), ('eat', eat)): S.save('sfx_ck_' + name, fn())
