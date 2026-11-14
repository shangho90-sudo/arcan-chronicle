"""미용사 이펙트용 Tripo 모델 정리 (2026-11-13): tools/tripo/hair_assets.py tripo 로 받은 초안($RAW/hair_<name>.glb, 저장소 밖)을
Blender에서 다듬어 assets/fx/fx_hair_tripo.glb.json 한 파일로 묶는다(js/hairfx.js가 있으면 절차 메시 대신 씀).

  hair_dryer  -> tripo_dryer   드라이어: 바람 나오는 쪽 = 게임 +x, 손잡이 아래(-y), 몸통 길이 1, 몸통 축이 원점을 지남
  hair_comb   -> tripo_comb    빗: 가장 얇은 축 = 위(+y), 긴 축 = x, 반지름(긴 쪽 절반) 1, 중심 원점
  hair_roller -> tripo_roller  헤어롤: 초안 방향 그대로(집게가 위), 바닥 y 0, 가장 긴 가로 길이 1, 가로 중심 원점

정리: 메시 합치기 → 떠 있는 작은 조각 제거 → 삼각형 줄이기 → 중복 정점 합치기 → 노멀 다시 계산 → 축·크기·원점 맞춤 →
기본색 텍스처만 512 px JPEG.  Usage: RAW=/home/claude/hair3d python3 tools/blender/fx_hair_tripo.py
"""
import base64, json, math, os, sys, tempfile
import numpy as np
import bpy
from mathutils import Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm_tripo as TP
ROOT = os.path.dirname(os.path.dirname(HERE)); RAW = os.environ.get('RAW', '/home/claude/hair3d'); OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'hair')
SPEC = {'dryer': ('tripo_dryer', 2600, 512), 'comb': ('tripo_comb', 1800, 512), 'roller': ('tripo_roller', 2200, 512)}

def load(name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(RAW, 'hair_' + name + '.glb'))
    new = [o for o in bpy.context.scene.objects if o not in before]; meshes = [o for o in new if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o.type != 'MESH' and o.name in bpy.data.objects: bpy.data.objects.remove(o)
    return ob

def fit(ob, kind):
    lo, hi, P = TP.bounds(ob)
    if kind == 'dryer':
        # body axis = the longer horizontal axis; the wide silver nozzle is the end on the handle's side
        ax = 0 if (hi[0] - lo[0]) >= (hi[1] - lo[1]) else 1
        if ax == 1: ob.data.transform(Matrix.Rotation(-math.pi / 2, 4, 'Z')); lo, hi, P = TP.bounds(ob)
        H = hi[2] - lo[2]; low = P[P[:, 2] < lo[2] + 0.25 * H]; top = P[P[:, 2] > lo[2] + 0.55 * H]
        if low[:, 0].mean() < top[:, 0].mean(): ob.data.transform(Matrix.Rotation(math.pi, 4, 'Z')); lo, hi, P = TP.bounds(ob)   # this draft: the handle sits under the nozzle half (checked in game)
        top = P[P[:, 2] > lo[2] + 0.55 * H]; L = hi[0] - lo[0]
        ob.data.transform(Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -float(np.median(top[:, 2]))))); ob.data.transform(Matrix.Scale(1.0 / L, 4))
    elif kind == 'comb':
        c, w, v = TP.pca(ob); TP.rotate_axis_to_z(ob, v[:, 0]); c, w, v = TP.pca(ob)
        a = v[:, 2]; ang = math.atan2(a[1], a[0]); ob.data.transform(Matrix.Rotation(-ang, 4, 'Z')); lo, hi, P = TP.bounds(ob)
        ob.data.transform(Matrix.Translation(tuple(-(lo + hi) / 2))); ob.data.transform(Matrix.Scale(2.0 / (hi[0] - lo[0]), 4))
    else:
        L = max(hi[0] - lo[0], hi[1] - lo[1])
        ob.data.transform(Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))); ob.data.transform(Matrix.Scale(1.0 / L, 4))
    ob.data.update()

def main():
    names = sys.argv[1:] or list(SPEC)
    bpy.ops.wm.read_factory_settings(use_empty=True); td = tempfile.mkdtemp(); obs = []; info = {}
    for n in names:
        if not os.path.exists(os.path.join(RAW, 'hair_' + n + '.glb')): print('no draft:', n); continue
        out, target, px = SPEC[n]; ob = load(n); nisl = TP.drop_small(ob, 0.01); TP.texture(ob, px, td, out)
        n0 = TP.decimate(ob, target); fit(ob, n); ob.name = ob.data.name = out; obs.append(ob); lo, hi, P = TP.bounds(ob)
        info[out] = {'tris': [n0, len(ob.data.polygons)], 'lo': [round(float(x), 3) for x in lo], 'hi': [round(float(x), 3) for x in hi], 'islands': nisl}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.location = (0, 0, 0); o.select_set(True)
    glb = os.path.join(td, 'fx_hair_tripo.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=88, export_yup=True, export_apply=True,
                              export_normals=True, export_tangents=False, export_animations=False)
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'models': sorted(o.name for o in obs)}, open(os.path.join(OUT, 'fx_hair_tripo.glb.json'), 'w'))
    for i, o in enumerate(obs): o.location.x = i * 1.5
    os.makedirs(SRC, exist_ok=True); bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_hair_tripo.blend'), compress=True)
    print(json.dumps(info), len(raw) // 1024, 'KB', flush=True)

if __name__ == '__main__':
    main()
