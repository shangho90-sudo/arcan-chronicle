"""엔지니어 2차 스킬 아이콘 15개 (128 px, 원형) — 2026-11-16.

Usage:  python3 tools/ui/en_icons.py [en_a1 ...]   ->  assets/ui/skills/en_*.png  (+ /tmp/engineer/icons_sheet.png 비교표)

대장장이 아이콘(tools/ui/smith_icons.py)과 같은 틀(어두운 원형 바탕 + 금테)에 스킬마다 다른 실루엣:
포탑·거미 지뢰·드론 편대·테슬라 코일·보행 병기·피스톤 말뚝·짧은 캐논·미사일 포드·레일건·포격 조준점·설계도·모듈·정비 공구·청색 코어·과부하 코어.
색 역할: 청색·청록(일반 가동·정비) · 주황·금(실탄·폭발) · 청백(전자기) · 주황 코어 + 붉은 경고등(과부하). PIL만 씀.
"""
import math, os, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from smith_icons import rot, glow, shape, background, frame, mask_circle, OUT, C
STEEL, STEELD, STEELL, COPPER, COPPERD = (150, 166, 186), (70, 80, 96), (210, 222, 236), (214, 130, 70), (130, 70, 36)
TEAL, BLUE, ICE, WHITE, ORANGE, GOLD, RED, LEATHER = (90, 230, 210), (80, 170, 255), (200, 236, 255), (250, 252, 255), (255, 150, 60), (255, 210, 122), (255, 70, 60), (140, 92, 60)

def poly(img, pts, col, g=None, blur=10):
    if g: glow(img, lambda d, c: d.polygon(pts, fill=c), g, blur, 170)
    shape(img, lambda d, c: d.polygon(pts, fill=c), col)
def box(img, x0, y0, x1, y1, col, a=0.0, cx=None, cy=None, g=None):
    cx = (x0 + x1) / 2 if cx is None else cx; cy = (y0 + y1) / 2 if cy is None else cy
    poly(img, rot([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], a, cx, cy), col, g)
def disc(img, x, y, r, col, g=None, blur=10):
    if g: glow(img, lambda d, c: d.ellipse([x - r * 1.6, y - r * 1.6, x + r * 1.6, y + r * 1.6], fill=c), g, blur, 200)
    shape(img, lambda d, c: d.ellipse([x - r, y - r, x + r, y + r], fill=c), col)
def line(img, pts, col, w, g=None, blur=8):
    if g: glow(img, lambda d, c: d.line(pts, fill=c, width=w * 2), g, blur, 220)
    shape(img, lambda d, c: d.line(pts, fill=c, width=w), col)
def ring(img, x, y, r, col, w, g=None):
    if g: glow(img, lambda d, c: d.ellipse([x - r, y - r, x + r, y + r], outline=c, width=w * 2), g, 8, 220)
    shape(img, lambda d, c: d.ellipse([x - r, y - r, x + r, y + r], outline=c, width=w), col)
def bolt(img, pts, col=ICE, w=8): line(img, pts, WHITE, w, col, 12)
def coil(img, x, y, w, h, n, col=COPPER):
    for i in range(n): yy = y - h / 2 + h * (i + 0.5) / n; shape(img, lambda d, c, yy=yy: d.ellipse([x - w / 2, yy - 9, x + w / 2, yy + 9], outline=c, width=7), col)
def missile(img, x, y, s, a, col=STEELL, flame=True):
    if flame: poly(img, rot([(x - s * 1.2, y - s * 0.22), (x - s * 2.2, y), (x - s * 1.2, y + s * 0.22)], a, x, y), GOLD, ORANGE, 8)
    poly(img, rot([(x - s * 1.2, y - s * 0.25), (x + s * 0.6, y - s * 0.25), (x + s * 1.1, y), (x + s * 0.6, y + s * 0.25), (x - s * 1.2, y + s * 0.25)], a, x, y), col)
    poly(img, rot([(x + s * 0.6, y - s * 0.25), (x + s * 1.1, y), (x + s * 0.6, y + s * 0.25)], a, x, y), RED)
    poly(img, rot([(x - s * 1.2, y - s * 0.25), (x - s * 0.8, y - s * 0.25), (x - s * 1.25, y - s * 0.6)], a, x, y), STEELD)
    poly(img, rot([(x - s * 1.2, y + s * 0.25), (x - s * 0.8, y + s * 0.25), (x - s * 1.25, y + s * 0.6)], a, x, y), STEELD)

def a1():   # 전개식 센트리: tripod turret, barrel firing, casing
    img = background((20, 48, 72), (8, 12, 20))
    for a in (-0.55, 0.0, 0.55): line(img, [(C, C + 30), (C + math.sin(a) * 170, C + 190)], STEELD, 20)
    disc(img, C, C + 30, 46, COPPER); box(img, C - 90, C - 90, C + 70, C + 10, STEEL)
    box(img, C + 40, C - 66, C + 210, C - 30, STEELL); box(img, C - 90, C - 90, C + 70, C - 70, STEELL)
    disc(img, C - 40, C - 40, 16, TEAL, TEAL)
    poly(img, [(C + 210, C - 80), (C + 250, C - 48), (C + 210, C - 16)], GOLD, ORANGE, 12)
    box(img, C - 120, C - 140, C - 100, C - 110, GOLD, 0.6)
    return img
def a2():   # 스파이더 마인: disc with 4 legs, red lamp
    img = background((70, 24, 20), (12, 8, 10))
    for sx in (-1, 1):
        for k, (lx, ly) in enumerate(((150, -40), (160, 90))):
            line(img, [(C + sx * 60, C + 20), (C + sx * (lx - 50), C + ly - 80), (C + sx * lx, C + ly + 60)], STEELD, 16)
    shape(img, lambda d, c: d.ellipse([C - 110, C - 40, C + 110, C + 80], fill=c), STEEL)
    shape(img, lambda d, c: d.ellipse([C - 110, C - 60, C + 110, C + 50], fill=c), STEELL)
    ring(img, C, C - 5, 80, COPPER, 8); disc(img, C, C - 8, 26, RED, RED, 16)
    return img
def a3():   # 트라이윙 편대: three small drones in a triangle with teal tracer lines
    img = background((20, 40, 70), (8, 10, 18))
    for (x, y, s) in ((C, C - 110, 1.0), (C - 130, C + 90, 0.9), (C + 130, C + 90, 0.9)):
        poly(img, [(x - 90 * s, y), (x, y - 26 * s), (x + 90 * s, y), (x, y + 18 * s)], STEELL)
        disc(img, x, y, 26 * s, STEEL); disc(img, x, y, 10 * s, TEAL, TEAL)
    line(img, [(C, C - 110), (C - 130, C + 90), (C + 130, C + 90), (C, C - 110)], TEAL, 4, TEAL, 6)
    return img
def a4():   # 테슬라 앵커: three copper coil pylons, blue-white current
    img = background((22, 30, 60), (6, 8, 16))
    P = [(C, C - 130), (C - 150, C + 110), (C + 150, C + 110)]
    bolt(img, [P[0], (C - 60, C), P[1]]); bolt(img, [P[1], (C, C + 130), P[2]]); bolt(img, [P[2], (C + 60, C), P[0]])
    for (x, y) in P: box(img, x - 20, y - 20, x + 20, y + 70, STEELD); coil(img, x, y - 10, 70, 70, 3); disc(img, x, y - 60, 18, ICE, ICE)
    return img
def a5():   # 아틀라스 워커: big walker silhouette, cannon + missile rack, exhaust
    img = background((70, 50, 20), (14, 10, 8))
    for sx in (-1, 1): line(img, [(C + sx * 60, C + 30), (C + sx * 120, C + 110), (C + sx * 90, C + 200)], STEELD, 26)
    box(img, C - 130, C - 80, C + 130, C + 50, STEEL); box(img, C - 130, C - 80, C + 130, C - 50, STEELL)
    box(img, C + 100, C - 40, C + 230, C - 10, STEELL); box(img, C - 120, C - 150, C - 30, C - 80, STEELD)
    for i in range(3): disc(img, C - 100 + i * 28, C - 130, 10, RED)
    disc(img, C, C - 15, 26, ORANGE, ORANGE, 14)
    for x, y, r in ((C - 160, C - 120, 26), (C - 190, C - 160, 20)): disc(img, x, y, r, (220, 226, 236))
    return img
def b1():   # 파일 벙커: arm housing, piston, stake punching a shock cone
    img = background((70, 40, 16), (12, 8, 6))
    box(img, C - 200, C - 50, C - 30, C + 50, STEEL); box(img, C - 200, C - 50, C - 30, C - 30, STEELL); box(img, C - 230, C - 30, C - 200, C + 30, LEATHER)
    box(img, C - 30, C - 22, C + 60, C + 22, COPPER)
    poly(img, [(C + 60, C - 16), (C + 200, C - 16), (C + 240, C), (C + 200, C + 16), (C + 60, C + 16)], STEELL, ICE, 8)
    for k in (60, 100, 140): shape(img, lambda d, c, k=k: d.arc([C + 240 - k, C - k, C + 240 + k, C + k], -50, 50, fill=c, width=8), GOLD)
    return img
def b2():   # 브리치 캐논: short fat barrel, wide muzzle blast, few pellet streaks
    img = background((76, 36, 14), (12, 8, 6))
    box(img, C - 210, C - 40, C - 20, C + 60, STEELD); box(img, C - 210, C - 40, C - 20, C - 20, STEEL)
    disc(img, C - 150, C + 10, 22, ORANGE, ORANGE)
    box(img, C - 20, C - 56, C + 40, C + 76, STEELL)
    poly(img, [(C + 40, C - 40), (C + 230, C - 150), (C + 230, C + 170), (C + 40, C + 60)], (255, 190, 90), ORANGE, 20)
    for a in (-0.45, -0.15, 0.15, 0.45): line(img, [(C + 60, C + 10), (C + 60 + 200 * math.cos(a), C + 10 + 200 * math.sin(a))], WHITE, 5)
    return img
def b3():   # 벌집 미사일 포드: hex pod with open lid, curving missiles
    img = background((80, 40, 14), (12, 8, 6))
    box(img, C - 200, C - 10, C - 30, C + 150, STEEL)
    for i in range(3):
        for j in range(2): disc(img, C - 170 + i * 56, C + 40 + j * 60, 22, STEELD); disc(img, C - 170 + i * 56, C + 40 + j * 60, 10, ORANGE)
    box(img, C - 200, C - 60, C - 30, C - 30, STEELL, -0.5, C - 30, C - 10)
    for k, (x, y, a) in enumerate(((C + 20, C - 70, -0.9), (C + 110, C - 140, -0.3), (C + 170, C - 40, 0.4))):
        line(img, [(C - 110, C - 20), ((C - 110 + x) / 2, y - 60), (x, y)], (230, 230, 230), 5)
        missile(img, x, y, 34, a)
    return img
def b4():   # 헬릭스 레일캐논: two rails, coils lit back to front, blue-white slug + helix
    img = background((24, 36, 70), (6, 8, 16))
    for dy in (-46, 46): box(img, C - 220, C + dy - 12, C + 90, C + dy + 12, STEELL)
    for i, col in enumerate(((120, 160, 220), (150, 200, 240), ICE, WHITE)): ring(img, C - 180 + i * 70, C, 40, col, 8, ICE if i > 1 else None)
    line(img, [(C + 90, C), (C + 250, C)], WHITE, 18, ICE, 14)
    pts = [(C + 90 + t * 160, C + 30 * math.sin(t * 12)) for t in (i / 30 for i in range(31))]
    line(img, pts, ICE, 4)
    return img
def b5():   # 오비탈 브레이커: target rings + thin fall trails + central strike
    img = background((30, 30, 60), (6, 6, 14))
    for x, y, r in ((C - 120, C + 60, 50), (C + 120, C + 40, 50), (C - 10, C + 150, 44)): ring(img, x, y, r, GOLD, 6, ORANGE); line(img, [(x, y - 260), (x, y)], (255, 240, 200), 3)
    ring(img, C, C + 20, 120, ICE, 10, ICE); line(img, [(C, C - 240), (C, C + 20)], WHITE, 16, ICE, 16)
    for a in range(8): ang = a * math.pi / 4; line(img, [(C + 130 * math.cos(ang), C + 20 + 60 * math.sin(ang)), (C + 175 * math.cos(ang), C + 20 + 82 * math.sin(ang))], ICE, 5)
    return img
def c1():   # 정밀 병기 제작: blueprint grid + rifle silhouette + core
    img = background((18, 46, 80), (6, 12, 22))
    for k in range(-4, 5): line(img, [(C - 200, C + k * 44), (C + 200, C + k * 44)], (60, 110, 170), 2); line(img, [(C + k * 44, C - 200), (C + k * 44, C + 200)], (60, 110, 170), 2)
    box(img, C - 190, C - 20, C + 200, C + 14, STEELL); box(img, C - 190, C - 20, C - 90, C + 80, STEEL, 0.25); box(img, C - 30, C + 14, C + 10, C + 80, STEELD)
    disc(img, C + 40, C - 4, 22, TEAL, TEAL)
    return img
def c2():   # 모듈 어셈블리: rotating drum magazine + wide muzzle, gear between
    img = background((40, 50, 60), (10, 12, 16))
    disc(img, C - 90, C - 40, 90, STEEL)
    for a in range(6): ang = a * math.pi / 3; disc(img, C - 90 + 52 * math.cos(ang), C - 40 + 52 * math.sin(ang), 20, BLUE, BLUE, 8)
    poly(img, [(C + 30, C + 60), (C + 220, C - 10), (C + 220, C + 190), (C + 30, C + 120)], STEELL, ORANGE, 10)
    for a in range(10): ang = a * math.pi / 5; disc(img, C + 10 + 70 * math.cos(ang), C + 150 + 70 * math.sin(ang), 18, COPPER)
    disc(img, C + 10, C + 150, 58, COPPER); disc(img, C + 10, C + 150, 22, STEELD)
    return img
def c3():   # 리페어 비콘: beacon spike + teal light + wrench + weld sparks
    img = background((16, 60, 60), (6, 14, 14))
    poly(img, [(C - 20, C - 160), (C + 20, C - 160), (C + 34, C + 140), (C - 34, C + 140)], STEEL)
    disc(img, C, C - 170, 34, TEAL, TEAL, 22)
    for r in (90, 140): shape(img, lambda d, c, r=r: d.arc([C - r, C - 170 - r, C + r, C - 170 + r], 200, 340, fill=c, width=6), TEAL)
    line(img, [(C + 60, C + 160), (C + 200, C + 20)], STEELL, 26); ring(img, C + 210, C + 10, 36, STEELL, 18)
    for x, y in ((C - 120, C + 120), (C - 150, C + 80), (C - 90, C + 70)): disc(img, x, y, 9, GOLD, ORANGE)
    return img
def c4():   # 리커버리 코어: small blue core flying into a leather tool pack
    img = background((20, 40, 80), (6, 10, 20))
    box(img, C - 40, C + 40, C + 200, C + 190, LEATHER); box(img, C - 40, C + 40, C + 200, C + 80, (170, 116, 76)); disc(img, C + 80, C + 60, 14, GOLD)
    line(img, [(C - 110, C - 80), (C - 30, C - 40), (C + 60, C + 30)], BLUE, 8, BLUE, 12)
    poly(img, [(C - 110, C - 140), (C - 60, C - 90), (C - 110, C - 40), (C - 160, C - 90)], ICE, BLUE, 18)
    return img
def c5():   # 레드라인 프로토콜: orange overloaded core, open cooling fins, red warning lamps
    img = background((90, 30, 10), (14, 6, 4))
    for k in range(6): box(img, C - 200 + k * 24, C - 120, C - 186 + k * 24, C + 120, STEEL, 0.35, C - 190 + k * 24, C)
    for k in range(6): box(img, C + 186 - k * 24, C - 120, C + 200 - k * 24, C + 120, STEEL, -0.35, C + 190 - k * 24, C)
    disc(img, C, C, 80, (255, 170, 70), ORANGE, 30); disc(img, C, C, 40, (255, 240, 200))
    for x in (C - 130, C + 130): disc(img, x, C - 170, 22, RED, RED, 16)
    for a in (-0.6, 0.6): line(img, [(C + 120 * math.sin(a), C + 150), (C + 160 * math.sin(a), C + 220)], (230, 230, 230), 10)
    return img

ICONS = {f'en_{k}': v for k, v in dict(a1=a1, a2=a2, a3=a3, a4=a4, a5=a5, b1=b1, b2=b2, b3=b3, b4=b4, b5=b5, c1=c1, c2=c2, c3=c3, c4=c4, c5=c5).items()}
if __name__ == '__main__':
    names = sys.argv[1:] or list(ICONS)
    out = []
    for n in names:
        img = ICONS[n](); frame(img); img = mask_circle(img).resize((128, 128), Image.LANCZOS)
        img.save(os.path.join(OUT, n + '.png')); out.append(img); print(n)
    os.makedirs('/tmp/engineer', exist_ok=True)
    sheet = Image.new('RGBA', (5 * 136, ((len(out) + 4) // 5) * 136), (40, 36, 48, 255))
    for i, im in enumerate(out): sheet.alpha_composite(im, ((i % 5) * 136 + 4, (i // 5) * 136 + 4))
    sheet.save('/tmp/engineer/icons_sheet.png')
