"""쉐프 2차 스킬 Tripo 소품 정리 (2026-11-17 '화려하게' 개편): tools/tripo/chef_assets.py 로 받은 초안($RAW/cf_<name>.glb)을
Blender에서 다듬어 assets/fx/fx_chef_tripo.glb.json 하나로 묶는다(js/cheffx.js — 없으면 tools/blender/fx_chef.py 절차 메시).

  cf_cloche -> tripo_cloche   바닥 y 0, 가로 반지름 1 (절차 chef_cloche 와 같은 규격)
  cf_cooker -> tripo_cooker   바닥 y 0, 손잡이까지 가로 반지름 0.68 (절차 chef_cooker 몸통 + 뚜껑을 한 덩어리로 — js 는 뚜껑을 따로 그리지 않음)
  cf_wok    -> tripo_wok      바닥 y 0, 손잡이 +x, 그릇 반지름 약 1 (절차 chef_wok 과 같은 규격: x -1 .. 1.9)

Tripo 초안은 이미 위가 +Z(가져오면)라 돌리지 않음 — 웍만 손잡이(가운데에서 가장 먼 쪽)를 +X로 돌림.
정리: 메시 합치기 → 정점 용접(먼저 — 안 하면 줄일 때 면이 찢어짐) → 떠 있는 작은 조각 제거 → 삼각형 줄이기 → 노멀 → 축·크기·원점 → 기본색만 512 px JPEG.
Usage: RAW=/home/claude/chef3d python3 tools/blender/fx_chef_tripo.py [name...]
"""
import base64, json, math, os, sys, tempfile
import numpy as np
import bpy, bmesh
from mathutils import Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm_tripo as PT   # islands / bounds / decimate / texture / drop_small
ROOT = os.path.dirname(os.path.dirname(HERE)); OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'chef')
RAW = os.environ.get('RAW', '/home/claude/chef3d')
SPEC = {'cloche': (2400, 512), 'cooker': (2600, 512), 'wok': (2400, 512)}

def load(name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(RAW, 'cf_' + name + '.glb'))
    new = [o for o in bpy.context.scene.objects if o not in before]; meshes = [o for o in new if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o.type != 'MESH' and o.name in bpy.data.objects: bpy.data.objects.remove(o)
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0008); bm.to_mesh(ob.data); bm.free()
    return ob

def place(ob, radius, centre=None):
    lo, hi, P = PT.bounds(ob); cx, cy = centre if centre else ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2)
    ob.data.transform(Matrix.Translation((-cx, -cy, -lo[2])))
    lo, hi, P = PT.bounds(ob); R = max(np.abs(P[:, 0]).max(), np.abs(P[:, 1]).max()) if centre is None else radius
    ob.data.transform(Matrix.Scale(radius / R if centre is None else 1, 4)); ob.data.update()

def wok_fit(ob):
    lo, hi, P = PT.bounds(ob); z0, z1 = lo[2], hi[2]
    # 그릇 가운데 = 아래쪽 30 % 정점의 평균(손잡이는 위로 들려 있음), 손잡이 = 가운데에서 가로로 가장 먼 점들의 방향
    low = P[P[:, 2] < z0 + 0.3 * (z1 - z0)]; c = low[:, :2].mean(0)
    d = P[:, :2] - c; r = np.hypot(d[:, 0], d[:, 1]); far = d[r > np.percentile(r, 98)].mean(0); ang = math.atan2(far[1], far[0])
    ob.data.transform(Matrix.Translation((-c[0], -c[1], -z0))); ob.data.transform(Matrix.Rotation(-ang, 4, 'Z'))
    lo, hi, P = PT.bounds(ob); bowl = max(-lo[0], np.abs(P[P[:, 0] < 0][:, 1]).max())   # 손잡이 반대쪽 반지름
    ob.data.transform(Matrix.Scale(1.0 / bowl, 4)); ob.data.update()

def main():
    names = sys.argv[1:] or [n for n in SPEC if os.path.exists(os.path.join(RAW, 'cf_' + n + '.glb'))]
    bpy.ops.wm.read_factory_settings(use_empty=True); td = tempfile.mkdtemp(); obs = []; info = {}
    for n in names:
        target, px = SPEC[n]; ob = load(n); nisl = PT.drop_small(ob, 0.01); PT.texture(ob, px, td, 'cf_' + n); n0 = PT.decimate(ob, target)
        if n == 'wok': wok_fit(ob)
        else: place(ob, 1.0 if n == 'cloche' else 0.68)
        ob.name = ob.data.name = 'tripo_' + n
        lo, hi, P = PT.bounds(ob); info[ob.name] = {'tris': [n0, len(ob.data.polygons)], 'size': [round(float(x), 3) for x in (hi - lo)], 'lo': [round(float(x), 3) for x in lo], 'islands': nisl}
        obs.append(ob)
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.location = (0, 0, 0); o.select_set(True)
    glb = os.path.join(td, 'fx_chef_tripo.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=88, export_yup=True, export_apply=True,
                              export_normals=True, export_tangents=False, export_animations=False)
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'models': sorted(o.name for o in obs)}, open(os.path.join(OUT, 'fx_chef_tripo.glb.json'), 'w'))
    for i, o in enumerate(obs): o.location.x = i * 3
    os.makedirs(SRC, exist_ok=True); bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_chef_tripo.blend'), compress=True)
    print(json.dumps(info), len(raw) // 1024, 'KB', flush=True)

if __name__ == '__main__':
    main()
