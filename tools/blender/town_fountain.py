"""아르칸 '여신의 분수' — Blender 절차 모델 (2026-11-14, 그래픽 2단계). 예전 Tripo 초안(angel_fountain)은 바닥이 넓고 낮은
계단 위에 작은 조각·잡동사니가 흩어져 게임 거리에서 형태가 읽히지 않았음 → 둥글고 또렷한 3단 분수로 다시 지음:
둥근 2단 계단 · 두툼한 둥근 테의 큰 수반(바깥 벽에 푸른 회색 판 16장 + 금 장미 문양 + 금 띠) · 꽃잎 모양 가장자리의 큰 접시 ·
작은 접시 · 항아리를 기울여 물을 붓는 날개 달린 여신상(큰 머리·금 머리띠). 물은 재질 이름으로 게임이 셰이더를 씌움:
M_fnt_water(수반·접시 수면, UV = 원판 중심 기준 -1..1) · M_fnt_fall(접시에서 떨어지는 물막·항아리 물줄기, UV v = 위→아래 0→1).
재질마다 반복 텍스처(PIL) + 미터 단위 UV, 그늘은 정점 색(높이 그라데이션·아랫면). 충돌 원(world.py circle r 5.3)과 같은 크기:
바깥 계단 반지름 5.55 m(예전 모델 지름 11.07~11.24 m).
→ assets/town3d/town_arcan_fountain.glb.json + town_manifest.json (규격은 town_assets.py와 같음: 바닥 z=0, 가로 중심 원점,
   가장 긴 가로 변 1, 앞면 -Y). Usage: python3 tools/blender/town_fountain.py   (KEEP=/tmp/x.glb 로 원본 GLB 사본)"""
import base64, json, math, os, random, tempfile
import bpy, bmesh
from mathutils import Vector, Matrix
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, '..', '..', 'assets', 'town3d'); MAN = os.path.join(OUT, 'town_manifest.json')
NAME = 'arcan_fountain'; TD = tempfile.mkdtemp()

# ---------------------------------------------------------------- textures (tileable, 512 px)
def noise(im, amt, blur=1.2, seed=1):
    r = random.Random(seed); n = Image.new('L', im.size); n.putdata([r.randint(0, 255) for _ in range(im.size[0] * im.size[1])])
    n = n.resize((im.size[0] // 4, im.size[1] // 4)).resize(im.size, Image.BICUBIC).filter(ImageFilter.GaussianBlur(blur))
    return Image.composite(Image.eval(im, lambda v: min(255, int(v * (1 + amt)))), Image.eval(im, lambda v: int(v * (1 - amt))), n)
def blocks(base, line, cols, rows, seed, vary=8, S=512):
    """둥근 모서리 돌 블록(줄눈이 부드러움) — 가까이서도 깨끗한 손그림 돌"""
    im = Image.new('RGB', (S, S), line); d = ImageDraw.Draw(im); r = random.Random(seed); bw, bh = S / cols, S / rows
    for j in range(rows):
        off = (j % 2) * bw / 2
        for i in range(-1, cols + 1):
            k = r.randint(-vary, vary); c = tuple(max(0, min(255, v + k)) for v in base); x0 = i * bw + off
            d.rounded_rectangle([x0 + 3, j * bh + 3, x0 + bw - 3, (j + 1) * bh - 3], radius=min(bw, bh) * 0.18, fill=c)
            d.line([x0 + 10, j * bh + 8, x0 + bw - 12, j * bh + 8], fill=tuple(min(255, v + 16) for v in c), width=3)   # 윗 모서리 빛
    return noise(im.filter(ImageFilter.GaussianBlur(1.0)), 0.035, seed=seed)
def plain(base, seed, amt=0.03):
    return noise(Image.new('RGB', (256, 256), base), amt, seed=seed).filter(ImageFilter.GaussianBlur(0.8))
def gold(S=256):
    im = Image.new('RGB', (S, S), (236, 186, 76)); d = ImageDraw.Draw(im)
    for y in range(0, S, 32): d.line([0, y, S, y], fill=(252, 220, 120), width=6); d.line([0, y + 16, S, y + 16], fill=(204, 150, 56), width=3)
    return noise(im.filter(ImageFilter.GaussianBlur(1.5)), 0.05, seed=9)
def water(S=128):
    im = Image.new('RGB', (S, S), (96, 178, 214)); return im
TEXS = {'marble': (blocks((222, 210, 190), (178, 166, 150), 3, 3, 1), 1.6),         # 수반 벽·접시
        'step': (blocks((206, 196, 182), (164, 154, 142), 2, 2, 2), 1.8),            # 계단
        'trim': (plain((140, 166, 190), 3, 0.04), 1.0),                               # 푸른 회색 판(장식)
        'statue': (plain((232, 224, 210), 4, 0.025), 1.0),                            # 여신상
        'floor': (plain((92, 150, 170), 5, 0.05), 2.0),                               # 수반 바닥(물 아래)
        'gold': (gold(), 1.2), 'water': (water(), 1.0), 'fall': (water(), 1.0),
        'leaf': (plain((96, 160, 84), 6, 0.08), 0.6), 'bloom': (plain((246, 150, 190), 7, 0.04), 0.6), 'bloom2': (plain((255, 236, 150), 8, 0.04), 0.6)}
STATUE = 1.45
MATNAME = {'water': 'M_fnt_water', 'fall': 'M_fnt_fall'}
MATS = {}
def mat(key):
    if key in MATS: return MATS[key]
    p = os.path.join(TD, 'fnt_' + key + '.png'); TEXS[key][0].save(p)
    m = bpy.data.materials.new(MATNAME.get(key, 'M_fnt_' + key)); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(p); nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Metallic'].default_value = 0.0; b.inputs['Roughness'].default_value = 0.85
    MATS[key] = m; return m

# ---------------------------------------------------------------- geometry
PARTS = []
def finish(bm, key, uv='box', shade=1.0, grad=None, smooth=True, disc=None):
    """uv: 'box' = 미터 단위 상자 투영, 'cyl' = 둘레(미터)·높이, 'disc' = 중심 기준 -1..1(물), 'fall' = 둘레·위→아래 0..1(물막)
    grad = (z0, z1, k0, k1) 높이 그라데이션(정점 색), 아랫면은 0.72배"""
    me = bpy.data.meshes.new(key); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    L = bm.loops.layers.uv.new('UVMap'); C = bm.loops.layers.color.new('Col'); s = TEXS[key][1]
    zs = [v.co.z for v in bm.verts]; z0, z1 = min(zs), max(zs)
    for f in bm.faces:
        n = f.normal; f.smooth = smooth
        angs = [math.atan2(l.vert.co.y, l.vert.co.x) for l in f.loops]; seam = max(angs) - min(angs) > math.pi
        for l, a in zip(f.loops, angs):
            p = l.vert.co
            if seam and a < 0: a += 2 * math.pi
            if uv == 'disc': l[L].uv = (p.x / disc[2], p.y / disc[2])
            elif uv == 'fall': l[L].uv = (a / (2 * math.pi) * 12.0, (z1 - p.z) / max(1e-3, z1 - z0))
            elif uv == 'cyl': r = max(0.3, math.hypot(p.x, p.y)); l[L].uv = (a * r / s, p.z / s)
            elif abs(n.z) > 0.72: l[L].uv = (p.x / s, p.y / s)
            elif abs(n.y) >= abs(n.x): l[L].uv = (p.x / s, p.z / s)
            else: l[L].uv = (p.y / s, p.z / s)
            k = shade * ((grad[2] + (grad[3] - grad[2]) * max(0, min(1, (p.z - grad[0]) / (grad[1] - grad[0])))) if grad else 1.0)
            if n.z < -0.4: k *= 0.72
            l[C] = (k, k, k, 1.0)
    bm.to_mesh(me); bm.free(); me.materials.append(mat(key)); PARTS.append(me); return me

def lathe(key, prof, seg=64, lobes=0, amp=0.0, lobe_z=None, a0=0.0, a1=2 * math.pi, closed=True, cap_top=False, centre=(0, 0), **kw):
    """프로필 [(r, z), ...]를 z축 둘레로 돌림. lobes/amp = 꽃잎 모양(반지름 r·(1 + amp·cos(lobes·a))), lobe_z=(z0, z1) 높이에서만"""
    bm = bmesh.new(); rings = []; full = closed and abs(a1 - a0 - 2 * math.pi) < 1e-6; n = seg if full else seg + 1
    for r, z in prof:
        ring = []
        for i in range(n):
            a = a0 + (a1 - a0) * i / seg; k = 1.0
            if lobes and (lobe_z is None or lobe_z[0] <= z <= lobe_z[1]):
                w = 1.0 if lobe_z is None else min(1.0, (z - lobe_z[0]) / max(1e-3, (lobe_z[1] - lobe_z[0]) * 0.5))
                k = 1 + amp * w * math.cos(lobes * a)
            ring.append(bm.verts.new((centre[0] + r * k * math.cos(a), centre[1] + r * k * math.sin(a), z)))
        rings.append(ring)
    m = seg if full else seg
    for j in range(len(rings) - 1):
        for i in range(m):
            i2 = (i + 1) % n if full else i + 1
            q = (rings[j][i], rings[j][i2], rings[j + 1][i2], rings[j + 1][i])
            if len(set(v.co.to_tuple(5) for v in q)) >= 3:
                try: bm.faces.new(q)
                except ValueError: pass
    if cap_top and full:
        c = bm.verts.new((centre[0], centre[1], prof[-1][1]))
        for i in range(seg): bm.faces.new((rings[-1][i], rings[-1][(i + 1) % seg], c))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    return finish(bm, key, **kw)

def disc(key, r, z, seg=64, lobes=0, amp=0.0, **kw):
    bm = bmesh.new(); c = bm.verts.new((0, 0, z)); ring = []
    for i in range(seg):
        a = 2 * math.pi * i / seg; k = 1 + amp * math.cos(lobes * a) if lobes else 1
        ring.append(bm.verts.new((r * k * math.cos(a), r * k * math.sin(a), z)))
    mid = [bm.verts.new((v.co.x * 0.55, v.co.y * 0.55, z)) for v in ring]          # 가운데 고리(물결 셰이더가 쓸 정점)
    for i in range(seg):
        j = (i + 1) % seg; bm.faces.new((mid[i], mid[j], ring[j], ring[i])); bm.faces.new((c, mid[i], mid[j])) if False else bm.faces.new((mid[i], c, mid[j])[::-1])
    return finish(bm, key, uv='disc', disc=(0, 0, r), **kw)

def sphere(key, c, sc, seg=16, rings=10, rot=None, **kw):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=sc, verts=bm.verts)
    if rot: bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot)
    bmesh.ops.translate(bm, vec=c, verts=bm.verts); return finish(bm, key, **kw)

def tube(key, pts, radii, ring=10, **kw):
    bm = bmesh.new(); rings = []
    for i, p in enumerate(pts):
        p = Vector(p); d = (Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        a = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0)); u = d.cross(a).normalized(); w = d.cross(u).normalized()
        rings.append([bm.verts.new(p + (u * math.cos(2 * math.pi * k / ring) + w * math.sin(2 * math.pi * k / ring)) * radii[i]) for k in range(ring)])
    for j in range(len(rings) - 1):
        for k in range(ring): bm.faces.new((rings[j][k], rings[j][(k + 1) % ring], rings[j + 1][(k + 1) % ring], rings[j + 1][k]))
    for rr, e in ((rings[0], pts[0]), (rings[-1], pts[-1])):
        c = bm.verts.new(e)
        for k in range(ring): bm.faces.new((rr[k], rr[(k + 1) % ring], c))
    return finish(bm, key, **kw)

def xform(me, M):
    me.transform(M)

# ---------------------------------------------------------------- the fountain (m; 바깥 계단 반지름 5.55, 앞면 -Y)
# 비율은 예전 Tripo 분수와 비슷하게: 넓은 3단 둥근 계단(광장의 일부처럼) 위에 지름 7.4 m 수반, 그 위 2단 접시 + 큰 여신상
def build():
    lathe('step', [(4.4, 0.5), (4.5, 0.5), (4.54, 0.47), (4.55, 0.4), (4.55, 0.34), (5.0, 0.34), (5.04, 0.31), (5.05, 0.24), (5.05, 0.17),
                   (5.5, 0.17), (5.54, 0.14), (5.56, 0.08), (5.56, 0.0)], seg=72, grad=(0.0, 0.5, 0.8, 1.0))
    disc('step', 4.45, 0.5, seg=48, shade=0.96)
    disc('floor', 3.2, 0.52, seg=48, shade=0.8)
    # 수반: 바깥 벽(살짝 불룩) → 두툼한 둥근 테 → 안쪽 벽
    lathe('marble', [(3.68, 0.5), (3.74, 0.58), (3.77, 0.7), (3.76, 1.0), (3.74, 1.03), (3.84, 1.08), (3.89, 1.15), (3.88, 1.22), (3.8, 1.28),
                     (3.64, 1.31), (3.42, 1.31), (3.27, 1.27), (3.2, 1.19), (3.19, 1.1), (3.19, 0.52)], seg=72, grad=(0.5, 1.31, 0.78, 1.0))
    lathe('gold', [(3.775, 0.975), (3.8, 0.99), (3.8, 1.015), (3.775, 1.03)], seg=72)                      # 테 아래 금 띠
    for i in range(12):                                                                                    # 바깥 벽 장식 판 + 금 장미
        a = (i + 0.5) / 12 * 2 * math.pi; span = 2 * math.pi / 12 * 0.6
        lathe('trim', [(3.74, 0.64), (3.8, 0.66), (3.815, 0.71), (3.815, 0.89), (3.8, 0.94), (3.74, 0.96)], seg=8, a0=a - span / 2, a1=a + span / 2,
              closed=False, grad=(0.64, 0.96, 0.86, 1.0))
        ca, sa = math.cos(a), math.sin(a)
        sphere('gold', (3.84 * ca, 3.84 * sa, 0.8), (0.035, 0.1, 0.1), seg=8, rings=5, rot=Matrix.Rotation(a, 3, 'Z'))
        for k in range(4):
            b = (k + 0.5) / 4 * 2 * math.pi; off = Vector((0, math.cos(b), math.sin(b))) * 0.1
            sphere('gold', Vector((3.825 * ca, 3.825 * sa, 0.8)) + Matrix.Rotation(a, 3, 'Z') @ off, (0.025, 0.065, 0.065), seg=6, rings=4, rot=Matrix.Rotation(a, 3, 'Z'))
    for i in range(8):                                                                                     # 테 위 작은 반구 장식
        a = (i + 0.5) / 8 * 2 * math.pi
        sphere('marble', (3.53 * math.cos(a), 3.53 * math.sin(a), 1.31), (0.18, 0.18, 0.12), seg=12, rings=6, grad=(1.25, 1.45, 0.92, 1.04))
        sphere('gold', (3.53 * math.cos(a), 3.53 * math.sin(a), 1.44), (0.065, 0.065, 0.065), seg=8, rings=5)
    disc('water', 3.2, 1.08, seg=72)                                                                     # 수반 수면
    # 둘째 계단 위 낮은 기둥 8개(금 꼭지) + 그 사이 둥근 꽃 화분 4개 — 둥근 실루엣에 리듬, 무릎 높이 이하라 가리지 않음
    for i in range(8):
        a = (i + 0.5) / 8 * 2 * math.pi; x, y = 4.78 * math.cos(a), 4.78 * math.sin(a)
        lathe('marble', [(0.0, 0.34), (0.17, 0.34), (0.17, 0.41), (0.13, 0.46), (0.12, 0.84), (0.16, 0.9), (0.16, 0.96), (0.0, 0.96)], seg=12, centre=(x, y), grad=(0.34, 0.96, 0.84, 1.02))
        sphere('gold', (x, y, 1.06), (0.1, 0.1, 0.1), seg=10, rings=6); lathe('gold', [(0.0, 1.12), (0.04, 1.12), (0.0, 1.26)], seg=8, centre=(x, y))
    for i in range(4):
        a = i / 4 * 2 * math.pi + math.pi / 4 + math.pi / 8; x, y = 4.8 * math.cos(a), 4.8 * math.sin(a)
        lathe('trim', [(0.0, 0.34), (0.2, 0.34), (0.26, 0.56), (0.28, 0.6), (0.0, 0.6)], seg=12, centre=(x, y))
        sphere('leaf', (x, y, 0.64), (0.27, 0.27, 0.16), seg=10, rings=6)
        for k in range(5):
            b = k / 5 * 2 * math.pi + i; sphere('bloom' if k % 2 else 'bloom2', (x + 0.15 * math.cos(b), y + 0.15 * math.sin(b), 0.76), (0.07, 0.07, 0.06), seg=6, rings=4)
    # 가운데 기둥 → 큰 접시(꽃잎 10장 가장자리)
    lathe('marble', [(0.0, 0.52), (1.05, 0.52), (1.05, 0.7), (0.92, 0.86), (0.62, 1.02), (0.48, 1.25), (0.42, 1.55), (0.46, 1.75), (0.58, 1.88),
                     (0.85, 1.98), (1.3, 2.08), (1.62, 2.16), (1.76, 2.24), (1.78, 2.33), (1.71, 2.38), (1.56, 2.38), (1.5, 2.31)],
          seg=64, lobes=10, amp=0.07, lobe_z=(2.0, 2.4), grad=(0.52, 2.38, 0.76, 1.02))
    lathe('gold', [(0.44, 1.5), (0.5, 1.54), (0.5, 1.62), (0.44, 1.66)], seg=36)
    disc('water', 1.52, 2.3, seg=60, lobes=10, amp=0.07)
    # 작은 접시(꽃잎 8장)
    lathe('marble', [(0.0, 2.29), (0.36, 2.29), (0.31, 2.55), (0.27, 2.8), (0.32, 2.93), (0.5, 3.05), (0.8, 3.16), (0.97, 3.24), (0.99, 3.31),
                     (0.94, 3.35), (0.82, 3.35), (0.78, 3.29)], seg=48, lobes=8, amp=0.08, lobe_z=(3.1, 3.4), grad=(2.29, 3.35, 0.84, 1.02))
    lathe('gold', [(0.29, 2.7), (0.33, 2.73), (0.33, 2.8), (0.29, 2.83)], seg=28)
    disc('water', 0.8, 3.28, seg=40, lobes=8, amp=0.08)
    # 여신상 받침 + 여신(큰 머리, 날개, 앞머리·올림머리, 항아리를 기울여 붓는 모습) — 앞면 -Y, 받침 위에서 STATUE배
    Z0 = 3.6
    lathe('marble', [(0.0, 3.27), (0.36, 3.27), (0.38, 3.36), (0.29, 3.42), (0.26, 3.55), (0.33, Z0 - 0.02), (0.34, Z0), (0.0, Z0)], seg=28)
    S0 = len(PARTS); dz = Z0 - 4.08
    lathe('statue', [(0.0, 4.08), (0.4, 4.08), (0.39, 4.22), (0.33, 4.55), (0.25, 4.88), (0.2, 5.02), (0.22, 5.14), (0.25, 5.28),
                     (0.23, 5.38), (0.15, 5.45), (0.08, 5.5), (0.07, 5.56), (0.0, 5.58)], seg=28, lobes=9, amp=0.06, lobe_z=(4.08, 4.9),
          grad=(4.08, 5.5, 0.8, 1.02))
    lathe('gold', [(0.205, 5.0), (0.225, 5.02), (0.225, 5.07), (0.205, 5.09)], seg=24)                    # 허리띠
    sphere('statue', (0, 0, 5.76), (0.22, 0.21, 0.22), seg=20, rings=14)                                   # 얼굴
    sphere('statue', (0, 0.05, 5.8), (0.235, 0.215, 0.215), seg=20, rings=12, shade=0.84)                  # 머리카락(뒤로 조금, 한 톤 어둡게)
    sphere('statue', (0, -0.1, 5.9), (0.2, 0.13, 0.09), seg=16, rings=8, shade=0.84)                       # 앞머리
    sphere('statue', (0, 0.17, 5.92), (0.11, 0.1, 0.1), seg=14, rings=8, shade=0.84)                       # 올림머리
    for sx in (-1, 1): sphere('trim', (sx * 0.075, -0.2, 5.74), (0.025, 0.012, 0.035), seg=8, rings=5)     # 눈(푸른 회색 점)
    lathe('gold', [(0.2, 5.92), (0.215, 5.93), (0.215, 5.97), (0.2, 5.98)], seg=28, centre=(0, 0.02))      # 금 머리띠
    for s in (-1, 1):                                                                                      # 날개(납작한 잎 모양 3겹)
        for k, (ln, z) in enumerate(((0.62, 5.46), (0.48, 5.26), (0.34, 5.1))):
            R = Matrix.Rotation(s * math.radians(28 + k * 18), 3, 'Y') @ Matrix.Rotation(math.radians(-14), 3, 'X')
            sphere('statue', (s * (0.3 + k * 0.05), 0.2, z), (0.1, 0.035, ln), seg=14, rings=10, rot=R, grad=(4.9, 6.0, 0.86, 1.0))
    jar = Vector((0.36, -0.2, 5.2))
    tube('statue', [(-0.2, 0.0, 5.36), (-0.12, -0.2, 5.12), (0.24, -0.26, 5.08)], [0.06, 0.055, 0.05], ring=8)
    tube('statue', [(0.2, 0.0, 5.38), (0.34, -0.08, 5.36), (0.42, -0.16, 5.36)], [0.06, 0.055, 0.05], ring=8)
    for p in ((0.24, -0.26, 5.08), (0.42, -0.16, 5.36)): sphere('statue', p, (0.055, 0.055, 0.055), seg=10, rings=6)
    R = Matrix.Rotation(math.radians(-58), 3, 'Y')
    me = lathe('gold', [(0.0, -0.17), (0.09, -0.17), (0.14, -0.08), (0.15, 0.02), (0.11, 0.1), (0.06, 0.14), (0.07, 0.2), (0.05, 0.2)], seg=20)
    me.transform(Matrix.Translation(jar) @ R.to_4x4())
    mouth = jar + R @ Vector((0, 0, 0.2))
    base = Vector((0, 0, 4.08)); SM = Matrix.Translation((0, 0, dz)) @ Matrix.Translation(base) @ Matrix.Scale(STATUE, 4) @ Matrix.Translation(-base)
    for me in PARTS[S0:]: me.transform(SM)
    mouth = SM @ mouth
    # 항아리 물줄기: 입구 → 작은 접시 수면
    land = Vector((0.62, -0.32, 3.3)); pts, rad = [], []
    for i in range(9):
        t = i / 8; p = mouth.lerp(land, t); p.z = mouth.z + (land.z - mouth.z) * t * t; p.x = mouth.x + (land.x - mouth.x) * math.sqrt(t)
        pts.append(tuple(p)); rad.append(0.045 + 0.03 * t)
    tube('fall', pts, rad, ring=8, uv='fall', smooth=True)
    # 접시에서 떨어지는 물막(가장자리 → 아래 수면)
    lathe('fall', [(1.77, 2.35), (1.9, 2.15), (2.02, 1.75), (2.1, 1.35), (2.14, 1.09)], seg=60, lobes=10, amp=0.07, uv='fall')
    lathe('fall', [(0.98, 3.33), (1.08, 3.15), (1.17, 2.8), (1.22, 2.32)], seg=44, lobes=8, amp=0.08, uv='fall')

if __name__ == '__main__':
    bpy.ops.wm.read_factory_settings(use_empty=True); build()
    obs = []
    for me in PARTS: o = bpy.data.objects.new(me.name, me); bpy.context.scene.collection.objects.link(o); obs.append(o)
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]; bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active
    vs = [v.co for v in ob.data.vertices]; lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))); hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    k = 1.0 / max(hi.x - lo.x, hi.y - lo.y); ob.data.transform(Matrix.Translation((0, 0, -lo.z))); ob.data.transform(Matrix.Scale(k, 4))  # 원점 = 분수 중심(대칭)
    size = [round((hi.x - lo.x) * k, 4), round((hi.y - lo.y) * k, 4), round((hi.z - lo.z) * k, 4)]
    ob.data.calc_loop_triangles(); tris = len(ob.data.loop_triangles); glb = os.path.join(TD, NAME + '.glb')
    kw = dict(filepath=glb, export_format='GLB', export_image_format='JPEG', export_animations=False, export_yup=True, export_apply=True, export_normals=True, export_tangents=False, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', export_jpeg_quality=86, **kw)
    except TypeError: bpy.ops.export_scene.gltf(**kw)
    raw = open(glb, 'rb').read(); json.dump({'b64': base64.b64encode(raw).decode(), 'size': size, 'tris': tris}, open(os.path.join(OUT, 'town_' + NAME + '.glb.json'), 'w'))
    man = json.load(open(MAN)); man['town_' + NAME] = size; json.dump(man, open(MAN, 'w'), indent=0, sort_keys=True)
    if os.environ.get('KEEP'): import shutil; shutil.copy(glb, os.environ['KEEP'])
    print(NAME, tris, 'tris', len(raw) // 1024, 'KB', size, 'diameter m', round(max(hi.x - lo.x, hi.y - lo.y), 3))
