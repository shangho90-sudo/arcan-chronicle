"""화가 2차 스킬 아이콘 15개 (128 px, 원형) — 2026-11-16 '그린 그림을 현실로'.

Usage:  python3 tools/ui/painter_icons.py [pt_a1 ...]   ->  assets/ui/skills/pt_*.png  (+ /tmp/painter/icons_sheet.png 비교표)

대장장이 아이콘(tools/ui/smith_icons.py)과 같은 틀(어두운 원 + 금테)을 불러 쓰고 스킬마다 다른 실루엣을 그린다. 다른 직업 아이콘은 건드리지 않음.
주제: 먹 늑대 · 채색 종이학 · 액자 기사 · 크로키 · 용의 눈 · 두꺼운 붓질 · 수채 파도 · 점묘 · 팔레트 · 추상화 · 꽃밭 · 원근 성벽 · 폭풍 화폭 · 구도 · 갤러리.
"""
import math, os, sys, random
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from smith_icons import S, C, OUT, rot, layer, glow, shape, background, frame, mask_circle, arc, puff, WHITE
INK, INK2, PAPER, GOLD, GOLDD = (26, 22, 34), (70, 70, 100), (246, 238, 220), (255, 210, 74), (190, 120, 20)
RED, REDD, BLUE, BLUED, YEL, GREEN, GREEND, VIOLET, PINK = (232, 52, 60), (130, 14, 24), (74, 140, 255), (26, 58, 168), (255, 214, 70), (150, 224, 112), (58, 138, 48), (208, 112, 255), (255, 176, 210)
R = random.Random(5)

def brush(img, pts, w, col, dry=True):
    """굵기가 바뀌는 붓선(필압): pts 를 따라 원을 찍음 + 마른 붓 결"""
    L = layer(); d = ImageDraw.Draw(L)
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]; n = max(2, int(math.hypot(x1 - x0, y1 - y0) / 3))
        for k in range(n):
            t = (i + k / n) / (len(pts) - 1); r = w * (0.35 + 0.65 * math.sin(math.pi * min(1, t * 1.05)) ** 0.6)
            x, y = x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n; d.ellipse([x - r, y - r, x + r, y + r], fill=col + (255,))
    if dry:
        for i in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[i], pts[i + 1]
            for s in range(-2, 3): d.line([(x0 + s * w * 0.3, y0 + s * w * 0.25), (x1 + s * w * 0.3, y1 + s * w * 0.25)], fill=(0, 0, 0, 0), width=1)
    img.alpha_composite(L)
def wash(img, cx, cy, r, col, a=150):
    for k in range(5): glow(img, lambda d, c, k=k: d.ellipse([cx - r * (1 - k * 0.12) + R.uniform(-6, 6), cy - r * 0.8 * (1 - k * 0.12), cx + r * (1 - k * 0.12), cy + r * 0.8 * (1 - k * 0.12)], fill=c), col, 10, a // (k + 1) + 30)
def dot(img, x, y, r, col, inner=WHITE):
    glow(img, lambda d, c: d.ellipse([x - r * 2, y - r * 2, x + r * 2, y + r * 2], fill=c), col, r, 200); shape(img, lambda d, c: d.ellipse([x - r, y - r, x + r, y + r], fill=c), inner)
def frame_gold(img, x0, y0, x1, y1, w=16):
    shape(img, lambda d, c: d.rectangle([x0, y0, x1, y1], outline=c, width=w), GOLD); shape(img, lambda d, c: d.rectangle([x0 + w, y0 + w, x1 - w, y1 - w], outline=c, width=3), GOLDD)

def a1():   # 묵수·흑랑: 먹으로 그린 늑대 머리, 번진 먹
    img = background((236, 226, 200), (120, 108, 90))
    wash(img, C, C + 20, 170, (60, 60, 90), 90)
    head = [(C - 150, C + 40), (C - 60, C - 60), (C - 40, C - 160), (C + 10, C - 70), (C + 70, C - 160), (C + 80, C - 50), (C + 190, C + 10), (C + 120, C + 80), (C - 40, C + 140)]
    glow(img, lambda d, c: d.polygon(head, fill=c), (120, 130, 200), 18, 200); shape(img, lambda d, c: d.polygon(head, fill=c), INK)
    brush(img, [(C - 150, C + 40), (C - 60, C - 60), (C - 40, C - 160)], 10, INK2); brush(img, [(C + 70, C - 160), (C + 80, C - 50), (C + 190, C + 10)], 10, INK2)
    dot(img, C + 60, C - 20, 12, (255, 230, 150), (255, 240, 200))
    for i in range(6): dot(img, C - 160 + i * 24 + R.uniform(-8, 8), C + 170 + R.uniform(-10, 10), 5, INK2, INK)
    return img
def a2():   # 비화·채색군학: 채색된 종이학 둘
    img = background((60, 90, 130), (10, 14, 26))
    def crane(cx, cy, s, col):
        wl = [(cx, cy), (cx - s * 1.4, cy - s * 0.7), (cx - s * 0.2, cy + s * 0.1)]; wr = [(cx, cy), (cx + s * 1.3, cy - s * 0.9), (cx + s * 0.2, cy + s * 0.1)]
        body = [(cx - s * 0.9, cy + s * 0.2), (cx + s * 1.0, cy + s * 0.1), (cx + s * 0.1, cy + s * 0.55)]
        for p, k in ((wl, 0.85), (wr, 1.0), (body, 0.92)): shape(img, lambda d, c, p=p: d.polygon(p, fill=c), tuple(int(v * k) for v in col))
        shape(img, lambda d, c: d.line([(cx + s, cy + s * 0.1), (cx + s * 1.4, cy - s * 0.3)], fill=c, width=8), REDD)
    crane(C - 40, C - 40, 120, PINK); crane(C + 90, C + 110, 80, (170, 210, 255))
    brush(img, [(C - 190, C + 160), (C - 60, C + 60), (C + 30, C + 40)], 6, (160, 210, 255))
    return img
def a3():   # 유화·팔레트 기사: 금 액자 + 걸어 나오는 기사(투구·검)
    img = background((50, 60, 120), (10, 10, 22))
    frame_gold(img, C - 150, C - 190, C + 110, C + 190, 18)
    shape(img, lambda d, c: d.ellipse([C - 40, C - 140, C + 50, C - 50], fill=c), (190, 200, 220))
    shape(img, lambda d, c: d.polygon([(C - 70, C - 40), (C + 80, C - 40), (C + 70, C + 110), (C - 60, C + 110)], fill=c), BLUE)
    brush(img, [(C - 60, C - 20), (C + 60, C + 90)], 6, (130, 170, 255), False)
    shape(img, lambda d, c: d.polygon([(C + 90, C + 30), (C + 108, C + 30), (C + 200, C - 170), (C + 186, C - 178)], fill=c), (230, 236, 250))
    shape(img, lambda d, c: d.line([(C + 70, C + 40), (C + 130, C + 20)], fill=c, width=14), GOLD)
    shape(img, lambda d, c: d.ellipse([C - 120, C - 10, C - 40, C + 100], fill=c), RED); shape(img, lambda d, c: d.line([(C - 80, C - 5), (C - 80, C + 95)], fill=c, width=8), GOLD)
    return img
def a4():   # 크로키·잔상 모사: 겹친 연필선 사람 + 회색 잔상
    img = background((90, 90, 96), (16, 16, 20))
    for k, (o, col) in enumerate(((-26, (120, 120, 130)), (0, (240, 238, 230)))):
        for j in range(3):
            q = o + j * 3; w = 5 if k else 4
            shape(img, lambda d, c, q=q: d.ellipse([C - 40 + q, C - 170, C + 30 + q, C - 100], outline=c, width=w), col)
            shape(img, lambda d, c, q=q: d.line([(C + q, C - 100), (C - 6 + q, C + 30), (C - 70 + q, C + 170)], fill=c, width=w), col)
            shape(img, lambda d, c, q=q: d.line([(C - 6 + q, C + 30), (C + 70 + q, C + 170)], fill=c, width=w), col)
            shape(img, lambda d, c, q=q: d.line([(C - 90 + q, C - 30), (C + q, C - 70), (C + 100 + q, C - 20)], fill=c, width=w), col)
    for i in range(7): shape(img, lambda d, c, i=i: d.line([(C + 90 + i * 10, C + 60), (C + 140 + i * 10, C + 10)], fill=c, width=2), (200, 200, 210))
    return img
def a5():   # 궁극·화룡점정: 먹 용 머리 + 붓끝이 찍는 금빛 눈
    img = background((232, 220, 190), (110, 96, 76))
    brush(img, [(C - 200, C + 150), (C - 100, C + 60), (C - 20, C + 110), (C + 60, C + 20)], 26, INK)
    head = [(C + 20, C - 40), (C + 120, C - 110), (C + 200, C - 60), (C + 190, C + 10), (C + 80, C + 40)]
    shape(img, lambda d, c: d.polygon(head, fill=c), INK)
    for sg in (-1, 1): brush(img, [(C + 110, C - 100), (C + 80, C - 190 + sg * 10)], 7, (230, 210, 150), False)
    brush(img, [(C + 190, C + 0), (C + 230, C + 60), (C + 220, C + 120)], 4, INK2, False)
    dot(img, C + 140, C - 55, 18, GOLD, (255, 250, 210))
    shape(img, lambda d, c: d.polygon([(C + 160, C - 75), (C + 230, C - 190), (C + 250, C - 180), (C + 175, C - 65)], fill=c), (200, 140, 80))   # 붓대
    return img
def b1():   # 진홍·임파스토: 두꺼운 붉은 붓질 + 불씨
    img = background((110, 20, 26), (16, 6, 8))
    brush(img, [(C - 190, C + 120), (C - 80, C - 10), (C + 60, C - 60), (C + 190, C - 40)], 46, RED)
    brush(img, [(C - 170, C + 100), (C - 70, C - 10), (C + 60, C - 50)], 14, (255, 130, 110), False)
    for i in range(6): dot(img, C - 120 + i * 50, C - 110 + R.uniform(-40, 30), 6, (255, 160, 60), (255, 220, 140))
    return img
def b2():   # 청람·워터컬러: 투명한 수채 파도
    img = background((20, 50, 120), (6, 10, 24))
    for k in range(3): wash(img, C - 60 + k * 60, C + 60 - k * 10, 150 - k * 20, BLUE, 110)
    wave = [(C - 210 + i * 12, C + 30 + math.sin(i * 0.35) * 40 - (60 if 14 < i < 22 else 0) * math.sin((i - 14) / 8 * math.pi)) for i in range(36)]
    brush(img, wave, 18, (200, 230, 255), False); brush(img, [(x, y + 40) for x, y in wave], 10, BLUE, False)
    return img
def b3():   # 황금·포인틸리즘: 금빛 점 고리 + 가운데 큰 점
    img = background((110, 80, 10), (16, 12, 4))
    for ri, rr in enumerate((180, 125, 70)):
        n = 14 - ri * 3
        for i in range(n): a = i / n * 6.283 + ri * 0.4; dot(img, C + math.cos(a) * rr, C + math.sin(a) * rr, 11 - ri * 2, GOLD, (255, 240, 170))
    dot(img, C, C, 30, GOLD, (255, 250, 220))
    return img
def b4():   # 팔레트 퓨전: 팔레트 + 세 색이 휘저어 꽃처럼
    img = background((70, 30, 100), (12, 6, 18))
    pal = [(C - 170, C + 20), (C - 100, C - 120), (C + 60, C - 150), (C + 180, C - 60), (C + 160, C + 100), (C + 20, C + 170), (C - 130, C + 140)]
    shape(img, lambda d, c: d.polygon(pal, fill=c), (210, 160, 100)); shape(img, lambda d, c: d.ellipse([C - 150, C + 40, C - 100, C + 90], fill=c), (40, 20, 50))
    for i, col in enumerate((RED, BLUE, YEL)): a = i / 3 * 6.283 - 1.2; brush(img, [(C + math.cos(a + t * 0.25) * (40 + t * 14), C + math.sin(a + t * 0.25) * (40 + t * 14)) for t in range(8)], 20, col, False)
    dot(img, C, C, 18, (255, 255, 255), (255, 250, 255))
    return img
def b5():   # 궁극·스펙트럼 걸작: 추상화 색면(빨·파·금) + 둥근 파동
    img = background((40, 30, 60), (8, 6, 12))
    arc(img, [C - 200, C - 200, C + 200, C + 200], 0, 360, (255, 255, 255), 4, 8)
    brush(img, [(C - 160, C - 90), (C - 30, C - 150), (C + 60, C - 120)], 40, RED)
    brush(img, [(C - 120, C + 80), (C + 10, C + 20), (C + 150, C + 60)], 40, BLUE)
    brush(img, [(C + 120, C - 160), (C + 160, C - 30), (C + 110, C + 120)], 34, YEL)
    for r, col in ((150, RED), (120, BLUE), (90, YEL)): arc(img, [C - r, C - r, C + r, C + r], 20, 340, col, 5, 6)
    return img
def c1():   # 수채정원·꽃의 들판: 연두 번짐 + 꽃
    img = background((40, 90, 40), (8, 18, 8))
    wash(img, C, C + 60, 190, GREEN, 140)
    for (x, y, col) in ((C - 100, C + 30, PINK), (C + 20, C - 30, (255, 240, 160)), (C + 120, C + 50, (180, 210, 255)), (C - 30, C + 120, (255, 255, 255))):
        brush(img, [(x, y + 110), (x + 6, y + 40), (x, y)], 6, GREEND, False)
        for i in range(6): a = i / 6 * 6.283; shape(img, lambda d, c, a=a, x=x, y=y: d.ellipse([x + math.cos(a) * 26 - 20, y + math.sin(a) * 26 - 14, x + math.cos(a) * 26 + 20, y + math.sin(a) * 26 + 14], fill=c), col)
        dot(img, x, y, 10, GOLD, GOLD)
    return img
def c2():   # 원근화법·백색 성벽: 원근 보조선 + 흰 성벽
    img = background((60, 70, 110), (10, 12, 20))
    vp = (C, C - 200)
    for x in (C - 220, C - 120, C + 120, C + 220): shape(img, lambda d, c, x=x: d.line([vp, (x, C + 220)], fill=c, width=2), (140, 150, 200))
    wall = [(C - 170, C + 140), (C + 170, C + 140), (C + 150, C - 20), (C - 150, C - 20)]
    shape(img, lambda d, c: d.polygon(wall, fill=c), (244, 240, 230))
    for i in range(6): x = C - 150 + i * 56; shape(img, lambda d, c, x=x: d.rectangle([x, C - 70, x + 30, C - 20], fill=c), (244, 240, 230))
    for y in (C + 30, C + 85): shape(img, lambda d, c, y=y: d.line([(C - 160, y), (C + 160, y)], fill=c, width=3), (170, 168, 180))
    return img
def c3():   # 폭풍화·뇌운의 캔버스: 작은 화폭의 먹구름 + 번개
    img = background((40, 50, 90), (6, 8, 16))
    frame_gold(img, C - 170, C - 190, C + 170, C + 40, 12)
    for (x, y, r) in ((C - 70, C - 80, 70), (C + 20, C - 110, 80), (C + 90, C - 70, 60), (C, C - 50, 70)): shape(img, lambda d, c, x=x, y=y, r=r: d.ellipse([x - r, y - r * 0.7, x + r, y + r * 0.7], fill=c), (60, 62, 84))
    bolt = [(C + 10, C - 30), (C - 30, C + 70), (C + 20, C + 70), (C - 30, C + 200)]
    glow(img, lambda d, c: d.line(bolt, fill=c, width=22), (150, 180, 255), 12, 255); shape(img, lambda d, c: d.line(bolt, fill=c, width=8), (240, 246, 255))
    for i in range(8): shape(img, lambda d, c, i=i: d.line([(C - 140 + i * 38, C + 70), (C - 150 + i * 38, C + 110)], fill=c, width=3), (150, 190, 255))
    return img
def c4():   # 마스터의 구도: 화폭 + 바깥으로 넓어지는 보조 붓선
    img = background((70, 60, 40), (12, 10, 8))
    frame_gold(img, C - 90, C - 110, C + 90, C + 110, 12)
    for k, r in enumerate((150, 195)): arc(img, [C - r, C - r, C + r, C + r], 200 - k * 10, 520 + k * 10, GOLD, 6 - k * 2, 6)
    for a in (0.6, 2.2, 3.8, 5.4): x, y = C + math.cos(a) * 205, C + math.sin(a) * 205; brush(img, [(C + math.cos(a) * 150, C + math.sin(a) * 150), (x, y)], 8, GOLD, False)
    wash(img, C, C, 70, GREEN, 120)
    return img
def c5():   # 궁극·만상갤러리: 화폭 세 장 + 금빛 붓선
    img = background((80, 60, 20), (12, 8, 4))
    for i, (x, col) in enumerate(((C - 130, GREEN), (C, (240, 240, 250)), (C + 130, (90, 100, 150)))):
        y = C - 40 - (30 if i == 1 else 0); frame_gold(img, x - 60, y - 90, x + 60, y + 70, 10); shape(img, lambda d, c, x=x, y=y: d.rectangle([x - 48, y - 78, x + 48, y + 58], fill=c), col)
    for x in (C - 130, C, C + 130): brush(img, [(x, C + 40), (C, C + 170)], 6, GOLD, False)
    dot(img, C, C + 170, 16, GOLD, (255, 250, 210))
    return img

ICONS = {'pt_' + f.__name__: f for f in (a1, a2, a3, a4, a5, b1, b2, b3, b4, b5, c1, c2, c3, c4, c5)}
if __name__ == '__main__':
    names = sys.argv[1:] or list(ICONS); out = []
    for n in names:
        img = ICONS[n](); frame(img); img = mask_circle(img).resize((128, 128), Image.LANCZOS)
        img.save(os.path.join(OUT, n + '.png')); out.append(img); print(n)
    os.makedirs('/tmp/painter', exist_ok=True)
    sheet = Image.new('RGBA', (5 * 136, ((len(out) + 4) // 5) * 136), (40, 36, 48, 255))
    for i, im in enumerate(out): sheet.alpha_composite(im, ((i % 5) * 136 + 4, (i // 5) * 136 + 4))
    sheet.save('/tmp/painter/icons_sheet.png')
