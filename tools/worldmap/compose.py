"""Compose the illustrated world map (docs/worldmap.png) from top-down renders of every zone.
Renders come from tools/worldmap/capture.js (one PNG per zone, square, covering the zone bounds).
Usage: python3 tools/worldmap/compose.py <render_dir> <out.png>"""
import json, math, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
SRC = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/worldmap'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'docs', 'worldmap.png')
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
if not os.path.exists(FONT): FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc'
def F(sz): return ImageFont.truetype(FONT, sz, index=1)   # index 1 = KR in the Noto CJK collection

Z = {z['id']: z for z in json.load(open(os.path.join(ROOT, 'assets/data/zones.json')))['zones']}
MON = {m['id']: m for m in json.load(open(os.path.join(ROOT, 'assets/data/monsters.json')))['monsters']}
NPC = {n['id']: n for n in json.load(open(os.path.join(ROOT, 'assets/data/npcs.json')))['npcs']}

W, H, S = 3100, 2330, 820
TILES = {'town': (150, 1360), 'forest': (1140, 1360), 'mist_valley': (2130, 1360), 'dragon_ruins': (1140, 330), 'frost_highland': (2130, 330)}
INK, GOLD, GOLD_D, PAPER = (58, 40, 24), (226, 182, 92), (150, 104, 30), (238, 224, 190)

def levels(z):
    lv = [MON[s['monster']]['level'] for s in z.get('monsters', []) if s['monster'] in MON]
    b = z.get('boss') or {}
    if b.get('boss') in MON: lv.append(MON[b['boss']]['level'])
    return (min(lv), max(lv)) if lv else None

def to_px(zid, x, z):
    d = Z[zid]; x0, z0, x1, z1 = d['bounds']; cx, cz = (x0 + x1) / 2, (z0 + z1) / 2; h = max(x1 - x0, z1 - z0) / 2
    tx, ty = TILES[zid]
    return tx + (x - (cx - h)) / (2 * h) * S, ty + ((cz + h) - z) / (2 * h) * S

# ---------------------------------------------------------------- parchment
img = Image.new('RGB', (W, H), PAPER); px = img.load()
import random; rnd = random.Random(3)
noise = Image.effect_noise((W // 4, H // 4), 40).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(6))
img = Image.composite(Image.new('RGB', (W, H), (214, 192, 150)), img, noise.point(lambda v: max(0, min(255, (v - 100) * 2))))
vig = Image.new('L', (W, H), 0); ImageDraw.Draw(vig).ellipse((-W * 0.15, -H * 0.2, W * 1.15, H * 1.2), fill=255)
vig = vig.filter(ImageFilter.GaussianBlur(220))
img = Image.composite(img, Image.new('RGB', (W, H), (150, 112, 70)), vig)
d = ImageDraw.Draw(img, 'RGBA')

def text(xy, s, sz, fill=INK, anchor='mm', stroke=0, sfill=None):
    d.text(xy, s, font=F(sz), fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=sfill)

def pill(xy, s, sz=22, fg=(255, 248, 230), bg=(36, 30, 40, 225), border=GOLD, anchor='mm'):
    f = F(sz); l, t, r, b = d.textbbox(xy, s, font=f, anchor=anchor); pad = sz * 0.35
    d.rounded_rectangle((l - pad, t - pad * 0.7, r + pad, b + pad * 0.7), radius=sz * 0.6, fill=bg, outline=border, width=2)
    d.text(xy, s, font=f, fill=fg, anchor=anchor)

# ---------------------------------------------------------------- routes between portals (drawn under the tiles' frames)
route = []
for zid, z in Z.items():
    for p in z['portals']:
        tz = p['targetZone']; back = next((q for q in Z[tz]['portals'] if q['targetZone'] == zid), None)
        if not back: back = Z[tz]['portals'][0]          # one-way warp (e.g. ruins -> town): arrive at the town gate
        if (tz, zid) in [(a, b) for a, b, *_ in route]: continue
        route.append((zid, tz, to_px(zid, *p['pos']), to_px(tz, *back['pos']), p, back))
def dashed_curve(a, b, bend, col, w):
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2; dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1
    cx, cy = mx - dy / L * bend, my + dx / L * bend; pts = []
    for i in range(121):
        t = i / 120; pts.append(((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * cx + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * cy + t * t * b[1]))
    for i in range(0, 120, 4): d.line(pts[i:i + 3], fill=col, width=w)
    return pts[60]

# ---------------------------------------------------------------- tiles
for a_id, b_id, a, b, p, q in route:
    bend = -160 if {a_id, b_id} == {'dragon_ruins', 'town'} else 60
    mid = dashed_curve(a, b, bend, (120, 60, 20, 255), 9); dashed_curve(a, b, bend, (250, 220, 140, 255), 4)
for zid, (tx, ty) in TILES.items():
    tile = Image.open(os.path.join(SRC, zid + '.png')).convert('RGB').resize((S, S), Image.LANCZOS)
    sh = Image.new('L', (S + 60, S + 60), 0); ImageDraw.Draw(sh).rounded_rectangle((30, 30, S + 30, S + 30), 30, fill=150)
    img.paste((70, 50, 30), (tx - 22, ty - 14), sh.filter(ImageFilter.GaussianBlur(16)))
    mask = Image.new('L', (S, S), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), 26, fill=255)
    img.paste(tile, (tx, ty), mask)
    d.rounded_rectangle((tx - 6, ty - 6, tx + S + 5, ty + S + 5), 30, outline=(90, 60, 20), width=4)
    d.rounded_rectangle((tx - 2, ty - 2, tx + S + 1, ty + S + 1), 27, outline=GOLD, width=5)


# ---------------------------------------------------------------- zone contents
for zid, z in Z.items():
    tx, ty = TILES[zid]
    # spawn groups: soft ring + monster label
    if zid != 'town':
        for s in z.get('monsters', []):
            m = MON.get(s['monster']);  x, y = to_px(zid, *s['pos'])
            if not m: continue
            rr = s['radius'] / (max(z['bounds'][2] - z['bounds'][0], z['bounds'][3] - z['bounds'][1])) * S
            d.ellipse((x - rr, y - rr, x + rr, y + rr), outline=(255, 240, 200, 170), width=2)
            pill((x, y + rr + 4), f"{m['name']} Lv{m['level']}", 17, anchor='mt', bg=(30, 26, 34, 200), border=(200, 160, 80))
        b = z.get('boss') or {}
        if b.get('boss') in MON:
            bx, by = to_px(zid, *b['center']); m = MON[b['boss']]
            rr = b['radius'] / 80 * S
            d.ellipse((bx - rr, by - rr, bx + rr, by + rr), outline=(230, 60, 60, 230), width=5)
            crown = [(bx - 26, by - 4), (bx - 30, by - 34), (bx - 12, by - 18), (bx, by - 40), (bx + 12, by - 18), (bx + 30, by - 34), (bx + 26, by - 4)]
            d.polygon(crown, fill=(240, 196, 70), outline=(110, 60, 10)); d.rectangle((bx - 26, by - 6, bx + 26, by + 2), fill=(240, 196, 70), outline=(110, 60, 10))
            pill((bx, by + 12), f"보스 · {m['name']} Lv{m['level']}", 21, anchor='mt', bg=(120, 24, 24, 235), border=(255, 200, 90))
    else:
        t3 = z['town3d']
        places = [((0, 2.5), '분수 광장'), ((t3['gate']['pos'][0], t3['gate']['pos'][1] + 1.5), '성문')]
        for hs in t3['houses']: places.append(((hs['pos'][0], hs['pos'][1]), {'bakery': '빵집 (요리)', 'general': '잡화·물약점', 'dress': '의상실 (미용)', 'arms': '무기점'}[hs['style']]))
        for md in t3['models']:
            if md['id'] in ('smithy', 'pharmacy'): places.append(((md['pos'][0], md['pos'][1]), {'smithy': '대장간', 'pharmacy': '약국'}[md['id']]))
        for dc in t3['decor']:
            if dc['type'] == 'well': places.append(((dc['pos'][0], dc['pos'][1] + 2), '우물'))
        for (x, z_), s in places: pill(to_px('town', x, z_), s, 22, bg=(255, 248, 230, 235), fg=INK, border=GOLD_D)
        for n in z['npcs']:
            nd = NPC[n['npc']]; x, y = to_px('town', *n['pos'])
            d.ellipse((x - 9, y - 9, x + 9, y + 9), fill=(250, 210, 80), outline=(90, 50, 10), width=3)
            text((x, y + 14), f"{nd['title']} {nd['name']}", 16, fill=(255, 255, 255), anchor='mt', stroke=3, sfill=(40, 28, 16))
    # portals
    for p in z['portals']:
        x, y = to_px(zid, *p['pos'])
        for r_, c in ((26, (60, 120, 220, 120)), (18, (120, 200, 255, 230)), (9, (240, 250, 255, 255))): d.ellipse((x - r_, y - r_, x + r_, y + r_), fill=c)
        d.ellipse((x - 26, y - 26, x + 26, y + 26), outline=(255, 255, 255, 230), width=3)
        lab = f"→ {Z[p['targetZone']]['name']}" + (f" (Lv{p['minLevel']}+)" if p.get('minLevel') else '')
        # keep the label inside the tile
        anc = ('l' if x < tx + S / 2 else 'r') + ('t' if y < ty + S / 2 else 'b')
        ox = 32 if anc[0] == 'l' else -32; oy = 18 if anc[1] == 't' else -18
        pill((x + ox, y + oy), lab, 20, anchor={'lt': 'lt', 'lb': 'lb', 'rt': 'rt', 'rb': 'rb'}[anc], bg=(24, 40, 80, 235), border=(150, 210, 255))
    # name banner above the tile
    lv = levels(z)
    sub = '안전 지역 · 상점 · 전직' if zid == 'town' else f'권장 Lv{lv[0]}~{lv[1]}'
    bx, by = tx + S / 2, ty - 50
    d.rounded_rectangle((bx - 250, by - 40, bx + 250, by + 40), 20, fill=(40, 34, 44, 240), outline=GOLD, width=4)
    for sx in (-1, 1): d.polygon([(bx + sx * 250, by - 14), (bx + sx * 268, by), (bx + sx * 250, by + 14)], fill=GOLD)
    text((bx, by - 10), z['name'], 34, fill=(255, 244, 214)); text((bx, by + 24), sub, 20, fill=(240, 200, 110))

# ---------------------------------------------------------------- title, legend, compass
text((W / 2, 92), '아르칸 대륙 지도', 84, fill=(70, 44, 18), stroke=3, sfill=(245, 226, 170))
text((W / 2, 168), '마을에서 출발해 숲 → 안개 골짜기 → 서리 고원 → 잊힌 용의 유적을 돌아 다시 마을로', 28, fill=(96, 66, 30))
lx, ly = 150, 330
d.rounded_rectangle((lx, ly, lx + S, ly + S), 26, fill=(250, 240, 214, 235), outline=GOLD_D, width=4)
text((lx + 40, ly + 50), '범례', 40, anchor='lm')
rows = [('portal', '워프 게이트 (다음 지역 · 입장 레벨)'), ('route', '지역 사이 이동 경로'), ('npc', '마을 NPC'), ('spawn', '몬스터 무리 (이름 · 레벨)'), ('boss', '보스 구역')]
for i, (k, s) in enumerate(rows):
    y = ly + 120 + i * 78; x = lx + 70
    if k == 'portal':
        for r_, c in ((26, (60, 120, 220, 120)), (18, (120, 200, 255, 230)), (9, (240, 250, 255, 255))): d.ellipse((x - r_, y - r_, x + r_, y + r_), fill=c)
    elif k == 'route':
        for j in range(4): d.line((x - 34 + j * 20, y, x - 22 + j * 20, y), fill=(120, 60, 20), width=9); d.line((x - 34 + j * 20, y, x - 22 + j * 20, y), fill=(250, 220, 140), width=4)
    elif k == 'npc': d.ellipse((x - 11, y - 11, x + 11, y + 11), fill=(250, 210, 80), outline=(90, 50, 10), width=3)
    elif k == 'spawn': d.ellipse((x - 24, y - 24, x + 24, y + 24), outline=(120, 100, 70), width=3)
    else: d.ellipse((x - 24, y - 24, x + 24, y + 24), outline=(230, 60, 60), width=5)
    text((x + 56, y), s, 28, anchor='lm')
ly2 = ly + 120 + len(rows) * 78 - 10
text((lx + 40, ly2), '레벨 흐름', 32, anchor='lm')
flow = [('아르칸 마을', '시작'), ('속삭이는 숲', 'Lv2~10'), ('안개 골짜기', 'Lv11~22'), ('서리 고원', 'Lv23~36'), ('잊힌 용의 유적', 'Lv38~50')]
for i, (n, l) in enumerate(flow):
    text((lx + 60, ly2 + 46 + i * 38), f'{i + 1}. {n}  ·  {l}', 24, anchor='lm', fill=(80, 56, 28))
# compass
cx, cy = W - 150, 210
d.ellipse((cx - 70, cy - 70, cx + 70, cy + 70), fill=(250, 240, 214, 230), outline=GOLD_D, width=4)
d.polygon([(cx, cy - 60), (cx + 14, cy), (cx, cy + 8), (cx - 14, cy)], fill=(180, 50, 40)); d.polygon([(cx, cy + 60), (cx + 14, cy), (cx, cy - 8), (cx - 14, cy)], fill=(70, 60, 50))
text((cx, cy - 92), '북', 30, fill=(150, 40, 30))
# outer frame
d.rectangle((14, 14, W - 15, H - 15), outline=(110, 74, 30), width=10); d.rectangle((30, 30, W - 31, H - 31), outline=GOLD, width=4)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
img.save(OUT, optimize=True); print('saved', OUT, img.size)
