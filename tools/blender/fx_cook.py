"""요리사 1차 스킬 이펙트 메시 (Blender bpy, headless, 2026-11-13): 식칼 썰기 ck1_a1 · 팬 강타 ck1_a2 · 미트볼 던지기 ck1_b1.

Usage:  python3 tools/blender/fx_cook.py        ->  assets/fx/fx_cook.glb.json  (+ tools/blender/cook/fx_cook.blend)

Meshes (game axes: +Y up, metres; js/cookfx.js가 크기·움직임을 정함. 텍스처 없음 — 색은 정점 색, 빛은 셰이더)
  cook_knife      큰 식칼(중식도 모양): 날 끝 y 0(아래), 칼등 y 0.36, 길이 x -0.5 .. 0.5 (날 -0.5 .. 0.18, 손잡이 0.18 .. 0.5), 두께 z
  cook_pan        프라이팬: 바닥 y 0(아래로 내리찍는 면), 테두리 반지름 1 / 높이 0.2, 손잡이 +x 로 1.0 .. 1.95. 무쇠색 + 따뜻한 테두리
  cook_meatball   울퉁불퉁한 공 반지름 1, 갈색 + 위쪽 소스 윤기
  cook_chip_a/b/c 썰려 튀는 조각: 얇은 원판(당근) / 쐐기(초록 채소) / 작은 토막(흰색), 크기 약 1
  cook_star       기절 별: 두께 있는 다섯 꼭지 별, 반지름 1 (xy 평면)
json: {b64}
"""
import os, sys, math, json, base64, random
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm as FP
from fx_pharm import V, lathe, new_obj
SRC = os.path.join(HERE, 'cook'); os.makedirs(SRC, exist_ok=True)

STEEL, STEEL_HI, STEEL_LO = (0.80, 0.84, 0.90, 1), (0.97, 0.98, 1.0, 1), (0.52, 0.56, 0.64, 1)
WOOD, WOOD_LO, BRASS = (0.42, 0.25, 0.13, 1), (0.28, 0.16, 0.08, 1), (0.95, 0.72, 0.30, 1)
IRON, IRON_IN, IRON_RIM, IRON_HI = (0.11, 0.11, 0.13, 1), (0.20, 0.19, 0.20, 1), (0.62, 0.40, 0.20, 1), (0.95, 0.70, 0.38, 1)

def quad(bm, col, vs, c):
    f = bm.faces.new([bm.verts.new(V(*p)) for p in vs])
    for l in f.loops: l[col] = c
    return f

def box(bm, col, x0, x1, y0, y1, z0, z1, c, ctop=None):
    P = lambda x, y, z: (x, y, z)
    faces = [((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)), ((x0, y0, z1), (x0, y1, z1), (x1, y1, z1), (x1, y0, z1)),
             ((x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)), ((x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0)),
             ((x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)), ((x0, y0, z0), (x0, y0, z1), (x1, y0, z1), (x1, y0, z0))]
    for i, f in enumerate(faces): quad(bm, col, f, ctop if (ctop and i == 4) else c)

def knife(bm, col, uvl):
    # cleaver blade: wedge section (spine 0.036 thick at y 0.36 -> edge at y 0), slightly curved belly, bright bevel band near the edge
    N = 10; x0, x1, top = -0.5, 0.18, 0.36; ht = 0.018
    def edge_y(u): return 0.035 * (1 - math.sin(u * math.pi)) * 0.6 + (0.05 * (1 - u) ** 3)     # belly: a little higher at the tip
    cols = []
    for i in range(N + 1):
        u = i / N; x = x0 + (x1 - x0) * u; ye = edge_y(u); yb = ye + 0.075
        cols.append((x, ye, yb))
    for i in range(N):
        (xa, ea, ba), (xb, eb, bb) = cols[i], cols[i + 1]
        for sgn in (1, -1):
            z = sgn * ht; zb = sgn * ht * 0.45
            a = [(xa, ea, 0), (xb, eb, 0), (xb, bb, zb), (xa, ba, zb)]; b = [(xa, ba, zb), (xb, bb, zb), (xb, top, z), (xa, top, z)]
            if sgn < 0: a.reverse(); b.reverse()
            quad(bm, col, a, STEEL_HI); quad(bm, col, b, STEEL if sgn > 0 else STEEL_LO)
        quad(bm, col, [(xa, top, ht), (xb, top, ht), (xb, top, -ht), (xa, top, -ht)], STEEL_LO)                 # spine
    quad(bm, col, [(x0, cols[0][1], 0), (x0, cols[0][2], ht * 0.45), (x0, top, ht), (x0, top, -ht), (x0, cols[0][2], -ht * 0.45)], STEEL)   # tip end
    quad(bm, col, [(x1, cols[-1][1], 0), (x1, cols[-1][2], -ht * 0.45), (x1, top, -ht), (x1, top, ht), (x1, cols[-1][2], ht * 0.45)], STEEL_LO)
    # hole near the spine corner is skipped (reads as noise at game size); brass bolster + wooden handle with two rivets
    box(bm, col, 0.18, 0.225, 0.19, 0.345, -0.034, 0.034, BRASS)
    P = [(0.0, 0.225), (0.036, 0.225), (0.040, 0.30), (0.043, 0.40), (0.040, 0.47), (0.030, 0.495), (0.0, 0.5)]
    segs = 14
    rings = []
    for (r, x) in P:
        rings.append([bm.verts.new(V(x, 0.268 + math.cos(2 * math.pi * k / segs) * r * 1.25, math.sin(2 * math.pi * k / segs) * r)) for k in range(segs)])
    for a in range(len(rings) - 1):
        for k in range(segs):
            j = (k + 1) % segs; f = bm.faces.new((rings[a][k], rings[a + 1][k], rings[a + 1][j], rings[a][j]))
            for l in f.loops: l[col] = WOOD if k < segs // 2 else WOOD_LO

def pan(bm, col, uvl):
    # shallow dish: flat bottom (down, y 0), flared wall, rolled rim; inside a touch lighter; long handle +x with a hanging loop end
    P = [(0.0, 0.0), (0.80, 0.0), (0.86, 0.02), (0.97, 0.17), (1.0, 0.2), (0.985, 0.215), (0.955, 0.20), (0.84, 0.05), (0.78, 0.035), (0.0, 0.035)]
    def c(k, prof):
        if k in (3, 4, 5): return IRON_HI if k == 4 else IRON_RIM
        return IRON_IN if k >= 6 else IRON
    lathe(bm, col, P, 40, c)
    # handle: flat tapered bar rising slightly, darker grip
    hx = [(0.96, 0.16, 0.085), (1.25, 0.21, 0.07), (1.6, 0.25, 0.062), (1.95, 0.27, 0.075)]
    for i in range(len(hx) - 1):
        (xa, ya, wa), (xb, yb, wb) = hx[i], hx[i + 1]; t = 0.03
        top = [(xa, ya + t, -wa), (xa, ya + t, wa), (xb, yb + t, wb), (xb, yb + t, -wb)]; bot = [(xa, ya - t, -wa), (xb, yb - t, -wb), (xb, yb - t, wb), (xa, ya - t, wa)]
        cc = IRON_RIM if i == 0 else WOOD
        quad(bm, col, top, cc); quad(bm, col, bot, IRON if i == 0 else WOOD_LO)
        quad(bm, col, [(xa, ya - t, wa), (xb, yb - t, wb), (xb, yb + t, wb), (xa, ya + t, wa)], cc)
        quad(bm, col, [(xa, ya - t, -wa), (xa, ya + t, -wa), (xb, yb + t, -wb), (xb, yb - t, -wb)], IRON if i == 0 else WOOD_LO)
    (xe, ye, we) = hx[-1]; quad(bm, col, [(xe, ye - 0.03, -we), (xe, ye + 0.03, -we), (xe, ye + 0.03, we), (xe, ye - 0.03, we)], WOOD_LO)

def meatball(bm, col, uvl):
    rng = random.Random(7)
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    bumps = [(rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0.25, 0.5)) for _ in range(22)]
    for v in bm.verts:
        x, y, z = v.co; d = 0.0
        for (bx, by, bz, br) in bumps:
            m = math.sqrt(bx * bx + by * by + bz * bz) or 1; q = (x * bx + y * by + z * bz) / m
            if q > 1 - br: d += 0.1 * (q - (1 - br)) / br
        v.co = (x * (0.93 + d), y * (0.93 + d), z * (0.93 + d))
    for f in bm.faces:
        for l in f.loops:
            x, y, z = l.vert.co; r = math.sqrt(x * x + y * y + z * z); k = (r - 0.93) / 0.2; up = max(0.0, z)      # Blender z = game y
            base = (0.36 + 0.22 * k, 0.17 + 0.10 * k, 0.07 + 0.04 * k)
            sauce = (0.78, 0.20, 0.08); s = max(0.0, min(1.0, (up - 0.45) / 0.35)) * 0.75
            l[col] = tuple(base[i] * (1 - s) + sauce[i] * s for i in range(3)) + (1,)

def chip_a(bm, col, uvl):   # carrot coin
    lathe(bm, col, [(0.0, -0.07), (0.5, -0.07), (0.5, 0.07), (0.0, 0.07)], 12, lambda k, p: (1.0, 0.58, 0.16, 1) if k != 1 else (0.95, 0.42, 0.10, 1))
def chip_b(bm, col, uvl):   # green wedge
    g, g2 = (0.50, 0.82, 0.30, 1), (0.82, 0.95, 0.60, 1)
    a, b, c = (-0.5, -0.12, 0), (0.5, -0.12, 0), (0.0, 0.34, 0); t = 0.11
    quad(bm, col, [(a[0], a[1], t), (b[0], b[1], t), (c[0], c[1], t)], g2); quad(bm, col, [(a[0], a[1], -t), (c[0], c[1], -t), (b[0], b[1], -t)], g2)
    for p, q in ((a, b), (b, c), (c, a)): quad(bm, col, [(p[0], p[1], -t), (q[0], q[1], -t), (q[0], q[1], t), (p[0], p[1], t)], g)
def chip_c(bm, col, uvl):   # white cube (onion / radish)
    box(bm, col, -0.3, 0.3, -0.3, 0.3, -0.3, 0.3, (0.96, 0.95, 0.88, 1), (1, 1, 0.96, 1))

def star(bm, col, uvl):
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5; r = 1.0 if i % 2 == 0 else 0.46
        pts.append((math.cos(a) * r, math.sin(a) * r))
    t = 0.16; Y, Y2 = (1.0, 0.86, 0.25, 1), (1.0, 0.97, 0.70, 1)
    cf, cb = bm.verts.new(V(0, 0, t)), bm.verts.new(V(0, 0, -t))
    ring = [bm.verts.new(V(x, y, 0)) for (x, y) in pts]
    for i in range(10):
        j = (i + 1) % 10
        f = bm.faces.new((cf, ring[i], ring[j]));  [l.__setitem__(col, Y2 if l.vert is cf else Y) for l in f.loops]
        f = bm.faces.new((cb, ring[j], ring[i]));  [l.__setitem__(col, Y2 if l.vert is cb else Y) for l in f.loops]

def main():
    FP.reset()
    obs = [new_obj('cook_knife', knife, False), new_obj('cook_pan', pan), new_obj('cook_meatball', meatball), new_obj('cook_chip_a', chip_a, False),
           new_obj('cook_chip_b', chip_b, False), new_obj('cook_chip_c', chip_c, False), new_obj('cook_star', star, False)]
    for o in obs:
        if o.name in ('cook_knife', 'cook_pan'):
            m = o.modifiers.new('es', 'EDGE_SPLIT'); m.split_angle = math.radians(38)
            for p in o.data.polygons: p.use_smooth = True
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(FP.TMP, 'fx_cook.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(FP.OUT, 'fx_cook.glb.json'), 'w'))
    for k, o in enumerate(obs): o.location.x = k * 2.4
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_cook.blend'), compress=True)
    print('tris', tris, 'glb bytes', len(raw), flush=True)

if __name__ == '__main__':
    main()
