"""엔지니어 2차 이펙트용 Tripo 병기 덩어리 정리 (2026-11-17 fx2): tools/tripo/en_assets.py 로 받은 초안($RAW/en_<name>.glb, 저장소 밖)을
Blender에서 다듬어 한 파일 assets/fx/fx_engineer_tripo.glb.json 으로 묶는다(js/engfx.js가 있으면 절차 부품 대신 씀, 없으면 절차 부품).
병기는 부품 피벗으로 움직이므로 각 덩어리의 원점을 그 부품의 피벗(js/engfx.js와 tools/blender/fx_engineer.py의 같은 이름 부품)에 맞춘다:

  hull   -> tripo_w_hull   워커 몸통: 바닥 원점, 가로 가장 긴 변 1.5 (절차 en_w_hull 1.3 x 0.8 x 1.1보다 조금 큼)
  leg    -> tripo_w_thigh  워커 다리를 무릎(아래에서 KNEE 비율)에서 잘라 위쪽 = 넓적다리: 원점 = 엉덩이(맨 위), 아래로
            tripo_w_shin   아래쪽 = 정강이: 원점 = 무릎(자른 높이), 아래로 — 다리 전체 높이 LEG(= 절차 0.85 + 0.9)
  sentry -> tripo_sentry   센트리 머리: 바닥 원점(좌우 회전 피벗), 가로 가장 긴 변 0.5
  drone  -> tripo_drone    드론 몸통: 가운데 원점, 가로 가장 긴 변 0.46

정리(fx_herbal_tripo.py와 같은 순서): 메시 합치기 → 정점 용접 → 떠 있는 작은 조각 제거 → 기본색 512 px → 삼각형 줄이기 → 축·크기·원점.
앞 방향: YAW(도, Blender Z축)로 초안의 앞을 게임 +Z(Blender -Y)로 돌림 — 미리보기(en_<name>_preview.webp)를 보고 정함.
Usage: RAW=/home/claude/engineer3d python3 tools/blender/fx_engineer_tripo.py [name...]
"""
import base64, json, math, os, sys, tempfile
import bpy, bmesh
from mathutils import Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE)); sys.path.insert(0, HERE)
import fx_pharm_tripo as FT
import fx_cook_tripo as CT
RAW = os.environ.get('RAW', '/home/claude/engineer3d'); OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'engineer')
SPEC = {'hull': 5000, 'leg': 3000, 'sentry': 3000, 'drone': 2400}   # 삼각형 예산
YAW = {'hull': -90, 'leg': 0, 'sentry': -90, 'drone': -90}   # 초안의 앞이 Blender +X로 나옴(미리보기·옆 렌더로 확인) → -Y(게임 +Z)로
LEG, KNEE = 1.75, 0.9 / 1.75

def load(name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(RAW, 'en_' + name + '.glb'))
    new = [o for o in bpy.context.scene.objects if o not in before]; meshes = [o for o in new if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o.type != 'MESH' and o.name in bpy.data.objects: bpy.data.objects.remove(o)
    return ob

def place(ob, size, mode):
    """mode 'bottom': 바닥 가운데 원점, 가로 가장 긴 변 = size / 'centre': 가운데 원점 / 'height': 바닥 원점, 높이 = size"""
    lo, hi, P = FT.bounds(ob)
    s = size / ((hi[2] - lo[2]) if mode == 'height' else max(hi[0] - lo[0], hi[1] - lo[1]))
    z0 = (lo[2] + hi[2]) / 2 if mode == 'centre' else lo[2]
    ob.data.transform(Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -z0))); ob.data.transform(Matrix.Scale(s, 4)); ob.data.update()

def cut(ob, z, keep_top):
    """z 높이에서 잘라 위(keep_top) 또는 아래만 남기고 잘린 면을 메움"""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    r = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=(0, 0, 1), clear_inner=keep_top, clear_outer=not keep_top)
    edges = [e for e in r['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    try: bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    except Exception as e: print('fill', e)
    bm.to_mesh(ob.data); bm.free(); ob.data.update()

def main():
    names = [n for n in (sys.argv[1:] or list(SPEC)) if os.path.exists(os.path.join(RAW, 'en_' + n + '.glb'))]
    bpy.ops.wm.read_factory_settings(use_empty=True); td = tempfile.mkdtemp(); obs = []; info = {}
    for n in names:
        ob = load(n); CT.weld(ob); nisl = FT.drop_small(ob, 0.01); FT.texture(ob, 512, td, 'tripo_' + n)
        n0 = FT.decimate(ob, SPEC[n])
        if YAW[n]: ob.data.transform(Matrix.Rotation(math.radians(YAW[n]), 4, 'Z'))
        if n == 'leg':
            place(ob, LEG, 'height'); sh = ob.copy(); sh.data = ob.data.copy(); bpy.context.scene.collection.objects.link(sh)
            cut(ob, LEG * KNEE, True); ob.data.transform(Matrix.Translation((0, 0, -LEG)))          # 넓적다리: 원점 = 맨 위(엉덩이)
            cut(sh, LEG * KNEE, False); sh.data.transform(Matrix.Translation((0, 0, -LEG * KNEE)))  # 정강이: 원점 = 무릎
            parts = [(ob, 'tripo_w_thigh'), (sh, 'tripo_w_shin')]
        elif n == 'hull': place(ob, 1.5, 'bottom'); parts = [(ob, 'tripo_w_hull')]
        elif n == 'sentry': place(ob, 0.5, 'bottom'); parts = [(ob, 'tripo_sentry')]
        else: place(ob, 0.46, 'centre'); parts = [(ob, 'tripo_drone')]
        for o, out in parts:
            o.name = o.data.name = out; obs.append(o); lo, hi, P = FT.bounds(o)
            info[out] = {'tris': [n0, len(o.data.polygons)], 'size': [round(float(x), 3) for x in (hi - lo)], 'lo': [round(float(x), 3) for x in lo], 'islands': nisl}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.location = (0, 0, 0); o.select_set(True)
    glb = os.path.join(td, 'fx_engineer_tripo.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=86, export_yup=True, export_apply=True,
                              export_normals=True, export_tangents=False, export_animations=False)
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'models': sorted(o.name for o in obs)}, open(os.path.join(OUT, 'fx_engineer_tripo.glb.json'), 'w'))
    for i, o in enumerate(obs): o.location.x = i * 1.8
    os.makedirs(SRC, exist_ok=True); bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_engineer_tripo.blend'), compress=True)
    print(json.dumps(info), len(raw) // 1024, 'KB', flush=True)

if __name__ == '__main__':
    main()
