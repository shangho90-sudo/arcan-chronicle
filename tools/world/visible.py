"""마을에서 NPC가 게임 카메라에 가려지는지 계산 (towns.py·story.py·check_visible.py가 같이 씀).

카메라는 고정 방향(js/render.js CAM: yaw 45°, pitch 44°)이라, 어떤 물체가 NPC보다 카메라 쪽(-x, -z 대각선)에 있고
충분히 높으면 NPC를 가린다. 가리는 물체 = (x, z, 반지름 R, 높이 H, 종류, 지울 수 있는지).
"""
import json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
YAW, PITCH = 45.0, 44.0
CX, CZ = math.sin(math.radians(YAW)), math.cos(math.radians(YAW))     # ground direction camera -> scene
RISE = math.tan(math.radians(PITCH))                                   # sight line rises this much per metre towards the camera
CHEST = 0.9                                                            # hidden = the NPC's chest height is covered
HOUSE_H, STALL_H = 7.0, 2.8
_SIZES = None

def model_size(name):
    """Blender 소품 크기 (가로, 높이, 세로)"""
    global _SIZES
    if _SIZES is None:
        try: _SIZES = {k: v.get('size') for k, v in json.load(open(os.path.join(ROOT, 'assets/forest/bl/manifest.json')))['models'].items()}
        except Exception: _SIZES = {}
    return _SIZES.get(name) or [1.0, 1.0, 1.0]

def _box(out, x, z, w, d, heading, h, kind):
    ww, dd = (w, d) if int(round(heading)) % 180 == 0 else (d, w)
    nx, nz = max(2, int(ww / 1.6) + 1), max(2, int(dd / 1.6) + 1)
    for i in range(nx):
        for j in range(nz):
            out.append((x - ww / 2 + i * ww / (nx - 1), z - dd / 2 + j * dd / (nz - 1), 1.0, h, kind, False))

def occluders(t3):
    """town3d 사양 → [(x, z, R, H, 종류, 지울 수 있음)]"""
    out = []
    for hs in t3.get('houses') or []: _box(out, hs['pos'][0], hs['pos'][1], hs.get('w', 8), hs.get('d', 6), hs.get('h', 0), HOUSE_H, 'house')
    for m in t3.get('models') or []:
        s = m.get('size') or [4, 4, 4]
        if s[2] > 1.4: _box(out, m['pos'][0], m['pos'][1], s[0] * 0.9, s[1] * 0.9, m.get('h', 0), s[2] * 0.85, 'model')
    for w in t3.get('walls') or []:
        (ax, az), (bx, bz) = w['a'], w['b']; L = math.hypot(bx - ax, bz - az); n = max(1, int(L / 1.5))
        for i in range(n + 1): out.append((ax + (bx - ax) * i / n, az + (bz - az) * i / n, w.get('t', 1.6) / 2 + 0.2, w['h'], 'wall', False))
    for tw in t3.get('towers') or []: out.append((tw['pos'][0], tw['pos'][1], tw['r'], tw['h'], 'tower', False))
    for g in t3.get('gates') or []:
        for p in g.get('towers') or []: out.append((p[0], p[1], g.get('tr', 2.2), g.get('th', 5), 'tower', False))
    for d in t3.get('decor') or []:
        k = d.get('type')
        if k == 'stall': _box(out, d['pos'][0], d['pos'][1], d.get('w', 3.4), d.get('d', 2.0), d.get('h', 0), STALL_H, 'stall')
        elif k == 'well': out.append((d['pos'][0], d['pos'][1], 1.4, 2.6, 'well', False))
        elif k == 'cart': out.append((d['pos'][0], d['pos'][1], 1.4, 1.6, 'cart', False))
    for i, b in enumerate(t3.get('blprops') or []):
        m = b.get('model', ''); s = model_size(m); sc = b.get('scale', 1.0)
        if m.startswith('tree'): out.append((b['pos'][0], b['pos'][1], max(s[0], s[2]) / 2 * sc * 0.9, s[1] * sc * 0.95, 'tree', i))
        elif m.startswith('shrub') or m == 'town_planter': out.append((b['pos'][0], b['pos'][1], max(s[0], s[2]) / 2 * sc, s[1] * sc, 'bush', i))
        elif m == 'town_banner': out.append((b['pos'][0], b['pos'][1], 0.6, s[1] * sc, 'banner', i))
    return out

def blockers(occ, x, z):
    """(x, z)에 선 NPC를 가리는 물체들"""
    hit = []
    for o in occ:
        vx, vz = x - o[0], z - o[1]
        along = vx * CX + vz * CZ                      # how far behind the object the NPC stands (away from the camera)
        if along < -o[2] * 0.4: continue
        if abs(vx * CZ - vz * CX) > o[2] + 0.45: continue
        if along * RISE + CHEST < o[3] + o[2] * 0.5: hit.append(o)
    return hit

def hidden(occ, x, z): return bool(blockers(occ, x, z))
