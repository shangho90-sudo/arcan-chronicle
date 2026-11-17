"""음악가 2차 이펙트용 Tripo 소품 정리 (2026-11-17 fx2): tools/tripo/music_assets.py 로 받은 초안($RAW/mu_<name>.glb, 저장소 밖)을
Blender에서 다듬어 한 파일 assets/fx/fx_music_tripo.glb.json 으로 묶는다(js/musicfx.js가 있으면 절차 메시 대신 씀, 없으면 절차 메시).

  (violin 초안은 너무 뭉툭해 안 씀 — 게임은 바이올린도 tripo_cello 를 작게 씀; fit 'violin' 은 남겨 둠)
  cello  -> tripo_cello    첼로: 바닥(끝핀) y 0, 높이 1, 가로 가운데
  harp   -> tripo_harp     하프: 〃
  player -> tripo_player   환영 연주자(통짜, 악기 없음): 〃 (앞 +Z)

정리(tools/blender/fx_cook_tripo.py와 같은 순서): 메시 합치기 → 정점 용접 → 떠 있는 작은 조각 제거 → 삼각형 줄이기 → 노멀 → 축·크기·원점 → 기본색 512 px JPEG.
앞 방향은 Tripo 초안 그대로(glTF +Z = 게임 앞).
Usage: RAW=/home/claude/music3d python3 tools/blender/fx_music_tripo.py [name...]
"""
import base64, json, os, sys, tempfile
import bpy
from mathutils import Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE)); sys.path.insert(0, HERE)
import fx_pharm_tripo as FT
import fx_cook_tripo as CT
RAW = os.environ.get('RAW', '/home/claude/music3d'); OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'music')
SPEC = {'cello': ('tall', 3000), 'harp': ('tall', 3000), 'player': ('tall', 4000)}
import math
import numpy as np

def fit(ob, kind):
    if kind != 'violin': return CT.fit(ob, kind)
    lo, hi, P = FT.bounds(ob); C = P[:, :2] - P[:, :2].mean(0); w, v = np.linalg.eigh(np.cov(C.T)); ax = v[:, 1]   # 가장 긴 가로 축(블렌더 XY, 위 = Z)
    ob.data.transform(Matrix.Rotation(-math.atan2(ax[1], ax[0]), 4, 'Z')); ob.data.update()
    lo, hi, P = FT.bounds(ob); L = hi[0] - lo[0]
    wid = lambda sel: float(np.ptp(P[sel, 1])) if sel.any() else 0
    if wid(P[:, 0] > hi[0] - 0.3 * L) > wid(P[:, 0] < lo[0] + 0.3 * L): ob.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))   # 넓은 몸통 -> x 0
    lo, hi, P = FT.bounds(ob); s = 1.0 / (hi[0] - lo[0])
    ob.data.transform(Matrix.Translation((-lo[0], -(lo[1] + hi[1]) / 2, -(lo[2] + hi[2]) / 2))); ob.data.transform(Matrix.Scale(s, 4)); ob.data.update()

def load(name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(RAW, 'mu_' + name + '.glb'))
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
    names = [n for n in (sys.argv[1:] or list(SPEC)) if os.path.exists(os.path.join(RAW, 'mu_' + n + '.glb'))]
    bpy.ops.wm.read_factory_settings(use_empty=True); td = tempfile.mkdtemp(); obs = []; info = {}
    for n in names:
        kind, target = SPEC[n]; out = 'tripo_' + n; ob = load(n); CT.weld(ob); nisl = FT.drop_small(ob, 0.01); FT.texture(ob, 512, td, out)
        n0 = FT.decimate(ob, target); fit(ob, kind); ob.name = ob.data.name = out; obs.append(ob); lo, hi, P = FT.bounds(ob)
        info[out] = {'tris': [n0, len(ob.data.polygons)], 'size': [round(float(x), 3) for x in (hi - lo)], 'islands': nisl}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.location = (0, 0, 0); o.select_set(True)
    glb = os.path.join(td, 'fx_music_tripo.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=86, export_yup=True, export_apply=True,
                              export_normals=True, export_tangents=False, export_animations=False)
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'models': sorted(o.name for o in obs)}, open(os.path.join(OUT, 'fx_music_tripo.glb.json'), 'w'))
    for i, o in enumerate(obs): o.location.x = i * 1.5
    os.makedirs(SRC, exist_ok=True); bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_music_tripo.blend'), compress=True)
    print(json.dumps(info), len(raw) // 1024, 'KB', flush=True)

if __name__ == '__main__':
    main()
