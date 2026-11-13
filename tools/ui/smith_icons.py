"""대장장이 1차 스킬 아이콘 15개 (128 px, 원형) — 2026-11-13.

Usage:  python3 tools/ui/smith_icons.py [bs1_a1 ...]   ->  assets/ui/skills/bs1_*.png  (+ /tmp/smith/icons_sheet.png 비교표)

약사 1차 아이콘(원형, 어두운 바탕 + 금테)과 같은 틀에 스킬마다 다른 실루엣을 그린다.
색 역할: 검은 철(#2a2c33 ~ #6b7080) · 주황 열기(#ff8a2a) · 금빛 불티(#ffd27a) · 흰 수증기 · 파란 냉각수(B 1번) · 붉은 낙인(A 3번).
PIL만 씀(512 px로 그리고 줄임). 견습생·약사 아이콘은 건드리지 않음.
"""
import math, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'ui', 'skills')
S = 512; C = S / 2
IRON, IRON2, IRON3 = (42, 44, 52), (86, 92, 108), (150, 158, 176)
HOT, HOTB, GOLD, WHITE = (255, 138, 42), (255, 74, 16), (255, 210, 122), (255, 246, 228)
WATER, WATERB, BRAND = (190, 232, 255), (70, 160, 235), (255, 80, 52)

def rot(pts, a, cx=C, cy=C, k=1.0):
    ca, sa = math.cos(a), math.sin(a); return [(cx + k * ((x - cx) * ca - (y - cy) * sa), cy + k * ((x - cx) * sa + (y - cy) * ca)) for x, y in pts]
def layer(): return Image.new('RGBA', (S, S), (0, 0, 0, 0))
def glow(img, fn, col, blur, alpha=255):
    L = layer(); fn(ImageDraw.Draw(L), col + (alpha,)); L = L.filter(ImageFilter.GaussianBlur(blur)); img.alpha_composite(L)
def shape(img, fn, col): L = layer(); fn(ImageDraw.Draw(L), col + (255,)); img.alpha_composite(L)

def background(bg1, bg2):
    img = layer(); d = ImageDraw.Draw(img)
    for r in range(232, 0, -4):   # radial dark gradient
        k = r / 232; col = tuple(int(bg1[i] * (1 - k) + bg2[i] * k) for i in range(3)); d.ellipse([C - r, C - r, C + r, C + r], fill=col + (255,))
    return img
def frame(img):
    d = ImageDraw.Draw(img)
    d.ellipse([C - 250, C - 250, C + 250, C + 250], outline=(30, 22, 14, 255), width=14)
    d.ellipse([C - 240, C - 240, C + 240, C + 240], outline=(214, 170, 92, 255), width=12)
    d.ellipse([C - 230, C - 230, C + 230, C + 230], outline=(120, 82, 36, 255), width=4)
    hl = layer(); ImageDraw.Draw(hl).arc([C - 240, C - 240, C + 240, C + 240], 200, 300, fill=(255, 240, 200, 200), width=8); img.alpha_composite(hl.filter(ImageFilter.GaussianBlur(2)))
def mask_circle(img):
    m = Image.new('L', (S, S), 0); ImageDraw.Draw(m).ellipse([C - 252, C - 252, C + 252, C + 252], fill=255)
    a = ImageChops.multiply(img.getchannel('A'), m); img.putalpha(a); return img

def sparks(img, pts, col=GOLD, r=7):
    glow(img, lambda d, c: [d.ellipse([x - r * 2, y - r * 2, x + r * 2, y + r * 2], fill=c) for x, y in pts], HOT, 6, 200)
    shape(img, lambda d, c: [d.ellipse([x - r, y - r, x + r, y + r], fill=c) for x, y in pts], col)

# ---------------------------------------------------------------- glyph pieces
def anvil_pts(cx, cy, s):
    p = [(-1.0, -0.42), (0.62, -0.42), (0.95, -0.30), (0.62, -0.18), (0.30, -0.12), (0.22, 0.18), (0.48, 0.30), (0.48, 0.44), (-0.58, 0.44), (-0.58, 0.30), (-0.30, 0.18), (-0.38, -0.12), (-0.78, -0.22)]
    return [(cx + x * s, cy + y * s) for x, y in p]
def hammer(img, cx, cy, s, a, head=IRON2, hot=False):
    handle = rot([(cx - 0.06 * s, cy - 0.1 * s), (cx + 0.06 * s, cy - 0.1 * s), (cx + 0.06 * s, cy + 0.95 * s), (cx - 0.06 * s, cy + 0.95 * s)], a, cx, cy)
    headp = rot([(cx - 0.42 * s, cy - 0.32 * s), (cx + 0.42 * s, cy - 0.32 * s), (cx + 0.46 * s, cy - 0.02 * s), (cx - 0.46 * s, cy - 0.02 * s)], a, cx, cy)
    if hot: glow(img, lambda d, c: d.line(headp + [headp[0]], fill=c, width=34), HOT, 9, 255)
    shape(img, lambda d, c: d.polygon(handle, fill=c), (120, 78, 40))
    shape(img, lambda d, c: d.polygon(headp, fill=c), head)
    face = rot([(cx - 0.42 * s, cy - 0.32 * s), (cx + 0.42 * s, cy - 0.32 * s), (cx + 0.42 * s, cy - 0.24 * s), (cx - 0.42 * s, cy - 0.24 * s)], a, cx, cy)
    shape(img, lambda d, c: d.polygon(face, fill=c), IRON3)
def arc(img, box, a0, a1, col, w, blur=10):
    glow(img, lambda d, c: d.arc(box, a0, a1, fill=c, width=w * 2), col, blur, 230)
    shape(img, lambda d, c: d.arc(box, a0, a1, fill=c, width=w), WHITE)
def puff(img, x, y, r, col=WHITE, a=210):
    glow(img, lambda d, c: d.ellipse([x - r, y - r, x + r, y + r], fill=c), col, r * 0.35, a)

# ---------------------------------------------------------------- icons
def a1():   # 모루 떨구기: falling black anvil with orange cracks, motion streaks, landing ring
    img = background((70, 30, 12), (14, 10, 10))
    for x in (-90, 0, 90): glow(img, lambda d, c, x=x: d.line([(C + x, 70), (C + x * 0.8, 200)], fill=c, width=16), GOLD, 8, 150)
    glow(img, lambda d, c: d.ellipse([C - 170, 360, C + 170, 430], outline=c, width=18), HOT, 10, 255)
    shape(img, lambda d, c: d.ellipse([C - 150, 372, C + 150, 418], outline=c, width=6), GOLD)
    pts = anvil_pts(C, 270, 190)
    glow(img, lambda d, c: d.polygon(pts, fill=c), HOT, 22, 200)
    shape(img, lambda d, c: d.polygon(pts, fill=c), IRON)
    shape(img, lambda d, c: d.polygon(anvil_pts(C, 262, 186)[:4] + [(C + 0.62 * 186, 262 - 0.3 * 186), (C - 186, 262 - 0.36 * 186)], fill=c), IRON2)
    glow(img, lambda d, c: d.line([(C - 40, 245), (C - 10, 285), (C - 30, 320), (C + 10, 345)], fill=c, width=10), HOT, 4, 255)
    shape(img, lambda d, c: d.line([(C - 40, 245), (C - 10, 285), (C - 30, 320), (C + 10, 345)], fill=c, width=4), GOLD)
    sparks(img, [(C - 200, 360), (C + 205, 350), (C - 160, 320), (C + 170, 310)])
    return img
def a2():   # 집게 낚아채기: long open tongs reaching diagonally
    img = background((50, 40, 34), (12, 10, 12)); a = -0.75
    for sg in (1, -1):
        arm = rot([(C - 210, C + 6 * sg), (C + 60, C + 6 * sg), (C + 60, C + 22 * sg), (C - 210, C + 22 * sg)], a, k=0.8)
        jaw = rot([(C + 50, C + 4 * sg), (C + 150, C + 70 * sg), (C + 210, C + 58 * sg), (C + 200, C + 40 * sg), (C + 150, C + 46 * sg), (C + 60, C - 6 * sg)], a, k=0.8)
        glow(img, lambda d, c, j=jaw: d.polygon(j, fill=c), HOT, 14, 140)
        shape(img, lambda d, c, p=arm: d.polygon(p, fill=c), IRON2)
        shape(img, lambda d, c, j=jaw: d.polygon(j, fill=c), IRON3 if sg > 0 else IRON2)
    pv = rot([(C + 50, C)], a, k=0.8)[0]
    shape(img, lambda d, c: d.ellipse([pv[0] - 22, pv[1] - 22, pv[0] + 22, pv[1] + 22], fill=c), GOLD)
    tip = rot([(C + 215, C)], a, k=0.8)[0]
    arc(img, [tip[0] - 60, tip[1] - 60, tip[0] + 60, tip[1] + 60], 100, 250, HOT, 8)
    sparks(img, [(tip[0] + 10, tip[1] + 40), (tip[0] - 40, tip[1] - 10)], r=6)
    return img
def a3():   # 불량품 판정: red forge brand (ring + hammer seal) with cracks
    img = background((90, 16, 10), (16, 8, 8))
    glow(img, lambda d, c: d.ellipse([C - 150, C - 150, C + 150, C + 150], outline=c, width=40), BRAND, 18, 255)
    shape(img, lambda d, c: d.ellipse([C - 140, C - 140, C + 140, C + 140], outline=c, width=18), (255, 120, 90))
    seal = [(C - 80, C - 70), (C + 80, C - 70), (C + 80, C - 10), (C + 18, C - 10), (C + 18, C + 100), (C - 18, C + 100), (C - 18, C - 10), (C - 80, C - 10)]
    glow(img, lambda d, c: d.polygon(seal, fill=c), BRAND, 12, 230); shape(img, lambda d, c: d.polygon(seal, fill=c), (255, 150, 120))
    for ln in ([(C + 40, C - 150), (C + 60, C - 90), (C + 30, C - 40)], [(C - 150, C + 20), (C - 90, C + 40), (C - 60, C + 10)], [(C + 110, C + 110), (C + 70, C + 60), (C + 90, C + 30)]):
        glow(img, lambda d, c, l=ln: d.line(l, fill=c, width=12), WHITE, 5, 255); shape(img, lambda d, c, l=ln: d.line(l, fill=c, width=5), WHITE)
    sparks(img, [(C + 175, C - 120), (C - 170, C + 140)], r=6)
    return img
def a4():   # 백련타: hammer, three small strike arcs (L R L) + one big vertical arc
    img = background((70, 34, 10), (14, 10, 10))
    for i, (x, y, a0, a1_) in enumerate([(-120, -90, 200, 300), (110, -60, 240, 340), (-110, 20, 200, 300)]):
        arc(img, [C + x - 70, C + y - 70, C + x + 70, C + y + 70], a0, a1_, HOT, 7, 8)
    arc(img, [C - 170, C - 200, C + 170, C + 200], 60, 120, HOTB, 12, 12)
    hammer(img, C + 30, C - 40, 200, 0.35, hot=True)
    sparks(img, [(C - 60, C + 190), (C + 50, C + 200), (C + 0, C + 175)])
    return img
def a5():   # 장인의 박자: hammer with orange outline + three beat pips
    img = background((60, 36, 14), (12, 10, 10))
    hammer(img, C, C - 60, 210, -0.5, hot=True)
    for i in range(3):
        x = C - 110 + i * 110; on = i == 2
        glow(img, lambda d, c, x=x: d.ellipse([x - 30, 380 - 30, x + 30, 380 + 30], fill=c), HOT if on else (120, 70, 30), 10, 255 if on else 160)
        shape(img, lambda d, c, x=x: d.ellipse([x - 16, 380 - 16, x + 16, 380 + 16], fill=c), GOLD if on else (160, 110, 60))
    return img
def b1():   # 급랭 담금질: blue water fan, white compact steam puffs over a cooling red bar
    img = background((14, 40, 70), (8, 10, 18))
    glow(img, lambda d, c: d.pieslice([C - 230, C - 120, C + 230, C + 340], 215, 325, fill=c), WATERB, 16, 200)
    shape(img, lambda d, c: d.arc([C - 200, C - 90, C + 200, C + 310], 220, 320, fill=c, width=10), WATER)
    shape(img, lambda d, c: d.arc([C - 140, C - 30, C + 140, C + 250], 225, 315, fill=c, width=8), WATER)
    bar = [(C - 150, 360), (C + 150, 360), (C + 150, 400), (C - 150, 400)]
    glow(img, lambda d, c: d.polygon(bar, fill=c), HOTB, 12, 180); shape(img, lambda d, c: d.polygon(bar, fill=c), (110, 60, 50))
    for x, y, r in ((C - 70, 320, 60), (C + 40, 300, 75), (C + 120, 335, 50), (C - 140, 345, 40)): puff(img, x, y, r)
    for x, y in ((C - 60, 170), (C + 30, 140), (C + 90, 190), (C - 120, 210)): shape(img, lambda d, c, x=x, y=y: d.ellipse([x - 9, y - 13, x + 9, y + 13], fill=c), WATER)
    return img
def plate(img, cx, cy, w, h, col=IRON2):
    p = [(cx - w, cy - h), (cx + w, cy - h), (cx + w, cy + h * 0.7), (cx, cy + h), (cx - w, cy + h * 0.7)]
    shape(img, lambda d, c: d.polygon(p, fill=c), col)
    shape(img, lambda d, c: d.line(p + [p[0]], fill=c, width=8), IRON3)
    return p
def b2():   # 접이식 철벽: three hinged iron plates unfolding
    img = background((40, 44, 54), (10, 10, 14))
    glow(img, lambda d, c: d.rectangle([C - 210, C - 130, C + 210, C + 150], fill=c), HOT, 30, 110)
    for x, sk in ((-150, 1), (150, -1)):
        p = [(C + x - 60, C - 100 + 20 * sk * -1), (C + x + 60, C - 110), (C + x + 60, C + 120), (C + x - 60, C + 110 - 20 * sk * -1)]
        shape(img, lambda d, c, p=p: d.polygon(p, fill=c), IRON)
        shape(img, lambda d, c, p=p: d.line(p + [p[0]], fill=c, width=6), IRON2)
    plate(img, C, C, 95, 150)
    for x, y in ((C - 60, C - 110), (C + 60, C - 110), (C - 60, C + 70), (C + 60, C + 70)): shape(img, lambda d, c, x=x, y=y: d.ellipse([x - 12, y - 12, x + 12, y + 12], fill=c), GOLD)
    sparks(img, [(C - 200, C - 160), (C + 200, C - 150)], r=6)
    return img
def b3():   # 용광로 개방: forge mouth spewing flame + heavy molten drops
    img = background((90, 30, 8), (16, 8, 6))
    glow(img, lambda d, c: d.pieslice([C - 260, C - 240, C + 260, C + 280], 285, 355, fill=c), HOTB, 26, 230)
    glow(img, lambda d, c: d.pieslice([C - 200, C - 180, C + 200, C + 220], 295, 345, fill=c), GOLD, 18, 220)
    box = [C - 200, C + 20, C - 40, C + 190]
    shape(img, lambda d, c: d.rounded_rectangle(box, 20, fill=c), IRON); shape(img, lambda d, c: d.rounded_rectangle([C - 175, C + 50, C - 70, C + 140], 40, fill=c), (40, 14, 8))
    glow(img, lambda d, c: d.ellipse([C - 160, C + 60, C - 85, C + 130], fill=c), HOT, 12, 255)
    for x, y, r in ((C + 60, C + 140, 20), (C + 130, C + 60, 16), (C + 170, C + 170, 22), (C + 20, C + 200, 14), (C + 100, C - 30, 12)):
        glow(img, lambda d, c, x=x, y=y, r=r: d.ellipse([x - r * 1.8, y - r * 1.8, x + r * 1.8, y + r * 1.8], fill=c), HOT, 8, 230)
        shape(img, lambda d, c, x=x, y=y, r=r: d.ellipse([x - r, y - r * 1.25, x + r, y + r], fill=c), GOLD)
    return img
def b4():   # 즉석 리벳: three glowing rivets orbiting a chest plate
    img = background((60, 44, 20), (12, 10, 10))
    body = [(C - 110, C - 110), (C + 110, C - 110), (C + 130, C + 40), (C, C + 150), (C - 130, C + 40)]
    shape(img, lambda d, c: d.polygon(body, fill=c), IRON2); shape(img, lambda d, c: d.line(body + [body[0]], fill=c, width=8), IRON3)
    arc(img, [C - 200, C - 120, C + 200, C + 120], 190, 350, GOLD, 4, 8)
    for ang in (200, 270, 340):
        x = C + 200 * math.cos(math.radians(ang)); y = C + 120 * math.sin(math.radians(ang))
        glow(img, lambda d, c, x=x, y=y: d.ellipse([x - 40, y - 40, x + 40, y + 40], fill=c), HOT, 12, 255)
        shape(img, lambda d, c, x=x, y=y: d.ellipse([x - 24, y - 24, x + 24, y + 24], fill=c), GOLD)
        shape(img, lambda d, c, x=x, y=y: d.ellipse([x - 10, y - 14, x + 4, y - 2], fill=c), WHITE)
    return img
def b5():   # 충격 재활용: iron plate absorbing an impact, curved arrow turning it into an orange strike
    img = background((50, 30, 16), (10, 10, 12))
    plate(img, C - 50, C + 20, 90, 130)
    for ln in ([(C - 230, C - 60), (C - 150, C - 20)], [(C - 230, C + 40), (C - 150, C + 30)]): shape(img, lambda d, c, l=ln: d.line(l, fill=c, width=10), WHITE)
    arc(img, [C - 120, C - 220, C + 200, C + 100], 290, 60, HOT, 14, 12)
    tip = (C + 170, C + 20)
    shape(img, lambda d, c: d.polygon([(tip[0] - 40, tip[1] - 20), (tip[0] + 40, tip[1] - 20), (tip[0], tip[1] + 40)], fill=c), GOLD)
    sparks(img, [(C + 200, C + 110), (C + 130, C + 130)], r=7)
    return img
def c1():   # 기초 무기 제작: hammer over a glowing blade on an anvil
    img = background((60, 40, 20), (12, 10, 10))
    shape(img, lambda d, c: d.polygon(anvil_pts(C, C + 140, 150), fill=c), IRON)
    blade = [(C - 170, C + 50), (C + 130, C + 50), (C + 180, C + 70), (C + 130, C + 90), (C - 170, C + 90)]
    glow(img, lambda d, c: d.polygon(blade, fill=c), HOT, 14, 255); shape(img, lambda d, c: d.polygon(blade, fill=c), (255, 190, 120))
    hammer(img, C + 40, C - 110, 170, 0.7)
    sparks(img, [(C - 40, C + 10), (C + 20, C - 10), (C - 90, C + 20)])
    return img
def c2():   # 기초 방어구 제작: metal breastplate
    img = background((40, 44, 56), (10, 10, 14))
    body = [(C - 150, C - 140), (C - 60, C - 160), (C, C - 110), (C + 60, C - 160), (C + 150, C - 140), (C + 130, C + 60), (C, C + 170), (C - 130, C + 60)]
    glow(img, lambda d, c: d.polygon(body, fill=c), GOLD, 20, 120)
    shape(img, lambda d, c: d.polygon(body, fill=c), IRON2); shape(img, lambda d, c: d.line(body + [body[0]], fill=c, width=10), IRON3)
    shape(img, lambda d, c: d.line([(C, C - 100), (C, C + 150)], fill=c, width=8), IRON3)
    for x, y in ((C - 90, C - 80), (C + 90, C - 80), (C - 80, C + 40), (C + 80, C + 40)): shape(img, lambda d, c, x=x, y=y: d.ellipse([x - 10, y - 10, x + 10, y + 10], fill=c), GOLD)
    return img
def c3():   # 숫돌 연마: whetstone + blade with a white metal gleam
    img = background((30, 40, 50), (10, 10, 12))
    stone = [(C - 170, C + 70), (C + 150, C + 40), (C + 170, C + 120), (C - 150, C + 150)]
    shape(img, lambda d, c: d.polygon(stone, fill=c), (110, 100, 88)); shape(img, lambda d, c: d.line(stone + [stone[0]], fill=c, width=6), (160, 150, 130))
    blade = rot([(C - 200, C - 20), (C + 140, C - 20), (C + 200, C), (C + 140, C + 20), (C - 200, C + 20)], -0.35, C, C - 30)
    shape(img, lambda d, c: d.polygon(blade, fill=c), IRON3)
    glow(img, lambda d, c: d.line(rot([(C - 160, C - 22), (C + 160, C - 22)], -0.35, C, C - 30), fill=c, width=18), WHITE, 10, 255)
    shape(img, lambda d, c: d.line(rot([(C - 160, C - 22), (C + 160, C - 22)], -0.35, C, C - 30), fill=c, width=5), WHITE)
    sparks(img, [(C + 150, C - 120), (C + 180, C - 80)], WHITE, 6)
    return img
def c4():   # 재료 회수: scrap bits flying into a gather swirl
    img = background((50, 40, 30), (10, 10, 12))
    arc(img, [C - 150, C - 150, C + 150, C + 150], 0, 300, GOLD, 8, 10)
    for x, y, a, s in ((C - 90, C - 60, 0.4, 50), (C + 70, C - 90, -0.6, 44), (C + 30, C + 60, 1.2, 56), (C - 60, C + 80, -0.2, 40)):
        p = rot([(x - s, y - s * 0.4), (x + s * 0.7, y - s * 0.6), (x + s, y + s * 0.3), (x - s * 0.4, y + s * 0.6)], a, x, y)
        shape(img, lambda d, c, p=p: d.polygon(p, fill=c), IRON2); shape(img, lambda d, c, p=p: d.line(p + [p[0]], fill=c, width=5), IRON3)
    shape(img, lambda d, c: d.polygon([(C + 150, C - 30), (C + 190, C + 20), (C + 110, C + 20)], fill=c), GOLD)
    return img
def c5():   # 알뜰 공급: gold coin stamped with a hammer
    img = background((70, 50, 14), (14, 10, 8))
    glow(img, lambda d, c: d.ellipse([C - 150, C - 150, C + 150, C + 150], fill=c), GOLD, 20, 180)
    shape(img, lambda d, c: d.ellipse([C - 135, C - 135, C + 135, C + 135], fill=c), (220, 170, 70))
    shape(img, lambda d, c: d.ellipse([C - 110, C - 110, C + 110, C + 110], outline=c, width=10), (255, 220, 140))
    hammer(img, C, C - 40, 120, 0.6, head=(140, 100, 40))
    return img

ICONS = {'bs1_a1': a1, 'bs1_a2': a2, 'bs1_a3': a3, 'bs1_a4': a4, 'bs1_a5': a5, 'bs1_b1': b1, 'bs1_b2': b2, 'bs1_b3': b3, 'bs1_b4': b4, 'bs1_b5': b5,
         'bs1_c1': c1, 'bs1_c2': c2, 'bs1_c3': c3, 'bs1_c4': c4, 'bs1_c5': c5}
if __name__ == '__main__':
    names = sys.argv[1:] or list(ICONS)
    out = []
    for n in names:
        img = ICONS[n](); frame(img); img = mask_circle(img).resize((128, 128), Image.LANCZOS)
        img.save(os.path.join(OUT, n + '.png')); out.append(img); print(n)
    os.makedirs('/tmp/smith', exist_ok=True)
    sheet = Image.new('RGBA', (5 * 136, ((len(out) + 4) // 5) * 136), (40, 36, 48, 255))
    for i, im in enumerate(out): sheet.alpha_composite(im, ((i % 5) * 136 + 4, (i // 5) * 136 + 4))
    sheet.save('/tmp/smith/icons_sheet.png')
