"""Rigged humanoid GLB (same 67-bone Hips/Spine/.../Right_ToesEnd skeleton as the player models) -> assets/models/<name>.json
+ <name>.jpg, the format js/model.js loads (control-point positions, triangle indices, per-corner UVs, 4 skin
influences per control point, bone world bind matrices). Space: the mesh node matrix, then a -90 deg yaw (the same
transform the original boy / girl models were converted with - checked: it reproduces boy.json exactly from its
source GLB). Base colour texture -> 1024 px JPEG.
Usage: python3 tools/models/glb_to_model.py <in.glb> <name>"""
import base64, io, json, os, sys
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import glbread
OUT = os.path.join(HERE, '..', '..', 'assets', 'models')

def convert(src, name):
    J, B, acc = glbread.load(src)
    node = next(n for n in J['nodes'] if n.get('mesh') is not None and n.get('skin') is not None)
    NM = np.array(node.get('matrix', np.eye(4).flatten().tolist())).reshape(4, 4).T
    Ry = np.eye(4); Ry[0, 0] = 0; Ry[0, 2] = -1; Ry[2, 0] = 1; Ry[2, 2] = 0
    A = Ry @ NM
    prim = J['meshes'][node['mesh']]['primitives'][0]; at = prim['attributes']
    pos = acc(at['POSITION']).astype(np.float64); uv = acc(at['TEXCOORD_0']).astype(np.float32)
    jt = acc(at['JOINTS_0']).astype(np.int64); wt = acc(at['WEIGHTS_0']).astype(np.float32); idx = acc(prim['indices']).reshape(-1).astype(np.int64)
    w = (A @ np.c_[pos, np.ones(len(pos))].T).T[:, :3].astype(np.float32)
    key = np.round(w, 6); _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1); P = w[first]; tri = inv[idx].astype(np.uint32)
    SI = jt[first].astype(np.float32); SW = wt[first]; SW = SW / np.maximum(1e-8, SW.sum(1, keepdims=True))
    UVc = uv[idx].copy(); UVc[:, 1] = 1 - UVc[:, 1]          # three.js texture origin bottom-left (matches boy.json)
    skin = J['skins'][node['skin']]; joints = skin['joints']
    ibm = acc(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
    parent = {}
    for i, n in enumerate(J['nodes']):
        for c in n.get('children', []): parent[c] = i
    bones = []
    for k, j in enumerate(joints):
        p = parent.get(j); pk = joints.index(p) if p in joints else -1
        bones.append(dict(name=J['nodes'][j]['name'], parent=pk, bind=(A @ np.linalg.inv(ibm[k])).T.flatten().tolist()))
    b64 = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
    meta = dict(name=name, bones=bones, verts=int(len(P)), tris=int(len(tri) // 3), min=P.min(0).tolist(), max=P.max(0).tolist(),
                unweighted=int((SW.sum(1) < 0.5).sum()), pos=b64(P.astype(np.float32)), tri=b64(tri), uv=b64(UVc.astype(np.float32)), si=b64(SI), sw=b64(SW.astype(np.float32)))
    json.dump(meta, open(os.path.join(OUT, name + '.json'), 'w'))
    mat = J['materials'][prim.get('material', 0)]; ti = mat['pbrMetallicRoughness']['baseColorTexture']['index']
    img = J['images'][J['textures'][ti]['source']]; v = J['bufferViews'][img['bufferView']]
    raw = B[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]
    Image.open(io.BytesIO(raw)).convert('RGB').resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, name + '.jpg'), quality=90)
    print(name, meta['verts'], 'verts', meta['tris'], 'tris', 'height', round(meta['max'][1] - meta['min'][1], 3), [b['name'] for b in bones[:3]])
    return meta

if __name__ == '__main__': convert(sys.argv[1], sys.argv[2])
