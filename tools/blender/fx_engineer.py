"""엔지니어 2차 병기·화기 부품 메시 (Blender bpy, headless, 2026-11-16).

Usage:  python3 tools/blender/fx_engineer.py   ->  assets/fx/fx_engineer.glb.json  (+ tools/blender/engineer/fx_engineer.blend)

규칙: 게임 축(+Y 위, +Z = 병기의 앞, 1 = 1 m). 부품마다 원점(피벗)을 실제 관절·회전축에 둠 — js/engfx.js 가 그 피벗으로 전개·조준·반동·
점등·덮개 개방을 런타임에 움직임(애니메이션 키는 없음). 텍스처 없음: 정점 색 = 금속(강철·어두운 강철)·구리 코일·황동·가죽·밝은 흰색(빛나는 부분 —
셰이더가 색을 곱함). 동화풍: 둥근 모서리 대신 큼직한 덩어리 + 띠·리벳.
  en_case      접힌 공구함 장치(던질 때·센트리 받침): 0.5 x 0.3 x 0.38, 바닥 원점, 위 손잡이
  en_leg       지지대(센트리 3·워커 X): 피벗 = 위 경첩, 아래(-Y) 0.62 + 발판
  en_head      센트리 머리(좌우 회전 피벗 = 바닥 가운데): 몸통 + 구리 코일 + 렌즈 자리
  en_barrel    포신(상하 피벗 = 포이(트러니언), +Z 0.62, 끝 머즐 브레이크)
  en_drum      속사 모듈 회전 탄창(축 X, 원점 가운데)        en_muzzle  확산 모듈 넓은 포구(+Z 0 .. 0.24 나팔꼴)
  en_fin       냉각판(피벗 = 아래 경첩, 위로 0.26)            en_lens    빛나는 렌즈·등(반지름 1 구, 흰색 — 색은 셰이더)
  en_casing    탄피(황동, 길이 0.06)                          en_slug    탄환(길쭉, +Z 1)
  en_spider    거미 지뢰 몸통(원판 r 0.3 + 돔)                en_sleg    거미 다리(피벗 = 엉덩이, 바깥 +X로 무릎 굽은 두 마디)
  en_drone     드론 몸통(+Z 앞, 아래 추진구)                  en_wing    드론 날개(피벗 = 뿌리, +X 0.42)
  en_pylon     전극(바닥 원점, 아래 뾰족 -0.32, 위 1.05)       en_coil    구리 코일 고리(축 Y, r 1 — 크기는 런타임)
  en_core      동력 코어 결정(r 1 팔면체 + 금속 띠)
  en_w_hull    워커 몸체(바닥 원점, 1.3 x 0.8 x 1.1)         en_w_plate 장갑판(피벗 = 윗변 경첩, 아래로 0.6)
  en_w_thigh   워커 넓적다리(피벗 = 엉덩이, 아래 0.85)        en_w_shin  정강이(피벗 = 무릎, 아래 0.9 + 발)
  en_w_gun     기관포 묶음(+Z 0.9, 피벗 = 뒤)                 en_w_rack  미사일 상자(바닥 원점, 구멍 4)   en_w_lid  상자 덮개(피벗 = 뒷변)
  en_w_cannon  주포(+Z 1.5, 피벗 = 뒤)                        en_missile 미사일(+Z 0.36, 원점 가운데)
  en_pile      파일 벙커 몸통(팔 옆, +Z 0.5, 피벗 = 뒤)       en_piston  피스톤(+Z 0.3)   en_stake  강철 말뚝(+Z 0.7, 끝 뾰족)
  en_breach    브리치 캐논(+Z 0.55 짧고 굵게, 탄약실 띠)       en_pod     벌집 포드(바닥 원점, 구멍 6)    en_pod_lid  벌집 덮개(피벗 = 윗뒷변)
  en_rail      레일 한 쪽(+Z 1.0, 피벗 = 뒤 가운데)            en_ring    코일 고리(축 Z, r 1)
  fx2 이펙트: en_fx_star 별·en_fx_gear 톱니·en_fx_nut 너트·en_fx_shard 파편(인스턴스 입자, 흰 정점 색) / en_fx_pillar 빛기둥(열린 원통 UV)·en_fx_helix 나선 띠
  en_beacon    정비 비콘(바닥 원점, 위 0.9 + 등 자리)          en_wrist   손목 단말(작은 판)   en_wrench  정비 드론 집게 팔(작은)
json: {b64}
"""
import os, sys, math, json, base64
import bpy, bmesh
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm as FP
from fx_pharm import V, new_obj
SRC = os.path.join(HERE, 'engineer'); os.makedirs(SRC, exist_ok=True)

STEEL, DARK, LIGHT, COPPER, BRASS, LEATHER, W, RED = (0.62, 0.67, 0.75, 1), (0.28, 0.31, 0.36, 1), (0.82, 0.86, 0.92, 1), (0.86, 0.5, 0.27, 1), (0.95, 0.76, 0.36, 1), (0.48, 0.31, 0.19, 1), (1, 1, 1, 1), (0.9, 0.2, 0.16, 1)

def paint(f, col, c):
    for l in f.loops: l[col] = c
def box(bm, col, c, s, color, rot=None):
    """axis box centred at c (game axes), size s; rot = (axis 'x'|'y'|'z', deg) about c"""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    P = [(-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz), (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)]
    if rot:
        ax, deg = rot; a = math.radians(deg); ca, sa = math.cos(a), math.sin(a)
        def R(p):
            x, y, z = p
            if ax == 'x': return (x, y * ca - z * sa, y * sa + z * ca)
            if ax == 'y': return (x * ca + z * sa, y, -x * sa + z * ca)
            return (x * ca - y * sa, x * sa + y * ca, z)
        P = [R(p) for p in P]
    vs = [bm.verts.new(V(c[0] + p[0], c[1] + p[1], c[2] + p[2])) for p in P]
    for idx in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)):
        paint(bm.faces.new([vs[i] for i in idx]), col, color)
def tube(bm, col, p0, p1, r0, r1=None, seg=12, color=STEEL, cap=True):
    """cylinder / cone from p0 to p1 (game axes)"""
    r1 = r0 if r1 is None else r1
    a, b = Vector(p0), Vector(p1); d = (b - a).normalized()
    u = d.cross(Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))).normalized(); v = d.cross(u)
    ring = lambda c, r: [bm.verts.new(V(*(c + (u * math.cos(2 * math.pi * i / seg) + v * math.sin(2 * math.pi * i / seg)) * r))) for i in range(seg)]
    A, B = ring(a, r0), ring(b, r1)
    for i in range(seg):
        j = (i + 1) % seg; paint(bm.faces.new([A[i], A[j], B[j], B[i]]), col, color)
    if cap:
        if r0 > 0: paint(bm.faces.new(list(reversed(A))), col, color)
        if r1 > 0: paint(bm.faces.new(B), col, color)
def torus(bm, col, R, r, axis='y', seg=20, sseg=6, color=COPPER, c=(0, 0, 0)):
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg; ring = []
        for k in range(sseg):
            b = 2 * math.pi * k / sseg; rr = R + r * math.cos(b); h = r * math.sin(b)
            p = (math.cos(a) * rr, h, math.sin(a) * rr) if axis == 'y' else (math.cos(a) * rr, math.sin(a) * rr, h) if axis == 'z' else (h, math.cos(a) * rr, math.sin(a) * rr)
            ring.append(bm.verts.new(V(c[0] + p[0], c[1] + p[1], c[2] + p[2])))
        rings.append(ring)
    for i in range(seg):
        for k in range(sseg):
            i2, k2 = (i + 1) % seg, (k + 1) % sseg
            paint(bm.faces.new([rings[i][k], rings[i2][k], rings[i2][k2], rings[i][k2]]), col, color)
def sphere(bm, col, r=1.0, c=(0, 0, 0), color=W, sub=2):
    ret = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in ret['verts']: v.co += Vector(V(*c))
    for f in {f for v in ret['verts'] for f in v.link_faces}: paint(f, col, color)
def octa(bm, col, r=1.0, color=W):
    P = [V(r, 0, 0), V(-r, 0, 0), V(0, r * 1.35, 0), V(0, -r * 1.35, 0), V(0, 0, r), V(0, 0, -r)]
    vs = [bm.verts.new(p) for p in P]
    for a, b, c in ((0, 2, 4), (4, 2, 1), (1, 2, 5), (5, 2, 0), (4, 3, 0), (1, 3, 4), (5, 3, 1), (0, 3, 5)): paint(bm.faces.new([vs[a], vs[b], vs[c]]), col, color)

def case(bm, col, uvl):
    box(bm, col, (0, 0.15, 0), (0.5, 0.3, 0.38), STEEL); box(bm, col, (0, 0.31, 0), (0.52, 0.03, 0.4), DARK)
    box(bm, col, (0, 0.15, 0.195), (0.3, 0.12, 0.02), COPPER)
    for x in (-0.12, 0.12): box(bm, col, (x, 0.38, 0), (0.03, 0.12, 0.04), DARK)
    box(bm, col, (0, 0.44, 0), (0.27, 0.03, 0.04), LEATHER)
def leg(bm, col, uvl):
    tube(bm, col, (0, 0, 0), (0, -0.6, 0), 0.035, 0.03, 8, DARK); box(bm, col, (0, -0.62, 0.03), (0.12, 0.03, 0.16), STEEL); sphere(bm, col, 0.05, (0, 0, 0), COPPER, 1)
def head(bm, col, uvl):
    box(bm, col, (0, 0.14, -0.04), (0.34, 0.24, 0.4), STEEL); box(bm, col, (0, 0.27, -0.04), (0.36, 0.03, 0.42), LIGHT)
    torus(bm, col, 0.1, 0.025, 'z', 14, 5, COPPER, (0, 0.14, -0.26)); tube(bm, col, (0, 0.14, -0.24), (0, 0.14, -0.3), 0.07, 0.07, 10, DARK)
    for x in (-0.19, 0.19): tube(bm, col, (x, 0.16, 0), (x * 1.15, 0.16, 0), 0.05, 0.05, 8, DARK)
def barrel(bm, col, uvl):
    for x in (-0.06, 0.06): tube(bm, col, (x, 0, 0), (x, 0, 0.6), 0.035, 0.035, 10, DARK)
    box(bm, col, (0, 0, 0.12), (0.2, 0.1, 0.22), STEEL); box(bm, col, (0, 0, 0.6), (0.22, 0.09, 0.07), LIGHT)
    for x in (-0.06, 0.06): tube(bm, col, (x, 0, 0.56), (x, 0, 0.64), 0.045, 0.05, 10, STEEL)
def drum(bm, col, uvl):
    tube(bm, col, (-0.07, 0, 0), (0.07, 0, 0), 0.14, 0.14, 16, BRASS)
    for i in range(6): a = i / 6 * 2 * math.pi; tube(bm, col, (-0.075, math.sin(a) * 0.09, math.cos(a) * 0.09), (0.075, math.sin(a) * 0.09, math.cos(a) * 0.09), 0.025, 0.025, 6, DARK)
def muzzle(bm, col, uvl):
    tube(bm, col, (0, 0, 0), (0, 0, 0.24), 0.07, 0.17, 14, LIGHT, cap=False); torus(bm, col, 0.17, 0.015, 'z', 16, 4, COPPER, (0, 0, 0.24))
def fin(bm, col, uvl):
    for k in range(3): box(bm, col, (0, 0.13, -0.05 + k * 0.05), (0.2, 0.26, 0.012), LIGHT)
    box(bm, col, (0, 0.01, 0), (0.22, 0.02, 0.14), DARK)
def lens(bm, col, uvl): sphere(bm, col, 1.0, (0, 0, 0), W, 1)
def casing(bm, col, uvl): tube(bm, col, (0, 0, -0.03), (0, 0, 0.03), 0.012, 0.012, 6, BRASS)
def slug(bm, col, uvl): tube(bm, col, (0, 0, -0.5), (0, 0, 0.3), 0.18, 0.22, 8, W); tube(bm, col, (0, 0, 0.3), (0, 0, 0.5), 0.22, 0.0, 8, W, cap=False)
def spider(bm, col, uvl):
    tube(bm, col, (0, 0.04, 0), (0, 0.13, 0), 0.3, 0.3, 18, STEEL); tube(bm, col, (0, 0.13, 0), (0, 0.2, 0), 0.3, 0.2, 18, LIGHT, cap=False)
    tube(bm, col, (0, 0.2, 0), (0, 0.22, 0), 0.2, 0.0, 18, LIGHT, cap=False); torus(bm, col, 0.3, 0.02, 'y', 18, 4, COPPER, (0, 0.13, 0))
def sleg(bm, col, uvl):
    tube(bm, col, (0, 0, 0), (0.22, 0.12, 0), 0.025, 0.022, 6, DARK); sphere(bm, col, 0.035, (0.22, 0.12, 0), COPPER, 1); tube(bm, col, (0.22, 0.12, 0), (0.34, -0.12, 0), 0.022, 0.012, 6, DARK)
def drone(bm, col, uvl):
    box(bm, col, (0, 0, 0), (0.22, 0.12, 0.34), STEEL); box(bm, col, (0, 0.07, -0.02), (0.18, 0.03, 0.26), LIGHT)
    tube(bm, col, (0, -0.06, -0.12), (0, -0.1, -0.12), 0.06, 0.04, 10, COPPER); tube(bm, col, (0, 0, 0.17), (0, 0, 0.3), 0.025, 0.02, 8, DARK)
def wing(bm, col, uvl):
    P = [(0, 0, -0.08), (0.42, 0, -0.03), (0.42, 0, 0.03), (0, 0, 0.1)]
    vs = [bm.verts.new(V(*p)) for p in P]; paint(bm.faces.new(vs), col, LIGHT)
    vs2 = [bm.verts.new(V(p[0], p[1] - 0.012, p[2])) for p in reversed(P)]; paint(bm.faces.new(vs2), col, STEEL)
    tube(bm, col, (0.38, 0.02, 0), (0.38, -0.03, 0), 0.04, 0.04, 8, COPPER)
def pylon(bm, col, uvl):
    tube(bm, col, (0, -0.32, 0), (0, 0, 0), 0.0, 0.07, 8, DARK, cap=False); tube(bm, col, (0, 0, 0), (0, 0.9, 0), 0.07, 0.05, 8, STEEL)
    box(bm, col, (0, 0.04, 0), (0.22, 0.08, 0.22), DARK); tube(bm, col, (0, 0.9, 0), (0, 1.05, 0), 0.05, 0.0, 8, LIGHT, cap=False)
def coil(bm, col, uvl): torus(bm, col, 1.0, 0.16, 'y', 20, 6, COPPER)
def core(bm, col, uvl): octa(bm, col, 1.0, W)
def w_hull(bm, col, uvl):
    box(bm, col, (0, 0.4, 0), (1.3, 0.8, 1.1), STEEL); box(bm, col, (0, 0.82, -0.05), (1.2, 0.06, 1.0), LIGHT)
    box(bm, col, (0, 0.4, 0.56), (0.7, 0.42, 0.04), DARK); torus(bm, col, 0.22, 0.04, 'z', 16, 5, COPPER, (0, 0.4, 0.59))
    for x in (-0.5, 0.5):
        for z in (-0.4, 0.4): sphere(bm, col, 0.03, (x, 0.79, z), BRASS, 1)
    box(bm, col, (-0.45, 0.95, -0.42), (0.18, 0.26, 0.18), DARK)                      # exhaust stack
def w_plate(bm, col, uvl): box(bm, col, (0, -0.3, 0.02), (0.6, 0.6, 0.05), LIGHT); box(bm, col, (0, -0.3, 0.05), (0.4, 0.06, 0.02), COPPER)
def w_thigh(bm, col, uvl): sphere(bm, col, 0.13, (0, 0, 0), COPPER, 1); box(bm, col, (0, -0.42, 0), (0.2, 0.8, 0.24), STEEL)
def w_shin(bm, col, uvl):
    sphere(bm, col, 0.11, (0, 0, 0), DARK, 1); box(bm, col, (0, -0.42, 0.02), (0.18, 0.8, 0.2), DARK); box(bm, col, (0, -0.88, 0.08), (0.36, 0.08, 0.52), STEEL)
    tube(bm, col, (0, -0.2, 0.12), (0, -0.7, 0.12), 0.03, 0.03, 6, BRASS)
def w_gun(bm, col, uvl):
    box(bm, col, (0, 0, 0.12), (0.26, 0.26, 0.28), DARK)
    for i in range(6): a = i / 6 * 2 * math.pi; tube(bm, col, (math.cos(a) * 0.07, math.sin(a) * 0.07, 0.2), (math.cos(a) * 0.07, math.sin(a) * 0.07, 0.9), 0.025, 0.025, 6, STEEL)
    torus(bm, col, 0.1, 0.02, 'z', 12, 4, BRASS, (0, 0, 0.84))
def w_rack(bm, col, uvl):
    box(bm, col, (0, 0.15, 0), (0.56, 0.3, 0.5), STEEL)
    for x in (-0.13, 0.13):
        for z in (-0.12, 0.12): tube(bm, col, (x, 0.24, z), (x, 0.305, z), 0.075, 0.075, 10, DARK)
def w_lid(bm, col, uvl): box(bm, col, (0, 0.02, 0.26), (0.58, 0.04, 0.52), LIGHT)
def w_cannon(bm, col, uvl):
    box(bm, col, (0, 0, 0.15), (0.34, 0.34, 0.36), STEEL); tube(bm, col, (0, 0, 0.3), (0, 0, 1.45), 0.1, 0.085, 14, DARK)
    for z in (0.5, 0.9): torus(bm, col, 0.11, 0.025, 'z', 14, 4, COPPER, (0, 0, z))
    tube(bm, col, (0, 0, 1.4), (0, 0, 1.55), 0.13, 0.13, 14, LIGHT)
def missile(bm, col, uvl):
    tube(bm, col, (0, 0, -0.18), (0, 0, 0.12), 0.04, 0.04, 8, LIGHT); tube(bm, col, (0, 0, 0.12), (0, 0, 0.2), 0.04, 0.0, 8, RED, cap=False)
    for a in range(4): ang = a * math.pi / 2; box(bm, col, (math.cos(ang) * 0.05, math.sin(ang) * 0.05, -0.15), (0.06 if a % 2 == 0 else 0.01, 0.01 if a % 2 == 0 else 0.06, 0.06), DARK)
def pile(bm, col, uvl):
    box(bm, col, (0, 0, 0.22), (0.18, 0.2, 0.5), STEEL); box(bm, col, (0, 0.11, 0.22), (0.2, 0.03, 0.52), LIGHT)
    for z in (0.05, 0.4): box(bm, col, (0, 0, z), (0.22, 0.22, 0.04), LEATHER)
    torus(bm, col, 0.07, 0.02, 'z', 12, 4, COPPER, (0, 0, 0.47))
def piston(bm, col, uvl): tube(bm, col, (0, 0, 0), (0, 0, 0.3), 0.055, 0.055, 10, BRASS)
def stake(bm, col, uvl): tube(bm, col, (0, 0, 0), (0, 0, 0.55), 0.045, 0.045, 8, LIGHT); tube(bm, col, (0, 0, 0.55), (0, 0, 0.72), 0.045, 0.0, 8, LIGHT, cap=False)
def breach(bm, col, uvl):
    box(bm, col, (0, 0, 0.08), (0.3, 0.3, 0.26), STEEL); tube(bm, col, (0, 0, 0.2), (0, 0, 0.55), 0.13, 0.15, 14, DARK)
    torus(bm, col, 0.155, 0.03, 'z', 14, 4, COPPER, (0, 0, 0.55)); box(bm, col, (0, -0.18, 0.05), (0.06, 0.16, 0.08), LEATHER)
def pod(bm, col, uvl):
    box(bm, col, (0, 0.2, 0), (0.42, 0.4, 0.34), STEEL)
    for i in range(3):
        for j in range(2): tube(bm, col, (-0.13 + i * 0.13, 0.3 + j * 0.0, -0.08 + j * 0.16), (-0.13 + i * 0.13, 0.405, -0.08 + j * 0.16), 0.05, 0.05, 6, DARK)
    for x in (-0.15, 0.15): box(bm, col, (x, 0.16, -0.18), (0.04, 0.24, 0.04), LEATHER)
def pod_lid(bm, col, uvl): box(bm, col, (0, 0.015, 0.17), (0.44, 0.03, 0.34), LIGHT); box(bm, col, (0, 0.035, 0.17), (0.3, 0.012, 0.04), COPPER)
def rail(bm, col, uvl): box(bm, col, (0, 0, 0.5), (0.05, 0.14, 1.0), LIGHT); box(bm, col, (0.03, 0, 0.5), (0.02, 0.06, 0.96), COPPER)
def ring(bm, col, uvl): torus(bm, col, 1.0, 0.14, 'z', 20, 6, COPPER)
def beacon(bm, col, uvl):
    tube(bm, col, (0, -0.2, 0), (0, 0, 0), 0.0, 0.06, 8, DARK, cap=False); tube(bm, col, (0, 0, 0), (0, 0.75, 0), 0.06, 0.04, 8, STEEL)
    box(bm, col, (0, 0.06, 0), (0.24, 0.1, 0.24), DARK); torus(bm, col, 0.12, 0.025, 'y', 14, 4, COPPER, (0, 0.6, 0)); tube(bm, col, (0, 0.75, 0), (0, 0.8, 0), 0.09, 0.09, 10, LIGHT)
def wrist(bm, col, uvl): box(bm, col, (0, 0, 0), (0.12, 0.03, 0.09), DARK); box(bm, col, (0, 0.017, 0), (0.09, 0.006, 0.065), (0.4, 0.9, 1, 1))
def wrench(bm, col, uvl): tube(bm, col, (0, 0, 0), (0, 0, 0.22), 0.012, 0.012, 6, STEEL); box(bm, col, (0, 0, 0.24), (0.06, 0.02, 0.05), LIGHT)

# --- fx2(2026-11-17) 이펙트 메시: 인스턴스 입자(정점 색 흰색 — 색은 셰이더 aC) + 빛기둥
WLO = (0.72, 0.74, 0.78, 1)
def fxstar(bm, col, uvl):
    """통통한 다섯 꼭지 별: 반지름 1, 두께 ±0.32"""
    c_top = bm.verts.new(V(0, 0.32, 0)); c_bot = bm.verts.new(V(0, -0.32, 0)); rg = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5; r = 1.0 if i % 2 == 0 else 0.46
        rg.append(bm.verts.new(V(math.cos(a) * r, 0, math.sin(a) * r)))
    for i in range(10):
        j = (i + 1) % 10
        for f in (bm.faces.new((c_top, rg[i], rg[j])), bm.faces.new((c_bot, rg[j], rg[i]))):
            for l in f.loops: l[col] = W if l.vert in (c_top, c_bot) else WLO
def fxgear(bm, col, uvl):
    """톱니바퀴 조각: 바깥 반지름 1(톱니 끝), 안 구멍 0.36, 두께 0.3, 톱니 8"""
    N = 32; h = 0.15; outer = []; inner = []
    for i in range(N):
        a = 2 * math.pi * i / N; tooth = (i // 2) % 2 == 0; r = 1.0 if tooth else 0.78
        outer.append((math.cos(a) * r, math.sin(a) * r)); inner.append((math.cos(a) * 0.36, math.sin(a) * 0.36))
    vo = [[bm.verts.new(V(x, y_, z)) for (x, z) in outer] for y_ in (-h, h)]; vi = [[bm.verts.new(V(x, y_, z)) for (x, z) in inner] for y_ in (-h, h)]
    for i in range(N):
        j = (i + 1) % N
        for f, c in ((bm.faces.new((vo[0][i], vo[0][j], vo[1][j], vo[1][i])), WLO), (bm.faces.new((vi[0][j], vi[0][i], vi[1][i], vi[1][j])), WLO),
                     (bm.faces.new((vo[1][i], vo[1][j], vi[1][j], vi[1][i])), W), (bm.faces.new((vo[0][j], vo[0][i], vi[0][i], vi[0][j])), W)):
            paint(f, col, c)
def fxnut(bm, col, uvl):
    """육각 너트: 바깥 1, 구멍 0.45, 두께 0.5"""
    N = 6; h = 0.25
    vo = [[bm.verts.new(V(math.cos(2 * math.pi * i / N), y_, math.sin(2 * math.pi * i / N))) for i in range(N)] for y_ in (-h, h)]
    vi = [[bm.verts.new(V(0.45 * math.cos(2 * math.pi * i / N), y_, 0.45 * math.sin(2 * math.pi * i / N))) for i in range(N)] for y_ in (-h, h)]
    for i in range(N):
        j = (i + 1) % N
        for f, c in ((bm.faces.new((vo[0][i], vo[0][j], vo[1][j], vo[1][i])), WLO), (bm.faces.new((vi[0][j], vi[0][i], vi[1][i], vi[1][j])), WLO),
                     (bm.faces.new((vo[1][i], vo[1][j], vi[1][j], vi[1][i])), W), (bm.faces.new((vo[0][j], vo[0][i], vi[0][i], vi[0][j])), W)):
            paint(f, col, c)
def fxshard(bm, col, uvl):
    """금속 파편: 납작한 쐐기, 길이 1"""
    P = [(0, 0, 0), (0.32, 0.05, 0.25), (0.1, 0.0, 1.0), (-0.22, 0.04, 0.5)]
    a = [bm.verts.new(V(*p)) for p in P]; b = [bm.verts.new(V(p[0], p[1] + 0.09, p[2])) for p in P]
    paint(bm.faces.new(a[::-1]), col, WLO); paint(bm.faces.new(b), col, W)
    for i in range(4):
        j = (i + 1) % 4; paint(bm.faces.new((a[i], a[j], b[j], b[i])), col, WLO)
def fxpillar(bm, col, uvl):
    """빛기둥: 열린 원통 반지름 1, y 0 .. 1, UV u = 둘레, v = 높이"""
    S = 32; lo = [bm.verts.new(V(math.cos(2 * math.pi * i / S), 0, math.sin(2 * math.pi * i / S))) for i in range(S)]
    hi = [bm.verts.new(V(math.cos(2 * math.pi * i / S), 1, math.sin(2 * math.pi * i / S))) for i in range(S)]
    for i in range(S):
        j = (i + 1) % S; f = bm.faces.new((lo[i], lo[j], hi[j], hi[i])); u0, u1 = i / S, (i + 1) / S
        for l, uv in zip(f.loops, ((u0, 0), (u1, 0), (u1, 1), (u0, 1))): l[col] = W; l[uvl].uv = uv
def fxhelix(bm, col, uvl):
    """나선 띠: 반지름 1, y 0 .. 1, 2바퀴, UV u = 길이, v = 폭"""
    N = 64; turns = 2.0; w = 0.06; prev = None
    for i in range(N + 1):
        t = i / N; a = t * turns * 2 * math.pi; x, z = math.cos(a), math.sin(a)
        cur = (bm.verts.new(V(x, t - w, z)), bm.verts.new(V(x, t + w, z)))
        if prev:
            f = bm.faces.new((prev[0], cur[0], cur[1], prev[1])); t0 = (i - 1) / N
            for l, uv in zip(f.loops, ((t0, 0), (t, 0), (t, 1), (t0, 1))): l[col] = W; l[uvl].uv = uv
        prev = cur

PARTS = [('en_case', case), ('en_leg', leg), ('en_head', head), ('en_barrel', barrel), ('en_drum', drum), ('en_muzzle', muzzle), ('en_fin', fin), ('en_lens', lens),
         ('en_casing', casing), ('en_slug', slug), ('en_spider', spider), ('en_sleg', sleg), ('en_drone', drone), ('en_wing', wing), ('en_pylon', pylon), ('en_coil', coil),
         ('en_core', core), ('en_w_hull', w_hull), ('en_w_plate', w_plate), ('en_w_thigh', w_thigh), ('en_w_shin', w_shin), ('en_w_gun', w_gun), ('en_w_rack', w_rack),
         ('en_w_lid', w_lid), ('en_w_cannon', w_cannon), ('en_missile', missile), ('en_pile', pile), ('en_piston', piston), ('en_stake', stake), ('en_breach', breach),
         ('en_pod', pod), ('en_pod_lid', pod_lid), ('en_rail', rail), ('en_ring', ring), ('en_beacon', beacon), ('en_wrist', wrist), ('en_wrench', wrench),
         ('en_fx_star', fxstar), ('en_fx_gear', fxgear), ('en_fx_nut', fxnut), ('en_fx_shard', fxshard), ('en_fx_pillar', fxpillar), ('en_fx_helix', fxhelix)]
FLAT = {'en_case', 'en_head', 'en_barrel', 'en_fin', 'en_drone', 'en_wing', 'en_w_hull', 'en_w_plate', 'en_w_thigh', 'en_w_shin', 'en_w_rack', 'en_w_lid', 'en_pile', 'en_pod', 'en_pod_lid', 'en_rail', 'en_beacon', 'en_wrist', 'en_core', 'en_case', 'en_w_gun', 'en_w_cannon', 'en_breach', 'en_missile', 'en_fx_star', 'en_fx_gear', 'en_fx_nut', 'en_fx_shard', 'en_fx_pillar', 'en_fx_helix'}

def main():
    FP.reset()
    obs = [new_obj(n, f, n not in FLAT) for n, f in PARTS]
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(FP.TMP, 'fx_engineer.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(FP.OUT, 'fx_engineer.glb.json'), 'w'))
    for k, o in enumerate(obs): o.location.x = (k % 8) * 1.6; o.location.y = (k // 8) * 1.6
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_engineer.blend'), compress=True)
    print('parts', len(obs), 'tris', sum(tris.values()), tris, 'glb bytes', len(raw), flush=True)

if __name__ == '__main__':
    main()
