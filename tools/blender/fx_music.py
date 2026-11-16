"""음악가 2차 스킬 악기·환영 연주자 메시 (Blender bpy, headless, 2026-11-16 '마에스트로').

Usage:  python3 tools/blender/fx_music.py   ->  assets/fx/fx_music.glb.json  (+ tools/blender/music/fx_music.blend)

동화풍 판타지 악기: 본체 모양·재질(나무·금·은)이 보이게 정점 색으로 칠하고, 빛(현의 진동·음파·적중)은 게임 셰이더(js/musicfx.js)가 더함.
텍스처 없음. 움직이는 부품은 따로(활·심벌즈 한 장·하프 현 하나·연주자 팔) — 피벗 = 잡는 자리/관절, 게임이 손 위치에 붙여 움직임.

Meshes (game axes: +Y up, +Z forward, metres — 게임이 크기를 곱함)
  mu_violin   바이올린: 턱받침(원점) -> 스크롤 +z 1.0, 몸통 z 0..0.5 폭 0.36, 위 = +y(앞판). 현 4줄은 금빛 정점 색(게임이 진동을 그림)
  mu_bow      활: 손잡이(프로그) x 0 -> 끝 x 1, 말총은 -y 쪽 흰 선
  mu_cello    첼로: 끝핀 y 0 -> 스크롤 y 1.0, 몸통 y 0.06..0.55 폭 0.42, 앞 = +z
  mu_flute    플루트: 입 쪽 x 0 -> 끝 x 1(반지름 0.022), 취구판 x 0.08, 키 9
  mu_horn     나팔: 마우스피스 z 0 -> 나팔구 z 1(반지름 0.24), 가운데 감긴 관·밸브 3
  mu_bell     나팔구만(원점 = 좁은 쪽, +z로 0.6 벌어짐, 반지름 0.3) — 레조넌스 버스트·심포니 관악
  mu_cymbal   심벌즈 한 장: 반지름 1, 가운데 돔 + 손잡이 끈(+y 쪽), 두께 방향 = y
  mu_baton    지휘봉: 손잡이(원점) -> 끝 +z 1, 코르크 손잡이 0..0.16
  mu_harp     하프 틀: 기둥 x 0 (y 0..1), 위 곡선 목, 사선 공명판 (0.08,0.08)->(0.62,0.82); 현은 mu_string을 게임이 배치(HARP_* 식은 js/musicfx.js와 같음)
  mu_string   현 하나: y 0..1 가는 금빛 선
  mu_note     음표 ♪(머리 원점, 기둥 +y 1, 깃발), 두께 0.06       mu_note2  잇단 음표 ♫
  mu_moon     작은 초승달(반지름 1, xy 평면)       mu_petal  꽃잎(밑 원점 +y 1)
  mu_player   환영 연주자 상체(허리 y 0 -> 머리 꼭대기 y 1, 연미복 깃·리본 타이, 앞 +z)
  mu_arm      연주자 팔(원점 = 어깨, -y 쪽으로 0.42, 손 끝 공)
  mu_shard    깨진 오선 조각(x -0.5..0.5 가는 판 5줄)
json: {b64}
"""
import os, sys, math, json, base64
import bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import fx_pharm as FP
from fx_pharm import V, lathe, new_obj
from fx_herbal import ball, tube3, leafshape, mix
SRC = os.path.join(HERE, 'music'); os.makedirs(SRC, exist_ok=True)

WOOD, WOOD_HI, WOOD_LO = (0.72, 0.34, 0.12, 1), (0.92, 0.56, 0.24, 1), (0.40, 0.17, 0.06, 1)
EBONY, GOLD, GOLD_HI, GOLD_LO = (0.10, 0.07, 0.07, 1), (1.0, 0.76, 0.28, 1), (1.0, 0.93, 0.62, 1), (0.72, 0.46, 0.14, 1)
SILVER, SILVER_HI, SILVER_LO = (0.80, 0.84, 0.92, 1), (0.97, 0.99, 1.0, 1), (0.52, 0.56, 0.66, 1)
IVORY, STRING = (0.98, 0.95, 0.86, 1), (1.0, 0.90, 0.55, 1)
GHOST, GHOST_HI, GHOST_LO = (0.80, 0.78, 0.98, 1), (0.98, 0.96, 1.0, 1), (0.52, 0.50, 0.80, 1)
NAVY, RED = (0.20, 0.22, 0.46, 1), (0.86, 0.18, 0.24, 1)

def string_body(bm, col, L, W, D, ax):
    """바이올린·첼로 몸통: 위·아래 둥근 판 + 허리, ax(u, v) -> 게임 좌표 (u = 길이, v = 폭, w = 두께)"""
    def lobe(c, rw, rl):
        ball_pts = []
        seg, rows = 18, 8
        rings = []
        for j in range(rows + 1):
            th = math.pi * j / rows; ring = []
            for i in range(seg):
                a = 2 * math.pi * i / seg; nu, nv, nw = math.cos(a) * math.sin(th), math.sin(a) * math.sin(th), math.cos(th)
                ring.append((bm.verts.new(V(*ax(c + nu * rl, nv * rw, nw * D * (0.75 + 0.25 * (1 - abs(nw)))))), nw, nu))
            rings.append(ring)
        for j in range(rows):
            for i in range(seg):
                k = (i + 1) % seg; vs = (rings[j][i], rings[j + 1][i], rings[j + 1][k], rings[j][k])
                try: f = bm.faces.new([v for v, _, _ in vs])
                except ValueError: continue
                for l, (_, nw, nu) in zip(f.loops, vs): l[col] = WOOD_HI if nw > 0.55 and nu < 0.3 else WOOD if nw > -0.3 else WOOD_LO
        return ball_pts
    lobe(L * 0.27, W * 0.5, L * 0.27)        # 아래 큰 판
    lobe(L * 0.72, W * 0.42, L * 0.24)       # 위 판
    lobe(L * 0.5, W * 0.30, L * 0.12)        # 허리

def violin_like(bm, col, L, W, D, ax, neck=0.5, strings=4):
    string_body(bm, col, L, W, D, ax)
    P = lambda u, v, w: ax(u, v, w)
    tube3(bm, col, [P(L * 0.92, 0, D * 0.6), P(L * (1 + neck * 0.75), 0, D * 0.6)], 0.028 * L / 0.5, lambda k, a: EBONY, 8)            # 지판·목
    ball(bm, col, P(L * (1 + neck * 0.85), 0, D * 0.4), (0.05 * L / 0.5,) * 3, lambda nx, ny, nz: WOOD_LO, 10, 6)                       # 스크롤
    for s in (-1, 1):
        for k in (0.78, 0.86): tube3(bm, col, [P(L * (1 + neck * k), s * 0.03 * L / 0.5, D * 0.4), P(L * (1 + neck * k), s * 0.08 * L / 0.5, D * 0.4)], 0.009 * L / 0.5, lambda k, a: EBONY, 5)   # 줄감개
    tube3(bm, col, [P(L * 0.38, -W * 0.18, D * 1.02), P(L * 0.38, W * 0.18, D * 1.02)], 0.012 * L / 0.5, lambda k, a: IVORY, 5)            # 브리지
    tube3(bm, col, [P(L * 0.04, 0, D * 0.9), P(L * 0.16, 0, D * 1.05)], 0.02 * L / 0.5, lambda k, a: EBONY, 5)                          # 줄걸이판
    for i in range(strings):
        v = (i - (strings - 1) / 2) * 0.022 * L / 0.5
        tube3(bm, col, [P(L * 0.1, v, D * 1.08), P(L * 0.38, v, D * 1.1), P(L * (1 + neck * 0.75), v * 0.6, D * 0.7)], 0.0035 * L / 0.5, lambda k, a: STRING, 4)

def violin(bm, col, uvl):
    violin_like(bm, col, 0.5, 0.36, 0.045, lambda u, v, w: (v, w, u))

def cello(bm, col, uvl):
    violin_like(bm, col, 0.55, 0.42, 0.07, lambda u, v, w: (v, 0.06 + u, w), neck=0.6)
    tube3(bm, col, [(0, 0.0, 0), (0, 0.08, 0)], 0.01, lambda k, a: SILVER, 5)   # 끝핀

def bow(bm, col, uvl):
    tube3(bm, col, [(0, 0, 0), (0.5, 0.012, 0), (1.0, 0.0, 0)], [0.012, 0.009, 0.006], lambda k, a: WOOD_LO, 6)
    tube3(bm, col, [(0.04, -0.045, 0), (0.98, -0.012, 0)], 0.004, lambda k, a: IVORY, 4)
    ball(bm, col, (0.04, -0.025, 0), (0.035, 0.03, 0.014), lambda nx, ny, nz: EBONY, 8, 5)
    tube3(bm, col, [(-0.03, 0, 0), (0.0, 0, 0)], 0.014, lambda k, a: SILVER, 6)

def flute(bm, col, uvl):
    tube3(bm, col, [(0, 0, 0), (1.0, 0, 0)], 0.022, lambda k, a: SILVER_HI if a < 0.3 else SILVER, 12)
    ball(bm, col, (0.08, 0.02, 0), (0.035, 0.008, 0.022), lambda nx, ny, nz: SILVER_HI, 10, 5)
    for i in range(9): ball(bm, col, (0.3 + i * 0.065, 0.022, 0), (0.016, 0.008, 0.016), lambda nx, ny, nz: GOLD if i % 3 == 0 else SILVER_HI, 8, 4)
    tube3(bm, col, [(-0.01, 0, 0), (0.01, 0, 0)], 0.025, lambda k, a: GOLD, 10)

def bell_shape(bm, col, z0, L, r0, r1, colf):
    prof = []
    for i in range(13):
        k = i / 12; r = r0 + (r1 - r0) * (k ** 3.2); prof.append((r, z0 + k * L))
    prof += [(r1 * 0.96, z0 + L)]
    rings = []
    for (r, z) in prof:
        rings.append([bm.verts.new(V(math.cos(a) * r, math.sin(a) * r, z)) for a in [2 * math.pi * i / 20 for i in range(20)]])
    for j in range(len(rings) - 1):
        for i in range(20):
            k = (i + 1) % 20; f = bm.faces.new((rings[j][i], rings[j][k], rings[j + 1][k], rings[j + 1][i]))
            for l in f.loops: l[col] = colf(j / (len(rings) - 1))

def horn(bm, col, uvl):
    bell_shape(bm, col, 0.55, 0.45, 0.025, 0.24, lambda k: GOLD_HI if k > 0.9 else GOLD)
    tube3(bm, col, [(0, 0, 0), (0, 0, 0.55)], [0.012, 0.022], lambda k, a: GOLD, 8)
    tube3(bm, col, [(0, 0, 0.12), (0, -0.09, 0.18), (0, -0.09, 0.45), (0, 0, 0.5)], 0.02, lambda k, a: GOLD_LO, 8)
    for i in range(3): tube3(bm, col, [(0, 0.0, 0.26 + i * 0.06), (0, 0.08, 0.26 + i * 0.06)], 0.018, lambda k, a: GOLD_HI if k > 0.8 else SILVER, 8)

def bell(bm, col, uvl):
    bell_shape(bm, col, 0.0, 0.6, 0.03, 0.3, lambda k: GOLD_HI if k > 0.88 else mix(GOLD_LO, GOLD, k))
    tube3(bm, col, [(0, 0, -0.08), (0, 0, 0.02)], 0.03, lambda k, a: GOLD_LO, 8)

def cymbal(bm, col, uvl):
    P = [(0.0, 0.07), (0.12, 0.068), (0.2, 0.05), (0.26, 0.03), (0.5, 0.018), (0.8, 0.006), (1.0, 0.0), (0.99, -0.012), (0.8, -0.006), (0.5, 0.006), (0.26, 0.018), (0.2, 0.038), (0.12, 0.056), (0.0, 0.058)]
    lathe(bm, col, P, 32, lambda k, p: GOLD_HI if k in (0, 1, 5) else GOLD if k < 7 else GOLD_LO)
    tube3(bm, col, [(-0.08, 0.075, 0), (0, 0.12, 0), (0.08, 0.075, 0)], 0.018, lambda k, a: (0.44, 0.24, 0.12, 1), 6)

def baton(bm, col, uvl):
    tube3(bm, col, [(0, 0, 0), (0, 0, 0.16)], [0.03, 0.022], lambda k, a: (0.78, 0.6, 0.4, 1), 10)
    tube3(bm, col, [(0, 0, 0.16), (0, 0, 1.0)], [0.009, 0.003], lambda k, a: IVORY, 6)
    ball(bm, col, (0, 0, -0.01), (0.032, 0.032, 0.032), lambda nx, ny, nz: GOLD, 10, 6)

# 하프 식(게임과 같음): 공명판 (0.08, 0.08) -> (0.62, 0.82), 목 y_top(x) = 1.0 - 0.18 * sin(pi * x / 0.62) + 0.05 * x
def harp_top(x): return 1.0 - 0.18 * math.sin(math.pi * x / 0.62) + 0.05 * x
def harp(bm, col, uvl):
    tube3(bm, col, [(0, 0, 0), (0, 0.5, 0), (0, 1.0, 0)], [0.045, 0.035, 0.04], lambda k, a: GOLD if a < 0.5 else GOLD_HI, 10)                # 기둥
    ball(bm, col, (0, 1.04, 0), (0.06, 0.07, 0.06), lambda nx, ny, nz: GOLD_HI, 10, 6)
    tube3(bm, col, [(x, harp_top(x), 0) for x in [i * 0.62 / 10 for i in range(11)]], 0.03, lambda k, a: GOLD, 8)                          # 목
    tube3(bm, col, [(0.08, 0.08, 0), (0.62, 0.82, 0)], [0.06, 0.03], lambda k, a: WOOD_HI if a < 0.5 else WOOD, 10)                       # 공명판
    tube3(bm, col, [(-0.02, 0.02, 0), (0.14, 0.02, 0)], 0.04, lambda k, a: GOLD_LO, 8)                                                     # 받침
    tube3(bm, col, [(0.62, 0.82, 0), (0.64, 0.9, 0)], 0.026, lambda k, a: GOLD, 6)

def string(bm, col, uvl):
    tube3(bm, col, [(0, 0, 0), (0, 1, 0)], 0.006, lambda k, a: STRING, 4)

def note(bm, col, uvl):
    ball(bm, col, (0, 0, 0), (0.17, 0.12, 0.06), lambda nx, ny, nz: GOLD_HI if nz > 0.4 else GOLD, 12, 6)
    tube3(bm, col, [(0.15, 0.03, 0), (0.15, 1.0, 0)], 0.025, lambda k, a: GOLD, 6)
    tube3(bm, col, [(0.15, 1.0, 0), (0.3, 0.84, 0), (0.36, 0.62, 0), (0.3, 0.48, 0)], [0.04, 0.03, 0.022, 0.012], lambda k, a: GOLD_HI, 6)

def note2(bm, col, uvl):
    for x in (0, 0.5): ball(bm, col, (x, 0, 0), (0.15, 0.11, 0.06), lambda nx, ny, nz: GOLD_HI if nz > 0.4 else GOLD, 12, 6); tube3(bm, col, [(x + 0.13, 0.03, 0), (x + 0.13, 0.95, 0)], 0.022, lambda k, a: GOLD, 6)
    tube3(bm, col, [(0.13, 0.95, 0), (0.63, 0.95, 0)], 0.045, lambda k, a: GOLD_HI, 6)

def moon(bm, col, uvl):
    pts = [(math.cos(a) * 1.0, math.sin(a) * 1.0, 0) for a in [math.pi * (0.15 + 0.7 * i / 14) for i in range(15)]]
    tube3(bm, col, pts, [0.03 + 0.17 * math.sin(math.pi * i / 14) for i in range(15)], lambda k, a: SILVER_HI, 8)

def petal(bm, col, uvl):
    leafshape(bm, col, (0, 0, 0), (0, 1, 0), (1, 0, 0), 1.0, 0.42, (1.0, 0.98, 0.86, 1), (0.74, 0.96, 0.46, 1), th=0.02, curl=0.05)

def player(bm, col, uvl):
    lathe(bm, col, [(0.0, 0.0), (0.2, 0.0), (0.23, 0.18), (0.25, 0.4), (0.22, 0.55), (0.13, 0.62), (0.07, 0.66), (0.0, 0.67)], 18, lambda k, p: GHOST_LO if k == 0 else NAVY if k in (1, 2) else GHOST)
    ball(bm, col, (0, 0.82, 0), (0.15, 0.17, 0.15), lambda nx, ny, nz: GHOST_HI if nz > 0.2 else GHOST, 14, 9)
    for s in (-1, 1): tube3(bm, col, [(s * 0.02, 0.6, 0.12), (s * 0.13, 0.4, 0.2), (s * 0.12, 0.18, 0.22)], [0.02, 0.03, 0.035], lambda k, a: NAVY, 6)   # 연미복 깃
    for s in (-1, 1): ball(bm, col, (s * 0.06, 0.6, 0.18), (0.06, 0.035, 0.02), lambda nx, ny, nz: RED, 8, 5)   # 리본 타이
    ball(bm, col, (0, 0.6, 0.19), (0.025, 0.025, 0.02), lambda nx, ny, nz: RED, 6, 4)

def arm(bm, col, uvl):
    tube3(bm, col, [(0, 0, 0), (0, -0.2, 0.02), (0, -0.38, 0.04)], [0.055, 0.045, 0.04], lambda k, a: GHOST, 8)
    ball(bm, col, (0, -0.42, 0.045), (0.05, 0.05, 0.05), lambda nx, ny, nz: GHOST_HI, 8, 5)

def shard(bm, col, uvl):
    for i in range(5):
        y = (i - 2) * 0.09; tube3(bm, col, [(-0.5, y, 0), (-0.1, y + 0.02 * (i % 2), 0), (0.5, y - 0.03, 0)], 0.008, lambda k, a: GOLD_HI, 4)

def main():
    FP.reset()
    spec = [('mu_violin', violin), ('mu_bow', bow), ('mu_cello', cello), ('mu_flute', flute), ('mu_horn', horn), ('mu_bell', bell), ('mu_cymbal', cymbal),
            ('mu_baton', baton), ('mu_harp', harp), ('mu_string', string), ('mu_note', note), ('mu_note2', note2), ('mu_moon', moon), ('mu_petal', petal),
            ('mu_player', player), ('mu_arm', arm), ('mu_shard', shard)]
    flat = {'mu_petal', 'mu_shard'}
    obs = [new_obj(n, f, n not in flat) for n, f in spec]
    tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    glb = os.path.join(FP.TMP, 'fx_music.glb')
    bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_animations=False, export_vertex_color='ACTIVE')
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode()}, open(os.path.join(FP.OUT, 'fx_music.glb.json'), 'w'))
    for k, o in enumerate(obs): o.location.x = k * 1.6
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, 'fx_music.blend'), compress=True)
    print('tris', sum(tris.values()), tris, 'glb bytes', len(raw), flush=True)

if __name__ == '__main__':
    main()
