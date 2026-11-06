"""Ground-shatter skill effect meshes (Blender bpy, headless).

  * fx_crack_a..d   broken ground: a unit disc (radius ~1.1) fractured into Voronoi slabs with gaps between them.
                    Each slab = top face + small chamfer + side walls down to -0.10 (so the open cracks show depth).
                    UV0 = (slab distance from centre 0..1, slab random 0..1), UV1 = slab centroid (x, z) packed 0..1.
                    The game shader (js/shatterfx.js) uses them to open the cracks from the centre outwards, lift / tilt
                    each slab a little and fade the outer ring into the ground.
  * fx_debris       six low-poly stylized rocks (Debris_A..F, ~1 m, pivot at the centre) for the thrown fragments.

Output: assets/fx/<name>.glb.json (base64 wrapper like the other models).  Usage: python3 tools/blender/fx_shatter.py
"""
import os, sys, math, random, json, base64
import numpy as np
from scipy.spatial import Voronoi
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import blib

ROOT = os.path.join(HERE, '..', '..'); OUT = os.path.join(ROOT, 'assets', 'fx'); TMP = os.path.join(HERE, 'out'); os.makedirs(TMP, exist_ok=True)
R_DISC = 1.12

def circle_clip(poly, R, n=56):
    """Sutherland-Hodgman clip of a convex polygon against a regular n-gon of radius R"""
    clip = [(R * math.cos(2 * math.pi * i / n), R * math.sin(2 * math.pi * i / n)) for i in range(n)]
    out = poly
    for i in range(n):
        a, b = clip[i], clip[(i + 1) % n]; inp = out; out = []
        if not inp: break
        side = lambda p: (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
        for j in range(len(inp)):
            p, q = inp[j], inp[(j + 1) % len(inp)]; sp, sq = side(p), side(q)
            if sp >= 0: out.append(p)
            if (sp >= 0) != (sq >= 0):
                t = sp / (sp - sq); out.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    return out

def _h(*a):
    x = math.sin(sum(v * k for v, k in zip(a, (12.9898, 78.233, 37.719, 4.581)))) * 43758.5453
    return x - math.floor(x)

def jagged(poly, rc):
    """break every straight edge into 3-4 segments with a sideways kink; the kink is hashed from the edge itself so
    both neighbouring slabs bend the same way and the crack keeps an even width"""
    out = []
    for i in range(len(poly)):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        a, b = (p, q) if p <= q else (q, p)
        L = math.hypot(b[0] - a[0], b[1] - a[1]); out.append(p)
        if L < 0.07: continue
        nx, ny = -(b[1] - a[1]) / L, (b[0] - a[0]) / L
        k = 2 if L < 0.2 else 3
        key = (round(a[0], 3), round(a[1], 3), round(b[0], 3), round(b[1], 3))
        pts = []
        for j in range(1, k):
            t = j / k + (_h(*key, j) - 0.5) * 0.12; o = (_h(*key, j + 7) - 0.5) * min(0.06, L * 0.22)
            pts.append((a[0] + (b[0] - a[0]) * t + nx * o, a[1] + (b[1] - a[1]) * t + ny * o))
        if (p, q) != (a, b): pts.reverse()
        out.extend(pts)
    return out

def area_centroid(poly):
    A = cx = cy = 0
    for i in range(len(poly)):
        x0, y0 = poly[i]; x1, y1 = poly[(i + 1) % len(poly)]; c = x0 * y1 - x1 * y0
        A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c
    A *= 0.5
    return abs(A), (cx / (6 * A), cy / (6 * A)) if abs(A) > 1e-9 else poly[0]

def seeds(rng):
    """impact pattern: a cluster of small pieces at the centre, rings of bigger slabs further out; a few radial
    'fault lines' (angles where seeds line up in pairs) give the long straight cracks that run outwards"""
    pts = [(rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04))]
    faults = sorted(rng.uniform(0, 2 * math.pi) for _ in range(rng.randint(5, 7)))
    rings = [(0.13, 5), (0.3, 8), (0.5, 11), (0.72, 13), (0.95, 16), (1.2, 19), (1.5, 22)]
    for r, n in rings:
        off = rng.uniform(0, 2 * math.pi)
        for k in range(n):
            a = off + 2 * math.pi * (k + rng.uniform(-0.3, 0.3)) / n; rr = r * rng.uniform(0.86, 1.14)
            pts.append((rr * math.cos(a), rr * math.sin(a)))
        for f in faults:                                       # seed pairs straddling a fault -> a straight crack between them
            if rng.random() < 0.8:
                d = 0.09 + 0.05 * r
                for s in (-1, 1): a = f + s * d / max(r, 0.1); pts.append((r * 1.02 * math.cos(a), r * 1.02 * math.sin(a)))
    return np.array(pts)

def crack_mesh(name, seed):
    rng = random.Random(seed); P = seeds(rng)
    far = np.array([[9, 9], [-9, 9], [9, -9], [-9, -9]]); vor = Voronoi(np.vstack([P, far]))
    bm = bmesh.new(); uv0 = bm.loops.layers.uv.new('UVMap'); uv1 = bm.loops.layers.uv.new('Cell')
    cells = 0
    for i in range(len(P)):
        reg = vor.regions[vor.point_region[i]]
        if not reg or -1 in reg: continue
        poly = [tuple(vor.vertices[j]) for j in reg]
        _, c0 = area_centroid(poly); poly.sort(key=lambda p: math.atan2(p[1] - c0[1], p[0] - c0[0]))
        poly = circle_clip(poly, R_DISC)
        if len(poly) < 3: continue
        A, c = area_centroid(poly); rc = math.hypot(*c)
        if A < 0.0015 or rc > 1.06: continue
        poly = jagged(poly, rc)
        # gap: wide near the impact, hairline at the rim
        g = (0.010 + 0.026 * max(0, 1 - rc / 0.9)) * rng.uniform(0.7, 1.3)
        ins = []
        for x, y in poly:
            dx, dy = x - c[0], y - c[1]; L = math.hypot(dx, dy) or 1; k = max(0.2, 1 - g / L); ins.append((c[0] + dx * k, c[1] + dy * k))
        bev = []
        for x, y in ins:
            dx, dy = x - c[0], y - c[1]; L = math.hypot(dx, dy) or 1; k = max(0.3, 1 - 0.022 / L); bev.append((c[0] + dx * k, c[1] + dy * k))
        h_top, h_rim, h_bot = 0.05 + rng.uniform(-0.008, 0.008), 0.03, -0.10
        top = [bm.verts.new((x, y, h_top)) for x, y in bev]
        rim = [bm.verts.new((x, y, h_rim)) for x, y in ins]
        bot = [bm.verts.new((x, y, h_bot)) for x, y in ins]
        faces = [bm.faces.new(top)]
        n = len(ins)
        for k in range(n):
            k2 = (k + 1) % n
            faces.append(bm.faces.new([rim[k], rim[k2], top[k2], top[k]]))
            faces.append(bm.faces.new([bot[k], bot[k2], rim[k2], rim[k]]))
        rnd = rng.random(); dist = min(1, rc / R_DISC)
        for f in faces:
            for l in f.loops: l[uv0].uv = (dist, rnd); l[uv1].uv = (c[0] * 0.5 + 0.5, c[1] * 0.5 + 0.5)
        cells += 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = blib.obj_from_bmesh(bm, name, [blib.material('M_crack')])
    for p in ob.data.polygons: p.use_smooth = False
    return ob, cells

def rock(name, rng):
    bm = bmesh.new(); n = rng.randint(9, 14); sx, sy, sz = rng.uniform(0.8, 1.2), rng.uniform(0.7, 1.1), rng.uniform(0.45, 0.85)
    for _ in range(n):
        u, v = rng.uniform(-1, 1), rng.uniform(0, 2 * math.pi); s = math.sqrt(1 - u * u)
        bm.verts.new((s * math.cos(v) * sx * 0.5, s * math.sin(v) * sy * 0.5, u * sz * 0.5))
    bmesh.ops.convex_hull(bm, input=bm.verts)
    for v in [v for v in bm.verts if not v.link_faces]: bm.verts.remove(v)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        sh = 0.75 + 0.25 * max(0, f.normal.z) + rng.uniform(-0.06, 0.06)          # baked light per facet in UV.x (shader tints)
        for l in f.loops: l[uv].uv = (sh, rng.random())
    ob = blib.obj_from_bmesh(bm, name, [blib.material('M_debris')])
    for p in ob.data.polygons: p.use_smooth = False
    return ob

def export(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(TMP, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='EXPORT', export_image_format='NONE', export_normals=True,
                              export_animations=False)
    raw = open(path, 'rb').read(); json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(OUT, name + '.glb.json'), 'w'))
    return len(raw)

def main():
    os.makedirs(OUT, exist_ok=True); rep = {}
    for i, s in enumerate([11, 23, 37, 58]):
        blib.reset(); ob, cells = crack_mesh('Crack_' + 'abcd'[i], s)
        rep['fx_crack_' + 'abcd'[i]] = dict(cells=cells, tris=blib.tri_count(ob), bytes=export([ob], 'fx_crack_' + 'abcd'[i]))
    blib.reset(); rng = random.Random(5); rocks = [rock('Debris_' + 'ABCDEF'[i], rng) for i in range(6)]
    for i, r in enumerate(rocks): r.location.x = i * 1.5
    rep['fx_debris'] = dict(tris=sum(blib.tri_count(r) for r in rocks), bytes=export(rocks, 'fx_debris'))
    for k, v in rep.items(): print(k, v)

main()
