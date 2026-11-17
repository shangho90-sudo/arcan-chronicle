"""직업 계보별 무기 2단계(2026-11-17): 계열 14개(견습생·1차 5 + 예술가 악기·2차 7)의 단계별 무기를 조립한다.
  손에 든 모델(= 땅에 떨어진 모델) assets/items/wg_<계열>_<단계>.glb.json + 아이콘 assets/ui/items/wg_<계열>_<단계>.png(128 px)
  + 확인표 /tmp/gear2/sheet_<계열>_wpn.png(아이콘 줄 + 3D 렌더 줄, 단계 순서).

한 가족처럼 = 계열마다 같은 몸체(자루·코등이·머리 틀·색) + 단계가 오를수록 장식이 늘고 커짐(designs.py 진화):
  1 기본 모양 + 모티프 암시 → 2 보석(핵) → 3 흘러내리는 리본 → 4 Tripo 대표 장식이 머리가 됨 + 구슬 줄 → 5 더 큰 장식 + 금테
  → 6(드롭) 날개 + 둘째 보석 고리 → 7(드롭 전설) 후광 + 관 + 여러 갈래 리본. 견습생 4단계는 1·2·3·7.
  Tripo 장식은 tools/blender/gear2_wpn_prep.py가 다듬은 $RAW/prep/<계열>_<a|b>.glb(b = 전설 장식, 없으면 a를 크게).
  나머지(자루·날·보석·리본·구슬·날개·후광)는 여기서 절차로 만듦 — 정점 색(손그림 느낌의 위아래 명암) 재질 하나 + 빛나는 보석 재질 하나.

규격(게임 js/items3d.js gearModel): 쥐는 곳 = 원점, 무기 축 = +Z(GLB에서는 +Y), 단위 = 손 소품 단위(m, 손이 1.3배로 키움),
  길이는 예전 절차 모델과 같게(검 0.40 · 유봉 0.40 · 망치 0.52 · 식칼 0.31 · 가위 0.33 · 붓/악기 0.74) — 동작·잔상(bladePoints = 축 최댓값)·등에 메기가 그대로.
  삼각형 ≤ 3000, 텍스처 512 px. 가위 계열은 손에 들 때 model.js makeShears(두 반쪽)를 쓰고 이 모델은 땅·아이콘용(색은 items3d.js SHEAR_LINE).
Usage: python3 tools/blender/gear2_wpn.py [계열 또는 id ...]  (없으면 전부; NOICON=1 모델만, NOGLB=1 그림만)"""
import base64, json, math, os, sys, tempfile, random
import bpy, bmesh
from mathutils import Matrix, Vector
from PIL import Image, ImageFilter, ImageChops, ImageDraw, ImageEnhance
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'gear')); import designs as D
RAW = os.environ.get('RAW', '/home/claude/gear2_3d'); PREP = os.path.join(RAW, 'prep')
ICONS = os.path.join(ROOT, 'assets', 'ui', 'items'); MODELS = os.path.join(ROOT, 'assets', 'items'); SHEET = '/tmp/gear2'
for d in (ICONS, MODELS, SHEET): os.makedirs(d, exist_ok=True)
ICON = 128

def hx(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
def mix(a, b, t): return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))
def mul(a, k): return tuple(min(1, a[i] * k) for i in range(3))
GOLD, SILVER, WOOD, DWOOD, LEATHER, IRON = hx('#e8b84a'), hx('#dde2ea'), hx('#8a5a34'), hx('#4e3020'), hx('#6a3e22'), hx('#5a5660')

# 계열 색 역할: shaft 자루 · grip 감은 손잡이 · head 머리 · trim 금속 테 · accent 리본 · gem 보석(빛) · blade 날
COL = {
    'nov':    dict(shaft=WOOD, grip=hx('#7cc6f0'), head=hx('#f3ead2'), trim=GOLD, accent=hx('#7cc6f0'), gem=hx('#7cc6f0'), blade=hx('#eef2f6'), leaf=hx('#9ad070')),
    'pharm':  dict(shaft=hx('#8cc25a'), grip=hx('#f5eedb'), head=hx('#f5eedb'), trim=GOLD, accent=hx('#a8d86a'), gem=hx('#8ff0e0'), leaf=hx('#7cc04a')),
    'smith':  dict(shaft=hx('#3a3438'), grip=hx('#c8302a'), head=hx('#3a3438'), trim=hx('#c8302a'), accent=hx('#c8302a'), gem=hx('#ff9a3a'), leaf=hx('#ff9a3a')),
    'cook':   dict(shaft=hx('#2a6e6a'), grip=hx('#2fb3a8'), head=hx('#dfe6ee'), trim=hx('#2fb3a8'), accent=hx('#ff7f6a'), gem=hx('#2fb3a8'), blade=hx('#dfe6ee'), leaf=hx('#ff7f6a')),
    'hair':   dict(shaft=SILVER, grip=hx('#e86a8e'), head=hx('#f7f5f2'), trim=hx('#c8ccd6'), accent=hx('#e86a8e'), gem=hx('#e86a8e'), blade=hx('#f2f4f8'), leaf=hx('#f7f5f2')),
    'art':    dict(shaft=hx('#8a5ad0'), grip=hx('#5a3a90'), head=hx('#5ad0e6'), trim=GOLD, accent=hx('#5ad0e6'), gem=hx('#b07af0'), leaf=hx('#e6b54a')),
    'artm':   dict(shaft=hx('#c9a46a'), grip=hx('#3ab8a8'), head=hx('#e89a3a'), trim=GOLD, accent=hx('#3ab8a8'), gem=hx('#ffb34a'), leaf=hx('#3ab8a8')),
    'wpharm': dict(shaft=hx('#e4e7ec'), grip=hx('#22b8b0'), head=hx('#aee6ff'), trim=hx('#e4e7ec'), accent=hx('#22b8b0'), gem=hx('#4af0e0'), leaf=hx('#aee6ff')),
    'herb':   dict(shaft=hx('#2e2420'), grip=hx('#e0442e'), head=hx('#3fae7a'), trim=GOLD, accent=hx('#e0442e'), gem=hx('#5ae0a0'), leaf=hx('#a0582e')),
    'eng':    dict(shaft=hx('#d6a540'), grip=hx('#24346e'), head=hx('#24346e'), trim=hx('#d6a540'), accent=hx('#24346e'), gem=hx('#6ad8ff'), leaf=hx('#c87a40')),
    'chef':   dict(shaft=hx('#7a1a24'), grip=hx('#d2283a'), head=hx('#f8f6f2'), trim=GOLD, accent=hx('#f8f6f2'), gem=hx('#ff4a3a'), blade=hx('#f4f2ee'), leaf=hx('#d2283a')),
    'design': dict(shaft=hx('#d8dce6'), grip=hx('#4a3a8a'), head=hx('#4a3a8a'), trim=hx('#e8a88a'), accent=hx('#e8a88a'), gem=hx('#f4e8ff'), blade=hx('#e4e6f0'), leaf=hx('#4a3a8a')),
    'paint':  dict(shaft=hx('#1e1c22'), grip=hx('#e04a2e'), head=hx('#1e1c22'), trim=GOLD, accent=hx('#e04a2e'), gem=hx('#ffd060'), leaf=hx('#e04a2e')),
    'music':  dict(shaft=hx('#d8dce8'), grip=hx('#22306a'), head=hx('#22306a'), trim=hx('#d8dce8'), accent=hx('#b89ae8'), gem=hx('#ffe080'), leaf=hx('#b89ae8')),
}
# 단계 -> 꾸밈 단계(1~7). 견습생(4단계)은 1·2·3·7
def vstage(key, s, n): return [1, 2, 3, 7][s - 1] if n == 4 else s

# ---------------------------------------------------------------- 메시 도구 (부품마다 오브젝트 하나, 마지막에 합침)
PARTS = []
def obj_from_bm(bm, name, col, mat='paint', shade=(0.78, 1.1), flat=False):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    ob['col'] = col; ob['mat'] = mat; ob['shade'] = shade; ob['flat'] = flat
    PARTS.append(ob); return ob
def place(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    M = Matrix.Translation(loc) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X') @ Matrix.Diagonal((*scale, 1))
    ob.data.transform(M); ob.data.update(); return ob
def cyl(r0, r1, z0, z1, col, seg=10, name='cyl', **k):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r0, radius2=r1, depth=z1 - z0)
    ob = obj_from_bm(bm, name, col, **k); return place(ob, (0, 0, (z0 + z1) / 2))
def sph(r, col, loc=(0, 0, 0), scale=(1, 1, 1), seg=10, rings=6, name='sph', **k):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    return place(obj_from_bm(bm, name, col, **k), loc, (0, 0, 0), scale)
def ico(r, col, loc=(0, 0, 0), scale=(1, 1, 1), name='gem', sub=0, **k):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    return place(obj_from_bm(bm, name, col, flat=True, **k), loc, (0, 0, 0), scale)
def torus(R, r, col, loc=(0, 0, 0), rot=(0, 0, 0), seg=16, tseg=6, arc=2 * math.pi, name='torus', **k):
    bm = bmesh.new(); rings = []
    closed = arc >= 2 * math.pi - 1e-6; n = seg if closed else seg + 1
    for i in range(n):
        a = arc * i / seg; c = Vector((math.cos(a) * R, math.sin(a) * R, 0)); out = Vector((math.cos(a), math.sin(a), 0))
        rings.append([bm.verts.new(c + out * math.cos(2 * math.pi * j / tseg) * r + Vector((0, 0, math.sin(2 * math.pi * j / tseg) * r))) for j in range(tseg)])
    for i in range(n if closed else n - 1):
        A, B = rings[i], rings[(i + 1) % n]
        for j in range(tseg): bm.faces.new((A[j], B[j], B[(j + 1) % tseg], A[(j + 1) % tseg]))
    return place(obj_from_bm(bm, name, col, **k), loc, rot)
def slab(pts, depth, col, loc=(0, 0, 0), rot=(0, 0, 0), name='slab', bevel=0.0, **k):
    """2D 윤곽(x 가로, z 세로)을 y 두께로 — 날·잎·날개"""
    bm = bmesh.new(); vs = [bm.verts.new((x, -depth / 2, z)) for x, z in pts]; f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f]); top = [v for v in r['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=top, vec=(0, depth, 0)); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    return place(obj_from_bm(bm, name, col, flat=True, **k), loc, rot)
def ribbon(path, width, col, name='ribbon', twist=0.0, **k):
    """경로(점 목록)를 따라 폭 있는 띠(두 면) — 리본·꼬리깃"""
    bm = bmesh.new(); L = []
    for i, p in enumerate(path):
        p = Vector(p); t = (Vector(path[min(i + 1, len(path) - 1)]) - Vector(path[max(i - 1, 0)])).normalized()
        side = t.cross(Vector((0, 1, 0))).normalized(); a = twist * i / max(1, len(path) - 1)
        side = (side * math.cos(a) + Vector((0, 1, 0)) * math.sin(a)); w = width * (1 - 0.35 * i / len(path))
        L.append((bm.verts.new(p - side * w / 2), bm.verts.new(p + side * w / 2)))
    for i in range(len(L) - 1):
        bm.faces.new((L[i][0], L[i + 1][0], L[i + 1][1], L[i][1]))
    return obj_from_bm(bm, name, col, flat=True, **k)
def cone(r, h, col, loc, rot=(0, 0, 0), seg=6, name='cone', **k):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=seg, radius1=r, radius2=0.0004, depth=h)
    return place(obj_from_bm(bm, name, col, flat=True, **k), loc, rot)
def leaf(len_, wid, col, loc, rot, depth=0.008, name='leaf'):
    pts = [(0, 0)] + [(wid * math.sin(math.pi * t) * (1 - 0.3 * t), len_ * t) for t in (0.2, 0.4, 0.6, 0.8)] + [(0, len_)] + [(-wid * math.sin(math.pi * t) * (1 - 0.3 * t), len_ * t) for t in (0.8, 0.6, 0.4, 0.2)]
    return slab(pts, depth, col, loc, rot, name=name)
def star_pts(R, r, n=5):
    return [((R if i % 2 == 0 else r) * math.sin(math.pi * i / n), (R if i % 2 == 0 else r) * math.cos(math.pi * i / n)) for i in range(2 * n)]

def ornament(key, s):
    """Tripo 대표 장식(다듬은 GLB) 하나를 불러 오브젝트로 — 가장 긴 변 1, 가운데 원점, 앞 −Y. 단계 6~7은 b(전설)가 있으면 그것"""
    for v in (['b', 'a'] if s >= 6 else ['a']):
        p = os.path.join(PREP, key + '_' + v + '.glb')
        if os.path.exists(p):
            before = set(bpy.context.scene.objects); bpy.ops.import_scene.gltf(filepath=p)
            new = [o for o in bpy.context.scene.objects if o not in before]; ob = next(o for o in new if o.type == 'MESH')
            for o in new:
                if o is not ob: bpy.data.objects.remove(o)
            ob.parent = None; bpy.context.view_layer.objects.active = ob; ob.select_set(True)
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            ob['mat'] = 'tripo'; ob['variant'] = v; PARTS.append(ob); return ob
    return None
def fit_orn(ob, size, loc, rot=(0, 0, 0), axis=None):
    """가장 긴 변(또는 axis 0/1/2 축 길이)을 size로, rot 회전 뒤 loc에"""
    vs = [v.co for v in ob.data.vertices]; ext = [max(v[i] for v in vs) - min(v[i] for v in vs) for i in range(3)]
    k = size / (ext[axis] if axis is not None else max(ext)); place(ob, (0, 0, 0), (0, 0, 0), (k, k, k)); place(ob, loc, rot); return ob

# ---------------------------------------------------------------- 무기 종류별 몸체: anchors = focus(보석) · hang(리본 매듭) · top(후광·관 가운데) · hs(머리 크기)
def handle(C, z0, z1, r0, r1, grip_to, pommel_r, s, seg=10):
    cyl(r0, r1, z0, z1, C['shaft'], seg, 'shaft')
    cyl(r0 * 1.18, r0 * 1.12, z0 + 0.004, grip_to, C['grip'], seg, 'grip')
    for z in (z0 + 0.03, grip_to - 0.01): torus(r0 * 1.2, 0.0035, C['trim'], (0, 0, z), seg=8, tseg=3, name='band')
    sph(pommel_r, C['trim'], (0, 0, z0 - pommel_r * 0.6), seg=10, rings=6, name='pommel')
    if s >= 2: ico(pommel_r * 0.55, C['gem'], (0, -pommel_r * 0.7, z0 - pommel_r * 0.6), mat='glow')

def build_sword(key, C, s):
    handle(C, -0.085, 0.0, 0.016, 0.017, -0.004, 0.022, s)
    w = 0.046 if s < 7 else 0.052
    slab([(-w / 2, 0.012), (w / 2, 0.012), (w * 0.42, 0.33), (0, 0.40), (-w * 0.42, 0.33)], 0.010, C['blade'], name='blade')
    slab([(-0.006, 0.02), (0.006, 0.02), (0.004, 0.33), (-0.004, 0.33)], 0.0115, mix(C['blade'], C['accent'], 0.35), name='fuller')
    # 칼끝 쪽 별 구멍 암시(작은 금 별)
    slab(star_pts(0.011, 0.005), 0.012, C['trim'], (0, 0, 0.33), name='tipstar')
    orn = ornament(key, s) if s >= 6 else None
    if orn: fit_orn(orn, 0.16 + 0.02 * (s - 6), (0, 0, 0.018), axis=0)
    else:
        cyl(0.02, 0.02, -0.004, 0.022, C['trim'], 10, 'guardhub')
        for sx in (-1, 1): leaf(0.065 + 0.008 * s, 0.018, C['leaf'], (sx * 0.012, 0, 0.012), (0, sx * -1.25, 0))
    if s >= 7: [slab(star_pts(0.008, 0.0035), 0.011, GOLD, (0, 0, z)) for z in (0.12, 0.18, 0.24)]
    return dict(focus=(0, -0.012, 0.012), hang=(0, 0, -0.03), top=(0, 0.01, 0.06), hs=0.09, head_z=0.012, gem_on=not orn)

def build_pestle(key, C, s):
    handle(C, -0.06, 0.25, 0.017, 0.021, 0.05, 0.022, s)
    torus(0.024, 0.006, C['trim'], (0, 0, 0.235), name='collar')
    hz = 0.31; orn = ornament(key, s) if s >= 4 else None
    if orn:
        fit_orn(orn, (0.15 + 0.012 * (s - 4)), (0, 0, hz + 0.01)); return dict(focus=(0, -0.06, hz), hang=(0, 0, 0.23), top=(0, 0.01, hz + 0.02), hs=0.16, head_z=hz, gem_on=False)
    if key == 'pharm':
        sph(0.055, C['head'], (0, 0, hz), (1, 1, 1.25), seg=12, rings=8, name='bud')
        for i in range(5): a = i * 2 * math.pi / 5; leaf(0.06, 0.022, C['leaf'], (math.cos(a) * 0.03, math.sin(a) * 0.03, hz - 0.055), (0.5 * math.sin(a), -0.5 * math.cos(a), 0))
        if s >= 3: [cone(0.006, 0.05, mix(WOOD, C['head'], 0.4), (sx * 0.05, 0, hz + 0.03), (0, sx * 0.9, 0)) for sx in (-1, 1)]
    elif key == 'wpharm':
        sph(0.05, C['head'], (0, 0, hz), (1, 1, 1.15), seg=12, rings=8, name='glass')
        for z in (hz - 0.035, hz + 0.035): torus(0.046, 0.004, C['trim'], (0, 0, z), name='cage')
        for i in range(4): a = i * math.pi / 2; cyl(0.0035, 0.0035, hz - 0.05, hz + 0.05, C['trim'], 6).location = (math.cos(a) * 0.05, math.sin(a) * 0.05, 0)
        if s >= 3: cone(0.012, 0.05, C['head'], (0, 0, hz + 0.075), seg=6)
    else:   # herb
        sph(0.04, C['head'], (0, 0, hz - 0.01), seg=12, rings=8, name='jade')
        sph(0.07, C['leaf'], (0, 0, hz + 0.03), (1, 1, 0.38), seg=14, rings=8, name='cap')
        if s >= 3: sph(0.05, mix(C['leaf'], (1, 0.7, 0.4), 0.2), (0.02, 0, hz + 0.065), (1, 1, 0.38), seg=12, rings=6, name='cap2')
    return dict(focus=(0, -0.05, hz - 0.01), hang=(0, 0, 0.23), top=(0, 0.01, hz + 0.02), hs=0.12, head_z=hz, gem_on=True)

def build_hammer(key, C, s):
    handle(C, -0.085, 0.40, 0.024, 0.029, 0.03, 0.034, s, seg=12)
    hz = 0.43; orn = ornament(key, s) if s >= 4 else None
    if orn:
        rot = ORN_ROT.get(key, (0, 0, 0)); fit_orn(orn, 0.30 + 0.02 * (s - 4), (0, 0, hz), rot)
        return dict(focus=(0, -0.09, hz), hang=(0, 0, 0.36), top=(0, 0.01, hz + 0.06), hs=0.2, head_z=hz, gem_on=False)
    head = cyl(0.07, 0.07, -0.11, 0.11, C['head'], 14, 'hhead'); place(head, (0, 0, hz), (0, math.pi / 2, 0))
    for sx in (-1, 1): place(cyl(0.08, 0.077, -0.018, 0.018, mix(C['head'], (1, 1, 1), 0.15), 14, 'face'), (sx * 0.12, 0, hz), (0, math.pi / 2, 0))
    place(cyl(0.076, 0.076, -0.025, 0.025, C['trim'], 14, 'band'), (0, 0, hz), (0, math.pi / 2, 0))
    if key == 'smith':
        for i in range(3 + s): x = -0.08 + 0.16 * i / (2 + s); cone(0.012, 0.035 + 0.01 * s, C['trim'], (x, 0, hz + 0.08), seg=5)
        for i in range(4): slab([(-0.003, 0), (0.003, 0), (0.002, 0.04), (-0.002, 0.04)], 0.004, C['gem'], (-0.06 + 0.04 * i, -0.071, hz - 0.02), (0, 0, 0.3 * (i - 1.5)), mat='glow')
    else:   # eng — 톱니 고리
        for i in range(12): a = i * math.pi / 6; place(slab([(-0.01, 0), (0.01, 0), (0.007, 0.014), (-0.007, 0.014)], 0.03, C['trim'], name='tooth'), (0, 0, 0), (0, 0, 0)); PARTS[-1].data.transform(Matrix.Translation((0, 0, 0.074))); PARTS[-1].data.transform(Matrix.Rotation(a, 4, 'Y')); PARTS[-1].data.transform(Matrix.Translation((0, 0, hz)))
        if s >= 3: [cyl(0.074, 0.074, -0.004, 0.004, hx('#c87a40'), 14, 'coil').data.transform(Matrix.Translation((0, 0, 0))) for _ in ()]
        if s >= 3:
            for x in (-0.06, -0.04, 0.04, 0.06): place(cyl(0.073, 0.073, -0.004, 0.004, hx('#c87a40'), 14, 'coil'), (x, 0, hz), (0, math.pi / 2, 0))
    return dict(focus=(0, -0.08, hz), hang=(0, 0, 0.36), top=(0, 0.01, hz + 0.05), hs=0.15, head_z=hz, gem_on=True)

def build_knife(key, C, s):
    cyl(0.017, 0.019, -0.06, 0.05, C['shaft'], 10, 'handle'); [torus(0.019, 0.0035, C['trim'], (0, 0, z), seg=10, tseg=4) for z in (-0.02, 0.02)]
    sph(0.02, C['trim'], (0, 0, -0.066), seg=10, rings=6, name='pommel')
    if key == 'chef' and s >= 1: [cone(0.008, 0.018, C['grip'], (sx * 0.01, 0, -0.084), (0, sx * 0.4, 0)) for sx in (-1, 1)]   # 손잡이 끝 여우 귀
    cyl(0.024, 0.022, 0.05, 0.064, C['trim'], 10, 'bolster')
    orn = ornament(key, s) if (s >= 4 and key == 'cook') else None
    if orn:
        fit_orn(orn, 0.25 + 0.012 * (s - 4), (0.018, 0, 0.065 + (0.25 + 0.012 * (s - 4)) / 2), ORN_ROT.get(key, (0, 0, 0)), axis=0)
        return dict(focus=(0, -0.02, 0.06), hang=(0, 0, -0.04), top=(0.02, 0.01, 0.2), hs=0.11, head_z=0.18, gem_on=True)
    W = 0.085; slab([(-0.012, 0.06), (W - 0.01, 0.065), (W, 0.24), (W * 0.55, 0.305), (-0.012, 0.285)], 0.008, C['blade'], (0, 0, 0), name='blade')
    slab([(-0.012, 0.062), (0.004, 0.062), (0.004, 0.28), (-0.012, 0.283)], 0.0095, mix(C['blade'], C['trim'], 0.5), name='spine')
    if key == 'cook':
        for i in range(3 + s): slab([(-0.006, 0), (0.006, 0), (0, 0.008)], 0.0092, mix(C['blade'], C['trim'], 0.3), (0.03 + 0.012 * (i % 3), 0, 0.09 + 0.03 * i), name='scale')
    if key == 'chef':
        k = 1 + 0.12 * s
        slab([(-0.012, 0.09), (-0.03 * k, 0.12), (-0.02 * k, 0.17), (-0.045 * k, 0.22), (-0.025 * k, 0.26), (-0.05 * k, 0.31), (-0.012, 0.285)], 0.009, C['grip'], name='flame')
        if s >= 3: [cone(0.006, 0.02, hx('#cfeeff'), (0.05 + 0.012 * i, 0, 0.27 + 0.008 * i), (0, 0.4, 0), seg=4) for i in range(2)]
        orn = ornament(key, s) if s >= 4 else None
        if orn: fit_orn(orn, 0.13 + 0.012 * (s - 4), (0.028, -0.006, 0.115), ORN_ROT.get(key, (0, 0, 0)))
    return dict(focus=(0, -0.016, 0.057), hang=(0, 0, -0.04), top=(0.02, 0.01, 0.2), hs=0.11, head_z=0.18, gem_on=not (key == 'chef' and s >= 4))

def build_scissors(key, C, s):
    pz = 0.06; L = 0.27
    for sx in (-1, 1):
        sh = [(-0.006, -0.012), (0.016, -0.004), (0.012, L * 0.6), (0.002, L), (-0.008, L * 0.8), (-0.009, 0.0)]
        slab([(x * -sx, z) for x, z in sh], 0.008, C['blade'], (sx * 0.004, sx * 0.0045, pz), (0, sx * 0.07, 0), name='blade')
        torus(0.028, 0.008, C['grip'], (sx * 0.034, 0, pz - 0.075), (math.pi / 2, 0, 0), seg=14, tseg=6, name='ring')
        slab([(-0.006, 0), (0.006, 0), (0.004, 0.05), (-0.004, 0.05)], 0.007, C['trim'], (sx * 0.02, 0, pz - 0.05), (0, -sx * 0.4, 0), name='shank')
        if key == 'hair' and s >= 3: leaf(0.04, 0.012, C['leaf'], (sx * 0.06, 0, pz - 0.08), (0, sx * 2.4, 0))
        if key == 'design' and s >= 3: torus(0.036, 0.004, C['trim'], (sx * 0.034, 0, pz - 0.075), (math.pi / 2, 0, 0), seg=14, tseg=4, arc=math.pi, name='crescent')
    place(cyl(0.012, 0.012, -0.008, 0.008, C['trim'], 10, 'pin'), (0, 0, pz), (math.pi / 2, 0, 0))
    orn = ornament(key, s) if s >= 4 else None
    if orn: fit_orn(orn, 0.17 + 0.015 * (s - 4), (0, -0.022, pz + 0.02), ORN_ROT.get(key, (0, 0, 0)))
    return dict(focus=(0, -0.014, pz), hang=(0, 0, pz - 0.1), top=(0, 0.01, pz + 0.03), hs=0.1, head_z=pz, gem_on=not orn)

def build_brush(key, C, s):
    handle(C, -0.20, 0.52, 0.014, 0.017, -0.05, 0.022, s)
    cyl(0.021, 0.019, 0.52, 0.60, C['trim'], 12, 'ferrule'); torus(0.022, 0.004, mix(C['trim'], (1, 1, 1), 0.3), (0, 0, 0.6))
    tip = C['head'] if key != 'paint' else hx('#2a2830')
    sph(0.03, tip, (0, 0, 0.635), (1, 1, 1.35), seg=12, rings=8, name='bristle'); cone(0.022, 0.07, tip, (0, 0, 0.69), seg=10)
    if key == 'paint': cone(0.008, 0.02, C['accent'], (0, 0, 0.725), seg=8)
    orn = ornament(key, s) if s >= 4 else None
    if orn:
        sz = (0.2 if key == 'art' else 0.17) + 0.02 * (s - 4)
        fit_orn(orn, sz, (0, 0.01 if key == 'art' else -0.012, 0.56 if key == 'art' else 0.555), ORN_ROT.get(key, (0, 0, 0)))
        return dict(focus=(0, -0.025, 0.56), hang=(0, 0, 0.48), top=(0, 0.02, 0.6), hs=0.15, head_z=0.6, gem_on=False)
    if key == 'art' and s >= 1: [leaf(0.05, 0.026, mix(C['head'], C['shaft'], i * 0.5), (sx * 0.015, 0.006, 0.55), (0, sx * (-1.0 - 0.6 * i), 0)) for sx in (-1, 1) for i in (0, 1)]
    if key == 'paint' and s >= 1: torus(0.03, 0.006, C['shaft'], (0, 0, 0.3), (0, 0, 0), seg=14, tseg=5, name='coil')
    return dict(focus=(0, -0.02, 0.56), hang=(0, 0, 0.48), top=(0, 0.02, 0.62), hs=0.12, head_z=0.6, gem_on=True)

def build_instrument(key, C, s):
    """악기(붓과 같은 길이·쥐는 곳): 긴 자루 + 위쪽 악기 머리(류트 몸통 / 초승달 리라)"""
    handle(C, -0.20, 0.50, 0.014, 0.017, -0.05, 0.022, s)
    hz = 0.6; orn = ornament(key, s) if s >= 4 else None
    if orn:
        fit_orn(orn, 0.22 + 0.02 * (s - 4), (0, 0, hz), ORN_ROT.get(key, (0, 0, 0)))
        return dict(focus=(0, -0.04, hz - 0.02), hang=(0, 0, 0.47), top=(0, 0.02, hz + 0.02), hs=0.17, head_z=hz, gem_on=False)
    if key == 'artm':
        sph(0.07, C['head'], (0, 0, hz - 0.01), (1, 0.42, 1.2), seg=14, rings=8, name='body')
        place(cyl(0.022, 0.022, -0.002, 0.002, hx('#3a2418'), 12, 'hole'), (0, -0.03, hz), (math.pi / 2, 0, 0))
        cyl(0.012, 0.011, hz + 0.07, hz + 0.13, C['shaft'], 8, 'neck'); slab([(-0.02, 0), (0.02, 0), (0.016, 0.04), (-0.016, 0.04)], 0.012, mix(C['shaft'], DWOOD, 0.4), (0, 0, hz + 0.13), name='pegbox')
        for x in (-0.008, 0, 0.008): cyl(0.0012, 0.0012, hz - 0.06, hz + 0.13, hx('#fff4d8'), 4, 'string').data.transform(Matrix.Translation((x, -0.03, 0)))
        if s >= 3: [leaf(0.07, 0.022, mix(C['leaf'], (1, 1, 1), 0.35), (sx * 0.02, -0.02, hz + 0.02), (0, sx * (-1.1 - 0.5 * i), 0)) for sx in (-1, 1) for i in (0, 1)]
    else:   # music — 초승달 리라
        torus(0.07, 0.012, C['trim'], (0, 0, hz + 0.02), (math.pi / 2, 0, 0), seg=18, tseg=6, arc=math.pi * 1.25, name='crescent').rotation_euler = (0, 0, 0)
        PARTS[-1].data.transform(Matrix.Translation((0, 0, -hz - 0.02))); PARTS[-1].data.transform(Matrix.Rotation(-math.pi * 0.125, 4, 'Y')); PARTS[-1].data.transform(Matrix.Translation((0, 0, hz + 0.02)))
        cyl(0.012, 0.016, hz - 0.08, hz - 0.045, C['grip'], 10, 'base')
        for x in (-0.03, -0.015, 0, 0.015, 0.03): cyl(0.0014, 0.0014, hz - 0.045, hz + 0.02 + math.sqrt(max(0, 0.07 ** 2 - x * x)) * 0.9, hx('#e8ecff'), 4, 'string').data.transform(Matrix.Translation((x, 0, 0)))
        if s >= 3: [leaf(0.05, 0.016, C['leaf'], (sx * 0.05, 0.004, hz + 0.06), (0, sx * -0.9, 0)) for sx in (-1, 1)]
    return dict(focus=(0, -0.035, hz - 0.01), hang=(0, 0, 0.47), top=(0, 0.02, hz + 0.02), hs=0.14, head_z=hz, gem_on=True)

BUILD = {'sword': build_sword, 'pestle': build_pestle, 'hammer': build_hammer, 'knife': build_knife, 'scissors': build_scissors, 'brush': build_brush, 'instrument': build_instrument}
# Tripo 장식을 붙일 때 더 돌릴 각도(x, y, z rad) — gear2_wpn_prep.py의 세 방향 그림을 보고 정함
ORN_ROT = {'cook': (0, -math.pi / 2, 0)}   # 잉어: 머리(+X)가 위, 등지느러미가 칼등(-X)

# ---------------------------------------------------------------- 단계 장식(모든 계열 공통): 보석 · 리본 · 구슬 줄 · 금테 · 날개 · 후광 · 관
def extras(key, C, s, A, kind):
    rnd = random.Random(hash(key) % 1000 + s)
    fx, fy, fz = A['focus']; hs = A['hs']
    if s >= 2 and A['gem_on']: ico(0.011 + 0.0028 * s, C['gem'], A['focus'], mat='glow', sub=1); torus(0.013 + 0.0028 * s, 0.0025, C['trim'], A['focus'], (math.pi / 2, 0, 0), seg=12, tseg=4)
    hx_, hy, hz = A['hang']
    nrib = 0 if s < 3 else 1 if s < 5 else 2 if s < 7 else 3
    k = max(0.55, min(1.1, hs / 0.15))                     # 작은 머리(식칼·가위·검)는 리본·구슬 줄도 짧게
    for i in range(nrib):
        side = (-1, 1, -0.3)[i]; L = (0.08 + 0.018 * s) * k; pts = []
        for j in range(9):
            t = j / 8; pts.append((hx_ + side * (0.012 + 0.05 * t * k) + 0.01 * k * math.sin(t * 7 + i), hy - 0.012 + 0.006 * math.sin(t * 5), hz - L * t))
        ribbon(pts, (0.022 + 0.002 * s) * k, C['accent'] if i != 1 else mix(C['accent'], C['trim'], 0.4), twist=1.2 * side)
        ico(0.01, C['accent'], (hx_ + side * 0.012, hy - 0.012, hz), name='knot')
    if s >= 4:   # 구슬 줄 + 끝 방울
        n = 4 + s // 2; side = 1 if nrib != 1 else 1
        for j in range(n):
            t = (j + 1) / (n + 1); ico(0.006 + 0.0007 * s, mix(C['gem'], (1, 1, 1), 0.35) if j % 2 else C['trim'], (hx_ + 0.02 + 0.03 * t * k, hy - 0.015, hz - 0.012 - 0.07 * k * t * (1 + 0.3 * math.sin(t * 3.1))), name='bead')
        ico(0.011, C['gem'], (hx_ + 0.02 + 0.032 * k, hy - 0.015, hz - 0.012 - 0.09 * k), mat='glow')
    if s >= 5:   # 금테
        torus(0.024 + (0.01 if kind == 'hammer' else 0), 0.0045, GOLD, (0, 0, A['hang'][2] + 0.03), seg=12, tseg=4, name='goldtrim')
    if s >= 6:   # 날개 + 둘째 보석 고리
        tx, ty, tz = A['top']; wl = hs * (0.9 + 0.15 * (s - 6))
        for sx in (-1, 1):
            for i, (l, a) in enumerate(((wl, 0.55), (wl * 0.78, 0.95), (wl * 0.56, 1.3))):
                leaf(l, l * 0.22, mix(C['leaf'], (1, 1, 1), 0.25 + 0.12 * i), (tx + sx * hs * 0.25, ty + 0.012 + 0.002 * i, tz - 0.01), (0, sx * -a, 0), depth=0.006)
        for i in range(6):
            a = i * math.pi / 3 + 0.3; ico(0.0075, C['gem'], (tx + math.cos(a) * hs * 0.45, ty - 0.01, tz + math.sin(a) * hs * 0.45 * 0.7), mat='glow')
    if s >= 7:   # 후광 + 관
        tx, ty, tz = A['top']
        torus(hs * 0.72, 0.0045, GOLD, (tx, ty + 0.02, tz), (math.pi / 2, 0, 0), seg=20, tseg=4, name='halo')
        for i in range(12): a = i * math.pi / 6; ico(0.0045, mix(GOLD, (1, 1, 1), 0.5), (tx + math.cos(a) * hs * 0.72, ty + 0.02, tz + math.sin(a) * hs * 0.72), mat='glow')
        for i in range(5): a = (i - 2) * 0.32; cone(0.009, 0.03 + 0.012 * (i == 2), GOLD, (tx + math.sin(a) * hs * 0.32, ty, tz + hs * 0.42 + math.cos(a) * 0.02), (0, a, 0), seg=4)
        ico(0.012, hx('#ff3a4a'), (tx, ty - 0.01, tz + hs * 0.46), mat='glow')      # 관 가운데 용의 눈 보석

# ---------------------------------------------------------------- 재질·합치기·내보내기
def paint_colors(ob):
    """부품마다 한 색 + 위아래 명암(위 밝게·아래 어둡게) + 아주 옅은 얼룩 = 손그림 느낌, 정점 색(코너)"""
    me = ob.data; col = ob['col']; lo, hi = ob['shade']
    zs = [v.co.z for v in me.vertices]; z0, z1 = min(zs), max(zs); span = max(1e-4, z1 - z0)
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    r = random.Random(len(me.vertices))
    for poly in me.polygons:
        n = poly.normal; facing = 0.9 + 0.12 * max(-1, min(1, -n.y * 0.5 + n.z * 0.7 - n.x * 0.2))
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co; t = (v.z - z0) / span
            k = (lo + (hi - lo) * t) * facing * (0.97 + 0.06 * r.random())
            c = mul(col, k); attr.data[li].color_srgb = (*c, 1)
def make_mats(gem):
    m = bpy.data.materials.new('M_wpaint'); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.6; b.inputs['Metallic'].default_value = 0.0; m.use_backface_culling = False
    g = bpy.data.materials.new('M_wglow'); g.use_nodes = True; b = g.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*[c ** 2.2 for c in gem], 1); b.inputs['Emission Color'].default_value = (*[c ** 2.2 for c in gem], 1); b.inputs['Emission Strength'].default_value = 0.6
    b.inputs['Roughness'].default_value = 0.25
    return m, g
def finish(gem):
    mp, mg = make_mats(gem); painted, glow, tripo = [], [], []
    for ob in PARTS:
        if ob['mat'] == 'tripo': tripo.append(ob); continue
        if not ob.get('flat'):
            for p in ob.data.polygons: p.use_smooth = True
        if ob['mat'] == 'glow': ob.data.materials.append(mg); glow.append(ob)
        else: paint_colors(ob); ob.data.materials.append(mp); painted.append(ob)
    for o in glow:   # 보석에도 색 속성(합칠 때 속성이 맞게)
        a = o.data.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        for d in a.data: d.color_srgb = (*gem, 1)
    budget = 2950 - sum(tri_count(o) for o in painted + glow)      # 삼각형 예산(≤ 3000): 넘치면 Tripo 장식을 더 줄임
    for o in tripo:
        n = tri_count(o)
        if n > budget:
            bpy.context.view_layer.objects.active = o; m = o.modifiers.new('d', 'DECIMATE'); m.ratio = budget / n * 0.97; m.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=m.name)
    groups = [g for g in (painted + glow, tripo) if g]
    out = []
    for g in groups:
        bpy.ops.object.select_all(action='DESELECT')
        for o in g: o.select_set(True)
        bpy.context.view_layer.objects.active = g[0]
        if len(g) > 1: bpy.ops.object.join()
        out.append(bpy.context.view_layer.objects.active)
    for o in out:
        bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(o.data); bm.free()
    return out
def tri_count(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
def tris(objs): return sum(len(o.data.polygons) for o in objs)

def export(objs, id):
    td = tempfile.mkdtemp(); glb = os.path.join(td, id + '.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_image_format='JPEG', export_jpeg_quality=84, export_animations=False,
                              export_yup=True, export_apply=True, export_normals=True, export_tangents=False, export_vertex_color='MATERIAL')
    raw = open(glb, 'rb').read(); zmax = max(max((o.matrix_world @ v.co).z for v in o.data.vertices) for o in objs)
    json.dump({'b64': base64.b64encode(raw).decode(), 'len': round(zmax, 4), 'tris': tris(objs), 'v': 2}, open(os.path.join(MODELS, id + '.glb.json'), 'w'))
    return len(raw)

# ---------------------------------------------------------------- 그림: 아이콘(머리 오른쪽 위 45°) + 확인표용 3/4 렌더
def setup_render(px):
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = int(os.environ.get('SAMPLES', '20')); sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 3; sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = px
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.view_settings.view_transform = 'Standard'
    if not sc.camera:
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.type = 'ORTHO'
        w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (1, 0.97, 0.94, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.9
        for nm, loc, e, col in (('key', (-2.5, -3, 4), 3.0, (1, 0.96, 0.9)), ('rim', (3, 2, 2), 1.8, (0.65, 0.8, 1))):
            L = bpy.data.objects.new(nm, bpy.data.lights.new(nm, 'SUN')); sc.collection.objects.link(L); L.data.energy = e; L.data.color = col
            L.rotation_euler = Vector(loc).to_track_quat('Z', 'Y').to_euler()
    return sc
def render(objs, view, px, zcut=None):
    sc = setup_render(px); cam = sc.camera
    keep = [v.co.z > zcut for o in objs for v in o.data.vertices] if zcut is not None else None
    piv = bpy.data.objects.new('piv', None); sc.collection.objects.link(piv)
    for o in objs: o.parent = piv
    if view == 'icon': piv.rotation_euler = (0, math.radians(45), 0); el = math.radians(12); az = 0
    else: piv.rotation_euler = (math.radians(-16), math.radians(18), math.radians(-35)); el = math.radians(18); az = 0
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    if keep: pts = [p for p, k in zip(pts, keep) if k]
    c = sum(pts, Vector()) / len(pts); lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)]); c = (lo + hi) / 2
    cam.location = c + Vector((0, -4 * math.cos(el), 4 * math.sin(el))); cam.rotation_euler = (math.radians(90) - el, 0, 0)
    cam.data.ortho_scale = max(hi.x - lo.x, hi.z - lo.z, 0.1) * 1.15
    f = os.path.join(tempfile.mkdtemp(), 'r.png'); sc.render.filepath = f; bpy.ops.render.render(write_still=True)
    for o in objs:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    bpy.data.objects.remove(piv)
    return Image.open(f).convert('RGBA')

GLOW_SOLD = [(0, 0, 0), (232, 220, 190), (190, 228, 214), (170, 210, 240), (236, 200, 150), (250, 190, 120)]
GLOW_DROP = [(0, 0, 0), (0, 0, 0), (0, 0, 0), (0, 0, 0), (196, 150, 255), (190, 130, 255), (220, 140, 255), (255, 170, 220)]
def iconize(im, s, drop, size=ICON):
    """손그림 아이콘: 여백 자르기 → 가는 어두운 외곽선 → 부드러운 그림자 → 단계 빛무리(판매 = 단계마다 따뜻해짐, 드롭 = 보라) → 투명 배경"""
    bb = im.getbbox(); im = im.crop(bb) if bb else im
    S = 256; side = int(max(im.size) * 1.16); sq = Image.new('RGBA', (side, side)); sq.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2)); im = sq.resize((S, S), Image.LANCZOS)
    a = im.split()[3]
    # 칠한 느낌: 색을 약간 단순화(포스터) + 채도
    rgb = ImageEnhance.Color(im.convert('RGB')).enhance(1.15); rgb = Image.blend(rgb, rgb.quantize(48).convert('RGB'), 0.35)
    body = rgb.convert('RGBA'); body.putalpha(a)
    edge = a.filter(ImageFilter.MaxFilter(5)); line = Image.new('RGBA', (S, S), (42, 28, 44, 0)); line.putalpha(edge.point(lambda v: 235 if v > 40 else 0))
    shadow = Image.new('RGBA', (S, S), (40, 20, 50, 0)); shadow.putalpha(edge.point(lambda v: 90 if v > 40 else 0).filter(ImageFilter.GaussianBlur(5)))
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    glow = (GLOW_DROP[min(s, 7)] if drop else GLOW_SOLD[min(s, 5)])
    if any(glow):
        g = Image.new('L', (S, S), 0); dr = ImageDraw.Draw(g); r = S * (0.30 + 0.03 * s); dr.ellipse((S / 2 - r, S / 2 - r, S / 2 + r, S / 2 + r), fill=150 if drop else 110)
        g = g.filter(ImageFilter.GaussianBlur(S * 0.09)); gl = Image.new('RGBA', (S, S), (*glow, 0)); gl.putalpha(g); out.alpha_composite(gl)
    sh = Image.new('RGBA', (S, S)); sh.paste(shadow, (5, 7)); out.alpha_composite(sh); out.alpha_composite(line); out.alpha_composite(body)
    return out.resize((size, size), Image.LANCZOS)

# ---------------------------------------------------------------- 실행
def clear():
    global PARTS; PARTS = []
    bpy.ops.wm.read_factory_settings(use_empty=True)
def items_of():
    I = {i['id']: i for i in json.load(open(os.path.join(ROOT, 'assets', 'data', 'items.json')))['items']}
    out = []
    for L in D.LINES:
        n = len(L['weapons'])
        for s in range(1, n + 1):
            id = 'wg_%s_%d' % (L['key'], s); out.append((L, s, n, id, bool(I.get(id, {}).get('dropFrom'))))
    return out
def main():
    want = [a for a in sys.argv[1:] if not a.startswith('-')]
    rows = {}
    for L, s, n, id, drop in items_of():
        if want and L['key'] not in want and id not in want: continue
        clear(); key = L['key']; C = COL[key]; sv = vstage(key, s, n)
        A = BUILD[L['kind']](key, C, sv); extras(key, C, sv, A, L['kind'])
        objs = finish(C['gem']); nt = tris(objs)
        size = export(objs, id) if os.environ.get('NOGLB') != '1' else 0
        tr = any(o.get('mat') == 'tripo' or 'orn' in ''.join(m.name for m in o.data.materials if m) for o in objs)
        print('%-12s s%d(v%d) %5d tris %4d KB%s' % (id, s, sv, nt, size // 1024, ' tripo' if tr else ''), flush=True)
        assert nt <= 3000, (id, nt)
        if os.environ.get('NOICON') != '1':
            ic = render(objs, 'icon', 256, 0.2 if L['kind'] in ('brush', 'instrument') else None); iconize(ic, sv, drop).save(os.path.join(ICONS, id + '.png'), optimize=True)
            v3 = render(objs, 'view', 256)
            rows.setdefault(key, []).append((Image.open(os.path.join(ICONS, id + '.png')), v3, L['weapons'][s - 1][0], drop))
    for key, r in rows.items(): sheet(key, r)
def sheet(key, r):
    W = 200; im = Image.new('RGB', (W * len(r), 2 * W + 24), (46, 44, 54)); dr = ImageDraw.Draw(im)
    for i, (ic, v3, name, drop) in enumerate(r):
        bg = Image.new('RGBA', (W, W), (70, 66, 82, 255) if not drop else (78, 60, 98, 255))
        bg.alpha_composite(ic.resize((W - 40, W - 40), Image.LANCZOS), (20, 20)); im.paste(bg.convert('RGB'), (i * W, 0))
        bg = Image.new('RGBA', (W, W), (205, 200, 196, 255)); bg.alpha_composite(v3.resize((W, W), Image.LANCZOS)); im.paste(bg.convert('RGB'), (i * W, W))
        dr.text((i * W + 6, 2 * W + 5), 's%d%s' % (i + 1, ' drop' if drop else ''), fill=(240, 230, 200))
    im.save(os.path.join(SHEET, 'sheet_%s_wpn.png' % key)); print('sheet', key, flush=True)

if __name__ == '__main__': main()
