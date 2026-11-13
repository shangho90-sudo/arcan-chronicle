"""Generates assets/data/skills2.json: 12 jobs x 3 categories x 5 skills = 180 skills, statuses, recipes, summons,
new craft items. Balance numbers live here (tunable) — the runtime (js/skillrt.js) only interprets them.

Skill fields: id (stable), job, tier, cat (0..2), catName, idx (1..5), name, desc, type
  (attack|support|summon|passive|craft|ultimate), maxLv, unlock, prereq[{id,lv}], weapon, target
  (enemy|ground|self|dir), range, mp, res {type,cost} | {type,gain}, cd, cast, recover, ops[], mods[], flags{},
  sfx (cast sample), sfxAt ('strike' = animation timing), sfxLead (seconds before strike),
  fx {color, anim}, status {data, impl, fx, test, play}
"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'data', 'skills2.json')
UNLOCK = {0: [1, 5, 10, 3, 7, 7, 5, 9], 1: [10, 12, 15, 18, 20], 2: [30, 33, 36, 40, 45]}
SK = []

def S(job, tier, cat, catName, idx, sid, name, typ, desc, **kw):
    d = dict(id=sid, job=job, tier=tier, cat=cat, catName=catName, idx=idx, name=name, type=typ, desc=desc,
             maxLv=3 if typ == 'ultimate' else 5, unlock=UNLOCK[tier][idx - 1], prereq=[], weapon=None,
             target='dir', range=2.0, mp=0, cd=0, cast=0.0, recover=0.35, anim='skill', ops=[], mods=[], flags={}, fx={})
    if typ == 'ultimate': d['unlock'] = max(45, d['unlock'])
    if typ == 'passive': d.update(target='self', anim=None)
    if typ == 'craft': d.update(target='self', anim=None)
    d.update(kw); SK.append(d); return d

# ---------- op helpers (all distances in metres, times in seconds) ----------
def hit(shape='single', coef=1.0, **k): return dict(op='hit', shape=shape, coef=coef, **k)
def proj(kind='normal', coef=1.0, **k): return dict(op='proj', kind=kind, coef=coef, **k)
def delay(after, r, coef, **k): return dict(op='delay', after=after, r=r, coef=coef, **k)
def area(kind, r, dur, **k): return dict(op='area', kind=kind, r=r, dur=dur, **k)
def buff(id_, dur, val=0, target='self', **k): return dict(op='buff', id=id_, dur=dur, val=val, target=target, **k)
def shield(base, coef, dur, **k): return dict(op='shield', base=base, coef=coef, dur=dur, **k)
def heal(pct=0, flat=0, **k): return dict(op='heal', pct=pct, flat=flat, **k)
def cleanse(n=1, ids=None, **k): return dict(op='cleanse', n=n, ids=ids or [], **k)
def dash(dist, **k): return dict(op='dash', dist=dist, **k)
def summon(kind, **k): return dict(op='summon', kind=kind, **k)
def consume(tag, **k): return dict(op='consume', tag=tag, **k)
def res(type_, n): return dict(op='res', type=type_, n=n)
def channel(dur, tick, ops, **k): return dict(op='channel', dur=dur, tick=tick, ops=ops, **k)
def st(id_, dur, val=0, ch=1.0): return dict(id=id_, dur=dur, val=val, ch=ch)
def custom(fn, **k): return dict(op='custom', fn=fn, **k)


# ======================================================================= 견습생 (novice) 기본 검술 — tier 0, every job keeps it
# separate point pool (1 per character level, see js/skillsys.js), unlock Lv 1 / 5 / 10 / 3 / 7 / 7(배쉬) / 5(회피율 증가) / 9(급소치기), no extra-hit rule (noExtra)
# 2026-11-10 계수(배우는 레벨 순): 일격참 2.4(Lv1)·연 0.5×2~6타(Lv5)·배쉬 2.8(Lv7)·비연참 3.4(Lv10)
# 2026-11-09: 견습생 공격 스킬은 모두 단일 대상(target='enemy', shape 'single', 비연참은 관통 없음)
J, C = 'novice', 0xcfe6ff
S(J, 0, 0, '기본 검술', 1, 'nv_a1', '일격참', 'attack', '칼을 허리춤으로 끌어당겼다가 적 하나에게 뛰어들며 한 번에 깊게 찌른다. 칼끝에서 뻗은 섬광이 닿은 적에게 별 모양 빛살이 터진다.', target='enemy', range=3.2, mp=8, cd=5, anim='nv_ilgyeok', sfx='nv_sal_cast', sfxAt='strike', sfxLead=0.1, recover=0.3,
  ops=[dict(op='lunge', dist=1.4, dur=0.14, at=-0.12),
       dict(op='fx', sal='cast', len=3.4, at=-0.10),   # '살' effect (js/salfx.js): tip gather 0.05 s, beam sword tip -> target hit point (max 3.4 m from the body) at the hit
       hit('single', 2.4, len=3.4, noExtra=True, at=0.0, knock=1.4, st=[st('stagger', 0.6)], sfx='nv_sal_hit', fx=dict(sal=True), shake=[0.24, 0.3])], fx=dict(color=C))
S(J, 0, 0, '기본 검술', 2, 'nv_a2', '연', 'attack', '적 하나를 칼로 이리저리 연속으로 벤다. 처음엔 2연타, 스킬 레벨이 오를 때마다 1타씩 늘어 최대 6연타.', target='enemy', range=2.2, mp=10, cd=6, anim='nv_yeon', sfx='nv_yeon_cast', sfxAt='strike', sfxLead=0.05, recover=0.2,
  ops=[dict(op='lunge', dist=1.0, dur=0.2, at=-0.1), dict(op='lunge', dist=0.8, dur=0.3, at=0.2),
       hit('single', 0.5, r=2.2, ang=110, hits=2, hitsPerLv=1, gap=0.13, noExtra=True, alt=True, sfx='nv_yeon_hit', fx=dict(yeon=True))], fx=dict(color=0x78dfff))   # '연' crescents: js/yeonfx.js
S(J, 0, 0, '기본 검술', 3, 'nv_a3', '비연참', 'attack', '칼을 크게 휘둘러 초승달 모양의 검풍을 날린다. 처음 닿은 적 하나를 벤다.', target='enemy', range=9, mp=14, cd=7, anim='nv_biyeon', sfx='nv_biyeon_cast', sfxAt='strike', sfxLead=0, recover=0.3,
  ops=[dict(op='lunge', dist=0.9, dur=0.18, at=-0.12), proj('normal', 3.4, sfx='nv_biyeon_hit', speed=13, range=10, w=1.3, fx='sword_wave', burst='hit_slash', biyeon=True),
       dict(op='fx', biyeon='cast', at=-0.22)], fx=dict(color=0xbfe8ff))   # 비연파 js/biyeonfx.js: fx op at the cast (wind-up, sweep, side blades = decoration); the proj = centre blade + hit
S(J, 0, 0, '기본 검술', 6, 'nv_a4', '배쉬', 'attack', '칼자루와 어깨로 적 하나를 세게 들이받아 약 2.6 m 뒤로 밀쳐 내며 피해를 준다. 무거운 몬스터도 밀려나고 잠깐 비틀거린다(보스 제외).', target='enemy', range=2.2, mp=9, cd=6, anim='attack2', sfx='nv_bash_cast', sfxAt='strike', sfxLead=0.12, recover=0.25,
  ops=[dict(op='lunge', dist=0.6, dur=0.12, at=-0.08),
       dict(op='fx', bash='cast', at=-0.24),   # 2026-11-10 배쉬 이펙트 (js/bashfx.js): tip gather + crescent on the real sword arc from the cast start
       hit('single', 2.8, noExtra=True, push=2.6, st=[st('stagger', 0.7)], sfx='nv_bash_hit', fx=dict(bash=True), shake=[0.12, 0.2])], fx=dict(color=0xffd9a0))
S(J, 0, 1, '기본 검술', 4, 'nv_p1', '회복력 증가', 'passive', '움직이지 않고 3초 동안 쉬면 3초마다 최대 체력의 일정 비율을 회복한다.',
  flags=dict(restRegen=[0.02, 0.01]))
S(J, 0, 1, '기본 검술', 5, 'nv_p2', '검수련', 'passive', '칼을 다루는 솜씨가 늘어 공격력이 조금씩 오른다.',
  mods=[dict(stat='atk', add=2, addLv=2, mul=0.02, mulLv=0.02)])
S(J, 0, 1, '기본 검술', 7, 'nv_p3', '회피율 증가', 'passive', '몸놀림이 가벼워져 몬스터의 공격을 피할 확률이 오른다. 회피율 +2%(레벨마다 +1%, 최대 +6%).',
  mods=[dict(stat='eva', add=0.02, addLv=0.01)])
S(J, 0, 1, '기본 검술', 8, 'nv_p4', '급소치기', 'passive', '적의 급소를 노려 치명타 확률이 오른다. 치명타 확률 +2%(레벨마다 +1.5%, 최대 +8%).',
  mods=[dict(stat='crit', add=0.02, addLv=0.015)])

# ======================================================================= 약사 (pharmacist) — tier 1
J, C = 'pharmacist', 0x48b080
# 2026-11-11 약사 1차 개편: 유봉 두 번 치기·전격 약병·활력제 제작·응급 복용·정화 약제·알뜰 조제 삭제 -> 천근쇄약·약병폭격·
# 아드레날린 주사·약 보호막·광역 회복진·약사 수련. 배우는 레벨 A 10/13/15/18/20, B·C 10/12/15/18/20. 새 소품·이펙트 js/pharmfx.js
# (Blender tools/blender/fx_pharm.py). 지운 스킬에 찍은 포인트는 불러올 때 돌려줌(js/skillsys.js ensureSk)
# 남은 스킬 이펙트(같은 날): 내려찍기 fx.pharm='smash', 밀어내기 'push', 던지는 약병 pharmProj(나는 약병) + burst='none' + pharm='burst'(원소별 폭발, linger = 바닥 잔상 초). 수치·판정은 그대로
# 유봉강타(2026-11-12 이름 바꿈, 예전 이름은 docs/STATUS.md) 연출(2026-11-12): 전용 동작 ph_smash(준비 0.17 s -> 타격 0.25 s, 예전과 같은 타격 시각·경직), fx op
# pharm='swing'(누른 순간부터: 유봉 끝에 청록 약력 응집 -> 반투명 상아색 마력 유봉 + 굵은 둔기 궤적), 타격 순간 'smash'(백금 섬광·금색
# 지면 고리·균열·파편·청록 약력 잔향). oneHit: 스킬 레벨 추가타(Lv 2마다 +1)를 한 방에 합침 — 총 피해는 같음(coef * (1 + 0.06 * 추가타)).
# 소리: 휘두름 ph_smash_swing(타격 0.09 s 전), 명중했을 때만 ph_smash_hit. 계수·기력·재사용·사거리·대상 수는 그대로
# 2026-11-13: 유봉강타 타격 0.25 -> 0.34 s(더 큰 마력 유봉이 조금 천천히 땅을 찍음 + 찌그러진 구덩이, js/pharmfx.js). 밀어내기 = 가로 휘두르기
# ph_sweep + 부채꼴(반지름 2.2 -> 3.0 m, 80 -> 110도) 땅 뒤집힘·흙 파편, 범위 안 모두 피해 + 밀어냄, oneHit(레벨 추가타를 한 방에 — 땅이 한 번만
# 뒤집힘, 총 피해 같음), 명중했을 때만 ph_push_hit. 약병(b1·b2·b4·b6) 동작 = 야구 투구 ph_pitch(0.24 s에 실제 손에서 약병이 떠남, 유봉은 등에)
S(J, 1, 0, '유봉 전투', 1, 'ph1_a1', '유봉강타', 'attack', '정면의 적 하나를 유봉으로 강하게 내려친다.', weapon='pestle', target='enemy', range=2.0, mp=8, cd=4, anim='ph_smash', sfx='ph_smash_swing', sfxAt='strike', sfxLead=0.09,
  ops=[dict(op='fx', pharm='swing', at=-0.34), hit('single', 2.2, oneHit=True, sfx='ph_smash_hit', fx=dict(pharm='smash'), st=[st('stagger', 0.4)])], fx=dict(color=0xffd27a))
S(J, 1, 0, '유봉 전투', 2, 'ph1_a4', '밀어내기', 'attack', '유봉을 가로로 크게 휘둘러 앞쪽 부채꼴의 땅을 뒤집는다. 범위 안의 적 모두에게 피해를 주고 뒤로 밀어낸다. 밀치기에 면역인 적에게는 추가 피해.', weapon='pestle', target='enemy', range=2.0, mp=10, cd=7, anim='ph_sweep', unlock=13, sfx='ph_smash_swing', sfxAt='strike', sfxLead=0.08,
  ops=[hit('cone', 1.4, r=3.0, ang=110, knock=7.5, vsImmune=1.6, oneHit=True, sfx='ph_push_hit', fx=dict(pharm='push'))], fx=dict(color=0xffe2a0))
S(J, 1, 0, '유봉 전투', 3, 'ph1_a3', '유봉 휘두르기', 'attack', '유봉을 들고 제자리에서 두 바퀴 돌며 주변의 적을 5번 연속으로 친다. 마지막 타격은 적을 밀쳐 낸다.', weapon='pestle', target='self', range=2.8, mp=14, cd=8, anim='ph_spin', sfx='ph_spin', sfxAt='op',
  ops=[dict(op='fx', pharm='cast', at=-0.18), hit('circle', 0.5, r=2.8, hits=5, gap=0.13, noExtra=True, swingSfx='ph_spin', fx=dict(pharm='spin'), last=dict(coef=0.8, push=2.4, shake=[0.12, 0.18], fx=dict(pharm='spin')))], fx=dict(color=0xffd27a))
S(J, 1, 0, '유봉 전투', 4, 'ph1_a6', '천근쇄약', 'attack', '거대한 황금 유봉을 불러내 지면을 내려찍는다. 넓은 범위에 450% 피해, 한가운데 적은 50% 추가 피해.', weapon='pestle', target='ground', range=6, mp=26, cd=16, anim='ph_slam',
  ops=[dict(op='fx', pharm='cast', at=-0.30), dict(op='fx', pharm='pestle', at=-0.12, fall=0.42, r=4.2), delay(0.30, 4.2, 4.5, core=0.5, coreR=1.5, sfx='ph_slam', burst='none', st=[st('stagger', 0.6)], shake=[0.32, 0.36])], fx=dict(color=0xffc040))
S(J, 1, 0, '유봉 전투', 5, 'ph1_a5', '유봉 숙련', 'passive', '유봉 기본 공격 피해와 공격 속도가 증가한다.', weapon='pestle',
  flags=dict(basicDmg=[0.06, 0.04]), mods=[dict(stat='atkSpeed', mul=0.04, mulLv=0.02)])
S(J, 1, 1, '기초 약병술', 1, 'ph1_b1', '화염 약병', 'attack', '약병을 던져 작은 폭발과 화상을 일으킨다.', target='ground', range=7, mp=12, cd=5, anim='ph_pitch', sfxAt='strike', sfxLead=0.02,
  ops=[proj('lob', 1.6, r=1.6, elem='fire', fx='flask_fire', pharmProj=True, burst='none', pharm='burst', st=[st('burn', 4, 0.12)], tag='flask')], fx=dict(color=0xff7a30))
S(J, 1, 1, '기초 약병술', 2, 'ph1_b2', '냉각 약병', 'attack', '냉기 피해와 둔화를 준다.', target='ground', range=7, mp=12, cd=6, anim='ph_pitch', sfxAt='strike', sfxLead=0.02,
  ops=[proj('lob', 1.4, r=1.8, elem='ice', fx='flask_ice', pharmProj=True, burst='none', pharm='burst', linger=3, st=[st('slow', 3, 0.35)], tag='flask')], fx=dict(color=0x7ad0ff))
S(J, 1, 1, '기초 약병술', 3, 'ph1_b6', '약병폭격', 'attack', '하늘에서 약병 10개를 차례로 떨어뜨린다. 약병마다 화염(화상)·냉기(둔화)·독 중 하나가 무작위로 터진다.', target='ground', range=7, mp=22, cd=14, anim='ph_pitch',
  ops=[custom('flask_rain', n=10, gap=0.2, r=3.4, blast=1.5, coef=0.6, fall=0.5, at=0.05, tag='flask', sfx='ph_flask')], fx=dict(color=0xd080ff))
S(J, 1, 1, '기초 약병술', 4, 'ph1_b4', '부식 약병', 'attack', '지속 피해와 방어력 감소를 남긴다.', target='ground', range=7, mp=14, cd=8, anim='ph_pitch', sfxAt='strike', sfxLead=0.02,
  ops=[proj('lob', 0.8, r=1.8, elem='acid', fx='flask_acid', pharmProj=True, burst='none', pharm='burst', linger=5, st=[st('poison', 5, 0.15), st('defdown', 5, 0.2)], tag='flask')], fx=dict(color=0x8ad040))
S(J, 1, 1, '기초 약병술', 5, 'ph1_b5', '정확한 투척', 'passive', '약병 사거리가 늘고 폭발 중심의 적이 추가 피해를 받는다.', flags=dict(throwRange=[1.0, 0.5], centerBonus=[0.15, 0.05]))
S(J, 1, 2, '조제와 응급처치', 1, 'ph1_c1', '회복제 제작', 'craft', '약초와 빈 병으로 HP 회복제를 만든다.')
S(J, 1, 2, '조제와 응급처치', 2, 'ph1_c7', '약 보호막', 'support', '약효로 몸을 감싸 8초 동안 최대 체력의 25%(레벨마다 +3%)만큼 피해를 막는 보호막을 만들고, 그동안 상태이상에 걸리지 않는다(걸려 있던 것도 풀림).', target='self', mp=16, cd=20, anim='cast', sfx='ph_shield', sfxAt='strike',
  ops=[shield(0, 0, 8, pctMaxHp=0.25, pctLv=0.03, noAura=True), buff('immune', 8, 1, fixed=True, noAura=True), dict(op='fx', pharm='shield', dur=8)], fx=dict(color=0x7ad0ff))
S(J, 1, 2, '조제와 응급처치', 3, 'ph1_c6', '아드레날린 주사', 'support', '아드레날린을 주사해 15초 동안 이동 속도 20%, 공격 속도 25%가 오른다(레벨마다 각각 +2%, +2.5%).', target='self', mp=12, cd=30, anim='cast', sfx='ph_adrenaline', sfxAt='strike',
  ops=[buff('haste', 15, 0.20, fixed=True, valLv=0.02, noAura=True), buff('aspdup', 15, 0.25, fixed=True, valLv=0.025, noAura=True), dict(op='fx', pharm='syringe', dur=15)], fx=dict(color=0xff8040))
S(J, 1, 2, '조제와 응급처치', 4, 'ph1_c8', '광역 회복진', 'support', '바닥에 녹색 회복진을 펼친다. 8초 동안 진 안의 아군(나와 소환수)이 1초마다 최대 체력의 4%씩 회복한다.', target='self', mp=20, cd=24, anim='cast', sfx='ph_heal', sfxAt='strike',
  ops=[area('heal', 3.6, 8, heal=0.04, tick=1.0, atSelf=True, fx='none', pharm='circle', music='bgm_ph_heal_bed')], fx=dict(color=0x60e090))
S(J, 1, 2, '조제와 응급처치', 5, 'ph1_c9', '약사 수련', 'passive', '약을 다루며 몸과 마음을 단련한다. 속성 저항(화상·독·냉기 등 속성 피해와 그 지속 시간 감소)·마법력·최대 기력이 오른다.',
  mods=[dict(stat='elemRes', add=0.06, addLv=0.03), dict(stat='matk', mul=0.05, mulLv=0.03), dict(stat='maxSp', mul=0.06, mulLv=0.03)])

# ======================================================================= 양약사 (western_pharmacist)
J, C = 'western_pharmacist', 0x5aa0ff
S(J, 2, 0, '고급 약 마법', 1, 'wp_a1', '작열 캡슐', 'attack', '대상에 캡슐을 붙인 뒤 지연 폭발시킨다. 화상과 반응 표식 부여.', target='enemy', range=7, mp=22, cd=7, anim='throw',
  ops=[proj('normal', 0.6, fx='capsule', speed=14, attach=True), delay(1.2, 2.0, 2.8, elem='fire', burst='explosion_fire', onTarget=True, st=[st('burn', 4, 0.15)], mark=dict(type='reaction', n=1))], fx=dict(color=0xff6a3a))
S(J, 2, 0, '고급 약 마법', 2, 'wp_a2', '극저온 앰플', 'attack', '얼음 결정 범위 공격. 이미 둔화된 일반 적은 짧게 빙결된다.', target='ground', range=7, mp=24, cd=8, anim='throw',
  ops=[proj('lob', 2.4, r=2.4, elem='ice', fx='ampoule', burst='ice_crystal', st=[st('slow', 3, 0.4)], vsStatus=dict(id='slow', st=st('freeze', 1.2)), mark=dict(type='reaction', n=1))], fx=dict(color=0x8ae0ff))
S(J, 2, 0, '고급 약 마법', 3, 'wp_a3', '전도성 약액', 'attack', '직선으로 관통하는 전기 약액을 발사하고 표식을 남긴다.', range=9, mp=24, cd=7, anim='cast',
  ops=[hit('line', 2.6, len=9, w=1.2, elem='shock', fx=dict(beam='lightning'), mark=dict(type='reaction', n=1))], fx=dict(color=0xffe060))
S(J, 2, 0, '고급 약 마법', 4, 'wp_a4', '삼중 처방', 'attack', '화염·냉기·전격 약탄을 차례로 쏜다. 같은 적이 세 속성에 모두 맞으면 추가 폭발.', target='enemy', range=8, mp=30, cd=10, anim='throw',
  ops=[proj('normal', 1.0, elem='fire', fx='flask_fire', speed=13, burst='explosion_fire', tri='fire'), proj('normal', 1.0, at=0.18, elem='ice', fx='flask_ice', speed=13, burst='explosion_ice', tri='ice'),
       proj('normal', 1.0, at=0.36, elem='shock', fx='flask_shock', speed=13, burst='explosion_shock', tri='shock'), custom('triple_check', coef=2.5, r=2.2)], fx=dict(color=0xffffff))
S(J, 2, 0, '고급 약 마법', 5, 'wp_a5', '제약 마도포', 'ultimate', '관통 광선을 쏘고 끝 지점에서 대형 폭발을 일으킨다.', range=12, mp=70, cd=60, cast=0.9, anim='cast',
  ops=[dict(op='telegraph', shape='line', len=12, w=2.0, dur=0.9), hit('line', 6.0, len=12, w=2.0, elem='light', fx=dict(beam='laser')), delay(0.25, 3.6, 7.0, atEnd=True, burst='explosion_big', elem='fire')], fx=dict(color=0x9ad8ff))
S(J, 2, 1, '표식과 연쇄 반응', 1, 'wp_b1', '반응 촉진', 'support', '일정 시간 표식 부여량이 늘고, 1차 약병도 표식을 남긴다.', target='self', mp=20, cd=20, anim='cast',
  ops=[buff('catalyst', 10, 1)])
S(J, 2, 1, '표식과 연쇄 반응', 2, 'wp_b2', '표적 처방', 'support', '지정한 적의 표식 축적량과 표식 폭발 피해를 강화한다.', target='enemy', range=9, mp=16, cd=14, anim='cast',
  ops=[hit('single', 0.0, st=[st('prescribed', 10, 0.5)], fx=dict(burst='mark_pop'))])
S(J, 2, 1, '표식과 연쇄 반응', 3, 'wp_b3', '연쇄 약병 폭발', 'attack', '대상의 표식을 터뜨려 주변 표식 보유 적에게 폭발을 전파한다. 적마다 한 번만 발동.', target='enemy', range=8, mp=26, cd=9, anim='cast',
  ops=[custom('mark_chain', coef=1.6, perStack=0.6, range=5)])
S(J, 2, 1, '표식과 연쇄 반응', 4, 'wp_b4', '잔류 반응', 'passive', '표식 폭발 자리에 지속 피해 영역이 남는다. 잔류 피해는 표식을 만들지 않는다.', flags=dict(residue=[0.25, 0.08]))
S(J, 2, 1, '표식과 연쇄 반응', 5, 'wp_b5', '임계 반응', 'ultimate', '범위 안의 모든 표식을 소비해 대폭발을 일으킨다. 소비량이 많을수록 강해진다.', target='self', range=0, mp=60, cd=50, cast=0.6, anim='cast',
  ops=[dict(op='telegraph', shape='circle', r=6, dur=0.6), custom('critical_mass', r=6, coef=3.0, perStack=0.8, cap=15)])
S(J, 2, 2, '전문 조제와 생존', 1, 'wp_c1', '고급 회복제 제작', 'craft', '농축 HP 회복제를 만든다.')
S(J, 2, 2, '전문 조제와 생존', 2, 'wp_c2', '지속 방출 제제', 'craft', '지속 HP 또는 MP 회복 제제를 만든다.')
S(J, 2, 2, '전문 조제와 생존', 3, 'wp_c3', '광역 분무 치료', 'support', '자신과 생명체 소환물을 회복하는 치유 안개를 뿌린다.', target='self', mp=28, cd=18, anim='cast',
  ops=[area('heal', 3.5, 6, tick=1.0, heal=0.03, fx='healing_mist', follow=False, living=True)])
S(J, 2, 2, '전문 조제와 생존', 4, 'wp_c4', '응급 보호막', 'support', '피해를 흡수하는 보호막. 체력이 낮을수록 강해진다.', target='self', mp=22, cd=16, anim='cast',
  ops=[shield(40, 1.2, 8, lowHp=1.0)])
S(J, 2, 2, '전문 조제와 생존', 5, 'wp_c5', '생명 보존 처방', 'passive', '치명적인 피해를 받으면 소량의 HP를 남기고 보호막을 만든다. (내부 쿨타임 120초)', flags=dict(cheatDeath=[0.15, 0.05]))

# ======================================================================= 한약사 (herbalist)
J, C = 'herbalist', 0x6ac040
S(J, 2, 0, '약초와 보양', 1, 'hb_a1', '보양탕 달이기', 'craft', '최대 HP와 자연 회복을 높이는 탕약을 만든다.')
S(J, 2, 0, '약초와 보양', 2, 'hb_a2', '기력 순환', 'support', '자신과 주변 소환물의 이동 속도를 높이고 자신의 MP 회복을 강화한다.', target='self', mp=18, cd=20, anim='cast',
  ops=[buff('haste', 8, 0.2, target='all'), buff('mpregen', 8, 4)])
S(J, 2, 0, '약초와 보양', 3, 'hb_a3', '금강 약초', 'support', '방어력과 경직 저항을 강화한다.', target='self', mp=18, cd=22, anim='cast', ops=[buff('defup', 10, 0.3), buff('ccres', 10, 0.5)])
S(J, 2, 0, '약초와 보양', 4, 'hb_a4', '정화의 약초밭', 'support', '주기적으로 회복하고 상태이상을 정화하는 영역을 만든다.', target='ground', range=6, mp=30, cd=24, anim='cast',
  ops=[area('heal', 3.0, 8, tick=1.5, heal=0.025, cleanse=True, fx='herb_field', herb=True, living=True)])
S(J, 2, 0, '약초와 보양', 5, 'hb_a5', '백초대환', 'ultimate', '즉시 크게 회복한 뒤 공격·방어·회복 효과를 강화한다.', target='self', mp=60, cd=60, cast=0.5, anim='cast',
  ops=[heal(pct=0.35), buff('atkup', 12, 0.25), buff('defup', 12, 0.3), buff('healup', 12, 0.3), dict(op='fx', burst='heal', r=3)])
S(J, 2, 1, '식물과 영물 소환', 1, 'hb_b1', '가시덩굴 소환', 'summon', '적을 속박하고 반복 공격하는 가시덩굴을 소환한다.', target='ground', range=7, mp=24, cd=10, anim='cast',
  ops=[summon('vine', ai='static_melee', life=10, hp=0.6, coef=0.6, rate=1.0, range=2.2, onHit=[st('root', 1.2)], limit=2, living=True)])
S(J, 2, 1, '식물과 영물 소환', 2, 'hb_b2', '독초 화원', 'summon', '독성 포자를 뿌리는 지속 피해 영역을 만든다.', target='ground', range=7, mp=26, cd=14, anim='cast',
  ops=[area('dmg', 2.8, 8, tick=1.0, coef=0.45, elem='poison', st=[st('poison', 3, 0.1)], fx='poison_garden', herb=True)])
S(J, 2, 1, '식물과 영물 소환', 3, 'hb_b3', '약초 정령', 'summon', '잎 투사체로 공격하고 주기적으로 주인을 회복하는 정령.', target='self', mp=28, cd=20, anim='cast',
  ops=[summon('herb_spirit', ai='follow_ranged', life=30, hp=0.5, coef=0.7, rate=1.4, range=7, proj='leaf', healOwner=0.03, healEvery=4, limit=1, living=True, fly=True)])
S(J, 2, 1, '식물과 영물 소환', 4, 'hb_b4', '고목 수호령', 'summon', '적의 주의를 끌고 뿌리로 범위 공격하는 고목 수호령.', target='ground', range=6, mp=34, cd=28, anim='cast',
  ops=[summon('tree_guardian', ai='taunt_aoe', life=20, hp=2.5, coef=1.0, rate=2.2, range=2.6, taunt=True, limit=1, living=True)])
S(J, 2, 1, '식물과 영물 소환', 5, 'hb_b5', '신령의 숲', 'ultimate', '넓은 둔화 영역을 펼치고 식물 소환물을 강화한다.', target='self', mp=70, cd=70, cast=0.8, anim='cast',
  ops=[dict(op='telegraph', shape='circle', r=7, dur=0.8), area('slow', 7, 12, tick=1.0, coef=0.3, st=[st('slow', 1.5, 0.45)], fx='forest_sanctum', empowerSummons=0.5)])
S(J, 2, 2, '음양오행 공격', 1, 'hb_c1', '목행·청룡덩굴', 'attack', '직선으로 관통하는 덩굴. 속박된 적에게 추가 피해.', range=9, mp=20, cd=6, anim='cast',
  ops=[hit('line', 2.4, len=9, w=1.2, elem='wood', vsStatus=dict(id='root', mul=1.6), fx=dict(beam='vine_line'))], fx=dict(color=0x4ac060))
S(J, 2, 2, '음양오행 공격', 2, 'hb_c2', '화행·주작염', 'attack', '불새 투사체가 날아가 범위 폭발과 화상을 일으킨다.', target='ground', range=9, mp=24, cd=8, anim='cast',
  ops=[proj('normal', 2.6, r=2.2, speed=11, elem='fire', fx='firebird', burst='explosion_fire', st=[st('burn', 4, 0.15)], toGround=True)], fx=dict(color=0xff5a2a))
S(J, 2, 2, '음양오행 공격', 3, 'hb_c3', '토행·황토진', 'attack', '지면 범위 공격. 영역 안의 자신은 받는 피해가 줄어든다.', target='ground', range=6, mp=24, cd=10, anim='cast',
  ops=[hit('circle', 2.2, r=2.6, atAim=True, elem='earth', fx=dict(burst='dust')), area('ward', 2.6, 6, tick=0.5, selfBuff=('dmgreduce', 0.25), fx='earth_seal')], fx=dict(color=0xd8a040))
S(J, 2, 2, '음양오행 공격', 4, 'hb_c4', '금행·백호침', 'attack', '부채꼴로 금빛 침을 날린다. 중심의 적이 여러 번 맞으면 방어력이 감소한다.', range=6, mp=22, cd=7, anim='cast',
  ops=[hit('cone', 0.6, r=6, ang=50, hits=4, gap=0.06, elem='metal', centerStack=dict(n=3, st=st('defdown', 5, 0.2)), fx=dict(slash='fan_needles'))], fx=dict(color=0xffd860))
S(J, 2, 2, '음양오행 공격', 5, 'hb_c5', '수행·현무파', 'attack', '물결로 밀치고 둔화시킨다. 통과한 약초 영역의 지속시간을 조금 늘린다(최대 +4초).', range=8, mp=24, cd=9, anim='cast',
  ops=[hit('line', 1.8, len=8, w=2.4, elem='water', knock=2.5, st=[st('slow', 3, 0.35)], extendHerb=2.0, extendCap=4.0, fx=dict(beam='water_wave'))], fx=dict(color=0x4aa0ff))

# ======================================================================= 요리사 (cook)
J, C = 'cook', 0xff9a40
# 2026-11-13 요리사 개편(식칼 썰기·팬 강타·미트볼 던지기) — 이펙트 js/cookfx.js (Blender tools/blender/fx_cook.py), 동작 ck_chop / ck_pan.
# 기력·재사용·사거리는 그대로. 총 피해 계수도 예전 규칙 그대로(split: 타수·개수가 늘어도 총합 = coef × 기본 타수 × (1 + 0.06 × ⌊(Lv-1)/2⌋)를 고르게 나눔).
# 식칼 썰기: 캐릭터는 한 번 썰고(ck_chop 0.22 s) 허공의 큰 식칼이 대상 위에서 2~6번 썬다(Lv마다 +1, 0.12 s 간격, 타마다 피해).
S(J, 1, 0, '식칼과 프라이팬', 1, 'ck1_a1', '식칼 썰기', 'attack', '칼을 한 번 내리치면 허공에 나타난 큰 식칼이 적 하나를 채소 썰듯 연달아 썬다. 처음엔 2연타, 스킬 레벨이 오를 때마다 1타씩 늘어 최대 6연타.', weapon='knife', target='enemy', range=1.8, mp=6, cd=3, anim='ck_chop',
  ops=[dict(op='fx', cook='knife', at=-0.22, gap=0.12), hit('single', 1.0, hits=2, hitsPerLv=1, gap=0.12, split=True, noStretch=True, sfx='hit', fx=dict(cook='chop'))], fx=dict(color=0xe8f4ff))
# 팬 강타: 대상 머리 위에 큰 프라이팬이 나타나 0.30 s에 내리찍음. 기절 3초(새 상태 stun — 보스는 경직과 같이 면역). 레벨 추가타는 한 방에 합침(oneHit, 총 피해 같음).
S(J, 1, 0, '식칼과 프라이팬', 2, 'ck1_a2', '팬 강타', 'attack', '공중에 커다란 프라이팬을 불러내 적 하나를 내리찍는다. 맞은 적은 3초 동안 기절한다(보스 제외).', weapon='knife', target='enemy', range=1.8, mp=10, cd=6, anim='ck_pan',
  ops=[dict(op='fx', cook='pan', at=-0.30, fall=0.30), hit('single', 2.3, oneHit=True, stOnHit=True, st=[st('stun', 3)], sfx='heavy', fx=dict(cook='pan'))], fx=dict(color=0xffc070))
# 2026-11-13 남은 스킬 연출(수치 그대로): 이름 그대로의 큰 주방 도구가 나타남 — js/cookfx.js. fx op의 at = -(동작의 타격 시각: attack 0.25, throw 0.167).
S(J, 1, 0, '식칼과 프라이팬', 3, 'ck1_a3', '뒤집기', 'attack', '큰 뒤집개로 적 하나를 부침개처럼 퍼 올려 뒤집는다. 일반 적은 잠시 떠서 움직이지 못하고, 띄울 수 없는 적에게는 추가 피해.', weapon='knife', target='enemy', range=1.8, mp=12, cd=8, anim='attack',
  ops=[dict(op='fx', cook='flip', at=-0.25), hit('single', 1.5, launch=0.8, vsImmune=1.6, sfx='ck_flip', fx=dict(cook='flip'))], fx=dict(color=0xffd27a))
S(J, 1, 0, '식칼과 프라이팬', 4, 'ck1_a4', '도마 방어', 'support', '커다란 도마를 방패처럼 세워 정면에서 받는 피해를 줄인다.', target='self', mp=10, cd=14, anim='cast', sfxAt='op', ops=[buff('frontguard', 5, 0.5, cook='board', noAura=True)])
S(J, 1, 0, '식칼과 프라이팬', 5, 'ck1_a5', '손질 숙련', 'passive', '식칼 공격 속도와 식재료 획득량이 증가한다.', mods=[dict(stat='atkSpeed', mul=0.05, mulLv=0.02)], flags=dict(ingredientDrop=[0.1, 0.05]))
# 미트볼 던지기: 미트볼 2~6개(Lv마다 +1)가 0.09 s 간격으로 조금씩 벌어져 포물선으로 날아가 같은 대상에 차례로 떨어짐. 하나하나가 예전처럼 반경 1.2 m 작은 범위 피해.
S(J, 1, 1, '간단한 요리 공격', 1, 'ck1_b1', '미트볼 던지기', 'attack', '미트볼 여러 개를 연달아 던진다. 하나하나가 부딪힌 자리에 작은 범위 피해를 준다. 처음엔 2개, 스킬 레벨이 오를 때마다 1개씩 늘어 최대 6개.', target='enemy', range=7, mp=10, cd=4, anim='throw',
  ops=[proj('normal', 1.7, count=2, countPerLv=1, split=True, gap=0.09, r=1.2, speed=12, arc=0.9, spread=0.32, cook='meatball', burst='none', sfx='hit', sfxOnHit=True)], fx=dict(color=0xb06a3a))
S(J, 1, 1, '간단한 요리 공격', 2, 'ck1_b2', '뜨거운 국물', 'attack', '큰 국자로 펄펄 끓는 국물을 전방 부채꼴로 끼얹어 피해와 화상을 준다.', range=3.2, mp=12, cd=6, anim='throw', sfx='swing',
  ops=[dict(op='fx', cook='soup', at=-0.167), hit('cone', 1.5, r=3.2, ang=60, elem='fire', st=[st('burn', 3, 0.12)], sfx='ck_soup', fx=dict(cook='soup'))], fx=dict(color=0xff9a2a))
S(J, 1, 1, '간단한 요리 공격', 3, 'ck1_b3', '후추 뿌리기', 'attack', '큰 후추통을 흔들어 후춧가루를 뿌린다. 범위 피해와 함께 재채기하는 적의 공격력을 낮춘다.', target='ground', range=5, mp=12, cd=8, anim='throw',
  sfx='ck_pepper', ops=[dict(op='fx', cook='pepper', at=-0.167), hit('circle', 1.2, r=2.2, atAim=True, st=[st('atkdown', 5, 0.2)], fx=dict(cook='pepper'))], fx=dict(color=0x9a8468))
S(J, 1, 1, '간단한 요리 공격', 4, 'ck1_b4', '밀가루 구름', 'support', '밀가루 포대를 터뜨려 적을 둔화시키는 밀가루 구름을 깔아 둔다.', target='ground', range=6, mp=14, cd=12, anim='throw', sfx='throw',
  ops=[dict(op='fx', cook='sack', at=-0.167), area('slow', 2.6, 6, tick=0.5, st=[st('slow', 1.0, 0.4)], fx='none', cook='flour')], fx=dict(color=0xffffff))
S(J, 1, 1, '간단한 요리 공격', 5, 'ck1_b5', '꼬치 찌르기', 'attack', '커다란 꼬치로 가까운 직선상의 적을 한꺼번에 꿰뚫는다.', range=3.5, mp=10, cd=5, anim='attack', sfx='swing',
  ops=[dict(op='fx', cook='skewer', at=-0.25), hit('line', 1.9, len=3.5, w=1.0, sfx='ck_skewer', fx=dict(cook='skewer'))], fx=dict(color=0xe8f4ff))
S(J, 1, 2, '식사와 기초 조리', 1, 'ck1_c1', '간단한 도시락', 'craft', '비전투용 HP 회복 음식을 만든다.')
S(J, 1, 2, '식사와 기초 조리', 2, 'ck1_c2', '따뜻한 수프', 'craft', '지속 HP 회복 음식을 만든다.')
S(J, 1, 2, '식사와 기초 조리', 3, 'ck1_c3', '든든한 한 끼', 'support', '준비된 음식을 먹어 최대 HP를 일시적으로 높인다.', target='self', mp=0, cd=30, anim='cast',
  sfxAt='op', ops=[consume('food', cook='meal', ops=[buff('maxhp', 30, 0.15)])])
S(J, 1, 2, '식사와 기초 조리', 4, 'ck1_c4', '간식 시간', 'support', '간식을 먹어 조금 회복하고 잠깐 빨라진다.', target='self', mp=0, cd=15, anim='cast',
  sfxAt='op', ops=[consume('food', cook='snack', ops=[heal(pct=0.08), buff('haste', 4, 0.25)])])
S(J, 1, 2, '식사와 기초 조리', 5, 'ck1_c5', '알뜰한 손질', 'passive', '요리 제작에 쓴 일반 식재료 일부를 확률적으로 돌려받는다.', flags={'craftReturn:food': [0.10, 0.05]})

# ======================================================================= 쉐프 (chef) — temperature contrast
J, C = 'chef', 0xff6a30
S(J, 2, 0, '화염 조리', 1, 'cf_a1', '화염 볶음', 'attack', '전방에 불꽃과 식재료를 흩뿌려 범위 공격.', range=3.6, mp=22, cd=6, anim='attack',
  ops=[hit('cone', 2.6, r=3.6, ang=80, elem='fire', temp=+1, st=[st('burn', 3, 0.12)], fx=dict(slash='fire_cone'))])
S(J, 2, 0, '화염 조리', 2, 'cf_a2', '플람베', 'attack', '범위에 불길을 일으킨다. 냉각된 적에게는 증기 폭발이 추가된다.', target='ground', range=6, mp=26, cd=9, anim='cast',
  ops=[hit('circle', 2.8, r=2.6, atAim=True, elem='fire', temp=+1, st=[st('burn', 4, 0.15)], react=dict(need='chilled', coef=2.0, r=2.0, burst='explosion_steam'), fx=dict(burst='explosion_fire'))])
S(J, 2, 0, '화염 조리', 3, 'cf_a3', '압력솥 폭발', 'summon', '압력솥을 설치해 지연 폭발로 밀치고 화상 영역을 남긴다.', target='ground', range=6, mp=26, cd=14, anim='cast',
  ops=[summon('pressure_cooker', ai='bomb', life=2.0, hp=0.4, fuse=2.0, boom=dict(r=2.8, coef=4.0, elem='fire', knock=3, burst='explosion_fire', area=dict(kind='dmg', r=2.4, dur=4, tick=1, coef=0.3, fx='fire', st=[st('burn', 2, 0.1)])), limit=2, machine=True)])
S(J, 2, 0, '화염 조리', 4, 'cf_a4', '불꽃 꼬치 행진', 'attack', '지면에서 불타는 꼬치가 순서대로 솟아오른다.', range=9, mp=28, cd=10, anim='cast',
  ops=[custom('march', n=6, step=1.4, r=1.2, coef=1.1, gap=0.12, elem='fire', fx='skewer_row', temp=+1)])
S(J, 2, 0, '화염 조리', 5, 'cf_a5', '지옥의 오픈 키친', 'ultimate', '팬·꼬치·솥 연속 공격 뒤 대폭발.', target='self', mp=75, cd=70, cast=0.6, anim='cast',
  ops=[dict(op='telegraph', shape='circle', r=5, dur=0.6), hit('circle', 1.6, r=4, hits=3, gap=0.3, elem='fire', fx=dict(slash='spin')), custom('march', n=8, step=0.0, ring=4, r=1.2, coef=1.0, gap=0.08, elem='fire', fx='skewer_row', at=1.0), delay(2.0, 5.0, 8.0, burst='explosion_big', elem='fire', self=True)])
S(J, 2, 1, '냉채와 디저트', 1, 'cf_b1', '소르베 탄환', 'attack', '냉기 탄환을 연속으로 쏘며 둔화를 쌓는다.', target='enemy', range=8, mp=20, cd=5, anim='throw',
  ops=[proj('normal', 0.8, count=4, gap=0.12, speed=16, elem='ice', fx='sorbet', burst='explosion_ice', temp=-1, st=[st('slow', 2, 0.12)], stackSlow=True)])
S(J, 2, 1, '냉채와 디저트', 2, 'cf_b2', '급속 냉동', 'attack', '범위를 얼린다. 화상 상태의 적은 추가 피해 후 화상이 사라진다.', target='ground', range=6, mp=26, cd=9, anim='cast',
  ops=[hit('circle', 2.4, r=2.6, atAim=True, elem='ice', temp=-1, st=[st('slow', 3, 0.4)], react=dict(need='burn', coef=2.2, consume='burn', burst='explosion_steam'), fx=dict(burst='ice_crystal'))])
S(J, 2, 1, '냉채와 디저트', 3, 'cf_b3', '얼음 접시', 'attack', '관통하며 왕복하는 얼음 접시를 던진다.', range=8, mp=22, cd=7, anim='throw',
  ops=[proj('boomerang', 1.8, speed=12, range=8, pierce=True, elem='ice', fx='ice_plate', temp=-1)])
S(J, 2, 1, '냉채와 디저트', 4, 'cf_b4', '설탕 유리벽', 'summon', '이동과 투사체를 막는 설탕 유리벽. 부서지면 파편 피해.', target='ground', range=5, mp=24, cd=18, anim='cast',
  ops=[summon('sugar_wall', ai='wall', life=8, hp=1.5, width=3.0, onBreak=dict(r=2.4, coef=1.6, burst='shield_break'), limit=2, machine=True)])
S(J, 2, 1, '냉채와 디저트', 5, 'cf_b5', '겨울의 디저트 궁전', 'ultimate', '대형 빙과 장식으로 냉각한 뒤 파편 폭발.', target='self', mp=75, cd=70, cast=0.8, anim='cast',
  ops=[dict(op='telegraph', shape='circle', r=6, dur=0.8), area('slow', 6, 3, tick=0.5, coef=0.4, elem='ice', st=[st('slow', 1, 0.5)], fx='frost', temp=-1), delay(2.6, 6, 7.0, burst='ice_crystal', elem='ice', self=True, st=[st('freeze', 1.5)])])
S(J, 2, 2, '만찬과 회복', 1, 'cf_c1', '특제 코스 요리', 'craft', '공격·방어·회복 계열 고급 음식을 만든다.')
S(J, 2, 2, '만찬과 회복', 2, 'cf_c2', '생명의 스튜', 'support', '냄비를 놓아 주변을 회복하는 영역을 만든다.', target='ground', range=4, mp=28, cd=22, anim='cast',
  ops=[area('heal', 3.0, 8, tick=1.0, heal=0.025, fx='healing_mist', prop='cooking_pot', living=True)])
S(J, 2, 2, '만찬과 회복', 3, 'cf_c3', '전투 배식', 'support', '요리를 먹어 즉시 회복하고 음식 효과를 잠시 증폭한다.', target='self', mp=10, cd=20, anim='cast',
  ops=[consume('food', ops=[heal(pct=0.15), buff('foodup', 10, 0.5)])])
S(J, 2, 2, '만찬과 회복', 4, 'cf_c4', '완벽한 레시피', 'passive', '직접 만든 음식의 지속시간과 회복량이 증가한다.', mods=[dict(stat='foodPower', add=0.1, addLv=0.05)])
S(J, 2, 2, '만찬과 회복', 5, 'cf_c5', '왕실의 풀코스', 'ultimate', '보호막 → 공격 강화 → 큰 회복을 순서대로 제공한다.', target='self', mp=65, cd=75, cast=0.4, anim='cast',
  ops=[shield(80, 2.0, 8), buff('atkup', 10, 0.3, at=1.5), heal(pct=0.4, at=3.0)])

# ======================================================================= 대장장이 (blacksmith)
J, C = 'blacksmith', 0xff8a30
# 2026-11-13 대장장이 1차 전면 개편(스킬 id·배우는 레벨·5단계는 그대로 — 저장한 습득 레벨·장착 칸이 그대로 새 스킬이 됨):
#   A 단조와 제압: 모루 떨구기 · 집게 낚아채기 · 불량품 판정 · 백련타 · 장인의 박자(패시브)
#   B 열처리와 반격: 급랭 담금질 · 접이식 철벽 · 용광로 개방 · 즉석 리벳 · 충격 재활용(패시브)
#   C 장인의 제작: 제작 4종은 그대로 + 재료 회수·알뜰 공급의 전투용 고철(임시 자원)
# 규칙·수치는 flags `smith`(js/smith.js SMITH가 기본값, 여기 값이 덮어씀)와 op 필드. 가열(heat, 최대 3중첩·5초, 더하면 시간 갱신)·
# 낙인(brand)은 STATUSES. 파생 피해(모루 충격파·급랭 번짐·낙인 파괴·리벳 추가타·충격 방출)는 derived — 가열·낙인·모루·충전을 다시 일으키지 않음.
# 타격 정지는 시전자·대상만(freezeT, op quiet), 카메라는 Renderer.kick 한 번. 이펙트 js/smithfx.js, 메시 tools/blender/fx_smith.py.
SM = dict(quiet=True, stOnHit=True)
S(J, 1, 0, '단조와 제압', 1, 'bs1_a1', '모루 떨구기', 'attack', '지정한 곳에 거대한 철 모루를 떨어뜨려 범위 피해와 짧은 경직을 준다. 모루는 5초 동안 남아, 내 망치 공격(기본 공격·백련타·집게 내려치기)이 닿으면 주변에 충격파를 낸다(0.4초 간격, 최대 4번). 모루는 하나만 둘 수 있고 길을 막지 않는다.', weapon='hammer', target='ground', range=5.0, mp=12, cd=7, anim='bs_call', sfx='bs_swing', sfxAt='strike', sfxLead=0.1, recover=0.25,
  ops=[custom('smith_anvil', r=2.0, coef=2.2, fall=0.34, at=-0.30, life=5.0, lifeLv=0.25, st=[st('stagger', 0.5)], pulse=dict(r=2.2, coef=0.6, gap=0.4, max=4))], fx=dict(color=C))
S(J, 1, 0, '단조와 제압', 2, 'bs1_a2', '집게 낚아채기', 'attack', '거대한 집게를 뻗어 적 하나를 붙잡아 내 앞으로 끌어온다. 끌려온 적이 내 모루 곁에 떨어지면 모루에 부딪혀 추가 피해를 받는다. 보스와 무거운 적은 끌려오지 않으므로 내가 다가가 집게로 내려친다. 장애물 너머의 적은 잡을 수 없다.', weapon='hammer', target='enemy', range=6.5, mp=12, cd=8, anim='bs_thrust', sfx='bs_swing', sfxAt='strike', sfxLead=0.08, recover=0.3,
  ops=[custom('smith_tongs', coef=1.3, heavy=2.1, reach=0.16, pull=0.24, stop=1.5, anvil=1.5, at=-0.16, st=[st('stagger', 0.6)])], fx=dict(color=0xd8dde6))
S(J, 1, 0, '단조와 제압', 3, 'bs1_a3', '불량품 판정', 'attack', '적에게 붉은 단조 낙인을 찍는다(10초). 그 뒤 내 직접 공격이 3번 맞으면 낙인이 깨지며 추가 피해를 주고 6초 동안 방어력을 낮춘다. 지속 피해와 충격파 같은 파생 피해는 세지 않는다.', weapon='hammer', target='enemy', range=2.2, mp=12, cd=9, anim='bs_slam', sfx='bs_swing', sfxAt='strike', sfxLead=0.09,
  ops=[hit('single', 1.4, oneHit=True, sfx='bs_hit', brand=dict(dur=10, n=3, coef=2.0, defdown=0.22, defLv=0.02, defDur=6), fx=dict(smith='brand'), **SM)], fx=dict(color=0xff5a3a))
S(J, 1, 0, '단조와 제압', 4, 'bs1_a4', '백련타', 'attack', '앞쪽을 빠르게 세 번 두드리고(좌·우·좌) 크게 들어 올려 한 번 내려찍는다. 마지막 내려찍기는 맞은 적을 달군다(가열 1중첩). 내 모루가 닿는 곳에 있으면 모루 충격파가 함께 터진다.', weapon='hammer', target='dir', range=2.4, mp=16, cd=9, anim='bs_flurry', sfx='bs_swing', sfxAt='op', recover=0.3,
  ops=[hit('cone', 0.5, r=2.4, ang=110, hits=3, gap=0.14, oneHit=True, anvil=True, swingSfx='bs_swing', sfx='bs_hit', fx=dict(smith='tap'), **SM),
       hit('cone', 1.6, r=2.4, ang=80, at=0.62, oneHit=True, anvil=True, heat=1, swingSfx='bs_swing', sfx='bs_hit_heavy', st=[st('stagger', 0.4)], fx=dict(smith='finish'), **SM)], fx=dict(color=C))
S(J, 1, 0, '단조와 제압', 5, 'bs1_a5', '장인의 박자', 'passive', '전투 스킬을 쓰면 4초 안의 다음 기본 공격 한 번이 강화 망치질이 된다(피해 +60%, 레벨마다 +10%). 겹쳐 쌓이지 않으며, 강화된 동안 망치에 주황색 테두리가 뜬다.', weapon='hammer',
  flags=dict(tempo=[0.6, 0.1]))
S(J, 1, 1, '열처리와 반격', 1, 'bs1_b1', '급랭 담금질', 'attack', '앞쪽 부채꼴에 냉각수를 끼얹어 피해와 짧은 둔화를 준다. 가열된 적은 가열을 모두 식히며 중첩마다 50% 추가 피해를 받고 흰 수증기가 터져 곁의 적에게도 조금 번진다(번진 피해는 다시 번지지 않음).', target='dir', range=3.2, mp=14, cd=9, anim='bs_sweep', sfx='bs_swing', sfxAt='strike', sfxLead=0.08,
  ops=[custom('smith_quench', r=3.2, ang=80, coef=1.4, per=0.5, splash=0.2, splashR=1.6, st=[st('slow', 2.5, 0.3)])], fx=dict(color=0xbfe8ff))
S(J, 1, 1, '열처리와 반격', 2, 'bs1_b2', '접이식 철벽', 'support', '앞에 철판을 펼쳐 5초 동안 앞쪽에서 오는 피해를 45%(레벨마다 +3%) 줄인다. 그동안 같은 버튼을 다시 누르면 철벽을 걷어차 앞으로 날려 피해를 주고 일반 적을 밀어낸다(보스는 피해만). 걷어차기는 기력이 들지 않고, 재사용 대기는 처음 펼칠 때부터 흐른다.', target='dir', range=6.0, mp=14, cd=16, anim='cast', sfx='bs_wall', recover=0.1,
  ops=[custom('smith_wall', at=-0.3, dur=5.0, block=0.45, blockLv=0.03, kick=dict(coef=1.8, w=2.4, len=6.0, push=2.6, speed=16))], fx=dict(color=0xb8c0cc))
S(J, 1, 1, '열처리와 반격', 3, 'bs1_b3', '용광로 개방', 'attack', '화구를 열어 앞쪽 부채꼴로 불꽃과 쇳물을 짧게 뿜는다. 맞은 적은 화상을 입고 달궈진다(가열 2중첩). 바닥의 쇳물 자국은 보이기만 한다.', target='dir', range=3.2, mp=12, cd=7, anim='bs_thrust', sfx='bs_swing', sfxAt='strike', sfxLead=0.08,
  ops=[hit('cone', 1.5, r=3.2, ang=70, elem='fire', heat=2, sfx='bs_forge', st=[st('burn', 3, 0.08)], fx=dict(smith='forge'), **SM)], fx=dict(color=0xff8a30))
S(J, 1, 1, '열처리와 반격', 4, 'bs1_b4', '즉석 리벳', 'support', '갑옷에 빛나는 리벳 3개를 박는다(10초). 공격을 맞을 때마다 리벳 하나가 튕겨 나가며 그 피해를 35%(레벨마다 +3%) 줄인다. 리벳이 남은 채 강화 기본 공격을 하면 남은 리벳을 모두 쏘아 앞쪽에 추가 타격을 준다.', target='self', mp=12, cd=18, anim='cast', sfx='bs_rivet', recover=0.1,
  ops=[custom('smith_rivets', at=-0.3, n=3, dur=10.0, block=0.35, blockLv=0.03, gap=0.35, shot=0.5)], fx=dict(color=0xffc86a))
S(J, 1, 1, '열처리와 반격', 5, 'bs1_b5', '충격 재활용', 'passive', '접이식 철벽과 즉석 리벳으로 실제로 줄인 피해의 60%(레벨마다 +5%)를 8초 동안 모아 두었다가, 다음 강화 기본 공격이 맞을 때 추가 피해로 돌려준다(모을 수 있는 양에 상한). 최대 체력과 방어력도 조금 오른다.',
  flags=dict(recycle=[0.6, 0.05], recycleCap=[1.5, 0.25]), mods=[dict(stat='maxHp', mul=0.03, mulLv=0.015), dict(stat='def', add=2, addLv=1)])
S(J, 1, 2, '장인의 제작', 1, 'bs1_c1', '기초 무기 제작', 'craft', '기본 망치·도끼와 일반 무기를 만든다.')
S(J, 1, 2, '장인의 제작', 2, 'bs1_c2', '기초 방어구 제작', 'craft', '기본 금속 방어구를 만든다.')
S(J, 1, 2, '장인의 제작', 3, 'bs1_c3', '숫돌 연마', 'craft', '일시적으로 무기를 강화하는 숫돌을 만든다.')
S(J, 1, 2, '장인의 제작', 4, 'bs1_c4', '재료 회수', 'craft', '장비를 분해해 재료 일부를 얻는다. 전투에서는 낙인을 깨거나 철벽을 걷어차 맞히면 고철 조각이 튀어 저절로 모이고, 모을 때마다 기력을 조금 되찾는다(10초에 3개까지, 가방에는 들어가지 않음).', flags=dict(scrap=[3, 1]))
S(J, 1, 2, '장인의 제작', 5, 'bs1_c5', '알뜰 공급', 'passive', '기본 제작 비용이 줄어든다. (제작·분해·판매로 이익이 나지 않도록 상한 적용) 전투에서 고철 조각을 모으면 작은 보호막을 얻는다(겹치지 않음).', flags=dict(craftDiscount=[0.05, 0.03], scrapShield=[0.04, 0.01]))

# ======================================================================= 엔지니어 (engineer) — power + device cap
J, C = 'engineer', 0x5ac8ff
S(J, 2, 0, '자동 병기', 1, 'en_a1', '자동 포탑', 'summon', '선택 대상을 우선 사격하는 포탑을 설치한다.', target='ground', range=6, mp=20, res=dict(type='power', cost=2), cd=8, anim='cast',
  ops=[summon('turret', ai='turret', life=20, hp=1.0, coef=0.7, rate=0.8, range=8, proj='bullet', limit=2, machine=True)])
S(J, 2, 0, '자동 병기', 2, 'en_a2', '추적 지뢰', 'summon', '다가온 적을 짧게 추적한 뒤 폭발하는 지뢰.', target='ground', range=6, mp=16, res=dict(type='power', cost=1), cd=6, anim='cast',
  ops=[summon('mine', ai='mine', life=25, hp=0.3, trigger=2.5, chase=3.0, boom=dict(r=2.2, coef=3.2, burst='explosion_fire', elem='fire'), limit=3, machine=True)])
S(J, 2, 0, '자동 병기', 3, 'en_a3', '공격 드론 편대', 'summon', '주인 주변을 날며 선택 대상을 집중 공격하는 드론 3기.', target='self', mp=26, res=dict(type='power', cost=3), cd=18, anim='cast',
  ops=[summon('drone', ai='follow_ranged', n=3, life=18, hp=0.4, coef=0.35, rate=0.5, range=7, proj='bullet', limit=3, machine=True, fly=True)])
S(J, 2, 0, '자동 병기', 4, 'en_a4', '전자기 구속기', 'summon', '둔화 전기장을 만들고 기계 병기의 우선 표적을 지정한다.', target='ground', range=6, mp=22, res=dict(type='power', cost=2), cd=16, anim='cast',
  ops=[summon('em_device', ai='aura', life=10, hp=0.8, aura=dict(r=3.0, tick=0.5, coef=0.2, elem='shock', st=[st('slow', 1, 0.4)], fx='emfield'), focus=True, limit=1, machine=True)])
S(J, 2, 0, '자동 병기', 5, 'en_a5', '이동 요새', 'ultimate', '대형 기계가 포격·기관총·미사일을 연속으로 쏟아낸다.', target='self', mp=60, res=dict(type='power', cost=5), cd=80, cast=0.8, anim='cast',
  ops=[summon('fortress', ai='fortress', life=14, hp=4.0, coef=0.9, rate=0.35, range=10, proj='shell', missiles=dict(every=3.0, n=4, coef=1.5), limit=1, machine=True, ultimate=True)])
S(J, 2, 1, '총기와 고급 화기', 1, 'en_b1', '철갑 사격', 'attack', '방어력 일부를 무시하는 사격.', target='enemy', range=9, mp=18, cd=5, anim='throw',
  ops=[proj('normal', 2.6, speed=26, fx='bullet', burst='hit_pierce', armorPen=0.4)], fx=dict(color=0xffd060))
S(J, 2, 1, '총기와 고급 화기', 2, 'en_b2', '산탄 폭발', 'attack', '가까울수록 강한 부채꼴 산탄.', range=5, mp=20, cd=6, anim='throw',
  ops=[hit('cone', 2.8, r=5, ang=55, falloff=0.6, fx=dict(slash='shotgun_cone'))])
S(J, 2, 1, '총기와 고급 화기', 3, 'en_b3', '유도 미사일', 'attack', '선택한 대상을 추적하는 미사일 여러 발.', target='enemy', range=11, mp=28, res=dict(type='power', gain=1), cd=9, anim='throw',
  ops=[proj('homing', 1.1, count=4, gap=0.1, speed=10, r=1.2, fx='missile', burst='explosion_fire', elem='fire')])
S(J, 2, 1, '총기와 고급 화기', 4, 'en_b4', '전자기 레일건', 'attack', '충전 후 긴 직선을 관통하는 레일건.', range=14, mp=32, cd=12, cast=0.9, anim='cast',
  ops=[dict(op='telegraph', shape='line', len=14, w=1.2, dur=0.9), hit('line', 5.0, len=14, w=1.2, elem='shock', fx=dict(beam='rail'))])
S(J, 2, 1, '총기와 고급 화기', 5, 'en_b5', '궤도 포격', 'ultimate', '넓은 범위를 예고한 뒤 대규모 연속 포격.', target='ground', range=9, mp=70, cd=75, cast=0.5, anim='cast',
  ops=[dict(op='telegraph', shape='circle', r=5, dur=1.6, atAim=True), custom('barrage', n=14, r=5, blast=1.6, coef=1.4, start=1.6, gap=0.12, burst='explosion_fire', marker='orbital_marker')])
S(J, 2, 2, '제작·수리·개조', 1, 'en_c1', '총기 제작', 'craft', '권총·산탄총·소총을 만든다.')
S(J, 2, 2, '제작·수리·개조', 2, 'en_c2', '병기 개조', 'craft', '공격 속도형·범위형 개조 모듈을 만든다. 유형마다 장단점이 있다.')
S(J, 2, 2, '제작·수리·개조', 3, 'en_c3', '현장 수리', 'support', '기계 소환물을 수리하고(손상이 클수록 효율 증가) 자신에게 작은 장갑 보호막을 씌운다.', target='self', mp=18, cd=10, anim='cast', ops=[dict(op='repair', pct=0.35, missingBonus=0.5), shield(30, 0.6, 6, power='atk')])
S(J, 2, 2, '제작·수리·개조', 4, 'en_c4', '동력 회수', 'passive', '기계가 수명 종료로 사라지면 전력 일부를 돌려받는다. 파괴되면 덜 돌려받으며, 소비량보다 많이 돌려받지 않는다.', flags=dict(powerRefund=[0.3, 0.1]))
S(J, 2, 2, '제작·수리·개조', 5, 'en_c5', '오버클럭', 'support', '기계의 화력·공격 속도를 높인다. 끝나면 냉각 상태(약화)가 된다.', target='self', mp=24, cd=30, anim='cast', ops=[dict(op='overclock', dur=8, mul=0.5, cool=4, coolMul=-0.3)])

# ======================================================================= 미용사 (hairdresser)
J, C = 'hairdresser', 0xff7ab0
S(J, 1, 0, '가위 기술', 1, 'hd1_a1', '가위 연격', 'attack', '빠르게 세 번 자른다.', weapon='scissors', target='enemy', range=1.8, mp=8, cd=4, anim='attack',
  ops=[hit('single', 0.75, hits=3, gap=0.1, fx=dict(slash='scissor_snip', burst='hit_slash'))])
S(J, 1, 0, '가위 기술', 2, 'hd1_a2', '앞머리 정리', 'attack', '짧고 빠른 전방 범위 공격.', weapon='scissors', range=2.2, mp=8, cd=4, anim='attack',
  ops=[hit('cone', 1.4, r=2.2, ang=90, fx=dict(slash='arc'))])
S(J, 1, 0, '가위 기술', 3, 'hd1_a3', '끝단 자르기', 'attack', '체력이 낮은 적에게 추가 피해.', weapon='scissors', target='enemy', range=1.8, mp=10, cd=6, anim='attack',
  ops=[hit('single', 1.6, vsLowHp=dict(pct=0.35, mul=1.8), fx=dict(slash='scissor_snip', burst='hit_slash'))])
S(J, 1, 0, '가위 기술', 4, 'hd1_a4', '스텝 커트', 'attack', '옆으로 짧게 이동하며 벤다. 무적 시간 없음.', weapon='scissors', range=2.0, mp=10, cd=6, anim='dash',
  ops=[dash(2.2, side=True, invuln=False, hit=hit('cone', 1.3, r=2.8, ang=150, fx=dict(slash='arc')))])
S(J, 1, 0, '가위 기술', 5, 'hd1_a5', '섬세한 손놀림', 'passive', '가위 공격 속도와 치명타 확률이 증가한다.', mods=[dict(stat='atkSpeed', mul=0.04, mulLv=0.02), dict(stat='crit', add=0.03, addLv=0.015)])
S(J, 1, 1, '빗과 드라이', 1, 'hd1_b1', '빗 투척', 'attack', '빗을 직선으로 던진다.', target='enemy', range=8, mp=8, cd=3, anim='throw', ops=[proj('normal', 1.6, speed=16, fx='comb', burst='hit_pierce')])
S(J, 1, 1, '빗과 드라이', 2, 'hd1_b2', '드라이 돌풍', 'attack', '전방에 바람 피해와 밀치기.', range=3.6, mp=12, cd=7, anim='cast',
  ops=[hit('cone', 1.3, r=3.6, ang=60, knock=2.5, fx=dict(slash='wind_cone'))])
S(J, 1, 1, '빗과 드라이', 3, 'hd1_b3', '온풍 드라이', 'attack', '근거리에 지속 공격. 이동하면 중단된다.', range=3.0, mp=14, cd=8, anim='cast',
  ops=[channel(2.0, 0.25, [hit('cone', 0.35, r=3.0, ang=50, elem='fire', fx=dict(slash='wind_cone'))], breakOnMove=True)])
S(J, 1, 1, '빗과 드라이', 4, 'hd1_b4', '냉풍 드라이', 'attack', '냉기 피해와 둔화.', range=3.4, mp=12, cd=7, anim='cast',
  ops=[hit('cone', 1.4, r=3.4, ang=60, elem='ice', st=[st('slow', 3, 0.35)], fx=dict(slash='wind_cone'))])
S(J, 1, 1, '빗과 드라이', 5, 'hd1_b5', '헤어롤 덫', 'summon', '밟은 적을 잠시 속박하는 헤어롤 덫.', target='ground', range=6, mp=12, cd=10, anim='throw',
  ops=[summon('hair_roller', ai='trap', life=15, hp=0.2, trigger=1.0, onTrigger=dict(r=1.2, coef=0.8, st=[st('root', 1.5)], burst='dust'), limit=3, machine=True)])
S(J, 1, 2, '스타일링과 관리', 1, 'hd1_c1', '산뜻한 스타일링', 'support', '이동 속도를 높인다.', target='self', mp=10, cd=16, anim='cast', ops=[buff('haste', 8, 0.25)])
S(J, 1, 2, '스타일링과 관리', 2, 'hd1_c2', '헤어 코팅', 'support', '작은 보호막을 두른다.', target='self', mp=12, cd=14, anim='cast', ops=[shield(30, 0.9, 6)])
S(J, 1, 2, '스타일링과 관리', 3, 'hd1_c3', '기분 전환', 'support', '둔화를 없애고 잠시 둔화 저항을 얻는다.', target='self', mp=10, cd=14, anim='cast', ops=[cleanse(9, ['slow']), buff('slowres', 5, 1)])
S(J, 1, 2, '스타일링과 관리', 4, 'hd1_c4', '염색약 배합', 'craft', '외형 색을 바꾸는 염색약을 만든다.')
S(J, 1, 2, '스타일링과 관리', 5, 'hd1_c5', '깔끔한 마무리', 'passive', '적을 처치하면 이동 속도가 증가한다. 중첩되지 않고 시간만 갱신.', flags=dict(killHaste=[0.15, 0.03]))

# ======================================================================= 디자이너 (designer) — pattern marks
J, C = 'designer', 0xe060c0
S(J, 2, 0, '실과 재단', 1, 'ds_a1', '실크 속박', 'attack', '여러 적을 실로 연결해 묶는다. 보스는 둔화로 대체.', target='ground', range=7, mp=24, cd=10, anim='cast',
  ops=[hit('circle', 1.2, r=3.0, atAim=True, st=[st('root', 2.0)], mark=dict(type='pattern', n=1), link=True, fx=dict(beam='thread_link'))])
S(J, 2, 0, '실과 재단', 2, 'ds_a2', '패턴 절단', 'attack', '표식을 소비할수록 강해지는 가위 공격.', target='enemy', range=2.2, mp=20, cd=6, anim='attack',
  ops=[hit('single', 2.0, consume=dict(type='pattern', mulPer=0.6), fx=dict(slash='scissor_snip', burst='hit_slash'))])
S(J, 2, 0, '실과 재단', 3, 'ds_a3', '바늘비', 'attack', '지정한 지역에 바늘을 반복해서 쏟아 표식을 남긴다.', target='ground', range=8, mp=26, cd=10, anim='cast',
  ops=[hit('circle', 0.5, r=2.4, atAim=True, hits=6, gap=0.2, mark=dict(type='pattern', n=1, every=3), fx=dict(slash='fan_needles'))])
S(J, 2, 0, '실과 재단', 4, 'ds_a4', '교차 재단', 'attack', 'X자로 두 번 벤다. 교차 중심의 적은 추가 피해.', range=3.0, mp=22, cd=7, anim='attack',
  ops=[hit('cone', 1.6, r=3.0, ang=70, hits=2, gap=0.15, centerBonus=0.6, fx=dict(slash='cross'))])
S(J, 2, 0, '실과 재단', 5, 'ds_a5', '운명의 재단선', 'ultimate', '넓은 재단선을 새긴 뒤 한꺼번에 자른다. 속박된 적에게 강화.', target='self', mp=70, cd=70, cast=0.8, anim='cast',
  ops=[dict(op='telegraph', shape='circle', r=6, dur=0.8), hit('circle', 7.0, r=6, vsStatus=dict(id='root', mul=1.5), consume=dict(type='pattern', mulPer=0.4), fx=dict(slash='cross'), at=0.8)])
S(J, 2, 1, '리본과 무대', 1, 'ds_b1', '리본 대시', 'attack', '돌진하며 지나간 경로의 적을 공격하고 표식을 남긴다.', range=6, mp=20, cd=8, anim='dash',
  ops=[dash(5.0, invuln=False, path=hit('line', 1.8, w=1.4, mark=dict(type='pattern', n=1), fx=dict(beam='ribbon_line')))])
S(J, 2, 1, '리본과 무대', 2, 'ds_b2', '리본 회오리', 'attack', '적을 끌어당기며 반복 공격한다. 보스는 끌려오지 않는다.', target='ground', range=6, mp=26, cd=11, anim='cast',
  ops=[area('dmg', 2.8, 2.5, tick=0.3, coef=0.35, pull=1.2, fx='wind')])
S(J, 2, 1, '리본과 무대', 3, 'ds_b3', '마네킹 대역', 'summon', '적의 주의를 끄는 마네킹을 남기고 뒤로 물러난다. 사라질 때 실을 방출.', target='self', mp=22, cd=16, anim='dash',
  ops=[summon('mannequin', ai='decoy', life=6, hp=1.6, taunt=True, onExpire=dict(r=2.6, coef=1.2, st=[st('root', 1.0)], burst='dust'), limit=1), dash(-3.0, invuln=False)])
S(J, 2, 1, '리본과 무대', 4, 'ds_b4', '스포트라이트', 'support', '대상이 받는 치명타 피해가 커지고 위장·은신이 풀린다.', target='enemy', range=9, mp=16, cd=14, anim='cast',
  ops=[hit('single', 0.0, st=[st('spotlit', 8, 0.5)], fx=dict(burst='gold'))])
S(J, 2, 1, '리본과 무대', 5, 'ds_b5', '환상의 런웨이', 'ultimate', '리본과 분신의 연속 공격, 그리고 자신의 기동력 강화.', target='self', mp=70, cd=70, cast=0.4, anim='cast',
  ops=[buff('haste', 10, 0.4), custom('runway', n=5, r=5, coef=1.6, gap=0.25, mark=dict(type='pattern', n=1))])
S(J, 2, 2, '의상과 마법 자수', 1, 'ds_c1', '고급 의상 제작', 'craft', '직업별 고급 의상을 만든다.')
S(J, 2, 2, '의상과 마법 자수', 2, 'ds_c2', '마법 자수', 'craft', '의상에 공격·방어·자원 회복 중 하나의 효과를 새긴다.')
S(J, 2, 2, '의상과 마법 자수', 3, 'ds_c3', '리본 장식 제작', 'craft', '이동·상태이상 저항 장신구를 만든다.')
S(J, 2, 2, '의상과 마법 자수', 4, 'ds_c4', '긴급 수선', 'support', '보호막을 만들고 출혈을 없앤다.', target='self', mp=18, cd=16, anim='cast', ops=[shield(50, 1.2, 8), cleanse(9, ['bleed'])])
S(J, 2, 2, '의상과 마법 자수', 5, 'ds_c5', '완벽한 피팅', 'passive', '직접 만든 의상이나 자수 장비를 입으면 방어·이동 보너스.', flags=dict(fitting=[0.08, 0.03]))

# ======================================================================= 예술가 (artist)
J, C = 'artist', 0x50c8c8
S(J, 1, 0, '기초 회화', 1, 'ar1_a1', '물감 탄환', 'attack', '작은 물감 투사체를 쏜다.', target='enemy', range=8, mp=6, cd=2.5, anim='throw', tags=['paint'],
  ops=[proj('normal', 1.5, speed=15, fx='paint_blue', burst='explosion_ink', paint=True)])
S(J, 1, 0, '기초 회화', 2, 'ar1_a2', '붓 휘두르기', 'attack', '근거리 부채꼴 붓질.', weapon='brush', range=2.4, mp=8, cd=4, anim='attack', tags=['paint'],
  ops=[hit('cone', 1.5, r=2.4, ang=100, fx=dict(slash='brush_stroke'))])
S(J, 1, 0, '기초 회화', 3, 'ar1_a3', '잉크 웅덩이', 'attack', '지속 피해와 둔화를 주는 잉크 웅덩이.', target='ground', range=7, mp=14, cd=9, anim='throw', tags=['paint'],
  ops=[area('dmg', 2.4, 6, tick=1.0, coef=0.35, st=[st('slow', 1.2, 0.3)], fx='ink_pool')])
S(J, 1, 0, '기초 회화', 4, 'ar1_a4', '색칠 표식', 'support', '대상에 표식을 남겨 다음 물감 공격을 강화한다.', target='enemy', range=8, mp=8, cd=8, anim='cast', tags=['paint'],
  ops=[hit('single', 0.0, st=[st('painted', 8, 0.6)], fx=dict(burst='explosion_ink'))])
S(J, 1, 0, '기초 회화', 5, 'ar1_a5', '붓끝 숙련', 'passive', '물감 사거리와 투사체 속도가 증가한다.', flags=dict(paintRange=[1.0, 0.5], projSpeed=[0.1, 0.05]))
S(J, 1, 1, '기초 음악', 1, 'ar1_b1', '음파 파동', 'attack', '전방의 여러 적에게 음파를 보낸다.', range=4.5, mp=10, cd=5, anim='cast', tags=['music'],
  ops=[hit('cone', 1.4, r=4.5, ang=60, elem='sound', fx=dict(slash='sound_cone'))])
S(J, 1, 1, '기초 음악', 2, 'ar1_b2', '스타카토', 'attack', '빠른 음표 세 발.', target='enemy', range=8, mp=10, cd=4, anim='throw', tags=['music'],
  ops=[proj('normal', 0.7, count=3, gap=0.1, speed=16, elem='sound', fx='note', burst='explosion_note')])
S(J, 1, 1, '기초 음악', 3, 'ar1_b3', '작은 불협화음', 'attack', '근거리 피해와 일반 적의 동작을 끊는다.', target='self', range=2.6, mp=12, cd=8, anim='cast', tags=['music'],
  ops=[hit('circle', 1.3, r=2.6, elem='sound', st=[st('stagger', 0.8)], fx=dict(burst='explosion_note'))])
S(J, 1, 1, '기초 음악', 4, 'ar1_b4', '가벼운 행진곡', 'support', '이동 속도를 높인다.', target='self', mp=10, cd=16, anim='cast', tags=['music'], ops=[buff('haste', 8, 0.2)])
S(J, 1, 1, '기초 음악', 5, 'ar1_b5', '박자 감각', 'passive', '음악 스킬을 쓴 뒤 다음 기본 공격이 빨라진다.', flags=dict(beatHaste=[0.3, 0.1]))
S(J, 1, 2, '영감과 창작', 1, 'ar1_c1', '영감 충전', 'support', '짧게 집중해 기력(MP)을 회복한다. 피격 시 중단.', target='self', mp=0, cd=18, anim='cast',
  ops=[channel(2.0, 0.5, [dict(op='mp', pct=0.05)], breakOnHit=True, breakOnMove=True)])
S(J, 1, 2, '영감과 창작', 2, 'ar1_c2', '즉흥 창작', 'support', '다음 회화·음악 공격의 피해와 범위를 늘린다.', target='self', mp=12, cd=12, anim='cast', ops=[buff('inspired', 10, 0.4)])
S(J, 1, 2, '영감과 창작', 3, 'ar1_c3', '작은 걸작', 'summon', '그림 생명체가 잠시 나타나 공격한다.', target='ground', range=5, mp=18, cd=14, anim='cast', tags=['paint'],
  ops=[summon('masterpiece', ai='chase_melee', life=10, hp=0.6, coef=0.8, rate=1.0, range=1.6, limit=1, living=True)])
S(J, 1, 2, '영감과 창작', 4, 'ar1_c4', '예술 부적 제작', 'craft', '공격·방어·기력 강화 부적을 만든다.')
S(J, 1, 2, '영감과 창작', 5, 'ar1_c5', '창작의 흐름', 'passive', '회화와 음악을 번갈아 쓰면 다음 스킬의 기력 소모가 줄어든다.', flags=dict(flow=[0.2, 0.06]))

# ======================================================================= 화가 (painter) — colours
J, C = 'painter', 0x8a5ae0
S(J, 2, 0, '잉크 소환술', 1, 'pt_a1', '잉크 늑대', 'summon', '적을 쫓아 물어뜯는 잉크 늑대.', target='ground', range=6, mp=24, cd=12, anim='cast',
  ops=[summon('ink_wolf', ai='chase_melee', life=16, hp=0.9, coef=1.0, rate=0.9, range=1.6, limit=2, living=True)])
S(J, 2, 0, '잉크 소환술', 2, 'pt_a2', '종이학 무리', 'summon', '잉크 깃털을 떨어뜨리는 종이학 무리.', target='self', mp=24, cd=16, anim='cast',
  ops=[summon('paper_crane', ai='follow_ranged', n=3, life=14, hp=0.3, coef=0.4, rate=0.9, range=7, proj='ink_blob', limit=3, living=True, fly=True)])
S(J, 2, 0, '잉크 소환술', 3, 'pt_a3', '채색 기사', 'summon', '적의 주의를 끌고 검으로 공격하는 그림 기사.', target='ground', range=6, mp=30, cd=24, anim='cast',
  ops=[summon('painted_knight', ai='taunt_melee', life=20, hp=2.2, coef=1.1, rate=1.1, range=1.8, taunt=True, limit=1, living=True)])
S(J, 2, 0, '잉크 소환술', 4, 'pt_a4', '그림자 모사', 'summon', '적의 모습을 본뜬 분신. 고정된 소환 능력치를 쓰며 보스 스킬은 따라 하지 않는다.', target='enemy', range=8, mp=28, cd=22, anim='cast',
  ops=[summon('shadow_clone', ai='chase_melee', life=12, hp=1.2, coef=1.0, rate=1.0, range=1.8, limit=1, living=True, copyTarget=True)])
S(J, 2, 0, '잉크 소환술', 5, 'pt_a5', '살아 있는 용화', 'ultimate', '용이 전장을 가로지르며 먹물 숨결을 내뿜는다.', range=12, mp=75, cd=75, cast=0.8, anim='cast',
  ops=[dict(op='telegraph', shape='line', len=12, w=3.0, dur=0.8), custom('dragon', len=12, w=3.0, coef=2.2, hits=4, gap=0.25, color='ink')])
S(J, 2, 1, '채색과 폭발', 1, 'pt_b1', '진홍의 붓질', 'attack', '붉은 궤적으로 피해를 주고 화상성 채색을 남긴다.', range=4.0, mp=20, cd=6, anim='attack',
  ops=[hit('cone', 2.2, r=4.0, ang=80, elem='fire', color='red', st=[st('burn', 3, 0.12)], fx=dict(slash='brush_stroke'))], fx=dict(color=0xe03040))
S(J, 2, 1, '채색과 폭발', 2, 'pt_b2', '청람의 물결', 'attack', '푸른 파도로 피해를 주고 둔화성 채색을 남긴다.', range=8, mp=22, cd=7, anim='cast',
  ops=[hit('line', 2.0, len=8, w=2.2, elem='water', color='blue', st=[st('slow', 3, 0.3)], fx=dict(beam='water_wave'))], fx=dict(color=0x3a6aff))
S(J, 2, 1, '채색과 폭발', 3, 'pt_b3', '황금의 점묘', 'attack', '대상 주변에 금빛 점이 찍히고 차례로 터진다.', target='enemy', range=8, mp=24, cd=9, anim='cast',
  ops=[custom('dots', n=6, r=2.2, blast=1.0, coef=0.8, start=0.4, gap=0.15, color='gold', burst='explosion_gold')], fx=dict(color=0xffd040))
S(J, 2, 1, '채색과 폭발', 4, 'pt_b4', '혼색 반응', 'attack', '서로 다른 채색을 소비해 피해와 범위를 키운다.', target='enemy', range=8, mp=26, cd=8, anim='cast',
  ops=[custom('mix', coef=2.0, perColor=1.0, r=1.6, rPer=0.8)])
S(J, 2, 1, '채색과 폭발', 5, 'pt_b5', '프리즘 대폭발', 'ultimate', '다색 폭발. 주변 채색 영역도 각각 한 번씩만 반응한다.', target='self', mp=70, cd=70, cast=0.6, anim='cast',
  ops=[dict(op='telegraph', shape='circle', r=6, dur=0.6), custom('prism', r=6, coef=6.0, perColor=1.2)])
S(J, 2, 2, '풍경과 결계', 1, 'pt_c1', '초원의 풍경화', 'support', '자신과 생명체 소환물을 회복하는 초원을 그린다.', target='ground', range=6, mp=26, cd=20, anim='cast',
  ops=[area('heal', 3.0, 8, tick=1.0, heal=0.025, fx='meadow', landscape=True, living=True)])
S(J, 2, 2, '풍경과 결계', 2, 'pt_c2', '성벽의 풍경화', 'summon', '적의 이동과 투사체를 막는 임시 성벽.', target='ground', range=5, mp=24, cd=18, anim='cast',
  ops=[summon('painted_wall', ai='wall', life=8, hp=2.0, width=3.4, limit=2, landscape=True)])
S(J, 2, 2, '풍경과 결계', 3, 'pt_c3', '폭풍의 풍경화', 'attack', '비와 번개가 쏟아지는 지속 피해 영역.', target='ground', range=7, mp=28, cd=14, anim='cast',
  ops=[area('dmg', 3.0, 7, tick=0.7, coef=0.45, elem='shock', fx='storm', landscape=True)])
S(J, 2, 2, '풍경과 결계', 4, 'pt_c4', '화폭 확장', 'passive', '풍경 영역의 크기와 지속시간이 늘어난다.', flags=dict(landscapeSize=[0.15, 0.05], landscapeTime=[0.15, 0.05]))
S(J, 2, 2, '풍경과 결계', 5, 'pt_c5', '천지화폭', 'ultimate', '이미 그린 풍경 영역과 그림 소환물을 강화한다.', target='self', mp=60, cd=60, cast=0.5, anim='cast',
  ops=[dict(op='empower', landscapes=0.6, summons=0.5, dur=12, extend=4)])

# ======================================================================= 음악가 (musician) — phrases
J, C = 'musician', 0x60d0a0
S(J, 2, 0, '공격 선율', 1, 'mu_a1', '음파 화살', 'attack', '관통하는 음표. 맞히면 악절을 얻는다.', range=10, mp=18, cd=4, anim='throw',
  ops=[proj('normal', 1.8, speed=18, pierce=True, range=10, elem='sound', fx='note', burst='explosion_note', gain=dict(type='phrase', n=1))])
S(J, 2, 0, '공격 선율', 2, 'mu_a2', '불협화음', 'attack', '범위 피해와 함께 적의 공격력을 낮춘다.', target='self', range=3.2, mp=22, cd=8, anim='cast',
  ops=[hit('circle', 1.8, r=3.2, elem='sound', st=[st('atkdown', 5, 0.2)], gain=dict(type='phrase', n=1), fx=dict(burst='explosion_note'))])
S(J, 2, 0, '공격 선율', 3, 'mu_a3', '크레셴도', 'attack', '같은 적을 연속으로 맞히면 마지막 타격이 강해진다.', target='enemy', range=8, mp=22, cd=7, anim='cast',
  ops=[proj('homing', 0.8, count=4, gap=0.18, speed=14, elem='sound', fx='note', burst='explosion_note', crescendo=0.35, gain=dict(type='phrase', n=1, once=True))])
S(J, 2, 0, '공격 선율', 4, 'mu_a4', '공명 폭발', 'attack', '대상 주변이 폭발한다. 약화된 적에게 추가 파동.', target='enemy', range=8, mp=24, cd=8, anim='cast',
  ops=[hit('circle', 2.4, r=2.2, atTarget=True, elem='sound', react=dict(need='atkdown', coef=1.4, r=2.6, burst='explosion_note'), gain=dict(type='phrase', n=1), fx=dict(burst='explosion_note'))])
S(J, 2, 0, '공격 선율', 5, 'mu_a5', '파멸의 피날레', 'ultimate', '모은 악절을 소비해 거대한 음표와 충격파를 날린다.', target='self', mp=60, cd=60, cast=0.7, anim='cast',
  ops=[dict(op='telegraph', shape='circle', r=6, dur=0.7), hit('circle', 4.0, r=6, elem='sound', consume=dict(type='phrase', mulPer=0.35), fx=dict(burst='explosion_big'), at=0.7)])
S(J, 2, 1, '선율과 회복', 1, 'mu_b1', '치유의 선율', 'support', '이동하며 자신과 생명체 소환물을 지속 회복한다. (지속 선율은 하나만)', target='self', mp=20, cd=6, anim='cast',
  ops=[dict(op='melody', id='mel_heal', dur=20, heal=0.012, tick=1.0)])
S(J, 2, 1, '선율과 회복', 2, 'mu_b2', '용기의 행진곡', 'support', '공격력과 이동 속도를 높인다. (지속 선율)', target='self', mp=20, cd=6, anim='cast',
  ops=[dict(op='melody', id='mel_courage', dur=20, atk=0.15, speed=0.12)])
S(J, 2, 1, '선율과 회복', 3, 'mu_b3', '수호의 찬가', 'support', '피해 감소와 상태이상 저항. (지속 선율)', target='self', mp=20, cd=6, anim='cast',
  ops=[dict(op='melody', id='mel_guard', dur=20, dr=0.15, ccres=0.5)])
S(J, 2, 1, '선율과 회복', 4, 'mu_b4', '마나의 세레나데', 'support', '기력(MP)을 회복한다. (지속 선율)', target='self', mp=0, cd=6, anim='cast',
  ops=[dict(op='melody', id='mel_mana', dur=20, mp=0.02, tick=1.0)])
S(J, 2, 1, '선율과 회복', 5, 'mu_b5', '생명의 앙코르', 'ultimate', '크게 회복하고 보호막을 두르며 현재 선율을 강화한다.', target='self', mp=60, cd=70, cast=0.5, anim='cast',
  ops=[heal(pct=0.35), shield(80, 1.8, 10), dict(op='melodyBoost', mul=0.6, dur=12)])
S(J, 2, 2, '악기와 무대', 1, 'mu_c1', '메아리 연주', 'support', '다음 음악 공격을 약한 위력으로 한 번 더 연주한다. 메아리는 다시 메아리치지 않는다.', target='self', mp=14, cd=12, anim='cast', ops=[buff('echo', 10, 0.5)])
S(J, 2, 2, '악기와 무대', 2, 'mu_c2', '음향 증폭기', 'summon', '주변에서 내 음파 공격의 범위를 넓히는 증폭기.', target='ground', range=5, mp=22, cd=18, anim='cast',
  ops=[summon('amplifier', ai='amp', life=15, hp=1.0, amp=0.35, r=5, limit=1, machine=True)])
S(J, 2, 2, '악기와 무대', 3, 'mu_c3', '환영 악단', 'summon', '선택 대상에게 음표를 쏘는 환영 연주자.', target='ground', range=6, mp=28, cd=20, anim='cast',
  ops=[summon('phantom_musician', ai='turret', n=2, life=15, hp=0.8, coef=0.6, rate=0.9, range=8, proj='note', limit=2, living=False)])
S(J, 2, 2, '악기와 무대', 4, 'mu_c4', '절대음감', 'passive', '악절 획득 효율이 오르고, 선율을 바꾼 뒤 첫 공격이 강해진다.', flags=dict(phraseGain=[0.25, 0.1], switchBonus=[0.2, 0.08]))
S(J, 2, 2, '악기와 무대', 5, 'mu_c5', '그랜드 심포니', 'ultimate', '악단의 연속 공격과 선율 강화, 그리고 합주 마무리.', target='self', mp=75, cd=75, cast=0.6, anim='cast',
  ops=[dict(op='telegraph', shape='circle', r=6, dur=0.6), dict(op='melodyBoost', mul=0.5, dur=10), custom('symphony', n=10, r=6, coef=0.9, gap=0.2, finale=dict(r=6, coef=5.0))])

# ======================================================================= statuses (shared)
STATUSES = [
    dict(id='burn', name='화상', kind='dot', tick=1.0, debuff=True, cleanse=True, stack='refresh', cap=1, boss='normal', color='#ff7a30'),
    dict(id='poison', name='독', kind='dot', tick=1.0, debuff=True, cleanse=True, stack='refresh', cap=1, boss='normal', color='#8ad040'),
    dict(id='bleed', name='출혈', kind='dot', tick=1.0, debuff=True, cleanse=True, stack='refresh', cap=1, boss='normal', color='#d03040'),
    dict(id='slow', name='둔화', kind='slow', stat='moveSpeed', debuff=True, cleanse=True, stack='max', cap=0.7, boss='half', color='#7ab8ff'),
    dict(id='freeze', name='빙결', kind='stun', debuff=True, cleanse=True, stack='refresh', boss='slow', color='#a8e8ff'),
    dict(id='root', name='속박', kind='root', debuff=True, cleanse=True, stack='refresh', boss='slow', color='#6ac060'),
    dict(id='stagger', name='경직', kind='stun', debuff=True, cleanse=False, stack='refresh', boss='immune', color='#ffffff'),
    dict(id='stun', name='기절', kind='stun', debuff=True, cleanse=False, stack='refresh', boss='immune', color='#ffe680'),   # 요리사 팬 강타 (머리 위 별: js/cookfx.js stun)
    dict(id='defdown', name='방어력 감소', kind='statMul', stat='def', sign=-1, debuff=True, cleanse=True, stack='max', cap=0.5, boss='normal', color='#c08040'),
    dict(id='atkdown', name='공격력 감소', kind='statMul', stat='atk', sign=-1, debuff=True, cleanse=True, stack='max', cap=0.5, boss='normal', color='#c04040'),
    dict(id='heat', name='가열', kind='mark', debuff=True, cleanse=False, stack='max', cap=3, boss='normal', color='#ff9a3a'),     # 대장장이: 값 = 중첩(1~3), 더할 때마다 시간 갱신 (js/smith.js addHeat)
    dict(id='brand', name='단조 낙인', kind='mark', debuff=True, cleanse=False, boss='normal', color='#ff5a3a'),               # 대장장이 불량품 판정: 직접 공격 3번에 깨짐
    dict(id='prescribed', name='표적 처방', kind='mark', debuff=True, cleanse=False, boss='normal', color='#5aa0ff'),
    dict(id='painted', name='색칠 표식', kind='mark', debuff=True, cleanse=False, boss='normal', color='#50c8c8'),
    dict(id='spotlit', name='스포트라이트', kind='mark', debuff=True, cleanse=False, boss='normal', color='#ffe080'),
    # buffs
    dict(id='atkup', name='공격력 증가', kind='statMul', stat='atk', buff=True, stack='max', cap=1.0, color='#ff7060'),
    dict(id='defup', name='방어력 증가', kind='statMul', stat='def', buff=True, stack='max', cap=1.0, color='#e0c060'),
    dict(id='haste', name='이동 속도 증가', kind='statMul', stat='moveSpeed', buff=True, stack='max', cap=0.6, color='#80e0ff'),
    dict(id='aspdup', name='공격 속도 증가', kind='statMul', stat='atkSpeed', buff=True, stack='max', cap=0.6, color='#ff9a50'),
    dict(id='immune', name='상태이상 면역', kind='flag', buff=True, stack='max', color='#9ae0ff'),
    dict(id='mpregen', name='기력 회복', kind='statAdd', stat='spRegen', buff=True, stack='max', color='#60a0ff'),
    dict(id='ccres', name='경직 저항', kind='flag', buff=True, stack='max', color='#e0e0e0'),
    dict(id='slowres', name='둔화 저항', kind='flag', buff=True, stack='max', color='#a0e0ff'),
    dict(id='knockres', name='밀려남 저항', kind='flag', buff=True, stack='max', color='#c0c0c0'),
    dict(id='dmgreduce', name='피해 감소', kind='statAdd', stat='dmgReduce', buff=True, stack='max', cap=0.6, color='#d0b080'),
    dict(id='frontguard', name='도마 방어', kind='flag', buff=True, stack='max', color='#c09060'),
    dict(id='healup', name='회복량 증가', kind='statAdd', stat='healPower', buff=True, stack='max', color='#70e070'),
    dict(id='maxhp', name='든든함', kind='statMul', stat='maxHp', buff=True, stack='max', cap=0.5, group='food', color='#ffb060'),
    dict(id='foodup', name='음식 효과 증폭', kind='statAdd', stat='foodPower', buff=True, stack='max', group='food', color='#ffd060'),
    dict(id='catalyst', name='반응 촉진', kind='flag', buff=True, stack='max', color='#5aa0ff'),
    dict(id='inspired', name='영감', kind='flag', buff=True, stack='max', color='#50c8c8'),
    dict(id='echo', name='메아리', kind='flag', buff=True, stack='max', color='#60d0a0'),
    dict(id='overclock', name='오버클럭', kind='flag', buff=True, stack='refresh', color='#ff9a30'),
    dict(id='cooldown_heat', name='냉각 중', kind='flag', debuff=True, cleanse=False, stack='refresh', color='#8090a0'),
    dict(id='well_fed2', name='탕약 기운', kind='statMul', stat='maxHp', buff=True, stack='max', cap=0.3, group='food', color='#ffb060'),
    dict(id='whetted', name='숫돌 연마', kind='statMul', stat='atk', buff=True, stack='max', cap=0.3, color='#c0c8d8'),
]

# ======================================================================= craft items + recipes
def item(id_, name, desc, type_, tier=1, price=0, sell=1, stack=20, icon=None, use=None, stats=None, job='', level=1):
    u = dict(heal=0, healPercent=0, sp=0, cure='', status='', duration=0, value=0, cooldown=1)
    if use: u.update(use)
    return dict(id=id_, name=name, desc=desc, type=type_, job=job, tier=tier, levelReq=level, price=price, sellPrice=sell, maxStack=stack, icon=icon or id_, stats=stats or [], use=u, tags=[])
ITEMS = [
    item('m_bottle', '빈 병', '약을 담는 유리병.', 'material', price=4, sell=1, stack=99),
    item('m_iron', '철괴', '대장간 기본 재료.', 'material', price=12, sell=3, stack=99),
    item('m_cloth', '옷감', '의상 재료.', 'material', price=10, sell=2, stack=99),
    item('m_flour', '밀가루', '요리 재료.', 'material', price=5, sell=1, stack=99),
    item('m_meat', '고기', '요리 재료.', 'material', price=8, sell=2, stack=99),
    item('m_veg', '채소', '요리 재료.', 'material', price=5, sell=1, stack=99),
    item('m_pigment', '안료', '부적·염색 재료.', 'material', price=8, sell=2, stack=99),
    item('m_gear', '톱니 부품', '병기 재료.', 'material', price=20, sell=5, stack=99),
    item('m_silk', '마법 실', '자수 재료.', 'material', price=24, sell=6, stack=99),
    item('c_potion_l', '농축 회복제', 'HP를 크게 회복한다.', 'consumable', 2, sell=10, use=dict(healPercent=0.45, cooldown=1)),
    item('c_regen_hp', '지속 회복 제제', '15초 동안 HP를 회복한다.', 'consumable', 2, sell=8, use=dict(status='regen', duration=15, value=0.02)),
    item('c_regen_sp', '지속 활력 제제', '15초 동안 기력을 회복한다.', 'consumable', 2, sell=8, use=dict(status='mpregen', duration=15, value=6)),
    item('f_lunch', '간단한 도시락', 'HP 회복 음식.', 'consumable', 1, sell=3, use=dict(heal=120, cooldown=1)),
    item('f_soup', '따뜻한 수프', '20초 동안 HP를 회복하는 음식.', 'consumable', 1, sell=4, use=dict(status='regen', duration=20, value=0.015)),
    item('f_course_atk', '특제 코스: 불꽃 스테이크', '공격력이 오르는 고급 음식. (음식 효과는 중첩되지 않음)', 'consumable', 2, sell=12, use=dict(status='atkup', duration=60, value=0.15)),
    item('f_course_def', '특제 코스: 든든한 스튜', '방어력이 오르는 고급 음식.', 'consumable', 2, sell=12, use=dict(status='defup', duration=60, value=0.2)),
    item('f_course_heal', '특제 코스: 생명의 샐러드', '회복량이 오르는 고급 음식.', 'consumable', 2, sell=12, use=dict(status='healup', duration=60, value=0.2)),
    item('f_tonic', '보양탕', '최대 HP와 자연 회복을 높이는 탕약.', 'consumable', 2, sell=10, use=dict(status='well_fed2', duration=90, value=0.15)),
    item('t_whetstone', '숫돌', '사용하면 60초 동안 공격력이 오른다.', 'consumable', 1, sell=3, use=dict(status='whetted', duration=60, value=0.12)),
    item('t_dye_red', '진홍 염색약', '외형(옷) 색을 바꾼다.', 'consumable', 1, sell=2, use=dict(dye='#d84050')),
    item('t_dye_blue', '청람 염색약', '외형(옷) 색을 바꾼다.', 'consumable', 1, sell=2, use=dict(dye='#4a70e0')),
    item('t_dye_green', '초록 염색약', '외형(옷) 색을 바꾼다.', 'consumable', 1, sell=2, use=dict(dye='#50b060')),
    item('t_dye_reset', '탈색제', '염색을 지운다.', 'consumable', 1, sell=1, use=dict(dye='')),
    item('t_mod_speed', '속사 모듈', '장착 무기: 공격 속도 +12%, 공격력 -5%.', 'consumable', 2, sell=10, use=dict(mod='speed')),
    item('t_mod_area', '확산 모듈', '장착 무기: 공격력 +10%, 공격 속도 -6%.', 'consumable', 2, sell=10, use=dict(mod='power')),
    item('t_emb_atk', '자수: 맹공', '장착 방어구: 공격력 +6%.', 'consumable', 2, sell=10, use=dict(emb='atk')),
    item('t_emb_def', '자수: 수호', '장착 방어구: 방어력 +10%.', 'consumable', 2, sell=10, use=dict(emb='def')),
    item('t_emb_mp', '자수: 샘물', '장착 방어구: 기력 회복 +2.', 'consumable', 2, sell=10, use=dict(emb='mp')),
    item('w_hammer_c', '장인 제작 망치', '대장장이가 직접 만든 망치.', 'weapon', 2, sell=30, stack=1, job='blacksmith', level=10, stats=[dict(stat='atk', add=14, mul=0)]),
    item('w_axe_c', '장인 제작 도끼', '대장장이가 직접 만든 도끼.', 'weapon', 2, sell=30, stack=1, job='blacksmith', level=12, stats=[dict(stat='atk', add=16, mul=0), dict(stat='crit', add=0.03, mul=0)]),
    item('a_metal_c', '강철 흉갑', '기본 금속 방어구.', 'armor', 2, sell=30, stack=1, level=12, stats=[dict(stat='def', add=12, mul=0), dict(stat='maxHp', add=40, mul=0)]),
    item('w_gun_pistol', '권총', '엔지니어 전용 총기. 원거리 공격력 상승.', 'weapon', 3, sell=60, stack=1, job='engineer', level=30, stats=[dict(stat='atk', add=30, mul=0), dict(stat='atkSpeed', add=0, mul=0.08)]),
    item('w_gun_shotgun', '산탄총', '엔지니어 전용 총기.', 'weapon', 3, sell=60, stack=1, job='engineer', level=32, stats=[dict(stat='atk', add=38, mul=0)]),
    item('w_gun_rifle', '소총', '엔지니어 전용 총기.', 'weapon', 3, sell=70, stack=1, job='engineer', level=35, stats=[dict(stat='atk', add=34, mul=0), dict(stat='crit', add=0.06, mul=0)]),
    item('a_outfit_c', '고급 의상', '디자이너가 만든 고급 의상.', 'armor', 3, sell=60, stack=1, level=30, stats=[dict(stat='def', add=18, mul=0), dict(stat='moveSpeed', add=0.2, mul=0)]),
    item('ac_ribbon', '리본 장식', '이동 속도와 상태이상 저항이 오르는 장신구.', 'accessory', 3, sell=40, stack=1, level=30, stats=[dict(stat='moveSpeed', add=0.3, mul=0)]),
    item('t_charm_atk', '예술 부적: 열정', '60초 동안 공격력 증가.', 'consumable', 1, sell=4, use=dict(status='atkup', duration=60, value=0.1)),
    item('t_charm_def', '예술 부적: 평온', '60초 동안 방어력 증가.', 'consumable', 1, sell=4, use=dict(status='defup', duration=60, value=0.15)),
    item('t_charm_mp', '예술 부적: 영감', '60초 동안 기력 회복 증가.', 'consumable', 1, sell=4, use=dict(status='mpregen', duration=60, value=3)),
]
def R(id_, skill, inputs, out, n=1, gold=0, group='', minLv=1, kind='make'):
    return dict(id=id_, skill=skill, inputs=[dict(item=a, count=b) for a, b in inputs], output=dict(item=out, count=n), gold=gold, group=group, minLv=minLv, kind=kind)
RECIPES = [
    R('r_potion_s', 'ph1_c1', [('m_herb', 2), ('m_bottle', 1)], 'c_potion_s', 2, group='potion'),
    R('r_potion_m', 'ph1_c1', [('m_herb', 3), ('m_bottle', 1)], 'c_potion_m', 1, group='potion', minLv=3),
    # r_sp (활력제, ph1_c2) 삭제 2026-11-11: 기력 회복제는 상점 판매·몬스터 드롭으로 구함
    R('r_potion_l', 'wp_c1', [('m_herb', 4), ('m_bottle', 1), ('m_wolf_fang', 1)], 'c_potion_l', 1, group='potion'),
    R('r_regen_hp', 'wp_c2', [('m_herb', 3), ('m_bottle', 1)], 'c_regen_hp', 1, group='potion'),
    R('r_regen_sp', 'wp_c2', [('m_herb', 2), ('m_spore', 2), ('m_bottle', 1)], 'c_regen_sp', 1, group='potion'),
    R('r_tonic', 'hb_a1', [('m_herb', 4), ('m_meat', 1), ('m_boar_tusk', 1)], 'f_tonic', 1, group='food'),
    R('r_lunch', 'ck1_c1', [('m_flour', 1), ('m_veg', 1), ('m_meat', 1)], 'f_lunch', 2, group='food'),
    R('r_soup', 'ck1_c2', [('m_veg', 2), ('m_meat', 1)], 'f_soup', 2, group='food'),
    R('r_course_atk', 'cf_c1', [('m_meat', 2), ('m_veg', 1), ('m_fox_fur', 0)], 'f_course_atk', 1, group='food'),
    R('r_course_def', 'cf_c1', [('m_meat', 1), ('m_veg', 2), ('m_flour', 1)], 'f_course_def', 1, group='food'),
    R('r_course_heal', 'cf_c1', [('m_veg', 3), ('m_herb', 1)], 'f_course_heal', 1, group='food'),
    R('r_hammer', 'bs1_c1', [('m_iron', 4), ('m_moss_stone', 1)], 'w_hammer_c', 1, gold=40, group='smith'),
    R('r_axe', 'bs1_c1', [('m_iron', 5), ('m_wolf_fang', 1)], 'w_axe_c', 1, gold=50, group='smith', minLv=2),
    R('r_metal', 'bs1_c2', [('m_iron', 6), ('m_moss_stone', 1)], 'a_metal_c', 1, gold=50, group='smith'),
    R('r_whet', 'bs1_c3', [('m_iron', 1), ('m_moss_stone', 1)], 't_whetstone', 2, group='smith'),
    R('r_pistol', 'en_c1', [('m_iron', 6), ('m_gear', 2)], 'w_gun_pistol', 1, gold=120, group='gun'),
    R('r_shotgun', 'en_c1', [('m_iron', 8), ('m_gear', 3)], 'w_gun_shotgun', 1, gold=150, group='gun', minLv=2),
    R('r_rifle', 'en_c1', [('m_iron', 8), ('m_gear', 4)], 'w_gun_rifle', 1, gold=180, group='gun', minLv=3),
    R('r_mod_speed', 'en_c2', [('m_gear', 2), ('m_iron', 1)], 't_mod_speed', 1, gold=30, group='gun'),
    R('r_mod_area', 'en_c2', [('m_gear', 2), ('m_iron', 2)], 't_mod_area', 1, gold=30, group='gun'),
    R('r_dye_red', 'hd1_c4', [('m_pigment', 1), ('m_bottle', 1)], 't_dye_red', 1, group='dye'),
    R('r_dye_blue', 'hd1_c4', [('m_pigment', 1), ('m_bottle', 1)], 't_dye_blue', 1, group='dye'),
    R('r_dye_green', 'hd1_c4', [('m_pigment', 1), ('m_herb', 1)], 't_dye_green', 1, group='dye'),
    R('r_dye_reset', 'hd1_c4', [('m_bottle', 1)], 't_dye_reset', 1, group='dye'),
    R('r_outfit', 'ds_c1', [('m_cloth', 6), ('m_silk', 2)], 'a_outfit_c', 1, gold=120, group='cloth'),
    R('r_emb_atk', 'ds_c2', [('m_silk', 2), ('m_pigment', 1)], 't_emb_atk', 1, group='cloth'),
    R('r_emb_def', 'ds_c2', [('m_silk', 2), ('m_cloth', 1)], 't_emb_def', 1, group='cloth'),
    R('r_emb_mp', 'ds_c2', [('m_silk', 2), ('m_herb', 1)], 't_emb_mp', 1, group='cloth'),
    R('r_ribbon', 'ds_c3', [('m_cloth', 3), ('m_silk', 3), ('m_fox_fur', 2)], 'ac_ribbon', 1, gold=80, group='cloth'),
    R('r_charm_atk', 'ar1_c4', [('m_pigment', 1), ('m_jelly', 1)], 't_charm_atk', 1, group='art'),
    R('r_charm_def', 'ar1_c4', [('m_pigment', 1), ('m_spore', 1)], 't_charm_def', 1, group='art'),
    R('r_charm_mp', 'ar1_c4', [('m_pigment', 1), ('m_herb', 1)], 't_charm_mp', 1, group='art'),
]
RECIPES = [r for r in RECIPES]
for r in RECIPES: r['inputs'] = [x for x in r['inputs'] if x['count'] > 0]
# salvage (bs1_c4): equipment -> part of its materials; values kept below the buy price (no profit loop)
SALVAGE = dict(skill='bs1_c4', rate=0.4, table={
    'w_hammer_c': [('m_iron', 2)], 'w_axe_c': [('m_iron', 2)], 'a_metal_c': [('m_iron', 3)], 'w_gun_pistol': [('m_iron', 3), ('m_gear', 1)],
    'w_gun_shotgun': [('m_iron', 4), ('m_gear', 1)], 'w_gun_rifle': [('m_iron', 4), ('m_gear', 2)], 'a_outfit_c': [('m_cloth', 3)],
    'w_hammer_1': [('m_iron', 1)], 'w_hammer_2': [('m_iron', 2)], 'w_hammer_3': [('m_iron', 3)], 'a_armor_2': [('m_cloth', 1)]})
SHOP_ADD = dict(shop_general=['m_bottle', 'm_flour', 'm_meat', 'm_veg', 'm_pigment', 'm_cloth'], shop_smithy=['m_iron', 'm_gear'], shop_forge=['m_iron', 'm_gear'], shop_weapons=['m_iron', 'm_silk'])   # shop_forge = 철산(제작 재료만), shop_weapons = 무기 상인(예전 shop_arms, tools/gear/gear.py)

# ======================================================================= finalize
for d in SK:
    d['status'] = dict(data=True, impl=d['type'] in ('passive', 'craft') or True, fx=True, test=False, play=False)
    d['implemented'] = True
    if d['type'] == 'craft': d['recipes'] = [r['id'] for r in RECIPES if r['skill'] == d['id']] + (['salvage'] if d['id'] == 'bs1_c4' else [])
by_job = {}
for d in SK: by_job.setdefault(d['job'], []).append(d)
assert len(SK) == 188, len(SK)
for j, lst in by_job.items(): assert len(lst) == (8 if j == 'novice' else 15), (j, len(lst))
assert len({d['id'] for d in SK}) == 188
json.dump(dict(version=1, skills=SK, statuses=STATUSES, items=ITEMS, recipes=RECIPES, salvage=SALVAGE, shopAdd=SHOP_ADD), open(OUT, 'w'), ensure_ascii=False, indent=0)
print('wrote', OUT, len(SK), 'skills', {j: len(v) for j, v in by_job.items()})
