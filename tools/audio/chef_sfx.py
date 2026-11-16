"""쉐프 2차 스킬 효과음 26개를 합성한다 (numpy + scipy, ffmpeg로 MP3). 2026-11-16.

Usage:  python3 tools/audio/chef_sfx.py   ->  assets/audio/sfx_cf_*.mp3 (+ /tmp/chef_sfx/*.wav)

Runway 크레딧이 없어 생성형 대신 직접 합성했다(시드 고정 — 다시 돌리면 같은 파일). 겹침은 js/chef.js snd()가 같은 소리 0.07초 간격으로 막음.
  웍·불: cf_wok_toss(무쇠 웍 '챙' + 재료 휙) cf_sizzle(지글) cf_flame(불길 '화르륵') cf_splash(소스 촤악) cf_ignite(플람베 '훅' 점화) cf_steam(증기 '퓌시')
  압력솥: cf_place(냄비 내려놓는 '쿵 땡') cf_steam_hiss(짧은 칙) cf_pop(뚜껑 '펑' + 금속 울림)
  꼬치·쇼: cf_skewer(꿰뚫는 '푹') cf_whoosh(휙) cf_knife(빠른 칼 '탁') cf_cloche_fall(내려오는 바람) cf_cloche_slam(클로슈 '쾅 + 종 울림')
  디저트: cf_scoop(스쿱 '슥') cf_sorbet_hit(얼음 '착') cf_frost_draw(서리 긋는 소리) cf_frost(얼음꽃 '쨍') cf_disc(원반 '휘잉') cf_disc_hit(얇은 '삭') cf_disc_catch(받는 '탁')
           cf_sugar(캐러멜 굳는 맑은 소리) cf_shatter(설탕 유리 깨짐) cf_choux_pop(슈 '퐁')
  서빙: cf_serve(은쟁반 '팅') cf_cloche_open(뚜껑 여는 '딸깍 + 반짝')
"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import smash_sfx as S
from smash_sfx import T, bp, lp, hp, place, SR
S.TMP = '/tmp/chef_sfx'; os.makedirs(S.TMP, exist_ok=True)
rng = np.random.default_rng(1116)
N = lambda t: rng.standard_normal(len(t))
def norm(x, d, t, tail=0.04): x = x * np.minimum(1, (d - t) / tail); return x / (np.max(np.abs(x)) or 1)
def bell(t, fs, dc, g=1.0): return sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / (dc * k)) * g * a for f, k, a in fs)
def grains(d, n, lo, hi, amp=1.0, dec=0.2, L=(0.002, 0.007)):
    t = T(d); g = np.zeros(len(t))
    for _ in range(n):
        at = rng.uniform(lo, hi); m = int(SR * rng.uniform(*L)); place(g, rng.standard_normal(m) * np.exp(-np.arange(m) / (m * 0.3)), at, amp * rng.uniform(0.3, 1) * np.exp(-(at - lo) / dec))
    return g

def wok_toss():
    d = 0.42; t = T(d); x = bell(t, [(420, 1, 0.8), (1010, 0.7, 0.5), (1730, 0.5, 0.35), (2890, 0.35, 0.2)], 0.18) * np.minimum(1, t / 0.002)
    x += hp(N(t), 2500) * np.exp(-t / 0.006) * 0.7 + bp(N(t), 600, 2600) * np.exp(-((t - 0.12) / 0.06) ** 2) * 0.3
    return norm(np.tanh(x * 1.1), d, t, 0.06)
def sizzle():
    d = 0.55; t = T(d); x = hp(N(t), 3500) * np.exp(-t / 0.25) * np.minimum(1, t / 0.01) * (0.6 + 0.4 * np.abs(lp(N(t), 40) * 8).clip(0, 1))
    return norm(x + bp(grains(d, 40, 0.0, 0.45, 0.8, 0.3), 2000, 8000) * 0.6, d, t, 0.1)
def flame():
    d = 0.7; t = T(d); env = np.minimum(1, t / 0.05) * np.exp(-np.maximum(0, t - 0.05) / 0.25)
    x = lp(N(t), 900) * env * 1.4 + bp(N(t), 900, 4000) * env * 0.4 + np.sin(2 * np.pi * 70 * t) * np.exp(-t / 0.1) * 0.5
    return norm(np.tanh(x), d, t, 0.12)
def splash():
    d = 0.5; t = T(d); x = bp(N(t), 400, 5000) * np.exp(-t / 0.06) * np.minimum(1, t / 0.005) * 1.2 + lp(N(t), 500) * np.exp(-t / 0.05)
    return norm(np.tanh(x + bp(grains(d, 24, 0.02, 0.35, 0.6, 0.15), 1500, 7000) * 0.5), d, t, 0.08)
def ignite():
    d = 0.6; t = T(d); sw = np.minimum(1, t / 0.12) ** 2 * np.exp(-np.maximum(0, t - 0.12) / 0.18)
    x = (lp(N(t), 600) * (1 - np.minimum(1, t / 0.12)) + lp(N(t), 2400) * np.minimum(1, t / 0.12)) * sw * 1.5 + hp(N(t), 4000) * np.exp(-((t - 0.02) / 0.01) ** 2) * 0.6
    return norm(np.tanh(x), d, t, 0.1)
def steam():
    d = 0.55; t = T(d); x = hp(N(t), 2200) * np.minimum(1, t / 0.01) * np.exp(-t / 0.18) + lp(N(t), 300) * np.exp(-t / 0.03) * 0.8
    return norm(x, d, t, 0.1)
def place_():
    d = 0.4; t = T(d); x = lp(N(t), 600) * np.exp(-t / 0.02) * 1.4 + np.sin(2 * np.pi * 90 * t) * np.exp(-t / 0.06) + bell(t, [(640, 1, 0.5), (1530, 0.6, 0.3)], 0.12) * 0.6
    return norm(np.tanh(x), d, t, 0.06)
def steam_hiss():
    d = 0.3; t = T(d); x = hp(N(t), 3000) * np.minimum(1, t / 0.01) * np.exp(-t / 0.1)
    return norm(x, d, t, 0.06)
def pop():
    d = 0.8; t = T(d); x = lp(N(t), 1500) * np.exp(-t / 0.015) * 2 + np.sin(2 * np.pi * (55 + 60 * np.exp(-t / 0.03)) * t) * np.exp(-t / 0.12) * 1.3
    x += bell(t, [(520, 1, 0.5), (1190, 0.7, 0.35), (2150, 0.5, 0.2)], 0.3) * 0.5 + hp(N(t), 2000) * np.exp(-np.maximum(0, t - 0.03) / 0.25) * (t > 0.03) * 0.3
    return norm(np.tanh(x * 1.2), d, t, 0.15)
def skewer():
    d = 0.22; t = T(d); x = hp(N(t), 2500) * np.exp(-t / 0.006) * 0.8 + lp(N(t), 900) * np.exp(-np.maximum(0, t - 0.01) / 0.025) * (t > 0.01) * 1.2
    x += np.sin(2 * np.pi * 120 * t) * np.exp(-t / 0.04) * 0.6
    return norm(np.tanh(x * 1.2), d, t, 0.03)
def whoosh():
    d = 0.24; t = T(d); env = np.sin(np.pi * np.clip(t / 0.22, 0, 1)) ** 2
    return norm(bp(N(t), 900, 4500) * env, d, t, 0.03)
def knife():
    d = 0.16; t = T(d); x = lp(N(t), 2400) * np.exp(-t / 0.004) * 1.5 + bell(t, [(2600, 1, 0.4), (4100, 0.6, 0.25)], 0.03) * 0.5 + np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.02) * 0.6
    return norm(np.tanh(x), d, t, 0.02)
def cloche_fall():
    d = 0.4; t = T(d); env = np.minimum(1, t / 0.35) ** 2
    return norm(bp(N(t), 300, 1800) * env, d, t, 0.02)
def cloche_slam():
    d = 1.1; t = T(d); x = lp(N(t), 1200) * np.exp(-t / 0.02) * 2 + np.sin(2 * np.pi * (48 + 40 * np.exp(-t / 0.04)) * t) * np.exp(-t / 0.18) * 1.4
    x += bell(t, [(392, 1, 0.7), (784, 0.8, 0.45), (1176, 0.6, 0.3), (1960, 0.4, 0.18)], 0.45) * 0.55
    return norm(np.tanh(x * 1.1), d, t, 0.2)
def scoop():
    d = 0.3; t = T(d); env = np.sin(np.pi * np.clip(t / 0.25, 0, 1))
    return norm(bp(N(t), 1500, 6000) * env * 0.7 + bp(grains(d, 18, 0.0, 0.25, 0.5, 0.3), 3000, 9000) * 0.5, d, t, 0.05)
def sorbet_hit():
    d = 0.22; t = T(d); x = hp(N(t), 2000) * np.exp(-t / 0.01) * 1.2 + bell(t, [(3100, 1, 0.5), (4700, 0.7, 0.3)], 0.05) * 0.5 + lp(N(t), 800) * np.exp(-t / 0.02) * 0.6
    return norm(np.tanh(x), d, t, 0.04)
def frost_draw():
    d = 0.45; t = T(d); env = np.minimum(1, t / 0.05) * np.exp(-np.maximum(0, t - 0.25) / 0.08)
    return norm(hp(N(t), 4500) * env * (0.7 + 0.3 * np.sin(2 * np.pi * 26 * t)), d, t, 0.06)
def frost():
    d = 0.8; t = T(d); x = bell(t, [(1760, 1, 0.5), (2640, 0.8, 0.4), (3520, 0.6, 0.3), (5280, 0.4, 0.2)], 0.35) + hp(N(t), 3000) * np.exp(-t / 0.05) * 0.7
    return norm(np.tanh(x), d, t, 0.15)
def disc():
    d = 0.5; t = T(d); env = np.sin(np.pi * np.clip(t / 0.48, 0, 1))
    x = bp(N(t), 700, 3000) * env * (0.6 + 0.4 * np.sin(2 * np.pi * 14 * t))
    return norm(x, d, t, 0.05)
def disc_hit():
    d = 0.16; t = T(d); x = hp(N(t), 3000) * np.exp(-t / 0.008) + lp(N(t), 1500) * np.exp(-t / 0.015) * 0.6
    return norm(x, d, t, 0.03)
def disc_catch():
    d = 0.2; t = T(d); x = lp(N(t), 1800) * np.exp(-t / 0.006) * 1.4 + bell(t, [(880, 1, 0.4)], 0.05) * 0.3
    return norm(np.tanh(x), d, t, 0.03)
def sugar():
    d = 0.9; t = T(d); x = bell(t, [(1318, 1, 0.5), (1975, 0.9, 0.4), (2637, 0.7, 0.3)], 0.4) * np.minimum(1, t / 0.08) + bp(grains(d, 30, 0.0, 0.6, 0.3, 0.5), 3000, 9000) * 0.3
    return norm(x, d, t, 0.15)
def shatter():
    d = 0.7; t = T(d); x = hp(N(t), 2500) * np.exp(-t / 0.03) * 1.3 + bp(grains(d, 60, 0.0, 0.5, 0.9, 0.18, (0.002, 0.012)), 2500, 10000) * 0.9
    x += bell(t, [(2200, 1, 0.3), (3300, 0.6, 0.2)], 0.1) * 0.4
    return norm(np.tanh(x), d, t, 0.1)
def choux_pop():
    d = 0.2; t = T(d); f = 300 + 500 * np.exp(-t / 0.02); x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.04) + lp(N(t), 2000) * np.exp(-t / 0.008) * 0.8
    return norm(np.tanh(x), d, t, 0.03)
def serve():
    d = 0.7; t = T(d); x = bell(t, [(1568, 1, 0.6), (2350, 0.8, 0.35), (3136, 0.6, 0.25)], 0.3) * np.minimum(1, t / 0.002) + hp(N(t), 3000) * np.exp(-t / 0.004) * 0.5
    return norm(x, d, t, 0.12)
def cloche_open():
    d = 0.8; t = T(d); x = lp(N(t), 2500) * np.exp(-t / 0.005) * 1.2 + bell(t, [(1046, 1, 0.5), (1568, 0.9, 0.4), (2093, 0.7, 0.35), (3136, 0.5, 0.25)], 0.3) * np.minimum(1, np.maximum(0, t - 0.04) / 0.04) * 0.7
    return norm(np.tanh(x), d, t, 0.15)

ALL = dict(wok_toss=wok_toss, sizzle=sizzle, flame=flame, splash=splash, ignite=ignite, steam=steam, place=place_, steam_hiss=steam_hiss, pop=pop, skewer=skewer, whoosh=whoosh,
           knife=knife, cloche_fall=cloche_fall, cloche_slam=cloche_slam, scoop=scoop, sorbet_hit=sorbet_hit, frost_draw=frost_draw, frost=frost, disc=disc, disc_hit=disc_hit,
           disc_catch=disc_catch, sugar=sugar, shatter=shatter, choux_pop=choux_pop, serve=serve, cloche_open=cloche_open)
if __name__ == '__main__':
    for name, fn in ALL.items(): S.save('sfx_cf_' + name, fn())
