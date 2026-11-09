"""Tripo 정적 캐릭터 GLB → 마을 NPC 모델 (assets/models/npc_<name>.json + .jpg, js/model.js NPC_MODELS 형식)

Tripo 크레딧이 모자라 자동 리깅(animate_rig)을 못 할 때 쓰는 길: NPC는 원래 서 있는 자세 그대로 숨쉬기·고개
돌리기 정도만 하므로(js/model.js npcIdle — Tripo 리그 NPC도 해당 뼈 이름이 없어 사실상 정지), 뼈 하나(Root)에
모든 정점을 묶은 정적 모델로도 같은 방식으로 보이고 움직입니다.

  1) Blender(bpy 모듈): 가져오기 → 합치기 → 떨어진 작은 조각 제거 → 삼각형 줄이기(TARGET, 기본 12000) → 이음매
     정리·부드러운 음영 → 발바닥을 0에 맞추고 가운데로 → 기본색 텍스처만 1024 px(손그림 느낌 처리, 무광)
  2) 정점·UV·텍스처를 glb_to_model.py 와 같은 좌표(-90° 회전)로 json 저장

Usage: python3 tools/npcs/static_npc.py <in.glb> <name>     (-> assets/models/npc_<name>.json / .jpg)"""
import base64, io, json, math, os, sys, tempfile
import numpy as np
import bpy, bmesh
from PIL import Image, ImageEnhance, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, '..', '..', 'assets', 'models')
TARGET = int(os.environ.get('TARGET', '12000'))

def clean(src):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
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
    n0 = len(ob.data.polygons)
    mod = ob.modifiers.new('dec', 'DECIMATE'); mod.decimate_type = 'COLLAPSE'; mod.ratio = min(1.0, TARGET / max(1, n0)); mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0005)
    bpy.ops.mesh.quads_convert_to_tris(); bpy.ops.object.mode_set(mode='OBJECT')
    vs = [ob.matrix_world @ v.co for v in ob.data.vertices]
    minz = min(v.z for v in vs); cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2; cy = (min(v.y for v in vs) + max(v.y for v in vs)) / 2
    for v in ob.data.vertices: v.co.x -= cx; v.co.y -= cy; v.co.z -= minz
    # base colour texture
    mat = ob.data.materials[0]; nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); img = None
    for l in nt.links:
        if l.to_node == bsdf and l.to_socket.name == 'Base Color' and l.from_node.type == 'TEX_IMAGE': img = l.from_node.image
    td = tempfile.mkdtemp(); src_png = os.path.join(td, 'c.png'); img.filepath_raw = src_png; img.file_format = 'PNG'; img.save()
    im = Image.open(src_png).convert('RGB').resize((1024, 1024), Image.LANCZOS)
    im = im.filter(ImageFilter.ModeFilter(5)).filter(ImageFilter.SMOOTH); im = ImageEnhance.Color(im).enhance(1.1)
    # mesh arrays (Blender Z-up -> glTF Y-up: (x, z, -y))
    me = ob.data; uvl = me.uv_layers.active.data
    P = np.array([(v.co.x, v.co.z, -v.co.y) for v in me.vertices], np.float64)
    tri, uv = [], []
    for p in me.polygons:
        assert len(p.vertices) == 3
        for li in p.loop_indices: tri.append(me.loops[li].vertex_index); u = uvl[li].uv; uv.append((u[0], u[1]))
    return P, np.array(tri, np.int64), np.array(uv, np.float32), im, n0

def convert(src, name):
    P, tri, uv, im, n0 = clean(src)
    Ry = np.array([[0, 0, -1], [0, 1, 0], [1, 0, 0]], np.float64)        # same -90 deg yaw as tools/models/glb_to_model.py
    W = (Ry @ P.T).T.astype(np.float32)
    n = len(W); si = np.zeros((n, 4), np.float32); sw = np.zeros((n, 4), np.float32); sw[:, 0] = 1
    e = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
    meta = dict(name='npc_' + name, bones=[dict(name='Root', parent=-1, bind=np.eye(4).flatten().tolist())], verts=int(n), tris=int(len(tri) // 3),
                min=W.min(0).tolist(), max=W.max(0).tolist(), unweighted=0, pos=e(W), tri=e(tri.astype(np.uint32)), uv=e(uv), si=e(si), sw=e(sw))
    json.dump(meta, open(os.path.join(OUT, 'npc_' + name + '.json'), 'w'))
    im.save(os.path.join(OUT, 'npc_' + name + '.jpg'), quality=88)
    print(name, n0, '->', len(tri) // 3, 'tris', 'height', round(float(W[:, 1].max() - W[:, 1].min()), 3))

if __name__ == '__main__': convert(sys.argv[1], sys.argv[2])
