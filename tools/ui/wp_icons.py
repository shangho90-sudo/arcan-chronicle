"""양약사 2차 스킬 아이콘 15개 (128 px, 원형) — 2026-11-16.

Usage:  python3 tools/ui/wp_icons.py [wp_a1 ...]   ->  assets/ui/skills/wp_*.png  (+ /tmp/wpharm/icons_sheet.png 비교표)

대장장이 아이콘(tools/ui/smith_icons.py)과 같은 틀(어두운 원형 바탕 + 금테)을 그대로 쓰고, 스킬마다 다른 실루엣:
캡슐·과립·앰플·결정·정제·운반체·연쇄·과립 지대·맑은 구·작은 약병·서방형 캡슐·분무 꽃잎·세 겹 막·응급 캡슐.
색 역할: 청백·청록(정밀·보호·회복) · 빨강·금(화상·촉매) · 옅은 하늘색(냉기·결정). PIL만 씀. 다른 직업 아이콘은 건드리지 않음.
"""
import math, os, sys
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from smith_icons import rot, layer, glow, shape, background, frame, mask_circle, OUT, S, C
TEAL, TEALD, ICE, ICEB, RED, REDD, GOLD, WHITE, SILVER = (90, 230, 210), (30, 120, 120), (190, 236, 255), (90, 170, 240), (240, 70, 60), (150, 30, 30), (255, 210, 122), (250, 252, 255), (200, 210, 225)

def capsule(img, cx, cy, L, R, a, c1, c2, gap=0.0, glass=False):
    """two halves along angle a (radians), each L long (incl. dome), radius R; gap separates them"""
    for sg, col in ((1, c1), (-1, c2)):
        ox, oy = math.cos(a) * gap * sg, math.sin(a) * gap * sg
        body = rot([(cx, cy - R), (cx + sg * (L - R), cy - R), (cx + sg * (L - R), cy + R), (cx, cy + R)], a, cx, cy)
        body = [(x + ox, y + oy) for x, y in body]
        ex, ey = cx + math.cos(a) * sg * (L - R) + ox, cy + math.sin(a) * sg * (L - R) + oy
        def drw(d, c, body=body, ex=ex, ey=ey): d.polygon(body, fill=c); d.ellipse([ex - R, ey - R, ex + R, ey + R], fill=c)
        if glass: glow(img, drw, col, 10, 120)
        shape(img, drw, col if not glass else tuple(int(v * 0.55) for v in col))
        hl = rot([(cx + sg * R * 0.4, cy - R * 0.62), (cx + sg * (L - R), cy - R * 0.62), (cx + sg * (L - R), cy - R * 0.38), (cx + sg * R * 0.4, cy - R * 0.38)], a, cx, cy)
        shape(img, lambda d, c, hl=hl: d.polygon([(x + ox, y + oy) for x, y in hl], fill=c), WHITE)
def dot(img, x, y, r, col, g=True):
    if g: glow(img, lambda d, c: d.ellipse([x - r * 2, y - r * 2, x + r * 2, y + r * 2], fill=c), col, r * 0.8, 200)
    shape(img, lambda d, c: d.ellipse([x - r, y - r, x + r, y + r], fill=c), col)
    shape(img, lambda d, c: d.ellipse([x - r * 0.45, y - r * 0.6, x - r * 0.05, y - r * 0.2], fill=c), WHITE)
def curve(img, pts, col, w, blur=8):
    glow(img, lambda d, c: d.line(pts, fill=c, width=w * 2, joint='curve'), col, blur, 220)
    shape(img, lambda d, c: d.line(pts, fill=c, width=w, joint='curve'), WHITE)
def bez(p0, p1, p2, n=20): return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in (i / n for i in range(n + 1))]
def ampoule(img, cx, cy, s, a, liq=TEAL):
    P = [(-0.38, 0.9), (0.38, 0.9), (0.38, -0.1), (0.2, -0.3), (0.12, -0.42), (0.2, -0.56), (0.12, -0.74), (0, -0.82), (-0.12, -0.74), (-0.2, -0.56), (-0.12, -0.42), (-0.2, -0.3), (-0.38, -0.1)]
    pts = rot([(cx + x * s, cy + y * s) for x, y in P], a, cx, cy)
    glow(img, lambda d, c: d.polygon(pts, fill=c), liq, 12, 150)
    shape(img, lambda d, c: d.polygon(pts, fill=c), tuple(int(v * 0.5) for v in liq))
    lq = rot([(cx - 0.34 * s, cy + 0.86 * s), (cx + 0.34 * s, cy + 0.86 * s), (cx + 0.34 * s, cy + 0.2 * s), (cx - 0.34 * s, cy + 0.2 * s)], a, cx, cy)
    shape(img, lambda d, c: d.polygon(lq, fill=c), liq)
    shape(img, lambda d, c: d.line(rot([(cx - 0.22 * s, cy - 0.05 * s), (cx - 0.22 * s, cy + 0.7 * s)], a, cx, cy), fill=c, width=max(3, int(s * 0.06))), WHITE)
    shape(img, lambda d, c: d.line(rot([(cx - 0.14 * s, cy - 0.42 * s), (cx + 0.14 * s, cy - 0.42 * s)], a, cx, cy), fill=c, width=max(3, int(s * 0.07))), GOLD)
def crystal(img, cx, cy, s, a=0.0, col=ICE):
    P = [(0, -1), (0.3, -0.62), (0.3, 0.6), (0, 0.78), (-0.3, 0.6), (-0.3, -0.62)]
    pts = rot([(cx + x * s, cy + y * s) for x, y in P], a, cx, cy)
    glow(img, lambda d, c: d.polygon(pts, fill=c), ICEB, 10, 170)
    shape(img, lambda d, c: d.polygon(pts, fill=c), col)
    shape(img, lambda d, c: d.polygon(rot([(cx, cy - s), (cx + 0.3 * s, cy - 0.62 * s), (cx, cy + 0.78 * s)], a, cx, cy), fill=c), WHITE)
def lightning(img, pts, col=ICE, w=10):
    glow(img, lambda d, c: d.line(pts, fill=c, width=w * 3), col, 12, 240)
    shape(img, lambda d, c: d.line(pts, fill=c, width=w), WHITE)

def a1():   # 작열·분열 캡슐: red/white capsule splitting, five gold granules on curves
    img = background((80, 26, 20), (14, 8, 10))
    capsule(img, C - 30, C - 60, 120, 52, -0.6, (240, 236, 230), RED, gap=34)
    for i, (x, y) in enumerate([(C - 160, C + 60), (C - 90, C + 120), (C, C + 150), (C + 90, C + 120), (C + 160, C + 50)]):
        curve(img, bez((C - 30, C - 30), ((C - 30 + x) / 2, C - 10), (x, y)), GOLD, 5, 6); dot(img, x, y, 18 if i < 4 else 26, GOLD)
    glow(img, lambda d, c: d.ellipse([C + 110, C + 0, C + 210, C + 100], outline=c, width=14), RED, 8, 230)
    return img
def a2():   # 극저온 결정화: ampoule head-down into a blue film, crystals rising toward the centre
    img = background((20, 50, 80), (8, 10, 18))
    glow(img, lambda d, c: d.ellipse([C - 200, C + 70, C + 200, C + 190], fill=c), ICEB, 14, 160)
    shape(img, lambda d, c: d.ellipse([C - 200, C + 70, C + 200, C + 190], outline=c, width=6), ICE)
    for x, s in ((-140, 50), (-80, 74), (0, 120), (80, 74), (140, 50)): crystal(img, C + x, C + 130 - s * 0.75, s)
    ampoule(img, C, C - 140, 90, math.pi, ICE)
    return img
def a3():   # 이온 관통술: four silver orbs in a line, one blue-white bolt through
    img = background((24, 40, 70), (8, 10, 16))
    pts = [(C - 210, C + 120), (C - 110, C + 40), (C - 70, C + 70), (C + 30, C - 20), (C + 70, C + 10), (C + 210, C - 120)]
    lightning(img, pts, ICE, 12)
    for k in range(4): x = C - 160 + k * 110; y = C + 85 - k * 80; dot(img, x, y, 26, SILVER)
    lightning(img, [(C + 30, C - 20), (C + 60, C - 90), (C + 40, C - 130)], ICEB, 4)
    return img
def a4():   # 삼상 복합제: red capsule / blue ampoule / gold tablet triangle around a centre
    img = background((50, 30, 60), (10, 8, 14))
    glow(img, lambda d, c: d.polygon([(C, C - 150), (C + 150, C + 110), (C - 150, C + 110)], outline=c, width=10), WHITE, 6, 160)
    capsule(img, C - 140, C + 100, 64, 30, -0.4, RED, (240, 236, 230))
    ampoule(img, C + 140, C + 90, 70, 0.4, ICEB)
    shape(img, lambda d, c: d.ellipse([C - 64, C - 200, C + 64, C - 110], fill=c), GOLD); shape(img, lambda d, c: d.line([(C - 50, C - 155), (C + 50, C - 155)], fill=c, width=8), (180, 130, 50))
    dot(img, C, C + 20, 30, WHITE)
    return img
def a5():   # 대형 캡슐 붕괴: giant open capsule halves, glowing core falling into a ground ring
    img = background((30, 50, 80), (8, 10, 18))
    glow(img, lambda d, c: d.ellipse([C - 210, C + 120, C + 210, C + 210], outline=c, width=18), ICEB, 10, 240)
    shape(img, lambda d, c: d.ellipse([C - 190, C + 130, C + 190, C + 200], outline=c, width=6), WHITE)
    capsule(img, C, C - 140, 150, 70, 0.0, ICE, ICE, gap=50, glass=True)
    for k in range(3): glow(img, lambda d, c, k=k: d.line([(C, C - 80 + k * 30), (C, C - 40 + k * 30)], fill=c, width=10), ICE, 6, 160)
    dot(img, C, C + 60, 46, (200, 240, 255)); crystal(img, C - 130, C + 130, 40, -0.5); crystal(img, C + 130, C + 130, 40, 0.5)
    return img
def b1():   # 촉매 활성화: three small ampoules fanned, one lit with gold particles
    img = background((70, 50, 20), (12, 10, 8))
    for k, a in enumerate((-0.55, 0.0, 0.55)): ampoule(img, C + math.sin(a) * 120, C + 40 - math.cos(a) * 60, 80, a, GOLD if k == 1 else TEAL)
    for x, y in ((C - 30, C - 170), (C + 40, C - 190), (C + 10, C - 150), (C + 80, C - 140)): dot(img, x, y, 10, GOLD)
    return img
def b2():   # 정밀 표적 전달: thin teal reticle ring with a translucent sphere docking on it
    img = background((20, 60, 60), (8, 12, 12))
    for r, w in ((170, 8), (120, 4)): glow(img, lambda d, c, r=r, w=w: d.ellipse([C - r, C - r, C + r, C + r], outline=c, width=w * 2), TEAL, 8, 220); shape(img, lambda d, c, r=r, w=w: d.ellipse([C - r, C - r, C + r, C + r], outline=c, width=w), WHITE)
    for a in range(4): x, y = C + math.cos(a * math.pi / 2) * 200, C + math.sin(a * math.pi / 2) * 200; shape(img, lambda d, c, x=x, y=y: d.line([(x, y), (C + (x - C) * 0.8, C + (y - C) * 0.8)], fill=c, width=10), TEAL)
    glow(img, lambda d, c: d.ellipse([C + 40, C - 150, C + 150, C - 40], fill=c), TEAL, 14, 200)
    shape(img, lambda d, c: d.ellipse([C + 50, C - 140, C + 140, C - 50], fill=c), (40, 140, 140)); dot(img, C + 95, C - 95, 18, WHITE, False)
    curve(img, bez((C + 210, C - 220), (C + 200, C - 120), (C + 140, C - 110)), TEAL, 4)
    return img
def b3():   # 연쇄 용출: burst on the left, teal particle arcs hopping to two marked dots
    img = background((16, 50, 50), (6, 10, 10))
    glow(img, lambda d, c: d.ellipse([C - 210, C - 10, C - 70, C + 130], fill=c), TEAL, 18, 230); dot(img, C - 140, C + 60, 34, WHITE)
    curve(img, bez((C - 120, C + 20), (C - 40, C - 160), (C + 40, C - 40)), TEAL, 6); dot(img, C + 40, C - 40, 26, TEAL)
    curve(img, bez((C + 60, C - 50), (C + 160, C - 200), (C + 170, C + 60)), TEAL, 5); dot(img, C + 170, C + 70, 22, TEAL)
    for x, y in ((C + 40, C - 40), (C + 170, C + 70)): shape(img, lambda d, c, x=x, y=y: d.ellipse([x - 44, y - 16, x + 44, y + 16], outline=c, width=4), TEAL)
    return img
def b4():   # 서방형 미립자: glowing granules lying on a floor ellipse, some fading
    img = background((30, 50, 40), (8, 10, 10))
    glow(img, lambda d, c: d.ellipse([C - 200, C + 20, C + 200, C + 180], fill=c), TEALD, 16, 200)
    shape(img, lambda d, c: d.ellipse([C - 200, C + 20, C + 200, C + 180], outline=c, width=5), TEAL)
    for k, (x, y, r) in enumerate([(-120, 90, 20), (-50, 60, 24), (30, 110, 22), (100, 70, 18), (-10, 140, 16), (140, 120, 14)]): dot(img, C + x, C + y, r, GOLD if k % 2 else TEAL)
    for x, y in ((-60, -60), (40, -110), (100, -40)): dot(img, C + x, C + y, 9, TEAL)
    return img
def b5():   # 임계 농도: clear sphere with a growing crystal, beams converging from the rim
    img = background((20, 40, 70), (6, 8, 14))
    for a in range(8): ang = a * math.pi / 4 + 0.2; x, y = C + math.cos(ang) * 220, C + math.sin(ang) * 220; curve(img, [(x, y), (C + math.cos(ang) * 120, C + math.sin(ang) * 120)], ICEB, 4, 6)
    glow(img, lambda d, c: d.ellipse([C - 120, C - 120, C + 120, C + 120], outline=c, width=14), ICE, 10, 200)
    shape(img, lambda d, c: d.ellipse([C - 112, C - 112, C + 112, C + 112], outline=c, width=4), WHITE)
    crystal(img, C, C + 10, 80); crystal(img, C - 40, C + 40, 40, -0.6); crystal(img, C + 40, C + 40, 40, 0.6)
    return img
def c1():   # 고순도 제제 조제: small vial with clear teal liquid, impurities dropping out, sparkle
    img = background((20, 50, 60), (8, 10, 12))
    P = [(C - 70, C + 160), (C + 70, C + 160), (C + 70, C - 20), (C + 30, C - 70), (C + 30, C - 140), (C - 30, C - 140), (C - 30, C - 70), (C - 70, C - 20)]
    glow(img, lambda d, c: d.polygon(P, fill=c), TEAL, 14, 150); shape(img, lambda d, c: d.polygon(P, fill=c), (30, 70, 80))
    shape(img, lambda d, c: d.polygon([(C - 64, C + 154), (C + 64, C + 154), (C + 64, C + 10), (C - 64, C + 10)], fill=c), TEAL)
    shape(img, lambda d, c: d.rectangle([C - 34, C - 170, C + 34, C - 136], fill=c), (150, 100, 60))
    for x, y in ((C - 150, C + 60), (C - 130, C + 130), (C + 140, C + 110)): shape(img, lambda d, c, x=x, y=y: d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=c), (110, 90, 70))
    for x, y in ((C + 120, C - 120), (C + 160, C - 60)): dot(img, x, y, 12, WHITE)
    return img
def c2():   # 서방형 캡슐 조제: capsule half-filled with granules, sealed band
    img = background((40, 40, 70), (10, 8, 14))
    capsule(img, C, C, 160, 74, -0.5, (230, 236, 255), TEAL, glass=True)
    for k in range(9): a = -0.5; t = -100 + k * 25; x = C + math.cos(a) * t + (k % 2) * 14 - 7; y = C + math.sin(a) * t + 14; dot(img, x, y, 13, GOLD if k % 3 == 0 else TEAL, False)
    shape(img, lambda d, c: d.line(rot([(C, C - 76), (C, C + 76)], -0.5), fill=c, width=10), GOLD)
    return img
def c3():   # 생체 회복 분무: ampoule petals fanned around, teal mist spiralling inward
    img = background((16, 56, 50), (6, 12, 10))
    for k in range(6): a = k * math.pi / 3; ampoule(img, C + math.cos(a) * 150, C + math.sin(a) * 150, 54, a + math.pi / 2, TEAL)
    for r in (90, 60): glow(img, lambda d, c, r=r: d.arc([C - r, C - r, C + r, C + r], 20, 300, fill=c, width=16), TEAL, 10, 200)
    shape(img, lambda d, c: [d.rectangle([C - 12, C - 44, C + 12, C + 44], fill=c), d.rectangle([C - 44, C - 12, C + 44, C + 12], fill=c)], WHITE)
    return img
def c4():   # 다층 코팅막: three thin nested shells around a figure, the outer one peeling
    img = background((24, 40, 70), (8, 10, 16))
    shape(img, lambda d, c: [d.ellipse([C - 34, C - 120, C + 34, C - 52], fill=c), d.polygon([(C - 70, C + 130), (C - 50, C - 40), (C + 50, C - 40), (C + 70, C + 130)], fill=c)], (60, 90, 130))
    for k, (r, a0, a1) in enumerate(((120, 0, 360), (160, 0, 360), (200, 40, 300))):
        glow(img, lambda d, c, r=r, a0=a0, a1=a1: d.arc([C - r * 0.82, C - r, C + r * 0.82, C + r], a0, a1, fill=c, width=14), (ICE, ICEB, TEAL)[k], 8, 210)
        shape(img, lambda d, c, r=r, a0=a0, a1=a1: d.arc([C - r * 0.82, C - r, C + r * 0.82, C + r], a0, a1, fill=c, width=4), WHITE)
    for x, y in ((C + 150, C - 150), (C + 180, C - 110)): dot(img, x, y, 10, ICE)
    return img
def c5():   # 최종 처방·생명 유지: a gold emergency capsule breaking over a heart, blue-white layer
    img = background((70, 50, 20), (14, 10, 8))
    H = [(C, C + 150)] + [(C + 150 * math.sin(t) ** 3 * 1.0, C - 10 - (130 * math.cos(t) - 50 * math.cos(2 * t) - 20 * math.cos(3 * t) - 10 * math.cos(4 * t)) * 0.9) for t in (i / 40 * 2 * math.pi for i in range(41))]
    glow(img, lambda d, c: d.polygon(H, fill=c), RED, 16, 200); shape(img, lambda d, c: d.polygon(H, fill=c), REDD)
    glow(img, lambda d, c: d.ellipse([C - 200, C - 190, C + 200, C + 190], outline=c, width=12), ICE, 10, 200)
    capsule(img, C, C - 10, 100, 44, -0.7, GOLD, (255, 240, 200), gap=20)
    for x, y in ((C - 90, C - 120), (C + 100, C + 60), (C - 40, C + 90)): dot(img, x, y, 12, GOLD)
    return img

ICONS = {'wp_a1': a1, 'wp_a2': a2, 'wp_a3': a3, 'wp_a4': a4, 'wp_a5': a5, 'wp_b1': b1, 'wp_b2': b2, 'wp_b3': b3, 'wp_b4': b4, 'wp_b5': b5,
         'wp_c1': c1, 'wp_c2': c2, 'wp_c3': c3, 'wp_c4': c4, 'wp_c5': c5}
if __name__ == '__main__':
    names = sys.argv[1:] or list(ICONS)
    out = []
    for n in names:
        img = ICONS[n](); frame(img); img = mask_circle(img).resize((128, 128), Image.LANCZOS)
        img.save(os.path.join(OUT, n + '.png')); out.append(img); print(n)
    os.makedirs('/tmp/wpharm', exist_ok=True)
    sheet = Image.new('RGBA', (5 * 136, ((len(out) + 4) // 5) * 136), (40, 36, 48, 255))
    for i, im in enumerate(out): sheet.alpha_composite(im, ((i % 5) * 136 + 4, (i // 5) * 136 + 4))
    sheet.save('/tmp/wpharm/icons_sheet.png')
