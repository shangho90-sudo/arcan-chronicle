"""디자이너 2차 스킬 이펙트 메시 (Blender bpy, headless, 2026-11-16).

Usage:  python3 tools/blender/fx_designer.py   ->  assets/fx/fx_designer.glb.json  (+ tools/blender/designer/fx_designer.blend)

메시 (게임 축: +Y 위, 미터, 크기 약 1 — 실제 크기·움직임은 js/designerfx.js가 정함. 텍스처 없음 — 색은 정점 색, 빛은 셰이더. 부품마다 피벗이 따로)
  ds_blade      큰 마법 가위의 한쪽(백금 날 + 금 고리): 피벗(나사) = 원점, 날은 +x 로 1.0, 고리는 -x 로 0.55, 두께 y — 두 개를 겹쳐 x 축 둘레로 벌림
  ds_screw      가위 나사(분홍 보석 머리), 반지름 0.07
  ds_needle     금빛 바늘: 뾰족한 끝 +x (0.5), 귀 -x (-0.5) — 날아가는 방향 = 끝 방향
  ds_pin        보석 핀: 뾰족한 끝 y 0, 금 핀 몸 y 0..0.8, 보석 머리 y 0.88 (반지름 0.12)
  ds_jewel      깎은 보석: 반지름 1 (색은 uTint)
  ds_bow        리본 매듭: 너비 x -1..1, 넓고 납작한 고리 둘 + 늘어진 끝 둘 + 가운데 매듭 (분홍)
  ds_mq_stand   마네킹 받침: 세 발 + 기둥, y 0..0.8 (금빛 나무)
  ds_mq_torso   마네킹 몸통(드레스 폼): y 0.8..1.5, 아이보리 리넨 + 목 + 줄자 띠
  ds_mq_head    마네킹 머리(작은 공), 중심 y 1.66, 반지름 0.12
  ds_cape       망토(분신·마네킹 의상): 어깨 y 0 .. 아래 y -1, 뒤쪽(-z)으로 퍼짐, 안쪽 금테
  ds_skirt      퍼지는 치마 고리(분신 의상): 허리 y 0 반지름 0.22 .. 밑단 y -0.7 반지름 0.62, 주름
  ds_crown      작은 티아라(분신 의상): 반지름 0.13, 높이 0.1, 금 + 보석
  ds_hat        작은 실크 모자(분신 의상): 챙 반지름 0.2, 높이 0.18, 리본 띠
json: {b64}
"""
import os, sys, math, json
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm as FP
from fx_pharm import V, lathe, new_obj
from fx_cook import blob, box
import base64
SRC = os.path.join(HERE, 'designer'); os.makedirs(SRC, exist_ok=True)

PLAT, PLAT_HI, PLAT_LO = (0.86, 0.88, 0.94, 1), (1.0, 1.0, 1.0, 1), (0.56, 0.58, 0.68, 1)
GOLD, GOLD_HI, GOLD_LO = (1.0, 0.76, 0.30, 1), (1.0, 0.90, 0.55, 1), (0.70, 0.46, 0.14, 1)
PINK, PINK_HI, PINK_LO = (1.0, 0.56, 0.78, 1), (1.0, 0.80, 0.90, 1), (0.80, 0.30, 0.56, 1)
IVORY, IVORY_LO, WOOD = (0.98, 0.94, 0.86, 1), (0.82, 0.76, 0.66, 1), (0.66, 0.46, 0.26, 1)
LILAC, LILAC_LO = (0.80, 0.66, 1.0, 1), (0.52, 0.38, 0.80, 1)

def face(bm, col, pts, c):
    f = bm.faces.new([bm.verts.new(V(*p)) for p in pts])
    for l in f.loops: l[col] = c
    return f
def slab(bm, col, outline, y0, y1, ctop, cside, cbot=None):
    """flat prism: outline [(x, z)] (game axes) extruded from y0 to y1"""
    top = [bm.verts.new(V(x, y1, z)) for x, z in outline]; bot = [bm.verts.new(V(x, y0, z)) for x, z in outline]
    f = bm.faces.new(top)
    for l in f.loops: l[col] = ctop
    f = bm.faces.new(list(reversed(bot)))
    for l in f.loops: l[col] = cbot or ctop
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n; f = bm.faces.new((bot[i], bot[j], top[j], top[i]))
        for l in f.loops: l[col] = cside
def ring_xz(bm, col, cx, cz, r, w, y0, y1, c, seg=20):
    """flat ring in the xz plane (finger hole)"""
    for i in range(seg):
        a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
        o0, o1 = (cx + math.cos(a0) * (r + w), cz + math.sin(a0) * (r + w)), (cx + math.cos(a1) * (r + w), cz + math.sin(a1) * (r + w))
        i0, i1 = (cx + math.cos(a0) * r, cz + math.sin(a0) * r), (cx + math.cos(a1) * r, cz + math.sin(a1) * r)
        slab(bm, col, [i0, o0, o1, i1], y0, y1, c, GOLD_LO)

def blade(bm, col, uvl):
    # 날: 피벗에서 +x 로 1.0, 등(+z)은 곧고 날(-z)은 휘어 끝으로 모임, 두께 0.03
    out = [(0.0, 0.07), (0.35, 0.065), (0.7, 0.045), (1.0, 0.0), (0.72, -0.02), (0.38, -0.05), (0.0, -0.06), (-0.08, 0.0)]
    slab(bm, col, out, -0.015, 0.015, PLAT_HI, PLAT_LO)
    slab(bm, col, [(0.04, 0.0), (0.95, 0.0), (0.7, -0.018), (0.36, -0.045), (0.04, -0.05)], 0.0151, 0.017, (0.80, 0.86, 1.0, 1), PLAT)   # 날 쪽 밝은 결
    slab(bm, col, [(-0.08, 0.035), (-0.38, 0.05), (-0.38, 0.0), (-0.08, -0.03)], -0.012, 0.012, GOLD, GOLD_LO)   # 목
    ring_xz(bm, col, -0.5, 0.03, 0.11, 0.035, -0.014, 0.014, GOLD_HI, 22)
def screw(bm, col, uvl):
    lathe(bm, col, [(0.0, -0.03), (0.07, -0.03), (0.07, 0.01), (0.05, 0.035), (0.0, 0.04)], 14, lambda k, p: PINK_HI if k >= 2 else GOLD)
def needle(bm, col, uvl):
    n = 10; rings = []
    prof = [(-0.5, 0.012), (-0.46, 0.022), (-0.3, 0.02), (0.3, 0.018), (0.44, 0.01), (0.5, 0.0)]
    for x, r in prof:
        rings.append([bm.verts.new(V(x, math.cos(2 * math.pi * k / n) * r, math.sin(2 * math.pi * k / n) * r)) for k in range(n)])
    for a, b in zip(rings, rings[1:]):
        for k in range(n):
            j = (k + 1) % n; f = bm.faces.new((a[k], a[j], b[j], b[k]))
            for l in f.loops: l[col] = GOLD_HI if k < n // 2 else GOLD
    f = bm.faces.new(list(reversed(rings[0])))
    for l in f.loops: l[col] = GOLD_LO
    slab(bm, col, [(-0.47, 0.006), (-0.39, 0.006), (-0.39, -0.006), (-0.47, -0.006)], 0.023, 0.026, (0.25, 0.15, 0.1, 1), GOLD_LO)   # 바늘귀(어두운 틈)
def pin(bm, col, uvl):
    lathe(bm, col, [(0.0, 0.0), (0.012, 0.05), (0.016, 0.78), (0.03, 0.8), (0.0, 0.8)], 10, lambda k, p: GOLD_HI if k == 2 else GOLD)
    blob(bm, col, (0, 0.88, 0), (0.12, 0.12, 0.12), PINK, 12, 8, lambda u: PINK_HI if u > 0.6 else PINK)
def jewel(bm, col, uvl):
    lathe(bm, col, [(0.0, -1.0), (0.62, -0.1), (1.0, 0.0), (0.7, 0.35), (0.0, 0.45)], 8, lambda k, p: (1, 1, 1, 1) if k >= 2 else (0.75, 0.8, 0.9, 1))
def bow(bm, col, uvl):
    # 넓고 납작한 고리 둘(정면 xy), 늘어진 끝 둘, 가운데 매듭
    for sg in (1, -1):
        loop = [(sg * (0.12 + 0.88 * math.sin(a) ** 2 * (0.5 + 0.5 * math.cos(a))), 0.55 * math.sin(2 * a) * 0.9) for a in [i * math.pi / 16 for i in range(17)]]
        for (x0, y0), (x1, y1) in zip(loop, loop[1:]):
            face(bm, col, [(x0, y0, -0.12), (x1, y1, -0.12), (x1, y1, 0.12), (x0, y0, 0.12)], PINK if sg > 0 else PINK_HI)
        tail = [(sg * 0.05, -0.05), (sg * 0.35, -0.6), (sg * 0.55, -0.95), (sg * 0.4, -0.92), (sg * 0.22, -0.55), (sg * 0.0, -0.08)]
        for (x0, y0), (x1, y1) in zip(tail, tail[1:]):
            face(bm, col, [(x0, y0, -0.1), (x1, y1, -0.1), (x1, y1, 0.1), (x0, y0, 0.1)], PINK_LO)
    blob(bm, col, (0, 0, 0), (0.16, 0.16, 0.14), PINK_LO, 10, 6, lambda u: PINK if u > 0.5 else PINK_LO)
def mq_stand(bm, col, uvl):
    lathe(bm, col, [(0.0, 0.05), (0.035, 0.05), (0.03, 0.8), (0.0, 0.8)], 10, lambda k, p: WOOD)
    for k in range(3):
        a = 2 * math.pi * k / 3; ca, sa = math.cos(a), math.sin(a)
        out = [(0.0, -0.025), (0.28, -0.02), (0.3, 0.0), (0.28, 0.02), (0.0, 0.025)]
        top = [bm.verts.new(V(x * ca - z * sa, 0.06 - x * 0.12, x * sa + z * ca)) for x, z in out]
        bot = [bm.verts.new(V(x * ca - z * sa, 0.0 - x * 0.12 + 0.02, x * sa + z * ca)) for x, z in out]
        for vs in (top, list(reversed(bot))):
            f = bm.faces.new(vs)
            for l in f.loops: l[col] = GOLD_LO
        for i in range(len(out)):
            j = (i + 1) % len(out); f = bm.faces.new((bot[i], bot[j], top[j], top[i]))
            for l in f.loops: l[col] = WOOD
    lathe(bm, col, [(0.0, 0.74), (0.06, 0.74), (0.06, 0.8), (0.0, 0.8)], 10, lambda k, p: GOLD)
def mq_torso(bm, col, uvl):
    prof = [(0.0, 0.80), (0.20, 0.80), (0.24, 0.86), (0.19, 1.04), (0.16, 1.12), (0.21, 1.26), (0.25, 1.36), (0.22, 1.44), (0.12, 1.5), (0.055, 1.52), (0.05, 1.58), (0.0, 1.6)]
    lathe(bm, col, prof, 20, lambda k, p: IVORY_LO if k in (0, 3) else IVORY)
    lathe(bm, col, [(0.165, 1.11), (0.168, 1.11), (0.168, 1.14), (0.165, 1.14)], 20, lambda k, p: GOLD)   # 줄자 띠(허리)
def mq_head(bm, col, uvl):
    blob(bm, col, (0, 1.68, 0), (0.11, 0.13, 0.11), IVORY, 12, 8, lambda u: IVORY if u > 0.3 else IVORY_LO)
def cape(bm, col, uvl):
    # 어깨선(y 0, 반원)에서 아래로 넓게 퍼짐, 뒤(-z) 쪽, 주름 = 반지름 출렁임
    R, n = 6, 18
    rows = []
    for j in range(R + 1):
        v = j / R; y = -1.0 * v; rr = 0.22 + 0.42 * v
        rows.append([bm.verts.new(V(math.cos(a) * rr * (1 + 0.06 * v * math.sin(a * 7)), y, -abs(math.sin(a)) * rr * (0.55 + 0.45 * v) - 0.04)) for a in [math.pi * i / n for i in range(n + 1)]])
    for j in range(R):
        for i in range(n):
            f = bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
            c = GOLD if j == R - 1 else (PINK_HI if i % 3 == 0 else PINK)
            for l in f.loops: l[col] = c
def skirt(bm, col, uvl):
    n = 28; rings = []
    for j, (y, r) in enumerate([(0.0, 0.22), (-0.25, 0.38), (-0.5, 0.52), (-0.7, 0.62)]):
        rings.append([bm.verts.new(V(math.cos(2 * math.pi * i / n) * r * (1 + (0.08 * math.sin(2 * math.pi * i / n * 9)) * j / 3), y, math.sin(2 * math.pi * i / n) * r * (1 + (0.08 * math.sin(2 * math.pi * i / n * 9)) * j / 3))) for i in range(n)])
    for j in range(3):
        for i in range(n):
            k = (i + 1) % n; f = bm.faces.new((rings[j][i], rings[j][k], rings[j + 1][k], rings[j + 1][i]))
            c = GOLD if j == 2 and False else (LILAC if (i // 2) % 2 else LILAC_LO)
            for l in f.loops: l[col] = c
    lathe(bm, col, [(0.6, -0.72), (0.63, -0.72), (0.63, -0.66), (0.6, -0.66)], n, lambda k, p: GOLD)
def crown(bm, col, uvl):
    n = 10
    for i in range(n):
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n; h = 0.1 if i % 2 == 0 else 0.05
        p = [(math.cos(a0) * 0.13, 0, math.sin(a0) * 0.13), (math.cos(a1) * 0.13, 0, math.sin(a1) * 0.13), (math.cos(a1) * 0.13, 0.03, math.sin(a1) * 0.13), (math.cos((a0 + a1) / 2) * 0.13, h, math.sin((a0 + a1) / 2) * 0.13), (math.cos(a0) * 0.13, 0.03, math.sin(a0) * 0.13)]
        face(bm, col, p, GOLD_HI if i % 2 == 0 else GOLD)
    blob(bm, col, (0, 0.07, -0.13), (0.03, 0.03, 0.02), (0.5, 0.9, 1.0, 1), 8, 5)
def hat(bm, col, uvl):
    lathe(bm, col, [(0.0, 0.0), (0.2, 0.0), (0.2, 0.012), (0.1, 0.02), (0.095, 0.17), (0.1, 0.18), (0.0, 0.18)], 18, lambda k, p: (0.25, 0.2, 0.32, 1) if k != 3 else PINK)

def main():
    FP.reset()
    spec = [('ds_blade', blade, False), ('ds_screw', screw, True), ('ds_needle', needle, True), ('ds_pin', pin, True), ('ds_jewel', jewel, False), ('ds_bow', bow, True),
            ('ds_mq_stand', mq_stand, True), ('ds_mq_torso', mq_torso, True), ('ds_mq_head', mq_head, True), ('ds_cape', cape, True), ('ds_skirt', skirt, True), ('ds_crown', crown, False), ('ds_hat', hat, True)]
    obs = [new_obj(n, f, sm) for n, f, sm in spec]
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(FP.TMP, 'fx_designer.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(FP.OUT, 'fx_designer.glb.json'), 'w'))
    for k, o in enumerate(obs): o.location.x = k * 2.6
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_designer.blend'), compress=True)
    print('tris', tris, 'total', sum(tris.values()), 'glb bytes', len(raw), flush=True)

if __name__ == '__main__':
    main()
