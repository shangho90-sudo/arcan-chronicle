"""디자이너 2차 스킬 아이콘 15개 (128 px, 원형) — 2026-11-16.

Usage:  python3 tools/ui/designer_icons.py [ds_a1 ...]   ->  assets/ui/skills/ds_*.png  (+ /tmp/designer/icons_sheet.png 비교표)

대장장이 아이콘(tools/ui/smith_icons.py)과 같은 틀(어두운 원형 바탕 + 금테). 색: 분홍·보라·아이보리·백금 + 금빛 실·작은 보석.
그림: 드레이핑 원단 · 닫히는 가위 · 봉제 바늘 · X자 재단 · 패턴 도면 / 실크 길 · 리본 매듭 · 마네킹 · 보석 핀(조명) · 런웨이 / 의상 · 자수 · 리본 장신구 · 바늘과 실크 방패 · 치수선 브로치.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
import smith_icons as B
from smith_icons import C, rot, glow, shape, background, frame, mask_circle, arc, layer
OUT = B.OUT
PINK, PINK2, ROSE, LILAC, VIOLET, IVORY, PLAT, GOLD, GOLD2, WHITE, JEWEL, TEAL = (255, 150, 200), (240, 100, 170), (220, 70, 140), (200, 160, 255), (130, 80, 200), (255, 244, 226), (226, 230, 240), (255, 210, 122), (220, 160, 60), (255, 250, 240), (120, 220, 255), (110, 220, 200)

def scissors(img, cx, cy, s, a, open_=0.35, col=PLAT):
    for sg in (1, -1):
        b = a + sg * open_
        blade = rot([(cx, cy - 0.07 * s), (cx + 1.25 * s, cy - 0.015 * s), (cx + 1.25 * s, cy + 0.015 * s), (cx, cy + 0.07 * s)], b, cx, cy)
        shape(img, lambda d, c, p=blade: d.polygon(p, fill=c), col)
        hx, hy = cx - 0.55 * s * math.cos(b), cy - 0.55 * s * math.sin(b)
        shape(img, lambda d, c, x=hx, y=hy: d.ellipse([x - 0.24 * s, y - 0.24 * s, x + 0.24 * s, y + 0.24 * s], outline=c, width=max(6, int(0.08 * s))), GOLD)
        shape(img, lambda d, c, p=[(cx, cy), (hx, hy)]: d.line(p, fill=c, width=max(6, int(0.09 * s))), GOLD)
    shape(img, lambda d, c: d.ellipse([cx - 0.08 * s, cy - 0.08 * s, cx + 0.08 * s, cy + 0.08 * s], fill=c), JEWEL)
def needle(img, x0, y0, x1, y1, w=8):
    glow(img, lambda d, c: d.line([(x0, y0), (x1, y1)], fill=c, width=w + 6), GOLD, 8, 200)
    shape(img, lambda d, c: d.line([(x0, y0), (x1, y1)], fill=c, width=w), GOLD)
    shape(img, lambda d, c: d.ellipse([x0 - w, y0 - w, x0 + w, y0 + w], outline=c, width=3), GOLD2)
def dashes(img, pts, col=GOLD, w=7, seg=18, gap=12):
    for (a, b) in zip(pts, pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = int(L // (seg + gap)) + 1
        for i in range(n):
            u0, u1 = i * (seg + gap) / L, min(1, (i * (seg + gap) + seg) / L)
            if u0 >= 1: break
            p = [(a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0), (a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1)]
            shape(img, lambda d, c, p=p: d.line(p, fill=c, width=w), col)
def cloth(img, pts, col, edge=WHITE, a=255):
    glow(img, lambda d, c: d.polygon(pts, fill=c), col, 12, 150)
    L = layer(); ImageDraw.Draw(L).polygon(pts, fill=col + (a,)); img.alpha_composite(L)
    shape(img, lambda d, c: d.line(pts + [pts[0]], fill=c, width=5), edge)
def ribbon_band(img, pts, w, col, col2):
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        shape(img, lambda d, c, p=[a, b]: d.line(p, fill=c, width=w), col if i % 2 == 0 else col2)
def jewel(img, x, y, r, col=JEWEL):
    glow(img, lambda d, c: d.ellipse([x - r * 1.6, y - r * 1.6, x + r * 1.6, y + r * 1.6], fill=c), col, 8, 200)
    shape(img, lambda d, c: d.polygon([(x, y - r), (x + r, y), (x, y + r), (x - r, y)], fill=c), col)
    shape(img, lambda d, c: d.polygon([(x, y - r * 0.6), (x + r * 0.3, y), (x, y - r * 0.1)], fill=c), WHITE)
def pin(img, x, y, h):
    shape(img, lambda d, c: d.line([(x, y), (x, y + h)], fill=c, width=6), PLAT); jewel(img, x, y, 14, GOLD)
def bow(img, cx, cy, s, col=PINK2, col2=PINK):
    for sg in (1, -1):
        p = [(cx, cy), (cx + sg * s, cy - 0.6 * s), (cx + sg * 1.05 * s, cy + 0.55 * s)]
        shape(img, lambda d, c, p=p: d.polygon(p, fill=c), col)
        q = [(cx, cy), (cx + sg * 0.75 * s, cy - 0.35 * s), (cx + sg * 0.8 * s, cy + 0.3 * s)]
        shape(img, lambda d, c, p=q: d.polygon(p, fill=c), col2)
        t = [(cx, cy), (cx + sg * 0.35 * s, cy + 1.1 * s), (cx + sg * 0.6 * s, cy + 1.0 * s)]
        shape(img, lambda d, c, p=t: d.polygon(p, fill=c), col)
def mannequin(img, cx, cy, s, col=IVORY):
    shape(img, lambda d, c: d.ellipse([cx - 0.28 * s, cy - 1.15 * s, cx + 0.28 * s, cy - 0.65 * s], fill=c), col)
    shape(img, lambda d, c: d.polygon([(cx - 0.55 * s, cy - 0.55 * s), (cx + 0.55 * s, cy - 0.55 * s), (cx + 0.35 * s, cy + 0.2 * s), (cx + 0.5 * s, cy + 0.6 * s), (cx - 0.5 * s, cy + 0.6 * s), (cx - 0.35 * s, cy + 0.2 * s)], fill=c), col)
    shape(img, lambda d, c: d.line([(cx, cy + 0.6 * s), (cx, cy + 1.05 * s)], fill=c, width=10), GOLD2)
    shape(img, lambda d, c: d.line([(cx - 0.4 * s, cy + 1.08 * s), (cx + 0.4 * s, cy + 1.08 * s)], fill=c, width=10), GOLD2)
def sparkle(img, pts, col=GOLD, r=9):
    for x, y in pts:
        glow(img, lambda d, c, x=x, y=y: d.ellipse([x - r * 2, y - r * 2, x + r * 2, y + r * 2], fill=c), col, 6, 200)
        shape(img, lambda d, c, x=x, y=y: d.polygon([(x, y - r * 1.6), (x + r * 0.35, y - r * 0.35), (x + r * 1.6, y), (x + r * 0.35, y + r * 0.35), (x, y + r * 1.6), (x - r * 0.35, y + r * 0.35), (x - r * 1.6, y), (x - r * 0.35, y - r * 0.35)], fill=c), WHITE)

def a1():   # 실크 드레이핑: translucent cloth over a silhouette, gold pins at the corners
    img = background((90, 40, 90), (16, 8, 18))
    shape(img, lambda d, c: d.ellipse([C - 80, C - 60, C + 80, C + 140], fill=c), (60, 40, 70))
    cloth(img, [(C - 170, C - 60), (C - 40, C - 130), (C + 60, C - 110), (C + 170, C - 50), (C + 130, C + 160), (C, C + 120), (C - 130, C + 165)], PINK, WHITE, 170)
    for x, y in ((C - 170, C - 60), (C + 170, C - 50), (C + 130, C + 160), (C - 130, C + 165)): pin(img, x, y - 20, 34)
    return img
def a2():   # 패턴 브레이크: dashed line + big closing scissors
    img = background((80, 30, 70), (14, 6, 14))
    dashes(img, [(C - 190, C + 120), (C + 190, C - 120)], GOLD, 8)
    scissors(img, C - 10, C + 10, 150, -0.56, 0.12)
    sparkle(img, [(C + 140, C - 90)], GOLD, 14)
    return img
def a3():   # 오트쿠튀르 스티치: zigzag seam with a gold needle and thread
    img = background((60, 40, 90), (10, 8, 18))
    pts = [(C - 170, C + 90), (C - 100, C - 40), (C - 30, C + 90), (C + 40, C - 40), (C + 110, C + 90)]
    dashes(img, pts, IVORY, 6, 14, 10)
    glow(img, lambda d, c: d.line(pts[:4], fill=c, width=7), GOLD, 6, 220); shape(img, lambda d, c: d.line(pts[:4], fill=c, width=5), GOLD)
    needle(img, C + 40, C - 40, C + 160, C - 160, 10)
    return img
def a4():   # 크로스 커팅: pink + silver X with a flash at the centre
    img = background((90, 30, 70), (14, 6, 14))
    glow(img, lambda d, c: d.line([(C - 160, C - 160), (C + 160, C + 160)], fill=c, width=26), PINK2, 14, 255); shape(img, lambda d, c: d.line([(C - 160, C - 160), (C + 160, C + 160)], fill=c, width=12), PINK)
    glow(img, lambda d, c: d.line([(C + 160, C - 160), (C - 160, C + 160)], fill=c, width=26), PLAT, 14, 220); shape(img, lambda d, c: d.line([(C + 160, C - 160), (C - 160, C + 160)], fill=c, width=12), WHITE)
    sparkle(img, [(C, C)], GOLD, 26)
    return img
def a5():   # 그랑 패턴 피날레: pattern sheet with gold dashed lines + giant scissors
    img = background((70, 50, 30), (12, 10, 8))
    L = layer(); ImageDraw.Draw(L).polygon([(C - 180, C - 150), (C + 180, C - 170), (C + 170, C + 40), (C - 170, C + 60)], fill=IVORY + (200,)); img.alpha_composite(L)
    for k in range(4): dashes(img, [(C - 150, C - 120 + k * 45), (C + 150, C - 135 + k * 45)], GOLD2, 5, 14, 10)
    scissors(img, C, C + 110, 120, -1.57, 0.5)
    return img
def b1():   # 실크 로드: a silk road in perspective with a speeding figure trail
    img = background((80, 40, 90), (12, 8, 16))
    cloth(img, [(C - 60, C + 190), (C + 60, C + 190), (C + 30, C - 160), (C - 30, C - 160)], LILAC, WHITE, 170)
    for k in range(3): shape(img, lambda d, c, k=k: d.line([(C - 120 + k * 20, C + 40 - k * 60), (C - 40 + k * 20, C + 40 - k * 60)], fill=c, width=8), PINK)
    sparkle(img, [(C + 20, C - 150)], GOLD, 12)
    return img
def b2():   # 리본 피루엣: two flat ribbons swirling + knot
    img = background((90, 30, 80), (14, 6, 14))
    arc(img, [C - 170, C - 150, C + 170, C + 150], 200, 520, PINK, 28, 8)
    arc(img, [C - 130, C - 180, C + 130, C + 120], 20, 300, LILAC, 22, 8)
    bow(img, C, C + 30, 70)
    return img
def b3():   # 미러 피팅: mannequin with a ribbon cape, thread lines
    img = background((60, 40, 80), (10, 8, 16))
    for k in range(5): shape(img, lambda d, c, k=k: d.line([(C - 190 + k * 15, C - 120 + k * 50), (C - 70, C - 60 + k * 30)], fill=c, width=3), GOLD)
    mannequin(img, C + 20, C + 10, 140)
    cloth(img, [(C - 40, C - 60), (C + 80, C - 60), (C + 140, C + 140), (C - 100, C + 140)], ROSE, PINK, 200)
    return img
def b4():   # 뮤즈의 초대: thin spotlight cone + stage glyph + two jewel pins
    img = background((40, 30, 60), (8, 6, 14))
    L = layer(); ImageDraw.Draw(L).polygon([(C - 20, C - 200), (C + 20, C - 200), (C + 110, C + 120), (C - 110, C + 120)], fill=(255, 236, 170, 90)); img.alpha_composite(L)
    shape(img, lambda d, c: d.ellipse([C - 130, C + 90, C + 130, C + 160], outline=c, width=8), GOLD)
    jewel(img, C - 160, C + 70, 22, PINK); jewel(img, C + 160, C + 70, 22, JEWEL)
    return img
def b5():   # 오트쿠튀르 컬렉션: runway strip + three different silhouettes
    img = background((70, 40, 70), (12, 8, 14))
    L = layer(); ImageDraw.Draw(L).polygon([(C - 70, C + 200), (C + 70, C + 200), (C + 25, C - 170), (C - 25, C - 170)], fill=(255, 240, 220, 120)); img.alpha_composite(L)
    for x, y, col, k in ((C - 110, C + 40, PINK, 0), (C + 10, C - 30, LILAC, 1), (C + 120, C + 50, GOLD, 2)):
        shape(img, lambda d, c, x=x, y=y: d.ellipse([x - 20, y - 90, x + 20, y - 50], fill=c), IVORY)
        shape(img, lambda d, c, x=x, y=y, k=k: d.polygon([(x - 30, y - 50), (x + 30, y - 50), (x + 50 + k * 10, y + 60), (x - 50 - k * 10, y + 60)], fill=c), col)
    return img
def c1():   # 시그니처 쿠튀르: dress on a small mannequin + gold sparkle
    img = background((80, 40, 70), (12, 8, 14))
    mannequin(img, C, C - 10, 130, (230, 220, 210))
    cloth(img, [(C - 60, C - 80), (C + 60, C - 80), (C + 130, C + 110), (C - 130, C + 110)], PINK2, GOLD, 255)
    shape(img, lambda d, c: d.line([(C - 60, C - 20), (C + 60, C - 20)], fill=c, width=8), GOLD)
    sparkle(img, [(C + 140, C - 120)], GOLD, 12)
    return img
def c2():   # 아르카나 엠브로이더리: embroidery hoop with a star stitched + needle
    img = background((50, 40, 80), (10, 8, 16))
    shape(img, lambda d, c: d.ellipse([C - 160, C - 160, C + 160, C + 160], fill=c), IVORY)
    shape(img, lambda d, c: d.ellipse([C - 160, C - 160, C + 160, C + 160], outline=c, width=18), (170, 120, 70))
    st = [(C + 90 * math.cos(-math.pi / 2 + k * 4 * math.pi / 5), C + 90 * math.sin(-math.pi / 2 + k * 4 * math.pi / 5)) for k in range(6)]
    glow(img, lambda d, c: d.line(st, fill=c, width=12), GOLD, 8, 200); shape(img, lambda d, c: d.line(st, fill=c, width=8), ROSE)
    needle(img, C + 60, C + 60, C + 190, C - 70, 9)
    return img
def c3():   # 주얼 리본 크래프트: ribbon bow + central jewel
    img = background((80, 30, 70), (14, 6, 14))
    bow(img, C, C - 10, 130)
    jewel(img, C, C - 10, 34, JEWEL)
    sparkle(img, [(C - 140, C - 120), (C + 150, C + 100)], GOLD, 10)
    return img
def c4():   # 미라클 리스티치: silk shield with stitched edge + needle
    img = background((60, 50, 90), (10, 8, 16))
    sh = [(C, C - 170), (C + 140, C - 110), (C + 120, C + 60), (C, C + 170), (C - 120, C + 60), (C - 140, C - 110)]
    cloth(img, sh, LILAC, WHITE, 210)
    dashes(img, [(C - 110, C - 90), (C, C - 140), (C + 110, C - 90)], GOLD, 6, 12, 8)
    dashes(img, [(C + 95, C + 50), (C, C + 140), (C - 95, C + 50)], GOLD, 6, 12, 8)
    needle(img, C - 60, C + 60, C + 70, C - 70, 9)
    return img
def c5():   # 테일러드 퍼펙션: measuring tape outline around a body + glowing brooch
    img = background((70, 50, 30), (12, 10, 8))
    shape(img, lambda d, c: d.ellipse([C - 50, C - 170, C + 50, C - 80], fill=c), (110, 90, 120))
    shape(img, lambda d, c: d.polygon([(C - 100, C - 70), (C + 100, C - 70), (C + 120, C + 170), (C - 120, C + 170)], fill=c), (110, 90, 120))
    for k in range(-8, 9): shape(img, lambda d, c, k=k: d.line([(C - 130 + k * 0.4, C - 70 + k * 14), (C - 115 + k * 0.4, C - 70 + k * 14)], fill=c, width=4), GOLD)
    shape(img, lambda d, c: d.line([(C - 120, C - 70), (C - 130, C + 170)], fill=c, width=6), GOLD)
    jewel(img, C + 40, C - 20, 30, GOLD)
    return img

ICONS = {f'ds_{k}': v for k, v in dict(a1=a1, a2=a2, a3=a3, a4=a4, a5=a5, b1=b1, b2=b2, b3=b3, b4=b4, b5=b5, c1=c1, c2=c2, c3=c3, c4=c4, c5=c5).items()}
if __name__ == '__main__':
    names = sys.argv[1:] or list(ICONS)
    out = []
    for n in names:
        img = ICONS[n](); frame(img); img = mask_circle(img).resize((128, 128), Image.LANCZOS)
        img.save(os.path.join(OUT, n + '.png')); out.append(img); print(n, end=' ')
    os.makedirs('/tmp/designer', exist_ok=True)
    sheet = Image.new('RGBA', (5 * 136, ((len(out) + 4) // 5) * 136), (40, 36, 48, 255))
    for i, im in enumerate(out): sheet.alpha_composite(im, ((i % 5) * 136 + 4, (i // 5) * 136 + 4))
    sheet.save('/tmp/designer/icons_sheet.png')
