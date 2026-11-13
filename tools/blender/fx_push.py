"""약사 밀어내기 ph1_a4 전용 이펙트 메시 (Blender bpy, headless, 2026-11-13).

Usage:  python3 tools/blender/fx_push.py        ->  assets/fx/fx_push.glb.json  (+ tools/blender/pharm/fx_push.blend)

부채꼴로 뒤집히는 땅 조각. fx_pharm.py(공용 소품·아틀라스·아이콘)는 건드리지 않는다. 흙덩이·흙판은 Tripo 모델
(tools/tripo/pharm_assets.py soil_clods earth_slabs -> tools/blender/fx_pharm_tripo.py, OUTFILE=fx_push_tripo).
Meshes (game axes: +Y up, 단위 반지름 1 = 스킬의 실제 부채꼴 반지름, js/pharmfx.js push가 크기를 정함)
  push_plate_NN   +X를 가운데로 한 ANG도 부채꼴을 3줄(안 3 · 가운데 5 · 바깥 7 = 15조각)로 나눈 흙판. 조각마다 따로(오브젝트 원점 = 안쪽
                  모서리 가운데 = 경첩): 게임이 경첩을 축으로 바깥 모서리를 들어 올림(안쪽부터 차례로 = 바깥으로 번지는 뒤집힘).
                  윗면 = 마른 흙빛(조각마다 조금씩 다름), 옆·아랫면 = 어두운 흙. 두께 TH.
json: {b64, ang(도), plates: [{name, rho(경첩 반지름), a(경첩 방위 rad), band}]}  — 스킬 데이터 ang과 다르면 게임이 각도만 비율로 맞춤
"""
import os, sys, math, json, base64, random
import bpy
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm as FP
from fx_pharm import V, new_obj

ANG, TH, GAP = 110.0, 0.05, 0.012
BANDS = [(0.15, 0.43, 3), (0.43, 0.71, 5), (0.71, 1.0, 7)]
SOIL, SOIL2 = (0.27, 0.19, 0.125, 1), (0.36, 0.26, 0.17, 1)

def plate(poly, hx, hz, top):
    """poly: top outline (x, z) counter-clockwise, hinge (hx, hz) = local origin"""
    def build(bm, col, uvl):
        n = len(poly); tv = [bm.verts.new(V(x - hx, TH, z - hz)) for x, z in poly]; bv = [bm.verts.new(V((x - hx) * 0.94, 0.0, (z - hz) * 0.94)) for x, z in poly]
        def face(vs, c):
            f = bm.faces.new(vs)
            for l in f.loops: l[col] = c; l[uvl].uv = (0, 0)
        face(tv, top); face(bv[::-1], SOIL)
        for i in range(n): j = (i + 1) % n; face((tv[i], bv[i], bv[j], tv[j]), SOIL if i % 2 else SOIL2)
    return build

def main():
    FP.reset(); rng = random.Random(23); half = math.radians(ANG) / 2; obs = []; meta = []
    for b, (r0, r1, n) in enumerate(BANDS):
        cuts = [-half + 2 * half * (k + (rng.uniform(-0.16, 0.16) if 0 < k < n else 0)) / n for k in range(n + 1)]
        for k in range(n):
            a0, a1 = cuts[k], cuts[k + 1]; ga = GAP / max(0.2, (r0 + r1) / 2)
            a0 += ga; a1 -= ga; ri = r0 + GAP + rng.uniform(0, 0.02); ro = r1 - GAP - rng.uniform(0, 0.02)
            pt = lambda a, r: (math.cos(a) * r, math.sin(a) * r)
            am = (a0 + a1) / 2
            poly = [pt(a0, ri), pt(a1, ri), pt(a1 + rng.uniform(-0.02, 0.02), ro + rng.uniform(-0.03, 0.02)),
                    pt(am + rng.uniform(-0.05, 0.05), ro + rng.uniform(-0.01, 0.045)), pt(a0 + rng.uniform(-0.02, 0.02), ro + rng.uniform(-0.03, 0.02))]
            hx, hz = pt(am, ri); t = rng.uniform(-0.05, 0.05); warm = rng.uniform(-0.03, 0.03)
            top = (0.60 + t + warm, 0.48 + t, 0.34 + t - warm, 1)
            o = new_obj('push_plate_%02d' % len(obs), plate(poly, hx, hz, top), False); o.location = V(hx, 0, hz); obs.append(o)
            meta.append(dict(name=o.name, rho=round(ri, 4), a=round(am, 4), band=b))
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs)
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(FP.TMP, 'fx_push.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'ang': ANG, 'plates': meta}, open(os.path.join(FP.OUT, 'fx_push.glb.json'), 'w'))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(FP.SRC, 'fx_push.blend'), compress=True)
    print('plates', len(obs), 'tris', tris, 'glb bytes', len(raw), flush=True)

if __name__ == '__main__':
    main()
