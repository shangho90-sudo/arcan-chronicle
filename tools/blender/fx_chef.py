"""쉐프 2차 스킬 이펙트 메시 (Blender bpy, headless, 2026-11-16).

Usage:  python3 tools/blender/fx_chef.py   ->  assets/fx/fx_chef.glb.json  (+ tools/blender/chef/fx_chef.blend)

메시 (게임 축: +Y 위, 미터. 크기·움직임은 js/cheffx.js가 정함. 텍스처 없음 — 색은 정점 색, 빛은 셰이더. 요리 본래 색을 살리고 빛은 테두리·타격에만)
  chef_wok        무쇠 웍: 바닥 y 0, 테두리 반지름 1 / 높이 0.36, 구리 테 + 나무 손잡이 +x (1.0 .. 1.9)
  chef_cooker     압력솥 몸통: 바닥 y 0, 반지름 0.5, 높이 0.62, 구리 + 손잡이 2 + 압력계(앞 -z)
  chef_cooker_lid 압력솥 뚜껑: 아래 y 0, 반지름 0.54, 손잡이·밸브(위)
  chef_cloche     클로슈: 바닥 y 0, 반지름 1, 높이 0.86 + 꼭지 (은색 — 금은 uTint로)
  chef_tray       은쟁반: 반지름 1, 두께 0.06 + 테
  chef_pot        구리 냄비(황금 부용): 바닥 y 0, 반지름 1, 높이 0.62, 황금 국물 면 y 0.5, 손잡이 2
  chef_sorbet     소르베 한 스쿱: 반지름 1, 울퉁불퉁, 흰 크림색(과일색은 uTint) + 아래 가장자리 결
  chef_cone       와플 콘(소르베 받침): 꼭지 y 0 .. 입구 y 1, 반지름 0.45
  chef_mille      밀푀유 원반: 반지름 1, 두께 0.3 — 금빛 페이스트리 · 크림 · 얼음 층 6장 + 가루 설탕
  chef_choux      슈: 반지름 1, 황금 껍질 + 위 크림, 캐러멜 윤기
  chef_leaf       허브 잎: 길이 x -1..1, 평면(xz), 초록
  chef_shard      설탕 유리 조각: 얇은 삼각 판, 크기 약 1, 호박색(반투명은 셰이더)
  chef_curl       캐러멜 곡선: 나선 고리 한 바퀴(관), 반지름 0.5, 높이 0..1 — 설탕 벽 테두리·크로캉부슈 실
  chef_food_a/b/c 웍에서 튀는 재료(새우 · 피망 고리 · 버섯), 크기 약 1
  chef_garnish    플레이팅 곁들임(브로콜리 송이), 크기 약 1
  (2026-11-17 '화려하게' 개편 — 이펙트 메시, 정점 색 흰색(색은 셰이더/인스턴스 색), 인스턴싱용)
  chef_star       통통한 다섯 꼭지 별: 반지름 1(꼭지), 두께 ±0.32 — 명중·잔광 반짝이
  chef_petal      설탕 꽃잎·허브 잎 모양 판: 길이 1(y 0 .. 1), 폭 0.42, 살짝 휨 — 플레이팅·부용·디너
  chef_flame      불꽃 덩어리: 아래가 둥글고 위가 뾰족한 물방울(y 0 .. 1, 반지름 0.38) — 웍·플람베·쇼타임 불꽃 입자
  chef_pillar     빛기둥: 열린 원통 반지름 1, y 0 .. 1, 32칸 — UV u = 둘레, v = 높이
  chef_helix      나선 띠: 반지름 1, y 0 .. 1, 두 바퀴, 폭 0.12 — UV u = 길이, v = 폭
json: {b64}
"""
import os, sys, math, json, base64, random
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm as FP
from fx_pharm import V, lathe, new_obj
from fx_cook import blob, tube, box
SRC = os.path.join(HERE, 'chef'); os.makedirs(SRC, exist_ok=True)

IRON, IRON_IN, COPPER, COPPER_HI, COPPER_LO = (0.10, 0.10, 0.12, 1), (0.22, 0.20, 0.20, 1), (0.78, 0.40, 0.20, 1), (0.98, 0.66, 0.42, 1), (0.48, 0.22, 0.10, 1)
WOOD, WOOD_LO, SILVER, SILVER_HI, SILVER_LO = (0.46, 0.28, 0.14, 1), (0.30, 0.17, 0.08, 1), (0.80, 0.83, 0.88, 1), (0.98, 0.99, 1.0, 1), (0.52, 0.55, 0.62, 1)
GOLD, BROTH, BROTH_HI, CREAM, PASTRY, PASTRY_LO = (1.0, 0.76, 0.30, 1), (0.98, 0.70, 0.22, 1), (1.0, 0.88, 0.48, 1), (1.0, 0.96, 0.88, 1), (0.92, 0.62, 0.24, 1), (0.70, 0.40, 0.12, 1)
ICE, SUGAR = (0.80, 0.92, 1.0, 1), (1.0, 0.78, 0.40, 1)

def wok(bm, col, uvl):
    P = [(0.0, 0.0), (0.32, 0.01), (0.62, 0.07), (0.86, 0.19), (1.0, 0.36), (0.97, 0.36), (0.83, 0.21), (0.6, 0.1), (0.3, 0.045), (0.0, 0.035)]
    lathe(bm, col, P, 32, lambda k, p: COPPER_HI if k == 4 else (IRON_IN if k >= 5 else IRON))
    tube(bm, col, [(1.0, 0.34), (1.35, 0.42), (1.9, 0.52)], [0.05, 0.045, 0.05], WOOD, 8, WOOD_LO)
    tube(bm, col, [(-1.0, 0.34), (-1.14, 0.38)], 0.04, COPPER, 6)

def cooker(bm, col, uvl):
    lathe(bm, col, [(0.0, 0.0), (0.44, 0.0), (0.5, 0.05), (0.5, 0.58), (0.47, 0.62), (0.0, 0.62)], 28, lambda k, p: COPPER_HI if k == 3 else (COPPER_LO if k == 0 else COPPER))
    for sg in (1, -1): tube(bm, col, [(0.5 * sg, 0.5), (0.68 * sg, 0.54), (0.68 * sg, 0.44), (0.5 * sg, 0.42)], 0.03, IRON, 6)
    # 압력계: 앞(-z)에 흰 눈금판 + 빨간 바늘
    for i in range(16):
        a0, a1 = 2 * math.pi * i / 16, 2 * math.pi * (i + 1) / 16
        f = bm.faces.new([bm.verts.new(V(0, 0.34, -0.515)), bm.verts.new(V(math.cos(a0) * 0.13, 0.34 + math.sin(a0) * 0.13, -0.515)), bm.verts.new(V(math.cos(a1) * 0.13, 0.34 + math.sin(a1) * 0.13, -0.515))])
        for l in f.loops: l[col] = (0.98, 0.97, 0.92, 1)
    box(bm, col, -0.012, 0.012, 0.33, 0.44, -0.53, -0.52, (0.85, 0.12, 0.08, 1))

def cooker_lid(bm, col, uvl):
    lathe(bm, col, [(0.0, 0.0), (0.54, 0.0), (0.54, 0.04), (0.42, 0.12), (0.14, 0.17), (0.0, 0.17)], 28, lambda k, p: SILVER_HI if k == 1 else SILVER)
    tube(bm, col, [(-0.26, 0.17), (-0.26, 0.26), (0.26, 0.26), (0.26, 0.17)], 0.03, IRON, 6)
    lathe(bm, col, [(0.0, 0.17), (0.05, 0.17), (0.05, 0.30), (0.08, 0.32), (0.0, 0.36)], 10, lambda k, p: (0.85, 0.15, 0.10, 1), y0=0.0)

def cloche(bm, col, uvl):
    prof = [(1.02, 0.0), (1.0, 0.04)] + [(math.cos(a) * 0.98, 0.04 + math.sin(a) * 0.82) for a in [i * math.pi / 2 / 10 for i in range(1, 10)]] + [(0.0, 0.86)]
    lathe(bm, col, prof, 32, lambda k, p: SILVER_HI if k in (4, 5) else (SILVER_LO if k == 0 else SILVER))
    lathe(bm, col, [(0.0, 0.84), (0.07, 0.86), (0.05, 0.94), (0.11, 1.0), (0.08, 1.06), (0.0, 1.08)], 12, lambda k, p: GOLD)

def tray(bm, col, uvl):
    lathe(bm, col, [(0.0, 0.0), (0.92, 0.0), (1.0, 0.03), (1.02, 0.07), (0.96, 0.07), (0.9, 0.035), (0.0, 0.035)], 36, lambda k, p: SILVER_HI if k == 2 else SILVER)

def pot(bm, col, uvl):
    lathe(bm, col, [(0.0, 0.0), (0.88, 0.0), (0.98, 0.06), (1.0, 0.56), (1.04, 0.62), (0.97, 0.62), (0.94, 0.56), (0.92, 0.1), (0.0, 0.08)], 32,
          lambda k, p: COPPER_HI if k in (3, 4) else (COPPER_LO if k >= 5 else COPPER))
    lathe(bm, col, [(0.0, 0.5), (0.93, 0.5)], 32, lambda k, p: BROTH)
    lathe(bm, col, [(0.0, 0.505), (0.5, 0.505)], 16, lambda k, p: BROTH_HI)
    for sg in (1, -1): tube(bm, col, [(1.0 * sg, 0.5), (1.22 * sg, 0.52), (1.22 * sg, 0.4), (1.0 * sg, 0.38)], 0.04, COPPER_LO, 6)

def sorbet(bm, col, uvl):
    rng = random.Random(7); rows, seg = 9, 18; rings = []
    for j in range(rows + 1):
        v = j / rows; a = -math.pi / 2 + math.pi * v; cr, sy = math.cos(a), math.sin(a); ring = []
        for i in range(seg):
            t = 2 * math.pi * i / seg; r = 1 + 0.06 * math.sin(t * 5 + j) * cr + (0.1 * math.sin(t * 9) if j == 3 else 0)
            ring.append(bm.verts.new(V(math.cos(t) * cr * r, sy * (0.86 if sy < 0 else 1), math.sin(t) * cr * r)))
        rings.append(ring)
    for j in range(rows):
        for i in range(seg):
            k = (i + 1) % seg; f = bm.faces.new((rings[j][i], rings[j][k], rings[j + 1][k], rings[j + 1][i]))
            c = (0.86, 0.84, 0.82, 1) if j < 3 else (1.0, 1.0, 1.0, 1)
            for l in f.loops: l[col] = c

def cone(bm, col, uvl):
    lathe(bm, col, [(0.0, 0.0), (0.45, 1.0), (0.48, 1.04), (0.0, 1.04)], 14, lambda k, p: (0.86, 0.60, 0.30, 1) if k == 0 else (0.98, 0.78, 0.46, 1))

def mille(bm, col, uvl):
    layers = [PASTRY_LO, CREAM, ICE, PASTRY, CREAM, PASTRY]
    for i, c in enumerate(layers):
        y0, y1 = -0.15 + i * 0.05, -0.15 + (i + 1) * 0.05; r = 1.0 if c != CREAM else 0.94
        lathe(bm, col, [(0.0, y0), (r, y0), (r, y1), (0.0, y1)], 32, lambda k, p, c=c: c)
    rng = random.Random(3)
    for _ in range(18):
        a, rr = rng.uniform(0, 6.28), rng.uniform(0.1, 0.85); box(bm, col, math.cos(a) * rr - 0.025, math.cos(a) * rr + 0.025, 0.15, 0.17, math.sin(a) * rr - 0.025, math.sin(a) * rr + 0.025, (1, 1, 1, 1))

def choux(bm, col, uvl):
    blob(bm, col, (0, 0, 0), (1.0, 0.82, 1.0), None, 14, 8, lambda u: (0.70 + 0.26 * u, 0.42 + 0.30 * u, 0.14 + 0.16 * u, 1))
    blob(bm, col, (0, 0.62, 0), (0.55, 0.32, 0.55), CREAM, 12, 5)

def leaf(bm, col, uvl):
    N = 10; top, bot = [], []
    for i in range(N + 1):
        x = -1 + 2 * i / N; w = 0.42 * math.sin(math.pi * i / N) ** 0.8
        top.append(bm.verts.new(V(x, 0.02 * math.sin(math.pi * i / N), w))); bot.append(bm.verts.new(V(x, 0.02 * math.sin(math.pi * i / N), -w)))
    mid = [bm.verts.new(V(-1 + 2 * i / N, 0.05 * math.sin(math.pi * i / N), 0)) for i in range(N + 1)]
    for i in range(N):
        for vs, c in (((mid[i], mid[i + 1], top[i + 1], top[i]), (0.42, 0.78, 0.30, 1)), ((mid[i], bot[i], bot[i + 1], mid[i + 1]), (0.30, 0.64, 0.22, 1))):
            f = bm.faces.new(vs)
            for l in f.loops: l[col] = c

def shard(bm, col, uvl):
    pts = [(0.0, 0.5), (0.42, -0.3), (-0.36, -0.36)]; t = 0.04
    fr = [bm.verts.new(V(x, y, t)) for x, y in pts]; bk = [bm.verts.new(V(x, y, -t)) for x, y in pts]
    for vs, c in (((fr[0], fr[1], fr[2]), SUGAR), ((bk[2], bk[1], bk[0]), SUGAR)):
        f = bm.faces.new(vs)
        for l in f.loops: l[col] = c
    for i in range(3):
        j = (i + 1) % 3; f = bm.faces.new((fr[i], bk[i], bk[j], fr[j]))
        for l in f.loops: l[col] = (1.0, 0.92, 0.66, 1)

def curl(bm, col, uvl):
    n, seg = 40, 6; rings = []
    for i in range(n + 1):
        u = i / n; a = u * 2 * math.pi; c = (math.cos(a) * 0.5, u, math.sin(a) * 0.5)
        ta = (-math.sin(a), 1 / (2 * math.pi * 0.5), math.cos(a)); m = math.sqrt(sum(x * x for x in ta)); ta = tuple(x / m for x in ta)
        nrm = (math.cos(a), 0, math.sin(a)); bn = (ta[1] * nrm[2] - ta[2] * nrm[1], ta[2] * nrm[0] - ta[0] * nrm[2], ta[0] * nrm[1] - ta[1] * nrm[0])
        r = 0.045
        rings.append([bm.verts.new(V(*[c[q] + (nrm[q] * math.cos(2 * math.pi * k / seg) + bn[q] * math.sin(2 * math.pi * k / seg)) * r for q in range(3)])) for k in range(seg)])
    for i in range(n):
        for k in range(seg):
            j = (k + 1) % seg; f = bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][j], rings[i][j]))
            for l in f.loops: l[col] = (1.0, 0.82, 0.42, 1) if k < 3 else (0.86, 0.56, 0.20, 1)

def food_a(bm, col, uvl):   # 새우: 휘어진 분홍 몸통 + 꼬리
    pts = [(math.cos(a) * 0.4, math.sin(a) * 0.4) for a in [i * math.pi * 1.2 / 8 - 0.3 for i in range(9)]]
    tube(bm, col, pts, [0.2, 0.22, 0.22, 0.21, 0.19, 0.16, 0.13, 0.1, 0.06], (1.0, 0.52, 0.36, 1), 8, (1.0, 0.82, 0.70, 1))
    box(bm, col, 0.32, 0.5, -0.16, 0.0, -0.12, 0.12, (0.95, 0.32, 0.18, 1))
def food_b(bm, col, uvl):   # 피망 고리
    ring = [(math.cos(a) * 0.38, math.sin(a) * 0.38) for a in [i * 2 * math.pi / 14 for i in range(15)]]
    tube(bm, col, ring, 0.09, (0.30, 0.74, 0.22, 1), 6, (0.52, 0.90, 0.34, 1))
def food_c(bm, col, uvl):   # 버섯
    lathe(bm, col, [(0.0, -0.4), (0.16, -0.4), (0.14, 0.05), (0.5, 0.05), (0.46, 0.22), (0.26, 0.36), (0.0, 0.4)], 14, lambda k, p: (0.94, 0.88, 0.76, 1) if k < 2 else (0.66, 0.44, 0.26, 1))
def garnish(bm, col, uvl):  # 브로콜리 송이
    tube(bm, col, [(0.0, -0.5), (0.0, 0.0)], 0.12, (0.56, 0.80, 0.36, 1), 8)
    for (x, y, z) in ((0, 0.2, 0), (0.22, 0.12, 0.1), (-0.2, 0.12, 0.12), (0.05, 0.12, -0.24), (0.0, 0.34, 0.1)): blob(bm, col, (x, y, z), (0.2, 0.18, 0.2), (0.22, 0.56, 0.18, 1), 8, 5)

W1 = (1.0, 1.0, 1.0, 1); W_LO = (0.78, 0.78, 0.8, 1)
def star(bm, col, uvl):
    c_top = bm.verts.new(V(0, 0.32, 0)); c_bot = bm.verts.new(V(0, -0.32, 0)); ring = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5; r = 1.0 if i % 2 == 0 else 0.46
        ring.append(bm.verts.new(V(math.cos(a) * r, 0, math.sin(a) * r)))
    for i in range(10):
        j = (i + 1) % 10
        for f in (bm.faces.new((c_top, ring[i], ring[j])), bm.faces.new((c_bot, ring[j], ring[i]))):
            for l in f.loops: l[col] = W1 if l.vert in (c_top, c_bot) else W_LO

def petal(bm, col, uvl):
    N, M = 7, 3; rows = []
    for j in range(N + 1):
        t = j / N; w = 0.42 * math.sin(math.pi * min(1, t * 1.08)) ** 0.8; bend = 0.18 * t * t
        rows.append([bm.verts.new(V((k / M - 0.5) * 2 * w, t, bend + 0.06 * (1 - (2 * k / M - 1) ** 2))) for k in range(M + 1)])
    for j in range(N):
        for k in range(M):
            f = bm.faces.new((rows[j][k], rows[j][k + 1], rows[j + 1][k + 1], rows[j + 1][k]))
            for l in f.loops: l[col] = W1 if j > N // 3 else W_LO

def flame(bm, col, uvl):
    P = [(0.0, 0.0)] + [(0.38 * math.sin(math.pi * 0.5 * (i / 6)) * (1 - 0.15 * (i / 6)), 0.38 * (1 - math.cos(math.pi * 0.5 * (i / 6)))) for i in range(1, 7)] + [(0.24, 0.62), (0.1, 0.86), (0.0, 1.0)]
    lathe(bm, col, P, 10, lambda k, p: W1 if k >= 6 else W_LO)

def pillar(bm, col, uvl):
    S = 32; lo = [bm.verts.new(V(math.cos(2 * math.pi * i / S), 0, math.sin(2 * math.pi * i / S))) for i in range(S)]
    hi = [bm.verts.new(V(math.cos(2 * math.pi * i / S), 1, math.sin(2 * math.pi * i / S))) for i in range(S)]
    for i in range(S):
        j = (i + 1) % S; f = bm.faces.new((lo[i], lo[j], hi[j], hi[i])); u0, u1 = i / S, (i + 1) / S
        for l, uv in zip(f.loops, ((u0, 0), (u1, 0), (u1, 1), (u0, 1))): l[col] = W1; l[uvl].uv = uv

def helix(bm, col, uvl):
    N = 64; turns = 2.0; w = 0.06; prev = None
    for i in range(N + 1):
        t = i / N; a = t * turns * 2 * math.pi; x, z = math.cos(a), math.sin(a)
        cur = (bm.verts.new(V(x, t - w, z)), bm.verts.new(V(x, t + w, z)))
        if prev:
            f = bm.faces.new((prev[0], cur[0], cur[1], prev[1])); t0 = (i - 1) / N
            for l, uv in zip(f.loops, ((t0, 0), (t, 0), (t, 1), (t0, 1))): l[col] = W1; l[uvl].uv = uv
        prev = cur

def main():
    FP.reset()
    spec = [('chef_wok', wok, True), ('chef_cooker', cooker, True), ('chef_cooker_lid', cooker_lid, True), ('chef_cloche', cloche, True), ('chef_tray', tray, True), ('chef_pot', pot, True),
            ('chef_sorbet', sorbet, True), ('chef_cone', cone, True), ('chef_mille', mille, False), ('chef_choux', choux, True), ('chef_leaf', leaf, True), ('chef_shard', shard, False),
            ('chef_curl', curl, True), ('chef_food_a', food_a, True), ('chef_food_b', food_b, True), ('chef_food_c', food_c, True), ('chef_garnish', garnish, True),
            ('chef_star', star, False), ('chef_petal', petal, True), ('chef_flame', flame, True), ('chef_pillar', pillar, False), ('chef_helix', helix, False)]
    obs = [new_obj(n, f, sm) for n, f, sm in spec]
    for o in obs:
        if o.name in ('chef_wok', 'chef_cooker', 'chef_cooker_lid', 'chef_cloche', 'chef_tray', 'chef_pot', 'chef_mille'):
            m = o.modifiers.new('es', 'EDGE_SPLIT'); m.split_angle = math.radians(38)
            for p in o.data.polygons: p.use_smooth = True
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(FP.TMP, 'fx_chef.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(FP.OUT, 'fx_chef.glb.json'), 'w'))
    for k, o in enumerate(obs): o.location.x = k * 2.6
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_chef.blend'), compress=True)
    print('tris', tris, 'total', sum(tris.values()), 'glb bytes', len(raw), flush=True)

if __name__ == '__main__':
    main()
