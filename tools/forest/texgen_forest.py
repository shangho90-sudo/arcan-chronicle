"""Hand-painted style ground textures + foliage card atlas for the forest zones.
Everything is procedural (no external images), tileable, deterministic (fixed seeds).
Writes assets/forest/tex/*.jpg|png.   Usage: python3 tools/forest/texgen_forest.py"""
import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'forest', 'tex')
os.makedirs(OUT, exist_ok=True)
N = 1024          # output size
SS = 2            # supersampling for strokes

def noise(n, cells, seed, oct=4, pers=0.55):
    r = np.random.default_rng(seed); acc = np.zeros((n, n)); amp = 1; tot = 0
    for o in range(oct):
        c = cells * 2 ** o
        if c >= n: break
        g = r.random((c, c)); z = ndimage.zoom(np.tile(g, (3, 3)), n / c, order=3)[n:2 * n, n:2 * n]
        acc += z * amp; tot += amp; amp *= pers
    a = acc / tot; return (a - a.min()) / (a.max() - a.min() + 1e-9)

def hexc(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
def mix(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def base_layer(n, c0, c1, seed, cells=6):
    t = noise(n, cells, seed)[..., None]
    return (np.array(c0)[None, None] * (1 - t) + np.array(c1)[None, None] * t)

def wrap_draw(draw_fn, size, x, y, rad):
    """call draw_fn at (x,y) and its wrapped copies so the texture tiles"""
    for ox in (-size, 0, size):
        for oy in (-size, 0, size):
            if -rad <= x + ox <= size + rad and -rad <= y + oy <= size + rad: draw_fn(x + ox, y + oy)

def dab_layer(img, rng, count, palette, rmin, rmax, elong=2.4, alpha=255, bias=None):
    S = img.size[0]; d = ImageDraw.Draw(img, 'RGBA')
    for _ in range(count):
        x, y = rng.random() * S, rng.random() * S
        r = rmin + (rmax - rmin) * rng.random() ** 1.5
        a = rng.random() * math.pi if bias is None else bias + (rng.random() - 0.5) * 1.2
        col = palette[int(rng.random() * len(palette))]
        L, Wd = r * elong, r
        ca, sa = math.cos(a), math.sin(a)
        def leaf(cx, cy):
            pts = []
            for k in range(10):
                t = k / 9 * math.pi * 2
                px, py = math.cos(t) * L * (0.55 + 0.45 * math.cos(t) ** 2) * 0.5, math.sin(t) * Wd * 0.5
                pts.append((cx + px * ca - py * sa, cy + px * sa + py * ca))
            d.polygon(pts, fill=col + (alpha,))
        wrap_draw(leaf, S, x, y, L)

def finish(img_rgb, name, height=None, nstr=2.0):
    im = img_rgb.resize((N, N), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.jpg'), quality=92, subsampling=0)
    if height is not None:
        h = ndimage.gaussian_filter(height, 1.0)
        gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * nstr; gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * nstr
        nn = np.dstack([-gx, gy, np.ones_like(h)]); nn /= np.linalg.norm(nn, axis=2, keepdims=True)
        Image.fromarray(((nn * 0.5 + 0.5) * 255).astype(np.uint8)).save(os.path.join(OUT, name + '_n.jpg'), quality=92)
    print('wrote', name)

def lum(img): a = np.asarray(img.convert('L').resize((N, N), Image.LANCZOS), float) / 255; return a

# ---------------------------------------------------------------- grass (sunlit + shade variants)
def grass(name, base0, base1, pal, hi, seed):
    S = N * SS; rng = np.random.default_rng(seed)
    b = base_layer(S, hexc(base0), hexc(base1), seed, 5)
    img = Image.fromarray(b.astype(np.uint8)).convert('RGB')
    dab_layer(img, rng, 26000, [hexc(c) for c in pal[:2]], 5, 11, 3.2)
    dab_layer(img, rng, 22000, [hexc(c) for c in pal[1:3]], 4, 9, 3.4)
    dab_layer(img, rng, 9000, [hexc(c) for c in pal[2:]], 3, 7, 3.6)
    dab_layer(img, rng, 2600, [hexc(c) for c in hi], 2.5, 5, 3.0)
    # large soft light/shade variation painted on top (low frequency, keeps it from looking like wallpaper)
    v = noise(S, 3, seed + 9)[..., None]
    a = np.asarray(img, float) * (0.86 + 0.26 * v)
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    finish(img, name, lum(img), 1.6)

grass('grass_sun', '#6f9a34', '#86ad3e', ['#557f29', '#6e9a33', '#8fb944', '#a9cb57', '#bcd767'], ['#d6e98a', '#e4ef9c'], 11)
grass('grass_shade', '#365c2c', '#46703a', ['#2c4d27', '#3c6532', '#4e7a3a', '#5f8a40', '#6d9644'], ['#86a94e'], 12)

# ---------------------------------------------------------------- dirt path: warm packed earth, pebbles, leaf bits
def dirt():
    S = N * SS; rng = np.random.default_rng(21)
    b = base_layer(S, hexc('#9a7148'), hexc('#b88c5c'), 21, 6)
    v2 = noise(S, 18, 22, 3)[..., None]; b = b * (0.88 + 0.22 * v2)
    img = Image.fromarray(np.clip(b, 0, 255).astype(np.uint8)).convert('RGB')
    dab_layer(img, rng, 9000, [hexc(c) for c in ('#8a6340', '#a87d50', '#c49a68', '#7c5838')], 4, 12, 1.6, 150)
    height = np.zeros((S, S))
    d = ImageDraw.Draw(img, 'RGBA'); hd = Image.new('L', (S, S), 0); hdd = ImageDraw.Draw(hd)
    for _ in range(1500):                                   # pebbles
        x, y = rng.random() * S, rng.random() * S; r = 4 + 14 * rng.random() ** 2.5; e = 0.6 + 0.4 * rng.random()
        g = int(140 + 60 * rng.random()); col = (g, int(g * 0.95), int(g * 0.86))
        def peb(cx, cy, r=r, e=e, col=col):
            d.ellipse((cx - r + 2, cy - r * e + 3, cx + r + 2, cy + r * e + 3), fill=(70, 46, 26, 120))
            d.ellipse((cx - r, cy - r * e, cx + r, cy + r * e), fill=col + (255,))
            d.ellipse((cx - r * 0.6, cy - r * e * 0.8, cx + r * 0.2, cy - r * e * 0.05), fill=(min(255, col[0] + 40), min(255, col[1] + 38), min(255, col[2] + 32), 200))
            hdd.ellipse((cx - r, cy - r * e, cx + r, cy + r * e), fill=200)
        wrap_draw(peb, S, x, y, r + 4)
    for _ in range(700):                                    # dry leaf bits and twigs
        x, y = rng.random() * S, rng.random() * S; a = rng.random() * math.pi
        col = [hexc('#c08a3a'), hexc('#9c6a30'), hexc('#d2a24c'), hexc('#7d6a3a')][int(rng.random() * 4)]
        L = 6 + 10 * rng.random()
        def twig(cx, cy, a=a, col=col, L=L):
            d.line((cx - math.cos(a) * L, cy - math.sin(a) * L, cx + math.cos(a) * L, cy + math.sin(a) * L), fill=col + (220,), width=3)
        wrap_draw(twig, S, x, y, L)
    height = ndimage.zoom(np.asarray(hd, float) / 255, 1 / SS, order=1) * 0.8 + lum(img) * 0.4
    finish(img, 'dirt', height, 2.4)

dirt()

# ---------------------------------------------------------------- moss / leaf litter under trees
def moss():
    S = N * SS; rng = np.random.default_rng(31)
    b = base_layer(S, hexc('#4b6a2a'), hexc('#6b8a34'), 31, 7)
    img = Image.fromarray(b.astype(np.uint8)).convert('RGB')
    d = ImageDraw.Draw(img, 'RGBA')
    for _ in range(9000):
        x, y = rng.random() * S, rng.random() * S; r = 3 + 9 * rng.random() ** 2
        col = [hexc(c) for c in ('#3f5e25', '#58782c', '#7a9a3a', '#93ad48', '#a6b955')][int(rng.random() * 5)]
        wrap_draw(lambda cx, cy, r=r, col=col: d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=col + (230,)), S, x, y, r)
    for _ in range(900):                                    # fallen leaves (brown/ochre) on the moss
        x, y = rng.random() * S, rng.random() * S
        col = [hexc(c) for c in ('#b07a34', '#8e5e2a', '#c99a48', '#6f4a24')][int(rng.random() * 4)]
        a = rng.random() * math.pi; L = 7 + 7 * rng.random()
        def leaf(cx, cy, a=a, col=col, L=L):
            pts = [(cx + math.cos(a + t) * (L if k % 2 == 0 else L * 0.45), cy + math.sin(a + t) * (L if k % 2 == 0 else L * 0.45)) for k, t in enumerate([0, math.pi / 2, math.pi, 3 * math.pi / 2])]
            d.polygon(pts, fill=col + (235,))
        wrap_draw(leaf, S, x, y, L)
    finish(img, 'moss', lum(img), 1.8)

moss()

# ---------------------------------------------------------------- foliage cards (alpha): grass tufts + flower tufts
CELL = 512
def tuft_card(seed, kind):
    S = CELL * SS; rng = np.random.default_rng(seed)
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    pal_dark = [hexc(c) for c in ('#3e6a2a', '#4a7a30', '#5a8a34')]
    pal_light = [hexc(c) for c in ('#7fae40', '#94c04c', '#acd060', '#c4dc74')]
    nbl = 70 if kind != 'fern' else 26
    base_y = S * 0.97
    for i in range(nbl):
        t = i / nbl
        x0 = S * (0.5 + (rng.random() - 0.5) * 0.55)
        h = S * (0.45 + 0.45 * rng.random()) * (1 - abs(x0 / S - 0.5) * 0.9)
        lean = (x0 / S - 0.5) * 1.6 + (rng.random() - 0.5) * 0.6
        w = S * (0.012 + 0.014 * rng.random()) * (2.4 if kind == 'fern' else 1)
        c0 = pal_dark[int(rng.random() * 3)]; c1 = pal_light[int(rng.random() * 4)]
        segs = 8; pts_l, pts_r = [], []
        for k in range(segs + 1):
            u = k / segs; bend = lean * u * u * h * 0.55
            cx = x0 + bend; cy = base_y - h * u; ww = w * (1 - u) ** 0.8
            pts_l.append((cx - ww, cy)); pts_r.append((cx + ww, cy))
        # two-tone blade: dark lower half, light upper half
        mid = segs // 2
        d.polygon(pts_l[:mid + 1] + pts_r[:mid + 1][::-1], fill=c0 + (255,))
        d.polygon(pts_l[mid:] + pts_r[mid:][::-1], fill=c1 + (255,))
    if kind in ('white', 'yellow', 'mixed'):
        cols = {'white': [('#fbf8ee', '#f2d24a')], 'yellow': [('#f6d23c', '#e8902a')], 'mixed': [('#fbf8ee', '#f2d24a'), ('#f6d23c', '#e8902a'), ('#f4a6c4', '#f6e27a')]}[kind]
        for i in range(int(5 + rng.random() * 5)):
            fx = S * (0.25 + 0.5 * rng.random()); fy = S * (0.18 + 0.45 * rng.random()); r = S * (0.035 + 0.02 * rng.random())
            pc, cc = cols[int(rng.random() * len(cols))]; pc, cc = hexc(pc), hexc(cc)
            d.line((fx, fy, fx + (rng.random() - 0.5) * 20, base_y - S * 0.1), fill=(70, 110, 40, 255), width=int(S * 0.008))
            for p in range(5):
                a = p / 5 * math.pi * 2 + rng.random() * 0.3
                px, py = fx + math.cos(a) * r * 0.75, fy + math.sin(a) * r * 0.6
                d.ellipse((px - r * 0.55, py - r * 0.45, px + r * 0.55, py + r * 0.45), fill=pc + (255,))
            d.ellipse((fx - r * 0.32, fy - r * 0.3, fx + r * 0.32, fy + r * 0.3), fill=cc + (255,))
    im = im.resize((CELL, CELL), Image.LANCZOS)
    # bleed colour into transparent texels so mip-mapped alpha-test edges don't go black
    a = np.asarray(im).astype(float); rgb = a[..., :3]; al = a[..., 3:] / 255
    blur_rgb = ndimage.gaussian_filter(rgb * al, (6, 6, 0)); blur_a = ndimage.gaussian_filter(al, (6, 6, 0)) + 1e-4
    fill = blur_rgb / blur_a; rgb = np.where(al > 0.02, rgb, fill)
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a[..., 3]]).astype(np.uint8))

atlas = Image.new('RGBA', (CELL * 4, CELL * 2), (0, 0, 0, 0))
kinds = ['grass', 'grass', 'grass', 'fern', 'white', 'yellow', 'mixed', 'white']
for i, k in enumerate(kinds): atlas.paste(tuft_card(100 + i, k), ((i % 4) * CELL, (i // 4) * CELL))
atlas.save(os.path.join(OUT, 'foliage_atlas.png'), optimize=True)
print('wrote foliage_atlas', kinds)
