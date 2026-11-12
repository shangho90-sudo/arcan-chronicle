"""모든 워프가 양쪽으로 이어지는지: 각 존의 portal → 대상 존에 그 spawn이 있고, 대상 존에도 돌아오는 portal이 있는지.
모든 존(마을·필드)의 워프가 대상 존의 세계 지도 방향 쪽에 있는지도 봄(60° 넘게 어긋나면 실패). Usage: python3 tools/world/check_warps.py [-v]"""
import json, math, os
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'data')
Z = {}
for z in json.load(open(os.path.join(D, 'zones.json')))['zones']:
    Z[z['id']] = dict(z, **json.load(open(os.path.join(D, z['file'])))) if z.get('file') else z
import sys
LIMIT = 60.0; VERBOSE = '-v' in sys.argv      # -v: 모든 워프의 방향 차이를 출력
bad = 0; n = 0; off = 0; rows = []
for zid, z in Z.items():
    for p in z.get('portals', []):
        n += 1; t = Z.get(p['targetZone'])
        if not t: print('!!', zid, p['id'], 'no zone', p['targetZone']); bad += 1; continue
        if not any(s['id'] == p['targetSpawn'] for s in t['spawns']): print('!!', zid, p['id'], '->', p['targetZone'], 'missing spawn', p['targetSpawn']); bad += 1
        if not any(q['targetZone'] == zid for q in t.get('portals', [])): print('!!', zid, p['id'], '->', p['targetZone'], '편도 (돌아오는 워프 없음)')
        if z.get('map') and t.get('map') and tuple(z['map']) != tuple(t['map']):
            # 지도 방향(지도 y는 남쪽으로 커짐, 게임 z는 북쪽으로 커짐)과 워프가 존 가운데에서 놓인 방향의 차이(도)
            dx, dz = t['map'][0] - z['map'][0], -(t['map'][1] - z['map'][1]); b = z['bounds']; cx, cz = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
            px, pz = p['pos'][0] - cx, p['pos'][1] - cz
            cos = (dx * px + dz * pz) / (math.hypot(dx, dz) * math.hypot(px, pz) + 1e-9); err = math.degrees(math.acos(max(-1, min(1, cos))))
            rows.append((err, zid, p['targetZone'], dx / math.hypot(dx, dz), dz / math.hypot(dx, dz), px, pz))
            if err > LIMIT: bad += 1; off += 1
rows.sort(reverse=True)
for err, zid, tz, dx, dz, px, pz in rows:
    if VERBOSE or err > LIMIT: print('  %-20s → %-20s 지도 방향 (%+.2f, %+.2f)  워프 (%+.0f, %+.0f)  어긋남 %3.0f°%s' % (zid, tz, dx, dz, px, pz, err, '' if err <= LIMIT else '   <-- 방향 어긋남'))
print('방향 검사 %d개, %d° 넘게 어긋남 %d개, 가장 큰 어긋남 %.0f°, 평균 %.0f°' % (len(rows), LIMIT, off, rows[0][0] if rows else 0, sum(r[0] for r in rows) / max(1, len(rows))))
print('portals', n, 'bad', bad); sys.exit(1 if bad else 0)
