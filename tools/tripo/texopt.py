import json, io, sys
sys.path.insert(0, '/home/claude/town3d')
from PIL import Image
from glbtool import read, write, views_of
def run(src, dst, col=1024, other=512, keep_normal=True):
    j, b = read(src); V = views_of(j, b)
    role = {}
    for m in j.get('materials', []):
        p = m.get('pbrMetallicRoughness', {})
        if 'baseColorTexture' in p: role[j['textures'][p['baseColorTexture']['index']]['source']] = 'color'
        if 'metallicRoughnessTexture' in p: role[j['textures'][p['metallicRoughnessTexture']['index']]['source']] = 'mr'
        if 'normalTexture' in m: role[j['textures'][m['normalTexture']['index']]['source']] = 'normal'
    for i, im in enumerate(j.get('images', [])):
        bv = im['bufferView']; img = Image.open(io.BytesIO(V[bv])).convert('RGB'); r = role.get(i, 'mr')
        s = col if r == 'color' else other
        img = img.resize((s, s), Image.LANCZOS); buf = io.BytesIO()
        if r == 'normal': img.save(buf, 'PNG', optimize=True); im['mimeType'] = 'image/png'
        else: img.save(buf, 'JPEG', quality=90 if r == 'color' else 85, subsampling=0 if r == 'color' else 2); im['mimeType'] = 'image/jpeg'
        V[bv] = buf.getvalue()
    write(dst, j, V)
if __name__ == '__main__': run(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1024)
