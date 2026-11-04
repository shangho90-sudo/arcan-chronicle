"""Stylised hand-painted nature assets, built procedurally in Blender (bpy) and exported as GLB with LODs.

    python3 tools/blender/assets.py [names...]          (bpy module, headless)  -> tools/blender/out/*.glb
    python3 tools/blender/wrap.py                         -> assets/forest/bl/*.glb.json + manifest.json

Per asset: <name>_l0 (high detail), <name> (gameplay, used by the game), <name>_l2 (low), <name>_lo (shadow proxy, no
colours). Trees: Trunk + Branch_* + RootCluster + Foliage blobs (metaball clouds: big ball + scalloped satellites) +
radial cross leaf cards for a leafy silhouette. Foliage normals are bent away from the blob centres (soft painted
shading); AO is baked with Cycles into the colour attribute and combined with a height / top-light gradient.
Rocks: convex hulls of jittered ellipsoid points (clear plane separation) + bevel + curvature edge highlight + moss.
Plants: crossed multi-card clumps on the plants atlas.
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, noise
import blib as B

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'); os.makedirs(OUT, exist_ok=True)
LODS = {'l0': dict(sub=(4, 3), cards=150, ring=12), '': dict(sub=(3, 2), cards=80, ring=8), 'l2': dict(sub=(2, 2), cards=30, ring=6),
        'lo': dict(sub=(1, 1), cards=0, ring=5)}

# ---------------------------------------------------------------------------------------------- trunks
def tube(bm, pts, radii, ring, uvl, v0=0.0, flare=None):
    """tapered tube along pts; flare(t, angle) -> radius multiplier (root lobes)"""
    rings = []; L = 0
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        a = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0)); u = d.cross(a).normalized(); w = d.cross(u).normalized()
        if i: L += (p - pts[i - 1]).length
        rr = []
        for k in range(ring):
            ang = k / ring * 2 * math.pi; r = radii[i] * (flare(i / (len(pts) - 1), ang) if flare else 1)
            r *= 1 + 0.06 * noise.noise(Vector((math.cos(ang) * 2, math.sin(ang) * 2, p.z * 1.7)))
            rr.append((bm.verts.new(p + (u * math.cos(ang) + w * math.sin(ang)) * r), k / ring, L))
        rings.append(rr)
    for i in range(len(rings) - 1):
        for k in range(ring):
            a, b = rings[i][k], rings[i][(k + 1) % ring]; c, d = rings[i + 1][(k + 1) % ring], rings[i + 1][k]
            f = bm.faces.new((a[0], b[0], c[0], d[0])); f.material_index = 0
            for l, (uu, vv) in zip(f.loops, ((a[1], a[2]), (b[1] if k + 1 < ring else 1.0, b[2]), (c[1] if k + 1 < ring else 1.0, c[2]), (d[1], d[2]))):
                l[uvl].uv = (uu * 1.5, vv * 0.7 + v0)
    top = rings[-1]; c = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * radii[-1] * 0.3)
    for k in range(ring):
        f = bm.faces.new((top[k][0], top[(k + 1) % ring][0], c)); f.material_index = 0
        for l in f.loops: l[uvl].uv = (0.5, 0.5)

def curve(p0, p1, bend, n):
    out = []
    for i in range(n + 1):
        t = i / n; p = p0.lerp(p1, t); p += bend * math.sin(math.pi * t); out.append(p)
    return out

# ---------------------------------------------------------------------------------------------- foliage
def cluster(c, R, rnd, flat=1.0, sats=6, droop=0.0):
    balls = [(c, R, (1, 1, flat))]
    for k in range(sats):
        a = rnd.uniform(0, 2 * math.pi) if sats < 3 else (k / sats) * 2 * math.pi + rnd.uniform(-0.4, 0.4)
        z = rnd.uniform(-0.35 - droop, 0.85)
        d = Vector((math.cos(a) * math.sqrt(1 - z * z), math.sin(a) * math.sqrt(1 - z * z), z * flat))
        balls.append((c + d * R * rnd.uniform(0.6, 0.78), R * rnd.uniform(0.45, 0.62), (1, 1, flat)))
    return balls

TREES = {
    # name: trunk path, branch ends, clusters [(centre, R, flat, sats, droop)], material variant, trunk radius
    'tree_broad_a': dict(trunk=[(0, 0, 0), (0.15, 0.05, 1.8), (0.25, 0.0, 3.4)], r=0.24, var='', seed=11,
        branches=[((0.2, 0.0, 2.6), (1.0, 0.3, 3.6)), ((0.2, 0.0, 2.9), (-0.9, -0.2, 3.7)), ((0.25, 0, 3.2), (0.2, -0.85, 3.9))],
        clusters=[((0.1, 0.0, 4.35), 1.2, 0.92, 7, 0), ((1.05, 0.35, 3.85), 0.95, 0.9, 6, 0.1), ((-0.95, -0.2, 3.8), 0.9, 0.9, 6, 0.1),
                  ((0.25, -0.95, 4.0), 0.85, 0.9, 5, 0), ((-0.35, 0.9, 4.05), 0.82, 0.9, 5, 0), ((0.35, 0.15, 5.05), 0.78, 0.9, 6, 0)]),
    'tree_broad_b': dict(trunk=[(0, 0, 0), (-0.15, 0.05, 1.3), (-0.3, 0.0, 2.3)], r=0.26, var='_warm', seed=23,
        branches=[((-0.3, 0, 2.2), (-1.15, 0.25, 3.45)), ((-0.3, 0, 2.2), (0.75, -0.2, 3.7)), ((-0.25, 0, 2.3), (-0.15, 0.45, 4.3))],
        clusters=[((-1.15, 0.25, 3.6), 1.05, 0.88, 6, 0.15), ((0.8, -0.2, 3.85), 1.1, 0.88, 7, 0.1), ((-0.2, 0.45, 4.55), 0.9, 0.9, 6, 0),
                  ((0.1, -0.65, 4.35), 0.72, 0.9, 5, 0), ((-0.55, -0.45, 3.4), 0.6, 0.9, 4, 0.2)]),
    'tree_forest_tall': dict(trunk=[(0, 0, 0), (0.05, 0.0, 3.0), (0.0, 0.05, 6.6)], r=0.22, var='_cool', seed=37, tiers=True,
        branches=[], clusters=[]),
    'tree_forest_round': dict(trunk=[(0, 0, 0), (0.1, 0.05, 1.4), (0.05, 0.0, 2.6)], r=0.22, var='', seed=41,
        branches=[((0.05, 0, 2.3), (0.7, 0.2, 2.9)), ((0.05, 0, 2.4), (-0.6, -0.3, 3.0))],
        clusters=[((0.0, 0.0, 3.35), 1.4, 0.9, 9, 0.25), ((0.75, 0.25, 2.95), 0.8, 0.9, 5, 0.3), ((-0.7, -0.3, 3.0), 0.8, 0.9, 5, 0.3),
                  ((0.1, 0.1, 4.25), 0.85, 0.9, 6, 0)]),
}

def tiers_clusters(rnd):
    cl = []
    for z, R in [(1.75, 1.45), (2.75, 1.28), (3.7, 1.08), (4.55, 0.9), (5.3, 0.7), (5.95, 0.5)]:
        n = 4; cl.append(((0, 0, z + 0.15), R * 0.64, 0.62, 0, 0))
        for k in range(n):
            a = k / n * 2 * math.pi + rnd.uniform(-0.3, 0.3) + z
            cl.append(((math.cos(a) * R * 0.62, math.sin(a) * R * 0.62, z - 0.12), R * rnd.uniform(0.48, 0.58), 0.6, 1, 0.6))
    cl.append(((0, 0, 6.55), 0.36, 0.95, 3, 0))
    return cl

def build_tree(name, sp, lod):
    P = LODS[lod]; rnd = random.Random(sp['seed'])
    mats = [B.material('M_bark'), B.material('M_foliage' + sp['var']), B.material('M_leaf' + sp['var'], alpha=True, double=True)]
    # trunk + branches + root cluster
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UV')
    tp = [Vector(p) for p in sp['trunk']]; pts = []
    for i in range(len(tp) - 1): pts += curve(tp[i], tp[i + 1], Vector((0, 0, 0)), 4)[(1 if i else 0):]
    n = len(pts); R0 = sp['r']
    radii = [R0 * (1.0 - 0.55 * (i / (n - 1))) for i in range(n)]
    flare = lambda t, a: 1 + max(0, 1 - t / 0.16) ** 2 * (0.55 + 0.45 * math.cos(5 * a))
    tube(bm, pts, radii, P['ring'], uvl, flare=flare)
    for (a, b) in sp['branches']:
        a, b = Vector(a), Vector(b); bp = curve(a, b, Vector((0, 0, 0.25)), 4)
        tube(bm, bp, [R0 * 0.42 * (1 - 0.6 * i / 4) for i in range(5)], max(5, P['ring'] - 2), uvl, v0=0.3)
    if lod != 'lo':
        for k in range(5):                                             # roots spreading into the ground
            a = k / 5 * 2 * math.pi + rnd.uniform(-0.3, 0.3); L = rnd.uniform(0.25, 0.45)
            p0 = Vector((math.cos(a) * R0 * 0.5, math.sin(a) * R0 * 0.5, 0.2)); p1 = Vector((math.cos(a) * (R0 + L), math.sin(a) * (R0 + L), -0.05))
            tube(bm, curve(p0, p1, Vector((0, 0, 0.05)), 3), [R0 * 0.5, R0 * 0.4, R0 * 0.28, R0 * 0.14], 5, uvl, v0=0.6)
    trunk = B.obj_from_bmesh(bm, name + '_trunk', mats)
    # foliage clouds
    cl = tiers_clusters(rnd) if sp.get('tiers') else sp['clusters']
    balls = []; centres = []
    for (c, R, flat, sats, droop) in cl:
        c = Vector(c); balls += cluster(c, R, rnd, flat, sats, droop); centres.append((c, R))
    fol = B.ball_cloud(name + '_fol', balls, *P['sub'], seed=sp['seed'])
    for m in mats: fol.data.materials.append(m)
    for p in fol.data.polygons: p.material_index = 1
    B.box_uv(fol, 0.5)
    parts = [trunk, fol]
    if P['cards']:
        cs = sum(R for _, R in centres) / len(centres)
        cbm = B.cards_on_surface(fol, P['cards'], 0.55 * cs + 0.3, 2, sp['seed'] + 5, sink=0.3, centres=centres)
        cards = B.obj_from_bmesh(cbm, name + '_cards', mats); parts.append(cards)
    ob = B.join(parts, name + ('_' + lod if lod else ''))
    if lod == 'lo': return ob
    # soft blob shading for foliage + cards, real normals for wood
    me = ob.data; bend = set()
    for p in me.polygons:
        if p.material_index > 0: bend.update(p.vertices)
    out = []
    for v in me.vertices:
        if v.index in bend:
            c, R = min(centres, key=lambda cr: (v.co - cr[0]).length / cr[1]); d = (v.co - c)
            d = d.normalized() if d.length > 1e-6 else Vector((0, 0, 1)); out.append((d * 0.85 + v.normal * 0.15).normalized())
        else: out.append(v.normal.copy())
    me.normals_split_custom_set_from_vertices(out)
    B.bake_ao(ob, samples=16 if lod == 'l2' else 24)
    top = max(c.z + R for c, R in centres)
    B.paint_light(ob, ao_pow=1.25, ao_min=0.26, h0=0.0, h1=top, bottom=0.6, top=1.05, up=0.3, hue=0.1, seed=sp['seed'],
                  per_mat={0: (1.0, 0.96, 0.9), 1: (1, 1, 1), 2: (1.18, 1.18, 1.1)})
    card_light(ob, centres, top)
    return ob

def card_light(ob, centres, top):
    me = ob.data; ca = me.color_attributes['Col']
    for p in me.polygons:
        if p.material_index != 2: continue
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            c, R = min(centres, key=lambda cr: (co - cr[0]).length / cr[1]); n = (co - c).normalized()
            t = max(0.0, min(1.0, co.z / top)); l = (0.62 + 0.4 * t) * (0.82 + 0.3 * max(-0.3, n.z))
            ca.data[li].color = (min(1, l * 1.04), min(1, l * 1.04), min(1, l * 0.96), 1)

# ---------------------------------------------------------------------------------------------- shrubs
SHRUBS = {
    'shrub_a': dict(var='', seed=51, clusters=[((0, 0, 0.5), 0.55, 0.9, 6, 0.3), ((0.35, 0.2, 0.32), 0.36, 0.9, 3, 0.2)]),
    'shrub_b': dict(var='_cool', seed=53, clusters=[((-0.45, 0, 0.36), 0.48, 0.85, 5, 0.3), ((0.42, 0.2, 0.4), 0.52, 0.85, 5, 0.3), ((0, -0.38, 0.3), 0.42, 0.85, 4, 0.3)]),
}
def build_shrub(name, sp, lod):
    P = LODS[lod]; rnd = random.Random(sp['seed'])
    mats = [B.material('M_bark'), B.material('M_foliage' + sp['var']), B.material('M_leaf' + sp['var'], alpha=True, double=True)]
    balls = []; centres = []
    for (c, R, flat, sats, droop) in sp['clusters']:
        c = Vector(c); balls += cluster(c, R, rnd, flat, sats, droop); centres.append((c, R))
    fol = B.ball_cloud(name, balls, *P['sub'], seed=sp['seed'])
    for m in mats: fol.data.materials.append(m)
    for p in fol.data.polygons: p.material_index = 1
    B.box_uv(fol, 0.9)
    parts = [fol]
    if P['cards']:
        cbm = B.cards_on_surface(fol, max(12, P['cards'] // 3), 0.4, 2, sp['seed'], sink=0.3, centres=centres)
        parts.append(B.obj_from_bmesh(cbm, name + '_c', mats))
    ob = B.join(parts, name + ('_' + lod if lod else '')) if len(parts) > 1 else parts[0]
    ob.name = name + ('_' + lod if lod else '')
    if lod == 'lo': return ob
    me = ob.data; out = []
    for v in me.vertices:
        c, R = min(centres, key=lambda cr: (v.co - cr[0]).length / cr[1]); d = (v.co - c).normalized()
        out.append((d * 0.85 + v.normal * 0.15).normalized())
    me.normals_split_custom_set_from_vertices(out)
    B.bake_ao(ob, samples=16)
    B.paint_light(ob, ao_pow=1.2, ao_min=0.3, h0=0, h1=1.0, bottom=0.6, top=1.05, up=0.28, hue=0.1, seed=sp['seed'])
    card_light(ob, centres, 1.1)
    return ob

# ---------------------------------------------------------------------------------------------- rocks
ROCKS = {   # size (x,y,z), points, moss amount, extra lumps, stone variant
    'rock_small': dict(size=(0.42, 0.36, 0.24), n=14, moss=0.0, seed=61, mat='M_stone'),
    'rock_medium': dict(size=(1.05, 0.9, 0.72), n=18, moss=0.0, seed=62, mat='M_stone'),
    'rock_moss': dict(size=(1.35, 1.1, 0.95), n=20, moss=0.45, seed=63, mat='M_stone'),
    'rock_roadside': dict(size=(1.05, 0.7, 0.42), n=16, moss=0.0, seed=64, mat='M_stone_warm'),
    'rock_large': dict(size=(1.6, 1.3, 1.6), n=22, moss=0.25, seed=65, mat='M_stone', lumps=[((0.95, 0.35, 0), (1.0, 0.85, 0.85)), ((-0.6, -0.65, 0), (0.85, 0.75, 0.6))]),
}
def hull(bm0, centre, size, n, rnd, bevel, segs):
    bm = bmesh.new()
    for k in range(n):
        z = rnd.uniform(-0.15, 1); a = rnd.uniform(0, 2 * math.pi); rr = math.sqrt(max(0, 1 - z * z))
        j = rnd.uniform(0.82, 1.08)
        bm.verts.new((centre[0] + math.cos(a) * rr * size[0] * 0.5 * j, centre[1] + math.sin(a) * rr * size[1] * 0.5 * j, max(-0.08, z) * size[2] * j))
    for a in range(4):                                                   # flat-ish footing
        bm.verts.new((centre[0] + math.cos(a * 1.57 + 0.4) * size[0] * 0.42, centre[1] + math.sin(a * 1.57 + 0.4) * size[1] * 0.42, -0.08))
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bmesh.ops.dissolve_limit(bm, angle_limit=0.12, verts=bm.verts, edges=bm.edges)
    if segs: bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segs, profile=0.6, affect='EDGES', clamp_overlap=True)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    me = bpy.data.meshes.new('_h'); bm.to_mesh(me); bm.free()
    bm0.from_mesh(me); bpy.data.meshes.remove(me)

def build_rock(name, sp, lod):
    rnd = random.Random(sp['seed']); segs = {'l0': 3, '': 2, 'l2': 1, 'lo': 0}[lod]
    mats = [B.material(sp['mat']), B.material('M_moss')]
    bm = bmesh.new(); s = sp['size']; bev = min(s) * 0.07
    hull(bm, (0, 0), s, sp['n'], rnd, bev, segs)
    for (off, k) in sp.get('lumps', []):
        hull(bm, (off[0] * s[0] * 0.5, off[1] * s[1] * 0.5), (s[0] * k[0] * 0.7, s[1] * k[1] * 0.7, s[2] * k[2] * 0.7), sp['n'] - 4, rnd, bev * 0.8, segs)
    ob = B.obj_from_bmesh(bm, name + ('_' + lod if lod else ''), mats)
    if lod == 'lo': return ob
    me = ob.data
    for p in me.polygons:                                                 # moss on the upward faces, broken up by noise
        nv = noise.noise(p.center * 2.3 + Vector((sp['seed'], 0, 0)))
        if sp['moss'] and p.normal.z > 0.62 - sp['moss'] * 0.35 + nv * 0.25 and p.center.z > s[2] * 0.35: p.material_index = 1
    B.box_uv(ob, 0.9)
    # curvature highlight: convex vertices (normals of neighbouring faces disagree) get a painted light edge
    edge = {}
    for v in me.vertices:
        pass
    bm2 = bmesh.new(); bm2.from_mesh(me)
    for v in bm2.verts:
        fn = [f.normal for f in v.link_faces]
        if len(fn) > 1:
            avg = sum(fn, Vector()).normalized(); spread = sum(1 - avg.dot(n) for n in fn) / len(fn)
            edge[v.index] = min(0.22, spread * 1.6) * (0.6 + 0.4 * max(0, avg.z))
    bm2.free()
    B.bake_ao(ob, samples=24)
    B.paint_light(ob, ao_pow=1.3, ao_min=0.28, h0=-0.05, h1=s[2] * 1.05, bottom=0.68, top=1.12, up=0.16, hue=0.06, seed=sp['seed'],
                  per_mat={1: (0.78, 0.86, 0.66)}, edge=edge)
    return ob

# ---------------------------------------------------------------------------------------------- plants (multi-card clumps)
PLANTS = {  # atlas cell (4 x 2, row-major from the top-left), height, width, cards
    'grass_short': (0, 0.42, 0.55, 4), 'grass_tall': (1, 0.85, 0.55, 4), 'flower_white': (2, 0.55, 0.6, 4), 'flower_yellow': (3, 0.55, 0.6, 4),
    'flower_pink': (4, 0.55, 0.6, 4), 'flower_mixed': (5, 0.6, 0.65, 4), 'fern': (6, 0.75, 0.85, 5), 'clover': (7, 0.28, 0.6, 3),
}
def build_plant(name, sp):
    cell, h, w, nc = sp; rnd = random.Random(hash(name) & 0xffff)
    mats = [B.material('M_plants', alpha=True, double=True)]
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UV')
    u0, u1 = (cell % 4) / 4, (cell % 4 + 1) / 4; v1 = 1 - (cell // 4) / 2; v0 = v1 - 0.5
    for k in range(nc):
        a = k / nc * math.pi + rnd.uniform(-0.15, 0.15); off = Vector((rnd.uniform(-0.12, 0.12), rnd.uniform(-0.12, 0.12), 0)) * (k >= 3)
        s = 1 if k < 3 else 0.75; d = Vector((math.cos(a), math.sin(a), 0)) * w * 0.5 * s; tilt = Vector((-math.sin(a), math.cos(a), 0)) * rnd.uniform(-0.08, 0.08)
        vs = [bm.verts.new(off - d), bm.verts.new(off + d), bm.verts.new(off + d + tilt + Vector((0, 0, h * s))), bm.verts.new(off - d + tilt + Vector((0, 0, h * s)))]
        f = bm.faces.new(vs)
        for l, uv in zip(f.loops, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))): l[uvl].uv = uv
    ob = B.obj_from_bmesh(bm, name, mats)
    ob.data.normals_split_custom_set_from_vertices([Vector((0.15 * v.co.x, 0.15 * v.co.y, 1)).normalized() for v in ob.data.vertices])
    ca = B.ensure_col(ob)
    for li, l in enumerate(ob.data.loops):
        z = ob.data.vertices[l.vertex_index].co.z / h; g = 0.55 + 0.55 * z
        ca.data[li].color = (min(1, g), min(1, g), min(1, g * 0.97), 1)
    return ob

# ---------------------------------------------------------------------------------------------- main
def run(names):
    for name in names:
        if name in PLANTS:
            B.reset(); ob = build_plant(name, PLANTS[name]); B.export_glb(ob, os.path.join(OUT, name + '.glb')); print(name, B.tri_count(ob), flush=True); continue
        for lod in ('l0', '', 'l2', 'lo'):
            B.reset()
            if name in TREES: ob = build_tree(name, TREES[name], lod)
            elif name in SHRUBS: ob = build_shrub(name, SHRUBS[name], lod)
            elif name in ROCKS: ob = build_rock(name, ROCKS[name], lod)
            else: raise SystemExit('unknown asset ' + name)
            fn = name + ('_' + lod if lod else '')
            B.export_glb(ob, os.path.join(OUT, fn + '.glb')); print(fn, B.tri_count(ob), flush=True)

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    run(args or list(TREES) + list(SHRUBS) + list(ROCKS) + list(PLANTS))
