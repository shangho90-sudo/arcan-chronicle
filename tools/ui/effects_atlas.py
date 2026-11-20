"""게임 안 2D 이펙트 아틀라스를 매끈한 그림으로 다시 그림 — 2026-11-20 (예전 assets/fx/effects.png는 64 px 도트 그림).

Usage:  python3 tools/ui/effects_atlas.py   ->  assets/fx/effects.png (2048×896, 칸 128 px) + assets/fx/effects.json (+ /tmp/pixel/effects_sheet.png)

`render.js` `Fx`(구르기 연기·회복·몬스터 공격 고리·연기·적 투사체·분수 물보라·레벨업 대체 등)가 쓰는 같은 이름·같은 칸 순서·
같은 프레임 수·fps·worldSize — 칸 크기만 64 → 128 px(json `cell`/`texW`/`texH`), 게임은 Linear 필터(`Fx.load`).
그림 원칙: 부드러운 빛 번짐 + 밝은 중심, 손그림 느낌의 둥근 덩어리, 가장자리 안티에일리어싱(512 px로 그리고 128 px로 줄임).
`ring`·`smoke`·`hit`은 게임이 색을 곱하므로(material.color) 거의 흰색으로 그림.
"""
import json, math, os, random
from PIL import Image, ImageDraw, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUTP = os.path.join(ROOT, 'assets', 'fx')
CELL, SS = 128, 4            # final cell px, supersample
W = CELL * SS; C = W / 2
COLS, ROWS = 16, 7
EFFECTS = [('slash', 6, 24, 2.0), ('hit', 6, 24, 2.0), ('potion_splash', 6, 16, 2.0), ('paint_burst', 6, 16, 2.0), ('heal', 6, 12, 2.0), ('ring', 6, 14, 2.0),
           ('smoke', 6, 12, 2.0), ('fire', 6, 14, 2.0), ('poison', 6, 10, 2.0), ('levelup', 6, 10, 2.0), ('wind', 6, 16, 2.0), ('shield', 6, 10, 2.0), ('food', 6, 10, 2.0),
           ('proj_spore', 4, 10, 1.0), ('proj_bottle', 4, 14, 1.0), ('proj_paint', 4, 10, 1.0), ('proj_note', 4, 10, 1.0), ('proj_rock', 4, 10, 1.0)]

def L(): return Image.new('RGBA', (W, W), (0, 0, 0, 0))
def comp(img, fn, col, a=255, blur=0):
    l = Image.new('RGBA', (W, W), tuple(col[:3]) + (0,)); fn(ImageDraw.Draw(l), tuple(col[:3]) + (int(a),))   # transparent of the same colour: no dark blur halo
    if blur: l = l.filter(ImageFilter.GaussianBlur(blur))
    img.alpha_composite(l)
def disc(img, x, y, r, col, a=255, blur=0): comp(img, lambda d, c: d.ellipse([x - r, y - r, x + r, y + r], fill=c), col, a, blur)
def glowdisc(img, x, y, r, col, a=255):   # soft glow + core
    disc(img, x, y, r * 1.4, col, a * 0.35, r * 0.45); disc(img, x, y, r, col, a, r * 0.18)
def star(img, x, y, r, col, a=255, k=0.22, n=4, rot=0.0, blur=0):
    pts = [(x + math.cos(rot + i * math.pi / n) * (r if i % 2 == 0 else r * k), y + math.sin(rot + i * math.pi / n) * (r if i % 2 == 0 else r * k)) for i in range(2 * n)]
    comp(img, lambda d, c: d.polygon(pts, fill=c), col, a, blur)
def ring(img, x, y, r, w, col, a=255, blur=0, sy=1.0): comp(img, lambda d, c: d.ellipse([x - r, y - r * sy, x + r, y + r * sy], outline=c, width=int(w)), col, a, blur)
def fade(t): return max(0.0, 1.0 - t)
def ease(t): return 1 - (1 - t) ** 2

WHITE, GOLD = (255, 255, 255), (255, 214, 120)
def f_slash(t):
    img = L(); a0 = -150 + t * 40; span = 40 + ease(t) * 120; a = 255 * (1 if t < 0.5 else fade((t - 0.5) * 2))
    box = [C - W * 0.36, C - W * 0.36, C + W * 0.36, C + W * 0.36]
    comp(img, lambda d, c: d.arc(box, a0, a0 + span, fill=c, width=int(W * 0.09)), (255, 220, 150), a * 0.5, W * 0.03)
    comp(img, lambda d, c: d.arc(box, a0, a0 + span, fill=c, width=int(W * 0.035)), WHITE, a, 2)
    return img
def f_hit(t):
    img = L(); r = W * (0.12 + ease(t) * 0.3); a = 255 * fade(t ** 1.4)
    disc(img, C, C, r * 0.9, (255, 240, 200), a * 0.4, r * 0.4)
    star(img, C, C, r * 1.25, WHITE, a, 0.18, 4, t * 0.4, 3); star(img, C, C, r * 0.8, WHITE, a * 0.8, 0.25, 4, math.pi / 4 + t * 0.4, 3)
    ring(img, C, C, r, W * 0.02, WHITE, a * 0.7, 2)
    return img
def splash(t, cols, seed):
    img = L(); R = random.Random(seed); a = 255 * fade(max(0, t - 0.3) / 0.7)
    disc(img, C, C + W * 0.12, W * (0.1 + 0.18 * ease(t)), cols[0], a * 0.35, W * 0.06)
    for i in range(14):
        ang = R.uniform(-math.pi, 0) if i % 3 else R.uniform(0, math.pi); sp = R.uniform(0.15, 0.4)
        x = C + math.cos(ang) * W * sp * ease(t); y = C + math.sin(ang) * W * sp * ease(t) + W * 0.25 * t * t
        r = W * R.uniform(0.02, 0.05) * (1 - 0.5 * t); col = cols[i % len(cols)]
        disc(img, x, y, r, col, a); disc(img, x - r * 0.3, y - r * 0.3, r * 0.35, WHITE, a * 0.8)
    return img
def f_potion(t): return splash(t, [(120, 230, 150), (80, 200, 120), (190, 255, 200)], 3)
def f_paint(t): return splash(t, [(240, 80, 70), (255, 210, 70), (80, 150, 240), (110, 210, 100), (180, 110, 240)], 5)
def f_heal(t):
    img = L(); R = random.Random(7); a = 255 * fade(max(0, t - 0.4) / 0.6)
    disc(img, C, C + W * 0.1, W * 0.28, (140, 255, 170), a * 0.25, W * 0.1)
    for i in range(7):
        x = C + R.uniform(-0.3, 0.3) * W; y = C + W * 0.3 - (t * 0.55 + R.uniform(0, 0.25)) * W; s = W * R.uniform(0.035, 0.06)
        comp(img, lambda d, c: (d.rounded_rectangle([x - s, y - s * 0.32, x + s, y + s * 0.32], s * 0.3, fill=c), d.rounded_rectangle([x - s * 0.32, y - s, x + s * 0.32, y + s], s * 0.3, fill=c)), (120, 240, 140), a * 0.6, s * 0.5)
        comp(img, lambda d, c: (d.rounded_rectangle([x - s, y - s * 0.32, x + s, y + s * 0.32], s * 0.3, fill=c), d.rounded_rectangle([x - s * 0.32, y - s, x + s * 0.32, y + s], s * 0.3, fill=c)), (230, 255, 230), a)
    for i in range(6): star(img, C + R.uniform(-0.35, 0.35) * W, C + W * 0.2 - (t * 0.6 + R.uniform(0, 0.3)) * W, W * 0.03, WHITE, a, 0.25)
    return img
def f_ring(t):
    img = L(); r = W * (0.12 + ease(t) * 0.34); a = 255 * fade(t ** 1.6)
    ring(img, C, C, r, W * 0.06, (220, 245, 255), a * 0.45, W * 0.03)
    ring(img, C, C, r, W * 0.022, WHITE, a, 2)
    ring(img, C, C, r * 0.82, W * 0.008, WHITE, a * 0.5, 1)
    return img
def f_smoke(t):
    img = L(); R = random.Random(11); a = 235 * fade(t ** 1.2)
    for i in range(6):
        ang = i / 6 * 2 * math.pi + 0.4; d = W * (0.05 + 0.18 * ease(t)); r = W * (0.1 + 0.12 * ease(t)) * R.uniform(0.8, 1.1)
        x, y = C + math.cos(ang) * d, C + math.sin(ang) * d * 0.7 - W * 0.08 * t
        disc(img, x, y, r, (236, 232, 226), a * 0.75, r * 0.35); disc(img, x - r * 0.25, y - r * 0.3, r * 0.5, WHITE, a * 0.5, r * 0.3)
    return img
def f_fire(t):
    img = L(); R = random.Random(13 + int(t * 6)); a = 255 * (fade(max(0, t - 0.5) / 0.5))
    disc(img, C, C + W * 0.12, W * 0.28, (255, 120, 40), a * 0.35, W * 0.1)
    for i in range(9):
        x = C + R.uniform(-0.25, 0.25) * W; y = C + W * 0.2 - R.uniform(0, 0.35) * W - t * W * 0.12; r = W * R.uniform(0.05, 0.1) * (1 - 0.3 * t)
        disc(img, x, y, r, (255, 120 + i * 12, 40), a, r * 0.25); disc(img, x, y + r * 0.2, r * 0.5, (255, 240, 160), a, r * 0.2)
    return img
def f_poison(t):
    img = L(); R = random.Random(17); a = 255 * fade(max(0, t - 0.5) / 0.5)
    for i in range(8):
        x = C + R.uniform(-0.3, 0.3) * W; y = C + W * 0.25 - (t * 0.4 + R.uniform(0, 0.3)) * W; r = W * R.uniform(0.03, 0.065)
        disc(img, x, y, r, (170, 90, 230), a * 0.9, r * 0.15); ring(img, x, y, r, r * 0.2, (230, 190, 255), a, 1); disc(img, x - r * 0.35, y - r * 0.35, r * 0.25, WHITE, a)
    return img
def f_levelup(t):
    img = L(); R = random.Random(19); a = 255 * fade(max(0, t - 0.5) / 0.5)
    for i in range(7):
        x = C + (i - 3) * W * 0.09; h = W * (0.25 + 0.4 * ease(t)) * R.uniform(0.7, 1.0); w = W * 0.035
        comp(img, lambda d, c: d.rounded_rectangle([x - w, C + W * 0.35 - h, x + w, C + W * 0.35], w, fill=c), (255, 220, 120), a * 0.55, w * 0.8)
        comp(img, lambda d, c: d.rounded_rectangle([x - w * 0.35, C + W * 0.35 - h, x + w * 0.35, C + W * 0.35], w * 0.3, fill=c), (255, 250, 220), a)
    for i in range(5): star(img, C + R.uniform(-0.35, 0.35) * W, C + W * 0.3 - R.uniform(0.1, 0.7) * W * ease(t), W * 0.035, WHITE, a, 0.25)
    return img
def f_wind(t):
    img = L(); a = 230 * (fade(max(0, t - 0.4) / 0.6))
    for i in range(3):
        y = C + (i - 1) * W * 0.16; x0 = C - W * 0.4 + t * W * 0.15
        pts = [(x0 + k / 20 * W * 0.7, y + math.sin(k / 20 * 6 + i + t * 4) * W * 0.03) for k in range(21)]
        comp(img, lambda d, c: d.line(pts, fill=c, width=int(W * 0.03), joint='curve'), (210, 240, 255), a * 0.5, W * 0.015)
        comp(img, lambda d, c: d.line(pts, fill=c, width=int(W * 0.012), joint='curve'), WHITE, a)
    return img
def f_shield(t):
    img = L(); r = W * (0.3 + 0.08 * ease(min(1, t * 2))); a = 255 * (0.6 + 0.4 * math.sin(t * math.pi))
    disc(img, C, C, r, (150, 210, 255), a * 0.22, W * 0.02)
    ring(img, C, C, r, W * 0.04, (170, 220, 255), a * 0.6, W * 0.02); ring(img, C, C, r, W * 0.014, WHITE, a, 1)
    comp(img, lambda d, c: d.arc([C - r * 0.75, C - r * 0.75, C + r * 0.75, C + r * 0.75], 200, 250, fill=c, width=int(W * 0.03)), WHITE, a * 0.8, 3)
    return img
def f_food(t):
    img = L(); a = 255 * fade(max(0, t - 0.6) / 0.4); y0 = C + W * 0.12 - t * W * 0.05
    comp(img, lambda d, c: d.chord([C - W * 0.28, y0 - W * 0.22, C + W * 0.28, y0 + W * 0.2], 0, 180, fill=c), (250, 250, 252), a)
    comp(img, lambda d, c: d.ellipse([C - W * 0.28, y0 - W * 0.06, C + W * 0.28, y0 + W * 0.06], fill=c), (240, 160, 70), a)
    comp(img, lambda d, c: d.arc([C - W * 0.28, y0 - W * 0.22, C + W * 0.28, y0 + W * 0.2], 20, 160, fill=c, width=int(W * 0.02)), (90, 150, 220), a)
    for k in (-1, 0, 1):
        pts = [(C + k * W * 0.1 + math.sin(j / 6 * 4 + t * 6 + k) * W * 0.03, y0 - W * 0.08 - j / 6 * W * 0.25) for j in range(7)]
        comp(img, lambda d, c, pts=pts: d.line(pts, fill=c, width=int(W * 0.025), joint='curve'), WHITE, a * 0.7, 3)
    return img
def f_spore(t): img = L(); glowdisc(img, C, C, W * (0.2 + 0.03 * math.sin(t * 2 * math.pi)), (180, 110, 240)); disc(img, C - W * 0.06, C - W * 0.06, W * 0.06, (240, 220, 255)); return img
def f_bottle(t):
    img = L(); a = t * 2 * math.pi
    def rp(pts): return [(C + (x - C) * math.cos(a) - (y - C) * math.sin(a), C + (x - C) * math.sin(a) + (y - C) * math.cos(a)) for x, y in pts]
    disc(img, C, C, W * 0.3, (120, 230, 150), 70, W * 0.08)
    body = [(C - W * 0.18 + math.cos(k / 16 * 2 * math.pi) * 0, 0) for k in range(1)]
    circ = rp([(C + math.cos(k / 24 * 2 * math.pi) * W * 0.2, C + W * 0.06 + math.sin(k / 24 * 2 * math.pi) * W * 0.2) for k in range(24)])
    comp(img, lambda d, c: d.polygon(circ, fill=c), (110, 210, 140)); neck = rp([(C - W * 0.06, C - W * 0.12), (C + W * 0.06, C - W * 0.12), (C + W * 0.06, C - W * 0.3), (C - W * 0.06, C - W * 0.3)])
    comp(img, lambda d, c: d.polygon(neck, fill=c), (200, 240, 220)); cork = rp([(C - W * 0.07, C - W * 0.3), (C + W * 0.07, C - W * 0.3), (C + W * 0.07, C - W * 0.38), (C - W * 0.07, C - W * 0.38)])
    comp(img, lambda d, c: d.polygon(cork, fill=c), (170, 110, 60)); hl = rp([(C - W * 0.1, C - W * 0.02)])[0]; disc(img, hl[0], hl[1], W * 0.05, WHITE, 220)
    return img
def f_ppaint(t):
    cols = [(240, 80, 70), (80, 150, 240), (255, 210, 70), (110, 210, 100)]; col = cols[int(t * 4) % 4]
    img = L(); glowdisc(img, C, C, W * 0.2, col); disc(img, C - W * 0.07, C - W * 0.07, W * 0.06, WHITE, 230); return img
def f_note(t):
    img = L(); dy = math.sin(t * 2 * math.pi) * W * 0.04; col = (255, 214, 90)
    disc(img, C, C, W * 0.32, col, 60, W * 0.08)
    comp(img, lambda d, c: d.ellipse([C - W * 0.17, C + W * 0.08 + dy, C + W * 0.07, C + W * 0.26 + dy], fill=c), col)
    comp(img, lambda d, c: d.rectangle([C + W * 0.03, C - W * 0.3 + dy, C + W * 0.08, C + W * 0.17 + dy], fill=c), col)
    comp(img, lambda d, c: d.polygon([(C + W * 0.03, C - W * 0.3 + dy), (C + W * 0.24, C - W * 0.18 + dy), (C + W * 0.24, C - W * 0.1 + dy), (C + W * 0.08, C - W * 0.2 + dy)], fill=c), col)
    return img
def f_rock(t):
    img = L(); a = t * 2 * math.pi; R = random.Random(23)
    pts = [(C + math.cos(a + k / 7 * 2 * math.pi) * W * 0.24 * R.uniform(0.8, 1.05), C + math.sin(a + k / 7 * 2 * math.pi) * W * 0.24 * R.uniform(0.8, 1.05)) for k in range(7)]
    comp(img, lambda d, c: d.polygon(pts, fill=c), (40, 36, 40), 120, W * 0.03)
    comp(img, lambda d, c: d.polygon(pts, fill=c), (128, 122, 130))
    hl = [(x * 0.6 + C * 0.4 - W * 0.04, y * 0.6 + C * 0.4 - W * 0.04) for x, y in pts[:4]]
    comp(img, lambda d, c: d.polygon(hl, fill=c), (180, 176, 186))
    return img
DRAW = {'slash': f_slash, 'hit': f_hit, 'potion_splash': f_potion, 'paint_burst': f_paint, 'heal': f_heal, 'ring': f_ring, 'smoke': f_smoke, 'fire': f_fire, 'poison': f_poison,
        'levelup': f_levelup, 'wind': f_wind, 'shield': f_shield, 'food': f_food, 'proj_spore': f_spore, 'proj_bottle': f_bottle, 'proj_paint': f_ppaint, 'proj_note': f_note, 'proj_rock': f_rock}

def edge_mask():
    m = Image.new('L', (CELL, CELL), 0); px = m.load(); e = CELL * 0.07
    for y in range(CELL):
        for x in range(CELL): px[x, y] = int(255 * max(0.0, min(1.0, (min(x, y, CELL - 1 - x, CELL - 1 - y)) / e)))
    return m
EDGE = edge_mask()

if __name__ == '__main__':
    atlas = Image.new('RGBA', (COLS * CELL, ROWS * CELL), (0, 0, 0, 0)); meta = []; idx = 0
    for name, frames, fps, ws in EFFECTS:
        meta.append({'name': name, 'start': idx, 'frames': frames, 'fps': fps, 'worldSize': ws})
        for f in range(frames):
            t = f / max(1, frames - 1) if not name.startswith('proj') else f / frames
            im = DRAW[name](t).resize((CELL, CELL), Image.LANCZOS)
            im.putalpha(Image.composite(im.getchannel('A'), Image.new('L', im.size, 0), EDGE))   # fade the last few px so no cell edge shows
            atlas.alpha_composite(im, ((idx % COLS) * CELL, (idx // COLS) * CELL)); idx += 1
    atlas.save(os.path.join(OUTP, 'effects.png'), optimize=True)
    json.dump({'cell': CELL, 'cols': COLS, 'rows': ROWS, 'texW': COLS * CELL, 'texH': ROWS * CELL, 'effects': meta}, open(os.path.join(OUTP, 'effects.json'), 'w'), indent=1)
    os.makedirs('/tmp/pixel', exist_ok=True)
    bg = Image.new('RGBA', atlas.size, (60, 70, 80, 255)); bg.alpha_composite(atlas); bg.save('/tmp/pixel/effects_sheet.png')
    print('effects', idx, 'frames', atlas.size)
