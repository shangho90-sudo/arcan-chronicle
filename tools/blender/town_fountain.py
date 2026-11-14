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
TEXS = {'marble': (blocks((238, 230, 214), (196, 186, 170), 3, 3, 1), 1.6),         # 수반 벽·접시
        'step': (blocks((214, 206, 194), (172, 164, 152), 2, 2, 2), 1.8),            # 계단
        'trim': (plain((168, 190, 206), 3, 0.04), 1.0),                               # 푸른 회색 판(장식)
        'statue': (plain((246, 241, 230), 4, 0.025), 1.0),                            # 여신상
        'floor': (plain((92, 150, 170), 5, 0.05), 2.0),                               # 수반 바닥(물 아래)
        'gold': (gold(), 1.2), 'water': (water(), 1.0), 'fall': (water(), 1.0)}
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
def build():
    # 계단 2단 (둥근 모서리)
    lathe('step', [(4.9, 0.42), (5.2, 0.42), (5.25, 0.39), (5.27, 0.34), (5.27, 0.24), (5.5, 0.22), (5.55, 0.19), (5.57, 0.13), (5.57, 0.0)],
          seg=72, grad=(0.0, 0.42, 0.82, 1.0))
    disc('floor', 4.5, 0.43, seg=48, shade=0.8)
    # 큰 수반: 바깥 벽(살짝 불룩) → 두툼한 둥근 테 → 안쪽 벽
    lathe('marble', [(4.92, 0.42), (5.0, 0.5), (5.03, 0.62), (5.02, 0.95), (5.0, 0.98), (5.1, 1.03), (5.15, 1.1), (5.14, 1.17), (5.06, 1.23),
                     (4.9, 1.26), (4.68, 1.26), (4.52, 1.22), (4.45, 1.14), (4.44, 1.05), (4.44, 0.45)], seg=72, grad=(0.42, 1.26, 0.8, 1.04))
    lathe('gold', [(5.035, 0.925), (5.06, 0.94), (5.06, 0.965), (5.035, 0.98)], seg=72)                    # 테 아래 금 띠
    # 바깥 벽 장식 판 16장(푸른 회색, 둥근 끝) + 판마다 금 장미
    for i in range(16):
        a = (i + 0.5) / 16 * 2 * math.pi; span = 2 * math.pi / 16 * 0.62
        lathe('trim', [(5.0, 0.58), (5.06, 0.6), (5.075, 0.66), (5.075, 0.84), (5.06, 0.9), (5.0, 0.92)], seg=8, a0=a - span / 2, a1=a + span / 2,
              closed=False, grad=(0.58, 0.92, 0.86, 1.0))
        ca, sa = math.cos(a), math.sin(a)
        sphere('gold', (5.1 * ca, 5.1 * sa, 0.75), (0.035, 0.1, 0.1), seg=8, rings=5, rot=Matrix.Rotation(a, 3, 'Z'))
        for k in range(4):                                                                                 # 장미 꽃잎 4장
            b = (k + 0.5) / 4 * 2 * math.pi; off = Vector((0, math.cos(b), math.sin(b))) * 0.1
            sphere('gold', Vector((5.085 * ca, 5.085 * sa, 0.75)) + Matrix.Rotation(a, 3, 'Z') @ off, (0.025, 0.065, 0.065), seg=6, rings=4, rot=Matrix.Rotation(a, 3, 'Z'))
    # 테 위 작은 반구 장식 8개(수반 테 둘레, 대각선) — 둥근 실루엣에 리듬
    for i in range(8):
        a = (i + 0.5) / 8 * 2 * math.pi
        sphere('marble', (4.8 * math.cos(a), 4.8 * math.sin(a), 1.26), (0.2, 0.2, 0.13), seg=14, rings=6, grad=(1.2, 1.4, 0.92, 1.05))
        sphere('gold', (4.8 * math.cos(a), 4.8 * math.sin(a), 1.4), (0.07, 0.07, 0.07), seg=10, rings=6)
    disc('water', 4.45, 1.06, seg=72)                                                                    # 수반 수면
    # 가운데 기둥 → 큰 접시(꽃잎 10장 가장자리)
    lathe('marble', [(0.0, 0.43), (1.3, 0.43), (1.3, 0.62), (1.15, 0.8), (0.78, 0.98), (0.6, 1.2), (0.52, 1.55), (0.56, 1.8), (0.7, 1.98),
                     (1.0, 2.12), (1.6, 2.26), (2.1, 2.38), (2.28, 2.48), (2.3, 2.58), (2.22, 2.64), (2.05, 2.64), (1.98, 2.56)],
          seg=72, lobes=10, amp=0.07, lobe_z=(2.2, 2.7), grad=(0.43, 2.64, 0.78, 1.04))
    lathe('gold', [(0.57, 1.6), (0.63, 1.64), (0.63, 1.72), (0.57, 1.76)], seg=40)
    disc('water', 1.99, 2.55, seg=60, lobes=10, amp=0.07)
    # 작은 접시(꽃잎 8장)
    lathe('marble', [(0.0, 2.54), (0.46, 2.54), (0.4, 2.8), (0.34, 3.08), (0.4, 3.22), (0.62, 3.36), (1.05, 3.5), (1.3, 3.6), (1.33, 3.68),
                     (1.26, 3.73), (1.12, 3.73), (1.06, 3.66)], seg=56, lobes=8, amp=0.08, lobe_z=(3.4, 3.8), grad=(2.54, 3.73, 0.86, 1.04))
    lathe('gold', [(0.36, 2.98), (0.41, 3.01), (0.41, 3.08), (0.36, 3.11)], seg=32)
    disc('water', 1.08, 3.65, seg=48, lobes=8, amp=0.08)
    # 여신상 받침 + 여신(큰 머리, 날개, 항아리를 기울여 붓는 모습) — 앞면 -Y
    lathe('marble', [(0.0, 3.64), (0.44, 3.64), (0.46, 3.72), (0.36, 3.8), (0.32, 3.95), (0.4, 4.02), (0.42, 4.08), (0.0, 4.08)], seg=32)
    lathe('statue', [(0.0, 4.08), (0.4, 4.08), (0.39, 4.22), (0.33, 4.55), (0.25, 4.88), (0.2, 5.02), (0.22, 5.14), (0.25, 5.28),
                     (0.23, 5.38), (0.15, 5.45), (0.08, 5.5), (0.07, 5.56), (0.0, 5.58)], seg=32, lobes=9, amp=0.06, lobe_z=(4.08, 4.9),
          grad=(4.08, 5.5, 0.84, 1.04))
    lathe('gold', [(0.205, 5.0), (0.225, 5.02), (0.225, 5.07), (0.205, 5.09)], seg=24)                    # 허리띠
    sphere('statue', (0, 0, 5.76), (0.22, 0.21, 0.22), seg=20, rings=14)                                   # 머리
    sphere('statue', (0, 0.05, 5.8), (0.235, 0.215, 0.215), seg=20, rings=12, grad=(5.6, 6.0, 0.9, 1.0))   # 머리카락(뒤로 조금)
    sphere('statue', (0, 0.17, 5.92), (0.11, 0.1, 0.1), seg=14, rings=8)                                   # 올림머리
    lathe('gold', [(0.2, 5.9), (0.215, 5.91), (0.215, 5.95), (0.2, 5.96)], seg=28, centre=(0, 0.02))       # 금 머리띠
    for s in (-1, 1):                                                                                      # 날개(납작한 잎 모양 2겹)
        for k, (ln, z) in enumerate(((0.55, 5.42), (0.4, 5.22))):
            R = Matrix.Rotation(s * math.radians(28 + k * 18), 3, 'Y') @ Matrix.Rotation(math.radians(-14), 3, 'X')
            sphere('statue', (s * (0.3 + k * 0.05), 0.2, z), (0.1, 0.035, ln), seg=14, rings=10, rot=R, grad=(4.9, 6.0, 0.9, 1.02))
    # 팔: 왼팔은 항아리 밑, 오른팔은 항아리 목 — 항아리는 오른쪽 앞에서 바깥으로 기울어 작은 접시에 물을 부음
    jar = Vector((0.36, -0.2, 5.2))
    tube('statue', [(-0.2, 0.0, 5.36), (-0.12, -0.2, 5.12), (0.24, -0.26, 5.08)], [0.06, 0.055, 0.05], ring=8)
    tube('statue', [(0.2, 0.0, 5.38), (0.34, -0.08, 5.36), (0.42, -0.16, 5.36)], [0.06, 0.055, 0.05], ring=8)
    for p in ((0.24, -0.26, 5.08), (0.42, -0.16, 5.36)): sphere('statue', p, (0.055, 0.055, 0.055), seg=10, rings=6)
    R = Matrix.Rotation(math.radians(-58), 3, 'Y')
    for prof, key in (([(0.0, -0.17), (0.09, -0.17), (0.14, -0.08), (0.15, 0.02), (0.11, 0.1), (0.06, 0.14), (0.07, 0.2), (0.05, 0.2)], 'gold'),):
        me = lathe(key, prof, seg=20); me.transform(Matrix.Translation(jar) @ R.to_4x4())
    mouth = jar + R @ Vector((0, 0, 0.2))
    # 항아리 물줄기: 입구 → 작은 접시 수면 (포물선)
    pts, rad = [], []
    land = Vector((0.92, -0.42, 3.66))
    for i in range(9):
        t = i / 8; p = mouth.lerp(land, t); p.z = mouth.z + (land.z - mouth.z) * t * t + 0.18 * t * (1 - t) * 0 ; p.x = mouth.x + (land.x - mouth.x) * math.sqrt(t)
        pts.append(tuple(p)); rad.append(0.045 + 0.03 * t)
    tube('fall', pts, rad, ring=8, uv='fall', smooth=True)
    # 접시에서 떨어지는 물막(가장자리 → 아래 수면), 꽃잎 골마다 굵게 흐르도록 같은 꽃잎 수
    lathe('fall', [(2.28, 2.6), (2.42, 2.4), (2.56, 2.0), (2.66, 1.5), (2.7, 1.07)], seg=60, lobes=10, amp=0.07, uv='fall')
    lathe('fall', [(1.31, 3.7), (1.42, 3.5), (1.52, 3.1), (1.58, 2.57)], seg=48, lobes=8, amp=0.08, uv='fall')

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
