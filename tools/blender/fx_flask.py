"""약사 약병 이펙트 공용 메시 (Blender bpy, headless, 2026-11-14 — 약병 연출 전면 개편).

Usage:  python3 tools/blender/fx_flask.py      ->  assets/fx/fx_flask.glb.json  (+ tools/blender/flask/fx_flask.blend)

fx_pharm.py(아틀라스·아이콘)와 별개 — 이 파일만 다시 만들면 됨. 텍스처 없음: 색·빛은 게임 셰이더(js/flaskfx.js)가 그리고, 정점 색은
메시 안의 역할만 표시함. 게임 축(+Y 위, 미터), 모든 메시는 단위 크기(게임이 키움).
  flask_glass   둥근 몸통 + 목 + 입술 (유리 껍질, 높이 1, 바닥 y 0)            flask_liquid  몸통 안 액체 (윗면 평평, y 0.47까지)
  flask_cork    코르크 마개                                                   flask_band    목의 금색 띠
  shard_0..3    휜 유리 조각 (구 껍질 조각, 두께 있음, 가장 긴 변 ~1)
  petal         왕관 튀김 꽃잎: 밑동에서 바깥(+X)·위로 휘어 올라가 끝이 둥근 방울 (길이 1)
  strand_a/b/c  가늘어지는 액체 줄기(+X 방향, 굽은 정도·굵기가 다름: 위로 휨 / S자 / 거의 곧고 굵음)
  blob          울퉁불퉁한 구 (반지름 1, 정점 색 R = 무작위 씨앗) — 구름·불꽃 덩어리·연무(셰이더가 모양을 계속 바꿈)
  flame         휘감아 오르는 불꽃 혀 (밑 y 0 둥근 몸통 -> 끝 y 1 뾰족, 비틀림)
  drop          물방울 (둥근 몸 원점 반지름 0.5, 꼬리 +Y)
  bubble        작은 구 (반지름 1)
  ice_a/ice_b   각진 얼음 결정 묶음 (밑 y 0, 높이 1, 면 단위 음영)
  spark         길쭉한 불티 (+Y 길이 1)
  disc          평평한 원판 반지름 1 (평면 UV, 바닥 얼룩·충격파·문양 셰이더용)
"""
import os, sys, math, json, base64, random
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'flask'); TMP = '/tmp/fx_flask'
for d in (OUT, SRC, TMP): os.makedirs(d, exist_ok=True)
SEED = 1114

def V(x, y, z): return (x, -z, y)        # game (x, y up, z) -> Blender (x, y, z up)

def new_obj(name, build, smooth=True):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    col = bm.loops.layers.color.new('Col'); uvl = bm.loops.layers.uv.new('UVMap')
    build(bm, col, uvl)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces: f.smooth = smooth
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    return ob

def paint(faces, col, c):
    for f in faces:
        for l in f.loops: l[col] = c

def lathe(bm, col, prof, seg=24, c=(1, 1, 1, 1), cap=True):
    rings = []
    for (r, y) in prof:
        rings.append([bm.verts.new(V(math.cos(2 * math.pi * i / seg) * r, y, math.sin(2 * math.pi * i / seg) * r)) for i in range(seg)] if r > 1e-5 else [bm.verts.new(V(0, y, 0))])
    fs = []
    for k in range(len(rings) - 1):
        A, B = rings[k], rings[k + 1]
        for i in range(seg):
            j = (i + 1) % seg
            if len(A) == 1: fs.append(bm.faces.new((A[0], B[j], B[i])) if True else None)
            elif len(B) == 1: fs.append(bm.faces.new((A[i], A[j], B[0])))
            else: fs.append(bm.faces.new((A[i], A[j], B[j], B[i])))
    if cap:
        if len(rings[0]) > 1: fs.append(bm.faces.new(list(reversed(rings[0]))))
        if len(rings[-1]) > 1: fs.append(bm.faces.new(rings[-1]))
    paint(fs, col, c)
    return fs

# ------------------------------------------------------------------ flask (body sphere r .34 at y .34, neck, lip)
def flask_glass(bm, col, uvl):
    P = []
    for i in range(0, 15):
        a = -math.pi / 2 + i / 14 * (math.pi / 2 + 1.12)          # bottom pole -> shoulder (where the neck starts)
        P.append((0.34 * math.cos(a), 0.34 + 0.34 * math.sin(a)))
    P[0] = (0.0, 0.0)
    P += [(0.115, 0.70), (0.108, 0.80), (0.118, 0.855), (0.145, 0.875), (0.142, 0.905), (0.118, 0.912)]
    lathe(bm, col, P, 24, (1, 1, 1, 1), cap=False)

def flask_liquid(bm, col, uvl):
    P = [(0.0, 0.02)]
    for i in range(1, 12):
        a = -math.pi / 2 + i / 11 * (math.pi / 2 + 0.45)
        y = 0.34 + 0.305 * math.sin(a)
        if y >= 0.47: break
        P.append((0.305 * math.cos(a), y))
    P.append((0.305 * math.cos(math.asin((0.47 - 0.34) / 0.305)), 0.47)); P.append((0.0, 0.47))
    lathe(bm, col, P, 20, (1, 1, 1, 1), cap=False)

def flask_cork(bm, col, uvl):
    lathe(bm, col, [(0.0, 0.83), (0.098, 0.83), (0.108, 0.93), (0.118, 0.975), (0.09, 0.995), (0.0, 1.0)], 14, (0.62, 0.40, 0.22, 1), cap=False)

def flask_band(bm, col, uvl):
    seg, sub, R, r = 24, 6, 0.122, 0.022
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg; ring = []
        for k in range(sub):
            b = 2 * math.pi * k / sub; rr = R + r * math.cos(b)
            ring.append(bm.verts.new(V(math.cos(a) * rr, 0.66 + r * math.sin(b), math.sin(a) * rr)))
        rings.append(ring)
    fs = []
    for i in range(seg):
        for k in range(sub):
            fs.append(bm.faces.new((rings[i][k], rings[(i + 1) % seg][k], rings[(i + 1) % seg][(k + 1) % sub], rings[i][(k + 1) % sub])))
    paint(fs, col, (1.0, 0.78, 0.3, 1))

# ------------------------------------------------------------------ glass shards: curved shell pieces
def shard(i):
    def b(bm, col, uvl):
        rng = random.Random(SEED + 40 + i); n = 3 + i % 3
        pts = sorted(rng.uniform(0, 2 * math.pi) for _ in range(n))
        th = 0.03
        top, bot = [], []
        for a in pts:
            rr = rng.uniform(0.35, 0.55) * (1.25 if a == pts[0] else 1)
            x, z = math.cos(a) * rr, math.sin(a) * rr * 0.7
            y = -0.35 * (x * x + z * z)                                   # curved like a piece of the bottle
            top.append(bm.verts.new(V(x, y + th, z))); bot.append(bm.verts.new(V(x, y - th, z)))
        fs = [bm.faces.new(top), bm.faces.new(list(reversed(bot)))]
        for k in range(n):
            j = (k + 1) % n; fs.append(bm.faces.new((top[k], bot[k], bot[j], top[j])))
        paint(fs, col, (1, 1, 1, 1))
    return b

# ------------------------------------------------------------------ tubes along a path (petal, strands, flame)
def tube(bm, col, path, radius, seg=7, c=(1, 1, 1, 1), twist=0.0):
    """path: list of game-space points; radius(u) -> r; closed both ends"""
    n = len(path); rings = []
    for k, p in enumerate(path):
        u = k / (n - 1)
        a = path[min(n - 1, k + 1)]; b = path[max(0, k - 1)]
        t = [a[q] - b[q] for q in range(3)]; L = math.sqrt(sum(x * x for x in t)) or 1; t = [x / L for x in t]
        up = (0, 1, 0) if abs(t[1]) < 0.9 else (1, 0, 0)
        nx = [up[1] * t[2] - up[2] * t[1], up[2] * t[0] - up[0] * t[2], up[0] * t[1] - up[1] * t[0]]; L = math.sqrt(sum(x * x for x in nx)) or 1; nx = [x / L for x in nx]
        ny = [t[1] * nx[2] - t[2] * nx[1], t[2] * nx[0] - t[0] * nx[2], t[0] * nx[1] - t[1] * nx[0]]
        r = radius(u); ring = []
        for i in range(seg):
            a2 = 2 * math.pi * i / seg + twist * u
            off = [nx[q] * math.cos(a2) * r + ny[q] * math.sin(a2) * r for q in range(3)]
            ring.append(bm.verts.new(V(p[0] + off[0], p[1] + off[1], p[2] + off[2])))
        rings.append(ring)
    fs = []
    for k in range(n - 1):
        for i in range(seg):
            j = (i + 1) % seg; fs.append(bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i])))
    fs.append(bm.faces.new(list(reversed(rings[0])))); fs.append(bm.faces.new(rings[-1]))
    for f in fs:
        for l in f.loops:
            l[col] = c
    return fs

def bez(p0, p1, p2, p3, n):
    out = []
    for k in range(n):
        t = k / (n - 1); s = 1 - t
        out.append(tuple(s ** 3 * p0[q] + 3 * s * s * t * p1[q] + 3 * s * t * t * p2[q] + t ** 3 * p3[q] for q in range(3)))
    return out

def petal(bm, col, uvl):
    path = bez((0, 0, 0), (0.25, 0.05, 0), (0.55, 0.55, 0), (0.78, 0.82, 0), 14)
    def rad(u): return 0.075 * (1 - u) + 0.035 * u + 0.07 * math.exp(-((u - 0.97) / 0.07) ** 2)
    tube(bm, col, path, rad, 8)

def strand(kind):
    def b(bm, col, uvl):
        if kind == 'a': path, w = bez((0, 0, 0), (0.35, 0.18, 0), (0.7, 0.28, 0.0), (1.0, 0.12, 0), 14), 0.06
        elif kind == 'b': path, w = bez((0, 0, 0), (0.3, 0.12, 0.16), (0.65, 0.0, -0.18), (1.0, 0.06, 0.02), 14), 0.05
        else: path, w = bez((0, 0, 0), (0.33, 0.06, 0), (0.66, 0.06, 0.02), (1.0, 0.0, 0), 12), 0.085
        def rad(u): return w * (0.35 + 1.1 * math.sin(math.pi * min(1, u * 1.15)) ** 0.7) * (1 - 0.65 * u) + 0.012
        tube(bm, col, path, rad, 7)
    return b

def flame(bm, col, uvl):
    path = []
    for k in range(13):
        u = k / 12; path.append((0.12 * math.sin(u * 3.4) * u, u, 0.08 * math.sin(u * 2.4 + 1.0) * u))
    def rad(u): return 0.26 * (math.sin(math.pi * min(1, (u + 0.08) * 0.92)) ** 0.8) * (1 - u) ** 0.55 + 0.004
    tube(bm, col, path, rad, 9, twist=2.2)

def drop(bm, col, uvl):
    P = [(0.0, -0.5)]
    for i in range(1, 9):
        a = -math.pi / 2 + i / 8 * math.pi * 0.62; P.append((0.5 * math.cos(a), 0.5 * math.sin(a)))
    P += [(0.3, 0.42), (0.16, 0.7), (0.05, 0.9), (0.0, 1.0)]
    lathe(bm, col, P, 8, (1, 1, 1, 1), cap=False)

def ico(bm, col, sub, r, lump=0.0, seed=0):
    rng = random.Random(seed)
    res = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in res['verts']:
        n = v.co.normalized(); k = 1 + lump * (math.sin(n.x * 4.1 + seed) * math.sin(n.y * 3.3 + 1.7) * math.sin(n.z * 3.7 + 0.4))
        v.co = n * r * k
    for f in bm.faces:
        for l in f.loops:
            q = l.vert.co; h = (math.sin(q.x * 12.9898 + q.y * 78.233 + q.z * 37.719) * 43758.5453) % 1.0
            l[col] = (h, 1, 1, 1)

def blob(bm, col, uvl): ico(bm, col, 3, 1.0, 0.14, SEED)
def bubble(bm, col, uvl): ico(bm, col, 2, 1.0, 0.0, 1)

def crystal_spike(bm, col, base, axis, length, r, rng, tone):
    seg = 6; ax = axis; L = math.sqrt(sum(x * x for x in ax)); ax = [x / L for x in ax]
    up = (1, 0, 0) if abs(ax[1]) > 0.9 else (0, 1, 0)
    nx = [up[1] * ax[2] - up[2] * ax[1], up[2] * ax[0] - up[0] * ax[2], up[0] * ax[1] - up[1] * ax[0]]; L = math.sqrt(sum(x * x for x in nx)); nx = [x / L for x in nx]
    ny = [ax[1] * nx[2] - ax[2] * nx[1], ax[2] * nx[0] - ax[0] * nx[2], ax[0] * nx[1] - ax[1] * nx[0]]
    def ringat(h, rr):
        out = []
        for i in range(seg):
            a = 2 * math.pi * i / seg; p = [base[q] + ax[q] * h + (nx[q] * math.cos(a) + ny[q] * math.sin(a)) * rr for q in range(3)]
            out.append(bm.verts.new(V(*p)))
        return out
    r0, r1 = ringat(0, r * 0.8), ringat(length * 0.72, r)
    tip = bm.verts.new(V(*[base[q] + ax[q] * length for q in range(3)]))
    fs = [bm.faces.new(list(reversed(r0)))]
    for i in range(seg):
        j = (i + 1) % seg
        fs.append(bm.faces.new((r0[i], r0[j], r1[j], r1[i]))); fs.append(bm.faces.new((r1[i], r1[j], tip)))
    for k, f in enumerate(fs):
        t = tone * (0.75 + 0.25 * ((k * 7) % 5) / 4)
        for l in f.loops:
            l[col] = (t, t, 1, 1)

def ice(kind):
    def b(bm, col, uvl):
        rng = random.Random(SEED + (7 if kind == 'a' else 9))
        n = 5 if kind == 'a' else 3
        for i in range(n):
            a = rng.uniform(0, 2 * math.pi); tilt = 0.0 if i == 0 else rng.uniform(0.35, 0.8)
            ax = (math.cos(a) * math.sin(tilt), math.cos(tilt), math.sin(a) * math.sin(tilt))
            crystal_spike(bm, col, (math.cos(a) * 0.05 * i, 0, math.sin(a) * 0.05 * i), ax, (1.0 if i == 0 else rng.uniform(0.45, 0.75)), (0.17 if i == 0 else rng.uniform(0.08, 0.13)), rng, rng.uniform(0.8, 1))
    return b

def spark(bm, col, uvl):
    lathe(bm, col, [(0.0, 0.0), (0.12, 0.22), (0.0, 1.0)], 4, (1, 1, 1, 1), cap=False)

def disc(bm, col, uvl, seg=48, rings=6):
    c = bm.verts.new(V(0, 0, 0)); prev = None; allr = []
    for k in range(1, rings + 1):
        r = k / rings; allr.append([bm.verts.new(V(math.cos(2 * math.pi * i / seg) * r, 0, math.sin(2 * math.pi * i / seg) * r)) for i in range(seg)])
    fs = []
    for i in range(seg): fs.append(bm.faces.new((c, allr[0][(i + 1) % seg], allr[0][i])))
    for k in range(rings - 1):
        A, B = allr[k], allr[k + 1]
        for i in range(seg): j = (i + 1) % seg; fs.append(bm.faces.new((A[i], A[j], B[j], B[i])))
    for f in fs:
        for l in f.loops:
            co = l.vert.co; l[uvl].uv = (co.x * 0.5 + 0.5, co.y * 0.5 + 0.5); l[col] = (1, 1, 1, 1)
    # faces must point up (+Y game = +Z blender)
    for f in fs:
        f.normal_update()
        if f.normal.z < 0: f.normal_flip()

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    obs = [new_obj('flask_glass', flask_glass), new_obj('flask_liquid', flask_liquid), new_obj('flask_cork', flask_cork), new_obj('flask_band', flask_band),
           new_obj('petal', petal), new_obj('strand_a', strand('a')), new_obj('strand_b', strand('b')), new_obj('strand_c', strand('c')),
           new_obj('blob', blob), new_obj('flame', flame), new_obj('drop', drop), new_obj('bubble', bubble),
           new_obj('ice_a', ice('a'), False), new_obj('ice_b', ice('b'), False), new_obj('spark', spark, False), new_obj('disc', disc, False)]
    for i in range(4): obs.append(new_obj('shard_%d' % i, shard(i), False))
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(TMP, 'fx_flask.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'tris': tris}, open(os.path.join(OUT, 'fx_flask.glb.json'), 'w'))
    for k, o in enumerate(obs): o.location.x = k * 1.4
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_flask.blend'), compress=True)
    print('tris', tris, 'total', sum(tris.values()), 'glb bytes', len(raw), flush=True)

if __name__ == '__main__':
    main()
