"""Hand-painted stylised textures for the Blender assets and the ground (plain Python: numpy + PIL, deterministic seeds).

Everything tiles (stamps are drawn with wrap-around) unless it is a cut-out card. Colours follow the target art: warm
yellow-green highlights, saturated mid greens, blue-green shadows, warm grey stone, honey-brown bark and soil.

Usage: python3 tools/blender/paint.py            -> tools/blender/tex/*.png   (inputs for assets.py)
                                                 -> assets/forest/tex/g_*.jpg (ground set, used by js/nature.js)
"""
import os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, 'tex'); os.makedirs(TEX, exist_ok=True)
GROUND = os.path.join(HERE, '..', '..', 'assets', 'forest', 'tex'); os.makedirs(GROUND, exist_ok=True)

def hexc(h): h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)
def mix(a, b, t): return a + (b - a) * t
def clamp8(a): return np.clip(a, 0, 255).astype(np.uint8)

def pnoise(S, scale, seed, octaves=4):
    """periodic smooth noise in [0,1] (spectral synthesis: tiles exactly)"""
    rng = np.random.default_rng(seed); out = np.zeros((S, S), np.float32); amp = 1.0; tot = 0
    fy = np.fft.fftfreq(S)[:, None] * S; fx = np.fft.fftfreq(S)[None, :] * S; f = np.sqrt(fx * fx + fy * fy)
    for o in range(octaves):
        k = scale * (2 ** o)
        spec = np.exp(-(f / k) ** 2) * (f > 0)
        ph = rng.uniform(0, 2 * np.pi, (S, S))
        n = np.real(np.fft.ifft2(spec * np.exp(1j * ph)))
        n = (n - n.mean()) / (n.std() + 1e-9)
        out += n * amp; tot += amp; amp *= 0.5
    out /= tot; out = (out - out.min()) / (out.max() - out.min()); return out

class Canvas:
    """RGBA canvas drawn at 2x for smooth edges; wrap=True draws every shape 9 times so the result tiles"""
    def __init__(self, S, bg=(0, 0, 0, 0), wrap=True, ss=2):
        self.S, self.ss, self.wrap = S, ss, wrap
        self.im = Image.new('RGBA', (S * ss, S * ss), tuple(int(c) for c in bg)); self.d = ImageDraw.Draw(self.im)
    def _offs(self):
        S = self.S * self.ss
        return [(dx * S, dy * S) for dx in (-1, 0, 1) for dy in (-1, 0, 1)] if self.wrap else [(0, 0)]
    def poly(self, pts, col):
        k = self.ss; c = tuple(int(v) for v in col)
        for ox, oy in self._offs(): self.d.polygon([(x * k + ox, y * k + oy) for x, y in pts], fill=c)
    def ellipse(self, cx, cy, rx, ry, col):
        k = self.ss; c = tuple(int(v) for v in col)
        for ox, oy in self._offs(): self.d.ellipse([(cx - rx) * k + ox, (cy - ry) * k + oy, (cx + rx) * k + ox, (cy + ry) * k + oy], fill=c)
    def line(self, pts, col, w):
        k = self.ss; c = tuple(int(v) for v in col)
        for ox, oy in self._offs(): self.d.line([(x * k + ox, y * k + oy) for x, y in pts], fill=c, width=max(1, int(w * k)), joint='curve')
    def get(self): return self.im.resize((self.S, self.S), Image.LANCZOS)

def leaf(cx, cy, ang, L, W, bend=0.0):
    """pointed leaf outline (almond), length L, width W, rotated by ang"""
    pts = []
    for i in range(13):
        t = i / 12; x = t * L; y = math.sin(math.pi * t) ** 0.85 * W * 0.5; y += bend * t * t * L
        pts.append((x, y))
    for i in range(11, 0, -1):
        t = i / 12; x = t * L; y = -math.sin(math.pi * t) ** 0.85 * W * 0.5 + bend * t * t * L
        pts.append((x, y))
    ca, sa = math.cos(ang), math.sin(ang)
    return [(cx + x * ca - y * sa, cy + x * sa + y * ca) for x, y in pts]

# ---------------------------------------------------------------------------------------------- foliage
FOL = dict(deep=hexc('#1d4630'), dark=hexc('#2f6a38'), mid=hexc('#4f9a3c'), light=hexc('#8cc449'), hi=hexc('#c9e36a'), warm=hexc('#e3e98a'))

def leaf_clump(cv, cx, cy, size, rng, layer, pal=FOL):
    """one clump of leaves fanning upwards; layer 0 = back (dark) .. 2 = front (lit)"""
    n = rng.integers(5, 9)
    base = [mix(pal['deep'], pal['dark'], 0.6), pal['dark'], pal['mid']][layer]
    top = [pal['mid'], mix(pal['mid'], pal['light'], 0.5), pal['light']][layer]
    for k in range(n):
        ang = -math.pi / 2 + rng.uniform(-1.25, 1.25)
        L = size * rng.uniform(0.55, 1.0); W = L * rng.uniform(0.42, 0.6)
        t = (math.sin(ang) * -1 + 1) / 2                                 # leaves pointing up get more light
        col = mix(base, top, 0.35 + 0.5 * t + rng.uniform(-0.1, 0.1))
        col = col * rng.uniform(0.94, 1.06)
        cv.poly(leaf(cx, cy, ang, L, W, rng.uniform(-0.12, 0.12)), (*col, 255))
        if layer == 2 and rng.random() < 0.55:                        # lit upper edge stroke
            hl = mix(pal['light'], pal['hi'], rng.uniform(0.3, 1.0))
            pts = leaf(cx, cy, ang, L * 0.82, W * 0.38, 0)
            cv.poly([(x + math.cos(ang - 1.5) * W * 0.12, y + math.sin(ang - 1.5) * W * 0.12) for x, y in pts], (*hl, 255))

def foliage_tile(S=1024, seed=1, pal=FOL, name='foliage'):
    rng = np.random.default_rng(seed)
    n = pnoise(S, 3, seed + 5)
    base = mix(pal['dark'][None, None], pal['mid'][None, None], 0.35 + n[..., None] * 0.5)
    cv = Canvas(S, (0, 0, 0, 0));
    for layer, (count, sz) in enumerate([(150, 150), (190, 120), (230, 92)]):
        for _ in range(count):
            leaf_clump(cv, rng.uniform(0, S), rng.uniform(0, S), sz * rng.uniform(0.7, 1.25) * S / 1024, rng, layer, pal)
    top = np.asarray(cv.get()).astype(np.float32)
    a = top[..., 3:] / 255
    rgb = base * (1 - a) + top[..., :3] * a
    # broad painterly value/hue drift (keeps tiling)
    v = pnoise(S, 2, seed + 9); rgb *= (0.9 + 0.2 * v)[..., None]
    warm = pnoise(S, 2, seed + 11)[..., None]; rgb = mix(rgb, rgb * np.array([1.06, 1.04, 0.86]), warm * 0.5)
    img = Image.fromarray(clamp8(rgb)).filter(ImageFilter.GaussianBlur(0.6))
    img.save(os.path.join(TEX, name + '.png'))

def leaf_card(S=512, seed=3, pal=FOL, name='leafcard'):
    """cut-out leaf clump for the silhouette fringe of foliage blobs (alpha)"""
    rng = np.random.default_rng(seed)
    cv = Canvas(S, (0, 0, 0, 0), wrap=False, ss=3)
    cx, cy = S / 2, S * 0.6
    for layer, (count, sz, sp) in enumerate([(11, S * 0.36, S * 0.26), (12, S * 0.31, S * 0.22), (10, S * 0.25, S * 0.16)]):
        for _ in range(count):
            a = rng.uniform(0, 2 * math.pi); r = rng.uniform(0, sp)
            leaf_clump(cv, cx + math.cos(a) * r, cy + math.sin(a) * r * 0.75 - layer * S * 0.03, sz * rng.uniform(0.75, 1.15), rng, layer, pal)
    im = cv.get(); arr = np.asarray(im).astype(np.float32)
    # bleed colour into the transparent area so mipmaps do not get dark fringes
    a = arr[..., 3] / 255
    rgb = Image.fromarray(clamp8(arr[..., :3])).filter(ImageFilter.MaxFilter(9))
    rgb = np.asarray(rgb).astype(np.float32); arr[..., :3] = np.where(a[..., None] > 0.02, arr[..., :3], rgb)
    arr[..., 3] = np.where(a > 0.5, 255, a * 255)
    Image.fromarray(clamp8(arr)).save(os.path.join(TEX, name + '.png'))

# ---------------------------------------------------------------------------------------------- bark / stone / wood
def bark(S=512, seed=7):
    rng = np.random.default_rng(seed)
    n = pnoise(S, 4, seed); n2 = pnoise(S, 12, seed + 1)
    c0, c1, c2 = hexc('#5a3b22'), hexc('#8a5e36'), hexc('#b58a58')
    rgb = mix(c0[None, None], c1[None, None], (n * 0.7 + n2 * 0.3)[..., None])
    cv = Canvas(S)
    for _ in range(260):                                               # vertical plates and grooves
        x = rng.uniform(0, S); y = rng.uniform(0, S); L = rng.uniform(40, 140); w = rng.uniform(4, 13)
        pts = [(x + math.sin(t * 0.9 + x) * 3, y + t * L / 6) for t in range(7)]
        dark = rng.random() < 0.55
        col = mix(c0 * 0.75, c0, rng.random()) if dark else mix(c1, c2, rng.random())
        cv.line(pts, (*col, 230 if dark else 200), w * (0.6 if dark else 1))
    top = np.asarray(cv.get()).astype(np.float32); a = top[..., 3:] / 255
    rgb = rgb * (1 - a) + top[..., :3] * a
    Image.fromarray(clamp8(rgb)).filter(ImageFilter.GaussianBlur(0.7)).save(os.path.join(TEX, 'bark.png'))

def stone(S=512, seed=11, name='stone', warm='#bcae96', cool='#9a9c98', dark='#6c665e'):
    rng = np.random.default_rng(seed)
    n = pnoise(S, 3, seed); n2 = pnoise(S, 10, seed + 3); n3 = pnoise(S, 30, seed + 4, 2)
    rgb = mix(hexc(cool)[None, None], hexc(warm)[None, None], n[..., None])
    rgb *= (0.86 + 0.24 * n2)[..., None]; rgb *= (0.95 + 0.08 * n3)[..., None]
    cv = Canvas(S)
    for _ in range(90):                                                # soft painted patches
        cx, cy, r = rng.uniform(0, S), rng.uniform(0, S), rng.uniform(10, 40)
        col = hexc(warm) * rng.uniform(1.0, 1.12) if rng.random() < 0.5 else hexc(cool) * rng.uniform(0.85, 1.0)
        cv.ellipse(cx, cy, r, r * rng.uniform(0.4, 0.8), (*col, 70))
    for _ in range(26):                                                # a few hairline cracks
        x, y = rng.uniform(0, S), rng.uniform(0, S); pts = [(x, y)]
        for k in range(rng.integers(3, 7)): x += rng.uniform(-18, 18); y += rng.uniform(4, 22); pts.append((x, y))
        cv.line(pts, (*hexc(dark) * 0.8, 150), rng.uniform(1.2, 2.2))
    top = np.asarray(cv.get()).astype(np.float32); a = top[..., 3:] / 255
    rgb = rgb * (1 - a) + top[..., :3] * a
    sp = rng.random((S, S)) < 0.004; rgb[sp] *= 0.75                 # speckles
    Image.fromarray(clamp8(rgb)).filter(ImageFilter.GaussianBlur(0.8)).save(os.path.join(TEX, name + '.png'))

def wood(S=512, seed=13, name='wood', c0='#7a4e2a', c1='#a8743f', c2='#c99a5e'):
    """painted planks grain (horizontal), for crates, benches, signs, barrels"""
    rng = np.random.default_rng(seed)
    n = pnoise(S, 3, seed); y = np.linspace(0, 1, S, endpoint=False)[:, None]
    grain = (np.sin((y * 34 + n * 2.2) * 2 * np.pi) * 0.5 + 0.5)
    rgb = mix(hexc(c0)[None, None], hexc(c1)[None, None], (grain * 0.55 + n * 0.45)[..., None])
    cv = Canvas(S)
    for _ in range(160):
        x, y0 = rng.uniform(0, S), rng.uniform(0, S); L = rng.uniform(30, 120)
        cv.line([(x, y0), (x + L, y0 + rng.uniform(-3, 3))], (*hexc(c2), 90), rng.uniform(1.5, 3.5))
    for k in range(8):                                                 # plank seams
        yy = (k + 0.5) * S / 8; cv.line([(0, yy), (S, yy)], (*hexc(c0) * 0.6, 200), 3)
    top = np.asarray(cv.get()).astype(np.float32); a = top[..., 3:] / 255
    rgb = rgb * (1 - a) + top[..., :3] * a
    Image.fromarray(clamp8(rgb)).filter(ImageFilter.GaussianBlur(0.6)).save(os.path.join(TEX, name + '.png'))

def flat(name, hexcol, S=64):
    Image.new('RGB', (S, S), tuple(int(v) for v in hexc(hexcol))).save(os.path.join(TEX, name + '.png'))

# ---------------------------------------------------------------------------------------------- small plants atlas (4 x 2 cells, 256 x 512 each)
def plants_atlas():
    W, H = 1024, 1024; cw, ch = 256, 512
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    rng = np.random.default_rng(21)
    def cell(kind):
        cv = Canvas(512, (0, 0, 0, 0), wrap=False, ss=2)            # draw 512 x 512 then squeeze to 256 x 512
        g0, g1, g2 = hexc('#3d7a34'), hexc('#6aa83e'), hexc('#a9d05a')
        def blades(n, hmin, hmax, spread, cols=(g0, g1, g2)):
            for _ in range(n):
                bx = 256 + rng.normal(0, spread); h = rng.uniform(hmin, hmax); lean = rng.normal(0, 0.35)
                w = rng.uniform(14, 24); col = mix(cols[0], cols[2], rng.uniform(0.1, 1.0) ** 1.3)
                tip = (bx + lean * h * 0.6, 500 - h)
                pts = [(bx - w / 2, 505), (bx + w / 2, 505), (bx + lean * h * 0.3 + w * 0.15, 500 - h * 0.55), tip, (bx + lean * h * 0.3 - w * 0.25, 500 - h * 0.5)]
                cv.poly(pts, (*col, 255))
        def flower(cx, cy, r, petal, centre, n=9):
            for k in range(n):
                a = k / n * 2 * math.pi + rng.uniform(-0.1, 0.1)
                cv.poly(leaf(cx, cy, a, r, r * 0.55), (*mix(petal * 0.82, petal, 0.5 + 0.5 * math.sin(a) * -1), 255))
            cv.ellipse(cx, cy, r * 0.36, r * 0.34, (*centre, 255)); cv.ellipse(cx - r * 0.08, cy - r * 0.1, r * 0.14, r * 0.12, (*np.minimum(centre * 1.25, 255), 255))
        if kind == 'grass_short': blades(44, 140, 280, 62)
        elif kind == 'grass_tall': blades(30, 220, 420, 55, (g0, g1, hexc('#c2d86a')))
        elif kind in ('white', 'yellow', 'pink', 'mixed'):
            # leafy mound first (reads as a little flowering bush, not wisps), then the heads on top
            for layer in range(3):
                for k in range(10):
                    leaf_clump(cv, 256 + rng.normal(0, 70 - layer * 12), 505 - rng.uniform(20, 120) - layer * 30, rng.uniform(70, 110), rng, layer)
            blades(10, 120, 220, 70)
            pal = {'white': [hexc('#fbf7ea')], 'yellow': [hexc('#ffd84a')], 'pink': [hexc('#f39ab8')], 'mixed': [hexc('#fbf7ea'), hexc('#ffd84a'), hexc('#f39ab8'), hexc('#b9a4f0')]}[kind]
            for k in range(13):
                cx = 256 + rng.normal(0, 72); cy = 500 - rng.uniform(170, 300)
                p = pal[k % len(pal)]
                flower(cx, cy, rng.uniform(40, 54), p, hexc('#d07a1c') if kind == 'yellow' else hexc('#f0b52c'))
        elif kind == 'fern':
            for k in range(7):
                a = -math.pi / 2 + (k - 3) * 0.32; L = rng.uniform(260, 380)
                for j in range(14):
                    t = j / 14; px = 256 + math.cos(a) * L * t; py = 505 + math.sin(a) * L * t
                    for sgn in (-1, 1):
                        cv.poly(leaf(px, py, a + sgn * 1.15, 70 * (1 - t * 0.7), 26 * (1 - t * 0.6)), (*mix(g0, g2, 0.2 + t * 0.7), 255))
        elif kind == 'clover':
            blades(8, 60, 120, 60)
            for k in range(16):
                cx, cy = 256 + rng.normal(0, 95), 500 - rng.uniform(20, 140)
                for j in range(3):
                    a = j * 2.09 + rng.uniform(0, 1); cv.ellipse(cx + math.cos(a) * 16, cy + math.sin(a) * 11, 17, 13, (*mix(g1, g2, rng.random() * 0.6), 255))
        im = cv.get().resize((cw, ch), Image.LANCZOS)
        arr = np.asarray(im).astype(np.float32); a = arr[..., 3] / 255
        rgb = np.asarray(Image.fromarray(clamp8(arr[..., :3])).filter(ImageFilter.MaxFilter(7))).astype(np.float32)
        arr[..., :3] = np.where(a[..., None] > 0.02, arr[..., :3], rgb)
        return Image.fromarray(clamp8(arr))
    kinds = ['grass_short', 'grass_tall', 'white', 'yellow', 'pink', 'mixed', 'fern', 'clover']
    for i, k in enumerate(kinds): out.paste(cell(k), ((i % 4) * cw, (i // 4) * ch))
    out.save(os.path.join(TEX, 'plants.png'))

# ---------------------------------------------------------------------------------------------- ground set
def ground_grass(name, S, seed, cols, blade_n, flowers=0.0, dry=False):
    rng = np.random.default_rng(seed)
    n = pnoise(S, 3, seed); n2 = pnoise(S, 9, seed + 1)
    rgb = mix(cols[0][None, None], cols[1][None, None], (n * 0.6 + n2 * 0.4)[..., None])
    cv = Canvas(S)
    for _ in range(blade_n):                                         # short painted blade strokes
        x, y = rng.uniform(0, S), rng.uniform(0, S); L = rng.uniform(7, 16) * S / 1024; a = -math.pi / 2 + rng.normal(0, 0.45)
        t = rng.random(); col = mix(cols[1], cols[2], t ** 1.4) if rng.random() < 0.6 else mix(cols[0], cols[1], t)
        cv.poly([(x - 2.2, y), (x + 2.2, y), (x + math.cos(a) * L, y + math.sin(a) * L)], (*col, 230))
    for _ in range(int(flowers * S * S / 1024)):                     # tiny flower dots
        x, y = rng.uniform(0, S), rng.uniform(0, S); c = [hexc('#fff8e8'), hexc('#ffe06a'), hexc('#f7b0c8')][rng.integers(0, 3)]
        r = rng.uniform(1.6, 2.8) * S / 1024; cv.ellipse(x, y, r, r * 0.8, (*c, 255))
    top = np.asarray(cv.get()).astype(np.float32); a = top[..., 3:] / 255
    rgb = rgb * (1 - a) + top[..., :3] * a
    h = (a[..., 0] * 0.6 + n2 * 0.4)
    Image.fromarray(clamp8(rgb)).filter(ImageFilter.GaussianBlur(0.5)).save(os.path.join(GROUND, name + '.jpg'), quality=90)
    return h

def ground_soil(name, S, seed, c0, c1, pebbles, hi=None):
    rng = np.random.default_rng(seed)
    n = pnoise(S, 4, seed); n2 = pnoise(S, 14, seed + 2)
    rgb = mix(hexc(c0)[None, None], hexc(c1)[None, None], (n * 0.55 + n2 * 0.45)[..., None])
    cv = Canvas(S); hmap = Canvas(S)
    for _ in range(pebbles):
        x, y = rng.uniform(0, S), rng.uniform(0, S); r = rng.gamma(2.0, 2.2) * S / 1024 + 1.5
        base = mix(hexc('#9a8a76'), hexc('#d8cbb4'), rng.random())
        cv.ellipse(x + r * 0.25, y + r * 0.3, r * 1.05, r * 0.8, (*hexc(c0) * 0.62, 150))     # contact shade
        cv.ellipse(x, y, r, r * 0.78, (*base, 255))
        cv.ellipse(x - r * 0.25, y - r * 0.25, r * 0.5, r * 0.35, (*np.minimum(base * 1.18, 255), 200))
        hmap.ellipse(x, y, r, r * 0.78, (255, 255, 255, 255))
    for _ in range(120):                                              # painted lighter / darker smears
        x, y = rng.uniform(0, S), rng.uniform(0, S); r = rng.uniform(12, 50) * S / 1024
        col = hexc(hi or c1) * rng.uniform(1.0, 1.1) if rng.random() < 0.5 else hexc(c0) * 0.92
        cv.ellipse(x, y, r, r * rng.uniform(0.3, 0.6), (*col, 45))
    top = np.asarray(cv.get()).astype(np.float32); a = top[..., 3:] / 255
    rgb = rgb * (1 - a) + top[..., :3] * a
    Image.fromarray(clamp8(rgb)).filter(ImageFilter.GaussianBlur(0.5)).save(os.path.join(GROUND, name + '.jpg'), quality=90)
    return np.asarray(hmap.get())[..., 0].astype(np.float32) / 255 * 0.8 + n2 * 0.2

def normal_from_height(h, name, strength=2.0):
    """subtle tangent-space normal map (z up), tiling (np.roll differences)"""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength; dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nz = np.ones_like(h); l = np.sqrt(dx * dx + dy * dy + nz * nz)
    nm = np.stack([-dx / l, dy / l, nz / l], -1) * 0.5 + 0.5
    Image.fromarray(clamp8(nm * 255)).save(os.path.join(GROUND, name + '_n.jpg'), quality=88)

def ground_set(S=1024):
    G = lambda *h: [hexc(x) for x in h]
    h = ground_grass('g_grass', S, 31, G('#4f8f2e', '#78b23c', '#b7d863'), 26000, flowers=0.25); normal_from_height(h, 'g_grass', 1.6)
    h = ground_grass('g_grass_shadow', S, 32, G('#2f6034', '#467f3c', '#78a84a'), 22000, flowers=0.05); normal_from_height(h, 'g_grass_shadow', 1.6)
    ground_grass('g_grass_dry', S, 33, G('#8d9a3e', '#b5b252', '#ddd27c'), 20000, flowers=0.1)
    ground_grass('g_moss', S, 34, G('#3c6e2c', '#5f9636', '#8cbc4a'), 30000)
    h = ground_soil('g_path', S, 41, '#b98f5e', '#d9b783', 340, hi='#ecd3a0'); normal_from_height(h, 'g_path', 3.0)
    ground_soil('g_path_edge', S, 42, '#8a6440', '#a77c4f', 120)
    ground_soil('g_soil_dark', S, 43, '#6e4c30', '#8a6440', 80)
    ground_soil('g_pebble', S, 44, '#a88a66', '#c9ab80', 1400)

def ground_variant(pre, S, grass, shadow, dry, moss, path, edge, soil, pebble, flowers=(0.2, 0.05), peb_path=340):
    """another field's ground set with the same channel layout as ground_set (g_<pre>_*.jpg); normals are shared"""
    G = lambda *h: [hexc(x) for x in h]
    ground_grass(f'g_{pre}_grass', S, 131, G(*grass), 26000, flowers=flowers[0])
    ground_grass(f'g_{pre}_grass_shadow', S, 132, G(*shadow), 22000, flowers=flowers[1])
    ground_grass(f'g_{pre}_grass_dry', S, 133, G(*dry), 20000, flowers=0.05)
    ground_grass(f'g_{pre}_moss', S, 134, G(*moss), 30000)
    ground_soil(f'g_{pre}_path', S, 141, path[0], path[1], peb_path, hi=path[2])
    ground_soil(f'g_{pre}_path_edge', S, 142, edge[0], edge[1], 120)
    ground_soil(f'g_{pre}_soil_dark', S, 143, soil[0], soil[1], 80)
    ground_soil(f'g_{pre}_pebble', S, 144, pebble[0], pebble[1], 1400)

def litter(name, S, seed, leaves=600, spores=900, cracks=0, leaf_cols=('#8a5a3a', '#b0743e', '#6e4a5e'), spore_col='#d8b8ff'):
    """adds leaf litter, glowing spores and hairline cracks on top of an existing ground texture (tiles)"""
    path = os.path.join(GROUND, name + '.jpg'); base = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    rng = np.random.default_rng(seed); cv = Canvas(S)
    for _ in range(cracks):
        x, y = rng.uniform(0, S), rng.uniform(0, S); pts = [(x, y)]
        for k in range(rng.integers(3, 8)): x += rng.uniform(-30, 30); y += rng.uniform(-30, 30); pts.append((x, y))
        cv.line(pts, (30, 18, 40, 150), rng.uniform(1.5, 3))
    for _ in range(leaves):
        x, y = rng.uniform(0, S), rng.uniform(0, S); L = rng.uniform(9, 18) * S / 1024; col = hexc(leaf_cols[rng.integers(0, len(leaf_cols))]) * rng.uniform(0.85, 1.15)
        cv.poly(leaf(x, y, rng.uniform(0, 6.28), L, L * 0.5), (*np.minimum(col, 255), 230))
    for _ in range(spores):
        x, y = rng.uniform(0, S), rng.uniform(0, S); r = rng.uniform(1.2, 2.6) * S / 1024
        cv.ellipse(x, y, r * 2.2, r * 2.2, (*hexc(spore_col), 40)); cv.ellipse(x, y, r, r, (*hexc(spore_col), 230))
    top = np.asarray(cv.get()).astype(np.float32); a = top[..., 3:] / 255
    Image.fromarray(clamp8(base * (1 - a) + top[..., :3] * a)).save(path, quality=90)

def magic_floor(S=1024):
    # 속삭이는 숲 보스 단: painted violet forest floor (light / dark violet soil, warm brown soil, violet-green moss,
    # stones, cracked dark earth) + leaf litter and faint glowing spores
    ground_variant('magic', S, ('#6c5480', '#8a70a0', '#a993bf'), ('#3e2e52', '#523e68', '#6c5888'), ('#7a5a48', '#94704f', '#b08a64'), ('#3e5a48', '#56705a', '#7e9070'),
                   ('#8a6a7a', '#a48496', '#c2a4b2'), ('#5a4058', '#6e5268'), ('#2e2234', '#3e2e44'), ('#7c7088', '#9a8ea6'), flowers=(0.0, 0.0), peb_path=500)
    for n, sd, kw in [('g_magic_grass', 1, dict(leaves=500, spores=700)), ('g_magic_grass_shadow', 2, dict(leaves=350, spores=1100)), ('g_magic_grass_dry', 3, dict(leaves=900, spores=200)),
                      ('g_magic_soil_dark', 4, dict(leaves=200, spores=300, cracks=70)), ('g_magic_path', 5, dict(leaves=300, spores=150))]:
        litter(n, S, sd, **kw)

def ground_variants(S=1024):
    # 안개 골짜기: cool, blue-green, mossy; 서리 고원: frosted grass, snow drifts, grey-blue stone road; 용의 유적: dry gold grass, ash
    ground_variant('mist', S, ('#3f7a4a', '#5d9a5c', '#9cc48a'), ('#284f44', '#3a6a54', '#5e8c6c'), ('#6f8c5a', '#8fa66c', '#bccb94'), ('#2f5c44', '#4c7c50', '#78a468'),
                   ('#9a8a72', '#b9a88a', '#d2c4a6'), ('#6e604c', '#857360'), ('#4c4234', '#62543f'), ('#8a8274', '#a89e8c'), flowers=(0.12, 0.04))
    ground_variant('frost', S, ('#c8d6dc', '#e2ecf0', '#ffffff'), ('#9fb3c0', '#b8c8d4', '#dce6ec'), ('#a9b88c', '#c4cfa8', '#e6ecd8'), ('#7e9a8a', '#a0b8a8', '#d0e0d8'),
                   ('#8c949c', '#a8b0b8', '#c8d0d8'), ('#6c747c', '#848c94'), ('#5c646c', '#747c84'), ('#9aa2aa', '#b8c0c8'), flowers=(0.0, 0.0), peb_path=900)
    ground_variant('ruins', S, ('#8a8a3a', '#b0a64a', '#dccb72'), ('#5e5a30', '#7a7038', '#a29450'), ('#a8863e', '#c8a452', '#e8c878'), ('#5a6630', '#76823c', '#9ca452'),
                   ('#8a6448', '#a87c58', '#c89a70'), ('#5e4030', '#74503a'), ('#3a2c26', '#4c3a30'), ('#7a6a5c', '#988674'), flowers=(0.06, 0.02), peb_path=700)

def ground_variants_world(S=1024):
    # 2026-11-06 world fields: 지라트 회색 황무지 (ash), 붉은숲 (crimson), 발테른 바위산 (stone)
    ground_variant('ash', S, ('#6e6a62', '#8a857a', '#a8a294'), ('#4a4744', '#5e5a54', '#76716a'), ('#7a6e5a', '#968a72', '#b4a88c'), ('#4e5248', '#62665a', '#7c8070'),
                   ('#6a625a', '#867c72', '#a49a8e'), ('#4c4640', '#5e5750'), ('#2e2a28', '#3c3734'), ('#76706a', '#948c84'), flowers=(0.0, 0.0), peb_path=800)
    ground_variant('crimson', S, ('#8a3a2e', '#b0523a', '#d8835a'), ('#5a2228', '#743030', '#94483e'), ('#a0603a', '#c07e4a', '#dca46a'), ('#6a3a2a', '#8a4e34', '#ac6a44'),
                   ('#8a6450', '#a67c62', '#c49a7c'), ('#5e4034', '#74503e'), ('#3c2622', '#4e322a'), ('#7a6058', '#987a6e'), flowers=(0.08, 0.02))
    ground_variant('stone', S, ('#5e7a48', '#7e9a58', '#a8bc7a'), ('#3e5440', '#526c4c', '#728c64'), ('#8a8a5a', '#a6a46c', '#c8c48e'), ('#4a6040', '#62784c', '#86986a'),
                   ('#8c8a84', '#a8a69e', '#c6c4bc'), ('#6a6862', '#82807a'), ('#4a4844', '#5e5c56'), ('#94928a', '#b2b0a8'), flowers=(0.08, 0.03), peb_path=1100)

# ---------------------------------------------------------------------------------------------- mushroom caps / stems (boss forest)
def cap(name, c0, c1, c2, S=512, seed=71, streaks=True):
    """painted cap: soft value masses + radial-ish brush streaks (box-mapped, so plain strokes in two directions)"""
    rng = np.random.default_rng(seed)
    n = pnoise(S, 3, seed); n2 = pnoise(S, 9, seed + 1)
    rgb = mix(hexc(c0)[None, None], hexc(c1)[None, None], n[..., None]); rgb *= (0.9 + 0.18 * n2)[..., None]
    cv = Canvas(S)
    for _ in range(260 if streaks else 80):
        x, y = rng.uniform(0, S), rng.uniform(0, S); L = rng.uniform(18, 60); a = rng.choice([0.0, math.pi / 2]) + rng.uniform(-0.35, 0.35)
        col = hexc(c2) if rng.random() < 0.45 else hexc(c0) * 0.9
        cv.line([(x, y), (x + math.cos(a) * L, y + math.sin(a) * L)], (*col, rng.uniform(40, 90)), rng.uniform(2, 6))
    top = np.asarray(cv.get()).astype(np.float32); a = top[..., 3:] / 255
    rgb = rgb * (1 - a) + top[..., :3] * a
    Image.fromarray(clamp8(rgb)).filter(ImageFilter.GaussianBlur(0.8)).save(os.path.join(TEX, name + '.png'))

def mushroom_set():
    cap('cap_purple', '#6a3fa0', '#9a6ad0', '#c9a6f0', seed=71)
    cap('cap_blue', '#2f5aa8', '#5a8ad8', '#a6ccf6', seed=72)
    cap('cap_orange', '#c0562a', '#e8873e', '#f6c27a', seed=73)
    cap('glow_purple', '#b98af0', '#dcc0ff', '#f6ecff', seed=74, streaks=False)
    cap('glow_blue', '#7ab6f0', '#bfe2ff', '#f0faff', seed=75, streaks=False)
    cap('stem', '#d8c6a6', '#efe2c8', '#fff4e0', seed=76)
    cap('spot', '#efe4cc', '#fbf3e2', '#ffffff', seed=77, streaks=False)

def foliage_world():
    # 2026-11-06 world fields: 붉은숲 (crimson), 푸른숲 (azure), 지라트 마른 잎 (ash), 북방 눈 덮인 잎 (snow)
    P = lambda *h: dict(zip(('deep', 'dark', 'mid', 'light', 'hi', 'warm'), [hexc(x) for x in h]))
    for name, pal, seed in [('crimson', P('#3e0e12', '#6a1a1c', '#a42e26', '#d4542e', '#f08a44', '#ffc070'), 21),
                            ('azure', P('#0e2a4a', '#1a4a78', '#2e74a8', '#4ea2d0', '#86d0ee', '#d0f4ff'), 23),
                            ('ash', P('#2a2622', '#4a423a', '#6e6254', '#8e8270', '#b0a48e', '#d0c4ac'), 25),
                            ('snow', P('#24423e', '#36605a', '#5a8a80', '#a8c8c4', '#e4f0f2', '#ffffff'), 27)]:
        foliage_tile(1024, seed, pal, 'foliage_' + name); leaf_card(512, seed + 1, pal, 'leafcard_' + name)

if __name__ == '__main__':
    foliage_tile(1024, 1, FOL, 'foliage')
    leaf_card(512, 3, FOL, 'leafcard')
    FOL2 = dict(deep=hexc('#183c34'), dark=hexc('#245a40'), mid=hexc('#3a8048'), light=hexc('#70ad55'), hi=hexc('#a9d06a'), warm=hexc('#d0e090'))
    foliage_tile(1024, 2, FOL2, 'foliage_cool'); leaf_card(512, 4, FOL2, 'leafcard_cool')
    FOL3 = dict(deep=hexc('#2c5228'), dark=hexc('#4a7f2c'), mid=hexc('#78ad3a'), light=hexc('#b3d454'), hi=hexc('#e6ef84'), warm=hexc('#f2f0a0'))
    foliage_tile(1024, 5, FOL3, 'foliage_warm'); leaf_card(512, 6, FOL3, 'leafcard_warm')
    bark(); stone(); stone(512, 12, 'stone_warm', '#c2ae8e', '#a39a8c', '#7a6a58')
    wood(); wood(512, 14, 'wood_dark', '#4e3220', '#6e4a2c', '#8e6a44')
    for n, c in [('iron', '#2e3440'), ('gold', '#d6aa4a'), ('navy', '#22386e'), ('cream', '#efe2c4'), ('roof_blue', '#3c5aa8'), ('terracotta', '#c87a4a'), ('plaster', '#efe0c0'), ('lampglow', '#ffe9a8'), ('red', '#b8443a'), ('soilpot', '#6a4a30')]:
        flat(n, c)
    plants_atlas()
    FOLV = dict(deep=hexc('#2a1f4e'), dark=hexc('#45307a'), mid=hexc('#6c4fae'), light=hexc('#9a7ad6'), hi=hexc('#c6a8f2'), warm=hexc('#e6cff8'))
    foliage_tile(1024, 8, FOLV, 'foliage_violet'); leaf_card(512, 9, FOLV, 'leafcard_violet')
    foliage_world()
    stone(512, 15, 'stone_violet', '#a49ab4', '#8a86a0', '#5e5672')
    mushroom_set()
    ground_set(); ground_variants(); ground_variants_world(); magic_floor()
    print('ok')
