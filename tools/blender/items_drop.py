"""땅에 떨어진 아이템 3D 모델 (Blender bpy, headless, 2026-11-15) — 퀘스트 줍기·퀘스트 드롭 아이템(qi_*)과 그림 모델이 없는 아이템.

사용자 요청: 숲의 퀘스트 줍기가 평평한 도트 아이콘(초록 네모)이라 게임 그래픽과 따로 놀았음 → 작고 단정한 카툰 3D 소품.

Usage:  python3 tools/blender/items_drop.py   ->  assets/items/drop_items.glb.json  (모든 모델 한 파일, 정점 색만, 이미지 없음)
                                              assets/items/drop_map.json      (아이템 id -> 모델·색조, 종류별 대체 모델)
                                              tools/blender/drop/drop_items.blend (원본)
        python3 tools/blender/items_drop.py --map   (지도만 다시 쓰고 표 출력 — 모델은 그대로)

규격 (게임 축: +Y 위, 미터): 바닥 y 0, 가로 중심 원점, 키·폭 0.3~0.5 m, 모델마다 삼각형 800개 이하.
  메시 이름 drop_<모델>; 빛나는 부분은 따로 drop_<모델>__glow (게임이 발광 재질로 그림 — 불씨·등불 불꽃·결정 핵·룬).
  칠한 빛은 정점 색: 기본색 × 높이 그라데이션(아래 어둡게) × 위쪽 면 밝게. 실시간 음영은 게임(js/dropfx.js, paintMat).
아이템 → 모델은 아이템 데이터(id·이름·설명·종류)의 낱말로 정함(RULES, 위에서부터 처음 맞는 것). 손으로 아이템마다 적지 않음.
맞는 규칙이 없으면 종류별 대체(FALLBACK). 그림 모델이 이미 있는 아이템(js/items3d.js: 무기·방어구·장신구·물약·재료)은
게임이 그 모델을 먼저 씀 — 이 지도는 그것이 없을 때만.
"""
import os, sys, math, json, base64, re
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'items'); SRC = os.path.join(HERE, 'drop'); TMP = '/tmp/items_drop'
for d in (OUT, SRC, TMP): os.makedirs(d, exist_ok=True)

# ----------------------------------------------------------------------------------------------- item -> model mapping
# (낱말 정규식, 모델, 색조) — 이름·설명·id에서 찾음. 색조는 모델 정점 색에 곱할 색(없으면 그대로).
RULES = [
    (r'핏자국|검은 피', 'vial', 0x6a3048),
    (r'이끼 거북|등딱지', 'carapace', 0x9ac070),
    (r'딱정벌레|껍질', 'carapace', None),
    (r'달팽이|조개', 'shell', None),
    (r'병든 이끼', 'moss', 0xb090c8),
    (r'이끼', 'moss', None),
    (r'약초|풀잎|허브', 'herb', None),
    (r'^맨드레이크 뿌리', 'herb', 0xc8a070),       # 2026-11-19 서장
    (r'^검은 수액', 'vial', 0x302838),
    (r'^보랏빛 포자', 'seedbag', 0xa070d0),
    (r'^마른 참나무', 'logs', 0xa07848),
    (r'죽순|대나무', 'bamboo', None),
    (r'씨앗|보리', 'seedbag', None),
    (r'꿀', 'honey', None),
    (r'고기', 'meat', None),
    (r'(검은|까만).*(깃|흔적)|검은 깃|암살단', 'feather', 0x5a5470),
    (r'가고일', 'feather', 0xb8b4b0),
    (r'부엉이', 'feather', 0xc89a64),
    (r'깃털|깃\b|깃$', 'feather', None),
    (r'거미|실\b|실$', 'spool', None),
    (r'양털|털', 'wool', None),
    (r'사슴.*뿔', 'antler', 0xd8ecff),
    (r'뿔', 'horn', None),
    (r'전갈', 'tail', 0xc89048),
    (r'도롱뇽', 'tail', 0xe0603a),
    (r'꼬리', 'tail', None),
    (r'비늘', 'scale', None),
    (r'얼음꽃|^꽃|\s꽃', 'flower', None),
    (r'그림자 구멍|그림자 불씨', 'orb', None),
    (r'제단|핵|검은 결정', 'crystal', 0x8a5ad0),
    (r'결정|수정', 'crystal', None),
    (r'거짓 단서|환영', 'shard', 0xc0a0ff),
    (r'등불|등잔|램프', 'lamp', None),
    (r'불씨|화로|성소', 'ember', None),
    (r'기름통|통$', 'barrel', None),
    (r'곡괭이', 'pick', None),
    (r'얼음 강철|강철|주괴|광석', 'ingot', 0xc8e4ff),
    (r'호수 얼음|얼음 조각|얼음', 'ice', None),
    (r'장작|나무토막', 'logs', 0xdce8f4),
    (r'돌무더기', 'cairn', None),
    (r'채석장|돌$|돌\b', 'stone', None),
    (r'탁본', 'scroll', None),
    (r'망치 자국', 'tablet', 0xa09088),
    (r'비문|석판|붕괴 표식', 'tablet', None),
    (r'기도서|일기|책', 'book', None),
    (r'장부|기록|탁본|관측|편지|문서|지도', 'scroll', None),
    (r'망토|천 조각|천$', 'cloth', None),
    (r'유품|목걸이|로켓', 'keepsake', None),
    (r'순례자의 표식|표식|휘장|배지|문장', 'token', None),
    (r'양치기|물건|보따리', 'bundle', None),
]
FALLBACK = {'quest': 'bundle', 'material': 'pouch', 'consumable': 'vial', 'weapon': 'bundle', 'armor': 'bundle', 'accessory': 'keepsake'}

def item_model(it):
    text = ' '.join([it.get('name', ''), it.get('desc', ''), it['id']])
    for pat, model, tint in RULES:
        if re.search(pat, it.get('name', '')): return model, tint, pat
    for pat, model, tint in RULES:
        if re.search(pat, text): return model, tint, pat
    kind = 'quest' if it['id'].startswith('qi_') else it.get('type', 'material')
    return FALLBACK.get(kind, 'pouch'), None, 'fallback:' + kind

def write_map(models):
    items = json.load(open(os.path.join(ROOT, 'assets', 'data', 'items.json'), encoding='utf-8'))['items']
    out = {}
    for it in items:
        m, tint, why = item_model(it)
        assert m in models, (it['id'], m)
        out[it['id']] = {'m': m} if tint is None else {'m': m, 'tint': '#%06x' % tint}
        if it['id'].startswith('qi_'): print(f"  {it['id']:22s} {it['name']:14s} -> {m:9s} {('#%06x' % tint) if tint else '':8s} ({why})")
    json.dump({'items': out, 'fallback': FALLBACK, 'models': sorted(models)}, open(os.path.join(OUT, 'drop_map.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=0, sort_keys=True)
    print('drop_map.json:', len(out), 'items')

# ----------------------------------------------------------------------------------------------- geometry helpers
def C(h, k=1.0):
    """hex colour -> RGBA (k = brightness)"""
    return (min(1, ((h >> 16) & 255) / 255 * k), min(1, ((h >> 8) & 255) / 255 * k), min(1, (h & 255) / 255 * k), 1.0)

class Builder:
    """collects game-axis faces (y up) with per-face colours; xf = mathutils Matrix applied to every point"""
    def __init__(self, bm, col): self.bm, self.col = bm, col; self.xf = None
    def v(self, p):
        from mathutils import Vector
        q = Vector(p) if self.xf is None else self.xf @ Vector(p)
        return self.bm.verts.new((q.x, -q.z, q.y))          # game (x, y up, z fwd) -> Blender (x, y, z up)
    def face(self, vs, c):
        try: f = self.bm.faces.new(vs)
        except ValueError: return None
        for l in f.loops: l[self.col] = c
        return f
    def at(self, pos=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
        """context transform: rot = game Euler (x, y, z) degrees"""
        from mathutils import Matrix, Euler
        s = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
        S = Matrix.Diagonal((s[0], s[1], s[2], 1.0))
        R = Euler([math.radians(a) for a in rot], 'XYZ').to_matrix().to_4x4()
        self.xf = Matrix.Translation(pos) @ R @ S; return self
    def reset(self): self.xf = None; return self

    def sphere(self, c, seg=10, rings=6, colf=None, top=1.0, bot=-1.0):
        """unit sphere (in the current transform), cut flat at y = top / bot (capped); colf(y) -> colour per band"""
        t0, t1 = math.acos(max(-1, min(1, top))), math.acos(max(-1, min(1, bot)))
        rows = []
        for k in range(rings + 1):
            t = t0 + (t1 - t0) * k / rings; y, r = math.cos(t), math.sin(t)
            rows.append([self.v((0, y, 0))] if r < 1e-5 else [self.v((math.cos(2 * math.pi * i / seg) * r, y, math.sin(2 * math.pi * i / seg) * r)) for i in range(seg)])
        for k in range(rings):
            a, b = rows[k], rows[k + 1]; cc = colf(math.cos(t0 + (t1 - t0) * (k + 0.5) / rings)) if colf else c
            for i in range(seg):
                j = (i + 1) % seg
                if len(a) == 1: self.face([a[0], b[j], b[i]], cc)
                elif len(b) == 1: self.face([a[i], a[j], b[0]], cc)
                else: self.face([a[i], a[j], b[j], b[i]], cc)
        if len(rows[0]) > 1: self.face(list(rows[0]), colf(top) if colf else c)
        if len(rows[-1]) > 1: self.face(list(reversed(rows[-1])), colf(bot) if colf else c)

    def lathe(self, prof, c, seg=10, colf=None):
        """profile [(r, y)] bottom -> top around +y (current transform); caps where r > 0 at the ends"""
        rings = [[self.v((math.cos(2 * math.pi * i / seg) * r, y, math.sin(2 * math.pi * i / seg) * r)) for i in range(seg)] for r, y in prof]
        for k in range(len(rings) - 1):
            cc = colf(k) if colf else c
            for i in range(seg):
                j = (i + 1) % seg; self.face([rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]], cc)
        if prof[0][0] > 1e-5: self.face(list(reversed(rings[0])), colf(0) if colf else c)
        if prof[-1][0] > 1e-5: self.face(rings[-1], colf(len(prof) - 2) if colf else c)

    def box(self, c, w, h, d, ctop=None):
        x, y, z = w / 2, h / 2, d / 2
        P = [self.v(p) for p in [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z), (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]]
        for idx, cc in (((0, 3, 2, 1), c), ((4, 5, 6, 7), c), ((0, 4, 7, 3), c), ((1, 2, 6, 5), c), ((3, 7, 6, 2), ctop or c), ((0, 1, 5, 4), c)):
            self.face([P[i] for i in idx], cc)

    def tube(self, pts, radii, c, seg=7, colf=None, caps=True):
        """tube along game-space points (current transform), radii per point"""
        from mathutils import Vector
        P = [Vector(p) for p in pts]; rings = []
        for k, p in enumerate(P):
            t = (P[min(k + 1, len(P) - 1)] - P[max(k - 1, 0)]).normalized()
            a = Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))
            u = t.cross(a).normalized(); w = t.cross(u).normalized(); r = radii[k]
            rings.append([self.v(tuple(p + (u * math.cos(2 * math.pi * i / seg) + w * math.sin(2 * math.pi * i / seg)) * r)) for i in range(seg)])
        for k in range(len(rings) - 1):
            cc = colf(k / max(1, len(rings) - 2)) if colf else c
            for i in range(seg):
                j = (i + 1) % seg; self.face([rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]], cc)
        if caps:
            if radii[0] > 1e-4: self.face(list(reversed(rings[0])), colf(0) if colf else c)
            if radii[-1] > 1e-4: self.face(rings[-1], colf(1) if colf else c)

    def slab(self, centre, widths, c, thick=0.01, side=(1, 0, 0), cbot=None, normal=(0, 1, 0), bend=0.0):
        """thin closed blade along centre line (leaf, feather vane, cloth): width per point across `side`, thickness along `normal`;
        bend lifts the edges (cupped leaf)"""
        from mathutils import Vector
        S, Nn = Vector(side).normalized(), Vector(normal).normalized()
        top, bot = [], []
        for p, w in zip(centre, widths):
            p = Vector(p); row_t, row_b = [], []
            for s in (-1, 0, 1):
                q = p + S * (s * w) + Nn * (bend * abs(s) * w)
                row_t.append(self.v(tuple(q + Nn * thick / 2))); row_b.append(self.v(tuple(q - Nn * thick / 2)))
            top.append(row_t); bot.append(row_b)
        n = len(centre)
        for k in range(n - 1):
            for i in range(2):
                self.face([top[k][i], top[k][i + 1], top[k + 1][i + 1], top[k + 1][i]], c)
                self.face([bot[k][i], bot[k + 1][i], bot[k + 1][i + 1], bot[k][i + 1]], cbot or c)
            self.face([top[k][0], top[k + 1][0], bot[k + 1][0], bot[k][0]], cbot or c)
            self.face([top[k][2], bot[k][2], bot[k + 1][2], top[k + 1][2]], cbot or c)
        for k, rev in ((0, True), (n - 1, False)):
            ring = [top[k][0], top[k][1], top[k][2], bot[k][2], bot[k][1], bot[k][0]]
            if centre and widths[k] > 1e-5: self.face(list(reversed(ring)) if rev else ring, cbot or c)

# ----------------------------------------------------------------------------------------------- palette
GREEN, GREEN_D, GREEN_L = C(0x5cae48), C(0x3a7a34), C(0x9ad06a)
WOOD, WOOD_D, WOOD_L = C(0x9a6a3e), C(0x6a4428), C(0xc89a62)
STONE, STONE_D, STONE_L = C(0xa8a6b0), C(0x76747e), C(0xcac8d0)
PAPER, PAPER_D = C(0xf2e2bc), C(0xd2b88a)
RED, GOLD, GOLD_D = C(0xc8463c), C(0xf0c050), C(0xb88a2c)
CLOTH, CLOTH_D = C(0xd8b888), C(0xa88a5c)
IRON, IRON_D = C(0x8c96a4), C(0x5a6270)
GLASS = C(0xd8eef8)
WHITE = C(0xf4f2ee)

# ----------------------------------------------------------------------------------------------- models (b = Builder, g = glow Builder)
def m_herb(b, g):          # 약초 다발: 잎 5장 + 줄기 + 묶은 끈
    for k, (a, tilt, L) in enumerate([(0, 34, 0.30), (72, 46, 0.27), (144, 40, 0.29), (216, 50, 0.25), (288, 38, 0.28)]):
        b.at((0, 0.04, 0), (0, a, tilt))
        cs = [(0, i / 5 * L, 0) for i in range(6)]; ws = [0.014, 0.06, 0.08, 0.075, 0.05, 0.0]
        b.slab(cs, ws, GREEN if k % 2 else GREEN_L, thick=0.008, side=(0, 0, 1), normal=(1, 0, 0), bend=0.35, cbot=GREEN_D)
    b.at((0, 0, 0)); b.tube([(0, 0.0, 0), (0, 0.08, 0)], [0.028, 0.03], GREEN_D, seg=8)
    b.at((0, 0.055, 0)); b.lathe([(0.034, 0), (0.036, 0.008), (0.036, 0.018), (0.034, 0.026)], C(0xd8b060), seg=10)

def m_moss(b, g):          # 이끼 낀 돌: 납작한 돌 + 위를 덮은 이끼 덩어리 3
    b.at((0, 0.07, 0), (0, 20, 0), (0.17, 0.08, 0.13)); b.sphere(STONE, seg=9, rings=5, colf=lambda y: STONE_L if y > 0.3 else STONE if y > -0.3 else STONE_D)
    for x, z, s in [(-0.05, 0.02, 0.09), (0.05, -0.02, 0.08), (0.0, 0.05, 0.06)]:
        b.at((x, 0.12, z), (0, 0, 0), (s, s * 0.55, s)); b.sphere(GREEN, seg=8, rings=4, colf=lambda y: GREEN_L if y > 0.4 else GREEN, bot=-0.2)

def m_feather(b, g):       # 깃털: 굽은 깃대 + 넓은 깃 (바닥에 비스듬히 기댐)
    b.at((0, 0.03, 0), (0, 25, 55))
    pts = [(0, i * 0.05, 0.02 * math.sin(i / 8 * math.pi)) for i in range(9)]
    b.tube(pts, [0.008] * 8 + [0.003], WHITE, seg=5)
    ws = [0.0, 0.03, 0.05, 0.058, 0.06, 0.056, 0.046, 0.03, 0.0]
    b.slab([(p[0], p[1], p[2]) for p in pts], ws, C(0xe8e4e0), thick=0.006, side=(1, 0, 0), normal=(0, 0, 1), bend=0.12, cbot=C(0xc8c4c0))

def m_ember(b, g):         # 불씨: 검게 그을린 숯 덩이 3 + 빛나는 핵
    for x, z, s, r in [(0, 0, 0.09, 0), (0.08, 0.04, 0.06, 40), (-0.07, 0.05, 0.055, 80)]:
        b.at((x, s * 0.75, z), (10, r, 15), (s * 1.2, s * 0.8, s)); b.sphere(C(0x3a2e2c), seg=7, rings=4, colf=lambda y: C(0x5a4038) if y > 0.3 else C(0x2a2224))
    g.at((0.0, 0.13, 0.01), (0, 0, 0), (0.05, 0.06, 0.05)); g.sphere(C(0xffb040), seg=8, rings=5)
    g.at((0.0, 0.2, 0.01), (0, 0, 0), (0.03, 0.06, 0.03)); g.sphere(C(0xffe080), seg=7, rings=4)

def m_lamp(b, g):          # 등불: 금속 받침·기둥·유리·뚜껑·고리 + 불꽃
    b.reset(); b.lathe([(0.07, 0), (0.075, 0.015), (0.065, 0.03)], IRON_D, seg=10)
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4; b.at((math.cos(a) * 0.055, 0.12, math.sin(a) * 0.055)); b.tube([(0, -0.09, 0), (0, 0.09, 0)], [0.008, 0.008], IRON, seg=5)
    b.reset(); b.lathe([(0.05, 0.03), (0.055, 0.12), (0.05, 0.2)], C(0xf0e0a0, 1.0), seg=10)
    b.lathe([(0.075, 0.2), (0.07, 0.215), (0.03, 0.27), (0.0, 0.28)], IRON_D, seg=10)
    b.at((0, 0.3, 0), (90, 0, 0)); b.tube([(math.cos(a) * 0.03, math.sin(a) * 0.03, 0) for a in [i * math.pi / 6 for i in range(-1, 8)]], [0.006] * 9, IRON, seg=5, caps=False)
    g.at((0, 0.1, 0), (0, 0, 0), (0.026, 0.045, 0.026)); g.sphere(C(0xffd070), seg=8, rings=5)

def m_crystal(b, g):       # 결정: 받침 돌 + 큰 결정 1 + 작은 결정 2 (속에 빛)
    b.at((0, 0.03, 0), (0, 0, 0), (0.12, 0.04, 0.1)); b.sphere(STONE_D, seg=8, rings=4, top=0.6)
    for (x, z, h, r, rx, rz) in [(0, 0, 0.3, 0.06, 0, 0), (0.07, 0.02, 0.18, 0.04, 10, -28), (-0.065, -0.01, 0.16, 0.036, -8, 30)]:
        b.at((x, 0.04, z), (rx, 30, rz)); b.lathe([(r * 0.8, 0), (r, h * 0.7), (0.0, h)], C(0xb8a8e8), seg=6, colf=lambda k: C(0xd8ccff) if k else C(0x9888c8))
    g.at((0, 0.13, 0), (0, 0, 0), (0.028, 0.07, 0.028)); g.sphere(C(0xe0c8ff), seg=6, rings=4)

def m_orb(b, g):           # 그림자 구멍/정화한 흔적: 돌 고리 + 가운데 빛나는 구슬
    b.at((0, 0.025, 0)); b.lathe([(0.12, -0.025), (0.14, 0.0), (0.13, 0.03), (0.09, 0.035), (0.075, 0.01)], STONE, seg=12, colf=lambda k: STONE_L if k == 2 else STONE)
    g.at((0, 0.12, 0), (0, 0, 0), 0.07); g.sphere(C(0xd0b0ff), seg=10, rings=6)

def m_shard(b, g):         # 조각: 기울어진 납작한 결정판 + 룬 빛
    b.at((0, 0.0, 0), (8, 20, -14)); b.lathe([(0.07, 0), (0.09, 0.12), (0.06, 0.24), (0.0, 0.3)], C(0xa8a0c8), seg=5, colf=lambda k: C(0xc8c0e8) if k > 0 else C(0x8880a8))
    g.at((0.0, 0.12, 0), (8, 20, -14), (0.03, 0.06, 0.07)); g.sphere(C(0xf0d8ff), seg=6, rings=4)

def m_scroll(b, g):        # 두루마리: 말린 종이 + 붉은 끈 + 양 끝 나무 손잡이
    b.at((0, 0.05, 0), (0, 0, 90)); b.lathe([(0.045, -0.15), (0.05, -0.14), (0.05, 0.14), (0.045, 0.15)], PAPER, seg=12, colf=lambda k: PAPER_D if k != 1 else PAPER)
    for s in (-1, 1):
        b.at((s * 0.17, 0.05, 0), (0, 0, 90)); b.lathe([(0.02, -0.02), (0.03, -0.01), (0.03, 0.01), (0.02, 0.02)], WOOD_D, seg=8)
    b.at((0.0, 0.05, 0), (0, 0, 90)); b.lathe([(0.053, -0.018), (0.053, 0.018)], RED, seg=12)
    b.at((0.0, 0.0, 0.06), (0, 0, 0)); b.slab([(0.0, 0.006, -0.01), (0.02, 0.004, 0.05), (0.05, 0.003, 0.09)], [0.012, 0.011, 0.01], RED, thick=0.004, side=(1, 0, 0))

def m_book(b, g):          # 책: 표지·종이·금 잠금쇠
    b.at((0, 0.035, 0), (0, 18, 0)); b.box(C(0x7a3a32), 0.22, 0.016, 0.28, C(0x8e463a))
    b.at((0.0, 0.02, 0), (0, 18, 0)); b.box(PAPER, 0.21, 0.03, 0.27)
    b.at((0, 0.005, 0), (0, 18, 0)); b.box(C(0x6a302a), 0.22, 0.012, 0.28)
    b.at((-0.112, 0.022, 0), (0, 18, 0)); b.box(C(0x5a2822), 0.012, 0.048, 0.28)
    b.at((0.112, 0.024, 0), (0, 18, 0)); b.box(GOLD, 0.02, 0.05, 0.05)
    b.at((0.0, 0.044, 0), (0, 18, 0)); b.box(GOLD, 0.06, 0.004, 0.06)

def m_tablet(b, g):        # 석판·비문 조각: 깨진 돌판 + 새긴 홈
    b.at((0, 0.12, 0), (-12, 15, 0))
    pts = [(-0.12, 0.0), (0.12, 0.0), (0.13, 0.16), (0.07, 0.22), (0.02, 0.18), (-0.06, 0.25), (-0.12, 0.2)]
    from mathutils import Vector
    top = [b.v((x, y - 0.12, 0.025)) for x, y in pts]; bot = [b.v((x, y - 0.12, -0.025)) for x, y in pts]
    b.face(top, STONE_L); b.face(list(reversed(bot)), STONE_D)
    for i in range(len(pts)): j = (i + 1) % len(pts); b.face([bot[i], bot[j], top[j], top[i]], STONE)
    for k, (x0, x1, y) in enumerate([(-0.08, 0.08, 0.06), (-0.09, 0.05, 0.11), (-0.07, 0.0, 0.16)]):
        b.at((0, 0.12, 0), (-12, 15, 0)); b.xf = b.xf
        q = [b.v((x0, y - 0.12 - 0.008, 0.027)), b.v((x1, y - 0.12 - 0.008, 0.027)), b.v((x1, y - 0.12 + 0.008, 0.027)), b.v((x0, y - 0.12 + 0.008, 0.027))]
        b.face(q, STONE_D)

def m_token(b, g):         # 표식: 끈 달린 둥근 나무 패 + 금 무늬
    b.at((0, 0.02, 0), (90, 0, 0)); b.lathe([(0.0, -0.018), (0.1, -0.018), (0.105, 0.0), (0.1, 0.018), (0.0, 0.018)], WOOD, seg=14, colf=lambda k: WOOD_L if k >= 2 else WOOD_D)
    b.at((0, 0.02, 0), (90, 0, 0)); b.lathe([(0.0, 0.02), (0.055, 0.02), (0.05, 0.024), (0.0, 0.024)], GOLD, seg=6)
    b.at((0, 0.006, -0.11), (0, 0, 0)); b.tube([(-0.05, 0, -0.03), (0, 0.004, 0.0), (0.05, 0, -0.03), (0.08, 0, -0.08)], [0.006] * 4, RED, seg=5)

def m_stone(b, g):         # 채석장 돌: 각진 돌 덩이
    b.at((0, 0.08, 0), (10, 30, 8), (0.16, 0.1, 0.12)); b.sphere(STONE, seg=6, rings=4, colf=lambda y: STONE_L if y > 0.4 else STONE if y > -0.4 else STONE_D)
    b.at((0.11, 0.05, 0.05), (0, 60, 20), (0.06, 0.05, 0.05)); b.sphere(STONE_D, seg=5, rings=3)

def m_cairn(b, g):         # 돌무더기: 점점 작아지는 돌 4개
    y = 0.0
    for k, (s, rot) in enumerate([(0.15, 0), (0.12, 40), (0.09, 80), (0.06, 20)]):
        h = s * 0.45; b.at((0.01 * k, y + h, 0), (0, rot, 4 * k), (s, h, s * 0.85)); y += h * 1.8
        b.sphere(STONE_L if k % 2 else STONE, seg=8, rings=4, colf=lambda yy, k=k: (STONE_L if yy > 0.3 else STONE) if k % 2 == 0 else (C(0xd8d4d8) if yy > 0.3 else STONE_L))

def m_shell(b, g):         # 달팽이 껍데기: 나선 관
    pts, rad = [], []
    for i in range(22):
        t = i / 21; a = t * math.pi * 3.2; r = 0.12 * (1 - t * 0.85)
        pts.append((math.cos(a) * r * 0.9, 0.07 + t * 0.09, math.sin(a) * r)); rad.append(0.07 * (1 - t * 0.85) + 0.004)
    b.reset(); b.tube(pts, rad, C(0xc89058), seg=8, colf=lambda t: C(0xe0b070) if int(t * 10) % 2 else C(0xa87040))

def m_carapace(b, g):      # 딱정벌레·거북 등딱지: 반구 + 가운데 줄 + 테
    b.at((0, 0.0, 0), (0, 0, 0), (0.16, 0.11, 0.2)); b.sphere(C(0x4a7a5a), seg=12, rings=6, bot=0.0, colf=lambda y: C(0x6aa078) if y > 0.7 else C(0x4a7a5a))
    b.at((0, 0.0, 0)); b.lathe([(0.15, 0.0), (0.168, 0.012), (0.15, 0.022)], C(0x3a5a44), seg=12)
    b.at((0, 0.0, 0), (0, 0, 0), (0.012, 0.115, 0.2)); b.sphere(C(0x2e4a38), seg=6, rings=5, bot=0.0)

def m_honey(b, g):         # 꿀단지: 둥근 단지 + 천 뚜껑 + 끈 + 흘러내린 꿀
    b.reset(); b.lathe([(0.06, 0), (0.1, 0.04), (0.11, 0.1), (0.09, 0.16), (0.06, 0.18), (0.065, 0.2)], C(0xe8a030), seg=12, colf=lambda k: C(0xf4c050) if k >= 2 else C(0xc88020))
    b.lathe([(0.075, 0.195), (0.085, 0.21), (0.06, 0.235), (0.0, 0.24)], CLOTH, seg=12)
    b.lathe([(0.07, 0.19), (0.072, 0.2)], RED, seg=12)
    b.at((0.075, 0.12, 0.06), (0, 0, 0), (0.025, 0.05, 0.025)); b.sphere(C(0xf8c040), seg=6, rings=4)

def m_pick(b, g):          # 곡괭이: 나무 자루 + 굽은 쇠 머리 (땅에 눕힘)
    b.at((0, 0.03, 0), (90, 0, 15)); b.tube([(0, -0.2, 0), (0, 0.18, 0)], [0.016, 0.018], WOOD, seg=6)
    b.at((0, 0.03, 0), (90, 0, 15)); b.tube([(-0.17, 0.12, 0), (-0.08, 0.17, 0), (0, 0.18, 0), (0.08, 0.17, 0), (0.17, 0.12, 0)], [0.002, 0.016, 0.022, 0.016, 0.002], IRON, seg=6)

def m_bamboo(b, g):        # 죽순: 겹친 껍질 원뿔
    for k, (r, h, y0, rot) in enumerate([(0.1, 0.16, 0, 0), (0.08, 0.16, 0.07, 30), (0.06, 0.14, 0.14, 60), (0.035, 0.1, 0.2, 90)]):
        b.at((0, y0, 0), (4 * k, rot, 0)); b.lathe([(r, 0), (r * 0.8, h * 0.5), (0.0, h)], C(0xb08a4c) if k % 2 else C(0x8a9a4a), seg=8, colf=lambda kk, k=k: (C(0xd0aa6a) if k % 2 else C(0xa8b860)) if kk else (C(0x906a3c) if k % 2 else C(0x6a7a3a)))

def m_flower(b, g):        # 얼음꽃: 꽃잎 6 + 가운데 + 잎 2
    for i in range(6):
        b.at((0, 0.06, 0), (0, i * 60, 40)); b.slab([(0, 0, 0), (0, 0.09, 0), (0, 0.16, 0), (0, 0.2, 0)], [0.014, 0.06, 0.05, 0.0], C(0xc8e8ff), thick=0.006, side=(0, 0, 1), normal=(1, 0, 0), bend=0.3, cbot=C(0x9ac8ec))
    b.at((0, 0.075, 0), (0, 0, 0), (0.045, 0.035, 0.045)); b.sphere(C(0xfff4c0), seg=8, rings=4)
    for i in range(2):
        b.at((0, 0.01, 0), (0, 40 + i * 180, 70)); b.slab([(0, 0, 0), (0, 0.08, 0), (0, 0.14, 0)], [0.012, 0.035, 0.0], GREEN, thick=0.006, side=(0, 0, 1), normal=(1, 0, 0), bend=0.2, cbot=GREEN_D)
    b.at((0, 0.0, 0)); b.tube([(0, 0.0, 0), (0, 0.065, 0)], [0.008, 0.008], GREEN_D, seg=5)

def m_seedbag(b, g):       # 씨앗 주머니: 묶은 자루 + 쏟아진 씨앗
    b.reset(); b.lathe([(0.0, 0), (0.1, 0.01), (0.12, 0.07), (0.1, 0.14), (0.04, 0.18), (0.035, 0.2), (0.06, 0.23), (0.0, 0.24)], CLOTH, seg=10, colf=lambda k: CLOTH_D if k in (0, 4) else CLOTH)
    b.lathe([(0.042, 0.178), (0.044, 0.192)], RED, seg=10)
    for i, (x, z) in enumerate([(0.13, 0.05), (0.15, 0.0), (0.12, -0.04), (0.17, 0.04)]):
        b.at((x, 0.012, z), (0, i * 50, 0), (0.016, 0.01, 0.01)); b.sphere(C(0xe0c070), seg=5, rings=3)

def m_meat(b, g):          # 고기: 덩어리 + 뼈
    b.at((0, 0.07, 0), (0, 20, 0), (0.13, 0.07, 0.09)); b.sphere(C(0xc8503a), seg=10, rings=5, colf=lambda y: C(0xe07858) if y > 0.5 else C(0xb0402e))
    b.at((0, 0.07, 0), (0, 20, 0)); b.tube([(0.1, 0, 0), (0.2, 0, 0)], [0.018, 0.018], WHITE, seg=6)
    b.at((0.205, 0.07, 0.0), (0, 20, 0), 0.026); b.sphere(WHITE, seg=6, rings=4)

def m_wool(b, g):          # 양털 뭉치: 뭉게 구 6
    for (x, y, z, s) in [(0, 0.07, 0, 0.08), (0.07, 0.05, 0.02, 0.06), (-0.07, 0.05, -0.01, 0.06), (0.02, 0.05, 0.07, 0.055), (-0.02, 0.05, -0.07, 0.055), (0.0, 0.12, 0.0, 0.05)]:
        b.at((x, y, z), (0, 0, 0), s); b.sphere(C(0xf4f0e8), seg=8, rings=5, colf=lambda yy: C(0xffffff) if yy > 0.3 else C(0xd8d2c8))

def m_spool(b, g):         # 실타래: 나무 실패 + 은빛 실
    b.at((0, 0.0, 0)); b.lathe([(0.075, 0), (0.075, 0.018), (0.04, 0.02)], WOOD, seg=12)
    b.lathe([(0.04, 0.12), (0.075, 0.122), (0.075, 0.14)], WOOD, seg=12)
    b.lathe([(0.06, 0.02), (0.068, 0.05), (0.068, 0.09), (0.06, 0.12)], C(0xe0e8f4), seg=12, colf=lambda k: C(0xf4f8ff) if k == 1 else C(0xc0c8d8))
    b.tube([(0.065, 0.06, 0.0), (0.12, 0.03, 0.02), (0.16, 0.004, 0.06)], [0.004] * 3, C(0xe0e8f4), seg=4)

def m_horn(b, g):          # 뿔: 굽은 원뿔 + 고리 무늬
    pts, rad = [], []
    for i in range(10):
        t = i / 9; a = t * math.pi * 0.9
        pts.append((-0.12 + math.sin(a) * 0.14, 0.04 + (1 - math.cos(a)) * 0.07, 0)); rad.append(0.045 * (1 - t) + 0.004)
    b.at((0, 0, 0), (0, 25, 0)); b.tube(pts, rad, C(0xd8c8a8), seg=8, colf=lambda t: C(0xb8a888) if int(t * 9) % 2 else C(0xe8dcc0))

def m_antler(b, g):        # 사슴뿔: 갈래 가지
    b.at((0, 0.02, 0), (0, 30, 0))
    main = [(-0.15, 0.0, 0), (-0.06, 0.03, 0), (0.04, 0.06, 0), (0.14, 0.12, 0)]
    b.tube(main, [0.024, 0.02, 0.016, 0.008], C(0xe8dcc4), seg=6)
    for p, d in [((-0.06, 0.03, 0), (0.0, 0.15, 0.02)), ((0.04, 0.06, 0), (0.08, 0.17, -0.02)), ((-0.1, 0.015, 0), (-0.08, 0.12, 0.03))]:
        b.tube([p, d], [0.014, 0.005], C(0xf4ead4), seg=5)

def m_tail(b, g):          # 꼬리: 마디가 줄어드는 굽은 관 (전갈·도롱뇽)
    pts, rad = [], []
    for i in range(12):
        t = i / 11; a = t * math.pi * 0.8
        pts.append((-0.15 + t * 0.28, 0.035 + math.sin(a) * 0.08 * t, math.sin(t * 3) * 0.03)); rad.append(0.035 * (1 - t * 0.75))
    b.at((0, 0, 0), (0, 20, 0)); b.tube(pts, rad, C(0xd0a060), seg=7, colf=lambda t: C(0xe8bc78) if int(t * 11) % 2 else C(0xb08048))

def m_scale(b, g):         # 비늘: 둥근 방패 꼴 판 + 가운데 능선
    b.at((0, 0.03, 0), (-60, 20, 0))
    cs = [(0, i * 0.045 - 0.12, 0.012 * math.sin(i / 6 * math.pi)) for i in range(7)]; ws = [0.0, 0.08, 0.11, 0.115, 0.1, 0.07, 0.0]
    b.slab(cs, ws, C(0xc84a3a), thick=0.014, side=(1, 0, 0), normal=(0, 0, 1), bend=-0.18, cbot=C(0x8a2a24))
    b.tube([(0, -0.1, 0.012), (0, 0.13, 0.012)], [0.01, 0.004], C(0xe87a5a), seg=5)

def m_ingot(b, g):         # 주괴: 사다리꼴 쇳덩이 2단
    b.at((0, 0.03, 0), (0, 20, 0)); b.lathe([(0.13, -0.03), (0.11, 0.03)], IRON, seg=4)
    b.at((0.02, 0.085, 0.01), (0, 35, 0)); b.lathe([(0.11, -0.025), (0.09, 0.025)], C(0xa8b4c4), seg=4)

def m_ice(b, g):           # 얼음 조각: 각진 블록 2
    b.at((0, 0.09, 0), (8, 25, 6), (0.14, 0.09, 0.11)); b.sphere(C(0xb8e0f8), seg=5, rings=3, colf=lambda y: C(0xe8f8ff) if y > 0.3 else C(0x88c0e8))
    b.at((0.12, 0.05, 0.05), (20, 50, 10), (0.07, 0.05, 0.06)); b.sphere(C(0xc8e8fc), seg=5, rings=3)

def m_logs(b, g):          # 장작 묶음: 통나무 3 + 끈
    for (x, y, z) in [(-0.045, 0.04, 0), (0.045, 0.04, 0), (0.0, 0.11, 0)]:
        b.at((x, y, z), (90, 0, 0)); b.lathe([(0.04, -0.15), (0.042, -0.14), (0.042, 0.14), (0.04, 0.15)], WOOD, seg=8, colf=lambda k: C(0xe0c08a) if k != 1 else WOOD)
    b.at((0, 0.07, 0)); b.lathe([(0.1, -0.01), (0.1, 0.01)], RED, seg=10)

def m_barrel(b, g):        # 기름통: 작은 나무통 + 쇠테
    b.reset(); b.lathe([(0.09, 0), (0.11, 0.08), (0.11, 0.16), (0.09, 0.24)], WOOD, seg=12, colf=lambda k: WOOD_L if k == 1 else WOOD)
    for y in (0.035, 0.205):
        b.lathe([(0.103 if y < 0.1 else 0.1, y - 0.012), (0.106 if y < 0.1 else 0.103, y + 0.012)], IRON_D, seg=12)
    b.lathe([(0.09, 0.24), (0.0, 0.24)], WOOD_D, seg=12)
    b.at((0, 0.245, 0.0)); b.lathe([(0.02, 0), (0.02, 0.02), (0.0, 0.02)], WOOD_D, seg=6)

def m_cloth(b, g):         # 천 조각: 접힌 천 (물결)
    for k in range(2):
        b.at((0, 0.012 + k * 0.022, 0), (0, 25 + k * 30, 0))
        cs = [(0, 0.008 * math.sin(i * 1.4 + k), -0.13 + i * 0.065) for i in range(5)]
        b.slab(cs, [0.11, 0.12, 0.11, 0.12, 0.1], C(0x4a74c8) if k == 0 else C(0x6a90dc), thick=0.012, side=(1, 0, 0), normal=(0, 1, 0), cbot=C(0x2a4a8a))
    b.at((0.1, 0.05, 0.03), (0, 0, 0), (0.02, 0.015, 0.02)); b.sphere(GOLD, seg=6, rings=3)

def m_keepsake(b, g):      # 유품: 작은 상자 + 금 목걸이 로켓
    b.at((0, 0.05, 0), (0, 20, 0)); b.box(C(0x8a4a3a), 0.18, 0.1, 0.13, C(0xa05a48))
    b.at((0, 0.104, 0), (0, 20, 0)); b.box(GOLD, 0.185, 0.012, 0.02)
    b.at((0.0, 0.11, 0.0), (8, 50, 0)); b.lathe([(0.0, -0.008), (0.04, -0.008), (0.042, 0.0), (0.04, 0.008), (0.0, 0.008)], GOLD, seg=10, colf=lambda k: C(0xffe080) if k >= 2 else GOLD_D)
    b.reset(); b.tube([(0.0, 0.118, 0.04), (0.06, 0.115, 0.09), (0.12, 0.06, 0.1), (0.15, 0.005, 0.08)], [0.004] * 4, GOLD, seg=4)

def m_bundle(b, g):        # 보따리: 묶은 천 꾸러미 (퀘스트 대체)
    b.at((0, 0.09, 0), (0, 0, 0), (0.15, 0.09, 0.13)); b.sphere(C(0xc86a4a), seg=10, rings=5, colf=lambda y: C(0xe08a64) if y > 0.4 else C(0xa8503a))
    for s in (-1, 1):
        b.at((s * 0.03, 0.17, 0), (0, 0, s * 35), (0.04, 0.06, 0.03)); b.sphere(C(0xe08a64), seg=6, rings=4)
    b.at((0, 0.165, 0), (0, 0, 0), 0.025); b.sphere(C(0xa8503a), seg=6, rings=4)
    b.at((0, 0.09, 0), (0, 0, 0)); b.lathe([(0.152, -0.015), (0.154, 0.015)], C(0xf0d070), seg=10)

def m_pouch(b, g):         # 가죽 주머니 (재료 대체)
    b.reset(); b.lathe([(0.0, 0), (0.09, 0.01), (0.11, 0.06), (0.09, 0.12), (0.045, 0.15), (0.04, 0.165), (0.07, 0.19), (0.0, 0.2)], C(0x9a643c), seg=10, colf=lambda k: C(0x7a4a2a) if k in (0, 4) else C(0xb07a4c))
    b.lathe([(0.046, 0.148), (0.048, 0.162)], GOLD, seg=10)

def m_vial(b, g):          # 시료 병: 유리병 + 액체 + 코르크 (색조로 액체 색)
    b.at((0, 0, 0), (0, 0, 0)); b.lathe([(0.05, 0), (0.06, 0.02), (0.06, 0.1), (0.03, 0.13), (0.025, 0.16)], GLASS, seg=10, colf=lambda k: C(0x7a3048) if k <= 1 else GLASS)
    b.lathe([(0.026, 0.155), (0.028, 0.19), (0.022, 0.2)], WOOD_L, seg=8)

MODELS = {k[2:]: v for k, v in globals().items() if k.startswith('m_') and callable(v)}

# ----------------------------------------------------------------------------------------------- bake painted light + build objects
def build(name, fn):
    import bpy, bmesh
    out = []
    for part in ('', '__glow'):
        bm = bmesh.new(); col = bm.loops.layers.color.new('Col'); bm.loops.layers.uv.new('UVMap')
        b = Builder(bm, col)
        if part == '': fn(b, _Null())
        else: fn(_Null(), b)
        if not bm.faces: bm.free(); continue
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if part == '':
            # sit on the ground: lowest point -> y 0, centre the footprint
            zs = [v.co.z for v in bm.verts]; xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]
            z0, h = min(zs), max(zs) - min(zs); cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
            for v in bm.verts: v.co.x -= cx; v.co.y -= cy; v.co.z -= z0
            build.shift[name] = (cx, cy, z0, h)
            bm.normal_update()
            for f in bm.faces:
                up = max(0.0, f.normal.z)
                for l in f.loops:
                    t = l.vert.co.z / max(h, 1e-3); k = (0.74 + 0.26 * min(1, t * 1.4)) * (0.92 + 0.12 * up)
                    c = l[col]; l[col] = (min(1, c[0] * k), min(1, c[1] * k), min(1, c[2] * k), 1)
        else:
            cx, cy, z0, h = build.shift[name]
            for v in bm.verts: v.co.x -= cx; v.co.y -= cy; v.co.z -= z0
        for f in bm.faces: f.smooth = True
        me = bpy.data.meshes.new('drop_' + name + part); bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new('drop_' + name + part, me); bpy.context.scene.collection.objects.link(ob)
        if part == '':
            m = ob.modifiers.new('es', 'EDGE_SPLIT'); m.split_angle = math.radians(50)
        out.append(ob)
    return out
build.shift = {}

class _Null:
    def __getattr__(self, k): return lambda *a, **kw: self

def main():
    if '--map' in sys.argv: write_map(set(MODELS)); return
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    obs = []
    for name, fn in MODELS.items(): obs += build(name, fn)
    dg = bpy.context.evaluated_depsgraph_get()
    tris = {}
    for o in obs:
        me = o.evaluated_get(dg).to_mesh(); me.calc_loop_triangles(); tris[o.name] = len(me.loop_triangles); o.evaluated_get(dg).to_mesh_clear()
    worst = max(tris.values())
    for n, t in sorted(tris.items()): print(f'  {n:24s} {t:4d} tris  h {build.shift.get(n[5:], (0, 0, 0, 0))[3]:.2f} m' if '__' not in n else f'  {n:24s} {t:4d} tris')
    assert worst <= 800, ('over budget', worst)
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(TMP, 'drop_items.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'models': sorted(MODELS),
               'height': {n: round(s[3], 3) for n, s in build.shift.items()}}, open(os.path.join(OUT, 'drop_items.glb.json'), 'w'))
    for k, o in enumerate(obs): o.location.x = (k // 1) * 0.6
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'drop_items.blend'), compress=True)
    print(len(MODELS), 'models', len(obs), 'meshes, max', worst, 'tris, glb bytes', len(raw), flush=True)
    write_map(set(MODELS))

if __name__ == '__main__':
    main()
