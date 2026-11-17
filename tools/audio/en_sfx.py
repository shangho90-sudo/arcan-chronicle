"""엔지니어 2차 스킬 효과음 12개를 합성한다 (numpy + scipy, ffmpeg로 MP3). 2026-11-16.

Usage:  python3 tools/audio/en_sfx.py [이름 ...]  ->  assets/audio/sfx_en_*.mp3 (+ /tmp/en_sfx/*.wav)

Runway 크레딧이 없어 tools/audio/smith_sfx.py 와 같은 도구(시드 고정)로 직접 합성. 소리 정체성: 잠금 '철컥'·모터 '위잉'·
급탄·금속 반동·축전 '징—'·배기 '푸슉'. 동시 사격이 겹쳐도 시끄럽지 않게 짧고 작게(음량은 js/io.js EN_GAIN, 간격은 gap).
  en_lock     잠금·전개: 작은 금속 '철컥' 두 번
  en_motor    모터 가동: 짧게 올라가는 '위잉'
  en_shot     센트리·드론·기관포 한 발: 짧고 마른 '탕'(작게)
  en_pile     파일 벙커: 피스톤 '쉭' + 강철 말뚝 '쾅' + 금속 울림
  en_cannon   브리치 캐논·워커 주포: 낮은 '쿵' + 넓은 폭발음 + 증기
  en_missile  미사일 발사: '슈욱'
  en_pop      작은 폭발: '퍽'
  en_charge   축전: 올라가는 전기 '징—'
  en_rail     레일캐논 발사: 날카로운 '찌잉' + 쿵
  en_zap      테슬라 감전: 짧은 '찌직'
  en_weld     용접 불꽃: 지글 '츠츳'
  en_exhaust  배기: '푸슉' 증기
  en_drop     워커 동력 코어 착지: 묵직한 '쿵' + 금속 울림
"""
import os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import smith_sfx as B
from smith_sfx import T, bp, lp, hp, noise, place, fin, metal, thud, click, save
B.TMP = '/tmp/en_sfx'; os.makedirs(B.TMP, exist_ok=True)
B.rng = np.random.default_rng(1117)

def sweep(t, f0, f1, d):
    f = f0 + (f1 - f0) * np.minimum(1, t / d); return np.sin(2 * np.pi * np.cumsum(f) / B.SR)
def en_lock():
    d = 0.25; t = T(d); x = click(t, 2000, 9000, 0.008, 1.0) + metal(t, 1900, 0.04, 0.4)
    place(x, click(T(0.08), 2500, 10000, 0.006, 0.9) + metal(T(0.08), 2400, 0.03, 0.35), 0.07, 1.0)
    return fin(x, d) * 0.8
def en_motor():
    d = 0.45; t = T(d); s = sweep(t, 120, 420, 0.35); x = (np.sign(s) * 0.3 + s) * np.minimum(1, t / 0.05) * np.exp(-np.maximum(0, t - 0.3) / 0.06)
    x = bp(x, 150, 3000) + bp(noise(len(t)), 800, 3000) * 0.08 * np.minimum(1, t / 0.05) * np.exp(-t / 0.3)
    return fin(x, d) * 0.6
def en_shot():
    d = 0.2; t = T(d); x = click(t, 1000, 8000, 0.01, 1.2) + thud(t, 180, 90, 0.03, 0.6) + bp(noise(len(t)), 600, 4000) * np.exp(-t / 0.04) * 0.5
    return fin(x, d) * 0.7
def en_pile():
    d = 0.8; t = T(d); x = hp(noise(len(t)), 3000) * np.exp(-t / 0.05) * 0.3
    k = np.zeros_like(t); place(k, thud(T(0.6), 110, 40, 0.12, 1.6) + click(T(0.6), 1500, 9000, 0.015, 1.2) + metal(T(0.6), 620, 0.25, 0.6), 0.12, 1.0)
    return fin(x + k, d)
def en_cannon():
    d = 1.0; t = T(d); x = thud(t, 90, 32, 0.2, 1.6) + lp(noise(len(t)), 900) * np.exp(-t / 0.16) * 1.1 + click(t, 800, 6000, 0.02, 0.8)
    x += hp(noise(len(t)), 2500) * np.exp(-np.maximum(0, t - 0.15) / 0.2) * (t > 0.15) * 0.18
    return fin(x, d)
def en_missile():
    d = 0.5; t = T(d); x = bp(noise(len(t)), 700, 5000) * np.minimum(1, t / 0.03) * np.exp(-t / 0.18) * 0.9 + click(t, 1500, 6000, 0.01, 0.4)
    return fin(x, d) * 0.6
def en_pop():
    d = 0.45; t = T(d); x = thud(t, 160, 60, 0.06, 1.1) + lp(noise(len(t)), 1800) * np.exp(-t / 0.07) * 0.9 + click(t, 1200, 7000, 0.01, 0.5)
    return fin(x, d) * 0.75
def en_charge():
    d = 0.9; t = T(d); s = sweep(t, 220, 1500, 0.85); x = (s + 0.4 * np.sign(s)) * np.minimum(1, t / 0.6) * 0.5 * np.exp(-np.maximum(0, t - 0.85) / 0.03)
    x = bp(x, 200, 6000) + bp(noise(len(t)), 3000, 9000) * 0.06 * np.minimum(1, t / 0.8)
    return fin(x, d) * 0.55
def en_rail():
    d = 0.8; t = T(d); s = sweep(t, 2600, 900, 0.3); x = s * np.exp(-t / 0.18) * 0.7 + thud(t, 150, 60, 0.08, 1.0) + click(t, 2000, 12000, 0.012, 1.2)
    x += bp(noise(len(t)), 2000, 9000) * np.exp(-t / 0.1) * 0.6
    return fin(x, d) * 0.85
def en_zap():
    d = 0.3; t = T(d); sq = np.sign(np.sin(2 * np.pi * (70 + 30 * np.sin(2 * np.pi * 41 * t)) * t))
    x = bp(noise(len(t)) * (0.5 + 0.5 * sq), 1500, 9000) * np.exp(-t / 0.07)
    return fin(x, d) * 0.6
def en_weld():
    d = 0.4; t = T(d); x = hp(noise(len(t)), 3000) * (0.6 + 0.4 * (np.random.default_rng(3).random(len(t)) > 0.97)) * np.exp(-t / 0.15) * 0.5
    return fin(x, d) * 0.6
def en_exhaust():
    d = 0.7; t = T(d); x = bp(noise(len(t)), 400, 6000) * np.minimum(1, t / 0.02) * np.exp(-t / 0.22) + thud(t, 90, 60, 0.05, 0.3)
    return fin(x, d) * 0.7
def en_drop():
    d = 1.0; t = T(d); x = thud(t, 80, 30, 0.25, 1.7) + metal(t, 330, 0.5, 0.5) + click(t, 900, 6000, 0.02, 0.7) + lp(noise(len(t)), 500) * np.exp(-t / 0.2) * 0.5
    return fin(x, d)

# --- fx2(2026-11-17): 그림에만 있는 순간(js/engfx.js snd). Runway 일일 작업 한도에 걸려 합성으로 먼저 만듦 — tools/audio/en_runway_sfx.py --run 이 같은 이름을 덮어씀
def en_deploy():   # 접힌 장치가 펼쳐짐: 스프링 '팅' + 철컥 세 번
    d = 0.5; t = T(d); x = sweep(t, 900, 1700, 0.08) * np.exp(-t / 0.05) * 0.25
    for k, at in enumerate((0.04, 0.16, 0.27)): place(x, click(T(0.1), 1800 + 300 * k, 9000, 0.008, 0.9) + metal(T(0.1), 1500 + 250 * k, 0.05, 0.35), at, 1.0)
    return fin(x, d) * 0.75
def en_assemble():  # 장갑·다리가 차례로 결합: 쿵·철컥 네 번 + 유압 위잉
    d = 1.3; t = T(d); s = sweep(t, 90, 260, 1.2); x = bp(s + 0.3 * np.sign(s), 80, 1500) * 0.18 * np.minimum(1, t / 0.1) * np.exp(-np.maximum(0, t - 1.1) / 0.08)
    for k, at in enumerate((0.05, 0.35, 0.65, 0.95)): place(x, thud(T(0.3), 140 - 15 * k, 60, 0.06, 0.8) + click(T(0.3), 1200, 7000, 0.012, 0.7) + metal(T(0.3), 520 + 80 * k, 0.12, 0.35), at, 1.0)
    return fin(x, d) * 0.8
def en_vent():      # 냉각판 열림: 철컥 + 짧은 증기 + 삑
    d = 0.6; t = T(d); x = click(t, 1500, 8000, 0.01, 0.8) + bp(noise(len(t)), 1500, 8000) * np.minimum(1, t / 0.02) * np.exp(-t / 0.16) * 0.6
    place(x, np.sin(2 * np.pi * 1760 * T(0.09)) * 0.25, 0.32, 1.0)
    return fin(x, d) * 0.7
def en_target():    # 조준 고정: 삑삑 + 확정음
    d = 0.5; t = T(d); x = np.zeros_like(t)
    for k, (at, f) in enumerate(((0.0, 1500), (0.09, 1900), (0.2, 2400))): place(x, np.sin(2 * np.pi * f * T(0.07 if k < 2 else 0.2)) * np.exp(-T(0.07 if k < 2 else 0.2) / (0.03 if k < 2 else 0.09)) * 0.4, at, 1.0)
    return fin(x, d) * 0.7
def en_whistle():   # 궤도 포탄 낙하: 내려가는 휘파람 + 낮은 전기 웅
    d = 1.0; t = T(d); s = sweep(t, 2400, 700, 0.95); x = s * 0.25 * np.minimum(1, t / 0.2) * np.exp(-np.maximum(0, t - 0.85) / 0.05) + np.sin(2 * np.pi * 110 * t) * 0.08 * np.minimum(1, t / 0.5)
    return fin(x, d) * 0.6
def en_core():      # 작은 청색 코어가 날아와 들어감: 쉭 + 맑은 딩
    d = 0.5; t = T(d); x = bp(noise(len(t)), 2000, 8000) * np.minimum(1, t / 0.15) * np.exp(-t / 0.2) * 0.25
    place(x, metal(T(0.35), 1320, 0.18, 0.5, ratios=(1.0, 2.0, 3.0)), 0.18, 1.0)
    return fin(x, d) * 0.7
def en_alarm():     # 과부하 경보: 삐-삐 + 엔진 회전
    d = 0.9; t = T(d); s = sweep(t, 150, 520, 0.8); x = bp(s + 0.4 * np.sign(s), 100, 2500) * 0.25 * np.minimum(1, t / 0.05)
    for at in (0.0, 0.28): place(x, np.sign(np.sin(2 * np.pi * 980 * T(0.18))) * 0.18 * np.exp(-T(0.18) / 0.12), at, 1.0)
    return fin(x, d) * 0.7
def en_craft():     # 설계도 위에서 부품 결합: 미끄러짐·딸깍 셋 + 반짝 종소리
    d = 1.3; t = T(d); x = np.zeros_like(t)
    for k, at in enumerate((0.1, 0.35, 0.6)): place(x, bp(noise(int(B.SR * 0.12)), 1500, 5000) * np.exp(-T(0.12) / 0.05) * 0.3 + click(T(0.12), 2200, 9000, 0.008, 0.8), at, 1.0)
    place(x, metal(T(0.6), 1568, 0.3, 0.45, ratios=(1.0, 2.0, 2.99, 4.01)), 0.72, 1.0)
    return fin(x, d) * 0.75

NAMES = ['en_lock', 'en_motor', 'en_shot', 'en_pile', 'en_cannon', 'en_missile', 'en_pop', 'en_charge', 'en_rail', 'en_zap', 'en_weld', 'en_exhaust', 'en_drop',
         'en_deploy', 'en_assemble', 'en_vent', 'en_target', 'en_whistle', 'en_core', 'en_alarm', 'en_craft']
if __name__ == '__main__':
    for n in (sys.argv[1:] or NAMES): save('sfx_' + n, globals()[n]())
