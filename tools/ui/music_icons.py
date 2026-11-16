"""음악가 2차 스킬 아이콘 15개 (128 px, 원형) — 2026-11-16 '마에스트로'.

Usage:  python3 tools/ui/music_icons.py [mu_a1 ...]   ->  assets/ui/skills/mu_*.png  (+ /tmp/musician/icons_sheet.png 비교표)

대장장이 아이콘(tools/ui/smith_icons.py) 틀(어두운 원 + 금테)을 불러 쓰고 스킬마다 다른 실루엣: 현(세 줄 + 파동)·심벌즈·바이올린 활·관악 나팔구·악보·
하프·나팔·첼로·플루트·지휘봉·악단. 색 역할: 현악 금·장미 / 타악 주황·금 / 관악 금 / 회복 연두 / 보호 청백 / 기력 푸른색 / 환영 보라.
"""
import math, os, sys
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from smith_icons import S, C, OUT, rot, layer, glow, shape, background, frame, mask_circle, arc, puff, WHITE
GOLD, GOLDD, ROSE, MINT, MINTD, ICE, BLUE, BLUED, VIOL, VIOLD, WOOD, WOODD, SILV, IVORY = (255, 224, 138), (210, 140, 30), (255, 170, 200), (190, 255, 160), (70, 170, 70), (220, 240, 255), (140, 200, 255), (40, 90, 220), (210, 190, 255), (110, 80, 200), (190, 100, 40), (110, 50, 18), (225, 232, 245), (250, 240, 215)

def note(img, x, y, s, col=GOLD, flag=True):
    shape(img, lambda d, c: d.ellipse([x - s * 0.55, y - s * 0.38, x + s * 0.55, y + s * 0.38], fill=c), col)
    shape(img, lambda d, c: d.line([(x + s * 0.48, y), (x + s * 0.48, y - s * 2.6)], fill=c, width=max(4, int(s * 0.18))), col)
    if flag: shape(img, lambda d, c: d.line([(x + s * 0.48, y - s * 2.6), (x + s * 1.2, y - s * 1.9), (x + s * 1.05, y - s * 1.4)], fill=c, width=max(4, int(s * 0.2)), joint='curve'), col)
def wavy(img, y, x0, x1, amp, col, w, ph=0.0, freq=2.0, gl=True):
    pts = [(x, y + amp * math.sin((x - x0) / (x1 - x0) * 6.283 * freq + ph)) for x in range(int(x0), int(x1) + 1, 6)]
    if gl: glow(img, lambda d, c: d.line(pts, fill=c, width=w * 3), col, 8, 220)
    shape(img, lambda d, c: d.line(pts, fill=c, width=w), WHITE)
def violin(img, cx, cy, s, a):
    body = []
    for i in range(36):
        t = i / 36 * 6.283; r = s * (0.55 + 0.12 * math.cos(2 * t)) ; body.append((cx + math.cos(t) * r * 0.62, cy + math.sin(t) * r * 1.05))
    p = rot(body, a, cx, cy); shape(img, lambda d, c: d.polygon(p, fill=c), WOOD)
    nk = rot([(cx - 6, cy - s * 0.9), (cx + 6, cy - s * 0.9), (cx + 6, cy - s * 1.7), (cx - 6, cy - s * 1.7)], a, cx, cy); shape(img, lambda d, c: d.polygon(nk, fill=c), (30, 20, 20))
    sc = rot([(cx, cy - s * 1.78)], a, cx, cy)[0]; shape(img, lambda d, c: d.ellipse([sc[0] - 14, sc[1] - 14, sc[0] + 14, sc[1] + 14], fill=c), WOODD)
    for k in (-1, 1): f = rot([(cx + k * s * 0.18, cy - s * 0.1), (cx + k * s * 0.22, cy + s * 0.3)], a, cx, cy); shape(img, lambda d, c, f=f: d.line(f, fill=c, width=5), (40, 20, 10))
    st = rot([(cx, cy + s * 0.75), (cx, cy - s * 1.7)], a, cx, cy); glow(img, lambda d, c: d.line(st, fill=c, width=6), GOLD, 4, 200)
def bell_shape(img, cx, cy, s, a, col=GOLD):
    p = rot([(cx - s * 0.12, cy - s * 0.9), (cx + s * 0.12, cy - s * 0.9), (cx + s * 0.25, cy), (cx + s * 0.8, cy + s * 0.6), (cx - s * 0.8, cy + s * 0.6), (cx - s * 0.25, cy)], a, cx, cy)
    glow(img, lambda d, c: d.polygon(p, fill=c), col, 10, 200); shape(img, lambda d, c: d.polygon(p, fill=c), (230, 170, 60))
    e = rot([(cx - s * 0.8, cy + s * 0.6), (cx + s * 0.8, cy + s * 0.6)], a, cx, cy); shape(img, lambda d, c: d.line(e, fill=c, width=10), (255, 240, 180))
def harp(img, cx, cy, s, col=GOLD, strings=7, lit=-1):
    shape(img, lambda d, c: d.line([(cx - s * 0.6, cy + s), (cx - s * 0.6, cy - s)], fill=c, width=16), col)
    top = [(cx - s * 0.6 + k / 10 * s * 1.3, cy - s + 0.3 * s * math.sin(k / 10 * math.pi)) for k in range(11)]; shape(img, lambda d, c: d.line(top, fill=c, width=14, joint='curve'), col)
    shape(img, lambda d, c: d.line([(cx - s * 0.5, cy + s * 0.95), (cx + s * 0.7, cy - s * 0.75)], fill=c, width=18), WOOD)
    for k in range(strings):
        x = cx - s * 0.45 + k * s * 1.1 / strings; yb = cy + s * 0.95 - (x - cx + s * 0.5) / (s * 1.2) * s * 1.7; yt = cy - s + 0.3 * s * math.sin((x - cx + s * 0.6) / (s * 1.3) * math.pi)
        if k == lit or lit == 99: glow(img, lambda d, c, x=x, yb=yb, yt=yt: d.line([(x, yb), (x, yt)], fill=c, width=10), GOLD, 6, 255)
        shape(img, lambda d, c, x=x, yb=yb, yt=yt: d.line([(x, yb), (x, yt)], fill=c, width=3), (255, 240, 200))

def a1():   # 스트링 피어스: 빛나는 현 세 줄 + 앞으로 뻗는 금빛 파동
    img = background((90, 60, 10), (14, 10, 6))
    for k in range(3): wavy(img, C - 70 + k * 60, C - 200, C + 40, 10 + k * 6, GOLD, 5, k)
    for k in range(3): arc(img, [C + 20 + k * 40, C - 120, C + 160 + k * 40, C + 120], -60, 60, GOLD, 12 - k * 2, 10)
    shape(img, lambda d, c: d.polygon([(C + 150, C - 30), (C + 230, C), (C + 150, C + 30)], fill=c), (255, 240, 180))
    return img
def a2():   # 디스코드 브레이크: 맞부딪는 두 심벌즈 + 찌그러진 원형 음파 + 깨진 오선
    img = background((110, 50, 10), (16, 8, 6))
    pts = [(C + (175 + 18 * math.sin(k * 0.9)) * math.cos(k / 40 * 6.283), C + (175 + 18 * math.sin(k * 0.9)) * math.sin(k / 40 * 6.283)) for k in range(41)]
    glow(img, lambda d, c: d.line(pts, fill=c, width=14), (255, 160, 60), 10, 255)
    for sg in (-1, 1):
        x = C + sg * 46; shape(img, lambda d, c, x=x: d.ellipse([x - 26, C - 110, x + 26, C + 110], fill=c), (240, 180, 70)); shape(img, lambda d, c, x=x: d.ellipse([x - 10, C - 30, x + 10, C + 30], fill=c), (255, 236, 170))
    glow(img, lambda d, c: d.ellipse([C - 26, C - 26, C + 26, C + 26], fill=c), WHITE, 18, 255)
    for k in range(3): shape(img, lambda d, c, k=k: d.line([(C - 190 + k * 20, C + 150 + k * 12), (C - 120 + k * 20, C + 130 + k * 12)], fill=c, width=4), GOLD)
    return img
def a3():   # 크레셴도 러시: 바이올린 활 + 점점 커지는 초승달 파동
    img = background((90, 30, 50), (14, 6, 10))
    for k in range(4): arc(img, [C - 60 + k * 50 - 40 - k * 14, C - 50 - k * 22, C - 60 + k * 50 + 40 + k * 14, C + 50 + k * 22], -70, 70, ROSE if k < 3 else GOLD, 6 + k * 3, 8)
    shape(img, lambda d, c: d.line([(C - 200, C + 170), (C + 120, C - 180)], fill=c, width=10), WOODD)
    shape(img, lambda d, c: d.line([(C - 185, C + 185), (C + 135, C - 165)], fill=c, width=4), IVORY)
    return img
def a4():   # 레조넌스 버스트: 가운데를 향한 나팔구 4개 + 부푼 공명막
    img = background((100, 70, 10), (14, 10, 6))
    glow(img, lambda d, c: d.ellipse([C - 70, C - 70, C + 70, C + 70], fill=c), GOLD, 30, 200); shape(img, lambda d, c: d.ellipse([C - 50, C - 50, C + 50, C + 50], outline=c, width=8), WHITE)
    for k in range(4): a = k * math.pi / 2 + math.pi / 4; bell_shape(img, C + math.cos(a) * 165, C + math.sin(a) * 165, 70, a + math.pi / 2)
    return img
def a5():   # 종악장: 파멸의 코다 — 거대한 악보 + 내려오는 지휘봉 + 앞으로 퍼지는 화음
    img = background((60, 30, 70), (10, 6, 14))
    shape(img, lambda d, c: d.rounded_rectangle([C - 200, C - 170, C + 160, C + 20], 18, fill=c), (250, 240, 215))
    for k in range(5): shape(img, lambda d, c, k=k: d.line([(C - 180, C - 130 + k * 26), (C + 140, C - 130 + k * 26)], fill=c, width=4), (80, 60, 90))
    for k in range(5): note(img, C - 140 + k * 60, C - 30 - (k % 3) * 26, 18, GOLD if k < 4 else WHITE)
    for k in range(3): arc(img, [C - 160 + k * 30, C + 20 + k * 20, C + 200 - k * 30, C + 260 - k * 10], 200, 340, GOLD, 10, 10)
    glow(img, lambda d, c: d.line([(C + 210, C - 200), (C + 60, C + 120)], fill=c, width=12), WHITE, 6, 255)
    return img
def b1():   # 생명의 아리아: 작은 하프 + 연두 음표
    img = background((30, 90, 20), (6, 14, 6)); harp(img, C - 20, C + 10, 150, GOLD, 7, 3)
    note(img, C + 150, C - 60, 22, MINT); note(img, C + 120, C + 110, 18, MINT)
    return img
def b2():   # 영웅의 행진: 금빛 나팔 + 화살깃 박자선
    img = background((100, 70, 0), (14, 10, 4))
    for k in range(3): shape(img, lambda d, c, k=k: d.line([(C - 190 + k * 70, C + 120), (C - 150 + k * 70, C + 160), (C - 190 + k * 70, C + 200)], fill=c, width=12), GOLD)
    shape(img, lambda d, c: d.line([(C - 170, C - 20), (C + 60, C - 20)], fill=c, width=22), (230, 170, 60))
    bell_shape(img, C + 120, C - 20, 110, -math.pi / 2)
    for k in range(3): shape(img, lambda d, c, k=k: d.rectangle([C - 80 + k * 36, C - 70, C - 64 + k * 36, C - 30], fill=c), (255, 236, 170))
    return img
def b3():   # 수호의 코랄: 첼로 + 몸 둘레 청백 오선 띠
    img = background((20, 50, 90), (6, 10, 18))
    for k in range(4): shape(img, lambda d, c, k=k: d.ellipse([C - 200, C - 60 + k * 30, C + 200, C + 60 + k * 30], outline=c, width=4), ICE)
    violin(img, C, C + 40, 150, 0.0)
    shape(img, lambda d, c: d.line([(C - 170, C + 60), (C + 170, C + 90)], fill=c, width=8), WOODD)
    return img
def b4():   # 월광 세레나데: 은빛 플루트 + 초승달 + 푸른 음표
    img = background((20, 40, 100), (6, 8, 20))
    shape(img, lambda d, c: d.line([(C - 200, C + 100), (C + 200, C - 40)], fill=c, width=26), SILV)
    for k in range(6): shape(img, lambda d, c, k=k: d.ellipse([C - 110 + k * 50 - 8, C + 62 - k * 18 - 22, C - 110 + k * 50 + 8, C + 62 - k * 18 - 6], fill=c), (255, 236, 170))
    glow(img, lambda d, c: d.ellipse([C + 20, C - 200, C + 170, C - 50], fill=c), BLUE, 14, 220); shape(img, lambda d, c: d.ellipse([C + 20, C - 200, C + 170, C - 50], fill=c), ICE); shape(img, lambda d, c: d.ellipse([C + 60, C - 220, C + 200, C - 80], fill=c), (12, 20, 50))
    note(img, C - 120, C - 60, 22, BLUE)
    return img
def b5():   # 앙코르: 불멸의 선율 — 큰 하프 현 + 두 팔을 올린 실루엣 + 이어지는 오선
    img = background((40, 90, 50), (6, 14, 10)); harp(img, C, C, 200, GOLD, 9, 99)
    shape(img, lambda d, c: d.polygon([(C - 30, C + 210), (C + 30, C + 210), (C + 40, C + 80), (C - 40, C + 80)], fill=c), (30, 60, 40))
    shape(img, lambda d, c: d.ellipse([C - 28, C + 22, C + 28, C + 78], fill=c), (30, 60, 40))
    for sg in (-1, 1): shape(img, lambda d, c, sg=sg: d.line([(C + sg * 34, C + 100), (C + sg * 110, C - 20)], fill=c, width=18), (30, 60, 40))
    glow(img, lambda d, c: d.ellipse([C - 120, C - 60, C + 120, C + 20], outline=c, width=10), MINT, 12, 255)
    return img
def c1():   # 에코 리프라이즈: 지휘하는 실루엣 + 뒤의 은빛 잔상
    img = background((40, 40, 80), (8, 8, 16))
    for off, col in ((60, (90, 100, 160)), (0, (210, 220, 255))):
        x = C - off; shape(img, lambda d, c, x=x: d.ellipse([x - 30, C - 150, x + 30, C - 90], fill=c), col); shape(img, lambda d, c, x=x: d.polygon([(x - 50, C + 150), (x + 50, C + 150), (x + 40, C - 80), (x - 40, C - 80)], fill=c), col)
        shape(img, lambda d, c, x=x: d.line([(x + 40, C - 60), (x + 110, C - 140), (x + 170, C - 190)], fill=c, width=10), col)
    arc(img, [C + 40, C - 160, C + 220, C + 20], -60, 60, SILV, 8, 8)
    return img
def c2():   # 공명 하프: 바닥 고리 위의 금빛 하프 틀
    img = background((90, 70, 20), (12, 10, 6))
    glow(img, lambda d, c: d.ellipse([C - 210, C + 90, C + 210, C + 190], outline=c, width=10), GOLD, 8, 255)
    harp(img, C, C - 10, 140, GOLD, 7, 99)
    return img
def c3():   # 팬텀 트리오: 바이올린·첼로·플루트를 든 환영 셋
    img = background((50, 30, 90), (8, 6, 16))
    for k, x in enumerate((C - 140, C, C + 140)):
        y = C + (40 if k != 1 else -10); shape(img, lambda d, c, x=x, y=y: d.ellipse([x - 28, y - 120, x + 28, y - 64], fill=c), (220, 210, 255)); shape(img, lambda d, c, x=x, y=y: d.polygon([(x - 46, y + 110), (x + 46, y + 110), (x + 34, y - 60), (x - 34, y - 60)], fill=c), (180, 160, 240))
    violin(img, C - 120, C + 10, 50, 0.6); violin(img, C + 30, C + 40, 70, 0.0)
    shape(img, lambda d, c: d.line([(C + 100, C - 30), (C + 230, C - 60)], fill=c, width=12), SILV)
    for k in range(3): note(img, C - 80 + k * 80, C - 170, 14, VIOL)
    return img
def c4():   # 마에스트로의 청음: 귀 옆 소리굽쇠 + 금빛 악센트 파동
    img = background((70, 50, 20), (10, 8, 6))
    shape(img, lambda d, c: d.line([(C, C + 180), (C, C + 40)], fill=c, width=16), SILV)
    for sg in (-1, 1): shape(img, lambda d, c, sg=sg: d.line([(C, C + 40), (C + sg * 40, C), (C + sg * 40, C - 170)], fill=c, width=16), SILV)
    for k in range(3): arc(img, [C - 120 - k * 40, C - 200 - k * 20, C + 120 + k * 40, C + 40 + k * 20], 200, 340, GOLD, 8, 8)
    shape(img, lambda d, c: d.polygon([(C + 150, C - 120), (C + 170, C - 70), (C + 220, C - 60), (C + 175, C - 40), (C + 185, C + 10), (C + 150, C - 20), (C + 115, C + 10), (C + 125, C - 40), (C + 80, C - 60), (C + 130, C - 70)], fill=c), GOLD)
    return img
def c5():   # 그랜드 심포니: 반원 악단(점 연주자 + 악기) + 지휘봉 + 별
    img = background((40, 20, 80), (6, 4, 14))
    for k in range(7):
        a = math.pi + k / 6 * math.pi; x, y = C + math.cos(a) * 170, C + 60 + math.sin(a) * 120
        glow(img, lambda d, c, x=x, y=y: d.ellipse([x - 26, y - 26, x + 26, y + 26], fill=c), VIOL, 10, 220); shape(img, lambda d, c, x=x, y=y: d.ellipse([x - 16, y - 16, x + 16, y + 16], fill=c), (240, 230, 255))
    glow(img, lambda d, c: d.line([(C - 40, C + 190), (C + 40, C - 20)], fill=c, width=10), WHITE, 6, 255)
    for k in range(4): shape(img, lambda d, c, k=k: d.polygon([(C - 150 + k * 100, C - 180), (C - 140 + k * 100, C - 160), (C - 120 + k * 100, C - 158), (C - 138 + k * 100, C - 146), (C - 132 + k * 100, C - 126), (C - 150 + k * 100, C - 138), (C - 168 + k * 100, C - 126), (C - 162 + k * 100, C - 146), (C - 180 + k * 100, C - 158), (C - 160 + k * 100, C - 160)], fill=c), GOLD)
    return img

ICONS = {f'mu_{k}': f for k, f in (('a1', a1), ('a2', a2), ('a3', a3), ('a4', a4), ('a5', a5), ('b1', b1), ('b2', b2), ('b3', b3), ('b4', b4), ('b5', b5), ('c1', c1), ('c2', c2), ('c3', c3), ('c4', c4), ('c5', c5))}
if __name__ == '__main__':
    names = sys.argv[1:] or list(ICONS); out = []
    for n in names:
        img = ICONS[n](); frame(img); img = mask_circle(img).resize((128, 128), Image.LANCZOS)
        img.save(os.path.join(OUT, n + '.png')); out.append(img); print(n)
    os.makedirs('/tmp/musician', exist_ok=True)
    sheet = Image.new('RGBA', (5 * 136, ((len(out) + 4) // 5) * 136), (40, 36, 48, 255))
    for i, im in enumerate(out): sheet.alpha_composite(im, ((i % 5) * 136 + 4, (i // 5) * 136 + 4))
    sheet.save('/tmp/musician/icons_sheet.png')
