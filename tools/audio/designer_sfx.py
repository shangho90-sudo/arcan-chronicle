"""디자이너 2차 스킬 효과음 14개를 합성한다 (numpy + scipy, ffmpeg로 MP3). 2026-11-16.

Usage:  python3 tools/audio/designer_sfx.py   ->  assets/audio/sfx_ds_*.mp3 (+ /tmp/designer_sfx/*.wav)

Runway 크레딧이 없어 생성형 대신 직접 합성했다(시드 고정 — 다시 돌리면 같은 파일). 다단 겹침은 js/designer.js snd()가 같은 소리를 0.06초 간격으로 막고,
음량은 js/io.js DS_GAIN 표가 정함(바늘·실 같은 잦은 소리는 작게, 피날레 공명만 크게).
  가위: ds_snip_open(벌리는 '스륵') ds_snip(날카롭게 닫히는 '싹둑' — 두 날 금속 마찰 + 짧은 맞부딪힘) ds_snip_silver(조금 높은 은빛 '싹둑')
  바늘·실: ds_needle(작은 금속 '팅' + 찌름) ds_thread(실이 팽팽히 당겨지는 '스윽 - 팅') ds_pin(금빛 핀 '딱' 고정)
  천·리본: ds_silk(실크가 휘날리는 '사르륵') ds_silk_hit(천이 스치는 짧은 '삭') ds_cloth(천이 펼쳐지는 '펄럭') ds_ribbon(리본이 감기는 '휘리릭') ds_whoosh(분신이 스쳐 가는 바람)
  무대: ds_spot(조명이 켜지는 맑은 '팅 - 반짝') ds_unfold(도면이 펼쳐지는 종이 + 낮은 울림) ds_finale(거대한 가위 '철컥' + 피날레 공명)
"""
import os, sys, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import smash_sfx as S
from smash_sfx import T, bp, lp, hp, place, SR
S.TMP = '/tmp/designer_sfx'; os.makedirs(S.TMP, exist_ok=True)
rng = np.random.default_rng(20261116)
N = lambda t: rng.standard_normal(len(t))
def norm(x, d, t, tail=0.04): x = x * np.minimum(1, (d - t) / tail); return x / (np.max(np.abs(x)) or 1)
def bell(t, fs, dc, g=1.0): return sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / (dc * k)) * g * a for f, k, a in fs)
def grains(d, n, lo, hi, amp=1.0, dec=0.2, L=(0.002, 0.007)):
    t = T(d); g = np.zeros(len(t))
    for _ in range(n):
        at = rng.uniform(lo, hi); m = int(SR * rng.uniform(*L)); place(g, rng.standard_normal(m) * np.exp(-np.arange(m) / (m * 0.3)), at, amp * rng.uniform(0.3, 1) * np.exp(-(at - lo) / dec))
    return g
def snip_open():
    d = 0.22; t = T(d); x = bp(N(t), 2500, 8000) * np.minimum(1, t / 0.04) * np.exp(-np.maximum(0, t - 0.06) / 0.05) * 0.6 + bell(t, [(3100, 1, 0.2)], 0.05) * 0.2
    return norm(x, d, t, 0.04)
def snip(hi=1.0):
    d = 0.32; t = T(d)
    scrape = bp(N(t), 3000 * hi, 9500) * np.minimum(1, t / 0.01) * np.exp(-t / 0.035) * 0.9          # 두 날이 스치며 닫힘
    clack = hp(N(t), 1800) * np.exp(-np.maximum(0, t - 0.03) / 0.004) * (t > 0.03) * 1.6                # 날 끝 맞부딪힘
    ring = bell(t, [(2350 * hi, 1, 0.5), (3520 * hi, 0.7, 0.35), (5270 * hi, 0.45, 0.2)], 0.09) * (t > 0.03) * 0.45
    return norm(np.tanh(scrape + clack + ring), d, t, 0.05)
def needle():
    d = 0.22; t = T(d); x = bell(t, [(4186, 1, 0.6), (6272, 0.6, 0.3)], 0.05) * np.minimum(1, t / 0.001) + hp(N(t), 5000) * np.exp(-t / 0.003) * 0.5
    return norm(x, d, t, 0.04)
def thread():
    d = 0.45; t = T(d); f = 900 + 1700 * np.clip(t / 0.28, 0, 1)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.05) * np.exp(-np.maximum(0, t - 0.28) / 0.04) * 0.3 + bp(N(t), 2000, 7000) * np.minimum(1, t / 0.08) * np.exp(-np.maximum(0, t - 0.25) / 0.05) * 0.4
    x += bell(t - 0.28, [(2637, 1, 0.5)], 0.08) * (t > 0.28) * 0.6
    return norm(x, d, t, 0.06)
def pin():
    d = 0.3; t = T(d); x = hp(N(t), 2500) * np.exp(-t / 0.004) * 1.3 + bell(t, [(1760, 1, 0.5), (2637, 0.7, 0.35), (3951, 0.5, 0.2)], 0.12) * 0.5
    return norm(np.tanh(x), d, t, 0.06)
def silk():
    d = 0.5; t = T(d); env = np.sin(np.pi * np.clip(t / 0.45, 0, 1)) ** 1.5
    x = bp(N(t), 1500, 9000) * env * (0.7 + 0.3 * np.sin(2 * np.pi * 9 * t)) + bp(grains(d, 30, 0.05, 0.4, 0.3, 0.4), 4000, 10000) * 0.25
    return norm(x, d, t, 0.06)
def silk_hit():
    d = 0.16; t = T(d); x = bp(N(t), 1800, 8000) * np.exp(-t / 0.025) * np.minimum(1, t / 0.004)
    return norm(x, d, t, 0.03)
def cloth():
    d = 0.42; t = T(d); flaps = sum(np.exp(-((t - c) / 0.018) ** 2) for c in (0.05, 0.12, 0.2, 0.27)) * np.exp(-t / 0.3)
    x = bp(N(t), 300, 3500) * flaps * 1.2 + lp(N(t), 600) * np.exp(-t / 0.05) * 0.3
    return norm(np.tanh(x), d, t, 0.06)
def ribbon():
    d = 0.6; t = T(d); env = np.minimum(1, t / 0.08) * np.exp(-np.maximum(0, t - 0.25) / 0.15)
    x = bp(N(t), 900, 6000) * env * (0.6 + 0.4 * np.sin(2 * np.pi * (6 + 10 * t) * t)) + bell(t, [(1568, 1, 0.2), (2093, 0.8, 0.15)], 0.25) * np.minimum(1, t / 0.1) * 0.25
    return norm(x, d, t, 0.08)
def whoosh():
    d = 0.32; t = T(d); env = np.exp(-((t - 0.13) / 0.06) ** 2)
    x = bp(N(t), 500, 4500) * env
    return norm(x, d, t, 0.04)
def spot():
    d = 0.7; t = T(d); x = bell(t, [(2093, 1, 0.5), (2637, 0.9, 0.4), (3136, 0.8, 0.3), (4186, 0.6, 0.2)], 0.25) * np.minimum(1, t / 0.004) + bp(grains(d, 20, 0.05, 0.5, 0.25, 0.4), 5000, 11000) * 0.3
    return norm(x, d, t, 0.15)
def unfold():
    d = 0.8; t = T(d); paper = bp(grains(d, 50, 0.0, 0.5, 0.8, 0.5, (0.003, 0.012)), 1200, 6000)
    x = paper * 0.6 + np.sin(2 * np.pi * 110 * t) * np.minimum(1, t / 0.2) * np.exp(-np.maximum(0, t - 0.3) / 0.25) * 0.4 + bell(t, [(880, 1, 0.2), (1320, 0.8, 0.15)], 0.4) * np.minimum(1, t / 0.3) * 0.3
    return norm(x, d, t, 0.12)
def finale():
    d = 1.6; t = T(d)
    clack = snip(0.85); x = np.zeros(len(t)); place(x, clack, 0.0, 1.0)
    boom = lp(N(t), 220) * np.exp(-t / 0.08) * 1.2 + np.sin(2 * np.pi * 58 * t) * np.exp(-t / 0.25) * 0.8
    reso = bell(t, [(523, 1, 0.6), (784, 0.9, 0.5), (1046, 0.8, 0.45), (1568, 0.6, 0.3), (2093, 0.45, 0.2)], 0.55) * np.minimum(1, t / 0.02) * 0.6
    sh = bp(grains(d, 50, 0.02, 0.9, 0.35, 0.5), 4000, 11000) * 0.3
    return norm(np.tanh(x * 0.9 + boom + reso + sh), d, t, 0.25)

# ---- fx2(2026-11-17) 그림 순간 소리 다섯: Runway(tools/audio/designer_runway_sfx.py)가 하루 작업 한도에 걸려 우선 합성. Runway 가 되면 --run 이 같은 이름으로 덮어씀.
def sparkle():   # 명중 '팡' 별: 높은 종 셋이 빠르게 + 반짝 알갱이
    d = 0.5; t = T(d); x = np.zeros(len(t))
    for k, (f0, at) in enumerate(((2637, 0.0), (3520, 0.04), (4699, 0.08))): x += bell(t - at, [(f0, 1, 0.6), (f0 * 1.5, 0.6, 0.25)], 0.12) * (t > at) * (0.8 - 0.15 * k)
    x += bp(grains(d, 26, 0.0, 0.35, 0.45, 0.2), 6000, 12000) * 0.35
    return norm(x, d, t, 0.1)
def sigil():     # 마법진: 낮은 울림이 올라오며 맑은 종 화음
    d = 0.9; t = T(d); f = 220 + 220 * np.clip(t / 0.6, 0, 1)
    hum = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.15) * np.exp(-np.maximum(0, t - 0.55) / 0.2) * 0.35
    ch = bell(t - 0.25, [(1318, 1, 0.4), (1661, 0.9, 0.35), (1976, 0.8, 0.3), (2637, 0.6, 0.2)], 0.35) * (t > 0.25) * 0.5
    sh = bp(grains(d, 30, 0.1, 0.7, 0.3, 0.4), 5000, 11000) * 0.25
    return norm(hum + ch + sh, d, t, 0.15)
def jewel():     # 보석 반짝: 아주 맑은 '팅' + 높은 배음
    d = 0.6; t = T(d); x = bell(t, [(3136, 1, 0.6), (4699, 0.8, 0.4), (6272, 0.6, 0.25), (7902, 0.4, 0.15)], 0.18) * np.minimum(1, t / 0.002) + hp(N(t), 7000) * np.exp(-t / 0.004) * 0.3
    return norm(x, d, t, 0.12)
def mannequin(): # 마네킹: 나무 '똑' 두 번 + 반짝 퐁
    d = 0.6; t = T(d); x = np.zeros(len(t))
    for at in (0.0, 0.09): x += bp(N(t), 600, 2500) * np.exp(-np.maximum(0, t - at) / 0.012) * (t > at) * 0.9 + np.sin(2 * np.pi * 420 * (t - at)) * np.exp(-np.maximum(0, t - at) / 0.03) * (t > at) * 0.5
    f = 600 + 900 * np.clip((t - 0.18) / 0.15, 0, 1); x += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-np.maximum(0, t - 0.18) / 0.08) * (t > 0.18) * 0.4
    x += bp(grains(d, 18, 0.2, 0.5, 0.3, 0.25), 5000, 11000) * 0.3
    return norm(np.tanh(x), d, t, 0.1)
def flashbulb(): # 런웨이 카메라 플래시: 셔터 '찰칵' 여러 번 + 플래시 '팝' + 반짝
    d = 0.7; t = T(d); x = np.zeros(len(t))
    for at in (0.0, 0.09, 0.16, 0.3, 0.41):
        x += hp(N(t), 2500) * np.exp(-np.maximum(0, t - at) / 0.005) * (t > at) * 0.9 + bp(N(t), 300, 1800) * np.exp(-np.maximum(0, t - at - 0.012) / 0.02) * (t > at + 0.012) * 0.5
    x += bp(grains(d, 24, 0.05, 0.6, 0.3, 0.3), 6000, 12000) * 0.3
    return norm(np.tanh(x), d, t, 0.1)

ALL = dict(snip_open=snip_open, snip=snip, snip_silver=lambda: snip(1.22), needle=needle, thread=thread, pin=pin, silk=silk, silk_hit=silk_hit, cloth=cloth,
           ribbon=ribbon, whoosh=whoosh, spot=spot, unfold=unfold, finale=finale, sparkle=sparkle, sigil=sigil, jewel=jewel, mannequin=mannequin, flashbulb=flashbulb)
if __name__ == '__main__':
    # 인자 없이 = 전부(주의: 2026-11-17부터 14개는 Runway 소리 — 다시 돌리면 합성음으로 덮어씀), 인자 = 그 이름만(예: sparkle sigil jewel mannequin flashbulb)
    names = sys.argv[1:] or list(ALL)
    for name in names: S.save('sfx_ds_' + name, ALL[name]())
    p = os.path.join(S.OUT, 'designer-sfx-credits.json'); c = json.load(open(p)) if os.path.exists(p) else {}
    c.update({'provider': 'synthesized (tools/audio/designer_sfx.py, numpy + scipy, fixed seed)', 'generatedOn': c.get('generatedOn', '2026-11-16')})
    c.setdefault('note', '디자이너 2차 스킬. 직접 합성 — 같은 이름의 파일로 바꿔 넣으면 교체됨.')
    c['assets'] = sorted(set(c.get('assets', [])) | {'sfx_ds_%s.mp3' % n for n in names})
    json.dump(c, open(p, 'w'), ensure_ascii=False, indent=2)
