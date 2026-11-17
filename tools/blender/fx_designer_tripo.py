"""디자이너 2차 이펙트용 Tripo 소품 정리 (2026-11-17 fx2): tools/tripo/designer_assets.py 로 받은 초안($RAW/ds_<name>.glb, 저장소 밖)을
Blender에서 다듬어 한 파일 assets/fx/fx_designer_tripo.glb.json 으로 묶는다(js/designerfx.js가 있으면 절차 메시 대신 씀, 없으면 절차 메시).

  mannequin -> tripo_mannequin  재봉 마네킹(받침·몸통 통짜 — 게임이 실로 감아 올리며 아래부터 나타나게 함)   바닥 y 0, 높이 1, 가로 가운데
  brooch    -> tripo_brooch     보석 브로치(시침 표식·뮤즈·퍼펙션)                                           〃 (앞면 +Z)
  spool     -> tripo_spool      금실 실패(스티치·리스티치·자수)                                               〃

정리(tools/blender/fx_cook_tripo.py와 같은 순서): 메시 합치기 → 정점 용접 → 떠 있는 작은 조각 제거 → 삼각형 줄이기 → 노멀 → 축·크기·원점 → 기본색 512 px JPEG.
앞 방향은 Tripo 초안 그대로(glTF +Z = 게임 앞).
Usage: RAW=/home/claude/designer3d python3 tools/blender/fx_designer_tripo.py [name...]
"""
import base64, json, os, sys, tempfile
import bpy
from mathutils import Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE)); sys.path.insert(0, HERE)
import fx_pharm_tripo as FT
import fx_cook_tripo as CT
RAW = os.environ.get('RAW', '/home/claude/designer3d'); OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'designer')
SPEC = {'mannequin': ('tall', 4000), 'brooch': ('tall', 2400), 'spool': ('tall', 1600)}

def load(name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(RAW, 'ds_' + name + '.glb'))
    new = [o for o in bpy.context.scene.objects if o not in before]; meshes = [o for o in new if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o.type != 'MESH' and o.name in bpy.data.objects: bpy.data.objects.remove(o)
    return ob

def main():
    names = [n for n in (sys.argv[1:] or list(SPEC)) if os.path.exists(os.path.join(RAW, 'ds_' + n + '.glb'))]
    bpy.ops.wm.read_factory_settings(use_empty=True); td = tempfile.mkdtemp(); obs = []; info = {}
    for n in names:
        kind, target = SPEC[n]; out = 'tripo_' + n; ob = load(n); CT.weld(ob); nisl = FT.drop_small(ob, 0.01); FT.texture(ob, 512, td, out)
        n0 = FT.decimate(ob, target); CT.fit(ob, kind); ob.name = ob.data.name = out; obs.append(ob); lo, hi, P = FT.bounds(ob)
        info[out] = {'tris': [n0, len(ob.data.polygons)], 'size': [round(float(x), 3) for x in (hi - lo)], 'islands': nisl}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.location = (0, 0, 0); o.select_set(True)
    glb = os.path.join(td, 'fx_designer_tripo.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=86, export_yup=True, export_apply=True,
                              export_normals=True, export_tangents=False, export_animations=False)
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'models': sorted(o.name for o in obs)}, open(os.path.join(OUT, 'fx_designer_tripo.glb.json'), 'w'))
    for i, o in enumerate(obs): o.location.x = i * 1.5
    os.makedirs(SRC, exist_ok=True); bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_designer_tripo.blend'), compress=True)
    print(json.dumps(info), len(raw) // 1024, 'KB', flush=True)

if __name__ == '__main__':
    main()
