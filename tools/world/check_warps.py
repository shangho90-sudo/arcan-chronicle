"""모든 워프가 양쪽으로 이어지는지: 각 존의 portal → 대상 존에 그 spawn이 있고, 대상 존에도 돌아오는 portal이 있는지.
마을은 워프가 이웃 필드의 지도 방향 쪽 성벽에 있는지도 봄. Usage: python3 tools/world/check_warps.py"""
import json, math, os
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'data')
Z = {}
for z in json.load(open(os.path.join(D, 'zones.json')))['zones']:
    Z[z['id']] = dict(z, **json.load(open(os.path.join(D, z['file'])))) if z.get('file') else z
bad = 0; n = 0
for zid, z in Z.items():
    for p in z.get('portals', []):
        n += 1; t = Z.get(p['targetZone'])
        if not t: print('!!', zid, p['id'], 'no zone', p['targetZone']); bad += 1; continue
        if not any(s['id'] == p['targetSpawn'] for s in t['spawns']): print('!!', zid, p['id'], '->', p['targetZone'], 'missing spawn', p['targetSpawn']); bad += 1
        if not any(q['targetZone'] == zid for q in t.get('portals', [])): print('!!', zid, p['id'], '->', p['targetZone'], '편도 (돌아오는 워프 없음)')
        if 'town3d' in z and z.get('map') and t.get('map'):
            dx, dz = t['map'][0] - z['map'][0], -(t['map'][1] - z['map'][1]); b = z['bounds']; cx, cz = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
            px, pz = p['pos'][0] - cx, p['pos'][1] - cz
            cos = (dx * px + dz * pz) / (math.hypot(dx, dz) * math.hypot(px, pz) + 1e-9)
            print('  %-16s %-22s 지도 방향 (%+.2f, %+.2f)  워프 (%+.0f, %+.0f)  cos %.2f%s' % (zid, p['targetZone'], dx / math.hypot(dx, dz), dz / math.hypot(dx, dz), px, pz, cos, '' if cos > 0.5 else '   <-- 방향 어긋남'))
            if cos <= 0.5: bad += 1
print('portals', n, 'bad', bad)
