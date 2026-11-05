"""Deterministic vegetation layout for 속삭이는 숲 (forest zone) -> rewrites the zone's props in assets/data/zones.json.

Rules (from the art brief):
  * dense forest along the zone edges and in a few groves, open space on the paths, monster meadows, portals, spawns
  * big trees get shrubs and small plants clustered around them; rocks get moss/flowers (flowers are props 'flowers')
  * flowers / shrubs are decoration only (no collision); trees, rocks, stumps keep their collision footprints
  * same seed -> same layout (re-running gives identical output)
Kept as they were: boss-arena rocks, ruins, signposts, mushrooms.
2026-11-04 (Blender asset set): cluster placement - outer forest dense (big trees), path kept open, mid area = tree +
rock + shrub groups, roadside = flowers + grass + small stones; models are the Blender ones (tools/blender/assets.py).
Small decorative stones are type 'stone' (no collision).
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
    e = max(0.0, 1 - edge / 12.0)                                 # dense outer forest
    g = max(0.0, (vnoise(x, z, 10, 7) - 0.46) * 2.8)              # interior groves (clusters)
    pc = path_clear(x, z); near_path = 0.4 if 3.0 < pc < 8.0 else 0  # trees lining the path, canopies kept off it
    return min(1.0, e * 1.25 + g + near_path)

# ---------------------------------------------------------------- trees (Poisson-ish with density acceptance)
trees = []
for _ in range(26000):
    x, z = rnd.uniform(x0 + 1, x1 - 1), rnd.uniform(z0 + 1, z1 - 1)
    if rnd.random() > density(x, z): continue
    if not free(x, z, 3.2): continue
    s = rnd.uniform(0.85, 1.25)
    if any(math.hypot(x - t['pos'][0], z - t['pos'][1]) < 2.9 * (s + t['scale']) / 2 for t in trees): continue
    roll = rnd.random(); rim = min(x - x0, x1 - x, z - z0, z1 - z) < 8
    tall = roll < (0.45 if rim else 0.2)                              # the outer forest leans to tall forest trees
    roll = rnd.random()
    model = 'tree_forest_tall' if tall else 'tree_broad_a' if roll < 0.38 else 'tree_broad_b' if roll < 0.68 else 'tree_forest_round'
    trees.append({'type': 'pine' if tall else 'tree', 'model': model, 'pos': [round(x, 2), round(z, 2)], 'rot': round(rnd.uniform(0, 360), 1), 'scale': round(s, 2), 'variant': '', 'w': 0.0, 'd': 0.0})

# ---------------------------------------------------------------- shrubs clustered round trees and along grove edges (decoration)
shrubs = []
def add_shrub(x, z, s):
    if not free(x, z, 0.6): return
    if any(math.hypot(x - t['pos'][0], z - t['pos'][1]) < 0.9 for t in trees): return
    if any(math.hypot(x - b['pos'][0], z - b['pos'][1]) < 1.2 for b in shrubs): return
    shrubs.append({'type': 'shrub', 'model': 'shrub_a' if rnd.random() < 0.55 else 'shrub_b', 'pos': [round(x, 2), round(z, 2)], 'rot': round(rnd.uniform(0, 360), 1), 'scale': round(s, 2), 'variant': '', 'w': 0.0, 'd': 0.0})
for t in trees:
    for k in range(rnd.randint(2, 4)):
        a = rnd.uniform(0, math.tau); r = rnd.uniform(1.3, 2.6) * t['scale']
        add_shrub(t['pos'][0] + math.cos(a) * r, t['pos'][1] + math.sin(a) * r, rnd.uniform(0.7, 1.15))

# a few shrubs on the path shoulders (decoration, walk-through), in irregular groups
for pts, w in paths:
    for a, b in zip(pts, pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = int(L / 4.5)
        for i in range(n):
            if rnd.random() < 0.3: continue
            t = (i + rnd.random()) / max(1, n); px, pz = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            nx, nz = -(b[1] - a[1]) / L, (b[0] - a[0]) / L; side = 1 if rnd.random() < 0.5 else -1; off = w / 2 + rnd.uniform(1.4, 3.2)
            add_shrub(px + nx * off * side, pz + nz * off * side, rnd.uniform(0.6, 0.95))

# ---------------------------------------------------------------- rocks (collision) and stumps
rocks = []; stones = []
for _ in range(9000):
    if len(rocks) >= 42: break
    x, z = rnd.uniform(x0 + 2, x1 - 2), rnd.uniform(z0 + 2, z1 - 2)
    pc = path_clear(x, z)
    if not (1.5 < pc < 9) or not free(x, z, 1.6) or rnd.random() > 0.25 + density(x, z) * 0.5: continue
    if any(math.hypot(x - q['pos'][0], z - q['pos'][1]) < 2.4 for q in trees + rocks): continue
    roll = rnd.random()
    if roll < 0.18 and pc > 3.0 and free(x, z, 2.4):
        model, sc = 'rock_large', rnd.uniform(1.6, 2.0)
    else:
        model = 'rock_moss' if roll < 0.45 else 'rock_medium' if roll < 0.75 else 'rock_roadside'; sc = rnd.uniform(0.8, 1.2)
    rocks.append({'type': 'rock', 'model': model, 'pos': [round(x, 2), round(z, 2)], 'rot': round(rnd.uniform(0, 360), 1), 'scale': round(sc, 2), 'variant': '', 'w': 0.0, 'd': 0.0})
    for k in range(rnd.randint(1, 3)):                                # small stones around it (decoration, walk-through)
        a = rnd.uniform(0, math.tau); r = rnd.uniform(0.9, 1.6) * sc
        sx, sz = x + math.cos(a) * r, z + math.sin(a) * r
        if path_clear(sx, sz) > 0.3 and x0 + 1 < sx < x1 - 1 and z0 + 1 < sz < z1 - 1:
            stones.append({'type': 'stone', 'model': 'rock_small', 'pos': [round(sx, 2), round(sz, 2)], 'rot': round(rnd.uniform(0, 360), 1), 'scale': round(rnd.uniform(0.7, 1.3), 2), 'variant': '', 'w': 0.0, 'd': 0.0})
# roadside stones in little groups
for pts, w in paths:
    for a, b in zip(pts, pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        for i in range(int(L / 5)):
            if rnd.random() < 0.45: continue
            t = rnd.random(); px, pz = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            nx, nz = -(b[1] - a[1]) / L, (b[0] - a[0]) / L; side = rnd.choice((-1, 1)); off = w / 2 + rnd.uniform(0.2, 1.0)
            for k in range(rnd.randint(1, 3)):
                stones.append({'type': 'stone', 'model': 'rock_small', 'pos': [round(px + nx * off * side + rnd.uniform(-0.5, 0.5), 2), round(pz + nz * off * side + rnd.uniform(-0.5, 0.5), 2)], 'rot': round(rnd.uniform(0, 360), 1), 'scale': round(rnd.uniform(0.6, 1.1), 2), 'variant': '', 'w': 0.0, 'd': 0.0})
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
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = int(L / 1.1)
        for i in range(n):
            if rnd.random() < 0.25: continue                         # gaps: clusters, not a hedge
            t = (i + rnd.random()) / max(1, n); px, pz = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            nx, nz = -(b[1] - a[1]) / L, (b[0] - a[0]) / L; side = 1 if rnd.random() < 0.5 else -1
            off = w / 2 + rnd.uniform(0.5, 1.8)
            add_flowers(px + nx * off * side, pz + nz * off * side, rnd.choice(kinds), rnd.uniform(0.9, 1.6))
for q in rocks:
    for k in range(rnd.randint(2, 3)):
        a = rnd.uniform(0, math.tau); r = rnd.uniform(0.9, 1.4) * q['scale']
        add_flowers(q['pos'][0] + math.cos(a) * r, q['pos'][1] + math.sin(a) * r, rnd.choice(['white', 'yellow', 'white']), rnd.uniform(0.7, 1.1))
for d in discs:
    if d[3] != 'grass_flowers': continue
    for k in range(14):
        a = rnd.uniform(0, math.tau); r = d[2] * math.sqrt(rnd.random())
        add_flowers(d[0] + math.cos(a) * r, d[1] + math.sin(a) * r, rnd.choice(kinds), rnd.uniform(1.0, 1.8))

for t in trees:                                                      # flowers at the sunny edge of tree groups
    if rnd.random() < 0.35:
        a = rnd.uniform(0, math.tau); r = rnd.uniform(2.6, 3.6) * t['scale']
        add_flowers(t['pos'][0] + math.cos(a) * r, t['pos'][1] + math.sin(a) * r, rnd.choice(kinds), rnd.uniform(0.8, 1.3))

# ---------------------------------------------------------------- mushroom boss grove (raised platform): dense violet edge, clear centre
# 2026-11-06: violet trees + mushroom trees + mushroom clusters crowd the platform rim outside the rock ring; the ring
# rocks become mossy violet stones; the old collision mushrooms inside the arena are removed (centre = combat space);
# small glowing mushrooms / flowers sit between the ring rocks. Cluster rule: 1 large + 2-4 medium + 5-15 small.
AR = random.Random(SEED + 7)
PL = plat[0]; ACX, ACZ = B['center']; AGX, AGZ = B['gate']
def on_plat(x, z, m=0): return in_rect(x, z, PL, -m)
def arena_r(x, z): return math.hypot(x - ACX, z - ACZ)
def corridor(x, z, m=0): return (PL[0] - 1 <= x <= AGX + 2 + m and AGZ - 3.2 - m <= z <= AGZ + 3.6 + m) or math.hypot(x - AGX, z - AGZ) < 3.6 + m
ring = [p for p in kept if p['type'] == 'rock' and p.get('variant') == 'boss']
for i, p in enumerate(ring): p['model'] = 'rock_magic_low' if i % 3 == 1 else 'rock_magic'
kept = [p for p in kept if not (p['type'] == 'mushroom' and on_plat(*p['pos']) and arena_r(*p['pos']) < B['radius'])]
grove = []
def gp(t, model, x, z, sc, rot=None, var=''):
    grove.append({'type': t, 'model': model, 'pos': [round(x, 2), round(z, 2)], 'rot': round(AR.uniform(0, 360) if rot is None else rot, 1), 'scale': round(sc, 2), 'variant': var, 'w': 0.0, 'd': 0.0})
def solid_clear(x, z, need):
    """collision props: on the platform, off its wall, outside the ring, off the entry corridor, apart from each other"""
    if not on_plat(x, z, 1.4) or arena_r(x, z) < B['radius'] + 2.0 or corridor(x, z, need): return False
    for q in ring + [g for g in grove if g['type'] in ('tree', 'mushtree', 'rock')]:
        if math.hypot(x - q['pos'][0], z - q['pos'][1]) < need + 1.0: return False
    return True
def deco_ok(x, z):
    return on_plat(x, z, 0.5) and not corridor(x, z) and arena_r(x, z) > B['radius'] - 1.2
# big pieces first (trees / mushroom trees) on the outer belt, then clusters around each
for _ in range(4000):
    x, z = AR.uniform(PL[0], PL[2]), AR.uniform(PL[1], PL[3])
    if not solid_clear(x, z, 2.2): continue
    big = [g for g in grove if g['type'] in ('tree', 'mushtree')]
    if len(big) >= 16: break
    roll = AR.random()
    if roll < 0.28 and sum(g['type'] == 'mushtree' for g in grove) < 5: gp('mushtree', 'mush_tree', x, z, AR.uniform(0.85, 1.15))
    else: gp('tree', 'tree_violet' if roll < 0.68 else 'tree_violet_round', x, z, AR.uniform(0.85, 1.2))
big = [g for g in grove if g['type'] in ('tree', 'mushtree')]
for g in big:                                                       # cluster: 2-4 medium + 5-12 small around each big piece
    bx, bz = g['pos']
    for k in range(AR.randint(2, 4)):
        a = AR.uniform(0, math.tau); r = AR.uniform(1.0, 2.2); x, z = bx + math.cos(a) * r, bz + math.sin(a) * r
        if not deco_ok(x, z): continue
        roll = AR.random()
        if roll < 0.35: gp('mushdecor', 'mush_cluster', x, z, AR.uniform(0.75, 1.0))
        elif roll < 0.6: gp('mushdecor', 'mush_orange', x, z, AR.uniform(0.7, 1.0))
        else: gp('shrub', 'shrub_b' if AR.random() < 0.5 else 'shrub_a', x, z, AR.uniform(0.7, 1.05))
    for k in range(AR.randint(5, 12)):
        a = AR.uniform(0, math.tau); r = AR.uniform(0.8, 3.0); x, z = bx + math.cos(a) * r, bz + math.sin(a) * r
        if not deco_ok(x, z): continue
        roll = AR.random()
        if roll < 0.3: gp('mushdecor', 'mush_small_purple', x, z, AR.uniform(0.8, 1.3))
        elif roll < 0.48: gp('mushdecor', 'mush_small_blue', x, z, AR.uniform(0.8, 1.3))
        elif roll < 0.66: gp('mushdecor', 'mush_glow_purple' if AR.random() < 0.6 else 'mush_glow_blue', x, z, AR.uniform(0.8, 1.3))
        elif roll < 0.84: gp('flowers', None, x, z, AR.uniform(0.8, 1.3), 0.0, AR.choice(['mixed', 'white', 'mixed']))
        else: gp('stone', 'rock_small', x, z, AR.uniform(0.7, 1.2))
# between the ring rocks: glowing mushrooms, flowers and small stones (walk-through decoration), gate sector left open
for p in ring:
    a0 = math.atan2(p['pos'][1] - ACZ, p['pos'][0] - ACX)
    for k in range(AR.randint(3, 6)):
        a = a0 + AR.uniform(-0.2, 0.2); r = B['radius'] + 1 + AR.uniform(-0.9, 1.4); x, z = ACX + math.cos(a) * r, ACZ + math.sin(a) * r
        if not deco_ok(x, z) or math.hypot(x - p['pos'][0], z - p['pos'][1]) < 0.9: continue
        roll = AR.random()
        if roll < 0.4: gp('mushdecor', 'mush_glow_purple' if AR.random() < 0.65 else 'mush_glow_blue', x, z, AR.uniform(0.8, 1.2))
        elif roll < 0.62: gp('mushdecor', 'mush_small_purple', x, z, AR.uniform(0.7, 1.1))
        elif roll < 0.85: gp('flowers', None, x, z, AR.uniform(0.7, 1.1), 0.0, AR.choice(['mixed', 'white']))
        else: gp('stone', 'rock_small', x, z, AR.uniform(0.6, 1.0))
# backdrop: the platform runs to the zone edge (N / E), so a dense violet + green tree wall stands just outside the
# bounds (unreachable, decoration only) instead of the bare ground plane
for _ in range(2500):
    x, z = AR.uniform(PL[0] - 4, x1 + 9), AR.uniform(PL[1] - 4, z1 + 9)
    if not (x > x1 + 0.8 or z > z1 + 0.8): continue
    if any(math.hypot(x - g['pos'][0], z - g['pos'][1]) < 2.6 for g in grove if g['type'] in ('tree', 'pine', 'mushtree')): continue
    roll = AR.random()
    if roll < 0.45: gp('tree', 'tree_violet' if roll < 0.3 else 'tree_violet_round', x, z, AR.uniform(0.95, 1.3))
    elif roll < 0.6: gp('mushtree', 'mush_tree', x, z, AR.uniform(0.9, 1.25))
    else: gp('pine' if roll < 0.8 else 'tree', 'tree_forest_tall' if roll < 0.8 else 'tree_broad_b', x, z, AR.uniform(0.95, 1.25))
for g in grove:
    if g['model'] is None: del g['model']
# everything the general pass put on the platform is replaced by the grove
def off_plat(q): return not in_rect(q['pos'][0], q['pos'][1], PL, 0.3)
trees, shrubs, rocks, stones, stumps, flowers = [list(filter(off_plat, L)) for L in (trees, shrubs, rocks, stones, stumps, flowers)]
from collections import Counter as _C
print('arena grove', dict(_C(g.get('model', g['type']) for g in grove)))

props = kept + trees + shrubs + rocks + stones + stumps + flowers + grove
from collections import Counter
print('trees', len(trees), dict(Counter(t['model'] for t in trees)), 'rocks', dict(Counter(r['model'] for r in rocks)), 'stones', len(stones),
      f'shrubs {len(shrubs)}, stumps {len(stumps)}, flower clusters {len(flowers)}, kept {len(kept)}')
if '--write' in sys.argv:
    Z['props'] = props; Z['nature'] = {'style': 'storybook_forest', 'seed': SEED}
    raw = json.dumps(zones, ensure_ascii=False, indent=1)
    open(ZPATH, 'w').write(raw + ('\n' if open(ZPATH).read().endswith('\n') else ''))
    print('wrote', ZPATH)
