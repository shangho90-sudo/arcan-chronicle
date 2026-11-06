"""World monsters, step 2 (2026-11-06): Tripo draft GLB -> Blender clean-up -> assets/creatures/w_<name>.glb.json
  * import, join, drop loose fragments (tiny floating islands Tripo leaves behind)
  * decimate (collapse) to ~TARGET triangles, weld, smooth shading by angle
  * ground the model (feet at y 0) and centre it on its footprint
  * base colour only (no normal / metal maps): resized to 1024 px and given a light painterly pass (mode filter that
    flattens photo-like noise into colour patches, a little extra saturation and warmth) so it sits with the
    hand-painted world; matte material (roughness 0.95, metallic 0)
  * glTF export (JPEG texture), base64 JSON wrap (the artifact host refuses binaries)
Usage: python3 tools/monsters/blender_new.py [name,name,...]   (bpy as a module; raw GLBs in $RAW, default /home/claude/new3d)"""
import base64, json, math, os, sys, tempfile
import bpy, bmesh
from PIL import Image, ImageEnhance, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, '..', '..', 'assets', 'creatures')
RAW = os.environ.get('RAW', '/home/claude/new3d'); TARGET = int(os.environ.get('TARGET', '9000'))

def process(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(RAW, name + '.glb'))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # loose fragments: keep islands with at least 0.5 % of the faces
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
    seen, islands = set(), []
    for f in bm.faces:
        if f.index in seen: continue
        stack, isl = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop(); isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen: seen.add(h.index); stack.append(h)
        islands.append(isl)
    big = max(len(i) for i in islands); drop = [f for i in islands if len(i) < big * 0.005 for f in i]
    if drop: bmesh.ops.delete(bm, geom=drop, context='FACES')
    bm.to_mesh(ob.data); bm.free()
    n0 = len(ob.data.polygons)
    mod = ob.modifiers.new('dec', 'DECIMATE'); mod.decimate_type = 'COLLAPSE'; mod.ratio = min(1.0, TARGET / max(1, n0)); mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0005); bpy.ops.object.mode_set(mode='OBJECT')
    try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50))
    except Exception: bpy.ops.object.shade_smooth()
    # ground + centre (Blender is Z up; glTF export turns it back to Y up)
    vs = [ob.matrix_world @ v.co for v in ob.data.vertices]
    minz = min(v.z for v in vs); low = [v for v in vs if v.z < minz + 0.08 * (max(v.z for v in vs) - minz)]
    cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2; cy = (min(v.y for v in vs) + max(v.y for v in vs)) / 2
    for v in ob.data.vertices: v.co.x -= cx; v.co.y -= cy; v.co.z -= minz
    # material: base colour only, painterly pass, matte
    mat = ob.data.materials[0]; nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    img = None
    for l in nt.links:
        if l.to_node == bsdf and l.to_socket.name == 'Base Color' and l.from_node.type == 'TEX_IMAGE': img = l.from_node.image
    for l in list(nt.links):
        if l.to_node == bsdf and l.to_socket.name in ('Metallic', 'Roughness', 'Normal'): nt.links.remove(l)
    for n in list(nt.nodes):
        if n.type in ('NORMAL_MAP', 'SEPARATE_COLOR', 'SEPRGB') or (n.type == 'TEX_IMAGE' and n.image is not img): nt.nodes.remove(n)
    bsdf.inputs['Metallic'].default_value = 0.0; bsdf.inputs['Roughness'].default_value = 0.95
    td = tempfile.mkdtemp()
    if img:
        src = os.path.join(td, 'c.png'); img.filepath_raw = src; img.file_format = 'PNG'; img.save()
        im = Image.open(src).convert('RGB').resize((1024, 1024), Image.LANCZOS)
        im = im.filter(ImageFilter.ModeFilter(5)).filter(ImageFilter.SMOOTH)          # photo noise -> painted colour patches
        im = ImageEnhance.Color(im).enhance(1.12); r, g, b = im.split(); r = r.point(lambda v: min(255, int(v * 1.03))); im = Image.merge('RGB', (r, g, b))
        dst = os.path.join(td, name + '_col.png'); im.save(dst)
        img2 = bpy.data.images.load(dst); [n for n in nt.nodes if n.type == 'TEX_IMAGE'][0].image = img2
    glb = os.path.join(td, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=88, export_draco_mesh_compression_enable=False,
                              export_animations=False, export_yup=True, export_apply=True, export_normals=True, export_tangents=False)
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(OUT, 'w_' + name + '.glb.json'), 'w'))
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print(name, n0, '->', tris, 'tris', len(raw) // 1024, 'KB', flush=True)

if __name__ == '__main__':
    names = sys.argv[1].split(',') if len(sys.argv) > 1 else sorted(f[:-4] for f in os.listdir(RAW) if f.endswith('.glb'))
    for n in names:
        if os.path.exists(os.path.join(RAW, n + '.glb')): process(n)
