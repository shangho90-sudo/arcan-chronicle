"""양약사 2차 스킬 이펙트 메시 (Blender bpy, headless, 2026-11-16): 캡슐 반쪽 · 과립 · 앰플 · 결정 · 정제 · 작은 약병 · 결정 파편.

Usage:  python3 tools/blender/fx_wpharm.py        ->  assets/fx/fx_wpharm.glb.json  (+ tools/blender/wpharm/fx_wpharm.blend)

Meshes (game axes: +Y up, metres = 1 unit; js/wpharmfx.js 가 크기·색·움직임을 정함. 텍스처 없음 — 정점 색은 밝기/띠만,
색은 셰이더 tint, 유리 느낌은 셰이더의 가장자리 빛 + 안쪽 색):
  wp_cap_half   캡슐 반쪽: 반지름 1, 원통 y 0 .. 1 + 반구 1 .. 2, 잘린 면(y 0)은 막힘 + 그 둘레에 얇은 금띠(정점 색 노랑)
  wp_granule    과립: 반지름 1 둥근 다면체(이코스피어 2단계, 80면)
  wp_ampoule    앰플: 몸통 반지름 0.38 y 0 .. 1.05, 목 0.12 (1.32), 머리 0.2 (1.5), 끝 1.72; 목에 금띠
  wp_crystal    결정: 육각 기둥 반지름 0.3 y 0 .. 0.72 + 끝 1.0 (아래도 짧게 뾰족 -0.12)
  wp_tablet     정제: 반지름 1, 두께 ±0.28 볼록한 원판 + 가운데 홈(정점 색 어둡게)
  wp_vial       작은 약병: 바닥 y 0, 몸통 반지름 0.3 .. 0.62, 목 0.12 .. 0.82, 코르크 0.82 .. 0.98(정점 색 갈색)
  wp_shard      결정 파편: 길쭉한 삼각 뿔 길이 1 (y 0 .. 1)
  wp_sphere     맑은 구·코팅막: 반지름 1 UV 구(24 x 14)
json: {b64}
"""
import os, sys, math, json, base64
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm as FP
from fx_pharm import V, lathe, new_obj
SRC = os.path.join(HERE, 'wpharm'); os.makedirs(SRC, exist_ok=True)

W, W_LO, GOLD, CORK, DARK = (1, 1, 1, 1), (0.78, 0.8, 0.86, 1), (1.0, 0.82, 0.36, 1), (0.55, 0.36, 0.2, 1), (0.6, 0.6, 0.66, 1)

def cap_half(bm, col, uvl):
    P = [(0.0, 0.0), (1.0, 0.0)]
    P += [(1.0, 0.05), (1.0, 0.11)]                                             # gold band rows 1..2
    P += [(1.0, 0.5), (1.0, 1.0)]
    for k in range(1, 7): a = k / 7 * math.pi / 2; P.append((math.cos(a), 1.0 + math.sin(a)))
    P.append((0.0, 2.0))
    lathe(bm, col, P, 20, lambda k, p: GOLD if k in (1, 2) else W)

def granule(bm, col, uvl):
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    for f in bm.faces:
        for l in f.loops: l[col] = W

def ampoule(bm, col, uvl):
    P = [(0.0, 0.0), (0.3, 0.0), (0.38, 0.08), (0.38, 0.9), (0.33, 1.02), (0.2, 1.14), (0.12, 1.26), (0.12, 1.32), (0.14, 1.34), (0.2, 1.42), (0.2, 1.52), (0.12, 1.64), (0.0, 1.72)]
    lathe(bm, col, P, 16, lambda k, p: GOLD if k in (6, 7) else (W_LO if k == 0 else W))

def crystal(bm, col, uvl):
    P = [(0.0, -0.12), (0.3, 0.0), (0.3, 0.72), (0.0, 1.0)]
    lathe(bm, col, P, 6, lambda k, p: (0.7, 0.82, 1, 1) if k == 0 else W)

def tablet(bm, col, uvl):
    P = [(0.0, -0.28), (0.55, -0.24), (0.88, -0.14), (1.0, 0.0), (0.88, 0.14), (0.55, 0.24), (0.0, 0.28)]
    lathe(bm, col, P, 20, lambda k, p: W)
    # score line on the top face: a thin dark strip (slightly above the surface)
    t = 0.06
    vs = [bm.verts.new(V(x, 0.285, z)) for (x, z) in ((-0.8, -t), (0.8, -t), (0.8, t), (-0.8, t))]
    f = bm.faces.new(vs)
    for l in f.loops: l[col] = DARK

def vial(bm, col, uvl):
    P = [(0.0, 0.0), (0.26, 0.0), (0.3, 0.05), (0.3, 0.56), (0.22, 0.64), (0.12, 0.68), (0.12, 0.82), (0.15, 0.84), (0.15, 0.98), (0.0, 0.98)]
    lathe(bm, col, P, 14, lambda k, p: CORK if k >= 6 else W)

def sphere(bm, col, uvl):
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=1.0)
    for f in bm.faces:
        for l in f.loops: l[col] = W

def shard(bm, col, uvl):
    P = [(0.0, 0.0), (0.18, 0.08), (0.12, 0.6), (0.0, 1.0)]
    lathe(bm, col, P, 3, lambda k, p: W)

def main():
    FP.reset()
    obs = [new_obj('wp_cap_half', cap_half), new_obj('wp_granule', granule, False), new_obj('wp_ampoule', ampoule), new_obj('wp_crystal', crystal, False),
           new_obj('wp_tablet', tablet), new_obj('wp_vial', vial), new_obj('wp_shard', shard, False), new_obj('wp_sphere', sphere)]
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(FP.TMP, 'fx_wpharm.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(FP.OUT, 'fx_wpharm.glb.json'), 'w'))
    for k, o in enumerate(obs): o.location.x = k * 2.4
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_wpharm.blend'), compress=True)
    print('tris', tris, 'glb bytes', len(raw), flush=True)

if __name__ == '__main__':
    main()
