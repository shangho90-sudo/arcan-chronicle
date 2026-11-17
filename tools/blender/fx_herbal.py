"""한약사 2차 스킬 이펙트·소환물 메시 (Blender bpy, headless, 2026-11-16 '본초 도사').

Usage:  python3 tools/blender/fx_herbal.py   ->  assets/fx/fx_herbal.glb.json  (+ tools/blender/herbal/fx_herbal.blend)

모양이 중요한 것(탕관·호리병·천년삼 동자·영지 사슴·약초꽃·두루마리)과 작은 소품을 절차로 만든다. 텍스처 없음 — 색은 정점 색,
빛(섬광·고리·김·기운)은 게임 셰이더(js/herbalfx.js). 움직임(성장·공전·깡충·발구르기·뿌리 뻗기)은 모두 게임에서: 여기서는 모양만.
소환물은 부위별 메시(원점 = 관절)로 나눠 게임이 절차로 움직인다(간단한 리그 대신).

Meshes (game axes: +Y up, +Z forward, metres; 게임이 크기를 정함)
  hb_pot        작은 탕관: 바닥 y 0, 높이 0.5, 몸 반지름 0.3, 양쪽 손잡이, 주둥이 +x       hb_lid   뚜껑(꼭지 포함, 바닥 y 0)
  hb_gourd      호리병: 바닥 y 0 .. 마개 y 1, 허리 끈(붉은 매듭)                       hb_pill  금빛 환약(반지름 1, 가운데 띠)
  hb_gs_body    천년삼 동자 몸: 통통한 뿌리 몸 + 둥근 얼굴(눈·볼), 발 y 0 .. 머리 꼭대기 y 1, 앞 +z
  hb_gs_leaf    머리 위 인삼 잎(다섯 잎 + 붉은 열매), 원점 = 줄기 밑      hb_gs_limb  짧은 뿌리 팔다리(원점 = 어깨/엉덩이, -y 쪽으로 0.32)
  hb_deer_body  사슴 몸통(나무껍질·이끼, 원점 = 몸 가운데, 길이 z -0.55..0.55)     hb_deer_head 목+머리(원점 = 목 밑, 주둥이 +z, 귀)
  hb_deer_leg   뿌리 다리(원점 = 엉덩이, 발끝 y -0.62)       hb_deer_antler 뿌리 뿔 + 영지 버섯 갓(원점 = 뿔 밑, 한쪽; 게임이 거울로)
  hb_bud        보라 꽃봉오리(밑 y 0 .. 0.3)   hb_petal 꽃잎 하나(밑 원점, +y로 0.32, 살짝 오목)   hb_stem 줄기 + 잎 두 장(y 0..0.42)
  hb_herb       약초 한 포기(잎 7장, y 0..0.5)   hb_leaf 잎 하나(xy, 밑 원점 +y 1)   hb_moxa 쑥뜸 원뿔(y 0..1)
  hb_scroll_rod 두루마리 축(x -0.5..0.5, 금 마개)   hb_needle 침(x 0..1, 머리 고리 -x)
  hb_root       뿌리 한 가닥(밑 y 0 굵게 .. 끝 y 1 가늘게, 살짝 휨)   hb_dragon 청룡 머리(원점 = 목, 주둥이 +z, 뿔·수염·갈기)
  hb_wing       주작 날개 하나(원점 = 어깨, +x 로 1, 깃털 끝 주황->노랑)   hb_bird 주작 몸(머리 +z, 꼬리깃)
  hb_pillar     낮은 육각 돌기둥(y 0..1, 황토)   hb_shell 거북 등껍질 판(반지름 1 낮은 돔, 육각 무늬 정점 색)
  hb_plate      약갑 판(나무껍질 + 잎맥, 휘어진 판 x ±0.5 y 0..1; 정점 색 A 채널 아님 — 잎맥은 밝은 옥색)
  (fx2 2026-11-16) hb_beam 빛기둥 열린 원통(반지름 1, y 0..1, uv = 둘레·높이)   hb_star 통통한 오각 별(반지름 1)   hb_lotus 연꽃(밑 y 0, 지름 약 1)
  hb_drop 물방울(y 0..1)   hb_flame 불꽃 혀(y 0..1, 노랑 -> 빨강)
json: {b64}
"""
import os, sys, math, json, base64, random
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm as FP
from fx_pharm import V, lathe, new_obj
SRC = os.path.join(HERE, 'herbal'); os.makedirs(SRC, exist_ok=True)

def mix(a, b, k): return tuple(a[i] + (b[i] - a[i]) * k for i in range(3)) + (1,)
CLAY, CLAY_LO, CLAY_HI, OCHRE = (0.55, 0.30, 0.17, 1), (0.36, 0.18, 0.10, 1), (0.74, 0.46, 0.26, 1), (0.92, 0.66, 0.26, 1)
GOLD, GOLD_HI = (1.0, 0.76, 0.26, 1), (1.0, 0.93, 0.6, 1)
IVORY, IVORY_LO, CHEEK = (0.98, 0.90, 0.72, 1), (0.84, 0.70, 0.50, 1), (1.0, 0.62, 0.58, 1)
LEAF, LEAF_LO, LEAF_HI, BERRY = (0.30, 0.70, 0.30, 1), (0.16, 0.44, 0.20, 1), (0.56, 0.86, 0.42, 1), (0.92, 0.16, 0.14, 1)
BARK, BARK_LO, MOSS = (0.46, 0.32, 0.20, 1), (0.30, 0.20, 0.12, 1), (0.40, 0.62, 0.30, 1)
LING, LING_HI = (0.62, 0.18, 0.10, 1), (0.95, 0.62, 0.30, 1)
JADE, JADE_HI, TEAL = (0.24, 0.72, 0.56, 1), (0.62, 0.98, 0.82, 1), (0.10, 0.62, 0.62, 1)
PURP, PURP_LO, PURP_HI = (0.60, 0.30, 0.86, 1), (0.36, 0.14, 0.56, 1), (0.92, 0.70, 1.0, 1)
STONE, STONE_LO = (0.80, 0.64, 0.36, 1), (0.54, 0.40, 0.22, 1)
FIRE, FIRE_HI, FIRE_LO = (1.0, 0.42, 0.12, 1), (1.0, 0.86, 0.36, 1), (0.80, 0.12, 0.08, 1)
SAPH, SAPH_HI, SAPH_LO = (0.18, 0.44, 0.92, 1), (0.56, 0.84, 1.0, 1), (0.08, 0.20, 0.52, 1)
DARK, WHITE = (0.08, 0.06, 0.07, 1), (1, 1, 1, 1)

def ball(bm, col, c, r, colf, seg=14, rows=9):
    """ellipsoid at c, radii r (rx, ry, rz); colf(nx, ny, nz) -> colour"""
    rings = []
    for j in range(rows + 1):
        th = math.pi * j / rows; ring = []
        for i in range(seg):
            a = 2 * math.pi * i / seg; nx, ny, nz = math.sin(th) * math.cos(a), math.cos(th), math.sin(th) * math.sin(a)
            ring.append((bm.verts.new(V(c[0] + nx * r[0], c[1] + ny * r[1], c[2] + nz * r[2])), (nx, ny, nz)))
        rings.append(ring)
    for j in range(rows):
        for i in range(seg):
            k = (i + 1) % seg; vs = (rings[j][i], rings[j + 1][i], rings[j + 1][k], rings[j][k])
            try: f = bm.faces.new([v for v, _ in vs])
            except ValueError: continue
            for l, (_, n) in zip(f.loops, vs): l[col] = colf(*n)

def tube3(bm, col, pts, rad, colf, seg=8):
    """round bar along a 3D polyline (game axes); rad per point; colf(k along 0..1, side 0..1) -> colour; closed ends"""
    n = len(pts); rings = []; prevN = None
    for i, p in enumerate(pts):
        a, b = pts[max(0, i - 1)], pts[min(n - 1, i + 1)]; t = [b[k] - a[k] for k in range(3)]; m = math.sqrt(sum(x * x for x in t)) or 1; t = [x / m for x in t]
        ref = prevN or ([1, 0, 0] if abs(t[0]) < 0.9 else [0, 0, 1])   # parallel transport: keep the previous side vector (no twisting rings)
        d = sum(ref[k] * t[k] for k in range(3)); u = [ref[k] - t[k] * d for k in range(3)]; mu = math.sqrt(sum(x * x for x in u)) or 1; u = [x / mu for x in u]
        w = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]]; prevN = u
        r = rad[i] if isinstance(rad, (list, tuple)) else rad
        rings.append([bm.verts.new(V(*[p[k] + (u[k] * math.cos(2 * math.pi * s / seg) + w[k] * math.sin(2 * math.pi * s / seg)) * r for k in range(3)])) for s in range(seg)])
    for i in range(n - 1):
        for s in range(seg):
            j = (s + 1) % seg; f = bm.faces.new((rings[i][s], rings[i][j], rings[i + 1][j], rings[i + 1][s]))
            for l in f.loops: l[col] = colf(i / max(1, n - 2), s / seg)
    for ring, rev in ((rings[0], True), (rings[-1], False)):
        f = bm.faces.new(list(reversed(ring)) if rev else ring)
        for l in f.loops: l[col] = colf(0 if rev else 1, 0)

def leafshape(bm, col, base, ax, side, length, width, c0, c1, th=0.012, curl=0.0, n=7):
    """flat leaf: from base along unit ax, widening along side; c0 at the midrib -> c1 at the edge; thin double face"""
    L, R = [], []
    for i in range(n + 1):
        k = i / n; w = width * math.sin(math.pi * k) ** 0.8 * (1 - 0.15 * k)
        bend = curl * k * k
        p = [base[j] + ax[j] * length * k for j in range(3)]; p[1] += bend
        L.append([p[j] + side[j] * w for j in range(3)]); R.append([p[j] - side[j] * w for j in range(3)])
    mid = [[base[j] + ax[j] * length * (i / n) + (curl * (i / n) ** 2 if j == 1 else 0) + (th if j == 1 else 0) for j in range(3)] for i in range(n + 1)]
    for i in range(n):
        for a, b in ((L, mid), (mid, R)):
            vs = [bm.verts.new(V(*q)) for q in (a[i], a[i + 1], b[i + 1], b[i])]
            try: f = bm.faces.new(vs)
            except ValueError: continue
            for l, q in zip(f.loops, (a[i], a[i + 1], b[i + 1], b[i])): l[col] = c0 if q in mid else c1

# ------------------------------------------------------------------ props
def pot(bm, col, uvl):
    P = [(0.0, 0.0), (0.16, 0.0), (0.24, 0.04), (0.30, 0.13), (0.31, 0.24), (0.28, 0.34), (0.22, 0.41), (0.19, 0.44), (0.21, 0.46), (0.21, 0.48), (0.17, 0.48), (0.15, 0.40), (0.0, 0.40)]
    lathe(bm, col, P, 22, lambda k, p: OCHRE if k in (4,) else CLAY_HI if k in (7, 8) else CLAY_LO if k < 2 else CLAY)
    for s in (-1, 1): tube3(bm, col, [(s * 0.28, 0.34, -0.06), (s * 0.37, 0.31, -0.06), (s * 0.37, 0.24, -0.06), (s * 0.29, 0.20, -0.06)], 0.022, lambda k, a: CLAY_LO, 6)
    tube3(bm, col, [(0.27, 0.26, 0.06), (0.36, 0.33, 0.06), (0.42, 0.40, 0.06)], [0.05, 0.035, 0.028], lambda k, a: CLAY, 8)

def lid(bm, col, uvl):
    lathe(bm, col, [(0.0, 0.0), (0.2, 0.0), (0.2, 0.02), (0.15, 0.06), (0.06, 0.08), (0.04, 0.1), (0.055, 0.13), (0.0, 0.145)], 18, lambda k, p: OCHRE if k >= 4 else CLAY)

def gourd(bm, col, uvl):
    P = [(0.0, 0.0), (0.18, 0.02), (0.30, 0.12), (0.33, 0.26), (0.28, 0.40), (0.16, 0.49), (0.12, 0.53), (0.15, 0.59), (0.21, 0.68), (0.20, 0.79), (0.13, 0.87), (0.07, 0.9), (0.06, 0.94), (0.075, 0.95), (0.07, 1.0), (0.0, 1.0)]
    lathe(bm, col, P, 20, lambda k, p: (0.55, 0.30, 0.12, 1) if k >= 12 else mix(OCHRE, (0.98, 0.84, 0.48, 1), 0.5 + 0.5 * math.sin(k)) if k < 11 else OCHRE)
    tube3(bm, col, [(math.cos(a) * 0.125, 0.53, math.sin(a) * 0.125) for a in [i / 12 * 6.283 for i in range(13)]], 0.016, lambda k, a: (0.82, 0.12, 0.10, 1), 6)
    tube3(bm, col, [(0.12, 0.53, 0), (0.18, 0.44, 0.02), (0.2, 0.34, 0.0)], 0.014, lambda k, a: (0.82, 0.12, 0.10, 1), 5)

def pill(bm, col, uvl):
    ball(bm, col, (0, 0, 0), (1, 1, 1), lambda nx, ny, nz: GOLD_HI if abs(ny) < 0.12 else mix(GOLD, GOLD_HI, max(0, ny) * 0.6), 18, 12)

def moxa(bm, col, uvl):
    lathe(bm, col, [(0.0, 0.0), (0.42, 0.0), (0.36, 0.25), (0.26, 0.55), (0.14, 0.82), (0.05, 0.96), (0.0, 1.0)], 14, lambda k, p: (1.0, 0.5, 0.15, 1) if k >= 4 else (0.58, 0.62, 0.42, 1) if k else (0.40, 0.42, 0.30, 1))

def scroll_rod(bm, col, uvl):
    tube3(bm, col, [(-0.5, 0, 0), (0.5, 0, 0)], 0.045, lambda k, a: (0.62, 0.32, 0.16, 1), 12)
    for s in (-1, 1): tube3(bm, col, [(s * 0.5, 0, 0), (s * 0.56, 0, 0), (s * 0.6, 0, 0)], [0.07, 0.07, 0.04], lambda k, a: GOLD, 12)

def needle(bm, col, uvl):
    tube3(bm, col, [(0.0, 0, 0), (0.18, 0, 0), (0.85, 0, 0), (1.0, 0, 0)], [0.028, 0.02, 0.012, 0.002], lambda k, a: GOLD if k < 0.3 else (0.94, 0.95, 1.0, 1), 6)
    tube3(bm, col, [(-0.06 + 0.05 * math.cos(a), 0.05 * math.sin(a), 0) for a in [i / 10 * 6.283 for i in range(11)]], 0.012, lambda k, a: GOLD, 5)

def root(bm, col, uvl):
    pts = [(0.0, 0.0, 0.0), (0.04, 0.2, 0.02), (0.09, 0.42, 0.0), (0.08, 0.62, -0.04), (0.02, 0.82, -0.02), (-0.03, 1.0, 0.0)]
    tube3(bm, col, pts, [0.16, 0.13, 0.1, 0.075, 0.045, 0.01], lambda k, a: mix(BARK_LO, BARK, k) if a < 0.5 else mix(BARK, (0.62, 0.46, 0.28, 1), k), 8)
    for (y, s) in ((0.36, 1), (0.6, -1)): tube3(bm, col, [(0.07, y, 0), (0.07 + 0.12 * s, y + 0.1, 0.05), (0.07 + 0.18 * s, y + 0.18, 0.08)], [0.04, 0.025, 0.006], lambda k, a: BARK, 5)

def herb(bm, col, uvl):
    tube3(bm, col, [(0, 0, 0), (0.0, 0.25, 0.01), (0.01, 0.5, 0)], [0.012, 0.009, 0.004], lambda k, a: LEAF_LO, 5)
    for i in range(7):
        a = i * 2.4; y = 0.08 + i * 0.055; ax = (math.cos(a) * 0.8, 0.55, math.sin(a) * 0.8); m = math.sqrt(sum(x * x for x in ax)); ax = tuple(x / m for x in ax)
        side = (-math.sin(a), 0, math.cos(a)); leafshape(bm, col, (0, y, 0), ax, side, 0.2 - i * 0.012, 0.055, LEAF_HI, LEAF, curl=-0.03)

def leaf(bm, col, uvl):
    leafshape(bm, col, (0, 0, 0), (0, 1, 0), (1, 0, 0), 1.0, 0.36, LEAF_HI, LEAF, th=0.02, curl=0.0, n=9)

def bud(bm, col, uvl):
    lathe(bm, col, [(0.0, 0.0), (0.05, 0.02), (0.09, 0.1), (0.085, 0.2), (0.05, 0.27), (0.0, 0.3)], 12, lambda k, p: LEAF if k == 0 else mix(PURP_LO, PURP_HI, k / 4))

def petal(bm, col, uvl):
    leafshape(bm, col, (0, 0, 0), (0, 0.92, 0.39), (1, 0, 0), 0.32, 0.12, PURP_HI, PURP, th=0.015, curl=-0.04, n=7)

def stem(bm, col, uvl):
    tube3(bm, col, [(0, 0, 0), (0.02, 0.2, 0), (0, 0.42, 0)], [0.018, 0.014, 0.01], lambda k, a: LEAF_LO, 6)
    for s in (-1, 1): leafshape(bm, col, (0, 0.12 + (s + 1) * 0.04, 0), (s * 0.85, 0.5, 0.1), (0, 0, 1), 0.18, 0.06, LEAF_HI, LEAF, curl=-0.03)

# ------------------------------------------------------------------ 천년삼 동자 (ginseng child)
def gs_body(bm, col, uvl):
    # chubby root body: wide belly, little neck, round head; root rings; tiny root tail at the bottom
    def bc(nx, ny, nz): return IVORY_LO if (ny < -0.2 and (int((ny + 1) * 9) % 2 == 0)) else mix(IVORY_LO, IVORY, 0.4 + 0.6 * max(0, ny + 0.3))
    ball(bm, col, (0, 0.30, 0), (0.30, 0.30, 0.27), bc, 16, 10)
    ball(bm, col, (0, 0.72, 0), (0.26, 0.24, 0.24), lambda nx, ny, nz: mix(IVORY, (1, 0.95, 0.82, 1), max(0, ny)), 16, 10)
    for s in (-1, 1):
        ball(bm, col, (s * 0.09, 0.74, 0.215), (0.035, 0.05, 0.02), lambda *a: DARK, 8, 6)          # eyes
        ball(bm, col, (s * 0.085, 0.76, 0.23), (0.012, 0.014, 0.008), lambda *a: WHITE, 6, 4)       # eye shine
        ball(bm, col, (s * 0.16, 0.66, 0.18), (0.05, 0.03, 0.02), lambda *a: CHEEK, 8, 5)           # cheeks
    tube3(bm, col, [(-0.035, 0.635, 0.225), (0.0, 0.62, 0.232), (0.035, 0.635, 0.225)], 0.01, lambda *a: (0.6, 0.22, 0.2, 1), 5)   # smile
    tube3(bm, col, [(0, 0.02, 0), (0.03, -0.06, 0.02), (0.08, -0.1, 0.05)], [0.05, 0.025, 0.006], lambda *a: IVORY_LO, 6)            # root tail

def gs_leaf(bm, col, uvl):
    tube3(bm, col, [(0, 0, 0), (0.0, 0.12, 0.0), (0.02, 0.2, 0)], [0.018, 0.014, 0.01], lambda *a: LEAF_LO, 6)
    for i in range(5):
        a = i / 5 * 6.283 + 0.3; ax = (math.cos(a) * 0.85, 0.5, math.sin(a) * 0.85); m = math.sqrt(sum(x * x for x in ax)); ax = tuple(x / m for x in ax)
        leafshape(bm, col, (0.02, 0.2, 0), ax, (-math.sin(a), 0, math.cos(a)), 0.2, 0.07, LEAF_HI, LEAF, curl=-0.03)
    for k in range(5): ball(bm, col, (0.02 + math.cos(k * 1.3) * 0.025, 0.24 + (k % 2) * 0.025, math.sin(k * 1.3) * 0.025), (0.022, 0.022, 0.022), lambda *a: BERRY, 8, 6)

def gs_limb(bm, col, uvl):
    tube3(bm, col, [(0, 0, 0), (0.0, -0.12, 0.01), (0.01, -0.24, 0.02), (0.0, -0.32, 0.03)], [0.06, 0.05, 0.04, 0.025], lambda k, a: mix(IVORY, IVORY_LO, k), 7)
    tube3(bm, col, [(0.0, -0.26, 0.02), (0.05, -0.33, 0.04), (0.07, -0.36, 0.04)], [0.02, 0.012, 0.004], lambda *a: IVORY_LO, 5)

# ------------------------------------------------------------------ 영지·녹각수호령 (lingzhi deer)
def deer_body(bm, col, uvl):
    def bc(nx, ny, nz): return MOSS if ny > 0.8 and math.sin(nz * 9 + nx * 3) > 0.2 else mix(BARK_LO, BARK, 0.5 + 0.5 * ny) if math.sin(nz * 14 + ny * 3) > -0.5 else BARK_LO
    ball(bm, col, (0, 0, 0), (0.30, 0.28, 0.56), bc, 16, 10)
    for i in range(5): tube3(bm, col, [(-0.2 + i * 0.1, 0.18, -0.5 + i * 0.22), (-0.24 + i * 0.1, 0.0, -0.45 + i * 0.22), (-0.2 + i * 0.1, -0.2, -0.5 + i * 0.22)], 0.03, lambda *a: BARK_LO, 5)   # root ribs
    tube3(bm, col, [(0, 0.12, -0.52), (0, 0.24, -0.66), (0, 0.32, -0.72)], [0.07, 0.05, 0.02], lambda *a: MOSS, 6)   # leafy tail

def deer_head(bm, col, uvl):
    tube3(bm, col, [(0, 0, 0), (0, 0.18, 0.06), (0, 0.34, 0.12)], [0.15, 0.12, 0.11], lambda k, a: mix(BARK, BARK_LO, a), 8)
    ball(bm, col, (0, 0.42, 0.18), (0.13, 0.13, 0.17), lambda nx, ny, nz: mix(BARK, (0.66, 0.50, 0.32, 1), max(0, nz)), 12, 8)
    ball(bm, col, (0, 0.38, 0.33), (0.08, 0.075, 0.1), lambda nx, ny, nz: (0.78, 0.64, 0.44, 1), 10, 6)   # muzzle
    ball(bm, col, (0, 0.40, 0.42), (0.03, 0.025, 0.02), lambda *a: DARK, 6, 4)
    for s in (-1, 1):
        ball(bm, col, (s * 0.085, 0.46, 0.26), (0.025, 0.03, 0.02), lambda *a: DARK, 6, 4)
        ball(bm, col, (s * 0.08, 0.475, 0.275), (0.008, 0.01, 0.006), lambda *a: WHITE, 5, 4)
        leafshape(bm, col, (s * 0.1, 0.5, 0.12), (s * 0.85, 0.45, -0.2), (0, 0.2, 1), 0.16, 0.05, MOSS, LEAF, th=0.01)   # leaf ears

def deer_leg(bm, col, uvl):
    tube3(bm, col, [(0, 0, 0), (0.0, -0.22, 0.02), (0.0, -0.44, -0.02), (0.0, -0.62, 0.02)], [0.12, 0.085, 0.07, 0.06], lambda k, a: mix(BARK, BARK_LO, k), 7)
    for s in (-1, 1): tube3(bm, col, [(0, -0.58, 0.02), (s * 0.06, -0.62, 0.08), (s * 0.1, -0.62, 0.12)], [0.03, 0.02, 0.006], lambda *a: BARK_LO, 5)   # root toes

def deer_antler(bm, col, uvl):
    main = [(0, 0, 0), (0.06, 0.16, -0.02), (0.14, 0.32, -0.08), (0.2, 0.48, -0.12), (0.22, 0.62, -0.1)]
    tube3(bm, col, main, [0.045, 0.04, 0.03, 0.022, 0.012], lambda k, a: mix(BARK, (0.66, 0.50, 0.32, 1), k), 6)
    br = [[(0.1, 0.24, -0.05), (0.2, 0.3, 0.02), (0.28, 0.32, 0.08)], [(0.17, 0.42, -0.1), (0.1, 0.55, -0.2), (0.06, 0.66, -0.24)]]
    for b in br: tube3(bm, col, b, [0.025, 0.018, 0.008], lambda *a: BARK, 5)
    def cap(c, r, tilt):   # lingzhi: kidney-shaped glossy cap, red-brown with a pale growing rim
        def cc(nx, ny, nz): d = math.hypot(nx, nz); return LING_HI if d > 0.82 else mix((0.32, 0.08, 0.05, 1), LING, max(0, ny) + 0.3)
        ball(bm, col, c, (r, r * 0.28, r * 0.8), cc, 14, 6)
    cap((0.24, 0.64, -0.1), 0.11, 0); cap((0.29, 0.34, 0.09), 0.08, 0); cap((0.06, 0.68, -0.24), 0.08, 0)

# ------------------------------------------------------------------ 오행 (five phases)
def dragon(bm, col, uvl):
    def sc(nx, ny, nz): return JADE_HI if ny < -0.3 else mix(TEAL, JADE, 0.5 + 0.5 * ny) if math.sin(nz * 18) > -0.3 else TEAL
    ball(bm, col, (0, 0.12, 0.1), (0.2, 0.18, 0.26), sc, 14, 9)                       # skull
    ball(bm, col, (0, 0.06, 0.36), (0.13, 0.09, 0.2), sc, 12, 8)                      # snout
    ball(bm, col, (0, -0.04, 0.32), (0.11, 0.05, 0.17), lambda *a: JADE_HI, 10, 6)    # jaw
    for s in (-1, 1):
        ball(bm, col, (s * 0.11, 0.2, 0.22), (0.05, 0.04, 0.04), lambda *a: (1.0, 0.86, 0.3, 1), 8, 6)   # golden eyes
        ball(bm, col, (s * 0.125, 0.205, 0.245), (0.018, 0.024, 0.012), lambda *a: DARK, 6, 4)
        tube3(bm, col, [(s * 0.08, 0.28, 0.0), (s * 0.12, 0.42, -0.12), (s * 0.14, 0.5, -0.28), (s * 0.12, 0.56, -0.38)], [0.035, 0.028, 0.018, 0.005], lambda *a: (0.96, 0.88, 0.62, 1), 6)   # antler horns
        tube3(bm, col, [(s * 0.1, 0.04, 0.5), (s * 0.24, 0.02, 0.6), (s * 0.4, -0.06, 0.58), (s * 0.52, -0.14, 0.48)], [0.012, 0.01, 0.007, 0.002], lambda *a: (0.98, 0.9, 0.5, 1), 5)   # whiskers
    for i in range(5): tube3(bm, col, [(0, 0.26 - i * 0.05, -0.08 - i * 0.07), (0, 0.38 - i * 0.04, -0.2 - i * 0.07), (0, 0.4 - i * 0.05, -0.3 - i * 0.07)], [0.04, 0.025, 0.004], lambda *a: JADE_HI, 5)   # mane
    for s in (-1, 1): ball(bm, col, (s * 0.05, 0.0, 0.48), (0.015, 0.03, 0.015), lambda *a: WHITE, 6, 4)   # fangs

def bird(bm, col, uvl):
    ball(bm, col, (0, 0, 0), (0.16, 0.14, 0.32), lambda nx, ny, nz: mix(FIRE_LO, FIRE, 0.5 + 0.5 * ny), 12, 8)
    ball(bm, col, (0, 0.08, 0.32), (0.1, 0.1, 0.12), lambda nx, ny, nz: mix(FIRE, FIRE_HI, max(0, ny)), 10, 7)
    tube3(bm, col, [(0, 0.06, 0.42), (0, 0.04, 0.5), (0, 0.02, 0.56)], [0.035, 0.02, 0.003], lambda *a: (1.0, 0.82, 0.3, 1), 5)
    for s in (-1, 0, 1): tube3(bm, col, [(0, 0.15, 0.32), (s * 0.05, 0.28, 0.26), (s * 0.08, 0.34, 0.16)], [0.02, 0.012, 0.003], lambda *a: FIRE_HI, 5)   # crest
    for s in (-1, 0, 1): tube3(bm, col, [(0, 0, -0.28), (s * 0.12, 0.02, -0.6), (s * 0.22, 0.0, -0.9), (s * 0.24, -0.04, -1.05)], [0.05, 0.04, 0.025, 0.004], lambda k, a: mix(FIRE, FIRE_HI, k), 6)

def wing(bm, col, uvl):
    # broad feathered wing: a fan of 7 long feathers from the shoulder to +x, tips sweeping back (-z)
    for i in range(7):
        k = i / 6; a = -0.15 - k * 0.9
        ax = (math.cos(a), 0.05, math.sin(a)); L = 0.75 + 0.3 * math.sin(k * math.pi) + 0.1 * (1 - k)
        leafshape(bm, col, (0.05, 0, 0), ax, (-math.sin(a) * 0.2, 1, math.cos(a) * 0.2), L, 0.1, mix(FIRE_LO, FIRE, 0.4), mix(FIRE, FIRE_HI, k), th=0.01, n=8)

def pillar(bm, col, uvl):
    P = [(0.0, 0.0), (0.5, 0.0), (0.5, 0.55), (0.46, 0.75), (0.38, 0.92), (0.2, 1.0), (0.0, 1.0)]
    lathe(bm, col, P, 6, lambda k, p: mix(STONE_LO, STONE, k / 4) if k < 5 else (1.0, 0.82, 0.36, 1))

def shell(bm, col, uvl):
    def sc(nx, ny, nz):
        x, z = nx * 3.2, nz * 3.2; q = (x + z * 0.577) % 1.4; r = (z * 1.155) % 1.4
        edge = min(abs(q - 0.7), abs(r - 0.7)) < 0.09
        return SAPH_HI if edge else mix(SAPH_LO, SAPH, 0.5 + 0.5 * ny)
    ball(bm, col, (0, 0, 0), (1.0, 0.32, 1.0), sc, 24, 8)

def plate(bm, col, uvl):
    # curved bark guard x -0.5..0.5, y 0..1, bulging +z; veins = bright jade lines
    NX, NY = 8, 10
    vs = [[None] * (NY + 1) for _ in range(NX + 1)]
    for i in range(NX + 1):
        for j in range(NY + 1):
            u, v = i / NX - 0.5, j / NY
            w = 0.5 * (1 - 0.35 * (v - 0.5) ** 2 * 4)
            x = u * 2 * w; z = 0.18 * math.cos(u * 2.4) * (1 - (v - 0.5) ** 2) ; vs[i][j] = (x, v, z, u, v)
    for i in range(NX):
        for j in range(NY):
            q = [vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]]
            f = bm.faces.new([bm.verts.new(V(p[0], p[1], p[2])) for p in q])
            for l, p in zip(f.loops, q):
                u, v = p[3], p[4]; vein = abs(u) < 0.04 or abs(abs(u) - (v - 0.15) * 0.45) < 0.035 and v > 0.2
                l[col] = JADE_HI if vein else mix((0.20, 0.46, 0.34, 1), JADE, 0.4 + 0.6 * v)


# ------------------------------------------------------------------ fx2 (2026-11-16) 이펙트 메시: 빛기둥·별·연꽃·물방울·불꽃 혀
def beam(bm, col, uvl):
    """열린 원통 빛기둥: 반지름 1, y 0..1, uv.x = 둘레 0..1, uv.y = 높이 0..1 (게임 셰이더가 줄무늬·위쪽 흐림을 그림)"""
    seg, rows = 20, 4; vs = [[bm.verts.new(V(math.cos(2 * math.pi * i / seg), j / rows, math.sin(2 * math.pi * i / seg))) for i in range(seg + 1)] for j in range(rows + 1)]
    for j in range(rows):
        for i in range(seg):
            q = (vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]); uv = ((i / seg, j / rows), ((i + 1) / seg, j / rows), ((i + 1) / seg, (j + 1) / rows), (i / seg, (j + 1) / rows))
            f = bm.faces.new(q)
            for l, t in zip(f.loops, uv): l[uvl].uv = t; l[col] = WHITE

def star(bm, col, uvl):
    """통통한 오각 별(씰 느낌 '팡' 별): 반지름 1, 두께 ±0.28, 앞 +z, 가운데 밝은 금 -> 끝 주황빛 금"""
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5; r = 1.0 if i % 2 == 0 else 0.48; pts.append((math.cos(a) * r, math.sin(a) * r))
    fr, bk = bm.verts.new(V(0, 0, 0.28)), bm.verts.new(V(0, 0, -0.28)); rim = [bm.verts.new(V(x, y, 0)) for x, y in pts]
    for i in range(10):
        a, b = rim[i], rim[(i + 1) % 10]
        for order in ((fr, a, b), (bk, b, a)):
            f = bm.faces.new(order)
            for l in f.loops: l[col] = GOLD_HI if l.vert in (fr, bk) else (GOLD if l.vert is rim[i] and i % 2 else (1.0, 0.62, 0.18, 1))

def lotus(bm, col, uvl):
    """연꽃 한 송이(백초귀원 빛의 꽃·신농백초원 가장자리): 바깥 꽃잎 8 + 안 꽃잎 6 + 금 꽃술, 밑 y 0, 지름 약 1"""
    for ring, (n, L, W, tilt, c0, c1) in enumerate(((8, 0.5, 0.17, 0.95, (1.0, 0.86, 0.94, 1), (1.0, 0.62, 0.80, 1)), (6, 0.36, 0.14, 0.45, (1.0, 0.96, 0.98, 1), (1.0, 0.78, 0.88, 1)))):
        for i in range(n):
            a = 2 * math.pi * (i + 0.5 * ring) / n; ax = (math.cos(a) * math.sin(tilt), math.cos(tilt), math.sin(a) * math.sin(tilt)); side = (-math.sin(a), 0, math.cos(a))
            leafshape(bm, col, (0, 0.04 + 0.03 * ring, 0), ax, side, L, W, c0, c1, th=0.012, curl=0.05, n=7)
    ball(bm, col, (0, 0.1, 0), (0.1, 0.06, 0.1), lambda x, y, z: GOLD_HI if y > 0 else GOLD, 10, 6)

def drop(bm, col, uvl):
    """물방울(현무약해 물보라): 밑 y 0 둥근 몸 .. 끝 y 1 뾰족"""
    lathe(bm, col, [(0.0, 0.0), (0.28, 0.06), (0.38, 0.2), (0.34, 0.38), (0.22, 0.58), (0.1, 0.8), (0.0, 1.0)], 12, lambda k, p: SAPH_HI if k > 3 else mix(SAPH, SAPH_HI, k / 3))

def flame(bm, col, uvl):
    """불꽃 혀(주작 날개 불꽃·불티): 밑 y 0 둥근 .. 끝 y 1 휘어진 끝, 노랑 -> 주홍 -> 빨강"""
    pts = [(0, 0, 0), (0.02, 0.22, 0), (0.06, 0.45, 0), (0.12, 0.7, 0), (0.2, 1.0, 0)]
    tube3(bm, col, pts, [0.2, 0.19, 0.14, 0.08, 0.005], lambda k, a: mix(FIRE_HI, FIRE, k * 1.4) if k < 0.7 else mix(FIRE, FIRE_LO, (k - 0.7) / 0.3), 9)

def main():
    FP.reset()
    spec = [('hb_pot', pot), ('hb_lid', lid), ('hb_gourd', gourd), ('hb_pill', pill), ('hb_moxa', moxa), ('hb_scroll_rod', scroll_rod), ('hb_needle', needle),
            ('hb_root', root), ('hb_herb', herb), ('hb_leaf', leaf), ('hb_bud', bud), ('hb_petal', petal), ('hb_stem', stem),
            ('hb_gs_body', gs_body), ('hb_gs_leaf', gs_leaf), ('hb_gs_limb', gs_limb),
            ('hb_deer_body', deer_body), ('hb_deer_head', deer_head), ('hb_deer_leg', deer_leg), ('hb_deer_antler', deer_antler),
            ('hb_dragon', dragon), ('hb_bird', bird), ('hb_wing', wing), ('hb_pillar', pillar), ('hb_shell', shell), ('hb_plate', plate),
            ('hb_beam', beam), ('hb_star', star), ('hb_lotus', lotus), ('hb_drop', drop), ('hb_flame', flame)]
    flat = {'hb_leaf', 'hb_petal', 'hb_wing', 'hb_plate', 'hb_pillar', 'hb_herb', 'hb_stem', 'hb_star', 'hb_lotus'}
    obs = [new_obj(n, f, n not in flat) for n, f in spec]
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(FP.TMP, 'fx_herbal.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(FP.OUT, 'fx_herbal.glb.json'), 'w'))
    for k, o in enumerate(obs): o.location.x = k * 1.6
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_herbal.blend'), compress=True)
    print('tris', sum(tris.values()), tris, 'glb bytes', len(raw), flush=True)

if __name__ == '__main__':
    main()
