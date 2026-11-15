"""한약사 2차 스킬 아이콘 15개 (128 px, 원형) — 2026-11-16 '본초 도사'.

Usage:  python3 tools/ui/herbal_icons.py [hb_a1 ...]   ->  assets/ui/skills/hb_*.png  (+ /tmp/herbal/icons_sheet.png 비교표)

대장장이 아이콘(tools/ui/smith_icons.py)과 같은 틀(어두운 원 + 금테)을 불러 쓰고 스킬마다 다른 실루엣을 그린다. 다른 직업 아이콘은 건드리지 않음.
색 역할: 회복 호박·금 / 약초·생명 옥빛·청록 / 독 보라 / 오행 — 목 청록(뿌리·용), 화 주홍(날개), 토 황토(지맥·돌기둥), 금 백금(침·발톱), 수 청옥(물결·등껍질).
"""
import math, os, sys
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from smith_icons import S, C, OUT, rot, layer, glow, shape, background, frame, mask_circle, arc, puff, WHITE
AMBER, GOLD, JADE, TEAL, LEAF, LEAFD = (255, 184, 80), (255, 224, 138), (122, 240, 192), (90, 240, 224), (90, 190, 80), (40, 110, 50)
PURP, PURPD, VERM, VERMD, OCHRE, PLAT, SAPH, SAPHD, CLAY, BARK, IVORY = (208, 144, 255), (110, 40, 170), (255, 120, 60), (220, 40, 20), (240, 190, 90), (240, 246, 255), (140, 210, 255), (40, 90, 220), (150, 84, 48), (110, 76, 46), (250, 232, 190)

def leaf(img, x, y, L, a, col=LEAF, vein=(200, 250, 170)):
    pts = []
    for i in range(13):
        t = i / 12; w = L * 0.36 * math.sin(math.pi * t); pts.append((x + t * L, y - w))
    for i in range(12, -1, -1):
        t = i / 12; w = L * 0.36 * math.sin(math.pi * t); pts.append((x + t * L, y + w))
    p = rot(pts, a, x, y); shape(img, lambda d, c: d.polygon(p, fill=c), col)
    v = rot([(x, y), (x + L * 0.95, y)], a, x, y); shape(img, lambda d, c: d.line(v, fill=c, width=max(2, int(L * 0.05))), vein)
def herb(img, x, y, s, col=LEAF):
    shape(img, lambda d, c: d.line([(x, y), (x + 4, y - s)], fill=c, width=8), LEAFD)
    for i in range(5): leaf(img, x + 2, y - s * (0.2 + i * 0.17), s * (0.5 - i * 0.05), -0.6 - (i % 2) * 2.0 + (0.4 if i % 2 else 0), col)
def pot(img, cx, cy, s):
    body = [(cx - s, cy - s * 0.5), (cx + s, cy - s * 0.5), (cx + s * 1.1, cy + s * 0.2), (cx + s * 0.8, cy + s * 0.75), (cx - s * 0.8, cy + s * 0.75), (cx - s * 1.1, cy + s * 0.2)]
    shape(img, lambda d, c: d.polygon(body, fill=c), CLAY)
    shape(img, lambda d, c: d.rectangle([cx - s * 1.08, cy - s * 0.05, cx + s * 1.08, cy + s * 0.08], fill=c), OCHRE)
    shape(img, lambda d, c: d.ellipse([cx - s * 0.85, cy - s * 0.7, cx + s * 0.85, cy - s * 0.35], fill=c), (110, 60, 34))
    for sg in (-1, 1): shape(img, lambda d, c, sg=sg: d.arc([cx + sg * s * 1.05 - s * 0.3, cy - s * 0.35, cx + sg * s * 1.05 + s * 0.3, cy + s * 0.25], 0, 360, fill=c, width=10), CLAY)
def spiral(img, cx, cy, r0, r1, turns, col, w):
    pts = [(cx + (r0 + (r1 - r0) * t / 80) * math.cos(t / 80 * turns * 6.283), cy + (r0 + (r1 - r0) * t / 80) * math.sin(t / 80 * turns * 6.283) * 0.55 - t * 2.2) for t in range(81)]
    glow(img, lambda d, c: d.line(pts, fill=c, width=w * 2), col, 10, 230); shape(img, lambda d, c: d.line(pts, fill=c, width=w), WHITE)
def dot(img, x, y, r, col, inner=WHITE):
    glow(img, lambda d, c: d.ellipse([x - r * 2, y - r * 2, x + r * 2, y + r * 2], fill=c), col, r, 220); shape(img, lambda d, c: d.ellipse([x - r, y - r, x + r, y + r], fill=c), inner)
def root_line(img, pts, w, col=BARK):
    shape(img, lambda d, c: d.line(pts, fill=c, width=w, joint='curve'), col)
    shape(img, lambda d, c: d.line([(x + 3, y - 3) for x, y in pts], fill=c, width=max(2, w // 4)), (170, 130, 90))
def dragon_head(img, cx, cy, s, col=TEAL, a=0.0):
    head = rot([(cx - s, cy - s * 0.35), (cx + s * 0.4, cy - s * 0.5), (cx + s * 1.2, cy - s * 0.2), (cx + s * 1.25, cy + s * 0.1), (cx + s * 0.4, cy + s * 0.35), (cx - s, cy + s * 0.4)], a, cx, cy)
    glow(img, lambda d, c: d.polygon(head, fill=c), col, 14, 200); shape(img, lambda d, c: d.polygon(head, fill=c), (40, 150, 140))
    for sg in (-1, 1):
        h = rot([(cx - s * 0.5, cy - s * 0.4 * sg), (cx - s * 1.0, cy - s * 0.9 * sg), (cx - s * 1.3, cy - s * 1.0 * sg)], a, cx, cy); shape(img, lambda d, c, h=h: d.line(h, fill=c, width=10), (240, 224, 160))
        w = rot([(cx + s * 1.1, cy + s * 0.05 * sg), (cx + s * 1.6, cy + s * 0.3 * sg), (cx + s * 2.0, cy + s * 0.15 * sg)], a, cx, cy); shape(img, lambda d, c, w=w: d.line(w, fill=c, width=5), GOLD)
    e = rot([(cx + s * 0.25, cy - s * 0.2)], a, cx, cy)[0]; dot(img, e[0], e[1], s * 0.1, GOLD, (255, 230, 120))

def a1():   # 구증구포·보원탕: 탕관 + 둘레를 도는 약초 + 금빛 김
    img = background((90, 50, 14), (14, 10, 8))
    arc(img, [C - 190, C - 120, C + 190, C + 140], 200, 520, AMBER, 6, 8)
    pot(img, C, C + 70, 120)
    for k, (x, y) in enumerate([(C - 170, C - 40), (C + 150, C - 70), (C - 40, C - 130)]): leaf(img, x, y, 70, -0.4 + k, LEAF)
    for x, y, r in ((C - 30, C - 60, 45), (C + 30, C - 120, 38), (C - 10, C - 175, 30)): puff(img, x, y, r, GOLD, 200)
    glow(img, lambda d, c: d.ellipse([C - 90, C - 10, C + 90, C + 30], fill=c), AMBER, 12, 255)
    return img
def a2():   # 대주천: 발끝에서 손끝으로 감아 오르는 청록 기운 나선
    img = background((10, 70, 64), (6, 14, 16))
    glow(img, lambda d, c: d.ellipse([C - 40, C - 150, C + 40, C - 70], fill=c), JADE, 20, 120)
    body = [(C - 30, C - 70), (C + 30, C - 70), (C + 55, C + 80), (C + 30, C + 190), (C - 30, C + 190), (C - 55, C + 80)]
    shape(img, lambda d, c: d.polygon(body, fill=c), (20, 60, 60)); shape(img, lambda d, c: d.ellipse([C - 40, C - 150, C + 40, C - 70], fill=c), (20, 60, 60))
    spiral(img, C, C + 200, 150, 70, 2.3, TEAL, 10)
    for x, y in ((C - 170, C - 120), (C + 160, C - 150)): dot(img, x, y, 12, TEAL)
    return img
def a3():   # 금강 약갑: 나무껍질·잎맥 판이 겹친 옥빛 방패(잎맥 금빛)
    img = background((20, 70, 44), (8, 14, 10))
    for k, a in enumerate((-0.5, 0.5, 0)):
        p = rot([(C - 90, C - 150), (C + 90, C - 150), (C + 110, C + 20), (C, C + 170), (C - 110, C + 20)], a, C, C + 120, 0.95 if k < 2 else 1)
        shape(img, lambda d, c, p=p: d.polygon(p, fill=c), (60, 160, 120) if k < 2 else (80, 200, 150))
        shape(img, lambda d, c, p=p: d.line(p + [p[0]], fill=c, width=8), (30, 90, 60))
    shape(img, lambda d, c: d.line([(C, C - 140), (C, C + 160)], fill=c, width=10), GOLD)
    for y in (C - 80, C - 10, C + 60): shape(img, lambda d, c, y=y: d.line([(C, y + 40), (C - 70, y)], fill=c, width=6), GOLD); shape(img, lambda d, c, y=y: d.line([(C, y + 40), (C + 70, y)], fill=c, width=6), GOLD)
    glow(img, lambda d, c: d.line([(C, C - 140), (C, C + 160)], fill=c, width=24), GOLD, 12, 160)
    return img
def a4():   # 백초 훈증진: 둥근 약초 무늬 바닥 + 가운데 탕관 + 가장자리 약초 + 김
    img = background((60, 46, 14), (10, 10, 8))
    glow(img, lambda d, c: d.ellipse([C - 210, C + 10, C + 210, C + 200], outline=c, width=14), GOLD, 8, 255)
    shape(img, lambda d, c: d.ellipse([C - 205, C + 15, C + 205, C + 195], outline=c, width=5), (255, 240, 180))
    for k in range(8):
        a = k / 8 * 6.283; x, y = C + math.cos(a) * 130, C + 105 + math.sin(a) * 58; shape(img, lambda d, c, x=x, y=y: d.ellipse([x - 20, y - 8, x + 20, y + 8], fill=c), (120, 200, 110))
    for x in (C - 190, C + 170): herb(img, x, C + 100, 120)
    pot(img, C, C + 60, 70)
    for x, y, r in ((C - 10, C - 30, 40), (C + 20, C - 90, 34), (C - 15, C - 150, 28)): puff(img, x, y, r, (255, 246, 220), 170)
    return img
def a5():   # 백초귀원: 금빛 환약 + 그 아래 피는 빛의 약초꽃
    img = background((90, 60, 10), (16, 10, 6))
    for k in range(8):
        a = k / 8 * 6.283 - 1.57; p = rot([(C, C + 70), (C - 40, C - 10), (C, C - 130), (C + 40, C - 10)], a + 1.57, C, C + 70, 1.0)
        glow(img, lambda d, c, p=p: d.polygon(p, fill=c), AMBER, 14, 170); shape(img, lambda d, c, p=p: d.polygon(p, fill=c), (255, 214, 140))
    glow(img, lambda d, c: d.ellipse([C - 75, C - 5, C + 75, C + 145], fill=c), GOLD, 26, 255)
    shape(img, lambda d, c: d.ellipse([C - 50, C + 20, C + 50, C + 120], fill=c), (255, 200, 80)); shape(img, lambda d, c: d.line([(C - 50, C + 70), (C + 50, C + 70)], fill=c, width=8), (255, 250, 210))
    shape(img, lambda d, c: d.ellipse([C - 30, C + 34, C - 6, C + 54], fill=c), WHITE)
    return img
def b1():   # 갈근·반룡근: 땅에서 솟는 굵은 뿌리, 끝이 작은 용머리
    img = background((50, 46, 20), (10, 10, 8))
    glow(img, lambda d, c: d.ellipse([C - 200, C + 140, C + 200, C + 210], fill=c), LEAF, 16, 180)
    root_line(img, [(C - 120, C + 180), (C - 140, C + 40), (C - 70, C - 60), (C - 10, C - 90)], 34)
    root_line(img, [(C + 120, C + 180), (C + 150, C + 60), (C + 110, C - 20)], 26)
    root_line(img, [(C, C + 190), (C + 20, C + 100), (C - 10, C + 30)], 22)
    dragon_head(img, C + 30, C - 100, 62, TEAL, -0.25)
    return img
def b2():   # 독초·자운화: 보라 꽃 + 포자 고리
    img = background((60, 20, 80), (12, 8, 16))
    for r, a in ((200, 120), (160, 170)): glow(img, lambda d, c, r=r: d.ellipse([C - r, C - r * 0.6 + 40, C + r, C + r * 0.6 + 40], outline=c, width=10), PURP, 8, a)
    shape(img, lambda d, c: d.line([(C, C + 190), (C, C + 10)], fill=c, width=12), LEAFD); leaf(img, C, C + 120, 90, -0.6); leaf(img, C, C + 90, 80, -2.6)
    for k in range(5):
        a = k / 5 * 6.283 - 1.57; p = rot([(C, C - 20), (C - 45, C - 90), (C, C - 150), (C + 45, C - 90)], a + 1.57, C, C - 20)
        glow(img, lambda d, c, p=p: d.polygon(p, fill=c), PURP, 10, 200); shape(img, lambda d, c, p=p: d.polygon(p, fill=c), (180, 110, 240))
    dot(img, C, C - 20, 22, PURP, (255, 220, 120))
    for x, y in ((C - 170, C - 120), (C + 160, C - 140), (C + 180, C + 40), (C - 180, C + 30)): dot(img, x, y, 10, PURP, (230, 190, 255))
    return img
def b3():   # 천년삼 동자: 통통한 인삼 몸·잎 머리·짧은 뿌리 팔다리·얼굴
    img = background((80, 60, 20), (14, 10, 8))
    glow(img, lambda d, c: d.ellipse([C - 150, C - 120, C + 150, C + 210], fill=c), GOLD, 30, 120)
    for sg in (-1, 1):
        root_line(img, [(C + sg * 70, C + 40), (C + sg * 140, C - 10), (C + sg * 175, C - 40)], 22, IVORY)
        root_line(img, [(C + sg * 40, C + 150), (C + sg * 60, C + 200), (C + sg * 80, C + 215)], 22, IVORY)
    shape(img, lambda d, c: d.ellipse([C - 100, C - 10, C + 100, C + 175], fill=c), IVORY)
    shape(img, lambda d, c: d.ellipse([C - 85, C - 130, C + 85, C + 30], fill=c), (255, 240, 210))
    for sg in (-1, 1):
        shape(img, lambda d, c, sg=sg: d.ellipse([C + sg * 32 - 12, C - 70, C + sg * 32 + 12, C - 42], fill=c), (30, 20, 20))
        shape(img, lambda d, c, sg=sg: d.ellipse([C + sg * 58 - 18, C - 30, C + sg * 58 + 18, C - 14], fill=c), (255, 160, 150))
    shape(img, lambda d, c: d.arc([C - 20, C - 40, C + 20, C - 12], 20, 160, fill=c, width=5), (150, 60, 50))
    for k in range(5): leaf(img, C, C - 125, 80, -1.57 + (k - 2) * 0.55, LEAF)
    for k in range(3): dot(img, C - 12 + k * 12, C - 200 + (k % 2) * 10, 9, (255, 60, 40), (230, 40, 30))
    return img
def b4():   # 영지·녹각수호령: 사슴 머리 옆모습 + 영지 버섯 뿔
    img = background((40, 60, 40), (10, 12, 10))
    head = [(C - 60, C + 190), (C - 70, C + 40), (C - 20, C - 30), (C + 80, C - 10), (C + 150, C + 40), (C + 140, C + 70), (C + 40, C + 70), (C + 20, C + 190)]
    shape(img, lambda d, c: d.polygon(head, fill=c), BARK); shape(img, lambda d, c: d.line(head + [head[0]], fill=c, width=8), (70, 46, 28))
    leaf(img, C - 40, C - 10, 80, -2.4, (100, 170, 80))
    dot(img, C + 40, C + 15, 12, (40, 30, 20), (30, 20, 16))
    root_line(img, [(C - 10, C - 30), (C - 40, C - 120), (C - 90, C - 180)], 18); root_line(img, [(C - 30, C - 90), (C + 30, C - 150), (C + 70, C - 190)], 14); root_line(img, [(C - 55, C - 150), (C - 140, C - 160)], 12)
    for x, y, r in ((C - 100, C - 185, 46), (C + 75, C - 195, 40), (C - 150, C - 160, 32)):
        glow(img, lambda d, c, x=x, y=y, r=r: d.ellipse([x - r, y - r * 0.4, x + r, y + r * 0.4], fill=c), GOLD, 10, 160)
        shape(img, lambda d, c, x=x, y=y, r=r: d.ellipse([x - r, y - r * 0.4, x + r, y + r * 0.4], fill=c), (170, 50, 30)); shape(img, lambda d, c, x=x, y=y, r=r: d.arc([x - r, y - r * 0.4, x + r, y + r * 0.4], 180, 360, fill=c, width=6), (250, 170, 90))
    return img
def b5():   # 신농백초원: 펼친 두루마리와 그 위 약초 그림, 아래로 내려오는 빛
    img = background((40, 70, 30), (10, 12, 8))
    shape(img, lambda d, c: d.rectangle([C - 170, C - 150, C + 170, C + 20], fill=c), (246, 232, 196))
    shape(img, lambda d, c: d.rectangle([C - 158, C - 138, C + 158, C + 8], outline=c, width=5), (200, 150, 60))
    for sg in (-1, 1): shape(img, lambda d, c, sg=sg: d.rounded_rectangle([C + sg * 185 - 18, C - 175, C + sg * 185 + 18, C + 45], 12, fill=c), (150, 80, 40)); shape(img, lambda d, c, sg=sg: d.rectangle([C + sg * 185 - 22, C - 185, C + sg * 185 + 22, C - 165], fill=c), GOLD)
    for x in (C - 100, C, C + 100): herb(img, x, C + 0, 120, (80, 160, 70))
    for x in (C - 120, C - 40, C + 40, C + 120): glow(img, lambda d, c, x=x: d.line([(x, C + 40), (x, C + 180)], fill=c, width=14), GOLD, 8, 200); dot(img, x, C + 190, 10, GOLD)
    return img
def c1():   # 목행·청룡승근: 차례로 솟는 뿌리 줄 + 청룡 머리(청록)
    img = background((10, 70, 60), (6, 14, 14))
    for k, (x, h) in enumerate(((C - 170, 60), (C - 100, 100), (C - 30, 140))): root_line(img, [(x, C + 190), (x + 10, C + 190 - h), (x + 25, C + 180 - h * 1.3)], 20 + k * 2, (50, 130, 110))
    root_line(img, [(C + 50, C + 190), (C + 60, C + 60), (C + 30, C - 40)], 30, (40, 140, 120))
    dragon_head(img, C + 40, C - 80, 70, TEAL, -0.55)
    return img
def c2():   # 화행·주작천구: 붉은 날개를 편 주작(둥근 폭발이 아니라 날개)
    img = background((110, 30, 10), (16, 6, 6))
    for sg in (-1, 1):
        for k in range(6):
            a = math.radians(-160 + k * 22) if sg < 0 else math.radians(-20 - k * 22); L = 190 - abs(k - 2) * 12
            p = [(C, C + 20), (C + math.cos(a) * L * 0.95 + 14, C + 20 + math.sin(a) * L * 0.95), (C + math.cos(a) * L, C + 20 + math.sin(a) * L), (C + math.cos(a) * L * 0.95 - 14, C + 20 + math.sin(a) * L * 0.95)]
            p = [(C + (x - C) * (1 if sg > 0 else 1), y) for x, y in p]
            glow(img, lambda d, c, p=p: d.polygon(p, fill=c), VERM, 10, 200); shape(img, lambda d, c, p=p: d.polygon(p, fill=c), (255, 120 + k * 18, 50))
    shape(img, lambda d, c: d.ellipse([C - 34, C - 20, C + 34, C + 90], fill=c), (230, 70, 30)); shape(img, lambda d, c: d.ellipse([C - 24, C - 60, C + 24, C - 12], fill=c), (255, 170, 60))
    for k in (-1, 0, 1): shape(img, lambda d, c, k=k: d.line([(C, C + 80), (C + k * 50, C + 200)], fill=c, width=12), (255, 190, 80))
    dot(img, C, C - 40, 6, GOLD, (40, 10, 0))
    return img
def c3():   # 토행·황정지맥: 땅속 금빛 맥 고리 + 낮은 육각 돌기둥
    img = background((70, 50, 14), (12, 10, 6))
    glow(img, lambda d, c: d.ellipse([C - 200, C + 40, C + 200, C + 200], outline=c, width=12), GOLD, 8, 255)
    for k in range(7):
        a = k / 7 * 6.283; pts = [(C + math.cos(a) * r, C + 120 + math.sin(a) * r * 0.42 + math.sin(r * 0.05) * 6) for r in range(10, 200, 18)]
        glow(img, lambda d, c, p=pts: d.line(p, fill=c, width=8), GOLD, 5, 255)
    for x, y, h in ((C - 90, C + 110, 120), (C + 80, C + 100, 150), (C, C + 160, 90)):
        p = [(x - 34, y), (x - 34, y - h), (x, y - h - 18), (x + 34, y - h), (x + 34, y)]
        shape(img, lambda d, c, p=p: d.polygon(p, fill=c), (200, 160, 90)); shape(img, lambda d, c, p=p: d.line(p, fill=c, width=6), (120, 90, 40))
    return img
def c4():   # 금행·백호유침: 부채꼴 백금 침 + 엇갈린 금빛 발톱 선
    img = background((40, 44, 60), (10, 10, 14))
    for k in range(7):
        a = math.radians(-150 + k * 20); x0, y0 = C - 140, C + 150; x1, y1 = x0 + math.cos(a) * 60 + 260, y0 + math.sin(a) * 60 - 240 + k * 34
        glow(img, lambda d, c, x0=x0, y0=y0, x1=x1, y1=y1: d.line([(x0 + (x1 - x0) * 0.4, y0 + (y1 - y0) * 0.4), (x1, y1)], fill=c, width=10), PLAT, 6, 160)
        shape(img, lambda d, c, x0=x0, y0=y0, x1=x1, y1=y1: d.line([(x0 + (x1 - x0) * 0.4, y0 + (y1 - y0) * 0.4), (x1, y1)], fill=c, width=4), WHITE)
    for k in range(3): arc(img, [C + 10 + k * 34 - 160, C - 160, C + 10 + k * 34 + 60, C + 60], 300, 350, GOLD, 8, 8)
    return img
def c5():   # 수행·현무약해: 낮은 청옥 물결 + 거북 등껍질 육각 무늬
    img = background((14, 40, 90), (6, 8, 18))
    for k in range(7):
        a = k / 6 * 6.283 if k else 0; x, y = (C + math.cos(a) * 70, C - 40 + math.sin(a) * 50) if k else (C, C - 40)
        hx = [(x + math.cos(i / 6 * 6.283) * 40, y + math.sin(i / 6 * 6.283) * 30) for i in range(6)]
        shape(img, lambda d, c, h=hx: d.polygon(h, fill=c), (50, 110, 200)); shape(img, lambda d, c, h=hx: d.line(h + [h[0]], fill=c, width=6), SAPH)
    for k, y in enumerate((C + 90, C + 150)):
        pts = [(x, y - 26 * math.sin((x - C + 230) / 460 * 6.283 * 1.5 + k)) for x in range(int(C) - 220, int(C) + 221, 10)]
        glow(img, lambda d, c, p=pts: d.line(p, fill=c, width=26), SAPH, 10, 230); shape(img, lambda d, c, p=pts: d.line(p, fill=c, width=8), (220, 240, 255))
    return img

ICONS = {'hb_a1': a1, 'hb_a2': a2, 'hb_a3': a3, 'hb_a4': a4, 'hb_a5': a5, 'hb_b1': b1, 'hb_b2': b2, 'hb_b3': b3, 'hb_b4': b4, 'hb_b5': b5,
         'hb_c1': c1, 'hb_c2': c2, 'hb_c3': c3, 'hb_c4': c4, 'hb_c5': c5}
if __name__ == '__main__':
    names = sys.argv[1:] or list(ICONS); out = []
    for n in names:
        img = ICONS[n](); frame(img); img = mask_circle(img).resize((128, 128), Image.LANCZOS)
        img.save(os.path.join(OUT, n + '.png')); out.append(img); print(n)
    os.makedirs('/tmp/herbal', exist_ok=True)
    sheet = Image.new('RGBA', (5 * 136, ((len(out) + 4) // 5) * 136), (40, 36, 48, 255))
    for i, im in enumerate(out): sheet.alpha_composite(im, ((i % 5) * 136 + 4, (i // 5) * 136 + 4))
    sheet.save('/tmp/herbal/icons_sheet.png')
