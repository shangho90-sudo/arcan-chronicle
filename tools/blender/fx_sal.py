"""일격참 '살(殺)' single-thrust effect: meshes + baked texture atlas (Blender bpy, headless).

Usage:  python3 tools/blender/fx_sal.py          (bpy module, Blender 5.x; also works as `blender -b -P tools/blender/fx_sal.py`)

Parts (separate objects / collections, all in metres, game axes: +Z = attack direction, +Y = up):
  SAL_cast   (pivot = sword tip, unit length 1 along +Z; the game scales Z to the real reach)
    sal_thrust_core   white needle, 2 crossed planes                         -> centre beam
    sal_thrust_sheet  pink / purple kite sheets, 3 planes at 0/60/120 deg    -> translucent membrane around the beam
    sal_thrust_side   3 thinner needles of different length, off the axis   -> speed lines (hidden on low spec)
  SAL_hit    (pivot = hit point, unit radius 1; the longest ray points along +Z = the thrust direction)
    sal_hit_rays      HIT_RAYS pink rays (2 crossed planes each, varied length / width / angle)
    sal_hit_thin      HIT_THIN thin purple rays between them (hidden on low spec)
  SAL_shared
    sal_shard         elongated diamond (2 crossed quads, length 1 along +Z) -> instanced fragments / gathering sparks
    sal_quad          unit quad facing +Z                                    -> camera-facing glow (tip gather, hit core)

Texture: fx_sal.png (ATLAS px, RGBA, 4 cells). The channels are MASKS, not colours, so the game can recolour freely:
  R = hot core (-> white #FFF7FF), G = body (-> pink #FF4FD8 / magenta #D83CFF), B = halo (-> purple #7B4DFF), A = coverage
  cell 0 (left-bottom)  ray     u = along the ray (0 base .. 1 tip), v = across; tail breaks into streaks
  cell 1 (right-bottom) sheet   thin membrane: soft transparent edges, faint speed streaks along u
  cell 2 (left-top)     glow    radial core + 4-point flare
  cell 3 (right-top)    shard   diamond with a bright centre line
The patterns are procedural (numpy, the node-free equivalent of a procedural bake) and written as a plain PNG.

Outputs:
  assets/fx/fx_sal.glb.json   game meshes (base64 GLB wrapper, no images inside; js/salfx.js applies the atlas)
  assets/fx/fx_sal.png        atlas used by the game
  tools/blender/sal/fx_sal.blend   editable source (preview materials use the atlas + emission, collection per part)
  tools/blender/sal/fx_sal.fbx     same meshes for other engines (Unity: see tools/blender/fx_sal_README.md)
"""
import os, sys, math, json, base64, random
import numpy as np
from PIL import Image
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import blib

# ------------------------------------------------------------------------------------------------ parameters
ATLAS = 512                 # texture size (2 x 2 cells)
SEG = 6                     # segments along every needle / sheet
CORE_W = 0.15               # centre beam width (unit length 1) — thin white needle (2026-11-09 #2: 0.30 -> 0.13)
SHEET_W = 0.38              # membrane max width (0.90 -> 0.38: wraps the core, no longer a wide film)
SHEET_PLANES = 2
SIDE = [(-0.16, 0.05, 0.24, 0.62, 0.05), (0.14, 0.10, 0.32, 0.74, 0.045), (0.02, -0.13, 0.40, 0.50, 0.04)]   # x, y, z0, length, width
HIT_RAYS = 9                # pink main rays (2 long ones along the thrust, the rest irregular)
HIT_THIN = 8                # thin purple rays in the gaps
SEED = 7

ROOT = os.path.join(HERE, '..', '..'); OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'sal'); TMP = os.path.join(HERE, 'out')
for d in (OUT, SRC, TMP): os.makedirs(d, exist_ok=True)

def V(x, y, z):
    """game axes (x right, y up, z forward) -> Blender (glTF export turns Blender -Y into +Z, Z into +Y)"""
    return (x, -z, y)

CELLS = [(0.0, 0.0), (0.5, 0.0), (0.0, 0.5), (0.5, 0.5)]
PAD = 3 / ATLAS
def cell_uv(c, u, v):
    ox, oy = CELLS[c]; return (ox + PAD + u * (0.5 - 2 * PAD), oy + PAD + v * (0.5 - 2 * PAD))

# ------------------------------------------------------------------------------------------------ texture
def atlas():
    n = ATLAS // 2; rng = np.random.default_rng(SEED)
    u = (np.arange(n) + 0.5) / n; U, Vv = np.meshgrid(u, u)        # U across x (along the ray), Vv along y (across)
    img = np.zeros((ATLAS, ATLAS, 4), np.float32)
    def put(c, R, Gc, B):
        A = np.clip(np.maximum(np.maximum(R, Gc * 0.95), B * 0.8), 0, 1)
        ox, oy = int(CELLS[c][0] * ATLAS), int(CELLS[c][1] * ATLAS)
        img[oy:oy + n, ox:ox + n] = np.stack([np.clip(R, 0, 1), np.clip(Gc, 0, 1), np.clip(B, 0, 1), A], -1)
    d = np.abs(Vv - 0.5) * 2                                          # 0 centre .. 1 edge
    # ray: bright thin core, pink body, purple halo; the tail (u < 0.3) breaks into streaks, the tip stays sharp
    streak = 0.55 + 0.45 * np.interp(Vv * 23 % 1, [0, .5, 1], [0, 1, 0]) * (rng.random((n, 1)) * 0 + 1)
    lines = np.repeat(rng.random((n, 1)), n, 1)                       # per-row random -> lines along u
    tail = np.clip(U / 0.32, 0, 1) ** 1.4; sm = np.clip((U - 0.12) / 0.26, 0, 1); sm = sm * sm * (3 - 2 * sm)
    tail_k = (0.3 + 0.7 * lines) * (1 - sm) + sm
    tip = np.clip((1 - U) / 0.10, 0, 1) ** 1.5
    put(0, np.exp(-(d / 0.22) ** 2) * tail * tip * 1.0,
           np.exp(-(d / 0.55) ** 2) * (1 - d) ** 0.5 * tail * tail_k * (0.75 + 0.25 * tip),
           np.exp(-(d / 0.9) ** 2) * (1 - d) * np.clip(U / 0.5, 0, 1) * tail_k * 0.55)
    # sheet: transparent edges, brighter towards the leading edge, speed streaks along u
    sp = 0.6 + 0.4 * np.repeat(rng.random((n, 1)), n, 1) ** 2
    lead = np.clip(U / 0.25, 0, 1) * (0.55 + 0.45 * U)
    put(1, np.exp(-(d / 0.08) ** 2) * lead * 0.5,
           np.exp(-(d / 0.62) ** 2) * (1 - d) ** 0.5 * lead * sp,
           np.exp(-(d / 0.9) ** 2) * (1 - d) * lead * 0.85)
    # glow: radial core + 4-point flare
    X, Y = (U - 0.5) * 2, (Vv - 0.5) * 2; r = np.hypot(X, Y)
    flare = np.exp(-(np.abs(X) / 0.035) ** 2) * np.exp(-(np.abs(Y) / 0.9) ** 2) + np.exp(-(np.abs(Y) / 0.035) ** 2) * np.exp(-(np.abs(X) / 0.9) ** 2)
    put(2, np.exp(-(r / 0.16) ** 2) + flare * 0.5, np.exp(-(r / 0.36) ** 2) * 0.9 + flare * 0.6, np.clip(np.exp(-(r / 0.62) ** 2) * (1 - r), 0, 1))
    # shard: diamond, bright centre line along u
    dm = np.abs(X) * 0.9 + np.abs(Y) * 1.9
    put(3, np.exp(-(np.abs(Y) / 0.08) ** 2) * np.clip(1 - dm, 0, 1) * 1.4, np.clip(1 - dm, 0, 1) ** 0.7, np.clip(1.25 - dm, 0, 1) * 0.6)
    a = (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
    im = Image.fromarray(a[::-1], 'RGBA')                              # row 0 = top in PNG, v = 0 at the bottom in UV
    for p in (os.path.join(OUT, 'fx_sal.png'), os.path.join(SRC, 'fx_sal.png')): im.save(p, optimize=True)
    return os.path.join(SRC, 'fx_sal.png')

# ------------------------------------------------------------------------------------------------ meshes
def needle(bm, uvl, base, axis, up, length, width, cell, planes=2, z0=0.0, profile='needle'):
    """a ray from `base` along unit `axis`: `planes` crossed strips; width profile = quick rise, long taper to a point"""
    ax = np.array(axis, float); ax /= np.linalg.norm(ax); up = np.array(up, float)
    s0 = np.cross(ax, up); s0 = s0 / (np.linalg.norm(s0) or 1); s1 = np.cross(ax, s0)
    for k in range(planes):
        a = math.pi * k / planes; side = s0 * math.cos(a) + s1 * math.sin(a)
        rows = []
        for i in range(SEG + 1):
            t = i / SEG
            if profile == 'kite': w = width * (0.25 + 0.75 * min(1, t / 0.6)) * (1 if t < 0.6 else max(0.0, (1 - t) / 0.4))
            else: w = width * (min(1, t / 0.14) ** 0.6 * (1 - t) ** 1.1 + 0.08 * (1 - t))     # ends in a real point (w = 0 at t = 1)
            c = np.array(base, float) + ax * (z0 + t * length)
            rows.append([bm.verts.new(V(*(c - side * w / 2))), bm.verts.new(V(*(c + side * w / 2))), t])
        for i in range(SEG):
            a0, b0, t0 = rows[i]; a1, b1, t1 = rows[i + 1]
            f = bm.faces.new((a0, b0, b1, a1))
            for l, (uu, vv) in zip(f.loops, ((t0, 0), (t0, 1), (t1, 1), (t1, 0))): l[uvl].uv = cell_uv(cell, uu, vv)

def make(name, fn, coll):
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); fn(bm, uvl)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(MAT); ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    return ob

def build():
    rng = random.Random(SEED)
    cols = {k: bpy.data.collections.new(k) for k in ('SAL_cast', 'SAL_hit', 'SAL_shared')}
    for c in cols.values(): bpy.context.scene.collection.children.link(c)
    obs = []
    obs.append(make('sal_thrust_core', lambda bm, uv: needle(bm, uv, (0, 0, 0), (0, 0, 1), (0, 1, 0), 1.0, CORE_W, 0, 2), cols['SAL_cast']))
    obs.append(make('sal_thrust_sheet', lambda bm, uv: needle(bm, uv, (0, 0, 0), (0, 0, 1), (0, 1, 0), 1.0, SHEET_W, 1, SHEET_PLANES, profile='kite'), cols['SAL_cast']))
    def side(bm, uv):
        for x, y, z0, L, w in SIDE: needle(bm, uv, (x, y, 0), (x * 0.08, y * 0.08, 1), (0, 1, 0), L, w, 0, 2, z0=z0)
    obs.append(make('sal_thrust_side', side, cols['SAL_cast']))
    # hit star: ray 0 = forward (+Z, longest), the rest spread to the sides / up / down with a forward lean
    def rays(n, lmin, lmax, wmin, wmax, phase, longest, planes=2):
        def f(bm, uv):
            for i in range(n):
                if longest and i == 0: d, L, w = (0, 0.04, 1), 1.0, wmax * 1.15                  # main ray along the thrust
                elif longest and i == 1: d, L, w = (0.10, 0.16, 1), 0.78, wmax * 0.8              # second long ray, slightly up / aside
                elif longest and i == 2: d, L, w = (-0.12, -0.05, -1), 0.55, wmax * 0.75          # back ray (towards the attacker)
                else:
                    a = 2 * math.pi * (i + phase) / n + rng.uniform(-0.3, 0.3)
                    d = (math.cos(a), math.sin(a) * 0.9, rng.uniform(-0.2, 0.5)); L, w = rng.uniform(lmin, lmax), rng.uniform(wmin, wmax)
                up = (0, 0, 1) if abs(d[1]) > 0.7 else (0, 1, 0)
                needle(bm, uv, (0, 0, 0), d, up, L, w, 0, planes, z0=0.02)
        return f
    obs.append(make('sal_hit_rays', rays(HIT_RAYS, 0.3, 0.68, 0.08, 0.15, 0.0, True, 3), cols['SAL_hit']))
    obs.append(make('sal_hit_thin', rays(HIT_THIN, 0.35, 0.85, 0.025, 0.045, 0.5, False), cols['SAL_hit']))
    obs.append(make('sal_shard', lambda bm, uv: needle(bm, uv, (0, 0, -0.5), (0, 0, 1), (0, 1, 0), 1.0, 0.36, 3, 2, profile='kite'), cols['SAL_shared']))
    def quad(bm, uv):
        vs = [bm.verts.new(V(x, y, 0)) for x, y in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5))]
        f = bm.faces.new(vs)
        for l, (uu, vv) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uv].uv = cell_uv(2, uu, vv)
    obs.append(make('sal_quad', quad, cols['SAL_shared']))
    return obs

def preview_material(png):
    """Blender-only preview: emission from the atlas masks (white / pink / purple), alpha blended. The game ignores it."""
    m = bpy.data.materials.new('M_sal'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links
    for n in list(N): N.remove(n)
    out = N.new('ShaderNodeOutputMaterial'); tex = N.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(png)
    sep = N.new('ShaderNodeSeparateColor')
    def rgb(c): n = N.new('ShaderNodeRGB'); n.outputs[0].default_value = (*c, 1); return n
    W, P, Pu = rgb((1.0, 0.93, 1.0)), rgb((1.0, 0.09, 0.69)), rgb((0.20, 0.07, 1.0))
    def mul(a, b):
        n = N.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = 'MULTIPLY'; n.inputs['Factor'].default_value = 1
        Lk.new(a, n.inputs[6]); Lk.new(b, n.inputs[7]); return n.outputs[2]
    def add(a, b):
        n = N.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = 'ADD'; n.inputs['Factor'].default_value = 1
        Lk.new(a, n.inputs[6]); Lk.new(b, n.inputs[7]); return n.outputs[2]
    Lk.new(tex.outputs['Color'], sep.inputs[0])
    col = add(add(mul(sep.outputs[0], W.outputs[0]), mul(sep.outputs[1], P.outputs[0])), mul(sep.outputs[2], Pu.outputs[0]))
    em = N.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 3.0; Lk.new(col, em.inputs['Color'])
    tr = N.new('ShaderNodeBsdfTransparent'); mix = N.new('ShaderNodeMixShader')
    Lk.new(tex.outputs['Alpha'], mix.inputs[0]); Lk.new(tr.outputs[0], mix.inputs[1]); Lk.new(em.outputs[0], mix.inputs[2]); Lk.new(mix.outputs[0], out.inputs['Surface'])
    try: m.surface_render_method = 'BLENDED'
    except Exception: pass
    m.use_backface_culling = False
    return m

def main():
    global MAT
    blib.reset(); png = atlas(); MAT = preview_material(png)
    obs = build()
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    # game GLB (no images; the runtime picks the atlas)
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(TMP, 'fx_sal.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=False, export_animations=False)
    raw = open(glb, 'rb').read()
    # atlas cells as the GAME sees them (glTF export flips v: v_gltf = 1 - v_blender): [u0, u1, v0, v1] — js/salfx.js shrinks
    # the rays across v around the CENTRE OF THIS CELL (the old hard-coded 0.25 missed the real 0.75 and discarded the rays)
    cells = {}
    for name, c in (('ray', 0), ('sheet', 1), ('glow', 2), ('shard', 3)):
        u0, v0 = cell_uv(c, 0, 0); u1, v1 = cell_uv(c, 1, 1)
        cells[name] = [round(u0, 6), round(u1, 6), round(1 - v1, 6), round(1 - v0, 6)]
    json.dump({'b64': base64.b64encode(raw).decode(), 'cells': cells}, open(os.path.join(OUT, 'fx_sal.glb.json'), 'w'))
    try:
        bpy.ops.export_scene.fbx(filepath=os.path.join(SRC, 'fx_sal.fbx'), use_selection=True, axis_forward='-Z', axis_up='Y',
                                 bake_space_transform=True, mesh_smooth_type='FACE', add_leaf_bones=False)
    except Exception as e: print('fbx export failed:', e)
    # spread the parts out in the .blend so they can be inspected, then save
    for o, x in zip(obs, (0, 0, 0, 3, 3, 6, 6)): o.location.x = x
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_sal.blend'), compress=True)
    print('tris', tris, 'total', sum(tris.values()), 'glb bytes', len(raw))

main()
