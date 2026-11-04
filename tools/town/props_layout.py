"""Decoration layout for 아르칸 마을 with the Blender props (tools/blender/assets.py TOWN + forest trees / shrubs / plants).
Writes zone 'town': town3d.blprops (what js/town3d.js draws) and, for solid props, matching collision entries in
zone.props (types barrel / crate / bench / flowerbed / fence / tree, see core.js propFootprint).

Rules: the plaza centre and every road / NPC / spawn / portal stays clear; props come in clusters (planter + flowers +
curb stones, barrels + crates, bench + lamp side), building fronts and the wall foot get the densest decoration, the
fountain is ringed by planters; nothing symmetrical. Deterministic (seed). Usage: python3 tools/town/props_layout.py [--write]"""
import json, math, os, random, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
ZPATH = os.path.join(ROOT, 'assets', 'data', 'zones.json')
zones = json.load(open(ZPATH)); Z = next(z for z in zones['zones'] if z['id'] == 'town'); T3 = Z['town3d']
rnd = random.Random(20261104)
X0, Z0, X1, Z1 = T3['ground']['inner']

def seg_dist(px, pz, a, b):
    ax, az = a; bx, bz = b; dx, dz = bx - ax, bz - az; L = dx * dx + dz * dz
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L))
    return math.hypot(px - ax - t * dx, pz - az - t * dz)

def in_poly(x, z, pts):
    c = False; n = len(pts)
    for i in range(n):
        (ax, az), (bx, bz) = pts[i], pts[(i + 1) % n]
        if (az > z) != (bz > z) and x < (bx - ax) * (z - az) / (bz - az) + ax: c = not c
    return c

def poly_dist(x, z, pts):
    if in_poly(x, z, pts): return -1
    return min(seg_dist(x, z, pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts)))

blockers = [p['pts'] for p in Z['blockPolys']]
avoid = [(n['pos'][0], n['pos'][1], 2.0) for n in Z.get('npcs', [])] + [(s['pos'][0], s['pos'][1], 2.2) for s in Z['spawns']] + \
        [(p['pos'][0], p['pos'][1], 4.0) for p in Z['portals']] + [(d['pos'][0], d['pos'][1], 2.2) for d in T3['decor'] if d['type'] != 'planter'] + \
        [(p[0], p[1], 1.1) for p in T3['lanterns']] + [(p['pos'][0], p['pos'][1], 1.2) for p in Z['props'] if p['type'] in ('signpost', 'easel')]

def road_clear(x, z):
    best = 1e9
    for r in T3['ground']['roads']:
        if r.get('kind') == 'ring':
            d = math.hypot(x - r['pos'][0], z - r['pos'][1]); best = min(best, max(r['r0'] - d, d - r['r1']))
        else:
            for a, b in zip(r['pts'], r['pts'][1:]): best = min(best, seg_dist(x, z, a, b) - r['w'] / 2)
    return best

placed = []
def free(x, z, r, wall_ok=0.15, road=0.5):
    if not (X0 + 0.6 < x < X1 - 0.6 and Z0 + 0.6 < z < Z1 - 0.6): return False
    if road_clear(x, z) < road + r: return False
    for (ax, az, ar) in avoid:
        if math.hypot(x - ax, z - az) < ar + r: return False
    for pts in blockers:
        if poly_dist(x, z, pts) < r + wall_ok: return False
    for (px, pz, pr) in placed:
        if math.hypot(x - px, z - pz) < (pr + r) * 0.85: return False
    return True

out, coll = [], []
def put(model, x, z, rot, scale=1.0, r=0.4, solid=None, **kw):
    out.append({'model': model, 'pos': [round(x, 2), round(z, 2)], 'rot': round(rot, 1), 'scale': round(scale, 2)}); placed.append((x, z, r))
    if solid: coll.append(dict({'pos': [round(x, 2), round(z, 2)], 'rot': round(rot, 1), 'scale': round(scale, 2), 'variant': '', 'w': 0.0, 'd': 0.0}, **solid))

def try_put(model, x, z, rot, scale=1.0, r=0.4, solid=None, **kw):
    if free(x, z, r, **kw): put(model, x, z, rot, scale, r, solid); return True
    return False

def flower_bed(x, z):
    """round bed: curb stones around a dense flower clump (flowers never stand loose on the paving)"""
    placed.append((x, z, 1.0)); coll.append({'type': 'flowerbed', 'pos': [round(x, 2), round(z, 2)], 'rot': 0.0, 'scale': 1.0, 'variant': '', 'w': 1.6, 'd': 1.6})
    for j in range(7):
        b = j / 7 * math.tau; out.append({'model': 'town_border', 'pos': [round(x + math.cos(b) * 0.95, 2), round(z + math.sin(b) * 0.95, 2)], 'rot': round(math.degrees(-b) + 90, 1), 'scale': 0.45})
    out.append({'model': rnd.choice(['shrub_a', 'shrub_b']), 'pos': [round(x, 2), round(z, 2)], 'rot': round(rnd.uniform(0, 360), 1), 'scale': 0.55})
    for j in range(9):
        b = rnd.uniform(0, math.tau); d = rnd.uniform(0.2, 0.75)
        out.append({'model': rnd.choice(FLOWERS), 'pos': [round(x + math.cos(b) * d, 2), round(z + math.sin(b) * d, 2)], 'rot': round(rnd.uniform(0, 360), 1), 'scale': round(rnd.uniform(0.6, 0.85), 2)})

FLOWERS = ['flower_white', 'flower_white', 'flower_pink', 'flower_yellow', 'flower_mixed']
def flower_patch(cx, cz, n, spread):
    for k in range(n):
        a = rnd.uniform(0, math.tau); d = math.sqrt(rnd.random()) * spread
        try_put(rnd.choice(FLOWERS) if rnd.random() < 0.75 else rnd.choice(['grass_short', 'clover']), cx + math.cos(a) * d, cz + math.sin(a) * d, rnd.uniform(0, 360), rnd.uniform(0.6, 0.85), 0.15, road=0.05)

# 1) fountain plaza: planters just outside the ring road, each with flowers and curb stones, in uneven spacing
a = 0.3
while a < math.tau + 0.3:
    R = rnd.uniform(10.3, 11.3); x, z = math.cos(a) * R, math.sin(a) * R
    if try_put('town_planter', x, z, rnd.uniform(0, 360), rnd.uniform(0.95, 1.15), 0.9, {'type': 'flowerbed', 'w': 1.6, 'd': 1.6}):
        flower_patch(x * 1.08, z * 1.08, 4, 1.0)
        try_put('town_border', x + math.cos(a + 1.57) * 1.4, z + math.sin(a + 1.57) * 1.4, math.degrees(-a), 0.9, 0.6)
    a += rnd.uniform(0.55, 0.85)

# 1b) plaza islands between the radial streets: small gardens (curb ring + shrub + flowers), benches facing the
#     fountain with a planter, so the paving reads as a lived-in square instead of an empty floor
for R0 in (12.5, 15.5):
    a = rnd.uniform(0, 0.6)
    while a < math.tau:
        R = R0 + rnd.uniform(-0.8, 0.8); x, z = math.cos(a) * R, math.sin(a) * R; kind = rnd.random()
        if kind < 0.55 and free(x, z, 1.5, road=0.8):
            for j in range(6):
                b = j / 6 * math.tau + rnd.uniform(-0.15, 0.15); put('town_border', x + math.cos(b) * 1.15, z + math.sin(b) * 1.15, math.degrees(-b) + 90, 0.62, 0.3)
            put(rnd.choice(['shrub_a', 'shrub_b']), x, z, rnd.uniform(0, 360), rnd.uniform(0.8, 1.0), 0.8, {'type': 'flowerbed', 'w': 2.2, 'd': 2.2})
            for j in range(7):
                b = rnd.uniform(0, math.tau); d = rnd.uniform(0.35, 0.9)
                out.append({'model': rnd.choice(FLOWERS), 'pos': [round(x + math.cos(b) * d, 2), round(z + math.sin(b) * d, 2)], 'rot': round(rnd.uniform(0, 360), 1), 'scale': round(rnd.uniform(0.5, 0.7), 2)})
        elif kind < 0.85 and free(x, z, 1.0, road=0.6):
            put('town_bench', x, z, math.degrees(math.atan2(-x, -z)) + 180, 1.0, 1.0, {'type': 'bench'})
            px, pz = x + math.cos(a + 1.57) * 1.5, z + math.sin(a + 1.57) * 1.5
            if try_put('town_planter', px, pz, rnd.uniform(0, 360), 0.75, 0.7, {'type': 'flowerbed', 'w': 1.2, 'd': 1.2}, road=0.4): flower_patch(px, pz, 3, 1.0)
        a += rnd.uniform(0.5, 0.8)

# 1c) street edges: little groups along both sides of every radial street and the ring road's outer edge
ROW = ['flowers', 'flowers', 'planter', 'flowerbox', 'shrub', 'flowers', 'barrel']
for r in T3['ground']['roads']:
    if r.get('kind') == 'ring':
        a = 0.0
        while a < math.tau:
            R = r['r1'] + 0.75; x, z = math.cos(a) * R, math.sin(a) * R
            if rnd.random() < 0.7:
                if rnd.random() < 0.5: try_put('town_planter', x + math.cos(a) * 0.3, z + math.sin(a) * 0.3, rnd.uniform(0, 360), 0.65, 0.6, {'type': 'flowerbed', 'w': 1.0, 'd': 1.0}, road=0.1)
                elif free(x + math.cos(a) * 0.5, z + math.sin(a) * 0.5, 1.0, road=0.05): flower_bed(x + math.cos(a) * 0.5, z + math.sin(a) * 0.5)
            a += rnd.uniform(0.28, 0.5)
        continue
    for (ax, az), (bx, bz) in zip(r['pts'], r['pts'][1:]):
        L = math.hypot(bx - ax, bz - az); nx, nz = -(bz - az) / L, (bx - ax) / L; t = rnd.uniform(0.5, 1.5)
        while t < L - 0.8:
            for side in (-1, 1):
                if rnd.random() < 0.35: continue
                off = r['w'] / 2 + rnd.uniform(0.35, 0.8); x, z = ax + (bx - ax) * t / L + nx * off * side, az + (bz - az) * t / L + nz * off * side
                k = rnd.choice(ROW); yaw = math.degrees(math.atan2(bx - ax, bz - az))
                if k == 'flowers':
                    if free(x, z, 1.0, road=0.05): flower_bed(x, z)
                elif k == 'planter': try_put('town_planter', x, z, rnd.uniform(0, 360), 0.6, 0.55, {'type': 'flowerbed', 'w': 0.95, 'd': 0.95}, road=0.1)
                elif k == 'flowerbox': try_put('town_flowerbox', x, z, yaw, 1.0, 0.55, {'type': 'flowerbed', 'w': 1.3, 'd': 0.45}, road=0.1)
                elif k == 'shrub': try_put(rnd.choice(['shrub_a', 'shrub_b']), x, z, rnd.uniform(0, 360), 0.75, 0.55, road=0.1)
                else: try_put('town_barrel', x, z, rnd.uniform(0, 360), 0.95, 0.42, {'type': 'barrel'}, road=0.1)
            t += rnd.uniform(1.6, 3.0)

# 2) building fronts: flower boxes under the walls, a barrel / crate group at one corner, a bench or sign at the other
fronts = [(h['pos'], h['w'], h['d'], h['h']) for h in T3['houses']] + [(m['pos'], m['size'][0], m['size'][1], m['h']) for m in T3['models'] if m['id'] != 'fountain']
for (pos, w, d, h) in fronts:
    f = (math.sin(math.radians(h)), math.cos(math.radians(h))); rt = (f[1], -f[0])
    fx, fz = pos[0] + f[0] * (d / 2 + 0.5), pos[1] + f[1] * (d / 2 + 0.5)
    for s in (-0.38, -0.2, 0.2, 0.38):
        if rnd.random() < 0.75: try_put('town_flowerbox', fx + rt[0] * w * s, fz + rt[1] * w * s, h, 1.0, 0.55, {'type': 'flowerbed', 'w': 1.3, 'd': 0.45}, wall_ok=0.02)
    side = rnd.choice((-1, 1)); cx, cz = fx + rt[0] * side * (w / 2 - 0.2) + f[0] * 0.6, fz + rt[1] * side * (w / 2 - 0.2) + f[1] * 0.6
    for k, m in enumerate(['town_barrel', 'town_barrel', 'town_crate', 'town_crate']):
        ox, oz = rnd.uniform(-0.8, 0.8), rnd.uniform(-0.6, 0.6)
        if m == 'town_barrel': try_put(m, cx + ox, cz + oz, rnd.uniform(0, 360), rnd.uniform(0.9, 1.1), 0.42, {'type': 'barrel'}, wall_ok=0.05)
        else: try_put(m, cx + ox, cz + oz, rnd.uniform(0, 90), rnd.uniform(0.85, 1.05), 0.5, {'type': 'crate'}, wall_ok=0.05)
    ox, oz = fx - rt[0] * side * (w / 2 - 0.8) + f[0] * 0.9, fz - rt[1] * side * (w / 2 - 0.8) + f[1] * 0.9
    if rnd.random() < 0.6: try_put('town_bench', ox, oz, h + 180, 1.0, 0.95, {'type': 'bench'}, wall_ok=0.05)
    else: try_put('town_sign', ox, oz, h + rnd.uniform(-20, 20), 1.0, 0.4)
    flower_patch(fx - rt[0] * side * w * 0.3 + f[0] * 0.5, fz - rt[1] * side * w * 0.3 + f[1] * 0.5, 4, 0.9)

# 2b) on the buildings: gold ridge finials on every shop roof, a flowered balcony on the timber-framed upper floors
for hs in T3['houses']:
    w, d, h = hs['w'], hs['d'], hs['h']; f = (math.sin(math.radians(h)), math.cos(math.radians(h))); rt = (f[1], -f[0])
    jetty = 0 if hs['style'] == 'arms' else 0.35; top = 0.35 + 3.3 + 2.7; ridge = top + (d + jetty) * 0.62
    for sx in (-1, 1):
        x = hs['pos'][0] + rt[0] * sx * w / 2 + f[0] * jetty / 2; z = hs['pos'][1] + rt[1] * sx * w / 2 + f[1] * jetty / 2
        out.append({'model': 'town_finial', 'pos': [round(x, 2), round(z, 2)], 'y': round(ridge - 0.05, 2), 'rot': h, 'scale': 1.0})
    if jetty:
        off = rnd.choice((-0.22, 0.22)) * w; x = hs['pos'][0] + rt[0] * off + f[0] * (d / 2 + jetty + 0.45); z = hs['pos'][1] + rt[1] * off + f[1] * (d / 2 + jetty + 0.45)
        out.append({'model': 'town_balcony', 'pos': [round(x, 2), round(z, 2)], 'y': 3.9, 'rot': h, 'scale': 1.0})

# 1d) more plaza islands anywhere in the open paving (random sampling, still clear of roads / NPCs / spawns)
for k in range(600):
    a = rnd.uniform(0, math.tau); R = rnd.uniform(9.8, 18); x, z = math.cos(a) * R, math.sin(a) * R
    kind = rnd.random()
    if kind < 0.45 and free(x, z, 1.2, road=0.4):
        put('town_planter', x, z, rnd.uniform(0, 360), rnd.uniform(0.8, 1.0), 0.9, {'type': 'flowerbed', 'w': 1.4, 'd': 1.4}); flower_patch(x, z, 5, 1.5)
        for j in range(rnd.randint(1, 3)):
            b = rnd.uniform(0, math.tau); try_put('town_border', x + math.cos(b) * 1.3, z + math.sin(b) * 1.3, math.degrees(-b) + 90, 0.7, 0.3, road=0.1)
    elif kind < 0.7 and free(x, z, 1.0, road=0.3): flower_bed(x, z)
    elif kind < 0.8 and free(x, z, 1.0, road=0.5): put('town_bench', x, z, math.degrees(math.atan2(-x, -z)) + 180, 1.0, 1.0, {'type': 'bench'})

# 3) wall foot and corners: trees with shrub + flower skirts, fences around the grass corners
for k in range(500):
    edge = rnd.randrange(4); t = rnd.random()
    x = X0 + 1.6 + t * (X1 - X0 - 3.2) if edge < 2 else (X0 + rnd.uniform(1.6, 6.0) if edge == 2 else X1 - rnd.uniform(1.6, 6.0))
    z = (Z0 + rnd.uniform(1.6, 6.0) if edge == 0 else Z1 - rnd.uniform(1.6, 6.0)) if edge < 2 else Z0 + 1.6 + t * (Z1 - Z0 - 3.2)
    if rnd.random() < 0.35 and try_put(rnd.choice(['tree_broad_a', 'tree_broad_b', 'tree_forest_round']), x, z, rnd.uniform(0, 360), rnd.uniform(0.7, 0.9), 1.3, {'type': 'tree'}, wall_ok=0.3):
        for j in range(rnd.randint(1, 3)):
            a = rnd.uniform(0, math.tau); try_put(rnd.choice(['shrub_a', 'shrub_b']), x + math.cos(a) * 1.6, z + math.sin(a) * 1.6, rnd.uniform(0, 360), rnd.uniform(0.7, 1.0), 0.6)
        flower_patch(x, z, 5, 2.4)
    elif rnd.random() < 0.5: try_put(rnd.choice(['shrub_a', 'shrub_b']), x, z, rnd.uniform(0, 360), rnd.uniform(0.7, 1.05), 0.6)
for g in T3['ground']['grass']:
    cx = sum(p[0] for p in g['pts']) / len(g['pts']); cz = sum(p[1] for p in g['pts']) / len(g['pts'])
    flower_patch(cx, cz, 10, 2.6)
    try_put('town_fence', cx, cz + 2.4, rnd.uniform(-8, 8), 1.0, 1.0, {'type': 'fence', 'w': 2.0})

# 4) banner poles along the plaza roads (navy + gold, like the lamps)
for r in T3['ground']['roads']:
    if r.get('kind') == 'ring' or rnd.random() < 0.4: continue
    (ax, az), (bx, bz) = r['pts'][0], r['pts'][-1]; L = math.hypot(bx - ax, bz - az); nx, nz = -(bz - az) / L, (bx - ax) / L
    t = rnd.uniform(0.35, 0.65); side = rnd.choice((-1, 1)); off = r['w'] / 2 + 0.7
    try_put('town_banner', ax + (bx - ax) * t + nx * off * side, az + (bz - az) * t + nz * off * side, math.degrees(math.atan2(bx - ax, bz - az)), 1.0, 0.35, road=-0.8)

# old sphere planters become Blender planters at the same spots
for d in T3['decor']:
    if d['type'] == 'planter': put('town_planter', d['pos'][0], d['pos'][1], rnd.uniform(0, 360), d.get('r', 1.0) / 0.8, d.get('r', 1.0)); flower_patch(d['pos'][0], d['pos'][1], 5, d.get('r', 1.0) + 1.0)

from collections import Counter
print(len(out), dict(Counter(o['model'] for o in out)), 'solid', len(coll))
if '--write' in sys.argv:
    T3['blprops'] = out
    Z['props'] = [p for p in Z['props'] if not p.get('bl')] + [dict(p, bl=True) for p in coll]
    raw = json.dumps(zones, ensure_ascii=False, indent=1)
    open(ZPATH, 'w').write(raw + ('\n' if open(ZPATH).read().endswith('\n') else ''))
    print('wrote', ZPATH)
