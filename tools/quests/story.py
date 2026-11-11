"""메인 퀘스트 40장 + 서브 퀘스트 52개 → assets/data/quests.json / npcs.json / monsters.json / items.json

설계 문서: 『아르칸 연대기 — 메인 퀘스트 40챕터』, 『아르칸 연대기 — 서브 퀘스트』(claude.ai 문서).
기존 퀘스트(q1_start, q2_merchant, q3_slime, q4_spore, q5_gear, q6_golem, q7_boss, q_job1, qt_*)는 그대로 두고,
이 스크립트가 만든 것(id가 mq / qs 로 시작, npc·monster·item 의 "story": true)만 지우고 다시 씁니다.

    python3 tools/quests/story.py            # 검사만 (무엇이 바뀌는지 출력)
    python3 tools/quests/story.py --write    # 파일 쓰기

런타임: js/questworld.js (이야기 NPC 배치 storyNpcs, 퀘스트 보스 spawn, 줍기 gather, 퀘스트 전용 drop),
js/actors.js (yieldAt / surviveSec 보스), js/core.js (job 'tier2', hpMul).
"""
import json, math, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
D = lambda *p: os.path.join(ROOT, 'assets', 'data', *p)
load = lambda p: json.load(open(p, encoding='utf-8'))
LEVELS = load(D('levels.json'))['expToNext']
ZONES = load(D('zones.json'))['zones']
ZLIST = ZONES if isinstance(ZONES, list) else [dict(v, id=k) for k, v in ZONES.items()]

def zone_def(zid):
    z = next(z for z in ZLIST if z['id'] == zid)
    if 'file' in z:
        f = D(os.path.relpath(z['file'], 'data')) if z['file'].startswith('data') else os.path.join(ROOT, 'assets', 'data', z['file'])
        if not os.path.exists(f): f = D('world', zid + '.json')
        return load(f)
    return z

# ===================================================================================== NPCs
# model = NPC_MODELS key in js/model.js (빌린 3D 모델). 아스텔은 Tripo + Blender로 새로 만든 모델(npc_astel)
NPCS = {
    'astel':        ('아스텔', '망명 왕자', 'astel', 'npc_guard', ['…동생을 구하고 싶다. 그게 베는 일이 되더라도.', '오른손의 문양이 또 뜨거워진다.']),
    'castilla':     ('카스티야', '왕실 궁수', 'master_artist', 'npc_artist', ['오늘은 내가 먼저 발견했어.', '바람이 어느 쪽에서 부는지만 알면 돼.']),
    'kylus':        ('카일러스', '호위기사', 'guard', 'npc_guard', ['전하의 왼쪽 어깨는 늘 반 박자 늦습니다.', '누군가는 남아야 합니다. 그게 호위기사의 일이니까요.']),
    'daisen':       ('다이센', '베르그 전사', 'master_blacksmith', 'npc_blacksmith', ['용서한 건 아니다.', '이 철퇴는 할아버지의 할아버지 때부터 무거웠다.']),
    'boldran':      ('볼드란', '전설의 대장장이', 'master_blacksmith', 'npc_blacksmith', ['내가 만든 무기가 너무 많은 사람을 죽였네.', '이번엔 무언가를 지키는 데 쓰이게 하고 싶군.']),
    'capital_cook': ('곤', '왕도 요리사', 'master_cook', 'npc_cook', ['수확제 요리는 재료가 반이지!']),
    'baltern_herbalist': ('미르', '발테른 약초상', 'master_pharmacist', 'npc_pharmacist', ['바위산 약초는 쓰지만 잘 듣지요.']),
    'baltern_captain':   ('가론', '발테른 경비대장', 'guard', 'npc_guard', ['고갯길 상인들이 또 당했어.']),
    'lumiere_pilgrim':   ('티아', '순례자', 'master_artist', 'npc_artist', ['안개 속에서 등불이 꺼지면 길을 잃어요.']),
    'lumiere_monk':      ('세오', '루미에르 수도사', 'master_pharmacist', 'npc_pharmacist', ['기록은 사람보다 오래 남습니다.']),
    'lumiere_priest':    ('베른', '경비 사제', 'guard', 'npc_guard', ['순례길은 늘 지켜져야 합니다.']),
    'shepherd_wife':     ('네아', '양치기의 아내', 'merchant', 'npc_merchant', ['양들이 밤마다 사라져요…', '그이가 돌아오지 않아요.']),
    'shepherd':          ('토빈', '실베른 양치기', 'elder', 'npc_elder', ['피리 소리만 들리면 양들은 돌아와.']),
    'silvern_hunter':    ('라엘', '실베른 사냥꾼', 'guard', 'npc_guard', ['늑대 굴은 남쪽 숲 깊은 곳에 있지.']),
    'gravel_pharmacist': ('오나', '그라벨 약사', 'master_pharmacist', 'npc_pharmacist', ['전갈 독은 해독제의 재료이기도 해요.']),
    'gravel_refugee':    ('한스', '피난민', 'elder', 'npc_elder', ['우리 마을은… 지도에서 지워졌습니다.']),
    'supply_officer':    ('브람', '연합군 보급관', 'guard', 'npc_guard', ['사만 명이 먹는다. 하루에도 산 하나가 사라지지.']),
    'highland_hunter':   ('카야', '고원 사냥꾼', 'guard', 'npc_guard', ['고원의 겨울은 빨리 온다.']),
    'tanner':            ('도르', '마르세온 무두장이', 'armorer', 'npc_armorer', ['좋은 가죽은 좋은 갑옷이 되지.']),
    'miner_chief':       ('바르크', '광부 조합장', 'master_blacksmith', 'npc_blacksmith', ['광산길이 막히면 왕국의 화로도 식는다.']),
    'cavalry_captain':   ('레아', '발타자르 기병대장', 'guard', 'npc_guard', ['설인 때문에 말들이 놀라서 큰일이야.']),
    'fort_watch':        ('일렉', '요새 파수병', 'guard', 'npc_guard', ['밤마다 호수 밑에서 소리가 울려.']),
    'ruin_monk':         ('유디트', '살아남은 수도사', 'master_pharmacist', 'npc_pharmacist', ['대사제님은… 끝까지 기록을 지키셨어요.']),
}

SHEET = {'npc_artist': 'npc_master_artist', 'npc_blacksmith': 'npc_master_blacksmith', 'npc_cook': 'npc_master_cook', 'npc_pharmacist': 'npc_master_pharmacist'}   # sprite-sheet fallback names

# ===================================================================================== items (퀘스트 물건)
ITEMS = {  # id: (name, desc, icon)
    'qi_black_blood': ('검은 핏자국', '검은 피를 흘린 사슴의 흔적.', 'm_toad_gland'),
    'qi_hills_herb': ('구릉지 약초', '상처를 덮는 쓴 약초.', 'm_herb'),
    'qi_poison_sample': ('병든 이끼', '검게 물든 숲의 이끼.', 'm_moss_stone'),
    'qi_black_feather': ('검은 깃털 표식', '암살단 \'검은 깃\'의 표식.', 'm_fox_fur'),
    'qi_shadow_ember': ('그림자 불씨', '채석장 바닥에서 꿈틀대는 검은 불씨.', 'm_cinder_gland'),
    'qi_lost_pilgrim': ('순례자의 표식', '길 잃은 순례자가 남긴 표식.', 'm_rune_shard'),
    'qi_blue_lamp': ('푸른 등불', '불을 붙이면 길을 알려 주는 등불.', 'm_cinder_gland'),
    'qi_illusion_shard': ('거짓 단서', '환영이 남긴 일그러진 조각.', 'm_rune_shard'),
    'qi_village_diary': ('남은 일기', '사라진 마을 사람이 남긴 일기.', 'm_rune_shard'),
    'qi_abyss_obs': ('관측 기록', '구덩이를 엿본 자리의 기록.', 'm_rune_shard'),
    'qi_buried_record': ('묻어 둔 기록', '불탄 마을 아래 묻혀 있던 기록.', 'm_rune_shard'),
    'qi_assassin_trace': ('암살단의 흔적', '습지에 남은 검은 깃의 발자국.', 'm_fox_fur'),
    'qi_shadow_hole': ('정화한 그림자 구멍', '쓰러진 자리에서 열리던 그림자 구멍.', 'm_rune_shard'),
    'qi_burning_shrine': ('타다 남은 성소 불씨', '꺼 낸 성소의 불씨.', 'm_cinder_gland'),
    'qi_supply_cache': ('불태운 보급 장부', '점령군 보급창의 장부.', 'm_rune_shard'),
    'qi_hammer_mark': ('망치 자국', '볼드란의 망치가 남긴 자국.', 'm_lava_tusk'),
    'qi_collapse_mark': ('붕괴 표식', '낙뢰로 무너뜨릴 지점의 표식.', 'm_rune_shard'),
    'qi_ice_steel': ('얼음 강철', '설원에서만 나는 차가운 강철.', 'm_frost_horn'),
    'qi_oil_barrel': ('기름통', '동쪽 성벽을 태울 기름통.', 'm_cinder_gland'),
    'qi_altar_core': ('제단의 핵', '교단 제단에서 떼어 낸 검은 핵.', 'm_dragon_blood'),
    # 서브
    'qi_snail_shell': ('이끼 달팽이 껍데기', '단단하고 가벼운 껍데기.', 'm_moss_stone'),
    'qi_honey': ('왕벌 꿀', '수확제 요리에 쓰는 진한 꿀.', 'm_herb'),
    'qi_beetle_shell': ('딱정벌레 껍질', '방패에 덧대는 껍질.', 'm_moss_stone'),
    'qi_turtle_moss': ('이끼 거북 등딱지', '이끼 낀 등딱지 조각.', 'm_moss_stone'),
    'qi_stolen_pick': ('훔친 곡괭이', '고블린 광부가 훔쳐 간 곡괭이.', 'm_lava_tusk'),
    'qi_gargoyle_feather': ('아기 가고일 깃', '돌처럼 단단한 깃.', 'm_fox_fur'),
    'qi_quarry_stone': ('채석장 돌', '피난민 숙소를 고칠 돌.', 'm_moss_stone'),
    'qi_bamboo': ('죽순', '도둑맞은 죽순.', 'm_herb'),
    'qi_pilgrim_lamp': ('순례 등불', '요정이 훔쳐 간 등불.', 'm_cinder_gland'),
    'qi_deer_antler': ('별빛 사슴의 뿔', '사슴이 떨어뜨린 빛나는 뿔.', 'm_glacier_horn'),
    'qi_spider_silk': ('숲거미 영령의 실', '은빛으로 빛나는 실.', 'm_fox_fur'),
    'qi_sheep_wool': ('양털', '도깨비불에 홀린 양의 털.', 'm_jelly'),
    'qi_shepherd_item': ('양치기의 물건', '피리·모자·지팡이.', 'm_rune_shard'),
    'qi_owl_feather': ('밤 부엉이 깃털', '밤길 표식에 쓰는 깃털.', 'm_fox_fur'),
    'qi_scorpion_tail': ('모래 전갈 꼬리', '해독제의 재료.', 'm_toad_gland'),
    'qi_keepsake': ('가족의 유품', '사라진 마을에 남은 유품.', 'm_rune_shard'),
    'qi_cairn': ('돌무더기 표식', '안전한 길을 알리는 돌무더기.', 'm_moss_stone'),
    'qi_ram_horn': ('큰뿔양의 뿔', '철퇴 손잡이를 감을 뿔.', 'm_frost_horn'),
    'qi_barley_seed': ('고원 보리 씨앗', '불에 타지 않은 씨앗.', 'm_spore'),
    'qi_ice_flower': ('얼음꽃', '화상에 바르는 차가운 꽃.', 'm_ice_tail'),
    'qi_boar_meat': ('흙먼지 멧돼지 고기', '연합군의 군량.', 'm_boar_tusk'),
    'qi_cloak_scrap': ('푸른 망토 조각', '강바닥에서 건진 망토 조각.', 'm_jelly'),
    'qi_prayer_book': ('타다 남은 기도서', '불탄 순례지의 기도서.', 'm_rune_shard'),
    'qi_salamander_tail': ('불꽃 도롱뇽 꼬리', '대장간 화로 연료.', 'm_cinder_gland'),
    'qi_frozen_wood': ('얼어붙은 장작', '요새의 겨울을 날 장작.', 'm_moss_stone'),
    'qi_lake_ice': ('호수 얼음 조각', '밤마다 울리는 호수의 얼음.', 'm_frost_horn'),
    'qi_black_crystal': ('검은 결정', '빙곰 몸속에서 나온 검은 결정. 희미하게 맥박이 뛴다.', 'm_dragon_blood'),
    'qi_rubbing': ('석판 탁본', '유적 입구 석판의 탁본.', 'm_rune_shard'),
    'qi_epitaph': ('비문 조각', '아르칸의 비문 조각.', 'm_rune_shard'),
    'qi_old_scale': ('오래된 용 비늘', '비룡 둥지의 오래된 비늘.', 'm_drake_scale'),
}

# ===================================================================================== story bosses
# id: (name, level, base monster (stats/ai/sheet), look {base model, size, tint, recolor}, extra)
def look(base, size, tint=None, recolor=0.6): return dict(base=base, size=size, **({'tint': tint, 'recolor': recolor} if tint else {}))
BOSSES = {
    'qb_boar_lord':      ('길목의 엄니 멧돼지', 4, 'mon_boar', look('mon_boar', 1.9, [0.75, 0.55, 0.4], 0.4), dict(hpMul=3)),
    'qb_shadow_scout':   ('그림자 정찰대', 5, 'mon_wraith', look('mon_wraith', 1.3, [0.3, 0.28, 0.42], 0.7), dict(hpMul=3, ai='melee')),
    'qb_roderick':       ('근위대장 로데릭', 6, 'mon_soldier', look('mon_soldier', 1.35, [0.95, 0.45, 0.4], 0.55), dict(hpMul=2.5, yieldAt=0.5, yieldLine='로데릭: 물러서라! …성문을 닫아라! 반역자들이 달아난다!')),
    'qb_chaser_captain': ('추격 기마대장', 7, 'mon_soldier', look('mon_soldier', 1.3, [0.55, 0.6, 0.85], 0.5), dict(hpMul=2.5)),
    'qb_black_feather':  ('검은 깃 두목', 9, 'mon_goblin_miner', look('mon_goblin_miner', 1.5, [0.25, 0.22, 0.3], 0.75), dict(hpMul=3)),
    'qb_kerin_spar':     ('노기사 케린 (대련)', 10, 'mon_soldier', look('mon_soldier', 1.3, [0.85, 0.88, 0.95], 0.5), dict(hpMul=5, yieldAt=0.3, yieldLine='케린: 됐다. 검이 아직 무디지만, 등을 맡길 만은 하구나.')),
    'qb_quarry_golem':   ('그림자 깃든 석상', 11, 'mon_mine_golem', look('mon_mine_golem', 1.9, [0.45, 0.4, 0.6], 0.6), dict(elite=True)),
    'qb_fog_alpha':      ('안개 늑대 우두머리', 13, 'mon_shadow_wolf', look('mon_shadow_wolf', 1.8, [0.7, 0.75, 0.9], 0.5), dict(elite=True)),
    'qb_phantom_king':   ('환영의 아버지', 15, 'mon_wraith', look('mon_wraith', 1.7, [1.0, 0.85, 0.45], 0.6), dict(elite=True)),
    'qb_digona':         ('디고나', 16, 'mon_spider_elite', look('mon_spider', 3.2, [0.9, 0.35, 0.45], 0.55), dict(elite=True, hpMul=1.4)),
    'qb_cult_spy':       ('교단 첩보 사제', 17, 'mon_wraith', look('mon_wraith', 1.3, [0.6, 0.35, 0.8], 0.6), dict(elite=True, ai='ranged')),
    'qb_blackeye_chief': ('검은 눈의 촌장', 19, 'mon_wraith', look('mon_wraith', 1.6, [0.35, 0.3, 0.35], 0.7), dict(elite=True)),
    'qb_abyss_shade':    ('심연의 눈', 21, 'mon_wraith', look('mon_wraith', 2.8, [0.15, 0.12, 0.22], 0.8), dict(elite=True, surviveSec=40, yieldLine='거대한 눈이 감겼다. 요이센: 지금이야, 달려!')),
    'qb_daisen':         ('베르그 전사 다이센', 21, 'mon_berg_bear', look('mon_soldier', 1.55, [0.7, 0.5, 0.35], 0.55), dict(elite=True, yieldAt=0.35, yieldLine='다이센: …칼끝이 망설이지 않는군. 좋다, 증거를 가져와라.')),
    'qb_ash_wraith':     ('재의 망령', 23, 'mon_wraith', look('mon_wraith', 2.0, [0.55, 0.5, 0.45], 0.7), dict(elite=True)),
    'qb_assassin_lord':  ('검은 깃의 수장', 24, 'mon_soldier', look('mon_soldier', 1.4, [0.2, 0.2, 0.26], 0.75), dict(elite=True)),
    'qb_fort_warden':    ('검은 사슬의 수문장', 25, 'mon_armor', look('mon_armor', 1.45, [0.35, 0.3, 0.4], 0.6), dict(elite=True)),
    'qb_grace_1':        ('찬탈왕 그레이스', 28, 'mon_wraith', look('mon_wraith', 1.6, [0.25, 0.3, 0.55], 0.6), dict(elite=True, hpMul=2, surviveSec=30, yieldLine='그레이스: 돌아갈 곳이…… 없어요, 형.')),
    'qb_shadow_general': ('그림자 추격 장군', 29, 'mon_armor', look('mon_armor', 1.6, [0.25, 0.22, 0.35], 0.7), dict(elite=True)),
    'qb_bridge_chaser':  ('추격군 대장', 30, 'mon_soldier', look('mon_soldier', 1.45, [0.4, 0.35, 0.45], 0.6), dict(elite=True)),
    'qb_fallen_paladin': ('타락한 순례 기사단장', 32, 'mon_armor', look('mon_armor', 1.5, [0.85, 0.75, 0.55], 0.5), dict(elite=True)),
    'qb_justina':        ('타락한 저스티나', 33, 'mon_lantern_ghost', look('mon_wraith', 1.6, [0.55, 0.3, 0.6], 0.6), dict(elite=True, hpMul=1.4, ai='ranged')),
    'qb_checkpoint':     ('검문소 그림자 집행관', 33, 'mon_soldier', look('mon_soldier', 1.4, [0.3, 0.3, 0.4], 0.65), dict(elite=True)),
    'qb_marseon_guard':  ('마르세온 총독 근위대장', 34, 'mon_armor', look('mon_armor', 1.45, [0.6, 0.3, 0.3], 0.55), dict(elite=True)),
    'qb_crystal_golem':  ('붉은 수정 골렘', 35, 'mon_crystal', look('mon_crystal', 2.3, None), dict(elite=True)),
    'qb_boldran':        ('폭주한 볼드란', 37, 'mon_soldier', look('mon_soldier', 1.5, [0.95, 0.35, 0.3], 0.55), dict(elite=True, yieldAt=0.25, yieldLine='볼드란: 내가… 무슨 짓을. 수정이… 부서졌군.')),
    'qb_dig_golem':      ('크로이츠 굴착 골렘', 38, 'mon_mine_golem', look('mon_mine_golem', 2.1, [0.6, 0.65, 0.8], 0.5), dict(elite=True)),
    'qb_black_knight':   ('검은 창의 기사', 40, 'mon_armor', look('mon_armor', 1.5, [0.12, 0.12, 0.16], 0.85), dict(elite=True, hpMul=1.3, yieldAt=0.4, yieldLine='흑기사: 제 왕자는 강에서 죽었습니다. 당신은 그분의 흉내를 내는 자일 뿐이오.')),
    'qb_tainted_queen':  ('물든 왕비', 41, 'mon_lantern_ghost', look('mon_lantern_ghost', 1.6, [0.6, 0.35, 0.7], 0.6), dict(elite=True, surviveSec=35, ai='ranged', yieldLine='왕비: 가거라. 내가 다시 물들기 전에.')),
    'qb_tomb_guardian':  ('능침의 고대 수호자', 42, 'mon_tomb_golem', look('mon_tomb_golem', 2.4, None), dict(elite=True, hpMul=1.3)),
    'qb_yanber':         ('배신자 얀베르', 43, 'mon_soldier', look('mon_soldier', 1.4, [0.35, 0.45, 0.35], 0.6), dict(elite=True, hpMul=1.4)),
    'qb_frost_giant':    ('설원의 서리 거인', 44, 'mon_yeti', look('mon_yeti', 2.6, [0.75, 0.85, 1.0], 0.5), dict(elite=True, hpMul=1.3)),
    'qb_siege_beast':    ('그림자 공성 거수', 45, 'mon_berg_bear', look('mon_berg_bear', 2.8, [0.2, 0.18, 0.28], 0.8), dict(elite=True, hpMul=1.4)),
    'qb_palace_captain': ('왕궁 그림자 근위대장', 46, 'mon_armor', look('mon_armor', 1.55, [0.2, 0.25, 0.5], 0.7), dict(elite=True, hpMul=1.3)),
    'qb_executioner':    ('사브낙 교단 집행자', 46, 'mon_wraith', look('mon_wraith', 1.8, [0.45, 0.15, 0.25], 0.7), dict(elite=True, hpMul=1.3)),
    'qb_sabnak_eye':     ('사브낙의 눈', 48, 'mon_wraith', look('mon_wraith', 3.2, [0.1, 0.08, 0.15], 0.85), dict(elite=True, hpMul=1.6, ai='ranged')),
    'qb_kylus':          ('흑기사 카일러스', 49, 'mon_armor', look('mon_armor', 1.5, [0.14, 0.14, 0.2], 0.85), dict(elite=True, hpMul=1.5, yieldAt=0.2, yieldLine='카일러스: ……어깨를 고치시라고, 몇 번을 말씀드렸습니까.')),
    'qb_malachion':      ('말라키온', 50, 'mon_wraith', look('mon_wraith', 1.9, [0.35, 0.25, 0.45], 0.7), dict(elite=True, hpMul=2, ai='ranged')),
    'qb_sabnak_grace':   ('사브낙-그레이스', 50, 'mon_abyss_drake', look('mon_abyss_drake', 3.4, [0.12, 0.1, 0.2], 0.85), dict(elite=True, hpMul=3)),
}

# ===================================================================================== quest DSL
def talk(at, text): n, z = at.split('@'); return dict(type='talk', target=n, count=1, text=text, _at=z)
def visit(z, text): return dict(type='visit', target=z, count=1, text=text)
def kill(m, n, text): return dict(type='kill', target=m, count=n, text=text)
def boss(m, z, text, at=None): return dict(type='kill', target=m, count=1, text=text, spawn=dict(zone=z, **({'at': at} if at else {})))
def gather(it, n, z, text): return dict(type='collect', target=it, count=n, text=text, gather=dict(zone=z))
def drop(it, n, frm, ch, text): return dict(type='collect', target=it, count=n, text=text, drop={'from': frm, 'chance': ch})
def have(it, n, text): return dict(type='collect', target=it, count=n, text=text)
def job(t, text): return dict(type='job', target=t, count=1, text=text)

QUESTS = []
def Q(qid, name, cat, lv, giver, objs, offer, prog, done, turn=None, prereq=None, items=None, consume=True, exp=None):
    gn, gz = giver.split('@'); tn, tz = (turn or giver).split('@')
    QUESTS.append(dict(id=qid, name=name, category=cat, lv=lv, giver=gn, gz=gz, turnIn=tn, tz=tz, objectives=objs, offerText=offer,
                       progressText=prog, completeText=done, prereq=prereq, items=items, consume=consume, exp=exp))

def say(*lines):
    """대화창 HTML: ('아스텔', '…') 또는 '서술'"""
    out = []
    for l in lines:
        if isinstance(l, tuple): out.append(f"<b class='gold'>{l[0]}</b> {l[1]}")
        else: out.append(f"<i>{l}</i>")
    return '<br>'.join(out)

# ===================================================================================== MAIN (40장)
M = 'main'
# ---- 1막 반역의 가을
Q('mq01a', '1장 가을의 납품', M, 2, 'elder@town', [kill('mon_mole', 6, '왕도 가는 길의 흙두더지 쫓기'), boss('qb_boar_lord', 'capital_road', '길목의 엄니 멧돼지 쓰러뜨리기')],
  say(('하람', '왕도 수확제에 우리 마을 물건을 납품하기로 했네. 철산의 칼과 모아의 물건을 실은 짐수레가 곧 떠나는데, 길에 두더지 구멍과 사나운 멧돼지가 말썽이야.'), ('하람', '길을 열고 왕도의 상인 베아에게 물건이 도착했다고 전해 주게.')),
  say(('하람', '왕도 가는 길은 마을 북쪽 출구야. 엄니가 유난히 큰 멧돼지를 조심하게.')),
  say(('베아', '아르칸 마을 짐수레? 다행이다, 수확제에 늦을 뻔했어!'), ('베아', '그런데… 성문이 오늘 아침부터 이상하게 조용하네.')),
  turn='capital_merchant@kairion_capital', prereq=['q2_merchant'])
Q('mq02a', '2장 검은 피의 사슴 ①', M, 3, 'capital_merchant@kairion_capital', [talk('astel@kairion_hunt', '사냥터에서 왕자 아스텔 찾기')],
  say(('베아', '수확제 칼 한 자루는 왕세자 전하께 바칠 물건이야. 전하는 오늘 사냥터에 나가 계신대.'), ('베아', '사냥터 숲으로 가서 직접 전해 드려.')),
  say(('베아', '사냥터 숲은 왕도 서쪽 출구로 나가면 돼.')),
  say(('아스텔', '아르칸 마을의 칼이라고? 고맙다. …쉿, 저기 사슴이 있어.'), ('카스티야', '내가 먼저 봤거든요, 전하!'), ('카일러스', '두 분 다 조용히 하십시오.')))
Q('mq02b', '2장 검은 피의 사슴 ②', M, 4, 'astel@kairion_hunt', [gather('qi_black_blood', 4, 'kairion_hunt', '검은 핏자국 따라가기'), kill('mon_sapling', 6, '길을 막는 걷는 묘목 치우기')],
  say(('아스텔', '내 화살이 박혔는데… 피가 검다. 이런 건 처음 봐.'), ('카일러스', '핏자국을 따라가 보지요. 숲이 너무 조용합니다.')),
  say(('카스티야', '핏자국이 빛나는 자리를 찾아. 바닥을 잘 봐.')),
  say('새소리가 끊기고 바람이 멈췄다. 나무 사이로 검은 두건의 그림자들이 피어오른다.'))
Q('mq02c', '2장 검은 피의 사슴 ③', M, 5, 'astel@kairion_hunt', [boss('qb_shadow_scout', 'kairion_hunt', '그림자 정찰대 물리치기')],
  say(('그림자', '다른 쪽이다. 그릇은…… 이미 깨어났다.'), ('아스텔', '칼이 통과한다…! 다들 물러서!')),
  say(('카일러스', '저것들은 전하만 보고 있습니다. 전하 곁을 지켜 주십시오!')),
  say('그림자들이 흩어지자 아스텔의 오른손 등에 용의 눈을 닮은 금빛 문양이 떠올랐다가 꺼졌다.', ('아스텔', '…왕도로 돌아가자. 아버지께 알려야 해.')))
# ---- 3장
Q('mq03a', '3장 닫힌 성문 ①', M, 5, 'astel@kairion_hunt', [visit('kairion_capital', '왕도로 돌아가기'), talk('roderick@kairion_capital', '근위대장 로데릭의 선고 듣기')],
  say(('아스텔', '함께 가 주겠나? 숲에서 본 것을 증언해 줄 사람이 필요해.')),
  say(('카스티야', '성문에… 푸른 깃발 대신 검은 천이 걸려 있어.')),
  say(('로데릭', '국왕 시해. 현장에 남은 왕세자의 예장검, 왕세자의 이름으로 쓴 밀서. 아스텔, 그대를 반역자로 체포한다!'), ('그레이스', '형님은 언제나 질문이 틀려요. 누가 죽였느냐가 아니라, 왜 아무도 몰랐느냐고 물어야죠.')))
Q('mq03b', '3장 닫힌 성문 ②', M, 6, 'roderick@kairion_capital', [boss('qb_roderick', 'kairion_hills', '구릉지로 달아나며 로데릭 막아 내기')],
  say(('로데릭', '쏴라!'), '화살비가 쏟아진다. 카일러스가 방패를 들어 왕자를 가렸다.', ('카일러스', '구릉지로! 제가 뒤를 막겠습니다!')),
  say(('카스티야', '서쪽이 아니라 동쪽 구릉지야! 빨리!')),
  say('그날 밤 카이리온의 왕자 아스텔은 반역자가 되었다.', ('아스텔', '그레이스의 눈에서… 검은 눈물이 흘렀어.')),
  turn='astel@kairion_hills')
# ---- 4장
Q('mq04a', '4장 언덕 너머로 ①', M, 6, 'astel@kairion_hills', [gather('qi_hills_herb', 5, 'kairion_hills', '구릉지 약초 모으기')],
  say(('아스텔', '카일러스가 화살을 맞았어. 약초를 구해 줄 수 있겠나? 아르칸 마을 사람이라면 약초를 알아볼 테지.')),
  say(('카스티야', '쓴 냄새가 나는 잎이야. 빛이 도는 자리를 찾아봐.')),
  say(('카일러스', '…이 정도로 쓰러질 호위기사가 아닙니다. 하지만 고맙군.')), turn='kylus@kairion_hills')
Q('mq04b', '4장 언덕 너머로 ②', M, 7, 'kylus@kairion_hills', [kill('mon_wolf', 6, '야영지를 노리는 달빛 늑대'), boss('qb_chaser_captain', 'kairion_hills', '추격 기마대장 쓰러뜨리기')],
  say(('카일러스', '왕실 추격 기마대가 진을 쳤습니다. 대장만 쓰러뜨리면 흩어질 겁니다.')),
  say(('카일러스', '늑대 떼가 야영지 주변을 맴돕니다. 먼저 정리하지요.')),
  say(('아스텔', '길이 열렸다. 서쪽 숲을 지나 발테른으로 간다. 케린 경이라면 우리를 믿어 줄 거야.')), turn='astel@kairion_hills')
# ---- 5장 (기존 거대 독버섯 q7_boss 연결)
Q('mq05a', '5장 병드는 숲', M, 7, 'astel@kairion_hills', [kill('mon_jelly', 6, '검게 물든 새싹 젤리'), gather('qi_poison_sample', 3, 'forest', '병든 이끼 모으기')],
  say(('아스텔', '발테른으로 가는 길에 속삭이는 숲을 지나야 해. 그런데 숲이 검게 병들고 있다는 소문이야.'), ('카스티야', '아르칸 마을 바로 옆 숲이잖아?')),
  say(('카일러스', '검게 물든 이끼를 모아 촌장님께 보여 드리지요.')),
  say(('하람', '이건… 독버섯 군락지의 기운이야. 하지만 이렇게 검지는 않았는데.'), ('하람', '숲의 꽃잎 곰과 거대 독버섯 이야기는 내가 따로 부탁하겠네(서브 \'꽃잎 곰 토벌\' → 메인 \'거대 독버섯\').')),
  turn='elder@town')
# ---- 6장
Q('mq06a', '6장 안개 속 감시자 ①', M, 8, 'elder@town', [visit('baltern_pass', '안개 골짜기를 지나 바위산 고갯길로'), drop('qi_black_feather', 4, ['mon_goblin_miner', 'mon_hawk', 'mon_rock_ram'], 0.5, '검은 깃털 표식 모으기')],
  say(('하람', '숲이 다시 숨을 쉬는구먼. 왕자님 일행은 발테른으로 간다지? 고갯길에 검은 깃털을 단 무리가 숨어 있다는 소문이 있네.')),
  say(('하람', '안개 골짜기 북쪽 끝이 바위산 고갯길이야.')),
  say(('카일러스', '현상금 사냥꾼들이군요. \'검은 깃\'. 누군가 전하의 목에 값을 매겼습니다.')),
  prereq=['mq05a', 'q7_boss'], turn='kylus@baltern_pass')
Q('mq06b', '6장 안개 속 감시자 ②', M, 9, 'kylus@baltern_pass', [boss('qb_black_feather', 'baltern_pass', '검은 깃 두목 쓰러뜨리기')],
  say(('카일러스', '표식이 모이는 곳이 소굴입니다. 두목을 치면 나머지는 흩어질 겁니다.')),
  say(('카스티야', '고갯길 위쪽, 바위 그늘을 살펴.')),
  say(('검은 깃 두목', '크윽… 의뢰인은 얼굴을 보인 적이 없다. 검은 로브… 그것뿐이야.')))
# ---- 7장
Q('mq07a', '7장 바위산의 노기사 ①', M, 9, 'kylus@baltern_pass', [talk('kerin@baltern', '발테른 공국의 케린 찾아가기')],
  say(('카일러스', '발테른은 이 고갯길 끝입니다. 케린 경께 가지요.')),
  say(('아스텔', '케린 경은 내 검술 스승이야. 아무것도 묻지 않을 분이지.')),
  say(('케린', '…'), '케린은 아무것도 묻지 않고 제자의 어깨를 두드렸다.', ('케린', '삼십 년 전 지라트 국경에서, 목을 베어도 일어나는 병사들과 검은 로브의 사내를 보았다.')))
Q('mq07b', '7장 바위산의 노기사 ②', M, 10, 'kerin@baltern', [boss('qb_kerin_spar', 'baltern_pass', '케린과 대련하기')],
  say(('케린', '왕자를 따라다닐 생각이라면 실력부터 보자. 고갯길 공터로 나와라.')),
  say(('케린', '대련이다. 쓰러뜨릴 필요는 없다. 버티고, 파고들어라.')),
  say(('케린', '검이 아직 무디다. 하지만 등을 맡길 만은 하구나.')))
Q('mq07c', '7장 바위산의 노기사 ③', M, 10, 'kerin@baltern', [job('any', '아르칸 마을 마스터에게 1차 전직하기')],
  say(('케린', '칼만 휘두르는 녀석은 오래 못 간다. 네 손에 맞는 일을 찾아라. 아르칸 마을에 마스터들이 있다지?')),
  say(('케린', '약국·식당·대장간·의상실·화방. 마스터를 찾아가 \'직업 상담\'을 해라.')),
  say(('케린', '좋은 손이 됐군. 그 손으로 사람을 살릴 수도, 벨 수도 있다.')))
# ---- 8장
Q('mq08a', '8장 구하는 일과 베는 일 ①', M, 10, 'kerin@baltern', [kill('mon_goblin_miner', 8, '채석장의 고블린 광부'), gather('qi_shadow_ember', 4, 'baltern_quarry', '그림자 불씨 거두기')],
  say(('케린', '주변 영주들에게 밀서를 보내는 동안 부탁이 있다. 옛 채석장에 그림자가 둥지를 틀었다.')),
  say(('케린', '채석장은 공국 남쪽 출구다.')),
  say(('케린', '그림자 불씨라… 둥지의 주인이 있겠군.')))
Q('mq08b', '8장 구하는 일과 베는 일 ②', M, 11, 'kerin@baltern', [boss('qb_quarry_golem', 'baltern_quarry', '그림자 깃든 석상 부수기')],
  say(('케린', '석상에 그림자가 깃들었다. 부숴라.')),
  say(('케린', '채석장 한가운데, 오래된 석상이다.')),
  say(('케린', '루미에르로 가라. 대사제 저스티나가 무언가 알고 있을 거다.'), ('케린', '동생을 구하고 싶거든 기억해라. 구하는 일과 베는 일은 같은 검 끝에 있다.')))
# ---- 2막 연합의 깃발: 9장
Q('mq09a', '9장 푸른숲 어귀 ①', M, 11, 'kerin@baltern', [visit('blue_forest_edge', '절벽길을 지나 푸른숲 어귀로'), gather('qi_lost_pilgrim', 3, 'blue_forest_edge', '길 잃은 순례자 찾기'), gather('qi_blue_lamp', 4, 'blue_forest_edge', '푸른 등불 켜기')],
  say(('케린', '루미에르로 가는 길은 푸른숲을 지나야 한다. 어린 녀석을 일곱 밤 세워 뒀던 곳이지.')),
  say(('카스티야', '안개가 짙어. 등불을 켜면 길이 보일 거야.')),
  say(('순례자', '살았다… 등불이 꺼지고 나서부터 늑대 울음이 들렸어요.')), turn='astel@blue_forest_edge')
Q('mq09b', '9장 푸른숲 어귀 ②', M, 12, 'astel@blue_forest_edge', [boss('qb_fog_alpha', 'blue_forest_edge', '안개 늑대 우두머리')],
  say(('아스텔', '순례자들을 노리는 늑대 우두머리가 있어. 오늘 밤은 여기서 야영하자. 그 전에 정리하자.')),
  say(('카일러스', '안개 속에서 눈이 빛나는 놈입니다.')),
  say(('아스텔', '어릴 때 여기서 일곱 밤을 버텼지. 그때는 무서운 게 늑대뿐이었는데.')))
# ---- 10장
Q('mq10a', '10장 환영의 숲 ①', M, 13, 'astel@blue_forest_edge', [visit('blue_forest', '환영의 숲으로'), gather('qi_illusion_shard', 4, 'blue_forest', '환영 속 거짓 단서 깨기')],
  say(('아스텔', '숲 깊은 곳은 사람의 마음을 비춘다고 했어. 무엇을 보든 믿지 마.')),
  say('안개 속에서 아르칸 마을이 불타는 환영이 보인다. 일그러진 자리를 찾아 깨뜨리자.'),
  say(('카스티야', '거기 있었구나! 다들 하나씩 사라져서… 전하가 이상해.')), turn='castilla@blue_forest')
Q('mq10b', '10장 환영의 숲 ②', M, 15, 'castilla@blue_forest', [boss('qb_phantom_king', 'blue_forest', '환영의 아버지')],
  say(('카스티야', '전하 앞에 돌아가신 국왕 폐하가 서 계셔. \'네가 사냥만 떠나지 않았어도\'라고….')),
  say(('카스티야', '환영이야. 전하가 검을 떨어뜨리기 전에!')),
  say(('아스텔', '내가 기억하는 아버지는 그런 말을 하지 않으셨다.')), turn='astel@blue_forest')
# ---- 11장
Q('mq11a', '11장 고목의 문지기 ①', M, 15, 'astel@blue_forest', [kill('mon_spider', 8, '숲거미 영령')],
  say(('아스텔', '숲 한가운데 고목이 부른다. 문양이 뜨거워.')),
  say(('카일러스', '거미 영령들이 고목을 둘러쌌습니다.')),
  say(('카일러스', '피투성이가 되어도 괜찮습니다. 죽은 분들만 보지 마십시오, 전하. 저희는 아직 살아 있습니다!')), turn='kylus@blue_forest_heart')
Q('mq11b', '11장 고목의 문지기 ②', M, 16, 'kylus@blue_forest_heart', [boss('qb_digona', 'blue_forest_heart', '거미 영령 디고나')],
  say('금빛 문양이 타오르자 고목이 갈라지고, 그 안의 창 한 자루가 아스텔의 손에 들어왔다. 비전창(飛電槍).', ('아스텔', '힘은 대가 없이 주어지지 않는다… 머릿속에서 목소리가 울려.')),
  say(('카일러스', '붉은 핵입니다! 낙뢰가 핵을 꿰뚫을 때까지 버티십시오!')),
  say('쓰러진 디고나는 빛의 입자가 되어 흩어졌다. 처음부터 적이 아니라 창의 문지기였다.', ('아스텔', '오른팔이… 탄다. 괜찮아.')), turn='astel@blue_forest_heart')
# ---- 12장
Q('mq12a', '12장 대사제의 고백 ①', M, 16, 'astel@blue_forest_heart', [talk('justina@lumiere', '루미에르 대사제 저스티나 만나기')],
  say(('아스텔', '루미에르는 고목지 바로 북쪽이야.')), say(('카스티야', '신전은 하얀 탑이 있는 곳이야.')),
  say(('저스티나', '사브낙의 숨결입니다. 아르칸의 다섯 유물을 모아야 흑룡을 다시 봉인할 수 있어요.'), ('저스티나', '…그리고 말씀드릴 것이 있습니다. 말라키온은 제 오라버니입니다. 돌아가신 왕비님은 제 제자였고요.')))
Q('mq12b', '12장 대사제의 고백 ②', M, 17, 'justina@lumiere', [kill('mon_mist_fox', 6, '순례길의 안개 여우'), boss('qb_cult_spy', 'lumiere_hills', '교단 첩보 사제')],
  say(('저스티나', '순례길에 교단의 눈이 있습니다. 왕자님이 여기 계신 걸 오라버니가 알기 전에….')),
  say(('저스티나', '순례길은 신전 남쪽입니다.')),
  say(('저스티나', '왕자님. 그레이스 왕자님을 벨 기회가 오더라도, 그 전에 반드시 여기로 돌아오십시오. 이유는… 확신을 얻으면 말씀드리겠습니다.')))
# ---- 13장
Q('mq13a', '13장 사라진 마을들 ①', M, 17, 'justina@lumiere', [talk('chirkai@gravel', '남쪽 국경도시 그라벨의 영주 치르카이 만나기')],
  say(('저스티나', '남쪽 그라벨 주변에서 마을이 사라지고 있다고 합니다. 지라트가 가깝지요.')),
  say(('아스텔', '그라벨은 사냥터 숲 남쪽, 국경지대를 지나면 돼.')),
  say(('치르카이', '반역자 왕자를 반길 이유는 없소. …석 달 사이 마을 열두 곳이 사라졌다는 것만 빼면.')))
Q('mq13b', '13장 사라진 마을들 ②', M, 18, 'chirkai@gravel', [gather('qi_village_diary', 3, 'lost_villages', '남은 일기 찾기'), kill('mon_wraith', 8, '그림자 망령')],
  say(('치르카이', '증거를 가져오시오. 소문이 아니라 증거를.')),
  say(('카일러스', '사라진 마을 터는 그라벨 서쪽입니다.')),
  say(('치르카이', '…밤마다 죽은 마을 사람이 돌아다닌다는 말이 사실이었군.')))
Q('mq13c', '13장 사라진 마을들 ③', M, 19, 'chirkai@gravel', [boss('qb_blackeye_chief', 'lost_villages', '검은 눈의 촌장')],
  say(('치르카이', '되살아난 자들을 이끄는 놈이 있다더군. 그 촌장이란 자.')),
  say(('카스티야', '검은 눈… 수도에서 본 그레이스의 눈물과 같은 색이야.')),
  say(('요이센', '지라트를 직접 보고 싶다고? 나랑 가. 규칙은 두 가지야.')), turn='yoisen@gravel')
# ---- 14장
Q('mq14a', '14장 소리 내지 말 것 ①', M, 20, 'yoisen@gravel', [visit('zirat_outskirts', '지라트 외곽 황무지로'), gather('qi_abyss_obs', 3, 'zirat_outskirts', '구덩이를 엿볼 자리 찾기')],
  say(('요이센', '하나, 소리를 내지 말 것. 둘, 땅을 믿지 말 것. 지라트에서 열 번 넘게 살아 돌아온 사람은 나뿐이야.')),
  say(('요이센', '관측 지점은 바위 그늘마다 하나씩 있어. 조용히.')),
  say('회색 황무지 끝, 끝이 보이지 않는 구덩이. 그 안에서 수천의 그림자가 검은 바다처럼 꿈틀댄다. 바다 한가운데에서 거대한 눈 하나가 열렸다.'),
  turn='yoisen@zirat_outskirts')
Q('mq14b', '14장 소리 내지 말 것 ②', M, 21, 'yoisen@zirat_outskirts', [boss('qb_abyss_shade', 'zirat_outskirts', '심연의 눈에게서 버티며 달아나기')],
  say(('심연의 눈', '……찾았다, 아르칸.'), ('요이센', '뛰어! 싸우지 마, 버티기만 해!')),
  say(('요이센', '눈이 감길 때까지 버텨!')),
  say(('치르카이', '…이건 카이리온의 왕위 다툼이 아니군. 아들 치르젠을 데려가시오.')), turn='chirkai@gravel')
# ---- 15장
Q('mq15a', '15장 베르그의 마지막 사내 ①', M, 20, 'chirzen@gravel', [visit('berg_canyon', '베르그 협곡으로'), kill('mon_canyon_ram', 6, '협곡 큰뿔양')],
  say(('치르젠', '영주들을 설득하려면 동쪽 협곡을 지나야 합니다. 책사 치르젠, 오늘부터 전하를 모시지요.')),
  say(('치르젠', '협곡은 국경지대 동쪽 출구입니다.')),
  say('협곡 한가운데, 철퇴를 든 거한이 길을 막았다.'), turn='astel@berg_canyon')
Q('mq15b', '15장 베르그의 마지막 사내 ②', M, 22, 'astel@berg_canyon', [boss('qb_daisen', 'berg_canyon', '베르그 전사 다이센과 결투')],
  say(('다이센', '카이리온의 왕자. 너희가 불태운 베르그 마을의 마지막 생존자가 나다.'), ('아스텔', '…그런 일은 들어본 적이 없다.')),
  say(('다이센', '들어본 적이 없다고? 그럼 철퇴로 기억하게 해 주마.')),
  say(('다이센', '…칼끝이 망설이지 않는군. 좋다, 증거를 가져와라.')))
# ---- 16장
Q('mq16a', '16장 이십 년 전의 군령서 ①', M, 22, 'astel@berg_canyon', [talk('chirzen@gravel', '그라벨 서고의 치르젠에게 가기')],
  say(('아스텔', '치르젠이 그라벨 서고를 뒤지고 있어.')), say(('카스티야', '그라벨로 돌아가자.')),
  say(('치르젠', '찾았습니다. 이십 년 전 군령서. \'베르그 고원의 역병을 막기 위해 마을을 불태울 것.\' 국왕의 인장이 찍혀 있어요.'), ('치르젠', '그 아래 궁정 고문의 서명. 역병은 없었습니다.')))
Q('mq16b', '16장 이십 년 전의 군령서 ②', M, 23, 'chirzen@gravel', [gather('qi_buried_record', 3, 'berg_burned', '불탄 마을 아래 묻어 둔 기록'), kill('mon_wraith', 6, '마을 터의 그림자 망령')],
  say(('치르젠', '베르그족이 기록을 묻어 두었다면, 불탄 마을 터일 겁니다.')),
  say(('다이센', '…우물 옆, 대장간 터, 촌장 집. 셋이다.')),
  say(('다이센', '역병은 없었다. 아버지가 맞았군.')), turn='daisen@berg_burned')
Q('mq16c', '16장 이십 년 전의 군령서 ③', M, 24, 'daisen@berg_burned', [boss('qb_ash_wraith', 'berg_burned', '재의 망령')],
  say(('다이센', '여기 묻힌 사람들이 아직 떠나지 못했다.')),
  say(('다이센', '재가 모이는 곳. 거기다.')),
  say('영주들이 모인 회당에서 아스텔은 다이센 앞에 무릎을 꿇었다.', ('아스텔', '아버지의 죄를 제가 짊어지겠습니다. 전쟁이 끝나면 베르그 고원을 돌려드리겠습니다.'), ('다이센', '왕족이 무릎 꿇는 건 처음 본다. 용서한 건 아니다. 다만 그 고문놈의 목은 내가 챙겨야겠군.')))
# ---- 17장
Q('mq17a', '17장 사만의 깃발 ①', M, 23, 'daisen@berg_burned', [talk('derkai@silvern', '실베른 영주 데르카이 만나기')],
  say(('치르젠', '마지막은 실베른입니다. 데르카이 영주는 망설이는 분이지요.')), say(('치르젠', '실베른은 남서쪽입니다.')),
  say(('치르젠', '지금 우리를 돕지 않으시면, 다음 지도에는 실베른이 칠해집니다.'), ('데르카이', '…이틀만 주시오. 그 사이 우리 영지를 노리는 암살단부터 처리해 준다면.')))
Q('mq17b', '17장 사만의 깃발 ②', M, 24, 'derkai@silvern', [gather('qi_assassin_trace', 4, 'silvern_marsh', '습지의 암살단 흔적'), boss('qb_assassin_lord', 'silvern_marsh', '검은 깃의 수장')],
  say(('데르카이', '현상금을 노린 \'검은 깃\'이 습지에 숨어 있소.')), say(('라엘', '습지는 영지 남쪽이야.')),
  say(('데르카이', '…군대를 내드리겠소.')))
Q('mq17c', '17장 사만의 깃발 ③', M, 24, 'derkai@silvern', [talk('kerin@baltern', '발테른에 모인 연합군에게 가기')],
  say(('데르카이', '발테른 바위산 아래 모이기로 했다지요.')), say(('치르젠', '발테른으로.')),
  say('두 달 뒤, 발테른의 바위산 아래에 사만의 병력이 모였다.', ('케린', '그레이스의 군대는 십만이다. 전쟁은 숫자로만 하는 게 아니지만, 숫자를 잊어도 안 된다.')))
# ---- 3막 수도 평원의 비가: 18장
Q('mq18a', '18장 국경의 성채들 ①', M, 24, 'kerin@baltern', [visit('capital_plain', '수도 앞 평원으로 진군'), kill('mon_soldier', 8, '성채의 검은 눈 병사')],
  say(('케린', '국경 성채들부터 항복시킨다.')), say(('케린', '수도 앞 평원은 왕도 남쪽이다.')),
  say(('아스텔', '항복한 병사들의 눈이… 하나같이 텅 비어 있어.')), turn='astel@capital_plain')
Q('mq18b', '18장 국경의 성채들 ②', M, 25, 'astel@capital_plain', [boss('qb_fort_warden', 'capital_plain', '검은 사슬의 수문장')],
  say(('아스텔', '마지막 성채의 수문장만 남았어.')), say(('카일러스', '사슬을 두른 기사입니다.')),
  say(('수문장', '…폐하께… 영광을….'), ('카스티야', '가슴에 검은 가시가 박혀 있었어.')))
# ---- 19장
Q('mq19a', '19장 검은 눈의 병사들 ①', M, 26, 'astel@capital_plain', [gather('qi_shadow_hole', 6, 'capital_plain', '그림자 구멍 정화'), kill('mon_blackeye_wolf', 8, '검은 눈 늑대')],
  say(('그레이스', '이번에는 제 뜻을 보여 드리죠.'), '평원의 땅에서 그림자들이 솟아났다. 쓰러진 연합군 병사들이 검은 눈을 뜬 채 일어난다.'),
  say(('아스텔', '쓰러진 자리의 구멍을 막아! 하나가 쓰러질 때마다 적이 하나씩 는다!')),
  say(('아스텔', '성문으로 간다.')))
Q('mq19b', '19장 검은 눈의 병사들 ②', M, 27, 'astel@capital_plain', [boss('qb_grace_1', 'capital_plain', '그레이스에게서 30초 버티기')],
  say(('아스텔', '너는 조종당하고 있어, 그레이스!'), ('그레이스', '형님은 언제나 그렇죠. 제가 무엇을 하든 제 뜻일 리 없다고.')),
  say('손가락 하나로 번개를 되받아 낸다. 이길 수 없다. 버텨야 한다.'),
  say(('아스텔', '돌아와, 그레이스…….'), '그레이스의 눈동자가 잠시 푸르게 흔들렸다가 다시 검게 덮였다.', ('케린', '퇴각하라!')), turn='kerin@capital_plain')
# ---- 20장
Q('mq20a', '20장 노기사의 마지막 돌격 ①', M, 27, 'kerin@capital_plain', [kill('mon_soldier', 10, '퇴각로의 추격병')],
  say(('케린', '부상병을 강가로 보내라. 내가 기병 오백으로 막는다.')), say(('케린', '뒤돌아보지 마라.')),
  say('케린이 검을 휘두를 때마다 기이한 바람이 불었다. 그림자들이 바람에 흩어졌다.'), turn='castilla@capital_plain')
Q('mq20b', '20장 노기사의 마지막 돌격 ②', M, 28, 'castilla@capital_plain', [boss('qb_shadow_general', 'capital_plain', '그림자 추격 장군')],
  say(('카스티야', '케린 경이 저 장군과 싸우고 있어! 같이 가!')), say(('카스티야', '서둘러!')),
  say('저물녘, 가슴에 검은 창이 세 개 박힌 노인이 쓰러져 있었다.', ('케린', '삼십 년 전 지라트에서 주운 검이다. 바람의 조각이 깃들어 있지. 이 검은 늘 활이 되고 싶어 했다.'), ('케린', '그 애송이를 부탁한다. 살아남는 것도 싸움이라고 전해라.'), '칼날이 활대가 되고, 바람이 시위가 되었다. 풍령궁(風靈弓).'))
# ---- 21장
Q('mq21a', '21장 무너진 다리 ①', M, 28, 'castilla@capital_plain', [visit('broken_bridge', '강변의 다리로'), kill('mon_crab', 8, '강변 바위게')],
  say(('카스티야', '카일러스가 전하를 업고 다리로 갔어.')), say(('카스티야', '강변은 평원 남쪽이야.')),
  say(('카일러스', '카스티야, 전하를 루미에르로.')), turn='kylus@broken_bridge')
Q('mq21b', '21장 무너진 다리 ②', M, 30, 'kylus@broken_bridge', [boss('qb_bridge_chaser', 'broken_bridge', '다리 앞 추격군 대장')],
  say(('카스티야', '같이 가자고 했잖아!'), ('카일러스', '누군가는 남아야 한다. 그게 호위기사의 일이야.')),
  say(('카일러스', '대장을 쓰러뜨리면 다리를 무너뜨리겠다.')),
  say('방패가 버팀목을 내리찍었다. 다리가 무너지며 흙탕물 속으로 푸른 망토가 가라앉았다.', '사만 중 절반 이상이 돌아오지 못했다. 혼란 속에서 카스티야와도 길이 갈렸다.', ('아스텔', '…….')), turn='astel@broken_bridge')
# ---- 22장
Q('mq22a', '22장 다시 일어서는 손', M, 30, 'astel@broken_bridge', [job('tier2', '아르칸 마을 마스터의 2차 전직 시험 통과'), have('c_potion_m', 5, '아스텔의 오른팔에 쓸 회복 물약 5개')],
  say(('아스텔', '…나는 혼자 루미에르로 간다. 너는 잠시 고향에 다녀와. 물자가 필요해.'), '그날 밤 아스텔은 숲속에서 처음으로 소리 내어 울었다.'),
  say(('하람', '돌아왔구먼. 마스터들이 기다리고 있네. 더 깊은 기술이 필요할 때야.')),
  say(('하람', '이 약과 물건들은 왕자님께 꼭 전해 주게. 아르칸 마을도 할 수 있는 걸 하겠네.')), turn='elder@town')
# ---- 23장
Q('mq23a', '23장 불탄 순례지 ①', M, 30, 'elder@town', [visit('lumiere_ruins_field', '불탄 순례지로'), talk('ruin_monk@lumiere_ruins_field', '살아남은 수도사 찾기')],
  say(('하람', '루미에르 쪽 하늘이 붉다는 소식이야. 왕자님도 그리로 가셨다지?')), say(('하람', '평원 서쪽, 순례지로 가게.')),
  say(('유디트', '검은 로브의 노인이 직접 다녀갔어요. 대사제님은… 신전에.')))
Q('mq23b', '23장 불탄 순례지 ②', M, 31, 'ruin_monk@lumiere_ruins_field', [gather('qi_burning_shrine', 3, 'lumiere_ruins_field', '불타는 성소의 불 끄기'), kill('mon_lantern_ghost', 8, '등불 유령')],
  say(('유디트', '성소 세 곳이 아직 타고 있어요. 기록이 그 안에 있어요.')), say(('유디트', '부탁해요.')),
  say(('유디트', '고마워요… 이 기록들은 대사제님이 마지막까지 지키신 것이에요.')))
Q('mq23c', '23장 불탄 순례지 ③', M, 32, 'ruin_monk@lumiere_ruins_field', [boss('qb_fallen_paladin', 'lumiere_ruins_field', '타락한 순례 기사단장')],
  say(('유디트', '순례 기사단장님이… 검게 물든 채 길을 막고 계세요.')), say(('유디트', '신전으로 가는 길이에요.')),
  say(('아스텔', '…왔구나. 혼자서는 이 문 앞에 설 용기가 없었어.')), turn='astel@lumiere_ruins_field')
# ---- 24장
Q('mq24a', '24장 저스티나의 마지막 숨', M, 33, 'astel@lumiere_ruins_field', [boss('qb_justina', 'lumiere_ruins_field', '타락한 저스티나')],
  say(('저스티나', '두려움도 슬픔도 없는 곳으로 가시죠, 왕자님.'), ('아스텔', '자신을 잃는 것이 어떻게 평화입니까!')),
  say(('아스텔', '번개가 저 검은 기운을 흔들 때까지….')),
  say('은빛 눈동자가 돌아왔다.', ('저스티나', '그레이스 왕자님 가슴에는 왕비님이 남긴 \'생명\'의 조각이 있습니다. 왕자님을 베면 흑룡은 그릇을 잃지만, 아르칸의 다섯째 힘도 영원히 사라집니다.'), ('저스티나', '발타자르… 그리고 대장장이 볼드란.'), '동생을 베면 세상을 구할 수 없다. 베지 않으면 동생이 흑룡이 된다.'))
# ---- 4막 동쪽의 불꽃: 25장
Q('mq25a', '25장 상인의 옷 ①', M, 31, 'astel@lumiere_ruins_field', [visit('trade_road', '동부 교역로로'), kill('mon_soldier', 6, '검문소의 검은 눈 병사')],
  say(('아스텔', '동쪽으로 간다. 상인으로 변장해야 해. 네가 만든 물건이라면 짐수레를 채우기에 충분하지.')),
  say(('아스텔', '교역로는 구릉지 동쪽이야.')), say(('아스텔', '마지막 검문소다. 창을 천으로 감싸 뒀는데….')), turn='astel@trade_road')
Q('mq25b', '25장 상인의 옷 ②', M, 33, 'astel@trade_road', [boss('qb_checkpoint', 'trade_road', '검문소 그림자 집행관')],
  say(('집행관', '그 짐 속의 창. 문양이 보이는군.')), say(('아스텔', '들켰다!')),
  say(('얀베르', '당신이 누구인지는 묻지 않겠습니다. 다만 그 창의 문양은 우리 왕실 기록에도 남아 있지요. 발타자르까지 모시겠습니다.')), turn='yanber@marseon')
# ---- 26장
Q('mq26a', '26장 마르세온의 기사단장 ①', M, 33, 'yanber@marseon', [gather('qi_supply_cache', 4, 'marseon_outskirts', '점령군 보급창 불태우기')],
  say(('얀베르', '떠나기 전에 점령군의 보급창을 태워 두지요. 외곽 강가에 있습니다.')), say(('얀베르', '장부부터 챙기십시오.')),
  say(('얀베르', '훌륭합니다.'), '그는 친절했고, 길을 잘 알았으며, 한 번도 등을 보이지 않았다.'))
Q('mq26b', '26장 마르세온의 기사단장 ②', M, 34, 'yanber@marseon', [boss('qb_marseon_guard', 'marseon_outskirts', '총독 근위대장')],
  say(('얀베르', '근위대장이 나루터를 막았습니다.')), say(('얀베르', '외곽 나루터입니다.')),
  say(('얀베르', '이제 발타자르로. 왕실 대장간의 에르딘이 기다립니다.')))
# ---- 27장
Q('mq27a', '27장 붉은숲 ①', M, 34, 'yanber@marseon', [talk('erdin@baltazar', '발타자르 대장간의 에르딘 만나기')],
  say(('얀베르', '광산길을 지나면 발타자르 왕도입니다.')), say(('얀베르', '광산길로.')),
  say(('에르딘', '스승님 볼드란이 붉은숲으로 사라졌어요. 분노의 피가 내리는 숲이에요.')))
Q('mq27b', '27장 붉은숲 ②', M, 35, 'erdin@baltazar', [visit('crimson_forest', '붉은숲으로'), gather('qi_hammer_mark', 4, 'crimson_forest', '볼드란의 망치 자국 따라가기'), kill('mon_salamander', 6, '불꽃 도롱뇽')],
  say(('에르딘', '스승님 망치는 자국이 독특해요. 세 갈래로 갈라져요.')), say(('에르딘', '마르세온 외곽에서 남쪽이에요.')),
  say(('아스텔', '숲이 사람을 화나게 한다. 다들 숨 고르고.')), turn='astel@crimson_forest')
Q('mq27c', '27장 붉은숲 ③', M, 36, 'astel@crimson_forest', [boss('qb_crystal_golem', 'crimson_forest', '붉은 수정 골렘')],
  say(('아스텔', '자국이 수정 골렘 앞에서 끊겼어.')), say(('아스텔', '부숴야 지나간다.')),
  say(('아스텔', '저 안쪽, 망치 소리가 들린다.')))
# ---- 28장
Q('mq28a', '28장 내가 만든 것들', M, 37, 'astel@crimson_forest', [kill('mon_crystal', 6, '붉은 수정 정령'), boss('qb_boldran', 'crimson_heart', '붉은 수정에 지배당한 볼드란')],
  say(('아스텔', '노인이 수정에 지배당한 채 망치를 휘두르고 있어. 죽이지 마.')), say(('아스텔', '숲 심부야.')),
  say(('볼드란', '내가 만든 무기가 너무 많은 사람을 죽였네. 그래서 도망쳤지.'), ('볼드란', '이번에는 내가 만든 것이 무언가를 지키는 데 쓰이게 하고 싶군. 불꽃의 조각은 발타자르 왕가의 능침 아래 있네.')), turn='boldran@crimson_heart')
# ---- 29장
Q('mq29a', '29장 병든 왕의 조건 ①', M, 37, 'boldran@crimson_heart', [boss('qb_dig_golem', 'baltazar_mines', '광산길의 크로이츠 굴착 골렘')],
  say(('볼드란', '왕도로 가세. 광산길이 막혔다더군.')), say(('볼드란', '광산길이야.')),
  say(('베리온', '아버지(헤델 국왕)의 조건입니다. 크로이츠 전선에서 싸우는 저를 먼저 도와 달라고.')), turn='berion@baltazar')
Q('mq29b', '29장 병든 왕의 조건 ②', M, 38, 'berion@baltazar', [kill('mon_lava_boar', 6, '보급로의 용암 멧돼지'), have('c_potion_m', 5, '전선에 보낼 회복 물약 5개')],
  say(('베리온', '전선에 보급품을 보내야 합니다.')), say(('베리온', '광산길의 멧돼지들이 수레를 뒤엎어요.')),
  say(('베리온', '이걸로 기병대가 한 번은 더 돌격할 수 있겠군요.')))
# ---- 30장
Q('mq30a', '30장 검은 창의 기사 ①', M, 38, 'berion@baltazar', [visit('north_canyon', '북쪽 협곡 전선으로'), gather('qi_collapse_mark', 3, 'north_canyon', '낙뢰로 무너뜨릴 지점 표시')],
  say(('베리온', '협곡을 무너뜨려 적의 보급로를 끊을 수 있다면….')), say(('아스텔', '표시만 해. 번개는 내가 떨어뜨린다.')),
  say('낙뢰가 협곡을 무너뜨렸다. 베리온의 기병대가 돌격한다.'), turn='berion@north_canyon')
Q('mq30b', '30장 검은 창의 기사 ②', M, 40, 'berion@north_canyon', [kill('mon_kreutz_wolf', 8, '전선의 북방 설원 늑대'), boss('qb_black_knight', 'kreutz_front', '검은 갑옷의 기사')],
  say(('베리온', '크로이츠 전선에 검은 갑옷의 기사가 나타났습니다. 창이 번개를 삼킨다고.')), say(('베리온', '전선은 협곡 북쪽입니다.')),
  say('마지막 충돌에 투구가 갈라졌다. 푸른 눈이었다.', ('아스텔', '……카일러스?'), '퇴각의 뿔나팔이 울렸고, 전령이 달려왔다. 국왕 헤델이 죽었다.'))
# ---- 31장
Q('mq31a', '31장 물든 왕궁', M, 40, 'berion@north_canyon', [kill('mon_armor', 6, '능침 입구의 수호 갑주'), boss('qb_tainted_queen', 'royal_tomb', '물든 왕비에게서 버티기')],
  say(('베리온', '왕궁 경비병들이 모두 검은 눈입니다. 어머니가… 저에게 검은 가시를 내밀었어요.'), ('볼드란', '능침 아래 저장고로 이어지는 비밀 통로를 아네.')),
  say(('베리온', '제가 자장가를 부르는 동안만 버텨 주십시오.')),
  say(('왕비', '가거라. 내가 다시 물들기 전에.'), '왕비는 목걸이를 풀어 아들의 손에 쥐어 주었다. 헤델의 입술은 보랏빛이었다. 병이 아니라 독이었다.'), turn='berion@baltazar')
# ---- 32장
Q('mq32a', '32장 능침의 배신 ①', M, 41, 'berion@baltazar', [boss('qb_tomb_guardian', 'royal_tomb', '능침의 고대 수호자')],
  say(('베리온', '인장, 목걸이, 그리고 왕가의 피. 세 문을 엽니다.')), say(('볼드란', '봉인의 틈을 찾았네. 수호자를 멈추게.')),
  say('제단 위에서 붉은 불꽃을 품은 검 한 자루가 드러났다. 그 순간 뒤에서 박수가 들렸다.'), turn='boldran@royal_tomb')
Q('mq32b', '32장 능침의 배신 ②', M, 43, 'boldran@royal_tomb', [boss('qb_yanber', 'royal_tomb', '배신자 얀베르')],
  say(('얀베르', '세 개의 문은 왕가가, 그 안의 봉인은 아르칸의 계승자만 열 수 있었지. 그래서 당신을 모셔 온 겁니다.'), ('얀베르', '헤델의 잔에 독을 탄 것도 나요.')),
  say(('볼드란', '에르딘, 물러서!')),
  say('볼드란이 몸으로 막아섰다.', ('볼드란', '드디어…… 무언가를 지켰구먼.'), '베리온이 제단의 검을 뽑았다. 염룡검(炎龍劍). 한 번의 일격에 얀베르는 재가 되었다.'), turn='berion@royal_tomb')
# ---- 33장
Q('mq33a', '33장 다시 모인 사람들 ①', M, 43, 'berion@royal_tomb', [talk('castilla@baltazar', '발타자르 성문의 카스티야와 재회')],
  say(('베리온', '성문에 낯익은 깃발들이 왔다고 합니다.')), say(('베리온', '왕도로.')),
  say(('카스티야', '보았군요. 카일러스를.'), ('치르젠', '그라벨이 함락됐습니다. 아버지는 성문을 지키다…. 주민 삼만을 데리고 건너왔습니다.')))
Q('mq33b', '33장 다시 모인 사람들 ②', M, 44, 'castilla@baltazar', [drop('qi_ice_steel', 5, ['mon_kreutz_wolf', 'mon_yeti', 'mon_ram_king'], 0.45, '크로이츠 설원의 얼음 강철'), boss('qb_frost_giant', 'kreutz_snowfield', '설원의 서리 거인')],
  say(('에르딘', '다이센 씨의 철퇴… 머리가 돌이 아니라 아르칸의 비늘이에요! 낡은 껍질을 벗기려면 얼음 강철이 필요해요.')),
  say(('카스티야', '설원은 크로이츠 국경 요새 너머야.')),
  say('에르딘의 망치가 낡은 껍질을 벗겨 내자 산악추(山嶽錘)가 깨어났다.', '번개, 불꽃, 바람, 대지. 네 개의 힘이 모였다. 다섯째는 지라트로 향하는 왕의 가슴속에 있었다.'), turn='erdin@baltazar')
# ---- 5막 흑룡의 계절: 34장
Q('mq34a', '34장 두 번째 진군 ①', M, 44, 'erdin@baltazar', [talk('chirzen@capital_plain', '평원 진영의 작전 회의')],
  say(('에르딘', '연합군이 다시 카이리온으로 진군한대요.')), say(('카스티야', '평원 진영으로.')),
  say(('치르젠', '이번에는 정면으로 부딪치지 않습니다. 데르카이 영주가 서쪽에서 끌어내고, 베리온 전하가 동쪽 성벽을 태웁니다.')))
Q('mq34b', '34장 두 번째 진군 ②', M, 45, 'chirzen@capital_plain', [gather('qi_oil_barrel', 4, 'capital_plain', '동쪽 성벽 아래 기름통 놓기'), kill('mon_soldier', 10, '유인된 그림자 부대'), boss('qb_siege_beast', 'capital_plain', '그림자 공성 거수')],
  say(('치르젠', '기름통을 성벽 아래 네 곳에. 그리고 공성 거수를 쓰러뜨려야 합니다.')), say(('치르젠', '동쪽 성벽입니다.')),
  say('그리고 모두가 예상하지 못한 일이 일어났다. 수도의 정문이 안에서 열렸다.'))
# ---- 35장
Q('mq35a', '35장 안에서 열린 문', M, 46, 'chirzen@capital_plain', [kill('mon_blackeye_wolf', 8, '정문 앞 검은 눈 늑대'), boss('qb_palace_captain', 'capital_plain', '왕궁 그림자 근위대장')],
  say(('치르젠', '문을 연 것은 로데릭 근위대장입니다! 방어병들이 그를 노립니다!')), say(('카스티야', '정문으로!')),
  say(('로데릭', '그날 밤 저는 보았습니다. 폐하는 그레이스 왕자님을 신전에 넘기려 한 것이 아니었습니다. 데리고 도망치려 하셨습니다. 왕관도 나라도 버리고요.'), '로데릭은 눈을 감았다. 왕궁은 비어 있었다. 그레이스는 이미 지라트로 떠난 뒤였다.'), turn='astel@kairion_capital')
# ---- 36장
Q('mq36a', '36장 회색 황무지 ①', M, 44, 'astel@kairion_capital', [talk('yoisen@gravel', '폐허가 된 그라벨의 요이센 찾기')],
  say(('아스텔', '지라트의 마지막 길을 아는 사람은 하나뿐이야.')), say(('아스텔', '그라벨로.')),
  say(('요이센', '이 일이 끝나면 다시는 지라트에 들어가지 않을 거야. 그러니까 이번엔 제대로 가자.')))
Q('mq36b', '36장 회색 황무지 ②', M, 46, 'yoisen@gravel', [visit('zirat_wastes', '회색 황무지로'), kill('mon_void_toad', 8, '공허 두꺼비'), boss('qb_executioner', 'zirat_wastes', '사브낙 교단 집행자')],
  say(('요이센', '동지의 밤까지 사흘. 교단이 제물을 끌고 가고 있어.')), say(('요이센', '외곽 황무지 남쪽이야.')),
  say(('요이센', '포로들은 그라벨로 보냈어. 이제 심연이야.')), turn='yoisen@zirat_wastes')
# ---- 37장
Q('mq37a', '37장 심연의 가장자리 ①', M, 46, 'yoisen@zirat_wastes', [gather('qi_altar_core', 5, 'zirat_abyss_rim', '교단 제단 다섯 곳 부수기'), kill('mon_bat', 10, '심연 박쥐')],
  say(('요이센', '심연을 둘러싼 제단 다섯 곳. 다이센이 길을 만들고, 카스티야가 먼 제단을 맞힌다. 넌 핵을 떼어 내.')), say(('다이센', '길은 내가 연다.')),
  say(('아스텔', '다섯째 제단… 저 눈이 다시 떴어.')), turn='astel@zirat_abyss_rim')
Q('mq37b', '37장 심연의 가장자리 ②', M, 47, 'astel@zirat_abyss_rim', [boss('qb_sabnak_eye', 'zirat_abyss_rim', '사브낙의 눈')],
  say(('사브낙의 눈', '……아르칸.'), ('아스텔', '이번엔 도망치지 않는다.')), say(('카스티야', '눈동자를 노려!')),
  say(('요이센', '다리가 보여. 심연 위에 걸린 검은 돌다리.')))
# ---- 38장
Q('mq38a', '38장 심연의 검은 다리 ①', M, 48, 'astel@zirat_abyss_rim', [visit('abyss_bridge', '심연의 검은 다리로'), kill('mon_abyss_drake', 4, '심연 비룡')],
  say(('아스텔', '다리 위에… 누군가 서 있어.')), say(('요이센', '마지막 길이야.')),
  say(('카스티야', '…카일러스.'), '카스티야가 활을 들었다가 내렸다.'), turn='castilla@abyss_bridge')
Q('mq38b', '38장 심연의 검은 다리 ②', M, 49, 'castilla@abyss_bridge', [boss('qb_kylus', 'abyss_bridge', '흑기사 카일러스 (번개 없이 검으로)')],
  say(('아스텔', '너에게는 이 창을 쓰지 않겠다. 너한테 검을 배운 대로 싸우겠다.')), say(('카스티야', '다리 양쪽의 그림자는 우리가 막을게.')),
  say(('카일러스', '저는 전하를 지키지 못했습니다. 그래서 전하가 없는 세상이라도 지키려 했습니다.'), '심연에서 그림자의 창이 솟구쳤다. 카일러스는 생각할 것도 없이 아스텔을 밀어냈다.', ('카일러스', '이번엔…… 제대로 지켰죠.'), '카스티야는 울지 않았다. 대신 활을 들어 심연을 겨눴다.'), turn='astel@abyss_bridge')
# ---- 39장
Q('mq39a', '39장 스물일곱', M, 49, 'astel@abyss_bridge', [boss('qb_malachion', 'abyss_bridge', '말라키온')],
  say(('말라키온', '나는 삼천 명의 손을 잡았소. 스물일곱이 살았지. 남은 이들에게 나는 마지막까지 희망을 말했소. 그것만큼 잔인한 거짓말은 없었다는 걸 모르시오?'), ('아스텔', '스물일곱은 살았습니다. 당신은 그 사람들을 세지 않았을 뿐입니다.')),
  say('네 개의 유물이 동시에 빛난다.'),
  say(('말라키온', '저스티나가…… 어떻게 죽었소?'), ('아스텔', '우리가 지키려는 세계를 당신에게 맡기지 않겠다며 죽었습니다.'), ('말라키온', '그 애다운 말이군.'), '그가 무너지는 순간, 의식은 이미 끝나 있었다. 제단 위의 그레이스가 눈을 떴다. 두 눈 모두 칠흑이었다.'))
# ---- 40장
Q('mq40a', '40장 별을 잇는 자 ①', M, 50, 'astel@abyss_bridge', [boss('qb_sabnak_grace', 'abyss_bridge', '사브낙-그레이스')],
  say(('아스텔', '그레이스. 형이 왔다.')), say('사브낙의 숨결이 심연을 채운다.'),
  say('아스텔은 어느 도서관에 서 있었다. 책상 밑에 어린 그레이스가 웅크리고 있었다.', ('그레이스', '형, 그날 밤 아버지가 뭐라고 했는지 알아? \'미안하다\'였어.'), ('아스텔', '나는 너를 한 번도 제대로 보지 않았다. 그건 내 죄다.'), '오른손의 문양이 금빛에서 별빛으로 바뀌었다. 천 년 전의 목소리가 그의 진짜 이름을 불렀다. 아스테리온.', ('아스텔', '이번엔 내가 네 뒤를 따라갈 차례다. 가서 살아. 네 눈으로, 네 뜻대로.'), '하얀 빛이 지라트를 삼켰다. 검은 심장이 다시 멈췄다.'))
Q('mq40b', '40장 별을 잇는 자 ② (에필로그)', M, 50, 'castilla@abyss_bridge', [talk('elder@town', '1년 뒤, 아르칸 마을로 돌아가기')],
  say(('카스티야', '…돌아가자. 전하가 지킨 세상으로.')), say(('카스티야', '아르칸 마을로.')),
  say('일 년 뒤. 카이리온의 왕좌는 비어 있다. 그레이스는 섭정으로만 나라를 다스리며 왕관을 쓰지 않았다. 처음 한 일은 베르그 고원을 다이센에게 돌려주는 문서에 서명하는 것이었다.',
      '카스티야는 지라트의 심연이 있던 자리에 섰다. 회색 흙 위에 비전창이 꽂혀 있고, 그 밑에 하얀 꽃 한 송이가 피어 있었다.', ('카스티야', '오늘은 제가 먼저 발견했습니다, 전하.'),
      '그리고 같은 밤, 북방 크로이츠 제국의 얼어붙은 호수 밑에서, 두 번째 검은 맥박이 뛰기 시작했다. — 『아르칸 연대기』 본편 끝'))

# ===================================================================================== SUB (S05~S52, 기존 S01~S04 = q3_slime q4_spore q6_golem q5_gear)
S = 'sub'
def SQ(qid, name, lv, giver, objs, offer, done, opens, turn=None, items=None):
    Q(qid, name, S, lv, giver, objs, offer, say('목표를 마치고 돌아오면 됩니다.'), done, turn=turn, prereq=[opens] if isinstance(opens, str) else opens, items=items)
SQ('qs05', '길가의 굴착꾼', 2, 'merchant@town', [kill('mon_mole', 8, '흙두더지'), drop('qi_snail_shell', 5, ['mon_snail'], 0.6, '이끼 달팽이 껍데기')],
   say(('모아', '짐수레 길을 두더지들이 다 파헤쳐 놨어! 달팽이 껍데기는 포장재로 딱이고.')), say(('모아', '고마워! 이제 수레가 덜컹거리지 않겠어.')), 'mq01a')
SQ('qs06', '걷는 나무들', 4, 'capital_cook@kairion_capital', [kill('mon_sapling', 5, '걷는 묘목'), kill('mon_stumpling', 5, '걷는 그루터기'), drop('qi_honey', 5, ['mon_hornet'], 0.55, '왕벌 꿀')],
   say(('곤', '수확제 요리에 꿀이 모자라! 사냥터 숲의 걷는 나무들이 벌통을 다 엎었다고.')), say(('곤', '이 꿀이면 왕도 최고의 파이를 굽지!')), 'mq02a')
SQ('qs07', '딱정벌레 껍질', 6, 'master_blacksmith@town', [drop('qi_beetle_shell', 6, ['mon_beetle'], 0.55, '뿔 딱정벌레 껍질'), drop('qi_turtle_moss', 3, ['mon_turtle'], 0.5, '이끼 거북 등딱지')],
   say(('철산', '구릉지 딱정벌레 껍질은 방패에 덧대기 좋지.')), say(('철산', '좋아, 이걸로 방패 몇 개는 더 만들겠군.')), 'mq04a', items=[('a_armor_2', 1)])
SQ('qs08', '달빛 늑대의 밤', 7, 'guard@town', [kill('mon_wolf', 8, '달빛 늑대')],
   say(('도윤', '밤마다 달빛 늑대가 마을까지 내려와. 숲과 구릉지의 늑대를 줄여 줘.')), say(('도윤', '오늘 밤은 다들 푹 자겠군.')), 'mq05a')
SQ('qs09', '고블린 광부 쫓기', 7, 'baltern_merchant@baltern', [kill('mon_goblin_miner', 8, '고블린 광부'), drop('qi_stolen_pick', 4, ['mon_goblin_miner'], 0.5, '훔친 곡괭이')],
   say(('오린', '고갯길 고블린들이 우리 곡괭이를 다 훔쳐 갔어.')), say(('오린', '찾아 줬구나! 다음엔 싸게 팔게.')), 'mq06a')
SQ('qs10', '매의 둥지', 9, 'baltern_captain@baltern', [kill('mon_hawk', 6, '바위산 매'), drop('qi_gargoyle_feather', 5, ['mon_gargoyle'], 0.5, '아기 가고일 깃')],
   say(('가론', '절벽길 매들이 전령을 덮친다. 가고일 깃은 화살 깃으로 쓰고.')), say(('가론', '이제 전령이 무사히 오가겠어.')), 'mq07a')
SQ('qs11', '채석장 다시 열기', 10, 'baltern_captain@baltern', [kill('mon_armadillo', 8, '바위 아르마딜로'), gather('qi_quarry_stone', 10, 'baltern_quarry', '채석장 돌')],
   say(('가론', '피난민 숙소를 고칠 돌이 필요해. 채석장 아르마딜로들이 길을 막고 있어.')), say(('가론', '이걸로 지붕을 올리겠어.')), 'mq08a')
SQ('qs12', '안개 두꺼비의 독샘', 11, 'baltern_herbalist@baltern', [drop('m_toad_gland', 6, ['mon_fog_toad'], 0.6, '안개 두꺼비 독샘')],
   say(('미르', '안개 골짜기 두꺼비 독샘으로 해독제를 만들어요.')), say(('미르', '해독제 몇 병 드릴게요.')), 'mq08a', items=[('c_antidote', 5)])
SQ('qs13', '대나무 도둑', 14, 'master_cook@town', [kill('mon_panda', 6, '대나무 팬더'), gather('qi_bamboo', 8, 'mist_valley', '도둑맞은 죽순')],
   say(('금강', '안개 골짜기 팬더들이 죽순을 다 가져갔어! 봄 요리에 꼭 필요한데.')), say(('금강', '오늘 저녁은 죽순 볶음이다!')), 'mq09a')
SQ('qs14', '안개골의 왕', 18, 'baltern_captain@baltern', [kill('mon_mist_wolf', 10, '안개 늑대'), kill('mon_mist_bear', 1, '안개골 우두머리 곰 (정예)')],
   say(('가론', '고갯길 상인을 습격하는 우두머리 곰이 있다. 늑대 무리를 거느리고.')), say(('가론', '이제 고갯길에 상인들이 돌아오겠군.')), 'mq13a', items=[('ac_ring_3', 1)])
SQ('qs15', '요정의 장난', 10, 'lumiere_pilgrim@blue_forest_edge', [gather('qi_pilgrim_lamp', 6, 'blue_forest_edge', '요정이 훔친 순례 등불'), kill('mon_blue_jelly', 8, '푸른숲 젤리')],
   say(('티아', '장난꾸러기 요정들이 등불을 훔쳐 갔어요. 등불 없이는 순례를 못 해요.')), say(('티아', '찾아 주셨군요! 이제 길을 밝힐 수 있어요.')), 'mq09a')
SQ('qs16', '별빛 사슴의 뿔', 13, 'lumiere_monk@lumiere', [gather('qi_deer_antler', 5, 'blue_forest', '별빛 사슴이 떨어뜨린 뿔 (사슴은 해치지 않기)')],
   say(('세오', '성수를 담는 단지는 별빛 사슴의 뿔로 만들어요. 떨어진 뿔만 주워 오세요.')), say(('세오', '고맙습니다. 회복 물약을 몇 병 드리지요.')), 'mq10a', items=[('c_potion_m', 5)])
SQ('qs17', '등불 유령 잠재우기', 15, 'lumiere_monk@lumiere', [kill('mon_lantern_ghost', 8, '등불 유령'), drop('qi_spider_silk', 5, ['mon_spider'], 0.55, '숲거미 영령의 실')],
   say(('세오', '디고나가 사라진 뒤 고목지에 등불 유령이 떠돌아요.')), say(('세오', '넋들이 조금은 편해졌을 거예요.')), 'mq11b')
SQ('qs18', '순례길 정리', 13, 'lumiere_priest@lumiere', [kill('mon_mist_fox', 6, '안개 여우'), kill('mon_owl', 6, '밤 부엉이')],
   say(('베른', '순례길에 짐승이 늘었습니다. 순례자들이 다닐 수 있게 해 주십시오.')), say(('베른', '루미에르가 감사드립니다.')), 'mq12a')
SQ('qs19', '사라진 양떼 ① 들판의 도깨비불', 14, 'shepherd_wife@silvern', [kill('mon_wisp', 8, '습지 도깨비불')],
   say(('네아', '밤마다 도깨비불이 양떼를 들판 밖으로 홀려 가요. 그이도 양을 찾으러 나갔다가….')), say(('네아', '이 양털… 우리 양들 거예요. 그이는요?')), 'mq13a', items=[('qi_sheep_wool', 3)])
SQ('qs20', '사라진 양떼 ② 양치기의 피리', 15, 'shepherd_wife@silvern', [gather('qi_shepherd_item', 3, 'silvern_woods', '양치기의 피리·모자·지팡이'), kill('mon_bog_boar', 6, '늪 멧돼지')],
   say(('네아', '그이는 남쪽 숲으로 갔을 거예요. 피리를 늘 갖고 다녔어요.')), say(('네아', '피리… 그이 거예요. 늑대 굴 쪽으로 간 것 같대요.')), 'qs19')
SQ('qs21', '사라진 양떼 ③ 늑대 굴', 16, 'silvern_hunter@silvern', [kill('mon_mist_wolf', 10, '남쪽 숲 안개 늑대'), drop('qi_owl_feather', 5, ['mon_owl'], 0.55, '밤 부엉이 깃털 (밤길 표식)')],
   say(('라엘', '늑대 굴은 남쪽 숲 깊은 곳이야. 부엉이 깃털로 길 표시를 하며 들어가자.')), say(('토빈', '살았다… 다리를 다쳐서 굴에 갇혀 있었어. 양들은 습지로 몰려갔어.')), 'qs20', turn='shepherd@silvern')
SQ('qs22', '사라진 양떼 ④ 습지의 우두머리', 18, 'shepherd@silvern', [kill('mon_fog_toad', 6, '안개 두꺼비'), kill('mon_mist_bear', 1, '양떼를 몰아넣은 안개골 우두머리 곰 (정예)')],
   say(('토빈', '습지 우두머리 곰이 양떼를 몰아넣었어. 피리를 불면 양들은 돌아올 거야.')), say(('토빈', '양들이 돌아왔어! 데르카이 영주님께도 네 이야기를 해 두지.')), 'qs21', items=[('a_armor_3', 1)])
SQ('qs23', '모래 전갈의 독', 16, 'gravel_pharmacist@gravel', [drop('qi_scorpion_tail', 8, ['mon_scorpion'], 0.6, '모래 전갈 꼬리')],
   say(('오나', '국경 수비대용 해독제가 모자라요. 전갈 꼬리가 재료예요.')), say(('오나', '해독제를 넉넉히 드릴게요.')), 'mq13a', items=[('c_antidote', 5)])
SQ('qs24', '사라진 마을의 유품', 18, 'gravel_refugee@gravel', [kill('mon_wraith', 8, '그림자 망령'), gather('qi_keepsake', 6, 'lost_villages', '가족의 유품')],
   say(('한스', '우리 마을은… 지도에서 지워졌습니다. 유품이라도 찾아 주세요.')), say(('한스', '어머니의 빗… 고맙습니다.')), 'mq13b')
SQ('qs25', '요이센의 돌무더기', 20, 'yoisen@gravel', [gather('qi_cairn', 5, 'zirat_outskirts', '안전한 길에 돌무더기 표식 쌓기'), kill('mon_scorpion', 6, '모래 전갈')],
   say(('요이센', '안전한 길에 표식을 남겨 두자. 언젠가 다시 들어가야 할지도 몰라.')), say(('요이센', '좋아. 이 표식, 나중에 쓸 일이 있을 거야.')), 'mq14a')
SQ('qs26', '큰뿔양의 뿔', 19, 'daisen@berg_burned', [drop('qi_ram_horn', 6, ['mon_canyon_ram'], 0.55, '협곡 큰뿔양의 뿔')],
   say(('다이센', '철퇴 손잡이를 다시 감아야 한다. 할아버지는 큰뿔양 뿔을 썼지.')), say(('다이센', '…할아버지가 처음 이 철퇴를 쥐여 주던 날이 생각나는군.')), 'mq16b')
SQ('qs27', '겨울 가죽', 21, 'chirzen@gravel', [kill('mon_berg_bear', 6, '베르그 고원 곰'), kill('mon_scorpion', 6, '모래 전갈')],
   say(('치르젠', '연합군 겨울 외투가 모자랍니다. 고원 곰 가죽을 부탁드립니다.')), say(('치르젠', '사만 명이 겨울을 날 수 있겠군요.')), 'mq16a')
SQ('qs28', '재 속의 씨앗', 22, 'daisen@berg_burned', [kill('mon_wraith', 6, '그림자 망령'), gather('qi_barley_seed', 5, 'berg_burned', '타지 않은 고원 보리 씨앗')],
   say(('다이센', '전쟁이 끝나면 고원을 돌려받는다지. 그럼 심을 게 있어야지.')), say(('다이센', '…보리밭이 다시 생기겠군.')), 'mq16c')
SQ('qs29', '고원의 겨울 준비 ① 산양 털', 23, 'master_hairdresser@town', [drop('m_frost_horn', 4, ['mon_frost_ram'], 0.6, '서리뿔 조각'), kill('mon_frost_ram', 10, '서리뿔 산양 (털 깎기)')],
   say(('리라', '연합군 방한복을 만들어요. 서리 고원 산양 털이 최고예요.')), say(('리라', '이걸로 따뜻한 망토를 지을게요.')), 'mq18a')
SQ('qs30', '고원의 겨울 준비 ② 얼음꽃 연고', 26, 'master_pharmacist@town', [kill('mon_ice_fox', 6, '얼음꽃 여우'), gather('qi_ice_flower', 5, 'frost_highland', '얼음꽃')],
   say(('소연', '왕자님 오른팔 화상에는 얼음꽃 연고가 들어요.')), say(('소연', '연고 완성! 다음에 왕자님을 만나면 꼭 전해 줘요.')), 'qs29')
SQ('qs31', '고원의 겨울 준비 ③ 오두막 습격', 29, 'highland_hunter@frost_highland', [kill('mon_snow_bear', 6, '설원 곰'), kill('mon_frost_wolf', 8, '서리 늑대')],
   say(('카야', '사냥꾼 오두막이 곰과 늑대에게 포위됐어!')), say(('카야', '살았어. 고원 깊은 곳의 산양왕 이야기 들어 봤어?')), 'qs30')
SQ('qs32', '고원의 겨울 준비 ④ 빙하뿔 산양왕', 33, 'highland_hunter@frost_highland', [kill('mon_ram_king', 1, '빙하뿔 산양왕 (정예)')],
   say(('카야', '산양왕의 뿔은 2차 직업 장인들이 탐내는 재료야.')), say(('카야', '전설로만 듣던 뿔이야. 가져가.')), 'qs31', items=[('m_glacier_horn', 2)])
SQ('qs33', '군량 사냥', 24, 'supply_officer@capital_plain', [kill('mon_blackeye_wolf', 10, '검은 눈 늑대'), drop('qi_boar_meat', 6, ['mon_dust_boar'], 0.6, '흙먼지 멧돼지 고기')],
   say(('브람', '사만 명이 먹는다. 하루에도 산 하나가 사라지지.')), say(('브람', '오늘 저녁은 고기다!')), 'mq18a')
SQ('qs34', '강에 떠내려간 것', 26, 'castilla@baltazar', [kill('mon_crab', 8, '강변 바위게'), gather('qi_cloak_scrap', 3, 'broken_bridge', '푸른 망토 조각·방패 장식')],
   say(('카스티야', '무너진 다리 강바닥에… 그 사람 물건이 남아 있을지도 몰라.')), say(('카스티야', '…방패 장식이야. 살아 있을 거야. 분명히.')), 'mq33a')
SQ('qs35', '꺼지지 않는 등불', 30, 'ruin_monk@lumiere_ruins_field', [kill('mon_lantern_ghost', 10, '등불 유령'), gather('qi_prayer_book', 4, 'lumiere_ruins_field', '타다 남은 기도서')],
   say(('유디트', '기도서라도 건져야 해요.')), say(('유디트', '대사제님의 일기 한 장이 끼어 있어요. \'오라버니, 돌아보지 않으셨지요\'….')), 'mq24a')
SQ('qs36', '검문을 피하는 뒷길', 28, 'marseon_merchant@marseon', [kill('mon_crab', 8, '강변 바위게'), kill('mon_soldier', 6, '검은 눈의 병사')],
   say(('카심', '교역로 뒷길을 열어 주면 물건을 더 들여놓을게.')), say(('카심', '이제 장사가 좀 되겠어.')), 'mq25b')
SQ('qs37', '무두장이의 주문', 29, 'tanner@marseon', [kill('mon_crimson_boar', 8, '붉은숲 멧돼지'), kill('mon_bog_boar', 6, '늪 멧돼지')],
   say(('도르', '좋은 가죽이 필요해. 외곽 멧돼지라면 딱이지.')), say(('도르', '좋은 가죽이야. 조끼 하나 지어 주지.')), 'mq26a', items=[('a_armor_2', 1)])
SQ('qs38', '단조 연료', 32, 'erdin@baltazar', [drop('qi_salamander_tail', 8, ['mon_salamander'], 0.6, '불꽃 도롱뇽 꼬리'), kill('mon_crimson_fox', 6, '핏빛 여우')],
   say(('에르딘', '대장간 화로가 식어 가요. 도롱뇽 꼬리가 최고의 연료예요.')), say(('에르딘', '화로가 다시 노래해요!')), 'mq27a')
SQ('qs39', '수정 정화', 34, 'boldran@crimson_heart', [kill('mon_crystal', 8, '붉은 수정 정령'), kill('mon_crimson_bear', 4, '붉은 수정 곰')],
   say(('볼드란', '숲을 이렇게 만든 건 내 수정이네. 정리하게 도와주겠나?')), say(('볼드란', '이건… 내가 만든 마지막 장신구일세. 받아 두게.')), 'mq28a', items=[('ac_ring_3', 1)])
SQ('qs40', '광부 조합의 부탁', 33, 'miner_chief@baltazar', [kill('mon_mine_golem', 8, '광산 바위정령'), kill('mon_lava_boar', 6, '용암 멧돼지')],
   say(('바르크', '광산길이 막히면 왕국의 화로도 식는다.')), say(('바르크', '광석 묶음을 가져가게.')), 'mq29a', items=[('m_lava_tusk', 3)])
SQ('qs41', '협곡의 아기 설인', 36, 'cavalry_captain@north_canyon', [kill('mon_yeti', 8, '아기 설인'), kill('mon_frost_ram', 6, '서리뿔 산양')],
   say(('레아', '설인 때문에 말들이 놀라서 큰일이야.')), say(('레아', '기병대가 다시 달릴 수 있겠어.')), 'mq30a')
SQ('qs42', '능침 순찰', 40, 'berion@baltazar', [kill('mon_armor', 6, '능침 수호 갑주'), kill('mon_tomb_golem', 6, '능침 수호석')],
   say(('베리온', '볼드란 공을 능침 안에 모시고 싶습니다. 길을 정리해 주십시오.')), say(('베리온', '…편히 쉬십시오, 공.')), 'mq32b', items=[('m_rune_shard', 3)])
SQ('qs43', '요새의 겨울 ① 피난 행렬', 37, 'kreutz_captain@kreutz_fort', [kill('mon_kreutz_wolf', 12, '북방 설원 늑대'), kill('mon_ice_fox', 6, '얼음꽃 여우')],
   say(('볼크', '전쟁을 피해 온 사람들이 요새로 온다. 늑대들이 행렬을 노려.')), say(('볼크', '행렬이 무사히 도착했다. 요새 상점을 열어 두지.')), 'mq30b')
SQ('qs44', '요새의 겨울 ② 장작과 고기', 39, 'kreutz_captain@kreutz_fort', [kill('mon_kreutz_wolf', 8, '북방 설원 늑대'), kill('mon_yeti', 6, '아기 설인'), gather('qi_frozen_wood', 10, 'kreutz_snowfield', '얼어붙은 장작')],
   say(('볼크', '장작과 고기가 없으면 이 겨울을 못 넘긴다.')), say(('볼크', '불을 피울 수 있겠어.')), ['qs43', 'mq33a'])
SQ('qs45', '요새의 겨울 ③ 호수의 울음', 42, 'fort_watch@kreutz_fort', [kill('mon_yeti', 8, '아기 설인'), kill('mon_snow_bear', 6, '설원 곰'), gather('qi_lake_ice', 5, 'frozen_lake', '호수 얼음 조각')],
   say(('일렉', '밤마다 호수 밑에서 소리가 울려. 얼음 조각을 가져와 줘.')), say(('일렉', '…얼음이 떨려. 심장 소리 같아.')), 'qs44')
SQ('qs46', '요새의 겨울 ④ 호수의 빙곰', 44, 'fort_watch@kreutz_fort', [kill('mon_lake_bear', 1, '호수의 빙곰 (정예)')],
   say(('일렉', '빙곰이 울음의 근원을 지키는 것 같아.')), say(('일렉', '빙곰 몸속에서 나온 검은 결정이야. 희미하게… 뛰고 있어.')), 'qs45', items=[('qi_black_crystal', 1)])
SQ('qs47', '아르칸의 잊힌 비문 ① 유적 입구', 38, 'ruin_monk@lumiere_ruins_field', [kill('mon_cinder_lizard', 10, '잿불 도마뱀'), gather('qi_rubbing', 3, 'dragon_ruins', '입구 석판 탁본')],
   say(('유디트', '대사제님이 찾던 기록이 용의 유적에 있대요.')), say(('유디트', '아르칸이 다섯 조각을 흩은 날의 기록이에요!')), ['qs35', 'mq30a'])
SQ('qs48', '아르칸의 잊힌 비문 ② 수호석의 비문', 41, 'ruin_monk@lumiere_ruins_field', [kill('mon_ruin_golem', 6, '유적 수호석'), drop('qi_epitaph', 5, ['mon_ruin_golem'], 0.6, '비문 조각')],
   say(('유디트', '수호석들이 비문을 품고 있어요.')), say(('유디트', '"다섯째 조각은 사람의 마음에 숨는다. 내어줄 수 있는 것도 마음뿐이다."')), 'qs47')
SQ('qs49', '아르칸의 잊힌 비문 ③ 비룡의 둥지', 44, 'erdin@baltazar', [kill('mon_ember_drake', 6, '불씨 비룡'), kill('mon_lava_boar', 8, '용암 멧돼지'), gather('qi_old_scale', 3, 'dragon_ruins', '오래된 용 비늘')],
   say(('에르딘', '비룡 둥지의 오래된 비늘로 무기를 강화할 수 있어요.')), say(('에르딘', '이 비늘… 아르칸의 것일지도 몰라요.')), 'qs48', items=[('m_drake_scale', 3)])
SQ('qs50', '아르칸의 잊힌 비문 ④ 용혈 비룡', 47, 'ruin_monk@lumiere_ruins_field', [kill('mon_drake_lord', 1, '용혈 비룡 (정예)')],
   say(('유디트', '유적의 주인, 용혈 비룡이 마지막 비문을 지키고 있어요.')), say(('유디트', '아르칸의 비늘로 만든 장신구예요. 가져가세요.')), 'qs49', items=[('m_dragon_heart', 1), ('ac_ring_3', 1)])
SQ('qs51', '황무지의 길', 40, 'yoisen@gravel', [kill('mon_void_toad', 8, '공허 두꺼비'), kill('mon_ash_drake', 4, '잿빛 비룡')],
   say(('요이센', '내가 쌓은 돌무더기를 황무지 안쪽까지 이어 두자.')), say(('요이센', '이제 심연까지 길이 보여.')), ['qs25', 'mq35a'])
SQ('qs52', '심연을 맴도는 것들', 45, 'chirzen@capital_plain', [kill('mon_bat', 12, '심연 박쥐'), kill('mon_abyss_drake', 4, '심연 비룡')],
   say(('치르젠', '연합군 퇴로를 확보해야 합니다.')), say(('치르젠', '퇴로가 열렸습니다.')), 'mq37a')

# ===================================================================================== build
def reward(q):
    L = max(1, min(50, q['lv'])); need = LEVELS[min(len(LEVELS) - 1, L - 1)]
    k = 0.30 if q['category'] == 'main' else 0.16
    exp = q['exp'] or int(round(need * k / 5) * 5)
    gold = (20 if q['category'] == 'main' else 12) * L
    items = [dict(id=i, count=n) for i, n in (q['items'] or [])]
    if not items: items = [dict(id='c_potion_s' if L < 10 else 'c_potion_m', count=3 if q['category'] == 'main' else 2)]
    return dict(exp=exp, gold=gold, items=items)

def spot_near(zid, spawn_id, k, taken):
    """NPC 자리: 도착 지점(spawn) 앞 3~4 m, 여러 명이면 옆으로. 소품·건물 피하기."""
    z = zone_def(zid); sp = None
    for s in z.get('spawns', []):
        if s['id'] == spawn_id: sp = s
    if sp is None: sp = next((s for s in z.get('spawns', []) if s['id'] in ('start',)), z['spawns'][0])
    x0, z0 = sp['pos']; yaw = math.radians(sp.get('rot', 0) or 0)
    fx, fz = math.sin(yaw), math.cos(yaw)
    # face inward: towards the zone centre if the spawn has no rotation
    if not sp.get('rot'):
        cx = (z['bounds'][0] + z['bounds'][2]) / 2; cz = (z['bounds'][1] + z['bounds'][3]) / 2
        d = math.hypot(cx - x0, cz - z0) or 1; fx, fz = (cx - x0) / d, (cz - z0) / d
    props = [(p['pos'][0], p['pos'][1], p.get('r', 1.0)) for p in z.get('props', []) if 'pos' in p and p.get('type') not in ('flowers', 'shrub', 'mushdecor', 'grass')]
    blds = [(b['pos'][0], b['pos'][1], max(b.get('w', 4), b.get('d', 4)) * 0.6) for b in z.get('buildings', []) if 'pos' in b]
    # 마을 장식(가로등·화단·분수 등, town3d): NPC가 가로등 기둥 속에 서서 가려지지 않게 (2026-11-11 왕도 요리사 곤)
    t3 = z.get('town3d') or {}
    for L in t3.get('lanterns') or []:
        if isinstance(L, list) and len(L) >= 2: blds.append((L[0], L[1], 1.2))
        elif isinstance(L, dict) and 'pos' in L: blds.append((L['pos'][0], L['pos'][1], 1.2))
    for d in t3.get('decor') or []:
        if isinstance(d, dict) and 'pos' in d: blds.append((d['pos'][0], d['pos'][1], d.get('r', 1.0) + 0.3))
    for n in z.get('npcs', []):
        if 'pos' in n: blds.append((n['pos'][0], n['pos'][1], 0.6))
    for ring in range(0, 8):
        for side in ([0, 1, -1, 2, -2, 3, -3] if ring == 0 else [1, -1, 2, -2, 3, -3, 4, -4]):
            dist = 3.5 + ring * 1.5; off = side * 1.6 + (k % 3) * 0.0
            x = x0 + fx * dist - fz * off; zz = z0 + fz * dist + fx * off
            if any(math.hypot(x - a, zz - b) < 0.9 for a, b in taken): continue
            if any(math.hypot(x - a, zz - b) < r + 0.9 for a, b, r in props + blds): continue
            bx0, bz0, bx1, bz1 = z['bounds']
            if not (bx0 + 3 < x < bx1 - 3 and bz0 + 3 < zz < bz1 - 3): continue
            taken.append((x, zz)); rot = math.degrees(math.atan2(-fx, -fz))
            return [round(x, 2), round(zz, 2)], round(rot, 1)
    taken.append((x0, z0)); return [round(x0 + fx * 3, 2), round(z0 + fz * 3, 2)], 0

# which spawn a placement stands near: the arrival from the previous story place if known
ARRIVE = {
    'kairion_hunt': 'from_kairion_capital', 'kairion_hills': 'from_kairion_capital', 'baltern_pass': 'from_mist_valley', 'blue_forest_edge': 'from_baltern_cliffs',
    'blue_forest': 'from_blue_forest_edge', 'blue_forest_heart': 'from_blue_forest', 'zirat_outskirts': 'from_gravel', 'berg_canyon': 'from_gravel_border',
    'berg_burned': 'from_berg_highland', 'capital_plain': 'from_kairion_capital', 'broken_bridge': 'from_capital_plain', 'lumiere_ruins_field': 'from_capital_plain',
    'trade_road': 'from_kairion_hills', 'marseon_outskirts': 'from_marseon', 'crimson_forest': 'from_marseon_outskirts', 'crimson_heart': 'from_crimson_forest',
    'north_canyon': 'from_baltazar', 'zirat_wastes': 'from_zirat_outskirts', 'zirat_abyss_rim': 'from_zirat_wastes', 'abyss_bridge': 'from_zirat_abyss_rim',
    'royal_tomb': 'from_baltazar', 'frost_highland': 'from_valley', 'forest': 'from_town', 'town': 'start',
}
def zone_npcs(zid): return {n['npc'] for n in zone_def(zid).get('npcs', [])}

def build():
    quests = load(D('quests.json')); npcs = load(D('npcs.json')); mons = load(D('monsters.json')); items = load(D('items.json'))
    keepq = [q for q in quests['quests'] if not re.match(r'^(mq|qs)\d', q['id'])]
    keepn = [n for n in npcs['npcs'] if not n.get('story')]; keepm = [m for m in mons['monsters'] if not m.get('story')]; keepi = [i for i in items['items'] if not i.get('story')]
    byid = {m['id']: m for m in keepm}; ibase = next(i for i in keepi if i['id'] == 'm_spore')
    creatures = set(re.findall(r"^  ([a-z_0-9]+):", open(os.path.join(ROOT, 'js', 'creature.js')).read(), re.M))
    # npcs
    newn = []
    for nid, (name, title, model, sheet, lines) in NPCS.items():
        newn.append(dict(id=nid, name=name, title=title, sheet=SHEET.get(sheet, sheet), model=model, role='guard', shop='', job='', lines=lines, story=True))
    # items
    newi = []
    for iid, (name, desc, icon) in ITEMS.items():
        it = json.loads(json.dumps(ibase)); it.update(id=iid, name=name, desc=desc, icon=icon, tier=1, price=0, sellPrice=0, story=True); newi.append(it)
    # bosses
    newm = []
    for mid, (name, lv, base, lk, extra) in BOSSES.items():
        b = json.loads(json.dumps(byid[base])); b.pop('_orig', None)
        assert lk['base'] in creatures, (mid, lk['base'])
        b.update(id=mid, name=name, level=lv, look=lk, questBoss=True, story=True, respawn=99999, drops=[dict(item='c_potion_m', chance=1.0, min=2, max=3)],
                 detectRange=max(b.get('detectRange', 7), 11), leashRange=40, goldMin=lv * 8, goldMax=lv * 14)
        b.update(extra); newm.append(b)
    # quests
    allq = {q['id']: q for q in keepq}
    out = []; prev = None; placements = {}
    item_ids = {i['id'] for i in keepi} | set(ITEMS); mon_ids = {m['id'] for m in keepm} | set(BOSSES); npc_ids = {n['id'] for n in keepn} | set(NPCS)
    for q in QUESTS:
        pre = q['prereq'] if q['prereq'] is not None else ([prev] if (q['category'] == 'main' and prev) else [])
        if q['category'] == 'main': prev = q['id']
        objs = []
        for o in q['objectives']:
            o = dict(o); at = o.pop('_at', None)
            if o['type'] == 'talk':
                assert o['target'] in npc_ids, o
                placements.setdefault((o['target'], at), []).append((q['id'], pre))
            if o['type'] == 'kill': assert o['target'] in mon_ids, o
            if o['type'] == 'collect': assert o['target'] in item_ids, o
            objs.append(o)
        for nid, zid in ((q['giver'], q['gz']), (q['turnIn'], q['tz'])):
            assert nid in npc_ids, (q['id'], nid)
            placements.setdefault((nid, zid), []).append((q['id'], pre))
        for r in (q['items'] or []): assert r[0] in item_ids, r
        for p in pre: assert p in allq or any(x['id'] == p for x in QUESTS), (q['id'], p)
        d = dict(id=q['id'], name=q['name'], category=q['category'], giver=q['giver'], turnIn=q['turnIn'], summary=objs[0]['text'] if len(objs) == 1 else ' · '.join(o['text'] for o in objs),
                 prereq=pre, minLevel=q['lv'], objectives=objs, reward=reward(q), consumeCollected=q['consume'],
                 offerText=q['offerText'], progressText=q['progressText'], completeText=q['completeText'], story=True)
        out.append(d)
    # story NPC placements: an NPC stands in a zone from the moment the first quest that needs it there becomes
    # available (its prereqs done) until the last such quest is handed in. NPCs already placed in the zone's data skip.
    order = {q['id']: i for i, q in enumerate(out)}
    story = []; taken = {}
    for (nid, zid), uses in placements.items():
        if nid in zone_npcs(zid): continue
        uses.sort(key=lambda u: order[u[0]])
        first_pre = uses[0][1]; last = uses[-1][0]
        frm = None
        if first_pre: frm = max(first_pre, key=lambda p: order.get(p, -1)) if any(p in order for p in first_pre) else first_pre[0]
        # sub-quest NPCs stay; main-story NPCs leave after their last scene there
        stay = all(next(x for x in out if x['id'] == u[0])['category'] == 'sub' for u in uses)
        pos, rot = spot_near(zid, ARRIVE.get(zid, 'start'), len(taken.setdefault(zid, [])), taken[zid])
        e = dict(npc=nid, zone=zid, pos=pos, rot=rot)
        if frm: e['from'] = frm
        if not stay: e['until'] = last
        story.append(e)
    # NPCs who leave the story (죽음·배신)
    for nid, zid, frm in [('justina', 'lumiere', 'mq24a'), ('yanber', 'marseon', 'mq32b'), ('roderick', 'kairion_capital', 'mq35a'), ('chirkai', 'gravel', 'mq33a'), ('kerin', 'baltern', 'mq20b')]:
        story.append(dict(npc=nid, zone=zid, hide=True, **{'from': frm}))
    # kerin is a quest giver in baltern until 18장; after his death 17c/18a are already done
    quests['quests'] = keepq + out; quests['storyNpcs'] = story
    npcs['npcs'] = keepn + newn; mons['monsters'] = keepm + newm; items['items'] = keepi + newi
    return quests, npcs, mons, items

if __name__ == '__main__':
    q, n, m, i = build()
    main = [x for x in q['quests'] if x.get('story') and x['category'] == 'main']; sub = [x for x in q['quests'] if x.get('story') and x['category'] == 'sub']
    print(f"main {len(main)} steps, sub {len(sub)} (+4 existing), npcs +{len(NPCS)}, bosses +{len(BOSSES)}, items +{len(ITEMS)}, story placements {len(q['storyNpcs'])}")
    if '--write' in sys.argv:
        for name, obj in (('quests', q), ('npcs', n), ('monsters', m), ('items', i)):
            json.dump(obj, open(D(name + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print('wrote quests / npcs / monsters / items.json')
