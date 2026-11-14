"""예술가 이펙트용 Tripo 모델 정리 (2026-11-13): tools/tripo/art_assets.py 로 받은 초안($RAW/art_<name>.glb)을 Blender에서 다듬어
assets/fx/fx_art_tripo.glb.json 한 파일로 묶는다. js/artfx.js는 이 파일이 있으면 같은 자리의 절차 메시(tools/blender/fx_art.py) 대신 씀.

  art_canvas  -> tripo_critter   작은 걸작의 그림 생명체 (프롬프트는 '액자 속 그림'이었지만 초안이 액자 없이 물감 생명체로 나와
                                 생명체로 씀 — 액자는 절차 메시 art_frame). 바닥 y 0, 높이 0.95, 앞 +Z
  art_bulb    -> tripo_bulb      영감 충전 전구: 소켓 바닥 y 0, 높이 1.05, 가운데 축
  art_palette -> tripo_palette   즉흥 창작 팔레트: 가장 얇은 축 = 위, 가로 가장 긴 변 2(반지름 약 1), 중심 원점

정리(fx_pharm_tripo.py와 같은 순서): 합치기 → 떠 있는 작은 조각 제거 → 삼각형 줄이기 → 중복 정점 합치기 → 노멀 → 축·크기·원점 →
기본색 텍스처만 512 px JPEG. Usage: RAW=/home/claude/art3d python3 tools/blender/fx_art_tripo.py [name...]
"""
import base64, json, math, os, sys, tempfile
import bpy
from mathutils import Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm_tripo as PT
from fx_pharm_tripo import drop_small, texture, decimate, bounds, pca, rotate_axis_to_z
ROOT = os.path.dirname(os.path.dirname(HERE)); RAW = os.environ.get('RAW', '/home/claude/art3d'); OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'art')
SPEC = {'canvas': ('tripo_critter', 'stand', 0.95, 4000, 512), 'bulb': ('tripo_bulb', 'stand', 1.05, 2400, 512), 'palette': ('tripo_palette', 'flat', 2.0, 2400, 512)}

def load(name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(RAW, 'art_' + name + '.glb'))
    new = [o for o in bpy.context.scene.objects if o not in before]; meshes = [o for o in new if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o.type != 'MESH' and o.name in bpy.data.objects: bpy.data.objects.remove(o)
    return ob

def fit(ob, kind, size):
    if kind == 'flat':
        c, w, v = pca(ob); rotate_axis_to_z(ob, v[:, 0])                  # thinnest axis -> up (Blender +Z = game +Y)
        lo, hi, P = bounds(ob)
        if P[:, 2].mean() - lo[2] > hi[2] - P[:, 2].mean(): ob.data.transform(Matrix.Rotation(math.pi, 4, 'X'))   # paint blobs on top
        lo, hi, P = bounds(ob); s = size / max(hi[0] - lo[0], hi[1] - lo[1])
        ob.data.transform(Matrix.Translation(tuple(-(lo + hi) / 2))); ob.data.transform(Matrix.Scale(s, 4))
    else:
        lo, hi, P = bounds(ob); s = size / (hi[2] - lo[2])
        ob.data.transform(Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))); ob.data.transform(Matrix.Scale(s, 4))
    ob.data.update()

def main():
    names = [a for a in sys.argv[1:] if a in SPEC] or list(SPEC)
    bpy.ops.wm.read_factory_settings(use_empty=True); td = tempfile.mkdtemp(); obs = []; info = {}
    for n in names:
        out, kind, size, target, px = SPEC[n]; ob = load(n); nisl = drop_small(ob, 0.01); texture(ob, px, td, out)
        n0 = decimate(ob, target); fit(ob, kind, size); ob.name = ob.data.name = out; obs.append(ob); lo, hi, P = bounds(ob)
        info[out] = {'tris': [n0, len(ob.data.polygons)], 'size': [round(float(x), 3) for x in (hi - lo)], 'islands': nisl}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.location = (0, 0, 0); o.select_set(True)
    glb = os.path.join(td, 'fx_art_tripo.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=88, export_yup=True, export_apply=True,
                              export_normals=True, export_tangents=False, export_animations=False)
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'models': sorted(o.name for o in obs)}, open(os.path.join(OUT, 'fx_art_tripo.glb.json'), 'w'))
    for i, o in enumerate(obs): o.location.x = i * 1.5
    os.makedirs(SRC, exist_ok=True); bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_art_tripo.blend'), compress=True)
    print(json.dumps(info), len(raw) // 1024, 'KB', flush=True)

if __name__ == '__main__':
    main()
