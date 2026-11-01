# Monsters + material items for the Lv10-50 zones. Stats come from a simple player model (see player()).
# Idempotent: replaces previously generated ids in monsters.json / items.json.
import json, math, sys

MPATH = '/home/claude/ArcanWeb/assets/data/monsters.json'
IPATH = '/home/claude/ArcanWeb/assets/data/items.json'


def player(L):
    """rough player at level L with level-appropriate gear (job average; see report):
    atk = job base+growth (~14+2.6/lv) + weapon (~3/lv) + accessory (~1/lv); hp = base+growth (~140+18/lv) + armour (~12/lv);
    def = ~6+1.3/lv + armour (~2.2/lv)"""
    atk = 14 + 2.6 * (L - 1) + 4.0 * L
    hp = 140 + 18 * (L - 1) + 12 * L
    df = 6 + 1.3 * (L - 1) + 2.2 * L
    return atk, hp, df


_LV = json.load(open('/home/claude/ArcanWeb/assets/data/levels.json', encoding='utf-8')).get('expToNext', [])


def exp_to_next(L):
    """real curve from levels.json once it covers level L (re-run this script after the level-cap update), else ~30*L^1.9"""
    return _LV[L - 1] if len(_LV) >= 49 and L - 1 < len(_LV) else 30 * L ** 1.9


# role: hits-to-kill multiplier, damage share of player max HP per hit (after player def), attack coef used by the AI
ROLE = {
    'fast':   dict(hp=0.9, hit=0.08, coef=1.0, exp=0.9),
    'melee':  dict(hp=1.0, hit=0.09, coef=1.0, exp=1.0),
    'tank':   dict(hp=1.25, hit=0.10, coef=1.0, exp=1.15),
    'ranged': dict(hp=0.8, hit=0.085, coef=1.0, exp=1.0),
    'heavy':  dict(hp=1.3, hit=0.12, coef=1.6, exp=1.3),     # telegraphed slam (coef 1.6 in Monster.resolve)
    'elite':  dict(hp=4.0, hit=0.17, coef=1.6, exp=7.0),     # heavy AI, single spawn, long respawn
}


def stats(L, role):
    r = ROLE[role]
    patk, php, pdef = player(L)
    mdef = round(1.3 * L)
    per_hit = patk * 100 / (100 + mdef) * 1.05                  # basic attack, ~crit average
    hp = round(5.5 * per_hit * r['hp'] / 5) * 5
    atk = round(r['hit'] * php * (100 + pdef) / 100 / r['coef'])
    exp = round(exp_to_next(L) / 50 * r['exp'])
    return dict(hp=hp, atk=atk, def_=mdef, exp=exp, goldMin=round(1.6 * L * (1.5 if role == 'elite' else 1)), goldMax=round(3.2 * L * (2 if role == 'elite' else 1)))


def drops(mat, chance, extra):
    return [{'item': mat, 'chance': chance, 'min': 1, 'max': 1}] + [{'item': i, 'chance': c, 'min': 1, 'max': 1} for i, c in extra]


# id, name, level, role, ai, sheet, base timing, material, extra drops
POT = [('c_potion_m', 0.08), ('c_sp_potion', 0.05)]
MON = [
    # ---- 안개 골짜기
    ('mon_mist_fox', '안개 여우', 11, 'fast', 'melee', 'mon_slime', dict(moveSpeed=3.4, attackRange=1.2, attackCooldown=1.3, windup=0.35, radius=0.45, detectRange=7), 'm_mist_tail', POT),
    ('mon_fog_toad', '안개 두꺼비', 14, 'ranged', 'ranged', 'mon_shroom', dict(moveSpeed=2.0, attackRange=7, attackCooldown=2.2, windup=0.5, radius=0.5, detectRange=8, projectileFx='proj_spore', projectileSpeed=7.5), 'm_toad_gland', POT),
    ('mon_bog_boar', '늪 멧돼지', 17, 'tank', 'melee', 'mon_slime', dict(moveSpeed=3.0, attackRange=1.5, attackCooldown=1.8, windup=0.5, radius=0.6, detectRange=7), 'm_bog_tusk', POT + [('@jobweapon:2', 0.02)]),
    ('mon_mist_wolf', '안개 늑대', 20, 'fast', 'melee', 'mon_slime', dict(moveSpeed=3.7, attackRange=1.4, attackCooldown=1.3, windup=0.35, radius=0.55, detectRange=8.5), 'm_mist_fang', POT),
    ('mon_mist_bear', '안개골 우두머리 곰', 22, 'elite', 'heavy', 'mon_golem', dict(moveSpeed=2.0, attackRange=2.6, attackCooldown=2.6, windup=0.95, radius=1.0, attackRadius=2.8, detectRange=8, leashRange=12, respawn=90), 'm_mist_bear_claw',
     [('c_potion_m', 0.6), ('@jobweapon:2', 0.25), ('@jobweapon:3', 0.08), ('a_armor_3', 0.06)]),
    # ---- 서리 고원
    ('mon_frost_wolf', '서리 늑대', 23, 'fast', 'melee', 'mon_slime', dict(moveSpeed=3.8, attackRange=1.4, attackCooldown=1.3, windup=0.35, radius=0.55, detectRange=8.5), 'm_frost_fang', POT),
    ('mon_ice_fox', '얼음꽃 여우', 26, 'ranged', 'ranged', 'mon_shroom', dict(moveSpeed=2.6, attackRange=7.5, attackCooldown=2.0, windup=0.45, radius=0.45, detectRange=8.5, projectileFx='proj_paint', projectileSpeed=8.5), 'm_ice_tail', POT),
    ('mon_frost_ram', '서리뿔 산양', 29, 'tank', 'melee', 'mon_slime', dict(moveSpeed=3.0, attackRange=1.6, attackCooldown=1.7, windup=0.5, radius=0.65, detectRange=7.5), 'm_frost_horn', POT + [('@jobweapon:2', 0.02)]),
    ('mon_snow_bear', '설원 곰', 33, 'heavy', 'heavy', 'mon_golem', dict(moveSpeed=1.9, attackRange=2.3, attackCooldown=2.8, windup=0.95, radius=0.8, attackRadius=2.5, detectRange=7.5), 'm_snow_pelt', [('c_potion_m', 0.12), ('@jobweapon:2', 0.04), ('@jobweapon:3', 0.01)]),
    ('mon_ram_king', '빙하뿔 산양왕', 36, 'elite', 'heavy', 'mon_golem', dict(moveSpeed=2.2, attackRange=2.6, attackCooldown=2.5, windup=0.9, radius=1.05, attackRadius=3.0, detectRange=8, leashRange=12, respawn=120), 'm_glacier_horn',
     [('c_potion_m', 0.7), ('@jobweapon:2', 0.3), ('@jobweapon:3', 0.15), ('ac_ring_3', 0.08)]),
    # ---- 잊힌 용의 유적
    ('mon_ember_drake', '불씨 비룡', 38, 'melee', 'melee', 'mon_slime', dict(moveSpeed=3.3, attackRange=1.5, attackCooldown=1.5, windup=0.45, radius=0.6, detectRange=8), 'm_drake_scale', POT),
    ('mon_cinder_lizard', '잿불 도마뱀', 41, 'ranged', 'ranged', 'mon_shroom', dict(moveSpeed=2.4, attackRange=7.5, attackCooldown=2.1, windup=0.5, radius=0.45, detectRange=9, projectileFx='fire', projectileSpeed=8), 'm_cinder_gland', POT),
    ('mon_lava_boar', '용암 멧돼지', 44, 'tank', 'melee', 'mon_slime', dict(moveSpeed=3.1, attackRange=1.5, attackCooldown=1.7, windup=0.5, radius=0.6, detectRange=7.5), 'm_lava_tusk', POT + [('@jobweapon:3', 0.01)]),
    ('mon_ruin_golem', '유적 수호석', 47, 'heavy', 'heavy', 'mon_golem', dict(moveSpeed=1.6, attackRange=2.4, attackCooldown=3.0, windup=1.0, radius=0.85, attackRadius=2.7, detectRange=7), 'm_rune_shard', [('c_potion_m', 0.12), ('@jobweapon:3', 0.03)]),
    ('mon_drake_lord', '용혈 비룡', 49, 'elite', 'heavy', 'mon_golem', dict(moveSpeed=2.4, attackRange=2.6, attackCooldown=2.4, windup=0.85, radius=1.1, attackRadius=3.0, detectRange=8.5, leashRange=12, respawn=150), 'm_dragon_blood',
     [('c_potion_m', 0.8), ('@jobweapon:3', 0.3), ('a_armor_3', 0.15), ('ac_ring_3', 0.12)]),
]

ITEMS = [  # id, name, desc, tier, sellPrice
    ('m_mist_tail', '안개빛 여우 꼬리', '안개 여우의 은빛 꼬리털. 안개처럼 가볍다.', 2, 18),
    ('m_toad_gland', '안개 두꺼비 독샘', '안개 두꺼비의 끈적한 독샘. 약사들이 해독제 재료로 쓴다.', 2, 22),
    ('m_bog_tusk', '늪 멧돼지 엄니', '이끼와 진흙이 엉겨 붙은 묵직한 엄니.', 2, 26),
    ('m_mist_fang', '안개 늑대 송곳니', '희미하게 빛나는 안개 늑대의 송곳니.', 2, 30),
    ('m_mist_bear_claw', '우두머리 곰의 발톱', '안개골 우두머리 곰의 거대한 발톱. 대장장이가 탐내는 재료.', 3, 160),
    ('m_frost_fang', '서리 송곳니', '서리 늑대의 얼음처럼 차가운 송곳니.', 2, 34),
    ('m_ice_tail', '얼음꽃 꼬리털', '눈꽃이 맺힌 얼음꽃 여우의 꼬리털.', 2, 40),
    ('m_frost_horn', '서리뿔 조각', '서리뿔 산양의 뿔에서 떨어진 얼음 결정 조각.', 2, 46),
    ('m_snow_pelt', '설원 곰 가죽', '눈보라도 막아 주는 두툼한 설원 곰 가죽.', 3, 55),
    ('m_glacier_horn', '빙하뿔', '산양왕의 빙하처럼 푸른 뿔. 녹지 않는다.', 3, 260),
    ('m_drake_scale', '비룡 비늘', '불씨 비룡의 붉은 비늘. 아직 따뜻하다.', 3, 60),
    ('m_cinder_gland', '잿불 주머니', '잿불 도마뱀이 불씨를 머금어 두는 주머니.', 3, 66),
    ('m_lava_tusk', '용암 엄니', '용암에 그을린 검붉은 엄니.', 3, 72),
    ('m_rune_shard', '룬 석판 조각', '유적 수호석에 새겨진 고대 룬의 파편. 희미한 빛이 남아 있다.', 3, 80),
    ('m_dragon_blood', '용혈 결정', '용혈 비룡의 피가 굳어 생긴 붉은 결정.', 3, 380),
    ('m_dragon_heart', '고룡의 심장', '잊힌 고룡 벨카르의 심장. 아직도 고동치는 듯하다. 전설의 재료.', 3, 1500),
]

BOSS = {
    'id': 'boss_ancient_dragon', 'name': '잊힌 고룡 벨카르', 'level': 50, 'sheet': 'boss_mushroom', 'ai': 'boss',
    'moveSpeed': 1.5, 'detectRange': 12, 'leashRange': 30, 'attackRange': 3.6, 'attackCooldown': 1.5, 'windup': 0.9, 'radius': 1.6,
    'attackRadius': 3.8, 'projectileFx': 'fire', 'projectileSpeed': 7, 'respawn': 300, 'hitSfx': 'heavy',
    'drops': [{'item': 'm_dragon_heart', 'chance': 1.0, 'min': 1, 'max': 1}, {'item': 'm_dragon_blood', 'chance': 1.0, 'min': 2, 'max': 3},
              {'item': '@jobweapon:3', 'chance': 1.0, 'min': 1, 'max': 1}, {'item': 'a_armor_3', 'chance': 0.6, 'min': 1, 'max': 1},
              {'item': 'ac_ring_3', 'chance': 0.6, 'min': 1, 'max': 1}, {'item': 'c_potion_m', 'chance': 1.0, 'min': 3, 'max': 5}],
}


def boss_stats():
    patk, php, pdef = player(50)
    bdef = 90
    per_hit = patk * 100 / (100 + bdef) * 1.05
    # slam coef 1.4 -> ~16 % of max HP; HP ~ 190 basic hits (~3 min with dodging, less with skills)
    return dict(hp=int(round(per_hit * 190, -3)), atk=round(0.16 * php * (100 + pdef) / 100 / 1.4), def_=bdef, exp=round(exp_to_next(49) * 0.5), goldMin=2500, goldMax=4000)


def build():
    mons, items = [], []
    for (mid, name, L, role, ai, sheet, t, mat, extra) in MON:
        s = stats(L, role)
        m = {'id': mid, 'name': name, 'level': L, 'sheet': sheet, 'ai': ai, 'hp': s['hp'], 'atk': s['atk'], 'exp': s['exp'],
             'goldMin': s['goldMin'], 'goldMax': s['goldMax'], 'moveSpeed': t['moveSpeed'], 'detectRange': t['detectRange'],
             'leashRange': t.get('leashRange', 14), 'attackRange': t['attackRange'], 'attackCooldown': t['attackCooldown'], 'windup': t['windup'],
             'radius': t['radius'], 'attackRadius': t.get('attackRadius', 0), 'projectileFx': t.get('projectileFx', ''), 'projectileSpeed': t.get('projectileSpeed', 0),
             'respawn': t.get('respawn', {'fast': 10, 'melee': 12, 'ranged': 12, 'tank': 14, 'heavy': 18}.get(role, 12)),
             'drops': drops(mat, 0.9 if role == 'elite' else 0.6, extra), 'hitSfx': 'heavy' if ai == 'heavy' else 'hit', 'def': s['def_']}
        mons.append(m)
    b = dict(BOSS); s = boss_stats()
    b.update(hp=s['hp'], atk=s['atk'], exp=s['exp'], goldMin=s['goldMin'], goldMax=s['goldMax'], **{'def': s['def_']})
    order = ['id', 'name', 'level', 'sheet', 'ai', 'hp', 'atk', 'exp', 'goldMin', 'goldMax', 'moveSpeed', 'detectRange', 'leashRange', 'attackRange',
             'attackCooldown', 'windup', 'radius', 'attackRadius', 'projectileFx', 'projectileSpeed', 'respawn', 'drops', 'hitSfx', 'def']
    mons.append({k: b[k] for k in order})
    for (iid, name, desc, tier, sell) in ITEMS:
        items.append({'id': iid, 'name': name, 'desc': desc, 'type': 'material', 'job': '', 'tier': tier, 'levelReq': 1, 'price': 0, 'sellPrice': sell,
                      'maxStack': 99, 'icon': iid, 'stats': [], 'use': None})
    return mons, items


def main(write):
    mons, items = build()
    I = json.load(open(IPATH, encoding='utf-8'))
    tmpl = next(i for i in I['items'] if i['id'] == 'm_jelly')
    for it in items: it['use'] = json.loads(json.dumps(tmpl['use']))
    for it in items: assert set(it.keys()) == set(tmpl.keys()), it['id']
    ids = {m['id'] for m in mons}; iids = {i['id'] for i in items}
    print(f"{'id':22} {'name':14} Lv  {'hp':>6} {'atk':>5} {'def':>4} {'exp':>6}  playerAtk playerHp  hits  hit%")
    for m in mons:
        pa, ph, pd = player(m['level'])
        coef = 1.6 if m['ai'] == 'heavy' else (1.4 if m['ai'] == 'boss' else 1.0)
        hits = m['hp'] / (pa * 100 / (100 + m['def']) * 1.05)
        hitp = m['atk'] * coef * 100 / (100 + pd) / ph * 100
        print(f"{m['id']:22} {m['name']:14} {m['level']:2} {m['hp']:6} {m['atk']:5} {m['def']:4} {m['exp']:6}  {pa:8.0f} {ph:8.0f} {hits:5.1f} {hitp:5.1f}  exp/lvl 1/{exp_to_next(m['level']) / max(1, m['exp']):.0f}")
    if not write: return
    M = json.load(open(MPATH, encoding='utf-8'))
    M['monsters'] = [m for m in M['monsters'] if m['id'] not in ids] + mons
    I = json.load(open(IPATH, encoding='utf-8'))
    I['items'] = [i for i in I['items'] if i['id'] not in iids] + items
    json.dump(M, open(MPATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(I, open(IPATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('written', len(mons), 'monsters', len(items), 'items')


if __name__ == '__main__':
    main('--write' in sys.argv)
