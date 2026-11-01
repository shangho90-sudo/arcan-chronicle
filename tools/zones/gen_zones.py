# Generates the three high-level hunting zones (Lv10-50) and writes them into zones.json
# (also adds the forest -> valley portal + spawn). Idempotent: removes previously generated zones first.
import json, math, random, sys

ZPATH = '/home/claude/ArcanWeb/assets/data/zones.json'
NEW_IDS = ['mist_valley', 'frost_highland', 'dragon_ruins']


def P(t, x, z, rot=None, scale=1.0, variant='', w=0.0, d=0.0, rnd=None):
    r = rnd or random
    return {'type': t, 'pos': [round(x, 2), round(z, 2)], 'rot': round(rot if rot is not None else r.uniform(0, 360), 2),
            'scale': round(scale, 2), 'variant': variant, 'w': w, 'd': d}


def seg_dist(px, pz, ax, az, bx, bz):
    vx, vz = bx - ax, bz - az
    L = vx * vx + vz * vz
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * vx + (pz - az) * vz) / L))
    return math.hypot(px - ax - vx * t, pz - az - vz * t)


def path_dist(px, pz, pts):
    return min(seg_dist(px, pz, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]) for i in range(0, len(pts) - 2, 2))


class Layout:
    def __init__(self, seed, bounds):
        self.r = random.Random(seed)
        self.b = bounds
        self.props = []
        self.keep = []      # (kind, data, margin)   areas that must stay free of scatter props
        self.heights = []

    def clear_disc(self, x, z, r):
        self.keep.append(('disc', (x, z, r)))

    def clear_path(self, pts, half):
        self.keep.append(('path', (pts, half)))

    def clear_rect(self, x0, z0, x1, z1):
        self.keep.append(('rect', (x0, z0, x1, z1)))

    def free(self, x, z, pad):
        for k, d in self.keep:
            if k == 'disc' and math.hypot(x - d[0], z - d[1]) < d[2] + pad: return False
            if k == 'path' and path_dist(x, z, d[0]) < d[1] + pad: return False
            if k == 'rect' and d[0] - pad < x < d[2] + pad and d[1] - pad < z < d[3] + pad: return False
        for p in self.props:
            if math.hypot(x - p['pos'][0], z - p['pos'][1]) < pad + 0.9: return False
        return True

    def add(self, *a, **k):
        k.setdefault('rnd', self.r)
        p = P(*a, **k)
        self.props.append(p)
        return p

    def scatter(self, n, kinds, area=None, pad=1.0, tries=4000):
        """kinds: list of (weight, fn(x,z) -> prop args tuple)"""
        b = area or (self.b[0] + 1.5, self.b[1] + 1.5, self.b[2] - 1.5, self.b[3] - 1.5)
        tot = sum(w for w, _ in kinds)
        placed = 0
        for _ in range(tries):
            if placed >= n: break
            x, z = self.r.uniform(b[0], b[2]), self.r.uniform(b[1], b[3])
            if not self.free(x, z, pad): continue
            u = self.r.uniform(0, tot)
            for w, fn in kinds:
                u -= w
                if u <= 0: break
            self.props.append(fn(x, z))
            placed += 1
        return placed

    def border(self, kinds, inner=2.6, outer=7.0, step=3.4):
        """dense band of props along (and just outside) the zone bounds, skipping cleared areas"""
        x0, z0, x1, z1 = self.b
        tot = sum(w for w, _ in kinds)
        def pick(x, z):
            u = self.r.uniform(0, tot)
            for w, fn in kinds:
                u -= w
                if u <= 0: return fn(x, z)
            return kinds[-1][1](x, z)
        for edge in range(4):
            t = (x0 if edge < 2 else z0) - outer
            end = (x1 if edge < 2 else z1) + outer
            while t < end:
                for depth in (-1.8, 1.2):
                    dj = depth + self.r.uniform(-0.6, 0.6)
                    tj = t + self.r.uniform(-0.6, 0.6)
                    if edge == 0: x, z = tj, z0 + dj
                    elif edge == 1: x, z = tj, z1 - dj
                    elif edge == 2: x, z = x0 + dj, tj
                    else: x, z = x1 - dj, tj
                    if depth > 0 and not self.free(x, z, 1.2): continue
                    if depth <= 0 and any(k == 'disc' and math.hypot(x - d[0], z - d[1]) < d[2] for k, d in self.keep): continue
                    self.props.append(pick(x, z))
                t += step


def zone_base(id, name, bounds, ground, ambient, sun, tint):
    return {'id': id, 'name': name, 'kind': 'field', 'bgm': 'bgm_field', 'bounds': bounds, 'groundTex': ground,
            'ambient': ambient, 'sun': sun, 'spriteTint': tint, 'spawns': [], 'buildings': [], 'props': [], 'npcs': [],
            'portals': [], 'heights': [], 'patches': [], 'monsters': [],
            'boss': {'boss': '', 'center': [], 'radius': 0, 'gate': [], 'gateRadius': 0, 'bossPos': [], 'respawn': 0},
            'respawnZone': 'town', 'respawnSpawn': 'revive'}


def portal(id, label, x, z, tz, ts, minLevel=0, r=1.8):
    return {'id': id, 'label': label, 'pos': [x, z], 'radius': r, 'targetZone': tz, 'targetSpawn': ts, 'minLevel': minLevel}


def spawner(mid, x, z, r, n):
    return {'monster': mid, 'pos': [x, z], 'radius': r, 'count': n}


def flat(pts): return [c for p in pts for c in p]


# ============================================================================ A: 안개 골짜기 (Lv10-22)
def mist_valley():
    B = [-40.0, -40.0, 40.0, 40.0]
    z = zone_base('mist_valley', '안개 골짜기', B, 'leaves_dark', [0.5, 0.56, 0.74], [0.72, 0.78, 0.98, 0.8], [0.88, 0.9, 1.0])
    L = Layout(101, B)
    z['spawns'] = [{'id': 'from_forest', 'pos': [-32.0, -31.0], 'rot': 45.0}, {'id': 'from_highland', 'pos': [31.5, 30.5], 'rot': 225.0}]
    z['portals'] = [portal('to_forest', '속삭이는 숲', -36.2, -35.2, 'forest', 'from_valley', 0),
                    portal('to_highland', '서리 고원', 35.6, 34.6, 'frost_highland', 'from_valley', 22)]
    main = flat([(-35, -34), (-26, -25), (-14, -24), (-4, -18), (-8, -6), (-2, 4), (8, 4), (18, 8), (20, 18), (14, 26), (24, 30), (35, 34.5)])
    side1 = flat([(-8, -6), (-18, 4), (-22, 14), (-20, 24)])          # NW branch -> elite glade
    side2 = flat([(-4, -18), (6, -24), (14, -18), (24, -8), (28, 2)])  # SE branch
    S = [spawner('mon_mist_fox', -20, -14, 5, 4), spawner('mon_mist_fox', 2, -30, 4.5, 4),
         spawner('mon_fog_toad', 12, -14, 4.5, 4), spawner('mon_fog_toad', -26, 6, 4.5, 4),
         spawner('mon_bog_boar', 28, -4, 5, 3), spawner('mon_bog_boar', 8, 14, 4.5, 3),
         spawner('mon_mist_wolf', 28, 20, 4.5, 3), spawner('mon_mist_wolf', -4, 28, 4.5, 3),
         spawner('mon_mist_bear', -22, 28, 4.0, 1)]
    z['monsters'] = S
    ponds = [(-8, -32, 3.6), (-32, -8, 4.5), (24, -26, 4.2), (6, 32, 3.2), (34, 8, 3.0)]
    z['patches'] = [{'tex': 'dirt', 'shape': 'path', 'pos': main, 'radius': 0, 'width': 3.2},
                    {'tex': 'dirt', 'shape': 'path', 'pos': side1, 'radius': 0, 'width': 2.6},
                    {'tex': 'dirt', 'shape': 'path', 'pos': side2, 'radius': 0, 'width': 2.6}]
    for s in S:
        z['patches'].append({'tex': 'forest_floor', 'shape': 'disc', 'pos': s['pos'], 'radius': s['radius'] + 1.6, 'width': 0})
    z['patches'].append({'tex': 'boss_floor', 'shape': 'disc', 'pos': [-22, 28], 'radius': 5.5, 'width': 0})
    for x, zz, r in ponds:
        z['patches'].append({'tex': 'water', 'shape': 'disc', 'pos': [x, zz], 'radius': r, 'width': 0})
    # keep-outs
    L.clear_path(main, 2.4); L.clear_path(side1, 2.0); L.clear_path(side2, 2.0)
    for s in S: L.clear_disc(s['pos'][0], s['pos'][1], s['radius'] + 0.6)
    for sp in z['spawns']: L.clear_disc(sp['pos'][0], sp['pos'][1], 3.5)
    for pt in z['portals']: L.clear_disc(pt['pos'][0], pt['pos'][1], 4.0)
    # pond rims: rocks, reeds (bushes) - the water itself is walkable shallow mist water, rims are partly blocked
    for x, zz, r in ponds:
        n = int(r * 2.2)
        for i in range(n):
            if L.r.random() < 0.4: continue
            a = i / n * math.tau + L.r.uniform(-0.15, 0.15)
            px, pz = x + math.cos(a) * (r + 0.3), zz + math.sin(a) * (r + 0.3)
            if path_dist(px, pz, main) < 2.6: continue
            L.add(*(('rock', px, pz) if L.r.random() < 0.55 else ('bush', px, pz)), scale=L.r.uniform(0.7, 1.1))
        L.clear_disc(x, zz, r + 0.8)
    # elite glade: ring of standing stones (ruins) + purple mushrooms
    for i in range(10):
        a = i / 10 * math.tau
        if abs(math.atan2(math.sin(a - math.radians(-80)), math.cos(a - math.radians(-80)))) < 0.5: continue   # opening to the south
        L.add('ruin', -22 + math.cos(a) * 6.3, 28 + math.sin(a) * 6.3, scale=L.r.uniform(1.0, 1.4))
    for (x, zz) in [(-25, 31), (-18, 25.5), (-19.5, 31.5)]:
        L.add('mushroom', x, zz, variant='purple', scale=1.4)
    L.clear_disc(-22, 28, 7.2)
    # signposts
    L.add('signpost', -29.5, -30.5, rot=45, variant='town'); L.add('signpost', 32.5, 33.0, rot=225, variant='boss')
    dark = lambda x, zz: P('pine', x, zz, scale=L.r.uniform(1.05, 1.5), variant='leaves_dark', rnd=L.r)
    tree = lambda x, zz: P('tree', x, zz, scale=L.r.uniform(1.0, 1.35), variant=L.r.choice(['leaves_dark', 'leaves_dark', 'leaves']), rnd=L.r)
    L.border([(3, dark), (1, tree), (3, lambda x, zz: P('rock', x, zz, scale=L.r.uniform(1.2, 1.8), rnd=L.r)), (2, lambda x, zz: P('bush', x, zz, scale=L.r.uniform(1.1, 1.6), rnd=L.r))])
    kinds = [(3, dark), (2, tree), (3, lambda x, zz: P('bush', x, zz, scale=L.r.uniform(0.8, 1.2), rnd=L.r)),
             (2, lambda x, zz: P('rock', x, zz, scale=L.r.uniform(0.8, 1.5), rnd=L.r)),
             (2, lambda x, zz: P('mushroom', x, zz, scale=L.r.uniform(0.9, 1.4), variant=L.r.choice(['purple', 'purple', 'orange']), rnd=L.r)),
             (1, lambda x, zz: P('stump', x, zz, scale=L.r.uniform(0.9, 1.2), rnd=L.r)),
             (1, lambda x, zz: P('ruin', x, zz, scale=L.r.uniform(0.9, 1.3), rnd=L.r)),
             (1, lambda x, zz: P('pine', x, zz, scale=L.r.uniform(0.8, 1.2), variant='stone_wall', rnd=L.r))]
    L.scatter(105, kinds, pad=1.2)
    z['props'] = L.props
    return z


# ============================================================================ B: 서리 고원 (Lv22-36)
def frost_highland():
    B = [-40.0, -40.0, 40.0, 40.0]
    z = zone_base('frost_highland', '서리 고원', B, 'plaster_blue', [0.74, 0.8, 0.94], [0.94, 0.97, 1.06, 1.0], [0.94, 0.97, 1.0])
    L = Layout(202, B)
    z['spawns'] = [{'id': 'from_valley', 'pos': [-32.0, -31.0], 'rot': 45.0}, {'id': 'from_ruins', 'pos': [31.5, -30.5], 'rot': 315.0}]
    z['portals'] = [portal('to_valley', '안개 골짜기', -36.2, -35.2, 'mist_valley', 'from_highland', 0),
                    portal('to_ruins', '잊힌 용의 유적', 35.6, -34.6, 'dragon_ruins', 'from_highland', 36)]
    # central highland plateau (1.6 m) with two ramps
    plat = [-6.0, 6.0, 26.0, 30.0]
    z['heights'] = [
        {'kind': 'platform', 'rect': plat, 'height': 1.6, 'heightFrom': 0, 'axis': '', 'tex': 'plaster_blue', 'sideTex': 'stone_wall', 'steps': False},
        {'kind': 'ramp', 'rect': [-12.0, 14.0, -6.0, 20.0], 'height': 1.6, 'heightFrom': 0.0, 'axis': '+x', 'tex': 'cobble', 'sideTex': 'stone_wall', 'steps': True},
        {'kind': 'ramp', 'rect': [14.0, 0.0, 20.0, 6.0], 'height': 1.6, 'heightFrom': 0.0, 'axis': '+z', 'tex': 'cobble', 'sideTex': 'stone_wall', 'steps': True},
    ]
    main = flat([(-35, -34), (-28, -24), (-24, -12), (-22, 2), (-18, 12), (-12, 17), (-6, 17), (4, 18), (12, 14), (17, 9), (17, 0), (20, -10), (26, -22), (35, -34.5)])
    side = flat([(-24, -12), (-10, -18), (4, -24), (14, -26), (26, -22)])
    S = [spawner('mon_frost_wolf', -24, -20, 5, 4), spawner('mon_frost_wolf', -2, -22, 4.5, 4),
         spawner('mon_ice_fox', -28, 6, 4.5, 4), spawner('mon_ice_fox', 10, -12, 4.5, 3),
         spawner('mon_frost_ram', 2, 24, 4.5, 3), spawner('mon_frost_ram', 30, 6, 4.5, 3),
         spawner('mon_snow_bear', 18, 22, 4.5, 2), spawner('mon_snow_bear', 22, -14, 4.5, 2),
         spawner('mon_ram_king', -26, 28, 4.0, 1)]
    z['monsters'] = S
    lakes = [(-12, -4, 4.5), (32, 26, 4.0), (-8, -34, 3.0)]
    z['patches'] = [{'tex': 'cobble', 'shape': 'path', 'pos': main, 'radius': 0, 'width': 3.0},
                    {'tex': 'cobble', 'shape': 'path', 'pos': side, 'radius': 0, 'width': 2.4},
                    {'tex': 'cobble', 'shape': 'path', 'pos': flat([(-22, 2), (-26, 18), (-26, 24)]), 'radius': 0, 'width': 2.2}]
    z['patches'].append({'tex': 'stone_wall', 'shape': 'disc', 'pos': [-26, 28], 'radius': 5.0, 'width': 0})
    for x, zz, r in lakes:
        z['patches'].append({'tex': 'water', 'shape': 'disc', 'pos': [x, zz], 'radius': r, 'width': 0})
        z['patches'].append({'tex': 'plaster_blue', 'shape': 'disc', 'pos': [x + r * 0.25, zz + r * 0.2], 'radius': r * 0.45, 'width': 0})
    L.clear_path(main, 2.6); L.clear_path(side, 2.2); L.clear_path(flat([(-22, 2), (-26, 18), (-26, 24)]), 2.0)
    for s in S: L.clear_disc(s['pos'][0], s['pos'][1], s['radius'] + 0.6)
    for sp in z['spawns']: L.clear_disc(sp['pos'][0], sp['pos'][1], 3.5)
    for pt in z['portals']: L.clear_disc(pt['pos'][0], pt['pos'][1], 4.0)
    for h in z['heights'][1:]:
        r = h['rect']; L.clear_rect(r[0] - 1.6, r[1] - 0.6, r[2] + 1.6, r[3] + 0.6)
    # no scatter props within 1.2 m of the plateau edge (keeps the cliff readable, avoids half-buried props)
    L.keep.append(('edge', plat))
    _free = L.free
    def free(x, zz, pad, _free=_free):
        x0, z0, x1, z1 = plat
        inside_outer = x0 - 1.4 < x < x1 + 1.4 and z0 - 1.4 < zz < z1 + 1.4
        inside_inner = x0 + 1.2 < x < x1 - 1.2 and z0 + 1.2 < zz < z1 - 1.2
        if inside_outer and not inside_inner: return False
        return _free(x, zz, pad)
    L.keep.pop(); L.free = free
    for x, zz, r in lakes:
        n = int(r * 2.4)
        for i in range(n):
            if L.r.random() < 0.45: continue
            a = i / n * math.tau
            px, pz = x + math.cos(a) * (r + 0.4), zz + math.sin(a) * (r + 0.4)
            if path_dist(px, pz, main) < 2.8 or path_dist(px, pz, side) < 2.4: continue
            L.add('rock', px, pz, scale=L.r.uniform(0.7, 1.2))
        L.clear_disc(x, zz, r + 0.8)
    # elite den: ring of ice spires
    for i in range(11):
        a = i / 11 * math.tau
        if abs(math.atan2(math.sin(a - math.radians(-90)), math.cos(a - math.radians(-90)))) < 0.45: continue
        L.add('pine', -26 + math.cos(a) * 6.2, 28 + math.sin(a) * 6.2, scale=L.r.uniform(0.9, 1.3), variant='water')
    L.clear_disc(-26, 28, 7.0)
    L.add('signpost', -29.5, -30.5, rot=45, variant='town'); L.add('signpost', 32.5, -31.5, rot=315, variant='boss')
    snowpine = lambda x, zz: P('pine', x, zz, scale=L.r.uniform(1.0, 1.5), variant='plaster_blue', rnd=L.r)
    frostpine = lambda x, zz: P('pine', x, zz, scale=L.r.uniform(0.9, 1.3), variant='leaves_dark', rnd=L.r)
    rock = lambda x, zz: P('rock', x, zz, scale=L.r.uniform(1.0, 1.8), rnd=L.r)
    L.border([(2, snowpine), (2, frostpine), (5, rock)])
    kinds = [(2, snowpine), (3, frostpine), (5, lambda x, zz: P('rock', x, zz, scale=L.r.uniform(0.8, 1.6), rnd=L.r)),
             (2, lambda x, zz: P('tree', x, zz, scale=L.r.uniform(0.9, 1.25), variant='plaster_blue', rnd=L.r)),
             
             (1, lambda x, zz: P('stump', x, zz, scale=L.r.uniform(0.9, 1.2), rnd=L.r)),
             (1, lambda x, zz: P('pine', x, zz, scale=L.r.uniform(0.8, 1.3), variant='stone_wall', rnd=L.r))]
    L.scatter(100, kinds, pad=1.2)
    z['props'] = L.props
    return z


# ============================================================================ C: 잊힌 용의 유적 (Lv36-50 + boss)
def dragon_ruins():
    B = [-40.0, -40.0, 40.0, 40.0]
    z = zone_base('dragon_ruins', '잊힌 용의 유적', B, 'dirt', [0.62, 0.5, 0.5], [1.0, 0.7, 0.52, 0.95], [1.0, 0.92, 0.86])
    L = Layout(303, B)
    z['spawns'] = [{'id': 'from_highland', 'pos': [-32.0, -31.0], 'rot': 45.0}, {'id': 'plateau', 'pos': [11.0, 19.0], 'rot': 90.0}]
    z['portals'] = [portal('to_highland', '서리 고원', -36.2, -35.2, 'frost_highland', 'from_ruins', 0),
                    portal('to_town', '아르칸 마을', -36.2, -25.0, 'town', 'from_field', 0)]
    # boss arena: raised ancient altar (same proportions as the forest arena)
    z['heights'] = [
        {'kind': 'platform', 'rect': [9.0, 9.0, 40.0, 40.0], 'height': 1.6, 'heightFrom': 0, 'axis': '', 'tex': 'boss_floor', 'sideTex': 'stone_wall', 'steps': False},
        {'kind': 'ramp', 'rect': [3.5, 16.0, 9.0, 22.0], 'height': 1.6, 'heightFrom': 0.0, 'axis': '+x', 'tex': 'cobble', 'sideTex': 'stone_wall', 'steps': True},
    ]
    z['boss'] = {'boss': 'boss_ancient_dragon', 'center': [25.0, 25.0], 'radius': 10.0, 'gate': [16.5, 17.5], 'gateRadius': 2.2, 'bossPos': [26.0, 26.0], 'respawn': 300}
    main = flat([(-35, -34), (-26, -26), (-14, -26), (-4, -20), (6, -14), (4, -4), (-4, 4), (-4, 12), (2, 19), (6.5, 19), (9.5, 19)])
    side = flat([(-26, -26), (-30, -12), (-26, 0), (-22, 12), (-16, 24), (-6, 30)])
    side2 = flat([(6, -14), (18, -16), (30, -8), (32, 2)])
    S = [spawner('mon_ember_drake', -20, -18, 5, 4), spawner('mon_ember_drake', 4, -30, 4.5, 3),
         spawner('mon_cinder_lizard', -30, -4, 4.5, 4), spawner('mon_cinder_lizard', 16, -6, 4.5, 3),
         spawner('mon_lava_boar', -14, 6, 5, 3), spawner('mon_lava_boar', 24, -24, 4.5, 3),
         spawner('mon_ruin_golem', -24, 22, 4.5, 2), spawner('mon_ruin_golem', -2, 30, 4.5, 2),
         spawner('mon_drake_lord', 30, 0, 4.0, 1)]
    z['monsters'] = S
    z['patches'] = [{'tex': 'cobble', 'shape': 'path', 'pos': main, 'radius': 0, 'width': 3.2},
                    {'tex': 'cobble_warm', 'shape': 'path', 'pos': side, 'radius': 0, 'width': 2.6},
                    {'tex': 'cobble_warm', 'shape': 'path', 'pos': side2, 'radius': 0, 'width': 2.6}]
    for s in S:
        z['patches'].append({'tex': 'cobble_warm' if s['monster'] != 'mon_drake_lord' else 'stone_wall', 'shape': 'disc', 'pos': s['pos'], 'radius': s['radius'] + 1.4, 'width': 0})
    # scorched / ash fields
    for (x, zz, r) in [(-6, -34, 4.0), (-34, 14, 4.0), (34, -34, 4.5), (-8, 18, 3.0)]:
        z['patches'].append({'tex': 'boss_floor', 'shape': 'disc', 'pos': [x, zz], 'radius': r, 'width': 0})
    L.clear_path(main, 2.4); L.clear_path(side, 2.0); L.clear_path(side2, 2.0)
    for s in S: L.clear_disc(s['pos'][0], s['pos'][1], s['radius'] + 0.6)
    for sp in z['spawns'][:1]: L.clear_disc(sp['pos'][0], sp['pos'][1], 3.5)
    for pt in z['portals']: L.clear_disc(pt['pos'][0], pt['pos'][1], 4.0)
    L.clear_rect(1.5, 14.5, 9.5, 23.5)            # ramp approach
    L.clear_rect(7.0, 7.0, 40.0, 40.0)            # altar (decorated by hand below)
    # altar ring: alternating broken pillars and purple rocks, opening at the gate (south-west)
    cx, cz, R = 25.0, 25.0, 11.0
    for i in range(28):
        a = i / 28 * math.tau
        x, zz = cx + math.cos(a) * R, cz + math.sin(a) * R
        if math.hypot(x - 16.5, zz - 17.5) < 2.6: continue
        if i % 2 == 0: L.add('ruin', x, zz, scale=L.r.uniform(1.1, 1.5))
        else: L.add('rock', x, zz, scale=L.r.uniform(1.0, 1.3), variant='boss')
    for (x, zz) in [(10.5, 36), (36, 10.5), (36, 36), (10.5, 11)]:
        L.add('pine', x, zz, scale=1.3, variant='stone_wall')
    for (x, zz, rot) in [(12.5, 33.5, 45), (33.5, 12.5, 45)]:
        L.add('wall', x, zz, rot=rot, w=2.4, d=0.7)
    L.add('signpost', 1.8, 14.5, rot=0, variant='boss'); L.add('signpost', -29.5, -30.5, rot=45, variant='town')
    # ruined walls along the paths (with ever-burning braziers on top)
    for (x, zz, rot, w) in [(-18, -30.5, 0, 3.0), (-9, -29, 15, 2.4), (-36, -6, 90, 2.6), (12, -22, 30, 3.0), (-30, 30, 0, 3.0),
                             (8, 4, 90, 2.4), (-8, -8, 45, 2.2), (34, 20, 90, 2.6), (20, -32, 0, 2.6), (-20, 34, 0, 2.8)]:
        if L.free(x, zz, 1.0): L.add('wall', x, zz, rot=rot, w=w, d=0.7)
    spire = lambda x, zz: P('pine', x, zz, scale=L.r.uniform(1.0, 1.6), variant='stone_wall', rnd=L.r)
    rock = lambda x, zz: P('rock', x, zz, scale=L.r.uniform(1.1, 1.9), variant=L.r.choice(['', '', 'boss']), rnd=L.r)
    dead = lambda x, zz: P('tree', x, zz, scale=L.r.uniform(0.9, 1.3), variant=L.r.choice(['leaves_autumn', 'bark']), rnd=L.r)
    L.border([(5, rock), (2, spire), (2, dead)])
    kinds = [(4, lambda x, zz: P('ruin', x, zz, scale=L.r.uniform(0.9, 1.5), rnd=L.r)),
             (4, lambda x, zz: P('rock', x, zz, scale=L.r.uniform(0.8, 1.6), variant=L.r.choice(['', 'boss']), rnd=L.r)),
             (3, spire), (3, dead),
             (1, lambda x, zz: P('stump', x, zz, scale=L.r.uniform(0.9, 1.2), rnd=L.r)),
             (1, lambda x, zz: P('mushroom', x, zz, scale=L.r.uniform(0.9, 1.3), variant='orange', rnd=L.r))]
    L.scatter(110, kinds, area=(-38.5, -38.5, 38.5, 38.5), pad=1.2)
    z['props'] = L.props
    return z


def main():
    data = json.load(open(ZPATH, encoding='utf-8'))
    zones = [zz for zz in data['zones'] if zz['id'] not in NEW_IDS]
    forest = next(zz for zz in zones if zz['id'] == 'forest')
    forest['spawns'] = [s for s in forest['spawns'] if s['id'] != 'from_valley'] + [{'id': 'from_valley', 'pos': [32.5, -22.0], 'rot': 270.0}]
    forest['portals'] = [p for p in forest['portals'] if p['id'] != 'to_valley'] + [portal('to_valley', '안개 골짜기', 36.2, -22.0, 'mist_valley', 'from_forest', 10)]
    forest['props'] = [p for p in forest['props'] if not (p['type'] == 'signpost' and p['pos'] == [33.0, -19.6])] + \
        [{'type': 'signpost', 'pos': [33.0, -19.6], 'rot': 90.0, 'scale': 1, 'variant': 'boss', 'w': 0.0, 'd': 0.0}]
    zones += [mist_valley(), frost_highland(), dragon_ruins()]
    data['zones'] = zones
    out = sys.argv[1] if len(sys.argv) > 1 else ZPATH
    json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for zz in zones[-3:]: print(zz['id'], len(zz['props']), 'props', len(zz['monsters']), 'spawners')


if __name__ == '__main__':
    main()
