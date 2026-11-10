# 등에 멘 무기가 몸을 뚫는지 (js/model.js BACK_MOUNT): bind 자세에서 칼을 따라 점을 찍고, 각 점 주변 3 cm(x, y)의 가장
# 뒤쪽 메시 꼭짓점이 칼보다 뒤에 있으면 칼이 몸·옷 안으로 들어간 것(cm 출력). 모든 플레이어 모델(남녀·직업 옷).
# Usage: python3 tools/anim/back_clip.py [up out dir L]   (기본값 = model.js BACK_MOUNT, 칼 길이 0.48 m)
# blade-through-body check in bind space: sample points along the back-mounted weapon; for each, the farthest-back mesh
# vertex within 3 cm (x, y) must not be behind the blade (= the blade would be inside the body / clothes)
import json, base64, struct, sys, math
import numpy as np
import os, re
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
src = open(os.path.join(ROOT, 'js', 'model.js')).read(); mm = re.search(r'BACK_MOUNT = \{ x: ([\d.]+), up: ([\d.]+), out: ([\d.]+), dir: \[([^\]]+)\]', src)
A = sys.argv[1:] or [mm.group(2), mm.group(3), mm.group(4).replace(' ', '')]
BM = dict(x=float(mm.group(1)), up=float(A[0]), out=float(A[1]), dir=[float(v) for v in A[2].split(',')], L=float(A[3]) if len(A) > 3 else 0.48)
for f, H in [('boy', 1.65), ('girl', 1.6), ('pharmacist_m', 1.65), ('pharmacist_f', 1.6), ('blacksmith_m', 1.65), ('blacksmith_f', 1.6), ('cook_f', 1.6), ('hairdresser_f', 1.6), ('artist_m', 1.65)]:
    d = json.load(open(os.path.join(ROOT, 'assets', 'models', f + '.json')))
    pos = np.frombuffer(base64.b64decode(d['pos']), dtype=np.float32).reshape(-1, 3)
    s = H / (d['max'][1] - d['min'][1]); B = {b['name']: b['bind'] for b in d['bones']}
    t = lambda n: np.array(B[n][12:15])
    ua, ch, nk = t('Right_UpperArm'), t('Chest'), t('Neck'); xw = abs(ua[0]) * 0.9
    m = (pos[:, 1] > ch[1]) & (pos[:, 1] < nk[1]) & (np.abs(pos[:, 0]) < xw); zmin = pos[m, 2].min()
    grip = np.array([ua[0] * BM['x'], ua[1] + BM['up'] / s, zmin - BM['out'] / s]); dv = np.array(BM['dir']); dv /= np.linalg.norm(dv)
    worst = 0; where = None
    for k in np.linspace(0.08, 1, 24):
        p = grip + dv * BM['L'] / s * k
        near = (np.abs(pos[:, 0] - p[0]) < 0.03 / s) & (np.abs(pos[:, 1] - p[1]) < 0.03 / s)
        if not near.any(): continue
        dz = (p[2] - pos[near, 2].min()) * s   # > 0: some vertex is behind the blade (blade inside)
        if dz > worst: worst, where = dz, round(k, 2)
    print(f'{f:14s} back z {zmin*s:+.3f} m  worst inside {worst*100:5.1f} cm at {where}')
