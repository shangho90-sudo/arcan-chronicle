"""세계 지도 배경 그림 (2026-11-07): the 용흔 continent painted from the world data (node positions, biomes, links) so the
map always matches the zones -> assets/ui/worldmap_bg.jpg (2000 x 1520, map units x2) + coastline into zones.json world.
Hand-painted look: deep sea with wave strokes and clouds, bright shallows, sandy coast; parchment land washed with each
place's biome colour; painted mountain ranges (snow in the north, purple scar over Zirat), forest clumps, rivers, a frozen
lake; compass rose and a sailing ship in the sea. Places and roads are left clear (drawn as SVG by js/worldmap.js).
Also subsets Noto Serif CJK KR Bold to the map's glyphs -> assets/fonts/ArcanSerif.woff (SIL OFL).
Usage: python3 tools/world/paint_map.py"""
import json, math, os, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'); D = lambda *p: os.path.join(ROOT, *p)
zones = json.load(open(D('assets', 'data', 'zones.json'))); W0, H0 = zones['world']['size']; K = 2
OX, OY = 90, 80                                      # sea margin round the map area (map units); the SVG viewBox matches
W, H = (W0 + 2 * OX) * K, (H0 + 2 * OY) * K
Z = [z for z in zones['zones'] if z.get('map')]
OLD = {'forest': 'woods', 'mushroom_grove': 'abyss', 'mist_valley': 'marsh', 'frost_highland': 'frost', 'dragon_ruins': 'highland'}
bio = lambda z: 'town' if z['kind'] == 'town' else (z.get('biome') or OLD.get(z['id'], 'meadow'))
P = {z['id']: ((z['map'][0] + OX) * K, (z['map'][1] + OY) * K) for z in Z}
rnd = random.Random(1107)
hexc = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32)

# ---------------------------------------------------------------- coastline (same idea as before: farthest place per direction + margin)
def hash1(i): x = math.sin(i * 127.1 + 311.7) * 43758.5453; return x - math.floor(x)
cx, cy = W / 2, (H0 / 2 + OY + 10) * K; n = 96; r = []
for i in range(n):
    a = i / n * 2 * math.pi; ux, uy = math.cos(a), math.sin(a); best = 120 * K
    for (x, y) in P.values():
        dx, dy = x - cx, y - cy; along = dx * ux + dy * uy; side = abs(-dx * uy + dy * ux)
        if side < 110 * K: best = max(best, along + max(0, 40 * K - side * 0.3))
    r.append(best + 52 * K + (hash1(i) - 0.5) * 40 * K)
for _ in range(2): r = [(r[(i - 1) % n] + 2 * r[i] + r[(i + 1) % n]) / 4 for i in range(n)]
coast = [(cx + math.cos(i / n * 2 * math.pi) * r[i], cy + math.sin(i / n * 2 * math.pi) * r[i]) for i in range(n)]
# wobble the outline with small bays / capes
pts = []
for i in range(n):
    a, b = coast[i], coast[(i + 1) % n]
    for k in range(6):
        t = k / 6; x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        d = math.hypot(x - cx, y - cy); j = (i * 6 + k) * 0.37
        w = 1 + 0.03 * math.sin(j * 0.55) + 0.018 * math.sin(j * 1.3 + 1) + 0.006 * math.sin(j * 3.1)
        pts.append((cx + (x - cx) * w, cy + (y - cy) * w))
mask_img = Image.new('L', (W, H), 0); ImageDraw.Draw(mask_img).polygon(pts, fill=255)
land = np.asarray(mask_img) > 127
dist_out = ndimage.distance_transform_edt(~land)     # px to the coast, in the sea
dist_in = ndimage.distance_transform_edt(land)       # px to the coast, on land
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

def noise(scale, seed, octaves=4):
    out = np.zeros((H, W), np.float32); amp = 1; tot = 0
    rs = np.random.default_rng(seed)
    for o in range(octaves):
        s = max(2, int(scale / (2 ** o))); g = rs.random((H // s + 3, W // s + 3)).astype(np.float32)
        up = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize(((W // s + 3) * s, (H // s + 3) * s), Image.BICUBIC)).astype(np.float32)[:H, :W] / 255
        out += up * amp; tot += amp; amp *= 0.5
    return out / tot

# ---------------------------------------------------------------- sea
sea = np.zeros((H, W, 3), np.float32)
deep, mid, shallow = hexc('#0e2c4c'), hexc('#1d5478'), hexc('#3f93a8')
t = np.clip(dist_out / (110 * K), 0, 1)[..., None]
sea[:] = shallow * (1 - t) + mid * t
far = np.clip((dist_out - 80 * K) / (220 * K), 0, 1)[..., None]
sea = sea * (1 - far) + deep * far
sea *= (0.9 + 0.2 * noise(260, 3))[..., None]
# bright surf band right at the shore
surf = np.exp(-dist_out / (7 * K))[..., None] * (~land)[..., None]
sea = sea * (1 - surf * 0.55) + hexc('#cfe8e4') * surf * 0.55
img = sea.copy()

# ---------------------------------------------------------------- land: parchment + biome washes
paper = hexc('#d9c48e') * (0.86 + 0.2 * noise(180, 5))[..., None]
COL = {'meadow': '#9cbc5a', 'woods': '#5e8f3e', 'blue': '#5aa0b4', 'crimson': '#c0583c', 'stone': '#a7a28c', 'frost': '#e8eef0', 'ash': '#8a847a',
       'abyss': '#7a5aa0', 'highland': '#c8a464', 'marsh': '#6f9a74', 'canyon': '#c49058', 'river': '#8cbc6a', 'town': '#b8b07a'}
wash = np.zeros((H, W, 3), np.float32); wsum = np.zeros((H, W), np.float32)
for z in Z:
    x, y = P[z['id']]; c = hexc(COL[bio(z)]); R = 95 * K
    x0, x1, y0, y1 = int(max(0, x - 3 * R)), int(min(W, x + 3 * R)), int(max(0, y - 3 * R)), int(min(H, y + 3 * R))
    g = np.exp(-(((xx[y0:y1, x0:x1] - x) ** 2 + (yy[y0:y1, x0:x1] - y) ** 2) / (2 * R * R)))
    wash[y0:y1, x0:x1] += g[..., None] * c; wsum[y0:y1, x0:x1] += g
# the north is snow, the far south is Zirat's grey-violet scar
north = np.clip(1 - (yy - OY * K) / (170 * K), 0, 1); wash += (north * 1.4)[..., None] * hexc('#eef2f2'); wsum += north * 1.4
south = np.clip((yy - (640 + OY) * K) / (110 * K), 0, 1) * np.clip(1 - np.abs(xx - (640 + OX) * K) / (330 * K), 0, 1)
wash += (south * 1.6)[..., None] * hexc('#6e5a7e'); wsum += south * 1.6
cov = np.clip(wsum / 0.55, 0, 1)
wcol = wash / np.maximum(wsum, 1e-4)[..., None]
landc = paper * (1 - cov[..., None] * 0.8) + wcol * (cov[..., None] * 0.8)
landc *= (0.9 + 0.18 * noise(70, 7, 3))[..., None]                       # painted mottling
# beach + darker inner shore line
beach = np.exp(-dist_in / (6 * K))[..., None]
landc = landc * (1 - beach * 0.6) + hexc('#efe0b0') * beach * 0.6
edge = (np.exp(-dist_in / (1.6 * K)))[..., None]
landc = landc * (1 - edge * 0.65) + hexc('#5a4228') * edge * 0.65
img = np.where(land[..., None], landc, img)

canvas = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert('RGBA')
# loose brush strokes over the land (value / hue jitter of the colour underneath)
strokes = Image.new('RGBA', (W, H), (0, 0, 0, 0)); sd = ImageDraw.Draw(strokes)
base = np.asarray(canvas)
for _ in range(9000):
    x, y = rnd.uniform(0, W), rnd.uniform(0, H)
    if not land[int(y), int(x)] or dist_in[int(y), int(x)] < 8 * K: continue
    c = base[int(y), int(x), :3].astype(np.float32) * rnd.uniform(0.86, 1.14); a = rnd.uniform(0, math.pi); L = rnd.uniform(8, 20) * K
    sd.line([(x - math.cos(a) * L, y - math.sin(a) * L * 0.4), (x + math.cos(a) * L, y + math.sin(a) * L * 0.4)], fill=tuple(int(v) for v in np.clip(c, 0, 255)) + (42,), width=int(rnd.uniform(4, 8) * K))
canvas.alpha_composite(strokes.filter(ImageFilter.GaussianBlur(2.2 * K)))
dr = ImageDraw.Draw(canvas, 'RGBA')

# keep-outs: places (with their labels) and roads
nodes = list(P.values())
roads = [(P[a], P[b]) for a, b in zones['world']['links'] if a in P and b in P]
def seg_d(px, py, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]; L = dx * dx + dy * dy; t = 0 if L == 0 else max(0, min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L))
    return math.hypot(px - a[0] - t * dx, py - a[1] - t * dy)
def clear(x, y, rad=0):
    if not (0 <= int(x) < W and 0 <= int(y) < H) or not land[int(y), int(x)] or dist_in[int(y), int(x)] < 14 * K: return False
    for (nx, ny) in nodes:
        if abs(x - nx) < 46 * K + rad and -30 * K - rad < y - ny < 36 * K + rad: return False
    for a, b in roads:
        if seg_d(x, y, a, b) < 9 * K + rad: return False
    return True
def nearest_bio(x, y):
    return bio(min(Z, key=lambda z: (P[z['id']][0] - x) ** 2 + (P[z['id']][1] - y) ** 2))

# ---------------------------------------------------------------- rivers (from the inland hills to the sea, avoiding places)
def river(x, y, ang, steps, w):
    pts = [(x, y)]
    for i in range(steps):
        ang += rnd.uniform(-0.28, 0.28); x += math.cos(ang) * 9 * K; y += math.sin(ang) * 9 * K
        pts.append((x, y))
        if not land[min(H - 1, max(0, int(y))), min(W - 1, max(0, int(x)))]: break
    dr.line(pts, fill=(52, 104, 140, 255), width=int(w * K + 3 * K), joint='curve')
    dr.line(pts, fill=(92, 160, 196, 255), width=int(w * K), joint='curve')
    dr.line(pts, fill=(170, 214, 228, 170), width=max(1, int(w * K * 0.35)), joint='curve')
for (x, y, a, s, w) in [(350, 540, 2.3, 34, 5), (300, 600, 1.9, 30, 4), (600, 330, -0.4, 40, 4), (470, 470, 2.0, 40, 3.5), (820, 470, 0.5, 30, 4), (230, 380, 2.8, 26, 3.5)]:
    river((x + OX) * K, (y + OY) * K, a, s, w)
# frozen lake by 얼어붙은 호수
if 'frozen_lake' in P:
    lx, ly = P['frozen_lake'][0] - 70 * K, P['frozen_lake'][1] + 26 * K
    dr.ellipse([lx - 34 * K, ly - 16 * K, lx + 34 * K, ly + 16 * K], fill=(150, 196, 214, 255), outline=(70, 110, 130, 255), width=3 * K)
    dr.ellipse([lx - 24 * K, ly - 9 * K, lx + 10 * K, ly + 2 * K], fill=(214, 236, 242, 200))

# ---------------------------------------------------------------- mountains: painted ranges
def mountain(x, y, s, snow, tone):
    hgt = s * rnd.uniform(1.0, 1.35); half = s * rnd.uniform(0.9, 1.15); px = x + rnd.uniform(-0.15, 0.15) * half
    base = np.array(tone, np.float32)
    lit = tuple(int(v) for v in np.clip(base * 1.18 + 18, 0, 255)) + (255,); shade = tuple(int(v) for v in base * 0.62) + (255,)
    dr.polygon([(x - half * 1.15, y + 2), (x + half * 1.25, y + 2), (x + half * 0.2, y - hgt * 0.15), (x - half * 0.4, y - hgt * 0.1)], fill=(60, 50, 40, 60))   # foot shadow
    dr.polygon([(x - half, y), (px, y - hgt), (px + half * 0.05, y)], fill=lit)
    dr.polygon([(px, y - hgt), (x + half, y), (px + half * 0.05, y)], fill=shade)
    # ridge strokes
    for k in range(3):
        t0 = rnd.uniform(0.25, 0.7); dr.line([(px - half * t0 * 0.6, y - hgt * (1 - t0)), (px - half * t0 * 0.3, y - hgt * (1 - t0) + hgt * 0.25)], fill=shade[:3] + (150,), width=max(1, K))
    if snow:
        sh = hgt * 0.34
        dr.polygon([(px - half * 0.34, y - hgt + sh), (px, y - hgt), (px + half * 0.36, y - hgt + sh), (px + half * 0.12, y - hgt + sh * 0.8), (px - half * 0.05, y - hgt + sh * 1.1), (px - half * 0.2, y - hgt + sh * 0.85)], fill=(248, 250, 252, 255))
    dr.line([(x - half, y), (px, y - hgt), (x + half, y)], fill=(74, 58, 40, 200), width=max(1, int(K * 1.2)))
TONE = {'frost': (150, 162, 176), 'stone': (150, 140, 120), 'canyon': (176, 132, 90), 'highland': (172, 140, 96), 'ash': (126, 118, 120), 'abyss': (118, 92, 140), 'crimson': (170, 96, 80)}
mnoise = noise(200, 11, 3); placed = []
cands = []
for _ in range(14000):
    x, y = rnd.uniform(0, W), rnd.uniform(0, H)
    if not clear(x, y, 10 * K): continue
    cands.append((x, y, nearest_bio(x, y)))
for (x, y, b) in sorted(cands, key=lambda c: c[1]):
    north = y < (OY + 150) * K; zir = y > (OY + 690) * K and (OX + 420) * K < x < (OX + 880) * K
    m = mnoise[int(y), int(x)]
    want = (b in ('stone', 'canyon', 'frost') and m > 0.42) or (b == 'highland' and m > 0.5) or (north and m > 0.4) or (zir and m > 0.38) or m > 0.7
    if not want or any(abs(x - a) < 24 * K and abs(y - c) < 15 * K for a, c in placed): continue
    placed.append((x, y))
    tone = TONE.get('frost' if north else 'abyss' if zir else b, (150, 138, 116))
    mountain(x, y, rnd.uniform(15, 24) * K, snow=north or b == 'frost' or (b == 'stone' and rnd.random() < 0.6), tone=tone)

# ---------------------------------------------------------------- forests: clumps of painted round crowns
FOREST = {'woods': (58, 104, 50), 'meadow': (82, 126, 60), 'blue': (52, 120, 150), 'crimson': (176, 64, 44), 'marsh': (60, 110, 82), 'river': (74, 124, 60),
          'abyss': (110, 76, 150), 'frost': (70, 104, 96), 'highland': (110, 120, 60), 'town': (76, 118, 58)}
fn = noise(120, 21, 3); trees = []
for _ in range(26000):
    x, y = rnd.uniform(0, W), rnd.uniform(0, H)
    if not clear(x, y, 2 * K) or any(abs(x - a) < 22 * K and -20 * K < y - c < 10 * K for a, c in placed): continue
    b = nearest_bio(x, y)
    if b not in FOREST: continue
    thr = {'woods': 0.4, 'blue': 0.4, 'crimson': 0.42, 'marsh': 0.48, 'abyss': 0.5, 'frost': 0.56}.get(b, 0.56)
    if fn[int(y), int(x)] < thr: continue
    trees.append((x, y, b))
for (x, y, b) in sorted(trees, key=lambda c: c[1]):
    c = np.array(FOREST[b], np.float32) * rnd.uniform(0.85, 1.15); r = rnd.uniform(5.2, 7.6) * K
    dr.ellipse([x - r * 0.9, y + r * 0.3, x + r * 1.2, y + r * 1.1], fill=(50, 40, 30, 50))
    dr.rectangle([x - K * 0.6, y + r * 0.4, x + K * 0.6, y + r * 1.0], fill=(92, 64, 40, 255))
    dr.ellipse([x - r, y - r, x + r, y + r * 0.8], fill=tuple(int(v) for v in c * 0.75) + (255,))
    dr.ellipse([x - r * 0.75, y - r * 0.95, x + r * 0.55, y + r * 0.35], fill=tuple(int(v) for v in np.clip(c * 1.08 + 10, 0, 255)) + (255,))
    dr.ellipse([x - r * 0.45, y - r * 0.8, x + r * 0.05, y - r * 0.3], fill=tuple(int(v) for v in np.clip(c * 1.35 + 30, 0, 255)) + (200,))

# ---------------------------------------------------------------- sea decoration: wave strokes, clouds, compass, ship
for _ in range(260):
    x, y = rnd.uniform(0, W), rnd.uniform(0, H)
    if land[int(y), int(x)] or dist_out[int(y), int(x)] < 22 * K: continue
    L = rnd.uniform(14, 30) * K; a = (210, 230, 238, rnd.randint(35, 80))
    dr.arc([x - L, y - L * 0.35, x, y + L * 0.35], 200, 340, fill=a, width=max(1, int(1.4 * K)))
    dr.arc([x, y - L * 0.35, x + L, y + L * 0.35], 200, 340, fill=a, width=max(1, int(1.4 * K)))
clouds = Image.new('RGBA', (W, H), (0, 0, 0, 0)); cd = ImageDraw.Draw(clouds)
for (x, y, s) in [(-30, 470, 1.0), (1050, 330, 1.1), (1040, 720, 0.9), (1040, 60, 0.9), (-20, 780, 0.8), (480, -40, 0.8)]:
    x, y = (x + OX) * K, (y + OY) * K
    for k in range(7):
        rx, ry = rnd.uniform(16, 30) * s * K, rnd.uniform(9, 15) * s * K; ox, oy = rnd.uniform(-34, 34) * s * K, rnd.uniform(-6, 6) * s * K
        cd.ellipse([x + ox - rx, y + oy - ry, x + ox + rx, y + oy + ry], fill=(250, 252, 255, 225))
    cd.ellipse([x - 50 * s * K, y + 4 * s * K, x + 50 * s * K, y + 16 * s * K], fill=(196, 214, 228, 160))
clouds = clouds.filter(ImageFilter.GaussianBlur(3 * K)); canvas.alpha_composite(clouds)
dr = ImageDraw.Draw(canvas, 'RGBA')
# compass rose (top-left sea)
def compass(x, y, R):
    gold, dark = (214, 176, 84, 255), (90, 64, 24, 255)
    dr.ellipse([x - R, y - R, x + R, y + R], outline=gold, width=2 * K); dr.ellipse([x - R * 0.82, y - R * 0.82, x + R * 0.82, y + R * 0.82], outline=gold, width=K)
    for i in range(16):
        a = i / 16 * 2 * math.pi; r0, r1 = R * 0.84, R * (0.95 if i % 2 else 1.0); dr.line([(x + math.cos(a) * r0, y + math.sin(a) * r0), (x + math.cos(a) * r1, y + math.sin(a) * r1)], fill=gold, width=K)
    for i, L in enumerate([1.25, 0.7, 1.25, 0.7, 1.25, 0.7, 1.25, 0.7]):
        a = i / 8 * 2 * math.pi - math.pi / 2; w = 0.16 if L > 1 else 0.12
        tip = (x + math.cos(a) * R * L, y + math.sin(a) * R * L); l = (x + math.cos(a - math.pi / 2) * R * w, y + math.sin(a - math.pi / 2) * R * w); r_ = (x + math.cos(a + math.pi / 2) * R * w, y + math.sin(a + math.pi / 2) * R * w)
        dr.polygon([l, tip, (x, y)], fill=(244, 222, 150, 255)); dr.polygon([(x, y), tip, r_], fill=(170, 124, 40, 255))
        dr.line([l, tip, r_], fill=dark, width=max(1, K // 2 + 1))
    dr.ellipse([x - R * 0.12, y - R * 0.12, x + R * 0.12, y + R * 0.12], fill=gold, outline=dark)
    f = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc', int(R * 0.42), index=1)
    for ch, a in (('N', -90), ('E', 0), ('S', 90), ('W', 180)):
        tx, ty = x + math.cos(math.radians(a)) * R * 1.52, y + math.sin(math.radians(a)) * R * 1.52
        dr.text((tx, ty), ch, font=f, fill=(244, 226, 170, 255), anchor='mm', stroke_width=K, stroke_fill=(40, 30, 16, 255))
compass(70 * K, 120 * K, 38 * K)
# ship (bottom-left sea)
def ship(x, y, s):
    hull = [(x - 22 * s, y), (x + 24 * s, y), (x + 16 * s, y + 10 * s), (x - 16 * s, y + 10 * s)]
    dr.polygon(hull, fill=(110, 66, 36, 255), outline=(50, 30, 16, 255))
    dr.line([(x - 14 * s, y + 4 * s), (x + 16 * s, y + 4 * s)], fill=(190, 140, 70, 255), width=max(1, int(s)))
    for mx, h in ((-6, 34), (8, 28)):
        dr.line([(x + mx * s, y), (x + mx * s, y - h * s)], fill=(70, 46, 26, 255), width=max(1, int(1.6 * s)))
        for k, (w, yy0) in enumerate(((13, 0.18), (11, 0.55))):
            top = y - h * s * (1 - yy0) + 2 * s
            dr.polygon([(x + (mx - w / 2) * s, top), (x + (mx + w / 2) * s, top), (x + (mx + w / 2 + 1) * s, top + 9 * s), (x + (mx - w / 2 - 1) * s, top + 9 * s)], fill=(244, 236, 214, 255), outline=(150, 130, 100, 255))
        dr.polygon([(x + mx * s, y - h * s - 6 * s), (x + mx * s + 8 * s, y - h * s - 3 * s), (x + mx * s, y - h * s)], fill=(200, 60, 50, 255))
    dr.arc([x - 30 * s, y + 6 * s, x + 30 * s, y + 18 * s], 10, 170, fill=(230, 240, 244, 160), width=max(1, int(s)))
ship(70 * K, (640 + OY) * K, 1.5 * K)

# fade the outer border into one flat deep-sea colour so the SVG can extend the sea seamlessly to any frame shape
SEA = hexc('#0e2c4c'); a = np.asarray(canvas.convert('RGB')).astype(np.float32)
e = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy)); t = np.clip(1 - e / (150 * K), 0, 1); f = (t * t * (3 - 2 * t))[..., None]
canvas = Image.fromarray(np.clip(a * (1 - f) + SEA * f, 0, 255).astype(np.uint8))
out = canvas.convert('RGB').filter(ImageFilter.SMOOTH)
os.makedirs(D('assets', 'ui'), exist_ok=True)
out.save(D('assets', 'ui', 'worldmap_bg.jpg'), quality=86, optimize=True, progressive=True)
print('map', out.size, os.path.getsize(D('assets', 'ui', 'worldmap_bg.jpg')) // 1024, 'KB')

# ---------------------------------------------------------------- serif font subset for the map labels
from fontTools import subset
from fontTools.ttLib import TTCollection
text = '세계지도현재위치마을필드권장이어진곳없음확대축소아르칸연대기ARKANCHRONICLESNESW0123456789~·()-. '
text += ''.join(z['name'] for z in zones['zones']) + ''.join(r['name'] for r in zones['world']['regions'])
text += '들판숲환영의붉은바위산설원황무지심연고원습지협곡강변'
col = TTCollection('/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc')
kr = next(i for i, f in enumerate(col.fonts) if 'KR' in f['name'].getDebugName(1))
tmp = '/tmp/NotoSerifKR-Bold.otf'; col.fonts[kr].save(tmp)
opts = subset.Options(); opts.flavor = 'woff'; opts.layout_features = ['*']; opts.name_IDs = ['*']; opts.notdef_outline = True
f = subset.load_font(tmp, opts); s = subset.Subsetter(opts); s.populate(text=''.join(sorted(set(text)))); s.subset(f)
os.makedirs(D('assets', 'fonts'), exist_ok=True); subset.save_font(f, D('assets', 'fonts', 'ArcanSerif.woff'), opts)
print('font', os.path.getsize(D('assets', 'fonts', 'ArcanSerif.woff')) // 1024, 'KB', len(set(text)), 'glyphs')
