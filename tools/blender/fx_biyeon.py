"""비연참 '비연파(飛燕破)' fan-of-crescents effect: meshes + baked texture atlas (Blender bpy, headless).

Usage:  python3 tools/blender/fx_biyeon.py        (bpy module, Blender 5.x; also `blender -b -P tools/blender/fx_biyeon.py`)

Parts (game axes: +Z = attack direction, +Y = up, metres):
  BI_slash   (pivot = the FRONT APEX of the crescent's outer edge; the blade lies behind it, so the apex is the cutting point)
    bi_crescent      flat crescent (unit outer radius 1, ARC deg, sharp tips); TILT > 0 adds a second copy tilted about
                     the chord axis (off by default)
  BI_ground
    bi_trail         unit strip along +Z (length 1, width 1, y = 0), u = 0 tail .. 1 head  -> thin ground-skimming trail
    bi_ring          unit quad lying flat (y = 0) on the ring cell                       -> faint wind-up ring at the feet
  BI_hit / shared
    bi_cross         unit quad facing +Z on the cross cell (camera-facing in the game)   -> 4-point cross flash on the hit
    bi_quad          unit quad facing +Z on the glow cell                                -> tip glow, swing flash, hit core
    bi_mote          unit quad facing +Z on the mote cell                                -> rising motes (instanced billboards)
    bi_shard         elongated diamond (2 crossed quads, length 1 along +Z)              -> hit shards (instanced)

Texture fx_biyeon.png (ATLAS px). The channels are MASKS, recoloured in js/biyeonfx.js:
  R = hot core (-> white #FFFFFF / pale #DDF8FF), G = body (-> sky #8BE8FF), B = halo (-> blue-violet #777BFF), A = coverage
  cell 0 crescent  u = along the arc (0 left tip .. 1 right tip), v = across (0 inner .. 1 outer edge): sharp white
                   outer edge, sky body fading to the inner side, faint wind streaks along u
  cell 1 trail     u = tail .. head, v = across: thin bright line, soft sides, tail breaks into streaks
  cell 2 glow      radial core + soft 4-point flare
  cell 3 shard     diamond with a bright centre line
  cell 4 cross     4-point cross (long horizontal / vertical spikes, short diagonals) + small round core
  cell 5 ring      thin soft ring with a faint dashed inner ring
  cell 6 mote      tiny soft sparkle
Outputs: assets/fx/fx_biyeon.glb.json (base64 GLB + "cells" table) + assets/fx/fx_biyeon.png;
         tools/blender/biyeon/fx_biyeon.blend / .fbx / .png (editable source)
"""
import os, sys, math, json, base64
import numpy as np
from PIL import Image
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import blib

# ------------------------------------------------------------------------------------------------ parameters
ATLAS = 1024
ARC = 112            # crescent opening (deg)
ARC_SEG = 28         # segments along the arc
THICK = 0.38         # crescent thickness in the middle (fraction of the outer radius); tips taper to a point
TILT = 0             # optional second layer tilted about the chord axis (deg); 0 = single flat layer (two layers read as
                     # stacked shells from the 44 deg camera, 2026-11-10)
SEED = 11

ROOT = os.path.join(HERE, '..', '..'); OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'biyeon'); TMP = os.path.join(HERE, 'out')
for d in (OUT, SRC, TMP): os.makedirs(d, exist_ok=True)

def V(x, y, z):
    """game axes (x right, y up, z forward) -> Blender (glTF export turns Blender -Y into +Z, Z into +Y)"""
    return (x, -z, y)

# cells (x0, y0, w, h) in atlas fractions, y from the bottom (Blender UV)
CELLS = {'crescent': (0.0, 0.0, 0.5, 0.5), 'trail': (0.5, 0.0, 0.5, 0.25), 'glow': (0.5, 0.25, 0.25, 0.25), 'shard': (0.75, 0.25, 0.25, 0.25),
         'cross': (0.0, 0.5, 0.5, 0.5), 'ring': (0.5, 0.5, 0.25, 0.25), 'mote': (0.75, 0.5, 0.25, 0.25)}
PAD = 3 / ATLAS
def cell_uv(c, u, v):
    ox, oy, w, h = CELLS[c]; return (ox + PAD + u * (w - 2 * PAD), oy + PAD + v * (h - 2 * PAD))

# ------------------------------------------------------------------------------------------------ texture
def atlas():
    rng = np.random.default_rng(SEED)
    img = np.zeros((ATLAS, ATLAS, 4), np.float32)
    ss = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))
    def grid(c):
        nx, ny = int(CELLS[c][2] * ATLAS), int(CELLS[c][3] * ATLAS)
        return np.meshgrid((np.arange(nx) + 0.5) / nx, (np.arange(ny) + 0.5) / ny)
    def put(c, U, Vv, R, Gc, B):
        e = np.clip(np.minimum(U, 1 - U) / 0.02, 0, 1) * np.clip(np.minimum(Vv, 1 - Vv) / 0.02, 0, 1)
        A = np.clip(np.maximum(np.maximum(R, Gc * 0.95), B * 0.8), 0, 1)
        ox, oy, w, h = (int(q * ATLAS) for q in CELLS[c])
        img[oy:oy + h, ox:ox + w] = np.stack([np.clip(R * e, 0, 1), np.clip(Gc * e, 0, 1), np.clip(B * e, 0, 1), A * e], -1)
    # crescent: v = 1 outer (cutting) edge, 0 inner. Sharp white edge line, sky body that thins out inwards, violet halo
    # just outside the edge; faint wind streaks along u; the ends of the arc (u -> 0 / 1) dissolve into streaks
    U, Vv = grid('crescent'); n = U.shape[1]
    streak = 0.6 + 0.4 * np.repeat(rng.random((U.shape[0], 1)), n, 1) ** 1.5
    ends = ss(0.0, 0.22, U) * ss(0.0, 0.22, 1 - U); endk = ends + (1 - ends) * streak * 0.6
    edge = np.exp(-((1 - Vv) / 0.09) ** 2) * (0.7 + 0.3 * ends)
    body = (Vv ** 1.1) * (0.35 + 0.65 * streak) * endk
    halo = np.exp(-((1 - Vv) / 0.35) ** 2) * 0.8 * endk
    put('crescent', U, Vv, edge * endk, np.clip(body + edge * 0.5, 0, 1), halo)
    # trail: thin bright core line, soft sky sides, tail (u < 0.5) breaks into streaks and fades
    U, Vv = grid('trail'); d = np.abs(Vv - 0.5) * 2
    lines = np.repeat(rng.random((U.shape[0], 1)), U.shape[1], 1)
    tail = ss(0.0, 0.7, U); brk = (0.35 + 0.65 * lines) * (1 - ss(0.3, 0.8, U)) + ss(0.3, 0.8, U)
    head = 1 - ss(0.94, 1.0, U)
    put('trail', U, Vv, np.exp(-(d / 0.12) ** 2) * tail ** 1.5 * head, np.exp(-(d / 0.45) ** 2) * tail * brk * head, np.exp(-(d / 0.9) ** 2) * (1 - d) * tail * brk * 0.6 * head)
    # glow: radial core + soft 4-point flare
    U, Vv = grid('glow'); X, Y = (U - 0.5) * 2, (Vv - 0.5) * 2; r = np.hypot(X, Y)
    flare = np.exp(-(np.abs(X) / 0.04) ** 2) * np.exp(-(np.abs(Y) / 0.8) ** 2) + np.exp(-(np.abs(Y) / 0.04) ** 2) * np.exp(-(np.abs(X) / 0.8) ** 2)
    put('glow', U, Vv, np.exp(-(r / 0.16) ** 2) + flare * 0.4, np.exp(-(r / 0.38) ** 2) * 0.85 + flare * 0.5, np.clip(np.exp(-(r / 0.65) ** 2) * (1 - r), 0, 1))
    # shard: diamond, bright centre line along u
    U, Vv = grid('shard'); X, Y = (U - 0.5) * 2, (Vv - 0.5) * 2; dm = np.abs(X) * 0.9 + np.abs(Y) * 1.9
    put('shard', U, Vv, np.exp(-(np.abs(Y) / 0.08) ** 2) * np.clip(1 - dm, 0, 1) * 1.4, np.clip(1 - dm, 0, 1) ** 0.7, np.clip(1.25 - dm, 0, 1) * 0.6)
    # cross: long horizontal + vertical spikes (tapering), shorter diagonals, round hot core, violet halo
    U, Vv = grid('cross'); X, Y = (U - 0.5) * 2, (Vv - 0.5) * 2; r = np.hypot(X, Y)
    def spike(a, L, w):
        al = X * math.cos(a) + Y * math.sin(a); pe = np.abs(-X * math.sin(a) + Y * math.cos(a)); t = np.clip(np.abs(al) / L, 0, 1)
        ww = w * (1 - t) ** 1.2 + 1e-4; return np.exp(-(pe / ww) ** 2) * (np.abs(al) < L) * (1 - t) ** 0.8, np.exp(-(pe / (ww * 0.4)) ** 2) * (np.abs(al) < L) * (1 - t) ** 1.6
    G1, R1 = spike(0, 0.98, 0.05); G2, R2 = spike(math.pi / 2, 0.80, 0.045); G3, R3 = spike(math.pi / 4, 0.42, 0.03); G4, R4 = spike(-math.pi / 4, 0.42, 0.03)
    core = np.exp(-(r / 0.13) ** 2)
    put('cross', U, Vv, np.clip(np.maximum.reduce([R1, R2, R3 * 0.8, R4 * 0.8]) + core, 0, 1), np.clip(np.maximum.reduce([G1, G2, G3, G4]) + core * 0.8, 0, 1),
        np.exp(-(r / 0.42) ** 2) * 0.55)
    # ring: thin soft ring at r = 0.82 + faint dashed inner ring at 0.6
    U, Vv = grid('ring'); X, Y = (U - 0.5) * 2, (Vv - 0.5) * 2; r = np.hypot(X, Y); th = np.arctan2(Y, X)
    ring = np.exp(-((r - 0.82) / 0.035) ** 2); inner = np.exp(-((r - 0.6) / 0.02) ** 2) * (0.5 + 0.5 * np.sign(np.sin(th * 12)))
    put('ring', U, Vv, ring * 0.6, np.clip(ring + inner * 0.5, 0, 1), np.exp(-((r - 0.78) / 0.16) ** 2) * 0.5 * (r < 1))
    # mote: tiny soft sparkle
    U, Vv = grid('mote'); X, Y = (U - 0.5) * 2, (Vv - 0.5) * 2; r = np.hypot(X, Y)
    sp = np.exp(-(np.abs(X) / 0.05) ** 2) * np.exp(-(np.abs(Y) / 0.6) ** 2) + np.exp(-(np.abs(Y) / 0.05) ** 2) * np.exp(-(np.abs(X) / 0.6) ** 2)
    put('mote', U, Vv, np.exp(-(r / 0.14) ** 2) + sp * 0.3, np.exp(-(r / 0.3) ** 2) * 0.9 + sp * 0.4, np.clip(np.exp(-(r / 0.55) ** 2) * (1 - r), 0, 1) * 0.6)
    a = (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
    im = Image.fromarray(a[::-1], 'RGBA')
    for p in (os.path.join(OUT, 'fx_biyeon.png'), os.path.join(SRC, 'fx_biyeon.png')): im.save(p, optimize=True)
    return os.path.join(SRC, 'fx_biyeon.png')

# ------------------------------------------------------------------------------------------------ meshes
def crescent(bm, uvl):
    """outer arc radius 1 around (0, 0, -1) -> apex of the outer edge at the origin. Inner edge = offset arc, thickness
    THICK * profile (0 at the tips). Layer 2 = the same crescent rotated TILT deg about the chord (x) axis through the arc
    centre, so its outer edge lifts."""
    half = math.radians(ARC) / 2
    for layer, tilt in enumerate((0.0,) + ((math.radians(TILT),) if TILT else ())):
        rows = []
        for i in range(ARC_SEG + 1):
            u = i / ARC_SEG; a = -half + u * 2 * half
            prof = math.sin(math.pi * u) ** 0.75; th = THICK * prof * (1.0 if layer == 0 else 0.8)
            ro, ri = 1.0, 1.0 - th - 0.002
            # inner edge sits a little behind (crescent moon shape): inner arc centre shifted back
            po = (math.sin(a) * ro, 0.0, math.cos(a) * ro - 1.0); pi_ = (math.sin(a) * ri, 0.0, math.cos(a) * ri - 1.0 - th * 0.35)
            def tl(p):
                y, z = p[1], p[2] + 1.0                                   # rotate about the x axis through the arc centre
                return (p[0], y * math.cos(tilt) + z * math.sin(tilt), -y * math.sin(tilt) + z * math.cos(tilt) - 1.0)
            rows.append((bm.verts.new(V(*tl(pi_))), bm.verts.new(V(*tl(po))), u))
        for i in range(ARC_SEG):
            a0, b0, u0 = rows[i]; a1, b1, u1 = rows[i + 1]
            f = bm.faces.new((a0, b0, b1, a1))
            for l, (uu, vv) in zip(f.loops, ((u0, 0), (u0, 1), (u1, 1), (u1, 0))): l[uvl].uv = cell_uv('crescent', uu, vv)

def quad(cell, flat=False):
    def f(bm, uvl):
        pts = ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5))
        vs = [bm.verts.new(V(x, 0, y) if flat else V(x, y, 0)) for x, y in pts]
        fc = bm.faces.new(vs)
        for l, (uu, vv) in zip(fc.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uvl].uv = cell_uv(cell, uu, vv)
    return f

def trail(bm, uvl):
    """unit strip on the ground: x across (-0.5..0.5), z along (0 tail .. 1 head), 4 segments"""
    rows = []
    for i in range(5):
        t = i / 4; rows.append((bm.verts.new(V(-0.5, 0, t)), bm.verts.new(V(0.5, 0, t)), t))
    for i in range(4):
        a0, b0, t0 = rows[i]; a1, b1, t1 = rows[i + 1]
        f = bm.faces.new((a0, b0, b1, a1))
        for l, (uu, vv) in zip(f.loops, ((t0, 0), (t0, 1), (t1, 1), (t1, 0))): l[uvl].uv = cell_uv('trail', uu, vv)

def shard(bm, uvl):
    for k in range(2):
        a = math.pi * k / 2; sx, sy = math.cos(a), math.sin(a); rows = []
        for i in range(5):
            t = i / 4; w = 0.36 * (1 - abs(t - 0.5) * 2) + 0.001; z = t - 0.5
            rows.append((bm.verts.new(V(-sx * w / 2, -sy * w / 2, z)), bm.verts.new(V(sx * w / 2, sy * w / 2, z)), t))
        for i in range(4):
            a0, b0, t0 = rows[i]; a1, b1, t1 = rows[i + 1]
            f = bm.faces.new((a0, b0, b1, a1))
            for l, (uu, vv) in zip(f.loops, ((t0, 0), (t0, 1), (t1, 1), (t1, 0))): l[uvl].uv = cell_uv('shard', uu, vv)

def make(name, fn, coll):
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); fn(bm, uvl)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(MAT); ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    return ob

def build():
    cols = {k: bpy.data.collections.new(k) for k in ('BI_slash', 'BI_ground', 'BI_hit')}
    for c in cols.values(): bpy.context.scene.collection.children.link(c)
    return [make('bi_crescent', crescent, cols['BI_slash']),
            make('bi_trail', trail, cols['BI_ground']), make('bi_ring', quad('ring', True), cols['BI_ground']),
            make('bi_cross', quad('cross'), cols['BI_hit']), make('bi_quad', quad('glow'), cols['BI_hit']),
            make('bi_mote', quad('mote'), cols['BI_hit']), make('bi_shard', shard, cols['BI_hit'])]

def preview_material(png):
    """Blender-only preview: emission from the atlas masks (white / sky / blue-violet), alpha blended. The game ignores it."""
    m = bpy.data.materials.new('M_biyeon'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links
    for n in list(N): N.remove(n)
    out = N.new('ShaderNodeOutputMaterial'); tex = N.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(png)
    sep = N.new('ShaderNodeSeparateColor')
    def rgb(c): n = N.new('ShaderNodeRGB'); n.outputs[0].default_value = (*c, 1); return n
    W, S, Vi = rgb((1.0, 1.0, 1.0)), rgb((0.26, 0.80, 1.0)), rgb((0.18, 0.20, 1.0))
    def mix(a, b, mode):
        n = N.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = mode; n.inputs['Factor'].default_value = 1
        Lk.new(a, n.inputs[6]); Lk.new(b, n.inputs[7]); return n.outputs[2]
    Lk.new(tex.outputs['Color'], sep.inputs[0])
    col = mix(mix(mix(sep.outputs[0], W.outputs[0], 'MULTIPLY'), mix(sep.outputs[1], S.outputs[0], 'MULTIPLY'), 'ADD'), mix(sep.outputs[2], Vi.outputs[0], 'MULTIPLY'), 'ADD')
    em = N.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 3.0; Lk.new(col, em.inputs['Color'])
    tr = N.new('ShaderNodeBsdfTransparent'); mx = N.new('ShaderNodeMixShader')
    Lk.new(tex.outputs['Alpha'], mx.inputs[0]); Lk.new(tr.outputs[0], mx.inputs[1]); Lk.new(em.outputs[0], mx.inputs[2]); Lk.new(mx.outputs[0], out.inputs['Surface'])
    try: m.surface_render_method = 'BLENDED'
    except Exception: pass
    m.use_backface_culling = False
    return m

def main():
    global MAT
    blib.reset(); png = atlas(); MAT = preview_material(png)
    obs = build()
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(TMP, 'fx_biyeon.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=False, export_animations=False)
    raw = open(glb, 'rb').read()
    cells = {}
    for name in CELLS:                                   # as the GAME samples them (glTF flips v): [u0, u1, v0, v1]
        u0, v0 = cell_uv(name, 0, 0); u1, v1 = cell_uv(name, 1, 1)
        cells[name] = [round(u0, 6), round(u1, 6), round(1 - v1, 6), round(1 - v0, 6)]
    json.dump({'b64': base64.b64encode(raw).decode(), 'cells': cells, 'tris': tris}, open(os.path.join(OUT, 'fx_biyeon.glb.json'), 'w'))
    try:
        bpy.ops.export_scene.fbx(filepath=os.path.join(SRC, 'fx_biyeon.fbx'), use_selection=True, axis_forward='-Z', axis_up='Y',
                                 bake_space_transform=True, mesh_smooth_type='FACE', add_leaf_bones=False)
    except Exception as e: print('fbx export failed:', e)
    for o, x in zip(obs, (0, 3, 5, 7, 9, 11, 13)): o.location.x = x
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_biyeon.blend'), compress=True)
    print('tris', tris, 'total', sum(tris.values()), 'glb bytes', len(raw))

main()
