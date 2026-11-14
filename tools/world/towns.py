"""마을 배치 생성기 v2 (2026-11-12 마을 리뉴얼) — tools/world/world.py가 부릅니다(직접 실행하지 않음).

마을 9곳(아르칸 마을 + 생성 마을 8곳)을 같은 규칙으로 만듭니다:
  * 크기: 두 왕도는 가로·세로 약 2.5배, 나머지는 넓이 약 3배(가로·세로 약 1.7배) — world.py TOWNS의 W, D(반 크기)
  * 성문·워프: 이웃 지역마다 성문 하나, 세계 지도에서 그 지역이 있는 쪽 성벽에. 문 밖 7 m에 워프, 문 안 5 m에 도착 지점,
    광장에서 문까지 큰길, 문 안쪽에 행선지 표지판
  * 구역: 가운데 광장 + 큰길 + 안쪽 순환로, 랜드마크 구역(Tripo 건물 `models`), 시장(노점), 공원(나무·벤치·꽃), 주거 구역(집)
  * 테마: THEMES[id] — 색(palette), 랜드마크, 장식 섞음, 나무 종류
  * NPC: 자리 힌트(plaza / market / park / gate / lm:<랜드마크> / guild …)로 트인 곳을 찾아 세움
결과는 zone 정의(dict) — blockPolys(충돌), town3d(js/town3d.js가 그림), props(Blender 소품 충돌), npcs, portals, spawns.
"""
import json, math, os, random, hashlib, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import visible

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
MANIFEST = os.path.join(ROOT, 'assets', 'town3d', 'town_manifest.json')      # tools/blender/town_assets.py가 씀: {file: [w, d, h]} (가장 긴 가로 변 = 1)
WT = 2.4          # wall thickness
OUT = 12.0        # walkable depth outside a gate (the rest outside the walls is blocked)
HW, HD = 9.4, 7.8  # house footprint

def rng_for(s): return random.Random(int(hashlib.md5(('town2:' + s).encode()).hexdigest()[:8], 16))
def yaw_to(dx, dz): return round(math.degrees(math.atan2(dx, dz)), 1)
def rect(cx, cz, w, d, h):
    a = math.radians(h); f = (math.sin(a), math.cos(a)); r = (f[1], -f[0]); pts = []
    for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        pts.append((cx + r[0] * sx * w / 2 + f[0] * sz * d / 2, cz + r[1] * sx * w / 2 + f[1] * sz * d / 2))
    return pts
def circle(cx, cz, r, n=14): return [(cx + r * math.cos(i / n * 2 * math.pi), cz + r * math.sin(i / n * 2 * math.pi)) for i in range(n)]
def seg_rect(a, b, t):
    dx, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dz) or 1; nx, nz = -dz / L * t / 2, dx / L * t / 2
    return [(a[0] + nx, a[1] + nz), (b[0] + nx, b[1] + nz), (b[0] - nx, b[1] - nz), (a[0] - nx, a[1] - nz)]
def seg_dist(px, pz, a, b):
    ax, az = a; bx, bz = b; dx, dz = bx - ax, bz - az; L = dx * dx + dz * dz
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L))
    return math.hypot(px - ax - t * dx, pz - az - t * dz)

# ---------------------------------------------------------------------------------------------------------------- themes
# palette: js/town3d.js가 재질 색에 곱함(wallstone 성벽·basestone 기단·slate 지붕·plaster 벽·pave 마당·cobble 길·grass 바깥 풀밭·wood)
# lm: (파일, 가로 크기 m, 이름, 'big' 건물 | 'prop' 조형물)   trees: 나무 모델   mix: 장식 (종류, 개수)
SIDE = {'n': (0, 1), 's': (0, -1), 'e': (1, 0), 'w': (-1, 0)}
THEMES = {
    'town': dict(title='아늑한 시작 마을', palette={}, trees=['tree_broad_a', 'tree_broad_b', 'tree_forest_round'], flowers=['flower_white', 'flower_pink', 'flower_yellow', 'flower_mixed'],
                 lm=[('town_arcan_inn', 13, '산들바람 여관', 'big'), ('town_arcan_windmill', 11, '마을 풍차', 'big'), ('town_arcan_clocktower', 5.5, '마을 종탑', 'prop'), ('town_arcan_board', 3.2, '마을 게시판', 'prop')],
                 mix=[('well', 1), ('stall', 3), ('cart', 1), ('hay', 3), ('barrels', 3), ('crates', 3), ('bench', 8), ('planter', 8), ('tree', 26), ('shrub', 26), ('flowerpatch', 22)], stalls=5, lamps=18),
    'kairion_capital': dict(centre='town_kairion_statue', title='왕국의 수도', palette=dict(wallstone='#f1ede4', basestone='#e6e2d8', slate='#4a66c8', plaster='#fbf6ea', pave='#f0eadc'), trees=['tree_broad_a', 'tree_forest_round'],
                 flowers=['flower_white', 'flower_yellow', 'flower_mixed'],
                 palace=('town_kairion_palace', 34, '카이리온 왕궁'),      # 북쪽 한가운데, 앞면 남쪽 — 성벽 밖 성채(keep) 대신 섬
                 lm=[('town_kairion_guildhall', 20, '장인 길드 회관', 'big'), ('town_kairion_academy', 17, '왕립 학술원', 'big'), ('town_kairion_clocktower', 7, '왕도 시계탑', 'prop'), ('town_kairion_statue', 6, '건국왕 기마상', 'prop')],
                 mix=[('well', 2), ('stall', 6), ('cart', 2), ('barrels', 5), ('crates', 5), ('banner', 14), ('bench', 16), ('planter', 18), ('tree', 44), ('shrub', 40), ('flowerpatch', 34)], stalls=10, lamps=30),
    'baltern': dict(centre='town_baltern_goat', title='바위산 교역 도시', palette=dict(wallstone='#c9ccd4', basestone='#b9bcc6', slate='#5c7088', plaster='#e9e6de', pave='#d9d9d6', grass='#c6d0b4'), trees=['tree_forest_tall', 'tree_broad_b'],
                 flowers=['flower_white', 'clover'], rocks=True,
                 lm=[('town_baltern_tradehall', 16, '공국 교역소', 'big'), ('town_baltern_warehouse', 13, '상단 창고', 'big'), ('town_baltern_windmill', 8, '바위산 풍차', 'prop'), ('town_baltern_goat', 5.5, '산양 분수', 'prop')],
                 mix=[('well', 1), ('stall', 4), ('cart', 4), ('barrels', 8), ('crates', 8), ('hay', 3), ('banner', 5), ('bench', 6), ('rock', 14), ('tree', 16), ('shrub', 16), ('flowerpatch', 8)], stalls=6, lamps=18),
    'lumiere': dict(centre='town_lumiere_goddess', title='신전 도시', palette=dict(wallstone='#fbfaf6', basestone='#f2f0ea', slate='#9fc4e8', plaster='#ffffff', pave='#f7f4ec', cobble='#efe9da'), trees=['tree_broad_a', 'tree_violet_round'],
                 flowers=['flower_white', 'flower_white', 'flower_pink'],
                 lm=[('town_lumiere_shrine', 14, '빛의 성소', 'big'), ('town_lumiere_pavilion', 9, '기도의 정자', 'big'), ('town_lumiere_belltower', 5.5, '새벽 종탑', 'prop'), ('town_lumiere_goddess', 5, '여신상', 'prop')],
                 mix=[('well', 1), ('stall', 2), ('banner', 10), ('bench', 12), ('planter', 16), ('tree', 20), ('shrub', 22), ('flowerpatch', 30)], stalls=3, lamps=20),
    'gravel': dict(title='변경 광산 마을', palette=dict(wallstone='#c8b49a', basestone='#b39c80', slate='#a8523c', plaster='#e2d3b6', pave='#cdbb9c', cobble='#b8a688', grass='#c9c08e'), trees=['tree_broad_b'],
                 flowers=['clover', 'grass_short'], rocks=True,
                 lm=[('town_gravel_lordhall', 16, '영주관', 'big'), ('town_gravel_headframe', 10, '광산 권양탑', 'big'), ('town_gravel_crane', 6, '채석 기중기', 'prop'), ('town_gravel_orecart', 4.5, '광석 수레', 'prop')],
                 mix=[('well', 1), ('stall', 3), ('cart', 5), ('barrels', 8), ('crates', 10), ('hay', 4), ('dummy', 4), ('banner', 4), ('bench', 4), ('rock', 26), ('tree', 10), ('shrub', 12), ('flowerpatch', 6)], stalls=4, lamps=16),
    'silvern': dict(centre='town_silvern_deer', title='숲의 영지', palette=dict(wallstone='#cfd6c0', basestone='#bcc5aa', slate='#5f9a62', plaster='#f1ecd6', pave='#dcdcc4', grass='#b8dba0', wood='#c8b088'), trees=['tree_forest_round', 'tree_forest_tall', 'tree_broad_a'],
                 flowers=['flower_mixed', 'flower_yellow', 'flower_pink', 'clover'],
                 lm=[('town_silvern_manor', 16, '실베른 영주관', 'big'), ('town_silvern_treehouse', 12, '고목의 집', 'big'), ('town_silvern_gazebo', 6.5, '덩굴 정자', 'prop'), ('town_silvern_deer', 4.5, '숲사슴 목각상', 'prop')],
                 mix=[('well', 1), ('stall', 4), ('cart', 2), ('hay', 4), ('barrels', 3), ('crates', 3), ('bench', 10), ('planter', 8), ('tree', 46), ('shrub', 40), ('flowerpatch', 34)], stalls=5, lamps=16),
    'marseon': dict(title='동쪽 교역 도시', palette=dict(wallstone='#e8d2a4', basestone='#d8bf8c', slate='#3fa7a0', plaster='#f6e6c0', pave='#ecdcb4', cobble='#dcc898', grass='#d9cf9a'), trees=['tree_broad_b'],
                 flowers=['flower_yellow', 'flower_mixed'],
                 lm=[('town_marseon_bazaar', 17, '대상 바자르', 'big'), ('town_marseon_bathhouse', 13, '터키석 목욕탕', 'big'), ('town_marseon_tower', 6.5, '봉화 등대', 'prop'), ('town_marseon_caravan', 5.5, '대상 낙타상', 'prop')],
                 mix=[('well', 2), ('stall', 10), ('cart', 4), ('barrels', 8), ('crates', 10), ('banner', 6), ('bench', 6), ('planter', 8), ('tree', 12), ('shrub', 14), ('flowerpatch', 10)], stalls=14, lamps=20),
    'baltazar': dict(centre='town_baltazar_kingstatue', title='검은 돌과 대장간의 수도', palette=dict(wallstone='#77737c', basestone='#5f5b66', slate='#9a3a36', plaster='#b9b2ac', pave='#8f8a90', cobble='#77727a', grass='#9aa58a'), trees=['tree_forest_tall'],
                 flowers=['clover', 'grass_short'], rocks=True,
                 lm=[('town_baltazar_forge', 20, '왕립 대단조장', 'big'), ('town_baltazar_tower', 8, '붉은 종탑', 'big'), ('town_baltazar_anvil', 6.5, '거인의 모루', 'prop'), ('town_baltazar_kingstatue', 5.5, '망치왕 흑요석상', 'prop')],
                 mix=[('well', 2), ('stall', 5), ('cart', 4), ('barrels', 8), ('crates', 10), ('dummy', 8), ('banner', 12), ('bench', 8), ('rock', 20), ('tree', 18), ('shrub', 16), ('flowerpatch', 8)], stalls=8, lamps=28),
    'kreutz_fort': dict(centre='town_kreutz_brazier', title='설원의 국경 요새', palette=dict(wallstone='#aab2be', basestone='#8f98a6', slate='#e8eef4', plaster='#cfd3d8', pave='#dfe6ee', cobble='#c4ccd6', grass='#f4f7fb', snow='1', wood='#9a8f88'), trees=['tree_forest_tall'],
                 flowers=['grass_short'], rocks=True,
                 lm=[('town_kreutz_barracks', 16, '수비대 막사', 'big'), ('town_kreutz_watchtower', 8, '감시탑', 'big'), ('town_kreutz_ballista', 6, '공성 노포', 'prop'), ('town_kreutz_brazier', 4, '봉화대', 'prop')],
                 mix=[('well', 1), ('stall', 2), ('cart', 3), ('barrels', 8), ('crates', 10), ('dummy', 8), ('hay', 4), ('banner', 8), ('fence', 10), ('rock', 18), ('tree', 14), ('shrub', 6)], stalls=3, lamps=16),
}

def gen_town2(t, exits, extra_npcs=()):
    """t: world.py TOWNS 항목(id, name, W, D, wallH, keep, houses, npcs, banner, …)
    exits: [(이웃 id, 표시 이름, (dx, dz) 방향, portal id, spawn id, targetSpawn)]
    extra_npcs: [(npc id, 자리 힌트)] — 새 주민"""
    tid = t['id']; th = THEMES[tid]; rnd = rng_for(tid); W, Dd = float(t['W']), float(t['D']); wallH = t['wallH']
    man = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
    blocks, taken = [], []                      # taken: (x, z, r)
    def add(i, pts): blocks.append(dict(id=i, pts=[[round(x, 3), round(z, 3)] for x, z in pts]))
    RP = 12.5 if W >= 60 else 10.5              # plaza radius (ring road outer edge + margin)
    keep = dict(pos=[0.0, Dd + t['keep'][1] / 2 + 3.5], w=t['keep'][0], d=t['keep'][1], h=t['keep'][2]) if t.get('keep') else None
    pal = None                                  # 왕궁: 북쪽 성벽 안쪽 한가운데 (x, z, 가로, 세로, 높이, 앞면 z)
    if th.get('palace') and th['palace'][0] in man:
        pm = man[th['palace'][0]]; ps = th['palace'][1]; pw, pd, ph = ps * pm[0], ps * pm[1], ps * pm[2]
        pal = dict(file=th['palace'][0], name=th['palace'][2], x=0.0, z=round(Dd - 2.2 - pd / 2, 2), w=pw, d=pd, h=ph, front=round(Dd - 2.2 - pd, 2)); keep = None
    nblock = (pal['w'] / 2 + 5) if pal else (keep['w'] / 2) if keep else None       # 북쪽 성문·탑이 피할 가운데 폭

    # ------------------------------------------------------------------ gates: one per neighbour, on the wall facing it
    gates, used = [], {'n': [], 's': [], 'e': [], 'w': []}
    for k, (nid, label, (dx, dz), pid, sid, tspawn) in enumerate(exits):
        side = ('n' if dz > 0 else 's') if abs(dz) >= abs(dx) else ('e' if dx > 0 else 'w')
        if side in 'ns': lim = W - 13; a = max(-lim, min(lim, dx / max(abs(dz), 1e-6) * Dd * 0.75))
        else: lim = Dd - 13; a = max(-lim, min(lim, dz / max(abs(dx), 1e-6) * W * 0.75))
        if side == 'n' and nblock and abs(a) < nblock + 9: a = (1 if a >= 0 else -1) * (nblock + 9)
        for _ in range(8):                      # keep gates on one wall apart
            hit = [u for u in used[side] if abs(u - a) < 18]
            if not hit: break
            a = hit[0] + (18 if a >= hit[0] else -18); a = max(-lim, min(lim, a))
        used[side].append(a)
        ox, oz = SIDE[side]; tx, tz = (1, 0) if side in 'ns' else (0, 1)
        gp = (a, Dd * oz) if side in 'ns' else (W * ox, a)
        gates.append(dict(id='gate_' + nid, nid=nid, label=label, side=side, a=a, pos=gp, o=(ox, oz), tan=(tx, tz), pid=pid, sid=sid, tspawn=tspawn,
                          h={'n': 0, 's': 180, 'e': 90, 'w': 270}[side]))
    # walls with a gap at every gate; towers at the corners
    walls, k = [], 0
    def wall_side(side, fixed, lo, hi, hmul):
        nonlocal k
        cuts = sorted(g['a'] for g in gates if g['side'] == side); pts = [lo] + [c for g in cuts for c in (g - 3.9, g + 3.9)] + [hi]
        for i in range(0, len(pts), 2):
            if pts[i + 1] - pts[i] < 0.5: continue
            a, b = ((pts[i], fixed), (pts[i + 1], fixed)) if side in 'ns' else ((fixed, pts[i]), (fixed, pts[i + 1]))
            walls.append(dict(id='wall_%s%d' % (side, k), a=[round(a[0], 2), round(a[1], 2)], b=[round(b[0], 2), round(b[1], 2)], h=round(wallH * hmul, 2), t=WT)); k += 1
    wall_side('n', Dd, -W, W, 1.0); wall_side('e', W, -Dd, Dd, 1.0); wall_side('w', -W, -Dd, Dd, 0.85); wall_side('s', -Dd, -W, W, 0.7)
    towers = [dict(id='tower_ne', pos=[W, Dd], r=3.3, h=wallH + 4), dict(id='tower_nw', pos=[-W, Dd], r=3.3, h=wallH + 3),
              dict(id='tower_se', pos=[W, -Dd], r=3.0, h=wallH + 1.5), dict(id='tower_sw', pos=[-W, -Dd], r=2.8, h=wallH + 1)]
    if W > 44:                                  # long walls get mid towers (not where a gate stands)
        for side, pts in (('n', [(-W * 0.45, Dd), (W * 0.45, Dd)]), ('s', [(-W * 0.5, -Dd), (W * 0.5, -Dd)]), ('e', [(W, 0)]), ('w', [(-W, 0)])):
            for i, (x, z) in enumerate(pts):
                a = x if side in 'ns' else z
                if all(abs(g['a'] - a) > 12 for g in gates if g['side'] == side) and not (side == 'n' and nblock and abs(x) < nblock + 4):
                    towers.append(dict(id='tower_%s%d' % (side, i), pos=[round(x, 2), round(z, 2)], r=2.6, h=wallH + 2.5))
    for w in walls: add(w['id'], seg_rect(w['a'], w['b'], WT))
    for tw in towers: add(tw['id'], circle(*tw['pos'], tw['r'] + 0.1, 16))
    gate_specs = []
    for g in gates:
        (gx, gz), (tx, tz) = g['pos'], g['tan']; tws = [[round(gx - tx * 4.6, 2), round(gz - tz * 4.6, 2)], [round(gx + tx * 4.6, 2), round(gz + tz * 4.6, 2)]]
        for i, p in enumerate(tws): add('%s_t%d' % (g['id'], i), circle(*p, 2.3, 14))
        gate_specs.append(dict(id=g['id'], pos=[round(gx, 2), round(gz, 2)], w=5.2, h=4.2, towers=tws, tr=2.2, th=round(wallH * 0.85, 2), t=WT, heading=g['h'], label=g['label']))
    if keep: add('keep', rect(keep['pos'][0], keep['pos'][1], keep['w'] + 5.6, keep['d'] + 5.6, 0))
    # outside the walls only the short road from each gate to its warp is walkable
    X0, X1, Z0, Z1 = -W - OUT, W + OUT, -Dd - OUT, Dd + OUT
    def strips(side):
        cuts = sorted(g['a'] for g in gates if g['side'] == side)
        lo, hi = (X0, X1) if side in 'ns' else (-Dd - WT / 2, Dd + WT / 2)
        pts = [lo] + [c for g in cuts for c in (g - 3.0, g + 3.0)] + [hi]
        for i in range(0, len(pts), 2):
            a, b = pts[i], pts[i + 1]
            if b - a < 0.3: continue
            if side == 'n': add('out_n%d' % i, [(a, Dd + WT / 2), (b, Dd + WT / 2), (b, Z1), (a, Z1)])
            if side == 's': add('out_s%d' % i, [(a, Z0), (b, Z0), (b, -Dd - WT / 2), (a, -Dd - WT / 2)])
            if side == 'e': add('out_e%d' % i, [(W + WT / 2, a), (X1, a), (X1, b), (W + WT / 2, b)])
            if side == 'w': add('out_w%d' % i, [(X0, a), (-W - WT / 2, a), (-W - WT / 2, b), (X0, b)])
    for s in 'nsew': strips(s)

    # ------------------------------------------------------------------ streets
    streets = []                                 # (pts, width, kind)
    for g in gates:
        (gx, gz), (ox, oz) = g['pos'], g['o']; inx, inz = gx - ox * 6.5, gz - oz * 6.5; d = math.hypot(inx, inz)
        if pal and g['side'] == 'n': streets.append(([(gx + ox * 1.0, gz + oz * 1.0), (inx, inz), (inx, pal['front'] - 10.0)], 5.0, 'street'))     # 왕궁 옆 성문: 곧장 남쪽 고리 길로 (왕궁을 가로지르지 않게)
        else: streets.append(([(gx + ox * 1.0, gz + oz * 1.0), (inx, inz), (inx / d * (RP - 3.6), inz / d * (RP - 3.6))], 5.0, 'street'))
        g['out'] = ([(gx + ox * 0.5, gz + oz * 0.5), (gx + ox * (OUT - 1.5), gz + oz * (OUT - 1.5))], 5.2)
    LX, LZ = round(W * 0.7, 1), round(Dd * 0.7, 1)
    LZN = round(pal['front'] - 10.0, 1) if pal else LZ           # 고리 길 북쪽 변 (왕궁이 있으면 앞마당 앞으로 당김)
    loop = W >= 36
    if loop:
        streets.append(([(-LX, -LZ), (LX, -LZ), (LX, LZN), (-LX, LZN), (-LX, -LZ)], 4.0, 'street'))
        for sx, sz in ((1, 0), (-1, 0), (0, 1), (0, -1)):       # spokes plaza -> loop where no gate street already runs that way
            ex, ez = sx * LX, sz * (LZN if sz > 0 else LZ)
            if pal and sz > 0: streets.append(([(0.0, RP - 3.6), (0.0, pal['front'] + 0.6)], 6.4, 'street')); continue      # 광장 → 왕궁 정문 큰길
            if all(seg_dist(ex, ez, s[0][1], s[0][2]) > 9 for s in streets if len(s[0]) == 3): streets.append(([(sx * (RP - 3.6), sz * (RP - 3.6)), (ex, ez)], 3.6, 'street'))
    def street_d(x, z):
        best = 1e9
        for pts, w, _ in streets:
            for a, b in zip(pts, pts[1:]): best = min(best, seg_dist(x, z, a, b) - w / 2)
        return best
    def inside(x, z, m): return -W + WT / 2 + m < x < W - WT / 2 - m and -Dd + WT / 2 + m < z < Dd - WT / 2 - m
    def ok(x, z, r, road=0.7, plaza=True):
        if not inside(x, z, r + 0.8): return False
        if plaza and math.hypot(x, z) < RP + r + 0.6: return False
        if street_d(x, z) < r + road: return False
        return all(math.hypot(x - a, z - b) >= c + r for a, b, c in taken)
    def find(ax, az, r, reach=46.0, **kw):
        for rad in [i * 1.25 for i in range(int(reach / 1.25) + 1)]:
            n = 1 if rad == 0 else max(8, int(rad * 2.2)); off = rnd.random() * 6.28
            for i in range(n):
                x, z = ax + rad * math.cos(off + i / n * 6.283), az + rad * math.sin(off + i / n * 6.283)
                if ok(x, z, r, **kw): return round(x, 2), round(z, 2)
        return None
    def rect_pts(x, z, ww, dd, m=0.0):
        nx, nz = max(2, int((ww + 2 * m) / 1.8) + 1), max(2, int((dd + 2 * m) / 1.8) + 1)
        return [(x - ww / 2 - m + i * (ww + 2 * m) / (nx - 1), z - dd / 2 - m + j * (dd + 2 * m) / (nz - 1)) for i in range(nx) for j in range(nz)]
    def find_rect(ax, az, w, d, reach=60.0, m=1.0, face=None):
        """가장 가까운 빈 직사각형 자리 + 앞면 방향 (큰 건물은 원으로 재면 들어갈 곳이 없음)"""
        for rad in [i * 1.5 for i in range(int(reach / 1.5) + 1)]:
            n = 1 if rad == 0 else max(8, int(rad * 1.6)); off = rnd.random() * 6.28
            for i in range(n):
                x, z = ax + rad * math.cos(off + i / n * 6.283), az + rad * math.sin(off + i / n * 6.283); h = face if face is not None and z > 0 else face_centre(x, z)
                ww, dd = (w, d) if h in (0, 180) else (d, w)
                if all(ok(px, pz, 0.3, road=0.3) for px, pz in rect_pts(x, z, ww, dd, m)): return round(x, 2), round(z, 2), h
        return None
    for g in gates:                              # keep the inside of every gate open (arrival point, signpost)
        (gx, gz), (ox, oz) = g['pos'], g['o']; taken.append((gx - ox * 5, gz - oz * 5, 4.2))

    # ------------------------------------------------------------------ districts: landmark quarter(s), market, park
    q = 0.36 if loop else 0.5
    # 큰 랜드마크는 북쪽 두 구역(앞면이 남쪽 = 카메라 쪽이라 건물이 그 앞의 NPC를 가리지 않음), 시장·공원은 남쪽 두 구역
    north = [(W * q, Dd * q), (-W * q, Dd * q)]; south = [(W * q, -Dd * q), (-W * q, -Dd * q)]; rnd.shuffle(north); rnd.shuffle(south)
    quads = north + south
    models, lm_at, decor, anchors = [], {}, [], {}
    centre = t.get('centre')                      # 아르칸: 여신의 분수
    if centre: models.append(dict(centre)); add('fountain', circle(0, 0, 5.3, 24))
    elif th.get('centre') in man:                 # 광장 한가운데 상징물 (동상·분수)
        f = th['centre']; s0, n0 = next((s, n) for ff, s, n, _ in th['lm'] if ff == f); m = man[f]
        models.append(dict(id=f.replace('town_', 'lm_'), file=f, pos=[0.0, 0.0], h=180, scale=s0, size=[round(s0 * m[0], 2), round(s0 * m[1], 2), round(s0 * m[2], 2)], name=n0))
        add(f.replace('town_', 'lm_'), circle(0, 0, s0 * max(m[0], m[1]) / 2 * 0.92, 18)); lm_at[f.replace('town_', 'lm_')] = (0.0, 0.0, 180, s0 * max(m[0], m[1]) / 2)
    else: decor.append(dict(type='well', pos=[0.0, 0.0])); add('well', circle(0, 0, 1.6, 14))
    def face_centre(x, z):                        # heading (multiple of 90) that turns a building's front to the town centre / nearest street
        return (90 if x < 0 else 270) if abs(x) > abs(z) * 1.15 else (0 if z < 0 else 180)
    def put_model(mid, file, size, name, x, z, h):
        w, d, hh = size
        models.append(dict(id=mid, file=file, pos=[x, z], h=h, scale=round(w / max(man[file][0], 1e-6), 4) if file in man else w, size=[round(w, 2), round(d, 2), round(hh, 2)], name=name))
        ww, dd = (w, d) if h in (0, 180) else (d, w)
        add(mid, [(x - ww * 0.44, z - dd * 0.44), (x + ww * 0.44, z - dd * 0.44), (x + ww * 0.44, z + dd * 0.44), (x - ww * 0.44, z + dd * 0.44)])
        for px, pz in rect_pts(x, z, ww, dd, 0.3): taken.append((px, pz, 1.3))
        lm_at[mid] = (x, z, h, max(w, d) / 2)
    if pal:                                       # 왕궁이 먼저 자리를 잡음; 큰 랜드마크는 그 좌우(고리 길 북쪽)
        put_model(pal['file'].replace('town_', 'lm_'), pal['file'], (pal['w'], pal['d'], pal['h']), pal['name'], pal['x'], pal['z'], 180)
        lm_at[pal['file'].replace('town_', 'lm_')] = (pal['x'], pal['z'], 180, pal['d'] / 2 + 0.8)
        zq = Dd - 11.5; quads[0] = (pal['w'] / 2 + 21.0, zq); quads[1] = (-pal['w'] / 2 - 21.0, zq)
    fixed = list(t.get('fixed_models', []))       # 아르칸: 대장간·약국 (원래 모델)
    bigs = [(f, s, n) for f, s, n, kind in th['lm'] if kind == 'big' and f in man]; props = [(f, s, n) for f, s, n, kind in th['lm'] if kind == 'prop' and f in man and not (f == th.get('centre') and not centre)]
    qi = 0
    for i, fm in enumerate(fixed):                # 원래 모델이 먼저 (꼭 들어가야 함): 광장 북쪽 좌우
        p = find_rect((-1 if i % 2 == 0 else 1) * (RP + 6.0), RP + 7.0, fm['size'][0], fm['size'][1], face=180)
        assert p, 'no room for ' + fm['id']
        put_model(fm['id'], fm['file'], fm['size'], fm['name'], p[0], p[1], p[2]); models[-1]['scale'] = fm['scale']
    for f, s, n in bigs:
        m = man[f]; size = (s * m[0], s * m[1], s * m[2]); ax, az = quads[qi % 4]; qi += 1
        p = None
        for k in (1.0, 0.88, 0.76, 0.66):         # 작은 마을에서는 조금 줄여서라도 넣음
            size = (s * k * m[0], s * k * m[1], s * k * m[2]); p = find_rect(ax, az, size[0], size[1], m=0.8, face=180)
            if p: break
        if p: put_model(f.replace('town_', 'lm_'), f, size, n, p[0], p[1], p[2])
        else: print('  !! no room for', f, 'in', t['id'])
    anchors['market'] = quads[qi % 4]; qi += 1
    anchors['park'] = quads[qi % 4]; qi += 1
    # market: two rows of stalls round a small square
    mk = find(anchors['market'][0], anchors['market'][1], 7.5) or anchors['market']; anchors['market'] = mk
    aw = ['awning_red', 'awning_green', 'awning_blue']
    ns = th.get('stalls', 4); cols = max(2, (ns + 1) // 2)
    for i in range(ns):
        row, c = i % 2, i // 2; x = mk[0] + (c - (cols - 1) / 2) * 4.6; z = mk[1] + (3.4 if row else -3.4)
        if not ok(x, z, 2.0, road=0.4): continue
        decor.append(dict(type='stall', pos=[round(x, 2), round(z, 2)], w=3.4, d=2.0, h=180 if row else 0, awning=aw[i % 3], goods='veg' if i % 2 else 'cloth'))
        add('stall%d' % i, rect(x, z, 3.6, 2.2, 0)); taken.append((x, z, 2.1))
    taken.append((mk[0], mk[1], 1.6))             # the middle of the market stays open (merchants stand round it)
    pk = find(anchors['park'][0], anchors['park'][1], 8.0) or anchors['park']; anchors['park'] = pk
    grass = [dict(pts=[[round(pk[0] + 9 * math.cos(a) * (0.8 + 0.3 * rnd.random()), 2), round(pk[1] + 8 * math.sin(a) * (0.8 + 0.3 * rnd.random()), 2)] for a in [i / 10 * 6.283 for i in range(10)]])]
    spots = [(pk[0], pk[1]), (0.0, -(RP + 5.0)), (0.0, RP + 5.0), (RP + 5.0, 0.0), (-(RP + 5.0), 0.0)]
    for i, (f, s, n) in enumerate(props):
        m = man[f]; size = (s * m[0], s * m[1], s * m[2]); ax, az = spots[i % len(spots)]
        p = find_rect(ax, az, size[0], size[1], m=0.6)
        if p: put_model(f.replace('town_', 'lm_'), f, size, n, p[0], p[1], p[2])
        else: print('  !! no room for', f, 'in', t['id'])

    # ------------------------------------------------------------------ houses: rows along the walls + along the loop street
    slots = []
    step = HW + 2.2
    for side in 'nsew':
        ox, oz = SIDE[side]; L = W if side in 'ns' else Dd; n = int((2 * L - 12) // step)
        for i in range(n):
            a = -L + 6 + (i + 0.5) * (2 * L - 12) / n
            if any(abs(g['a'] - a) < HW / 2 + 5.5 for g in gates if g['side'] == side): continue
            off = WT / 2 + HD / 2 + 1.6
            x, z = (a, oz * (Dd - off)) if side in 'ns' else (ox * (W - off), a)
            slots.append((x, z, {'n': 180, 's': 0, 'e': 270, 'w': 90}[side], 'wall'))
    if loop:
        for side in 'nsew':
            ox, oz = SIDE[side]; L = (LX if side in 'ns' else LZ) - HD - 5; n = max(0, int((2 * L) // (HW + 3.0)))
            for i in range(n):
                a = -L + (i + 0.5) * 2 * L / n; off = 2.0 + HD / 2 + 1.6
                x, z = (a, oz * ((LZN if side == 'n' else LZ) - off)) if side in 'ns' else (ox * (LX - off), a)
                slots.append((x, z, {'n': 0, 's': 180, 'e': 90, 'w': 270}[side], 'inner'))
    rnd.shuffle(slots); slots.sort(key=lambda s: s[3] != 'wall' and rnd.random() < 0.5)
    houses = []; names = list(t.get('named_houses', []))
    STYLES = ['bakery', 'general', 'dress', 'arms']; HN = {'bakery': '빵집', 'general': '잡화점', 'dress': '옷가게', 'arms': '무기고'}
    for x, z, h, kind in slots:
        if len(houses) >= t['houses']: break
        ww, dd = (HW, HD) if h in (0, 180) else (HD, HW)
        if street_d(x, z) < max(ww, dd) / 2 + 0.2 and kind == 'inner': continue
        if any(seg_dist(x, z, a, b) < math.hypot(ww, dd) / 2 + w2 / 2 - 1.2 for pts, w2, _ in streets[:len(gates)] for a, b in zip(pts, pts[1:])): continue
        if math.hypot(x, z) < RP + 7.5 or any(math.hypot(x - a, z - b) < c + 5.6 for a, b, c in taken): continue
        k2 = len(houses)
        if names: hid, st, nm = names.pop(0)
        else: st = 'arms' if t.get('smithy') and k2 % 3 == 0 else rnd.choice(STYLES); hid, nm = 'house%d' % k2, HN[st]
        houses.append(dict(id=hid, style=st, pos=[round(x, 2), round(z, 2)], h=h, w=HW, d=HD, door=round(rnd.uniform(-1.6, 1.6), 2), name=nm))
        add(hid, rect(x, z, HW - 0.2, HD - 0.2, h)); taken.append((x, z, 5.6))
    def house_front(hs, dist=2.2):
        a = math.radians(hs['h']); return hs['pos'][0] + math.sin(a) * (HD / 2 + dist) + math.cos(a) * hs['door'], hs['pos'][1] + math.cos(a) * (HD / 2 + dist) - math.sin(a) * hs['door']

    # ------------------------------------------------------------------ NPC spots (before the small decoration so they get the open places)
    npcs = []
    def stand(nid, hint, extra=None):
        ax, az, face = 0.0, 0.0, None
        kind, _, arg = hint.partition(':')
        if kind == 'plaza':
            a = math.radians(float(arg or rnd.uniform(0, 360))); ax, az = (RP + 1.6) * math.cos(a), (RP + 1.6) * math.sin(a)
        elif kind == 'market': ax, az = anchors['market'][0] + rnd.uniform(-5, 5), anchors['market'][1] + rnd.uniform(-1.2, 1.2)
        elif kind == 'park': ax, az = anchors['park'][0] + rnd.uniform(-5, 5), anchors['park'][1] + rnd.uniform(-5, 5)
        elif kind == 'gate':
            g = next((g for g in gates if g['nid'] == arg), gates[int(arg) % len(gates)] if arg.isdigit() else gates[0]); s = rnd.choice((-1, 1))
            ax, az = g['pos'][0] - g['o'][0] * 8.5 + g['tan'][0] * 4.6 * s, g['pos'][1] - g['o'][1] * 8.5 + g['tan'][1] * 4.6 * s
        elif kind == 'lm' and ('lm_' + arg.partition('@')[0] in lm_at or arg.partition('@')[0] in lm_at):      # lm:<랜드마크>[@옆으로 m]
            arg, _, side_m = arg.partition('@'); extra = extra or side_m or 0
            x, z, h, r = lm_at.get('lm_' + arg) or lm_at[arg]; a = math.radians(h); off = float(extra or 0)
            ax, az = x + math.sin(a) * (r + 2.4) + math.cos(a) * off, z + math.cos(a) * (r + 2.4) - math.sin(a) * off; face = (x, z)
        elif kind == 'house' and any(hs['id'] == arg or hs['style'] == arg for hs in houses):
            hs = next(hs for hs in houses if hs['id'] == arg or hs['style'] == arg); ax, az = house_front(hs); face = None
            p = (round(ax, 2), round(az, 2)) if ok(ax, az, 0.6, road=-9) else find(ax, az, 0.9, road=0.2)
            if p: npcs.append(dict(npc=nid, pos=list(p), rot=float(hs['h']), building=hs['id'])); taken.append((p[0], p[1], 1.6)); return p
        elif kind == 'street':
            pts, w, _ = rnd.choice(streets); i = rnd.randrange(len(pts) - 1); u = rnd.uniform(0.25, 0.75)
            ax, az = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u + rnd.choice((-1, 1)) * (w / 2 + 1.6), pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u + rnd.choice((-1, 1)) * (w / 2 + 1.6)
        else:
            a = rnd.uniform(0, 6.283); ax, az = (RP + 6) * math.cos(a), (RP + 6) * math.sin(a)
        p = find(ax, az, 1.0, road=0.25, plaza=kind != 'plaza') or find(0, RP + 3, 1.0, road=0.25)
        fx, fz = face if face else (0.0, 0.0)
        rot = yaw_to(p[0] - fx, p[1] - fz) if face else yaw_to(-p[0], -p[1])
        npcs.append(dict(npc=nid, pos=list(p), rot=rot)); taken.append((p[0], p[1], 1.7)); return p
    for nid, hint, *ex in t.get('place', []): stand(nid, hint, *ex)
    for nid, hint, *ex in extra_npcs: stand(nid, hint, *ex)

    # ------------------------------------------------------------------ portals / spawns / signposts
    portals, spawns, props_out, blprops = [], [], [], []
    sp0 = t.get('start_at') or (-1.0, -(RP + 1.5))
    spawns.append(dict(id='start', pos=[sp0[0], sp0[1]], rot=0.0)); spawns.append(dict(id='revive', pos=[sp0[0] - 1.6, sp0[1] + 0.9], rot=0.0))
    taken.append((sp0[0], sp0[1], 2.2))
    for g in gates:
        (gx, gz), (ox, oz), (tx, tz) = g['pos'], g['o'], g['tan']
        portals.append(dict(id=g['pid'], label=g['label'], pos=[round(gx + ox * 7.0, 2), round(gz + oz * 7.0, 2)], radius=1.7, targetZone=g['nid'], targetSpawn=g['tspawn'], minLevel=0))
        spawns.append(dict(id=g['sid'], pos=[round(gx - ox * 5.0, 2), round(gz - oz * 5.0, 2)], rot=yaw_to(-ox, -oz)))
        sx, sz = gx - ox * 3.4 + tx * 3.6, gz - oz * 3.4 + tz * 3.6
        props_out.append(dict(type='signpost', pos=[round(sx, 2), round(sz, 2)], rot=float(g['h']), scale=1.0, variant='', w=0.0, d=0.0, text=g['label']))
        taken.append((sx, sz, 0.9))

    # ------------------------------------------------------------------ lanterns (ornate: plaza + gates) and Blender lamps along the streets
    lanterns = [[round((RP - 2.9) * math.cos(math.radians(a)), 2), round((RP - 2.9) * math.sin(math.radians(a)), 2)] for a in (25, 75, 140, 205, 250, 320)]
    lanterns = [p for p in lanterns if street_d(*p) > 0.9]
    for g in gates:
        for s in (-1, 1): lanterns.append([round(g['pos'][0] - g['o'][0] * 3.4 + g['tan'][0] * 3.9 * s * -1, 2), round(g['pos'][1] - g['o'][1] * 3.4 + g['tan'][1] * 3.9 * s * -1, 2)] if s < 0 else
                                          [round(g['pos'][0] - g['o'][0] * 9.5 + g['tan'][0] * 3.6 * s, 2), round(g['pos'][1] - g['o'][1] * 9.5 + g['tan'][1] * 3.6 * s, 2)])
    lanterns = [p for p in lanterns if all(math.hypot(p[0] - a, p[1] - b) > c + 0.4 for a, b, c in taken if c < 3)]
    for i, (x, z) in enumerate(lanterns): add('lantern%d' % i, circle(x, z, 0.3, 8)); taken.append((x, z, 1.3))
    def bl(model, x, z, rot=None, scale=1.0, solid=None, r=0.4):
        blprops.append(dict(model=model, pos=[round(x, 2), round(z, 2)], rot=round(rnd.uniform(0, 360) if rot is None else rot, 1), scale=round(scale, 2)))
        if solid: props_out.append(dict(dict(type=solid, pos=[round(x, 2), round(z, 2)], rot=round(rot or 0, 1), scale=round(scale, 2), variant='', w=0.0, d=0.0, bl=True)))
        taken.append((x, z, r))
    nl = 0
    for pts, w, _ in streets:
        for a, b in zip(pts, pts[1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1]); n = int(L // 13)
            for i in range(n):
                if nl >= th.get('lamps', 16): break
                u = (i + 0.5) / n; s = 1 if (i + nl) % 2 else -1; nx, nz = -(b[1] - a[1]) / L, (b[0] - a[0]) / L
                x, z = a[0] + (b[0] - a[0]) * u + nx * s * (w / 2 + 0.9), a[1] + (b[1] - a[1]) * u + nz * s * (w / 2 + 0.9)
                if ok(x, z, 0.5, road=0.25): bl('town_lamp', x, z, 0, 1.0, 'lamp', 0.9); nl += 1

    if pal:                                       # 왕궁 앞마당: 큰길 양옆 깃발 줄 + 정문 양옆 화단, 나머지는 비워 둠
        fz = pal['front']
        for i, z in enumerate((fz - 7.0, fz - 12.0, fz - 17.0, fz - 22.0)):
            for sx in (-1, 1):
                if z > RP + 4 and ok(sx * 4.4, z, 0.5, road=0.1): bl('town_banner', sx * 4.4, z, 180, 1.0, 'lamp', 0.8)
        for sx in (-1, 1):
            for x in (sx * pal['w'] * 0.37, sx * pal['w'] * 0.5):
                z = fz - 3.2
                if not ok(x, z, 1.6, road=0.2): continue
                decor.append(dict(type='planter', pos=[round(x, 2), round(z, 2)], r=1.5)); add('pal_planter%d' % len(decor), circle(x, z, 1.5, 12)); taken.append((x, z, 2.0))
                for j in range(5): a = j / 5 * 6.283; blprops.append(dict(model=rnd.choice(th['flowers']), pos=[round(x + 2.0 * math.cos(a), 2), round(z + 2.0 * math.sin(a), 2)], rot=round(rnd.uniform(0, 360), 1), scale=0.85))
        sx, sz = -9.2, fz - 4.8                  # 정문 왼쪽 앞 표지판
        if ok(sx, sz, 0.5, road=0.1): props_out.append(dict(type='signpost', pos=[sx, round(sz, 2)], rot=180.0, scale=1.0, variant='', w=0.0, d=0.0, text=pal['name'])); taken.append((sx, sz, 0.9))
        for i in range(-5, 6): taken.append((i * pal['w'] / 10, fz - 3.4, 2.4))

    # ------------------------------------------------------------------ decoration by theme
    trees, flowers = th['trees'], th['flowers']
    def scatter_pos(r, pref=None, spread=None):
        for _ in range(60):
            if pref: x, z = pref[0] + rnd.gauss(0, spread), pref[1] + rnd.gauss(0, spread)
            else: x, z = rnd.uniform(-W + 4, W - 4), rnd.uniform(-Dd + 4, Dd - 4)
            if ok(x, z, r, road=0.6): return x, z
        return None
    dk = 0
    for kind, cnt in th['mix']:
        for i in range(cnt):
            park = kind in ('tree', 'shrub', 'flowerpatch', 'bench') and i % 3 == 0
            near_market = kind in ('barrels', 'crates', 'cart') and i % 2 == 0
            pref, spread = (anchors['park'], 6.5) if park else (anchors['market'], 9.0) if near_market else (None, None)
            if kind == 'tree':
                p = scatter_pos(1.5, pref, spread)
                if p: bl(rnd.choice(trees), p[0], p[1], None, rnd.uniform(0.85, 1.2), 'tree', 1.6)
            elif kind == 'shrub':
                p = scatter_pos(0.8, pref, spread)
                if p: bl(rnd.choice(['shrub_a', 'shrub_b']), p[0], p[1], None, rnd.uniform(0.8, 1.15), 'bush', 0.9)
            elif kind == 'rock':
                p = scatter_pos(1.0, pref, spread)
                if p: bl(rnd.choice(['rock_medium', 'rock_small', 'rock_roadside', 'rock_moss']), p[0], p[1], None, rnd.uniform(0.7, 1.2), 'rock', 1.0)
            elif kind == 'flowerpatch':
                p = scatter_pos(1.2, pref, spread)
                if p:
                    for j in range(rnd.randint(4, 7)): blprops.append(dict(model=rnd.choice(flowers), pos=[round(p[0] + rnd.uniform(-1.1, 1.1), 2), round(p[1] + rnd.uniform(-1.1, 1.1), 2)], rot=round(rnd.uniform(0, 360), 1), scale=round(rnd.uniform(0.7, 1.05), 2)))
                    taken.append((p[0], p[1], 1.2))
            elif kind == 'bench':
                p = scatter_pos(1.1, pref, spread)
                if p: rot = yaw_to(-p[0], -p[1]) if not park else yaw_to(anchors['park'][0] - p[0], anchors['park'][1] - p[1]); bl('town_bench', p[0], p[1], rot, 1.0, 'bench', 1.2)
            elif kind == 'fence':
                p = scatter_pos(1.4, pref, spread)
                if p: bl('town_fence', p[0], p[1], rnd.choice((0, 90)), 1.0, None, 1.3)
            elif kind == 'banner':
                p = scatter_pos(0.6, pref, spread)
                if p: bl('town_banner', p[0], p[1], yaw_to(-p[0], -p[1]), 1.0, 'lamp', 0.8)
            else:
                o = dict(well=dict(r=1.5), barrels=dict(r=1.1), crates=dict(r=1.1), hay=dict(r=1.0), dummy=dict(r=0.5), planter=dict(r=1.5), cart=dict(w=3.0, d=1.6, h=rnd.choice((20, 110, 200, 290))),
                         stall=dict(w=3.4, d=2.0, h=rnd.choice((0, 90, 180, 270)), awning=rnd.choice(aw), goods=rnd.choice(('veg', 'cloth'))))[kind]
                rr = o.get('r', 1.8) + 0.5
                p = scatter_pos(rr, pref, spread)
                if not p: continue
                d = dict(type=kind, pos=[round(p[0], 2), round(p[1], 2)]); d.update(o); decor.append(d); dk += 1
                if 'w' in o: add('decor%d' % dk, rect(p[0], p[1], o['w'] + 0.2, o['d'] + 0.2, o['h']))
                else: add('decor%d' % dk, circle(p[0], p[1], o['r'], 12))
                taken.append((p[0], p[1], rr))
                if kind == 'planter':        # flowers round the planter
                    for j in range(5): a = j / 5 * 6.283 + rnd.random(); blprops.append(dict(model=rnd.choice(flowers), pos=[round(p[0] + 2.0 * math.cos(a), 2), round(p[1] + 2.0 * math.sin(a), 2)], rot=round(rnd.uniform(0, 360), 1), scale=0.85))
    # flower boxes / shrubs at the house fronts
    for hs in houses:
        for s in (-1, 1):
            a = math.radians(hs['h']); x = hs['pos'][0] + math.sin(a) * (HD / 2 + 0.7) + math.cos(a) * s * 3.4; z = hs['pos'][1] + math.cos(a) * (HD / 2 + 0.7) - math.sin(a) * s * 3.4
            if ok(x, z, 0.5, road=0.1) and rnd.random() < 0.75: bl(rnd.choice(['shrub_a', 'shrub_b', 'town_planter'] if flowers[0] != 'grass_short' else ['town_barrel', 'town_crate']), x, z, None, 0.8, 'bush', 0.7)

    # small flower clumps along the street edges (2026-11-14, 그래픽 2단계): every ~4 m, alternate sides, just outside
    # the kerb; only where ok() allows (not the plaza, not on other things / NPC spots, not in front of a door). Decoration
    # only (blprops, no collision), own rng and not added to `taken`, so nothing else in the town moves.
    er = rng_for('edge:' + t['id']); doors = [house_front(hs, 1.0) for hs in houses]; ne = 0
    for pts, w, _ in streets:
        for a, b in zip(pts, pts[1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1]); nx, nz = -(b[1] - a[1]) / max(L, 1e-6), (b[0] - a[0]) / max(L, 1e-6)
            for i in range(int(L // 4.0)):
                if er.random() < 0.25: continue
                u = (i + 0.5 + er.uniform(-0.15, 0.15)) * 4.0 / L; s = 1 if (i + ne) % 2 else -1; off = w / 2 + er.uniform(0.75, 1.0)
                x, z = a[0] + (b[0] - a[0]) * u + nx * s * off, a[1] + (b[1] - a[1]) * u + nz * s * off
                if not ok(x, z, 0.45, road=0.2) or any(math.hypot(x - dx, z - dz) < 2.6 for dx, dz in doors): continue
                green = 'grass_short' if 'grass_short' not in flowers else 'clover'
                blprops.append(dict(model=green, pos=[round(x, 2), round(z, 2)], rot=round(er.uniform(0, 360), 1), scale=round(er.uniform(0.85, 1.05), 2)))
                for j in range(er.randint(3, 4)):
                    blprops.append(dict(model=er.choice(flowers), pos=[round(x + er.uniform(-0.45, 0.45) * abs(nz) + er.uniform(-0.2, 0.2), 2), round(z + er.uniform(-0.45, 0.45) * abs(nx) + er.uniform(-0.2, 0.2), 2)],
                                        rot=round(er.uniform(0, 360), 1), scale=round(er.uniform(0.6, 0.82), 2)))
                ne += 1
    # ------------------------------------------------------------------ roads for the renderer
    roads = [dict(kind='ring', pos=[0, 0], r0=5.2, r1=RP - 1.7)]
    for pts, w, kind in streets: roads.append(dict(kind=kind, pts=[[round(x, 2), round(z, 2)] for x, z in pts], w=w))
    for g in gates: roads.append(dict(kind='path', pts=[[round(x, 2), round(z, 2)] for x, z in g['out'][0]], w=g['out'][1]))
    for hs in houses:
        ex, ez = house_front(hs, 1.0)
    canopies = [[round(rnd.uniform(-W + 4, W - 4), 1), round(rnd.uniform(-Dd + 4, Dd - 4), 1), round(rnd.uniform(4.5, 6.5), 1), round(rnd.uniform(0, 3), 1)] for _ in range(int(6 + W / 6))]
    town3d = dict(models=models, houses=houses, walls=walls, towers=towers, gates=gate_specs, gate=gate_specs[0], keep=keep,
                  ground=dict(inner=[-W, -Dd, W, Dd], roads=roads, grass=grass, outer=[X0 - 60, Z0 - 60, X1 + 60, Z1 + 60]), decor=decor, lanterns=lanterns, rosettes=[],
                  canopies=canopies, banner=t.get('banner', 'blue'), temple=bool(t.get('temple')), blprops=blprops, palette=th.get('palette', {}), theme=th['title'],
                  districts=dict(market=[round(anchors['market'][0], 1), round(anchors['market'][1], 1)], park=[round(anchors['park'][0], 1), round(anchors['park'][1], 1)]))
    # ------------------------------------------------------------------ 카메라에 가려진 NPC 고치기 (2026-11-12): 나무·덤불·깃발이 가리면 그것을 치우고,
    # 집·랜드마크·성벽·노점이 가리면 NPC를 가장 가까운 잘 보이는 빈 자리로 옮김 (tools/world/visible.py)
    occ = visible.occluders(town3d); drop = set(); moved = 0
    for n in npcs:
        x, z = n['pos']; hits = visible.blockers(occ, x, z)
        if not hits: continue
        if all(o[5] is not False for o in hits): drop.update(o[5] for o in hits); continue
        best = None
        for rad in [i * 1.0 for i in range(1, 40)]:
            k = max(8, int(rad * 3))
            for i in range(k):
                px, pz = x + rad * math.cos(i / k * 6.283), z + rad * math.sin(i / k * 6.283)
                if ok(px, pz, 1.0, road=0.25) and not visible.hidden(occ, px, pz): best = (round(px, 2), round(pz, 2)); break
            if best: break
        if best: n['pos'] = list(best); n.pop('building', None); taken.append((best[0], best[1], 1.7)); moved += 1
        else: print('  !! still hidden:', n['npc'], 'in', tid)
    if drop:
        gone = {(blprops[i]['pos'][0], blprops[i]['pos'][1]) for i in drop}
        blprops[:] = [b for i, b in enumerate(blprops) if i not in drop]
        props_out[:] = [q for q in props_out if not (q.get('bl') and (q['pos'][0], q['pos'][1]) in gone)]
    if drop or moved: print('  %s: NPC %d명 옮김, 가리던 나무·덤불 %d개 치움' % (tid, moved, len(drop)))
    return dict(bounds=[X0, Z0, X1, Z1], spawns=spawns, npcs=npcs, portals=portals, blockPolys=blocks, town3d=town3d, props=props_out, anchors=anchors, lm_at=lm_at)
