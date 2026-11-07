"""Mushroom house clean-up after tools/props/mushhouse.py (2026-11-08): removes the flat moss/grass base plate (its hard
olive edge did not match the field's painted ground; the game's grass now shows around the stalk) and merges the hairline
cracks left by decimation (white seams on the cap). Run inside Blender's python (bpy):
  python3 tools/props/mushhouse_trim.py            (assets/props/mushhouse.glb.json in place; original kept in git history)"""
import base64, json, os, tempfile
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'); J = os.path.join(ROOT, 'assets', 'props', 'mushhouse.glb.json')
tmp = tempfile.mkdtemp(); src, dst = os.path.join(tmp, 'in.glb'), os.path.join(tmp, 'out.glb')
open(src, 'wb').write(base64.b64decode(json.load(open(J))['b64']))
import bpy, bmesh, mathutils
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs=[o for o in bpy.context.scene.objects if o.type=='MESH']
H=0
for o in objs:
  for v in o.bound_box: H=max(H,(o.matrix_world@mathutils.Vector(v)).z)
tot=0
for o in objs:
  me=o.data; bm=bmesh.new(); bm.from_mesh(me); M=o.matrix_world; R=M.to_3x3()
  kill=[]
  for f in bm.faces:
    c=M@f.calc_center_median(); n=(R@f.normal).normalized()
    r=(c.x**2+c.y**2)**0.5
    # the moss/grass plate: low, facing up, outside the stalk
    if (c.z < 0.07*H and n.z > 0.3 and r > 0.17) or (c.z < 0.05*H and r > 0.34) or (c.z < 0.02*H and r > 0.2): kill.append(f)
  tot+=len(kill); bmesh.ops.delete(bm, geom=kill, context='FACES')
  bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.004)   # close the hairline cracks left by decimation
  bm.to_mesh(me); bm.free()
print('removed', tot, 'H', H)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_apply=True)
json.dump({'b64': base64.b64encode(open(dst, 'rb').read()).decode()}, open(J, 'w'))
print('wrote', J, os.path.getsize(J))
