"""마을 랜드마크 36종(2026-11-11): Tripo 초안($RAW/town_<id>.glb, tools/tripo/town_assets.py) → Blender 정리
  조각 제거 → 삼각형 ~TRIS개로 줄임 → 바닥 z=0·가로 중심 원점 → 가장 긴 가로 변 = 1 로 정규화 → 기본색 1024 px JPEG만(무광)
  → assets/town3d/town_<id>.glb.json (base64 래핑) + assets/town3d/town_manifest.json {file: [w, d, h]} (tools/world/towns.py가 읽음)
이미 만든 것은 건너뜀(FORCE=1이면 다시). Usage: python3 tools/blender/town_assets.py [id ...]   (bpy 모듈, RAW 기본 /home/claude/town3d)"""
import base64, glob, json, math, os, sys, tempfile
import bpy, bmesh
from mathutils import Vector, Matrix
from PIL import Image, ImageEnhance
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
RAW = os.environ.get('RAW', '/home/claude/town3d'); FORCE = os.environ.get('FORCE') == '1'
OUT = os.path.join(ROOT, 'assets', 'town3d'); MAN = os.path.join(OUT, 'town_manifest.json')
TRIS = int(os.environ.get('TRIS', 6000)); TEX = int(os.environ.get('TEX', 1024))

def bounds(ob):
    vs = [v.co for v in ob.data.vertices]
    return Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))), Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))

def process(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(RAW, 'town_' + name + '.glb'))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.context.scene.objects):
        if o is not ob: bpy.data.objects.remove(o)
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()          # 떠 있는 작은 조각 제거
    seen, islands = set(), []
    for f in bm.faces:
        if f.index in seen: continue
        stack, isl = [f], []; seen.add(f.index)
        while stack:
            g = stack.pop(); isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen: seen.add(h.index); stack.append(h)
        islands.append(isl)
    big = max(len(i) for i in islands); drop = [f for i in islands if len(i) < big * 0.004 for f in i]
    if drop: bmesh.ops.delete(bm, geom=drop, context='FACES')
    bm.to_mesh(ob.data); bm.free()
    ob.data.calc_loop_triangles(); n0 = len(ob.data.loop_triangles)
    mod = ob.modifiers.new('dec', 'DECIMATE'); mod.ratio = min(1.0, TRIS / max(1, n0)); mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50))
    except Exception: bpy.ops.object.shade_smooth()
    lo, hi = bounds(ob); k = 1.0 / max(hi.x - lo.x, hi.y - lo.y)
    ob.data.transform(Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z - 0.004 * (hi.z - lo.z)))); ob.data.transform(Matrix.Scale(k, 4))
    mat = ob.data.materials[0]; nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); img = None
    for l in nt.links:
        if l.to_node == bsdf and l.to_socket.name == 'Base Color' and l.from_node.type == 'TEX_IMAGE': img = l.from_node.image
    for l in list(nt.links):
        if l.to_node == bsdf and l.to_socket.name in ('Metallic', 'Roughness', 'Normal'): nt.links.remove(l)
    for n in list(nt.nodes):
        if n.type in ('NORMAL_MAP', 'SEPARATE_COLOR', 'SEPRGB') or (n.type == 'TEX_IMAGE' and n.image is not img): nt.nodes.remove(n)
    bsdf.inputs['Metallic'].default_value = 0.0; bsdf.inputs['Roughness'].default_value = 0.8
    td = tempfile.mkdtemp()
    if img:
        src = os.path.join(td, 'c.png'); img.filepath_raw = src; img.file_format = 'PNG'; img.save()
        im = ImageEnhance.Color(Image.open(src).convert('RGB').resize((TEX, TEX), Image.LANCZOS)).enhance(1.08)
        dst = os.path.join(td, name + '_col.png'); im.save(dst)
        [n for n in nt.nodes if n.type == 'TEX_IMAGE'][0].image = bpy.data.images.load(dst)
    glb = os.path.join(td, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=72, export_animations=False, export_yup=True, export_apply=True, export_normals=True, export_tangents=False)
    raw = open(glb, 'rb').read(); lo, hi = bounds(ob)
    size = [round(hi.x - lo.x, 4), round(hi.y - lo.y, 4), round(hi.z, 4)]             # 게임 좌표: 가로 x, 깊이 z(=Blender y), 높이
    json.dump({'b64': base64.b64encode(raw).decode(), 'size': size, 'tris': len(ob.data.polygons)}, open(os.path.join(OUT, 'town_' + name + '.glb.json'), 'w'))
    print(name, n0, '->', len(ob.data.polygons), 'tris', len(raw) // 1024, 'KB', size, flush=True)
    return size

if __name__ == '__main__':
    man = json.load(open(MAN)) if os.path.exists(MAN) else {}
    ids = sorted(os.path.basename(p)[5:-4] for p in glob.glob(os.path.join(RAW, 'town_*.glb')))
    for n in [a for a in sys.argv[1:] if a in ids] or ids:
        if not FORCE and 'town_' + n in man and os.path.exists(os.path.join(OUT, 'town_' + n + '.glb.json')): continue
        man['town_' + n] = process(n); json.dump(man, open(MAN, 'w'), indent=0, sort_keys=True)
