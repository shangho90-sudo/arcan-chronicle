"""용흔 대륙 world (2026-11-06, from the story doc 『아르칸 연대기 — 흑룡의 계절』): 8 story towns + 35 new fields
(40 fields with the 5 existing ones), links between them, monster variants, NPCs and the world map data.

Writes
  assets/data/world/<id>.json   full zone def of every new town / field (with its zone mesh in "mesh"); zones.json only
                                keeps a stub {id, name, kind, file, map, level, region, biome} so the start-up download
                                stays small and a zone is fetched when it is entered (js/game.js buildZone)
  assets/data/zones.json        stubs + "world" (regions, links) + map / level / portal additions to the existing zones
  assets/data/monsters.json     story monster variants (stats interpolated from the existing level curve)
  assets/data/npcs.json         story NPCs (existing sheets, own names / lines; one merchant per town)
  js/creature.js                CREATURES entries for the variants (tinted existing models), between WORLD markers
Deterministic (seeded per zone id). Re-runnable: replaces everything it generated before.
Usage: python3 tools/world/world.py [--write]   then  node tools/forest/check_nav.mjs all
Music only: python3 tools/world/world.py --music-only (preserves all geometry)."""
import json, math, os, random, re, sys, hashlib, copy
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
D = lambda *p: os.path.join(ROOT, *p)
sys.path.insert(0, D('tools', 'zones'))
from scale_fields import build_mesh, seg_dist   # zone mesh (terrain + water discs) from the data

# Region music is authored separately so regenerating geography preserves each score.
MUSIC_PLAN = json.load(open(D('assets', 'audio', 'world-music-plan.json'), encoding='utf-8'))
REGION_MUSIC = {t['zone']: os.path.splitext(t['file'])[0] for t in MUSIC_PLAN['tracks']}

def write_music_only():
    """Update only bgm fields; preserve generated meshes, props, and formatting."""
    path = D('assets', 'data', 'zones.json')
    with open(path, encoding='utf-8') as f: source = f.read()
    zones = json.loads(source)['zones']
    for z in zones:
        if z['id'] not in REGION_MUSIC: continue
        bgm = REGION_MUSIC[z['id']]
        if z.get('file'):
            target = D('assets', 'data', z['file'])
            with open(target, encoding='utf-8') as f: text = f.read()
            text, n = re.subn(r'("bgm"\s*:\s*)"[^"]*"', lambda m: m[1] + json.dumps(bgm), text, count=1)
            assert n == 1, z['id']
            with open(target, 'w', encoding='utf-8', newline='\n') as f: f.write(text)
        else:
            pattern = r'("id"\s*:\s*"' + re.escape(z['id']) + r'".*?"bgm"\s*:\s*)"[^"]*"'
            source, n = re.subn(pattern, lambda m: m[1] + json.dumps(bgm), source, count=1, flags=re.S)
            assert n == 1, z['id']
    with open(path, 'w', encoding='utf-8', newline='\n') as f: f.write(source)
    print('Updated region music:', len(REGION_MUSIC))

# ======================================================================== the continent (map 0..1000 x 0..760, north up)
REGIONS = [
    dict(id='kreutz', name='크로이츠 제국', x=650, y=28), dict(id='lumiere', name='루미에르', x=150, y=178),
    dict(id='baltern', name='발테른 공국', x=88, y=472), dict(id='kairion', name='카이리온 왕국', x=500, y=262),
    dict(id='marseon', name='마르세온', x=715, y=532), dict(id='baltazar', name='발타자르 왕국', x=962, y=250),
    dict(id='silvern', name='실베른 영지', x=118, y=640), dict(id='gravel', name='그라벨 변경령', x=455, y=602),
    dict(id='berg', name='베르그 고원', x=762, y=684), dict(id='zirat', name='지라트', x=470, y=748),
]
# towns (story places).  W, D = half size of the walled courtyard; keep = palace / temple / fortress behind the north wall
TOWNS = [
    dict(id='kairion_capital', name='카이리온 왕도', region='kairion', map=(550, 390), level=(1, 50), W=32, D=26, wallH=8.0, keep=(26, 14, 18), houses=12, market=True, banner='black',
         npcs=[('roderick', '로데릭', '근위대장', 'npc_guard', ['왕도의 성문은 폐하의 명 없이는 열리지 않소.', '……그날 밤 일은 묻지 마시오.']),
               ('capital_merchant', '베아', '왕도 상인', 'npc_merchant', ['검은 깃발이 걸린 뒤로 손님이 줄었어요.', '물약은 넉넉히 챙기세요.'], 'shop_general'),
               ('capital_smith', '하르덴', '왕실 대장장이', 'npc_master_blacksmith', ['왕실 무기고의 칼날도 내 손을 거쳤지.', '무기 손질이 필요하면 말하게.'], 'shop_smithy')]),
    dict(id='baltern', name='발테른 공국', region='baltern', map=(170, 420), level=(6, 14), W=24, D=20, wallH=9.0, keep=(18, 12, 16), houses=7, banner='blue',
         npcs=[('kerin', '케린', '노기사', 'npc_guard', ['구하는 일과 베는 일은 같은 검 끝에 있다.', '삼십 년 전 지라트 국경에서 본 것을 아직 잊지 못했다.']),
               ('baltern_merchant', '오린', '바위산 상인', 'npc_merchant', ['고갯길은 미끄러우니 조심하시오.', '여기서는 약초가 귀하다오.'], 'shop_general')]),
    dict(id='lumiere', name='루미에르 신전', region='lumiere', map=(280, 120), level=(12, 20), W=22, D=20, wallH=6.0, keep=(20, 14, 20), houses=5, temple=True, banner='blue',
         npcs=[('justina', '저스티나', '대사제', 'npc_master_pharmacist', ['아르칸의 다섯 유물을 모아야 흑룡을 다시 봉인할 수 있습니다.', '오라버니는…… 한때 이 신전의 대사제였지요.']),
               ('lumiere_acolyte', '에피', '견습 사제', 'npc_master_artist', ['수정구가 요즘 자꾸 검게 흐려져요.', '순례길에는 환영이 나온대요.'], 'shop_pharmacy')]),
    dict(id='gravel', name='그라벨', region='gravel', map=(520, 620), level=(16, 26), W=26, D=22, wallH=8.5, keep=(16, 12, 14), houses=8, banner='red',
         npcs=[('chirkai', '치르카이', '그라벨 영주', 'npc_elder', ['석 달 사이 마을 열두 곳이 사라졌소.', '이건 카이리온의 왕위 다툼이 아니군.']),
               ('chirzen', '치르젠', '영주의 아들', 'npc_master_artist', ['서고의 오래된 군령서를 정리하고 있습니다.', '숫자를 잊으면 전쟁에서 집니다.']),
               ('yoisen', '요이센', '정찰병', 'npc_guard', ['지라트에서는 두 가지만 지키시오. 소리를 내지 말 것. 땅을 믿지 말 것.']),
               ('gravel_merchant', '두란', '국경 상인', 'npc_merchant', ['남쪽으로 가는 길엔 해독제가 필수요.'], 'shop_general')]),
    dict(id='silvern', name='실베른 영지', region='silvern', map=(260, 620), level=(14, 22), W=22, D=18, wallH=5.0, keep=None, houses=7, market=True, banner='green',
         npcs=[('derkai', '데르카이', '실베른 영주', 'npc_elder', ['보복이 두려워 문을 닫는 자도 있지.', '이틀만 생각할 시간을 주게.']),
               ('silvern_merchant', '리아', '들판 상인', 'npc_merchant', ['습지 쪽은 안개가 짙어요.'], 'shop_general')]),
    dict(id='marseon', name='마르세온', region='marseon', map=(770, 380), level=(28, 36), W=28, D=22, wallH=7.0, keep=None, houses=10, market=True, banner='black',
         npcs=[('yanber', '얀베르', '발타자르 기사단장', 'npc_guard', ['당신이 누구인지는 묻지 않겠습니다.', '발타자르까지 모시겠습니다.']),
               ('marseon_merchant', '카심', '교역 상인', 'npc_merchant', ['검은 깃발 아래서도 장사는 계속되지요.'], 'shop_general'),
               ('marseon_armorer', '세라', '방어구 상인', 'npc_armorer', ['동쪽 전선에서 쓰던 방패요. 튼튼하지.'], 'shop_arms')]),
    dict(id='baltazar', name='발타자르 왕도', region='baltazar', map=(900, 280), level=(33, 44), W=28, D=24, wallH=9.0, keep=(24, 14, 18), houses=10, smithy=True, banner='red',
         npcs=[('erdin', '에르딘', '왕실 대장장이', 'npc_master_blacksmith', ['스승님은 붉은숲으로 사라지셨습니다.', '이 망치로 무언가를 지키는 무기를 만들겠습니다.'], 'shop_smithy'),
               ('berion', '베리온', '발타자르 왕자', 'npc_guard', ['북쪽 협곡에서 크로이츠군을 막고 있소.', '아버님의 병이 깊어지고 있소.']),
               ('baltazar_merchant', '토마', '왕도 상인', 'npc_merchant', ['대장장이의 나라에 온 걸 환영하오.'], 'shop_general')]),
    dict(id='kreutz_fort', name='크로이츠 국경 요새', region='kreutz', map=(700, 90), level=(36, 46), W=24, D=20, wallH=10.0, keep=(20, 12, 20), houses=6, banner='black',
         npcs=[('kreutz_captain', '볼크', '요새 수비대장', 'npc_guard', ['제국의 흑기사가 남쪽으로 내려갔다는 소문이 있소.', '호수 쪽 얼음이 밤마다 울린다오.']),
               ('kreutz_merchant', '미샤', '설원 상인', 'npc_merchant', ['털옷 없이 설원에 가면 얼어 죽어요.'], 'shop_general')]),
]
# biomes: painted ground set, foliage tint, prop mix, density, light
BIOMES = {
    'meadow':   dict(ground=None, density=0.45, grass=1.2, water=0.3, mix=dict(tree=.32, shrub=.22, flowers=.28, rock=.08, stone=.07, stump=.03), bgm='bgm_field',
                     sun=[1.0, 0.88, 0.66, 1.45], ambient=[0.68, 0.66, 0.56], post=dict(vignette=0.22, bloom=0.14, sat=1.16, contrast=0.24, exposure=1.06), theme=['#8fb06a', '#c8b48a'], tex='grass'),
    'woods':    dict(ground=None, density=1.0, grass=1.0, water=0.15, mix=dict(tree=.5, pine=.12, shrub=.2, flowers=.08, rock=.05, stone=.03, stump=.02), bgm='bgm_arcan_forest',
                     sun=[1.0, 0.86, 0.62, 1.42], ambient=[0.68, 0.66, 0.56], post=dict(vignette=0.24, bloom=0.16, sat=1.16, contrast=0.26, exposure=1.06, haze=0.06), theme=['#5f8a4a', '#b89a6a'], tex='forest_floor'),
    'blue':     dict(ground='mist', foliage='azure', density=1.0, grass=0.9, water=0.3, mix=dict(tree=.42, pine=.16, shrub=.2, rock=.08, stone=.05, mushdecor=.06, flowers=.03), bgm='bgm_arcan_mist_valley',
                     sun=[0.8, 0.88, 1.0, 1.1], ambient=[0.52, 0.62, 0.8], post=dict(vignette=0.24, bloom=0.18, sat=1.12, contrast=0.22, exposure=1.06, haze=0.16, hazeCol=[0.62, 0.78, 0.9]), theme=['#4f7f8a', '#a8b8b0'], tex='leaves_dark', models=dict(mushdecor=['mush_glow_blue', 'mush_small_blue'])),
    'crimson':  dict(ground='crimson', foliage='crimson', density=0.9, grass=0.7, water=0.0, mix=dict(tree=.48, shrub=.2, rock=.1, stone=.07, stump=.06, mushroom=.04, flowers=.05), bgm='bgm_arcan_dragon_ruins',
                     sun=[1.0, 0.64, 0.5, 1.25], ambient=[0.66, 0.48, 0.46], post=dict(vignette=0.26, bloom=0.16, sat=1.14, contrast=0.26, exposure=1.04, haze=0.1, hazeCol=[0.86, 0.6, 0.58]), theme=['#8a4436', '#c49a7c'], tex='dirt'),
    'stone':    dict(ground='stone', rockTint=[0.92, 0.92, 0.96], density=0.75, grass=0.8, water=0.1, mix=dict(pine=.32, tree=.1, rock=.3, stone=.16, shrub=.12), bgm='bgm_field',
                     sun=[1.0, 0.9, 0.74, 1.35], ambient=[0.66, 0.68, 0.66], post=dict(vignette=0.22, bloom=0.14, sat=1.08, contrast=0.24, exposure=1.05), theme=['#7a8a6a', '#b8b6ae'], tex='dirt'),
    'frost':    dict(ground='frost', foliage='snow', rockTint=[0.95, 1.0, 1.08], density=0.65, grass=0.35, water=0.2, mix=dict(pine=.5, rock=.2, stone=.12, shrub=.1, stump=.08), bgm='bgm_arcan_frost_highland',
                     sun=[0.94, 0.97, 1.06, 1.0], ambient=[0.74, 0.8, 0.94], post=dict(vignette=0.2, bloom=0.16, sat=1.05, contrast=0.22, exposure=1.04), theme=['#c9d6de', '#a9a49a'], tex='plaster_blue'),
    'ash':      dict(ground='ash', foliage='ash', density=0.32, grass=0.15, water=0.0, mix=dict(stump=.28, rock=.32, stone=.26, tree=.1, shrub=.04), bgm='bgm_arcan_dragon_ruins',
                     sun=[0.86, 0.8, 0.76, 0.95], ambient=[0.52, 0.5, 0.52], post=dict(vignette=0.28, bloom=0.12, sat=0.86, contrast=0.24, exposure=1.02, haze=0.18, hazeCol=[0.66, 0.64, 0.66]), theme=['#7e7a72', '#a49a8e'], tex='dirt'),
    'abyss':    dict(ground='magic', density=0.55, grass=0.4, water=0.0, mix=dict(tree=.28, rock=.22, mushdecor=.2, mushtree=.05, stone=.13, stump=.12), bgm='bgm_arcan_dragon_ruins',
                     sun=[0.78, 0.62, 0.92, 0.9], ambient=[0.46, 0.38, 0.6], post=dict(vignette=0.3, bloom=0.2, sat=1.1, contrast=0.26, exposure=1.02, haze=0.2, hazeCol=[0.5, 0.4, 0.64]), theme=['#4e3e66', '#8a7aa0'], tex='leaves_dark',
                     models=dict(tree=['tree_violet', 'tree_violet_round'], rock=['rock_magic', 'rock_magic_low'], mushdecor=['mush_glow_purple', 'mush_small_purple', 'mush_cluster'])),
    'highland': dict(ground='ruins', tint=[1.08, 0.9, 0.62], rockTint=[1.05, 0.95, 0.88], density=0.5, grass=0.8, water=0.1, mix=dict(tree=.2, shrub=.2, flowers=.15, rock=.2, stone=.12, stump=.06, ruin=.04), bgm='bgm_arcan_dragon_ruins',
                     sun=[1.0, 0.78, 0.56, 1.1], ambient=[0.64, 0.54, 0.5], post=dict(vignette=0.24, bloom=0.15, sat=1.1, contrast=0.26, exposure=1.04), theme=['#8e7a58', '#b0a08c'], tex='dirt'),
    'marsh':    dict(ground='mist', tint=[0.78, 0.92, 0.95], density=0.8, grass=1.0, water=0.95, mix=dict(tree=.34, shrub=.3, flowers=.1, rock=.1, stone=.06, mushroom=.05, stump=.05), bgm='bgm_arcan_mist_valley',
                     sun=[0.76, 0.82, 0.96, 0.9], ambient=[0.5, 0.56, 0.72], post=dict(vignette=0.22, bloom=0.14, sat=1.1, contrast=0.22, exposure=1.05, haze=0.14, hazeCol=[0.7, 0.76, 0.8]), theme=['#5a7a68', '#9aa48a'], tex='leaves_dark'),
    'canyon':   dict(ground='ruins', tint=[1.08, 0.9, 0.62], rockTint=[1.08, 0.94, 0.84], density=0.8, grass=0.5, water=0.0, mix=dict(rock=.42, stone=.2, pine=.14, shrub=.16, stump=.08), bgm='bgm_arcan_dragon_ruins', edge=3.2,
                     sun=[1.0, 0.76, 0.54, 1.15], ambient=[0.64, 0.52, 0.48], post=dict(vignette=0.26, bloom=0.14, sat=1.08, contrast=0.28, exposure=1.04), theme=['#9a7a58', '#c4aa86'], tex='dirt'),
    'river':    dict(ground=None, density=0.6, grass=1.1, water=1.0, river=True, mix=dict(tree=.38, shrub=.26, flowers=.2, rock=.1, stone=.06), bgm='bgm_field',
                     sun=[1.0, 0.88, 0.68, 1.4], ambient=[0.66, 0.66, 0.6], post=dict(vignette=0.22, bloom=0.15, sat=1.14, contrast=0.24, exposure=1.06), theme=['#7aa06a', '#c0b08a'], tex='grass'),
}
# monster variants: (id, base monster, name, level, tint, recolor, elite)
VARIANTS = [
    ('mon_rock_ram', 'mon_frost_ram', '바위뿔 산양', 8, [0.78, 0.74, 0.7], 0.4, False),
    ('mon_cliff_wolf', 'mon_wolf', '절벽 늑대', 10, [0.72, 0.7, 0.64], 0.35, False),
    ('mon_blue_jelly', 'mon_jelly', '푸른숲 젤리', 11, [0.5, 0.76, 1.0], 0.5, False),
    ('mon_shadow_wolf', 'mon_wolf', '그림자 늑대', 13, [0.4, 0.32, 0.52], 0.6, False),
    ('mon_phantom_fox', 'mon_fox', '환영 여우', 14, [0.62, 0.86, 1.0], 0.55, False),
    ('mon_phantom_bear', 'mon_golem', '숲의 문지기 영령', 17, [0.56, 0.82, 1.0], 0.6, True),
    ('mon_dust_boar', 'mon_boar', '흙먼지 멧돼지', 18, [0.86, 0.72, 0.56], 0.4, False),
    ('mon_ash_toad', 'mon_fog_toad', '잿빛 두꺼비', 21, [0.62, 0.6, 0.58], 0.55, False),
    ('mon_canyon_ram', 'mon_frost_ram', '협곡 큰뿔양', 21, [0.92, 0.76, 0.56], 0.4, False),
    ('mon_berg_bear', 'mon_golem', '베르그 고원 곰', 24, [0.78, 0.62, 0.46], 0.45, False),
    ('mon_blackeye_wolf', 'mon_wolf', '검은 눈 늑대', 28, [0.28, 0.22, 0.32], 0.7, False),
    ('mon_crimson_boar', 'mon_boar', '붉은숲 멧돼지', 33, [0.92, 0.32, 0.26], 0.55, False),
    ('mon_mine_golem', 'mon_ruin_golem', '광산 바위정령', 34, [0.72, 0.66, 0.6], 0.4, False),
    ('mon_crimson_fox', 'mon_fox', '핏빛 여우', 35, [0.96, 0.36, 0.3], 0.55, False),
    ('mon_crimson_bear', 'mon_golem', '붉은 수정 곰', 38, [1.0, 0.3, 0.36], 0.6, True),
    ('mon_kreutz_wolf', 'mon_frost_wolf', '북방 설원 늑대', 39, [0.8, 0.86, 0.96], 0.5, False),
    ('mon_tomb_golem', 'mon_ruin_golem', '능침 수호석', 42, [1.0, 0.86, 0.52], 0.45, False),
    ('mon_void_toad', 'mon_fog_toad', '공허 두꺼비', 43, [0.56, 0.36, 0.76], 0.6, False),
    ('mon_ash_drake', 'mon_ember_drake', '잿빛 비룡', 45, [0.52, 0.5, 0.52], 0.55, False),
    ('mon_lake_bear', 'mon_snow_bear', '호수의 빙곰', 46, [0.7, 0.86, 1.0], 0.55, True),
    ('mon_abyss_drake', 'mon_ember_drake', '심연 비룡', 49, [0.32, 0.16, 0.42], 0.65, False),
]
# new species (Tripo draft -> Blender clean-up, tools/monsters/tripo_new.py + blender_new.py -> assets/creatures/w_<file>):
# (id, model file, name, level, attack style, size, elite, tint)
SPECIES = [
    ('mon_mole', 'mole', '흙두더지', 3, 'tackle', 0.85, False, None), ('mon_sapling', 'sapling', '걷는 묘목', 5, 'slam', 1.0, False, None),
    ('mon_beetle', 'beetle', '뿔 딱정벌레', 7, 'charge', 0.95, False, None), ('mon_hawk', 'hawk', '바위산 매', 9, 'claw', 0.95, False, None),
    ('mon_moth', 'moth', '환영 나방', 12, 'spit', 1.05, False, None), ('mon_owl', 'owl', '밤 부엉이', 13, 'claw', 0.95, False, None),
    ('mon_spider', 'spider', '숲거미 영령', 15, 'bite', 1.1, False, None), ('mon_spider_elite', 'spider', '디고나의 메아리', 17, 'bite', 2.3, True, [0.7, 0.85, 1.0]),
    ('mon_wisp', 'wisp', '습지 도깨비불', 18, 'fire', 0.95, False, None), ('mon_wraith', 'wraith', '그림자 망령', 20, 'claw', 1.05, False, None),
    ('mon_scorpion', 'scorpion', '모래 전갈', 21, 'claw', 1.05, False, None), ('mon_soldier', 'soldier', '검은 눈의 병사', 27, 'slam', 1.15, False, None),
    ('mon_crab', 'crab', '강변 바위게', 29, 'claw', 1.05, False, None), ('mon_salamander', 'salamander', '불꽃 도롱뇽', 34, 'fire', 1.05, False, None),
    ('mon_crystal', 'crystal', '붉은 수정 정령', 36, 'slam', 1.25, False, None), ('mon_yeti', 'yeti', '아기 설인', 40, 'slam', 1.25, False, None),
    ('mon_armor', 'armor', '능침 수호 갑주', 42, 'slam', 1.35, False, None), ('mon_bat', 'bat', '심연 박쥐', 47, 'bite', 1.05, False, None),
]
# batch 2 (2026-11-07, tools/monsters/tripo_more.py): body plans the game did not have yet; only species whose model
# exists (assets/creatures/w_<file>.glb.json) are used
MONS_KNOWN = None
SPECIES2 = [
    ('mon_hedgehog', 'hedgehog', '가시 고슴도치', 3, 'tackle', 0.8), ('mon_snail', 'snail', '이끼 달팽이', 4, 'tackle', 0.95),
    ('mon_hornet', 'hornet', '왕벌', 5, 'spit', 0.85), ('mon_mandrake', 'mandrake', '비명 맨드레이크', 6, 'tackle', 0.8),
    ('mon_turtle', 'turtle', '이끼 거북', 7, 'tackle', 0.95), ('mon_stumpling', 'stumpling', '걷는 그루터기', 8, 'slam', 1.05),
    ('mon_armadillo', 'armadillo', '바위 아르마딜로', 9, 'charge', 0.95), ('mon_goblin_miner', 'goblin_miner', '고블린 광부', 10, 'claw', 0.95),
    ('mon_gargoyle', 'gargoyle', '아기 가고일', 12, 'claw', 1.0), ('mon_pixie', 'pixie', '장난꾸러기 요정', 13, 'spit', 0.85),
    ('mon_spirit_deer', 'spirit_deer', '별빛 사슴', 15, 'charge', 1.35), ('mon_lantern_ghost', 'lantern_ghost', '등불 유령', 16, 'fire', 1.0),
    ('mon_frog_shaman', 'frog_shaman', '개구리 주술사', 16, 'spit', 1.0), ('mon_treant', 'treant', '어린 나무거인', 17, 'slam', 1.7),
    ('mon_pitcher_plant', 'pitcher_plant', '식인 낭상초', 17, 'spit', 1.1), ('mon_swamp_serpent', 'swamp_serpent', '늪 뱀', 18, 'bite', 1.1),
    ('mon_snapping_turtle', 'snapping_turtle', '늪 악어거북', 19, 'bite', 1.15), ('mon_cactus', 'cactus', '성난 선인장', 20, 'claw', 1.0),
    ('mon_vulture', 'vulture', '황무지 독수리', 21, 'claw', 1.05), ('mon_sandworm', 'sandworm', '모래 벌레', 22, 'bite', 1.35),
    ('mon_mummy', 'mummy', '꼬마 미라', 23, 'claw', 1.0), ('mon_griffin_chick', 'griffin_chick', '아기 그리핀', 24, 'claw', 1.25),
    ('mon_goblin_bandit', 'goblin_bandit', '고블린 산적', 27, 'claw', 1.0), ('mon_orc', 'orc', '오크 전사', 30, 'slam', 1.4),
    ('mon_flame_imp', 'flame_imp', '불꽃 임프', 33, 'fire', 0.95), ('mon_lava_turtle', 'lava_turtle', '용암 거북', 35, 'slam', 1.35),
    ('mon_mimic', 'mimic', '미믹 상자', 38, 'bite', 1.0), ('mon_penguin_knight', 'penguin_knight', '펭귄 기사', 38, 'claw', 0.95),
    ('mon_skeleton_knight', 'skeleton_knight', '해골 기사', 41, 'claw', 1.15), ('mon_ice_golem', 'ice_golem', '얼음 골렘', 44, 'slam', 1.55),
    ('mon_shadow_eye', 'shadow_eye', '그림자 눈', 46, 'spit', 1.1), ('mon_demon_knight', 'demon_knight', '마족 기사', 49, 'slam', 1.45),
]
SPECIES += [(i, f, n, lv, atk, size, False, None) for i, f, n, lv, atk, size in SPECIES2 if os.path.exists(D('assets', 'creatures', 'w_%s.glb.json' % f))]
# where the new species live: field -> [(id, count)] (camp levels follow the field's place in the story, see gen_field)
NEW_MONS = {
    'capital_road': [('mon_hedgehog', 5), ('mon_snail', 5)], 'kairion_hunt': [('mon_mandrake', 5), ('mon_hornet', 5), ('mon_stumpling', 4)],
    'kairion_hills': [('mon_turtle', 5), ('mon_hornet', 4), ('mon_hedgehog', 4)], 'baltern_pass': [('mon_armadillo', 5), ('mon_goblin_miner', 5)],
    'baltern_cliffs': [('mon_gargoyle', 6)], 'baltern_quarry': [('mon_goblin_miner', 6), ('mon_armadillo', 4)],
    'blue_forest_edge': [('mon_pixie', 6)], 'blue_forest': [('mon_spirit_deer', 5), ('mon_pixie', 5)], 'blue_forest_heart': [('mon_treant', 4), ('mon_lantern_ghost', 5)],
    'lumiere_hills': [('mon_spirit_deer', 5)], 'silvern_fields': [('mon_pitcher_plant', 6)], 'silvern_woods': [('mon_treant', 4), ('mon_frog_shaman', 5)],
    'silvern_marsh': [('mon_snapping_turtle', 5), ('mon_swamp_serpent', 6), ('mon_frog_shaman', 4)], 'gravel_border': [('mon_vulture', 5), ('mon_cactus', 5)],
    'lost_villages': [('mon_lantern_ghost', 5), ('mon_mummy', 5)], 'zirat_outskirts': [('mon_sandworm', 4), ('mon_mummy', 5), ('mon_cactus', 4)],
    'berg_canyon': [('mon_vulture', 5), ('mon_sandworm', 4)], 'berg_highland': [('mon_griffin_chick', 5)], 'berg_burned': [('mon_mummy', 5), ('mon_griffin_chick', 4)],
    'capital_plain': [('mon_goblin_bandit', 6), ('mon_orc', 4)], 'broken_bridge': [('mon_goblin_bandit', 5), ('mon_snapping_turtle', 4)],
    'trade_road': [('mon_goblin_bandit', 5), ('mon_orc', 4)], 'marseon_outskirts': [('mon_orc', 5)], 'lumiere_ruins_field': [('mon_orc', 4), ('mon_lantern_ghost', 5)],
    'crimson_forest': [('mon_flame_imp', 6)], 'crimson_heart': [('mon_flame_imp', 5), ('mon_lava_turtle', 4)],
    'baltazar_mines': [('mon_lava_turtle', 4), ('mon_goblin_miner', 5), ('mon_mimic', 3)], 'royal_tomb': [('mon_skeleton_knight', 6), ('mon_mimic', 3)],
    'north_canyon': [('mon_penguin_knight', 6)], 'kreutz_front': [('mon_penguin_knight', 5), ('mon_skeleton_knight', 4)],
    'kreutz_snowfield': [('mon_ice_golem', 4), ('mon_penguin_knight', 5)], 'frozen_lake': [('mon_ice_golem', 5)],
    'zirat_wastes': [('mon_shadow_eye', 5), ('mon_skeleton_knight', 4)], 'zirat_abyss_rim': [('mon_shadow_eye', 5), ('mon_demon_knight', 4)],
    'abyss_bridge': [('mon_demon_knight', 5), ('mon_shadow_eye', 4)],
}
# the original hand-made fields get some of them too (their camps keep their own spots; a new camp gets "level")
NEW_MONS_EXISTING = {
    'forest': [('mon_hedgehog', 5, (-60.0, 30.0)), ('mon_mandrake', 4, (30.0, 10.0))],
    'mist_valley': [('mon_frog_shaman', 5, (40.0, 60.0)), ('mon_swamp_serpent', 5, (-60.0, -50.0))],
    'frost_highland': [('mon_penguin_knight', 5, (0.0, 0.0)), ('mon_ice_golem', 3, (50.0, -50.0))],
    'dragon_ruins': [('mon_flame_imp', 5, (-30.0, 20.0)), ('mon_demon_knight', 3, (40.0, 40.0))],
}
ATK_BASE = {'tackle': 'mon_slime', 'slam': 'mon_golem', 'charge': 'mon_boar', 'claw': 'mon_fox', 'spit': 'mon_fog_toad', 'bite': 'mon_wolf', 'fire': 'mon_cinder_lizard', 'ice': 'mon_ice_fox'}
# fields: id, name, region, biome, map (x, y), level, monsters [(id, count)], respawn town
F = lambda i, n, r, b, xy, lv, mons, town: dict(id=i, name=n, region=r, biome=b, map=xy, level=lv, mons=mons, town=town)
FIELDS = [
    F('capital_road', '왕도 가는 길', 'kairion', 'meadow', (490, 410), (2, 6), [('mon_slime', 6), ('mon_mole', 7), ('mon_fox', 6)], 'town'),
    F('kairion_hunt', '카이리온 사냥터 숲', 'kairion', 'woods', (565, 465), (3, 7), [('mon_fox', 6), ('mon_sapling', 7), ('mon_wolf', 6), ('mon_shroom', 5)], 'kairion_capital'),
    F('kairion_hills', '카이리온 구릉지', 'kairion', 'meadow', (640, 420), (5, 9), [('mon_beetle', 7), ('mon_boar', 6), ('mon_wolf', 6), ('mon_mole', 5)], 'kairion_capital'),
    F('capital_plain', '수도 앞 평원', 'kairion', 'meadow', (565, 315), (24, 30), [('mon_soldier', 8), ('mon_blackeye_wolf', 7), ('mon_dust_boar', 6)], 'kairion_capital'),
    F('broken_bridge', '무너진 다리 강변', 'kairion', 'river', (640, 325), (26, 31), [('mon_crab', 8), ('mon_soldier', 6), ('mon_ash_toad', 6)], 'kairion_capital'),
    F('baltern_pass', '바위산 고갯길', 'baltern', 'stone', (250, 440), (6, 9), [('mon_rock_ram', 7), ('mon_hawk', 7), ('mon_beetle', 6)], 'baltern'),
    F('baltern_cliffs', '발테른 절벽길', 'baltern', 'stone', (130, 340), (8, 11), [('mon_hawk', 8), ('mon_cliff_wolf', 7), ('mon_rock_ram', 6)], 'baltern'),
    F('baltern_quarry', '옛 채석장', 'baltern', 'canyon', (160, 510), (9, 12), [('mon_rock_ram', 6), ('mon_cliff_wolf', 6), ('mon_beetle', 6), ('mon_golem', 4)], 'baltern'),
    F('blue_forest_edge', '푸른숲 어귀', 'lumiere', 'blue', (240, 320), (10, 13), [('mon_blue_jelly', 7), ('mon_moth', 7), ('mon_shadow_wolf', 6)], 'baltern'),
    F('blue_forest', '푸른숲 (환영의 숲)', 'lumiere', 'blue', (250, 245), (12, 15), [('mon_phantom_fox', 6), ('mon_owl', 7), ('mon_moth', 6), ('mon_shadow_wolf', 6)], 'lumiere'),
    F('blue_forest_heart', '푸른숲 고목지', 'lumiere', 'blue', (300, 185), (14, 17), [('mon_spider', 8), ('mon_owl', 6), ('mon_phantom_fox', 6), ('mon_spider_elite', 1)], 'lumiere'),
    F('lumiere_hills', '루미에르 순례길', 'lumiere', 'meadow', (370, 135), (13, 16), [('mon_mist_fox', 7), ('mon_owl', 7), ('mon_panda', 4)], 'lumiere'),
    F('lumiere_ruins_field', '불탄 순례지', 'lumiere', 'ash', (440, 185), (30, 33), [('mon_soldier', 8), ('mon_blackeye_wolf', 7), ('mon_crimson_boar', 5)], 'lumiere'),
    F('gravel_border', '그라벨 국경지대', 'gravel', 'highland', (545, 555), (16, 19), [('mon_dust_boar', 7), ('mon_scorpion', 6), ('mon_mist_wolf', 6)], 'gravel'),
    F('lost_villages', '사라진 마을 터', 'gravel', 'ash', (430, 655), (18, 21), [('mon_wraith', 8), ('mon_shadow_wolf', 7), ('mon_ash_toad', 6)], 'gravel'),
    F('zirat_outskirts', '지라트 외곽 황무지', 'zirat', 'ash', (545, 700), (20, 23), [('mon_wraith', 8), ('mon_scorpion', 7), ('mon_ash_toad', 6)], 'gravel'),
    F('zirat_wastes', '회색 황무지', 'zirat', 'ash', (610, 735), (40, 44), [('mon_ash_drake', 6), ('mon_void_toad', 7), ('mon_tomb_golem', 4)], 'gravel'),
    F('zirat_abyss_rim', '지라트 심연 가장자리', 'zirat', 'abyss', (690, 745), (45, 50), [('mon_bat', 8), ('mon_abyss_drake', 6), ('mon_void_toad', 6)], 'gravel'),
    F('abyss_bridge', '심연의 검은 다리', 'zirat', 'abyss', (770, 735), (47, 50), [('mon_bat', 8), ('mon_abyss_drake', 7), ('mon_drake_lord', 3)], 'gravel'),
    F('silvern_fields', '실베른 들판', 'silvern', 'meadow', (345, 600), (14, 17), [('mon_mist_fox', 7), ('mon_wisp', 6), ('mon_panda', 4)], 'silvern'),
    F('silvern_woods', '실베른 남쪽 숲', 'silvern', 'woods', (200, 565), (15, 18), [('mon_mist_wolf', 7), ('mon_owl', 7), ('mon_bog_boar', 6)], 'silvern'),
    F('silvern_marsh', '실베른 습지', 'silvern', 'marsh', (220, 700), (17, 20), [('mon_wisp', 8), ('mon_fog_toad', 7), ('mon_bog_boar', 6), ('mon_mist_bear', 1)], 'silvern'),
    F('berg_canyon', '베르그 협곡', 'berg', 'canyon', (645, 585), (19, 22), [('mon_scorpion', 8), ('mon_canyon_ram', 7), ('mon_dust_boar', 5)], 'gravel'),
    F('berg_highland', '베르그 고원', 'berg', 'highland', (730, 620), (21, 24), [('mon_canyon_ram', 7), ('mon_berg_bear', 5), ('mon_scorpion', 6)], 'gravel'),
    F('berg_burned', '불탄 베르그 마을 터', 'berg', 'ash', (800, 560), (22, 25), [('mon_wraith', 8), ('mon_berg_bear', 5), ('mon_ash_toad', 6)], 'gravel'),
    F('trade_road', '동부 교역로', 'marseon', 'meadow', (705, 400), (28, 31), [('mon_soldier', 7), ('mon_crab', 6), ('mon_blackeye_wolf', 6)], 'marseon'),
    F('marseon_outskirts', '마르세온 외곽', 'marseon', 'river', (810, 455), (29, 32), [('mon_crab', 8), ('mon_crimson_boar', 6), ('mon_bog_boar', 5)], 'marseon'),
    F('crimson_forest', '붉은숲', 'marseon', 'crimson', (850, 515), (32, 35), [('mon_crimson_boar', 7), ('mon_crimson_fox', 7), ('mon_salamander', 6)], 'marseon'),
    F('crimson_heart', '붉은숲 심부', 'marseon', 'crimson', (890, 580), (34, 37), [('mon_crystal', 8), ('mon_crimson_fox', 6), ('mon_crimson_bear', 1)], 'marseon'),
    F('baltazar_mines', '발타자르 광산길', 'baltazar', 'stone', (855, 335), (33, 36), [('mon_salamander', 7), ('mon_mine_golem', 6), ('mon_lava_boar', 5)], 'baltazar'),
    F('royal_tomb', '발타자르 왕가 능침', 'baltazar', 'highland', (950, 345), (40, 43), [('mon_armor', 8), ('mon_tomb_golem', 6)], 'baltazar'),
    F('north_canyon', '북쪽 협곡 전선', 'baltazar', 'canyon', (870, 190), (36, 39), [('mon_yeti', 7), ('mon_kreutz_wolf', 7), ('mon_frost_ram', 5)], 'baltazar'),
    F('kreutz_front', '크로이츠 전선', 'kreutz', 'frost', (790, 130), (37, 40), [('mon_yeti', 7), ('mon_kreutz_wolf', 7), ('mon_ice_fox', 6)], 'kreutz_fort'),
    F('kreutz_snowfield', '크로이츠 설원', 'kreutz', 'frost', (600, 75), (39, 42), [('mon_yeti', 8), ('mon_kreutz_wolf', 7), ('mon_ram_king', 1)], 'kreutz_fort'),
    dict(F('frozen_lake', '얼어붙은 호수', 'kreutz', 'frost', (510, 60), (42, 46), [('mon_yeti', 7), ('mon_snow_bear', 5), ('mon_lake_bear', 1)], 'kreutz_fort'), lake=True),
]
LINKS = [  # undirected
    ('town', 'capital_road'), ('capital_road', 'kairion_capital'), ('kairion_capital', 'kairion_hunt'), ('kairion_capital', 'kairion_hills'), ('kairion_capital', 'capital_plain'),
    ('capital_plain', 'broken_bridge'), ('capital_plain', 'lumiere_ruins_field'), ('dragon_ruins', 'lumiere_ruins_field'),
    ('mist_valley', 'baltern_pass'), ('baltern_pass', 'baltern'), ('baltern', 'baltern_cliffs'), ('baltern', 'baltern_quarry'),
    ('baltern_cliffs', 'blue_forest_edge'), ('blue_forest_edge', 'blue_forest'), ('blue_forest', 'blue_forest_heart'), ('blue_forest_heart', 'lumiere'),
    ('lumiere', 'lumiere_hills'), ('lumiere_hills', 'lumiere_ruins_field'),
    ('kairion_hunt', 'gravel_border'), ('gravel_border', 'gravel'), ('gravel', 'lost_villages'), ('gravel', 'zirat_outskirts'),
    ('zirat_outskirts', 'zirat_wastes'), ('zirat_wastes', 'zirat_abyss_rim'), ('zirat_abyss_rim', 'abyss_bridge'),
    ('baltern_quarry', 'silvern_woods'), ('silvern_woods', 'silvern'), ('silvern', 'silvern_fields'), ('silvern_fields', 'lost_villages'), ('silvern', 'silvern_marsh'),
    ('gravel_border', 'berg_canyon'), ('berg_canyon', 'berg_highland'), ('berg_highland', 'berg_burned'), ('berg_burned', 'crimson_forest'),
    ('kairion_hills', 'trade_road'), ('trade_road', 'marseon'), ('marseon', 'marseon_outskirts'), ('marseon_outskirts', 'crimson_forest'), ('crimson_forest', 'crimson_heart'),
    ('marseon', 'baltazar_mines'), ('baltazar_mines', 'baltazar'), ('baltazar', 'royal_tomb'), ('baltazar', 'north_canyon'),
    ('north_canyon', 'kreutz_front'), ('kreutz_front', 'kreutz_fort'), ('kreutz_fort', 'kreutz_snowfield'), ('kreutz_snowfield', 'frozen_lake'),
]
EXISTING = {  # map / level / region for the zones that already exist
    'town': dict(map=(430, 420), level=(1, 50), region='kairion'), 'forest': dict(map=(395, 475), level=(1, 10), region='kairion'),
    'mushroom_grove': dict(map=(360, 510), level=(10, 10), region='kairion'), 'mist_valley': dict(map=(325, 430), level=(11, 22), region='kairion'),
    'frost_highland': dict(map=(345, 345), level=(23, 36), region='kairion'), 'dragon_ruins': dict(map=(420, 330), level=(38, 50), region='kairion'),
}

def rng_for(s): return random.Random(int(hashlib.md5(s.encode()).hexdigest()[:8], 16))

# ======================================================================== noise
def vnoise(x, z, s, seed):
    def h(i, j): return ((i * 73856093) ^ (j * 19349663) ^ (seed * 83492791)) % 1000003 / 1000003.0
    X, Zz = x / s, z / s; i, j = math.floor(X), math.floor(Zz); fx, fz = X - i, Zz - j
    ux, uz = fx * fx * (3 - 2 * fx), fz * fz * (3 - 2 * fz)
    a, b, c, d = h(i, j), h(i + 1, j), h(i, j + 1), h(i + 1, j + 1)
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz

def catmull(pts, n=6):
    out = []
    P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n; t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in range(2)))
    out.append(pts[-1]); return out

# ======================================================================== links / directions
def node_map():
    m = {k: v['map'] for k, v in EXISTING.items()}
    for t in TOWNS: m[t['id']] = t['map']
    for f in FIELDS: m[f['id']] = f['map']
    return m
def neighbours(i): return [b if a == i else a for a, b in LINKS if i in (a, b)]
def direction(a, b, M):
    """map vector a -> b as a unit direction in game coordinates (map y grows south, game z grows north)"""
    dx, dy = M[b][0] - M[a][0], M[b][1] - M[a][1]; L = math.hypot(dx, dy) or 1
    return dx / L, -dy / L

def name_of(i):
    for t in TOWNS:
        if t['id'] == i: return t['name']
    for f in FIELDS:
        if f['id'] == i: return f['name']
    return {'town': '아르칸 마을', 'forest': '속삭이는 숲', 'mushroom_grove': '독버섯 군락지', 'mist_valley': '안개 골짜기', 'frost_highland': '서리 고원', 'dragon_ruins': '잊힌 용의 유적'}[i]

def yaw_to(dx, dz): return round(math.degrees(math.atan2(dx, dz)), 1)

# ======================================================================== fields
H = 70.0  # half size of a new field (140 m x 140 m)
def gen_field(f, M, mon_levels):
    B = BIOMES[f['biome']]; rnd = rng_for(f['id']); seed = rnd.randint(1, 10 ** 6)
    x0, z0, x1, z1 = -H, -H, H, H
    nb = neighbours(f['id'])
    hub = (rnd.uniform(-12, 12), rnd.uniform(-12, 12))
    exits, spawns, portals, paths, patches = [], [], [], [], []
    used = []
    for n in nb:
        dx, dz = direction(f['id'], n, M)
        # push angles apart when two exits would land close together
        a = math.atan2(dz, dx)
        for _ in range(12):
            if all(abs((a - u + math.pi) % (2 * math.pi) - math.pi) > 0.55 for u in used): break
            a += 0.3
        used.append(a); dx, dz = math.cos(a), math.sin(a)
        k = (H - 5.0) / max(abs(dx), abs(dz)); ex, ez = dx * k, dz * k
        k2 = (H - 10.5) / max(abs(dx), abs(dz)); sx, sz = dx * k2, dz * k2
        portals.append(dict(id='to_' + n, label=name_of(n), pos=[round(ex, 2), round(ez, 2)], radius=1.8, targetZone=n, targetSpawn='from_' + f['id'], minLevel=0))
        spawns.append(dict(id='from_' + n, pos=[round(sx, 2), round(sz, 2)], rot=yaw_to(-dx, -dz)))
        exits.append((ex, ez))
    # paths: every exit to the hub, a gentle S bend in between
    W = 3.6 + rnd.uniform(0, 1.0)
    for (ex, ez) in exits:
        mx, mz = (ex + hub[0]) / 2, (ez + hub[1]) / 2; L = math.hypot(ex - hub[0], ez - hub[1]) or 1
        nx, nz = -(ez - hub[1]) / L, (ex - hub[0]) / L; off = rnd.uniform(-0.22, 0.22) * L
        q1 = (ex * 0.72 + hub[0] * 0.28 + nx * off * 0.5, ez * 0.72 + hub[1] * 0.28 + nz * off * 0.5)
        q2 = (mx + nx * off, mz + nz * off)
        pts = catmull([(ex * 1.06, ez * 1.06), q1, q2, hub], 5)
        paths.append((pts, W))
    # clearings: the hub and a few side glades with a short spur
    clear = [(hub[0], hub[1], rnd.uniform(7, 9.5))]
    for _ in range(80):
        if len(clear) >= 5: break
        cx, cz = rnd.uniform(-H + 18, H - 18), rnd.uniform(-H + 18, H - 18); r = rnd.uniform(6, 8.5)
        if any(math.hypot(cx - a, cz - b) < r + c + 14 for a, b, c in clear) or any(math.hypot(cx - e[0], cz - e[1]) < 22 for e in exits): continue
        clear.append((cx, cz, r))
        # spur to the nearest path point
        best = min(((p, math.hypot(p[0] - cx, p[1] - cz)) for pts, w in paths for p in pts), key=lambda t: t[1])[0]
        paths.append((catmull([(cx, cz), ((cx + best[0]) / 2 + rnd.uniform(-3, 3), (cz + best[1]) / 2 + rnd.uniform(-3, 3)), best], 4), W * 0.75))
    for cx, cz, r in clear: patches.append(dict(tex='grass_flowers' if f['biome'] not in ('ash', 'abyss', 'canyon') else 'dirt', shape='disc', pos=[round(cx, 2), round(cz, 2)], radius=round(r, 2), width=0))
    for pts, w in paths: patches.append(dict(tex='dirt', shape='path', pos=[round(v, 2) for p in pts for v in p], radius=0, width=round(w, 2)))
    def near_path(x, z, m):
        for pts, w in paths:
            for a, b in zip(pts, pts[1:]):
                if seg_dist(x, z, a, b) < w / 2 + m: return True
        return False
    # water: ponds (marsh / river: more, river = a chain of ponds across the map with a ford where paths cross)
    ponds = []
    want = int(round(B['water'] * (5 if f['biome'] == 'marsh' else 3)))
    if B.get('river'):
        a = rnd.uniform(0, math.pi); ux, uz = math.cos(a), math.sin(a)
        for t in [i * 7.5 - H for i in range(int(2 * H / 7.5) + 1)]:
            x, z = ux * t + rnd.uniform(-2, 2), uz * t + rnd.uniform(-2, 2); r = rnd.uniform(4.5, 6.5)
            if abs(x) > H - 4 or abs(z) > H - 4 or near_path(x, z, r + 2.5): continue
            if any(math.hypot(x - e[0], z - e[1]) < r + 8 for e in exits): continue
            ponds.append((x, z, r))
    for _ in range(300):
        if len([p for p in ponds]) >= want + (len(ponds) if B.get('river') else 0): break
        x, z, r = rnd.uniform(-H + 12, H - 12), rnd.uniform(-H + 12, H - 12), rnd.uniform(4, 8.5)
        if near_path(x, z, r + 3) or any(math.hypot(x - a, z - b) < r + c + 4 for a, b, c in clear + ponds) or any(math.hypot(x - e[0], z - e[1]) < r + 10 for e in exits): continue
        ponds.append((x, z, r))
    if f.get('lake'):                                       # one big lake off the paths
        for _ in range(400):
            x, z, r = rnd.uniform(-H + 26, H - 26), rnd.uniform(-H + 26, H - 26), rnd.uniform(14, 19)
            if near_path(x, z, r + 3) or any(math.hypot(x - a, z - b) < r + c + 3 for a, b, c in clear) or any(math.hypot(x - e[0], z - e[1]) < r + 12 for e in exits): continue
            ponds.append((x, z, r)); break
    for x, z, r in ponds: patches.append(dict(tex='water', shape='disc', pos=[round(x, 2), round(z, 2)], radius=round(r, 2), width=0))
    # monsters: spread spawners in glades and along the paths, away from the exits
    monsters = []
    spots = [c for c in clear] + [(p[0], p[1], 0) for pts, w in paths for p in pts[::4]]
    rnd.shuffle(spots)
    have = {m['id'] for m in MONS_KNOWN} if MONS_KNOWN else None
    mons_list = list(f['mons']) + [(i, c) for i, c in NEW_MONS.get(f['id'], []) if have is None or i in have]
    lo, hi = f['level']; natives = {m['id']: m['level'] for m in MONS_KNOWN} if MONS_KNOWN else {}
    normal = sorted({mid for mid, c in mons_list if c > 1}, key=lambda i: natives.get(i, 0))
    camp_lv = {mid: (round(lo + (hi - lo) * k / max(1, len(normal) - 1)) if len(normal) > 1 else (lo + hi) // 2) for k, mid in enumerate(normal)}
    for mid, cnt in mons_list:
        elite = cnt == 1
        for _ in range(200):
            x, z, _r = spots[rnd.randrange(len(spots))]
            x += rnd.uniform(-8, 8); z += rnd.uniform(-8, 8)
            if abs(x) > H - 14 or abs(z) > H - 14: continue
            if any(math.hypot(x - e[0], z - e[1]) < 20 for e in exits): continue
            if any(math.hypot(x - m['pos'][0], z - m['pos'][1]) < 22 for m in monsters): continue
            if any(math.hypot(x - a, z - b) < c + 2 for a, b, c in ponds): continue
            monsters.append(dict(monster=mid, pos=[round(x, 2), round(z, 2)], radius=9.0 if elite else round(rnd.uniform(15, 19), 1), count=cnt, spread=6.0, level=min(50, hi + 1) if elite else camp_lv[mid])); break
    # props
    mix = B['mix']; types = list(mix); weights = [mix[t] for t in types]
    SOL = {'tree', 'pine', 'rock', 'stump', 'mushroom', 'mushtree', 'ruin'}
    grid = {}
    def key(x, z): return (int(math.floor(x / 6)), int(math.floor(z / 6)))
    def crowded(x, z, d):
        i, j = key(x, z)
        for a in (-1, 0, 1):
            for b in (-1, 0, 1):
                for (px, pz) in grid.get((i + a, j + b), []):
                    if math.hypot(x - px, z - pz) < d: return True
        return False
    props = []
    def ok(x, z, need):
        if not (x0 + 1.4 < x < x1 - 1.4 and z0 + 1.4 < z < z1 - 1.4): return False
        if near_path(x, z, need + 0.5): return False
        for a, b, c in clear:
            if math.hypot(x - a, z - b) < c - 1.0 + (need if need > 0.5 else 0): return False
        for a, b, c in ponds:
            if math.hypot(x - a, z - b) < c + need + 0.4: return False
        for p in portals:
            if math.hypot(x - p['pos'][0], z - p['pos'][1]) < 6: return False
        for s in spawns:
            if math.hypot(x - s['pos'][0], z - s['pos'][1]) < 4.5: return False
        for m in monsters:
            if math.hypot(x - m['pos'][0], z - m['pos'][1]) < 2.5 + need: return False
        return True
    edge_k = B.get('edge', 2.2)
    N = int(2 * H * 2 * H * 0.115 * B["density"] * 4.2)
    for _ in range(N):
        x, z = rnd.uniform(x0, x1), rnd.uniform(z0, z1)
        e = min(x - x0, x1 - x, z - z0, z1 - z)
        dens = 0.15 + 1.25 * max(0.0, vnoise(x, z, 20, seed) - 0.25) + (edge_k * (1 - e / 12) if e < 12 else 0)
        if rnd.random() > dens * 0.45: continue
        t = rnd.choices(types, weights)[0]; solid = t in SOL
        need = 1.3 if solid else 0.3
        if not ok(x, z, need): continue
        if solid and crowded(x, z, 2.6 if t in ('tree', 'pine', 'mushtree') else 1.8): continue
        p = dict(type=t, pos=[round(x, 2), round(z, 2)], rot=round(rnd.uniform(0, 360), 1), scale=round(rnd.uniform(0.82, 1.22), 2), variant='', w=0.0, d=0.0)
        if t == 'flowers': p['variant'] = rnd.choice(['mixed', 'white', 'yellow', 'mixed'])
        mods = B.get('models', {}).get(t)
        if mods: p['model'] = rnd.choice(mods)
        props.append(p)
        if solid: grid.setdefault(key(x, z), []).append((x, z))
    # a signpost at the hub pointing the way
    props.append(dict(type='signpost', pos=[round(hub[0] + clear[0][2] * 0.6, 2), round(hub[1], 2)], rot=0.0, scale=1.0, variant='field', w=0.0, d=0.0))
    nat = dict(style='storybook_forest', seed=seed, lod='l2', grass=B['grass'])
    for k in ('ground', 'tint', 'rockTint', 'foliage'):
        if B.get(k): nat[k] = B[k]
    Z = dict(id=f['id'], name=f['name'], kind='field', bgm=B['bgm'], bounds=[x0, z0, x1, z1], groundTex=B['tex'], ambient=B['ambient'], sun=B['sun'],
             spriteTint=[1.0, 1.0, 1.0], spawns=spawns, buildings=[], props=props, npcs=[], portals=portals, heights=[], patches=patches, monsters=monsters,
             boss=dict(boss='', center=[], radius=0, gate=[], gateRadius=0, bossPos=[], respawn=0), respawnZone=f['town'], respawnSpawn='revive',
             imageArt=[], nature=nat, post=B['post'], theme=B['theme'], region=f['region'], biome=f['biome'], map=list(f['map']), level=list(f['level']))
    return Z

# ======================================================================== towns
def rect(cx, cz, w, d, h):
    a = math.radians(h); f = (math.sin(a), math.cos(a)); r = (f[1], -f[0])
    pts = []
    for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        pts.append((cx + r[0] * sx * w / 2 + f[0] * sz * d / 2, cz + r[1] * sx * w / 2 + f[1] * sz * d / 2))
    return pts
def circle(cx, cz, r, n=14): return [(cx + r * math.cos(i / n * 2 * math.pi), cz + r * math.sin(i / n * 2 * math.pi)) for i in range(n)]
def seg_rect(a, b, t):
    dx, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dz); nx, nz = -dz / L * t / 2, dx / L * t / 2
    return [(a[0] + nx, a[1] + nz), (b[0] + nx, b[1] + nz), (b[0] - nx, b[1] - nz), (a[0] - nx, a[1] - nz)]
STYLES = ['bakery', 'general', 'dress', 'arms']
HOUSE_NAMES = {'bakery': '빵집', 'general': '잡화점', 'dress': '옷가게', 'arms': '무기고'}

def gen_town(t, M):
    rnd = rng_for(t['id']); W, Dd = t['W'], t['D']; WT = 2.4
    nb = neighbours(t['id'])
    gx = 0.0; gz = -Dd                                   # gate in the south wall
    blocks = []
    def add(i, pts): blocks.append(dict(id=i, pts=[[round(x, 3), round(z, 3)] for x, z in pts]))
    walls = [dict(id='wall_n', a=[-W, Dd], b=[W, Dd], h=t['wallH'], t=WT), dict(id='wall_e', a=[W, Dd], b=[W, -Dd], h=t['wallH'], t=WT),
             dict(id='wall_w', a=[-W, Dd], b=[-W, -Dd], h=t['wallH'] * 0.8, t=WT),
             dict(id='wall_s1', a=[-W, -Dd], b=[gx - 3.9, -Dd], h=t['wallH'] * 0.6, t=WT), dict(id='wall_s2', a=[gx + 3.9, -Dd], b=[W, -Dd], h=t['wallH'] * 0.6, t=WT)]
    towers = [dict(id='tower_ne', pos=[W, Dd], r=3.3, h=t['wallH'] + 4), dict(id='tower_nw', pos=[-W, Dd], r=3.3, h=t['wallH'] + 3),
              dict(id='tower_se', pos=[W, -Dd], r=3.0, h=t['wallH'] + 1), dict(id='tower_sw', pos=[-W, -Dd], r=2.8, h=t['wallH'])]
    if W > 26: towers.append(dict(id='tower_n', pos=[-W * 0.3, Dd], r=2.6, h=t['wallH'] + 2.5))
    gate = dict(pos=[gx, gz], w=5.2, h=4.2, towers=[[gx - 4.6, gz], [gx + 4.6, gz]], tr=2.2, th=t['wallH'] * 0.85, t=WT)
    keep = dict(pos=[0.0, Dd + t['keep'][1] / 2 + 3.5], w=t['keep'][0], d=t['keep'][1], h=t['keep'][2]) if t.get('keep') else None
    for w in walls: add(w['id'], seg_rect(w['a'], w['b'], WT))
    for tw in towers: add(tw['id'], circle(*tw['pos'], tw['r'] + 0.1, 16))
    for i, p in enumerate(gate['towers']): add('gate_t%d' % i, circle(*p, gate['tr'] + 0.1, 14))
    # houses: north row facing south, west / east rows facing in
    houses, npcs = [], []
    hw, hd = 9.4, 7.8
    rows = []
    nN = max(2, int((2 * W - 8) // (hw + 1.6)))
    for i in range(nN): rows.append(('n', -W + 4 + (i + 0.5) * (2 * W - 8) / nN, Dd - WT / 2 - hd / 2 - 1.4, 180))
    nS = max(1, int((2 * Dd - 14) // (hw + 1.4)))
    for i in range(nS):
        z = -Dd + 9 + (i + 0.5) * (2 * Dd - 22) / nS
        rows.append(('w', -W + WT / 2 + hd / 2 + 1.4, z, 90)); rows.append(('e', W - WT / 2 - hd / 2 - 1.4, z, 270))
    rnd.shuffle(rows); rows = rows[:t['houses']]
    for k, (side, x, z, h) in enumerate(rows):
        st = 'arms' if t.get('smithy') and k % 3 == 0 else rnd.choice(STYLES)
        houses.append(dict(id='house%d' % k, style=st, pos=[round(x, 2), round(z, 2)], h=h, w=hw, d=hd, door=round(rnd.uniform(-1.6, 1.6), 2), name=HOUSE_NAMES[st]))
        add('house%d' % k, rect(x, z, hw - 0.2, hd - 0.2, h))
    # nothing walkable behind the rows (strip to the wall)
    add('back_n', [(-W, Dd - WT / 2 - 1.2), (W, Dd - WT / 2 - 1.2), (W, Dd), (-W, Dd)])
    add('back_w', [(-W, -Dd), (-W + WT / 2 + 1.2, -Dd), (-W + WT / 2 + 1.2, Dd), (-W, Dd)])
    add('back_e', [(W - WT / 2 - 1.2, -Dd), (W, -Dd), (W, Dd), (W - WT / 2 - 1.2, Dd)])
    # outside the south wall only the road to the warp
    oz = -Dd - 8.5
    add('out_sw', [(-W - 2, oz), (gx - 2.6, oz), (gx - 2.6, -Dd - WT / 2), (-W - 2, -Dd - WT / 2)])
    add('out_se', [(gx + 2.6, oz), (W + 2, oz), (W + 2, -Dd - WT / 2), (gx + 2.6, -Dd - WT / 2)])
    # plaza: planter (or temple garden) in the middle, market stalls, well, lanterns
    decor = [dict(type='planter', pos=[0.0, 0.0], r=3.0)]
    add('planter', circle(0, 0, 3.1, 18))
    extras = [('well', dict(r=1.5)), ('barrels', dict(r=1.1)), ('crates', dict(r=1.1)), ('hay', dict(r=1.0)), ('cart', dict(w=3.0, d=1.6, h=200))]
    if t.get('market'): extras += [('stall', dict(w=3.4, d=2.0, h=180, awning='awning_red', goods='veg')), ('stall', dict(w=3.4, d=2.0, h=180, awning='awning_green', goods='cloth')),
                                   ('stall', dict(w=3.4, d=2.0, h=180, awning='awning_blue', goods='veg'))]
    if t.get('smithy'): extras += [('barrels', dict(r=1.1)), ('crates', dict(r=1.1)), ('dummy', dict(r=0.5)), ('dummy', dict(r=0.5))]
    taken = [(0, 0, 9.0)]
    for h in houses: taken.append((h['pos'][0], h['pos'][1], 6.4))
    lanterns = [[round(7.6 * math.cos(math.radians(a)), 2), round(7.6 * math.sin(math.radians(a)), 2)] for a in (25, 75, 140, 205, 250, 320)] + [[gx - 3.8, -Dd + 3.4], [gx + 3.8, -Dd + 3.4]]
    for i, (x, z) in enumerate(lanterns): add('lantern%d' % i, circle(x, z, 0.3, 8)); taken.append((x, z, 1.5))
    for k, (ty, o) in enumerate(extras):
        for _ in range(200):
            x, z = rnd.uniform(-W + 6, W - 6), rnd.uniform(-Dd + 6, Dd - 9)
            if abs(x - gx) < 5 and z < -Dd + 10: continue                    # keep the gate road clear
            if any(math.hypot(x - a, z - b) < c + 2.6 for a, b, c in taken): continue
            d = dict(type=ty, pos=[round(x, 2), round(z, 2)]); d.update(o); decor.append(d)
            if 'w' in o: add('decor%d' % k, rect(x, z, o['w'] + 0.2, o['d'] + 0.2, o.get('h', 180)))
            else: add('decor%d' % k, circle(x, z, o['r'], 12))
            taken.append((x, z, 2.2)); break
    # story NPCs round the plaza ring, merchants by the gate road
    ang = [200, 235, 300, 335, 160, 20]
    for k, n in enumerate(t['npcs']):
        a = math.radians(ang[k % len(ang)]); r = 11.0
        x, z = r * math.cos(a), r * math.sin(a)
        npcs.append(dict(npc=n[0], pos=[round(x, 2), round(z, 2)], rot=yaw_to(-x, -z)))
        taken.append((x, z, 1.5))
    # portals: first neighbour through the gate, the others as warp circles inside the walls
    portals, spawns = [], [dict(id='start', pos=[-1.0, -10.5], rot=0.0), dict(id='revive', pos=[-2.6, -9.6], rot=0.0)]
    spots = [(-W + 7.5, -Dd + 6.5), (W - 7.5, -Dd + 6.5), (-W + 7.5, 4.0), (W - 7.5, 4.0)]
    order = sorted(nb, key=lambda n: -direction(t['id'], n, M)[1])[::-1]       # the most southern neighbour gets the gate
    for k, n in enumerate(order):
        if k == 0:
            portals.append(dict(id='to_' + n, label=name_of(n), pos=[gx, -Dd - 6.0], radius=1.7, targetZone=n, targetSpawn='from_' + t['id'], minLevel=0))
            spawns.append(dict(id='from_' + n, pos=[gx, -Dd + 3.0], rot=0.0))
        else:
            dx, dz = direction(t['id'], n, M)
            # a clear spot toward that neighbour: outside the plaza ring, >= 2.8 m from every house / keep footprint,
            # off the gate road, apart from NPCs and other warps
            def clear(x, z):
                if math.hypot(x, z) < 10.5 or abs(x - gx) < 5 and z < -Dd + 11: return False
                if not (-W + 4.5 < x < W - 4.5 and -Dd + 4.5 < z < Dd - 4.5): return False
                for h in houses:
                    if abs(x - h['pos'][0]) < h['w'] / 2 + 2.8 and abs(z - h['pos'][1]) < h['d'] / 2 + 2.8: return False
                if any(math.hypot(x - q['pos'][0], z - q['pos'][1]) < 3.2 for q in npcs): return False
                if any(math.hypot(x - lx, z - lz) < 5.0 for lx, lz in lanterns): return False
                if any(math.hypot(x - q['pos'][0], z - q['pos'][1]) < 7 for q in portals): return False
                return True
            cand = [(x * 0.5, z * 0.5) for x in range(int(-2 * W), int(2 * W) + 1) for z in range(int(-2 * Dd), int(2 * Dd) + 1) if clear(x * 0.5, z * 0.5)]
            sp = max(cand, key=lambda s: (s[0] * dx + s[1] * dz) / (math.hypot(*s) or 1) * 3 - math.hypot(*s) * 0.12) if cand else max(spots, key=lambda s: s[0] * dx + s[1] * dz)
            if sp in spots: spots.remove(sp)
            decor[:] = [d for d in decor if d['type'] == 'planter' or math.hypot(d['pos'][0] - sp[0], d['pos'][1] - sp[1]) >= 3.6]   # nothing on the circle
            blocks[:] = [b for b in blocks if not b['id'].startswith('decor') or min(math.hypot(px - sp[0], pz - sp[1]) for px, pz in b['pts']) >= 2.4]
            portals.append(dict(id='to_' + n, label=name_of(n), pos=[round(sp[0], 2), round(sp[1], 2)], radius=1.7, targetZone=n, targetSpawn='from_' + t['id'], minLevel=0))
            spawns.append(dict(id='from_' + n, pos=[round(sp[0] * 0.78, 2), round(sp[1] * 0.78 - 1.5, 2)], rot=yaw_to(-sp[0], -sp[1])))
    roads = [dict(kind='ring', pos=[0, 0], r0=5.2, r1=8.8), dict(kind='path', pts=[[gx, -Dd - 2.2], [gx, -Dd + 4], [gx * 0.5, -8.6]], w=4.4)]
    for p in portals[1:]:
        x, z = p['pos']; d = math.hypot(x, z)
        roads.append(dict(kind='path', pts=[[round(x / d * 8.6, 2), round(z / d * 8.6, 2)], [x, z]], w=3.0))
    for h in houses:
        a = math.radians(h['h']); fx, fz = math.sin(a), math.cos(a)
        ex, ez = h['pos'][0] + fx * (hd / 2 + 1.0), h['pos'][1] + fz * (hd / 2 + 1.0); d = math.hypot(ex, ez)
        roads.append(dict(kind='path', pts=[[round(ex / d * 8.6, 2), round(ez / d * 8.6, 2)], [round(ex, 2), round(ez, 2)]], w=2.6))
    grass = [dict(pts=[[-W + 1, -Dd + 1], [-W + 9, -Dd + 1], [-W + 7, -Dd + 6], [-W + 1, -Dd + 8]]), dict(pts=[[W - 1, -Dd + 1], [W - 9, -Dd + 1], [W - 7, -Dd + 6], [W - 1, -Dd + 8]])]
    canopies = [[-W + 3, Dd - 3, 6, 0.3], [W - 3, Dd - 3, 6, 1.2], [-W + 3, -Dd + 4, 5, 2.0], [W - 3, -Dd + 4, 5, 0.7]]
    town3d = dict(models=[], houses=houses, walls=walls, towers=towers, gate=gate, keep=keep, ground=dict(inner=[-W, -Dd, W, Dd], roads=roads, grass=grass),
                  decor=decor, lanterns=lanterns, rosettes=[], canopies=canopies, banner=t.get('banner', 'blue'), temple=bool(t.get('temple')))
    Z = dict(id=t['id'], name=t['name'], kind='town', bgm='bgm_arcan_town' if rnd.random() < 0.5 else 'bgm_town', bounds=[-W - 1.5, -Dd - 8.0, W + 1.5, Dd + 1.0],
             groundTex='grass', ambient=[0.56, 0.53, 0.6], sun=[1.0, 0.84, 0.62, 1.5], spriteTint=[1.0, 0.98, 0.94], spawns=spawns, buildings=[], props=[],
             npcs=npcs, portals=portals, heights=[], patches=[], monsters=[], boss=dict(boss='', center=[], radius=0, gate=[], gateRadius=0, bossPos=[], respawn=0),
             respawnZone=t['id'], respawnSpawn='revive', imageArt=[], blockPolys=blocks, town3d=town3d,
             post=dict(vignette=0.2, bloom=0.14, sat=1.2, contrast=0.3, exposure=1.02), region=t['region'], map=list(t['map']), level=list(t['level']))
    return Z

# ======================================================================== monsters / creatures / npcs
def make_variants(mons):
    base = {m['id']: m for m in mons}
    ladder = sorted([m for m in mons if not m['id'].startswith('boss') and not m.get('world')], key=lambda m: m['level'])
    def at(level, key):
        lo = max([m for m in ladder if m['level'] <= level] or ladder[:1], key=lambda m: m['level'])
        hi = min([m for m in ladder if m['level'] >= level] or ladder[-1:], key=lambda m: m['level'])
        if hi['level'] == lo['level']: return lo[key]
        k = (level - lo['level']) / (hi['level'] - lo['level']); return lo[key] + (hi[key] - lo[key]) * k
    out = []
    rows = [(vid, bid, name, lv, elite) for vid, bid, name, lv, tint, rec, elite in VARIANTS] + [(sid, ATK_BASE[atk], name, lv, elite) for sid, f, name, lv, atk, size, elite, tint in SPECIES]
    for vid, bid, name, lv, elite in rows:
        b = copy.deepcopy(base[bid]); b['id'] = vid; b['name'] = name; b['level'] = lv; b['world'] = True
        for k in ('hp', 'atk', 'exp', 'goldMin', 'goldMax'):
            v = at(lv, k) * (4.0 if elite and k == 'hp' else 1.5 if elite and k == 'atk' else 5.0 if elite and k in ('exp', 'goldMin', 'goldMax') else 1.0)
            b[k] = int(round(v))
        b['def'] = int(round(at(lv, 'def') * (1.4 if elite else 1)))
        if elite: b['respawn'] = max(b.get('respawn', 10), 90); b['detectRange'] = b.get('detectRange', 6) + 2
        out.append(b)
    return out

def creatures_js(src):
    m = re.search(r"export const CREATURES = \{(.*?)\n\};", src, re.S); body = m.group(1)
    base = {k: v for k, v in re.findall(r"\n\s*(\w+):\s*(\{[^\n]*\}),", body)}
    lines = []
    for vid, bid, name, lv, tint, rec, elite in VARIANTS:
        b = base[bid]
        b = re.sub(r",\s*tint: \[[^\]]*\]", "", b); b = re.sub(r",\s*recolor: [\d.]+", "", b)
        size = float(re.search(r"size: ([\d.]+)", b).group(1)) * (1.45 if elite else 1.0)
        b = re.sub(r"size: [\d.]+", "size: %.2f" % size, b)
        b = b.replace(" atk:", " tint: [%s], recolor: %s, atk:" % (', '.join('%.2f' % v for v in tint), rec), 1)
        lines.append("  %s: %s," % (vid, b))
    for sid, f, name, lv, atk, size, elite, tint in SPECIES:
        t = ", tint: [%s], recolor: 0.45" % ', '.join('%.2f' % v for v in tint) if tint else ''
        lines.append("  %s: { file: 'w_%s', size: %.2f, height: true, rigless: true, yaw: -90%s, atk: '%s' }," % (sid, f, size, t, atk))
    block = "  // WORLD variants (tools/world/world.py)\n" + "\n".join(lines) + "\n  // /WORLD\n"
    src = re.sub(r"  // WORLD variants \(tools/world/world.py\)\n.*?  // /WORLD\n", "", src, flags=re.S)
    return re.sub(r"(export const CREATURES = \{.*?)(\n\};)", lambda mm: mm.group(1) + "\n" + block.rstrip("\n") + mm.group(2), src, count=1, flags=re.S)

def world_npcs():
    out = []
    for t in TOWNS:
        for n in t['npcs']:
            nid, name, title, sheet, lines = n[:5]; shop = n[5] if len(n) > 5 else ''
            role = 'merchant' if shop else ('guard' if sheet == 'npc_guard' else 'elder')
            model = {'npc_guard': 'guard', 'npc_merchant': 'merchant', 'npc_elder': 'elder', 'npc_master_blacksmith': 'master_blacksmith', 'npc_master_pharmacist': 'master_pharmacist',
                     'npc_master_artist': 'master_artist', 'npc_armorer': 'armorer'}[sheet]
            out.append(dict(id=nid, name=name, title=title, sheet=sheet, model=model, role=role, shop=shop, job='', lines=lines, world=True))
    return out

# ======================================================================== existing zones: links into the new world
def link_existing(zones, M):
    byid = {z['id']: z for z in zones['zones']}
    for zid, info in EXISTING.items():
        Z = byid[zid]; Z['map'] = list(info['map']); Z['level'] = list(info['level']); Z['region'] = info['region']
        for n in neighbours(zid):
            if any(p['targetZone'] == n for p in Z['portals']): continue
            Z['portals'] = [p for p in Z['portals'] if p['id'] != 'to_' + n]; Z['spawns'] = [s for s in Z['spawns'] if s['id'] != 'from_' + n]
            if zid == 'town':
                # warp circle inside the castle courtyard: west lawn between the well and the cart, clear of every building
                Z['portals'].append(dict(id='to_' + n, label=name_of(n), pos=[-22.0, -1.0], radius=1.7, targetZone=n, targetSpawn='from_town', minLevel=0))
                Z['spawns'].append(dict(id='from_' + n, pos=[-20.6, -4.4], rot=135.0))
                continue
            x0, z0, x1, z1 = Z['bounds']; dx, dz = direction(zid, n, M)
            cx, cz = (x0 + x1) / 2, (z0 + z1) / 2; hx, hz = (x1 - x0) / 2, (z1 - z0) / 2
            k = min((hx - 6) / max(abs(dx), 1e-6), (hz - 6) / max(abs(dz), 1e-6)); ex, ez = cx + dx * k, cz + dz * k
            k2 = min((hx - 11) / max(abs(dx), 1e-6), (hz - 11) / max(abs(dz), 1e-6)); sx, sz = cx + dx * k2, cz + dz * k2
            Z['portals'].append(dict(id='to_' + n, label=name_of(n), pos=[round(ex, 2), round(ez, 2)], radius=1.8, targetZone=n, targetSpawn='from_' + zid, minLevel=0))
            Z['spawns'].append(dict(id='from_' + n, pos=[round(sx, 2), round(sz, 2)], rot=yaw_to(-dx, -dz)))
            # clear the trees round the new warp, the spawn and the line between them
            def near(p, m):
                x, z = p['pos']; return math.hypot(x - ex, z - ez) < m or math.hypot(x - sx, z - sz) < m or seg_dist(x, z, (ex, ez), (sx, sz)) < m - 2
            Z['props'] = [p for p in Z['props'] if p['type'] in ('signpost', 'wall', 'ruin') or not near(p, 7.5)]
            Z['patches'].append(dict(tex='dirt', shape='path', pos=[round(ex, 2), round(ez, 2), round(sx, 2), round(sz, 2), round(sx - dx * 8, 2), round(sz - dz * 8, 2)], radius=0, width=3.6))

# ======================================================================== main
if __name__ == '__main__':
    if '--music-only' in sys.argv:
        write_music_only()
        sys.exit(0)
    M = node_map()
    zones = json.load(open(D('assets', 'data', 'zones.json')))
    zones['zones'] = [z for z in zones['zones'] if not z.get('file')]
    link_existing(zones, M)
    mons = json.load(open(D('assets', 'data', 'monsters.json')))
    mons['monsters'] = [m for m in mons['monsters'] if not m.get('world')]
    mons['monsters'] += make_variants(mons['monsters'])
    known = {m['id'] for m in mons['monsters']}
    MONS_KNOWN = mons['monsters']
    for zid, adds in NEW_MONS_EXISTING.items():   # hand-made fields: new camps at their story level
        Z = next(z for z in zones['zones'] if z['id'] == zid); lo, hi = Z.get('level', [1, 50])
        Z['monsters'] = [m for m in Z['monsters'] if not m.get('added')]
        nat = {m['id']: m['level'] for m in mons['monsters']}
        for mid, cnt, pos in adds:
            if mid in known: Z['monsters'].append(dict(monster=mid, pos=list(pos), radius=14.0, count=cnt, spread=6.0, level=max(lo, min(hi, nat[mid])), added=True))
    out = {}
    for t in TOWNS: out[t['id']] = gen_town(t, M)
    for f in FIELDS:
        for mid, c in f['mons']: assert mid in known, mid
        out[f['id']] = gen_field(f, M, None)
    # every link must have a portal on both ends
    allz = {z['id']: z for z in zones['zones']}; allz.update(out)
    for zid, bgm in REGION_MUSIC.items():
        if zid in allz: allz[zid]['bgm'] = bgm
    for a, b in LINKS:
        assert any(p['targetZone'] == b for p in allz[a]['portals']), (a, b)
        assert any(p['targetZone'] == a for p in allz[b]['portals']), (b, a)
        assert any(s['id'] == 'from_' + b for s in allz[a]['spawns']), ('spawn', a, b)
    stubs = []
    for zid, Z in out.items():
        Z['mesh'] = build_mesh(Z)
        stubs.append(dict(id=zid, name=Z['name'], kind=Z['kind'], file='world/%s.json' % zid, map=Z['map'], level=Z['level'], region=Z['region'], biome=Z.get('biome', 'town')))
    zones['zones'] += stubs
    zones['world'] = dict(regions=REGIONS, links=[list(l) for l in LINKS], size=[1000, 760])
    npcs = json.load(open(D('assets', 'data', 'npcs.json')))
    npcs['npcs'] = [n for n in npcs['npcs'] if not n.get('world')] + world_npcs()
    cre = creatures_js(open(D('js', 'creature.js')).read())
    nprops = {k: len(v['props']) for k, v in out.items()}
    print('towns', len(TOWNS), 'new fields', len(FIELDS), 'fields total', len(FIELDS) + 5, 'links', len(LINKS))
    print('props', sum(nprops.values()), 'min/max', min(nprops.values()), max(nprops.values()))
    if '--write' in sys.argv:
        os.makedirs(D('assets', 'data', 'world'), exist_ok=True)
        for f in os.listdir(D('assets', 'data', 'world')):
            if f.endswith('.json'): os.remove(D('assets', 'data', 'world', f))
        for zid, Z in out.items(): json.dump(Z, open(D('assets', 'data', 'world', zid + '.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
        json.dump(zones, open(D('assets', 'data', 'zones.json'), 'w'), ensure_ascii=False, indent=1); open(D('assets', 'data', 'zones.json'), 'a').write('\n')
        json.dump(mons, open(D('assets', 'data', 'monsters.json'), 'w'), ensure_ascii=False, indent=1)
        json.dump(npcs, open(D('assets', 'data', 'npcs.json'), 'w'), ensure_ascii=False, indent=1)
        open(D('js', 'creature.js'), 'w').write(cre)
        print('wrote')
