"""Blender exports -> game assets.
  * tools/blender/out/<name>.glb  -> assets/forest/bl/<name>.glb.json  (base64 wrapper: the artifact host refuses binaries)
  * shared textures tools/blender/tex/*.png -> assets/forest/bl/tex/ (opaque ones as JPEG to keep downloads small)
  * assets/forest/bl/manifest.json: per model triangle count, materials, bounding size, file size
Usage: python3 tools/blender/wrap.py            (모두 — tools/blender/out·tex가 전부 있어야 함)
       python3 tools/blender/wrap.py 이름…     (그 모델의 LOD만 감싸고 manifest.json에 합침; 텍스처는 그대로 — 2026-11-14)"""
import os, json, base64, struct, glob
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
OUT = os.path.join(ROOT, 'assets', 'forest', 'bl'); os.makedirs(os.path.join(OUT, 'tex'), exist_ok=True)
import sys; sys.path.insert(0, HERE); from texmap import TEXMAP

def read_glb(path):
    b = open(path, 'rb').read(); off = 12; ch = []
    while off < len(b):
        ln, ty = struct.unpack('<II', b[off:off + 8]); ch.append((ty, b[off + 8:off + 8 + ln])); off += 8 + ln
    return json.loads(ch[0][1]), b

def info(path):
    j, b = read_glb(path); tris = 0; mins = [1e9] * 3; maxs = [-1e9] * 3; attrs = set()
    for m in j['meshes']:
        for p in m['primitives']:
            tris += j['accessors'][p['indices']]['count'] // 3; attrs |= set(p['attributes'])
            a = j['accessors'][p['attributes']['POSITION']]
            mins = [min(x, y) for x, y in zip(mins, a['min'])]; maxs = [max(x, y) for x, y in zip(maxs, a['max'])]
    return dict(tris=tris, materials=[m['name'] for m in j.get('materials', [])], size=[round(maxs[i] - mins[i], 3) for i in range(3)],
                attrs=sorted(attrs), bytes=len(b))

def main():
    man = {}
    for g in sorted(glob.glob(os.path.join(HERE, 'out', '*.glb'))):
        n = os.path.basename(g)[:-4]; raw = open(g, 'rb').read()
        man[n] = info(g)
        if n.endswith('_l0'): continue                       # high-detail LOD stays in tools/blender/out (renders / previews only)
        json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(OUT, n + '.glb.json'), 'w'))
    used = {}
    for k, v in TEXMAP.items():
        src = os.path.join(HERE, 'tex', v['tex']); im = Image.open(src)
        if v.get('alpha'): dst = v['tex']; im.save(os.path.join(OUT, 'tex', dst), optimize=True)
        else:
            dst = v['tex'].replace('.png', '.jpg') if not v['tex'].startswith('g_') else v['tex']
            if v['tex'].startswith('g_'): continue
            im.convert('RGB').save(os.path.join(OUT, 'tex', dst), quality=88)
        used[k] = dict(v, file=dst)
    json.dump({'models': man, 'materials': used}, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
    print(len(man), 'models', len(used), 'materials')

def only(names):
    mf = os.path.join(OUT, 'manifest.json'); M = json.load(open(mf))
    for n in names:
        for suf in ('_l0', '', '_l2', '_lo'):
            g = os.path.join(HERE, 'out', n + suf + '.glb')
            if not os.path.exists(g): raise SystemExit('missing ' + g)
            M['models'][n + suf] = info(g)
            if suf != '_l0': json.dump({'b64': base64.b64encode(open(g, 'rb').read()).decode()}, open(os.path.join(OUT, n + suf + '.glb.json'), 'w'))
    M['models'] = dict(sorted(M['models'].items())); json.dump(M, open(mf, 'w'), indent=1); print('wrapped', names)

if __name__ == '__main__':
    if len(sys.argv) > 1: only(sys.argv[1:])
    else: main()
