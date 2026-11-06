"""Fill the sparse parts of the enlarged fields (mist_valley / frost_highland / dragon_ruins) after
tools/zones/scale_fields.py: on an 8 m grid, cells with fewer props than a noise-varied target get copies of the zone's
own props (same type mix, models, variants), so there are groves and clearings, and monster areas get trees too
(monsters spawn one by one among them). Entries carry "fill": true and are replaced on every run (idempotent).
Avoids paths, ponds, boss arenas/gates, platforms + ramps, portals and spawns.
Usage: python3 tools/zones/fill_fields.py [--write]   then  node tools/forest/check_nav.mjs <zone>"""
import json, math, os, random, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
ZPATH = os.path.join(ROOT, 'assets', 'data', 'zones.json')
raw = open(ZPATH).read(); zones = json.loads(raw)
SOLID = {'tree', 'pine', 'rock', 'stump', 'mushroom'}
SKIP = {'ruin', 'wall', 'signpost'}
CELL = 8.0

def seg_dist(px, pz, a, b):
    ax, az = a; bx, bz = b; dx, dz = bx - ax, bz - az; L = dx * dx + dz * dz
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L))
    return math.hypot(px - ax - t * dx, pz - az - t * dz)

def vnoise(x, z, s, seed):
    def h(i, j): return random.Random(i * 73856093 ^ j * 19349663 ^ seed).random()
    X, Zz = x / s, z / s; i, j = math.floor(X), math.floor(Zz); fx, fz = X - i, Zz - j
    ux, uz = fx * fx * (3 - 2 * fx), fz * fz * (3 - 2 * fz)
    a, b, c, d = h(i, j), h(i + 1, j), h(i, j + 1), h(i + 1, j + 1)
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz

def fill(Z, seed):
    rnd = random.Random(seed)
    Z['props'] = [p for p in Z['props'] if not p.get('fill')]
    x0, z0, x1, z1 = Z['bounds']
    pool = [p for p in Z['props'] if p['type'] not in SKIP]
    paths = [(list(zip(p['pos'][0::2], p['pos'][1::2])), p['width']) for p in Z['patches'] if p['shape'] == 'path']
    holes = [(p['pos'][0], p['pos'][1], p['radius']) for p in Z['patches'] if p['shape'] == 'disc' and p['tex'] in ('water', 'boss_floor', 'plaster_blue', 'stone_wall')]
    rects = [h['rect'] for h in Z['heights']]
    B = Z.get('boss') or {}
    def ok(x, z, need):
        if not (x0 + 1.5 < x < x1 - 1.5 and z0 + 1.5 < z < z1 - 1.5): return False
        for pp, w in paths:
            for a, b in zip(pp, pp[1:]):
                if seg_dist(x, z, a, b) < w / 2 + need + 0.4: return False
        for hx, hz, hr in holes:
            if math.hypot(x - hx, z - hz) < hr + need + 0.5: return False
        for r in rects:
            if r[0] - 2.2 <= x <= r[2] + 2.2 and r[1] - 2.2 <= z <= r[3] + 2.2: return False
        for p in Z['portals']:
            if math.hypot(x - p['pos'][0], z - p['pos'][1]) < 5.5: return False
        for s in Z['spawns']:
            if math.hypot(x - s['pos'][0], z - s['pos'][1]) < 4.5: return False
        for m in Z['monsters']:
            if math.hypot(x - m['pos'][0], z - m['pos'][1]) < 2.5 + need: return False
        if B.get('center') and math.hypot(x - B['center'][0], z - B['center'][1]) < B['radius'] + 3.5: return False
        if B.get('gate') and math.hypot(x - B['gate'][0], z - B['gate'][1]) < 5: return False
        return True
    grid = {}
    def key(x, z): return (int(math.floor(x / CELL)), int(math.floor(z / CELL)))
    for p in Z['props']: grid.setdefault(key(*p['pos']), []).append(p)
    solid_near = lambda x, z, d: any(math.hypot(x - q['pos'][0], z - q['pos'][1]) < d for i in (-1, 0, 1) for j in (-1, 0, 1)
                                   for q in grid.get((key(x, z)[0] + i, key(x, z)[1] + j), []) if q['type'] in SOLID)
    added = []
    for i in range(int(math.floor(x0 / CELL)), int(math.ceil(x1 / CELL))):
        for j in range(int(math.floor(z0 / CELL)), int(math.ceil(z1 / CELL))):
            cx, cz = (i + 0.5) * CELL, (j + 0.5) * CELL
            edge = min(cx - x0, x1 - cx, cz - z0, z1 - cz)
            target = 3.4 * (0.25 + 1.5 * max(0.0, vnoise(cx, cz, 22, seed) - 0.2)) + (2.0 if edge < 14 else 0)
            have = len(grid.get((i, j), []))
            tries = 0
            while have < target and tries < 30:
                tries += 1
                x, z = rnd.uniform(i * CELL, (i + 1) * CELL), rnd.uniform(j * CELL, (j + 1) * CELL)
                src = rnd.choice(pool); solid = src['type'] in SOLID
                if not ok(x, z, 1.2 if solid else 0.3): continue
                if solid and solid_near(x, z, 2.2): continue
                q = dict(src); q['pos'] = [round(x, 2), round(z, 2)]; q['rot'] = round(rnd.uniform(0, 360), 1)
                q['scale'] = round(src.get('scale', 1) * rnd.uniform(0.85, 1.15), 2); q['fill'] = True
                grid.setdefault((i, j), []).append(q); added.append(q); have += 1
    Z['props'] += added
    return len(added)

for k, zid in enumerate(['mist_valley', 'frost_highland', 'dragon_ruins']):
    Z = next(z for z in zones['zones'] if z['id'] == zid)
    n = fill(Z, 777 + k)
    print(zid, 'added', n, 'total', len(Z['props']))
if '--write' in sys.argv:
    open(ZPATH, 'w').write(json.dumps(zones, ensure_ascii=False, indent=1) + ('\n' if raw.endswith('\n') else '')); print('wrote')
