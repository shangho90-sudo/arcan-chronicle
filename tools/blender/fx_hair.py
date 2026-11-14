"""미용사 1차 스킬 이펙트 메시 (Blender bpy, headless, 2026-11-13).

Usage:  python3 tools/blender/fx_hair.py        ->  assets/fx/fx_hair.glb.json  (+ tools/blender/hair/fx_hair.blend)

Meshes (game axes: +Y up, metres; js/hairfx.js가 크기·움직임을 정함. 텍스처 없음 — 색은 정점 색, 빛은 셰이더)
  hair_half    큰 가위의 반쪽: 축(피벗) = 원점, 날은 +x 로 길이 1(자르는 쪽 = -y), 손잡이 고리는 -x 뒤쪽 위(+y). xy 평면에 납작(두께 z).
               다른 반쪽은 게임에서 y를 뒤집어 씀. 은색 날 + 밝은 날 끝 띠, 고리는 분홍
  hair_strand  잘린 머리카락 한 가닥: 가늘어지는 살짝 휜 리본, 길이 1 (+y), 흰색(게임에서 물들임)
  hair_spark   네 꼭지 반짝이: 두께 있는 별, 반지름 1 (xy 평면)
  hair_curl    감기는 머리카락/리본: 반지름 1 · 높이 1 · 2.5바퀴 나선 리본 (헤어롤 덫이 죄는 모습, 스타일링 소용돌이)
  hair_comb    빗(절차 대체용): 등 + 이 11개, 길이 x -1 .. 1, xz 평면에 납작
  hair_dryer   드라이어(절차 대체용): 몸통 축 +x(바람 나오는 쪽 x 1), 손잡이 -y
  hair_roller  헤어롤(절차 대체용): 누운 원통 축 x, 바닥 y 0, 길이 1
  (2026-11-14 추가 — 끝단 자르기·스텝 커트·드라이어 3종 연출 차별화)
  hair_lock    잘린 머리카락 한 움큼: 뿌리(원점)에서 +y로 부채처럼 퍼지는 가닥 5개, 길이 1, 흰색(게임에서 물들임)
  hair_swirl   바람 리본: +x 축을 따라 0 -> 1, 반지름 0.12 -> 0.42로 커지며 1.4바퀴 감기는 띠. uv.x = 길이, uv.y = 폭
               (게임은 가산 바람 줄기 셰이더(SPR uK 5)로 그림 — 양 끝이 부드럽게 사라짐)
  hair_flake   눈송이: 여섯 갈래 + 곁가지, 반지름 1, xy 평면에 납작
  hair_crystal 얼음 결정 묶음: 바닥(원점)에서 위로 솟는 뾰족한 육각 기둥 5개, 높이 1, 옅은 하늘색 + 흰 끝
  hair_leaf    작은 잎: 길이 1(+x), 가운데 잎맥, 연두·노랑 정점 색
Tripo 모델(빗·드라이어·헤어롤)은 tools/blender/fx_hair_tripo.py -> fx_hair_tripo.glb.json. 있으면 게임이 그쪽을 씀.
json: {b64}
"""
import os, sys, math, json, base64
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm as FP
from fx_pharm import V, lathe, new_obj
from fx_cook import quad, box
SRC = os.path.join(HERE, 'hair'); os.makedirs(SRC, exist_ok=True)

STEEL, STEEL_HI, STEEL_LO = (0.82, 0.86, 0.93, 1), (1.0, 1.0, 1.0, 1), (0.56, 0.60, 0.70, 1)
WHITE, GOLD = (1, 1, 1, 1), (1.0, 0.82, 0.36, 1)
PINK, PINK_LO, VIOLET, VIOLET_LO = (1.0, 0.52, 0.72, 1), (0.84, 0.34, 0.56, 1), (0.66, 0.46, 0.96, 1), (0.46, 0.30, 0.76, 1)

def half(bm, col, uvl):
    t = 0.022
    # blade: spine (+y) to cutting edge (-y), tapering to the tip at x 1; bright band along the edge
    N = 8; cols = []
    for i in range(N + 1):
        u = i / N; x = -0.02 + 1.02 * u; w = 0.11 * (1 - u ** 1.6) + 0.012
        cols.append((x, w * 0.62, -w * 0.38, -w * 0.38 + 0.03 * (1 - u) + 0.006))   # x, spine y, edge y, bevel y
    for i in range(N):
        (xa, sa, ea, ba), (xb, sb, eb, bb) = cols[i], cols[i + 1]
        for sgn in (1, -1):
            z = sgn * t
            a = [(xa, ea, 0), (xb, eb, 0), (xb, bb, z * 0.5), (xa, ba, z * 0.5)]; b = [(xa, ba, z * 0.5), (xb, bb, z * 0.5), (xb, sb, z), (xa, sa, z)]
            if sgn < 0: a.reverse(); b.reverse()
            quad(bm, col, a, STEEL_HI); quad(bm, col, b, STEEL if sgn > 0 else STEEL_LO)
        quad(bm, col, [(xa, sa, t), (xb, sb, t), (xb, sb, -t), (xa, sa, -t)], STEEL_LO)
    # shank back to the ring, bending up (+y)
    sh = [(-0.02, 0.07, 0.045), (-0.20, 0.10, 0.036), (-0.36, 0.17, 0.030)]
    for i in range(len(sh) - 1):
        (xa, ya, wa), (xb, yb, wb) = sh[i], sh[i + 1]
        quad(bm, col, [(xa, ya - wa, t), (xa, ya + wa, t), (xb, yb + wb, t), (xb, yb - wb, t)][::-1], STEEL)
        quad(bm, col, [(xa, ya - wa, -t), (xa, ya + wa, -t), (xb, yb + wb, -t), (xb, yb - wb, -t)], STEEL_LO)
        quad(bm, col, [(xa, ya + wa, -t), (xa, ya + wa, t), (xb, yb + wb, t), (xb, yb + wb, -t)][::-1], STEEL_LO)
        quad(bm, col, [(xa, ya - wa, -t), (xa, ya - wa, t), (xb, yb - wb, t), (xb, yb - wb, -t)], STEEL_LO)
    # ring handle: torus in the xy plane (white: tinted in game)
    cx, cy, R, r = -0.52, 0.22, 0.165, 0.042; S, T = 20, 8
    ring = [[bm.verts.new(V(cx + (R + r * math.cos(2 * math.pi * j / T)) * math.cos(2 * math.pi * i / S), cy + (R + r * math.cos(2 * math.pi * j / T)) * math.sin(2 * math.pi * i / S), r * math.sin(2 * math.pi * j / T))) for j in range(T)] for i in range(S)]
    for i in range(S):
        for j in range(T):
            f = bm.faces.new((ring[i][j], ring[(i + 1) % S][j], ring[(i + 1) % S][(j + 1) % T], ring[i][(j + 1) % T]))
            for l in f.loops: l[col] = PINK if j < T // 2 else PINK_LO
    # pivot screw
    lathe_pts = [(0.0, -0.035), (0.05, -0.035), (0.05, 0.035), (0.0, 0.035)]
    for sgn in (1, -1):
        c = bm.verts.new(V(0, 0, sgn * 0.034)); rr = [bm.verts.new(V(0.05 * math.cos(2 * math.pi * k / 10), 0.05 * math.sin(2 * math.pi * k / 10), sgn * 0.028)) for k in range(10)]
        for k in range(10):
            vs = (c, rr[k], rr[(k + 1) % 10]) if sgn > 0 else (c, rr[(k + 1) % 10], rr[k]); f = bm.faces.new(vs)
            for l in f.loops: l[col] = GOLD

def strand(bm, col, uvl):
    N = 6
    for i in range(N):
        u0, u1 = i / N, (i + 1) / N
        def P(u, s): w = 0.05 * (1 - u) ** 0.8 + 0.006; return (0.18 * math.sin(u * 2.4) + s * w, u, 0.06 * math.sin(u * 3.1))
        quad(bm, col, [P(u0, -1), P(u0, 1), P(u1, 1), P(u1, -1)], WHITE)

def spark(bm, col, uvl):
    pts = []
    for i in range(8):
        a = math.pi / 2 + i * math.pi / 4; r = 1.0 if i % 2 == 0 else 0.28; pts.append((math.cos(a) * r, math.sin(a) * r))
    t = 0.12; cf, cb = bm.verts.new(V(0, 0, t)), bm.verts.new(V(0, 0, -t)); ring = [bm.verts.new(V(x, y, 0)) for (x, y) in pts]
    for i in range(8):
        j = (i + 1) % 8
        for vs in ((cf, ring[i], ring[j]), (cb, ring[j], ring[i])):
            f = bm.faces.new(vs)
            for l in f.loops: l[col] = WHITE if l.vert in (cf, cb) else (0.86, 0.86, 0.86, 1)

def curl(bm, col, uvl):
    N, turns, w = 44, 2.5, 0.11
    def P(u, s): a = u * turns * 2 * math.pi; return (math.cos(a), u + s * w * (0.35 + 0.65 * math.sin(u * math.pi)), math.sin(a))
    for i in range(N):
        u0, u1 = i / N, (i + 1) / N
        quad(bm, col, [P(u0, -1), P(u1, -1), P(u1, 1), P(u0, 1)], WHITE)

def comb(bm, col, uvl):
    box(bm, col, -1.0, 1.0, -0.05, 0.05, 0.12, 0.42, PINK, (1.0, 0.70, 0.84, 1))      # spine
    box(bm, col, -1.0, 1.0, -0.055, 0.055, 0.10, 0.14, GOLD)
    for i in range(11):
        x = -0.92 + i * 0.184; box(bm, col, x - 0.045, x + 0.045, -0.035, 0.035, -0.42, 0.12, VIOLET if i % 2 else PINK_LO)

def dryer(bm, col, uvl):
    # body: lathe about the x axis (profile r, x), nozzle at +x
    prof = [(0.0, -0.55), (0.30, -0.55), (0.36, -0.45), (0.38, 0.10), (0.30, 0.45), (0.25, 0.55), (0.27, 1.0), (0.22, 1.0), (0.0, 0.6)]
    S = 18
    rings = [[bm.verts.new(V(x, r * math.cos(2 * math.pi * k / S), r * math.sin(2 * math.pi * k / S))) for k in range(S)] for (r, x) in prof]
    for a in range(len(rings) - 1):
        c = STEEL if a >= 5 else (VIOLET if a < 2 else PINK)
        for k in range(S):
            j = (k + 1) % S; f = bm.faces.new((rings[a][k], rings[a][j], rings[a + 1][j], rings[a + 1][k]))
            for l in f.loops: l[col] = c if k < S // 2 else tuple(v * 0.8 for v in c[:3]) + (1,)
    box(bm, col, -0.30, -0.05, -1.05, -0.30, -0.11, 0.11, PINK_LO, PINK)                # handle
    box(bm, col, -0.06, 0.0, -0.62, -0.50, -0.05, 0.05, WHITE)

def roller(bm, col, uvl):
    S = 16; R = 0.34
    for (ra, xa, rb, xb, c) in [(R, -0.5, R, 0.5, PINK), (R * 0.72, 0.5, R * 0.72, -0.5, PINK_LO)]:
        A = [bm.verts.new(V(xa, R + ra * math.cos(2 * math.pi * k / S), ra * math.sin(2 * math.pi * k / S))) for k in range(S)]
        B = [bm.verts.new(V(xb, R + rb * math.cos(2 * math.pi * k / S), rb * math.sin(2 * math.pi * k / S))) for k in range(S)]
        for k in range(S):
            j = (k + 1) % S; f = bm.faces.new((A[k], A[j], B[j], B[k]))
            for l in f.loops: l[col] = c
    for x in (-0.5, 0.5):
        A = [(x, R + R * math.cos(2 * math.pi * k / S), R * math.sin(2 * math.pi * k / S)) for k in range(S)]; B = [(x, R + R * 0.72 * math.cos(2 * math.pi * k / S), R * 0.72 * math.sin(2 * math.pi * k / S)) for k in range(S)]
        for k in range(S):
            j = (k + 1) % S; q = [A[k], A[j], B[j], B[k]]; quad(bm, col, q if x > 0 else q[::-1], VIOLET)
    for i in range(5):                                                                   # bristle rows
        for k in range(8):
            a = 2 * math.pi * (k + 0.5 * (i % 2)) / 8; x = -0.4 + i * 0.2; y, z = R + (R + 0.03) * math.cos(a), (R + 0.03) * math.sin(a)
            box(bm, col, x - 0.025, x + 0.025, y - 0.03, y + 0.03, z - 0.03, z + 0.03, VIOLET_LO)

def lock(bm, col, uvl):
    for k in range(5):
        a = (k - 2) * 0.16; N = 6; ln = 0.82 + 0.18 * ((k * 7) % 3) / 2
        def P(u, s):
            w = 0.045 * (1 - u) ** 0.7 + 0.004; y = u * ln * math.cos(a); x = u * ln * math.sin(a) + 0.08 * math.sin(u * 2.6 + k)
            return (x + s * w * math.cos(a), y - s * w * math.sin(a), 0.05 * math.sin(u * 3 + k) + (k - 2) * 0.012)
        for i in range(N):
            u0, u1 = i / N, (i + 1) / N
            quad(bm, col, [P(u0, -1), P(u0, 1), P(u1, 1), P(u1, -1)], WHITE)

def swirl(bm, col, uvl):
    N, turns, w = 40, 1.4, 0.16
    def P(u, s):
        a = u * turns * 2 * math.pi; r = 0.12 + 0.30 * u; ww = w * (0.6 + 0.6 * u) * s * 0.5
        return (u, r * math.cos(a) + ww * 0.0, r * math.sin(a)), (0, ww)
    for i in range(N):
        u0, u1 = i / N, (i + 1) / N
        vs = []
        for (u, s) in ((u0, -1), (u1, -1), (u1, 1), (u0, 1)):
            a = u * turns * 2 * math.pi; r = 0.12 + 0.30 * u; hw = w * (0.6 + 0.6 * u) * 0.5
            # the band's width runs along the axis (x) so it reads as a flat ribbon wrapping the stream
            vs.append(((u + s * hw * 0.55, r * math.cos(a), r * math.sin(a)), (u, 0.5 + 0.5 * s)))
        f = bm.faces.new([bm.verts.new(V(*p)) for p, _ in vs])
        for l, (_, uv) in zip(f.loops, vs): l[col] = WHITE; l[uvl].uv = uv

def flake(bm, col, uvl):
    t = 0.05
    def bar(x0, y0, x1, y1, w, c):
        dx, dy = x1 - x0, y1 - y0; L = math.hypot(dx, dy) or 1; nx, ny = -dy / L * w, dx / L * w
        for z, rev in ((t, False), (-t, True)):
            q = [(x0 - nx, y0 - ny, z), (x1 - nx * 0.4, y1 - ny * 0.4, z), (x1 + nx * 0.4, y1 + ny * 0.4, z), (x0 + nx, y0 + ny, z)]
            quad(bm, col, q[::-1] if rev else q, c)
    for k in range(6):
        a = k * math.pi / 3; ca, sa = math.cos(a), math.sin(a)
        bar(0, 0, ca, sa, 0.085, WHITE)
        for (r, ln) in ((0.45, 0.3), (0.72, 0.2)):
            for sg in (1, -1):
                b = a + sg * math.pi / 3.2; bar(ca * r, sa * r, ca * r + math.cos(b) * ln, sa * r + math.sin(b) * ln, 0.05, (0.86, 0.95, 1.0, 1))

def crystal(bm, col, uvl):
    ICE, ICE_LO, TIP = (0.72, 0.90, 1.0, 1), (0.42, 0.66, 0.92, 1), (1, 1, 1, 1)
    spikes = [(0, 0, 0, 1.0, 0.16), (0.22, 0.05, 0.42, 0.66, 0.11), (-0.2, -0.08, -0.45, 0.6, 0.1), (0.05, 0.22, 0.2, 0.5, 0.09), (-0.06, -0.2, -0.1, 0.45, 0.085)]
    for (x, z, lean, h, r) in spikes:
        ax = (math.sin(lean) * 0.6, math.cos(lean), math.sin(lean) * 0.35 * (1 if x >= 0 else -1)); top = (x + ax[0] * h, ax[1] * h, z + ax[2] * h)
        mid = (x + ax[0] * h * 0.72, ax[1] * h * 0.72, z + ax[2] * h * 0.72)
        S = 6; base = [(x + r * math.cos(2 * math.pi * k / S), 0.0, z + r * math.sin(2 * math.pi * k / S)) for k in range(S)]
        upr = [(mid[0] + r * 0.85 * math.cos(2 * math.pi * k / S), mid[1], mid[2] + r * 0.85 * math.sin(2 * math.pi * k / S)) for k in range(S)]
        for k in range(S):
            j = (k + 1) % S; c = ICE if k % 2 else ICE_LO
            quad(bm, col, [base[k], base[j], upr[j], upr[k]], c)
            f = bm.faces.new([bm.verts.new(V(*upr[k])), bm.verts.new(V(*upr[j])), bm.verts.new(V(*top))])
            for l in f.loops: l[col] = TIP if l.vert.co.z > mid[1] + 1e-4 else c

def leaf(bm, col, uvl):
    LG, LG2, RIB = (0.62, 0.86, 0.34, 1), (0.92, 0.84, 0.30, 1), (0.98, 0.98, 0.70, 1)
    N = 8
    for i in range(N):
        u0, u1 = i / N, (i + 1) / N
        w0, w1 = 0.32 * math.sin(math.pi * u0) ** 0.8, 0.32 * math.sin(math.pi * u1) ** 0.8
        y0, y1 = 0.06 * math.sin(u0 * 3), 0.06 * math.sin(u1 * 3)
        for sg in (1, -1):
            q = [(u0, y0, 0), (u1, y1, 0), (u1, y1 + 0.04, sg * w1), (u0, y0 + 0.04, sg * w0)]
            quad(bm, col, q if sg > 0 else q[::-1], LG if sg > 0 else LG2)
        quad(bm, col, [(u0, y0 + 0.012, -0.018), (u1, y1 + 0.012, -0.018), (u1, y1 + 0.012, 0.018), (u0, y0 + 0.012, 0.018)], RIB)

def main():
    FP.reset()
    obs = [new_obj('hair_half', half, False), new_obj('hair_strand', strand, False), new_obj('hair_spark', spark, False), new_obj('hair_curl', curl, False),
           new_obj('hair_comb', comb, False), new_obj('hair_dryer', dryer, False), new_obj('hair_roller', roller, False),
           new_obj('hair_lock', lock, False), new_obj('hair_swirl', swirl, False), new_obj('hair_flake', flake, False), new_obj('hair_crystal', crystal, True), new_obj('hair_leaf', leaf, False)]
    for o in obs:
        if o.name in ('hair_half', 'hair_dryer', 'hair_roller'):
            m = o.modifiers.new('es', 'EDGE_SPLIT'); m.split_angle = math.radians(38)
            for p in o.data.polygons: p.use_smooth = True
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(FP.TMP, 'fx_hair.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(FP.OUT, 'fx_hair.glb.json'), 'w'))
    for k, o in enumerate(obs): o.location.x = k * 2.6
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_hair.blend'), compress=True)
    print('tris', tris, 'glb bytes', len(raw), flush=True)

if __name__ == '__main__':
    main()
