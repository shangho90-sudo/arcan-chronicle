"""직업 계보별 무기 2단계(2026-11-17): Tripo 대표 장식 초안($RAW/wpn_<계열>_<a|b>.glb, tools/tripo/gear2_wpn_assets.py)을
작은 장식 GLB로 다듬는다 → $RAW/prep/<계열>_<a|b>.glb (저장소 밖 — tools/blender/gear2_wpn.py가 단계별 무기를 조립할 때 읽음).

정리: 합치기 → 정점 용접(줄이기 전에, 안 하면 면이 찢어짐) → 떠 있는 작은 조각 제거 → 삼각형 TRIS개로 줄이기 → 기본색만 512 px
→ 경계 상자 가운데 원점, 가장 긴 변 1, 초안의 앞(+X)을 −Y로(카메라·아이콘 쪽). 확인용 세 방향 그림 $RAW/prep/<키>_views.png.
Usage: python3 tools/blender/gear2_wpn_prep.py [키 ...]   (키 = nov_a …, 없으면 있는 초안 전부; FORCE=1이면 다시)"""
import math, os, sys, tempfile, glob
import bpy, bmesh
from mathutils import Matrix
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm_tripo as PT
RAW = os.environ.get('RAW', '/home/claude/gear2_3d'); OUT = os.path.join(RAW, 'prep'); os.makedirs(OUT, exist_ok=True)
FORCE = os.environ.get('FORCE') == '1'
TRIS = {'smith': 1900, 'eng': 1900, 'cook': 1500, 'pharm': 1800, 'wpharm': 1800, 'herb': 1800}   # 머리 전체가 장식인 계열은 조금 더
TEX = 512

def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.context.scene.objects):
        if o is not ob: bpy.data.objects.remove(o)
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0008); bm.to_mesh(ob.data); bm.free()
    return ob

def prep(key):
    src = os.path.join(RAW, 'wpn_' + key + '.glb'); dst = os.path.join(OUT, key + '.glb')
    if not os.path.exists(src): print(key, 'no raw', flush=True); return
    if os.path.exists(dst) and not FORCE: print(key, 'have', flush=True); return
    ob = load(src); PT.drop_small(ob, 0.01)
    # 겹친 껍질을 용접하면 면이 셋 이상 붙은 모서리(non-manifold)가 생기고, 줄이기가 그 근처에서 멈춤(5천 개 아래로 안 내려감) → 그 모서리만 떼어 놓음
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.split_edges(bm, edges=[e for e in bm.edges if not e.is_manifold and not e.is_boundary]); bm.to_mesh(ob.data); bm.free()
    tgt = TRIS.get(key.split('_')[0], 1600); n0 = PT.decimate(ob, tgt)
    for _ in range(6):                                     # 첫 줄이기가 UV 경계 때문에 덜 줄면 몇 번 더(삼각형 수 기준)
        bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(ob.data); bm.free()
        if len(ob.data.polygons) <= tgt * 1.05: break
        PT.decimate(ob, tgt)
    ob.data.transform(Matrix.Rotation(math.radians(-90), 4, 'Z'))                 # Tripo 앞(+X) -> -Y
    lo, hi, P = PT.bounds(ob); c = (lo + hi) / 2; s = 1.0 / max(hi - lo)
    ob.data.transform(Matrix.Translation((-c[0], -c[1], -c[2]))); ob.data.transform(Matrix.Scale(s, 4)); ob.data.update()
    td = tempfile.mkdtemp(); mat = PT.texture(ob, TEX, td, 'orn'); tint(mat, key.split('_')[0])
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); bsdf.inputs['Metallic'].default_value = 0; bsdf.inputs['Roughness'].default_value = 0.6
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_image_format='JPEG', export_jpeg_quality=86, export_animations=False, export_yup=False)
    print(key, n0, '->', len(ob.data.polygons), 'tris', os.path.getsize(dst) // 1024, 'KB', 'dims', [round(v, 2) for v in (hi - lo) * s], flush=True)
    views(ob, key)

# 초안이 거의 무채색(흰 석고처럼)으로 오면 계열 색으로 칠함: 어두운 곳 = 테 색, 중간 = 머리 색, 밝은 곳 = 거의 흰색
TINT = {'nov': ('#9a7430', '#f3ead2', '#ffffff')}
def tint(mat, line):
    img = next((n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE'), None)
    if not img: return
    from PIL import ImageOps, ImageStat
    src = bpy.path.abspath(img.filepath); im = Image.open(src).convert('RGB')
    sat = ImageStat.Stat(im.convert('HSV')).mean[1]
    if sat > 30 and line not in TINT: return
    d, m, l = TINT.get(line, ('#606060', '#c0c0c0', '#ffffff'))
    g = ImageOps.autocontrast(im.convert('L'), cutoff=2); ImageOps.colorize(g, black=d, white=l, mid=m).save(src); img.reload()
    print(line, 'tinted (saturation %.0f)' % sat, flush=True)

def views(ob, key):
    """앞(-Y)·옆(+X)·위 세 방향 그림 — 계열마다 붙일 방향을 고르는 확인용"""
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 8; sc.cycles.use_denoising = False
    sc.render.resolution_x = sc.render.resolution_y = 200; sc.render.film_transparent = False
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.5, 0.55, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.5
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.2
    ims = []
    for loc, rot in (((0, -4, 0), (math.radians(90), 0, 0)), ((4, 0, 0), (math.radians(90), 0, math.radians(90))), ((0, 0, 4), (0, 0, 0))):
        cam.location = loc; cam.rotation_euler = rot
        f = os.path.join(tempfile.mkdtemp(), 'v.png'); sc.render.filepath = f; bpy.ops.render.render(write_still=True); ims.append(Image.open(f).convert('RGB'))
    o = Image.new('RGB', (600, 200)); [o.paste(im, (i * 200, 0)) for i, im in enumerate(ims)]; o.save(os.path.join(OUT, key + '_views.png'))

if __name__ == '__main__':
    keys = [a for a in sys.argv[1:] if not a.startswith('-')] or sorted(os.path.basename(p)[4:-4] for p in glob.glob(os.path.join(RAW, 'wpn_*.glb')))
    for k in keys: prep(k)
