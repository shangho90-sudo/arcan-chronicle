"""견습생 '연(連)' combo-slash effect: crescent / straight / cross slash meshes + baked mask atlas (Blender bpy, headless).

Usage:  python3 tools/blender/fx_yeon.py        (bpy module, Blender 5.x; also `blender -b -P tools/blender/fx_yeon.py`)

Parts (game axes: +Z = attack direction, +Y = up, +X = the attacker's side; metres, unit sizes — the runtime scales them):
  YEON_slash  (pivot = the swing centre at chest height; arcs lie in the XZ plane, the runtime rolls them per strike)
    yeon_crescent    crescent A: ~165 deg arc, outer radius 1, thick in the middle and tapered to points, the thickest
                     part LATE in the swing (asymmetric), inner edge dips a little (a curved blade sheet, not a flat disc)
    yeon_crescent_b  crescent B: ~150 deg, thickest EARLY — alternated with A so consecutive strikes do not look stamped
    yeon_ghost       thin afterimage arc (2-3 copies lag behind the main crescent)
    yeon_finisher    big finisher arc: ~205 deg, much wider, double edge (outer blade + inner ribbon)
  YEON_hit    (pivot = the impact point; flat in XY facing +Z: the runtime turns them to the camera)
    yeon_straight    short straight slash (cut line through the target), tapered both ends
    yeon_cross       two straight slashes crossed (finisher)
    yeon_flash       radial hit flash (small white core + short sharp rays)            cell flash
    yeon_burst       finisher burst (many long rays + shock ring)                          cell burst
    yeon_glow        soft round glow (sword-tip spark / afterglow)                         cell glow
    yeon_spark       small 4-point star                                                    cell spark
  YEON_shared
    yeon_shard       elongated diamond (2 crossed quads, length 1 along +Z) -> instanced fragments

Texture: fx_yeon.png (ATLAS px RGBA). Channels are MASKS, recoloured at runtime (js/yeonfx.js):
  R = hot core (-> white #FFFFFF), G = body (-> sky #78DFFF / blue-violet #8A65FF / pink #FF8BD8 per strike), B = halo, A = coverage
  cells (x0, y0, w, h; Blender UV, y from the bottom): see CELLS. Crescent cells: u = along the swing (0 start .. 1 end),
  v = across (0 inner edge .. 1 outer = cutting edge). The runtime wipes along u (the slash "draws" in the swing direction).
The patterns are procedural (numpy) and written as a plain PNG.

Outputs:
  assets/fx/fx_yeon.glb.json   meshes (base64 GLB, no images; "cells" = atlas cells in game UV space for the shader)
  assets/fx/fx_yeon.png        atlas
  tools/blender/yeon/fx_yeon.blend / .fbx / .png   editable source + other-engine copy
"""
import os, sys, math, json, base64
import numpy as np
from PIL import Image
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import blib

# ------------------------------------------------------------------------------------------------ parameters
ATLAS = 1024
ARC_SEG = 28                # segments along a crescent
CRES_A = dict(a0=88, a1=-78, w=0.42, peak=0.62, dip=0.12)    # degrees from +Z towards +X (start on the +X side), width, thickest point
CRES_B = dict(a0=80, a1=-70, w=0.36, peak=0.38, dip=0.10)
GHOST = dict(a0=84, a1=-74, w=0.14, peak=0.55, dip=0.04)
FINISH = dict(a0=108, a1=-98, w=0.56, peak=0.58, dip=0.18)
STRAIGHT_W = 0.16           # straight slash width (length 1)
CROSS_ANG = 38              # half angle between the two cross strokes (deg)
FLASH_RAYS = 18             # short sharp rays in the hit flash
BURST_RAYS = 44             # long rays in the finisher burst
SEED = 11

ROOT = os.path.join(HERE, '..', '..'); OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'yeon'); TMP = os.path.join(HERE, 'out')
for d in (OUT, SRC, TMP): os.makedirs(d, exist_ok=True)

def V(x, y, z):
    """game axes (x, y up, z forward) -> Blender (glTF export turns Blender -Y into +Z, Z into +Y)"""
    return (x, -z, y)

# 0 crescent, 1 ghost, 2 straight, 3 shard, 4 glow, 5 spark, 6 flash, 7 burst
CELLS = [(0.0, 0.0, 1.0, 0.25), (0.0, 0.25, 1.0, 0.125), (0.0, 0.375, 0.5, 0.125), (0.5, 0.375, 0.25, 0.125),
         (0.75, 0.375, 0.125, 0.125), (0.875, 0.375, 0.125, 0.125), (0.0, 0.5, 0.5, 0.5), (0.5, 0.5, 0.5, 0.5)]
NAMES = ['crescent', 'ghost', 'straight', 'shard', 'glow', 'spark', 'flash', 'burst']
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
    def put(c, R, Gc, B, edge=0.02):
        U, Vv = grid(c)
        e = np.clip(np.minimum(U, 1 - U) / edge, 0, 1) * np.clip(np.minimum(Vv, 1 - Vv) / edge, 0, 1)
        A = np.clip(np.maximum(np.maximum(R, Gc * 0.95), B * 0.8), 0, 1)
        ox, oy, w, h = (int(q * ATLAS) for q in CELLS[c])
        img[oy:oy + h, ox:ox + w] = np.stack([np.clip(R * e, 0, 1), np.clip(Gc * e, 0, 1), np.clip(B * e, 0, 1), A * e], -1)
    # crescent: cutting edge at v = 1 (sharp), hot white core hugging it, coloured body fading to the inner edge, speed
    # streaks along u; the trailing end (u < 0.25) breaks into streaks, the leading end stays solid
    U, Vv = grid(0); ny = U.shape[0]
    lines = np.repeat(rng.random((ny, 1)), U.shape[1], 1); lines2 = np.repeat(rng.random((ny, 1)), U.shape[1], 1)
    edge = 1 - ss(0.965, 1.0, Vv)
    core = np.exp(-((Vv - 0.88) / 0.055) ** 2) * edge
    body = ss(0.0, 0.75, Vv) ** 1.4 * edge
    trail = ss(0.0, 0.3, U); streak = (0.35 + 0.65 * lines) * (1 - trail) + trail
    streak *= 0.8 + 0.2 * np.sin(Vv * 90 + lines2 * 6) ** 2
    lead = 0.75 + 0.25 * ss(0.3, 1.0, U)
    put(0, core * streak * lead, body * streak * lead, np.clip(ss(0.0, 1.0, Vv) * 0.6 + (1 - Vv) * 0.15, 0, 1) * edge * streak * 0.7, edge=0.01)
    # ghost: thin soft band, centre a bit brighter, broken streaks
    U, Vv = grid(1); ny = U.shape[0]; d = np.abs(Vv - 0.6) / 0.6
    lines = np.repeat(rng.random((ny, 1)), U.shape[1], 1)
    st = (0.4 + 0.6 * lines ** 0.6) * (0.5 + 0.5 * ss(0.0, 0.5, U))
    put(1, np.exp(-(d / 0.18) ** 2) * st * 0.6, np.exp(-(d / 0.55) ** 2) * st, np.exp(-(d / 0.95) ** 2) * st * 0.5)
    # straight cut: needle tapered at both ends, white heart, coloured body, halo
    U, Vv = grid(2); d = np.abs(Vv - 0.5) * 2; along = np.sin(np.pi * U) ** 0.7
    wk = np.maximum(0.05, along)
    put(2, np.exp(-(d / (0.14 * wk)) ** 2) * along, np.exp(-(d / (0.42 * wk)) ** 2) * along, np.exp(-(d / 0.9) ** 2) * along * 0.5)
    # shard: diamond with a bright spine
    U, Vv = grid(3); X, Y = (U - 0.5) * 2, (Vv - 0.5) * 2; dm = np.abs(X) * 0.9 + np.abs(Y) * 1.9
    put(3, np.exp(-(np.abs(Y) / 0.08) ** 2) * np.clip(1 - dm, 0, 1) * 1.4, np.clip(1 - dm, 0, 1) ** 0.7, np.clip(1.25 - dm, 0, 1) * 0.6)
    # glow
    U, Vv = grid(4); r = np.hypot((U - 0.5) * 2, (Vv - 0.5) * 2)
    put(4, np.exp(-(r / 0.18) ** 2), np.exp(-(r / 0.42) ** 2), np.clip(np.exp(-(r / 0.7) ** 2) * (1 - r), 0, 1))
    # spark: 4-point star
    U, Vv = grid(5); X, Y = (U - 0.5) * 2, (Vv - 0.5) * 2; r = np.hypot(X, Y)
    fl = np.exp(-(np.abs(X) / 0.05) ** 2) * np.clip(1 - np.abs(Y), 0, 1) ** 2 + np.exp(-(np.abs(Y) / 0.05) ** 2) * np.clip(1 - np.abs(X), 0, 1) ** 2
    put(5, np.clip(fl + np.exp(-(r / 0.12) ** 2), 0, 1), np.clip(fl * 0.8 + np.exp(-(r / 0.3) ** 2) * 0.6, 0, 1), np.clip(np.exp(-(r / 0.6) ** 2) * (1 - r), 0, 1) * 0.5)
    # flash: small white core + FLASH_RAYS short sharp rays of unequal length / width + thin coloured rim
    def rays(c, n, lmin, lmax, wmin, wmax, coreR, ring=0.0):
        U, Vv = grid(c); X, Y = (U - 0.5) * 2, (Vv - 0.5) * 2; r = np.hypot(X, Y); th = np.arctan2(Y, X)
        Rg = np.zeros_like(r); Gg = np.zeros_like(r)
        for k in range(n):
            a = 2 * np.pi * k / n + rng.uniform(-0.6, 0.6) * np.pi / n
            L = rng.uniform(lmin, lmax) if k % 3 else lmax * rng.uniform(0.9, 1.0); w = rng.uniform(wmin, wmax)
            dth = np.angle(np.exp(1j * (th - a))); along = r * np.cos(dth); perp = np.abs(r * np.sin(dth))
            t = np.clip(along / L, 0, 1); ww = w * (1 - t) ** 1.1 + 1e-4
            inside = (along > 0) & (along < L)
            Gg = np.maximum(Gg, np.exp(-(perp / ww) ** 2) * inside * (0.4 + 0.6 * (1 - t) ** 0.6))
            Rg = np.maximum(Rg, np.exp(-(perp / (ww * 0.4)) ** 2) * inside * (1 - t) ** 1.6)
        core = np.exp(-(r / coreR) ** 2)
        rg = np.exp(-((r - ring) / 0.035) ** 2) * 0.8 if ring else 0
        put(c, np.clip(Rg + core, 0, 1), np.clip(Gg + core * 0.7 + rg, 0, 1), np.clip(np.exp(-(r / 0.55) ** 2) * 0.35 + rg * 0.6, 0, 1))
    rays(6, FLASH_RAYS, 0.35, 0.92, 0.025, 0.06, 0.14)
    rays(7, BURST_RAYS, 0.3, 0.97, 0.008, 0.03, 0.11, ring=0.62)
    a = (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
    im = Image.fromarray(a[::-1], 'RGBA')
    for p in (os.path.join(OUT, 'fx_yeon.png'), os.path.join(SRC, 'fx_yeon.png')): im.save(p, optimize=True)
    return os.path.join(SRC, 'fx_yeon.png')

# ------------------------------------------------------------------------------------------------ meshes
def arc(bm, uvl, a0, a1, w, peak, dip, cell=0, r_out=1.0, wobble=0.03, phase=0.0):
    """crescent: outer edge = blade path (radius r_out, a little wobble), inner edge r_out - width(t); width = 0 at both ends,
    maximum at t = peak (asymmetric). The inner edge dips (-y) so the sheet is a shallow cone, readable from the camera."""
    k = math.log(0.5) / math.log(peak)                         # sin(pi * t^k) peaks at t = peak
    rows = []
    for i in range(ARC_SEG + 1):
        t = i / ARC_SEG; a = math.radians(a0 + (a1 - a0) * t)
        wt = w * math.sin(math.pi * t ** k) ** 0.85
        ro = r_out * (1 + wobble * math.sin(t * 7.0 + phase)); ri = ro - wt
        o = (math.sin(a) * ro, 0, math.cos(a) * ro); n = (math.sin(a) * ri, -dip * wt / max(w, 1e-3), math.cos(a) * ri)
        rows.append((bm.verts.new(V(*n)), bm.verts.new(V(*o)), t))
    for i in range(ARC_SEG):
        a0_, b0, t0 = rows[i]; a1_, b1, t1 = rows[i + 1]
        f = bm.faces.new((a0_, b0, b1, a1_))
        for l, (uu, vv) in zip(f.loops, ((t0, 0), (t0, 1), (t1, 1), (t1, 0))): l[uvl].uv = cell_uv(cell, uu, vv)

def strip(bm, uvl, ang, length, width, cell, seg=8):
    """flat straight stroke in the XY plane (faces +Z), centred, along angle `ang` (deg from +X); thick middle"""
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang)); rows = []
    for i in range(seg + 1):
        t = i / seg; x = (t - 0.5) * length; hw = width / 2 * (0.15 + 0.85 * math.sin(math.pi * t) ** 0.6)
        p = (x * ca, x * sa); n = (-sa, ca)
        rows.append((bm.verts.new(V(p[0] - n[0] * hw, p[1] - n[1] * hw, 0)), bm.verts.new(V(p[0] + n[0] * hw, p[1] + n[1] * hw, 0)), t))
    for i in range(seg):
        a0, b0, t0 = rows[i]; a1, b1, t1 = rows[i + 1]
        f = bm.faces.new((a0, b0, b1, a1))
        for l, (uu, vv) in zip(f.loops, ((t0, 0), (t0, 1), (t1, 1), (t1, 0))): l[uvl].uv = cell_uv(cell, uu, vv)

def quad(bm, uvl, cell):
    vs = [bm.verts.new(V(x, y, 0)) for x, y in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5))]
    f = bm.faces.new(vs)
    for l, (uu, vv) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uvl].uv = cell_uv(cell, uu, vv)

def shard(bm, uvl):
    """elongated diamond: 2 crossed quads (tail -> side -> tip -> side), length 1 along +Z"""
    for k in range(2):
        a = math.pi * k / 2; sx, sy = math.cos(a) * 0.18, math.sin(a) * 0.18
        vs = [bm.verts.new(V(0, 0, -0.5)), bm.verts.new(V(sx, sy, -0.15)), bm.verts.new(V(0, 0, 0.5)), bm.verts.new(V(-sx, -sy, -0.15))]
        f = bm.faces.new(vs)
        for l, (uu, vv) in zip(f.loops, ((0, 0.5), (0.35, 1), (1, 0.5), (0.35, 0))): l[uvl].uv = cell_uv(3, uu, vv)

def make(name, fn, coll):
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); fn(bm, uvl)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(MAT); ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    return ob

def build():
    cols = {k: bpy.data.collections.new(k) for k in ('YEON_slash', 'YEON_hit', 'YEON_shared')}
    for c in cols.values(): bpy.context.scene.collection.children.link(c)
    S, H = cols['YEON_slash'], cols['YEON_hit']; obs = []
    obs.append(make('yeon_crescent', lambda bm, uv: arc(bm, uv, **CRES_A), S))
    obs.append(make('yeon_crescent_b', lambda bm, uv: arc(bm, uv, phase=2.0, **CRES_B), S))
    obs.append(make('yeon_ghost', lambda bm, uv: arc(bm, uv, cell=1, wobble=0.015, **GHOST), S))
    def fin(bm, uv):
        arc(bm, uv, **FINISH)
        arc(bm, uv, FINISH['a0'] - 14, FINISH['a1'] + 18, FINISH['w'] * 0.45, 0.5, 0.05, cell=1, r_out=1 - FINISH['w'] * 0.62, wobble=0.02, phase=1.0)
    obs.append(make('yeon_finisher', fin, S))
    obs.append(make('yeon_straight', lambda bm, uv: strip(bm, uv, 0, 1.0, STRAIGHT_W, 2), H))
    obs.append(make('yeon_cross', lambda bm, uv: (strip(bm, uv, CROSS_ANG, 1.0, STRAIGHT_W, 2), strip(bm, uv, -CROSS_ANG + 4, 0.86, STRAIGHT_W * 0.85, 2)), H))
    for nm, c in (('yeon_flash', 6), ('yeon_burst', 7), ('yeon_glow', 4), ('yeon_spark', 5)):
        obs.append(make(nm, (lambda c_: lambda bm, uv: quad(bm, uv, c_))(c), H))
    obs.append(make('yeon_shard', shard, cols['YEON_shared']))
    return obs

def preview_material(png):
    """Blender-only preview: emission = R * white + G * sky + B * blue-violet, alpha blended. The game ignores it."""
    m = bpy.data.materials.new('M_yeon'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links
    for n in list(N): N.remove(n)
    out = N.new('ShaderNodeOutputMaterial'); tex = N.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(png)
    sep = N.new('ShaderNodeSeparateColor')
    def rgb(c): n = N.new('ShaderNodeRGB'); n.outputs[0].default_value = (*c, 1); return n
    W, P, Pu = rgb((1, 1, 1)), rgb((0.19, 0.74, 1.0)), rgb((0.25, 0.13, 1.0))
    def mix(a, b, mode):
        n = N.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = mode; n.inputs['Factor'].default_value = 1
        Lk.new(a, n.inputs[6]); Lk.new(b, n.inputs[7]); return n.outputs[2]
    Lk.new(tex.outputs['Color'], sep.inputs[0])
    col = mix(mix(mix(sep.outputs[0], W.outputs[0], 'MULTIPLY'), mix(sep.outputs[1], P.outputs[0], 'MULTIPLY'), 'ADD'), mix(sep.outputs[2], Pu.outputs[0], 'MULTIPLY'), 'ADD')
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
    glb = os.path.join(TMP, 'fx_yeon.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=False, export_animations=False)
    raw = open(glb, 'rb').read()
    cells = {}
    for c, name in enumerate(NAMES):                     # [u0, u1, v0, v1] in the UV space the game samples (glTF flips v)
        u0, v0 = cell_uv(c, 0, 0); u1, v1 = cell_uv(c, 1, 1)
        cells[name] = [round(u0, 6), round(u1, 6), round(1 - v1, 6), round(1 - v0, 6)]
    json.dump({'b64': base64.b64encode(raw).decode(), 'cells': cells, 'tris': tris}, open(os.path.join(OUT, 'fx_yeon.glb.json'), 'w'))
    try:
        bpy.ops.export_scene.fbx(filepath=os.path.join(SRC, 'fx_yeon.fbx'), use_selection=True, axis_forward='-Z', axis_up='Y',
                                 bake_space_transform=True, mesh_smooth_type='FACE', add_leaf_bones=False)
    except Exception as e: print('fbx export failed:', e)
    for i, o in enumerate(obs): o.location.x = (i % 6) * 2.6; o.location.y = (i // 6) * 2.6
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_yeon.blend'), compress=True)
    print('tris', tris, 'total', sum(tris.values()), 'glb bytes', len(raw))

main()
