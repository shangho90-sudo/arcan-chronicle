"""예술가 1차 스킬 이펙트 메시 (Blender bpy, headless, 2026-11-13).

Usage:  python3 tools/blender/fx_art.py        ->  assets/fx/fx_art.glb.json  (+ tools/blender/art/fx_art.blend)

Meshes (game axes: +Y up, metres; js/artfx.js가 크기·색·움직임을 정함. 텍스처 없음 — 색은 정점 색(흰색 계열은 게임에서 물감 색으로 물들임))
  art_blob      물감 덩어리: 울퉁불퉁한 공 반지름 1 (흰색 + 위쪽 윤기) — 물감 탄환, 튀는 방울
  art_drop      물방울: 둥근 머리 반지름 1(원점), 꼬리 +y 2.2
  art_note      8분음표 ♪: 머리(원점 근처, 기울어진 타원) + 기둥 + 깃발, 높이 약 1.0, xy 평면에 두께 z
  art_note2     이어진 8분음표 ♫: 머리 둘 + 기둥 둘 + 굵은 가로대, 폭 약 0.9 높이 1.0
  art_frame     금테 액자 캔버스: 폭 1(x -0.5..0.5) 높이 1.25(y 0..1.25), 앞면 +z. 크림색 화폭에 물감 얼룩
  art_bulb      전구: 유리(반지름 0.42, 중심 y 0.62) + 황동 소켓(y 0..0.28), 높이 약 1.05
  art_palette   팔레트: 콩 모양 판(xz 평면, 반지름 약 1, 엄지 구멍) + 물감 덩이 6색
  art_critter   그림 생명체: 물감 방울 몸(높이 0.95, 반지름 0.5) + 큰 눈 둘 + 발 둘 + 머리 위 물감 뿔 셋, 앞 +z, 삼원색 얼룩
  art_scribble  낙서 고리: 반지름 1의 고리를 따라 꼬불꼬불 도는 굵은 선(관), UV u = 선을 따라 0..1 (그려지는 연출용)
json: {b64}
"""
import os, sys, math, json, base64, random
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm as FP
from fx_pharm import V, lathe, new_obj
SRC = os.path.join(HERE, 'art'); os.makedirs(SRC, exist_ok=True)

W, W_HI, W_LO = (0.92, 0.92, 0.92, 1), (1, 1, 1, 1), (0.62, 0.62, 0.66, 1)
GOLD, GOLD_HI, GOLD_LO = (0.98, 0.74, 0.24, 1), (1.0, 0.92, 0.55, 1), (0.66, 0.42, 0.12, 1)
CREAM, WOOD, WOOD_LO = (0.98, 0.94, 0.82, 1), (0.74, 0.52, 0.30, 1), (0.52, 0.34, 0.18, 1)
RED, YEL, BLU, GRN, VIO, ORG, PNK = (0.93, 0.22, 0.24, 1), (0.99, 0.80, 0.16, 1), (0.20, 0.45, 0.95, 1), (0.30, 0.76, 0.32, 1), (0.60, 0.36, 0.90, 1), (0.98, 0.52, 0.14, 1), (1.0, 0.52, 0.76, 1)
BLACK, GLASS, GLASS_HI, BRASS, BRASS_LO = (0.07, 0.06, 0.09, 1), (1.0, 0.93, 0.55, 1), (1.0, 1.0, 0.92, 1), (0.86, 0.66, 0.30, 1), (0.52, 0.38, 0.16, 1)

def mixc(a, b, k): return tuple(a[i] + (b[i] - a[i]) * k for i in range(4))

def ball(bm, col, r=1.0, c=(0, 0, 0), sx=1, sy=1, sz=1, seg=16, rows=10, colf=None, lump=0.0, seed=1, rot=0.0):
    """uv sphere; colf(nx, ny, nz) -> colour; lump = radial noise amount"""
    rnd = random.Random(seed); ph = [rnd.uniform(0, 6.28) for _ in range(6)]
    def P(i, j):
        th = math.pi * j / rows; a = 2 * math.pi * i / seg
        nx, ny, nz = math.sin(th) * math.cos(a), math.cos(th), math.sin(th) * math.sin(a)
        k = 1 + lump * (math.sin(nx * 3.1 + ph[0]) * math.sin(ny * 2.7 + ph[1]) + 0.6 * math.sin(nz * 4.3 + ph[2]) * math.sin(nx * 5.1 + ph[3]))
        x, y, z = nx * r * sx * k, ny * r * sy * k, nz * r * sz * k
        if rot: x, y = x * math.cos(rot) - y * math.sin(rot), x * math.sin(rot) + y * math.cos(rot)
        return (c[0] + x, c[1] + y, c[2] + z), (nx, ny, nz)
    top, _ = P(0, 0); bot, _ = P(0, rows); vt, vb = bm.verts.new(V(*top)), bm.verts.new(V(*bot))
    rings = [[(bm.verts.new(V(*P(i, j)[0])), P(i, j)[1]) for i in range(seg)] for j in range(1, rows)]
    cf = colf or (lambda nx, ny, nz: mixc(W, W_HI, max(0, ny)))
    def face(vs):
        f = bm.faces.new([v for v, _ in vs])
        for l, (_, n) in zip(f.loops, vs): l[col] = cf(*n)
    for i in range(seg):
        j = (i + 1) % seg
        face([(vt, (0, 1, 0)), rings[0][j], rings[0][i]]); face([(vb, (0, -1, 0)), rings[-1][i], rings[-1][j]])
        for k in range(len(rings) - 1): face([rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]])

def boxc(bm, col, x0, x1, y0, y1, z0, z1, c):
    fs = [((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)), ((x0, y0, z1), (x0, y1, z1), (x1, y1, z1), (x1, y0, z1)),
          ((x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)), ((x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0)),
          ((x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)), ((x0, y0, z0), (x0, y0, z1), (x1, y0, z1), (x1, y0, z0))]
    for f in fs:
        fc = bm.faces.new([bm.verts.new(V(*p)) for p in f])
        for l in fc.loops: l[col] = c

def blob(bm, col, uvl): ball(bm, col, 1.0, lump=0.10, seg=18, rows=12, colf=lambda nx, ny, nz: mixc(W_LO, W_HI, 0.5 + 0.5 * ny))

def drop(bm, col, uvl):
    lathe(bm, col, [(0.0, -1.0), (0.55, -0.84), (0.9, -0.45), (1.0, 0.0), (0.86, 0.5), (0.56, 1.0), (0.28, 1.55), (0.08, 2.05), (0.0, 2.2)], seg=14,
          colf=lambda k, p: mixc(W_LO, W_HI, k / 8))

def note_head(bm, col, cx, cy, r=0.2): ball(bm, col, r, (cx, cy, 0), sx=1.3, sy=0.92, sz=0.75, seg=14, rows=8, rot=-0.42, colf=lambda nx, ny, nz: mixc(W_LO, W_HI, 0.5 + 0.5 * ny))

def note(bm, col, uvl):
    note_head(bm, col, 0.0, 0.17)
    boxc(bm, col, 0.19, 0.25, 0.2, 1.0, -0.045, 0.045, W)                                    # stem on the right of the head
    # flag: a thick curved tail from the stem top going right and down
    P = [(0.25, 1.0), (0.42, 0.86), (0.52, 0.68), (0.5, 0.5)]; Wd = [0.2, 0.17, 0.12, 0.05]
    for i in range(3):
        (xa, ya), (xb, yb) = P[i], P[i + 1]; wa, wb = Wd[i], Wd[i + 1]
        for z0, z1 in ((-0.04, 0.04),):
            vs = [(xa, ya, z1), (xb, yb, z1), (xb, yb - wb, z1), (xa, ya - wa, z1)]
            for q in (vs, [(x, y, z0) for (x, y, z) in reversed(vs)]):
                f = bm.faces.new([bm.verts.new(V(*p)) for p in q])
                for l in f.loops: l[col] = W_HI if q is vs else W_LO
            for a, b in (((xa, ya), (xb, yb)), ((xb, yb - wb), (xa, ya - wa))):
                f = bm.faces.new([bm.verts.new(V(*p)) for p in ((a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1))])
                for l in f.loops: l[col] = W

def note2(bm, col, uvl):
    note_head(bm, col, -0.32, 0.15); note_head(bm, col, 0.3, 0.24)
    boxc(bm, col, -0.13, -0.07, 0.18, 0.92, -0.045, 0.045, W); boxc(bm, col, 0.49, 0.55, 0.27, 1.0, -0.045, 0.045, W)
    for z0, z1, c in ((-0.05, 0.05, W_HI),):                                                # slanted beam
        vs = [(-0.13, 0.92, z1), (0.55, 1.0, z1), (0.55, 0.82, z1), (-0.13, 0.74, z1)]
        for q, cc in ((vs, W_HI), ([(x, y, z0) for (x, y, z) in reversed(vs)], W_LO)):
            f = bm.faces.new([bm.verts.new(V(*p)) for p in q])
            for l in f.loops: l[col] = cc
        for a, b in (((-0.13, 0.92), (0.55, 1.0)), ((0.55, 0.82), (-0.13, 0.74))):
            f = bm.faces.new([bm.verts.new(V(*p)) for p in ((a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1))])
            for l in f.loops: l[col] = W

def frame(bm, col, uvl):
    w, h, t, d = 0.5, 1.25, 0.11, 0.07
    boxc(bm, col, -w, w, 0, t, -d, d, GOLD_LO); boxc(bm, col, -w, w, h - t, h, -d, d, GOLD_HI)
    boxc(bm, col, -w, -w + t, t, h - t, -d, d, GOLD); boxc(bm, col, w - t, w, t, h - t, -d, d, GOLD)
    for (x, y) in ((-w, 0), (w - 0.15, 0), (-w, h - 0.15), (w - 0.15, h - 0.15)): boxc(bm, col, x, x + 0.15, y, y + 0.15, -d - 0.02, d + 0.02, GOLD_HI)   # corner blocks
    boxc(bm, col, -w + t, w - t, t, h - t, -0.025, 0.02, CREAM)                             # canvas
    # paint splotches on the canvas (flat discs just in front of it): the little creature's colours
    for (cx, cy, r, c) in ((-0.08, 0.66, 0.2, RED), (0.12, 0.52, 0.17, BLU), (0.0, 0.84, 0.13, YEL), (-0.16, 0.42, 0.1, GRN), (0.17, 0.8, 0.08, VIO)):
        vc = bm.verts.new(V(cx, cy, 0.026)); ring = [bm.verts.new(V(cx + math.cos(a) * r * (1 + 0.18 * math.sin(a * 3 + cx * 9)), cy + math.sin(a) * r * (1 + 0.18 * math.cos(a * 2 + cy * 7)), 0.026)) for a in [2 * math.pi * i / 12 for i in range(12)]]
        for i in range(12):
            f = bm.faces.new((vc, ring[i], ring[(i + 1) % 12]))
            for l in f.loops: l[col] = c

def bulb(bm, col, uvl):
    def cf(k, p):
        y = p[k][1]
        return BRASS_LO if y < 0.06 else (BRASS if (int(y / 0.055) % 2 == 0) else BRASS_LO) if y < 0.28 else mixc(GLASS, GLASS_HI, min(1, (y - 0.28) / 0.6))
    lathe(bm, col, [(0.0, 0.0), (0.07, 0.0), (0.12, 0.05), (0.145, 0.06), (0.15, 0.11), (0.14, 0.115), (0.15, 0.165), (0.14, 0.17), (0.15, 0.22), (0.145, 0.28),
                    (0.19, 0.34), (0.31, 0.44), (0.4, 0.56), (0.42, 0.66), (0.39, 0.8), (0.3, 0.93), (0.17, 1.02), (0.0, 1.05)], seg=18, colf=cf)

def palette(bm, col, uvl):
    N = 30; th = 0.05
    def R(a): return 1.0 * (0.80 + 0.16 * math.cos(a - 0.5) + 0.08 * math.cos(2 * a + 1.0)) * (1 - 0.30 * math.exp(-((a - 3.9) % 6.283 - 0) ** 2 / 0.12) if False else 1)
    pts = []
    for i in range(N):
        a = 2 * math.pi * i / N; r = R(a)
        dent = 0.26 * math.exp(-(((a - 4.0 + math.pi) % (2 * math.pi)) - math.pi) ** 2 / 0.10)   # the notch next to the thumb hole
        pts.append((math.cos(a) * r * (1 - dent) * 1.12, math.sin(a) * r * (1 - dent) * 0.9))
    ct, cb = bm.verts.new(V(0.1, th, 0.05)), bm.verts.new(V(0.1, 0, 0.05))
    top = [bm.verts.new(V(x, th, z)) for (x, z) in pts]; bot = [bm.verts.new(V(x, 0, z)) for (x, z) in pts]
    for i in range(N):
        j = (i + 1) % N
        for vs, c in (((ct, top[j], top[i]), WOOD), ((cb, bot[i], bot[j]), WOOD_LO), ((top[i], top[j], bot[j], bot[i]), WOOD_LO)):
            f = bm.faces.new(vs)
            for l in f.loops: l[col] = c
    ball(bm, col, 0.13, (-0.42, th + 0.0, -0.36), sy=0.25, seg=10, rows=6, colf=lambda *n: BLACK)                       # thumb hole (dark dimple)
    for k, c in enumerate((RED, ORG, YEL, GRN, BLU, VIO)):
        a = -0.6 + k * 0.62; r = 0.66
        ball(bm, col, 0.16, (math.cos(a) * r * 1.1 + 0.05, th + 0.02, math.sin(a) * r * 0.86 + 0.05), sy=0.55, seg=10, rows=6, lump=0.08, seed=k + 3,
             colf=lambda nx, ny, nz, c=c: mixc(c, W_HI, 0.35 * max(0, ny)))

def critter(bm, col, uvl):
    # body: a fat paint drop standing on the ground; colour patches by direction (red / yellow / blue thirds), lighter belly and top
    def cf(nx, ny, nz):
        a = math.atan2(nz, nx); base = RED if -0.4 < a <= 1.7 else (BLU if a > 1.7 or a <= -2.5 else YEL)
        k = 0.5 + 0.5 * math.sin(a * 3 + ny * 4)
        c = mixc(base, YEL if base is RED else (RED if base is BLU else BLU), 0.18 * k)
        return mixc(mixc(c, W_HI, 0.30 * max(0, ny)), (0.2, 0.1, 0.25, 1), 0.25 * max(0, -ny))
    ball(bm, col, 0.5, (0, 0.5, 0), sy=1.0, seg=20, rows=14, lump=0.045, seed=7, colf=cf)
    for sx in (-1, 1):
        ball(bm, col, 0.15, (sx * 0.2, 0.62, 0.41), sz=0.6, seg=12, rows=8, colf=lambda *n: W_HI)                            # eye whites
        ball(bm, col, 0.075, (sx * 0.185, 0.61, 0.5), sz=0.6, seg=10, rows=6, colf=lambda *n: BLACK)                          # pupils
        ball(bm, col, 0.028, (sx * 0.205, 0.65, 0.535), seg=6, rows=4, colf=lambda *n: W_HI)                                  # glints
        ball(bm, col, 0.16, (sx * 0.24, 0.07, 0.1), sy=0.5, sz=1.3, seg=10, rows=6, colf=lambda nx, ny, nz: mixc(BLU, W_HI, 0.3 * max(0, ny)))   # feet
        ball(bm, col, 0.1, (sx * 0.5, 0.42, 0.05), sy=1.5, seg=8, rows=6, colf=lambda nx, ny, nz: mixc(YEL, W_HI, 0.3 * max(0, ny)))            # stubby arms
    for (x, z, h, c) in ((0.0, 0.0, 0.34, YEL), (-0.2, -0.02, 0.24, BLU), (0.2, -0.04, 0.26, GRN)):                          # paint drips standing up like a crown
        lathe(bm, col, [(0.11, 0.0), (0.12, h * 0.3), (0.085, h * 0.7), (0.0, h)], seg=8, colf=lambda k, p, c=c: mixc(c, W_HI, 0.2 * k), y0=0.93 - abs(x) * 0.35)
        for v in list(bm.verts)[-8 * 4:]: v.co.x += x; v.co.y += -z
    # smile
    for i in range(6):
        a0, a1 = math.pi * (1.15 + 0.7 * i / 6), math.pi * (1.15 + 0.7 * (i + 1) / 6)
        vs = [(math.cos(a0) * 0.13, 0.5 + math.sin(a0) * 0.1, 0.495), (math.cos(a1) * 0.13, 0.5 + math.sin(a1) * 0.1, 0.495), (math.cos(a1) * 0.1, 0.5 + math.sin(a1) * 0.07, 0.5), (math.cos(a0) * 0.1, 0.5 + math.sin(a0) * 0.07, 0.5)]
        f = bm.faces.new([bm.verts.new(V(*p)) for p in vs])
        for l in f.loops: l[col] = BLACK

def scribble(bm, col, uvl):
    N, seg, tr = 180, 6, 0.045
    def C(u):
        a = u * 2 * math.pi * 1.0; w = u * 2 * math.pi * 9
        r = 1.0 + 0.16 * math.cos(w); y = 0.16 * math.sin(w) + 0.06 * math.sin(a * 2)
        return (math.cos(a) * r, y, math.sin(a) * r)
    rings = []
    for i in range(N + 1):
        u = i / N; p = C(u); q = C(min(1, u + 0.002)); p0 = C(max(0, u - 0.002))
        t = [q[k] - p0[k] for k in range(3)]; m = math.sqrt(sum(x * x for x in t)) or 1; t = [x / m for x in t]
        up = (0, 1, 0); n = [t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]]; m = math.sqrt(sum(x * x for x in n)) or 1; n = [x / m for x in n]
        b = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]]
        taper = min(1, u / 0.03, (1 - u) / 0.03) ** 0.5
        rings.append(([bm.verts.new(V(*[p[k] + (n[k] * math.cos(2 * math.pi * s / seg) + b[k] * math.sin(2 * math.pi * s / seg)) * tr * max(0.15, taper) for k in range(3)])) for s in range(seg)], u))
    for i in range(N):
        (ra, ua), (rb, ub) = rings[i], rings[i + 1]
        for s in range(seg):
            f = bm.faces.new((ra[s], ra[(s + 1) % seg], rb[(s + 1) % seg], rb[s]))
            for l, uu in zip(f.loops, (ua, ua, ub, ub)): l[col] = W_HI if s < 3 else W; l[uvl].uv = (uu, s / seg)

def main():
    FP.reset()
    obs = [new_obj('art_blob', blob), new_obj('art_drop', drop), new_obj('art_note', note, False), new_obj('art_note2', note2, False), new_obj('art_frame', frame, False),
           new_obj('art_bulb', bulb), new_obj('art_palette', palette), new_obj('art_critter', critter), new_obj('art_scribble', scribble)]
    for o in obs:
        if o.name in ('art_note', 'art_note2', 'art_palette'):
            m = o.modifiers.new('es', 'EDGE_SPLIT'); m.split_angle = math.radians(40)
            for p in o.data.polygons: p.use_smooth = True
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(FP.TMP, 'fx_art.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(FP.OUT, 'fx_art.glb.json'), 'w'))
    for k, o in enumerate(obs): o.location.x = k * 2.6
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_art.blend'), compress=True)
    print('tris', tris, 'glb bytes', len(raw), flush=True)

if __name__ == '__main__':
    main()
