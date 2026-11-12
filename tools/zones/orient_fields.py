"""손으로 만든 필드의 워프를 세계 지도 방향에 맞춤 (한 번만 실행, 존에 "oriented" 표시).

  python3 tools/zones/orient_fields.py            # 무엇을 바꿀지만 출력
  python3 tools/zones/orient_fields.py --write    # zones.json + assets/zone_<id>.json 다시 씀

  * forest          : 존 전체를 가운데 기준 180° 돌림 (마을 = 남동, 안개 골짜기 = 북서, 독버섯 군락지 = 남서)
  * mushroom_grove  : 180° 돌림 (숲으로 가는 워프가 동쪽)
  * mist_valley     : +90° 돌림 (숲 = 남동), 서리 고원 워프는 북쪽 가장자리로 옮김, 바위산 고갯길 워프는 지우고
                      world.py link_existing이 지도 방향(서쪽)에 다시 만듦
  * frost_highland  : 용의 유적 워프만 동쪽 가장자리로 옮김
  * dragon_ruins    : 아르칸 마을로 가는 편도 워프만 남쪽 가장자리로 옮김

돌린 뒤에는 `tools/forest/layout.py forest|mushroom_grove --write`와 `tools/zones/fill_fields.py --write`를 다시 돌리면
안 됨(돌리기 전 좌표로 배치를 다시 만듦). 그 뒤 `python3 tools/world/world.py --write` → story.py → gear.py.
"""
import json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from scale_fields import build_mesh, seg_dist, ROOT, ZPATH

raw = open(ZPATH).read(); zones = json.loads(raw)
def zone(i): return next(z for z in zones['zones'] if z['id'] == i)
R2 = lambda v: round(v, 2)

def transform(Z, kind):
    b = Z['bounds']; cx, cz = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
    if kind == 180:
        P = lambda x, z: (R2(2 * cx - x), R2(2 * cz - z)); R = lambda r: (r + 180) % 360
        AX = {'+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z', '': ''}
    elif kind == 90:      # (x, z) -> (-z, x) about the centre; headings (sin r, cos r) turn by -90
        P = lambda x, z: (R2(cx - (z - cz)), R2(cz + (x - cx))); R = lambda r: (r - 90) % 360
        AX = {'+x': '+z', '+z': '-x', '-x': '-z', '-z': '+x', '': ''}
    else: raise ValueError(kind)
    pts = lambda q: [v for i in range(0, len(q), 2) for v in P(q[i], q[i + 1])]
    def rect(r):
        (a, b_), (c, d) = P(r[0], r[1]), P(r[2], r[3]); return [min(a, c), min(b_, d), max(a, c), max(b_, d)]
    Z['bounds'] = rect(Z['bounds'])
    for s in Z['spawns']: s['pos'] = list(P(*s['pos'])); s['rot'] = R(s.get('rot', 0))
    for p in Z['props']: p['pos'] = list(P(*p['pos'])); p['rot'] = R(p.get('rot', 0))
    for k in ('npcs', 'buildings'):
        for p in Z.get(k, []):
            if 'pos' in p: p['pos'] = list(P(*p['pos']))
            if 'rot' in p: p['rot'] = R(p['rot'])
    for p in Z['portals']: p['pos'] = list(P(*p['pos']))
    for p in Z['patches']: p['pos'] = pts(p['pos'])
    for m in Z['monsters']: m['pos'] = list(P(*m['pos']))
    for h in Z.get('heights', []):
        h['rect'] = rect(h['rect'])
        if h['kind'] == 'ramp': h['axis'] = AX[h.get('axis') or '-z']
    B = Z.get('boss') or {}
    for k in ('center', 'gate', 'bossPos'):
        if B.get(k): B[k] = list(P(*B[k]))

def move_portal(Z, pid, pos, path, width, tex, spawn=None, sign=None, trim=None):
    """portal -> pos, its arrival spawn -> spawn (id, pos, rot), a new path patch, the nearest signpost -> sign (pos, rot);
    trim = (patch index, points to drop from the end) shortens the old path that led to the old corner."""
    p = next(q for q in Z['portals'] if q['id'] == pid); old = list(p['pos']); p['pos'] = [R2(pos[0]), R2(pos[1])]
    if spawn:
        s = next(q for q in Z['spawns'] if q['id'] == spawn[0]); s['pos'] = list(spawn[1]); s['rot'] = spawn[2]
    if trim: q = Z['patches'][trim[0]]; q['pos'] = q['pos'][:-2 * trim[1]]
    Z['patches'].append(dict(tex=tex, shape='path', pos=[float(v) for xz in path for v in xz], radius=0, width=width))
    if sign:
        sp = min((q for q in Z['props'] if q['type'] == 'signpost' and not q.get('text')), key=lambda q: math.hypot(q['pos'][0] - old[0], q['pos'][1] - old[1]))
        sp['pos'] = list(sign[0]); sp['rot'] = sign[1]
    def near(q):
        x, z = q['pos']
        if math.hypot(x - pos[0], z - pos[1]) < 6.5 or (spawn and math.hypot(x - spawn[1][0], z - spawn[1][1]) < 5.0): return True
        return any(seg_dist(x, z, path[i], path[i + 1]) < width / 2 + 2.2 for i in range(len(path) - 1))
    n0 = len(Z['props']); Z['props'] = [q for q in Z['props'] if q['type'] == 'signpost' or not near(q)]
    print('   ', Z['id'], pid, old, '->', p['pos'], 'props cleared', n0 - len(Z['props']))

def main():
    done = []
    F = zone('forest')
    if 'oriented' not in F:
        transform(F, 180); F['oriented'] = 180; done.append('forest')
    G = zone('mushroom_grove')
    if 'oriented' not in G:
        transform(G, 180); G['oriented'] = 180; done.append('mushroom_grove')
    M = zone('mist_valley')
    if 'oriented' not in M:
        # the auto-made link to the Baltern pass goes back to world.py (it puts it on the map side of the turned zone)
        bp = next((p for p in M['portals'] if p['id'] == 'to_baltern_pass'), None)
        if bp:
            M['patches'] = [q for q in M['patches'] if not (q['shape'] == 'path' and q['pos'][:2] == bp['pos'])]
            M['portals'].remove(bp); M['spawns'] = [s for s in M['spawns'] if s['id'] != 'from_baltern_pass']
        transform(M, 90)
        move_portal(M, 'to_highland', (12.0, 73.0), [(-4.0, 56.0), (4.0, 66.0), (12.0, 72.0)], 3.25, 'dirt',
                    spawn=('from_highland', [10.0, 66.5], 200.0), sign=([15.0, 67.5], 180), trim=(0, 1))
        M['oriented'] = 90; done.append('mist_valley')
    H = zone('frost_highland')
    if 'oriented' not in H:
        move_portal(H, 'to_ruins', (73.0, 4.0), [(40.0, -20.0), (56.0, -8.0), (67.0, 2.0), (72.0, 4.0)], 3.0, 'cobble',
                    spawn=('from_ruins', [66.5, 2.0], 250.0), sign=([67.0, 7.0], 270), trim=(0, 1))
        H['oriented'] = 0; done.append('frost_highland')
    Dr = zone('dragon_ruins')
    if 'oriented' not in Dr:
        move_portal(Dr, 'to_town', (-10.0, -73.0), [(-28.0, -52.0), (-16.0, -64.0), (-10.0, -72.0)], 3.25, 'cobble')
        Dr['oriented'] = 0; done.append('dragon_ruins')
    # 숲을 돌린 뒤 버섯 집이 워프 앞(카메라 쪽)에 와서 워프를 가림 -> 워프 뒤 오른쪽(화면 위쪽)으로 옮기고 문을 워프 쪽으로,
    # 둘레 꽃·덤불(skirt)도 같이, 새 자리 나무는 치움. 글씨 표지판은 글씨가 카메라를 보게 원래 각도(45)로.
    lm = next((q for q in F['props'] if q['type'] == 'landmark'), None)
    if lm and lm['pos'] == [-16.0, -47.6]:
        new = (-10.2, -38.4); dx, dz = new[0] - lm['pos'][0], new[1] - lm['pos'][1]
        for q in F['props']:
            if q.get('skirt'): q['pos'] = [R2(q['pos'][0] + dx), R2(q['pos'][1] + dz)]
        F['props'] = [q for q in F['props'] if q is lm or q.get('skirt') or q['type'] == 'signpost' or math.hypot(q['pos'][0] - new[0], q['pos'][1] - new[1]) > 4.2]
        lm['pos'] = list(new); lm['rot'] = 150
        for q in F['props']:
            if q['type'] == 'signpost' and q.get('text'): q['rot'] = 45
        if 'forest' not in done: done.append('forest')
    print('oriented:', done or 'nothing (already done)')
    if '--write' in sys.argv and done:
        open(ZPATH, 'w').write(json.dumps(zones, ensure_ascii=False, indent=1) + ('\n' if raw.endswith('\n') else ''))
        for zid in done:
            json.dump(build_mesh(zone(zid)), open(os.path.join(ROOT, 'assets', f'zone_{zid}.json'), 'w'), separators=(',', ':'))
        print('wrote')

if __name__ == '__main__': main()
