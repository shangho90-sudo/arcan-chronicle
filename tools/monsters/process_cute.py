"""Cute monster models (Tripo text_to_model, 2026-11-01) -> assets/creatures/cute_<name>.glb.json
gltfpack light simplify, colour texture 1024 px, matte material, base64 JSON wrap. Usage: python3 tools/monsters/process_cute.py <raw glb dir>"""
import base64, io, json, os, struct, subprocess, sys, tempfile
from PIL import Image
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'creatures')
GLTFPACK = os.environ.get('GLTFPACK', '/tmp/meshoptimizer/gltfpack')
SRC = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/cute3d'
NAMES = sys.argv[2].split(',') if len(sys.argv) > 2 else ['wolf', 'boar', 'bear', 'ram', 'toad', 'golem', 'dragon', 'boss_mushroom', 'rabbit', 'fox', 'squirrel', 'panda', 'slime']

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
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out))); f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(out), 0x004E4942)); f.write(out)
for n in NAMES:
    with tempfile.TemporaryDirectory() as td:
        c = os.path.join(td, 'c.glb')
        subprocess.run([GLTFPACK, '-i', os.path.join(SRC, n + '.glb'), '-o', c, '-si', '0.7', '-noq'], check=True, capture_output=True)
        j, b = read(c); V = [bytes(b[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]) for v in j['bufferViews']]
        for im in j.get('images', []):
            bv = im['bufferView']; img = Image.open(io.BytesIO(V[bv])).convert('RGB').resize((1024, 1024), Image.LANCZOS)
            buf = io.BytesIO(); img.save(buf, 'JPEG', quality=90, subsampling=0); V[bv] = buf.getvalue(); im['mimeType'] = 'image/jpeg'
        for m in j.get('materials', []):
            pb = m.setdefault('pbrMetallicRoughness', {}); pb['metallicFactor'] = 0.0; pb['roughnessFactor'] = 0.95
        write(c, j, V)
        raw = open(c, 'rb').read(); json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(OUT, 'cute_' + n + '.glb.json'), 'w'))
        tris = sum(j['accessors'][p['indices']]['count'] // 3 for m in j['meshes'] for p in m['primitives'])
        print(n, tris, 'tris', len(raw) // 1024, 'KB')
