"""메인 퀘스트 진행에 따른 지역 입장 조건(2026-11-15) + 필드 권장 레벨.

tools/world/world.py 가 불러 씁니다(직접 실행하지 않음 — 표만 보려면 `python3 tools/world/world.py --gates`).
결과는 world.py --write 가 zones.json 에 씁니다:
  zones[*].unlock        = 이 지역을 여는 메인 퀘스트 단계 id (없으면 처음부터 열림)
  world.main             = {order: [단계 id…], steps: {id: {gz, tz, oz: [목표별 지역|null]}}}  (세계 지도 목적지 표시용)
  필드의 level           = 그 지역을 여는 단계의 '예상 레벨'(메인 단계 minLevel 의 누적 최댓값) ~ +3

규칙
- 지역 Z 를 처음 쓰는 메인 단계 S(주는 NPC·목표·완료 NPC가 있는 곳, 또는 거기로 가는 길목)를 찾고,
  S 의 선행 퀘스트(prereq)를 모두 마치면(= S 를 받을 수 있게 되면) Z 가 열립니다.
- 길목: S 가 필요로 하는 지역이 아직 닫혀 있으면 이미 열린 곳에서 포털 그래프로 가장 가까운 길을 찾아
  그 길의 지역도 S 에 엽니다(용의 유적 → 아르칸 같은 편도 포털은 방향대로).
- 메인 퀘스트가 한 번도 쓰지 않는 지역: 이미 열린 이웃이 있고, 예상 레벨이 그 지역의 원래 최저 레벨 이상이 되는
  첫 단계에 엽니다(레벨대·지리 기준). 이 지역의 권장 레벨은 원래 값 그대로.
- 처음부터 열림: 아르칸 마을·속삭이는 숲·왕도 가는 길(OPEN).
"""
import json, os, sys
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
sys.path.insert(0, HERE)
import story   # noqa: E402  (QUESTS: 메인 단계의 giver/turnIn/목표 지역)

OPEN = ['town', 'forest', 'capital_road']
# story.py 이전의 메인 퀘스트(그대로 둔 것): 단계가 쓰는 지역
LEGACY = {
    'q1_start': dict(gz='town', tz='town', oz=['town']),
    'q2_merchant': dict(gz='town', tz='town', oz=['town']),
    'q_job1': dict(gz='town', tz='town', oz=['kairion_capital']),          # 전직 마스터 = 카이리온 왕도 길드 회관
    'q7_boss': dict(gz='town', tz='town', oz=['mushroom_grove']),
}
INSERT_BEFORE = {'mq06a': 'q7_boss', 'mq07c': 'q_job1'}                     # 이야기 순서 안 자리
# job 목표: 'any' = 1차 전직(길드 회관), 'tier2' = 2차 전직 시험(qt_*: 안개골 우두머리 곰·서리뿔 산양 사냥)
JOB_ZONES = {'any': ['kairion_capital'], 'tier2': ['kairion_capital', 'mist_valley', 'frost_highland']}
KEEP_LEVEL = {'forest'}          # 처음 필드(Lv1 몬스터) 레벨은 그대로
WIDTH = 3                        # 권장 레벨 폭: lo ~ lo + 3


def chain():
    """메인 단계 목록(이야기 순서): [{id, name, lv, prereq, gz, tz, objs:[(type, target, zone|None, extra)]}]"""
    qj = json.load(open(os.path.join(ROOT, 'assets', 'data', 'quests.json'), encoding='utf-8'))
    old = {q['id']: q for q in qj['quests']}
    out = []
    def legacy(i):
        q = old[i]; L = LEGACY[i]
        objs = [(o['type'], o['target'], L['oz'][k] if k < len(L['oz']) else None, None) for k, o in enumerate(q['objectives'])]
        return dict(id=i, name=q['name'], lv=q['minLevel'], prereq=list(q.get('prereq') or []), gz=L['gz'], tz=L['tz'], objs=objs)
    out += [legacy('q1_start'), legacy('q2_merchant')]
    prev = None
    for q in story.QUESTS:
        if q['category'] != 'main': continue
        if q['id'] in INSERT_BEFORE: out.append(legacy(INSERT_BEFORE[q['id']]))
        pre = q['prereq'] if q['prereq'] is not None else ([prev] if prev else [])
        prev = q['id']
        objs = []
        for o in q['objectives']:
            z = o.get('_at') or (o.get('spawn') or {}).get('zone') or (o.get('gather') or {}).get('zone') or (o['target'] if o['type'] == 'visit' else None)
            objs.append((o['type'], o['target'], z, (o.get('drop') or {}).get('from')))
        out.append(dict(id=q['id'], name=q['name'], lv=q['lv'], prereq=list(pre), gz=q['gz'], tz=q['tz'], objs=objs))
    return out


def bfs(graph, sources, goal):
    """sources(열린 곳)에서 goal 까지 가장 짧은 길(goal 포함, 출발지 제외). 이웃 순서는 이름순(결정적)."""
    prev = {s: None for s in sources}; dq = deque(sorted(sources))
    while dq:
        a = dq.popleft()
        if a == goal: break
        for b in sorted(graph.get(a, ())):
            if b not in prev: prev[b] = a; dq.append(b)
    if goal not in prev: return None
    path = []; x = goal
    while prev[x] is not None: path.append(x); x = prev[x]
    return path[::-1]


def compute(graph, monzones, levels, kinds):
    """graph: {zone: set(target zones)} (포털, 방향 있음) / monzones: {monster: set(zones)} / levels: {zone: [lo, hi]} 원래 값
    / kinds: {zone: 'town'|'field'}. → dict(unlock, steps, order, table, level)"""
    steps = chain(); E = 0; exp = {}
    for s in steps: E = max(E, s['lv']); exp[s['id']] = E
    unlock = {z: None for z in OPEN}; opened_by = {}; route = {}
    info = {}
    for s in steps:
        need = []; oz = []
        def want(z):
            if z and z not in need: need.append(z)
        want(s['gz'])
        explicit = [s['gz'], s['tz']] + [o[2] for o in s['objs'] if o[2]]
        for typ, tgt, z, frm in s['objs']:
            if typ == 'job': zs = JOB_ZONES[tgt]; [want(x) for x in zs]; oz.append(zs[0]); continue
            if z: want(z); oz.append(z); continue
            mons = [tgt] if typ == 'kill' else (frm or [])
            cand = set().union(*[monzones.get(m, set()) for m in mons]) if mons else set()
            if not cand: oz.append(None); continue
            pick = next((x for x in explicit if x in cand), None)
            if pick is None:
                op = [x for x in cand if x in unlock]
                if op: pick = max(op, key=lambda x: (list(unlock).index(x), x))         # 가장 최근에 열린 곳
                else:
                    best = None
                    for x in sorted(cand):
                        p = bfs(graph, set(unlock), x)
                        if p and (best is None or len(p) < len(best[1])): best = (x, p)
                    pick = best[0] if best else None
            want(pick); oz.append(pick)
        want(s['tz'])
        for z in need:
            if z in unlock: continue
            p = bfs(graph, set(unlock), z)
            assert p, ('갈 길이 없음', s['id'], z)
            for x in p:
                if x not in unlock: unlock[x] = s['id']; route[x] = x != z
        info[s['id']] = dict(gz=s['gz'], tz=s['tz'], oz=oz)
    referenced = set(unlock)
    # 메인 퀘스트가 쓰지 않는 지역: 이웃이 열려 있고 예상 레벨이 원래 최저 레벨 이상인 첫 단계
    rest = sorted(set(graph) - set(unlock))
    order = [s['id'] for s in steps]; idx = {sid: i for i, sid in enumerate(order)}
    for i, s in enumerate(steps):
        changed = True
        while changed:
            changed = False
            here = [a for a, sid in unlock.items() if sid is None or idx[sid] <= i]     # 이 단계까지 열린 곳
            for z in list(rest):
                into = any(z in graph.get(a, ()) for a in here)
                if into and exp[s['id']] >= levels.get(z, [1, 50])[0]:
                    unlock[z] = s['id']; rest.remove(z); changed = True
    for z in rest: unlock[z] = steps[-1]['id']
    # 권장 레벨: 메인이 쓰는 필드 = 여는 단계의 예상 레벨 ~ +3, 나머지 = 원래
    lv = {}
    for z, sid in unlock.items():
        if kinds.get(z) != 'field' or z in KEEP_LEVEL or z not in referenced or sid is None:
            lv[z] = list(levels.get(z, [1, 50])); continue
        lo = exp[sid]; lv[z] = [lo, min(50, lo + WIDTH)]
    for z in OPEN:
        if kinds.get(z) == 'field' and z not in KEEP_LEVEL:      # 처음부터 열린 필드: 처음 쓰는 단계 기준
            sid = next((s['id'] for s in steps if z in (info[s['id']]['gz'], info[s['id']]['tz']) or z in info[s['id']]['oz']), None)
            lo = exp[sid] if sid else levels[z][0]; lv[z] = [lo, min(50, lo + WIDTH)]
    names = {s['id']: s['name'] for s in steps}
    table = sorted(unlock.items(), key=lambda kv: (-1 if kv[1] is None else order.index(kv[1]), kv[0]))
    return dict(unlock=unlock, steps=info, order=order, names=names, exp=exp, level=lv, referenced=referenced, route=route, table=table)


def print_table(G, old_levels, kinds, zname):
    print('%-20s %-14s %-6s %-32s %-9s %-9s %s' % ('zone', 'name', 'kind', 'unlock step', 'old Lv', 'new Lv', 'note'))
    for z, sid in G['table']:
        o = old_levels.get(z); n = G['level'].get(z)
        note = 'start' if sid is None else ('route' if G['route'].get(z) else ('main' if z in G['referenced'] else 'level band'))
        print('%-20s %-14s %-6s %-32s %-9s %-9s %s' % (z, zname.get(z, '')[:12], kinds.get(z, ''), (sid or '-') + ' ' + (G['names'].get(sid, '') if sid else ''),
                                                    '%s~%s' % tuple(o) if o else '', '%s~%s' % tuple(n) if n else '', note))
