"""3D castle town layout: places the user's Tripo models (fountain, pharmacy cottage, smithy), the procedurally
modelled shops (general store, arms shop, bakery, dress shop), castle walls / towers / gatehouse / keep, ground
roads and decor; writes collision footprints (blockPolys), NPC anchors in front of every entrance and the render
spec (town3d) into assets/data/zones.json.

    python3 tools/town_castle.py           # report + preview  (tools/out/town_castle_top.png)
    python3 tools/town_castle.py --write   # also write zones.json

Coordinates are game (Unity) metres: x east, z north. Heading h of a building = compass direction its front faces
(180 = south, 270 = west, 225 = south-west); the camera looks from the south-west, so every facade faces S / SW / W.
"""
import json, math, os, sys
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
ZONES = os.path.join(ROOT, "assets", "data", "zones.json")
OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- buildings
# Tripo GLB: size = model bbox (x width, z depth, y height) in model units, scaled uniformly
GLB = {
    "fountain": dict(file="angel_fountain", size=(0.9623, 0.9774, 0.5034)),
    "pharmacy": dict(file="fantasy_cottage", size=(0.9805, 0.8126, 0.8876)),
    "smithy":   dict(file="medieval_blacksmith_shop", size=(0.9814, 0.6676, 0.5859)),
}
BUILDINGS = [
    # id, kind, model/style, centre (x, z), heading, scale or (w, d), npc, name, door offset along the facade (m)
    dict(id="bakery",   kind="house", style="bakery",  pos=(-22.4, 16.6), h=180, w=9.6, d=8.0, npc="master_cook",        name="화덕 빵집", door=-1.6),
    dict(id="smithy",   kind="glb",   model="smithy",  pos=(-10.6, 16.1), h=180, scale=10.5, npc="master_blacksmith", name="철산의 대장간", door=0.0),
    dict(id="pharmacy", kind="glb",   model="pharmacy", pos=(2.6, 17.3), h=180, scale=11.5, npc="master_pharmacist", name="약초 약국", door=0.0),
    dict(id="general",  kind="house", style="general", pos=(18.0, 16.2), h=225, w=9.6, d=8.0, npc="merchant",           name="모아의 잡화·물약점", door=1.2),
    dict(id="dress",    kind="house", style="dress",   pos=(19.4, 2.2),  h=270, w=9.2, d=7.6, npc="master_hairdresser", name="라벤더 의상실", door=-1.0),
    dict(id="arms",     kind="house", style="arms",    pos=(19.4, -10.2), h=270, w=9.6, d=8.0, npc="armorer",           name="단오의 무기·방어구점", door=1.0),
]
FOUNTAIN = dict(id="fountain", kind="glb", model="fountain", pos=(0.0, 0.0), h=180, scale=11.5, name="여신의 분수")

# ---------------------------------------------------------------- castle
WALL_T = 2.4
WALLS = [  # centre line a -> b, height; south wall leaves the gate opening x 0.4 .. 5.6
    dict(id="wall_n", a=(-31.0, 24.6), b=(27.2, 24.6), h=7.0),
    dict(id="wall_e", a=(27.2, 24.6), b=(27.2, -22.6), h=7.0),
    dict(id="wall_w", a=(-31.0, 24.6), b=(-31.0, -22.6), h=4.2),
    dict(id="wall_s1", a=(-31.0, -22.6), b=(-0.9, -22.6), h=3.6),
    dict(id="wall_s2", a=(6.9, -22.6), b=(27.2, -22.6), h=3.6),
]
TOWERS = [dict(id="tower_ne", pos=(27.2, 24.6), r=3.3, h=11.0), dict(id="tower_nw", pos=(-31.0, 24.6), r=3.3, h=10.0),
          dict(id="tower_se", pos=(27.2, -22.6), r=3.0, h=7.0), dict(id="tower_sw", pos=(-31.0, -22.6), r=2.8, h=6.0),
          dict(id="tower_n", pos=(-8.0, 24.6), r=2.6, h=9.5)]
GATE = dict(id="gate", pos=(3.0, -22.6), w=5.2, h=4.2, towers=[(-1.6, -22.6), (7.6, -22.6)], tr=2.2, th=7.0)
KEEP = dict(id="keep", pos=(6.0, 37.0), w=18.0, d=12.0, h=15.0)
BOUNDS = [-30.0, -29.0, 26.0, 24.0]

# ---------------------------------------------------------------- helpers
def heading_vec(h):
    r = math.radians(h); return (math.sin(r), math.cos(r))
def rect(cx, cz, w, d, h, inset=0.0):
    f = heading_vec(h); rgt = (f[1], -f[0]); w2, d2 = w / 2 - inset, d / 2 - inset
    return [(cx + rgt[0] * sx * w2 + f[0] * sz * d2, cz + rgt[1] * sx * w2 + f[1] * sz * d2) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
def circle(cx, cz, r, n=20):
    return [(cx + r * math.cos(i / n * 2 * math.pi), cz + r * math.sin(i / n * 2 * math.pi)) for i in range(n)]
def seg_rect(a, b, t):
    dx, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dz); nx, nz = -dz / L * t / 2, dx / L * t / 2
    return [(a[0] + nx, a[1] + nz), (b[0] + nx, b[1] + nz), (b[0] - nx, b[1] - nz), (a[0] - nx, a[1] - nz)]
def inside(poly, x, z):
    c = False; n = len(poly)
    for i in range(n):
        x1, z1 = poly[i]; x2, z2 = poly[i - 1]
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1: c = not c
    return c
def seg_dist(px, pz, a, b):
    ax, az = a; bx, bz = b; dx, dz = bx - ax, bz - az; L = dx * dx + dz * dz
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L))
    return math.hypot(px - ax - t * dx, pz - az - t * dz)
def pdist(poly, x, z):
    return 0 if inside(poly, x, z) else min(seg_dist(x, z, poly[i], poly[i - 1]) for i in range(len(poly)))
def poly_gap(p1, p2):
    return min(min(pdist(p2, *q) for q in p1), min(pdist(p1, *q) for q in p2))

def dims(b):
    if b["kind"] == "glb":
        s = GLB[b["model"]]["size"]; return s[0] * b["scale"], s[1] * b["scale"], s[2] * b["scale"]
    return b["w"], b["d"], None
def entrance(b, out=1.0):
    w, d, _ = dims(b); f = heading_vec(b["h"]); rgt = (f[1], -f[0]); o = b.get("door", 0.0)
    return (b["pos"][0] + f[0] * (d / 2 + out) + rgt[0] * o, b["pos"][1] + f[1] * (d / 2 + out) + rgt[1] * o)

# decor that blocks movement (centre, radius) -- built by js/town3d.js from the same list
DECOR = [
    dict(type="well", pos=(-17.0, -2.0), r=1.5),
    dict(type="stall", pos=(-19.5, -10.5), h=200, w=3.4, d=2.0, awning="awning_green", goods="veg"),
    dict(type="stall", pos=(-13.6, -14.8), h=200, w=3.4, d=2.0, awning="awning_red", goods="cloth"),
    dict(type="dummy", pos=(10.6, -17.6), r=0.5), dict(type="dummy", pos=(12.4, -16.0), r=0.5),
    dict(type="hay", pos=(-26.6, -18.4), r=1.0), dict(type="hay", pos=(-24.6, -19.6), r=0.9),
    dict(type="cart", pos=(-26.2, -6.0), h=200, w=3.0, d=1.8),
    dict(type="barrels", pos=(13.6, 21.0), r=0.9), dict(type="barrels", pos=(-16.6, 21.2), r=0.9), dict(type="crates", pos=(14.2, -17.2), r=0.8),
    dict(type="banner", pos=(-1.6, -19.2), r=0.3), dict(type="banner", pos=(7.6, -19.2), r=0.3),
    dict(type="planter", pos=(-24.0, 6.0), r=1.4), dict(type="planter", pos=(-26.6, -12.6), r=1.4), dict(type="planter", pos=(9.8, 9.6), r=1.1),
]
LANTERNS = [(round(7.4 * math.cos(math.radians(a)), 2), round(7.4 * math.sin(math.radians(a)), 2)) for a in (25, 75, 140, 205, 250, 320)] + [(-0.8, -19.4), (6.8, -19.4)]


def build(z):
    blocks = []
    def add(i, pts): blocks.append(dict(id=i, pts=[[round(x, 3), round(zz, 3)] for x, zz in pts]))
    add("fountain", circle(0, 0, 5.3, 28))
    for b in BUILDINGS:
        w, d, _ = dims(b); add(b["id"], rect(*b["pos"], w, d, b["h"], inset=0.1))
    for wl in WALLS: add(wl["id"], seg_rect(wl["a"], wl["b"], WALL_T))
    for t in TOWERS: add(t["id"], circle(*t["pos"], t["r"] + 0.1, 16))
    for i, p in enumerate(GATE["towers"]): add(f"gate_t{i}", circle(*p, GATE["tr"] + 0.1, 14))
    # nothing walkable behind the buildings: strips between the north / east rows and the walls
    add("back_n", [(-31, 20.2), (14, 20.2), (14, 24), (-31, 24)])
    add("back_ne", [(14, 18.5), (27, 9.5), (27, 24), (14, 24)])
    add("back_e", [(23.4, 9.0), (27, 9.0), (27, -22), (23.4, -22)])
    # outside the south wall only the road to the warp is walkable
    add("out_sw", [(-31, -29.5), (0.6, -29.5), (0.6, -23.6), (-31, -23.6)])
    add("out_se", [(5.4, -29.5), (27, -29.5), (27, -23.6), (5.4, -23.6)])
    for i, dc in enumerate(DECOR):
        if "w" in dc: add(f"decor{i}", rect(*dc["pos"], dc["w"], dc["d"], dc.get("h", 180), inset=-0.1))
        else: add(f"decor{i}", circle(*dc["pos"], dc["r"], 12))
    for i, (x, zz) in enumerate(LANTERNS): add(f"lantern{i}", circle(x, zz, 0.3, 8))

    npcs = []
    for b in BUILDINGS:
        ex, ez = entrance(b); rot = ((b["h"] + 180) % 360) - 180
        npcs.append(dict(npc=b["npc"], pos=[round(ex, 2), round(ez, 2)], rot=float(rot), building=b["id"]))
    npcs.append(dict(npc="master_artist", pos=[-11.4, -6.4], rot=45.0))
    npcs.append(dict(npc="elder", pos=[-4.6, -8.6], rot=45.0))
    npcs.append(dict(npc="guard", pos=[6.4, -18.4], rot=-30.0))

    # props from the C# builder that still fit: signpost, a few trees in planters, flowers / bushes by the walls
    props = [dict(type="signpost", pos=[8.6, -19.6], rot=0.0, scale=1.0, variant="field", w=0.0, d=0.0),
             dict(type="easel", pos=[-12.6, -5.2], rot=225.0, scale=1.0, variant="", w=0.0, d=0.0)]
    for p in [(-28.4, 2.0), (-28.4, 12.0), (-28.6, -2.6), (24.4, -18.0), (-20.0, -19.8), (12.6, -20.0)]:
        props.append(dict(type="bush", pos=list(p), rot=0.0, scale=1.0, variant="", w=0.0, d=0.0))
    for p in [(-6.2, -10.6), (6.8, -8.6), (-9.6, 4.6), (-13.8, -4.0), (-21.0, 10.0)]:
        props.append(dict(type="flowers", pos=list(p), rot=0.0, scale=1.0, variant="", w=0.0, d=0.0))

    # roads (cobble) over the courtyard flagstones: ring round the fountain, gate road, spur to every door
    roads = [dict(kind="ring", pos=[0, 0], r0=5.2, r1=8.8)]
    roads.append(dict(kind="path", pts=[[3.0, -24.8], [3.0, -16.0], [1.6, -9.0]], w=4.4))
    for n in npcs:
        if "building" not in n: continue
        x, zz = n["pos"]; d = math.hypot(x, zz); sx, sz = x / d * 8.6, zz / d * 8.6
        roads.append(dict(kind="path", pts=[[round(sx, 2), round(sz, 2)], [x, zz]], w=3.0))
    roads.append(dict(kind="path", pts=[[-7.4, -5.0], [-17.0, -2.0]], w=2.6))
    grass = [dict(pts=[[-30, -21], [-21, -21], [-23, -15], [-30, -13]]), dict(pts=[[-30, -2], [-26.5, 0], [-26.5, 11], [-30, 14]]),
             dict(pts=[[20, -21.2], [26, -21.2], [26, -15], [22, -17]]), dict(pts=[[9.0, 7.6], [12.4, 8.4], [12.0, 11.6], [8.4, 11.0]])]

    town3d = dict(
        models=[dict(id=b["id"], file=GLB[b["model"]]["file"], pos=list(b["pos"]), h=b["h"], scale=b["scale"], size=list(dims(b)), name=b["name"])
                for b in [FOUNTAIN] + [b for b in BUILDINGS if b["kind"] == "glb"]],
        houses=[dict(id=b["id"], style=b["style"], pos=list(b["pos"]), h=b["h"], w=b["w"], d=b["d"], door=b["door"], name=b["name"]) for b in BUILDINGS if b["kind"] == "house"],
        walls=[dict(id=w["id"], a=list(w["a"]), b=list(w["b"]), h=w["h"], t=WALL_T) for w in WALLS],
        towers=[dict(id=t["id"], pos=list(t["pos"]), r=t["r"], h=t["h"]) for t in TOWERS],
        gate=dict(pos=list(GATE["pos"]), w=GATE["w"], h=GATE["h"], towers=[list(p) for p in GATE["towers"]], tr=GATE["tr"], th=GATE["th"], t=WALL_T),
        keep=dict(pos=list(KEEP["pos"]), w=KEEP["w"], d=KEEP["d"], h=KEEP["h"]),
        ground=dict(inner=[-31.0, -22.6, 27.2, 24.6], roads=roads, grass=grass),
        decor=[{k: (list(v) if isinstance(v, tuple) else v) for k, v in dc.items()} for dc in DECOR],
        lanterns=[list(p) for p in LANTERNS],
    )
    z["bounds"] = BOUNDS
    z["buildings"] = []; z["imageArt"] = []; z["heights"] = []
    z["patches"] = []                       # ground is drawn by js/town3d.js
    z["props"] = props; z["npcs"] = npcs
    z["spawns"] = [dict(id="start", pos=[-1.0, -10.8], rot=45.0), dict(id="from_field", pos=[3.0, -20.0], rot=0.0), dict(id="revive", pos=[-2.6, -10.0], rot=45.0)]
    for p in z["portals"]:
        if p["id"] == "to_field": p["pos"] = [3.0, -26.6]; p["radius"] = 1.7
    z["blockPolys"] = blocks
    z["town3d"] = town3d
    return z


# ---------------------------------------------------------------- checks
def blocked(z, x, zz, r=0.32):
    b = z["bounds"]
    if not (b[0] + r <= x <= b[2] - r and b[1] + r <= zz <= b[3] - r): return True
    return any(inside(p["pts"], x, zz) or pdist(p["pts"], x, zz) < r for p in z["blockPolys"])

def report(z):
    ok = True; polys = {p["id"]: p["pts"] for p in z["blockPolys"]}
    ids = ["fountain"] + [b["id"] for b in BUILDINGS]
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            g = poly_gap(polys[ids[i]], polys[ids[j]])
            if g < 1.2: print(f"  ! {ids[i]} - {ids[j]} gap {g:.2f} m"); ok = False
    for n in z["npcs"]:
        for i, p in polys.items():
            d = pdist(p, *n["pos"])
            if d < 0.5: print(f"  ! npc {n['npc']} {d:.2f} m from {i}"); ok = False
    # flood fill from the start spawn on a 0.5 m grid: every NPC and the portal must be reachable
    b = z["bounds"]; step = 0.5
    nx = int((b[2] - b[0]) / step) + 1; nz = int((b[3] - b[1]) / step) + 1
    free = [[not blocked(z, b[0] + i * step, b[1] + k * step) for k in range(nz)] for i in range(nx)]
    sx, sz = z["spawns"][0]["pos"]; s = (round((sx - b[0]) / step), round((sz - b[1]) / step))
    seen = {s}; q = deque([s])
    while q:
        i, k = q.popleft()
        for di, dk in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a = (i + di, k + dk)
            if 0 <= a[0] < nx and 0 <= a[1] < nz and a not in seen and free[a[0]][a[1]]: seen.add(a); q.append(a)
    def reach(x, zz, tol=1.6):
        return any((i, k) in seen for i in range(nx) for k in range(nz) if math.hypot(b[0] + i * step - x, b[1] + k * step - zz) < tol)
    for n in z["npcs"]:
        if not reach(*n["pos"]): print("  ! cannot reach", n["npc"]); ok = False
    for p in z["portals"]:
        if not reach(*p["pos"], tol=p["radius"]): print("  ! cannot reach portal", p["id"]); ok = False
    print(f"walkable cells {len(seen)}")
    print("layout ok" if ok else "LAYOUT PROBLEMS")
    return ok, seen, (nx, nz, step)

def draw(z, seen, grid):
    from PIL import Image, ImageDraw
    b = z["bounds"]; S = 16; W = int((b[2] - b[0] + 16) * S); H = int((b[3] - b[1] + 24) * S)
    X = lambda x: (x - b[0] + 8) * S; Y = lambda zz: (b[3] + 16 - zz) * S
    im = Image.new("RGB", (W, H), (90, 120, 80)); d = ImageDraw.Draw(im)
    nx, nz, step = grid
    for (i, k) in seen:
        x, zz = b[0] + i * step, b[1] + k * step; d.rectangle([X(x) - 3, Y(zz) - 3, X(x) + 3, Y(zz) + 3], fill=(200, 190, 165))
    for p in z["blockPolys"]:
        col = (70, 70, 150) if p["id"].startswith(("wall", "tower", "gate", "back")) else (150, 80, 60)
        d.polygon([(X(x), Y(zz)) for x, zz in p["pts"]], outline=(20, 20, 20), fill=col)
    for n in z["npcs"]: x, zz = n["pos"]; d.ellipse([X(x) - 6, Y(zz) - 6, X(x) + 6, Y(zz) + 6], fill=(255, 230, 0)); d.text((X(x) + 8, Y(zz) - 6), n["npc"], fill=(0, 0, 0))
    for p in z["portals"]: x, zz = p["pos"]; d.ellipse([X(x) - 10, Y(zz) - 10, X(x) + 10, Y(zz) + 10], outline=(0, 200, 255), width=3)
    kx, kz = KEEP["pos"]; d.rectangle([X(kx - KEEP["w"] / 2), Y(kz + KEEP["d"] / 2), X(kx + KEEP["w"] / 2), Y(kz - KEEP["d"] / 2)], outline=(40, 40, 90), width=3)
    im.save(os.path.join(OUT, "town_castle_top.png"))


if __name__ == "__main__":
    data = json.load(open(ZONES))
    town = next(t for t in data["zones"] if t["id"] == "town")
    build(town)
    ok, seen, grid = report(town)
    draw(town, seen, grid)
    if "--write" in sys.argv:
        json.dump(data, open(ZONES, "w"), ensure_ascii=False, indent=1)
        print("wrote", ZONES)
