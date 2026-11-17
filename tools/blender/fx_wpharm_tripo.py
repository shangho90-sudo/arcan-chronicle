"""양약사 2차 스킬 Tripo 소품 정리 (2026-11-16 '화려하게' 개편): tools/tripo/wp_assets.py 로 받은 초안($RAW/wp_<name>.glb)을
Blender에서 다듬어 assets/fx/fx_wpharm_tripo.glb.json 하나로 묶는다(js/wpharmfx.js — 없으면 tools/blender/fx_wpharm.py 절차 메시).

  wp_capsule -> tripo_cap_a, tripo_cap_b   캡슐을 가운데(긴 축 중간)에서 잘라 두 쪽 — 잘린 면 y 0, 반쪽이 +Y로 뻗음(길이 2, 반지름 1:
                                          절차 wp_cap_half 와 같은 규격이라 js의 크기·움직임을 그대로 씀). 잘린 면은 메움.
  wp_ampoule -> tripo_ampoule              긴 축 +Y, 굵은 몸통이 아래(y 0), 높이 1.72 (절차 wp_ampoule 과 같음)
  wp_flask   -> tripo_flask                바닥 y 0, 높이 0.98 (절차 wp_vial 과 같음)

정리: 메시 합치기 → 정점 용접(UV 이음매로 떨어진 정점, 줄이기 전에 — 안 하면 면이 찢어짐) → 떠 있는 작은 조각 제거 → 삼각형 줄이기
→ 노멀 다시 계산 → 축·크기·원점 → 기본색만 512 px JPEG. Usage: RAW=/home/claude/wpharm3d python3 tools/blender/fx_wpharm_tripo.py [name...]
"""
import base64, json, math, os, sys, tempfile
import numpy as np
import bpy, bmesh
from mathutils import Matrix, Vector
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm_tripo as PT   # islands / pca / rotate_axis_to_z / bounds / decimate / texture / drop_small
ROOT = os.path.dirname(os.path.dirname(HERE)); OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'wpharm')
RAW = os.environ.get('RAW', '/home/claude/wpharm3d')
SPEC = {'capsule': (2400, 512), 'ampoule': (2000, 512), 'flask': (2200, 512)}

def load(name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(RAW, 'wp_' + name + '.glb'))
    new = [o for o in bpy.context.scene.objects if o not in before]; meshes = [o for o in new if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o.type != 'MESH' and o.name in bpy.data.objects: bpy.data.objects.remove(o)
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0008); bm.to_mesh(ob.data); bm.free()   # 용접 먼저
    return ob

def upright(ob, thick_down=True):
    c, w, v = PT.pca(ob); PT.rotate_axis_to_z(ob, v[:, 2])
    lo, hi, P = PT.bounds(ob); L = hi[2] - lo[2]
    rad = lambda sel: float(np.hypot(P[sel, 0] - P[:, 0].mean(), P[sel, 1] - P[:, 1].mean()).mean())
    if thick_down and rad(P[:, 2] > hi[2] - 0.25 * L) > rad(P[:, 2] < lo[2] + 0.25 * L): ob.data.transform(Matrix.Rotation(math.pi, 4, 'X'))
    lo, hi, P = PT.bounds(ob); ob.data.transform(Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))); ob.data.update()

def scale_h(ob, h):
    lo, hi, P = PT.bounds(ob); ob.data.transform(Matrix.Scale(h / (hi[2] - lo[2]), 4)); ob.data.update()

def split_capsule(ob):
    """긴 축을 Z로, 가운데에서 잘라 두 반쪽(잘린 면 메움), 각 반쪽: 잘린 면 z 0, +Z로 길이 ~2, 반지름 1"""
    upright(ob, thick_down=False); lo, hi, P = PT.bounds(ob); L = hi[2] - lo[2]
    ob.data.transform(Matrix.Translation((0, 0, -L / 2))); R = max(hi[0] - lo[0], hi[1] - lo[1]) / 2; ob.data.transform(Matrix.Scale(1.0 / R, 4)); ob.data.update()
    halves = []
    for k, sgn in (('a', 1), ('b', -1)):
        o = ob.copy(); o.data = ob.data.copy(); bpy.context.scene.collection.objects.link(o)
        bm = bmesh.new(); bm.from_mesh(o.data)
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, 0), plane_no=(0, 0, sgn), clear_inner=True)
        cut = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        if cut:
            try: bmesh.ops.holes_fill(bm, edges=cut, sides=0)
            except Exception: pass
        bmesh.ops.triangulate(bm, faces=bm.faces[:]); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(o.data); bm.free()
        if sgn < 0: o.data.transform(Matrix.Rotation(math.pi, 4, 'X'))
        o.data.update(); o.name = o.data.name = 'tripo_cap_' + k; halves.append(o)
    bpy.data.objects.remove(ob); return halves

def main():
    names = sys.argv[1:] or [n for n in SPEC if os.path.exists(os.path.join(RAW, 'wp_' + n + '.glb'))]
    bpy.ops.wm.read_factory_settings(use_empty=True); td = tempfile.mkdtemp(); obs = []; info = {}
    for n in names:
        target, px = SPEC[n]; ob = load(n); nisl = PT.drop_small(ob, 0.01); PT.texture(ob, px, td, 'wp_' + n); n0 = PT.decimate(ob, target)
        if n == 'capsule': parts = split_capsule(ob)
        elif n == 'ampoule': upright(ob); scale_h(ob, 1.72); ob.name = ob.data.name = 'tripo_ampoule'; parts = [ob]
        else: upright(ob); scale_h(ob, 0.98); ob.name = ob.data.name = 'tripo_flask'; parts = [ob]
        for o in parts: lo, hi, P = PT.bounds(o); info[o.name] = {'tris': [n0, len(o.data.polygons)], 'size': [round(float(x), 3) for x in (hi - lo)], 'islands': nisl}
        obs += parts
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.location = (0, 0, 0); o.select_set(True)
    glb = os.path.join(td, 'fx_wpharm_tripo.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=88, export_yup=True, export_apply=True,
                              export_normals=True, export_tangents=False, export_animations=False)
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'models': sorted(o.name for o in obs)}, open(os.path.join(OUT, 'fx_wpharm_tripo.glb.json'), 'w'))
    for i, o in enumerate(obs): o.location.x = i * 2.5
    os.makedirs(SRC, exist_ok=True); bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_wpharm_tripo.blend'), compress=True)
    print(json.dumps(info), len(raw) // 1024, 'KB', flush=True)

if __name__ == '__main__':
    main()
