"""쉐프 2차 스킬 아이콘 15개 (128 px, 원형) — 2026-11-16.

Usage:  python3 tools/ui/chef_icons.py [cf_a1 ...]   ->  assets/ui/skills/cf_*.png  (+ /tmp/chef/icons_sheet.png 비교표)

대장장이 아이콘(tools/ui/smith_icons.py)과 같은 틀(어두운 원형 바탕 + 금테)을 그대로 불러 쓰고 그림만 다르다.
색 역할: A 불(주홍 불꽃·호박색 소스·구리 도구) / B 디저트(크림·과일색·옅은 하늘색 냉기·금빛 캐러멜) / C 만찬(따뜻한 금·은·허브 초록).
그림: 웍 · 불붙은 소스 · 압력솥 · 꼬치 · 클로슈 / 소르베 · 접시 · 밀푀유 원반 · 설탕 벽 · 디저트 탑 / 접시 플레이팅 · 구리 냄비 · 은쟁반 · 허브 잎 · 세 쟁반.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
import smith_icons as B
from smith_icons import C, rot, glow, shape, background, frame, mask_circle, puff, arc, layer
OUT = B.OUT
FIRE, FIREB, AMBER, COPPER, COPPER2 = (255, 120, 40), (230, 60, 20), (255, 176, 60), (196, 104, 56), (240, 150, 90)
CREAM, ICE, ICEB, CARAMEL, GOLD, SILVER, SILVER2, HERB, WHITE = (255, 240, 214), (200, 236, 255), (110, 180, 240), (230, 160, 60), (255, 210, 122), (205, 214, 228), (150, 160, 178), (110, 196, 90), (255, 248, 232)
FRUIT = [(255, 120, 150), (255, 200, 80), (140, 220, 120), (190, 140, 255), (255, 150, 90)]
IRONDK = (52, 50, 56)

def flames(img, cx, cy, w, h, n=3):
    for i in range(n):
        x = cx + (i - (n - 1) / 2) * w * 0.6
        p = [(x - w * 0.35, cy), (x - w * 0.15, cy - h * 0.55), (x, cy - h), (x + w * 0.18, cy - h * 0.5), (x + w * 0.35, cy)]
        glow(img, lambda d, c, p=p: d.polygon(p, fill=c), FIREB, 14, 230)
        shape(img, lambda d, c, p=p: d.polygon(p, fill=c), FIRE)
        q = [(x - w * 0.16, cy), (x, cy - h * 0.55), (x + w * 0.16, cy)]
        shape(img, lambda d, c, q=q: d.polygon(q, fill=c), AMBER)
def wok(img, cx, cy, s, a=0.0):
    bowl = rot([(cx - s, cy - 0.1 * s), (cx + s, cy - 0.1 * s), (cx + 0.7 * s, cy + 0.35 * s), (cx - 0.7 * s, cy + 0.35 * s)], a, cx, cy)
    shape(img, lambda d, c: d.polygon(bowl, fill=c), IRONDK)
    rim = rot([(cx - s, cy - 0.16 * s), (cx + s, cy - 0.16 * s), (cx + s, cy - 0.06 * s), (cx - s, cy - 0.06 * s)], a, cx, cy)
    shape(img, lambda d, c: d.polygon(rim, fill=c), COPPER2)
    h = rot([(cx + s, cy - 0.12 * s), (cx + 1.7 * s, cy - 0.3 * s), (cx + 1.7 * s, cy - 0.18 * s), (cx + s, cy - 0.02 * s)], a, cx, cy)
    shape(img, lambda d, c: d.polygon(h, fill=c), (120, 70, 36))
def cloche(img, cx, cy, s, col=SILVER, glowc=GOLD):
    glow(img, lambda d, c: d.pieslice([cx - s, cy - s, cx + s, cy + s], 180, 360, fill=c), glowc, 18, 170)
    shape(img, lambda d, c: d.pieslice([cx - s, cy - s, cx + s, cy + s], 180, 360, fill=c), col)
    shape(img, lambda d, c: d.arc([cx - s * 0.8, cy - s * 0.8, cx + s * 0.8, cy + s * 0.8], 200, 250, fill=c, width=10), WHITE)
    shape(img, lambda d, c: d.ellipse([cx - s * 0.12, cy - s * 1.12, cx + s * 0.12, cy - s * 0.88], fill=c), GOLD)
    shape(img, lambda d, c: d.rectangle([cx - s * 1.15, cy, cx + s * 1.15, cy + s * 0.1], fill=c), SILVER2)
def scoop(img, x, y, r, col):
    glow(img, lambda d, c: d.ellipse([x - r, y - r, x + r, y + r], fill=c), col, 10, 160)
    shape(img, lambda d, c: d.ellipse([x - r, y - r, x + r, y + r], fill=c), col)
    shape(img, lambda d, c: d.ellipse([x - r * 0.5, y - r * 0.6, x - r * 0.05, y - r * 0.2], fill=c), WHITE)
def leaf(img, x, y, s, a):
    p = rot([(x - s, y), (x - s * 0.2, y - s * 0.45), (x + s, y), (x - s * 0.2, y + s * 0.45)], a, x, y)
    shape(img, lambda d, c: d.polygon(p, fill=c), HERB); shape(img, lambda d, c: d.line(rot([(x - s, y), (x + s, y)], a, x, y), fill=c, width=4), (200, 240, 170))
def stars(img, pts, col=GOLD, r=8):
    for x, y in pts:
        glow(img, lambda d, c, x=x, y=y: d.ellipse([x - r * 2, y - r * 2, x + r * 2, y + r * 2], fill=c), col, 6, 200)
        shape(img, lambda d, c, x=x, y=y: d.polygon([(x, y - r * 1.6), (x + r * 0.4, y - r * 0.4), (x + r * 1.6, y), (x + r * 0.4, y + r * 0.4), (x, y + r * 1.6), (x - r * 0.4, y + r * 0.4), (x - r * 1.6, y), (x - r * 0.4, y - r * 0.4)], fill=c), WHITE)

def a1():   # 인페르노 웍: tilted wok, ingredients arcing up, flame crescent
    img = background((90, 30, 10), (16, 8, 6))
    arc(img, [C - 200, C - 200, C + 200, C + 200], 200, 340, FIRE, 14, 14)
    flames(img, C, C + 40, 120, 130)
    wok(img, C - 20, C + 90, 140, -0.12)
    for x, y, col in ((C - 70, C - 110, (240, 90, 60)), (C + 20, C - 150, (120, 200, 80)), (C + 100, C - 100, (255, 210, 90))): shape(img, lambda d, c, x=x, y=y: d.rounded_rectangle([x - 18, y - 14, x + 18, y + 14], 6, fill=c), col)
    return img
def a2():   # 그랑 플람베: amber sauce puddle with blue flame edge and rising vermilion flames
    img = background((80, 36, 10), (14, 8, 8))
    glow(img, lambda d, c: d.ellipse([C - 190, C + 50, C + 190, C + 170], fill=c), AMBER, 10, 255)
    shape(img, lambda d, c: d.ellipse([C - 170, C + 64, C + 170, C + 156], fill=c), (200, 120, 40))
    glow(img, lambda d, c: d.ellipse([C - 190, C + 50, C + 190, C + 170], outline=c, width=14), (80, 150, 255), 8, 255)
    flames(img, C, C + 110, 150, 230)
    shape(img, lambda d, c: d.ellipse([C + 140, C - 170, C + 170, C - 140], fill=c), AMBER)
    return img
def a3():   # 시그니처 압력솥: copper pressure cooker with gauge, steam jets, lid rattling
    img = background((70, 40, 20), (14, 10, 8))
    shape(img, lambda d, c: d.rounded_rectangle([C - 140, C - 30, C + 140, C + 170], 40, fill=c), COPPER)
    shape(img, lambda d, c: d.rounded_rectangle([C - 140, C - 30, C - 100, C + 170], 20, fill=c), COPPER2)
    lid = rot([(C - 160, C - 70), (C + 160, C - 70), (C + 150, C - 30), (C - 150, C - 30)], -0.1)
    shape(img, lambda d, c: d.polygon(lid, fill=c), SILVER2)
    shape(img, lambda d, c: d.ellipse([C - 45, C + 30, C + 45, C + 120], fill=c), WHITE)
    shape(img, lambda d, c: d.line([(C, C + 75), (C + 30, C + 45)], fill=c, width=8), FIREB)
    for x, y, r in ((C - 90, C - 140, 45), (C + 30, C - 170, 55), (C + 120, C - 130, 40)): puff(img, x, y, r)
    return img
def a4():   # 브로셰트 러시: three skewers flying diagonally, grill flames behind
    img = background((80, 34, 12), (14, 8, 6))
    for k in range(3):
        y0 = C - 100 + k * 90
        line = rot([(C - 210, y0), (C + 200, y0)], -0.35, C, y0)
        glow(img, lambda d, c, l=line: d.line(l, fill=c, width=26), FIRE, 10, 180)
        shape(img, lambda d, c, l=line: d.line(l, fill=c, width=7), SILVER)
        for j, col in enumerate(((150, 70, 40), (230, 60, 40), (250, 240, 210), (120, 200, 80))):
            px, py = rot([(C - 110 + j * 62, y0)], -0.35, C, y0)[0]
            shape(img, lambda d, c, px=px, py=py: d.rounded_rectangle([px - 22, py - 22, px + 22, py + 22], 7, fill=c), col)
    return img
def a5():   # 마스터 셰프 쇼타임: golden cloche slamming, crossed knives, flame ring
    img = background((90, 60, 14), (16, 10, 6))
    glow(img, lambda d, c: d.ellipse([C - 210, C + 90, C + 210, C + 170], outline=c, width=18), FIRE, 12, 255)
    for a in (0.7, -0.7):
        k = rot([(C - 150, C - 150), (C + 150, C - 150), (C + 160, C - 140), (C - 140, C - 130)], a, C, C - 140)
        shape(img, lambda d, c, k=k: d.polygon(k, fill=c), WHITE)
    cloche(img, C, C + 120, 150, col=(240, 196, 90), glowc=FIRE)
    stars(img, [(C - 170, C - 40), (C + 180, C - 20)])
    return img
def b1():   # 소르베 퀸텟: five sorbet scoops in a fan with curved cold trails
    img = background((30, 50, 80), (8, 10, 20))
    for i, col in enumerate(FRUIT):
        a = math.radians(205 + i * 32.5); x = C + math.cos(a) * 150; y = C + 40 + math.sin(a) * 150
        glow(img, lambda d, c, x=x, y=y: d.line([(C, C + 120), (x, y)], fill=c, width=8), ICE, 8, 140)
        scoop(img, x, y, 40, col)
    shape(img, lambda d, c: d.polygon([(C - 40, C + 90), (C + 40, C + 90), (C, C + 200)], fill=c), (226, 180, 110))
    return img
def b2():   # 프로즌 플레이팅: white plate seen from above with frost sauce lines and an ice flower
    img = background((30, 60, 90), (8, 12, 22))
    shape(img, lambda d, c: d.ellipse([C - 190, C - 120, C + 190, C + 150], fill=c), (236, 242, 250))
    shape(img, lambda d, c: d.ellipse([C - 140, C - 80, C + 140, C + 110], outline=c, width=6), SILVER2)
    for k in range(6):
        a = k * math.pi / 3
        glow(img, lambda d, c, a=a: d.line([(C, C + 15), (C + math.cos(a) * 120, C + 15 + math.sin(a) * 85)], fill=c, width=10), ICEB, 6, 220)
        shape(img, lambda d, c, a=a: d.line([(C, C + 15), (C + math.cos(a) * 120, C + 15 + math.sin(a) * 85)], fill=c, width=4), ICE)
    for k in range(6):
        a = k * math.pi / 3 + 0.5; p = [(C, C + 15), (C + math.cos(a - 0.2) * 55, C + 15 + math.sin(a - 0.2) * 40), (C + math.cos(a) * 75, C + 15 + math.sin(a) * 55), (C + math.cos(a + 0.2) * 55, C + 15 + math.sin(a + 0.2) * 40)]
        shape(img, lambda d, c, p=p: d.polygon(p, fill=c), (180, 225, 255))
    stars(img, [(C, C + 15)], WHITE, 10)
    return img
def b3():   # 밀푀유 블레이드: layered golden pastry / ice / cream disc spinning, return arc
    img = background((70, 50, 20), (14, 10, 8))
    arc(img, [C - 210, C - 180, C + 210, C + 200], 150, 30, ICE, 6, 10)
    for i, col in enumerate(((210, 140, 50), CREAM, ICE, (230, 160, 60), CREAM, (200, 130, 40))):
        y = C - 40 + i * 18
        shape(img, lambda d, c, y=y: d.ellipse([C - 150, y - 22, C + 150, y + 22], fill=c), col)
    for k in range(5): shape(img, lambda d, c, k=k: d.line([(C - 150 + k * 70, C - 60), (C - 120 + k * 70, C - 30)], fill=c, width=5), WHITE)
    return img
def b4():   # 슈가 아라베스크: translucent sugar wall drawn by caramel curls
    img = background((70, 46, 20), (12, 10, 10))
    L = layer(); ImageDraw.Draw(L).rounded_rectangle([C - 170, C - 120, C + 170, C + 140], 30, fill=(255, 230, 190, 90)); img.alpha_composite(L)
    for k in range(4):
        x = C - 120 + k * 80
        glow(img, lambda d, c, x=x: d.arc([x - 50, C - 120, x + 50, C - 20], 160, 380, fill=c, width=14), CARAMEL, 6, 255)
        shape(img, lambda d, c, x=x: d.arc([x - 50, C - 120, x + 50, C - 20], 160, 380, fill=c, width=6), GOLD)
    shape(img, lambda d, c: d.rounded_rectangle([C - 170, C - 120, C + 170, C + 140], 30, outline=c, width=8), CARAMEL)
    for ln in ([(C - 60, C - 10), (C - 20, C + 50), (C - 50, C + 110)], [(C + 70, C + 10), (C + 40, C + 70)]): shape(img, lambda d, c, l=ln: d.line(l, fill=c, width=5), WHITE)
    return img
def b5():   # 크로캉부슈 피날레: tower of choux with gold caramel threads and frost
    img = background((50, 60, 90), (10, 12, 22))
    rows = [(5, C + 140), (4, C + 85), (3, C + 30), (2, C - 25), (1, C - 80)]
    glow(img, lambda d, c: d.polygon([(C - 170, C + 170), (C + 170, C + 170), (C, C - 150)], fill=c), ICE, 26, 120)
    for n, y in rows:
        for i in range(n):
            x = C + (i - (n - 1) / 2) * 66
            shape(img, lambda d, c, x=x, y=y: d.ellipse([x - 32, y - 28, x + 32, y + 28], fill=c), (226, 168, 90))
            shape(img, lambda d, c, x=x, y=y: d.ellipse([x - 20, y - 26, x + 14, y - 10], fill=c), CREAM)
    for k in range(4): shape(img, lambda d, c, k=k: d.arc([C - 150 + k * 18, C - 130 + k * 40, C + 150 - k * 18, C + 150], 200, 340, fill=c, width=4), GOLD)
    stars(img, [(C, C - 130), (C - 140, C - 60), (C + 140, C - 40)], WHITE, 7)
    return img
def c1():   # 시그니처 메뉴: plate with main + side + sauce swirl, gold rim
    img = background((70, 50, 20), (12, 10, 8))
    glow(img, lambda d, c: d.ellipse([C - 200, C - 130, C + 200, C + 160], outline=c, width=16), GOLD, 12, 255)
    shape(img, lambda d, c: d.ellipse([C - 190, C - 120, C + 190, C + 150], fill=c), (244, 240, 230))
    shape(img, lambda d, c: d.arc([C - 140, C - 80, C + 120, C + 110], 120, 330, fill=c, width=12), (170, 50, 40))
    shape(img, lambda d, c: d.ellipse([C - 90, C - 50, C + 50, C + 50], fill=c), (140, 70, 36))
    leaf(img, C + 80, C - 10, 36, -0.5); leaf(img, C + 60, C + 50, 30, 0.6)
    return img
def c2():   # 황금 부용: copper pot of golden broth, ladle, steam, herb leaves
    img = background((70, 50, 16), (12, 10, 8))
    for x, y, r in ((C - 60, C - 120, 40), (C + 40, C - 150, 46)): puff(img, x, y, r, (255, 240, 200), 180)
    shape(img, lambda d, c: d.pieslice([C - 160, C - 140, C + 160, C + 180], 0, 180, fill=c), COPPER)
    glow(img, lambda d, c: d.ellipse([C - 160, C - 30, C + 160, C + 50], fill=c), GOLD, 10, 255)
    shape(img, lambda d, c: d.ellipse([C - 150, C - 22, C + 150, C + 42], fill=c), (255, 196, 70))
    shape(img, lambda d, c: d.line([(C + 40, C + 10), (C + 150, C - 170)], fill=c, width=12), SILVER)
    leaf(img, C - 60, C + 8, 30, 0.3); leaf(img, C + 10, C + 14, 24, -0.8)
    return img
def c3():   # 봉 아페티!: small silver tray, cloche lifting, food glow
    img = background((50, 52, 70), (10, 10, 14))
    shape(img, lambda d, c: d.ellipse([C - 190, C + 70, C + 190, C + 150], fill=c), SILVER)
    glow(img, lambda d, c: d.ellipse([C - 90, C + 30, C + 90, C + 110], fill=c), GOLD, 22, 255)
    shape(img, lambda d, c: d.ellipse([C - 70, C + 40, C + 70, C + 100], fill=c), (200, 110, 60))
    k = layer(); cl = Image.new('RGBA', k.size); cloche(cl, C, C - 10, 120); img.alpha_composite(cl.rotate(-14, center=(C, C - 10), translate=(30, -60)))
    stars(img, [(C - 140, C - 40), (C + 150, C + 30)])
    return img
def c4():   # 셰프의 한 끗: big herb leaf + small gold sparkle
    img = background((30, 60, 30), (8, 12, 8))
    leaf(img, C - 10, C + 20, 150, -0.6)
    stars(img, [(C + 120, C - 110), (C + 160, C - 50)], GOLD, 12)
    return img
def c5():   # 로열 그랑 디너: three small trays/cloches, shield / attack / heal colours
    img = background((70, 56, 20), (12, 10, 8))
    for x, y, g in ((C - 125, C + 40, (220, 230, 255)), (C, C - 50, FIRE), (C + 125, C + 40, GOLD)):
        shape(img, lambda d, c, x=x, y=y: d.ellipse([x - 80, y + 40, x + 80, y + 70], fill=c), SILVER)
        cloche(img, x, y + 45, 62, col=SILVER, glowc=g)
    return img

ICONS = {f'cf_{k}': v for k, v in dict(a1=a1, a2=a2, a3=a3, a4=a4, a5=a5, b1=b1, b2=b2, b3=b3, b4=b4, b5=b5, c1=c1, c2=c2, c3=c3, c4=c4, c5=c5).items()}
if __name__ == '__main__':
    names = sys.argv[1:] or list(ICONS)
    out = []
    for n in names:
        img = ICONS[n](); frame(img); img = mask_circle(img).resize((128, 128), Image.LANCZOS)
        img.save(os.path.join(OUT, n + '.png')); out.append(img); print(n)
    os.makedirs('/tmp/chef', exist_ok=True)
    sheet = Image.new('RGBA', (5 * 136, ((len(out) + 4) // 5) * 136), (40, 36, 48, 255))
    for i, im in enumerate(out): sheet.alpha_composite(im, ((i % 5) * 136 + 4, (i // 5) * 136 + 4))
    sheet.save('/tmp/chef/icons_sheet.png')
