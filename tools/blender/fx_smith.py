"""대장장이 1차 스킬 이펙트 메시 (Blender bpy, headless, 2026-11-13): 모루 · 집게 · 접이식 철판 · 리벳 · 쇳물 방울 · 고철 · 금속 파편.

Usage:  python3 tools/blender/fx_smith.py        ->  assets/fx/fx_smith.glb.json  (+ tools/blender/smith/fx_smith.blend)

Meshes (game axes: +Y up, metres; js/smithfx.js가 크기·움직임을 정함. 텍스처 없음 — 색은 정점 색, 빛은 셰이더)
  smith_anvil         검은 철 모루: 바닥 y 0, 높이 0.74, 길이 x -0.62 .. 0.9(뿔 +x), 폭 z ±0.3
  smith_anvil_cracks  모루 옆면·윗면의 주황 균열 띠(가산 재질로 그려 빛남) — 모루와 같은 좌표
  smith_jaw           집게 한쪽 턱: 축 원점, 턱은 +x 로 0.62(안쪽 +z 로 굽음), 반대쪽 것은 z 를 뒤집어 씀
  smith_bar           집게 자루: x -1 .. 0, 굵기 0.05 (길이는 x 배율)
  smith_plate         철판 한 장: 폭 x -0.5 .. 0.5, 높이 y 0 .. 1.4, 두께 z ±0.03, 테두리·X 보강대·모서리 리벳
  smith_rivet         리벳: 둥근 머리 반지름 1, 짧은 몸통(-y)
  smith_drop          쇳물 방울: 물방울 모양 길이 y -1 .. 1.1, 주황 -> 노랑
  smith_scrap         고철 조각: 구부러진 판 + 볼트, 크기 약 1
  smith_shard         금속 외피 파편: 뾰족한 삼각 조각, 크기 약 1
json: {b64}
"""
import os, sys, math, json, base64
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm as FP
from fx_pharm import V, lathe, new_obj
from fx_cook import quad, box
SRC = os.path.join(HERE, 'smith'); os.makedirs(SRC, exist_ok=True)

IRON, IRON_HI, IRON_LO, IRON_TOP = (0.085, 0.085, 0.10, 1), (0.30, 0.31, 0.36, 1), (0.045, 0.045, 0.055, 1), (0.22, 0.22, 0.26, 1)
STEEL, STEEL_HI, STEEL_LO = (0.50, 0.53, 0.60, 1), (0.86, 0.89, 0.95, 1), (0.26, 0.28, 0.33, 1)
ORANGE, YELLOW, RUST = (1.0, 0.45, 0.08, 1), (1.0, 0.86, 0.35, 1), (0.50, 0.24, 0.12, 1)

def prism(bm, col, pts, z0, z1, c, ctop=None, cside=None):
    """extrude an x-y polygon (counter-clockwise) between z0 and z1"""
    n = len(pts)
    quad(bm, col, [(x, y, z1) for (x, y) in pts], ctop or c); quad(bm, col, [(x, y, z0) for (x, y) in reversed(pts)], c)
    for i in range(n):
        (xa, ya), (xb, yb) = pts[i], pts[(i + 1) % n]
        quad(bm, col, [(xa, ya, z0), (xb, yb, z0), (xb, yb, z1), (xa, ya, z1)], cside or c)

def anvil(bm, col, uvl):
    box(bm, col, -0.46, 0.46, 0.0, 0.16, -0.30, 0.30, IRON, IRON_TOP)                       # foot
    box(bm, col, -0.38, 0.38, 0.16, 0.22, -0.24, 0.24, IRON_LO, IRON)
    # waist: narrower in the middle (two stacked tapered blocks)
    for (y0, y1, w0, w1, d0, d1) in ((0.22, 0.36, 0.30, 0.20, 0.20, 0.14), (0.36, 0.50, 0.20, 0.34, 0.14, 0.20)):
        a = [(-w0, y0, -d0), (w0, y0, -d0), (w0, y0, d0), (-w0, y0, d0)]; b = [(-w1, y1, -d1), (w1, y1, -d1), (w1, y1, d1), (-w1, y1, d1)]
        for i in range(4):
            j = (i + 1) % 4; quad(bm, col, [a[i], a[j], b[j], b[i]], IRON if i % 2 else IRON_LO)
    box(bm, col, -0.62, 0.42, 0.50, 0.74, -0.24, 0.24, IRON, IRON_HI)                        # face block (bright worn top)
    box(bm, col, -0.62, 0.42, 0.70, 0.745, -0.245, 0.245, IRON_HI, IRON_HI)
    # horn (+x): tapered to a blunt tip
    a = [(0.42, 0.56, -0.20), (0.42, 0.74, -0.20), (0.42, 0.74, 0.20), (0.42, 0.56, 0.20)]; tip = [(0.90, 0.67, -0.03), (0.90, 0.73, -0.03), (0.90, 0.73, 0.03), (0.90, 0.67, 0.03)]
    for i in range(4):
        j = (i + 1) % 4; quad(bm, col, [a[i], tip[i], tip[j], a[j]], IRON_HI if i == 1 else IRON)
    quad(bm, col, tip, IRON_HI)
    box(bm, col, -0.70, -0.62, 0.58, 0.74, -0.16, 0.16, IRON_LO, IRON_TOP)                    # heel step

def anvil_cracks(bm, col, uvl):
    # zig-zag strips: on both long sides (z = +-0.245), climbing from the waist into the face block, and two across the top
    def strip(pts, w, n):
        for i in range(len(pts) - 1):
            (xa, ya, za), (xb, yb, zb) = pts[i], pts[i + 1]
            k0, k1 = 1 - i / (len(pts) - 1) * 0.6, 1 - (i + 1) / (len(pts) - 1) * 0.6
            if n == 'z': q = [(xa - w * k0, ya, za), (xa + w * k0, ya, za), (xb + w * k1, yb, zb), (xb - w * k1, yb, zb)]
            else: q = [(xa, ya, za - w * k0), (xa, ya, za + w * k0), (xb, yb, zb + w * k1), (xb, yb, zb - w * k1)]
            quad(bm, col, q, YELLOW if i == 0 else ORANGE)
    for sg in (1, -1):
        z = 0.247 * sg
        strip([(-0.30, 0.50, z), (-0.22, 0.58, z), (-0.30, 0.64, z), (-0.20, 0.72, z)], 0.022, 'z')
        strip([(0.10, 0.50, z), (0.18, 0.59, z), (0.08, 0.66, z), (0.16, 0.74, z)], 0.022, 'z')
        strip([(-0.02, 0.16, 0.302 * sg), (-0.10, 0.10, 0.302 * sg), (-0.04, 0.04, 0.302 * sg)], 0.018, 'z')
    strip([(-0.20, 0.748, -0.245), (-0.26, 0.748, -0.08), (-0.16, 0.748, 0.04), (-0.22, 0.748, 0.20)], 0.02, 'x')
    strip([(0.16, 0.748, 0.245), (0.10, 0.748, 0.10), (0.20, 0.748, -0.02)], 0.02, 'x')

def jaw(bm, col, uvl):
    # flat forged bar, seen from above (x-z); thickness in y. Pivot at the origin; the jaw curves inwards (+z) and ends in a flat grip pad
    t = 0.035
    pts = [(-0.02, -0.05), (0.14, -0.10), (0.34, -0.15), (0.50, -0.12), (0.60, -0.02), (0.62, 0.10), (0.56, 0.12), (0.50, 0.04), (0.42, -0.04), (0.30, -0.06), (0.14, -0.02), (-0.02, 0.05)]
    top = [(x, t, z) for (x, z) in pts]; bot = [(x, -t, z) for (x, z) in pts]
    quad(bm, col, list(reversed(top)), STEEL_HI); quad(bm, col, bot, STEEL_LO)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n; quad(bm, col, [bot[i], top[i], top[j], bot[j]], STEEL)
    lathe(bm, col, [(0.0, -0.05), (0.07, -0.05), (0.07, 0.05), (0.0, 0.05)], 10, lambda k, p: IRON_HI)   # pivot pin

def bar(bm, col, uvl):
    box(bm, col, -1.0, 0.0, -0.03, 0.03, -0.035, 0.035, STEEL, STEEL_HI)

def plate(bm, col, uvl):
    box(bm, col, -0.5, 0.5, 0.0, 1.4, -0.03, 0.03, IRON_TOP, IRON_HI)
    f = 0.045   # raised frame + X brace on both faces
    for sg in (1, -1):
        z0, z1 = (0.03, 0.05) if sg > 0 else (-0.05, -0.03)
        box(bm, col, -0.5, 0.5, 0.0, 0.09, z0, z1, STEEL, STEEL_HI); box(bm, col, -0.5, 0.5, 1.31, 1.4, z0, z1, STEEL, STEEL_HI)
        box(bm, col, -0.5, -0.41, 0.09, 1.31, z0, z1, STEEL, STEEL); box(bm, col, 0.41, 0.5, 0.09, 1.31, z0, z1, STEEL_LO, STEEL)
        zc = 0.04 * sg
        for (a, b) in (((-0.41, 0.09), (0.41, 1.31)), ((-0.41, 1.31), (0.41, 0.09))):
            dx, dy = b[0] - a[0], b[1] - a[1]; m = math.hypot(dx, dy); nx, ny = -dy / m * f, dx / m * f
            q = [(a[0] - nx, a[1] - ny, zc), (b[0] - nx, b[1] - ny, zc), (b[0] + nx, b[1] + ny, zc), (a[0] + nx, a[1] + ny, zc)]
            if sg < 0: q.reverse()
            quad(bm, col, q, STEEL_LO)
        for (x, y) in ((-0.455, 0.045), (0.455, 0.045), (-0.455, 1.355), (0.455, 1.355), (0.0, 0.045), (0.0, 1.355), (-0.455, 0.7), (0.455, 0.7)):
            r = 0.028; zt = 0.066 * sg
            c = bm.verts.new(V(x, y, zt)); ring = [bm.verts.new(V(x + math.cos(k * math.pi / 3) * r, y + math.sin(k * math.pi / 3) * r, 0.05 * sg)) for k in range(6)]
            for k in range(6):
                vs = (c, ring[k], ring[(k + 1) % 6]) if sg > 0 else (c, ring[(k + 1) % 6], ring[k])
                fc = bm.faces.new(vs)
                for l in fc.loops: l[col] = STEEL_HI if l.vert is c else STEEL

def rivet(bm, col, uvl):
    P = [(0.0, -0.9), (0.42, -0.9), (0.42, 0.0), (1.0, 0.0), (0.92, 0.32), (0.66, 0.58), (0.34, 0.72), (0.0, 0.76)]
    lathe(bm, col, P, 12, lambda k, p: STEEL_HI if k >= 5 else (STEEL if k >= 3 else STEEL_LO))

def drop(bm, col, uvl):
    P = [(0.0, -1.0), (0.42, -0.86), (0.72, -0.5), (0.8, -0.1), (0.66, 0.3), (0.4, 0.66), (0.18, 0.92), (0.0, 1.1)]
    lathe(bm, col, P, 10, lambda k, p: YELLOW if k <= 2 else ORANGE)

def scrap(bm, col, uvl):
    t = 0.05; pts = [(-0.5, -0.1), (-0.1, 0.12), (0.2, -0.06), (0.5, 0.14)]
    for i in range(3):
        (xa, ya), (xb, yb) = pts[i], pts[i + 1]
        quad(bm, col, [(xa, ya + t, -0.26), (xa, ya + t, 0.26), (xb, yb + t, 0.22), (xb, yb + t, -0.22)], STEEL_HI if i == 1 else STEEL)
        quad(bm, col, [(xa, ya - t, -0.26), (xb, yb - t, -0.22), (xb, yb - t, 0.22), (xa, ya - t, 0.26)], RUST)
        quad(bm, col, [(xa, ya - t, 0.26), (xb, yb - t, 0.22), (xb, yb + t, 0.22), (xa, ya + t, 0.26)], STEEL_LO)
        quad(bm, col, [(xa, ya - t, -0.26), (xa, ya + t, -0.26), (xb, yb + t, -0.22), (xb, yb - t, -0.22)], STEEL_LO)
    box(bm, col, -0.5 - 0.0, -0.5 + 0.02, -0.15, -0.05, -0.26, 0.26, RUST)
    lathe(bm, col, [(0.0, 0.14), (0.13, 0.14), (0.13, 0.26), (0.0, 0.26)], 6, lambda k, p: STEEL_HI, 0.0)

def shard(bm, col, uvl):
    a, b, c = (-0.5, -0.2, 0.0), (0.5, -0.05, 0.05), (-0.1, 0.5, -0.04); t = 0.06
    up = lambda p: (p[0], p[1], p[2] + t); dn = lambda p: (p[0], p[1], p[2] - t)
    quad(bm, col, [up(a), up(b), up(c)], STEEL_HI); quad(bm, col, [dn(a), dn(c), dn(b)], IRON)
    for p, q in ((a, b), (b, c), (c, a)): quad(bm, col, [dn(p), dn(q), up(q), up(p)], ORANGE)   # glowing fresh break on the rim

def main():
    FP.reset()
    obs = [new_obj('smith_anvil', anvil, False), new_obj('smith_anvil_cracks', anvil_cracks, False), new_obj('smith_jaw', jaw, False), new_obj('smith_bar', bar, False),
           new_obj('smith_plate', plate, False), new_obj('smith_rivet', rivet), new_obj('smith_drop', drop), new_obj('smith_scrap', scrap, False), new_obj('smith_shard', shard, False)]
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(FP.TMP, 'fx_smith.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(FP.OUT, 'fx_smith.glb.json'), 'w'))
    for k, o in enumerate(obs): o.location.x = k * 2.2
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_smith.blend'), compress=True)
    print('tris', tris, 'glb bytes', len(raw), flush=True)

if __name__ == '__main__':
    main()
