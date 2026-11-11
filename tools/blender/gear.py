"""장비 40종(2026-11-11): Tripo 초안($RAW/gear_<id>.glb, tools/tripo/gear_assets.py) → Blender 정리
  * 아이콘: 모든 아이템을 Cycles로 렌더(투명 배경 256 → 128 px) → assets/ui/items/<id>.png
      유봉은 머리가 오른쪽 위로 가게 45° 눕히고, 갑옷·장신구는 정면에서 살짝 돌려 찍음 (게임 안 3D 아이콘과 같은 구도)
  * 손에 드는 유봉 10개: 조각 제거 → 삼각형 ~2600개로 줄임 → 머리가 위(+Z, 굵은 쪽), 길이 0.46 m, 손잡이 아래에서 14 % 지점이 원점(쥐는 곳)
      → 기본색 텍스처 512 px JPEG만(노멀·금속 맵 없음) → assets/items/<id>.glb.json (base64 래핑; 게임은 js/items3d.js gearModel)
이미 만든 것은 건너뜀(FORCE=1이면 다시). Usage: python3 tools/blender/gear.py [id ...]   (bpy 모듈, RAW 기본 /home/claude/gear3d)"""
import base64, json, math, os, sys, tempfile
import bpy, bmesh
from mathutils import Vector, Matrix
from PIL import Image, ImageEnhance
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
RAW = os.environ.get('RAW', '/home/claude/gear3d'); FORCE = os.environ.get('FORCE') == '1'
ICONS = os.path.join(ROOT, 'assets', 'ui', 'items'); MODELS = os.path.join(ROOT, 'assets', 'items')
os.makedirs(ICONS, exist_ok=True); os.makedirs(MODELS, exist_ok=True)
FRONT = float(os.environ.get('FRONT', '-90'))
TRIS = 2600; LENGTH = 0.46; GRIP = 0.14; TEX = 512; ICON = 128

def load(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(RAW, 'gear_' + name + '.glb'))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.parent = None if not ob.parent else ob.parent
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.context.scene.objects):
        if o is not ob: bpy.data.objects.remove(o)
    return ob

def bounds(ob):
    vs = [v.co for v in ob.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))); hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return lo, hi

def icon(ob, name, weapon):
    """정면(-Y 쪽)에서 본 직교 카메라. 물체를 원점에 놓고 크기 1로 맞춘 뒤 찍음."""
    lo, hi = bounds(ob); c = (lo + hi) / 2; s = 1.0 / max(hi - lo)
    ob.data.transform(Matrix.Translation(-c)); ob.data.transform(Matrix.Scale(s, 4))
    ob.rotation_mode = 'XYZ'                                                      # (glTF에서 온 물체는 쿼터니언 모드)
    if weapon: ob.rotation_euler = (0, math.radians(45), 0)                      # 화면에서 머리가 오른쪽 위
    else: ob.rotation_euler = (0, 0, math.radians(FRONT - 20))                    # Tripo 모델의 앞은 +X → 카메라(-Y) 쪽으로
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.use_denoising = False
    sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = ICON * 2; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.5 if weapon else 1.22
    el = math.radians(14); cam.location = (0, -4 * math.cos(el), 4 * math.sin(el)); cam.rotation_euler = (math.radians(90) - el, 0, 0)
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (1, 0.97, 0.92, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.85
    for nm, loc, e, col in (('key', (-2.5, -3, 4), 3.2, (1, 0.95, 0.86)), ('rim', (3, 2, 2), 2.0, (0.6, 0.8, 1))):
        L = bpy.data.objects.new(nm, bpy.data.lights.new(nm, 'SUN')); sc.collection.objects.link(L); L.data.energy = e; L.data.color = col
        L.rotation_euler = Vector(loc).to_track_quat('Z', 'Y').to_euler()
    tmp = os.path.join(tempfile.mkdtemp(), 'i.png'); sc.render.filepath = tmp; bpy.ops.render.render(write_still=True)
    im = Image.open(tmp).convert('RGBA'); bb = im.getbbox()
    if bb:                                                                          # 여백을 잘라 칸을 꽉 채움
        im = im.crop(bb); side = int(max(im.size) * 1.08); sq = Image.new('RGBA', (side, side), (0, 0, 0, 0)); sq.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2)); im = sq
    im = im.resize((ICON, ICON), Image.LANCZOS)
    rgb = ImageEnhance.Color(im.convert('RGB')).enhance(1.12); rgb.putalpha(im.split()[3]); rgb.save(os.path.join(ICONS, name + '.png'), optimize=True)
    ob.rotation_euler = (0, 0, 0)

def weapon_mesh(name):
    ob = load(name)
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
    big = max(len(i) for i in islands); drop = [f for i in islands if len(i) < big * 0.01 for f in i]
    if drop: bmesh.ops.delete(bm, geom=drop, context='FACES')
    bm.to_mesh(ob.data); bm.free()
    n0 = len(ob.data.polygons)
    mod = ob.modifiers.new('dec', 'DECIMATE'); mod.ratio = min(1.0, TRIS / max(1, n0)); mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(55))
    except Exception: bpy.ops.object.shade_smooth()
    # 긴 축을 Z로, 굵은 쪽(머리)을 위로
    lo, hi = bounds(ob); size = hi - lo; ax = max(range(3), key=lambda i: size[i])
    if ax == 0: ob.data.transform(Matrix.Rotation(math.radians(-90), 4, 'Y'))
    elif ax == 1: ob.data.transform(Matrix.Rotation(math.radians(90), 4, 'X'))
    lo, hi = bounds(ob); H = hi.z - lo.z; cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    rad = lambda a, b: max([math.hypot(v.co.x - cx, v.co.y - cy) for v in ob.data.vertices if lo.z + a * H <= v.co.z <= lo.z + b * H] or [0])
    if rad(0, 0.3) > rad(0.7, 1.0): ob.data.transform(Matrix.Rotation(math.pi, 4, 'X')); lo, hi = bounds(ob); cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    k = LENGTH / H
    ob.data.transform(Matrix.Translation((-cx, -cy, -(lo.z + GRIP * H)))); ob.data.transform(Matrix.Scale(k, 4))
    # 재질: 기본색만, 512 px
    mat = ob.data.materials[0]; nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    img = None
    for l in nt.links:
        if l.to_node == bsdf and l.to_socket.name == 'Base Color' and l.from_node.type == 'TEX_IMAGE': img = l.from_node.image
    for l in list(nt.links):
        if l.to_node == bsdf and l.to_socket.name in ('Metallic', 'Roughness', 'Normal'): nt.links.remove(l)
    for n in list(nt.nodes):
        if n.type in ('NORMAL_MAP', 'SEPARATE_COLOR', 'SEPRGB') or (n.type == 'TEX_IMAGE' and n.image is not img): nt.nodes.remove(n)
    bsdf.inputs['Metallic'].default_value = 0.0; bsdf.inputs['Roughness'].default_value = 0.55
    td = tempfile.mkdtemp()
    if img:
        src = os.path.join(td, 'c.png'); img.filepath_raw = src; img.file_format = 'PNG'; img.save()
        im = ImageEnhance.Color(Image.open(src).convert('RGB').resize((TEX, TEX), Image.LANCZOS)).enhance(1.1)
        dst = os.path.join(td, name + '_col.png'); im.save(dst)
        [n for n in nt.nodes if n.type == 'TEX_IMAGE'][0].image = bpy.data.images.load(dst)
    glb = os.path.join(td, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=84, export_animations=False, export_yup=True, export_apply=True,
                              export_normals=True, export_tangents=False)
    raw = open(glb, 'rb').read(); lo, hi = bounds(ob)
    json.dump({'b64': base64.b64encode(raw).decode(), 'len': round(hi.z, 4), 'tris': len(ob.data.polygons)}, open(os.path.join(MODELS, name + '.glb.json'), 'w'))
    print(name, 'mesh', n0, '->', len(ob.data.polygons), 'tris', len(raw) // 1024, 'KB', 'tip', round(hi.z, 3), flush=True)

def process(name):
    if not os.path.exists(os.path.join(RAW, 'gear_' + name + '.glb')): print(name, 'no raw model', flush=True); return
    weapon = name.startswith('w_')
    if FORCE or not os.path.exists(os.path.join(ICONS, name + '.png')):
        icon(load(name), name, weapon); print(name, 'icon', flush=True)
    if weapon and (FORCE or not os.path.exists(os.path.join(MODELS, name + '.glb.json'))): weapon_mesh(name)

if __name__ == '__main__':
    ids = [i['id'] for i in json.load(open(os.path.join(ROOT, 'assets', 'data', 'items.json')))['items'] if i.get('gear')]
    for n in [a for a in sys.argv[1:] if a in ids] or ids: process(n)
