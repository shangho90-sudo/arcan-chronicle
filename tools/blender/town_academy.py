"""카이리온 왕립 학술원 — Blender 절차 모델 (2026-11-12). Tripo 초안은 기둥이 녹은 것처럼 울퉁불퉁하고 줄이면 찢어져 보여서
손으로 다시 지음: 3단 기단 · 돌벽 본채 · 둘레 원기둥(주춧돌·기둥머리) · 처마(금테) · 박공 지붕(파란 기와) · 원통 받침 + 파란 돔 + 금 첨탑 · 문·창.
재질마다 반복 텍스처(512 px, PIL로 그림) + 미터 단위 상자 투영 UV라 가까이서도 무늬가 또렷함. 그늘은 정점 색.
→ assets/town3d/town_kairion_academy.glb.json + town_manifest.json (규격은 town_assets.py와 같음: 바닥 z=0, 가로 중심 원점, 가장 긴 가로 변 1, 앞면 -Y)
Usage: python3 tools/blender/town_academy.py      (town_assets.py는 PROCEDURAL 목록의 모델을 건너뜀)"""
import base64, json, math, os, random, tempfile
import bpy, bmesh
from mathutils import Vector, Matrix
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, '..', '..', 'assets', 'town3d'); MAN = os.path.join(OUT, 'town_manifest.json')
NAME = 'kairion_academy'; TD = tempfile.mkdtemp(); R = random.Random(7)

# ---------------------------------------------------------------- textures (tileable)
def noise(im, amt, blur=1.2, seed=1):
    r = random.Random(seed); n = Image.new('L', im.size); n.putdata([r.randint(0, 255) for _ in range(im.size[0] * im.size[1])])
    n = n.resize((im.size[0] // 4, im.size[1] // 4)).resize(im.size, Image.BICUBIC).filter(ImageFilter.GaussianBlur(blur))
    return Image.composite(Image.eval(im, lambda v: min(255, int(v * (1 + amt)))), Image.eval(im, lambda v: int(v * (1 - amt))), n)
def blocks(base, line, cols, rows, seed, vary=10, S=512):
    im = Image.new('RGB', (S, S), base); d = ImageDraw.Draw(im); r = random.Random(seed); bw, bh = S / cols, S / rows
    for j in range(rows):
        off = (j % 2) * bw / 2
        for i in range(-1, cols + 1):
            k = r.randint(-vary, vary); c = tuple(max(0, min(255, v + k)) for v in base)
            d.rectangle([i * bw + off, j * bh, (i + 1) * bw + off, (j + 1) * bh], fill=c)
            if i == cols: pass
        # 줄눈
    for j in range(rows):
        off = (j % 2) * bw / 2; y = j * bh
        d.line([0, y, S, y], fill=line, width=3); d.line([0, y + 3, S, y + 3], fill=tuple(min(255, v + 14) for v in base), width=2)
        for i in range(cols + 1): x = (i * bw + off) % S; d.line([x, y, x, y + bh], fill=line, width=3)
    return noise(im.filter(ImageFilter.GaussianBlur(0.7)), 0.05, seed=seed)
def flutes(base, n, S=512):
    im = Image.new('RGB', (S, 64)); px = im.load()
    for x in range(S):
        t = (x * n / S) % 1.0; k = 0.86 + 0.16 * math.sin(t * math.pi) ** 0.7
        for y in range(64): px[x, y] = tuple(min(255, int(v * k)) for v in base)
    return im.resize((S, S))
def slate(S=512, rows=8, cols=8):
    im = Image.new('RGB', (S, S), (40, 74, 150)); d = ImageDraw.Draw(im); r = random.Random(3); bw, bh = S / cols, S / rows
    for j in range(rows - 1, -2, -1):                      # 아래 줄부터 겹쳐 그림 (v 위쪽 = 지붕 위쪽)
        off = (j % 2) * bw / 2
        for i in range(-1, cols + 1):
            k = r.randint(-14, 14); c = (56 + k, 100 + k, 186 + k)
            x0, y0 = i * bw + off, j * bh
            d.rounded_rectangle([x0 + 1, y0 - bh * 0.25, x0 + bw - 1, y0 + bh], radius=bw * 0.28, fill=c, outline=(30, 58, 124), width=3)
            d.line([x0 + bw * 0.25, y0 + bh * 0.2, x0 + bw * 0.75, y0 + bh * 0.2], fill=(96, 140, 220), width=2)
    return noise(im.filter(ImageFilter.GaussianBlur(0.6)), 0.05, seed=5)
def gold(S=256):
    im = Image.new('RGB', (S, S), (232, 182, 72)); d = ImageDraw.Draw(im)
    for y in range(0, S, 32): d.line([0, y, S, y], fill=(250, 214, 110), width=6); d.line([0, y + 16, S, y + 16], fill=(196, 142, 48), width=3)
    return noise(im.filter(ImageFilter.GaussianBlur(1.5)), 0.06, seed=9)
def door(S=512):
    im = Image.new('RGB', (S, S), (112, 70, 40)); d = ImageDraw.Draw(im); r = random.Random(11)
    for i in range(6): k = r.randint(-10, 10); d.rectangle([i * S / 6, 0, (i + 1) * S / 6, S], fill=(118 + k, 74 + k, 42 + k)); d.line([i * S / 6, 0, i * S / 6, S], fill=(70, 42, 24), width=4)
    d.line([S / 2, 0, S / 2, S], fill=(48, 28, 16), width=8)
    for y in (S * 0.22, S * 0.72): d.rectangle([0, y, S, y + S * 0.06], fill=(214, 168, 70), outline=(150, 110, 40), width=3)
    for x in (S * 0.42, S * 0.58): d.ellipse([x - 14, S * 0.5 - 14, x + 14, S * 0.5 + 14], fill=(236, 196, 90), outline=(150, 110, 40), width=3)
    return noise(im.filter(ImageFilter.GaussianBlur(0.6)), 0.05, seed=12)
def window(S=256):
    im = Image.new('RGB', (S, S)); px = im.load()
    for y in range(S):
        for x in range(S): t = (x + (S - y)) / (2 * S); px[x, y] = (int(40 + 70 * t), int(96 + 90 * t), int(190 + 60 * t))
    d = ImageDraw.Draw(im)
    for x in (S / 2,): d.line([x, 0, x, S], fill=(226, 184, 84), width=10)
    for y in (S * 0.33, S * 0.66): d.line([0, y, S, y], fill=(226, 184, 84), width=8)
    d.rectangle([0, 0, S - 1, S - 1], outline=(226, 184, 84), width=14)
    d.polygon([(S * 0.12, S * 0.6), (S * 0.3, S * 0.6), (S * 0.5, S * 0.12), (S * 0.32, S * 0.12)], fill=(150, 200, 250))
    return im.filter(ImageFilter.GaussianBlur(0.8))
TEXS = {'marble': (blocks((230, 224, 210), (176, 166, 150), 2, 4, 1), 2.0), 'step': (blocks((204, 198, 186), (150, 142, 130), 2, 2, 2, 8), 2.4),
        'column': (flutes((238, 233, 222), 14), 1.0), 'plain': (noise(Image.new('RGB', (256, 256), (236, 230, 218)), 0.045, seed=4), 2.0),
        'slate': (slate(), 2.6), 'gold': (gold(), 1.2), 'door': (door(), 1.0), 'window': (window(), 1.0)}
MATS = {}
def mat(key):
    if key in MATS: return MATS[key]
    p = os.path.join(TD, 'acad_' + key + '.png'); TEXS[key][0].save(p)
    m = bpy.data.materials.new('M_acad_' + key); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(p); nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Metallic'].default_value = 0.0; b.inputs['Roughness'].default_value = 0.85
    MATS[key] = m; return m

# ---------------------------------------------------------------- geometry helpers
PARTS = []
def finish(bm, key, uv='box', shade=1.0, fit=None, smooth=False, grad=None):
    """uv: 'box' = 미터 단위 상자 투영(반복), 'cyl' = 둘레 u·높이 v, 'fit' = 앞면(-Y)에 0..1로 맞춤. shade = 정점 색 곱, grad=(z0,z1,k0,k1) 높이 그라데이션"""
    me = bpy.data.meshes.new(key); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    L = bm.loops.layers.uv.new('UVMap'); C = bm.loops.layers.color.new('Col'); s = TEXS[key][1]
    xs = [v.co.x for v in bm.verts]; zs = [v.co.z for v in bm.verts]; x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
    cx = (x0 + x1) / 2; cy = sum(v.co.y for v in bm.verts) / len(bm.verts)
    for f in bm.faces:
        n = f.normal; f.smooth = smooth
        for l in f.loops:
            p = l.vert.co
            if uv == 'fit': l[L].uv = ((p.x - x0) / (x1 - x0), (p.z - z0) / (z1 - z0))
            elif uv == 'cyl':
                a = math.atan2(p.y - cy, p.x - cx) / (2 * math.pi)
                if a < 0 and any(math.atan2(q.vert.co.y - cy, q.vert.co.x - cx) > 2.0 for q in f.loops): a += 1.0      # 이음매 면
                l[L].uv = (a * fit if fit else a, p.z / s)
            elif abs(n.z) > 0.72: l[L].uv = (p.x / s, p.y / s)
            elif abs(n.y) >= abs(n.x): l[L].uv = (p.x / s, (p.z if abs(n.z) < 0.2 else math.hypot(p.z, p.y)) / s)
            else: l[L].uv = (p.y / s, (p.z if abs(n.z) < 0.2 else math.hypot(p.z, p.x)) / s)
            k = shade * ((grad[2] + (grad[3] - grad[2]) * max(0, min(1, (p.z - grad[0]) / (grad[1] - grad[0])))) if grad else 1.0)
            if n.z < -0.5: k *= 0.7                       # 아랫면
            l[C] = (k, k, k, 1.0)
    bm.to_mesh(me); bm.free(); me.materials.append(mat(key)); PARTS.append(me)
def box(key, cx, cy, z0, w, d, h, **kw):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts); bmesh.ops.translate(bm, vec=(cx, cy, z0 + h / 2), verts=bm.verts); finish(bm, key, **kw)
def cyl(key, cx, cy, z0, r0, r1, h, seg=16, rings=1, cap=True, **kw):
    bm = bmesh.new(); prev = None
    for j in range(rings + 1):
        t = j / rings; r = r0 + (r1 - r0) * t; ring = [bm.verts.new((cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg), z0 + h * t)) for i in range(seg)]
        if prev:
            for i in range(seg): bm.faces.new((prev[i], prev[(i + 1) % seg], ring[(i + 1) % seg], ring[i]))
        elif cap: bm.faces.new(list(reversed(ring)))
        prev = ring
    if cap: bm.faces.new(prev)
    finish(bm, key, **kw)
def dome(key, cx, cy, z0, r, hz, seg=24, rings=8, **kw):
    bm = bmesh.new(); prev = None
    for j in range(rings):
        a = (math.pi / 2) * j / rings; rr = r * math.cos(a); z = z0 + hz * math.sin(a)
        ring = [bm.verts.new((cx + rr * math.cos(2 * math.pi * i / seg), cy + rr * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)]
        if prev:
            for i in range(seg): bm.faces.new((prev[i], prev[(i + 1) % seg], ring[(i + 1) % seg], ring[i]))
        prev = ring
    top = bm.verts.new((cx, cy, z0 + hz))
    for i in range(seg): bm.faces.new((prev[i], prev[(i + 1) % seg], top))
    finish(bm, key, **kw)
def gable(key_roof, key_wall, w, d, z0, h, over=0.5):
    """용마루가 y 방향인 박공 지붕: 경사면 2장(기와) + 앞뒤 삼각 박공벽(돌)"""
    bm = bmesh.new(); hw, hd = w / 2 + over, d / 2 + over
    a, b, c = bm.verts.new((-hw, -hd, z0)), bm.verts.new((0, -hd, z0 + h)), bm.verts.new((hw, -hd, z0))
    a2, b2, c2 = bm.verts.new((-hw, hd, z0)), bm.verts.new((0, hd, z0 + h)), bm.verts.new((hw, hd, z0))
    bm.faces.new((a, b, b2, a2)); bm.faces.new((b, c, c2, b2)); bm.faces.new((a, a2, c2, c)); finish(bm, key_roof)
    for y, sgn in ((-d / 2, 1), (d / 2, -1)):
        bm = bmesh.new(); hw2 = w / 2; k = hw2 / hw
        vs = [bm.verts.new((-hw2, y, z0)), bm.verts.new((hw2, y, z0)), bm.verts.new((0, y, z0 + h * k))]
        bm.faces.new(vs if sgn > 0 else vs[::-1]); finish(bm, key_wall, shade=0.94)

# ---------------------------------------------------------------- the academy (m; 가로 16.2 × 깊이 17, 앞면 -Y)
def build():
    for i, (w, d) in enumerate(((16.2, 17.0), (15.4, 16.2), (14.6, 15.4))): box('step', 0, 0, i * 0.3, w, d, 0.3, shade=0.96 + i * 0.02)
    ZP = 0.9; CW, CD, CY, CH = 10.2, 10.8, 0.5, 6.5                                         # 본채
    box('marble', 0, CY, ZP, CW, CD, CH, shade=0.9, grad=(ZP, ZP + CH, 0.86, 1.0))
    box('plain', 0, CY, ZP, CW + 0.3, CD + 0.3, 0.7, shade=0.9)                              # 굽도리
    PX, PY = 6.4, 6.8; cols = [(x, s * PY) for s in (-1, 1) for x in [-PX + i * (2 * PX / 5) for i in range(6)]] + [(s * PX, -PY + j * (2 * PY / 6)) for s in (-1, 1) for j in range(1, 6)]
    for x, y in cols:
        box('plain', x, y, ZP, 1.16, 1.16, 0.28); cyl('plain', x, y, ZP + 0.28, 0.56, 0.5, 0.2, seg=14, smooth=True)
        cyl('column', x, y, ZP + 0.48, 0.44, 0.38, 5.42, seg=14, rings=4, cap=False, smooth=True, fit=1.0, grad=(ZP + 0.48, ZP + 5.9, 0.9, 1.0))
        cyl('plain', x, y, ZP + 5.9, 0.4, 0.56, 0.24, seg=14, smooth=True); box('plain', x, y, ZP + 6.14, 1.16, 1.16, 0.36)
    ZE = ZP + CH                                                                             # 처마 (기둥 위)
    box('plain', 0, 0, ZE, 14.2, 15.0, 0.5, shade=0.97); box('marble', 0, 0, ZE + 0.5, 14.0, 14.8, 0.6); box('gold', 0, 0, ZE + 1.1, 14.6, 15.4, 0.26)
    ZR = ZE + 1.36; gable('slate', 'plain', 14.2, 15.0, ZR, 2.7)
    for y in (-7.52, 7.52): cyl('gold', 0, y, ZR + 0.55, 0.0, 0.0, 0.0) if False else None
    for sgn in (-1, 1):                                                                      # 박공 금 문장 (y축 원판)
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.75, radius2=0.75, depth=0.14)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X')); bmesh.ops.translate(bm, verts=bm.verts, vec=(0, sgn * 7.56, ZR + 1.0)); finish(bm, 'gold')
    cyl('marble', 0, 0, ZR, 3.3, 3.3, 3.6, seg=24, smooth=True, grad=(ZR, ZR + 3.6, 0.88, 1.0)); cyl('gold', 0, 0, ZR + 3.6, 3.5, 3.5, 0.3, seg=24, smooth=True)
    for i in range(8):                                                                       # 원통 창
        a = math.pi / 8 + i * math.pi / 4; bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.scale(bm, vec=(0.8, 0.16, 1.5), verts=bm.verts)
        bmesh.ops.translate(bm, vec=(0, -3.3, 0), verts=bm.verts); bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(a, 3, 'Z')); bmesh.ops.translate(bm, vec=(0, 0, ZR + 2.5), verts=bm.verts)
        me_uv_fix.append(len(PARTS)); finish(bm, 'window', uv='fit')
    dome('slate', 0, 0, ZR + 3.9, 3.3, 3.5, smooth=True, grad=(ZR + 3.9, ZR + 7.4, 0.92, 1.06))
    ZT = ZR + 7.35; cyl('gold', 0, 0, ZT, 0.55, 0.45, 0.7, seg=12, smooth=True); cyl('gold', 0, 0, ZT + 0.7, 0.8, 0.8, 0.14, seg=12); cyl('gold', 0, 0, ZT + 0.84, 0.34, 0.03, 2.3, seg=10, smooth=True)
    dome('gold', 0, 0, ZT + 3.0, 0.24, 0.24, seg=10, rings=4, smooth=True)
    FY = CY - CD / 2                                                                         # 앞면: 문 + 창
    box('gold', 0, FY - 0.1, ZP, 3.0, 0.3, 4.5); box('door', 0, FY - 0.2, ZP, 2.5, 0.3, 4.2, uv='fit')
    for x in (-3.5, 3.5): box('gold', x, FY - 0.06, ZP + 1.5, 1.5, 0.2, 3.0); box('window', x, FY - 0.12, ZP + 1.65, 1.2, 0.2, 2.7, uv='fit')
    for s in (-1, 1):                                                                        # 옆면·뒷면 창
        for j in range(3):
            y = CY - 3.4 + j * 3.4; bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.scale(bm, vec=(1.2, 0.2, 2.7), verts=bm.verts)
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Z')); bmesh.ops.translate(bm, vec=(s * (CW / 2 + 0.06), y, ZP + 3.0), verts=bm.verts); side_fit.append(len(PARTS)); finish(bm, 'window', uv='fit')
    for x in (-2.6, 2.6):                                                                    # 앞 계단 양옆 받침 + 금 화로
        box('plain', x * 2.2, -8.0, 0, 1.3, 1.3, 1.5); cyl('gold', x * 2.2, -8.0, 1.5, 0.3, 0.62, 0.5, seg=12, smooth=True)
me_uv_fix, side_fit = [], []

def refit(me, axis):          # 'fit' UV를 그 면의 가로축(로컬) 기준으로 다시: 돌려 놓은 창
    import numpy as np
    uvl = me.uv_layers[0].data; vs = me.vertices
    zs = [v.co.z for v in vs]; z0, z1 = min(zs), max(zs); c = sum((v.co for v in vs), Vector()) / len(vs)
    t = Vector((-c.y, c.x, 0)).normalized() if axis == 'radial' else Vector((0, 1, 0))
    us = [(v.co - c).dot(t) for v in vs]; u0, u1 = min(us), max(us)
    for l in me.loops: p = vs[l.vertex_index].co; uvl[l.index].uv = (((p - c).dot(t) - u0) / (u1 - u0), (p.z - z0) / (z1 - z0))

if __name__ == '__main__':
    bpy.ops.wm.read_factory_settings(use_empty=True); build()
    for i in me_uv_fix: refit(PARTS[i], 'radial')
    for i in side_fit: refit(PARTS[i], 'y')
    obs = []
    for me in PARTS: o = bpy.data.objects.new(me.name, me); bpy.context.scene.collection.objects.link(o); obs.append(o)
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]; bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active
    vs = [v.co for v in ob.data.vertices]; lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))); hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    k = 1.0 / max(hi.x - lo.x, hi.y - lo.y); ob.data.transform(Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))); ob.data.transform(Matrix.Scale(k, 4))
    size = [round((hi.x - lo.x) * k, 4), round((hi.y - lo.y) * k, 4), round((hi.z - lo.z) * k, 4)]
    ob.data.calc_loop_triangles(); tris = len(ob.data.loop_triangles); glb = os.path.join(TD, NAME + '.glb')
    kw = dict(filepath=glb, export_format='GLB', export_image_format='JPEG', export_animations=False, export_yup=True, export_apply=True, export_normals=True, export_tangents=False, export_materials='EXPORT')
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', export_jpeg_quality=82, **kw)
    except TypeError: bpy.ops.export_scene.gltf(**kw)
    raw = open(glb, 'rb').read(); json.dump({'b64': base64.b64encode(raw).decode(), 'size': size, 'tris': tris}, open(os.path.join(OUT, 'town_' + NAME + '.glb.json'), 'w'))
    man = json.load(open(MAN)); man['town_' + NAME] = size; json.dump(man, open(MAN, 'w'), indent=0, sort_keys=True)
    if os.environ.get('KEEP'): import shutil; shutil.copy(glb, os.environ['KEEP'])
    print(NAME, tris, 'tris', len(raw) // 1024, 'KB', size)
