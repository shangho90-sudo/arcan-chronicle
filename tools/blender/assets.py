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


# ---------------------------------------------------------------------------------------------- town props
def _mesh(bm, name, mats):
    return B.obj_from_bmesh(bm, name, mats)

def prim(kind, mats, mat, name='p', **k):
    """small primitive as an object: kind in box / cyl / cone / sphere / lathe; k: size, loc, rot, seg, bevel"""
    bm = bmesh.new(); seg = k.get('seg', 12)
    if kind == 'box':
        r = bmesh.ops.create_cube(bm, size=1.0); sx, sy, sz = k['size']
        for v in r['verts']: v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz + sz / 2))
        if k.get('bevel'): bmesh.ops.bevel(bm, geom=list(bm.edges), offset=k['bevel'], segments=2, profile=0.6, affect='EDGES', clamp_overlap=True)
    elif kind in ('cyl', 'cone'):
        r0, r1, h = k['size']
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r0, radius2=r1, depth=h)
        for v in bm.verts: v.co.z += h / 2
        if k.get('bevel'): bmesh.ops.bevel(bm, geom=[e for e in bm.edges if len(e.link_faces) == 2 and abs(e.link_faces[0].normal.dot(e.link_faces[1].normal)) < 0.5], offset=k['bevel'], segments=2, profile=0.6, affect='EDGES', clamp_overlap=True)
    elif kind == 'sphere':
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=k['size'])
    elif kind == 'lathe':                                   # profile [(r, z)...] revolved
        prof = k['profile']; rings = []
        for (r, z) in prof:
            rings.append([bm.verts.new((math.cos(a / seg * 2 * math.pi) * r, math.sin(a / seg * 2 * math.pi) * r, z)) for a in range(seg)])
        for i in range(len(rings) - 1):
            for a in range(seg): bm.faces.new((rings[i][a], rings[i][(a + 1) % seg], rings[i + 1][(a + 1) % seg], rings[i + 1][a]))
        bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    if k.get('scale'): bmesh.ops.scale(bm, vec=Vector(k['scale']), verts=bm.verts)
    if k.get('rot'): bmesh.ops.rotate(bm, cent=Vector((0, 0, 0)), matrix=__import__('mathutils').Euler(k['rot']).to_matrix(), verts=bm.verts)
    if k.get('loc'): bmesh.ops.translate(bm, vec=Vector(k['loc']), verts=bm.verts)
    for f in bm.faces: f.material_index = mat
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _mesh(bm, name, mats)

def flowers_on(mats, mi, centre, radius, n, cells, h, seed):
    """crossed flower / leaf cards (plants atlas) scattered over a disc - for planters and flower boxes"""
    rnd = random.Random(seed); bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UV')
    for k in range(n):
        a = rnd.uniform(0, 2 * math.pi); d = math.sqrt(rnd.random()) * radius; c = Vector(centre) + Vector((math.cos(a) * d * (radius[0] if isinstance(radius, tuple) else 1), math.sin(a) * d, 0)) if False else Vector(centre) + Vector((math.cos(a) * d, math.sin(a) * d, 0))
        cell = rnd.choice(cells); u0, u1 = (cell % 4) / 4, (cell % 4 + 1) / 4; v1 = 1 - (cell // 4) / 2; v0 = v1 - 0.5
        hh = h * rnd.uniform(0.8, 1.2); w = hh * 0.6
        for j in range(2):
            t = a + j * math.pi / 2 + rnd.uniform(-0.3, 0.3); dv = Vector((math.cos(t), math.sin(t), 0)) * w
            vs = [bm.verts.new(c - dv), bm.verts.new(c + dv), bm.verts.new(c + dv + Vector((0, 0, hh * 2))), bm.verts.new(c - dv + Vector((0, 0, hh * 2)))]
            f = bm.faces.new(vs); f.material_index = mi
            for l, uv in zip(f.loops, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))): l[uvl].uv = uv
    return _mesh(bm, 'fl', mats)

def shrub_blob(mats, mi, centre, R, seed, sub=2):
    rnd = random.Random(seed); balls = cluster(Vector(centre), R, rnd, 0.85, 5, 0.2)
    o = B.ball_cloud('sb', balls, sub + 1, sub, seed=seed)
    for m in mats: o.data.materials.append(m)
    for p in o.data.polygons: p.material_index = mi
    B.box_uv(o, 1.0); return o, [(Vector(centre), R)]

TOWN_MATS = ['M_stone_warm', 'M_wood', 'M_wood_dark', 'M_iron', 'M_gold', 'M_navy', 'M_glow', 'M_soil', 'M_foliage', 'M_plants', 'M_cream', 'M_stone']
def tmats():
    return [B.material(n, alpha=(n == 'M_plants'), double=(n == 'M_plants' or n == 'M_navy')) for n in TOWN_MATS]
TI = {n: i for i, n in enumerate(TOWN_MATS)}

def build_town(name, lod):
    mats = tmats(); P = []; blob = []; seg = {'l0': 20, '': 14, 'l2': 10, 'lo': 6}[lod]; flo = lod != 'lo'
    S, W, WD, IR, GD, NV, GL, SO, FO, PL, CR, ST = [TI[n] for n in TOWN_MATS]
    if name == 'town_lamp':
        P += [prim('box', mats, S, size=(0.95, 0.95, 0.5), bevel=0.05), prim('box', mats, S, size=(1.05, 1.05, 0.1), loc=(0, 0, 0.5), bevel=0.03),
              prim('box', mats, SO, size=(0.86, 0.86, 0.04), loc=(0, 0, 0.58))]
        P += [prim('cyl', mats, IR, size=(0.08, 0.06, 3.0), loc=(0, 0, 0.6), seg=seg), prim('cyl', mats, GD, size=(0.12, 0.12, 0.08), loc=(0, 0, 0.62), seg=seg),
              prim('cyl', mats, GD, size=(0.1, 0.1, 0.07), loc=(0, 0, 1.9), seg=seg), prim('cyl', mats, GD, size=(0.11, 0.11, 0.07), loc=(0, 0, 3.3), seg=seg)]
        # lantern: glowing glass, iron frame, roof, gold finial
        P += [prim('cyl', mats, GL, size=(0.2, 0.24, 0.42), loc=(0, 0, 3.45), seg=6), prim('cyl', mats, IR, size=(0.27, 0.27, 0.05), loc=(0, 0, 3.42), seg=6),
              prim('cone', mats, IR, size=(0.34, 0.04, 0.32), loc=(0, 0, 3.86), seg=6), prim('sphere', mats, GD, size=0.07, loc=(0, 0, 4.22), seg=8)]
        for a in range(6):
            t = a / 6 * 2 * math.pi + math.pi / 6; P.append(prim('box', mats, IR, size=(0.025, 0.025, 0.44), loc=(math.cos(t) * 0.24, math.sin(t) * 0.24, 3.44)))
        # small hanging banner on an arm
        P += [prim('box', mats, IR, size=(0.7, 0.04, 0.04), loc=(0.35, 0, 2.95)), prim('box', mats, NV, size=(0.5, 0.02, 0.9), loc=(0.42, 0, 2.0)),
              prim('box', mats, GD, size=(0.52, 0.025, 0.05), loc=(0.42, 0, 2.88)), prim('box', mats, GD, size=(0.14, 0.03, 0.14), loc=(0.42, 0, 2.45), rot=(0, math.radians(45), 0))]
        if flo:
            o, c = shrub_blob(mats, FO, (0, 0, 0.72), 0.32, 7, 2 if lod != 'l2' else 1); P.append(o); blob += c
            P.append(flowers_on(mats, PL, (0, 0, 0.6), 0.36, 9, [2, 4, 5, 3], 0.2, 8))
    elif name == 'town_banner':
        P += [prim('cyl', mats, IR, size=(0.07, 0.06, 4.4), seg=seg), prim('sphere', mats, GD, size=0.13, loc=(0, 0, 4.5), seg=10),
              prim('box', mats, IR, size=(1.3, 0.05, 0.05), loc=(0, 0, 4.1)), prim('cyl', mats, GD, size=(0.12, 0.1, 0.12), seg=seg)]
        # cloth: gently waved navy banner with gold border and a gold lozenge, pointed bottom
        bm = bmesh.new(); W0, H0, nx, ny = 1.1, 2.5, 6, 10; grid = []
        for j in range(ny + 1):
            row = []
            for i in range(nx + 1):
                u, v = i / nx, j / ny; x = (u - 0.5) * W0; z = 4.05 - v * H0
                if j == ny: z -= (0.5 - abs(u - 0.5)) * 0.6
                row.append(bm.verts.new((x, 0.04 + math.sin(u * 3 + v * 2) * 0.05, z)))
            grid.append(row)
        for j in range(ny):
            for i in range(nx):
                f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
                f.material_index = GD if (i == 0 or i == nx - 1 or j == 0) else NV
        P.append(_mesh(bm, 'cloth', mats))
        P.append(prim('box', mats, GD, size=(0.32, 0.03, 0.32), loc=(0, 0.08, 2.9), rot=(0, math.radians(45), 0)))
    elif name == 'town_planter':
        P += [prim('lathe', mats, S, profile=[(0.0, 0), (0.62, 0), (0.7, 0.08), (0.66, 0.16), (0.72, 0.5), (0.8, 0.56), (0.8, 0.64), (0.68, 0.66), (0.0, 0.62)], seg=seg + 4)]
        if flo:
            o, c = shrub_blob(mats, FO, (0, 0, 0.9), 0.46, 11, 2 if lod != 'l2' else 1); P.append(o); blob += c
            P.append(flowers_on(mats, PL, (0, 0, 0.62), 0.66, 24, [2, 4, 5, 3, 4], 0.3, 12))
    elif name == 'town_flowerbox':
        P += [prim('box', mats, W, size=(1.3, 0.42, 0.36), bevel=0.03), prim('box', mats, WD, size=(1.36, 0.46, 0.06), loc=(0, 0, 0.36)), prim('box', mats, SO, size=(1.2, 0.34, 0.03), loc=(0, 0, 0.37))]
        if flo:
            bm = flowers_on(mats, PL, (0, 0, 0.38), 0.55, 12, [2, 4, 5, 3, 0], 0.2, 21)
            for v in bm.data.vertices: v.co.y *= 0.3
            P.append(bm)
    elif name == 'town_barrel':
        prof = [(0.0, 0.0), (0.34, 0.0)] + [(0.34 + 0.07 * math.sin(math.pi * t / 8), t / 8 * 0.9) for t in range(1, 8)] + [(0.34, 0.9), (0.3, 0.92), (0.0, 0.9)]
        P += [prim('lathe', mats, W, profile=prof, seg=seg)]
        for z in (0.12, 0.45, 0.78): P.append(prim('cyl', mats, IR, size=(0.375 + 0.06 * math.sin(math.pi * z / 0.9), 0.375 + 0.06 * math.sin(math.pi * z / 0.9), 0.05), loc=(0, 0, z - 0.025), seg=seg))
    elif name == 'town_crate':
        P += [prim('box', mats, W, size=(0.8, 0.8, 0.8), bevel=0.03)]
        for sx in (-1, 1):
            for sy in (-1, 1): P.append(prim('box', mats, WD, size=(0.09, 0.09, 0.82), loc=(sx * 0.37, sy * 0.37, 0)))
        for z in (0.0, 0.74): P += [prim('box', mats, WD, size=(0.84, 0.09, 0.08), loc=(0, sy * 0.37, z)) for sy in (-1, 1)]
    elif name == 'town_bench':
        for k in range(3): P.append(prim('box', mats, W, size=(1.8, 0.14, 0.05), loc=(0, -0.18 + k * 0.17, 0.45), bevel=0.012))
        for k in range(2): P.append(prim('box', mats, W, size=(1.8, 0.05, 0.12), loc=(0, 0.27, 0.62 + k * 0.17), bevel=0.012))
        for sx in (-0.75, 0.75):
            P += [prim('box', mats, IR, size=(0.06, 0.5, 0.06), loc=(sx, 0, 0.4)), prim('box', mats, IR, size=(0.05, 0.05, 0.45), loc=(sx, -0.2, 0)),
                  prim('box', mats, IR, size=(0.05, 0.05, 0.92), loc=(sx, 0.25, 0)), prim('box', mats, GD, size=(0.07, 0.07, 0.05), loc=(sx, 0.25, 0.92))]
    elif name == 'town_sign':
        P += [prim('box', mats, WD, size=(0.12, 0.12, 2.0), bevel=0.02), prim('box', mats, W, size=(1.0, 0.07, 0.55), loc=(0.35, 0, 1.35), bevel=0.02),
              prim('box', mats, CR, size=(0.84, 0.08, 0.38), loc=(0.35, 0, 1.43)), prim('box', mats, GD, size=(0.16, 0.09, 0.16), loc=(0.35, 0, 1.55), rot=(0, math.radians(45), 0)),
              prim('cone', mats, WD, size=(0.12, 0.0, 0.18), loc=(0, 0, 2.0), seg=4)]
    elif name == 'town_fence':
        for x in (-0.95, 0.0, 0.95): P += [prim('box', mats, WD, size=(0.1, 0.1, 0.9), loc=(x, 0, 0), bevel=0.015), prim('cone', mats, WD, size=(0.075, 0.0, 0.12), loc=(x, 0, 0.9), seg=4)]
        for z in (0.32, 0.66): P.append(prim('box', mats, W, size=(2.0, 0.05, 0.1), loc=(0, 0.06, z), bevel=0.01))
    elif name == 'town_finial':
        P += [prim('cyl', mats, GD, size=(0.09, 0.06, 0.5), seg=10), prim('sphere', mats, GD, size=0.13, loc=(0, 0, 0.6), seg=10),
              prim('cone', mats, GD, size=(0.08, 0.0, 0.55), loc=(0, 0, 0.7), seg=8), prim('box', mats, GD, size=(0.42, 0.04, 0.04), loc=(0, 0, 0.95))]
    elif name == 'town_balcony':
        P += [prim('box', mats, WD, size=(2.4, 0.9, 0.12), bevel=0.02)]
        for x in (-1.0, 0.0, 1.0): P.append(prim('box', mats, WD, size=(0.1, 0.5, 0.1), loc=(x, 0.2, -0.45), rot=(math.radians(-35), 0, 0)))
        for k in range(13): P.append(prim('cyl', mats, W, size=(0.035, 0.035, 0.62), loc=(-1.14 + k * 0.19, -0.4, 0.12), seg=6))
        P += [prim('box', mats, WD, size=(2.45, 0.08, 0.08), loc=(0, -0.4, 0.74)), prim('box', mats, W, size=(2.2, 0.32, 0.26), loc=(0, -0.58, 0.5), bevel=0.02)]
        if flo: P.append(flowers_on(mats, PL, (0, -0.58, 0.76), 0.9, 10, [2, 4, 5, 3], 0.18, 31))
    elif name == 'town_border':
        for k in range(5):
            P.append(prim('box', mats, S, size=(0.42, 0.26, 0.2 + 0.03 * (k % 2)), loc=(-0.88 + k * 0.44, 0, 0), bevel=0.04))
    ob = B.join(P, name + ('_' + lod if lod else '')) if len(P) > 1 else P[0]
    ob.name = name + ('_' + lod if lod else '')
    if lod == 'lo': return ob
    B.box_uv(ob, 1.0, skip=(PL,))
    if blob:
        me = ob.data; out = []
        for p in me.polygons: pass
        fol = set(v for p in me.polygons if p.material_index in (FO, PL) for v in p.vertices)
        for v in me.vertices:
            if v.index in fol:
                c, R = min(blob, key=lambda cr: (v.co - cr[0]).length / cr[1]); d = (v.co - c).normalized() if (v.co - c).length > 1e-6 else Vector((0, 0, 1))
                out.append((d * 0.8 + Vector((0, 0, 0.5))).normalized())
            else: out.append(v.normal.copy())
        me.normals_split_custom_set_from_vertices(out)
    B.bake_ao(ob, samples=20)
    top = max(v.co.z for v in ob.data.vertices)
    B.paint_light(ob, ao_pow=1.15, ao_min=0.35, h0=0, h1=top, bottom=0.78, top=1.06, up=0.12, hue=0.04, seed=len(name),
                  per_mat={GL: (1.4, 1.3, 1.0)})
    return ob
TOWN = ['town_finial', 'town_balcony', 'town_lamp', 'town_banner', 'town_planter', 'town_flowerbox', 'town_barrel', 'town_crate', 'town_bench', 'town_sign', 'town_fence', 'town_border']

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
            elif name in TOWN: ob = build_town(name, lod)
            else: raise SystemExit('unknown asset ' + name)
            fn = name + ('_' + lod if lod else '')
            B.export_glb(ob, os.path.join(OUT, fn + '.glb')); print(fn, B.tri_count(ob), flush=True)

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    run(args or list(TREES) + list(SHRUBS) + list(ROCKS) + list(PLANTS) + TOWN)
