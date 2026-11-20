"""pixelaudit.js 전/후 캡처를 나란히 붙인 비교표 (2026-11-20).
Usage: python3 tools/browser-tests/pixelsheet.py [DIR=/tmp/pixel] [scene …]  ->  DIR/cmp_<size>_<scene>.png (왼쪽 before, 오른쪽 after)
"""
import os, sys, glob
from PIL import Image, ImageDraw
D = os.environ.get('DIR', '/tmp/pixel')
want = set(sys.argv[1:])
for b in sorted(glob.glob(os.path.join(D, 'before_*.png'))):
    a = b.replace('before_', 'after_')
    name = os.path.basename(b)[7:-4]
    if not os.path.exists(a) or (want and name.split('_', 1)[1] not in want): continue
    A, B = Image.open(b).convert('RGB'), Image.open(a).convert('RGB')
    k = min(1.0, 900 / max(A.width, A.height)); A = A.resize((int(A.width * k), int(A.height * k))); B = B.resize(A.size)
    S = Image.new('RGB', (A.width * 2 + 12, A.height + 28), (24, 24, 30)); S.paste(A, (0, 28)); S.paste(B, (A.width + 12, 28))
    d = ImageDraw.Draw(S); d.text((8, 8), 'before ' + name, fill=(255, 220, 160)); d.text((A.width + 20, 8), 'after', fill=(160, 230, 255))
    S.save(os.path.join(D, 'cmp_' + name + '.png')); print('cmp_' + name)
