"""One-shot field enlargement (2026-11-06): every field zone (속삭이는 숲·안개 골짜기·서리 고원·잊힌 용의 유적) becomes
twice as wide and twice as deep, the mushroom boss moves out of the forest into its own zone (독버섯 군락지) reached by
a warp, and monster camps become wide "spread" spawners.

What it does (assets/data/zones.json + assets/zone_<id>.json):
  * coordinates x2 (bounds, spawns, portals, paths, discs, props, monster areas)
  * raised platforms (+ the ramps touching them) and boss arenas move rigidly (same size, centre x2) so arenas,
    gates and stairs keep their shape
  * paths keep their look (width x1.25), discs (camps, ponds) x1.4 with their decoration
  * builder props of mist_valley / frost_highland / dragon_ruins are kept at x2 and the gaps are filled with
    jittered copies (same types / mix) so the density stays as it was; the forest is re-laid out by tools/forest/layout.py
  * monster spawners: count x1.6, area x2.6 (min 12 m), "spread" 6 m -> one by one over the area, trees included
  * zone meshes (only terrain + non-painted patches are visible in nature zones) are regenerated from the data
Run once (guarded by "scaled": 2 on each zone):  python3 tools/zones/scale_fields.py --write
then  python3 tools/forest/layout.py forest --write  and  python3 tools/forest/layout.py mushroom_grove --write"""
import json, math, os, random, sys, copy

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
ZPATH = os.path.join(ROOT, 'assets', 'data', 'zones.json')
raw = open(ZPATH).read(); zones = json.loads(raw)
FIELDS = ['forest', 'mist_valley', 'frost_highland', 'dragon_ruins']
K = 2.0
NOFILL = {'ruin', 'wall', 'signpost'}
SOLID = {'tree', 'pine', 'rock', 'stump', 'mushroom', 'mushtree', 'ruin', 'wall'}

def zone(i): return next(z for z in zones['zones'] if z['id'] == i)
def in_rect(x, z, r, m=0): return r[0] - m <= x <= r[2] + m and r[1] - m <= z <= r[3] + m
def touches(a, b, m=0.6): return not (a[2] + m < b[0] or b[2] + m < a[0] or a[3] + m < b[1] or b[3] + m < a[1])

# ---------------------------------------------------------------- the mushroom grove: cut the forest's boss corner out first
def make_grove(F):
    G = copy.deepcopy(F)
    G['id'] = 'mushroom_grove'; G['name'] = '독버섯 군락지'
    bx = [-8.0, 1.0, 39.0, 39.0]; G['bounds'] = bx
    G['spawns'] = [{'id': 'from_forest', 'pos': [-2.0, 19.0], 'rot': 90.0}, {'id': 'plateau', 'pos': [11.0, 19.0], 'rot': 90.0}]
    G['portals'] = [{'id': 'to_forest', 'label': '속삭이는 숲', 'pos': [-5.6, 19.0], 'radius': 1.8, 'targetZone': 'forest', 'targetSpawn': 'from_grove', 'minLevel': 0}]
    G['patches'] = [{'tex': 'dirt', 'shape': 'path', 'pos': [-6.5, 19, 0, 19, 3.5, 19, 9.5, 19], 'radius': 0, 'width': 3.2}]
    G['monsters'] = [{'monster': 'mon_shroom', 'pos': [1.0, 8.0], 'radius': 6.0, 'count': 3, 'spread': 5.0}]
    G['props'] = [p for p in F['props'] if in_rect(p['pos'][0], p['pos'][1], [bx[0] - 10, bx[1] - 10, bx[2] + 10, bx[3] + 10])]
    G['nature'] = dict(F['nature'])
    G.pop('scaled', None)
    return G

def seg_dist(px, pz, a, b):
    ax, az = a; bx, bz = b; dx, dz = bx - ax, bz - az; L = dx * dx + dz * dz
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L))
    return math.hypot(px - ax - t * dx, pz - az - t * dz)

def scale_zone(Z, seed):
    rnd = random.Random(seed)
    # rigid groups: each platform with the ramps that touch it, each boss arena
    rig = []
    plats = [h for h in Z['heights'] if h['kind'] == 'platform']; ramps = [h for h in Z['heights'] if h['kind'] == 'ramp']
    for p in plats:
        r = p['rect']; cx, cz = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2; off = (cx * (K - 1), cz * (K - 1))
        mem = [p] + [q for q in ramps if touches(q['rect'], r)]
        rects = [m['rect'] for m in mem]
        rig.append({'rects': rects, 'off': off, 'mem': mem})
    B = Z.get('boss')
    if B and B.get('center'):
        c = B['center']; host = next((g for g in rig if any(in_rect(c[0], c[1], rr) for rr in g['rects'])), None)
        off = host['off'] if host else (c[0] * (K - 1), c[1] * (K - 1))
        rig.append({'circle': (c[0], c[1], B['radius'] + 4.0), 'off': off, 'rects': []})
    def group_of(x, z, m=0.8):
        for g in rig:
            if 'circle' in g and math.hypot(x - g['circle'][0], z - g['circle'][1]) < g['circle'][2]: return g
            if any(in_rect(x, z, r, m) for r in g['rects']): return g
        return None
    def M(x, z, m=0.8):
        g = group_of(x, z, m)
        return (x + g['off'][0], z + g['off'][1]) if g else (x * K, z * K)
    P2 = lambda p: [round(v, 3) for v in M(p[0], p[1])]

    Z['bounds'] = [v * K for v in Z['bounds']]
    for g in rig:
        for h in g.get('mem', []):
            r = h['rect']; h['rect'] = [r[0] + g['off'][0], r[1] + g['off'][1], r[2] + g['off'][0], r[3] + g['off'][1]]
    for s in Z['spawns']: s['pos'] = P2(s['pos'])
    for p in Z['portals']: p['pos'] = P2(p['pos'])
    for n in Z.get('npcs') or []: n['pos'] = P2(n['pos'])
    if B and B.get('center'):
        g = next(g for g in rig if 'circle' in g); o = g['off']
        for k in ('center', 'gate', 'bossPos'):
            if B.get(k): B[k] = [B[k][0] + o[0], B[k][1] + o[1]]
    # patches: paths x2 (wider), discs x1.4 (a disc lying in another bigger disc keeps its relative place)
    discs = [p for p in Z['patches'] if p['shape'] == 'disc']
    old_discs = [(p['pos'][0], p['pos'][1], p['radius']) for p in discs]
    for p in Z['patches']:
        if p['shape'] == 'path':
            pts = list(zip(p['pos'][0::2], p['pos'][1::2])); out = []
            for x, z in pts: out += list(M(x, z, 0.2))
            p['pos'] = [round(v, 3) for v in out]; p['width'] = round(p['width'] * 1.25, 2)
    for i, p in enumerate(discs):
        x, z, r = old_discs[i]
        host = next(((hx, hz, hr) for (hx, hz, hr) in old_discs if hr > r + 0.05 and math.hypot(x - hx, z - hz) < hr), None)
        g = group_of(x, z)
        if g: nx, nz = x + g['off'][0], z + g['off'][1]; k = 1.0
        elif host: hx, hz = M(host[0], host[1]); nx, nz = hx + (x - host[0]) * 1.4, hz + (z - host[1]) * 1.4; k = 1.4
        else: nx, nz = M(x, z); k = 1.4
        p['pos'] = [round(nx, 3), round(nz, 3)]; p['radius'] = round(r * k, 3)
    # monsters: wide spread spawners
    for m in Z['monsters']:
        m['pos'] = P2(m['pos']); m['radius'] = round(max(12.0, m['radius'] * 2.6), 1)
        m['count'] = int(math.ceil(m['count'] * 1.6)) if m['count'] > 1 else 1; m['spread'] = 6.0
    # props
    old_props = Z['props']; out = []
    pts_old = [(p['pos'][0], p['pos'][1]) for p in old_props]
    paths = [(list(zip(p['pos'][0::2], p['pos'][1::2])), p['width']) for p in Z['patches'] if p['shape'] == 'path']
    newdiscs = [(p['pos'][0], p['pos'][1], p['radius'], p['tex']) for p in Z['patches'] if p['shape'] == 'disc']
    x0, z0, x1, z1 = Z['bounds']
    def ok_copy(x, z, need):
        if not (x0 + 1.2 < x < x1 - 1.2 and z0 + 1.2 < z < z1 - 1.2): return False
        for pts, w in paths:
            for a, b in zip(pts, pts[1:]):
                if seg_dist(x, z, a, b) < w / 2 + need: return False
        for (dx, dz, dr, t) in newdiscs:
            if t in ('water', 'boss_floor', 'plaster_blue', 'stone_wall') and math.hypot(x - dx, z - dz) < dr + need: return False
        for p in Z['portals']:
            if math.hypot(x - p['pos'][0], z - p['pos'][1]) < 5: return False
        for s in Z['spawns']:
            if math.hypot(x - s['pos'][0], z - s['pos'][1]) < 4: return False
        for g in rig:
            for r in [h['rect'] for h in g.get('mem', [])]:
                if in_rect(x, z, r, 1.8): return False
        if B and B.get('center') and math.hypot(x - B['center'][0], z - B['center'][1]) < B['radius'] + 3: return False
        if B and B.get('gate') and math.hypot(x - B['gate'][0], z - B['gate'][1]) < 4.5: return False
        return True
    solid_pts = []
    for i, p in enumerate(old_props):
        q = dict(p); q['pos'] = P2(p['pos']); out.append(q)
        if p['type'] in SOLID: solid_pts.append((q['pos'][0], q['pos'][1]))
    if Z['id'] != 'forest':
        for i, p in enumerate(old_props):
            if p['type'] in NOFILL or group_of(*p['pos']): continue
            x, z = p['pos']
            nn = min((math.hypot(x - a, z - b) for j, (a, b) in enumerate(pts_old) if j != i), default=3.0)
            d = max(1.4, min(nn, 6.0)) * 0.5 * K
            a0 = rnd.uniform(0, math.tau); cx, cz = M(x, z)
            for k in range(5):
                a = a0 + (k + 1) * math.tau / 4 + rnd.uniform(-0.4, 0.4) if k < 3 else rnd.uniform(0, math.tau); r = d * (rnd.uniform(0.75, 1.15) if k < 3 else rnd.uniform(1.3, 1.7))
                nx, nz = cx + math.cos(a) * r, cz + math.sin(a) * r
                solid = p['type'] in SOLID; need = 1.2 if solid else 0.3
                if not ok_copy(nx, nz, need): continue
                if solid and any(math.hypot(nx - a2, nz - b2) < 1.5 for (a2, b2) in solid_pts): continue
                q = dict(p); q['pos'] = [round(nx, 2), round(nz, 2)]; q['rot'] = round(rnd.uniform(0, 360), 1)
                q['scale'] = round(p.get('scale', 1) * rnd.uniform(0.85, 1.15), 2); out.append(q)
                if solid: solid_pts.append((nx, nz))
    Z['props'] = out
    Z['scaled'] = 2

# ---------------------------------------------------------------- zone meshes (terrain + visible patches) from the data
PAINTED = ('dirt', 'cobble', 'cobble_warm', 'forest_floor', 'grass', 'grass_flowers')
def heightf(Z):
    hs = Z['heights']
    def h(x, z):
        v0 = 0.0
        for r in hs:
            q = r['rect']
            if x < q[0] or x > q[2] or z < q[1] or z > q[3]: continue
            if r['kind'] == 'ramp':
                ax = r['axis']
                t = (x - q[0]) / (q[2] - q[0]) if ax == '+x' else (q[2] - x) / (q[2] - q[0]) if ax == '-x' else (z - q[1]) / (q[3] - q[1]) if ax == '+z' else (q[3] - z) / (q[3] - q[1])
                v = r['heightFrom'] + (r['height'] - r['heightFrom']) * t
            else: v = r['height']
            v0 = max(v0, v)
        return v0
    return h

class Mesh:
    def __init__(s, g, tex, color=(1, 1, 1, 1), shadow=False, water=False): s.d = {'g': g, 'kind': 'lit', 'tex': tex, 'water': water, 'color': list(color), 'shadow': shadow, 'p': [], 'n': [], 'uv': [], 'i': []}
    def quad(s, vs, uvs, nrm):
        """vs in Unity coords (x, y, z); stored as three.js (x, y, -z); winding picked so the face looks along nrm"""
        b = len(s.d['p']) // 3
        for (x, y, z), (u, v) in zip(vs, uvs): s.d['p'] += [round(x, 4), round(y, 4), round(-z, 4)]; s.d['uv'] += [round(u, 4), round(v, 4)]; s.d['n'] += [nrm[0], nrm[1], -nrm[2]]
        P = [(vs[k][0], vs[k][1], -vs[k][2]) for k in range(len(vs))]
        def face(a, b2, c):
            u = [P[b2][j] - P[a][j] for j in range(3)]; w = [P[c][j] - P[a][j] for j in range(3)]
            return (u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0])
        tn = (nrm[0], nrm[1], -nrm[2]); f = face(0, 1, 2)
        ccw = sum(f[j] * tn[j] for j in range(3)) > 0
        tris = [(0, 1, 2), (0, 2, 3)] if len(vs) == 4 else [(0, 1, 2)]
        for t in tris: s.d['i'] += [b + t[0], b + t[1], b + t[2]] if ccw else [b + t[0], b + t[2], b + t[1]]

def build_mesh(Z):
    groups = [{'name': 'ground'}, {'name': 'terrain'}, {'name': 'patches'}]
    meshes = {}
    def M_(g, tex, **kw):
        k = (g, tex, kw.get('water', False))
        if k not in meshes: meshes[k] = Mesh(g, 'Arcan/Env/' + tex, **kw)
        return meshes[k]
    H = heightf(Z)
    for h in Z['heights']:
        r = h['rect']; a, b, c, d = r; top = M_(1, h['tex'], shadow=True); wall = M_(1, h['sideTex'], color=(0.82, 0.8, 0.78, 1), shadow=True)
        hy = lambda x, z: H(x, z) if h['kind'] == 'ramp' else h['height']
        if h['kind'] == 'platform':
            y = h['height']; top.quad([(a, y, b), (a, y, d), (c, y, d), (c, y, b)], [(a / 2, b / 2), (a / 2, d / 2), (c / 2, d / 2), (c / 2, b / 2)], (0, 1, 0))
            for (p0, p1, n) in [((a, b), (c, b), (0, 0, -1)), ((c, b), (c, d), (1, 0, 0)), ((c, d), (a, d), (0, 0, 1)), ((a, d), (a, b), (-1, 0, 0))]:
                L = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); u0 = (p0[0] + p0[1]) / 2
                wall.quad([(p0[0], 0, p0[1]), (p0[0], y, p0[1]), (p1[0], y, p1[1]), (p1[0], 0, p1[1])], [(u0, 0), (u0, y / 2), (u0 + L / 2, y / 2), (u0 + L / 2, 0)], n)
        else:
            ax = h['axis']; y0, y1 = h['heightFrom'], h['height']; run = (c - a) if 'x' in ax else (d - b); sl = (y1 - y0) / run
            if ax == '+x': n = (-sl, 1, 0)
            elif ax == '-x': n = (sl, 1, 0)
            elif ax == '+z': n = (0, 1, -sl)
            else: n = (0, 1, sl)
            l = math.sqrt(sum(v * v for v in n)); n = tuple(round(v / l, 4) for v in n)
            corners = [(a, b), (a, d), (c, d), (c, b)]
            top.quad([(x, hy(x, z), z) for x, z in corners], [(x / 2, z / 2) for x, z in corners], n)
            sides = [((a, b), (c, b), (0, 0, -1)), ((c, b), (c, d), (1, 0, 0)), ((c, d), (a, d), (0, 0, 1)), ((a, d), (a, b), (-1, 0, 0))]
            for (p0, p1, nn) in sides:
                ya, yb = hy(*p0), hy(*p1)
                if ya < 0.01 and yb < 0.01: continue
                L = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); u0 = (p0[0] + p0[1]) / 2
                wall.quad([(p0[0], 0, p0[1]), (p0[0], ya, p0[1]), (p1[0], yb, p1[1]), (p1[0], 0, p1[1])], [(u0, 0), (u0, ya / 2), (u0 + L / 2, yb / 2), (u0 + L / 2, 0)], nn)
    lift = 0.02
    for p in Z['patches']:
        if p['tex'] in PAINTED or p['shape'] != 'disc': continue
        lift += 0.002; m = M_(2, p['tex'], water=p['tex'] == 'water'); cx, cz = p['pos']; R = p['radius']; seg = 40
        for k in range(seg):
            t0, t1 = k / seg * math.tau, (k + 1) / seg * math.tau
            vs = [(cx, H(cx, cz) + lift, cz), (cx + math.cos(t1) * R, H(cx, cz) + lift, cz + math.sin(t1) * R), (cx + math.cos(t0) * R, H(cx, cz) + lift, cz + math.sin(t0) * R)]
            m.quad(vs, [(v[0] / 2, v[2] / 2) for v in vs], (0, 1, 0))
    return {'zone': Z['id'], 'groups': groups, 'smoke': [], 'fountain': [], 'meshes': [m.d for m in meshes.values()]}

if __name__ == '__main__':
    F = zone('forest')
    if F.get('scaled'): sys.exit('already scaled')
    G = make_grove(F)
    # forest: drop the boss corner (platform, ramp, boss, plateau spawn), add the warp to the grove where the ramp was
    F['heights'] = []; F.pop('boss', None)
    F['spawns'] = [s for s in F['spawns'] if s['id'] != 'plateau'] + [{'id': 'from_grove', 'pos': [6.2, 15.0], 'rot': 180.0}]
    F['portals'].append({'id': 'to_grove', 'label': '독버섯 군락지', 'pos': [6.6, 19.4], 'radius': 1.8, 'targetZone': 'mushroom_grove', 'targetSpawn': 'from_forest', 'minLevel': 0})
    p0 = F['patches'][0]; assert p0['pos'][-4:] == [6.5, 19, 9.5, 19]; p0['pos'] = p0['pos'][:-2]
    F['props'] = [p for p in F['props'] if not in_rect(p['pos'][0], p['pos'][1], [8.0, 8.0, 50.0, 50.0])]
    for i, zid in enumerate(FIELDS): scale_zone(zone(zid), 9100 + i)
    zl = zones['zones']; zl.insert(zl.index(F) + 1, G)
    for zid in FIELDS + ['mushroom_grove']:
        Z = zone(zid); from collections import Counter
        print(zid, Z['bounds'], len(Z['props']), dict(Counter(p['type'] for p in Z['props']).most_common(6)), 'monsters', [(m['monster'], m['count']) for m in Z['monsters']])
    if '--write' in sys.argv:
        open(ZPATH, 'w').write(json.dumps(zones, ensure_ascii=False, indent=1) + ('\n' if raw.endswith('\n') else ''))
        for zid in FIELDS + ['mushroom_grove']:
            json.dump(build_mesh(zone(zid)), open(os.path.join(ROOT, 'assets', f'zone_{zid}.json'), 'w'), separators=(',', ':'))
        print('wrote')
