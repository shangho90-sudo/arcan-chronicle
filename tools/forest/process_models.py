"""Post-process the Tripo forest models for the game:
  1. cut away the flat 'ground patch' Tripo puts under trees/rocks (triangles lying entirely in the bottom slab),
  2. simplify with gltfpack, 3. shrink textures (colour 1024 for trees / 512 for small props),
  4. wrap as base64 JSON (the artifact host does not serve binary files) -> assets/forest/models/<name>.glb.json
Usage: python3 tools/forest/process_models.py <dir with raw .glb> """
import json, os, struct, subprocess, sys, base64, io, tempfile
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'assets', 'forest', 'models'); os.makedirs(OUT, exist_ok=True)
GLTFPACK = os.environ.get('GLTFPACK', '/tmp/meshoptimizer/gltfpack')
SRC = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/forest3d'
# name: (cut base slab as fraction of height or 0, simplify ratio, colour texture size)
# Tripo UVs are split into many islands, so normal simplification stops early: -sa (aggressive) is used,
# ratios picked by eye at game zoom (trees ~3.5k tris, small props ~2-3k)
# Aggressive simplification (-sa) wrecks the texture mapping, so the visible mesh keeps (almost) all triangles and a
# separate aggressively simplified copy '<name>_lo' (textures stripped) is made for the shadow-map pass only.
SPEC = {
    'tree_a': (0.035, 0.32, 1024), 'tree_b': (0.0, 0.35, 1024), 'tree_c': (0.03, 0.35, 1024), 'tree_d': (0.0, 0.35, 1024),
    'bush_a': (0.0, 0, 512), 'bush_b': (0.04, 0, 512), 'rock_a': (0.035, 0.35, 512), 'rock_b': (0.04, 0.35, 512),
    'stump': (0.0, 0.35, 512), 'ruin': (0.0, 0.35, 512), 'mushroom': (0.05, 0.35, 512),
}

def read(path):
    b = open(path, 'rb').read(); off = 12; ch = []
    while off < len(b):
        ln, ty = struct.unpack('<II', b[off:off + 8]); ch.append((ty, b[off + 8:off + 8 + ln])); off += 8 + ln
    return json.loads(ch[0][1]), bytearray(ch[1][1])

def write(path, j, views):
    out = bytearray()
    for i, v in enumerate(views):
        while len(out) % 4: out.append(0)
        j['bufferViews'][i]['byteOffset'] = len(out); j['bufferViews'][i]['byteLength'] = len(v); out += v
    while len(out) % 4: out.append(0)
    j['buffers'] = [{'byteLength': len(out)}]
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js); f.write(struct.pack('<II', len(out), 0x004E4942)); f.write(out)

def views_of(j, b): return [bytes(b[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]) for v in j['bufferViews']]

def acc(j, b, i, dt):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]; n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    return np.frombuffer(bytes(b[off:off + a['count'] * n * np.dtype(dt).itemsize]), dt).reshape(-1, n) if n > 1 else np.frombuffer(bytes(b[off:off + a['count'] * np.dtype(dt).itemsize]), dt)

def cut_base(src, dst, frac):
    j, b = read(src); V = views_of(j, b)
    for m in j['meshes']:
        for p in m['primitives']:
            pos = acc(j, b, p['attributes']['POSITION'], np.float32)
            ia = j['accessors'][p['indices']]; idt = {5125: np.uint32, 5123: np.uint16}[ia['componentType']]
            idx = acc(j, b, p['indices'], idt).reshape(-1, 3)
            y = pos[:, 1]; y0, y1 = y.min(), y.max(); lim = y0 + (y1 - y0) * frac
            tri_max = y[idx].max(axis=1)
            keep = idx[tri_max > lim]
            print(f'  cut {len(idx) - len(keep)} / {len(idx)} base triangles (y < {lim:.3f})')
            nb = keep.astype(idt).tobytes(); bv = ia['bufferView']
            V[bv] = nb; ia['count'] = int(keep.size); ia.pop('byteOffset', None)
    write(dst, j, V)

def shrink_textures(path, size):
    j, b = read(path); V = views_of(j, b)
    for im in j.get('images', []):
        bv = im['bufferView']; img = Image.open(io.BytesIO(V[bv])).convert('RGB').resize((size, size), Image.LANCZOS)
        buf = io.BytesIO(); img.save(buf, 'JPEG', quality=90, subsampling=0); V[bv] = buf.getvalue(); im['mimeType'] = 'image/jpeg'
    # matte, painterly: no specular sheen
    for m in j.get('materials', []):
        pb = m.setdefault('pbrMetallicRoughness', {}); pb['metallicFactor'] = 0.0; pb['roughnessFactor'] = 1.0
    write(path, j, V)

for name, (frac, si, tex) in SPEC.items():
    src = os.path.join(SRC, name + '.glb')
    if not os.path.exists(src): print('missing', src); continue
    print(name)
    with tempfile.TemporaryDirectory() as td:
        a = os.path.join(td, 'a.glb'); c = os.path.join(td, 'c.glb')
        if frac > 0: cut_base(src, a, frac)
        else: open(a, 'wb').write(open(src, 'rb').read())
        subprocess.run([GLTFPACK, '-i', a, '-o', c, '-si', '0.9', '-noq'], check=True, capture_output=True)
        shrink_textures(c, tex)
        raw = open(c, 'rb').read()
        json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(OUT, name + '.glb.json'), 'w'))
        if si > 0:
            lo = os.path.join(td, 'lo.glb')
            subprocess.run([GLTFPACK, '-i', a, '-o', lo, '-si', str(si), '-sa', '-noq'], check=True, capture_output=True)
            shrink_textures(lo, 8)
            json.dump({'b64': base64.b64encode(open(lo, 'rb').read()).decode()}, open(os.path.join(OUT, name + '_lo.glb.json'), 'w'))
            jl, _ = read(lo); print('  shadow LOD', sum(jl['accessors'][p['indices']]['count'] // 3 for m in jl['meshes'] for p in m['primitives']), 'tris')
        jj, _ = read(c); tris = sum(jj['accessors'][p['indices']]['count'] // 3 for m in jj['meshes'] for p in m['primitives'])
        print(f'  -> {tris} tris, {len(raw) // 1024} KB')
