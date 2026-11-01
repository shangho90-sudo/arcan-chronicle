"""Deterministic vegetation layout for 속삭이는 숲 (forest zone) -> rewrites the zone's props in assets/data/zones.json.

Rules (from the art brief):
  * dense forest along the zone edges and in a few groves, open space on the paths, monster meadows, portals, spawns
  * big trees get shrubs and small plants clustered around them; rocks get moss/flowers (flowers are props 'flowers')
  * flowers / shrubs are decoration only (no collision); trees, rocks, stumps keep their collision footprints
  * same seed -> same layout (re-running gives identical output)
Kept as they were: boss-arena rocks, ruins, signposts, mushrooms.
Usage: python3 tools/forest/layout.py [--write]"""
import json, math, os, random, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
ZPATH = os.path.join(ROOT, 'assets', 'data', 'zones.json')
SEED = 20261101

zones = json.load(open(ZPATH)); Z = next(z for z in zones['zones'] if z['id'] == 'forest')
x0, z0, x1, z1 = Z['bounds']
rnd = random.Random(SEED)

paths = [(list(zip(p['pos'][0::2], p['pos'][1::2])), p['width']) for p in Z['patches'] if p['shape'] == 'path']
discs = [(p['pos'][0], p['pos'][1], p['radius'], p['tex']) for p in Z['patches'] if p['shape'] == 'disc']

def seg_dist(px, pz, a, b):
    ax, az = a; bx, bz = b; dx, dz = bx - ax, bz - az; L = dx * dx + dz * dz
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L))
    return math.hypot(px - ax - t * dx, pz - az - t * dz)

def path_clear(x, z):
    """distance from the path edge (negative = on the path)"""
    best = 1e9
    for pts, w in paths:
        for a, b in zip(pts, pts[1:]): best = min(best, seg_dist(x, z, a, b) - w / 2 * 1.15)
    return best

keepouts = []
for m in Z['monsters']: keepouts.append((m['pos'][0], m['pos'][1], m['radius'] + 1.2))
for p in Z['portals']: keepouts.append((p['pos'][0], p['pos'][1], 5.0))
for s in Z['spawns']: keepouts.append((s['pos'][0], s['pos'][1], 4.0))
B = Z['boss']; keepouts.append((B['gate'][0], B['gate'][1], 4.5)); keepouts.append((B['center'][0], B['center'][1], B['radius'] + 3.5))
for d in discs: keepouts.append((d[0], d[1], d[2] - 1.0))
ramps = [h['rect'] for h in Z['heights'] if h['kind'] == 'ramp']
plat = [h['rect'] for h in Z['heights'] if h['kind'] == 'platform']
kept = [p for p in Z['props'] if (p['type'] == 'rock' and p.get('variant') == 'boss') or p['type'] in ('ruin', 'signpost', 'mushroom')]

def in_rect(x, z, r, m=0): return r[0] - m <= x <= r[2] + m and r[1] - m <= z <= r[3] + m

def free(x, z, need):
    """clearance test for anything with a footprint"""
    if not (x0 + 0.8 < x < x1 - 0.8 and z0 + 0.8 < z < z1 - 0.8): return False
    if path_clear(x, z) < need: return False
    for (cx, cz, r) in keepouts:
        if math.hypot(x - cx, z - cz) < r + need * 0.5: return False
    for r in ramps:
        if in_rect(x, z, r, 2.0 + need * 0.5): return False
    for p in plat:   # platform edge (cliff) band: keep 1.6 m off the wall so nothing floats half over it
        inside = in_rect(x, z, p, 0.0); near = in_rect(x, z, p, 1.6) and not in_rect(x, z, p, -1.6)
        if near: return False
    for k in kept:
        if math.hypot(x - k['pos'][0], z - k['pos'][1]) < 1.6 + need * 0.3: return False
    return True

def vnoise(x, z, s, seed):
    """cheap smooth value noise for grove placement"""
    def h(i, j): return random.Random(i * 73856093 ^ j * 19349663 ^ seed).random()
    X, Zz = x / s, z / s; i, j = math.floor(X), math.floor(Zz); fx, fz = X - i, Zz - j
    ux, uz = fx * fx * (3 - 2 * fx), fz * fz * (3 - 2 * fz)
    a, b, c, d = h(i, j), h(i + 1, j), h(i, j + 1), h(i + 1, j + 1)
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz

def density(x, z):
    edge = min(x - x0, x1 - x, z - z0, z1 - z)
    e = max(0.0, 1 - edge / 9.0)                                  # dense rim
    g = max(0.0, (vnoise(x, z, 11, 7) - 0.52) * 2.6)              # interior groves
    pc = path_clear(x, z); near_path = 0.22 if 3.5 < pc < 7.5 else 0  # a few trees lining the path, canopies kept off it
    return min(1.0, e * 1.1 + g + near_path)

# ---------------------------------------------------------------- trees (Poisson-ish with density acceptance)
trees = []
for _ in range(26000):
    x, z = rnd.uniform(x0 + 1, x1 - 1), rnd.uniform(z0 + 1, z1 - 1)
    if rnd.random() > density(x, z): continue
    if not free(x, z, 3.2): continue
    s = rnd.uniform(0.85, 1.25)
    if any(math.hypot(x - t['pos'][0], z - t['pos'][1]) < 3.3 * (s + t['scale']) / 2 for t in trees): continue
    roll = rnd.random()
    model = 'tree_a' if roll < 0.34 else 'tree_c' if roll < 0.58 else 'tree_b' if roll < 0.85 else 'tree_d'
    trees.append({'type': 'pine' if model == 'tree_b' else 'tree', 'model': model, 'pos': [round(x, 2), round(z, 2)], 'rot': round(rnd.uniform(0, 360), 1), 'scale': round(s, 2), 'variant': '', 'w': 0.0, 'd': 0.0})

# ---------------------------------------------------------------- shrubs clustered round trees and along grove edges (decoration)
shrubs = []
def add_shrub(x, z, s):
    if not free(x, z, 0.6): return
    if any(math.hypot(x - t['pos'][0], z - t['pos'][1]) < 0.9 for t in trees): return
    if any(math.hypot(x - b['pos'][0], z - b['pos'][1]) < 1.2 for b in shrubs): return
    shrubs.append({'type': 'shrub', 'model': 'bush_a' if rnd.random() < 0.55 else 'bush_b', 'pos': [round(x, 2), round(z, 2)], 'rot': round(rnd.uniform(0, 360), 1), 'scale': round(s, 2), 'variant': '', 'w': 0.0, 'd': 0.0})
for t in trees:
    for k in range(rnd.randint(1, 3)):
        a = rnd.uniform(0, math.tau); r = rnd.uniform(1.3, 2.6) * t['scale']
        add_shrub(t['pos'][0] + math.cos(a) * r, t['pos'][1] + math.sin(a) * r, rnd.uniform(0.7, 1.15))

# a few shrubs on the path shoulders (decoration, walk-through), in irregular groups
for pts, w in paths:
    for a, b in zip(pts, pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = int(L / 4.5)
        for i in range(n):
            if rnd.random() < 0.5: continue
            t = (i + rnd.random()) / max(1, n); px, pz = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            nx, nz = -(b[1] - a[1]) / L, (b[0] - a[0]) / L; side = 1 if rnd.random() < 0.5 else -1; off = w / 2 + rnd.uniform(1.6, 3.4)
            add_shrub(px + nx * off * side, pz + nz * off * side, rnd.uniform(0.6, 0.95))

# ---------------------------------------------------------------- rocks (collision) and stumps
rocks = []
for _ in range(4000):
    if len(rocks) >= 16: break
    x, z = rnd.uniform(x0 + 2, x1 - 2), rnd.uniform(z0 + 2, z1 - 2)
    pc = path_clear(x, z)
    if not (1.5 < pc < 9) or not free(x, z, 1.6) or rnd.random() > 0.25 + density(x, z) * 0.5: continue
    if any(math.hypot(x - q['pos'][0], z - q['pos'][1]) < 2.4 for q in trees + rocks): continue
    big = rnd.random() < 0.55
    rocks.append({'type': 'rock', 'model': 'rock_a' if big else 'rock_b', 'pos': [round(x, 2), round(z, 2)], 'rot': round(rnd.uniform(0, 360), 1), 'scale': round(rnd.uniform(0.85, 1.2) if big else rnd.uniform(0.7, 1.0), 2), 'variant': '', 'w': 0.0, 'd': 0.0})
stumps = []
for _ in range(3000):
    if len(stumps) >= 6: break
    x, z = rnd.uniform(x0 + 2, x1 - 2), rnd.uniform(z0 + 2, z1 - 2)
    if not free(x, z, 1.4) or density(x, z) < 0.3: continue
    if any(math.hypot(x - q['pos'][0], z - q['pos'][1]) < 2.2 for q in trees + rocks + stumps): continue
    stumps.append({'type': 'stump', 'model': 'stump', 'pos': [round(x, 2), round(z, 2)], 'rot': round(rnd.uniform(0, 360), 1), 'scale': round(rnd.uniform(0.8, 1.05), 2), 'variant': '', 'w': 0.0, 'd': 0.0})

# ---------------------------------------------------------------- flower clusters: path edges (irregular), round rocks, under trees; white/yellow first
flowers = []
def add_flowers(x, z, kind, r):
    if path_clear(x, z) < 0.25: return
    if not (x0 + 1 < x < x1 - 1 and z0 + 1 < z < z1 - 1): return
    if any(in_rect(x, z, p, 0.4) for p in plat): return
    flowers.append({'type': 'flowers', 'pos': [round(x, 2), round(z, 2)], 'rot': 0.0, 'scale': round(r, 2), 'variant': kind, 'w': 0.0, 'd': 0.0})
kinds = ['white'] * 5 + ['yellow'] * 3 + ['mixed'] * 2
for pts, w in paths:
    for a, b in zip(pts, pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = int(L / 1.8)
        for i in range(n):
            if rnd.random() < 0.3: continue                          # gaps: clusters, not a hedge
            t = (i + rnd.random()) / max(1, n); px, pz = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            nx, nz = -(b[1] - a[1]) / L, (b[0] - a[0]) / L; side = 1 if rnd.random() < 0.5 else -1
            off = w / 2 + rnd.uniform(0.5, 1.8)
            add_flowers(px + nx * off * side, pz + nz * off * side, rnd.choice(kinds), rnd.uniform(0.9, 1.6))
for q in rocks:
    for k in range(rnd.randint(1, 2)):
        a = rnd.uniform(0, math.tau); r = rnd.uniform(0.9, 1.4) * q['scale']
        add_flowers(q['pos'][0] + math.cos(a) * r, q['pos'][1] + math.sin(a) * r, rnd.choice(['white', 'yellow', 'white']), rnd.uniform(0.7, 1.1))
for d in discs:
    if d[3] != 'grass_flowers': continue
    for k in range(14):
        a = rnd.uniform(0, math.tau); r = d[2] * math.sqrt(rnd.random())
        add_flowers(d[0] + math.cos(a) * r, d[1] + math.sin(a) * r, rnd.choice(kinds), rnd.uniform(1.0, 1.8))

props = kept + trees + shrubs + rocks + stumps + flowers
print(f'trees {len(trees)} (a {sum(t["model"] == "tree_a" for t in trees)}, b {sum(t["model"] == "tree_b" for t in trees)}, c {sum(t["model"] == "tree_c" for t in trees)}, d {sum(t["model"] == "tree_d" for t in trees)}), '
      f'shrubs {len(shrubs)}, rocks {len(rocks)}, stumps {len(stumps)}, flower clusters {len(flowers)}, kept {len(kept)}')
if '--write' in sys.argv:
    Z['props'] = props; Z['nature'] = {'style': 'storybook_forest', 'seed': SEED}
    raw = json.dumps(zones, ensure_ascii=False, indent=1)
    open(ZPATH, 'w').write(raw + ('\n' if open(ZPATH).read().endswith('\n') else ''))
    print('wrote', ZPATH)
