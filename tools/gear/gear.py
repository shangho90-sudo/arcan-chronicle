"""장비 40종(2026-11-11): 유봉 10 · 갑옷 10 · 장신구 20(일반 12 + 직업 전용 8), 무기·방어구 상인, 상점 재고, 몬스터 드롭.
`"gear": true` 항목만 다시 씀(다른 아이템·NPC·상점은 그대로):
  assets/data/items.json   아이템 40개 (dropFrom = 드롭 몬스터·확률, jobBuff = 직업이 맞을 때만 붙는 효과)
  assets/data/npcs.json    아르칸 마을 방어구 상인 + 상점 shop_weapons / shop_armor / shop_forge (+ 단오 = 무기 상인, 철산은 제작 재료만)
  assets/data/zones.json   아르칸 마을(town) npcs 에 방어구 상인 자리
다른 8개 마을의 상인은 tools/world/world.py `GEAR_MERCHANTS` → `python3 tools/world/world.py --write`.
드롭은 monsters.json에 쓰지 않고 아이템의 dropFrom으로 둠(world.py·story.py가 monsters.json을 다시 써도 남도록) — 게임이 읽을 때
몬스터 drops에 합침(js/core.js GameData). 모델·아이콘: tools/tripo/gear_assets.py → tools/blender/gear.py.

수치 공식 (L = 착용 레벨, 기존 3단계 장비 곡선에 맞춤 — L8 유봉 26, 갑옷 방어 18 · 체력 100):
  유봉  공격력 = round(10 + 2.2 L), 마법력 = round(공격력 × 0.45)       드롭 전용은 × 1.08 + 부가 효과
  갑옷  방어력 = round(4 + 1.8 L), 최대 체력 = round(20 + 10 L)          드롭 전용은 × 1.08 + 부가 효과
  값    무기 round(60 L^1.25, 10단위), 갑옷 × 0.9, 장신구 × 1.1, 되팔기 30 %
Usage: python3 tools/gear/gear.py [--write | --briefs]   (--briefs = 디자인 브리프 tools/gear/design_briefs.json만)"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
D = lambda *a: os.path.join(ROOT, 'assets', 'data', *a)
USE = {"heal": 0, "healPercent": 0, "sp": 0, "cure": "", "status": "", "duration": 0, "value": 0, "cooldown": 1}
def st(stat, add=0, mul=0.0): return {"stat": stat, "add": add, "mul": mul}
def price(L, k=1.0): return int(round(60 * L ** 1.25 * k / 10) * 10)
W_ATK = lambda L, drop: round((10 + 2.2 * L) * (1.08 if drop else 1))
A_DEF = lambda L, drop: round((4 + 1.8 * L) * (1.08 if drop else 1))
A_HP = lambda L, drop: round((20 + 10 * L) * (1.08 if drop else 1))

# (id, 이름, 레벨, 설명, 부가 효과, 드롭[(몬스터, 확률)] — 드롭이 없으면 상점 판매)
PESTLES = [
    ('w_pestle_g1', '참나무 유봉', 10, '단단한 참나무를 깎아 만든 유봉. 갓 전직한 약사의 첫 무기.', [], None),
    ('w_pestle_g2', '청동 유봉', 13, '청동 머리를 씌워 묵직해진 유봉.', [], None),
    ('w_pestle_g3', '강철 유봉', 16, '강철 띠를 두른 유봉. 약재도 돌도 가리지 않는다.', [], None),
    ('w_pestle_g4', '백은 유봉', 19, '덩굴무늬를 새긴 백은 유봉. 회복 효율 +5%.', [st('healPower', 0.05)], None),
    ('w_pestle_g5', '수정 유봉', 22, '푸른 수정 머리가 약효를 맑게 한다. 회복 효율 +8%.', [st('healPower', 0.08)], None),
    ('w_pestle_g6', '안개꽃 유봉', 26, '안개 속에서만 피는 꽃을 새긴 옥 유봉. 회복 효율 +10%.', [st('healPower', 0.10)],
     [('mon_berg_bear', 0.03), ('mon_ash_toad', 0.02), ('mon_soldier', 0.02)]),
    ('w_pestle_g7', '서리 수정 유봉', 30, '녹지 않는 얼음 결정으로 만든 유봉. 속성 저항 +6%.', [st('elemRes', 0.06)],
     [('mon_frost_ram', 0.025), ('mon_crab', 0.02), ('mon_ice_fox', 0.015)]),
    ('w_pestle_g8', '용암 유봉', 35, '식지 않는 용암석 유봉. 치명타 +4%.', [st('crit', 0.04)],
     [('mon_salamander', 0.03), ('mon_mine_golem', 0.03), ('mon_crimson_fox', 0.02)]),
    ('w_pestle_g9', '용골 유봉', 41, '고룡의 뼈를 깎은 유봉. 재사용 대기시간 -5%.', [st('cdr', 0.05)],
     [('mon_cinder_lizard', 0.03), ('mon_tomb_golem', 0.025), ('mon_ember_drake', 0.02)]),
    ('w_pestle_g10', '흑룡의 황금 유봉', 47, '흑룡이 감긴 전설의 황금 유봉. 치명타 +6%, 회복 효율 +15%.', [st('crit', 0.06), st('healPower', 0.15)],
     [('boss_ancient_dragon', 0.25), ('mon_drake_lord', 0.02), ('mon_abyss_drake', 0.02)]),
]
ARMORS = [
    ('a_armor_g1', '누비 갑옷', 10, '솜을 두껍게 누빈 갑옷.', [], None),
    ('a_armor_g2', '사슬 조끼', 13, '가죽 위에 사슬을 엮은 조끼.', [], None),
    ('a_armor_g3', '강철 흉갑', 16, '가슴을 덮는 강철 흉갑.', [], None),
    ('a_armor_g4', '기사 판금 갑옷', 19, '푸른 천을 두른 기사의 판금 갑옷.', [], None),
    ('a_armor_g5', '은빛 미늘 갑옷', 22, '은빛 미늘이 촘촘한 갑옷. 속성 저항 +4%.', [st('elemRes', 0.04)], None),
    ('a_armor_g6', '잿빛 늑대 가죽 갑옷', 26, '늑대 털가죽으로 만든 가벼운 갑옷. 회피 +3%.', [st('eva', 0.03)],
     [('mon_berg_bear', 0.025), ('mon_soldier', 0.02), ('mon_ash_toad', 0.02)]),
    ('a_armor_g7', '서리 강철 갑옷', 30, '얼음 결정이 맺힌 강철 갑옷. 속성 저항 +8%.', [st('elemRes', 0.08)],
     [('mon_frost_ram', 0.02), ('mon_blackeye_wolf', 0.02), ('mon_soldier', 0.02)]),
    ('a_armor_g8', '용비늘 갑옷', 35, '붉은 용비늘을 엮은 갑옷. 받는 피해 -4%.', [st('dmgReduce', 0.04)],
     [('mon_ram_king', 0.04), ('mon_snow_bear', 0.025), ('mon_crimson_boar', 0.02)]),
    ('a_armor_g9', '심연 수호 갑옷', 41, '보랏빛 룬이 흐르는 수호자의 갑옷. 받는 피해 -6%.', [st('dmgReduce', 0.06)],
     [('mon_armor', 0.03), ('mon_tomb_golem', 0.025), ('mon_yeti', 0.02)]),
    ('a_armor_g10', '흑룡 판금 갑옷', 47, '흑룡의 비늘로 벼린 전설의 갑옷. 받는 피해 -8%, 속성 저항 +10%.', [st('dmgReduce', 0.08), st('elemRes', 0.10)],
     [('boss_ancient_dragon', 0.25), ('mon_lake_bear', 0.03), ('mon_ruin_golem', 0.025)]),
]
# 장신구: (id, 이름, 레벨, 설명, 효과, 드롭)
ACCS = [
    ('ac_g1', '은 반지', 10, '잘 닦인 은 반지.', [st('atk', 5), st('matk', 5)], None),
    ('ac_g2', '가죽 팔찌', 13, '청동 징을 박은 가죽 팔찌.', [st('maxHp', 90), st('def', 4)], None),
    ('ac_g3', '푸른 물방울 귀걸이', 16, '기력이 맑아지는 물방울 귀걸이.', [st('maxSp', 40), st('spRegen', 1.0)], None),
    ('ac_g4', '매 깃 목걸이', 19, '매의 깃과 발톱을 엮은 목걸이. 치명타 +4%, 명중 +4%.', [st('crit', 0.04), st('hit', 0.04)], None),
    ('ac_g5', '바람 발찌', 22, '작은 날개가 달린 발찌. 이동 속도 +5%, 회피 +3%.', [st('moveSpeed', 0, 0.05), st('eva', 0.03)], None),
    ('ac_g6', '안개 진주 목걸이', 24, '안개빛 진주 목걸이. 속성 저항 +8%.', [st('elemRes', 0.08), st('maxHp', 160)],
     [('mon_mist_bear', 0.04), ('mon_canyon_ram', 0.025), ('mon_frost_wolf', 0.025)]),
    ('ac_g7', '눈꽃 귀걸이', 28, '녹지 않는 눈꽃 결정. 재사용 대기시간 -5%.', [st('maxSp', 70), st('cdr', 0.05)],
     [('mon_ice_fox', 0.02), ('mon_frost_ram', 0.02), ('mon_soldier', 0.015)]),
    ('ac_g8', '붉은 가시 반지', 32, '붉은숲 가시로 감은 반지. 치명타 +6%.', [st('atk', 16), st('crit', 0.06)],
     [('mon_crimson_boar', 0.025), ('mon_blackeye_wolf', 0.02)]),
    ('ac_g9', '화염 심장 목걸이', 36, '불꽃이 뛰는 보석 목걸이. 치명 피해 +12%.', [st('atk', 14), st('matk', 14), st('critDmg', 0.12)],
     [('mon_crystal', 0.03), ('mon_lava_boar', 0.025), ('mon_salamander', 0.02)]),
    ('ac_g10', '수호자의 인장', 40, '방패 문장이 새겨진 인장 반지. 받는 피해 -5%.', [st('def', 22), st('dmgReduce', 0.05)],
     [('mon_tomb_golem', 0.03), ('mon_crimson_bear', 0.03)]),
    ('ac_g11', '심연의 눈', 44, '심연을 들여다보는 보랏빛 눈. 치명타 +7%, 치명 피해 +15%.', [st('matk', 24), st('crit', 0.07), st('critDmg', 0.15)],
     [('mon_void_toad', 0.03), ('mon_ash_drake', 0.03)]),
    ('ac_g12', '용의 눈물', 48, '용의 발톱이 쥔 청록빛 눈물 보석. 모든 힘이 오른다.', [st('atk', 26), st('matk', 26), st('maxHp', 300), st('crit', 0.05), st('elemRes', 0.08)],
     [('boss_ancient_dragon', 0.30), ('mon_drake_lord', 0.02), ('mon_bat', 0.015)]),
]
# 직업 전용 장신구: (id, 이름, 레벨, 설명, 누구나 받는 효과, 직업들, 직업 효과, 효과 문구, 드롭). 직업들에는 그 계열의 2차 직업도 넣음.
JOB_ACCS = [
    ('ac_j_pharm', '약사의 은 저울', 18, '약재를 한 치 오차 없이 다는 작은 은 저울.', [st('maxSp', 30)], ['pharmacist', 'western_pharmacist', 'herbalist'],
     [st('healPower', 0.15), st('matk', 0, 0.08)], '회복 효율 +15%, 마법력 +8%', [('mon_spider_elite', 0.06), ('mon_wisp', 0.025), ('mon_mist_wolf', 0.02)]),
    ('ac_j_cook', '요리사의 황금 국자', 18, '국물 맛을 지켜 주는 황금 국자 장식.', [st('maxHp', 80)], ['cook', 'chef'],
     [st('foodPower', 0.20), st('maxHp', 0, 0.08)], '음식 효과 +20%, 최대 체력 +8%', [('mon_dust_boar', 0.025), ('mon_bog_boar', 0.02)]),
    ('ac_j_smith', '대장장이의 불꽃 모루', 18, '꺼지지 않는 불씨가 얹힌 작은 모루 부적.', [st('def', 6)], ['blacksmith', 'engineer'],
     [st('def', 0, 0.12), st('dmgReduce', 0.05), st('craftRate', 0.05)], '방어력 +12%, 받는 피해 -5%, 제작 성공 +5%', [('mon_scorpion', 0.025), ('mon_canyon_ram', 0.02)]),
    ('ac_j_hair', '미용사의 은빛 빗', 18, '한 올도 놓치지 않는 은빛 빗.', [st('crit', 0.02)], ['hairdresser', 'designer'],
     [st('crit', 0.08), st('atkSpeed', 0, 0.08)], '치명타 +8%, 공격 속도 +8%', [('mon_lantern_ghost', 0.02), ('mon_shadow_wolf', 0.02)]),
    ('ac_j_art', '예술가의 무지개 팔레트', 18, '마르지 않는 물감이 담긴 팔레트 브로치.', [st('matk', 6)], ['artist', 'painter', 'musician'],
     [st('matk', 0, 0.12), st('cdr', 0.06)], '마법력 +12%, 재사용 대기시간 -6%', [('mon_spirit_deer', 0.03), ('mon_panda', 0.025)]),
    ('ac_j_herb', '현자의 약탕기', 34, '김이 오르는 작은 옥 약탕기 펜던트. 양약사·한약사 전용 효과.', [st('maxSp', 60), st('elemRes', 0.04)], ['western_pharmacist', 'herbalist'],
     [st('healPower', 0.25), st('matk', 0, 0.10), st('elemRes', 0.10)], '회복 효율 +25%, 마법력 +10%, 속성 저항 +10%', [('mon_mine_golem', 0.03), ('mon_crimson_fox', 0.025)]),
    ('ac_j_craft', '장인의 황금 톱니', 34, '망치와 바늘이 엇갈린 황금 톱니 브로치. 쉐프·엔지니어·디자이너 전용 효과.', [st('atk', 12), st('def', 10)], ['chef', 'engineer', 'designer'],
     [st('atk', 0, 0.10), st('atkSpeed', 0, 0.08), st('craftRate', 0.08)], '공격력 +10%, 공격 속도 +8%, 제작 성공 +8%', [('mon_salamander', 0.025), ('mon_snow_bear', 0.02)]),
    ('ac_j_muse', '거장의 별빛 음표', 34, '별과 음표가 반짝이는 귀걸이. 화가·음악가 전용 효과.', [st('matk', 14), st('maxSp', 50)], ['painter', 'musician'],
     [st('matk', 0, 0.14), st('cdr', 0.08), st('maxSp', 0, 0.10)], '마법력 +14%, 재사용 대기시간 -8%, 최대 기력 +10%', [('mon_crystal', 0.03), ('mon_crimson_boar', 0.02), ('mon_kreutz_wolf', 0.02)]),
]

def item(id, name, typ, L, desc, stats, tier, k, job='', drops=None, jobbuff=None):
    d = {"id": id, "name": name, "desc": desc, "type": typ, "job": job, "tier": tier, "levelReq": L, "price": 0 if drops else price(L, k),
         "sellPrice": int(round(price(L, k) * 0.3)), "maxStack": 1, "icon": id, "stats": stats, "use": dict(USE), "gear": True}
    if drops: d["dropFrom"] = [{"monster": m, "chance": c} for m, c in drops]
    if jobbuff: d["jobBuff"] = jobbuff
    return d

def legacy(d):
    """예전 장비: 수치는 원래 계산 그대로(드롭이던 것은 ×1.08), 이제 팔지도 떨어뜨리지도 않음"""
    d.pop("dropFrom", None); d["price"] = 0; d["legacy"] = True; d["art"] = True
    if d["type"] == "weapon": d["model3d"] = True; d["kind"] = "pestle"
    return d

def items():
    out = []
    for i, (id, name, L, desc, extra, drops) in enumerate(PESTLES):
        a = W_ATK(L, drops); out.append(legacy(item(id, name, 'weapon', L, desc, [st('atk', a), st('matk', round(a * 0.45))] + extra, i + 1, 1.0, 'pharmacist', drops)))
    for i, (id, name, L, desc, extra, drops) in enumerate(ARMORS):
        out.append(legacy(item(id, name, 'armor', L, desc, [st('def', A_DEF(L, drops)), st('maxHp', A_HP(L, drops))] + extra, i + 1, 0.9, '', drops)))
    for i, (id, name, L, desc, stats, drops) in enumerate(ACCS):
        out.append(dict(item(id, name, 'accessory', L, desc, stats, i + 1, 1.1, '', drops), art=True))
    for i, (id, name, L, desc, stats, jobs, jstats, jtext, drops) in enumerate(JOB_ACCS):
        out.append(dict(item(id, name, 'accessory', L, desc, stats, i + 1, 1.1, '', drops, {"jobs": jobs, "stats": jstats, "text": jtext}), art=True))
    return out + line_items()

# ---------------------------------------------------------------- 직업 계보별 무기·방어구 계열 (2026-11-17)
# 이름·설명·디자인 브리프는 tools/gear/designs.py. id = wg_<계열>_<단계> (무기) / ag_<계열>_<단계> (방어구).
# 단계 레벨: 견습생 Lv1~8(4단계: 3 판매 + 1 드롭), 1차 Lv10~31(7단계: 5 판매 + 2 드롭), 2차 Lv30~50(7단계: 5 + 2).
# 수치는 기존 공식 그대로(직업 간 균형 = 같은 레벨 같은 힘 P = 10 + 2.2 L), Lv8 밑은 저레벨 보정 lowK(L) = min(1, 0.5 + L/16)
#   (예전 1~3단계 장비 곡선 Lv1 6 · Lv5 14 · Lv8 26에 맞춤 — Lv8 이상은 기존 공식과 똑같음).
#   무기 종류별 주 능력치: 검 공격 P / 유봉 공격 P + 마법 0.45P(기존 유봉) / 망치 공격 P + 방어 0.15P / 식칼 공격 P + 치명 2~6%
#   / 가위 공격 P + 치명 3~8% / 붓 마법 P + 공격 0.45P(유봉의 거울). 3단계부터 계열 고유 효과(SIG)가 단계마다 한 칸씩, 드롭 2단계는 효과 하나 더(DROP2).
#   방어구는 계열과 상관없이 같은 공식(방어 4 + 1.8L, 체력 20 + 10L) + 같은 자리의 같은 부가 효과(ARMOR_EXTRA) — 이름·디자인만 직업 맞춤.
from designs import LINES, STAGE_KO, weapon_prompt, armor_prompt, KIND
LV_NOVICE = [1, 3, 5, 8]
LV_TIER1 = [10, 13, 16, 19, 22, 26, 31]
LV_TIER2 = [30, 33, 36, 39, 42, 46, 50]
SOLD = {4: 3, 7: 5}                    # 단계 수 -> 판매 단계 수 (나머지는 드롭 전용)
lowK = lambda L: min(1.0, 0.5 + L / 16)
POWER = lambda L, drop: (10 + 2.2 * L) * lowK(L) * (1.08 if drop else 1)
# 계열 고유 효과: (능력치, 단계당 값, 곱하기?) — 3단계부터 (s-1)배, s = 0부터 센 단계
SIG = {'nov': ('hit', 0.01, False), 'pharm': ('healPower', 0.03, False), 'smith': ('dmgReduce', 0.01, False), 'cook': ('foodPower', 0.04, False),
       'hair': ('atkSpeed', 0.02, True), 'art': ('cdr', 0.01, False), 'wpharm': ('critDmg', 0.03, False), 'herb': ('healPower', 0.03, False),
       'eng': ('crit', 0.01, False), 'chef': ('foodPower', 0.04, False), 'design': ('eva', 0.01, False), 'paint': ('cdr', 0.01, False),
       'music': ('spRegen', 0.15, False), 'artm': ('cdr', 0.01, False)}
DROP2 = {'nov': st('crit', 0.02), 'pharm': st('elemRes', 0.05), 'smith': st('crit', 0.03), 'cook': st('crit', 0.03), 'hair': st('eva', 0.03),
         'art': st('maxSp', 40), 'wpharm': st('crit', 0.04), 'herb': st('elemRes', 0.06), 'eng': st('cdr', 0.04), 'chef': st('critDmg', 0.10),
         'design': st('crit', 0.04), 'paint': st('critDmg', 0.10), 'music': st('cdr', 0.04),
         'artm': st('maxSp', 40)}     # artm = 예술가 악기 계열: 붓 계열(art)과 같은 효과(균형)
def r3(x): return round(x, 3)
def rnd(x): return int(x + 0.5)          # JS Math.round과 같게(파이썬 round는 .5를 짝수로)
def weapon_stats(L, kind, s, n, drop, key):
    P = POWER(L, drop); f = L / 50
    main = {'sword': [st('atk', rnd(P))],
            'pestle': [st('atk', rnd(P)), st('matk', rnd(rnd(P) * 0.45))],
            'hammer': [st('atk', rnd(P)), st('def', rnd(P * 0.15))],
            'knife': [st('atk', rnd(P)), st('crit', r3(0.02 + 0.04 * f))],
            'scissors': [st('atk', rnd(P)), st('crit', r3(0.03 + 0.05 * f))],
            'brush': [st('matk', rnd(P)), st('atk', rnd(rnd(P) * 0.45))],
            'instrument': [st('matk', rnd(P)), st('atk', rnd(rnd(P) * 0.45))]}[kind]      # 악기 = 붓과 같은 공식(2026-11-17)
    if s >= 2:
        stat, step, mul = SIG[key]; v = r3(step * (s - 1)); main.append(st(stat, 0, v) if mul else st(stat, v))
    if drop: main.append(dict(DROP2[key]))
    return main
# 방어구 부가 효과: 자리(판매 마지막 단계 / 드롭 1 / 드롭 2) — 모든 계열 같음(직업 간 균형)
def armor_stats(L, s, n, drop):
    out = [st('def', rnd((4 + 1.8 * L) * lowK(L) * (1.08 if drop else 1))), st('maxHp', rnd((20 + 10 * L) * lowK(L) * (1.08 if drop else 1)))]
    sold = SOLD[n]
    if s == sold - 1 and n == 7: out.append(st('elemRes', 0.04))
    if drop and s == n - 1 and n == 7: out += [st('dmgReduce', 0.06), st('elemRes', 0.08)]
    elif drop and n == 7: out.append(st('dmgReduce', 0.04))
    elif drop: out.append(st('eva', 0.02))
    return out
def levels_of(L): return LV_NOVICE if L['job'] == 'novice' else LV_TIER1 if L['job'] in TIER1 else LV_TIER2
TIER1 = {'pharmacist', 'blacksmith', 'cook', 'hairdresser', 'artist'}
STAND = {'sword': 'stick', 'pestle': 'pestle', 'hammer': 'hammer', 'knife': 'knife', 'scissors': 'scissors', 'brush': 'brush', 'instrument': 'brush'}

# 드롭 몬스터: 그 단계 레벨 근처([L-4, L+3])에 실제로 나오는 몬스터 중 가까운 순, 계열마다 돌려 가며 최대 3마리(이야기 보스 qb_* 제외)
def spawn_levels():
    import collections
    M = {m['id']: m for m in json.load(open(D('monsters.json')))['monsters']}; lv = collections.defaultdict(set)
    def scan(z):
        for s in z.get('monsters', []): lv[s['monster']].add(s.get('level') or M[s['monster']]['level'])
        b = z.get('boss')
        if b and b.get('boss'): lv[b['boss']].add(M[b['boss']]['level'])
    for z in json.load(open(D('zones.json')))['zones']:
        if not z.get('file'): scan(z)
    for f in sorted(os.listdir(D('world'))): scan(json.load(open(D('world', f))))
    return {k: v for k, v in lv.items() if not k.startswith('qb_') and k in M}, M
def pick_drops(L, salt, LV, M, legend):
    c = []
    for m, ls in LV.items():
        d = min((0 if L - 4 <= l <= L + 3 else 99) + abs(l - L) for l in ls)
        if d < 99: c.append((d, m))
    c.sort(); assert c, 'no drop monster near Lv%d' % L
    pool = [m for _, m in c[:8]]; k = salt % len(pool); pick = (pool[k:] + pool[:k])[:3]
    return [(m, 0.15 if M[m].get('ai') == 'boss' else (0.015 if legend else 0.025)) for m in pick]

def line_items():
    LV, M = spawn_levels(); out = []
    for li, L in enumerate(LINES):
        lv = levels_of(L); n = len(lv); sold = SOLD[n]
        assert len(L['weapons']) == len(L['evo']) == len(L['evo_ko']) == n and (L['armors'] is None or len(L['armors']) == n), L['key']
        for s, Lv in enumerate(lv):
            drop = s >= sold
            for typ, names, pre in (('weapon', L['weapons'], 'wg'), ('armor', L['armors'], 'ag')):
                if names is None: continue           # 무기만 있는 계열(예술가 악기 artm)
                id = '%s_%s_%d' % (pre, L['key'], s + 1); name, desc = names[s]
                drops = pick_drops(Lv, li * 3 + s + (1 if typ == 'armor' else 0), LV, M, s == n - 1) if drop else None
                stats = weapon_stats(Lv, L['kind'], s, n, drop, L['key']) if typ == 'weapon' else armor_stats(Lv, s, n, drop)
                job = (L['job'] if L['job'] != 'novice' else '') if typ == 'weapon' else ''       # 착용 제한은 예전 규칙 그대로: 무기만 직업(+그 2차), 방어구는 누구나
                it = item(id, name, typ, Lv, desc, stats, s + 1, 1.0 if typ == 'weapon' else 0.9, job, drops)
                it['line'] = L['job']; it['kind'] = L['kind'] if typ == 'weapon' else 'armor'
                # 임시 모델·아이콘(다음 단계가 assets/items/<id>.glb.json · assets/ui/items/<id>.png를 만들면 --write가 자동으로 켬)
                it['stand'] = [STAND[L['kind']] if typ == 'weapon' else 'armor', 1 + s * 3 // n]
                if os.path.exists(os.path.join(ROOT, 'assets', 'ui', 'items', id + '.png')): it['art'] = True
                if os.path.exists(os.path.join(ROOT, 'assets', 'items', id + '.glb.json')): it['model3d'] = True
                out.append(it)
    return out

def briefs():
    """아이템마다 디자인 브리프 (다음 단계: Tripo 3D·아이콘)"""
    out = {}
    for L in LINES:
        lv = levels_of(L); n = len(lv); sold = SOLD[n]
        fam = dict(family=L['family'], job=L['job'], kind=L['kind'], kind_ko=KIND[L['kind']]['ko'], motif=L['motif_ko'], silhouette=L['silhouette_ko'],
                   palette=[{'name': a, 'hex': b} for a, b in L['palette']], ornaments=L['ornaments_ko'], garment=L.get('garment_ko', ''),
                   evolution=[{'stage': i + 1, 'ko': L['evo_ko'][i], 'en': L['evo'][i]} for i in range(n)])
        if 'wevo' in L: fam['weapon_evolution'] = [{'stage': i + 1, 'ko': L['wevo_ko'][i], 'en': L['wevo'][i]} for i in range(n)]
        if L['armors'] is None: fam['weapon_only'] = True; fam.pop('garment')
        items = []
        for s, Lv in enumerate(lv):
            stage = STAGE_KO[s] if n == 7 else STAGE_KO[[0, 1, 2, 4][s]]
            for typ, names, pre, prompt in (('weapon', L['weapons'], 'wg', weapon_prompt), ('armor', L['armors'], 'ag', armor_prompt)):
                if names is None: continue
                ev = L.get('wevo_ko', L['evo_ko']) if typ == 'weapon' else L['evo_ko']
                items.append(dict(id='%s_%s_%d' % (pre, L['key'], s + 1), type=typ, name=names[s][0], level=Lv, stage=s + 1, stageName=stage,
                                  drop=s >= sold, ornament_ko=ev[s], tripo_prompt=prompt(L, s)))
        out[L['key']] = dict(fam, items=items)
    return out

# 예전 장비(2026-11-11 유봉 10 · 갑옷 10): 저장 호환을 위해 아이템은 그대로 남김(같은 id·수치·아이콘·모델) — 팔지도 떨어뜨리지도 않음(legacy)
def shop_ids(lst): return [x[0] for x in lst if x[5] is None]
def build_shops(its):
    lw = [i['id'] for i in its if i.get('line') and i['type'] == 'weapon' and i['price']]
    la = [i['id'] for i in its if i.get('line') and i['type'] == 'armor' and i['price']]
    return [
        # 목록에는 모든 계열이 들어 있고, 상점 창은 플레이어 직업 계보로 거름(core.js shopStockFor)
        {"id": "shop_weapons", "name": "무기 상점", "items": lw, "gear": True},
        {"id": "shop_armor", "name": "방어구·장신구 상점", "items": la + shop_ids(ACCS), "gear": True},
        {"id": "shop_forge", "name": "철산의 대장간 (제작 재료)", "items": [], "gear": True},      # 철산은 무기·갑옷을 팔지 않음 — 제작 재료만(skills2 shopAdd가 채움)
    ]
# 아르칸 마을: 단오(기존 무기상)가 무기 상인, 그 옆에 새 방어구 상인. 다른 마을은 world.py GEAR_MERCHANTS.
TOWN_NPC = {"id": "town_armor", "name": "보라", "title": "방어구·장신구 상인", "sheet": "npc_merchant", "model": "gear_armor", "role": "merchant", "shop": "shop_armor", "job": "",
            "lines": ["갑옷은 몸에 맞아야 제값을 하죠.", "귀한 장비는 몬스터가 품고 있답니다. 저는 기본만 팔아요."], "gear": True}
TOWN_SPOT = {"npc": "town_armor", "pos": [14.4, -6.9], "rot": -90.0, "gear": True}

def main():
    its = items(); ids = [i['id'] for i in its]; assert len(ids) == len(set(ids)), 'duplicate id'; SHOPS = build_shops(its)
    I = json.load(open(D('items.json'))); N = json.load(open(D('npcs.json'))); Z = json.load(open(D('zones.json'))); M = json.load(open(D('monsters.json')))
    known = {m['id'] for m in M['monsters']}
    for it in its:
        for d in it.get('dropFrom', []): assert d['monster'] in known, d
    I['items'] = [i for i in I['items'] if not i.get('gear')] + its
    N['npcs'] = [n for n in N['npcs'] if not n.get('gear')]
    at = next(k for k, n in enumerate(N['npcs']) if n['id'] == 'armorer'); N['npcs'].insert(at + 1, TOWN_NPC)
    for n in N['npcs']:
        if n['id'] == 'armorer': n['title'] = '무기 상인'; n['shop'] = 'shop_weapons'; n['lines'] = ["직업마다 손에 맞는 무기가 따로 있지. 자네 직업에 맞는 것만 꺼내 보여 주겠네.", "좋은 무기는 사냥터의 몬스터가 떨어뜨린다네. 여기선 기본만 팔아."]
        if n['id'] == 'master_blacksmith': n['shop'] = 'shop_forge'          # 무기·갑옷 판매는 무기·방어구 상인이 맡음(2026-11-11), 철산은 제작 재료만
    N['shops'] = [s for s in N['shops'] if not s.get('gear') and s['id'] != 'shop_arms'] + SHOPS
    town = next(z for z in Z['zones'] if z['id'] == 'town')
    # 2026-11-12: 마을 배치는 tools/world/towns.py가 정함(보라는 의상실 앞). 배치에 없을 때만 예전 자리를 씀
    if not any(n.get('npc') == 'town_armor' for n in town['npcs']): town['npcs'] = [n for n in town['npcs'] if not n.get('gear')] + [TOWN_SPOT]
    for h in town.get('town3d', {}).get('houses', []):
        if h.get('id') == 'arms': h['name'] = '단오의 무기 상점'
    n_shop = sum(1 for i in its if i['price']); print('items', len(its), 'shop', n_shop, 'drop', len(its) - n_shop)
    for i in its: print(' %-13s Lv%-2d %-14s %5s G  %s%s' % (i['id'], i['levelReq'], i['name'], i['price'] or '-', ' '.join('%s%+g%s' % (s['stat'], s['add'] or s['mul'], '%' if s['mul'] else '') for s in i['stats']),
                                                    '  <- ' + ', '.join('%s %g%%' % (d['monster'], d['chance'] * 100) for d in i.get('dropFrom', []))))
    if '--write' in sys.argv or '--briefs' in sys.argv:
        json.dump(briefs(), open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'design_briefs.json'), 'w'), ensure_ascii=False, indent=1)
        print('wrote tools/gear/design_briefs.json')
    if '--write' in sys.argv:
        json.dump(I, open(D('items.json'), 'w'), ensure_ascii=False, indent=1)
        json.dump(N, open(D('npcs.json'), 'w'), ensure_ascii=False, indent=1)
        json.dump(Z, open(D('zones.json'), 'w'), ensure_ascii=False, indent=1); open(D('zones.json'), 'a').write('\n')
        print('wrote items / npcs / zones.json')

if __name__ == '__main__': main()
