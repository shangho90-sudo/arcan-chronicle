"""배쉬(Bash) heavy-strike effect: meshes + baked texture atlas (Blender bpy, headless).

Usage:  python3 tools/blender/fx_bash.py          (bpy module, Blender 5.x; also works as `blender -b -P tools/blender/fx_bash.py`)

Parts (game axes: +Z = attack direction, +Y = up, metres; everything is a unit shape the game scales / orients):
  BASH_swing
    bash_crescent  A. crescent sword-trail: an arc of radius 1 in the local XY plane, angle 0 (tail) .. SPAN (head),
                      thick in the middle, sharp at both ends (the edge side is the outer rim). js/bashfx.js stretches the
                      arc to the REAL blade arc (circle fitted through the sword-tip path) by remapping the angle in the shader
  BASH_hit
    bash_star      B. flat 8-point star (4 long + 4 short sharp spikes) in XY, radius 1  -> camera-facing cross / star flash
    bash_ring      C. thin ring (annulus 0.82 .. 1.0) in XY                              -> ground ring + vertical shock ring
    bash_sphere    E. low-poly energy sphere (planar UV on the glow cell, faced to the camera in the game)
    bash_ray       E. short light ray: 2 crossed tapering strips, length 1 along +Z
  BASH_debris
    bash_rock      D. small faceted stone chunk (radius ~1, jittered icosphere, flat normals)
    bash_shard     D. light fragment: elongated diamond (2 crossed quads, length 1 along +Z)
    bash_quad      D. unit quad facing +Z -> dust puffs (dust cell) / soft glow (glow cell, picked by a uniform in the game)

Texture fx_bash.png (ATLAS px RGBA). Channels are MASKS the game recolours (js/bashfx.js BASH colours):
  R = hot core (-> white #FFFFFF), G = body (-> #BDEEFF blade light / #8DDCFF shock / #FFDFA0 gold), B = halo, A = coverage
  cell 0 ray       u = along (0 base .. 1 tip), v = across
  cell 1 crescent  u = along the arc (0 tail .. 1 head), v = radial (0 inner .. 1 outer = the edge): sharp bright edge line,
                   body fading inwards, speed streaks along u, the tail breaks up
  cell 2 ring      u = radial across the ring (0 inner .. 1 outer): bright outer front, soft inner wake
  cell 3 glow      radial core + thin 4-point cross flare
  cell 4 dust      soft lumpy puff (A = coverage, R = lit top) - normal-blended, coloured brown / grey in the game
  cell 5 rock      grey stone noise (R), A = 1
Procedural (numpy) = the node-free equivalent of a procedural bake, written as a plain PNG.

Outputs:
  assets/fx/fx_bash.glb.json   game meshes (base64 GLB wrapper + "cells" table; no images inside)
  assets/fx/fx_bash.png        atlas
  tools/blender/bash/fx_bash.blend / fx_bash.fbx / fx_bash.png   editable source, other engines
"""
import os, sys, math, json, base64, random
import numpy as np
from PIL import Image
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import blib

# ------------------------------------------------------------------------------------------------ parameters
ATLAS = 512
SPAN = 150.0          # crescent arc span (deg) as modelled; the game remaps it to the real swing span
ARC_SEG = 36          # segments along the crescent
CRES_W = 0.30         # crescent max width (radius 1): 75 % inside the arc, 25 % outside (the blade edge is the outer rim)
STAR_LONG, STAR_SHORT, STAR_W = 1.0, 0.52, 0.15
RING_IN = 0.82; RING_SEG = 48
SEED = 11

ROOT = os.path.join(HERE, '..', '..'); OUT = os.path.join(ROOT, 'assets', 'fx'); SRC = os.path.join(HERE, 'bash'); TMP = os.path.join(HERE, 'out')
for d in (OUT, SRC, TMP): os.makedirs(d, exist_ok=True)

def V(x, y, z):
    """game axes (x right, y up, z forward) -> Blender (glTF export turns Blender -Y into +Z, Z into +Y)"""
    return (x, -z, y)

# cells (x0, y0, w, h) in atlas fractions, y from the bottom (Blender UV)
CELLS = [(0.0, 0.0, 0.5, 0.25), (0.0, 0.25, 0.5, 0.25), (0.5, 0.0, 0.25, 0.25), (0.5, 0.25, 0.25, 0.25), (0.75, 0.0, 0.25, 0.25), (0.75, 0.25, 0.25, 0.25),
         (0.0, 0.5, 0.5, 0.5)]
NAMES = ['ray', 'crescent', 'ring', 'glow', 'dust', 'rock', 'star']
PAD = 3 / ATLAS
def cell_uv(c, u, v):
    ox, oy, w, h = CELLS[c]; return (ox + PAD + u * (w - 2 * PAD), oy + PAD + v * (h - 2 * PAD))

# ------------------------------------------------------------------------------------------------ texture
def atlas():
    rng = np.random.default_rng(SEED)
    img = np.zeros((ATLAS, ATLAS, 4), np.float32)
    U_, V_ = {}, {}
    for c in range(len(CELLS)):
        nx, ny = int(CELLS[c][2] * ATLAS), int(CELLS[c][3] * ATLAS)
        U_[c], V_[c] = np.meshgrid((np.arange(nx) + 0.5) / nx, (np.arange(ny) + 0.5) / ny)
    def put(c, R, Gc, B, A=None, edge=True):
        if A is None: A = np.clip(np.maximum(np.maximum(R, Gc * 0.95), B * 0.8), 0, 1)
        ox, oy, w, h = (int(q * ATLAS) for q in CELLS[c])
        e = np.ones_like(R)
        if edge: e = np.clip(np.minimum(U_[c], 1 - U_[c]) / 0.02, 0, 1) * np.clip(np.minimum(V_[c], 1 - V_[c]) / 0.02, 0, 1)
        img[oy:oy + h, ox:ox + w] = np.stack([np.clip(R * e, 0, 1), np.clip(Gc * e, 0, 1), np.clip(B * e, 0, 1), np.clip(A * e, 0, 1)], -1)
    def fbm(shape, octaves=4, base=4):
        out = np.zeros(shape, np.float32); amp = 1.0; tot = 0
        for o in range(octaves):
            n = base * 2 ** o; g = rng.random((n + 1, n + 1)).astype(np.float32)
            ys = np.linspace(0, n, shape[0]); xs = np.linspace(0, n, shape[1]); yi = np.minimum(ys.astype(int), n - 1); xi = np.minimum(xs.astype(int), n - 1)
            fy = (ys - yi)[:, None]; fx = (xs - xi)[None, :]; fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
            a = g[yi][:, xi]; b = g[yi][:, xi + 1]; c_ = g[yi + 1][:, xi]; d = g[yi + 1][:, xi + 1]
            out += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (c_ * (1 - fx) + d * fx) * fy); tot += amp; amp *= 0.5
        return out / tot
    ss = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))
    # 0 ray: thin hot core, body, soft halo; sharp tip, soft base
    U, Vv = U_[0], V_[0]; d = np.abs(Vv - 0.5) * 2
    base = ss(0.0, 0.15, U); tip = np.clip((1 - U) / 0.12, 0, 1) ** 1.3
    put(0, np.exp(-(d / 0.2) ** 2) * base * tip, np.exp(-(d / 0.5) ** 2) * (1 - d) ** 0.5 * base * (0.6 + 0.4 * tip), np.exp(-(d / 0.9) ** 2) * (1 - d) * base * 0.5)
    # 1 crescent: v = 0 inner .. 1 outer edge. Edge line near v 0.80, body fades inwards, streaks along u, tail (u < 0.35) breaks up
    U, Vv = U_[1], V_[1]
    streak = 0.55 + 0.45 * np.repeat(rng.random((U.shape[0], 1)), U.shape[1], 1) ** 1.5
    head = ss(0.0, 0.08, 1 - U) * (0.35 + 0.65 * ss(0.0, 0.75, U))                # bright towards the head, sharp at the very tip
    tail = ss(0.0, 0.35, U); tail_k = streak * (1 - tail) + tail
    edge = np.exp(-((Vv - 0.80) / 0.06) ** 2)
    body = np.clip(ss(0.0, 0.78, Vv) * (1 - ss(0.86, 0.99, Vv)), 0, 1) ** 1.2
    halo = np.exp(-((Vv - 0.7) / 0.32) ** 2)
    put(1, edge * head * tail_k, np.clip(body * 0.85 + edge * 0.6, 0, 1) * head * tail_k, halo * head * 0.45 * tail_k)
    # 2 ring: u radial (0 inner .. 1 outer): sharp bright outer front, soft wake inwards, slight angular noise
    U, Vv = U_[2], V_[2]
    nz = 0.75 + 0.25 * np.repeat(rng.random((U.shape[0], 1)), U.shape[1], 1)
    front = np.exp(-((U - 0.80) / 0.07) ** 2)
    wake = ss(0.0, 0.8, U) * (1 - ss(0.82, 0.98, U))
    put(2, front * 0.75, np.clip(front * 0.9 + wake * 0.55, 0, 1) * nz, wake * 0.5 * nz, edge=False)
    # 3 glow: radial core + thin cross flare
    U, Vv = U_[3], V_[3]; X, Y = (U - 0.5) * 2, (Vv - 0.5) * 2; r = np.hypot(X, Y)
    flare = np.exp(-(np.abs(X) / 0.03) ** 2) * np.exp(-(np.abs(Y) / 0.85) ** 2) + np.exp(-(np.abs(Y) / 0.03) ** 2) * np.exp(-(np.abs(X) / 0.85) ** 2)
    put(3, np.clip(np.exp(-(r / 0.18) ** 2) + flare * 0.45, 0, 1), np.clip(np.exp(-(r / 0.38) ** 2) * 0.9 + flare * 0.5, 0, 1), np.clip(np.exp(-(r / 0.62) ** 2) * (1 - r), 0, 1))
    # 4 dust: lumpy puff - coverage from noisy radius, lit top (R)
    U, Vv = U_[4], V_[4]; X, Y = (U - 0.5) * 2, (Vv - 0.5) * 2; r = np.hypot(X, Y)
    n = fbm(U.shape, 4, 3)
    cov = (1 - ss(0.35, 1.0, r + (n - 0.5) * 0.7)) * (0.55 + 0.45 * n)
    lit = np.clip(0.55 + 0.6 * Y - 0.25 * r + (n - 0.5) * 0.4, 0, 1)
    put(4, lit, cov * 0.8, cov * 0.4, A=cov)
    # 5 rock: grey stone noise, full alpha
    U, Vv = U_[5], V_[5]; n = fbm(U.shape, 5, 4); n2 = fbm(U.shape, 3, 12)
    put(5, np.clip(0.45 + 0.6 * (n - 0.5) + 0.25 * (n2 - 0.5), 0, 1), np.ones_like(U) * 0.5, np.zeros_like(U), A=np.ones_like(U), edge=False)
    # 6 star: u = along a spike (0 centre .. 1 tip), v = across: white hot heart, blue body, very sharp tips
    U, Vv = U_[6], V_[6]; d = np.abs(Vv - 0.5) * 2
    core = np.exp(-(U / 0.22) ** 2); tipk = (1 - U) ** 1.2
    put(6, np.clip(core + np.exp(-(d / 0.25) ** 2) * tipk ** 2 * 0.9, 0, 1), np.clip(np.exp(-(d / 0.6) ** 2) * tipk + core * 0.6, 0, 1), np.exp(-(d / 0.95) ** 2) * tipk * 0.5)
    a = (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
    im = Image.fromarray(a[::-1], 'RGBA')
    for p in (os.path.join(OUT, 'fx_bash.png'), os.path.join(SRC, 'fx_bash.png')): im.save(p, optimize=True)
    return os.path.join(SRC, 'fx_bash.png')

# ------------------------------------------------------------------------------------------------ meshes
def strip_needle(bm, uvl, axis, up, length, width, cell, planes=2, seg=6):
    ax = np.array(axis, float); ax /= np.linalg.norm(ax); up = np.array(up, float)
    s0 = np.cross(ax, up); s0 /= (np.linalg.norm(s0) or 1); s1 = np.cross(ax, s0)
    for k in range(planes):
        a = math.pi * k / planes; side = s0 * math.cos(a) + s1 * math.sin(a); rows = []
        for i in range(seg + 1):
            t = i / seg; w = width * (min(1, t / 0.15) ** 0.6 * (1 - t) ** 1.1 + 0.06 * (1 - t)); c = ax * (t * length)
            rows.append([bm.verts.new(V(*(c - side * w / 2))), bm.verts.new(V(*(c + side * w / 2))), t])
        for i in range(seg):
            a0, b0, t0 = rows[i]; a1, b1, t1 = rows[i + 1]; f = bm.faces.new((a0, b0, b1, a1))
            for l, (uu, vv) in zip(f.loops, ((t0, 0), (t0, 1), (t1, 1), (t1, 0))): l[uvl].uv = cell_uv(cell, uu, vv)

def crescent(bm, uvl):
    span = math.radians(SPAN); rows = []
    for i in range(ARC_SEG + 1):
        u = i / ARC_SEG; a = u * span
        w = CRES_W * (math.sin(math.pi * u) ** 0.75) * (0.55 + 0.45 * u) + 0.002     # thick middle (a little heavier towards the head), sharp ends
        r0, r1 = 1 - w * 0.75, 1 + w * 0.25
        rows.append((bm.verts.new(V(math.cos(a) * r0, math.sin(a) * r0, 0)), bm.verts.new(V(math.cos(a) * r1, math.sin(a) * r1, 0)), u))
    for i in range(ARC_SEG):
        a0, b0, u0 = rows[i]; a1, b1, u1 = rows[i + 1]; f = bm.faces.new((a0, b0, b1, a1))
        for l, (uu, vv) in zip(f.loops, ((u0, 0), (u0, 1), (u1, 1), (u1, 0))): l[uvl].uv = cell_uv(1, uu, vv)

def star(bm, uvl):
    for k in range(8):
        a = math.pi / 4 * k + math.pi / 2; L = STAR_LONG if k % 2 == 0 else STAR_SHORT; w = STAR_W * (1 if k % 2 == 0 else 0.7)
        dx, dy = math.cos(a), math.sin(a); sx, sy = -dy, dx
        c = bm.verts.new(V(0, 0, 0.0)); l_ = bm.verts.new(V(sx * w / 2, sy * w / 2, 0)); r_ = bm.verts.new(V(-sx * w / 2, -sy * w / 2, 0))
        m = bm.verts.new(V(dx * L * 0.35 + sx * w * 0.32, dy * L * 0.35 + sy * w * 0.32, 0)); n = bm.verts.new(V(dx * L * 0.35 - sx * w * 0.32, dy * L * 0.35 - sy * w * 0.32, 0))
        t = bm.verts.new(V(dx * L, dy * L, 0))
        for tri, uvs in (((l_, r_, n), ((0, 1), (0, 0), (0.35, 0.18))), ((l_, n, m), ((0, 1), (0.35, 0.18), (0.35, 0.82))), ((m, n, t), ((0.35, 0.82), (0.35, 0.18), (1, 0.5)))):
            f = bm.faces.new(tri)
            for lp, (uu, vv) in zip(f.loops, uvs): lp[uvl].uv = cell_uv(6, uu, vv)
        bm.verts.remove(c)

def ring(bm, uvl):
    rows = []
    for i in range(RING_SEG + 1):
        a = 2 * math.pi * i / RING_SEG
        rows.append((bm.verts.new(V(math.cos(a) * RING_IN, math.sin(a) * RING_IN, 0)), bm.verts.new(V(math.cos(a), math.sin(a), 0)), i / RING_SEG))
    for i in range(RING_SEG):
        a0, b0, v0 = rows[i]; a1, b1, v1 = rows[i + 1]; f = bm.faces.new((a0, b0, b1, a1))
        for l, (uu, vv) in zip(f.loops, ((0, v0), (1, v0), (1, v1), (0, v1))): l[uvl].uv = cell_uv(2, uu, vv)

def sphere(bm, uvl):
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    for f in bm.faces:
        for l in f.loops:
            x, y, z = l.vert.co.x, l.vert.co.z, -l.vert.co.y     # back to game axes
            l[uvl].uv = cell_uv(3, 0.5 + x * 0.5, 0.5 + y * 0.5)  # planar along +Z (the game turns +Z to the camera)

def rock(bm, uvl):
    rng = random.Random(SEED)
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    for v in bm.verts:
        k = 0.72 + 0.38 * rng.random(); v.co *= k; v.co.z *= 0.7
    for f in bm.faces:
        f.smooth = False
        for l in f.loops: l[uvl].uv = cell_uv(5, 0.5 + l.vert.co.x * 0.45, 0.5 + l.vert.co.y * 0.45)

def quad(cell):
    def f(bm, uvl):
        vs = [bm.verts.new(V(x, y, 0)) for x, y in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5))]
        f_ = bm.faces.new(vs)
        for l, (uu, vv) in zip(f_.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uvl].uv = cell_uv(cell, uu, vv)
    return f

def make(name, fn, coll):
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); fn(bm, uvl)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(MAT); ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    return ob

def build():
    cols = {k: bpy.data.collections.new(k) for k in ('BASH_swing', 'BASH_hit', 'BASH_debris')}
    for c in cols.values(): bpy.context.scene.collection.children.link(c)
    obs = [make('bash_crescent', crescent, cols['BASH_swing']),
           make('bash_star', star, cols['BASH_hit']),
           make('bash_ring', ring, cols['BASH_hit']),
           make('bash_sphere', sphere, cols['BASH_hit']),
           make('bash_ray', lambda bm, uv: strip_needle(bm, uv, (0, 0, 1), (0, 1, 0), 1.0, 0.16, 0, 2), cols['BASH_hit']),
           make('bash_rock', rock, cols['BASH_debris']),
           make('bash_shard', lambda bm, uv: strip_needle(bm, uv, (0, 0, 1), (0, 1, 0), 1.0, 0.34, 0, 2, seg=2), cols['BASH_debris']),
           make('bash_quad', quad(4), cols['BASH_debris'])]
    return obs

def preview_material(png):
    """Blender-only preview: emission from the atlas masks (white / pale blue / gold), alpha blended. The game ignores it."""
    m = bpy.data.materials.new('M_bash'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links
    for n in list(N): N.remove(n)
    out = N.new('ShaderNodeOutputMaterial'); tex = N.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(png)
    sep = N.new('ShaderNodeSeparateColor')
    def rgb(c): n = N.new('ShaderNodeRGB'); n.outputs[0].default_value = (*c, 1); return n
    W, B, Gd = rgb((1.0, 1.0, 1.0)), rgb((0.51, 0.85, 1.0)), rgb((1.0, 0.74, 0.35))
    def mix(a, b, mode):
        n = N.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = mode; n.inputs['Factor'].default_value = 1
        Lk.new(a, n.inputs[6]); Lk.new(b, n.inputs[7]); return n.outputs[2]
    Lk.new(tex.outputs['Color'], sep.inputs[0])
    col = mix(mix(mix(sep.outputs[0], W.outputs[0], 'MULTIPLY'), mix(sep.outputs[1], B.outputs[0], 'MULTIPLY'), 'ADD'), mix(sep.outputs[2], Gd.outputs[0], 'MULTIPLY'), 'ADD')
    em = N.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 2.5; Lk.new(col, em.inputs['Color'])
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
    glb = os.path.join(TMP, 'fx_bash.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False)
    raw = open(glb, 'rb').read()
    cells = {}
    for c, name in enumerate(NAMES):
        u0, v0 = cell_uv(c, 0, 0); u1, v1 = cell_uv(c, 1, 1)
        cells[name] = [round(u0, 6), round(u1, 6), round(1 - v1, 6), round(1 - v0, 6)]   # glTF flips v
    json.dump({'b64': base64.b64encode(raw).decode(), 'cells': cells, 'span': SPAN}, open(os.path.join(OUT, 'fx_bash.glb.json'), 'w'))
    try:
        bpy.ops.export_scene.fbx(filepath=os.path.join(SRC, 'fx_bash.fbx'), use_selection=True, axis_forward='-Z', axis_up='Y',
                                 bake_space_transform=True, mesh_smooth_type='FACE', add_leaf_bones=False)
    except Exception as e: print('fbx export failed:', e)
    for i, o in enumerate(obs): o.location.x = i * 3
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_bash.blend'), compress=True)
    print('tris', tris, 'total', sum(tris.values()), 'glb bytes', len(raw))

main()
