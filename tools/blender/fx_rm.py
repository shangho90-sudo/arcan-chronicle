"""스킬 이펙트 리마스터(테일즈위버풍, 2026-11-19) 공용 메시 — Blender bpy, headless.

Usage:  python3 tools/blender/fx_rm.py        (bpy module, Blender 5.x)

이미지 없음: 모든 빛·색은 js/rmfx.js 셰이더가 UV로 그림(u = 길이 방향, v = 가로/높이). 게임 축: +Z 앞, +Y 위, +X 옆, 미터 단위 1.
  rm_cres       입체 반달 검기: 반지름 1, 약 170°, 가운데가 두껍고 양끝이 뾰족(비대칭 — 끝 쪽이 두꺼움), 단면은 얕은 V(위에서 봐도 납작한
                원판이 아니라 칼날 면) — u = 휘두름 시작 0 → 끝 1, v = 안쪽 0 → 바깥 칼날 1. 같은 메시를 크기를 달리해 세 층(중심·중간·외곽)으로 씀.
  rm_cres_big   마무리 큰 검기: 약 215°, 더 넓고 두 겹(바깥 칼날 + 안쪽 리본).
  rm_comet      혜성 몸통(투사체 층): 머리 z=0 둥근 반구 → 꼬리 z=-1로 가늘어짐, u = 꼬리 0 → 머리 1, v = 둘레.
  rm_crown      물감·물보라 왕관: 12갈래 꽃잎이 바깥·위로 벌어짐(반지름 1, 높이 0.7), u = 둘레, v = 아래 0 → 끝 1.
  rm_ring       땅 충격파: 납작한 고리(바깥 반지름 1, 안 0.55), u = 둘레, v = 안 0 → 바깥 1.
  rm_streak     불티·빛줄기: 길이 1(+Z) 가는 마름모 두 장 교차, u = 꼬리 0 → 머리 1.
  rm_drop       방울: 저폴리 구(반지름 1).
  rm_star       통통한 네 갈래 3D 별(반지름 1).
  (4묶음 원소) rm_band   위가 열린 원통 벽(반지름 1, 높이 1): u = 둘레, v = 아래 0 → 위 1 — 불기둥·소리 고리 벽(셰이더가 모양을 냄).
  rm_flame      불꽃 혀: 아래가 둥글고 위로 휘며 뾰족(높이 1, 폭 약 0.36), u = 둘레, v = 아래 0 → 끝 1.
  rm_crystal    얼음 결정: 육각 기둥 + 뾰족한 끝(높이 1, 반지름 0.16, 바닥 원점), u = 둘레, v = 높이.
  rm_shard      얼음 파편: 두께 있는 불규칙 삼각 조각(가장 긴 변 약 1).
  rm_wave       음파 호 벽: 60° 호(반지름 1), 단면은 가운데가 부푼 얇은 띠(높이 0.6), u = 호 0 → 1, v = 아래 0 → 위 1.
출력: assets/fx/fx_rm.glb.json (base64 GLB, 재질·이미지 없음, 노멀·UV 있음) + tools/blender/rm/fx_rm.blend
"""
import os, sys, math, json, base64
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import blib

ROOT = os.path.join(HERE, '..', '..'); OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'rm'); TMP = os.path.join(HERE, 'out')
for d in (OUT, SRC, TMP): os.makedirs(d, exist_ok=True)
SEG = 40

def V(x, y, z):
    """game axes (x, y up, z forward) -> Blender (glTF export turns Blender -Y into +Z, Z into +Y)"""
    return (x, -z, y)

def face(bm, uvl, vs, uvs):
    f = bm.faces.new(vs)
    for l, uv in zip(f.loops, uvs): l[uvl].uv = uv
    return f

def crescent(bm, uvl, a0, a1, w, peak, ridge, r_out=1.0, v0=0.0, v1=1.0):
    """3 rows across (inner, ridge, outer): the ridge is lifted (+y) so the blade has a shallow V section"""
    k = math.log(0.5) / math.log(peak); rows = []
    for i in range(SEG + 1):
        t = i / SEG; a = math.radians(a0 + (a1 - a0) * t)
        wt = w * math.sin(math.pi * t ** k) ** 0.8 + 0.004
        ro = r_out; ri = ro - wt; rm = ro - wt * 0.42
        P = lambda r, y: bm.verts.new(V(math.sin(a) * r, y, math.cos(a) * r))
        rows.append((P(ri, 0), P(rm, ridge * wt / max(w, 1e-3)), P(ro, 0), t))
    vm = v0 + (v1 - v0) * 0.58
    for i in range(SEG):
        a, b, c, t0 = rows[i]; a2, b2, c2, t1 = rows[i + 1]
        face(bm, uvl, (a, b, b2, a2), ((t0, v0), (t0, vm), (t1, vm), (t1, v0)))
        face(bm, uvl, (b, c, c2, b2), ((t0, vm), (t0, v1), (t1, v1), (t1, vm)))

def comet(bm, uvl):
    ring_n, rows = 16, []
    # profile (z, radius, u): round head cap -> tapered tail
    prof = [(0.24, 0.0, 1.0), (0.22, 0.09, 0.98), (0.17, 0.17, 0.95), (0.09, 0.22, 0.92), (0.0, 0.24, 0.88)]
    for j in range(1, 9):
        s = j / 8; prof.append((-s, 0.24 * (1 - s) ** 1.35 + 0.004, 0.88 * (1 - s)))
    for z, r, u in prof:
        row = []
        for k in range(ring_n):
            a = 2 * math.pi * k / ring_n; row.append(bm.verts.new(V(math.cos(a) * r, math.sin(a) * r, z)))
        rows.append((row, u))
    for i in range(len(rows) - 1):
        (ra, ua), (rb, ub) = rows[i], rows[i + 1]
        for k in range(ring_n):
            k2 = (k + 1) % ring_n; va, vb = k / ring_n, (k + 1) / ring_n
            face(bm, uvl, (ra[k], ra[k2], rb[k2], rb[k]), ((ua, va), (ua, vb), (ub, vb), (ub, va)))

def crown(bm, uvl, petals=12):
    n = petals * 4
    rows = []
    for j in range(6):
        v = j / 5; out = []
        for k in range(n + 1):
            a = 2 * math.pi * k / n; ph = (k % 4) / 4.0
            tip = 0.5 + 0.5 * math.cos(ph * 2 * math.pi)          # petal shape along the rim
            h = 0.7 * v * (0.45 + 0.55 * tip)
            r = 0.45 + 0.55 * v ** 0.8 * (0.8 + 0.2 * tip)
            out.append(bm.verts.new(V(math.cos(a) * r, h, math.sin(a) * r)))
        rows.append((out, v))
    for j in range(5):
        (ra, va), (rb, vb) = rows[j], rows[j + 1]
        for k in range(n):
            face(bm, uvl, (ra[k], ra[k + 1], rb[k + 1], rb[k]), ((k / n, va), ((k + 1) / n, va), ((k + 1) / n, vb), (k / n, vb)))

def ring(bm, uvl, ri=0.55):
    n = 48; inn = []; out = []
    for k in range(n + 1):
        a = 2 * math.pi * k / n
        inn.append(bm.verts.new(V(math.cos(a) * ri, 0, math.sin(a) * ri))); out.append(bm.verts.new(V(math.cos(a), 0, math.sin(a))))
    for k in range(n):
        face(bm, uvl, (inn[k], out[k], out[k + 1], inn[k + 1]), ((k / n, 0), (k / n, 1), ((k + 1) / n, 1), ((k + 1) / n, 0)))

def streak(bm, uvl):
    for k in range(2):
        a = math.pi * k / 2; sx, sy = math.cos(a) * 0.12, math.sin(a) * 0.12
        vs = [bm.verts.new(V(0, 0, -0.5)), bm.verts.new(V(sx, sy, 0.25)), bm.verts.new(V(0, 0, 0.5)), bm.verts.new(V(-sx, -sy, 0.25))]
        face(bm, uvl, vs, ((0, 0.5), (0.75, 1), (1, 0.5), (0.75, 0)))

def drop(bm, uvl):
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0, calc_uvs=True)

def star(bm, uvl):
    pts = []
    for k in range(8):
        a = math.pi * 2 * k / 8; r = 1.0 if k % 2 == 0 else 0.38; pts.append((math.cos(a) * r, math.sin(a) * r))
    c0 = bm.verts.new(V(0, 0, 0.26)); c1 = bm.verts.new(V(0, 0, -0.26)); ring_ = [bm.verts.new(V(x, y, 0)) for x, y in pts]
    for k in range(8):
        k2 = (k + 1) % 8
        face(bm, uvl, (c0, ring_[k], ring_[k2]), ((0.5, 0.5), (0.5 + pts[k][0] / 2, 0.5 + pts[k][1] / 2), (0.5 + pts[k2][0] / 2, 0.5 + pts[k2][1] / 2)))
        face(bm, uvl, (c1, ring_[k2], ring_[k]), ((0.5, 0.5), (0.5 + pts[k2][0] / 2, 0.5 + pts[k2][1] / 2), (0.5 + pts[k][0] / 2, 0.5 + pts[k][1] / 2)))

def band(bm, uvl, n=32, rows=4):
    rr = []
    for j in range(rows + 1):
        v = j / rows; rr.append([bm.verts.new(V(math.cos(2 * math.pi * k / n), v, math.sin(2 * math.pi * k / n))) for k in range(n + 1)])
    for j in range(rows):
        for k in range(n):
            face(bm, uvl, (rr[j][k], rr[j][k + 1], rr[j + 1][k + 1], rr[j + 1][k]), ((k / n, j / rows), ((k + 1) / n, j / rows), ((k + 1) / n, (j + 1) / rows), (k / n, (j + 1) / rows)))

def flame(bm, uvl, n=10, rows=8):
    rr = []
    for j in range(rows + 1):
        v = j / rows; rad = 0.18 * math.sin(math.pi * min(1, v * 1.35 + 0.08)) ** 0.8 * (1 - v) ** 0.35 + 0.004
        bend = 0.12 * v * v; out = []
        for k in range(n + 1):
            a = 2 * math.pi * k / n; out.append(bm.verts.new(V(math.cos(a) * rad + bend, v, math.sin(a) * rad)))
        rr.append(out)
    for j in range(rows):
        for k in range(n):
            face(bm, uvl, (rr[j][k], rr[j][k + 1], rr[j + 1][k + 1], rr[j + 1][k]), ((k / n, j / rows), ((k + 1) / n, j / rows), ((k + 1) / n, (j + 1) / rows), (k / n, (j + 1) / rows)))

def crystal(bm, uvl, n=6):
    prof = [(0.0, 0.11), (0.08, 0.16), (0.7, 0.15), (1.0, 0.0)]
    rr = []
    for z, r in prof:
        rr.append([bm.verts.new(V(math.cos(2 * math.pi * k / n + 0.3) * max(r, 0.002), z, math.sin(2 * math.pi * k / n + 0.3) * max(r, 0.002))) for k in range(n + 1)])
    for j in range(len(prof) - 1):
        for k in range(n):
            v0, v1 = prof[j][0], prof[j + 1][0]
            face(bm, uvl, (rr[j][k], rr[j][k + 1], rr[j + 1][k + 1], rr[j + 1][k]), ((k / n, v0), ((k + 1) / n, v0), ((k + 1) / n, v1), (k / n, v1)))
    c = bm.verts.new(V(0, 0, 0))
    for k in range(n): face(bm, uvl, (rr[0][k + 1], rr[0][k], c), ((0, 0), (1, 0), (0.5, 0.5)))

def shard(bm, uvl):
    pts = [(0.0, 0.5), (0.28, -0.32), (-0.12, -0.5), (-0.3, 0.05)]
    top = [bm.verts.new(V(x, 0.05, y)) for x, y in pts]; bot = [bm.verts.new(V(x * 0.9, -0.05, y * 0.9)) for x, y in pts]
    uv = [(x + 0.5, y + 0.5) for x, y in pts]
    face(bm, uvl, top, uv); face(bm, uvl, list(reversed(bot)), list(reversed(uv)))
    for k in range(4):
        k2 = (k + 1) % 4; face(bm, uvl, (top[k], bot[k], bot[k2], top[k2]), ((k / 4, 1), (k / 4, 0), ((k + 1) / 4, 0), ((k + 1) / 4, 1)))

def wave(bm, uvl, seg=24, rows=6):
    rr = []
    for j in range(rows + 1):
        v = j / rows; bulge = 0.06 * math.sin(math.pi * v); out = []
        for k in range(seg + 1):
            a = math.radians(-30 + 60 * k / seg); r = 1 + bulge
            out.append(bm.verts.new(V(math.sin(a) * r, 0.6 * v, math.cos(a) * r)))
        rr.append(out)
    for j in range(rows):
        for k in range(seg):
            face(bm, uvl, (rr[j][k], rr[j][k + 1], rr[j + 1][k + 1], rr[j + 1][k]), ((k / seg, j / rows), ((k + 1) / seg, j / rows), ((k + 1) / seg, (j + 1) / rows), (k / seg, (j + 1) / rows)))

def make(name, fn):
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); fn(bm, uvl)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); return ob

def main():
    blib.reset()
    obs = [
        make('rm_cres', lambda bm, uv: crescent(bm, uv, 92, -80, 0.40, 0.62, 0.10)),
        make('rm_cres_big', lambda bm, uv: (crescent(bm, uv, 112, -104, 0.55, 0.56, 0.14), crescent(bm, uv, 96, -86, 0.20, 0.5, 0.04, r_out=0.62, v0=0.0, v1=0.35))),
        make('rm_comet', comet), make('rm_crown', crown), make('rm_ring', ring), make('rm_streak', streak), make('rm_drop', drop), make('rm_star', star),
        make('rm_band', band), make('rm_flame', flame), make('rm_crystal', crystal), make('rm_shard', shard), make('rm_wave', wave),
    ]
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(TMP, 'fx_rm.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False)
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'tris': tris}, open(os.path.join(OUT, 'fx_rm.glb.json'), 'w'))
    try: bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_rm.blend'))
    except Exception as e: print('blend save failed:', e)
    print('fx_rm', tris, sum(tris.values()), 'tris', len(raw), 'bytes')

main()
