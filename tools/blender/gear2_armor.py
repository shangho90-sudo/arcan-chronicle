"""직업별 방어구 88개(ag_<계열>_<단계>, 2026-11-17)의 땅에 떨어진 3D 모델 + 128 px 아이콘 — Blender 파라메트릭 조립.
방어구를 입어도 캐릭터 몸은 바뀌지 않으므로 이 모델은 '땅에 떨어진 모습'과 아이콘에만 쓰임(js/items3d.js gearModel → gearArmor).

계열(13) = 한 가족: 옷 실루엣(로브·조끼·앞치마·갑옷·코트·연미복…)과 주색·장식 모양이 같고, 단계가 오르면
  1 기본 옷 + 계열 색 단 → 2 가슴 보석 브로치 → 3 흘러내리는 리본 → 4 계열 정령 문장(가슴) + 구슬 줄 + 은테
  → 5 빛나는 핵 보석 + 어깨 장식 → 6(드롭) 큰 어깨 날개/깃/뿔(계열 모양) + 금테 전부 + 둘째 보석 고리
  → 7(드롭 전설) 등 뒤 후광 관 + 여러 갈래 리본 + 핵에 아스텔의 '용의 눈' 문양.
  견습생 4단계는 1·2·3·5에 대응(STAGE_MAP).
계열 정령 문장: Tripo 초안 9개($RAW/emb_<계열>.glb, tools/tripo/gear2_armor.py) → 용접 → 조각 제거 → 줄이기 → 텍스처 색을 정점 색으로.
  별씨앗·수정 연금·옥영지·뇌정 태엽 4계열은 절차 문장(별·결정·영지 갓·톱니+번개). 초안이 없으면 절차 대체(보석 액자).
결과: assets/items/ag_*.glb.json(정점 색만·이미지 없음, ≤ 2000 삼각형, 바닥 원점, 앞 = glTF +Z) + assets/ui/items/ag_*.png(128 px,
  Cycles 렌더 → 가는 어두운 외곽선·부드러운 그림자·단계 빛무리(판매 = 금/하늘, 드롭 = 보라), 투명 배경)
  + 확인용 /tmp/gear2/arm/<id>_3d.png(내보낸 GLB를 다시 읽어 게임 시점에서 찍음).
Usage: python3 tools/blender/gear2_armor.py [계열|id ...]   (인자 없이 = 88개 모두; RAW 기본 /home/claude/gear2_3d; NOICON=1 모델만; NO3D=1 확인 렌더 생략)"""
import base64, json, math, os, random, sys, tempfile
import bpy, bmesh
from mathutils import Vector, Matrix
from PIL import Image, ImageFilter, ImageChops, ImageEnhance, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
RAW = os.environ.get('RAW', '/home/claude/gear2_3d')
ICONS = os.path.join(ROOT, 'assets', 'ui', 'items'); MODELS = os.path.join(ROOT, 'assets', 'items')
CHECK = os.environ.get('CHECK', '/tmp/gear2/arm'); os.makedirs(CHECK, exist_ok=True)
TRI_MAX = 2000; EMB_TRIS = 420
EMB_YAW = {}                               # 계열별 앞 방향 보정(도)
ICON = 128
ICON = 128
sys.path.insert(0, os.path.join(ROOT, 'tools', 'gear')); import designs  # noqa: E402

def hx(h, k=1.0):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(min(1, max(0, v * k)) for v in c)
def mix(a, b, t): return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))
GOLD = hx('#e8b84a'); SILVER = hx('#d9dde6'); DARK = hx('#2a2230'); WHITE = hx('#f6f3ec')

# ---------------------------------------------------------------- 계열 스타일
# body/sec/acc/gem = 몸통·둘째 천·장식·보석 색. g = 옷 종류, hem = 앞자락 높이(목 1.0), back = 뒷자락(연미복), flare = 단 너비,
# sleeve = 'short'|'wide'|'cap'(갑옷 어깨), over = 겉옷 껍데기(앞 트임) 정보, apron, cape, collar, sash, crest = 6단계 어깨 장식 모양,
# emb = 문장('tripo' 또는 절차 이름), pat = 1단계 무늬(점 색), extra = 계열 고유 소품
S = {
 'nov': dict(body='#f3ead2', sec='#8a5a32', acc='#7cc6f0', gem='#7cc6f0', hem=0.18, flare=0.33, sleeve='short',
             over=dict(col='#8a5a32', top=0.9, hem=0.32, gap=0.55), sash='#6a4426', cape='#7cc6f0', crest='leaf', crestcol='#9ad86a', emb='star', collar='#e8b84a'),
 'pharm': dict(body='#a8d86a', sec='#f5eedb', acc='#e0b04a', gem='#bfeaff', hem=-0.45, flare=0.44, sleeve='short',
               apron=dict(col='#f5eedb', top=0.78, hem=-0.25, pocket='#8ab854'), collar='#f5eedb', crest='antler', crestcol='#fbf6ea', emb='tripo', pat='#f5eedb'),
 'smith': dict(body='#3a3438', sec='#7a4a2a', acc='#c8302a', gem='#ff9a3a', hem=0.28, flare=0.3, sleeve='cap', armor=True,
               apron=dict(col='#6e4426', top=0.56, hem=-0.3, pocket='#4e2e1a', w=0.58), collar='#c8302a', crest='flame', crestcol='#ff7a2a', emb='tripo', chain=True),
 'cook': dict(body='#f2f4f6', sec='#2fb3a8', acc='#ff7f6a', gem='#2fb3a8', hem=0.05, flare=0.34, sleeve='short', buttons2=True,
              apron=dict(col='#2fb3a8', top=0.5, hem=-0.3, pocket='#249a90'), collar='#2fb3a8', crest='fin', crestcol='#5fd8c8', emb='tripo'),
 'hair': dict(body='#f7f5f2', sec='#c8ccd6', acc='#e86a8e', gem='#e86a8e', hem=0.08, flare=0.33, sleeve='short',
              over=dict(col='#f7f5f2', top=0.95, hem=0.02, gap=0.5, lapel='#e86a8e'), inner='#c8ccd6', crest='feather', crestcol='#fdfbff', emb='tripo', collar='#e86a8e'),
 'art': dict(body='#a98be0', sec='#8a5ad0', acc='#e6b54a', gem='#5ad0e6', hem=0.0, flare=0.4, sleeve='short', splat=True,
             cape='#6a3ab0', collar='#e6b54a', crest='wing', crestcol='#5ad0e6', emb='tripo'),
 'wpharm': dict(body='#eef2f6', sec='#22b8b0', acc='#e4e7ec', gem='#aee6ff', hem=-0.42, flare=0.38, sleeve='short',
                over=dict(col='#f4f7fa', top=0.95, hem=-0.42, gap=0.42, lapel='#c8d0dc'), inner='#22b8b0', bandolier=True, crest='crystal', crestcol='#aee6ff', emb='crystal', collar='#c8d0dc'),
 'herb': dict(body='#3fae7a', sec='#2e2420', acc='#e0442e', gem='#3fae7a', hem=-0.5, flare=0.46, sleeve='wide', cross=True,
              sash='#e0442e', crest='antler', crestcol='#d9c08a', emb='lingzhi', collar='#2e2420', knot=True),
 'eng': dict(body='#24346e', sec='#d6a540', acc='#d6a540', gem='#6ad8ff', hem=0.22, flare=0.31, sleeve='cap', armor=True,
             sash='#5a3e22', toolbelt=True, crest='gear', crestcol='#d6a540', emb='gear', collar='#d6a540', goggles=True),
 'chef': dict(body='#f8f6f2', sec='#d2283a', acc='#e9b440', gem='#d2283a', hem=-0.22, flare=0.36, sleeve='short', buttons2=True,
              collar='#d2283a', scarf='#d2283a', crest='tail', crestcol='#ff6a3a', emb='tripo'),
 'design': dict(body='#4a3a8a', sec='#d8dce6', acc='#e8a88a', gem='#d8dce6', hem=-0.32, flare=0.5, sleeve='short', highcollar='#d8dce6',
                crest='moth', crestcol='#c8c0f0', emb='tripo', collar='#e8a88a'),
 'paint': dict(body='#1e1c22', sec='#e8b848', acc='#e04a2e', gem='#e8b848', hem=-0.5, flare=0.46, sleeve='wide', cross=True,
               sash='#e04a2e', crest='cloud', crestcol='#3a3640', emb='tripo', collar='#e8b848', knot=True),
 'music': dict(body='#22306a', sec='#d8dce8', acc='#b89ae8', gem='#b89ae8', hem=0.36, back=-0.42, flare=0.3, sleeve='short',
               over=dict(col='#22306a', top=0.95, hem=0.36, gap=0.4, lapel='#d8dce8'), inner='#d8dce8', cravat='#b89ae8', crest='bird', crestcol='#d8dce8', emb='tripo', collar='#d8dce8'),
}
STAGE_MAP = {4: [1, 2, 3, 5]}            # 견습생 4단계 → 공통 7단계 진화 칸

# ---------------------------------------------------------------- 메시 조립 (모든 부분 = (verts, faces, colours, glow))
class Part:
    def __init__(s): s.v = []; s.f = []; s.c = []; s.g = []
    def add(s, verts, faces, col, glow=0.0):
        o = len(s.v); s.v += [Vector(v) for v in verts]
        for f in faces: s.f.append(tuple(i + o for i in f)); s.c.append(col if not callable(col) else col(f, verts)); s.g.append(glow)
    def tris(s): return sum(len(f) - 2 for f in s.f)

def xf(verts, M): return [M @ Vector(v) for v in verts]
def sphere(P, c, r, col, seg=8, rings=5, M=None, glow=0.0):
    """UV 구(크기 r = (rx, ry, rz)), M = 추가 변환(가운데 기준)"""
    rx, ry, rz = r if isinstance(r, (tuple, list)) else (r, r, r)
    vs = [(0, 0, rz)] + [(rx * math.sin(math.pi * i / rings) * math.cos(2 * math.pi * j / seg), ry * math.sin(math.pi * i / rings) * math.sin(2 * math.pi * j / seg), rz * math.cos(math.pi * i / rings))
                         for i in range(1, rings) for j in range(seg)] + [(0, 0, -rz)]
    fs = [(0, 1 + (j + 1) % seg, 1 + j) for j in range(seg)]
    for i in range(rings - 2):
        for j in range(seg):
            a = 1 + i * seg + j; b = 1 + i * seg + (j + 1) % seg; fs.append((a, b, b + seg, a + seg))
    last = len(vs) - 1; base = 1 + (rings - 2) * seg
    fs += [(last, base + j, base + (j + 1) % seg) for j in range(seg)]
    M = (Matrix.Translation(c) @ (M or Matrix()))
    P.add(xf(vs, M), fs, col, glow)

def tube(P, path, radii, col, seg=6, cap=True, glow=0.0):
    """경로를 따라가는 관(원 단면)"""
    vs, fs = [], []; n = len(path)
    for i, p in enumerate(path):
        p = Vector(p); t = (Vector(path[min(i + 1, n - 1)]) - Vector(path[max(i - 1, 0)])).normalized()
        a = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0)); u = t.cross(a).normalized(); w = t.cross(u)
        r = radii[i] if isinstance(radii, (list, tuple)) else radii
        for j in range(seg):
            q = 2 * math.pi * j / seg; vs.append(p + (u * math.cos(q) + w * math.sin(q)) * r)
    for i in range(n - 1):
        for j in range(seg): fs.append((i * seg + j, i * seg + (j + 1) % seg, (i + 1) * seg + (j + 1) % seg, (i + 1) * seg + j))
    if cap: fs.append(tuple(range(seg))[::-1]); fs.append(tuple((n - 1) * seg + j for j in range(seg)))
    P.add(vs, fs, col, glow)

def torus(P, c, R, r, col, seg=16, sseg=4, M=None, glow=0.0):
    vs = [((R + r * math.cos(2 * math.pi * k / sseg)) * math.cos(2 * math.pi * j / seg), (R + r * math.cos(2 * math.pi * k / sseg)) * math.sin(2 * math.pi * j / seg), r * math.sin(2 * math.pi * k / sseg))
          for j in range(seg) for k in range(sseg)]
    fs = [(j * sseg + k, j * sseg + (k + 1) % sseg, ((j + 1) % seg) * sseg + (k + 1) % sseg, ((j + 1) % seg) * sseg + k) for j in range(seg) for k in range(sseg)]
    P.add(xf(vs, Matrix.Translation(c) @ (M or Matrix())), fs, col, glow)

def leaf(P, base, d, up, L, W, col, seg=4, bend=0.0, glow=0.0, thick=0.012):
    """납작한 잎/깃/불꽃 날(밑 base, 방향 d, 넓은 면의 법선 쪽 up): 양면 얇은 판(가운데 두께)"""
    d = Vector(d).normalized(); up = Vector(up).normalized(); side = d.cross(up).normalized()
    vs = []; n = seg
    for i in range(n + 1):
        t = i / n; w = W * math.sin(math.pi * min(1, t * 1.15)) * (1 - 0.35 * t) if i < n else 0
        p = Vector(base) + d * (L * t) + up * (bend * L * t * t)
        vs += [p + side * w, p + up * thick * (1 - t), p - side * w, p - up * thick * (1 - t)]
    fs = []
    for i in range(n):
        for k in range(4): a = i * 4 + k; b = i * 4 + (k + 1) % 4; fs.append((a, b, b + 4, a + 4))
    P.add(vs, fs, col, glow)

# ---------------------------------------------------------------- 몸통 단면
N = 20
def prof(z, st):
    """목 1.0 ~ 단: x 반폭"""
    pts = [(1.02, 0.13), (0.97, 0.22), (0.93, 0.31), (0.86, 0.33), (0.75, 0.31), (0.6, 0.27), (0.5, 0.26), (0.36, 0.29)]
    if st.get('armor'): pts = [(1.02, 0.14), (0.97, 0.24), (0.93, 0.33), (0.86, 0.35), (0.75, 0.34), (0.6, 0.3), (0.5, 0.29), (0.36, 0.3)]
    if z >= pts[-1][0]:
        for (z0, a0), (z1, a1) in zip(pts, pts[1:]):
            if z1 <= z <= z0: return a0 + (a1 - a0) * (z0 - z) / (z0 - z1)
        return pts[0][1]
    hem = min(st['hem'], st.get('back', st['hem'])); t = (pts[-1][0] - z) / max(0.05, pts[-1][0] - hem)
    return pts[-1][1] + (st['flare'] - pts[-1][1]) * min(1.2, max(0, t)) ** 1.15
def ring_pt(z, phi, st, k=1.0):
    a = prof(z, st) * k; b = a * (0.64 if not st.get('armor') else 0.7)
    if 0.62 < z < 0.86: b *= 1 + 0.08 * math.cos(phi) * math.sin(math.pi * (z - 0.62) / 0.24)   # 가슴
    return Vector((a * math.sin(phi), -b * math.cos(phi), z))
def hem_at(phi, st):
    if 'back' not in st: return st['hem']
    w = (1 - math.cos(phi)) / 2; w = max(0, (w - 0.35) / 0.65) ** 0.8
    return st['hem'] + (st['back'] - st['hem']) * w
UPPER = [1.02, 0.97, 0.93, 0.86, 0.75, 0.62, 0.5]

def shell(P, st, col, phis, top=1.02, hem=None, k=1.0, rows_low=5, sec_col=None, open_=False):
    """몸통(또는 겉옷) 껍데기: phis = 열 각도 목록. hem = 함수(phi) 또는 숫자"""
    hemf = hem if callable(hem) else (lambda p, h=hem: h if h is not None else hem_at(p, st))
    cols = []
    for phi in phis:
        hz = hemf(phi); zs = [z for z in UPPER if z <= top + 1e-6 and z > hz + 0.02]
        if not zs or zs[0] < top - 1e-6: zs = [top] + zs
        lo = min(0.5, zs[-1]) if zs[-1] > hz else hz
        tail = [lo - (lo - hz) * (i + 1) / rows_low for i in range(rows_low)] if lo > hz + 0.01 else []
        cols.append(zs + tail)
    R = max(len(c) for c in cols)
    cols = [c + [c[-1]] * (R - len(c)) for c in cols]          # 같은 행 수(짧은 열은 끝을 반복 = 퇴화 면은 나중에 정리)
    vs = [ring_pt(cols[j][i], phis[j], st, k) for j in range(len(phis)) for i in range(R)]
    fs = []; nc = len(phis); J = nc if not open_ else nc - 1
    for j in range(J):
        j2 = (j + 1) % nc
        for i in range(R - 1): fs.append((j * R + i, j2 * R + i, j2 * R + i + 1, j * R + i + 1))
    P.add(vs, fs, col)
    return cols

def band(P, st, zf, h, col, k=1.03, phis=None, glow=0.0, close=True):
    """몸통을 감는 띠: zf(phi) = 아래쪽 높이"""
    phis = phis or [2 * math.pi * j / N for j in range(N)]
    vs = []
    for phi in phis:
        z = zf(phi); vs += [ring_pt(max(z, -2), phi, st, k), ring_pt(z + h, phi, st, k)]
        vs[-2].z = z; vs[-1].z = z + h
    n = len(phis); fs = [(2 * j, 2 * ((j + 1) % n), 2 * ((j + 1) % n) + 1, 2 * j + 1) for j in range(n if close else n - 1)]
    P.add(vs, fs, col, glow)

def front(z, st, k=1.0, x=0.0):
    """가슴 앞면 위의 점(x 옆)"""
    a = prof(z, st) * k; phi = math.asin(max(-0.95, min(0.95, x / max(a, 1e-3))))
    return ring_pt(z, phi, st, k)

# ---------------------------------------------------------------- 문장(정령) 메시
EMB_CACHE = {}
def tripo_emblem(key):
    if key in EMB_CACHE: return EMB_CACHE[key]
    path = os.path.join(RAW, 'emb_' + key + '.glb'); res = None
    if os.path.exists(path):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=path)
        ms = [o for o in bpy.context.scene.objects if o.type == 'MESH']
        for o in ms: o.select_set(True)
        bpy.context.view_layer.objects.active = ms[0]
        if len(ms) > 1: bpy.ops.object.join()
        ob = bpy.context.view_layer.objects.active; bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        # 텍스처
        img = None
        for m in ob.data.materials:
            if m and m.node_tree:
                for n in m.node_tree.nodes:
                    if n.type == 'TEX_IMAGE' and n.image: img = n.image; break
        px = None
        if img:
            tmp = os.path.join(tempfile.mkdtemp(), 't.png'); img.filepath_raw = tmp; img.file_format = 'PNG'; img.save()
            px = Image.open(tmp).convert('RGB').resize((256, 256)); W, H = px.size; px = (px, W, H)
        bm = bmesh.new(); bm.from_mesh(ob.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        # 정점 색 = 텍스처(정점에 붙은 모서리 UV 평균) — 줄이기 전에 구함
        uv = bm.loops.layers.uv.active; acc = {}
        if px and uv:
            for f in bm.faces:
                for l in f.loops:
                    u, v = l[uv].uv; c = px[0].getpixel((min(px[1] - 1, max(0, int(u % 1 * px[1]))), min(px[2] - 1, max(0, int((1 - v % 1) * px[2])))))
                    s = acc.setdefault(l.vert.index, [0, 0, 0, 0]); s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; s[3] += 1
        cl = bm.verts.layers.float_color.new('vc')
        for v in bm.verts:
            s = acc.get(v.index); v[cl] = (s[0] / s[3] / 255, s[1] / s[3] / 255, s[2] / s[3] / 255, 1) if s else (0.6, 0.6, 0.6, 1)
        # 작은 조각 제거
        bm.faces.ensure_lookup_table(); seen = set(); isl = []
        for f in bm.faces:
            if f.index in seen: continue
            st_, cur = [f], []; seen.add(f.index)
            while st_:
                g = st_.pop(); cur.append(g)
                for e in g.edges:
                    for h in e.link_faces:
                        if h.index not in seen: seen.add(h.index); st_.append(h)
            isl.append(cur)
        big = max(len(i) for i in isl); drop = [f for i in isl if len(i) < big * 0.02 for f in i]
        if drop: bmesh.ops.delete(bm, geom=drop, context='FACES')
        bm.to_mesh(ob.data); bm.free()
        n0 = len(ob.data.polygons)
        for _ in range(6):
            n = len(ob.data.polygons)
            if n <= EMB_TRIS * 1.05: break
            decimate(ob, max(0.02, EMB_TRIS / n))
        me = ob.data; att = me.color_attributes.get('vc')
        vs = [v.co.copy() for v in me.vertices]
        lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))); hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
        c = (lo + hi) / 2; sz = hi - lo
        # 앞(카메라 -Y) 쪽 납작하게: 가장 얇은 가로 축을 Y로
        rot = Matrix.Rotation(math.radians(EMB_YAW.get(key, -90)), 4, 'Z')        # Tripo 초안의 앞 = +X → 정면 -Y
        vs = [rot @ (v - c) for v in vs]; s = 1.0 / max(sz.x, sz.y, sz.z)
        # Tripo 초안의 앞은 +X(다른 Tripo 파이프라인과 같음) — 위 회전으로 정면 -Y
        vs = [Vector((v.x * s, v.y * s, v.z * s)) for v in vs]
        def sat(c, k=1.35, b=1.08):                                          # 줄인 메시의 평균 색은 바래 보여서 채도·밝기를 조금 올림
            m = sum(c) / 3; return tuple(min(1, max(0, (m + (x - m) * k) * b)) for x in c)
        cols = [sat(tuple(att.data[i].color[:3])) for i in range(len(me.vertices))] if att and att.domain == 'POINT' else [(0.6, 0.6, 0.6)] * len(vs)
        faces = [tuple(p.vertices) for p in me.polygons]
        res = (vs, faces, cols)
        print('emblem', key, n0, '->', len(faces), flush=True)
    EMB_CACHE[key] = res; return res

def put_emblem(P, key, at, size, st, depth=0.6):
    e = tripo_emblem(key)
    if not e: return False
    vs, fs, cs = e
    M = Matrix.Translation(at) @ Matrix.Diagonal((size, size * depth, size, 1))
    o = len(P.v); P.v += [M @ v for v in vs]
    for f in fs: P.f.append(tuple(i + o for i in f)); P.c.append(tuple(sum(cs[i][k] for i in f) / len(f) for k in range(3))); P.g.append(0.0)
    return True

def proc_emblem(P, kind, at, size, st):
    acc = hx(st['acc']); gem = hx(st['gem']); at = Vector(at); fwd = Vector((0, -1, 0))
    if kind == 'star':                     # 별씨앗: 다섯 꼭지 별 + 잎 날개 둘
        pts = []
        for i in range(10):
            q = math.pi / 2 + i * math.pi / 5; r = size * (0.5 if i % 2 == 0 else 0.22); pts.append(at + Vector((r * math.cos(q), 0, r * math.sin(q))))
        vs = [at + fwd * 0.03] + pts + [at - fwd * 0.005]
        fs = [(0, 1 + i, 1 + (i + 1) % 10) for i in range(10)] + [(11, 1 + (i + 1) % 10, 1 + i) for i in range(10)]
        P.add(vs, fs, GOLD, 0.5)
        for s in (-1, 1): leaf(P, at + Vector((s * size * 0.2, -0.01, -size * 0.1)), (s, 0, -0.25), (0, -1, 0), size * 0.6, size * 0.2, hx('#9ad86a'))
        sphere(P, at + fwd * 0.035, size * 0.12, gem, 8, 4, glow=0.8)
    elif kind == 'crystal':                # 수정 연금: 육각 결정 셋 + 플라스크 핵
        for dx, h, tl in ((0, 0.62, 0), (-0.22, 0.42, 0.35), (0.22, 0.42, -0.35)):
            b = at + Vector((dx * size, -0.01, -size * 0.25)); top = b + Vector((math.sin(tl) * h * size, 0, math.cos(tl) * h * size))
            vs = [b + Vector((0.09 * size * math.cos(2 * math.pi * k / 6), 0.06 * size * math.sin(2 * math.pi * k / 6), 0)) for k in range(6)]
            mid = [v + (top - b) * 0.8 for v in vs]; vs = vs + mid + [top]
            fs = [(k, (k + 1) % 6, 6 + (k + 1) % 6, 6 + k) for k in range(6)] + [(6 + k, 6 + (k + 1) % 6, 12) for k in range(6)] + [tuple(range(6))[::-1]]
            P.add(vs, fs, hx('#aee6ff'), 0.6)
        sphere(P, at + Vector((0, -0.04, -size * 0.25)), size * 0.16, hx('#22b8b0'), 8, 5, glow=0.8)
        torus(P, at + Vector((0, -0.04, -size * 0.25)), size * 0.17, size * 0.025, SILVER, 12, 4, M=Matrix.Rotation(math.pi / 2, 4, 'X'))
    elif kind == 'lingzhi':                # 옥영지: 겹친 갓 셋 + 비취 핵
        for dx, dz, s in ((0, 0.12, 1.0), (-0.24, -0.08, 0.7), (0.24, -0.1, 0.65)):
            c = at + Vector((dx * size, -0.02, dz * size))
            sphere(P, c, (0.32 * size * s, 0.08 * size * s, 0.2 * size * s), hx('#a8582a'), 10, 4)
            torus(P, c + Vector((0, -0.005, -0.04 * size * s)), 0.3 * size * s, 0.02 * size, hx('#f0c060'), 10, 3, M=Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Diagonal((1, 0.6, 1, 1)))
        tube(P, [at + Vector((0, -0.02, -0.45 * size)), at + Vector((0, -0.02, 0.0))], 0.04 * size, hx('#d8c8a0'), 5)
        sphere(P, at + Vector((0, -0.05, 0.12 * size)), size * 0.1, hx('#3fae7a'), 8, 4, glow=0.8)
    elif kind == 'gear':                   # 뇌정 태엽: 톱니 바퀴 + 번개
        c = at; T = 10; vs = [c + fwd * 0.02]
        for i in range(T * 2):
            q = 2 * math.pi * i / (T * 2); r = size * (0.5 if i % 2 == 0 else 0.4); vs.append(c + Vector((r * math.cos(q), -0.01, r * math.sin(q))))
        fs = [(0, 1 + i, 1 + (i + 1) % (T * 2)) for i in range(T * 2)][::-1]
        P.add(vs, [tuple(reversed(f)) for f in fs], hx('#d6a540'))
        bolt = [(-0.08, 0.3), (0.1, 0.05), (-0.02, 0.03), (0.08, -0.3), (-0.1, -0.02), (0.02, 0.0)]
        vs = [c + Vector((x * size, -0.035, z * size)) for x, z in bolt]
        P.add(vs, [tuple(range(6))[::-1]], hx('#6ad8ff'), 1.0)
    else:                                  # 대체: 보석 액자
        torus(P, at, size * 0.3, size * 0.05, GOLD, 14, 4, M=Matrix.Rotation(math.pi / 2, 4, 'X'))
        sphere(P, at + fwd * 0.02, (size * 0.22, size * 0.1, size * 0.26), gem, 10, 5, glow=0.6)

# ---------------------------------------------------------------- 어깨 장식(6단계 이상)
def crest(P, st, stage):
    kind = st['crest']; col = hx(st['crestcol']); big = 1.0 if stage >= 6 else 0.55; gold = GOLD
    for s in (-1, 1):
        sh = Vector((s * 0.3, 0.04, 0.92))
        if kind in ('leaf', 'feather', 'fin', 'wing', 'moth', 'bird'):
            n = {'leaf': 3, 'feather': 4, 'fin': 3, 'wing': 2, 'moth': 2, 'bird': 4}[kind]
            for i in range(n):
                a = math.radians(25 + i * (60 / max(1, n - 1)) if n > 1 else 45)
                d = Vector((s * math.cos(a) * 0.9, 0.25, math.sin(a)))
                L = (0.42 if kind in ('wing', 'moth') else 0.34) * big * (1 - 0.12 * i)
                W = {'leaf': 0.07, 'feather': 0.05, 'fin': 0.08, 'wing': 0.16, 'moth': 0.17, 'bird': 0.055}[kind] * big
                c = col if i % 2 == 0 or kind in ('wing', 'moth') else mix(col, WHITE, 0.4)
                leaf(P, sh, d, (0, -1, 0.2), L, W, c, seg=4, bend=0.12)
                if kind in ('wing', 'moth') and stage >= 6: sphere(P, sh + d.normalized() * L * 0.55 + Vector((0, -0.02, 0)), 0.025, gold, 6, 3, glow=0.4)
        elif kind == 'antler':
            base = sh + Vector((0, 0, 0.02)); tip = base + Vector((s * 0.12, 0.05, 0.3)) * big
            tube(P, [base, base + (tip - base) * 0.5, tip], [0.022, 0.017, 0.008], col, 5)
            for f in (0.4, 0.7):
                b = base + (tip - base) * f; tube(P, [b, b + Vector((s * 0.12, 0.02, 0.08)) * big], [0.014, 0.006], col, 4)
            if stage >= 6:
                for f in (0.55, 0.85): sphere(P, base + (tip - base) * f + Vector((s * 0.04, -0.02, 0)), 0.03, hx('#ffffff'), 6, 3, glow=0.2)
        elif kind in ('flame', 'tail'):
            for i in range(3):
                a = math.radians(40 + i * 25); d = Vector((s * math.cos(a), 0.2, math.sin(a)))
                c = col if i != 1 else hx('#ffd04a')
                leaf(P, sh, d, (0, -1, 0), (0.3 - 0.05 * i) * big, 0.07 * big, c, seg=4, bend=0.35 * s * 0, glow=0.5 if kind == 'flame' else 0.2)
        elif kind == 'crystal':
            for i in range(3):
                a = math.radians(50 + i * 22); d = Vector((s * math.cos(a), 0.1, math.sin(a))) * (0.3 - 0.05 * i) * big
                b = sh; t = b + d; w = 0.04 * big
                vs = [b + Vector((w, 0, 0)), b + Vector((0, -w, 0)), b + Vector((-w, 0, 0)), b + Vector((0, w, 0)), t]
                P.add(vs, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (3, 2, 1, 0)], col, 0.6)
        elif kind == 'gear':
            torus(P, sh + Vector((s * 0.06, 0, 0.08)), 0.09 * big, 0.025 * big, col, 10, 4, M=Matrix.Rotation(math.pi / 2, 4, 'X'))
            for i in range(8):
                q = 2 * math.pi * i / 8; sphere(P, sh + Vector((s * 0.06 + math.cos(q) * 0.12 * big, 0, 0.08 + math.sin(q) * 0.12 * big)), 0.022 * big, col, 4, 3)
            vs = [sh + Vector((s * (0.06 + x), -0.03, 0.08 + z)) * 1 for x, z in ((-0.03, 0.25), (0.04, 0.12), (0.0, 0.11), (0.05, -0.05), (-0.04, 0.1), (0.0, 0.11))]
            if stage >= 6: P.add(vs, [tuple(range(6))[::-1], tuple(range(6))], hx('#6ad8ff'), 1.0)
        elif kind == 'cloud':
            for i, (dx, dz, r) in enumerate(((0.0, 0.05, 0.08), (0.09, 0.1, 0.065), (0.17, 0.06, 0.055), (0.06, 0.16, 0.05))):
                sphere(P, sh + Vector((s * dx, 0.03, dz)) * (1 if big == 1 else 0.7), r * big, col if i % 2 == 0 else mix(col, hx('#e8b848'), 0.35), 8, 4)
            if stage >= 6: torus(P, sh + Vector((s * 0.09, -0.04, 0.1)), 0.11 * big, 0.012, GOLD, 12, 3, M=Matrix.Rotation(math.pi / 2, 4, 'X'))

def ribbon(P, start, d, L, W, col, waves=1.0, phase=0.0, seg=6):
    """흘러내리는 리본(양면, 끝은 V)"""
    start = Vector(start); d = Vector(d).normalized(); side = Vector((d.y, -d.x, 0)).normalized() if abs(d.z) < 0.99 else Vector((1, 0, 0))
    vs = []
    for i in range(seg + 1):
        t = i / seg; off = Vector((math.sin(t * math.pi * 2 * waves + phase) * 0.04, -0.02 * t, 0))
        p = start + Vector((0, 0, -L * t)) + off + d * 0.08 * t
        w = W * (1 if i < seg else 0.0)
        vs += [p + Vector((W * 0.5, 0, 0)), p - Vector((W * 0.5, 0, 0))] if i < seg else [p + Vector((W * 0.5, 0, 0.06)), p - Vector((W * 0.5, 0, -0.06))]
    fs = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(seg)]
    P.add(vs, fs, col)

def hem_motif(P, st, ev):
    """계열 무늬: 앞자락 단 위에 작은 계열 모양(잎·불꽃·지느러미·깃·결정·구름·톱니…)을 한 줄 — 1단계부터 같은 가족"""
    kind = st['crest']; col = hx(st['crestcol']) if ev < 6 else GOLD; n = 7
    for i in range(n):
        phi = -1.25 + 2.5 * i / (n - 1); z = hem_at(phi, st) + 0.13; p = ring_pt(z, phi, st, 1.045)
        out = Vector((math.sin(phi), -math.cos(phi), 0)); c = col if i % 2 == 0 else hx(st['acc'])
        if kind in ('crystal',):
            sphere(P, p, (0.025, 0.012, 0.045), c, 4, 2, M=Matrix.Rotation(-phi, 4, 'Z'), glow=0.3)
        elif kind in ('cloud',):
            sphere(P, p, (0.035, 0.012, 0.025), c, 6, 3, M=Matrix.Rotation(-phi, 4, 'Z'))
        elif kind in ('gear',):
            torus(P, p, 0.025, 0.009, c, 8, 3, M=Matrix.Rotation(-phi, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'))
        else:
            leaf(P, p - Vector((0, 0, 0.03)), (0.25 * (1 if i % 2 else -1), 0, 1), out, 0.075, 0.025, c, seg=3, thick=0.006)

# ---------------------------------------------------------------- 한 벌
def build(line, stage, n):
    st = S[line]; L = next(x for x in designs.LINES if x['key'] == line)
    ev = STAGE_MAP[n][stage - 1] if n in STAGE_MAP else stage            # 공통 진화 칸 1~7
    drop = ev >= 6 or (n in STAGE_MAP and stage == n)
    rnd = random.Random(hash((line, stage)) & 0xffff)
    P = Part(); body = hx(st['body']); sec = hx(st['sec']); acc = hx(st['acc']); gem = hx(st['gem'])
    trim = GOLD if ev >= 6 else (SILVER if ev >= 4 else sec)
    full = [2 * math.pi * j / N for j in range(N)]
    # 몸통(겉옷이 있으면 몸통 = 안감 색)
    inner = hx(st['inner']) if st.get('inner') else body
    shell(P, st, inner if st.get('over') else body, full)
    # 목 구멍(어두운 원판)
    vs = [ring_pt(1.015, p, st, 0.98) for p in full]; vs = [Vector((v.x, v.y, 1.0)) for v in vs]
    P.add(vs + [Vector((0, 0, 0.94))], [(j, (j + 1) % N, N) for j in range(N)], mix(body, DARK, 0.75))
    # 단(바닥 쪽)을 닫음: 안쪽 어두운 면
    hv = [ring_pt(hem_at(p, st), p, st, 0.995) for p in full]
    P.add(hv + [Vector((0, 0, min(st['hem'], st.get('back', st['hem'])) + 0.12))], [((j + 1) % N, j, N) for j in range(N)], mix(body, DARK, 0.7))
    # 겉옷(앞 트임)
    ov = st.get('over')
    if ov:
        g = ov['gap']; phis = [g + (2 * math.pi - 2 * g) * j / (N - 2) for j in range(N - 1)]
        shell(P, st, hx(ov['col']), phis, top=ov['top'], hem=(lambda p: hem_at(p, st)) if 'back' in st else ov['hem'], k=1.045, open_=True)
        if ov.get('lapel'):
            for s in (-1, 1):            # 옷깃: 가슴 위 세모
                a = front(0.93, st, 1.07, s * 0.1); b = front(0.62, st, 1.07, s * 0.15); c = front(0.88, st, 1.07, s * 0.24)
                P.add([a, b, c], [(0, 1, 2) if s > 0 else (0, 2, 1)], hx(ov['lapel']))
                P.add([a + Vector((0, 0.01, 0)), b + Vector((0, 0.01, 0)), c + Vector((0, 0.01, 0))], [(0, 2, 1) if s > 0 else (0, 1, 2)], hx(ov['lapel']))
    # 소매
    for s in (-1, 1):
        sh = Vector((s * 0.31, 0, 0.88))
        if st['sleeve'] == 'cap':        # 갑옷 어깨받이
            sphere(P, sh + Vector((s * 0.03, 0, 0.0)), (0.13, 0.12, 0.09), sec if line == 'eng' else mix(body, SILVER, 0.25), 10, 5)
            torus(P, sh + Vector((s * 0.03, 0, -0.03)), 0.12, 0.015, trim if ev >= 4 else acc, 12, 3, M=Matrix.Rotation(math.radians(s * 20), 4, 'Y'))
        else:
            wide = st['sleeve'] == 'wide'; Ls = 0.5 if wide else 0.36
            d = Vector((s * 0.42, 0, -1)).normalized(); path = [sh + d * (Ls * i / 4) for i in range(5)]
            radii = [0.1, 0.105, 0.115, 0.15 if wide else 0.12, 0.22 if wide else 0.125]
            tube(P, path, radii, body, 8, cap=False)
            tube(P, [path[-1] - d * 0.01, path[-1] - d * 0.05], [radii[-1] * 0.92, 0.02], mix(body, DARK, 0.7), 8, cap=False)
            tube(P, [path[-1] - d * 0.035, path[-1] + d * 0.005], radii[-1] * 1.05, trim if ev >= 4 else sec, 8, cap=False)
    # 단 띠·옷깃 띠 (1단계부터 계열 둘째 색)
    band(P, st, lambda p: hem_at(p, st) - 0.005, 0.075, trim if ev >= 4 else sec, 1.035)
    hem_motif(P, st, ev)
    if ev >= 6: band(P, st, lambda p: hem_at(p, st) + 0.07, 0.02, acc, 1.025)
    torus(P, Vector((0, 0, 1.0)), 0.14, 0.032, hx(st.get('collar', st['sec'])) if ev < 6 else GOLD, 16, 4, M=Matrix.Diagonal((1.0, 0.68, 1, 1)))
    # 겹친 깃(도포)
    if st.get('cross'):
        for s in (-1, 1):
            p0 = front(0.99, st, 1.03, -s * 0.11); p1 = front(0.62, st, 1.03, s * 0.2)
            tube(P, [p0, (p0 + p1) / 2 + Vector((0, -0.02, 0)), p1], 0.028, sec if line == 'herb' else hx('#f2ecdc'), 4)
    if st.get('highcollar'):
        tube(P, [Vector((0, 0.0, 0.98)), Vector((0, 0.0, 1.1))], [0.15, 0.19], hx(st['highcollar']), 12, cap=False)
    if st.get('cravat'):
        c0 = front(0.93, st, 1.06); sphere(P, c0 + Vector((0, -0.01, 0)), (0.05, 0.03, 0.035), hx(st['cravat']), 8, 4)
        leaf(P, c0, (0.1, -0.05, -1), (0, -1, 0), 0.16, 0.045, hx(st['cravat']), 3); leaf(P, c0, (-0.1, -0.05, -1), (0, -1, 0), 0.14, 0.04, hx(st['cravat']), 3)
    if st.get('scarf'):
        c0 = front(0.95, st, 1.05); torus(P, Vector((0, 0, 0.97)), 0.15, 0.03, hx(st['scarf']), 14, 4, M=Matrix.Diagonal((1, 0.7, 1, 1)))
        leaf(P, c0, (0.15, -0.1, -1), (0, -1, 0), 0.18, 0.06, hx(st['scarf']), 3)
    # 앞치마
    ap = st.get('apron')
    if ap:
        aw = ap.get('w', 0.75); phis = [-aw + 2 * aw * j / 8 for j in range(9)]
        vs, fs = [], []; zs = [ap['top'] - (ap['top'] - ap['hem']) * i / 6 for i in range(7)]
        for phi in phis:
            for z in zs:
                zz = max(z, hem_at(phi, st)); p = ring_pt(zz, phi, st, 1.06); p.z = z; vs.append(p)
        for j in range(len(phis) - 1):
            for i in range(len(zs) - 1): fs.append((j * 7 + i, (j + 1) * 7 + i, (j + 1) * 7 + i + 1, j * 7 + i + 1))
        P.add(vs, fs, hx(ap['col']))
        P.add([v + Vector((0, 0.008, 0)) for v in vs], [tuple(reversed(f)) for f in fs], mix(hx(ap['col']), DARK, 0.4))
        pz = (ap['top'] + ap['hem']) / 2 - 0.05; pc = ring_pt(max(pz, hem_at(0, st)), 0, st, 1.08); pc.z = pz
        sphere(P, pc + Vector((0.07, -0.005, 0)), (0.07, 0.02, 0.06), hx(ap['pocket']), 6, 3)
        if ev >= 4: torus(P, Vector((0, 0, ap['top'])) + Vector((0, -prof(ap['top'], st) * 0.68, 0)), 0.05, 0.008, trim, 8, 3, M=Matrix.Rotation(math.pi / 2, 4, 'X'))
    # 허리띠·띠
    if st.get('sash') or st.get('toolbelt'):
        band(P, st, lambda p: 0.46, 0.08 if st.get('sash') else 0.06, hx(st.get('sash', '#5a3e22')), 1.06)
        bz = front(0.5, st, 1.08); sphere(P, bz, (0.05, 0.02, 0.045), GOLD if ev >= 4 else hx('#c8a050'), 6, 3)
    if st.get('knot') and ev >= 3:
        k0 = front(0.48, st, 1.08, 0.12); sphere(P, k0, 0.04, hx(st['sash']), 6, 4)
        for dx in (-0.025, 0.025): tube(P, [k0, k0 + Vector((dx, -0.02, -0.22)), k0 + Vector((dx * 1.6, -0.03, -0.32))], [0.014, 0.012, 0.02], hx(st['sash']), 4)
    if st.get('toolbelt'):
        for x in (-0.18, 0.18, 0.0):
            if x == 0 and ev < 3: continue
            p = front(0.42, st, 1.1, x); sphere(P, p, (0.055, 0.04, 0.06), hx('#7a5230'), 6, 3)
    if st.get('goggles') and ev >= 2:
        for x in (-0.25, -0.16):                                  # 고글은 옆구리 쪽(가슴 브로치와 겹쳐 다른 그림처럼 보이지 않게)
            p = front(0.66, st, 1.1, x); torus(P, p, 0.045, 0.014, hx('#5a4a3a'), 10, 3, M=Matrix.Rotation(math.pi / 2, 4, 'X')); sphere(P, p, (0.04, 0.012, 0.04), hx('#6ad8ff'), 8, 3, glow=0.5)
    if st.get('bandolier'):
        a = front(0.95, st, 1.07, 0.2); b = front(0.45, st, 1.07, -0.24)
        tube(P, [a, (a + b) / 2 + Vector((0, -0.03, 0)), b], 0.022, hx('#8a6a4a'), 4)
        for i in range(2 + min(3, ev // 2)):
            t = 0.2 + 0.6 * i / max(1, 1 + min(3, ev // 2)); p = a + (b - a) * t + Vector((0, -0.05, 0))
            tube(P, [p + Vector((0, 0, -0.04)), p + Vector((0, 0, 0.04))], 0.022, hx('#aee6ff') if i % 2 == 0 else hx('#22b8b0'), 6, glow=0.4)
    if st.get('chain'):
        for i in range(5 + ev):
            t = i / (4 + ev); p = front(0.62 - 0.05 * math.sin(math.pi * t), st, 1.1, -0.22 + 0.44 * t)
            torus(P, p, 0.018, 0.006, hx('#8a8e96'), 6, 3, M=Matrix.Rotation(math.pi / 2 * (i % 2), 4, 'Z'))
    # 단추
    nb = 3 + (1 if ev >= 3 else 0)
    if st.get('buttons2'):
        for x in (-0.09, 0.09):
            for i in range(nb): sphere(P, front(0.86 - i * 0.1, st, 1.05, x), 0.017, acc if ev < 6 else GOLD, 6, 3)
    elif not ov and not st.get('cross') and not ap:
        for i in range(nb): sphere(P, front(0.84 - i * 0.1, st, 1.04), 0.016, acc, 6, 3)
    # 1단계 무늬: 아랫단 위 계열 장식 점
    if st.get('pat') or st.get('splat'):
        for i in range(10 if st.get('splat') else 7):
            phi = rnd.uniform(-1.3, 1.3); z = rnd.uniform(max(-0.2, st['hem'] + 0.1), 0.6)
            c = hx(st['pat']) if st.get('pat') else rnd.choice([hx('#5ad0e6'), hx('#e6b54a'), hx('#ff7f6a'), hx('#8ae06a')])
            sphere(P, ring_pt(z, phi, st, 1.02), (0.03, 0.03, 0.025), c, 5, 3, M=Matrix.Rotation(-phi, 4, 'Z') @ Matrix.Diagonal((1, 0.25, 1, 1)))
    # 망토(뒤)
    if st.get('cape') and (line != 'nov' or ev >= 3):
        phis = [math.pi * 0.42 + math.pi * 1.16 * j / 10 for j in range(11)]
        ch = st['hem'] - (0.1 if line == 'art' else 0.25)
        shell(P, st, hx(st['cape']), phis, top=0.95, hem=lambda p: ch, k=1.12, open_=True)
        shell(P, st, mix(hx(st['cape']), DARK, 0.35), phis[::-1], top=0.95, hem=lambda p: ch, k=1.10, open_=True)
    # 2: 가슴 브로치(보석)
    core = front(0.76, st, 1.08)
    if ev >= 2 and ev < 4:
        torus(P, core, 0.058, 0.016, GOLD if ev >= 3 else SILVER, 12, 3, M=Matrix.Rotation(math.pi / 2, 4, 'X'))
        sphere(P, core + Vector((0, -0.01, 0)), (0.048, 0.03, 0.056), gem, 8, 4, glow=0.6)
    # 3: 리본
    if ev >= 3:
        nr = 2 if ev < 7 else 4
        for i in range(nr):
            s = -1 if i % 2 == 0 else 1; x = s * (0.12 + 0.07 * (i // 2))
            p = front(0.47 if not ap else 0.5, st, 1.1, x)
            ribbon(P, p, (s * 0.3, -0.2, -1), 0.32 + 0.08 * (i // 2) + (0.06 if ev >= 6 else 0), 0.085, acc if i // 2 == 0 else hx(st['gem']), waves=0.8, phase=i)
    # 4: 문장 + 구슬 줄
    if ev >= 4:
        esz = {4: 0.36, 5: 0.4, 6: 0.44, 7: 0.46}[min(ev, 7)]
        ep = front(0.74, st, 1.1) + Vector((0, -0.03, 0))
        md = mix(hx(st['sec']) if line not in ('cook', 'hair', 'chef', 'wpharm') else hx(st['acc']), DARK, 0.25)   # 문장 받침 원판 + 테
        sphere(P, ep + Vector((0, 0.015, 0)), (esz * 0.42, 0.02, esz * 0.42), md, 14, 4)
        torus(P, ep + Vector((0, 0.0, 0)), esz * 0.42, 0.018, GOLD if ev >= 5 else SILVER, 18, 4, M=Matrix.Rotation(math.pi / 2, 4, 'X'))
        ep = ep + Vector((0, -0.03, 0))
        if st['emb'] == 'tripo':
            if not put_emblem(P, line, ep + Vector((0, -esz * 0.2, 0)), esz, st): proc_emblem(P, 'frame', ep, esz, st)
        else: proc_emblem(P, st['emb'], ep, esz, st)
        nbd = 7 + 2 * (ev - 4)
        for i in range(nbd):
            t = i / (nbd - 1); x = -0.25 + 0.5 * t; z = 0.9 - 0.2 * math.sin(math.pi * t)
            if abs(x) < esz * 0.45 and z < 0.86: continue
            sphere(P, front(z, st, 1.07, x), 0.024, gem if i % 2 == 0 else (GOLD if ev >= 6 else SILVER), 5, 3, glow=0.3)
    # 5: 핵 보석 + 어깨 장식(작게)
    if ev >= 5:
        cp = front(0.56 if not st.get('cravat') else 0.6, st, 1.12) + Vector((0, -0.02, 0))
        if ap: cp = cp + Vector((0, -0.02, 0))
        sphere(P, cp, (0.065, 0.04, 0.075), gem, 10, 5, glow=1.0)
        torus(P, cp, 0.075, 0.018, GOLD, 12, 3, M=Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Diagonal((1, 1.25, 1, 1)))
        if ev >= 6:     # 둘째 보석 고리
            for i in range(6):
                q = 2 * math.pi * i / 6; sphere(P, cp + Vector((math.cos(q) * 0.095, -0.01, math.sin(q) * 0.11)), 0.014, acc, 5, 3, glow=0.5)
        if ev >= 7:     # 용의 눈
            torus(P, cp + Vector((0, -0.03, 0)), 0.045, 0.006, hx('#ffe08a'), 14, 3, M=Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Diagonal((1.25, 0.55, 1, 1)), glow=0.7)
            sphere(P, cp + Vector((0, -0.034, 0)), (0.006, 0.004, 0.032), hx('#1a0c10'), 4, 3)
        crest(P, st, ev)
    # 7: 후광 관
    if ev >= 7:
        hc = Vector((0, 0.12, 1.08))
        torus(P, hc, 0.3, 0.018, GOLD, 22, 4, M=Matrix.Rotation(math.pi / 2, 4, 'X'), glow=0.5)
        for i in range(7):
            q = math.pi * (0.15 + 0.7 * i / 6); p = hc + Vector((math.cos(q) * 0.3, 0, math.sin(q) * 0.3))
            sphere(P, p, (0.025, 0.02, 0.05), gem if i % 2 == 0 else hx('#ffffff'), 5, 3, glow=0.8, M=Matrix.Rotation(-(q - math.pi / 2), 4, 'Y'))
    return P, drop, ev

# ---------------------------------------------------------------- 메시로 만들기·저장
def to_object(P, name):
    F, C, Gl = [], [], []                                                # 같은 정점이 겹친 면(짧은 열을 채운 행)은 줄이거나 버림
    for f, c, g in zip(P.f, P.c, P.g):
        u = [];
        for i in f:
            if (not u or (P.v[i] - P.v[u[-1]]).length > 1e-6) and i not in u: u.append(i)
        if len(u) > 2 and (P.v[u[0]] - P.v[u[-1]]).length > 1e-6: F.append(tuple(u)); C.append(c); Gl.append(g)
    P.f, P.c, P.g = F, C, Gl
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in P.v], [], P.f)
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    # validate가 면을 지웠을 수 있으니 면 수를 확인하고, 색은 면 순서대로
    ca = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER'); ga = me.attributes.new('glow', 'FLOAT', 'FACE')
    zs = [v.z for v in P.v]; z0, z1 = min(zs), max(zs)
    for pi, poly in enumerate(me.polygons):
        if pi >= len(P.c): break
        c = P.c[pi]; ga.data[pi].value = P.g[pi]
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            h = (v.z - z0) / max(1e-3, z1 - z0); n = (math.sin(v.x * 37.1 + v.z * 23.7) * math.sin(v.y * 41.3 - v.z * 17.9))
            k = 0.86 + 0.2 * h + 0.045 * n                                          # 칠한 빛: 위 밝게·아래 어둡게 + 붓 얼룩
            if P.g[pi] > 0: k = max(k, 1.0)
            ca.data[li].color = (min(1, c[0] * k), min(1, c[1] * k), min(1, c[2] * k), 1)
    me.color_attributes.active_color = ca
    mat = bpy.data.materials.new('M_' + name); mat.use_nodes = True; mat.use_backface_culling = False
    nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']; at = nt.nodes.new('ShaderNodeVertexColor'); at.layer_name = 'Col'
    nt.links.new(at.outputs['Color'], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 0.62
    me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    return ob

def decimate(ob, ratio):
    mod = ob.modifiers.new('d', 'DECIMATE'); mod.ratio = max(0.0005, ratio); mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    ob.modifiers.remove(mod); old = ob.data; ob.data = me; bpy.data.meshes.remove(old)

def finish(ob):
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
    bmesh.ops.triangulate(bm, faces=bm.faces); bm.to_mesh(ob.data); bm.free()
    for _ in range(4):
        n = len(ob.data.polygons)
        if n <= TRI_MAX: break
        decimate(ob, (TRI_MAX - 40) / n)
    # 바닥 원점, 가로 가운데
    vs = [v.co for v in ob.data.vertices]; lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))); hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    ob.data.transform(Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
    k = 1.0 / (hi.z - lo.z); ob.data.transform(Matrix.Scale(k, 4))                      # 높이 1 (게임은 lootModel이 다시 맞춤)
    return len(ob.data.polygons)

def add_glow(ob):
    """아이콘 렌더에서만 보석이 빛나게(내보내기 뒤에 — glTF에는 emissive를 넣지 않음)"""
    nt = ob.data.materials[0].node_tree; bsdf = nt.nodes['Principled BSDF']; at = next(n for n in nt.nodes if n.type == 'VERTEX_COLOR')
    ga_n = nt.nodes.new('ShaderNodeAttribute'); ga_n.attribute_name = 'glow'
    nt.links.new(at.outputs['Color'], bsdf.inputs['Emission Color']); nt.links.new(ga_n.outputs['Fac'], bsdf.inputs['Emission Strength'])

def export(ob, id_):
    td = tempfile.mkdtemp(); glb = os.path.join(td, id_ + '.glb')
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_animations=False, export_yup=True, export_apply=True,
                              export_normals=True, export_tangents=False, export_texcoords=False, export_vertex_color='ACTIVE', export_all_vertex_colors=False)
    raw = open(glb, 'rb').read()
    json.dump({'b64': base64.b64encode(raw).decode(), 'tris': len(ob.data.polygons), 'kind': 'armor'}, open(os.path.join(MODELS, id_ + '.glb.json'), 'w'))
    return glb, len(raw)

# ---------------------------------------------------------------- 렌더
def scene_setup(res, ortho):
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = int(os.environ.get('SAMPLES', '40')); sc.cycles.use_denoising = False
    sc.cycles.device = 'CPU'; sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.view_settings.view_transform = 'Standard'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (1, 0.96, 0.94, 1); bg.inputs[1].default_value = 0.5
    for nm, d, e, col in (('key', (-0.6, -1, 1.1), 2.4, (1, 0.95, 0.86)), ('fill', (1, -0.6, 0.2), 0.6, (0.75, 0.8, 1)), ('rim', (0.6, 1.2, 0.8), 2.0, (0.7, 0.75, 1))):
        L = bpy.data.objects.new(nm, bpy.data.lights.new(nm, 'SUN')); sc.collection.objects.link(L); L.data.energy = e; L.data.color = col; L.data.angle = math.radians(25)
        L.rotation_euler = (-Vector(d)).to_track_quat('-Z', 'Y').to_euler()
    return sc, cam

def render(sc, path):
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)

def icon_post(src, dst, ev, drop):
    """손그림 처리: 가는 어두운 외곽선 + 부드러운 그림자 + 단계 빛무리(투명 배경)"""
    im = Image.open(src).convert('RGBA'); bb = im.getbbox(); im = im.crop(bb)
    side = int(max(im.size) * 1.16); sq = Image.new('RGBA', (side, side), (0, 0, 0, 0)); sq.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2)); im = sq
    S2 = 256; im = im.resize((S2, S2), Image.LANCZOS)
    rgb = ImageEnhance.Color(im.convert('RGB')).enhance(1.15); rgb = ImageEnhance.Contrast(rgb).enhance(1.05); rgb.putalpha(im.split()[3]); im = rgb
    a = im.split()[3]
    out = Image.new('RGBA', (S2, S2), (0, 0, 0, 0))
    # 빛무리: 단계가 높을수록 진하고 큼 — 판매 = 따뜻한 금/하늘, 드롭 = 보라
    if ev >= 2:
        col = (176, 120, 255) if drop else ((255, 214, 120) if ev >= 4 else (150, 210, 255))
        strength = (0.25 + 0.1 * ev) if not drop else 0.85
        g = Image.new('L', (S2, S2), 0); d = ImageDraw.Draw(g); R = 70 + 7 * ev
        for r in range(R, 0, -2): d.ellipse((128 - r, 128 - r, 128 + r, 128 + r), fill=int(255 * strength * (1 - r / R) ** 1.4))
        g = g.filter(ImageFilter.GaussianBlur(6)); halo = Image.new('RGBA', (S2, S2), col + (0,)); halo.putalpha(g); out = Image.alpha_composite(out, halo)
    sh = a.filter(ImageFilter.GaussianBlur(5)).point(lambda v: int(v * 0.4)); shimg = Image.new('RGBA', (S2, S2), (40, 24, 50, 0)); shimg.putalpha(ImageChops.offset(sh, 3, 5)); out = Image.alpha_composite(out, shimg)
    ol = a.filter(ImageFilter.MaxFilter(5)); olimg = Image.new('RGBA', (S2, S2), (38, 26, 40, 0)); olimg.putalpha(ol); out = Image.alpha_composite(out, olimg)
    out = Image.alpha_composite(out, im)
    out.resize((ICON, ICON), Image.LANCZOS).save(dst, optimize=True)

def process(id_):
    line, stage = id_.split('_')[1], int(id_.split('_')[2]); n = 4 if line == 'nov' else 7
    P, drop, ev = build(line, stage, n)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ob = to_object(P, id_); tris = finish(ob)
    glb, size = export(ob, id_)
    if os.environ.get('NOICON') != '1':
        add_glow(ob); sc, cam = scene_setup(320, 1.2)
        ob.rotation_euler = (0, 0, math.radians(-28)); bpy.context.view_layer.update()
        el = math.radians(16); cam.location = (0, -4 * math.cos(el), 0.5 + 4 * math.sin(el)); cam.rotation_euler = (math.radians(90) - el, 0, 0)
        tmp = os.path.join(tempfile.mkdtemp(), 'i.png'); render(sc, tmp)
        icon_post(tmp, os.path.join(ICONS, id_ + '.png'), ev, drop)
    if os.environ.get('NO3D') != '1':                                   # 확인: 내보낸 GLB를 다시 읽어 게임 시점(위에서 44°)으로
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=glb)
        sc, cam = scene_setup(200, 1.35)
        for o in sc.objects:
            if o.type == 'MESH': o.rotation_euler = (0, 0, math.radians(-35))
        el = math.radians(40); cam.location = (0, -5 * math.cos(el), 0.5 + 5 * math.sin(el)); cam.rotation_euler = (math.radians(90) - el, 0, 0)
        render(sc, os.path.join(CHECK, id_ + '_3d.png'))
    print(id_, 'stage', stage, 'ev', ev, 'drop', drop, 'tris', tris, 'KB', size // 1024, flush=True)

def sheets(out='/tmp/gear2'):
    """계열마다 확인표 /tmp/gear2/sheet_<계열>_arm.png: 윗줄 아이콘(128 px ×1.5), 아랫줄 내보낸 GLB 다시 읽은 렌더, 단계 순서·이름"""
    from PIL import ImageFont
    items = [i for i in json.load(open(os.path.join(ROOT, 'assets', 'data', 'items.json')))['items'] if i['id'].startswith('ag_')]
    try: font = ImageFont.truetype(os.path.join(ROOT, 'assets', 'fonts', 'Jua.woff2'), 15)
    except Exception: font = ImageFont.load_default()
    for L in designs.LINES:
        row = [i for i in items if i['id'].split('_')[1] == L['key']]; row.sort(key=lambda i: int(i['id'].split('_')[2]))
        W = 200; img = Image.new('RGBA', (W * len(row) + 20, 450), (58, 56, 70, 255)); d = ImageDraw.Draw(img)
        for k, it in enumerate(row):
            x = 10 + k * W
            for f, y, sz in ((os.path.join(ICONS, it['id'] + '.png'), 8, 192), (os.path.join(CHECK, it['id'] + '_3d.png'), 205, 200)):
                if os.path.exists(f): a = Image.open(f).convert('RGBA').resize((sz, sz)); img.paste(a, (x + (W - sz) // 2, y), a)
            d.text((x + 6, 408), it['id'] + (' 드롭' if it.get('dropFrom') else ''), fill=(200, 160, 255) if it.get('dropFrom') else (230, 230, 230), font=font)
            d.text((x + 6, 428), it['name'], fill=(255, 226, 150), font=font)
        img.save(os.path.join(out, 'sheet_%s_arm.png' % L['key']))

if __name__ == '__main__':
    if '--sheets' in sys.argv: sheets(); sys.exit(0)
    ids = [i['id'] for i in json.load(open(os.path.join(ROOT, 'assets', 'data', 'items.json')))['items'] if i['id'].startswith('ag_')]
    args = sys.argv[1:]
    sel = [i for i in ids if not args or i in args or i.split('_')[1] in args]
    for i in sel: process(i)
