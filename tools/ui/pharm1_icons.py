"""약사 1차 교체 스킬 아이콘 5개 (128 px, 원형) — 2026-11-19.

Usage:  python3 tools/ui/pharm1_icons.py [ph1_a4 ...]   ->  assets/ui/skills/ph1_{a4,b1,b2,b4,c1}.png  (+ /tmp/pharm2/icons_sheet.png: 약사 15개 비교표)

대장장이·양약사 아이콘(tools/ui/smith_icons.py, wp_icons.py)과 같은 틀(어두운 원형 바탕 + 금테)에 스킬마다 다른 실루엣:
  ph1_a4 유봉 되던지기   빙글빙글 도는 유봉(머리·손잡이가 보이게) + 금빛 회전 잔상 + 돌아오는 곡선 화살
  ph1_b1 불꽃심지병      불붙은 심지가 꽂힌 호박색 둥근 병 + 아래 낮은 불꽃 고리
  ph1_b2 서리병 굴리기   흰 줄무늬가 감긴 둥근 푸른 병 + 뒤로 이어지는 가느다란 얼음길 + 끝 파편
  ph1_b4 결정침 개화     세 갈래 보라 결정침(왼쪽·오른쪽 가늘게, 가운데 위 굵게)이 한 점으로 모임
  ph1_c1 꿈꽃가루        연보라 꽃 한 송이 위에 초승달 + 금빛 꽃가루
나머지 약사 아이콘 10개는 사용자 그림에서 자른 것(tools/ui/skill_icons_crop.py — 이 5개는 그 스크립트가 건너뜀).
"""
import math, os, sys
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from smith_icons import rot, layer, glow, shape, background, frame, mask_circle, OUT, S, C
GOLD, GOLDD, WOOD, WOODD, WHITE = (255, 210, 122), (190, 130, 50), (196, 150, 98), (120, 82, 46), (255, 250, 240)
AMBER, AMBERD, FIRE, FIREY = (255, 176, 60), (170, 90, 20), (255, 110, 30), (255, 226, 120)
ICE, ICEB, ICED = (196, 238, 255), (90, 170, 240), (40, 90, 170)
VIO, VIOL, VIOD = (178, 112, 255), (226, 196, 255), (80, 40, 150)
LILAC, MOON = (210, 180, 255), (255, 240, 190)

def pestle(img, cx, cy, s, a):
    """pharmacist pestle (club): thin handle + round head, along angle a"""
    hd = rot([(cx - 0.05 * s, cy), (cx + 0.05 * s, cy), (cx + 0.06 * s, cy + 0.9 * s), (cx - 0.06 * s, cy + 0.9 * s)], a, cx, cy)
    shape(img, lambda d, c: d.polygon(hd, fill=c), WOODD)
    knob = rot([(cx, cy + 0.95 * s)], a, cx, cy)[0]
    shape(img, lambda d, c: d.ellipse([knob[0] - 0.09 * s, knob[1] - 0.09 * s, knob[0] + 0.09 * s, knob[1] + 0.09 * s], fill=c), WOOD)
    head = rot([(cx - 0.11 * s, cy), (cx + 0.11 * s, cy), (cx + 0.2 * s, cy - 0.32 * s), (cx + 0.16 * s, cy - 0.5 * s), (cx, cy - 0.58 * s), (cx - 0.16 * s, cy - 0.5 * s), (cx - 0.2 * s, cy - 0.32 * s)], a, cx, cy)
    shape(img, lambda d, c: d.polygon(head, fill=c), WOOD)
    band = rot([(cx - 0.13 * s, cy - 0.04 * s), (cx + 0.13 * s, cy - 0.04 * s), (cx + 0.13 * s, cy + 0.04 * s), (cx - 0.13 * s, cy + 0.04 * s)], a, cx, cy)
    shape(img, lambda d, c: d.polygon(band, fill=c), GOLD)
    hl = rot([(cx - 0.12 * s, cy - 0.3 * s), (cx - 0.06 * s, cy - 0.48 * s), (cx - 0.02 * s, cy - 0.46 * s), (cx - 0.07 * s, cy - 0.28 * s)], a, cx, cy)
    shape(img, lambda d, c: d.polygon(hl, fill=c), (238, 210, 170))
def dot(img, x, y, r, col):
    glow(img, lambda d, c: d.ellipse([x - r * 2, y - r * 2, x + r * 2, y + r * 2], fill=c), col, r * 0.8, 200)
    shape(img, lambda d, c: d.ellipse([x - r, y - r, x + r, y + r], fill=c), col)
def bottle(img, cx, cy, R, liq, dark, stripes=None):
    glow(img, lambda d, c: d.ellipse([cx - R * 1.15, cy - R * 1.15, cx + R * 1.15, cy + R * 1.15], fill=c), liq, 14, 160)
    shape(img, lambda d, c: d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=c), dark)
    shape(img, lambda d, c: d.ellipse([cx - R * 0.86, cy - R * 0.5, cx + R * 0.86, cy + R * 0.9], fill=c), liq)
    if stripes:
        for k in (-1, 0, 1): shape(img, lambda d, c, k=k: d.arc([cx - R * 0.95, cy - R * (0.95 - k * 0.2), cx + R * 0.95, cy + R * (0.95 + k * 0.2)], 200 + k * 10, 330 + k * 10, fill=c, width=10), stripes)
    shape(img, lambda d, c: d.ellipse([cx - R * 0.55, cy - R * 0.7, cx - R * 0.2, cy - R * 0.35], fill=c), WHITE)
    shape(img, lambda d, c: d.rectangle([cx - R * 0.22, cy - R * 1.35, cx + R * 0.22, cy - R * 0.9], fill=c), dark)
    shape(img, lambda d, c: d.rectangle([cx - R * 0.26, cy - R * 1.08, cx + R * 0.26, cy - R * 0.96], fill=c), GOLD)

def a4():   # 유봉 되던지기
    img = background((130, 84, 26), (16, 10, 10))
    glow(img, lambda d, c: d.ellipse([C - 150, C - 150, C + 130, C + 170], fill=c), GOLDD, 40, 150)
    for k in range(5):   # golden spin ghosts
        a = -0.9 + k * 0.55; glow(img, lambda d, c, a=a: d.line(rot([(C - 10, C - 150), (C - 10, C + 120)], a, C - 10, C - 10), fill=c, width=34), GOLD, 12, 90 + k * 30)
    glow(img, lambda d, c: d.arc([C - 180, C - 170, C + 160, C + 170], 200, 340, fill=c, width=22), GOLD, 10, 220)
    shape(img, lambda d, c: d.arc([C - 180, C - 170, C + 160, C + 170], 200, 340, fill=c, width=7), WHITE)
    tip = (C + 150, C - 60); shape(img, lambda d, c: d.polygon([tip, (tip[0] - 50, tip[1] - 30), (tip[0] - 26, tip[1] + 30)], fill=c), GOLD)   # return arrow head
    pestle(img, C - 10, C + 30, 290, 1.15)
    for x, y in ((C - 160, C + 120), (C + 120, C + 150), (C - 60, C + 175)): dot(img, x, y, 8, GOLD)
    return img
def b1():   # 불꽃심지병
    img = background((120, 48, 14), (14, 9, 10))
    glow(img, lambda d, c: d.ellipse([C - 170, C - 120, C + 170, C + 200], fill=c), FIRE, 40, 120)
    for k in range(7):   # low flame ring
        x = C - 165 + k * 55; h = 60 + (k % 3) * 20
        glow(img, lambda d, c, x=x, h=h: d.polygon([(x - 26, C + 175), (x, C + 175 - h), (x + 26, C + 175)], fill=c), FIRE, 6, 230)
        shape(img, lambda d, c, x=x, h=h: d.polygon([(x - 12, C + 175), (x, C + 175 - h * 0.55), (x + 12, C + 175)], fill=c), FIREY)
    bottle(img, C, C + 30, 110, AMBER, AMBERD)
    shape(img, lambda d, c: d.line([(C, C - 120), (C + 18, C - 160), (C + 8, C - 185)], fill=c, width=10), (240, 228, 200))   # wick
    glow(img, lambda d, c: d.ellipse([C - 40, C - 250, C + 60, C - 150], fill=c), FIRE, 14, 255)
    shape(img, lambda d, c: d.polygon([(C - 12, C - 175), (C + 6, C - 235), (C + 30, C - 175)], fill=c), FIREY)
    return img
def b2():   # 서리병 굴리기
    img = background((30, 70, 130), (8, 10, 18))
    glow(img, lambda d, c: d.ellipse([C - 100, C - 140, C + 180, C + 130], fill=c), ICEB, 40, 110)
    trail = [(C - 230, C + 160), (C - 120, C + 110), (C - 20, C + 70)]
    glow(img, lambda d, c: d.line(trail, fill=c, width=34, joint='curve'), ICE, 10, 200)
    shape(img, lambda d, c: d.line(trail, fill=c, width=14, joint='curve'), WHITE)
    for k, (x, y) in enumerate(((C - 190, C + 145), (C - 140, C + 120), (C - 80, C + 95))): shape(img, lambda d, c, x=x, y=y: d.polygon([(x - 8, y + 10), (x, y - 16), (x + 8, y + 10)], fill=c), ICE)
    bottle(img, C + 40, C - 10, 108, ICEB, ICED, stripes=WHITE)
    for k in range(5):   # end shards fanning forward
        a = -0.65 + k * 0.32; x0, y0 = C + 150 + math.cos(a) * 30, C - 70 + math.sin(a) * 30; x1, y1 = x0 + math.cos(a) * 60, y0 + math.sin(a) * 60
        glow(img, lambda d, c, p=[(x0, y0), (x1, y1)]: d.line(p, fill=c, width=14), ICE, 5, 230)
        shape(img, lambda d, c, p=[(x0, y0), (x1, y1)]: d.line(p, fill=c, width=5), WHITE)
    return img
def spike(img, x0, y0, x1, y1, w, col):
    a = math.atan2(y1 - y0, x1 - x0); nx, ny = -math.sin(a) * w, math.cos(a) * w
    pts = [(x0 + nx, y0 + ny), (x1, y1), (x0 - nx, y0 - ny), (x0 - math.cos(a) * w * 1.4, y0 - math.sin(a) * w * 1.4)]
    glow(img, lambda d, c: d.polygon(pts, fill=c), VIO, 12, 210)
    shape(img, lambda d, c: d.polygon(pts, fill=c), col)
    shape(img, lambda d, c: d.polygon([pts[0], pts[1], (x0, y0)], fill=c), VIOL)
def b4():   # 결정침 개화
    img = background((80, 36, 130), (10, 8, 18)); tx, ty = C, C + 110
    glow(img, lambda d, c: d.ellipse([C - 120, C - 60, C + 120, C + 180], fill=c), VIO, 40, 120)
    glow(img, lambda d, c: d.ellipse([tx - 60, ty - 30, tx + 60, ty + 30], outline=c, width=10), VIO, 6, 200)
    spike(img, C - 200, C - 30, tx - 8, ty - 6, 20, VIOD)
    spike(img, C + 200, C - 30, tx + 8, ty - 6, 20, VIOD)
    spike(img, C, C - 220, tx, ty - 14, 40, VIO)
    for k in range(6): a = -math.pi / 2 + (k - 2.5) * 0.5; dot(img, tx + math.cos(a) * 80, ty + math.sin(a) * 50 - 10, 7, VIOL)
    return img
def c1():   # 꿈꽃가루
    img = background((44, 34, 76), (10, 8, 20))
    glow(img, lambda d, c: d.ellipse([C - 40, C - 220, C + 110, C - 70], fill=c), MOON, 18, 200)   # crescent moon
    shape(img, lambda d, c: d.ellipse([C - 20, C - 205, C + 100, C - 85], fill=c), MOON)
    shape(img, lambda d, c: d.ellipse([C + 6, C - 222, C + 120, C - 108], fill=c), (44, 34, 76))
    cx, cy = C - 20, C + 60
    for k in range(5):   # five-petal lilac flower
        a = -math.pi / 2 + k * 2 * math.pi / 5; px, py = cx + math.cos(a) * 62, cy + math.sin(a) * 62
        glow(img, lambda d, c, px=px, py=py: d.ellipse([px - 58, py - 58, px + 58, py + 58], fill=c), LILAC, 10, 140)
        shape(img, lambda d, c, px=px, py=py: d.ellipse([px - 50, py - 50, px + 50, py + 50], fill=c), LILAC)
        shape(img, lambda d, c, px=px, py=py, a=a: d.line([(cx, cy), (px + math.cos(a) * 20, py + math.sin(a) * 20)], fill=c, width=5), (176, 140, 236))
    shape(img, lambda d, c: d.line([(cx, cy + 50), (cx - 20, C + 220)], fill=c, width=12), (110, 170, 110))
    dot(img, cx, cy, 24, GOLD)
    for x, y in ((C + 90, C + 10), (C + 130, C - 30), (C + 160, C + 40), (C + 110, C + 80), (C + 190, C - 10)): dot(img, x, y, 8, GOLD)
    return img

ICONS = {'ph1_a4': a4, 'ph1_b1': b1, 'ph1_b2': b2, 'ph1_b4': b4, 'ph1_c1': c1}
if __name__ == '__main__':
    names = sys.argv[1:] or list(ICONS)
    for n in names:
        img = ICONS[n](); frame(img); img = mask_circle(img).resize((128, 128), Image.LANCZOS)
        img.save(os.path.join(OUT, n + '.png')); print(n)
    os.makedirs('/tmp/pharm2', exist_ok=True)
    ids = [f'ph1_{k}' for k in ('a1', 'a4', 'a3', 'a6', 'a5', 'b1', 'b2', 'b6', 'b4', 'b5', 'c1', 'c7', 'c6', 'c8', 'c9')]
    sheet = Image.new('RGBA', (5 * 136, 3 * 136), (40, 36, 48, 255))
    for i, k in enumerate(ids): sheet.alpha_composite(Image.open(os.path.join(OUT, k + '.png')).convert('RGBA'), ((i % 5) * 136 + 4, (i // 5) * 136 + 4))
    sheet.save('/tmp/pharm2/icons_sheet.png')
