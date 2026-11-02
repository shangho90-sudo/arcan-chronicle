"""Tripo VFX meshes (text_to_model, untextured, 2026-11-02) -> assets/fx3d/<name>.json
gltfpack simplify (-si 0.02) first, then: one mesh, centred, longest axis scaled to 1, positions + normals + indices
as base64 (the shader colours them; no texture). Usage: python3 tools/vfx/process_vfx.py <dir with <name>_lo.glb>"""
import base64, json, os, struct, sys
import numpy as np
SRC = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/vfx3d'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'fx3d'); os.makedirs(OUT, exist_ok=True)
CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def read(path):
    b = open(path, 'rb').read(); off = 12; ch = []
    while off < len(b):
        ln, ty = struct.unpack('<II', b[off:off + 8]); ch.append(b[off + 8:off + 8 + ln]); off += 8 + ln
    return json.loads(ch[0]), ch[1]
def acc(j, bin_, i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]; dt = CT[a['componentType']]; n = NC[a['type']]
    o = v.get('byteOffset', 0) + a.get('byteOffset', 0); st = v.get('byteStride', 0) or n * np.dtype(dt).itemsize
    raw = np.frombuffer(bin_, dtype=np.uint8, count=a['count'] * st, offset=o).reshape(a['count'], st)
    return raw[:, :n * np.dtype(dt).itemsize].copy().view(dt).reshape(a['count'], n)
for name in sys.argv[2].split(',') if len(sys.argv) > 2 else ['slash', 'burst', 'shard', 'ring']:
    j, b = read(os.path.join(SRC, name + '_lo.glb'))
    P, N, I = [], [], []; base = 0
    for nd in j['nodes']:
        if 'mesh' not in nd: continue
        M = np.eye(4)
        if 'matrix' in nd: M = np.array(nd['matrix']).reshape(4, 4).T
        for pr in j['meshes'][nd['mesh']]['primitives']:
            p = acc(j, b, pr['attributes']['POSITION']).astype(np.float64); n = acc(j, b, pr['attributes']['NORMAL']).astype(np.float64)
            p = (np.c_[p, np.ones(len(p))] @ M.T)[:, :3]; n = n @ M[:3, :3].T
            idx = acc(j, b, pr['indices']).reshape(-1).astype(np.int64)
            P.append(p); N.append(n); I.append(idx + base); base += len(p)
    P = np.concatenate(P); N = np.concatenate(N); I = np.concatenate(I)
    lo, hi = P.min(0), P.max(0); c = (lo + hi) / 2; s = 1 / max(hi - lo)
    P = (P - c) * s; N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-9
    out = {'name': name, 'size': ((hi - lo) * s).round(4).tolist(), 'tris': int(len(I) // 3),
           'pos': base64.b64encode(P.astype(np.float32).tobytes()).decode(), 'nrm': base64.b64encode(N.astype(np.float32).tobytes()).decode(),
           'idx': base64.b64encode(I.astype(np.uint32).tobytes()).decode()}
    json.dump(out, open(os.path.join(OUT, name + '.json'), 'w'))
    print(name, 'verts', len(P), 'tris', out['tris'], 'size', out['size'], os.path.getsize(os.path.join(OUT, name + '.json')))
