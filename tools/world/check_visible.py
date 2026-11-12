"""마을 NPC가 게임 카메라에 가려지는지 검사 (zone의 npcs + quests.json storyNpcs). Usage: python3 tools/world/check_visible.py → 가려진 NPC 목록, 없으면 0 hidden."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import visible
R = visible.ROOT
Z = json.load(open(os.path.join(R, 'assets/data/zones.json')))['zones']
Z = Z if isinstance(Z, dict) else {z['id']: z for z in Z}
names = {n['id']: n['name'] for n in (lambda d: d['npcs'] if isinstance(d, dict) and 'npcs' in d else d)(json.load(open(os.path.join(R, 'assets/data/npcs.json'))))} if True else {}
story = json.load(open(os.path.join(R, 'assets/data/quests.json'))).get('storyNpcs', [])
bad = total = 0
for zid, z in Z.items():
    if z.get('file'): z = json.load(open(os.path.join(R, 'assets/data', z['file']))) if os.path.exists(os.path.join(R, 'assets/data', z['file'])) else json.load(open(os.path.join(R, z['file'])))
    t3 = z.get('town3d')
    if not t3: continue
    occ = visible.occluders(t3)
    for n in list(z.get('npcs', [])) + [dict(npc=s['npc'], pos=s['pos']) for s in story if s.get('zone') == zid and s.get('pos')]:
        total += 1; hits = visible.blockers(occ, n['pos'][0], n['pos'][1])
        if hits: bad += 1; print('%-16s %-14s %s  ← %s' % (zid, names.get(n['npc'], n['npc']), n['pos'], sorted({h[4] for h in hits})))
print('%d NPC 검사, %d hidden' % (total, bad)); sys.exit(1 if bad else 0)
