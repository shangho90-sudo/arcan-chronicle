"""Tileable hand-painted style textures for the castle town (colour + normal), matching the Tripo models' palette."""
import numpy as np, os, sys
from PIL import Image
from scipy import ndimage
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tex')
N = 1024
rng = np.random.default_rng(7)

def noise(n, cells, seed, oct=4, pers=0.5):
    r = np.random.default_rng(seed); acc = np.zeros((n, n)); amp = 1; tot = 0
    for o in range(oct):
        c = cells * 2 ** o; g = r.random((c, c))
        z = ndimage.zoom(np.tile(g, (3, 3)), n / c, order=3)[n:2 * n, n:2 * n] if c < n else g[:n, :n]
        acc += z * amp; tot += amp; amp *= pers
    a = acc / tot; return (a - a.min()) / (a.max() - a.min() + 1e-9)

def normal_from_height(h, strength):
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength; gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.dstack([-gx, gy, np.ones_like(h)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)

def shade(h, base, light=(-0.6, 0.7), k=0.9):
    """painted lighting baked lightly into the albedo (top-left light), like the Tripo textures"""
    gx = np.roll(h, -1, 1) - np.roll(h, 1, 1); gy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
    l = (-gx * light[0] + gy * light[1]) * k
    return base * (1 + l[..., None])

def save(name, rgb, nrm=None):
    Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name + '.jpg'), quality=92, subsampling=0)
    if nrm is not None: Image.fromarray(nrm).save(os.path.join(OUT, name + '_n.jpg'), quality=94)

def blocks(n, rows, widths_fn, seed, mortar, bevel, round_=6, jitter_rows=False):
    """running-bond stones that tile; returns per-pixel id, distance-to-edge, stone random"""
    r = np.random.default_rng(seed)
    idm = np.zeros((n, n), np.int32); dist = np.zeros((n, n)); rnd = []
    yy, xx = np.mgrid[0:n, 0:n]
    rh = n / rows; sid = 0
    for row in range(rows):
        y0 = row * rh; y1 = (row + 1) * rh
        ws = widths_fn(r); xs = np.cumsum([0] + ws); xs = xs / xs[-1] * n
        shift = r.random() * n
        for k in range(len(ws)):
            a = (xs[k] + shift) % n; w = xs[k + 1] - xs[k]
            # pixel x within this stone (wrapping)
            dx = (xx - a) % n; inside = (dx < w) & (yy >= y0) & (yy < y1)
            ex = np.minimum(dx, w - dx); ey = np.minimum(yy - y0, y1 - yy)
            # rounded rect distance
            cx = np.maximum(round_ - ex, 0); cy = np.maximum(round_ - ey, 0)
            d = np.where((cx > 0) & (cy > 0), round_ - np.hypot(cx, cy), np.minimum(ex, ey))
            idm[inside] = sid; dist[inside] = d[inside]; rnd.append(r.random(4)); sid += 1
    return idm, dist, np.array(rnd)

def stone_tex(name, rows, widths_fn, seed, base, var, mortar_col, mortar=5, bevel=14, tint=None, nstr=3.0, crack=0.0):
    idm, dist, R = blocks(N, rows, widths_fn, seed, mortar, bevel)
    nz = noise(N, 8, seed + 1); nz2 = noise(N, 32, seed + 2, oct=3)
    chip = (nz2 - 0.5) * 6
    d = dist + chip
    h = np.clip((d - mortar) / bevel, 0, 1); h = 1 - (1 - h) ** 2          # bevelled stone height
    h = h * (0.85 + 0.3 * R[idm, 1][...] * nz)                          # uneven faces
    col = np.array(base, float)[None, None, :] * (1 + (R[idm, 0][..., None] - 0.5) * var)
    if tint is not None:
        t = R[idm, 2][..., None] < tint[1]; col = np.where(t, col * np.array(tint[0])[None, None, :], col)
    col = col * (0.88 + 0.24 * nz[..., None]) * (0.94 + 0.12 * nz2[..., None])
    m = d < mortar
    col[m] = np.array(mortar_col, float) * (0.9 + 0.2 * nz[m][..., None])
    col = shade(h, col, k=2.2)
    edge = np.clip(1 - (d - mortar) / 3, 0, 1) * (~m); col *= (1 - 0.25 * edge[..., None])  # dark rim
    save(name, col, normal_from_height(ndimage.gaussian_filter(h, 1.2), nstr))

def voronoi_tex(name, cells, seed, base, var, mortar_col, palette=None, nstr=4.0, size_jit=0.35):
    r = np.random.default_rng(seed); g = cells
    pts = (np.stack(np.meshgrid(np.arange(g), np.arange(g)), -1).reshape(-1, 2) + 0.5 + (r.random((g * g, 2)) - 0.5) * 0.8) / g * N
    yy, xx = np.mgrid[0:N, 0:N].astype(float)
    f1 = np.full((N, N), 1e9); f2 = np.full((N, N), 1e9); idm = np.zeros((N, N), np.int32)
    for i, (px, py) in enumerate(pts):
        dx = np.abs(xx - px); dx = np.minimum(dx, N - dx); dy = np.abs(yy - py); dy = np.minimum(dy, N - dy)
        d = np.hypot(dx, dy)
        closer = d < f1; f2 = np.where(closer, f1, np.minimum(f2, d)); idm = np.where(closer, i, idm); f1 = np.where(closer, d, f1)
    edge = (f2 - f1)                                                    # ~ distance to cell border *2
    cellsz = N / g; R = r.random((len(pts), 4))
    h = np.clip(edge / (cellsz * 0.45), 0, 1); h = np.sqrt(1 - (1 - h) ** 2)
    nz = noise(N, 8, seed + 3); nz2 = noise(N, 48, seed + 4, oct=2)
    col = np.array(base, float)[None, None, :] * (1 + (R[idm, 0][..., None] - 0.5) * var)
    if palette is not None:
        pick = (R[idm, 1] * len(palette)).astype(int); col = col * np.array(palette)[pick]
    col *= (0.86 + 0.28 * nz[..., None]) * (0.95 + 0.1 * nz2[..., None])
    m = edge < cellsz * 0.07
    col[m] = np.array(mortar_col, float) * (0.85 + 0.3 * nz[m][..., None])
    col = shade(h, col, k=2.6)
    save(name, col, normal_from_height(ndimage.gaussian_filter(h, 1.0), nstr))

def slate():
    rows = 16; r = np.random.default_rng(31); rh = N / rows
    yy, xx = np.mgrid[0:N, 0:N].astype(float)
    col = np.zeros((N, N, 3)); h = np.zeros((N, N))
    base = np.array([50, 62, 142.0]); nz = noise(N, 8, 33); nz2 = noise(N, 64, 34, oct=2)
    for row in range(rows):
        y0 = row * rh; cnt = 8; w = N / cnt; off = (w / 2) * (row % 2) + r.random() * 6
        ry = (yy - y0); inrow = (ry >= 0) & (ry < rh)
        dx = (xx - off) % w; k = ((xx - off) // w).astype(int) % cnt
        jit = r.random(cnt)
        # tile height profile: thin at top (under previous row), thick at bottom edge; rounded bottom corners
        t = ry / rh
        side = np.minimum(dx, w - dx)
        hh = 0.35 + 0.65 * t - np.clip(1 - side / 5, 0, 1) * 0.5
        bot = np.clip((rh - ry) / 4, 0, 1)
        hh = hh * (0.6 + 0.4 * bot)
        c = base[None, None, :] * (0.78 + 0.44 * jit[k][..., None]) * (0.9 + 0.2 * t[..., None])
        c *= (1 - 0.45 * (side < 2.5)[..., None])                              # gap between tiles
        c *= (1 - 0.35 * np.clip(1 - ry / (rh * 0.22), 0, 1)[..., None])       # shadow of the row above
        col = np.where(inrow[..., None], c, col); h = np.where(inrow, hh, h)
    col *= (0.88 + 0.24 * nz[..., None]) * (0.95 + 0.1 * nz2[..., None])
    col = shade(h, col, k=1.4)
    save('slate', col, normal_from_height(ndimage.gaussian_filter(h, 1.0), 4.0))

def wood(name, base, planks=0, seed=41, grain=1.0):
    nz = noise(N, 4, seed); fine = noise(N, 128, seed + 1, oct=2)
    yy, xx = np.mgrid[0:N, 0:N].astype(float)
    st = ndimage.gaussian_filter(noise(N, 24, seed + 5, oct=3), (40, 1.5), mode='wrap')   # streaks stretched along the board
    st = (st - st.min()) / (st.max() - st.min() + 1e-9)
    g = np.sin(xx / N * 2 * np.pi * 14 + st * 14 + nz * 3) * 0.5 + 0.5      # grain along y (vertical)
    fine = ndimage.gaussian_filter(fine, (6, 0.6), mode='wrap'); fine = (fine - fine.min()) / (fine.max() - fine.min() + 1e-9)
    col = np.array(base, float)[None, None, :] * (0.78 + 0.22 * g[..., None] * grain) * (0.85 + 0.3 * nz[..., None]) * (0.93 + 0.14 * fine[..., None])
    h = g * 0.3
    if planks:
        w = N / planks; e = np.minimum(xx % w, w - xx % w); m = e < 3
        col[m] *= 0.45; h = np.where(m, 0, h + 0.5)
        r = np.random.default_rng(seed + 2).random(planks); col *= (0.88 + 0.24 * r[(xx // w).astype(int) % planks])[..., None]
    save(name, shade(h, col, k=0.8), normal_from_height(ndimage.gaussian_filter(h, 1.0), 2.0))

def plaster():
    nz = noise(N, 6, 51); nz2 = noise(N, 40, 52, oct=3)
    col = np.array([228, 216, 190.0])[None, None, :] * (0.9 + 0.12 * nz[..., None]) * (0.96 + 0.08 * nz2[..., None])
    save('plaster', col, normal_from_height(nz2 * 0.6, 1.0))

def grass():
    nz = noise(N, 6, 61); nz2 = noise(N, 24, 62); fine = noise(N, 160, 63, oct=2)
    a = np.array([78, 118, 58.0]); b = np.array([112, 140, 70.0]); c = np.array([96, 92, 60.0])
    col = a[None, None] * (1 - nz2[..., None]) + b[None, None] * nz2[..., None]
    col = col * (1 - 0.35 * (nz[..., None] > 0.68)) + c * 0.35 * (nz[..., None] > 0.68)
    col *= (0.82 + 0.36 * fine[..., None])
    save('grass', col, normal_from_height(fine * 0.5, 1.5))

def window():
    n = 256; yy, xx = np.mgrid[0:n, 0:n].astype(float)
    glow = np.exp(-(((xx - 128) / 120) ** 2 + ((yy - 150) / 150) ** 2))
    col = np.array([255, 196, 92.0]) * (0.55 + 0.6 * glow[..., None])
    lead = (np.abs(((xx + yy) % 64) - 32) < 3) | (np.abs(((xx - yy) % 64) - 32) < 3)
    col[lead] = [70, 50, 30]
    frame = (xx < 14) | (xx > n - 15) | (yy < 14) | (yy > n - 15) | (np.abs(xx - 128) < 7) | (np.abs(yy - 120) < 7)
    col[frame] = [88, 56, 32]
    Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'window.jpg'), quality=92)

def awning(name, c1, c2):
    n = 512; yy, xx = np.mgrid[0:n, 0:n].astype(float); stripes = ((xx // 64) % 2) == 0
    nz = noise(n, 8, 71)[:n, :n] if n == N else noise(n, 8, 71)
    col = np.where(stripes[..., None], np.array(c1, float), np.array(c2, float)) * (0.9 + 0.15 * nz[..., None])
    col *= (0.8 + 0.2 * (yy / n))[..., None]
    a = np.full((n, n), 255, np.uint8)
    # scalloped bottom edge (alpha) on the last 1/8
    sc = n - 40 + 26 * np.sqrt(np.clip(1 - ((xx % 64) - 32) ** 2 / 32 ** 2, 0, 1))
    a[yy > sc] = 0
    img = np.dstack([np.clip(col, 0, 255).astype(np.uint8), a])
    Image.fromarray(img, 'RGBA').save(os.path.join(OUT, name + '.png'))

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    # courtyard flagstones: warm beige like the fountain plaza
    if len(sys.argv) > 1 and sys.argv[1] == 'cobble':
        voronoi_tex('cobble', 22, 13, [182, 170, 150], 0.22, [118, 108, 94], palette=[[1, 1, 1], [1.05, 0.98, 0.9], [0.92, 0.95, 1.0]]); sys.exit()
    if len(sys.argv) > 1 and sys.argv[1] == 'wood':
        slate(); wood('wood', [112, 74, 44]); wood('planks', [124, 82, 48], planks=6, seed=43); wood('bluewood', [64, 86, 160], planks=5, seed=45, grain=0.6); sys.exit()
    stone_tex('pave', 8, lambda r: list(0.6 + r.random(5)), 11, [196, 182, 156], 0.22, [92, 86, 76], mortar=4, bevel=16, tint=([0.92, 0.95, 1.0], 0.3))
    voronoi_tex('cobble', 22, 13, [182, 170, 150], 0.22, [118, 108, 94], palette=[[1, 1, 1], [1.05, 0.98, 0.9], [0.92, 0.95, 1.0]])
    stone_tex('wallstone', 10, lambda r: list(0.7 + r.random(4) * 0.8), 21, [188, 176, 152], 0.2, [110, 102, 90], mortar=4, bevel=12)
    stone_tex('basestone', 6, lambda r: list(0.8 + r.random(3) * 0.6), 23, [206, 192, 162], 0.16, [128, 118, 100], mortar=4, bevel=18)
    slate(); plaster(); grass(); window()
    wood('wood', [112, 74, 44]); wood('planks', [124, 82, 48], planks=6, seed=43); wood('bluewood', [64, 86, 160], planks=5, seed=45, grain=0.6)
    awning('awning_red', [196, 52, 50], [238, 226, 200]); awning('awning_purple', [120, 70, 150], [236, 222, 236]); awning('awning_green', [62, 120, 74], [232, 226, 196]); awning('awning_blue', [56, 72, 150], [236, 226, 200])
    print(sorted(os.listdir(OUT)))
