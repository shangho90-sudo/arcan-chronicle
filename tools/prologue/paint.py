"""Legacy prologue illustrations -> tools/prologue/legacy-output/p<N>.jpg (1600x900).
The game uses the new illustrated assets; see assets/ui/prologue/README.md.

Style: a told legend — dark painted skies (fbm noise), light-and-ink silhouettes, strong glows, grain + vignette.
Panels (story: docs / 『아르칸 연대기 — 흑룡의 계절』 서장):
  p1 태초의 무 — two wills open their eyes in the void (white-gold light vs black-violet smoke)
  p2 두 용의 싸움 — white dragon Arkan and black dragon Sabnak coil and clash; the wounded land below
  p3 다섯 조각 — Arkan's power falls on the continent as five lights (the world map, darkened)
  p4 예언 — a dragon constellation; "별을 잇는 자" (Asterion)
  p5 지라트 — the black heart still beats under the dead southern land
  p6 말라키온 — a priest leaves the temple at night; his sister calls from the lit doorway
Glow overlays that the game animates (heart pulse etc.) are positioned in js/prologue.js, not painted twice.
Usage: python3 tools/prologue/paint.py [p1 p2 ...]
"""
import os, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'tools', 'prologue', 'legacy-output')
W, H = 1600, 900
SS = 2                                   # silhouettes are drawn at 2x and reduced (smooth edges)
rng = np.random.default_rng(7)


# ----------------------------------------------------------------------------------------------------- helpers
def fbm(w, h, scale=200.0, oct=6, seed=0, warp=0.0):
    """fractal value noise in [0,1], optional domain warp"""
    r = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32); amp = 1.0; tot = 0.0; s = scale
    for _ in range(oct):
        gw, gh = int(w / s) + 4, int(h / s) + 4
        g = r.random((gh, gw)).astype(np.float32)
        # float resize (no 8-bit banding), random sub-cell offset by cropping (no wrap-around seams)
        im = Image.fromarray(g, 'F').resize((int(gw * s), int(gh * s)), Image.BICUBIC)
        ox, oy = int(r.integers(0, max(1, int(s)))), int(r.integers(0, max(1, int(s))))
        a = np.asarray(im, np.float32)[oy:oy + h, ox:ox + w]
        out += a * amp; tot += amp; amp *= 0.5; s /= 2.0
        if s < 2: break
    out /= tot
    if warp:
        wx = fbm(w, h, scale * 1.3, 4, seed + 11) - 0.5; wy = fbm(w, h, scale * 1.3, 4, seed + 12) - 0.5
        yy, xx = np.mgrid[0:h, 0:w]
        xi = np.clip((xx + wx * warp).astype(int), 0, w - 1); yi = np.clip((yy + wy * warp).astype(int), 0, h - 1)
        out = out[yi, xi]
    lo, hi = np.percentile(out, 1), np.percentile(out, 99)
    return np.clip((out - lo) / (hi - lo + 1e-6), 0, 1)

def grad(h, w, top, bot):
    t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    return (np.array(top, np.float32) * (1 - t) + np.array(bot, np.float32) * t) * np.ones((1, w, 1), np.float32)

def radial(w, h, cx, cy, r, power=2.0):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r
    return np.clip(1 - d, 0, 1) ** power

def add_glow(img, cx, cy, r, col, k=1.0, power=2.0):
    g = radial(W, H, cx, cy, r, power)[..., None]
    return img + g * np.array(col, np.float32) * k

def screen(a, b):
    return 1 - (1 - a) * (1 - b)

def stars(img, n=900, seed=3, box=None, bright=1.0):
    r = np.random.default_rng(seed)
    for _ in range(n):
        x, y = r.integers(0, W), r.integers(0, H)
        if box and not (box[0] <= x < box[2] and box[1] <= y < box[3]): continue
        b = r.random() ** 3 * bright
        col = np.array([1.0, 0.95, 0.85]) if r.random() < 0.7 else np.array([0.8, 0.85, 1.0])
        img[y, x] = np.clip(img[y, x] + col * b, 0, 4)
        if b > 0.5:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if 0 <= x + dx < W and 0 <= y + dy < H: img[y + dy, x + dx] += col * b * 0.35
    return img

def mask_from(draw_fn, blur=0):
    """draw_fn(ImageDraw, scale) on a 2x canvas -> float mask WxH"""
    m = Image.new('L', (W * SS, H * SS), 0); draw_fn(ImageDraw.Draw(m), SS)
    m = m.resize((W, H), Image.LANCZOS)
    if blur: m = m.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(m, np.float32) / 255.0

def blurf(a, r):
    """gaussian blur of a float image (HxW or HxWx3) in [0, ~4]"""
    if a.ndim == 2:
        im = Image.fromarray(np.clip(a / 4 * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
        return np.asarray(im, np.float32) / 255 * 4
    return np.stack([blurf(a[..., i], r) for i in range(3)], -1)

def comp(img, m, col):
    """paint colour (array HxWx3 or rgb) through mask m"""
    m = m[..., None]; return img * (1 - m) + np.asarray(col, np.float32) * m

def finish(img, name, vignette=0.55, grain=0.035, warm=(1.0, 1.0, 1.0)):
    img = img * np.array(warm, np.float32)
    # soft bloom
    hi = np.clip(img - 0.75, 0, None); img = img + blurf(hi, 18) * 0.6 + blurf(hi, 5) * 0.35
    # filmic-ish curve
    img = img / (1 + img * 0.18); img = np.clip(img, 0, 1) ** 0.95
    v = radial(W, H, W / 2, H / 2, math.hypot(W, H) * 0.62, 1.0)
    img = img * (1 - vignette + vignette * (0.35 + 0.65 * v[..., None]))
    img = img + (rng.random((H, W, 1)).astype(np.float32) - 0.5) * grain
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, name + '.jpg'), quality=88, optimize=True, progressive=True)
    print('wrote', name)


# ----------------------------------------------------------------------------------------------- dragon silhouette
def dragon_poly(spine, thick, head_scale, flip=False):
    """serpentine dragon from a spine polyline (list of (x,y), head at the END) and thickness per point.
    Returns (body polygon, list of spike triangles, head polygon, horn polys, claws, eye position, mane strands)"""
    P = np.array(spine, np.float64); n = len(P)
    T = np.gradient(P, axis=0); T /= np.linalg.norm(T, axis=1)[:, None] + 1e-9
    N = np.stack([-T[:, 1], T[:, 0]], 1)
    if flip: N = -N
    th = np.array(thick, np.float64)
    L = P + N * th[:, None]; R = P - N * th[:, None]
    body = [tuple(p) for p in L] + [tuple(p) for p in R[::-1]]
    spikes = []
    for i in range(4, n - 6, 3):
        b0 = L[i]; b1 = L[i + 2]; tip = (L[i] + L[i + 2]) / 2 + N[i + 1] * th[i + 1] * 0.5 - T[i + 1] * th[i + 1] * 0.55
        spikes.append([tuple(b0), tuple(tip), tuple(b1)])
    # head: built in a local frame (u = forward along the last tangent, v = up = normal)
    o = P[-1]; u = T[-1]; v = N[-1]; s = head_scale
    def H_(a, b): return tuple(o + u * a * s + v * b * s)
    head = [H_(-0.3, 0.55), H_(0.25, 0.7), H_(0.7, 0.55), H_(1.15, 0.35), H_(1.55, 0.22), H_(1.7, 0.05), H_(1.6, -0.05),
            H_(1.15, -0.02), H_(1.45, -0.25), H_(1.3, -0.38), H_(0.8, -0.3), H_(0.35, -0.5), H_(-0.3, -0.55)]
    horns = [[H_(0.35, 0.6), H_(-0.4, 1.35), H_(-0.95, 1.6), H_(-0.45, 1.25), H_(0.05, 0.55)],
             [H_(0.6, 0.55), H_(0.2, 1.15), H_(-0.25, 1.35), H_(0.1, 1.0), H_(0.4, 0.5)]]
    whisk = [[H_(1.5, 0.0), H_(2.1, -0.35), H_(2.7, -0.15), H_(3.2, -0.55)], [H_(1.35, -0.3), H_(1.8, -0.9), H_(2.2, -1.0), H_(2.6, -1.5)]]
    mane = []
    for k in range(7):
        a = -0.2 - k * 0.32; b0 = 0.45 + 0.05 * k
        mane.append([H_(a, b0), H_(a - 0.7, b0 + 0.55 + 0.1 * (k % 2)), H_(a - 0.15, b0 - 0.1)])
    eye = H_(0.9, 0.22)
    # legs with claws at 30% and 62% of the body
    claws = []
    for f in (0.32, 0.64):
        i = int(n * f); base = R[i]; d = -N[i] * th[i] * 2.2 + T[i] * th[i] * 0.8
        knee = base + d * 0.55 + T[i] * th[i] * 0.6; foot = base + d
        leg = [tuple(base + T[i] * th[i] * 0.6), tuple(knee + T[i] * th[i] * 0.35), tuple(foot), tuple(knee - T[i] * th[i] * 0.4), tuple(base - T[i] * th[i] * 0.6)]
        toes = [[tuple(foot - T[i] * th[i] * 0.2), tuple(foot + (T[i] * 0.9 - N[i] * (0.25 + 0.2 * c)) * th[i]), tuple(foot + T[i] * th[i] * 0.15)] for c in (-1.0, 0.0, 1.0)]
        claws.append((leg, toes))
    return dict(body=body, spikes=spikes, head=head, horns=horns, whisk=whisk, mane=mane, eye=eye, claws=claws, tail=tuple(P[0]), tailN=N[0], tailT=T[0], th0=th[0])

def draw_dragon(D, d, s):
    sc = lambda pts: [(x * s, y * s) for x, y in pts]
    d.polygon(sc(D['body']), fill=255)
    for sp in D['spikes']: d.polygon(sc(sp), fill=255)
    d.polygon(sc(D['head']), fill=255)
    for hp in D['horns']: d.polygon(sc(hp), fill=255)
    for m in D['mane']: d.polygon(sc(m), fill=255)
    for wk in D['whisk']: d.line(sc(wk), fill=255, width=int(3 * s), joint='curve')
    for leg, toes in D['claws']:
        d.polygon(sc(leg), fill=255)
        for t in toes: d.polygon(sc(t), fill=255)
    # tail fin
    t = np.array(D['tail']); n = D['tailN']; tt = D['tailT']; k = D['th0'] * 6
    fin = [tuple(t), tuple(t - tt * k * 0.9 + n * k * 0.7), tuple(t - tt * k * 0.4), tuple(t - tt * k * 1.0 - n * k * 0.5)]
    d.polygon(sc(fin), fill=255)

def catmull(pts, n=140):
    """smooth curve through control points (Catmull-Rom), n samples"""
    P = [pts[0]] + list(pts) + [pts[-1]]; out = []
    segs = len(pts) - 1
    for k in range(n):
        u = k / (n - 1) * segs; i = min(int(u), segs - 1); t = u - i
        p0, p1, p2, p3 = (np.array(P[i + j], float) for j in range(4))
        out.append(tuple(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)))
    return out

def spine_curve(fn, n=90):
    return [fn(i / (n - 1)) for i in range(n)]

def thickness(n, base, head=None):
    """thin tail -> full chest (~65%) -> narrower neck -> head"""
    out = []
    for i in range(n):
        t = i / (n - 1)
        body = 0.1 + 0.9 * math.sin(min(1.0, t / 0.65) * math.pi * 0.5) ** 1.3
        neck = 1 - 0.32 * max(0.0, (t - 0.8) / 0.2)
        out.append(base * body * neck)
    return out

def dragon_layer(img, D, fill_top, fill_bot, rim, rim_w=6, glow=None, glow_r=40, eye=None):
    m = mask_from(lambda d, s: draw_dragon(D, d, s))
    # inner shading: vertical gradient + fbm scales
    sc = fbm(W, H, 18, 3, seed=int(D['eye'][0]))[..., None]
    fill = grad(H, W, fill_top, fill_bot) * (0.85 + 0.3 * sc)
    if glow is not None:
        g = blurf(np.repeat(m[..., None], 3, 2), glow_r) * np.array(glow, np.float32)
        img = img + g * 1.4
    img = comp(img, m, fill)
    # rim light: mask minus eroded mask (offset toward the light)
    er = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(rim_w * 2 + 1)), np.float32) / 255
    edge = np.clip(m - er, 0, 1)
    img = img + blurf(np.repeat(edge[..., None], 3, 2), 1.2) * np.array(rim, np.float32)
    if eye:
        ex, ey = D['eye']; img = add_glow(img, ex, ey, 26, eye, 2.2, 2.5); img = add_glow(img, ex, ey, 8, (1, 1, 1), 1.5, 1.5)
    return img, m


# ----------------------------------------------------------------------------------------------------- panels
def p1():
    img = grad(H, W, (0.015, 0.012, 0.03), (0.02, 0.015, 0.035))
    neb = fbm(W, H, 420, 7, seed=1, warp=180)
    neb2 = fbm(W, H, 260, 6, seed=2, warp=120)
    # white-gold will (left) and black-violet will (right)
    L = radial(W, H, 470, 430, 700, 1.6); R = radial(W, H, 1150, 470, 720, 1.6)
    img = img + (neb ** 2.2 * L)[..., None] * np.array([1.1, 0.85, 0.45]) * 0.9
    img = img + (neb2 ** 2.0 * R)[..., None] * np.array([0.45, 0.16, 0.7]) * 0.9
    smoke = fbm(W, H, 140, 6, seed=9, warp=90)
    img = img * (1 - (smoke ** 3 * R * 0.9)[..., None])           # black smoke eats the right side
    img = stars(img, 1100, 4, bright=0.9)
    # the two eyes
    img = add_glow(img, 470, 430, 380, (1.0, 0.8, 0.45), 0.55, 2.2); img = add_glow(img, 470, 430, 90, (1.2, 1.1, 0.9), 1.6, 2.0)
    img = add_glow(img, 470, 430, 22, (1, 1, 1), 2.5, 1.5)
    img = add_glow(img, 1150, 470, 360, (0.35, 0.05, 0.5), 0.6, 2.2); img = add_glow(img, 1150, 470, 70, (0.9, 0.1, 0.25), 1.3, 2.0)
    img = add_glow(img, 1150, 470, 16, (1.0, 0.5, 0.6), 2.0, 1.5)
    # thin light streams reaching toward each other
    sm = mask_from(lambda d, s: [d.line([(520 * s, (430 + k * 9) * s), (800 * s, (450 + k * 3) * s), (1100 * s, (470 - k * 2) * s)], fill=120, width=int(2 * s), joint='curve') for k in (-2, 0, 2)], blur=3)
    img = img + sm[..., None] * np.array([1.0, 0.85, 0.6]) * 0.7
    finish(img, 'p1', vignette=0.6)

def storm_sky(seed, top, bot, light_xy, light_col):
    img = grad(H, W, top, bot)
    c = fbm(W, H, 300, 7, seed=seed, warp=160)
    img = img * (0.55 + 0.75 * c[..., None])
    img = add_glow(img, *light_xy, 700, light_col, 0.9, 1.6)
    return img

def p2():
    img = storm_sky(21, (0.05, 0.05, 0.12), (0.22, 0.12, 0.16), (800, 380), (1.0, 0.75, 0.45))
    # land below cracked by the fight: dark ridges, a glowing rift (future sea / mountains)
    ridge = fbm(W, 1, 90, 6, seed=31)[0]
    land = np.zeros((H, W), np.float32)
    for x in range(W):
        y0 = int(705 + ridge[x] * 90 - 40 * math.sin(x / 260)); land[y0:, x] = 1
    land = np.asarray(Image.fromarray((land * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255
    lt = fbm(W, H, 60, 5, seed=32)[..., None]
    img = comp(img, land, grad(H, W, (0.06, 0.05, 0.07), (0.02, 0.02, 0.03)) * (0.7 + 0.6 * lt))
    rr = np.random.default_rng(23)
    def rift_(d, s):
        x, y = 60.0, 810.0; pts = [(x * s, y * s)]
        while x < 1560:
            x += rr.uniform(14, 40); y = np.clip(y + rr.normal(0, 14), 770, 860); pts.append((x * s, y * s))
            if rr.random() < 0.12:   # side branches
                bx, by = x, y; br = [(bx * s, by * s)]
                for _ in range(int(rr.integers(3, 7))): bx += rr.uniform(-20, 20); by += rr.uniform(8, 20); br.append((bx * s, by * s))
                d.line(br, fill=255, width=int(2 * s))
        d.line(pts, fill=255, width=int(4 * s))
    rift = mask_from(rift_)
    img = img + blurf(np.repeat(rift[..., None], 3, 2), 9) * np.array([1.0, 0.45, 0.15]) * 1.6 + rift[..., None] * np.array([1.2, 0.8, 0.4])
    # white dragon Arkan: rises from lower-left, coils, head at upper-centre facing right
    n = 150
    ws = catmull([(40, 880), (250, 815), (430, 700), (400, 560), (250, 480), (250, 340), (400, 250), (560, 270), (672, 330)], n)
    WD = dragon_poly(ws, thickness(n, 36), 64, flip=True)
    # black dragon Sabnak: from upper-right, head at centre facing left
    bs = catmull([(1590, 70), (1400, 170), (1240, 110), (1090, 170), (1170, 330), (1330, 430), (1250, 570), (1070, 530), (965, 430), (905, 365)], n)
    BD = dragon_poly(bs, thickness(n, 40), 68)
    # clash light between the heads
    hx = (WD['eye'][0] + BD['eye'][0]) / 2; hy = (WD['eye'][1] + BD['eye'][1]) / 2
    hx -= 10; hy -= 30                                                     # just above / between the jaws, heads stay readable
    img = add_glow(img, hx, hy, 380, (1.0, 0.7, 0.4), 0.55, 2.0)
    img, _ = dragon_layer(img, BD, (0.04, 0.03, 0.06), (0.015, 0.01, 0.03), (0.55, 0.2, 0.9), 5, glow=(0.3, 0.05, 0.45), glow_r=30, eye=(1.0, 0.15, 0.2))
    img, _ = dragon_layer(img, WD, (0.92, 0.88, 0.8), (0.66, 0.6, 0.52), (1.3, 1.1, 0.75), 4, glow=(0.7, 0.55, 0.3), glow_r=30, eye=(0.3, 0.7, 1.4))
    img = add_glow(img, hx, hy, 70, (1.4, 1.2, 0.9), 1.1, 2.2); img = add_glow(img, hx, hy, 20, (1, 1, 1), 2.0, 1.5)
    # lightning between them
    r = np.random.default_rng(5)
    def bolt(d, s):
        for k in range(5):
            x, y = hx, hy; a = r.uniform(0, 2 * math.pi); pts = [(x * s, y * s)]
            for j in range(14):
                a += r.uniform(-0.6, 0.6); x += math.cos(a) * 26; y += math.sin(a) * 26; pts.append((x * s, y * s))
            d.line(pts, fill=255, width=int(2 * s))
    bm = mask_from(bolt)
    img = img + blurf(np.repeat(bm[..., None], 3, 2), 6) * np.array([0.8, 0.7, 1.2]) * 1.2 + bm[..., None] * np.array([1.2, 1.15, 1.3])
    finish(img, 'p2', vignette=0.5, warm=(1.03, 1.0, 0.97))

def p3():
    m = Image.open(os.path.join(ROOT, 'assets', 'ui', 'worldmap_bg.jpg')).convert('RGB')
    # crop the continent to 16:9 and darken into night
    mw, mh = m.size; cw = mw * 0.86; ch = cw * 9 / 16; x0 = (mw - cw) / 2; y0 = mh * 0.06
    m = m.crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch))).resize((W, H), Image.LANCZOS)
    img = np.asarray(m, np.float32) / 255
    lum = img.mean(2, keepdims=True); img = (img * 0.45 + lum * 0.55) * np.array([0.38, 0.42, 0.62])
    img = blurf(img, 0.8)
    # fading white dragon spirit across the sky (soft, translucent)
    n = 100
    sp = spine_curve(lambda t: (180 + 1240 * t, 170 + 90 * math.sin(t * 7.0) - 40 * t), n)
    D = dragon_poly(sp, thickness(n, 26, 1), 50)
    dm = mask_from(lambda d, s: draw_dragon(D, d, s), blur=2.5)
    img = img + blurf(np.repeat(dm[..., None], 3, 2), 22) * np.array([0.7, 0.62, 0.45]) * 0.9 + dm[..., None] * np.array([0.55, 0.52, 0.45])
    # five shards falling: lightning (gold-yellow) / flame (red) / wind (green) / earth (amber) / life (pink-white)
    shards = [((300, 330), (1.3, 1.15, 0.35)), ((1180, 480), (1.4, 0.35, 0.15)), ((640, 560), (0.35, 1.25, 0.6)),
              ((960, 300), (1.1, 0.7, 0.3)), ((1380, 700), (1.3, 0.75, 0.95))]
    sx, sy = 800, 200
    for (x, y), col in shards:
        tm = mask_from(lambda d, s, x=x, y=y: d.line([(sx * s, sy * s), (((sx + x) / 2 + (x - sx) * 0.1) * s, ((sy + y) / 2 - 60) * s), (x * s, y * s)], fill=200, width=int(3 * s), joint='curve'), blur=2)
        img = img + tm[..., None] * np.array(col, np.float32) * 0.55
        img = add_glow(img, x, y, 170, col, 0.55, 2.0); img = add_glow(img, x, y, 36, col, 1.6, 2.0); img = add_glow(img, x, y, 9, (1, 1, 1), 2.4, 1.4)
    img = add_glow(img, sx, sy, 140, (1.0, 0.95, 0.85), 0.9, 2.0)
    # the black heart buried in the south (deep red under the map)
    img = add_glow(img, 1010, 820, 260, (0.6, 0.02, 0.08), 0.8, 1.8)
    finish(img, 'p3', vignette=0.62, grain=0.03)

def p4():
    img = grad(H, W, (0.01, 0.015, 0.05), (0.04, 0.03, 0.09))
    neb = fbm(W, H, 380, 7, seed=41, warp=200)
    img = img + (neb ** 2.6)[..., None] * np.array([0.18, 0.22, 0.5]) * 0.9
    img = img + (fbm(W, H, 240, 6, seed=42, warp=140) ** 3.2)[..., None] * np.array([0.45, 0.32, 0.2]) * 0.6
    img = stars(img, 1600, 43, bright=1.0)
    # a dragon traced by stars: points along a serpent curve + head, joined by thin gold lines
    n = 15
    sp = [(260 + 1060 * t + 90 * math.sin(t * 9), 600 - 360 * t + 120 * math.sin(t * 7 + 0.5)) for t in np.linspace(0, 1, n)]
    hx, hy = sp[-1]; head = [(hx + 70, hy - 30), (hx + 140, hy + 10), (hx + 60, hy + 40), (hx - 10, hy - 70), (hx + 30, hy - 120)]
    pts = sp + head
    def lines(d, s):
        for a, b in zip(sp, sp[1:]): d.line([(a[0] * s, a[1] * s), (b[0] * s, b[1] * s)], fill=170, width=int(2 * s))
        for a, b in ((sp[-1], head[0]), (head[0], head[1]), (head[1], head[2]), (head[2], sp[-1]), (sp[-1], head[3]), (head[3], head[4])):
            d.line([(a[0] * s, a[1] * s), (b[0] * s, b[1] * s)], fill=170, width=int(2 * s))
    lm = mask_from(lines, blur=0.6)
    img = img + blurf(np.repeat(lm[..., None], 3, 2), 5) * np.array([1.0, 0.8, 0.45]) * 0.9 + lm[..., None] * np.array([0.9, 0.78, 0.5])
    for i, (x, y) in enumerate(pts):
        big = i in (n - 1, n + 1)
        img = add_glow(img, x, y, 60 if big else 34, (1.0, 0.85, 0.55), 0.6, 2.0)
        img = add_glow(img, x, y, 10 if big else 6, (1.3, 1.25, 1.1), 2.2, 1.4)
    # a faint figure on a hill looking up (the one who connects the stars)
    hill = mask_from(lambda d, s: d.polygon([(0, 900 * s), (0, 820 * s), (500 * s, 760 * s), (900 * s, 790 * s), (1600 * s, 830 * s), (1600 * s, 900 * s)], fill=255), blur=1)
    img = comp(img, hill, (0.01, 0.012, 0.03))
    fig = mask_from(lambda d, s: (d.ellipse([(553 * s, 690 * s), (569 * s, 707 * s)], fill=255), d.polygon([(549 * s, 763 * s), (553 * s, 707 * s), (570 * s, 707 * s), (576 * s, 763 * s)], fill=255),
                                   d.line([(574 * s, 712 * s), (590 * s, 640 * s)], fill=255, width=int(3 * s))), blur=0.5)
    img = comp(img, fig, (0.01, 0.012, 0.03))
    img = add_glow(img, 590, 640, 40, (0.7, 0.8, 1.3), 1.0, 2.0)          # spear tip catches starlight
    finish(img, 'p4', vignette=0.55)

def p5():
    img = storm_sky(51, (0.07, 0.02, 0.03), (0.32, 0.08, 0.05), (800, 760), (0.9, 0.2, 0.08))
    # dead land: layered ridges, dead trees, cracks glowing red; the heart deep below centre
    for k, (base, amp, col) in enumerate(((560, 70, (0.12, 0.04, 0.05)), (640, 55, (0.07, 0.025, 0.03)), (720, 40, (0.03, 0.012, 0.015)))):
        rr = fbm(W, 1, 120 - k * 25, 6, seed=52 + k)[0]
        msk = np.zeros((H, W), np.float32)
        for x in range(W): msk[int(base + (rr[x] - 0.5) * amp * 2):, x] = 1
        img = comp(img, blurf(msk, 1.0), np.array(col) * (0.8 + 0.4 * fbm(W, H, 40, 4, seed=60 + k)[..., None]))
    r = np.random.default_rng(55)
    def trees(d, s):
        for _ in range(9):
            x = r.uniform(60, 1540); y = r.uniform(650, 760); h = r.uniform(70, 160)
            def br(x, y, a, l, w, dep):
                x2, y2 = x + math.cos(a) * l, y - math.sin(a) * l
                d.line([(x * s, y * s), (x2 * s, y2 * s)], fill=255, width=max(1, int(w * s)))
                if dep: [br(x2, y2, a + r.uniform(-0.7, 0.7), l * 0.68, w * 0.62, dep - 1) for _ in range(2)]
            br(x, y, math.pi / 2 + r.uniform(-0.2, 0.2), h * 0.45, 7, 4)
    img = comp(img, mask_from(trees), (0.02, 0.008, 0.01))
    def cracks(d, s):
        for _ in range(16):
            x, y = 800 + r.normal(0, 260), 860 + r.normal(0, 30); a = -math.pi / 2 + r.normal(0, 0.9); pts = [(x * s, y * s)]
            for j in range(int(r.integers(6, 14))):
                a += r.normal(0, 0.45); x += math.cos(a) * 22; y += math.sin(a) * 9; pts.append((x * s, y * s))
            d.line(pts, fill=255, width=int(2.2 * s))
    cm = mask_from(cracks)
    img = img + blurf(np.repeat(cm[..., None], 3, 2), 7) * np.array([1.2, 0.2, 0.05]) * 1.3 + cm[..., None] * np.array([1.3, 0.45, 0.15])
    img = add_glow(img, 800, 900, 420, (0.8, 0.05, 0.05), 0.6, 1.6)
    # ash in the air
    for _ in range(700):
        x, y = r.integers(0, W), r.integers(0, 760); img[y, x] += np.array([0.5, 0.35, 0.3]) * r.random() ** 2
    finish(img, 'p5', vignette=0.6, warm=(1.02, 0.98, 0.98))

def p6():
    img = grad(H, W, (0.03, 0.05, 0.12), (0.10, 0.11, 0.2))
    cl = fbm(W, H, 260, 6, seed=61, warp=120)
    img = img * (0.6 + 0.6 * cl[..., None]); img = stars(img, 500, 62, box=(0, 0, W, 520), bright=0.6)
    # moon
    img = add_glow(img, 1290, 170, 260, (0.5, 0.6, 0.9), 0.5, 1.8); mm = mask_from(lambda d, s: d.ellipse([(1240 * s, 120 * s), (1340 * s, 220 * s)], fill=255))
    img = comp(img, mm, np.array([0.95, 0.95, 1.0]) * (0.85 + 0.2 * fbm(W, H, 20, 3, seed=63)[..., None]))
    # ground + path to the right
    gr = mask_from(lambda d, s: d.polygon([(0, 690 * s), (700 * s, 660 * s), (1600 * s, 700 * s), (1600 * s, 900 * s), (0, 900 * s)], fill=255), blur=1)
    img = comp(img, gr, grad(H, W, (0.03, 0.035, 0.06), (0.015, 0.015, 0.03)))
    path = mask_from(lambda d, s: d.polygon([(470 * s, 700 * s), (520 * s, 700 * s), (1600 * s, 820 * s), (1600 * s, 900 * s), (1350 * s, 900 * s)], fill=255), blur=2)
    img = comp(img, path * 0.5, (0.08, 0.085, 0.12))
    # temple (left): steps, columns, pediment, rose window, open lit door
    def temple(d, s):
        P = lambda pts: [(x * s, y * s) for x, y in pts]
        d.polygon(P([(80, 700), (620, 700), (600, 680), (100, 680)]), fill=255)
        d.polygon(P([(110, 680), (590, 680), (590, 330), (110, 330)]), fill=255)
        d.polygon(P([(90, 335), (610, 335), (350, 190)]), fill=255)
        d.polygon(P([(320, 200), (380, 200), (360, 120), (340, 120)]), fill=255)   # bell tower spire
    tm = mask_from(temple)
    img = comp(img, tm, np.array([0.05, 0.055, 0.09]) * (0.8 + 0.4 * fbm(W, H, 30, 4, seed=64)[..., None]))
    # moonlit right edges of the columns
    for cx in (140, 210, 490, 560):
        cm = mask_from(lambda d, s, cx=cx: d.rectangle([((cx + 22) * s, 350 * s), ((cx + 26) * s, 680 * s)], fill=255))
        img = img + cm[..., None] * np.array([0.18, 0.22, 0.35])
    door = mask_from(lambda d, s: (d.rectangle([(305 * s, 520 * s), (395 * s, 680 * s)], fill=255), d.pieslice([(305 * s, 475 * s), (395 * s, 565 * s)], 180, 360, fill=255)))
    img = comp(img, door, (1.4, 0.95, 0.5))
    img = add_glow(img, 350, 600, 260, (1.0, 0.6, 0.25), 0.55, 2.0)
    # light spilling down the steps
    spill = mask_from(lambda d, s: d.polygon([(300 * s, 682 * s), (400 * s, 682 * s), (520 * s, 900 * s), (180 * s, 900 * s)], fill=255), blur=14)
    img = img + spill[..., None] * np.array([0.6, 0.38, 0.16]) * 0.6
    rw = mask_from(lambda d, s: d.ellipse([(325 * s, 260 * s), (375 * s, 310 * s)], fill=255))
    img = comp(img, rw, (0.9, 0.6, 0.35)); img = add_glow(img, 350, 285, 50, (1.0, 0.6, 0.3), 0.6, 2.0)
    # Justina in the doorway (small dark figure, arm reaching out)
    jm = mask_from(lambda d, s: (d.ellipse([(340 * s, 560 * s), (360 * s, 582 * s)], fill=255), d.polygon([(336 * s, 680 * s), (341 * s, 584 * s), (359 * s, 584 * s), (366 * s, 680 * s)], fill=255),
                                  d.line([(358 * s, 600 * s), (385 * s, 615 * s)], fill=255, width=int(5 * s))))
    img = comp(img, jm, (0.06, 0.04, 0.05))
    # Malachion walking away to the right on the path: hooded robe, staff with a small lantern, long shadow
    mx, my = 1060, 780
    mk = mask_from(lambda d, s: (d.polygon([((mx - 26) * s, my * s), ((mx - 18) * s, (my - 120) * s), ((mx - 4) * s, (my - 148) * s), ((mx + 12) * s, (my - 146) * s),
                                             ((mx + 20) * s, (my - 118) * s), ((mx + 34) * s, my * s)], fill=255),
                                  d.line([((mx + 34) * s, (my + 2) * s), ((mx + 44) * s, (my - 150) * s)], fill=255, width=int(4 * s))))
    img = comp(img, mk, (0.012, 0.012, 0.025))
    img = img + (mk - np.asarray(Image.fromarray((mk * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)), np.float32) / 255)[..., None] * np.array([0.25, 0.3, 0.5])
    img = add_glow(img, mx + 46, my - 152, 90, (0.6, 0.85, 1.2), 0.7, 2.0); img = add_glow(img, mx + 46, my - 152, 9, (1.3, 1.4, 1.5), 2.0, 1.4)
    sh = mask_from(lambda d, s: d.polygon([((mx - 24) * s, my * s), ((mx + 30) * s, my * s), ((mx - 230) * s, (my + 46) * s), ((mx - 270) * s, (my + 40) * s)], fill=255), blur=5)
    img = img * (1 - sh[..., None] * 0.55)
    finish(img, 'p6', vignette=0.58)

PANELS = dict(p1=p1, p2=p2, p3=p3, p4=p4, p5=p5, p6=p6)
if __name__ == '__main__':
    for k in (sys.argv[1:] or PANELS): PANELS[k]()
