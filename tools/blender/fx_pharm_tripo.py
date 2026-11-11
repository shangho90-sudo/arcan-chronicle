"""약사 이펙트용 Tripo 모델 정리 (2026-11-11): tools/tripo/pharm_assets.py tripo 로 받은 초안($RAW/pharm_<name>.glb)을
Blender에서 다듬어 한 파일 assets/fx/fx_pharm_tripo.glb.json 으로 묶는다(js/pharmfx.js가 있으면 이 모델을 절차 메시 대신 씀).

  pharm_pestle_only -> tripo_pestle      천근쇄약 황금 유봉: 긴 축 = +Y(게임 위), 굵은 머리가 아래(y 0), 높이 1
                                         (pharm_pestle_gold 첫 결과는 절구 그릇이 붙어 나와 쓰지 않음)
  pharm_flask_gold  -> tripo_flask_gold  황금 약병(사용자 요청 2-A): 바닥 y 0, 높이 0.36
  pharm_flask       -> tripo_flask       약병폭격 약병: 바닥 y 0, 높이 0.36
  pharm_syringe     -> tripo_syringe     주사기: 긴 축 = +Y, 가는 쪽(바늘)이 위(y 1), 길이 1
  pharm_shards      -> tripo_shard_N     지면 파편: 떨어진 조각별로 나눠 큰 것 6~10개, 가장 얇은 축 = +Y, 반지름 ~1, 중심 원점

정리: 메시 합치기 → 떠 있는 작은 조각 제거 → 삼각형 줄이기 → 중복 정점 합치기 → 노멀 다시 계산 → 축·크기·원점 맞춤 →
기본색 텍스처만 남겨 512 px(유봉 1024) JPEG. Usage: RAW=/tmp/pharmfx2/raw python3 tools/blender/fx_pharm_tripo.py [name...]
"""
import base64, json, math, os, sys, tempfile
import numpy as np
import bpy, bmesh
from mathutils import Matrix, Vector
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
RAW = os.environ.get('RAW', '/home/claude/new3d'); OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'pharm')
SPEC = {   # name: (out name, kind, target tris, texture px)
    'pestle_only': ('tripo_pestle', 'pestle', 3500, 1024), 'pestle_gold': ('tripo_pestle_mortar', 'pestle', 3500, 1024), 'flask_gold': ('tripo_flask_gold', 'flask', 1800, 512), 'flask': ('tripo_flask', 'flask', 1800, 512),
    'syringe': ('tripo_syringe', 'syringe', 2000, 512), 'shards': ('tripo_shard', 'shards', 500, 512)}

def islands(bm):
    bm.faces.ensure_lookup_table(); seen, out = set(), []
    for f in bm.faces:
        if f.index in seen: continue
        stack, isl = [f], []; seen.add(f.index)
        while stack:
            g = stack.pop(); isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen: seen.add(h.index); stack.append(h)
        out.append(isl)
    return out

def pca(ob):
    P = np.array([v.co[:] for v in ob.data.vertices]); c = P.mean(0); w, v = np.linalg.eigh(np.cov((P - c).T)); return c, w, v   # ascending eigenvalues

def rotate_axis_to_z(ob, axis):
    """rotate the mesh so `axis` (unit) becomes +Z"""
    a = Vector(axis).normalized(); q = a.rotation_difference(Vector((0, 0, 1))); ob.data.transform(q.to_matrix().to_4x4()); ob.data.update()

def bounds(ob):
    P = np.array([v.co[:] for v in ob.data.vertices]); return P.min(0), P.max(0), P

def decimate(ob, target):
    n0 = len(ob.data.polygons)
    bpy.context.view_layer.objects.active = ob
    if n0 > target:
        mod = ob.modifiers.new('dec', 'DECIMATE'); mod.ratio = target / n0; mod.use_collapse_triangulate = True; bpy.ops.object.modifier_apply(modifier=mod.name)
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(ob.data); bm.free()
    for p in ob.data.polygons: p.use_smooth = True
    return n0

def texture(ob, px, td, tag):
    mat = ob.data.materials[0]; nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); img = None
    for l in nt.links:
        if l.to_node == bsdf and l.to_socket.name == 'Base Color' and l.from_node.type == 'TEX_IMAGE': img = l.from_node.image
    for l in list(nt.links):
        if l.to_node == bsdf and l.to_socket.name in ('Metallic', 'Roughness', 'Normal'): nt.links.remove(l)
    for n in list(nt.nodes):
        if n.type in ('NORMAL_MAP', 'SEPARATE_COLOR', 'SEPRGB') or (n.type == 'TEX_IMAGE' and n.image is not img): nt.nodes.remove(n)
    if img:
        src = os.path.join(td, tag + '_src.png'); img.filepath_raw = src; img.file_format = 'PNG'; img.save()
        dst = os.path.join(td, tag + '_col.png'); Image.open(src).convert('RGB').resize((px, px), Image.LANCZOS).save(dst)
        [n for n in nt.nodes if n.type == 'TEX_IMAGE'][0].image = bpy.data.images.load(dst)
    mat.name = 'M_' + tag
    return mat

def load(name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(RAW, 'pharm_' + name + '.glb'))
    new = [o for o in bpy.context.scene.objects if o not in before]; meshes = [o for o in new if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o.type != 'MESH' and o.name in bpy.data.objects: bpy.data.objects.remove(o)
    return ob

def drop_small(ob, keep=0.01):
    bm = bmesh.new(); bm.from_mesh(ob.data); isl = islands(bm); big = max(len(i) for i in isl)
    drop = [f for i in isl if len(i) < big * keep for f in i]
    if drop: bmesh.ops.delete(bm, geom=drop, context='FACES')
    bm.to_mesh(ob.data); bm.free(); return len(isl)

def fit(ob, kind):
    if kind in ('pestle', 'syringe'):
        c, w, v = pca(ob); rotate_axis_to_z(ob, v[:, 2])                 # longest axis -> +Z
        lo, hi, P = bounds(ob); L = hi[2] - lo[2]
        # thickness of the two ends (mean radius of the lowest / highest 22 %)
        rad = lambda sel: float(np.hypot(P[sel, 0] - P[:, 0].mean(), P[sel, 1] - P[:, 1].mean()).mean())
        r_lo, r_hi = rad(P[:, 2] < lo[2] + 0.22 * L), rad(P[:, 2] > hi[2] - 0.22 * L)
        flip = (r_hi > r_lo) if kind == 'pestle' else False              # pestle: the thick head goes down
        if kind == 'syringe':                                            # needle = the thin tip: fewest points far from the axis near that end
            tip_lo, tip_hi = rad(P[:, 2] < lo[2] + 0.08 * L), rad(P[:, 2] > hi[2] - 0.08 * L); flip = tip_lo < tip_hi
        if flip: ob.data.transform(Matrix.Rotation(math.pi, 4, 'X'))
        lo, hi, P = bounds(ob); s = 1.0 / (hi[2] - lo[2])
        ob.data.transform(Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))); ob.data.transform(Matrix.Scale(s, 4))
    elif kind == 'flask':
        lo, hi, P = bounds(ob); s = 0.36 / (hi[2] - lo[2])
        ob.data.transform(Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))); ob.data.transform(Matrix.Scale(s, 4))
    ob.data.update()

def split_shards(ob, td):
    """one Tripo model of several chunks -> separate objects (loose parts), the 6 - 10 biggest, flattened axis up, radius ~1"""
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0008); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
    parts = sorted([o for o in bpy.context.selected_objects if o.type == 'MESH'], key=lambda o: -len(o.data.polygons))
    big = len(parts[0].data.polygons); keep = [o for o in parts if len(o.data.polygons) >= big * 0.12][:10]
    for o in parts:
        if o not in keep: bpy.data.objects.remove(o)
    out = []
    for i, o in enumerate(keep):
        decimate(o, SPEC['shards'][2]); c, w, v = pca(o); rotate_axis_to_z(o, v[:, 0])        # thinnest axis -> up
        lo, hi, P = bounds(o); r = max(hi[0] - lo[0], hi[1] - lo[1]) / 2
        o.data.transform(Matrix.Translation(tuple(-(lo + hi) / 2))); o.data.transform(Matrix.Scale(1.0 / r, 4)); o.data.update(); o.name = o.data.name = 'tripo_shard_%d' % i; out.append(o)
    return out

def main():
    names = sys.argv[1:] or ['pestle_only', 'flask_gold', 'shards']   # 게임이 쓰는 것만 (flask·syringe·pestle_gold 초안은 품질·모양 때문에 제외)
    bpy.ops.wm.read_factory_settings(use_empty=True); td = tempfile.mkdtemp(); obs = []; info = {}
    for n in names:
        out, kind, target, px = SPEC[n]; ob = load(n); nisl = drop_small(ob, 0.01 if kind != 'shards' else 0.05); mat = texture(ob, px, td, out)
        if kind == 'shards':
            parts = split_shards(ob, td); obs += parts; info[out] = {'parts': len(parts), 'tris': [len(p.data.polygons) for p in parts], 'islands': nisl}
        else:
            n0 = decimate(ob, target); fit(ob, kind); ob.name = ob.data.name = out; obs.append(ob); lo, hi, P = bounds(ob)
            info[out] = {'tris': [n0, len(ob.data.polygons)], 'size': [round(float(x), 3) for x in (hi - lo)], 'islands': nisl}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.location = (0, 0, 0); o.select_set(True)
    glb = os.path.join(td, 'fx_pharm_tripo.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=88, export_yup=True, export_apply=True,
                              export_normals=True, export_tangents=False, export_animations=False)
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'models': sorted(o.name for o in obs)}, open(os.path.join(OUT, 'fx_pharm_tripo.glb.json'), 'w'))
    for i, o in enumerate(obs): o.location.x = i * 1.5
    os.makedirs(SRC, exist_ok=True); bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_pharm_tripo.blend'), compress=True)
    print(json.dumps(info), len(raw) // 1024, 'KB', flush=True)

if __name__ == '__main__':
    main()
