"""약사 유봉강타 ph1_a1 전용 이펙트 메시 (Blender bpy, headless, 2026-11-12).

Usage:  python3 tools/blender/fx_smash.py        ->  assets/fx/fx_smash.glb.json  (+ tools/blender/pharm/fx_smash.blend)

fx_pharm.py(약사 공용 소품·아틀라스·아이콘)는 건드리지 않는다 — 이 파일은 메시 세 개만 만든다. 아틀라스 칸은 fx_pharm.png 것을 쓴다.
Meshes (game axes: +Y up, metres; js/pharmfx.js가 크기를 정함)
  smash_pestle   반투명 마력 유봉: 손잡이 끝 y 0 -> 머리 끝 y 1 (길이 1). 상아색 몸통, 금색 띠 3개 + 머리 테, 뚜렷한 둥근 머리.
                 정점 색 R·G·B = 상아/금, A 대신 색으로만 구분(셰이더가 림·투명도를 정함)
  smash_trail    굵고 짧은 둔기 궤적: XZ 평면의 호(반지름 TR_IN .. 1, TRAIL_SPAN 도), u 0 = 시작(위·뒤) -> 1 = 끝(타격), v 0 안쪽 .. 1 바깥
  smash_cracks   짧은 방사형 균열 r 0.22 .. 1.0 (7줄 + 곁가지), 평면, u = 길이 방향, v = 폭 (fx_pharm.png 'crack' 칸)
  smash_rim      (2026-11-13) 찌그러진 구덩이 둘레로 밀려 올라온 흙 턱: 반지름 ~1의 고리에 쐐기 조각 11개(안쪽 모서리가 솟고 바깥은 땅에 붙음),
                 정점 색 = 윗면 흙빛 / 안쪽 벽 어두운 흙. 구덩이 바닥의 음영은 js/pharmfx.js CRATER_FS가 그림(메시는 pharm_circle)
json: {b64, trailSpan(도), trailIn}
"""
import os, sys, math, json, base64, random
import bpy
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm as FP
from fx_pharm import V, lathe, new_obj

TRAIL_SPAN, TR_IN, TR_SEG = 190.0, 0.56, 48
IVORY, IVORY_LO, GOLDC, GOLD_HI = (0.97, 0.94, 0.86, 1), (0.86, 0.80, 0.68, 1), (1.0, 0.76, 0.28, 1), (1.0, 0.90, 0.55, 1)

def pestle(bm, col, uvl):
    # pommel, slim handle with three gold bands, flare, heavy rounded head (top 34 %) with a gold collar
    P = [(0.0, 0.0), (0.030, 0.004), (0.044, 0.020), (0.046, 0.040), (0.034, 0.056), (0.030, 0.070),            # pommel
         (0.030, 0.200), (0.040, 0.206), (0.040, 0.226), (0.030, 0.232),                                         # band 1
         (0.031, 0.400), (0.041, 0.406), (0.041, 0.426), (0.032, 0.432),                                         # band 2
         (0.036, 0.560), (0.048, 0.600), (0.058, 0.630), (0.074, 0.640), (0.078, 0.662), (0.074, 0.684),         # flare + collar
         (0.088, 0.700), (0.108, 0.760), (0.118, 0.830), (0.116, 0.900), (0.100, 0.955), (0.066, 0.990), (0.0, 1.0)]   # head
    band = {6, 7, 8, 10, 11, 12, 16, 17, 18}
    def c(k, prof):
        if k in band: return GOLD_HI if k in (7, 11, 17) else GOLDC
        y = prof[k][1]
        if y < 0.07: return GOLDC
        t = min(1.0, max(0.0, (y - 0.62) / 0.3))
        return tuple(IVORY_LO[i] * (1 - t) + IVORY[i] * t for i in range(3)) + (1,)
    lathe(bm, col, P, 28, c)

def trail(bm, col, uvl):
    rows = []
    for i in range(TR_SEG + 1):
        u = i / TR_SEG; a = math.radians(TRAIL_SPAN) * u
        rows.append((bm.verts.new(V(math.cos(a) * TR_IN, 0, math.sin(a) * TR_IN)), bm.verts.new(V(math.cos(a), 0, math.sin(a))), u))
    for i in range(TR_SEG):
        a0, b0, u0 = rows[i]; a1, b1, u1 = rows[i + 1]; f = bm.faces.new((a0, a1, b1, b0))
        for l in f.loops:
            l[uvl].uv = (u0 if l.vert in (a0, b0) else u1, 1.0 if l.vert in (b0, b1) else 0.0); l[col] = (1, 1, 1, 1)

def cracks(bm, col, uvl):
    rng = random.Random(41)
    def line(a, r0, r1, w, n=4):
        pts = []
        for k in range(n + 1):
            t = k / n; r = r0 + (r1 - r0) * t; aa = a + (rng.uniform(-0.16, 0.16) if k else 0)
            pts.append((math.cos(aa) * r, math.sin(aa) * r, t))
        prev = None
        for k, (x, z, t) in enumerate(pts):
            nx, nz = pts[min(k + 1, n)][0] - pts[max(k - 1, 0)][0], pts[min(k + 1, n)][1] - pts[max(k - 1, 0)][1]; m = math.hypot(nx, nz) or 1
            hw = w * (1 - t) ** 0.7 + 0.004
            cur = (bm.verts.new(V(x - nz / m * hw, 0, z + nx / m * hw)), bm.verts.new(V(x + nz / m * hw, 0, z - nx / m * hw)), t)
            if prev:
                f = bm.faces.new((prev[0], cur[0], cur[1], prev[1]))
                for l in f.loops: l[uvl].uv = (prev[2] if l.vert in (prev[0], prev[1]) else cur[2], 0.0 if l.vert in (prev[0], cur[0]) else 1.0); l[col] = (1, 1, 1, 1)
            prev = cur
        return pts
    for i in range(7):
        a = 2 * math.pi * (i + rng.uniform(-0.28, 0.28)) / 7; r1 = rng.uniform(0.62, 1.0)
        pts = line(a, 0.22, r1, 0.05)
        if rng.random() < 0.55:
            bx, bz, bt = pts[2]; line(math.atan2(bz, bx) + rng.choice((-1, 1)) * rng.uniform(0.5, 0.8), math.hypot(bx, bz), math.hypot(bx, bz) + rng.uniform(0.14, 0.26), 0.028, 2)

def rim(bm, col, uvl):
    rng = random.Random(7); N = 11
    TOP, TOP2, WALL, END = (0.62, 0.53, 0.42, 1), (0.50, 0.42, 0.33, 1), (0.25, 0.185, 0.13, 1), (0.36, 0.28, 0.21, 1)
    for i in range(N):
        a0 = 2 * math.pi * (i + rng.uniform(0.04, 0.12)) / N; a1 = 2 * math.pi * (i + 1 - rng.uniform(0.04, 0.12)) / N
        rin, rout, h = rng.uniform(0.76, 0.86), rng.uniform(1.0, 1.14), rng.uniform(0.15, 0.27); K = 3
        rows = []
        for k in range(K + 1):
            a = a0 + (a1 - a0) * k / K; e = 0.55 + 0.45 * math.sin(math.pi * k / K)        # lower towards both ends of a chunk
            c, s_ = math.cos(a), math.sin(a); ri = rin + rng.uniform(-0.02, 0.02); ro = rout + rng.uniform(-0.03, 0.03)
            rows.append((bm.verts.new(V(c * ri, h * e * rng.uniform(0.85, 1.1), s_ * ri)), bm.verts.new(V(c * ro, 0.0, s_ * ro)), bm.verts.new(V(c * (ri - 0.05), 0.0, s_ * (ri - 0.05)))))
        def face(vs, c):
            f = bm.faces.new(vs)
            for l in f.loops: l[col] = c; l[uvl].uv = (0, 0)
        for k in range(K):
            t0, o0, b0 = rows[k]; t1, o1, b1 = rows[k + 1]
            face((t0, t1, o1, o0), TOP if (i + k) % 2 else TOP2); face((b0, b1, t1, t0), WALL)
        face(rows[0], END); face(rows[-1][::-1], END)

def main():
    FP.reset()
    obs = [new_obj('smash_pestle', pestle), new_obj('smash_trail', trail, False), new_obj('smash_cracks', cracks, False), new_obj('smash_rim', rim, False)]
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(FP.TMP, 'fx_smash.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'trailSpan': TRAIL_SPAN, 'trailIn': TR_IN}, open(os.path.join(FP.OUT, 'fx_smash.glb.json'), 'w'))
    for k, o in enumerate(obs): o.location.x = k * 1.6
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(FP.SRC, 'fx_smash.blend'), compress=True)
    print('tris', tris, 'glb bytes', len(raw), flush=True)

if __name__ == '__main__':
    main()
