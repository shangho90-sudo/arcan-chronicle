"""기본공격 5단 콤보 → Blender 장면 / FBX / 쿼터뷰 MP4.

The motion is the game's own (tools/anim/swings.py keys solved by js/model.js IK + planted feet), baked at 60 fps by
tools/browser-tests/combo_bake.js into tools/blender/combo5/bake_<model>.json. This script rebuilds the player model
(assets/models/<model>.json: 67-bone humanoid, skinned mesh, texture) as a Blender armature + mesh, adds a simple
one-handed sword on the right hand, and keys every bone from the bake:
  actions  Sword_Combo_5Hit (150 f) + Attack_01..Attack_05, each also as *_InPlace (Root bone horizontal travel = 0)
  markers  Hit / Chain_Open / Chain_Close on every Attack_0N, Hit_1..Hit_5 + Strike_1..Strike_5 on the full combo
  trails   one ribbon object per strike (blade base -> tip samples inside the game's trail window), collection
           "Trails" (hide it / exclude it from the view layer to turn the trails off); visible only around each hit
Axes: Blender Z up, the character faces -Y. FBX: Forward -Z, Up Y (export below), bones primary Y / secondary X,
no leaf bones, baked animation for every action (one take per action), scale 1.0 (metres).
Root motion: the bone "Root" (at the feet, parent of Hips) carries the forward travel; *_InPlace actions keep Root at
the origin (the feet then slide back by exactly that travel - an engine that moves the capsule by the root curve of
the root-motion take gets planted feet).
Usage: python3 tools/blender/combo5.py [bake.json] [--no-render]
  -> tools/blender/combo5/combo5.blend, combo5.fbx, preview_quarter.mp4, views_front_side.png
"""
import base64, json, math, os, subprocess, sys
import numpy as np
import bpy, mathutils

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
OUTD = os.path.join(HERE, 'combo5')
args = [a for a in sys.argv[1:] if not a.startswith('--')]
BAKE = args[0] if args else os.path.join(OUTD, 'bake_boy.json')
RENDER = '--no-render' not in sys.argv
FPS = 60

bk = json.load(open(BAKE))
meta = json.load(open(os.path.join(ROOT, 'assets', 'models', bk['model'] + '.json')))
S = bk['scale']
b64 = lambda s, dt: np.frombuffer(base64.b64decode(s), dtype=dt)
POS = b64(meta['pos'], np.float32).reshape(-1, 3).astype(np.float64)
TRI = b64(meta['tri'], np.uint32).reshape(-1, 3)
UV = b64(meta['uv'], np.float32).reshape(-1, 2)            # per corner
SI = b64(meta['si'], np.float32).reshape(-1, 4).astype(int)
SW = b64(meta['sw'], np.float32).reshape(-1, 4)
BONES = meta['bones']; NB = len(BONES)

# ---------------------------------------------------------------- game (three.js, root space) -> Blender
fw = np.array(bk['acts']['combo_full']['fwd'], float); fw[1] = 0; fw /= np.linalg.norm(fw)
yaw = math.atan2(fw[0], -fw[2])                             # rotate the facing onto three -Z
Ry = np.eye(4); c, s_ = math.cos(yaw), math.sin(yaw); Ry[0, 0] = c; Ry[0, 2] = -s_; Ry[2, 0] = s_; Ry[2, 2] = c
if np.linalg.norm((Ry[:3, :3] @ fw) - np.array([0, 0, -1])) > 1e-3: Ry[0, 2], Ry[2, 0] = s_, -s_
AX = np.array([[1, 0, 0, 0], [0, 0, -1, 0], [0, 1, 0, 0], [0, 0, 0, 1]], float)       # three (x,y,z) -> Blender (x,-z,y)
RZ = np.diag([-1, -1, 1, 1]).astype(float)                                            # facing +Y -> -Y
C = RZ @ AX @ Ry
assert np.linalg.norm((C[:3, :3] @ fw) - np.array([0, -1, 0])) < 1e-3, C[:3, :3] @ fw

def trs(p):          # [x,y,z,qx,qy,qz,qw] -> 4x4 (three root space, scale removed)
    q = mathutils.Quaternion((p[6], p[3], p[4], p[5])); M = np.eye(4); M[:3, :3] = np.array(q.to_matrix()); M[:3, 3] = p[:3]; return M
def ortho(M):
    M = M.copy(); U, _, Vt = np.linalg.svd(M[:3, :3]); M[:3, :3] = U @ Vt; return M
REST = []
for b in BONES:
    B = np.array(b['bind'], float).reshape(4, 4).T          # column-major (three) -> row-major
    B[:3, 3] *= S                                           # mesh scale (model.js mesh.scale = md.scale)
    REST.append(ortho(C @ B))
toM = lambda M: mathutils.Matrix(M.tolist())

# ---------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene; scn.render.fps = FPS; scn.frame_start = 1
# armature: Root (at the feet, +Y forward of the rig = travel axis -Y handled in the keys) -> the 67 game bones
arm_d = bpy.data.armatures.new('Combo5_Rig'); arm = bpy.data.objects.new('Combo5_Rig', arm_d); scn.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
eb = arm_d.edit_bones; rt = eb.new('Root'); rt.head = (0, 0, 0); rt.tail = (0, 0.25, 0)
ebs = []
for i, b in enumerate(BONES):
    e = eb.new(b['name']); e.head = (0, 0, 0); e.tail = (0, 0.06, 0); e.matrix = toM(REST[i]); ebs.append(e)
for i, b in enumerate(BONES): ebs[i].parent = ebs[b['parent']] if b['parent'] >= 0 else rt
bpy.ops.object.mode_set(mode='OBJECT')
REST_ROOT = np.eye(4)
PARENT = [b['parent'] for b in BONES]

# mesh (rest pose = bind), per-corner UVs, skin weights
V = (C @ np.c_[POS * S, np.ones(len(POS))].T).T[:, :3]
me = bpy.data.meshes.new('Combo5_Body'); me.from_pydata(V.tolist(), [], TRI.tolist()); me.update()
uvl = me.uv_layers.new(name='UV'); uvd = UV.copy(); uvd[:, 1] = 1 - uvd[:, 1]
for li, loop in enumerate(me.loops): uvl.data[li].uv = uvd[li]
body = bpy.data.objects.new('Combo5_Body', me); scn.collection.objects.link(body); body.parent = arm
for b in BONES: body.vertex_groups.new(name=b['name'])
for vi in range(len(POS)):
    for j in range(4):
        w = float(SW[vi, j])
        if w > 1e-4: body.vertex_groups[int(SI[vi, j])].add([vi], w, 'ADD')
body.modifiers.new('Armature', 'ARMATURE').object = arm
for p in me.polygons: p.use_smooth = True
mat = bpy.data.materials.new('M_body'); mat.use_nodes = True
tex = os.path.join(ROOT, 'assets', 'models', (bk.get('tex') or bk['model']) + '.jpg')
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']; im = nt.nodes.new('ShaderNodeTexImage'); im.image = bpy.data.images.load(tex)
nt.links.new(im.outputs['Color'], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 0.8
me.materials.append(mat)

# sword (prop-local three axes: blade along +Z; grip at the origin), bone-parented to Right_Hand at its frame-0 offset
L = bk.get('bladeLen') or 0.35
def box(x0, x1, y0, y1, z0, z1):
    v = [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return v, f
parts = [box(-0.012, 0.012, -0.012, 0.012, -0.07, 0.04), box(-0.06, 0.06, -0.012, 0.012, 0.04, 0.062), box(-0.019, 0.019, -0.004, 0.004, 0.062, L)]
vs, fs = [], []
for v, f in parts: o = len(vs); vs += v; fs += [tuple(o + i for i in q) for q in f]
vs.append((0, 0, L + 0.045)); tip = len(vs) - 1; base = 16
fs += [(base + 1, base + 3, tip), (base + 3, base + 7, tip), (base + 7, base + 5, tip), (base + 5, base + 1, tip)]
# the game's held-item group is scaled (model.js updateProp: 1.3 m per authored unit) - recover it from the baked blade
_b = bk['acts']['combo_full']['frames'][0]['blade']; PS = float(np.linalg.norm(np.subtract(_b[1], _b[0])) / (0.62 * L))
vs = [tuple(PS * c_ for c_ in v) for v in vs]
sm = bpy.data.meshes.new('Sword'); sm.from_pydata(vs, [], fs); sm.update()
smat = bpy.data.materials.new('M_sword'); smat.use_nodes = True; sb = smat.node_tree.nodes['Principled BSDF']
sb.inputs['Base Color'].default_value = (0.82, 0.86, 0.92, 1); sb.inputs['Metallic'].default_value = 0.85; sb.inputs['Roughness'].default_value = 0.3; sm.materials.append(smat)
sword = bpy.data.objects.new('Sword', sm); scn.collection.objects.link(sword)
f0 = bk['acts']['combo_full']['frames'][0]
hi = next(i for i, b in enumerate(BONES) if b['name'] == 'Right_Hand')
Mh0 = ortho(C @ trs(f0['bones'][hi])); Mp0 = ortho(C @ trs(f0['prop']))
OFF = np.linalg.inv(Mh0) @ Mp0                               # sword relative to the hand (rigid in the game)
sword.parent = arm; sword.parent_type = 'BONE'; sword.parent_bone = 'Right_Hand'
bpy.context.view_layer.update()
pb_hand = arm.pose.bones['Right_Hand']
sword.matrix_world = arm.matrix_world @ toM(REST[hi] @ OFF)

# ---------------------------------------------------------------- actions
def basis_of(Mpose, i):
    p = PARENT[i]
    Rl = (np.linalg.inv(REST[p]) if p >= 0 else np.eye(4)) @ REST[i]
    Pl = (np.linalg.inv(Mpose[p]) if p >= 0 else np.eye(4)) @ Mpose[i]
    return np.linalg.inv(Rl) @ Pl

def make_action(name, act, inplace=False, start=None, markers=None):
    A = bk['acts'][act]; fr = A['frames']
    if start is not None: fr = fr[start[0]:start[1]]
    ac = bpy.data.actions.new(name); ac.use_fake_user = True
    arm.animation_data_create(); arm.animation_data.action = ac
    tr0 = np.array(fr[0]['travel'], float)
    for k, F in enumerate(fr):
        f = k + 1
        Mp = [ortho(C @ trs(b)) for b in F['bones']]
        d = (C[:3, :3] @ (np.array(F['travel'], float) - tr0)); d[2] = 0          # forward travel (horizontal)
        pr = arm.pose.bones['Root']
        dl = np.array(RL.to_3x3().inverted()) @ d                              # armature delta -> Root's rest axes
        pr.location = (0, 0, 0) if inplace else tuple(dl)
        pr.keyframe_insert('location', frame=f, group='Root')
        for i, b in enumerate(BONES):
            Bm = mathutils.Matrix(basis_of(Mp, i).tolist())
            loc, rot, _ = Bm.decompose(); pb = arm.pose.bones[b['name']]
            pb.rotation_mode = 'QUATERNION'; pb.location = loc; pb.rotation_quaternion = rot
            pb.keyframe_insert('location', frame=f, group=b['name']); pb.keyframe_insert('rotation_quaternion', frame=f, group=b['name'])
    for nm, fno in (markers or []): m = ac.pose_markers.new(nm); m.frame = int(fno)
    ac.frame_range = (1, len(fr))
    return ac, len(fr)

RL = arm.data.bones['Root'].matrix_local                 # Root rest axes (bone along +Y)

FULL = bk['acts']['combo_full']
mk_full = [('Hit_%d' % (i + 1), h + 1) for i, h in enumerate(FULL['mark']['Hit'])] + [('Strike_%d' % (i + 1), s) for i, s in enumerate(FULL['mark']['Strike'])]
made = []
for inplace in (False, True):
    sfx = '_InPlace' if inplace else ''
    made.append(make_action('Sword_Combo_5Hit' + sfx, 'combo_full', inplace, markers=mk_full))
    for i in range(5):
        A = bk['acts']['combo_%d' % (i + 1)]; mk = A['mark']
        made.append(make_action('Attack_%02d%s' % (i + 1, sfx), 'combo_%d' % (i + 1), inplace,
                                markers=[('Hit', mk['Hit'] + 1), ('Chain_Open', mk['Chain_Open'] + 1), ('Chain_Close', min(mk['Chain_Close'] + 1, len(A['frames'])))]))
arm.animation_data.action = bpy.data.actions['Sword_Combo_5Hit']; scn.frame_end = len(FULL['frames'])
print('actions', [(a.name, n) for a, n in made])

# ---------------------------------------------------------------- trails (separate objects, collection "Trails")
tcol = bpy.data.collections.new('Trails'); scn.collection.children.link(tcol)
tm = bpy.data.materials.new('M_trail'); tm.use_nodes = True; tn = tm.node_tree; tn.nodes.clear()
o_ = tn.nodes.new('ShaderNodeOutputMaterial'); em = tn.nodes.new('ShaderNodeEmission'); tp = tn.nodes.new('ShaderNodeBsdfTransparent'); mx = tn.nodes.new('ShaderNodeMixShader')
attr = tn.nodes.new('ShaderNodeAttribute'); attr.attribute_name = 'Col'
ramp = tn.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (0.55, 0.8, 1.0, 1); ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
sep = tn.nodes.new('ShaderNodeSeparateColor')
tn.links.new(attr.outputs['Color'], sep.inputs['Color']); tn.links.new(sep.outputs['Red'], ramp.inputs['Fac'])
tn.links.new(ramp.outputs['Color'], em.inputs['Color']); em.inputs['Strength'].default_value = 3.0
tn.links.new(sep.outputs['Green'], mx.inputs['Fac']); tn.links.new(tp.outputs[0], mx.inputs[1]); tn.links.new(em.outputs[0], mx.inputs[2]); tn.links.new(mx.outputs[0], o_.inputs['Surface'])
tr_full = FULL['frames']
for si, (t0, t1) in enumerate(FULL['trail']):
    fr = [(k, F) for k, F in enumerate(tr_full) if t0 - 1e-6 <= F['t'] <= t1 + 1e-6 and F['blade']]
    if len(fr) < 2: continue
    last = si == 4; base_k = 0.2 if last else 0.38
    verts, faces, cols = [], [], []
    for j, (k, F) in enumerate(fr):
        tr = np.array(F['travel'], float) - np.array(tr_full[0]['travel'], float)
        a = np.array(F['blade'][0], float); b_ = np.array(F['blade'][1], float)
        a = a + (b_ - a) * base_k
        for p in (a, b_):
            w = (C @ np.r_[p, 1])[:3] + C[:3, :3] @ tr      # blade points are in the root space of that frame (+ travel)
            verts.append(tuple(w))
        u = j / (len(fr) - 1)
        cols += [(0.0, 0.0), (1.0, 0.25 + 0.75 * u)]      # (core 0..1 along the width, opacity along the swing)
        if j: n = len(verts); faces.append((n - 4, n - 3, n - 1, n - 2))
    tmsh = bpy.data.meshes.new('Trail_%d' % (si + 1)); tmsh.from_pydata(verts, [], faces); tmsh.update()
    ca = tmsh.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for vi, (cr, cg) in enumerate(cols): ca.data[vi].color = (cr, min(1, cg * (1.25 if last else 1)), 0, 1)
    tmsh.materials.append(tm)
    to = bpy.data.objects.new('Trail_%d' % (si + 1), tmsh); tcol.objects.link(to)
    hf = FULL['mark']['Hit'][si] + 1
    for fno, hide in ((1, True), (hf - 4, True), (hf - 3, False), (hf + 5, False), (hf + 6, True)):
        to.hide_render = hide; to.hide_viewport = hide; to.keyframe_insert('hide_render', frame=fno); to.keyframe_insert('hide_viewport', frame=fno)

# ---------------------------------------------------------------- save, export
os.makedirs(OUTD, exist_ok=True)
blend = os.path.join(OUTD, 'combo5.blend'); fbx = os.path.join(OUTD, 'combo5.fbx')
bpy.ops.object.select_all(action='DESELECT')
for o in (arm, body, sword): o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.fbx(filepath=fbx, use_selection=True, object_types={'ARMATURE', 'MESH'}, axis_forward='-Z', axis_up='Y',
                         apply_unit_scale=True, add_leaf_bones=False, primary_bone_axis='Y', secondary_bone_axis='X',
                         bake_anim=True, bake_anim_use_all_actions=True, bake_anim_use_nla_strips=False, bake_anim_force_startend_keying=True,
                         bake_anim_step=1.0, bake_anim_simplify_factor=0.0, path_mode='STRIP', embed_textures=False)
bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
print('saved', blend, fbx)

# ---------------------------------------------------------------- previews (Cycles CPU, small)
if RENDER:
    world = bpy.data.worlds.new('W'); scn.world = world; world.use_nodes = True; world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.6, 0.68, 1)
    gm = bpy.data.meshes.new('Ground'); gm.from_pydata([(-3, -4, 0), (3, -4, 0), (3, 2, 0), (-3, 2, 0)], [], [(0, 1, 2, 3)]); gm.update()
    gmat = bpy.data.materials.new('M_ground'); gmat.use_nodes = True; gmat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.62, 0.55, 0.45, 1); gm.materials.append(gmat)
    g = bpy.data.objects.new('Ground', gm); scn.collection.objects.link(g)
    # grid lines every 0.25 m so foot contact / sliding is visible
    for k in range(-12, 13):
        for horiz in (0, 1):
            lm = bpy.data.meshes.new('gl'); x = k * 0.25
            v = [(x - 0.004, -4, 0.001), (x + 0.004, -4, 0.001), (x + 0.004, 2, 0.001), (x - 0.004, 2, 0.001)] if not horiz else [(-3, x - 0.004 - 1, 0.001), (3, x - 0.004 - 1, 0.001), (3, x + 0.004 - 1, 0.001), (-3, x + 0.004 - 1, 0.001)]
            lm.from_pydata(v, [], [(0, 1, 2, 3)]); lm.update(); lmat = bpy.data.materials.get('M_line') or bpy.data.materials.new('M_line'); lm.materials.append(lmat)
            lo = bpy.data.objects.new('gl', lm); scn.collection.objects.link(lo)
    bpy.data.materials['M_line'].use_nodes = True; bpy.data.materials['M_line'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.42, 0.36, 0.3, 1)
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 3.5; sun.rotation_euler = (math.radians(40), math.radians(15), math.radians(30)); scn.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scn.collection.objects.link(cam); scn.camera = cam
    cam.data.type = 'ORTHO'
    def aim(loc, target=(0, -0.2, 0.8), ortho=3.2):
        cam.location = loc; d = mathutils.Vector(target) - mathutils.Vector(loc); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); cam.data.ortho_scale = ortho
    r = scn.render; r.engine = 'CYCLES'; scn.cycles.samples = 12; scn.cycles.use_denoising = False; scn.cycles.device = 'CPU'
    r.resolution_x, r.resolution_y = 640, 480; r.film_transparent = False; r.image_settings.file_format = 'PNG'
    scn.view_settings.view_transform = 'Standard'
    # quarter view like the game (pitch 44 deg, looking from the front-right)
    pitch, yawv, dist = math.radians(44), math.radians(35), 12
    aim((dist * math.cos(pitch) * math.sin(yawv), -dist * math.cos(pitch) * math.cos(yawv), dist * math.sin(pitch) + 0.8))
    fdir = os.path.join('/tmp', 'combo5_quarter'); os.makedirs(fdir, exist_ok=True)
    for f in range(1, scn.frame_end + 1):
        scn.frame_set(f); r.filepath = os.path.join(fdir, '%04d.png' % f); bpy.ops.render.render(write_still=True)
    mp4 = os.path.join(OUTD, 'preview_quarter.mp4')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(fdir, '%04d.png'), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', mp4], check=True)
    # front / side contact sheet at the five hits + the guard
    from PIL import Image
    shots = []
    picks = [1] + [h + 1 for h in FULL['mark']['Hit']] + [scn.frame_end]
    for view, loc in (('front', (0, -10, 1.0)), ('side', (10, -0.2, 1.0))):
        aim(loc, ortho=2.8)
        for f in picks:
            scn.frame_set(f); p = os.path.join('/tmp', 'combo5_%s_%d.png' % (view, f)); r.filepath = p; bpy.ops.render.render(write_still=True); shots.append((view, f, p))
    ims = [Image.open(p).resize((320, 240)) for _, _, p in shots]
    sheet = Image.new('RGB', (320 * len(picks), 480))
    for k, imx in enumerate(ims): sheet.paste(imx, ((k % len(picks)) * 320, (k // len(picks)) * 240))
    sheet.save(os.path.join(OUTD, 'views_front_side.png'))
    print('rendered', mp4)
