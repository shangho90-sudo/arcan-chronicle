"""화가 2차 이펙트용 Tripo 소환물 정리 (2026-11-17 fx2 '더 화려하게'): tools/tripo/painter_assets.py 로 받은 초안($RAW/pt_<name>.glb, 저장소 밖)을
Blender에서 다듬어 한 파일 assets/fx/fx_painter_tripo.glb.json 으로 묶는다(js/painterfx.js 가 있으면 절차 메시 대신 씀, 없으면 절차 메시).

  wolf   -> tripo_wolf    먹물 늑대(달리는 자세 통짜 — 게임이 뛰기·기울기·물기 내밀기로 움직임)   발 y 0, 가로 가장 긴 변 1, 가로 가운데
  crane  -> tripo_crane   색종이 학(날개 편 자세)                                                   바닥 y 0, 가로 가장 긴 변 1
  knight -> tripo_knight  유화 기사(방패만 — 검은 절차 pt_sword 를 오른손에)                         발 y 0, 높이 1
  dragon -> tripo_dragon  먹 용 머리(몸통은 게임이 관 메시로)                                         바닥 y 0, 가로 가장 긴 변 1

정리(tools/blender/fx_herbal_tripo.py 와 같은 순서): 메시 합치기 → 정점 용접(먼저 — 안 하면 줄일 때 면이 찢어짐) → 떠 있는 작은 조각 제거 →
기본색 512 px JPEG → 삼각형 줄이기 → 축·크기·원점. 앞 방향은 초안 그대로 — 게임에서 다르면 js/painterfx.js PAINTFX.tripoYaw 로 돌림.
Usage: RAW=/home/claude/painter3d python3 tools/blender/fx_painter_tripo.py [name...]
"""
import base64, json, os, sys, tempfile
import bpy
from mathutils import Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE)); sys.path.insert(0, HERE)
import fx_pharm_tripo as FT
import fx_cook_tripo as CT
RAW = os.environ.get('RAW', '/home/claude/painter3d'); OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'painter')
SPEC = {'wolf': ('flat', 6000), 'crane': ('flat', 2400), 'knight': ('tall', 6500), 'dragon': ('flat', 5000)}

def load(name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(RAW, 'pt_' + name + '.glb'))
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
    names = [n for n in (sys.argv[1:] or list(SPEC)) if os.path.exists(os.path.join(RAW, 'pt_' + n + '.glb'))]
    bpy.ops.wm.read_factory_settings(use_empty=True); td = tempfile.mkdtemp(); obs = []; info = {}
    for n in names:
        kind, target = SPEC[n]; out = 'tripo_' + n; ob = load(n); CT.weld(ob); nisl = FT.drop_small(ob, 0.01); FT.texture(ob, 512, td, out)
        n0 = FT.decimate(ob, target); CT.fit(ob, kind); ob.name = ob.data.name = out; obs.append(ob); lo, hi, P = FT.bounds(ob)
        info[out] = {'tris': [n0, len(ob.data.polygons)], 'size': [round(float(x), 3) for x in (hi - lo)], 'islands': nisl}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.location = (0, 0, 0); o.select_set(True)
    glb = os.path.join(td, 'fx_painter_tripo.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=86, export_yup=True, export_apply=True,
                              export_normals=True, export_tangents=False, export_animations=False)
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'models': sorted(o.name for o in obs)}, open(os.path.join(OUT, 'fx_painter_tripo.glb.json'), 'w'))
    for i, o in enumerate(obs): o.location.x = i * 1.5
    os.makedirs(SRC, exist_ok=True); bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_painter_tripo.blend'), compress=True)
    print(json.dumps(info), len(raw) // 1024, 'KB', flush=True)

if __name__ == '__main__':
    main()
