"""요리사 이펙트용 Tripo 소품 정리 (2026-11-13): tools/tripo/cook_assets.py 로 받은 초안($RAW/cook_<name>.glb, 저장소 밖)을
Blender에서 다듬어 한 파일 assets/fx/fx_cook_tripo.glb.json 으로 묶는다(js/cookfx.js가 있으면 절차 메시 cook_* 대신 씀).

  lunchbox -> tripo_lunchbox   간단한 도시락   바닥 y 0, 가로 가장 긴 변 1, 가운데 원점
  soup     -> tripo_soup       따뜻한 수프     〃
  meal     -> tripo_meal       든든한 한 끼    〃
  snack    -> tripo_snack      간식(쿠키)      가장 얇은 축 = 위(눕힘), 바닥 y 0, 지름 1
  pepper   -> tripo_pepper     후추통          바닥 y 0, 높이 1
  flour    -> tripo_flour      밀가루 포대     바닥 y 0, 높이 1
  kebab    -> tripo_kebab      꼬치            긴 축 = +X, x 0(손잡이) .. 1(뾰족한 끝), 축 가운데

정리: 메시 합치기 → 떠 있는 작은 조각 제거 → 정점 용접 → 삼각형 줄이기 → 노멀 → 축·크기·원점 맞춤 → 기본색 텍스처만 512 px JPEG.
Usage: RAW=/home/claude/cook3d python3 tools/blender/fx_cook_tripo.py [name...]
"""
import base64, json, math, os, sys, tempfile
import numpy as np
import bpy, bmesh
from mathutils import Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE)); sys.path.insert(0, HERE)
import fx_pharm_tripo as FT
RAW = os.environ.get('RAW', '/home/claude/cook3d'); OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'cook')
SPEC = {'lunchbox': ('flat', 2200), 'soup': ('flat', 1800), 'meal': ('flat', 2400), 'snack': ('cookie', 1200), 'pepper': ('tall', 1500), 'flour': ('tall', 1600), 'kebab': ('long', 2200)}

def load(name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(RAW, 'cook_' + name + '.glb'))
    new = [o for o in bpy.context.scene.objects if o not in before]; meshes = [o for o in new if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o.type != 'MESH' and o.name in bpy.data.objects: bpy.data.objects.remove(o)
    return ob

def weld(ob):   # Tripo drafts have split vertices on every UV seam: weld first so decimation cannot tear the surface
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0004); bm.to_mesh(ob.data); bm.free()

def fit(ob, kind):
    if kind == 'cookie': c, w, v = FT.pca(ob); FT.rotate_axis_to_z(ob, v[:, 0])
    if kind == 'long':
        c, w, v = FT.pca(ob); a = v[:, 2]; q_axis = a
        from mathutils import Vector
        q = Vector(q_axis).normalized().rotation_difference(Vector((1, 0, 0))); ob.data.transform(q.to_matrix().to_4x4()); ob.data.update()
        lo, hi, P = FT.bounds(ob); L = hi[0] - lo[0]
        rad = lambda sel: float(np.hypot(P[sel, 1] - P[:, 1].mean(), P[sel, 2] - P[:, 2].mean()).max()) if sel.any() else 0
        if rad(P[:, 0] > hi[0] - 0.05 * L) > rad(P[:, 0] < lo[0] + 0.05 * L): ob.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))   # the wide end (ring handle) goes to x 0
        lo, hi, P = FT.bounds(ob); s = 1.0 / (hi[0] - lo[0])
        ob.data.transform(Matrix.Translation((-lo[0], -(lo[1] + hi[1]) / 2, -(lo[2] + hi[2]) / 2))); ob.data.transform(Matrix.Scale(s, 4))
    else:
        lo, hi, P = FT.bounds(ob); s = 1.0 / ((hi[2] - lo[2]) if kind == 'tall' else max(hi[0] - lo[0], hi[1] - lo[1]))
        ob.data.transform(Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))); ob.data.transform(Matrix.Scale(s, 4))
    ob.data.update()

def main():
    names = [n for n in (sys.argv[1:] or list(SPEC)) if os.path.exists(os.path.join(RAW, 'cook_' + n + '.glb'))]
    bpy.ops.wm.read_factory_settings(use_empty=True); td = tempfile.mkdtemp(); obs = []; info = {}
    for n in names:
        kind, target = SPEC[n]; out = 'tripo_' + n; ob = load(n); weld(ob); nisl = FT.drop_small(ob, 0.01); FT.texture(ob, 512, td, out)
        n0 = FT.decimate(ob, target); fit(ob, kind); ob.name = ob.data.name = out; obs.append(ob); lo, hi, P = FT.bounds(ob)
        info[out] = {'tris': [n0, len(ob.data.polygons)], 'size': [round(float(x), 3) for x in (hi - lo)], 'islands': nisl}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.location = (0, 0, 0); o.select_set(True)
    glb = os.path.join(td, 'fx_cook_tripo.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=86, export_yup=True, export_apply=True,
                              export_normals=True, export_tangents=False, export_animations=False)
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'models': sorted(o.name for o in obs)}, open(os.path.join(OUT, 'fx_cook_tripo.glb.json'), 'w'))
    for i, o in enumerate(obs): o.location.x = i * 1.5
    os.makedirs(SRC, exist_ok=True); bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_cook_tripo.blend'), compress=True)
    print(json.dumps(info), len(raw) // 1024, 'KB', flush=True)

if __name__ == '__main__':
    main()
