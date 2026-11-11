"""약사 1차 새 스킬 이펙트 소품 + 스킬 아이콘 (Blender bpy, headless, 2026-11-11).

Usage:  python3 tools/blender/fx_pharm.py            (bpy module, Blender 5.x)
        python3 tools/blender/fx_pharm.py icons      (아이콘만 다시)

Tripo 초안(tools/tripo/pharm_assets.py)을 쓰려 했지만 2026-11-11 Tripo 잔액이 5 크레딧이라 작업을 만들 수 없었음
(text_to_model 요청이 "not enough credit"으로 거절). 그래서 모든 소품을 여기서 절차적으로 만든다. 크레딧이 생기면
pharm_assets.py로 Tripo 초안을 받아 같은 이름(pharm_pestle 등)으로 바꿔 끼울 수 있음(js/pharmfx.js가 이름으로 찾음).

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

# ------------------------------------------------------------------ healing circle texture (PIL, 1024 px RGBA)
def circle_png():
    S = 1024; c = S / 2; im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    G1, G2, W = (120, 255, 150), (60, 220, 120), (230, 255, 220)
    def ringl(r, w, col, a): d.ellipse((c - r, c - r, c + r, c + r), outline=col + (a,), width=w)
    ringl(500, 10, G1, 255); ringl(478, 4, W, 230); ringl(400, 6, G1, 240); ringl(388, 3, W, 200); ringl(190, 5, G1, 230)
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
        d.line(pts + [pts[0]], fill=G2 + (200,), width=5)
    # six leaf-cross medallions on the star points
    for k in range(6):
        a = -math.pi / 2 + 2 * math.pi * k / 6; x, y = c + math.cos(a) * 300, c + math.sin(a) * 300
        d.ellipse((x - 46, y - 46, x + 46, y + 46), outline=G1 + (235,), width=5)
        d.rectangle((x - 9, y - 30, x + 9, y + 30), fill=W + (235,)); d.rectangle((x - 30, y - 9, x + 30, y + 9), fill=W + (235,))
    # centre: big cross + small leaves
    d.rounded_rectangle((c - 34, c - 120, c + 34, c + 120), 14, fill=W + (245,)); d.rounded_rectangle((c - 120, c - 34, c + 120, c + 34), 14, fill=W + (245,))
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2; x, y = c + math.cos(a) * 130, c + math.sin(a) * 130
        d.ellipse((x - 26, y - 14, x + 26, y + 14), fill=G1 + (210,))
    glow = im.filter(ImageFilter.GaussianBlur(10)); out = Image.alpha_composite(glow, im)
    # soft inner fill (very faint) so the circle reads as a lit area
    fill = Image.new('RGBA', (S, S), (0, 0, 0, 0)); fd = ImageDraw.Draw(fill); fd.ellipse((c - 500, c - 500, c + 500, c + 500), fill=(80, 230, 130, 46))
    out = Image.alpha_composite(fill.filter(ImageFilter.GaussianBlur(30)), out)
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
    reset(); circle_png()
    obs = [new_obj('pharm_pestle', pestle), new_obj('pharm_flask', flask), new_obj('pharm_cork', cork), new_obj('pharm_syringe', syringe),
           new_obj('pharm_circle', disc, False), new_obj('pharm_ring', ring, False), new_obj('pharm_dome', dome)]
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(TMP, 'fx_pharm.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(OUT, 'fx_pharm.glb.json'), 'w'))
    try:
        bpy.ops.export_scene.fbx(filepath=os.path.join(SRC, 'fx_pharm.fbx'), use_selection=True, axis_forward='-Z', axis_up='Y',
                                 bake_space_transform=True, mesh_smooth_type='FACE', add_leaf_bones=False)
    except Exception as e: print('fbx export failed:', e)
    for i, o in enumerate(obs): o.location.x = i * 1.2
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_pharm.blend'), compress=True)
    print('tris', tris, 'total', sum(tris.values()), 'glb bytes', len(raw), flush=True)

if __name__ == '__main__':
    if 'icons' not in sys.argv[1:]: main()
    icons()
