"""Shared Blender helpers for the asset scripts (bpy 4.2+/5.x, works headless as the `bpy` Python module).

Conventions (see tools/blender/README.md):
  * modelled in metres, Blender Z up, origin at the ground under the trunk / base centre; the glTF export turns Z up into Y up
  * materials carry NO images: the material NAME selects a shared texture at runtime (js/nature.js MAT table), e.g.
    M_bark -> bark.png, M_foliage_warm -> foliage_warm.png, M_leaf_* / M_plants -> alpha-tested cut-outs
  * the painted light lives in the active colour attribute "Col" (COLOR_0): baked AO x height gradient x top light x a
    little hue drift, so the textures stay neutral and tile; the real-time sun adds direction on top
"""
import bpy, bmesh, math, random
from mathutils import Vector, noise

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24
    try: sc.cycles.use_denoising = False
    except Exception: pass
    w = bpy.data.worlds.new('W'); sc.world = w; w.light_settings.distance = 1.2
    w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
    return sc

def link(obj):
    bpy.context.scene.collection.objects.link(obj); return obj

def material(name, alpha=False, double=False):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Roughness'].default_value = 1.0; bsdf.inputs['Metallic'].default_value = 0.0
    if alpha:
        try: m.blend_method = 'CLIP'
        except Exception: pass
        try: m.surface_render_method = 'DITHERED'
        except Exception: pass
    m.use_backface_culling = not double
    return m

def obj_from_bmesh(bm, name, mats):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    ob = bpy.data.objects.new(name, me); link(ob); return ob

def tri_count(ob):
    me = ob.data; return sum(len(p.vertices) - 2 for p in me.polygons)

def apply_decimate(ob, ratio):
    if ratio >= 0.999: return ob
    mod = ob.modifiers.new('dec', 'DECIMATE'); mod.ratio = ratio; mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get(); ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    ob.modifiers.remove(mod); old = ob.data; ob.data = me; bpy.data.meshes.remove(old)
    return ob

def metaball_mesh(name, balls, res, threshold=0.6):
    """balls: [(Vector centre, radius, (sx,sy,sz))]  -> mesh object (smooth union = cloud-like foliage)"""
    mb = bpy.data.metaballs.new(name + '_mb'); mb.resolution = res; mb.render_resolution = res; mb.threshold = threshold
    for c, r, s in balls:
        e = mb.elements.new(); e.type = 'ELLIPSOID' if s != (1, 1, 1) else 'BALL'
        e.co = c; e.radius = r; e.stiffness = 2.0
        if e.type == 'ELLIPSOID': e.size_x, e.size_y, e.size_z = [r * k * 0.5 for k in s]
    ob = bpy.data.objects.new(name + '_mbo', mb); link(ob)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob); bpy.data.metaballs.remove(mb)
    out = bpy.data.objects.new(name, me); link(out); return out

def ball_cloud(name, balls, sub_main, sub_sat, seed=0, amp=0.07):
    """foliage as overlapping lumpy icospheres (clump separation reads like painted leaf masses); faces hidden inside
    other balls are removed. balls: [(Vector centre, radius, (sx,sy,sz)), ...] - the first of each cluster is 'main'
    when its radius is the largest around."""
    bm = bmesh.new()
    for i, (c, r, s) in enumerate(balls):
        sub = sub_main if r > 0.72 else sub_sat
        g = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        for v in g['verts']:
            d = v.co.normalized(); k = 1 + amp * noise.noise(d * 2.2 + Vector((i * 3.1 + seed, 0, 0))) + amp * 0.5 * noise.noise(d * 5.0 + Vector((0, i, seed)))
            v.co = c + Vector((d.x * s[0], d.y * s[1], d.z * s[2])) * r * k
    # drop faces fully inside another ball
    dead = []
    for f in bm.faces:
        fc = f.calc_center_median()
        for (c, r, s) in balls:
            q = fc - c; q = Vector((q.x / s[0], q.y / s[1], q.z / s[2]))
            if q.length < r * 0.78: 
                # is it this face's own ball? own surface sits at ~r, so 0.9 r excludes it
                dead.append(f); break
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]; bmesh.ops.delete(bm, geom=loose, context='VERTS')
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); link(ob); return ob

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active; ob.name = name; ob.data.name = name
    return ob

def box_uv(ob, scale=1.0, mats_scale=None, skip=()):
    """per-face dominant-axis projection (seams vanish in busy painted textures); faces of `skip` materials keep their UVs"""
    me = ob.data
    if not me.uv_layers: me.uv_layers.new(name='UV')
    if me.uv_layers.active is None: me.uv_layers.active = me.uv_layers[0]
    uv = me.uv_layers.active.data
    for p in me.polygons:
        if p.material_index in skip: continue
        n = p.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        k = scale * (mats_scale.get(p.material_index, 1.0) if mats_scale else 1.0)
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            a, b = [(co.y, co.z), (co.x, co.z), (co.x, co.y)][ax]
            uv[li].uv = (a * k, b * k)

def ensure_col(ob):
    me = ob.data
    ca = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = ca
    try: me.color_attributes.render_color_index = list(me.color_attributes).index(ca)
    except Exception: pass
    return ca

def bake_ao(ob, ground=True, samples=24):
    """Cycles AO bake into the 'Col' corner attribute (a temporary ground plane adds contact occlusion)"""
    ensure_col(ob); sc = bpy.context.scene; sc.cycles.samples = samples
    gp = None
    if ground:
        bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=12); gp = obj_from_bmesh(bm, '_ground', [])
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    for m in ob.data.materials:                             # the baker needs node materials; keep them
        if m and not m.use_nodes: m.use_nodes = True
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    if gp: bpy.data.objects.remove(gp)

def paint_light(ob, ao_pow=1.0, ao_min=0.35, h0=0.0, h1=1.0, bottom=0.72, top=1.12, up=0.12, hue=0.05, seed=0,
                per_mat=None, edge=None):
    """final painted light = mix(ao_min,1,AO^pow) x height gradient x (1 + up*normal.z) x small hue drift
    per_mat: {material_index: (r,g,b) multiplier}; edge: {vertex_index: brightness add} (curvature highlight)"""
    me = ob.data; ca = ensure_col(ob); rnd = random.Random(seed)
    nz = {}
    for p in me.polygons:
        for li in p.loop_indices: nz[li] = p.normal.z
    # loop normals (custom normals if set)
    try: ln = [l.normal.z for l in me.loops]
    except Exception: ln = None
    for p in me.polygons:
        tint = per_mat.get(p.material_index, (1, 1, 1)) if per_mat else (1, 1, 1)
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index; co = me.vertices[vi].co
            c = ca.data[li].color; ao = c[0]
            a = ao_min + (1 - ao_min) * (max(0.0, min(1.0, ao)) ** ao_pow)
            t = 0 if h1 == h0 else max(0.0, min(1.0, (co.z - h0) / (h1 - h0)))
            g = bottom + (top - bottom) * (t * t * (3 - 2 * t))
            n = ln[li] if ln else nz[li]
            l = a * g * (1 + up * n)
            if edge: l += edge.get(vi, 0.0)
            hv = noise.noise(co * 0.6 + Vector((seed * 1.7, 0, 0))) * hue
            ca.data[li].color = (min(1, l * tint[0] * (1 + hv)), min(1, l * tint[1]), min(1, l * tint[2] * (1 - hv)), 1)

def blob_normals(ob, centres, w=0.8):
    """stylised foliage shading: vertex normals bent towards 'away from the nearest blob centre'"""
    me = ob.data; out = []
    for v in me.vertices:
        best = None; bd = 1e9
        for c, r in centres:
            d = (v.co - c).length / r
            if d < bd: bd, best = d, c
        dirv = (v.co - best); dirv = dirv.normalized() if dirv.length > 1e-6 else Vector((0, 0, 1))
        n = (dirv * w + v.normal * (1 - w)).normalized()
        out.append(n)
    me.normals_split_custom_set_from_vertices(out)

def export_glb(ob, path):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    kw = dict(filepath=path, use_selection=True, export_format='GLB', export_yup=True, export_apply=True, export_materials='EXPORT',
              export_image_format='NONE', export_normals=True, export_texcoord=True, export_vertex_color='ACTIVE', export_animations=False)
    try: bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        kw.pop('export_texcoord'); bpy.ops.export_scene.gltf(**kw)

def duplicate(ob, name):
    me = ob.data.copy(); o = bpy.data.objects.new(name, me); link(o); return o

def cards_on_surface(src, count, size, mat_index, seed, sink=0.18, centres=None, up_bias=0.35):
    """camera-facing leaf cards planted on a foliage surface (leafy, scalloped silhouette from every side).
    Each card is 4 vertices at the SAME point (its centre, just outside the surface); UV = corner (0..1) and the second
    UV layer 'Card' = (size m, rotation rad). The game's leaf material expands them in view space (js/nature.js)."""
    rnd = random.Random(seed); me = src.data; polys = list(me.polygons)
    areas = [p.area for p in polys]; tot = sum(areas)
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UV'); cl = bm.loops.layers.uv.new('Card')
    for k in range(count):
        x = rnd.uniform(0, tot); acc = 0; p = polys[-1]
        for q, a in zip(polys, areas):
            acc += a
            if acc >= x: p = q; break
        c = p.center.copy(); n = p.normal.copy()
        if centres:
            best = min(centres, key=lambda cr: (c - cr[0]).length / cr[1]); n = (c - best[0]).normalized()
        s = size * rnd.uniform(0.75, 1.25); rot = rnd.uniform(-0.5, 0.5)
        o = c + n * s * (0.25 - sink)
        vs = [bm.verts.new(o + Vector((dx, dy, 0)) * 1e-4) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        f = bm.faces.new(vs); f.material_index = mat_index
        for l, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uvl].uv = uv; l[cl].uv = (s, rot)
    return bm
