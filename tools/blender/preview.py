"""Quick look at exported assets in Blender (Cycles): game-like quarter view, warm sun, the runtime texture table.
    python3 tools/blender/preview.py name1 name2 ... [--out /tmp/prev.png]
Materials are rebuilt from their names exactly like js/nature.js does (texture x COLOR_0)."""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import blib as B
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out')
from texmap import TEXMAP, tex_path

def mat_for(m):
    name = m.name.split('.')[0]; spec = TEXMAP.get(name)
    if not spec: return
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); bs = nt.nodes.new('ShaderNodeBsdfPrincipled'); bs.inputs['Roughness'].default_value = 1
    im = nt.nodes.new('ShaderNodeTexImage'); im.image = bpy.data.images.load(tex_path(spec['tex']))
    if spec.get('scale', 1) != 1:
        mp = nt.nodes.new('ShaderNodeMapping'); tc = nt.nodes.new('ShaderNodeTexCoord'); mp.inputs['Scale'].default_value = (spec['scale'],) * 3
        nt.links.new(tc.outputs['UV'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], im.inputs['Vector'])
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = ''
    mu = nt.nodes.new('ShaderNodeMix'); mu.data_type = 'RGBA'; mu.blend_type = 'MULTIPLY'; mu.inputs[0].default_value = 1
    nt.links.new(im.outputs['Color'], mu.inputs[6]); nt.links.new(vc.outputs['Color'], mu.inputs[7])
    nt.links.new(mu.outputs[2], bs.inputs['Base Color']); nt.links.new(bs.outputs[0], o.inputs[0])
    if spec.get('alpha'): nt.links.new(im.outputs['Alpha'], bs.inputs['Alpha'])

def main(names, out):
    B.reset(); sc = bpy.context.scene; sc.cycles.samples = 48; sc.render.resolution_x = 360 * len(names); sc.render.resolution_y = 420
    sc.render.film_transparent = False; sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.62, 0.5, 1)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    x = 0; span = 0; zmax = 0.5
    for n in names:
        bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, n + '.glb'))
        objs = list(bpy.context.selected_objects)
        mn = min((o.matrix_world @ Vector(c)).x for o in objs if o.type == 'MESH' for c in o.bound_box)
        mx = max((o.matrix_world @ Vector(c)).x for o in objs if o.type == 'MESH' for c in o.bound_box)
        for o in objs:
            o.location.x += x - mn
            if o.type == 'MESH':
                for m in o.data.materials: mat_for(m)
        x += (mx - mn) + 0.6; zmax = max([zmax] + [(o.matrix_world @ Vector(c)).z for o in objs if o.type == 'MESH' for c in o.bound_box])
    span = x
    bm = __import__('bmesh').new(); __import__('bmesh').ops.create_grid(bm, x_segments=1, y_segments=1, size=60)
    g = B.obj_from_bmesh(bm, 'ground', [B.material('G')]); g.data.materials[0].diffuse_color = (0.3, 0.5, 0.2, 1)
    g.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.25, 0.42, 0.14, 1)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); B.link(sun); sun.data.energy = 3.2; sun.data.color = (1, 0.92, 0.78); sun.data.angle = 0.2
    sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); B.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(span, zmax * 1.4 * len(names) * 360 / 420 / len(names) * (360 * len(names) / 420)) * 1.05
    p, yv = math.radians(45), 0
    cam.rotation_euler = (math.radians(90) - p, 0, 0); cx = span / 2 - 0.3
    tgt = Vector((cx, 0, zmax * 0.45)); fwd = Vector((0, math.cos(p), -math.sin(p)))
    cam.location = tgt - fwd * 20
    sc.render.filepath = out; bpy.ops.render.render(write_still=True)

if __name__ == '__main__':
    a = sys.argv[1:]; out = '/tmp/prev.png'
    if '--out' in a: i = a.index('--out'); out = a[i + 1]; a = a[:i] + a[i + 2:]
    main(a, out)
