"""요리사 1차 스킬 이펙트 메시 (Blender bpy, headless, 2026-11-13): 식칼 썰기 ck1_a1 · 팬 강타 ck1_a2 · 미트볼 던지기 ck1_b1.

Usage:  python3 tools/blender/fx_cook.py        ->  assets/fx/fx_cook.glb.json  (+ tools/blender/cook/fx_cook.blend)

Meshes (game axes: +Y up, metres; js/cookfx.js가 크기·움직임을 정함. 텍스처 없음 — 색은 정점 색, 빛은 셰이더)
  cook_knife      큰 식칼(중식도 모양): 날 끝 y 0(아래), 칼등 y 0.36, 길이 x -0.5 .. 0.5 (날 -0.5 .. 0.18, 손잡이 0.18 .. 0.5), 두께 z
  cook_pan        프라이팬: 바닥 y 0(아래로 내리찍는 면), 테두리 반지름 1 / 높이 0.2, 손잡이 +x 로 1.0 .. 1.95. 무쇠색 + 따뜻한 테두리
  cook_meatball   울퉁불퉁한 공 반지름 1, 갈색 + 위쪽 소스 윤기
  cook_chip_a/b/c 썰려 튀는 조각: 얇은 원판(당근) / 쐐기(초록 채소) / 작은 토막(흰색), 크기 약 1
  cook_star       기절 별: 두께 있는 다섯 꼭지 별, 반지름 1 (xy 평면)
  (2026-11-13 남은 스킬) cook_spatula 뒤집개(날 x -0.62..-0.04 y 0, 손잡이 +x 1.0) · cook_board 도마(x ±0.5, y 0..1.3, 앞면 +z) ·
  cook_ladle 국자(그릇 중심 원점, 자루 +y 1.5) · cook_skewer 꼬치(x 0..1, 끝 +x) · cook_shaker 후추통(y 0..1) · cook_sack 밀가루 포대(y 0..1) ·
  cook_bowl 수프 그릇 · cook_lunchbox 도시락 · cook_plate 한 끼 접시 · cook_cookie 쿠키(xy 평면) · cook_drop 국물 방울(반지름 1)
  음식 소품 4종과 후추통·포대·꼬치는 Tripo 판(tools/blender/fx_cook_tripo.py -> fx_cook_tripo.glb.json)이 있으면 게임이 그것을 대신 씀.
json: {b64}
"""
import os, sys, math, json, base64, random
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm as FP
from fx_pharm import V, lathe, new_obj
SRC = os.path.join(HERE, 'cook'); os.makedirs(SRC, exist_ok=True)

STEEL, STEEL_HI, STEEL_LO = (0.80, 0.84, 0.90, 1), (0.97, 0.98, 1.0, 1), (0.52, 0.56, 0.64, 1)
WOOD, WOOD_LO, BRASS = (0.42, 0.25, 0.13, 1), (0.28, 0.16, 0.08, 1), (0.95, 0.72, 0.30, 1)
IRON, IRON_IN, IRON_RIM, IRON_HI = (0.11, 0.11, 0.13, 1), (0.20, 0.19, 0.20, 1), (0.62, 0.40, 0.20, 1), (0.95, 0.70, 0.38, 1)

def quad(bm, col, vs, c):
    f = bm.faces.new([bm.verts.new(V(*p)) for p in vs])
    for l in f.loops: l[col] = c
    return f

def box(bm, col, x0, x1, y0, y1, z0, z1, c, ctop=None):
    P = lambda x, y, z: (x, y, z)
    faces = [((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)), ((x0, y0, z1), (x0, y1, z1), (x1, y1, z1), (x1, y0, z1)),
             ((x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)), ((x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0)),
             ((x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)), ((x0, y0, z0), (x0, y0, z1), (x1, y0, z1), (x1, y0, z0))]
    for i, f in enumerate(faces): quad(bm, col, f, ctop if (ctop and i == 4) else c)

def knife(bm, col, uvl):
    # cleaver blade: wedge section (spine 0.036 thick at y 0.36 -> edge at y 0), slightly curved belly, bright bevel band near the edge
    N = 10; x0, x1, top = -0.5, 0.18, 0.36; ht = 0.018
    def edge_y(u): return 0.035 * (1 - math.sin(u * math.pi)) * 0.6 + (0.05 * (1 - u) ** 3)     # belly: a little higher at the tip
    cols = []
    for i in range(N + 1):
        u = i / N; x = x0 + (x1 - x0) * u; ye = edge_y(u); yb = ye + 0.075
        cols.append((x, ye, yb))
    for i in range(N):
        (xa, ea, ba), (xb, eb, bb) = cols[i], cols[i + 1]
        for sgn in (1, -1):
            z = sgn * ht; zb = sgn * ht * 0.45
            a = [(xa, ea, 0), (xb, eb, 0), (xb, bb, zb), (xa, ba, zb)]; b = [(xa, ba, zb), (xb, bb, zb), (xb, top, z), (xa, top, z)]
            if sgn < 0: a.reverse(); b.reverse()
            quad(bm, col, a, STEEL_HI); quad(bm, col, b, STEEL if sgn > 0 else STEEL_LO)
        quad(bm, col, [(xa, top, ht), (xb, top, ht), (xb, top, -ht), (xa, top, -ht)], STEEL_LO)                 # spine
    quad(bm, col, [(x0, cols[0][1], 0), (x0, cols[0][2], ht * 0.45), (x0, top, ht), (x0, top, -ht), (x0, cols[0][2], -ht * 0.45)], STEEL)   # tip end
    quad(bm, col, [(x1, cols[-1][1], 0), (x1, cols[-1][2], -ht * 0.45), (x1, top, -ht), (x1, top, ht), (x1, cols[-1][2], ht * 0.45)], STEEL_LO)
    # hole near the spine corner is skipped (reads as noise at game size); brass bolster + wooden handle with two rivets
    box(bm, col, 0.18, 0.225, 0.19, 0.345, -0.034, 0.034, BRASS)
    P = [(0.0, 0.225), (0.036, 0.225), (0.040, 0.30), (0.043, 0.40), (0.040, 0.47), (0.030, 0.495), (0.0, 0.5)]
    segs = 14
    rings = []
    for (r, x) in P:
        rings.append([bm.verts.new(V(x, 0.268 + math.cos(2 * math.pi * k / segs) * r * 1.25, math.sin(2 * math.pi * k / segs) * r)) for k in range(segs)])
    for a in range(len(rings) - 1):
        for k in range(segs):
            j = (k + 1) % segs; f = bm.faces.new((rings[a][k], rings[a + 1][k], rings[a + 1][j], rings[a][j]))
            for l in f.loops: l[col] = WOOD if k < segs // 2 else WOOD_LO

def pan(bm, col, uvl):
    # shallow dish: flat bottom (down, y 0), flared wall, rolled rim; inside a touch lighter; long handle +x with a hanging loop end
    P = [(0.0, 0.0), (0.80, 0.0), (0.86, 0.02), (0.97, 0.17), (1.0, 0.2), (0.985, 0.215), (0.955, 0.20), (0.84, 0.05), (0.78, 0.035), (0.0, 0.035)]
    def c(k, prof):
        if k in (3, 4, 5): return IRON_HI if k == 4 else IRON_RIM
        return IRON_IN if k >= 6 else IRON
    lathe(bm, col, P, 40, c)
    # handle: flat tapered bar rising slightly, darker grip
    hx = [(0.96, 0.16, 0.085), (1.25, 0.21, 0.07), (1.6, 0.25, 0.062), (1.95, 0.27, 0.075)]
    for i in range(len(hx) - 1):
        (xa, ya, wa), (xb, yb, wb) = hx[i], hx[i + 1]; t = 0.03
        top = [(xa, ya + t, -wa), (xa, ya + t, wa), (xb, yb + t, wb), (xb, yb + t, -wb)]; bot = [(xa, ya - t, -wa), (xb, yb - t, -wb), (xb, yb - t, wb), (xa, ya - t, wa)]
        cc = IRON_RIM if i == 0 else WOOD
        quad(bm, col, top, cc); quad(bm, col, bot, IRON if i == 0 else WOOD_LO)
        quad(bm, col, [(xa, ya - t, wa), (xb, yb - t, wb), (xb, yb + t, wb), (xa, ya + t, wa)], cc)
        quad(bm, col, [(xa, ya - t, -wa), (xa, ya + t, -wa), (xb, yb + t, -wb), (xb, yb - t, -wb)], IRON if i == 0 else WOOD_LO)
    (xe, ye, we) = hx[-1]; quad(bm, col, [(xe, ye - 0.03, -we), (xe, ye + 0.03, -we), (xe, ye + 0.03, we), (xe, ye - 0.03, we)], WOOD_LO)

def meatball(bm, col, uvl):
    # 2026-11-14 (미트볼 던지기 개편): 겉이 구워진 울퉁불퉁한 고기 + 위쪽 붉은 갈색 소스. 큰 덩이 26 + 잔 돌기 70, 구운 얼룩(짙은 갈색),
    # 소스는 위쪽 55 %에 흘러내린 가장자리(물결)로 덮임 — 윤기는 셰이더 하이라이트(js/cookfx.js volley spec)
    rng = random.Random(7)
    bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
    big = [(rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0.25, 0.5)) for _ in range(26)]
    small = [(rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0.06, 0.13)) for _ in range(70)]
    sear = [(rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0.15, 0.3)) for _ in range(12)]
    def field(x, y, z, pts, h):
        d = 0.0
        for (bx, by, bz, br) in pts:
            m = math.sqrt(bx * bx + by * by + bz * bz) or 1; q = (x * bx + y * by + z * bz) / m
            if q > 1 - br: d += h * (q - (1 - br)) / br
        return d
    for v in bm.verts:
        x, y, z = v.co; d = field(x, y, z, big, 0.1) + field(x, y, z, small, 0.045); r = 0.92 + d
        v.co = (x * r, y * r, z * r * 0.94)
    for f in bm.faces:
        for l in f.loops:
            x, y, z = l.vert.co; rr = math.sqrt(x * x + y * y + z * z) or 1; nx, ny, nz = x / rr, y / rr, z / rr; k = max(0.0, min(1.0, (rr - 0.88) / 0.2))
            sr = min(1.0, field(nx, ny, nz, sear, 1.0))
            base = (0.42 + 0.20 * k, 0.21 + 0.10 * k, 0.09 + 0.05 * k)                       # browned meat, bumps catch more colour
            base = tuple(base[i] * (1 - 0.55 * sr) for i in range(3))                         # seared dark patches
            edge = 0.42 + 0.08 * math.sin(math.atan2(ny, nx) * 5) + 0.05 * math.sin(math.atan2(ny, nx) * 11)
            sauce = (0.62 + 0.12 * k, 0.13 + 0.04 * k, 0.05); s = max(0.0, min(1.0, (nz - (0.05 - edge * 0.3)) / 0.22)) * 0.85
            l[col] = tuple(base[i] * (1 - s) + sauce[i] * s for i in range(3)) + (1,)

def chip_a(bm, col, uvl):   # carrot coin
    lathe(bm, col, [(0.0, -0.07), (0.5, -0.07), (0.5, 0.07), (0.0, 0.07)], 12, lambda k, p: (1.0, 0.58, 0.16, 1) if k != 1 else (0.95, 0.42, 0.10, 1))
def chip_b(bm, col, uvl):   # green wedge
    g, g2 = (0.50, 0.82, 0.30, 1), (0.82, 0.95, 0.60, 1)
    a, b, c = (-0.5, -0.12, 0), (0.5, -0.12, 0), (0.0, 0.34, 0); t = 0.11
    quad(bm, col, [(a[0], a[1], t), (b[0], b[1], t), (c[0], c[1], t)], g2); quad(bm, col, [(a[0], a[1], -t), (c[0], c[1], -t), (b[0], b[1], -t)], g2)
    for p, q in ((a, b), (b, c), (c, a)): quad(bm, col, [(p[0], p[1], -t), (q[0], q[1], -t), (q[0], q[1], t), (p[0], p[1], t)], g)
def chip_c(bm, col, uvl):   # white cube (onion / radish)
    box(bm, col, -0.3, 0.3, -0.3, 0.3, -0.3, 0.3, (0.96, 0.95, 0.88, 1), (1, 1, 0.96, 1))

def star(bm, col, uvl):
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5; r = 1.0 if i % 2 == 0 else 0.46
        pts.append((math.cos(a) * r, math.sin(a) * r))
    t = 0.16; Y, Y2 = (1.0, 0.86, 0.25, 1), (1.0, 0.97, 0.70, 1)
    cf, cb = bm.verts.new(V(0, 0, t)), bm.verts.new(V(0, 0, -t))
    ring = [bm.verts.new(V(x, y, 0)) for (x, y) in pts]
    for i in range(10):
        j = (i + 1) % 10
        f = bm.faces.new((cf, ring[i], ring[j]));  [l.__setitem__(col, Y2 if l.vert is cf else Y) for l in f.loops]
        f = bm.faces.new((cb, ring[j], ring[i]));  [l.__setitem__(col, Y2 if l.vert is cb else Y) for l in f.loops]


# ------------------------------------------------------------------ 2026-11-13 남은 스킬 소품 (뒤집기·도마 방어·뜨거운 국물·후추 뿌리기·밀가루 구름·꼬치 찌르기·식사)
def blob(bm, col, c, r, color, seg=10, rows=6, cf=None):
    """ellipsoid: centre c (game axes), radii r = (rx, ry, rz); cf(u_lat 0 bottom..1 top) -> colour"""
    rings = []
    for j in range(rows + 1):
        v = j / rows; a = -math.pi / 2 + math.pi * v; cr, sy = math.cos(a), math.sin(a)
        rings.append([bm.verts.new(V(c[0] + math.cos(2 * math.pi * i / seg) * cr * r[0], c[1] + sy * r[1], c[2] + math.sin(2 * math.pi * i / seg) * cr * r[2])) for i in range(seg)])
    for j in range(rows):
        for i in range(seg):
            k = (i + 1) % seg; f = bm.faces.new((rings[j][i], rings[j][k], rings[j + 1][k], rings[j + 1][i]))
            cc = cf((j + 0.5) / rows) if cf else color
            for l in f.loops: l[col] = cc

def tube(bm, col, pts, rad, color, seg=8, color2=None):
    """round bar along a polyline in the xy plane (game axes); rad = number or list per point"""
    rings = []
    for n, (x, y) in enumerate(pts):
        a, b = pts[max(0, n - 1)], pts[min(len(pts) - 1, n + 1)]; dx, dy = b[0] - a[0], b[1] - a[1]; m = math.hypot(dx, dy) or 1; nx, ny = -dy / m, dx / m
        r = rad[n] if isinstance(rad, (list, tuple)) else rad
        rings.append([bm.verts.new(V(x + nx * math.cos(2 * math.pi * k / seg) * r, y + ny * math.cos(2 * math.pi * k / seg) * r, math.sin(2 * math.pi * k / seg) * r)) for k in range(seg)])
    for n in range(len(rings) - 1):
        for k in range(seg):
            j = (k + 1) % seg; f = bm.faces.new((rings[n][k], rings[n + 1][k], rings[n + 1][j], rings[n][j]))
            for l in f.loops: l[col] = color2 if (color2 and k >= seg // 2) else color
    for ring, rev in ((rings[0], False), (rings[-1], True)):
        f = bm.faces.new(list(reversed(ring)) if rev else ring)
        for l in f.loops: l[col] = color2 or color

LWOOD, LWOOD2, LWOOD_LO = (0.86, 0.66, 0.40, 1), (0.78, 0.57, 0.33, 1), (0.52, 0.34, 0.18, 1)
SOUP, SOUP_HI = (1.0, 0.56, 0.14, 1), (1.0, 0.80, 0.36, 1)

def spatula(bm, col, uvl):
    # 뒤집개: 납작한 날 x -0.62 .. -0.04 (y 0, 위가 넓은 면), 목, 나무 손잡이 +x 로 1.0 까지 살짝 올라감
    t = 0.016
    box(bm, col, -0.62, -0.04, -t, t, -0.25, 0.25, STEEL_LO, STEEL_HI)
    for z in (-0.13, 0.0, 0.13):   # 세 줄 홈(어두운 띠)
        quad(bm, col, [(-0.52, t + 0.002, z - 0.03), (-0.52, t + 0.002, z + 0.03), (-0.18, t + 0.002, z + 0.03), (-0.18, t + 0.002, z - 0.03)], (0.30, 0.33, 0.40, 1))
    tube(bm, col, [(-0.06, 0.0), (0.12, 0.05), (0.26, 0.10)], [0.03, 0.026, 0.03], STEEL, 8, STEEL_LO)
    tube(bm, col, [(0.26, 0.10), (0.5, 0.17), (0.8, 0.25), (1.0, 0.29)], [0.045, 0.05, 0.05, 0.04], WOOD, 10, WOOD_LO)

def board(bm, col, uvl):
    # 도마: 세워 든 방패. x ±0.5, y 0 .. 1.3, 두께 z ±0.045, 앞면 = +z (밝은 나무결), 위쪽 손잡이 구멍
    N = 8
    for i in range(N):
        x0, x1 = -0.5 + i / N, -0.5 + (i + 1) / N; c = LWOOD if i % 2 == 0 else LWOOD2
        quad(bm, col, [(x0, 0.03, 0.045), (x1, 0.03, 0.045), (x1, 1.27, 0.045), (x0, 1.27, 0.045)], c)
        quad(bm, col, [(x0, 0.03, -0.045), (x0, 1.27, -0.045), (x1, 1.27, -0.045), (x1, 0.03, -0.045)], LWOOD_LO)
    for (ya, yb, za) in ((0.0, 0.03, 0.02), (1.27, 1.3, 0.02)):   # 둥글린 위·아래 모서리
        y_in, y_out = (yb, ya) if ya == 0.0 else (ya, yb)
        quad(bm, col, [(-0.5, y_in, 0.045), (0.5, y_in, 0.045), (0.5, y_out, za), (-0.5, y_out, za)][::(1 if ya else -1)], LWOOD2)
        quad(bm, col, [(-0.5, y_in, -0.045), (-0.5, y_out, -za), (0.5, y_out, -za), (0.5, y_in, -0.045)][::(1 if ya else -1)], LWOOD_LO)
        quad(bm, col, [(-0.5, y_out, za), (0.5, y_out, za), (0.5, y_out, -za), (-0.5, y_out, -za)][::(1 if ya else -1)], LWOOD_LO)
    for sx in (-1, 1):
        quad(bm, col, [(sx * 0.5, 0.0, 0.02), (sx * 0.5, 0.0, -0.02), (sx * 0.5, 0.03, -0.045), (sx * 0.5, 1.27, -0.045), (sx * 0.5, 1.3, -0.02), (sx * 0.5, 1.3, 0.02), (sx * 0.5, 1.27, 0.045), (sx * 0.5, 0.03, 0.045)][::sx], LWOOD_LO)
    quad(bm, col, [(-0.13, 1.08, 0.047), (0.13, 1.08, 0.047), (0.13, 1.17, 0.047), (-0.13, 1.17, 0.047)], (0.20, 0.12, 0.06, 1))   # 손잡이 구멍(어두운 칸)
    quad(bm, col, [(-0.13, 1.08, -0.047), (-0.13, 1.17, -0.047), (0.13, 1.17, -0.047), (0.13, 1.08, -0.047)], (0.20, 0.12, 0.06, 1))

def ladle(bm, col, uvl):
    # 국자: 그릇 중심 원점(입구 +y, 반지름 0.3), 국물 면, 긴 자루가 위로 1.5 까지, 끝에 고리
    lathe(bm, col, [(0.0, -0.27), (0.17, -0.22), (0.27, -0.10), (0.30, 0.0), (0.275, 0.0), (0.25, -0.09), (0.15, -0.19), (0.0, -0.235)], 20,
          lambda k, p: STEEL_HI if k == 3 else (STEEL_LO if k >= 4 else STEEL))
    lathe(bm, col, [(0.0, -0.05), (0.262, -0.05)], 20, lambda k, p: SOUP)
    lathe(bm, col, [(0.0, -0.045), (0.12, -0.045)], 12, lambda k, p: SOUP_HI)
    tube(bm, col, [(0.27, -0.02), (0.36, 0.16), (0.42, 0.6), (0.44, 1.1), (0.42, 1.42), (0.36, 1.5), (0.30, 1.46)], [0.03, 0.028, 0.026, 0.026, 0.026, 0.024, 0.02], STEEL, 8, STEEL_LO)

def skewer(bm, col, uvl):
    # 꼬치: 쇠꼬챙이 x 0(고리 손잡이) .. 1(뾰족한 끝), 가운데에 고기·피망·양파 토막
    tube(bm, col, [(0.0, 0.0), (0.93, 0.0), (1.0, 0.0)], [0.012, 0.012, 0.001], STEEL_HI, 6, STEEL_LO)
    ring = [(math.cos(a) * 0.045 - 0.045, math.sin(a) * 0.045) for a in [i * math.pi / 5 for i in range(11)]]
    tube(bm, col, ring, 0.011, BRASS, 6)
    meat = lambda u: (0.50 + 0.18 * u, 0.24 + 0.10 * u, 0.10 + 0.04 * u, 1)
    blob(bm, col, (0.36, 0, 0), (0.060, 0.062, 0.062), None, 8, 5, meat)
    box(bm, col, 0.44, 0.475, -0.062, 0.062, -0.062, 0.062, (0.90, 0.16, 0.10, 1), (1.0, 0.36, 0.22, 1))
    blob(bm, col, (0.53, 0, 0), (0.030, 0.066, 0.066), None, 10, 4, lambda u: (0.98, 0.95, 0.84, 1))
    blob(bm, col, (0.625, 0, 0), (0.064, 0.064, 0.064), None, 8, 5, meat)
    box(bm, col, 0.705, 0.74, -0.060, 0.060, -0.060, 0.060, (0.36, 0.72, 0.22, 1), (0.56, 0.88, 0.36, 1))
    blob(bm, col, (0.80, 0, 0), (0.052, 0.056, 0.056), None, 8, 5, meat)

def shaker(bm, col, uvl):
    # 후추통(나무 그라인더): 바닥 y 0, 높이 1, 가운데 놋쇠 띠
    DW, DW2 = (0.34, 0.19, 0.09, 1), (0.50, 0.30, 0.15, 1)
    lathe(bm, col, [(0.0, 0.0), (0.20, 0.0), (0.225, 0.05), (0.19, 0.28), (0.155, 0.48), (0.20, 0.60), (0.215, 0.68), (0.17, 0.76), (0.085, 0.80), (0.125, 0.88), (0.125, 0.96), (0.0, 1.0)], 18,
          lambda k, p: BRASS if k in (5, 8) else (DW2 if k in (1, 3, 9) else DW))

def sack(bm, col, uvl):
    # 밀가루 포대: 바닥 y 0, 높이 1, 통통한 자루 + 묶은 끈
    CL, CL2, ROPE = (0.90, 0.82, 0.64, 1), (0.78, 0.68, 0.50, 1), (0.55, 0.38, 0.18, 1)
    lathe(bm, col, [(0.0, 0.0), (0.40, 0.02), (0.50, 0.24), (0.47, 0.56), (0.31, 0.79), (0.15, 0.86), (0.13, 0.89), (0.21, 0.96), (0.25, 1.0), (0.0, 0.97)], 16,
          lambda k, p: ROPE if k == 5 else ((1, 1, 0.96, 1) if k >= 6 else (CL if k % 2 == 0 else CL2)))

def bowl(bm, col, uvl):
    # 수프 그릇: 바닥 y 0, 테두리 반지름 0.5 / 높이 0.34, 주황 국물 + 건더기
    CR, CR2 = (0.96, 0.93, 0.86, 1), (0.40, 0.62, 0.86, 1)
    lathe(bm, col, [(0.0, 0.0), (0.22, 0.0), (0.26, 0.03), (0.44, 0.24), (0.50, 0.34), (0.47, 0.34), (0.40, 0.24), (0.0, 0.22)], 24, lambda k, p: CR2 if k == 3 else CR)
    lathe(bm, col, [(0.0, 0.285), (0.44, 0.285)], 24, lambda k, p: SOUP)
    lathe(bm, col, [(0.0, 0.29), (0.2, 0.29)], 12, lambda k, p: SOUP_HI)
    for (x, z, c) in ((0.2, 0.12, (1.0, 0.45, 0.10, 1)), (-0.16, 0.2, (0.42, 0.78, 0.28, 1)), (-0.1, -0.22, (1.0, 0.45, 0.10, 1)), (0.24, -0.16, (0.42, 0.78, 0.28, 1))):
        box(bm, col, x - 0.045, x + 0.045, 0.27, 0.32, z - 0.045, z + 0.045, c)

def lunchbox(bm, col, uvl):
    # 도시락: 나무 상자 x ±0.5, z ±0.36, 높이 0.24, 칸마다 밥·달걀말이·채소·소시지
    W, W2 = (0.62, 0.38, 0.18, 1), (0.40, 0.23, 0.10, 1)
    box(bm, col, -0.5, 0.5, 0.0, 0.2, -0.36, 0.36, W2, W2)
    for (x0, x1, z0, z1) in ((-0.5, 0.5, -0.36, -0.32), (-0.5, 0.5, 0.32, 0.36), (-0.5, -0.46, -0.36, 0.36), (0.46, 0.5, -0.36, 0.36), (-0.02, 0.02, -0.34, 0.34), (0.0, 0.48, -0.02, 0.02)):
        box(bm, col, x0, x1, 0.0, 0.25, z0, z1, W, (0.76, 0.50, 0.26, 1))
    box(bm, col, -0.46, -0.02, 0.2, 0.225, -0.32, 0.32, (0.98, 0.98, 0.94, 1), (1, 1, 1, 1))                       # 밥
    blob(bm, col, (-0.24, 0.235, 0.0), (0.06, 0.04, 0.06), (0.86, 0.12, 0.14, 1), 8, 4)                              # 매실
    for i in range(3): box(bm, col, 0.06 + i * 0.13, 0.16 + i * 0.13, 0.2, 0.27, 0.06, 0.28, (1.0, 0.82, 0.25, 1), (1.0, 0.92, 0.5, 1))   # 달걀말이
    box(bm, col, 0.04, 0.24, 0.2, 0.24, -0.3, -0.05, (0.36, 0.72, 0.26, 1), (0.52, 0.86, 0.36, 1))                 # 채소
    for i in range(2): blob(bm, col, (0.35, 0.235, -0.24 + i * 0.13), (0.085, 0.045, 0.045), (0.80, 0.30, 0.20, 1), 8, 4)   # 소시지

def plate(bm, col, uvl):
    # 든든한 한 끼: 큰 접시(반지름 0.5) + 닭다리 + 으깬 감자 + 완두콩
    CR = (0.97, 0.95, 0.90, 1)
    lathe(bm, col, [(0.0, 0.0), (0.26, 0.0), (0.30, 0.02), (0.50, 0.07), (0.50, 0.085), (0.30, 0.04), (0.0, 0.035)], 24, lambda k, p: (0.86, 0.72, 0.36, 1) if k == 3 else CR)
    roast = lambda u: (0.62 + 0.28 * u, 0.30 + 0.20 * u, 0.10 + 0.05 * u, 1)
    blob(bm, col, (-0.10, 0.14, 0.02), (0.20, 0.13, 0.15), None, 10, 6, roast)
    tube(bm, col, [(0.06, 0.13), (0.30, 0.17)], [0.035, 0.03], (0.98, 0.96, 0.90, 1), 6)
    blob(bm, col, (0.32, 0.175, 0.0), (0.05, 0.04, 0.05), (1, 1, 0.96, 1), 6, 4)
    blob(bm, col, (0.06, 0.09, -0.24), (0.15, 0.08, 0.12), None, 8, 5, lambda u: (0.98, 0.92 + 0.05 * u, 0.70 + 0.1 * u, 1))
    for (x, z) in ((0.14, 0.24), (0.22, 0.2), (0.2, 0.3), (0.09, 0.31), (0.28, 0.27)): blob(bm, col, (x, 0.07, z), (0.035, 0.035, 0.035), (0.40, 0.80, 0.28, 1), 6, 4)

def cookie(bm, col, uvl):
    # 간식: 초코칩 쿠키 (xy 평면에 세운 원판, 반지름 0.5, 두께 0.12)
    CK, CK2, CH = (0.86, 0.60, 0.30, 1), (0.70, 0.45, 0.20, 1), (0.28, 0.15, 0.08, 1)
    N = 18; t = 0.06; pts = [(math.cos(2 * math.pi * i / N) * 0.5 * (1 + 0.04 * math.sin(i * 2.7)), math.sin(2 * math.pi * i / N) * 0.5 * (1 + 0.04 * math.cos(i * 1.9))) for i in range(N)]
    cf, cb = bm.verts.new(V(0, 0, t * 1.5)), bm.verts.new(V(0, 0, -t))
    rf, rb = [bm.verts.new(V(x, y, t)) for (x, y) in pts], [bm.verts.new(V(x, y, -t)) for (x, y) in pts]
    for i in range(N):
        j = (i + 1) % N
        for vs, c in (((cf, rf[i], rf[j]), CK), ((cb, rb[j], rb[i]), CK2), ((rf[i], rb[i], rb[j], rf[j]), CK2)):
            f = bm.faces.new(vs)
            for l in f.loops: l[col] = c
    rng = random.Random(3)
    for _ in range(9):
        a, r = rng.uniform(0, 6.28), rng.uniform(0.05, 0.38); x, y = math.cos(a) * r, math.sin(a) * r
        blob(bm, col, (x, y, t * 1.25), (0.05, 0.05, 0.03), CH, 6, 3)

def drop(bm, col, uvl):
    # 국물 방울: 반지름 1 의 물방울(꼬리 +y)
    lathe(bm, col, [(0.0, -1.0), (0.6, -0.8), (0.95, -0.25), (0.8, 0.35), (0.38, 0.95), (0.0, 1.5)], 10, lambda k, p: SOUP_HI if k >= 3 else SOUP)

def main():
    FP.reset()
    obs = [new_obj('cook_knife', knife, False), new_obj('cook_pan', pan), new_obj('cook_meatball', meatball), new_obj('cook_chip_a', chip_a, False),
           new_obj('cook_chip_b', chip_b, False), new_obj('cook_chip_c', chip_c, False), new_obj('cook_star', star, False),
           new_obj('cook_spatula', spatula, False), new_obj('cook_board', board, False), new_obj('cook_ladle', ladle), new_obj('cook_skewer', skewer), new_obj('cook_shaker', shaker),
           new_obj('cook_sack', sack), new_obj('cook_bowl', bowl), new_obj('cook_lunchbox', lunchbox, False), new_obj('cook_plate', plate), new_obj('cook_cookie', cookie, False), new_obj('cook_drop', drop)]
    for o in obs:
        if o.name in ('cook_knife', 'cook_pan', 'cook_ladle', 'cook_skewer', 'cook_shaker', 'cook_sack', 'cook_bowl', 'cook_plate'):
            m = o.modifiers.new('es', 'EDGE_SPLIT'); m.split_angle = math.radians(38)
            for p in o.data.polygons: p.use_smooth = True
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(FP.TMP, 'fx_cook.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(FP.OUT, 'fx_cook.glb.json'), 'w'))
    for k, o in enumerate(obs): o.location.x = k * 2.4
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_cook.blend'), compress=True)
    print('tris', tris, 'glb bytes', len(raw), flush=True)

if __name__ == '__main__':
    main()
