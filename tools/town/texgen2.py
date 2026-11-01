"""Warm 'golden afternoon' ground textures (reference-style): large cream flagstones in a square grid and a smaller
square-set paving for the roads. Writes assets/town3d/tex/pave(.jpg/_n.jpg) and cobble(.jpg/_n.jpg).
Usage: python3 tools/town/texgen2.py"""
import numpy as np, os, sys
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import texgen as T
T.OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'town3d', 'tex')
N = T.N

def grid(n, k, seed, offset_rows=False, round_=10):
    r = np.random.default_rng(seed); yy, xx = np.mgrid[0:n, 0:n]; s = n / k
    row = (yy // s).astype(int); shift = np.where(offset_rows & (row % 2 == 1), s / 2, 0) if offset_rows else 0
    xs = (xx + shift) % n; col = (xs // s).astype(int)
    ex = np.minimum(xs % s, s - xs % s); ey = np.minimum(yy % s, s - yy % s)
    cx = np.maximum(round_ - ex, 0); cy = np.maximum(round_ - ey, 0)
    d = np.where((cx > 0) & (cy > 0), round_ - np.hypot(cx, cy), np.minimum(ex, ey))
    idm = (row % k) * k + (col % k)
    return idm, d, r.random((k * k, 4))

def flag_tex(name, k, seed, base, var, mortar_col, palette, mortar=5, bevel=18, nstr=2.6, offset=False):
    idm, dist, R = grid(N, k, seed, offset)
    nz = T.noise(N, 8, seed + 1); nz2 = T.noise(N, 48, seed + 2, oct=3); nz3 = T.noise(N, 4, seed + 3)
    d = dist + (nz2 - 0.5) * 7
    h = np.clip((d - mortar) / bevel, 0, 1); h = 1 - (1 - h) ** 2
    h = h * (0.9 + 0.2 * R[idm, 1] * nz)
    pal = np.array(palette, float); pick = (R[idm, 2] * len(pal)).astype(int)
    col = np.array(base, float)[None, None, :] * pal[pick] * (1 + (R[idm, 0][..., None] - 0.5) * var)
    col = col * (0.9 + 0.18 * nz[..., None]) * (0.95 + 0.1 * nz2[..., None]) * (0.96 + 0.08 * nz3[..., None])
    # worn, sun-bleached centres
    centre = np.clip((d - mortar) / (N / k * 0.35), 0, 1); col *= (0.95 + 0.07 * centre[..., None])
    m = d < mortar; col[m] = np.array(mortar_col, float) * (0.9 + 0.2 * nz[m][..., None])
    col = T.shade(h, col, k=1.6)
    edge = np.clip(1 - (d - mortar) / 4, 0, 1) * (~m); col *= (1 - 0.22 * edge[..., None])
    T.save(name, col, T.normal_from_height(ndimage.gaussian_filter(h, 1.4), nstr))

if __name__ == '__main__':
    warm = [[1, 1, 1], [1.015, 0.985, 0.965], [0.975, 0.975, 0.99], [1.02, 1.0, 0.95], [0.995, 0.97, 0.96], [1, 0.99, 0.98]]
    flag_tex('pave', 4, 21, [234, 216, 188], 0.09, [168, 146, 118], warm, mortar=4)
    flag_tex('cobble', 6, 22, [226, 208, 180], 0.1, [160, 138, 110], warm, mortar=3, bevel=14, offset=True)
    print('ok')
