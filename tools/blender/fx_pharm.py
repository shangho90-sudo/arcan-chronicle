"""약사 1차 새 스킬 이펙트 소품 + 스킬 아이콘 (Blender bpy, headless, 2026-11-11).

Usage:  python3 tools/blender/fx_pharm.py            (bpy module, Blender 5.x)
        python3 tools/blender/fx_pharm.py icons      (아이콘만 다시)
        python3 tools/blender/fx_pharm.py fx         (메시·텍스처만)

처음에는 Tripo 크레딧이 없어 모든 소품을 여기서 절차적으로 만들었다. 같은 날 크레딧 충전 뒤 황금 유봉·황금 약병·지면 파편은
Tripo 초안(tools/tripo/pharm_assets.py) → tools/blender/fx_pharm_tripo.py 정리판을 게임이 우선 쓰고, 여기 메시는 그 파일이 없을 때의
대체품 + 이펙트 전용 메시(리본·링·돔·파쇄 조각)이다.

Meshes (game axes: +Y up, +Z forward, metres; the game scales them) -> assets/fx/fx_pharm.glb.json
  pharm_pestle      천근쇄약: ornate golden pestle, 1 m tall (head down at y 0 .. knob at y 1), vertex colours
                    gold (bands brighter) + jade ring; js/pharmfx.js scales it to ~4.6 m and drops it from the sky
  pharm_flask       약병폭격: round flask body + neck (vertex colour R = liquid mask, G = glass rim) — the game tints
                    the liquid fire / ice / poison
  pharm_cork        약병 코르크 마개 (brown)
  pharm_syringe     아드레날린 주사: barrel (orange liquid), brass plunger + finger flange, silver needle (+Y = needle)
  pharm_circle      광역 회복진: flat disc radius 1 (planar UV) -> fx_pharm_circle.png
  pharm_ring        thin annulus (0.86 .. 1) for shock / shield ground rings
  pharm_dome        보호막: UV half-sphere radius 1 (UV v = height) -> hex pattern / fresnel in the shader
  (2026-11-11 그래픽 개선)
  pharm_liquid      약병 속 액체 (유리 pharm_flask와 분리)
  pharm_ribbon      휘두르기·감김 리본: 반지름 1 호 (RIB_SPAN), 꼬리 u 0 -> 머리 u 1, v 0 안쪽 .. 1 바깥
  pharm_quad        빌보드 쿼드 (아틀라스 모든 칸)        pharm_cracks  가는 균열선 r 0.55 .. 1.75
  pharm_piece_NN    지면 파쇄 원판(반지름 1)을 쪼갠 두께 있는 포장석 조각 (노드 위치 = 조각 중심)
  pharm_shard_N     튀는 돌 조각 (Tripo 파편이 없을 때)
Atlas:   assets/fx/fx_pharm.png (1024, R = 뜨거운 중심, G = 몸통, B = 잔광, A = 덮임) + glb.json "cells"
Texture: assets/fx/fx_pharm_circle.png  (green healing circle: double ring, runes, leaf crosses; RGBA)
Icons:   assets/ui/skills/ph1_a6.png ph1_b6.png ph1_c6.png ph1_c7.png ph1_c8.png  (128 px, round gold rim like the
         cropped pharmacist icons; Cycles render of the props above + PIL frame)
Sources: tools/blender/pharm/fx_pharm.blend, fx_pharm.fbx
"""
import os, sys, math, json, base64, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'pharm'); ICONS = os.path.join(ROOT, 'assets', 'ui', 'skills')
TMP = '/tmp/fx_pharm'; [os.makedirs(d, exist_ok=True) for d in (OUT, SRC, ICONS, TMP)]

def V(x, y, z): return (x, -z, y)        # game (x, y up, z fwd) -> Blender (x, y, z up)

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 48
    try: sc.cycles.use_denoising = False
    except Exception: pass
    return sc

def lathe(bm, col, prof, seg=28, colf=None, y0=0.0):
    """profile [(r, y)] bottom -> top (game axes, y up), closed with caps when r == 0 at the ends"""
    rings = []
    for (r, y) in prof:
        ring = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            ring.append(bm.verts.new(V(math.cos(a) * r, y + y0, math.sin(a) * r)))
        rings.append(ring)
    faces = []
    for k in range(len(rings) - 1):
        for i in range(seg):
            j = (i + 1) % seg; f = bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i])); faces.append((f, k))
    for idx, ring in ((0, rings[0]), (-1, rings[-1])):
        if prof[idx][0] > 1e-4:
            f = bm.faces.new(ring if idx == -1 else list(reversed(ring))); faces.append((f, 0 if idx == 0 else len(rings) - 2))
    for f, k in faces:
        c = colf(k, prof) if colf else (1, 1, 1, 1)
        for l in f.loops: l[col] = c
    return faces

def new_obj(name, build, smooth=True):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    col = bm.loops.layers.color.new('Col'); uvl = bm.loops.layers.uv.new('UVMap')
    build(bm, col, uvl)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces: f.smooth = smooth
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    return ob

GOLD, GOLD_HI, GOLD_LO, JADE = (1.0, 0.74, 0.26, 1), (1.0, 0.9, 0.52, 1), (0.72, 0.46, 0.14, 1), (0.25, 0.85, 0.6, 1)

def pestle(bm, col, uvl):
    # rounded club head at the bottom, waist, long handle with three raised bands, jade ring, round knob
    P = [(0.0, 0.0), (0.09, 0.006), (0.15, 0.03), (0.185, 0.075), (0.195, 0.13), (0.185, 0.19), (0.155, 0.24), (0.11, 0.285),
         (0.08, 0.32), (0.075, 0.35), (0.085, 0.36), (0.085, 0.385), (0.07, 0.395), (0.062, 0.5), (0.06, 0.6), (0.072, 0.61),
         (0.072, 0.635), (0.06, 0.645), (0.058, 0.76), (0.056, 0.84), (0.078, 0.85), (0.08, 0.875), (0.078, 0.9), (0.058, 0.91),
         (0.06, 0.93), (0.082, 0.955), (0.088, 0.98), (0.07, 1.0), (0.0, 1.012)]
    band = {9, 10, 11, 14, 15, 16, 20, 21, 25, 26}
    def c(k, prof):
        if k in (19, 20, 21, 22): return JADE
        if k in band: return GOLD_HI
        y = prof[k][1]; t = min(1, y / 0.3)
        return tuple(GOLD_LO[i] * (1 - t) + GOLD[i] * t for i in range(3)) + (1,) if y < 0.3 else GOLD
    lathe(bm, col, P, 32, c)

def flask(bm, col, uvl):
    P = [(0.0, 0.0)]
    for i in range(1, 12):
        a = -math.pi / 2 + math.pi * 0.86 * i / 11; P.append((0.13 * math.cos(a), 0.13 + 0.13 * math.sin(a)))
    P += [(0.042, 0.27), (0.036, 0.33), (0.046, 0.345), (0.046, 0.355), (0.036, 0.36)]
    def c(k, prof): return (1, 0, 0, 1) if prof[k][1] < 0.24 else (0.5, 1, 0, 1)
    lathe(bm, col, P, 22, c)

def cork(bm, col, uvl):
    lathe(bm, col, [(0.0, 0.335), (0.034, 0.336), (0.038, 0.37), (0.04, 0.395), (0.0, 0.396)], 14, lambda k, p: (0.62, 0.42, 0.22, 1))

def syringe(bm, col, uvl):
    # along +Y: plunger thumb at y 0, rod, flange, barrel, nozzle, needle tip at y 1
    GL, BR, SI = (1.0, 0.45, 0.2, 1), (0.95, 0.72, 0.3, 1), (0.85, 0.88, 0.92, 1)
    lathe(bm, col, [(0.0, 0.0), (0.09, 0.0), (0.09, 0.03), (0.02, 0.035), (0.02, 0.2), (0.0, 0.2)], 18, lambda k, p: BR)
    lathe(bm, col, [(0.0, 0.2), (0.07, 0.2), (0.075, 0.215), (0.075, 0.68), (0.06, 0.7), (0.025, 0.74), (0.012, 0.76), (0.0, 0.76)], 22,
          lambda k, p: GL if 0 < k < 5 else BR)
    lathe(bm, col, [(0.0, 0.76), (0.006, 0.76), (0.004, 1.0), (0.0, 1.0)], 8, lambda k, p: SI)
    # finger flange (flat oval plate)
    seg = 24; top, bot = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg; x, z = math.cos(a) * 0.17, math.sin(a) * 0.075
        bot.append(bm.verts.new(V(x, 0.2, z))); top.append(bm.verts.new(V(x, 0.225, z)))
    for i in range(seg):
        j = (i + 1) % seg; f = bm.faces.new((bot[i], bot[j], top[j], top[i]))
        for l in f.loops: l[col] = BR
    for ring, rev in ((top, False), (bot, True)):
        f = bm.faces.new(list(reversed(ring)) if rev else ring)
        for l in f.loops: l[col] = BR

def disc(bm, col, uvl, seg=64):
    c = bm.verts.new(V(0, 0, 0)); rim = [bm.verts.new(V(math.cos(2 * math.pi * i / seg), 0, math.sin(2 * math.pi * i / seg))) for i in range(seg)]
    for i in range(seg):
        f = bm.faces.new((c, rim[(i + 1) % seg], rim[i]))
        for l in f.loops:
            co = l.vert.co; l[uvl].uv = (0.5 + co.x * 0.5, 0.5 + (-co.y) * 0.5); l[col] = (1, 1, 1, 1)

def ring(bm, col, uvl, seg=64, rin=0.86):
    rows = [(bm.verts.new(V(math.cos(2 * math.pi * i / seg) * rin, 0, math.sin(2 * math.pi * i / seg) * rin)),
             bm.verts.new(V(math.cos(2 * math.pi * i / seg), 0, math.sin(2 * math.pi * i / seg)))) for i in range(seg)]
    for i in range(seg):
        a0, b0 = rows[i]; a1, b1 = rows[(i + 1) % seg]; f = bm.faces.new((a0, a1, b1, b0))
        for l in f.loops: l[uvl].uv = (1.0 if l.vert in (b0, b1) else 0.0, i / seg); l[col] = (1, 1, 1, 1)

def dome(bm, col, uvl, seg=40, rows=14):
    vs = []
    for k in range(rows + 1):
        ph = (math.pi / 2) * k / rows; r = math.cos(ph); y = math.sin(ph)
        vs.append([bm.verts.new(V(math.cos(2 * math.pi * i / seg) * r, y, math.sin(2 * math.pi * i / seg) * r)) for i in range(seg)])
    for k in range(rows):
        for i in range(seg):
            j = (i + 1) % seg; f = bm.faces.new((vs[k][i], vs[k][j], vs[k + 1][j], vs[k + 1][i]))
            for l in f.loops:
                kk = k + (1 if l.vert in (vs[k + 1][i], vs[k + 1][j]) else 0); ii = i + (1 if l.vert in (vs[k][j], vs[k + 1][j]) and j != 0 else 0) + (seg if j == 0 and l.vert in (vs[k][j], vs[k + 1][j]) else 0)
                l[uvl].uv = (ii / seg, kk / rows); l[col] = (1, 1, 1, 1)

# ------------------------------------------------------------------ 2026-11-11 그래픽 개선: 리본·파편·아틀라스
# tunables (the game scales / colours everything; these only shape the unit meshes)
RIB_SPAN = 210.0      # ribbon arc span (deg): tail at angle 0, head at RIB_SPAN, outer edge on radius 1
RIB_SEG = 56
RIB_W = 0.20          # max ribbon width (radius 1)
PIECE_RINGS = [(0.0, 0.30, 5), (0.30, 0.63, 8), (0.63, 1.0, 12)]   # fracture: (r0, r1, sectors) of the unit shatter disc
PIECE_GAP = 0.040     # half gap between neighbouring pieces (the gold light shows through)
PIECE_T = 0.17        # piece thickness (unit disc; the game scales x/z by R and y by R * 0.75)
PIECE_BEVEL = 0.028
STONE_TOP, STONE_SIDE, STONE_EDGE = (0.60, 0.53, 0.44), (0.30, 0.26, 0.22), (0.74, 0.67, 0.56)   # 회베이지 포장석 윗면 / 어두운 옆면 / 밝은 모서리
N_SHARD = 8
ATLAS = 1024
SEED = 23

def ribbon(bm, col, uvl):
    """② curved energy ribbon: flat arc in the ground plane, bright sharp head (u = 1), thin transparent tail (u = 0); v = 0 inner .. 1 outer"""
    rows = []
    for i in range(RIB_SEG + 1):
        u = i / RIB_SEG; a = math.radians(RIB_SPAN) * u
        w = RIB_W * (0.10 + 0.90 * u ** 0.7) * (1.0 - 0.92 * max(0.0, (u - 0.90) / 0.10) ** 1.5)      # widens towards the head, pointed tip
        ro = 1.0 - 0.06 * (1 - u) ** 2                                                               # the tail curls slightly inwards
        rows.append((bm.verts.new(V(math.cos(a) * (ro - w), 0, math.sin(a) * (ro - w))), bm.verts.new(V(math.cos(a) * ro, 0, math.sin(a) * ro)), u))
    for i in range(RIB_SEG):
        a0, b0, u0 = rows[i]; a1, b1, u1 = rows[i + 1]; f = bm.faces.new((a0, a1, b1, b0))
        for l in f.loops:
            l[uvl].uv = (u0 if l.vert in (a0, b0) else u1, 1.0 if l.vert in (b0, b1) else 0.0); l[col] = (1, 1, 1, 1)

def quad(bm, col, uvl):
    """unit quad in the XY plane (faces +Z), centred: every billboard sprite (glow / star / puff / arrow / plus / spark)"""
    vs = [bm.verts.new(V(-0.5, -0.5, 0)), bm.verts.new(V(0.5, -0.5, 0)), bm.verts.new(V(0.5, 0.5, 0)), bm.verts.new(V(-0.5, 0.5, 0))]
    f = bm.faces.new(vs)
    for l, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uvl].uv = uv; l[col] = (1, 1, 1, 1)

def cracks(bm, col, uvl):
    """⑤ thin jagged crack lines radiating beyond the shatter disc (r 0.55 .. 1.75), flat; u = along, v = across"""
    rng = random.Random(SEED + 3)
    def line(a, r0, r1, w, n=5):
        pts = []
        for k in range(n + 1):
            t = k / n; r = r0 + (r1 - r0) * t; aa = a + (rng.uniform(-0.09, 0.09) if 0 < k else 0) * (1 - 0.3 * t)
            pts.append((math.cos(aa) * r, math.sin(aa) * r, t))
        prev = None
        for k, (x, z, t) in enumerate(pts):
            nx, nz = pts[min(k + 1, n)][0] - pts[max(k - 1, 0)][0], pts[min(k + 1, n)][1] - pts[max(k - 1, 0)][1]; m = math.hypot(nx, nz) or 1
            hw = w * (1 - t) ** 0.8 + 0.002
            cur = (bm.verts.new(V(x - nz / m * hw, 0, z + nx / m * hw)), bm.verts.new(V(x + nz / m * hw, 0, z - nx / m * hw)), t)
            if prev:
                f = bm.faces.new((prev[0], cur[0], cur[1], prev[1]))
                for l in f.loops: l[uvl].uv = (prev[2] if l.vert in (prev[0], prev[1]) else cur[2], 0.0 if l.vert in (prev[0], cur[0]) else 1.0); l[col] = (1, 1, 1, 1)
            prev = cur
        return pts
    for i in range(11):
        a = 2 * math.pi * (i + rng.uniform(-0.25, 0.25)) / 11; r1 = rng.uniform(1.25, 1.75)
        pts = line(a, 0.55, r1, 0.030)
        if rng.random() < 0.6:
            bx, bz, bt = pts[3]; line(math.atan2(bz, bx) + rng.choice((-1, 1)) * rng.uniform(0.35, 0.6), math.hypot(bx, bz), math.hypot(bx, bz) + rng.uniform(0.2, 0.4), 0.016, 3)

def fracture():
    """⑤ the shatter disc (radius 1) broken into thick paving pieces: [(name, centroid (x, z), builder)]; every piece is its own
    object with the origin at its centroid, so the game lifts / tilts / drops each one separately"""
    rng = random.Random(SEED); out = []
    # shared jittered boundary points so neighbouring pieces fit: ring boundary k has `den` points
    den = 24
    bound = []
    for k, r in enumerate([0.0, 0.30, 0.63, 1.0]):
        row = []
        for i in range(den):
            a = 2 * math.pi * i / den + (rng.uniform(-0.05, 0.05) if r > 0 else 0)
            rr = r + (rng.uniform(-0.035, 0.035) if 0 < r < 1 else rng.uniform(-0.08, 0.03) if r >= 1 else 0)
            row.append((math.cos(a) * rr, math.sin(a) * rr))
        bound.append(row)
    for k, (r0, r1, n) in enumerate(PIECE_RINGS):
        cuts = sorted(set(int(round((i + rng.uniform(-0.22, 0.22)) * den / n)) % den for i in range(n)))
        for ci, c0 in enumerate(cuts):
            c1 = cuts[(ci + 1) % len(cuts)]; span = (c1 - c0) % den or den
            outer = [bound[k + 1][(c0 + j) % den] for j in range(span + 1)]
            inner = [bound[k][(c0 + j) % den] for j in range(span + 1)] if r0 > 0 else [(0.0, 0.0)]
            poly = outer + list(reversed(inner))
            cx = sum(p[0] for p in poly) / len(poly); cz = sum(p[1] for p in poly) / len(poly)
            tone = rng.uniform(0.88, 1.08); warm = rng.uniform(-0.03, 0.03)
            out.append(('pharm_piece_%02d' % len(out), (cx, cz), piece_builder(poly, cx, cz, tone, warm)))
    return out

def piece_builder(poly, cx, cz, tone, warm):
    def shrink(pts, d):
        # move every vertex towards the centroid by d (cheap inset, good enough for these convex-ish pieces)
        o = []
        for (x, z) in pts:
            dx, dz = x - cx, z - cz; m = math.hypot(dx, dz) or 1; k = max(0.0, m - d) / m; o.append((cx + dx * k, cz + dz * k))
        return o
    def build(bm, col, uvl):
        base = shrink(poly, PIECE_GAP); top = shrink(poly, PIECE_GAP + PIECE_BEVEL)
        ct = tuple(min(1, c * tone + (warm if i == 0 else -warm if i == 2 else 0)) for i, c in enumerate(STONE_TOP)) + (1,)
        cs = tuple(c * tone for c in STONE_SIDE) + (1,); ce = tuple(min(1, c * tone) for c in STONE_EDGE) + (1,)
        vt = [bm.verts.new(V(x - cx, 0.0, z - cz)) for (x, z) in top]
        vb = [bm.verts.new(V(x - cx, -PIECE_BEVEL * 0.8, z - cz)) for (x, z) in base]
        vd = [bm.verts.new(V(cx + (x - cx) * 0.9 - cx, -PIECE_T, cz + (z - cz) * 0.9 - cz)) for (x, z) in base]
        n = len(poly)
        f = bm.faces.new(list(reversed(vt)))
        for l in f.loops: l[col] = ct
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((vt[i], vt[j], vb[j], vb[i]))
            for l in f.loops: l[col] = ce
            f = bm.faces.new((vb[i], vb[j], vd[j], vd[i]))
            for l in f.loops: l[col] = cs if l.vert in (vb[i], vb[j]) else tuple(c * 0.6 for c in cs[:3]) + (1,)
        f = bm.faces.new(vd)
        for l in f.loops: l[col] = tuple(c * 0.5 for c in cs[:3]) + (1,)
    return build

def shard_builder(i):
    """⑤ loose paving chunk (radius ~1): convex hull of jittered points in a flattened blob, flat shaded, top faces paving-coloured"""
    def build(bm, col, uvl):
        rng = random.Random(SEED * 7 + i); n = rng.randint(9, 13); sx, sy, sz = rng.uniform(0.7, 1.0), rng.uniform(0.28, 0.45), rng.uniform(0.55, 1.0)
        for k in range(n):
            a = rng.uniform(0, 2 * math.pi); h = rng.choice((-1, 1)) * rng.uniform(0.6, 1.0); r = rng.uniform(0.75, 1.0)
            bm.verts.new(V(math.cos(a) * r * sx, h * sy, math.sin(a) * r * sz))
        bmesh.ops.convex_hull(bm, input=bm.verts)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        tone = rng.uniform(0.9, 1.08)
        for f in bm.faces:
            up = f.normal.z            # Blender z = game y
            c = STONE_TOP if up > 0.6 else STONE_EDGE if up > 0.2 else STONE_SIDE
            k = tone * (1.0 if up > 0.2 else 0.75 + 0.25 * (up + 1))
            for l in f.loops: l[col] = tuple(min(1, q * k) for q in c) + (1,)
    return build

def liquid(bm, col, uvl):
    """약병 속 액체: the flask body profile shrunk a little and cut flat at 62 % height (separate from the glass shell)"""
    P = [(0.0, 0.008)]
    for i in range(1, 12):
        a = -math.pi / 2 + math.pi * 0.86 * i / 11; r, y = 0.118 * math.cos(a), 0.13 + 0.118 * math.sin(a)
        if y > 0.165: P.append((0.118 * math.cos(math.asin((0.165 - 0.13) / 0.118)), 0.165)); break
        P.append((r, y))
    P.append((0.0, 0.165))
    lathe(bm, col, P, 20, lambda k, p: (1, 0, 0, 1))

# cells of fx_pharm.png (x0, y0, w, h) in atlas fractions, image space (y from the TOP; the game loads it with flipY = false)
CELLS = {'ribbon': (0.0, 0.0, 1.0, 0.25),
         'glow': (0.0, 0.25, 0.25, 0.25), 'star': (0.25, 0.25, 0.25, 0.25), 'puff': (0.5, 0.25, 0.25, 0.25), 'puff2': (0.75, 0.25, 0.25, 0.25),
         'arrow': (0.0, 0.5, 0.25, 0.25), 'plus': (0.25, 0.5, 0.25, 0.25), 'spark': (0.5, 0.5, 0.25, 0.25), 'bubble': (0.75, 0.5, 0.25, 0.25),
         'crack': (0.0, 0.75, 0.25, 0.25), 'streak': (0.25, 0.75, 0.25, 0.25), 'dust': (0.5, 0.75, 0.25, 0.25), 'flare': (0.75, 0.75, 0.25, 0.25)}

def atlas_png():
    """Masks the game recolours: R = hot core (-> near white), G = body (-> the skill colour), B = soft halo (-> deeper tone), A = coverage.
    Every cell is written with image-space coordinates U (right) / D (down); sprites keep +Y up = D 0."""
    rng = np.random.default_rng(SEED); img = np.zeros((ATLAS, ATLAS, 4), np.float32)
    ss = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a + 1e-9), 0, 1))
    def fbm(shape, octaves=4, base=4):
        out = np.zeros(shape, np.float32); amp = 1.0; tot = 0
        for o in range(octaves):
            n = base * 2 ** o; g = rng.random((n + 1, n + 1)).astype(np.float32)
            ys = np.linspace(0, n, shape[0]); xs = np.linspace(0, n, shape[1]); yi = np.minimum(ys.astype(int), n - 1); xi = np.minimum(xs.astype(int), n - 1)
            fy = (ys - yi)[:, None]; fx = (xs - xi)[None, :]; fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
            a = g[yi][:, xi]; b = g[yi][:, xi + 1]; c_ = g[yi + 1][:, xi]; d = g[yi + 1][:, xi + 1]
            out += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (c_ * (1 - fx) + d * fx) * fy); tot += amp; amp *= 0.5
        return out / tot
    def grid(name):
        x0, y0, w, h = CELLS[name]; nx, ny = int(w * ATLAS), int(h * ATLAS)
        U, D = np.meshgrid((np.arange(nx) + 0.5) / nx, (np.arange(ny) + 0.5) / ny); return U, D
    def put(name, R, Gc, B, A=None, edge=0.03):
        x0, y0, w, h = CELLS[name]; ox, oy, nx, ny = int(x0 * ATLAS), int(y0 * ATLAS), int(w * ATLAS), int(h * ATLAS)
        if A is None: A = np.clip(np.maximum(np.maximum(R, Gc * 0.95), B * 0.8), 0, 1)
        U, D = grid(name); e = np.ones_like(R)
        if edge: e = np.clip(np.minimum(U, 1 - U) / edge, 0, 1) * np.clip(np.minimum(D, 1 - D) / edge, 0, 1)
        img[oy:oy + ny, ox:ox + nx] = np.stack([np.clip(R * e, 0, 1), np.clip(Gc * e, 0, 1), np.clip(B * e, 0, 1), np.clip(A * e, 0, 1)], -1)
    # ribbon: U along (0 tail .. 1 head), a = across (0 inner .. 1 outer; the outer edge is at the TOP of the cell)
    U, D = grid('ribbon'); a = 1 - D
    streak = 0.45 + 0.55 * np.repeat(rng.random((U.shape[0], 1)), U.shape[1], 1) ** 1.4
    streak = np.clip(streak + (fbm(U.shape, 3, 2) - 0.5) * 0.5, 0, 1)
    grow = ss(0.0, 0.85, U) ** 1.3; tip = ss(0.0, 0.035, 1 - U)                       # fades in from the tail, sharp at the very head
    line = np.exp(-((a - 0.86) / 0.045) ** 2)                                          # thin bright centre line near the outer edge
    body = ss(0.05, 0.84, a) ** 1.8 * (1 - ss(0.9, 0.99, a))
    halo = np.exp(-((a - 0.72) / 0.30) ** 2)
    tailk = streak * (1 - ss(0.25, 0.7, U)) + ss(0.25, 0.7, U)                         # the tail breaks into streaks
    put('ribbon', line * grow ** 1.5 * tip * (0.55 + 0.45 * ss(0.5, 1.0, U)), np.clip(body * 0.9 + line * 0.5, 0, 1) * grow * tip * tailk, halo * grow * tip * 0.5 * tailk, edge=0.012)
    def radial(name): U, D = grid(name); X, Y = (U - 0.5) * 2, (0.5 - D) * 2; return X, Y, np.hypot(X, Y)
    X, Y, r = radial('glow')
    put('glow', np.exp(-(r / 0.16) ** 2), np.exp(-(r / 0.36) ** 2) * 0.9, np.exp(-(r / 0.6) ** 2) * np.clip(1 - r, 0, 1))
    X, Y, r = radial('star')                                                           # 4-point sparkle: long vertical / horizontal needles, tiny heart
    need = lambda p, q, w, L: np.exp(-(np.abs(p) / w) ** 2) * np.clip(1 - np.abs(q) / L, 0, 1) ** 2.2
    st = np.clip(need(X, Y, 0.035, 0.95) + need(Y, X, 0.035, 0.7) + 0.4 * (need((X + Y) / 1.414, (X - Y) / 1.414, 0.03, 0.4) + need((X - Y) / 1.414, (X + Y) / 1.414, 0.03, 0.4)), 0, 1)
    put('star', np.clip(st * 1.2 + np.exp(-(r / 0.09) ** 2), 0, 1), np.clip(st * 0.8 + np.exp(-(r / 0.2) ** 2) * 0.8, 0, 1), np.exp(-(r / 0.4) ** 2) * 0.4)
    for name, sd in (('puff', 3), ('puff2', 5)):                                       # soft lumpy smoke: A = coverage, R = lit top / rim
        X, Y, r = radial(name); n = fbm(X.shape, 4, sd); n2 = fbm(X.shape, 3, sd * 2)
        cov = (1 - ss(0.30, 0.95, r + (n - 0.5) * 0.75)) * (0.5 + 0.5 * n2)
        lit = np.clip(0.5 + 0.55 * Y - 0.2 * r + (n - 0.5) * 0.5, 0, 1)
        put(name, lit, cov * 0.8, cov * 0.4, A=cov)
    X, Y, r = radial('arrow')                                                          # up arrow: triangular head + stem, soft glow
    head = np.clip(1 - ss(0.0, 0.05, np.abs(X) - (0.72 - Y) * 0.62), 0, 1) * (Y > 0.02) * (Y < 0.74)
    stem = (np.abs(X) < 0.15) * (Y > -0.72) * (Y <= 0.04)
    sh = np.clip(head + stem, 0, 1).astype(np.float32); soft = np.array(Image.fromarray((sh * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(9)), np.float32) / 255
    put('arrow', sh, np.clip(sh + soft * 0.7, 0, 1), soft * 0.8)
    X, Y, r = radial('plus')                                                           # rounded cross inside a thin ring (회복 십자)
    bar = lambda p, q: (1 - ss(0.13, 0.17, np.abs(p))) * (1 - ss(0.44, 0.48, np.abs(q)))
    sh = np.clip(bar(X, Y) + bar(Y, X), 0, 1); ringm = np.exp(-((r - 0.78) / 0.035) ** 2)
    soft = np.array(Image.fromarray((np.clip(sh + ringm, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(8)), np.float32) / 255
    put('plus', sh, np.clip(sh * 0.9 + ringm * 0.9 + soft * 0.5, 0, 1), soft * 0.8)
    U, D = grid('spark'); X = (U - 0.5) * 2; t = 1 - D                                   # needle streak along +Y: t 0 base .. 1 tip
    put('spark', np.exp(-(np.abs(X) / 0.05) ** 2) * ss(0, 0.2, t) * np.clip((1 - t) / 0.25, 0, 1) ** 1.2, np.exp(-(np.abs(X) / 0.13) ** 2) * ss(0, 0.3, t) * np.clip((1 - t) / 0.3, 0, 1),
        np.exp(-(np.abs(X) / 0.3) ** 2) * ss(0, 0.4, t) * np.clip((1 - t) / 0.4, 0, 1) * 0.5)
    X, Y, r = radial('bubble')
    rim = np.exp(-((r - 0.72) / 0.06) ** 2); hl = np.exp(-(np.hypot(X + 0.3, Y - 0.34) / 0.14) ** 2)
    put('bubble', np.clip(hl + rim * 0.35, 0, 1), np.clip(rim + hl * 0.6, 0, 1), (1 - ss(0.6, 0.8, r)) * 0.22)
    U, D = grid('crack'); X = (U - 0.5) * 2; t = U                                      # crack line: u along, across D: hot centre, glow
    d = np.abs(D - 0.5) * 2
    put('crack', np.exp(-(d / 0.16) ** 2), np.exp(-(d / 0.45) ** 2), np.exp(-(d / 0.85) ** 2) * (1 - d) * 0.6, edge=0)
    U, D = grid('streak'); X = (U - 0.5) * 2; t = 1 - D                                 # wide soft rising light column (cast rays): bright base, long fade
    put('streak', np.exp(-(np.abs(X) / 0.08) ** 2) * ss(0, 0.1, t) * (1 - t) ** 1.6, np.exp(-(np.abs(X) / 0.22) ** 2) * ss(0, 0.12, t) * (1 - t) ** 1.2, np.exp(-(np.abs(X) / 0.5) ** 2) * ss(0, 0.15, t) * (1 - t) * 0.45)
    X, Y, r = radial('dust'); n = fbm(X.shape, 4, 4)
    cov = (1 - ss(0.25, 1.0, r + (n - 0.5) * 0.8)) * (0.6 + 0.4 * n)
    put('dust', np.clip(0.55 + 0.5 * Y + (n - 0.5) * 0.4, 0, 1), cov * 0.7, cov * 0.3, A=cov)
    X, Y, r = radial('flare')                                                          # impact flare: wide horizontal + short vertical blade, hot heart
    fl = np.clip(np.exp(-(np.abs(Y) / 0.035) ** 2) * np.exp(-(np.abs(X) / 0.8) ** 2) + np.exp(-(np.abs(X) / 0.035) ** 2) * np.exp(-(np.abs(Y) / 0.45) ** 2), 0, 1)
    put('flare', np.clip(fl + np.exp(-(r / 0.13) ** 2), 0, 1), np.clip(fl * 0.8 + np.exp(-(r / 0.3) ** 2), 0, 1), np.exp(-(r / 0.55) ** 2) * np.clip(1 - r, 0, 1) * 0.8)
    im = Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
    for q in (os.path.join(OUT, 'fx_pharm.png'), os.path.join(SRC, 'fx_pharm.png')): im.save(q, optimize=True)
    pad = 3 / ATLAS
    return {k: [round(x0 + pad, 6), round(x0 + w - pad, 6), round(y0 + pad, 6), round(y0 + h - pad, 6)] for k, (x0, y0, w, h) in CELLS.items()}   # [u0, u1, v0 (top), v1 (bottom)]

# ------------------------------------------------------------------ healing circle texture (PIL, 1024 px RGBA)
def circle_png():
    S = 1024; c = S / 2; im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    G1, G2, W = (120, 255, 150), (60, 220, 120), (230, 255, 220)
    def ringl(r, w, col, a): d.ellipse((c - r, c - r, c + r, c + r), outline=col + (a,), width=w)
    ringl(500, 6, G1, 255); ringl(484, 2, W, 220); ringl(400, 4, G1, 230); ringl(390, 2, W, 180); ringl(190, 3, G1, 220)
    # rune band between 400 and 478: small leaf / dot glyphs
    rng = random.Random(7)
    for i in range(36):
        a = 2 * math.pi * i / 36; r = 439; x, y = c + math.cos(a) * r, c + math.sin(a) * r
        if i % 3 == 0: d.ellipse((x - 9, y - 9, x + 9, y + 9), fill=W + (235,))
        else:
            t = a + math.pi / 2; L = 16
            pts = [(x + math.cos(t) * L, y + math.sin(t) * L), (x + math.cos(a) * 8, y + math.sin(a) * 8), (x - math.cos(t) * L, y - math.sin(t) * L), (x - math.cos(a) * 8, y - math.sin(a) * 8)]
            d.polygon(pts, fill=G1 + (220,))
    # 6-point star of thin lines (hexagram) inside 388
    for off in (0, math.pi / 6):
        pts = [(c + math.cos(off + 2 * math.pi * k / 3 - math.pi / 2) * 386, c + math.sin(off + 2 * math.pi * k / 3 - math.pi / 2) * 386) for k in range(3)]
        d.line(pts + [pts[0]], fill=G2 + (150,), width=3)
    # six leaf-cross medallions on the star points
    for k in range(6):
        a = -math.pi / 2 + 2 * math.pi * k / 6; x, y = c + math.cos(a) * 300, c + math.sin(a) * 300
        d.ellipse((x - 46, y - 46, x + 46, y + 46), outline=G1 + (235,), width=5)
        d.rectangle((x - 9, y - 30, x + 9, y + 30), fill=W + (235,)); d.rectangle((x - 30, y - 9, x + 30, y + 9), fill=W + (235,))
    # centre: big cross + small leaves
    d.rounded_rectangle((c - 16, c - 80, c + 16, c + 80), 8, fill=W + (130,)); d.rounded_rectangle((c - 80, c - 16, c + 80, c + 16), 8, fill=W + (130,))
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2; x, y = c + math.cos(a) * 130, c + math.sin(a) * 130
        d.ellipse((x - 26, y - 14, x + 26, y + 14), fill=G1 + (210,))
    glow = im.filter(ImageFilter.GaussianBlur(6)); out = Image.alpha_composite(glow, im)
    # soft inner fill (very faint) so the circle reads as a lit area
    # (2026-11-11 그래픽 개선) 바닥 전체를 녹색으로 덮던 옅은 채움은 뺌 — 문양 선만 남김
    p = os.path.join(OUT, 'fx_pharm_circle.png'); out.resize((512, 512), Image.LANCZOS).save(p, optimize=True); return p   # drawn at 1024, saved 512

# ------------------------------------------------------------------ icons
def mat_vc(name, metal=0.0, rough=0.5, emit=0.0, alpha=1.0, trans=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    if emit: nt.links.new(vc.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = emit
    if trans: b.inputs['Transmission Weight'].default_value = trans
    if alpha < 1: b.inputs['Alpha'].default_value = alpha
    return m

def mat_col(name, rgb, metal=0.0, rough=0.5, emit=0.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = rgb + (1,); b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    if emit: b.inputs['Emission Color'].default_value = rgb + (1,); b.inputs['Emission Strength'].default_value = emit
    if alpha < 1: b.inputs['Alpha'].default_value = alpha
    return m

def dup(src, name, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    ob = bpy.data.objects.new(name, src.data.copy()); bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.clear(); ob.data.materials.append(mat); ob.location = loc; ob.rotation_euler = rot; ob.scale = (scale,) * 3
    return ob

def icon_scene(kind, P):
    sc = reset(); sc.render.resolution_x = sc.render.resolution_y = 256; sc.render.film_transparent = True
    sc.cycles.samples = 48; sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.5, 0.55, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.35
    for name, b in P.items(): bpy.context.scene.collection.objects.link(b) if b.name not in sc.collection.objects else None
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.location = (0, -5, 0); cam.rotation_euler = (math.pi / 2, 0, 0)
    for nm, e, loc in (('key', 4.0, (-3, -4, 4)), ('rim', 3.0, (3, 3, 2)), ('fill', 1.2, (3, -4, -1))):
        L = bpy.data.objects.new(nm, bpy.data.lights.new(nm, 'SUN')); L.data.energy = e; sc.collection.objects.link(L)
        L.rotation_euler = (math.atan2(math.hypot(loc[0], loc[1]), loc[2]), 0, math.atan2(loc[0], -loc[1]))
    return sc, cam

def render_icon(sid, kind):
    sc = reset()
    objs = {}
    def mk(name, fn, smooth=True): ob = new_obj(name, fn, smooth); objs[name] = ob; return ob
    sc, cam = icon_scene(kind, {})
    gold = mat_vc('gold', metal=0.45, rough=0.32, emit=0.12)
    if kind == 'pestle':
        p = mk('p', pestle); p.data.materials.append(gold); p.scale = (2.6,) * 3; p.rotation_euler = (0, math.radians(-38), 0); p.location = (0.66, 0, -1.08)
        cam.data.ortho_scale = 2.9
    elif kind == 'flasks':
        f0 = mk('f', flask); c0 = mk('c', cork)
        for i, (rgb, x, z, r) in enumerate((((1.0, 0.35, 0.12), -0.62, 0.35, 25), ((0.25, 0.7, 1.0), 0.05, -0.45, -12), ((0.35, 0.95, 0.25), 0.66, 0.42, -30))):
            m = mat_col('liq%d' % i, rgb, rough=0.2, emit=0.35); mc = mat_col('cork%d' % i, (0.62, 0.42, 0.22), rough=0.8)
            dup(f0, 'f%d' % i, m, (x, 0, z), (0, math.radians(r), 0), 2.6); dup(c0, 'c%d' % i, mc, (x, 0, z), (0, math.radians(r), 0), 2.6)
        for o in (f0, c0): bpy.data.objects.remove(o)
        cam.data.ortho_scale = 2.6; cam.location = (0, -5, 0.45)
    elif kind == 'syringe':
        s = mk('s', syringe); s.data.materials.append(mat_vc('syr', metal=0.3, rough=0.3, emit=0.25)); s.scale = (2.1,) * 3
        s.rotation_euler = (0, math.radians(-135), 0); s.location = (0.75, 0, 0.75); cam.data.ortho_scale = 2.4
    elif kind == 'shield':
        dm = mk('d', dome); dm.data.materials.append(mat_col('sh', (0.35, 0.75, 1.0), rough=0.1, emit=0.35, alpha=0.4)); dm.scale = (1.0,) * 3; dm.location = (0, 0, -0.62)
        dm.data.materials[0].surface_render_method = 'BLENDED' if hasattr(dm.data.materials[0], 'surface_render_method') else None
        f0 = mk('f', flask); f0.data.materials.append(mat_col('liq', (0.35, 1.0, 0.45), rough=0.2, emit=0.4)); f0.scale = (2.0,) * 3; f0.location = (0, 0, -0.6)
        c0 = mk('c', cork); c0.data.materials.append(mat_col('ck', (0.62, 0.42, 0.22), rough=0.8)); c0.scale = (2.0,) * 3; c0.location = (0, 0, -0.6)
        cam.data.ortho_scale = 2.3; cam.location = (0, -5, -0.1)
    elif kind == 'circle':
        im = bpy.data.images.load(circle_png()); m = bpy.data.materials.new('circ'); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
        tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = im; nt.links.new(tx.outputs['Color'], b.inputs['Emission Color']); nt.links.new(tx.outputs['Alpha'], b.inputs['Alpha'])
        b.inputs['Emission Strength'].default_value = 2.2; b.inputs['Base Color'].default_value = (0, 0, 0, 1)
        ds = mk('disc', disc); ds.data.materials.append(m); ds.rotation_euler = (math.radians(58), 0, 0); ds.scale = (1.3,) * 3
        cam.data.ortho_scale = 2.7
    bpy.context.view_layer.update()
    p = os.path.join(TMP, sid + '_r.png'); sc.render.filepath = p; bpy.ops.render.render(write_still=True)
    return p

ICON_BG = {'ph1_a6': ((230, 150, 40), (70, 26, 6)), 'ph1_b6': ((190, 70, 120), (40, 12, 40)), 'ph1_c6': ((230, 110, 50), (70, 16, 10)),
           'ph1_c7': ((60, 140, 230), (8, 22, 70)), 'ph1_c8': ((50, 170, 80), (6, 40, 18))}

def frame_icon(sid, render):
    """round icon like the cropped pharmacist ones: radial coloured background, the render, a thick gold rim"""
    S = 512; hi, lo = ICON_BG[sid]
    yy, xx = np.mgrid[0:S, 0:S]; r = np.hypot(xx - S / 2, yy - S / 2 + S * 0.06) / (S / 2)
    t = np.clip(r, 0, 1)[..., None]; bg = (np.array(hi) * (1 - t) + np.array(lo) * t).astype(np.uint8)
    base = Image.fromarray(np.dstack([bg, np.full((S, S), 255, np.uint8)]), 'RGBA')
    # light streaks behind the subject
    st = Image.new('RGBA', (S, S), (0, 0, 0, 0)); sd = ImageDraw.Draw(st)
    for k in range(12):
        a = 2 * math.pi * k / 12 + 0.2; sd.polygon([(S / 2, S / 2), (S / 2 + math.cos(a - 0.08) * S, S / 2 + math.sin(a - 0.08) * S), (S / 2 + math.cos(a + 0.08) * S, S / 2 + math.sin(a + 0.08) * S)], fill=(255, 255, 230, 26))
    base = Image.alpha_composite(base, st.filter(ImageFilter.GaussianBlur(6)))
    ren = Image.open(render).convert('RGBA').resize((S, S), Image.LANCZOS)
    glow = Image.new('RGBA', (S, S), (255, 250, 220, 0)); glow.putalpha(ren.split()[3].filter(ImageFilter.GaussianBlur(14)).point(lambda v: int(v * 0.55)))
    base = Image.alpha_composite(base, glow); base = Image.alpha_composite(base, ren)
    # inner shadow + gold rim
    sh = Image.new('L', (S, S), 0); ImageDraw.Draw(sh).ellipse((10, 10, S - 10, S - 10), outline=150, width=40)
    base = Image.alpha_composite(base, Image.merge('RGBA', [Image.new('L', (S, S), 0)] * 3 + [sh.filter(ImageFilter.GaussianBlur(14))]))
    rim = np.zeros((S, S, 4), np.uint8); ang = np.arctan2(yy - S / 2, xx - S / 2)
    shade = 0.62 + 0.38 * np.cos(ang + 2.3)                   # light from the top-left
    ring = (r > 0.86) & (r <= 0.985)
    gold = np.array([255, 205, 95]) * shade[..., None]; gold[(r > 0.905) & (r < 0.925)] *= 1.18; gold[(r > 0.955)] *= 0.72
    rim[ring, :3] = np.clip(gold[ring], 0, 255); rim[ring, 3] = 255
    base = Image.alpha_composite(base, Image.fromarray(rim, 'RGBA'))
    m = Image.new('L', (S, S), 0); ImageDraw.Draw(m).ellipse((int(S * 0.0075), int(S * 0.0075), int(S * 0.9925), int(S * 0.9925)), fill=255)
    out = base.resize((128, 128), Image.LANCZOS); out.putalpha(m.resize((128, 128), Image.LANCZOS))
    out.save(os.path.join(ICONS, sid + '.png'), optimize=True)

def icons():
    for sid, kind in (('ph1_a6', 'pestle'), ('ph1_b6', 'flasks'), ('ph1_c6', 'syringe'), ('ph1_c7', 'shield'), ('ph1_c8', 'circle')):
        frame_icon(sid, render_icon(sid, kind)); print('icon', sid, flush=True)

def main():
    reset(); circle_png(); cells = atlas_png()
    obs = [new_obj('pharm_pestle', pestle), new_obj('pharm_flask', flask), new_obj('pharm_liquid', liquid), new_obj('pharm_cork', cork), new_obj('pharm_syringe', syringe),
           new_obj('pharm_circle', disc, False), new_obj('pharm_ring', ring, False), new_obj('pharm_dome', dome),
           new_obj('pharm_ribbon', ribbon, False), new_obj('pharm_quad', quad, False), new_obj('pharm_cracks', cracks, False)]
    pieces = []
    for name, (cx, cz), build in fracture():
        o = new_obj(name, build, False); o.location = V(cx, 0, cz); obs.append(o); pieces.append(o)
    for i in range(N_SHARD): obs.append(new_obj('pharm_shard_%d' % i, shard_builder(i), False))
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(TMP, 'fx_pharm.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'cells': cells, 'ribbonSpan': RIB_SPAN, 'pieces': len(pieces), 'shards': N_SHARD},
              open(os.path.join(OUT, 'fx_pharm.glb.json'), 'w'))
    try:
        bpy.ops.export_scene.fbx(filepath=os.path.join(SRC, 'fx_pharm.fbx'), use_selection=True, axis_forward='-Z', axis_up='Y',
                                 bake_space_transform=True, mesh_smooth_type='FACE', add_leaf_bones=False)
    except Exception as e: print('fbx export failed:', e)
    k = 0
    for o in obs:
        if o in pieces: o.location.x += 16; continue      # the fractured disc stays assembled in the .blend
        o.location.x = k * 1.4; k += 1
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_pharm.blend'), compress=True)
    print('tris', {k: v for k, v in tris.items() if 'piece' not in k and 'shard' not in k}, 'pieces', sum(v for k, v in tris.items() if 'piece' in k),
          'shards', sum(v for k, v in tris.items() if 'shard' in k), 'total', sum(tris.values()), 'glb bytes', len(raw), flush=True)

if __name__ == '__main__':
    a = sys.argv[1:]
    if 'icons' not in a: main()
    if 'fx' not in a: icons()      # `fx`: 메시·텍스처만, 아이콘은 다시 렌더하지 않음
