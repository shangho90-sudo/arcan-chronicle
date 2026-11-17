"""한약사 2차 이펙트용 Tripo 소품 정리 (2026-11-16 fx2): tools/tripo/herbal_assets.py 로 받은 초안($RAW/herbal_<name>.glb, 저장소 밖)을
Blender에서 다듬어 한 파일 assets/fx/fx_herbal_tripo.glb.json 으로 묶는다(js/herbalfx.js가 있으면 절차 메시 대신 씀, 없으면 절차 메시).

  ginseng -> tripo_ginseng  천년삼 동자(통짜 몸 — 게임이 깡충·눌림·기울기로 움직임, 채찍 팔은 절차 뿌리)  발 y 0, 높이 1, 가로 가운데
  dragon  -> tripo_dragon   청룡(앉은 아기 용 — 땅에서 솟아오름)                                     〃
  pot     -> tripo_pot      약탕관(뚜껑은 절차 hb_lid)                                                바닥 y 0, 높이 1
  phoenix -> tripo_phoenix  주작 몸통(절차 불꽃 날개를 덧붙임)                                         가로 가장 긴 변 1, 가운데 원점

정리(tools/blender/fx_cook_tripo.py와 같은 순서): 메시 합치기 → 정점 용접 → 떠 있는 작은 조각 제거 → 삼각형 줄이기 → 노멀 → 축·크기·원점 → 기본색 512 px JPEG.
앞 방향은 Tripo 초안 그대로(glTF +Z = 게임 앞) — 게임에서 다르면 js/herbalfx.js HERBFX.tripoYaw 로 돌림.
Usage: RAW=/home/claude/herbal3d python3 tools/blender/fx_herbal_tripo.py [name...]
"""
import base64, json, os, sys, tempfile
import bpy
from mathutils import Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE)); sys.path.insert(0, HERE)
import fx_pharm_tripo as FT
import fx_cook_tripo as CT
RAW = os.environ.get('RAW', '/home/claude/herbal3d'); OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'herbal')
SPEC = {'ginseng': ('tall', 6000), 'dragon': ('tall', 6000), 'pot': ('tall', 2400), 'phoenix': ('flat', 4000)}

def load(name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(RAW, 'herbal_' + name + '.glb'))
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
    names = [n for n in (sys.argv[1:] or list(SPEC)) if os.path.exists(os.path.join(RAW, 'herbal_' + n + '.glb'))]
    bpy.ops.wm.read_factory_settings(use_empty=True); td = tempfile.mkdtemp(); obs = []; info = {}
    for n in names:
        kind, target = SPEC[n]; out = 'tripo_' + n; ob = load(n); CT.weld(ob); nisl = FT.drop_small(ob, 0.01); FT.texture(ob, 512, td, out)
        n0 = FT.decimate(ob, target); CT.fit(ob, kind); ob.name = ob.data.name = out; obs.append(ob); lo, hi, P = FT.bounds(ob)
        info[out] = {'tris': [n0, len(ob.data.polygons)], 'size': [round(float(x), 3) for x in (hi - lo)], 'islands': nisl}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.location = (0, 0, 0); o.select_set(True)
    glb = os.path.join(td, 'fx_herbal_tripo.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=86, export_yup=True, export_apply=True,
                              export_normals=True, export_tangents=False, export_animations=False)
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'models': sorted(o.name for o in obs)}, open(os.path.join(OUT, 'fx_herbal_tripo.glb.json'), 'w'))
    for i, o in enumerate(obs): o.location.x = i * 1.5
    os.makedirs(SRC, exist_ok=True); bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_herbal_tripo.blend'), compress=True)
    print(json.dumps(info), len(raw) // 1024, 'KB', flush=True)

if __name__ == '__main__':
    main()
