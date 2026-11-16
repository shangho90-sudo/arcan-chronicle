"""화가 2차 스킬 이펙트·그림 소환물 메시 (Blender bpy, headless, 2026-11-16 '그린 그림을 현실로').

Usage:  python3 tools/blender/fx_painter.py   ->  assets/fx/fx_painter.glb.json  (+ tools/blender/painter/fx_painter.blend)

모양만 절차로 만든다(텍스처 없음 — 색은 정점 색). 재료 느낌(먹 번짐·수채 투명·유화 붓결·연필 해칭·점묘)은 게임 셰이더(js/painterfx.js)가
정점 색 위에 그린다. 붓선 진행·물감 채움·종이 접힘·그림에서 분리는 게임 런타임(마스크·디졸브·메시 변형). 소환물은 부위별 메시(원점 = 관절)로
나눠 게임이 절차로 움직인다(간단한 리그 대신).

Meshes (game axes: +Y up, +Z forward, metres; 게임이 크기를 정함)
  pt_wolf_body  먹 늑대 몸통(원점 = 몸 가운데, 길이 z -0.55..0.5, 등 높이 y 0.3)   pt_wolf_head 목+머리(원점 = 목 밑, 주둥이 +z, 귀 둘)
  pt_wolf_leg   다리(원점 = 엉덩이, 발 y -0.48)   pt_wolf_tail 꼬리(원점 = 꼬리뿌리, -z 로 0.5, 붓끝처럼 갈라짐)
  pt_crane      종이학 몸(접힌 면, 부리 +z, 꼬리 -z, 반지름 ~0.5)   pt_crane_wing 날개 하나(원점 = 어깨, +x 로 1, 접힌 삼각 면)
  pt_knight     유화 기사 몸(발 y 0 .. 투구 꼭대기 y 1, 앞 +z, 망토 등) — 색면(파랑 갑옷·금 테·붉은 망토)
  pt_sword      큰 검(원점 = 손잡이, 칼날 +y 로 1)   pt_shield 둥근 방패(원점 가운데, 앞 +z)
  pt_croquis    크로키 사람 형상(발 y 0 .. 머리 y 1, 앞 +z, 중성 회색 — 연필 셰이더가 선을 그림)
  pt_dragon_head 용 머리(원점 = 목, 주둥이 +z, 뿔·수염·갈기, 눈 자리 금빛)   pt_dragon_seg 몸 마디(반지름 1 둥근 마디 + 등지느러미, 앞 +z)
  pt_frame      금 액자(가로 x -0.5..0.5, 세로 y 0..1.3, 앞 +z, 안쪽은 비움)   pt_rod 두루마리 축(x -0.5..0.5)
  pt_stroke     두꺼운 임파스토 붓 자국(x -0.5..0.5 길이, z 폭 ±0.12, 높이 ~0.05, 가장자리 불규칙, 결 = 정점 색 명암 — 게임이 색을 곱함)
  pt_dot        물감 점(납작한 반구, 반지름 1, 회색 명암)   pt_drop 물감 방울(반지름 1)
  pt_feather    잉크 깃털(원점 = 깃대 밑, +y 로 1)   pt_flower 수채 꽃(꽃잎 6 + 꽃술, 원점 = 줄기 끝, 반지름 ~0.5)
  pt_stem       붓선 줄기 + 잎(y 0..1)   pt_cloud 먹구름 덩어리(반지름 ~1, 아래 평평)   pt_wall 성벽 한 칸(x -0.5..0.5, y 0..1, 두께 z ±0.15, 흉벽)
  pt_palette    작은 팔레트(반지름 ~0.5, 엄지 구멍, 물감 3색)
json: {b64}
"""
import os, sys, math, json, base64, random
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm as FP
from fx_pharm import V, lathe, new_obj
from fx_herbal import ball, tube3, leafshape, mix
SRC = os.path.join(HERE, 'painter'); os.makedirs(SRC, exist_ok=True)
R = random.Random(7)

INK, INK_HI, INK_LO = (0.10, 0.09, 0.13, 1), (0.30, 0.30, 0.40, 1), (0.04, 0.03, 0.05, 1)
PAPER, PAPER_LO, PAPER_HI = (0.95, 0.92, 0.84, 1), (0.80, 0.76, 0.66, 1), (1.0, 0.99, 0.95, 1)
GOLD, GOLD_HI, GOLD_LO = (1.0, 0.76, 0.26, 1), (1.0, 0.92, 0.58, 1), (0.66, 0.42, 0.12, 1)
BLUE, BLUE_HI, BLUE_LO = (0.20, 0.36, 0.86, 1), (0.48, 0.66, 1.0, 1), (0.10, 0.16, 0.48, 1)
RED, RED_HI, RED_LO = (0.86, 0.16, 0.18, 1), (1.0, 0.46, 0.40, 1), (0.50, 0.06, 0.10, 1)
SKIN, STEEL = (0.98, 0.82, 0.66, 1), (0.82, 0.86, 0.92, 1)
GREY, GREY_HI, GREY_LO = (0.72, 0.72, 0.74, 1), (0.92, 0.92, 0.94, 1), (0.46, 0.46, 0.50, 1)
WHITE, WHITE_LO = (0.97, 0.96, 0.92, 1), (0.74, 0.74, 0.78, 1)
LEAF, LEAF_HI = (0.36, 0.72, 0.30, 1), (0.62, 0.90, 0.44, 1)

def jit(c, a=0.06): return tuple(min(1, max(0, c[i] + R.uniform(-a, a))) for i in range(3)) + (1,)

# ------------------------------------------------------------------ 먹 늑대
def wolf_body(bm, col, uvl):
    ink = lambda nx, ny, nz: mix(INK_LO, INK_HI, max(0, ny) * 0.55 + max(0, -nz) * 0.1)
    ball(bm, col, (0, 0.0, 0.02), (0.24, 0.24, 0.52), ink, 16, 10)        # 가슴~허리
    ball(bm, col, (0, 0.03, 0.30), (0.27, 0.27, 0.26), ink, 14, 9)        # 두툼한 가슴 털
    for i in range(5):                                                     # 등 갈기(붓끝처럼 솟은 털)
        z = 0.36 - i * 0.16; tube3(bm, col, [(0, 0.2, z), (0, 0.34, z - 0.06), (0, 0.4, z - 0.16)], [0.07, 0.04, 0.004], lambda k, a: mix(INK, INK_HI, k * 0.6), 6)

def wolf_head(bm, col, uvl):
    ink = lambda nx, ny, nz: mix(INK_LO, INK_HI, max(0, ny) * 0.6)
    tube3(bm, col, [(0, 0, 0), (0, 0.12, 0.10), (0, 0.2, 0.18)], [0.17, 0.15, 0.14], lambda k, a: INK, 10)
    ball(bm, col, (0, 0.22, 0.22), (0.17, 0.16, 0.18), ink, 14, 9)
    ball(bm, col, (0, 0.18, 0.40), (0.08, 0.075, 0.14), ink, 10, 7)       # 주둥이
    ball(bm, col, (0, 0.2, 0.53), (0.035, 0.03, 0.03), lambda *n: INK_LO, 8, 5)
    for s in (-1, 1):
        tube3(bm, col, [(s * 0.08, 0.32, 0.18), (s * 0.11, 0.44, 0.15), (s * 0.12, 0.52, 0.13)], [0.05, 0.03, 0.002], lambda k, a: INK, 6)   # 귀
        ball(bm, col, (s * 0.075, 0.27, 0.34), (0.025, 0.018, 0.02), lambda *n: (0.95, 0.85, 0.55, 1), 8, 5)   # 눈(먹 위 흰 붓점)

def wolf_leg(bm, col, uvl):
    tube3(bm, col, [(0, 0, 0), (0, -0.2, 0.03), (0, -0.36, -0.02), (0, -0.46, 0.04)], [0.08, 0.06, 0.045, 0.05], lambda k, a: mix(INK, INK_LO, k), 8)

def wolf_tail(bm, col, uvl):
    tube3(bm, col, [(0, 0, 0), (0, 0.08, -0.15), (0, 0.06, -0.32), (0, -0.02, -0.5)], [0.07, 0.08, 0.06, 0.004], lambda k, a: mix(INK, INK_HI, k * 0.4), 8)
    for s in (-1, 1): tube3(bm, col, [(0, 0.04, -0.36), (s * 0.06, 0.0, -0.5), (s * 0.08, -0.04, -0.58)], [0.03, 0.015, 0.002], lambda k, a: INK, 5)   # 마른 붓끝 갈라짐

# ------------------------------------------------------------------ 종이학
def tri(bm, col, a, b, c, ca, cb=None, cc=None):
    vs = [bm.verts.new(V(*p)) for p in (a, b, c)]
    try: f = bm.faces.new(vs)
    except ValueError: return
    for l, cl in zip(f.loops, (ca, cb or ca, cc or ca)): l[col] = cl

def crane(bm, col, uvl):
    top, nose, tail, l, r, low = (0, 0.18, 0), (0, 0.42, 0.55), (0, 0.38, -0.52), (-0.1, 0.0, 0), (0.1, 0.0, 0), (0, -0.08, 0)
    for (a, b) in ((nose, top), (top, tail)):
        tri(bm, col, l, a, b, PAPER, PAPER_HI, PAPER_LO); tri(bm, col, r, b, a, PAPER_LO, PAPER, PAPER_HI)
        tri(bm, col, low, l, a, PAPER_LO); tri(bm, col, low, a, r, PAPER_LO)
        tri(bm, col, low, b, l, PAPER_LO); tri(bm, col, low, r, b, PAPER_LO)
    head = (0, 0.36, 0.68)                                                    # 접힌 부리
    tri(bm, col, nose, (-0.02, 0.38, 0.55), head, (0.86, 0.22, 0.24, 1)); tri(bm, col, nose, head, (0.02, 0.38, 0.55), (0.86, 0.22, 0.24, 1))

def crane_wing(bm, col, uvl):
    a, b, c, d = (0, 0, 0.18), (0, 0, -0.18), (1.0, 0.08, -0.05), (0.55, 0.02, 0.0)
    tri(bm, col, a, d, b, PAPER_HI, PAPER, PAPER); tri(bm, col, a, c, d, PAPER, (0.98, 0.86, 0.82, 1), PAPER_HI); tri(bm, col, d, c, b, PAPER_LO, (0.98, 0.86, 0.82, 1), PAPER_LO)
    tri(bm, col, a, b, d, PAPER_LO); tri(bm, col, a, d, c, PAPER_LO); tri(bm, col, d, b, c, PAPER_LO)

# ------------------------------------------------------------------ 유화 기사
def knight(bm, col, uvl):
    bl = lambda nx, ny, nz: jit(mix(BLUE_LO, BLUE_HI, 0.35 + 0.45 * max(0, ny) + 0.2 * nz), 0.04)
    for s in (-1, 1):
        tube3(bm, col, [(s * 0.1, 0.0, 0), (s * 0.1, 0.2, 0.01), (s * 0.1, 0.38, 0)], [0.07, 0.065, 0.075], lambda k, a: mix(BLUE_LO, BLUE, k), 8)   # 다리
        ball(bm, col, (s * 0.1, 0.03, 0.04), (0.07, 0.04, 0.11), lambda *n: GOLD_LO, 8, 5)                                                     # 장화
    ball(bm, col, (0, 0.5, 0), (0.2, 0.17, 0.15), bl, 14, 9)                  # 허리·갑옷 치마
    ball(bm, col, (0, 0.62, 0.0), (0.21, 0.15, 0.16), bl, 14, 9)              # 가슴판
    tube3(bm, col, [(-0.2, 0.62, 0.13), (0, 0.6, 0.17), (0.2, 0.62, 0.13)], 0.02, lambda k, a: GOLD, 6)   # 금 테
    for s in (-1, 1):
        ball(bm, col, (s * 0.22, 0.7, 0), (0.1, 0.08, 0.1), lambda *n: jit(GOLD, 0.05), 10, 6)            # 어깨받이
        tube3(bm, col, [(s * 0.24, 0.66, 0), (s * 0.28, 0.54, 0.04), (s * 0.26, 0.46, 0.1)], [0.055, 0.05, 0.05], lambda k, a: BLUE, 8)   # 팔
    ball(bm, col, (0, 0.86, 0.01), (0.12, 0.13, 0.13), lambda nx, ny, nz: jit(mix(STEEL, BLUE_HI, 0.3 + 0.3 * ny), 0.03), 14, 9)   # 투구
    tube3(bm, col, [(0, 0.84, 0.13), (0, 0.84, 0.14)], 0.07, lambda k, a: (0.15, 0.15, 0.25, 1), 8)    # 눈 틈(검은 띠)
    tube3(bm, col, [(0, 0.97, 0.0), (0, 1.03, -0.06), (0, 1.0, -0.18)], [0.05, 0.04, 0.01], lambda k, a: RED, 6)   # 깃털 장식
    # 망토: 어깨에서 뒤로 늘어진 붉은 판(두 겹)
    NX, NY = 6, 6
    for i in range(NX):
        for j in range(NY):
            q = []
            for (u, v) in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)):
                x = (u / NX - 0.5) * 0.5 * (1 + 0.4 * v / NY); y = 0.72 - 0.62 * v / NY; z = -0.14 - 0.06 * v / NY - 0.03 * math.sin(u * 1.4)
                q.append((x, y, z))
            vs = [bm.verts.new(V(*p)) for p in q]; f = bm.faces.new(vs)
            for l in f.loops: l[col] = jit(mix(RED, RED_LO, j / NY), 0.04)

def sword(bm, col, uvl):
    tube3(bm, col, [(0, -0.16, 0), (0, 0.0, 0)], 0.03, lambda k, a: (0.4, 0.22, 0.12, 1), 8)
    tube3(bm, col, [(-0.14, 0.02, 0), (0.14, 0.02, 0)], 0.03, lambda k, a: GOLD, 8)
    # 넓은 칼날(납작한 육각 단면)
    L = [(0, 0.04), (0.06, 0.1), (0.06, 0.85), (0, 1.0)]
    for side in (1, -1):
        for i in range(len(L) - 1):
            (w0, y0), (w1, y1) = L[i], L[i + 1]
            tri(bm, col, (0, y0, 0.02 * side), (w0 * side, y0, 0), (w1 * side, y1, 0), STEEL, (0.62, 0.66, 0.78, 1), (0.62, 0.66, 0.78, 1))
            tri(bm, col, (0, y0, 0.02 * side), (w1 * side, y1, 0), (0, y1, 0.02 * side), STEEL, (0.62, 0.66, 0.78, 1), STEEL)
            tri(bm, col, (0, y0, -0.02 * side), (w1 * side, y1, 0), (w0 * side, y0, 0), STEEL, (0.62, 0.66, 0.78, 1), (0.62, 0.66, 0.78, 1))
            tri(bm, col, (0, y0, -0.02 * side), (0, y1, -0.02 * side), (w1 * side, y1, 0), STEEL, STEEL, (0.62, 0.66, 0.78, 1))

def shield(bm, col, uvl):
    ball(bm, col, (0, 0, 0), (0.5, 0.5, 0.08), lambda nx, ny, nz: GOLD if (nx * nx + ny * ny) > 0.82 else (RED if nz > 0 and abs(nx) < 0.18 else BLUE if nz > 0 else BLUE_LO), 22, 10)

# ------------------------------------------------------------------ 크로키 사람 형상
def croquis(bm, col, uvl):
    g = lambda nx, ny, nz: mix(GREY_LO, GREY_HI, 0.5 + 0.5 * ny)
    for s in (-1, 1):
        tube3(bm, col, [(s * 0.09, 0.0, 0.02), (s * 0.09, 0.24, 0), (s * 0.08, 0.46, 0)], [0.06, 0.07, 0.08], lambda k, a: GREY, 8)
        tube3(bm, col, [(s * 0.2, 0.78, 0), (s * 0.27, 0.62, 0.05), (s * 0.27, 0.48, 0.12)], [0.05, 0.045, 0.04], lambda k, a: GREY, 8)
    ball(bm, col, (0, 0.6, 0), (0.17, 0.2, 0.12), g, 14, 9)
    ball(bm, col, (0, 0.88, 0.01), (0.11, 0.12, 0.11), g, 14, 9)

# ------------------------------------------------------------------ 먹 용
def dragon_head(bm, col, uvl):
    ink = lambda nx, ny, nz: mix(INK_LO, INK_HI, max(0, ny) * 0.5)
    ball(bm, col, (0, 0.05, 0.25), (0.3, 0.26, 0.36), ink, 16, 10)
    ball(bm, col, (0, -0.02, 0.62), (0.18, 0.13, 0.24), ink, 12, 8)          # 주둥이
    ball(bm, col, (0, -0.14, 0.52), (0.15, 0.06, 0.24), lambda *n: (0.6, 0.12, 0.14, 1), 10, 6)   # 아래턱 속(붉은 입)
    for s in (-1, 1):
        tube3(bm, col, [(s * 0.14, 0.24, 0.12), (s * 0.24, 0.48, -0.08), (s * 0.3, 0.6, -0.34)], [0.06, 0.04, 0.005], lambda k, a: mix((0.76, 0.62, 0.36, 1), GOLD_HI, k), 7)   # 뿔
        tube3(bm, col, [(s * 0.12, -0.02, 0.78), (s * 0.34, -0.06, 0.86), (s * 0.6, -0.2, 0.8), (s * 0.78, -0.4, 0.66)], [0.02, 0.016, 0.01, 0.002], lambda k, a: INK, 5)   # 수염
        ball(bm, col, (s * 0.17, 0.16, 0.42), (0.06, 0.05, 0.05), lambda *n: GOLD_HI, 10, 6)        # 눈(금빛 — 게임이 점찍기 때 빛나게)
        for i in range(4): tube3(bm, col, [(s * 0.22, 0.1 - i * 0.05, 0.0), (s * 0.38, 0.14 - i * 0.06, -0.24), (s * 0.42, 0.1 - i * 0.07, -0.42)], [0.04, 0.025, 0.002], lambda k, a: INK, 5)   # 갈기

def dragon_seg(bm, col, uvl):
    ball(bm, col, (0, 0, 0), (1, 0.9, 1.05), lambda nx, ny, nz: mix(INK_LO, INK_HI, max(0, ny) * 0.45) if ny > -0.5 else (0.62, 0.52, 0.34, 1), 14, 9)
    tube3(bm, col, [(0, 0.82, 0.3), (0, 1.25, -0.05), (0, 1.1, -0.45)], [0.18, 0.1, 0.005], lambda k, a: INK, 6)   # 등지느러미

# ------------------------------------------------------------------ 액자·두루마리·팔레트
def frame(bm, col, uvl):
    W, H, T, D = 0.5, 1.3, 0.09, 0.07
    def bar(x0, y0, x1, y1):
        tube3(bm, col, [(x0, y0, 0), (x1, y1, 0)], T * 0.5, lambda k, a: GOLD_HI if a < 0.3 else GOLD if a < 0.7 else GOLD_LO, 8)
    bar(-W, 0, W, 0); bar(-W, H, W, H); bar(-W, 0, -W, H); bar(W, 0, W, H)
    for (x, y) in ((-W, 0), (W, 0), (-W, H), (W, H)): ball(bm, col, (x, y, 0.02), (0.07, 0.07, 0.05), lambda *n: GOLD_HI, 10, 6)
    ball(bm, col, (0, H + 0.06, 0.02), (0.12, 0.06, 0.04), lambda *n: GOLD, 10, 6)   # 위 장식

def rod(bm, col, uvl):
    tube3(bm, col, [(-0.5, 0, 0), (0.5, 0, 0)], 0.04, lambda k, a: (0.36, 0.16, 0.10, 1), 12)
    for s in (-1, 1): tube3(bm, col, [(s * 0.5, 0, 0), (s * 0.55, 0, 0), (s * 0.58, 0, 0)], [0.065, 0.065, 0.035], lambda k, a: GOLD, 12)

def palette(bm, col, uvl):
    N = 24; c = bm.verts.new(V(0, 0.02, 0)); ring = []
    for i in range(N):
        a = i / N * 6.283; r = 0.5 * (1 - 0.18 * math.exp(-((a - 0.4) ** 2) / 0.05)); ring.append(bm.verts.new(V(math.cos(a) * r, 0, math.sin(a) * r * 0.8)))
    for i in range(N):
        f = bm.faces.new((c, ring[(i + 1) % N], ring[i]))
        for l in f.loops: l[col] = (0.78, 0.56, 0.32, 1)
    for (x, z, cl) in ((-0.2, 0.15, RED), (0.05, 0.25, BLUE), (0.28, 0.05, GOLD), (-0.25, -0.15, WHITE)): ball(bm, col, (x, 0.03, z), (0.09, 0.04, 0.08), lambda *n, cl=cl: cl, 10, 5)

# ------------------------------------------------------------------ 붓 자국·점·방울·깃털·꽃·줄기·구름·성벽
def stroke(bm, col, uvl):
    NX, NZ = 28, 6
    grid = [[None] * (NZ + 1) for _ in range(NX + 1)]
    for i in range(NX + 1):
        u = i / NX; x = u - 0.5; wid = 0.12 * (0.55 + 0.45 * math.sin(math.pi * min(1, u * 1.15)) ** 0.5) * (1 + 0.08 * math.sin(u * 23))
        for j in range(NZ + 1):
            v = j / NZ - 0.5; z = v * 2 * wid + 0.012 * math.sin(i * 1.7 + j)
            ridge = 0.5 + 0.5 * math.sin(v * 22 + u * 3)                     # 붓결(가로 줄)
            h = 0.05 * (1 - (2 * v) ** 4) * (0.5 + 0.5 * math.sin(math.pi * min(1, u * 1.1))) * (0.75 + 0.25 * ridge)
            grid[i][j] = (bm.verts.new(V(x, h, z)), 0.62 + 0.38 * ridge * (1 - abs(v)))
    for i in range(NX):
        for j in range(NZ):
            q = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]
            f = bm.faces.new([p[0] for p in q])
            for l, p in zip(f.loops, q): l[col] = (p[1], p[1], p[1], 1)

def dot(bm, col, uvl):
    ball(bm, col, (0, 0, 0), (1, 0.45, 1), lambda nx, ny, nz: (0.7 + 0.3 * ny,) * 3 + (1,), 14, 6)

def drop(bm, col, uvl):
    ball(bm, col, (0, 0, 0), (1, 1, 1), lambda nx, ny, nz: (0.75 + 0.25 * ny,) * 3 + (1,), 10, 7)

def feather(bm, col, uvl):
    tube3(bm, col, [(0, 0, 0), (0, 0.5, 0.02), (0, 1.0, 0)], [0.02, 0.012, 0.002], lambda k, a: INK_HI, 5)
    leafshape(bm, col, (0, 0.12, 0), (0, 1, 0), (1, 0, 0), 0.88, 0.16, INK_HI, INK, th=0.01, n=8)

def flower(bm, col, uvl):
    for i in range(6):
        a = i / 6 * 6.283; ax = (math.cos(a), 0.35, math.sin(a)); m = math.sqrt(sum(x * x for x in ax)); ax = tuple(x / m for x in ax)
        leafshape(bm, col, (0, 0, 0), ax, (-math.sin(a), 0, math.cos(a)), 0.48, 0.2, (1.0, 1.0, 1.0, 1), (0.86, 0.86, 0.9, 1), th=0.01, curl=0.06, n=6)
    ball(bm, col, (0, 0.04, 0), (0.1, 0.06, 0.1), lambda *n: GOLD, 10, 5)

def stem(bm, col, uvl):
    tube3(bm, col, [(0, 0, 0), (0.03, 0.35, 0.0), (-0.02, 0.7, 0.02), (0, 1.0, 0)], [0.025, 0.02, 0.015, 0.01], lambda k, a: mix(LEAF, LEAF_HI, k), 6)
    for (y, s) in ((0.3, 1), (0.55, -1)): leafshape(bm, col, (0, y, 0), (0.7 * s, 0.7, 0), (0, 0, 1), 0.3, 0.08, LEAF_HI, LEAF, curl=-0.04)

def cloud(bm, col, uvl):
    c = lambda nx, ny, nz: mix((0.18, 0.18, 0.24, 1), (0.52, 0.54, 0.64, 1), 0.5 + 0.5 * ny)
    for (x, y, z, r) in ((0, 0.1, 0, 0.6), (0.55, 0.05, 0.1, 0.45), (-0.55, 0.0, -0.05, 0.48), (0.2, 0.32, -0.2, 0.42), (-0.25, 0.3, 0.2, 0.38), (0.0, -0.05, 0.42, 0.36), (0.1, 0.0, -0.45, 0.4)):
        ball(bm, col, (x, y, z), (r, r * 0.72, r), c, 12, 7)

def wall(bm, col, uvl):
    T = 0.15
    def box(x0, x1, y0, y1, z0, z1, cl):
        P = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        vs = [bm.verts.new(V(*p)) for p in P]
        for (a, b, c_, d), sh in (((0, 1, 2, 3), 0.86), ((5, 4, 7, 6), 1.0), ((4, 0, 3, 7), 0.8), ((1, 5, 6, 2), 0.8), ((3, 2, 6, 7), 1.04), ((4, 5, 1, 0), 0.6)):
            f = bm.faces.new((vs[a], vs[b], vs[c_], vs[d]))
            for l in f.loops: l[col] = tuple(min(1, cl[i] * sh) for i in range(3)) + (1,)
    # 돌 줄(가로 줄눈 = 살짝 어두운 띠) — 몸통을 4단으로
    for k in range(4):
        y0, y1 = k * 0.2, (k + 1) * 0.2 - 0.012
        box(-0.5, 0.5, y0, y1, -T, T, jit(WHITE, 0.025))
        box(-0.5, 0.5, y1, y1 + 0.012, -T * 0.96, T * 0.96, WHITE_LO)
    for i in range(5):                                                        # 흉벽(이 빠진 톱니)
        x = -0.5 + i * 0.25 + 0.0
        box(x, x + 0.14, 0.8, 1.0, -T, T, jit(WHITE, 0.025))
    box(-0.52, 0.52, 0.78, 0.82, -T - 0.02, T + 0.02, (0.86, 0.84, 0.8, 1))   # 위 턱

def main():
    FP.reset()
    spec = [('pt_wolf_body', wolf_body), ('pt_wolf_head', wolf_head), ('pt_wolf_leg', wolf_leg), ('pt_wolf_tail', wolf_tail),
            ('pt_crane', crane), ('pt_crane_wing', crane_wing), ('pt_knight', knight), ('pt_sword', sword), ('pt_shield', shield), ('pt_croquis', croquis),
            ('pt_dragon_head', dragon_head), ('pt_dragon_seg', dragon_seg), ('pt_frame', frame), ('pt_rod', rod), ('pt_palette', palette),
            ('pt_stroke', stroke), ('pt_dot', dot), ('pt_drop', drop), ('pt_feather', feather), ('pt_flower', flower), ('pt_stem', stem), ('pt_cloud', cloud), ('pt_wall', wall)]
    flat = {'pt_crane', 'pt_crane_wing', 'pt_sword', 'pt_wall', 'pt_feather', 'pt_flower', 'pt_stem', 'pt_palette'}
    obs = [new_obj(n, f, n not in flat) for n, f in spec]
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(FP.TMP, 'fx_painter.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(FP.OUT, 'fx_painter.glb.json'), 'w'))
    for k, o in enumerate(obs): o.location.x = k * 1.6
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_painter.blend'), compress=True)
    print('tris', sum(tris.values()), tris, 'glb bytes', len(raw), flush=True)

if __name__ == '__main__':
    main()
