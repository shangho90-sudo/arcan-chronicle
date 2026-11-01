"""Forest monsters -> the user's animal creatures (idempotent patch of the web data).
Ids of existing monsters / items / quests are kept so old saves and quest progress stay valid:
  mon_slime -> 숲 토끼, mon_shroom -> 도토리 다람쥐 (still ranged), mon_golem -> 꽃잎 곰 (still heavy)
  new: mon_fox 날쌘 여우 (Lv3), mon_wolf 달빛 늑대 (Lv5), mon_boar 이끼 멧돼지 (Lv6)
  m_jelly -> 보송한 토끼털, m_spore -> 단단한 도토리, m_moss_stone -> 곰 발톱; new m_fox_fur, m_wolf_fang, m_boar_tusk
"""
import json, os, copy
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); D = os.path.join(ROOT, 'assets', 'data')
J = lambda n: json.load(open(os.path.join(D, n + '.json')))
def W(n, o): json.dump(o, open(os.path.join(D, n + '.json'), 'w'), ensure_ascii=False, indent=1)

mon = J('monsters'); M = {m['id']: m for m in mon['monsters']}
M['mon_slime'].update(name='숲 토끼'); M['mon_shroom'].update(name='도토리 다람쥐'); M['mon_golem'].update(name='꽃잎 곰')
def new(id_, base, **kw):
    if id_ in M: M[id_].update(kw); return
    m = copy.deepcopy(M[base]); m.update(id=id_, **kw); mon['monsters'].append(m); M[id_] = m
new('mon_fox', 'mon_slime', name='날쌘 여우', level=3, hp=72, atk=11, exp=16, goldMin=4, goldMax=9, moveSpeed=3.3, detectRange=7, attackRange=1.2, attackCooldown=1.3, def_=0,
    drops=[{'item': 'm_fox_fur', 'chance': 0.65, 'min': 1, 'max': 1}, {'item': 'c_potion_s', 'chance': 0.12, 'min': 1, 'max': 1}, {'item': 'm_herb', 'chance': 0.12, 'min': 1, 'max': 1}])
new('mon_wolf', 'mon_slime', name='달빛 늑대', level=5, hp=115, atk=15, exp=28, goldMin=7, goldMax=14, moveSpeed=3.5, detectRange=8, attackRange=1.4, attackCooldown=1.4, radius=0.5, respawn=12,
    drops=[{'item': 'm_wolf_fang', 'chance': 0.6, 'min': 1, 'max': 1}, {'item': 'c_potion_m', 'chance': 0.06, 'min': 1, 'max': 1}, {'item': 'c_sp_potion', 'chance': 0.06, 'min': 1, 'max': 1}])
new('mon_boar', 'mon_slime', name='이끼 멧돼지', level=6, hp=175, atk=19, exp=38, goldMin=9, goldMax=18, moveSpeed=2.9, detectRange=7, attackRange=1.5, attackCooldown=1.8, windup=0.5, radius=0.55, respawn=14,
    drops=[{'item': 'm_boar_tusk', 'chance': 0.6, 'min': 1, 'max': 1}, {'item': 'c_potion_m', 'chance': 0.08, 'min': 1, 'max': 1}, {'item': '@jobweapon:2', 'chance': 0.03, 'min': 1, 'max': 1}])
for k in ('mon_fox', 'mon_wolf', 'mon_boar'):
    m = M[k]; m.pop('def_', None); m['def'] = {'mon_fox': 2, 'mon_wolf': 4, 'mon_boar': 7}[k]; m['sheet'] = 'mon_slime'; m['ai'] = 'melee'
W('monsters', mon)

it = J('items'); I = {i['id']: i for i in it['items']}
I['m_jelly'].update(name='보송한 토끼털', desc='숲 토끼의 부드러운 털. 상점에 팔 수 있다.')
I['m_spore'].update(name='단단한 도토리', desc='도토리 다람쥐가 모아 둔 도토리. 약재로 쓰인다.')
I['m_moss_stone'].update(name='곰 발톱', desc='꽃잎 곰의 단단한 발톱. 대장장이가 좋아한다.')
for id_, nm, ds, tier, sp in (('m_fox_fur', '여우 꼬리털', '날쌘 여우의 풍성한 꼬리털.', 1, 6), ('m_wolf_fang', '늑대 송곳니', '달빛 늑대의 날카로운 송곳니.', 2, 10), ('m_boar_tusk', '멧돼지 엄니', '이끼 멧돼지의 굽은 엄니.', 2, 12)):
    if id_ not in I:
        x = copy.deepcopy(I['m_jelly']); x.update(id=id_, name=nm, desc=ds, tier=tier, sellPrice=sp, icon=id_); it['items'].append(x); I[id_] = x
W('items', it)

q = J('quests'); Q = {x['id']: x for x in q['quests']}
Q['q3_slime'].update(name='숲 토끼 소동', summary='속삭이는 숲 입구의 숲 토끼 6마리를 쫓아내자.',
    offerText='성문 너머 속삭이는 숲에 숲 토끼가 너무 늘어 밭을 망치고 있소. 여섯 마리만 쫓아내 주겠소?', progressText='성문 밖 워프를 타면 숲이오. 조심하시오.')
Q['q3_slime']['objectives'][0]['text'] = '숲 토끼 처치'
Q['q4_spore'].update(name='도토리 채집', summary='도토리 다람쥐에게서 단단한 도토리 5개를 모아 약사 소연에게 가져가자.',
    offerText='새 해독약을 만들려면 단단한 도토리가 필요해요. 숲 안쪽의 도토리 다람쥐가 떨어뜨린답니다. 다섯 개만 부탁해요!',
    progressText='다람쥐는 멀리서 도토리를 던지니까 가까이 붙어서 싸워요.', completeText='완벽해요! 이걸로 좋은 약을 만들 수 있겠어요. 감사의 표시로 회복 물약을 드릴게요.')
Q['q4_spore']['objectives'][0]['text'] = '단단한 도토리 모으기'
Q['q5_gear']['offerText'] = Q['q5_gear']['offerText'].replace('골렘', '곰')
Q['q6_golem'].update(name='꽃잎 곰 토벌', summary='숲 동쪽 유적의 꽃잎 곰 3마리를 쓰러뜨리자.',
    offerText='숲 동쪽 유적에 꽃잎 곰이 내려왔소. 앞발을 내려치기 전에 땅에 표시가 나타나니 그때 피하시오.',
    completeText='대단하오! 곰 굴에서 찾은 부적이오. 체력을 북돋아 줄 거요.')
Q['q6_golem']['objectives'][0]['text'] = '꽃잎 곰 처치'
W('quests', q)

z = J('zones'); f = next(t for t in z['zones'] if t['id'] == 'forest')
f['monsters'] = [
    {'monster': 'mon_slime', 'pos': [-22, -16], 'radius': 5, 'count': 5},
    {'monster': 'mon_fox', 'pos': [-12, -24], 'radius': 4, 'count': 3},
    {'monster': 'mon_shroom', 'pos': [-20, 4], 'radius': 4.5, 'count': 4},
    {'monster': 'mon_wolf', 'pos': [-4, 2], 'radius': 4.5, 'count': 3},
    {'monster': 'mon_boar', 'pos': [6, -12], 'radius': 4.5, 'count': 3},
    {'monster': 'mon_golem', 'pos': [19, -15], 'radius': 5, 'count': 3},
]
W('zones', z)
print('ok', len(mon['monsters']), 'monsters', len(it['items']), 'items')
