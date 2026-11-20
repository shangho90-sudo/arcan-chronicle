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
S(J, 0, 0, '기본 검술', 2, 'nv_a2', '연', 'attack', '적 하나를 칼로 이리저리 연속으로 벤다. 처음엔 2연타, 스킬 레벨이 오를 때마다 1타씩 늘어 최대 6연타.', target='enemy', unlock=9, range=2.2, mp=10, cd=6, anim='nv_yeon', sfx='nv_yeon_cast', sfxAt='strike', sfxLead=0.05, recover=0.2,
  ops=[dict(op='lunge', dist=1.0, dur=0.2, at=-0.1), dict(op='lunge', dist=0.8, dur=0.3, at=0.2),
       hit('single', 0.5, r=2.2, ang=110, hits=2, hitsPerLv=1, gap=0.13, noExtra=True, alt=True, sfx='nv_yeon_hit', fx=dict(yeon=True))], fx=dict(color=0x78dfff))   # '연' crescents: js/yeonfx.js
S(J, 0, 0, '기본 검술', 3, 'nv_a3', '비연참', 'attack', '칼끝에 얇은 청백색 원반을 맺어 한 손으로 날린다. 원반은 적 하나의 몸통으로 곧게 날아가 처음 닿은 적 하나를 벤다.', target='enemy', unlock=3, range=9, mp=14, cd=7, anim='nv_biyeon', sfx='nv_biyeon_cast', sfxAt='strike', sfxLead=0, recover=0.3,
  ops=[proj('normal', 3.4, sfx='nv_biyeon_hit', speed=24, range=11, w=0.7, flight=[0.12, 0.38, 24], track=True, fromTip=True, quiet=True, fx='sword_wave', burst='hit_slash', biyeon=True),
       dict(op='fx', biyeon='cast', at=-0.20)], fx=dict(color=0xbfe8ff))   # 2026-11-19 원반(js/biyeonfx.js): fx op = 칼끝에 원반이 맺힘(누른 순간~손을 떠날 때), proj = 그 원반(칼끝에서 출발, 대상 몸통으로 곧게, 비행 시간 = 접촉 거리/24 m/s를 0.12~0.38 s로, 앞 테두리가 몸통에 닿는 프레임에 피해)
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
# 2026-11-19 약사 1차 5종 교체(id·칸·배우는 레벨·최대 레벨 5 그대로 = 예전 저장의 레벨·포인트·퀵슬롯이 그대로 새 스킬): 밀어내기 -> 유봉 되던지기(a4),
# 화염 약병 -> 불꽃심지병(b1), 냉각 약병 -> 서리병 굴리기(b2), 부식 약병 -> 결정침 개화(b4), 회복제 제작 -> 꿈꽃가루(c1, 제작 -> 보조, 기력 10·재사용 14초).
# 규칙 js/pharm1.js (PharmKit, CUSTOM ph_rang/ph_wick/ph_frost/ph_crystal/ph_dream — 수치는 op 필드), 그림 js/pharm1fx.js, 동작 ph_rang/ph_bowl/ph_bloom/ph_blow/ph_catch (swings.py)
# 2026-11-19: 유봉강타 = 거대 돌 유봉 두 손 내려찍기(동작 ph_smash 준비 0.30 + 내려찍기 0.15 -> 접지·피해 0.45 s, 회수 0.25 s = recover 0.25, 잠금 0.70 s;
# 피해·사거리·기력·재사용·대상 수 그대로). 2026-11-13: 유봉강타 타격 0.25 -> 0.34 s(더 큰 마력 유봉이 조금 천천히 땅을 찍음 + 찌그러진 구덩이, js/pharmfx.js). 밀어내기 = 가로 휘두르기
# ph_sweep + 부채꼴(반지름 2.2 -> 3.0 m, 80 -> 110도) 땅 뒤집힘·흙 파편, 범위 안 모두 피해 + 밀어냄, oneHit(레벨 추가타를 한 방에 — 땅이 한 번만
# 뒤집힘, 총 피해 같음), 명중했을 때만 ph_push_hit. 약병(b1·b2·b4·b6) 동작 = 야구 투구 ph_pitch(0.24 s에 실제 손에서 약병이 떠남, 유봉은 등에)
S(J, 1, 0, '유봉 전투', 1, 'ph1_a1', '유봉강타', 'attack', '정면의 적 하나를 유봉으로 강하게 내려친다.', weapon='pestle', target='enemy', range=2.0, mp=8, cd=4, anim='ph_smash', sfx='ph_smash_swing', sfxAt='strike', sfxLead=0.09, recover=0.25,
  ops=[dict(op='fx', pharm='swing', at=-0.45), hit('single', 2.2, oneHit=True, sfx='ph_smash_hit', fx=dict(pharm='smash'), st=[st('stagger', 0.4)])], fx=dict(color=0xffd27a))
S(J, 1, 0, '유봉 전투', 2, 'ph1_a4', '유봉 되던지기', 'attack', '몸을 살짝 틀어 손에 든 유봉을 앞으로 던진다. 유봉은 옆으로 빙글빙글 돌며 적을 꿰뚫고 날아가다 최대 거리(또는 벽)에서 방향을 틀어 약사의 지금 손으로 돌아온다. 적마다 나갈 때 한 번, 돌아올 때 한 번 맞는다. 던진 뒤 바로 움직일 수 있어 옆으로 걸으면 돌아오는 길이 휘어, 처음에 빗나간 적도 맞힐 수 있다. 유봉이 돌아올 때까지 유봉 공격은 쓸 수 없다.', weapon='pestle', target='dir', range=6.5, mp=10, cd=7, anim='ph_rang', unlock=13, sfxAt='op', recover=0.1,
  ops=[custom('ph_rang', at=-1, dist=6.5, speed=13, back=15, w=1.1, coef=0.85, coefLv=0.05, life=3.4, catchR=0.7)], fx=dict(color=0xffd27a))
S(J, 1, 0, '유봉 전투', 3, 'ph1_a3', '유봉 휘두르기', 'attack', '유봉을 들고 제자리에서 두 바퀴 돌며 주변의 적을 5번 연속으로 친다. 마지막 타격은 적을 밀쳐 낸다.', weapon='pestle', target='self', range=2.8, mp=14, cd=8, anim='ph_spin', sfx='ph_spin', sfxAt='op',
  ops=[dict(op='fx', pharm='cast', at=-0.18), hit('circle', 0.5, r=2.8, hits=5, gap=0.13, noExtra=True, swingSfx='ph_spin', fx=dict(pharm='spin'), last=dict(coef=0.8, push=2.4, shake=[0.12, 0.18], fx=dict(pharm='spin')))], fx=dict(color=0xffd27a))
S(J, 1, 0, '유봉 전투', 4, 'ph1_a6', '천근쇄약', 'attack', '거대한 황금 유봉을 불러내 지면을 내려찍는다. 넓은 범위에 450% 피해, 한가운데 적은 50% 추가 피해.', weapon='pestle', target='ground', range=6, mp=26, cd=16, anim='ph_slam',
  ops=[dict(op='fx', pharm='cast', at=-0.30), dict(op='fx', pharm='pestle', at=-0.12, fall=0.42, r=4.2), delay(0.30, 4.2, 4.5, core=0.5, coreR=1.5, shout='slam', sfx='ph_slam', burst='none', st=[st('stagger', 0.6)], shake=[0.32, 0.36])], fx=dict(color=0xffc040))
S(J, 1, 0, '유봉 전투', 5, 'ph1_a5', '유봉 숙련', 'passive', '유봉 기본 공격 피해와 공격 속도가 증가한다.', weapon='pestle',
  flags=dict(basicDmg=[0.06, 0.04]), mods=[dict(stat='atkSpeed', mul=0.04, mulLv=0.02)])
S(J, 1, 1, '기초 약병술', 1, 'ph1_b1', '불꽃심지병', 'attack', '심지 끝에 불씨가 붙은 호박색 약병을 지정한 곳에 포물선으로 던진다. 병이 깨지며 작은 충격 피해를 주고, 바닥에 둥글게 퍼진 약액이 약 0.4초 뒤 불붙어 2초 동안 0.4초마다 그 위에 서 있는 적에게 화염 피해를 준다(들어오고 나가는 적은 그 순간의 자리로 판정). 화상은 따로 걸지 않는다.', target='ground', range=7, mp=12, cd=5, anim='ph_pitch', sfxAt='op',
  ops=[custom('ph_wick', at=-1, pharmHeld=True, elem='fire', tag='flask', r=1.6, speed=12, impact=0.6, ignite=0.4, tick=0.4, ticks=5, coef=0.26, coefLv=0.03)], fx=dict(color=0xff9a30))
S(J, 1, 1, '기초 약병술', 2, 'ph1_b2', '서리병 굴리기', 'attack', '몸을 낮춰 흰 줄무늬가 감긴 둥근 푸른 약병을 볼링하듯 앞으로 굴린다. 병은 적 무리를 지나가며 뒤에 가느다란 얼음길을 남기고, 얼음길을 밟은 적은 둔화된다(머무는 동안은 시간만 갱신). 최대 거리나 벽에 닿으면 그 자리에서 깨져 진행 방향으로 얼음 파편이 부채꼴로 퍼지며 냉기 피해를 한 번 준다. 파편은 벽 너머로 가지 않는다.', target='dir', range=7, mp=12, cd=6, anim='ph_bowl', sfxAt='op',
  ops=[custom('ph_frost', at=-1, tag='flask', len=7, speed=7.5, w=0.9, trail=3.0, slow=0.3, slowLv=0.03, slowDur=1.5, fanR=3.0, fanAng=70, coef=1.6, coefLv=0.1)], fx=dict(color=0x7ad0ff))
S(J, 1, 1, '기초 약병술', 3, 'ph1_b6', '약병폭격', 'attack', '하늘에서 약병 10개를 차례로 떨어뜨린다. 약병마다 화염(화상)·냉기(둔화)·독 중 하나가 무작위로 터진다.', target='ground', range=7, mp=22, cd=14, anim='ph_pitch',
  ops=[custom('flask_rain', n=10, gap=0.2, r=3.4, blast=1.5, coef=0.6, fall=0.5, at=0.05, tag='flask', sfx='ph_flask')], fx=dict(color=0xd080ff))
S(J, 1, 1, '기초 약병술', 4, 'ph1_b4', '결정침 개화', 'attack', '적 하나를 정해 손끝을 펼치면 표적의 왼쪽·오른쪽·머리 위에 보랏빛 약결정이 꽃봉오리처럼 자란다. 손을 오므리는 순간 왼쪽의 가는 결정침, 오른쪽 결정침, 반 박자 뒤 머리 위의 굵은 결정침이 차례로 표적을 꿰뚫고, 마지막 결정은 꽃잎처럼 갈라지며 흩어진다. 움직이는 표적을 따라가며, 표적이 먼저 쓰러지면 남은 결정은 그 자리에서 흩어진다.', target='enemy', range=7, mp=14, cd=8, anim='ph_bloom', sfxAt='op', recover=0.5,
  ops=[custom('ph_crystal', at=-1, grow=0.38, hits=[0.46, 0.55, 0.78], coefs=[0.55, 0.55, 1.3], lastLv=0.15, leash=11)], fx=dict(color=0xb070ff))
S(J, 1, 1, '기초 약병술', 5, 'ph1_b5', '정확한 투척', 'passive', '약병 사거리가 늘고 폭발 중심의 적이 추가 피해를 받는다.', flags=dict(throwRange=[1.0, 0.5], centerBonus=[0.15, 0.05]))
S(J, 1, 2, '조제와 응급처치', 1, 'ph1_c1', '꿈꽃가루', 'support', '손바닥 위에 연보라색 꽃 한 송이를 피워 가볍게 분다. 꽃잎과 금빛 꽃가루가 앞쪽 짧은 부채꼴로 퍼지고, 꽃가루에 닿은 일반 몬스터는 잠든다(피해 없음). 잠든 적은 움직이지도 공격하지도 않으며, 수면 시간이 끝나거나 직접 공격·지속 피해(불꽃심지병의 불 포함)를 받으면 바로 깨어난다. 한 번 쓸 때 같은 적은 한 번만 잠든다. 보스는 잠들지 않는다.', target='dir', range=3.2, mp=10, cd=14, anim='ph_blow', sfxAt='op',
  ops=[custom('ph_dream', at=-1, r=3.2, ang=80, wave=0.35, sleep=2.0, sleepLv=0.25)], fx=dict(color=0xc8a8ff))
S(J, 1, 2, '조제와 응급처치', 2, 'ph1_c7', '약 보호막', 'support', '약효로 몸을 감싸 8초 동안 최대 체력의 25%(레벨마다 +3%)만큼 피해를 막는 보호막을 만들고, 그동안 상태이상에 걸리지 않는다(걸려 있던 것도 풀림).', target='self', mp=16, cd=20, anim='cast', sfx='ph_shield', sfxAt='strike',
  ops=[shield(0, 0, 8, pctMaxHp=0.25, pctLv=0.03, noAura=True), buff('immune', 8, 1, fixed=True, noAura=True), dict(op='fx', pharm='shield', dur=8)], fx=dict(color=0x7ad0ff))
S(J, 1, 2, '조제와 응급처치', 3, 'ph1_c6', '아드레날린 주사', 'support', '아드레날린을 주사해 15초 동안 이동 속도 20%, 공격 속도 25%가 오른다(레벨마다 각각 +2%, +2.5%).', target='self', mp=12, cd=30, anim='cast', sfx='ph_adrenaline', sfxAt='strike',
  ops=[buff('haste', 15, 0.20, fixed=True, valLv=0.02, noAura=True), buff('aspdup', 15, 0.25, fixed=True, valLv=0.025, noAura=True), dict(op='fx', pharm='syringe', dur=15)], fx=dict(color=0xff8040))
S(J, 1, 2, '조제와 응급처치', 4, 'ph1_c8', '광역 회복진', 'support', '바닥에 녹색 회복진을 펼친다. 8초 동안 진 안의 아군(나와 소환수)이 1초마다 최대 체력의 4%씩 회복한다.', target='self', mp=20, cd=24, anim='cast', sfx='ph_heal', sfxAt='strike',
  ops=[area('heal', 3.6, 8, heal=0.04, tick=1.0, atSelf=True, fx='none', pharm='circle', music='bgm_ph_heal_bed')], fx=dict(color=0x60e090))
S(J, 1, 2, '조제와 응급처치', 5, 'ph1_c9', '약사 수련', 'passive', '약을 다루며 몸과 마음을 단련한다. 속성 저항(화상·독·냉기 등 속성 피해와 그 지속 시간 감소)·마법력·최대 기력이 오른다.',
  mods=[dict(stat='elemRes', add=0.06, addLv=0.03), dict(stat='matk', mul=0.05, mulLv=0.03), dict(stat='maxSp', mul=0.06, mulLv=0.03)])

# ======================================================================= 양약사 (western_pharmacist)
# 2026-11-16 전면 개편(정밀 제약 마법사): id·배우는 레벨(30/33/36/40/45)·최대 레벨은 그대로 — 예전 저장의 습득 레벨·포인트·칸이 그대로 새 스킬이 됨.
# 규칙은 js/wpharm.js (WpKit, CUSTOM wp_*), 화면은 js/wpharmfx.js (메시 tools/blender/fx_wpharm.py), 동작 wp_compound/wp_condense (tools/anim/swings.py).
# 반응 표식: 대상마다 최대 3개·8초, 한 번 시전에 대상마다 1(+촉매 충전 1, +표적 전달 1). 피해는 모두 전역 정지·흔들림 없이(quiet), 카메라 kick은 궁극기 주 타격 한 번만.
# 총 피해(같은 레벨): 작열·분열 캡슐 = 예전 캡슐 0.6 + 지연 폭발 2.8 = 3.4 그대로(과립 1.6 + 고리 1.8), 극저온 2.4·이온 2.6·삼상 1.0x3 + 2.5 그대로,
# 대형 캡슐 붕괴 = 예전 광선 6.0 + 끝 폭발 7.0 대신 원 하나 10.0(반경 3.8), 연쇄 용출 1.6 x (1 + 0.5/표식)(예전 0.6), 임계 농도 1.4 + 0.65/표식(최대 9개, 예전 3.0 + 0.8 x 합/대상 수, 상한 15)
# 2026-11-20 6종 교체(사용자 기획 '제형을 붙이고, 터질 시점을 고르고, 위급한 아군에게 제제를 전달하는 전투 약사'): id·칸·배우는 레벨·최대 레벨 그대로 —
#   촉매 활성화(b1) -> 이중정, 극저온 결정화(a2) -> 발포정, 정밀 표적 전달(b2) -> 긴급 방출, 고순도 제제 조제(c1) -> 구급함 전개,
#   서방형 캡슐 조제(c2) -> 서방 패치, 생체 회복 분무(c3) -> 구조용 붕대 릴. 제작법(r_potion_l·r_regen_hp·r_regen_sp)은 같은 스킬 id(wp_c1·wp_c2)를
#   배운 캐릭터가 계속 씀(스킬 데이터 recipes + craftName, js/skillui.js showCraft) — 예전 저장의 습득 레벨이 그대로라 제작법도 그대로.
#   촉매·표적 전달이 없어져 표식이 덜 쌓이므로 연쇄 용출 1.6 -> 1.8(+표식당 0.5 -> 0.6, 이어진 적 1.2 -> 1.4), 임계 농도 1.4 + 0.65/표식 -> 1.6 + 0.72/표식.
#   약사 1차 약병 표식은 이중정 습득 효과(던질 때마다 대상당 1, js/wpharm.js flaskMarks).
J, C = 'western_pharmacist', 0x5aa0ff
A_, B_, C_ = '정밀 제약술', '표적 전달과 약물 반응', '첨단 조제와 생체 보호'
S(J, 2, 0, A_, 1, 'wp_a1', '작열·분열 캡슐', 'attack', '붉고 흰 캡슐을 던진다. 캡슐은 대상 위에서 빠르게 돌다 두 쪽으로 갈라지고, 금빛 과립 5개가 서로 다른 곡선으로 차례로 꽂힌다. 마지막 과립이 붉은 반응 고리를 터뜨려 둘레에 피해와 화상을 준다. 대상이 쓰러지면 남은 과립은 가까운 적에게 날아간다.',
  target='enemy', range=7, mp=22, cd=7, anim='wp_compound', recover=0.3,
  ops=[custom('wp_capsule', n=5, coef=1.6, fin=1.8, finR=1.6, retarget=6, st=[st('burn', 4, 0.15)])], fx=dict(color=0xff6a3a))
S(J, 2, 0, A_, 2, 'wp_a2', '발포정', 'attack', '커다란 흰 발포정을 지정한 곳에 떨어뜨린다. 발포정은 가장자리부터 녹으며 낮은 거품을 펼치고, 작은 기포가 연달아 터져 범위 안의 적에게 피해를 준다. 마지막에는 가운데 부푼 큰 기포가 터져 더 큰 피해와 반응 표식을 남긴다. 둔화된 적은 기포 피해를 더 받는다 — 서리병 굴리기로 늦춘 적의 길에 놓아 보자. 긴급 방출로 큰 기포를 바로 터뜨릴 수 있다.',
  target='ground', range=8, mp=22, cd=9, anim='wp_drop', recover=0.3, sfxAt='op',
  ops=[custom('wp_foam', r=2.2, tick=0.3, ticks=5, fin=1.5, slowBonus=0.25)], fx=dict(color=0xdff6ff))
S(J, 2, 0, A_, 3, 'wp_a3', '이온 관통술', 'attack', '은빛 약액 구슬을 한 줄로 세운 뒤, 푸른 흰 번개 한 줄기로 앞의 적들을 꿰뚫는다. 맞은 적마다 반응 표식이 남는다.',
  target='dir', range=9, mp=24, cd=7, anim='wp_compound', recover=0.3,
  ops=[custom('wp_ion', len=9, w=1.2, coef=2.6)], fx=dict(color=0xbfe6ff))
S(J, 2, 0, A_, 4, 'wp_a4', '삼상 복합제', 'attack', '붉은 캡슐·푸른 앰플·금빛 정제가 대상 둘레에 삼각형으로 선 뒤 화염 → 냉기 → 전격 순서로 꽂힌다. 셋 모두 같은 적에게 맞으면 복합 반응 폭발이 한 번 일어난다. 대상의 반응 표식이 많을수록 강해진다.',
  target='enemy', range=8, mp=30, cd=10, anim='wp_compound', recover=0.3,
  ops=[custom('wp_tri', coef=1.0, combo=2.5, r=2.2)], fx=dict(color=0xffe08a))
S(J, 2, 0, A_, 5, 'wp_a5', '대형 캡슐 붕괴', 'ultimate', '조준한 곳 위에 거대한 반투명 캡슐을 띄운다. 과립이 가운데로 모여 핵이 되고, 캡슐이 열리며 핵이 떨어져 땅에 닿는 순간 넓은 범위에 큰 피해를 준다.',
  target='ground', range=9, mp=70, cd=60, anim='wp_condense', recover=0.4,
  ops=[custom('wp_collapse', r=3.8, coef=10.0)], fx=dict(color=0x9ad8ff))
S(J, 2, 1, B_, 1, 'wp_b1', '이중정', 'attack', '분할선이 새겨진 흰 정제를 손가락으로 튕겨 적 하나에 붙인다. 맞는 순간 흰 외층이 깨져 1차 피해와 반응 표식 1개를 주고, 드러난 푸른 내핵은 적을 따라다니며 두 번 깜빡인 뒤 2초 뒤에 터져 2차 피해를 준다. 습득 효과: 약사 약병 공격도 던질 때마다 맞은 적마다 반응 표식 1개를 남긴다(장판·연타로 더 쌓이지 않음).',
  target='enemy', range=8, mp=12, cd=4, anim='wp_flick', recover=0.25, sfxAt='op',
  ops=[custom('wp_tablet', coef=0.8, core=1.5, delay=2.0)], fx=dict(color=0x7ab8ff))
S(J, 2, 1, B_, 2, 'wp_b2', '긴급 방출', 'attack', '내가 붙인 이중정의 내핵이나 설치한 발포정 하나를 즉시 작동시킨다. 이중정은 남은 2차 피해를 바로 주고, 발포정은 남은 작은 기포를 포기하는 대신 마지막 큰 기포를 지금 터뜨린다. 선택한 적에게 붙인 이중정이 먼저, 없으면 조준한 곳에서 가장 가까운 발포정을 고른다. 작동시킬 제제가 없으면 기력과 재사용 시간을 쓰지 않는다. 반응 표식은 쓰지 않는다.',
  target='ground', range=14, mp=8, cd=3, anim='wp_snap', recover=0.15, sfxAt='op',
  ops=[custom('wp_release', at=-1, boost=0.1, boostLv=0.05)], fx=dict(color=0x7ab8ff))
S(J, 2, 1, B_, 3, 'wp_b3', '연쇄 용출', 'attack', '대상의 반응 표식을 소비해 터뜨린다. 풀려난 미립자가 곡선을 그리며 가까운 \'표식이 있는\' 적에게 차례로 옮겨 가 그 표식도 터뜨린다. 한 번의 시전에서 같은 적에게는 한 번만 이어진다.',
  target='enemy', range=8, mp=26, cd=9, anim='wp_compound', recover=0.3,
  ops=[custom('wp_chain', coef=1.8, perStack=0.6, sub=1.4, r=2.0, range=5, max=5)], fx=dict(color=0x6ae0d0))
S(J, 2, 1, B_, 4, 'wp_b4', '서방형 미립자', 'passive', '표식이 터진 자리에 빛나는 과립 지대가 4초 동안 남아 1초마다 작은 피해를 준다. 과립은 시간이 지날수록 줄어든다. 지대의 피해는 표식을 만들지 않는다.', flags=dict(residue=[0.25, 0.08]))
S(J, 2, 1, B_, 5, 'wp_b5', '임계 농도', 'ultimate', '주변 적들의 반응 표식을 모두 거둬들인다. 표식마다 가운데로 빛줄기가 모이고 맑은 구 안에서 결정이 자라다가, 푸른 흰 충격파로 터진다. 거둔 표식이 많을수록 강하다(표식이 없으면 약함).',
  target='self', range=0, mp=60, cd=50, anim='wp_condense', recover=0.4,
  ops=[custom('wp_critical', r=6, base=1.6, per=0.72, cap=9)], fx=dict(color=0x9ad8ff))
S(J, 2, 2, C_, 1, 'wp_c1', '구급함 전개', 'support', '발치에 작은 왕진 가방을 내려놓는다. 뚜껑이 열리면 안쪽에 응급 패치 3장이 보이고, 일정 간격마다 범위 안에서 HP 비율이 가장 낮은 나 또는 생명체 소환수에게 패치 한 장이 날아가 즉시 회복시킨다. 모두 건강하면 패치를 아꼈다가 다친 이가 생기면 쓴다. 패치를 다 쓰거나 시간이 끝나면 가방이 닫힌다. 자리를 지킬 때 쓴다. 습득 효과: 고순도 제제(농축 회복제) 제작법.',
  target='self', mp=22, cd=20, anim='wp_place', recover=0.3, sfxAt='op', craftName='고순도 제제 조제',
  ops=[custom('wp_kit', dur=10, durLv=1, r=6, n=3, gap=1.0, open=0.4, thresh=0.85, pct=0.12, pctLv=0.02)], fx=dict(color=0x9affd8))
S(J, 2, 2, C_, 2, 'wp_c2', '서방 패치', 'support', '나 또는 선택한 생명체 소환수에게 세 칸짜리 패치를 붙인다. 대상이 움직여도 패치가 따라가며 1.5초마다 세 번 회복시키고, 회복할 때마다 칸이 하나씩 꺼진다. 지원 대상을 고르지 않고 누르면 나에게 붙는다. 보스를 피해 계속 움직일 때 쓴다. 습득 효과: 서방형 캡슐(지속 회복·활력 제제) 제작법.',
  target='self', range=9, mp=16, cd=12, anim='wp_patch', recover=0.25, sfxAt='op', craftName='서방형 캡슐 조제',
  ops=[custom('wp_patch', range=9, n=3, gap=1.5, pct=0.07, pctLv=0.015)], fx=dict(color=0x9affd8))
S(J, 2, 2, C_, 3, 'wp_c3', '구조용 붕대 릴', 'support', '손목의 릴에서 넓은 붕대를 쏘아 생명체 소환수를 내 쪽의 안전한 자리로 당기고, 도착하는 순간 한 번 회복시킨다. 고른 소환수가 먼저, 없으면 적의 바닥 공격 위에 선 소환수, 그다음 HP가 절반 아래인 소환수를 고른다. 벽은 통과하지 않는다. 당길 소환수가 없으면 붕대로 나를 감아 즉시 조금 회복한다.',
  target='self', range=9, mp=18, cd=14, anim='wp_reel', recover=0.3, sfxAt='op',
  ops=[custom('wp_reel', range=9, pct=0.15, pctLv=0.025, self=0.06, selfLv=0.01)], fx=dict(color=0xf4ead0))
S(J, 2, 2, C_, 4, 'wp_c4', '다층 코팅막', 'support', '얇은 막 세 겹으로 몸을 감싸 피해를 흡수한다. 체력이 낮을수록 막이 두껍다. 막이 깎이면 바깥 겹부터 벗겨진다.',
  target='self', mp=22, cd=16, anim='wp_compound', recover=0.25,
  ops=[shield(40, 1.2, 8, lowHp=1.0, noAura=True), dict(op='fx', wp='coat', dur=8)], fx=dict(color=0x9ae6ff))
S(J, 2, 2, C_, 5, 'wp_c5', '최종 처방·생명 유지', 'passive', '치명적인 피해를 받으면 가슴의 응급 캡슐이 깨져 체력을 조금 남기고, 같은 양의 보호막과 짧은 재생을 준다. (내부 쿨타임 120초)', flags=dict(cheatDeath=[0.15, 0.05]), icd=120)

# ======================================================================= 한약사 (herbalist) — 2026-11-16 개편 '본초 도사'
# 기를 달여 약초와 영물을 깨우는 한약사. 규칙은 js/herbal.js(HerbalKit, CUSTOM 'herb' — op.k = 스킬 칸), 그림은 js/herbalfx.js
# (Blender tools/blender/fx_herbal.py -> assets/fx/fx_herbal.glb.json), 동작은 tools/anim/swings.py hb_*(손은 비우고 유봉은 등에 — stow).
# 수치는 예전 한약사 값에서 출발(같은 레벨·장비 기준), 계획·이전 값은 docs/STATUS.md. 여러 타·여러 메시로 나눠도 총합은 그대로.
J, C = 'herbalist', 0x6ac040
HA, HB, HC = '비전 탕약과 경락', '본초 영물술', '오행 침구술'
def herb(k, **kw): return dict(op='custom', fn='herb', k=k, **kw)
S(J, 2, 0, HA, 1, 'hb_a1', '탕약 나누기', 'support', '작은 탕관에서 호박빛 탕약을 두 잔 따른다. 한 잔은 내가 마시고, 다른 한 잔은 사거리 안의 내 생명 소환물(직접 고른 영물, 없으면 가장 많이 다친 영물)에게 보내 즉시 회복시킨다. 받을 영물이 없으면 남은 한 잔을 잠시 들고 있다가, 같은 칸을 다시 누르면 내가 마신다(기력·재사용 대기는 처음 한 번만).', target='self', range=8, mp=20, cd=14, anim='hb_share', sfx='hb_pour', sfxAt='op',
  ops=[herb('a1', selfHeal=0.10, ally=0.25, range=8, hold=8, speed=9)], fx=dict(color=0xffb850))
S(J, 2, 0, HA, 2, 'hb_a2', '보중익기탕', 'support', '기력을 회복하고 주변 영물의 이동 속도를 높인다. 약잔을 가슴 높이로 들면 금빛 김이 피어올라 기력이 몇 차례에 걸쳐 차오르고(움직여도 이어짐), 가까운 내 생명 소환물의 발밑에 금빛 바람이 감겨 빨라진다.', target='self', mp=18, cd=20, anim='hb_lift', sfx='hb_steam', sfxAt='op',
  ops=[herb('a2', ticks=4, every=1.0, mp=8, haste=0.2, dur=8, near=10)], fx=dict(color=0xffd060))
S(J, 2, 0, HA, 3, 'hb_a3', '구풍해독탕', 'support', '탕관을 기울여 호박빛 약액 한 줄기를 고른 내 생명 소환물에게 보낸다. 닿는 순간 대상 둘레로 약향과 잎이 한 번 퍼져 바짝 붙은 일반 몬스터를 짧게 밀어내고(보스 제외) 대상에게 보호막을 준다. 고른 영물이 없으면 나를 중심으로 바로 터진다. 도발 중인 녹각수호령에게 쓰면 끌어모은 적은 밀지 않고 보호막만 준다.', target='self', range=9, mp=18, cd=16, anim='hb_tilt', sfx='hb_leaf', sfxAt='op',
  ops=[herb('a3', range=9, speed=13, shield=0.12, shieldLv=0.015, shieldDur=4, push=2.0, reachMin=1.6, reachMax=2.8)], fx=dict(color=0xffc060))
S(J, 2, 0, HA, 4, 'hb_a4', '백초 훈증진', 'support', '가운데 작은 탕관을 놓고 둥근 약초진을 편다. 진 안의 나와 생명 소환물이 주기적으로 회복하고 해로운 상태 하나가 풀린다. 바닥 무늬가 실제 범위.', target='ground', range=6, mp=30, cd=24, anim='hb_sow', sfx='hb_simmer', sfxAt='strike',
  ops=[herb('a4', survival=True, r=3.0, dur=8, tick=1.5, heal=0.025, grow=0.5)], fx=dict(color=0xffc060))
S(J, 2, 0, HA, 5, 'hb_a5', '백초귀원', 'ultimate', '둥글게 펼친 약초의 기를 금빛 환약 하나로 모아 삼킨다. 환약이 몸에 스며드는 순간 크게 회복하고, 빛의 약초꽃이 피어 공격·방어·회복 효과가 오른다.', target='self', mp=60, cd=60, cast=0.5, anim='hb_gather', sfx='hb_bloom', sfxAt='op',
  ops=[herb('a5', heal=0.35, absorb=0.62, dur=12, atk=0.25, def_=0.3, healup=0.3)], fx=dict(color=0xffd060))
S(J, 2, 1, HB, 1, 'hb_b1', '갈근·반룡근', 'summon', '땅에 뿌린 씨앗에서 굵은 칡뿌리가 솟아 주변의 적 발을 감아 묶고, 뿌리 끝의 작은 용머리가 거듭 문다. 보스는 묶이지 않고 느려진다.', target='ground', range=7, mp=24, cd=10, anim='hb_sow', sfx='hb_root', sfxAt='strike',
  ops=[herb('b1', life=10, hp=0.6, coef=0.6, rate=1.0, range=2.2, root=1.2, limit=2, grow=0.5)], fx=dict(color=0x8ac050))
S(J, 2, 1, HB, 2, 'hb_b2', '독초·자운화', 'summon', '보라 꽃봉오리가 차례로 자라 피어나며 1초마다 독 포자를 둥글게 내뿜는다. 범위 안의 적은 중독되어(지속 피해) 공격력이 떨어진다. 꽃이 몇 송이든 한 적은 한 번씩만 맞는다.', target='ground', range=7, mp=26, cd=14, anim='hb_sow', sfx='hb_root', sfxAt='strike',
  ops=[herb('b2', r=2.8, dur=8, tick=1.0, coef=0.45, poison=0.1, poisonDur=3, atkdown=0.1, grow=0.6)], fx=dict(color=0xa060e0))
S(J, 2, 1, HB, 3, 'hb_b3', '천년삼 동자', 'summon', '씨앗에서 싹이 터 통통한 천년삼 동자가 튀어나온다. 뿌리 팔로 적을 채찍질하고, 4초마다 금빛 약방울을 주인에게 보내 회복시킨다. 다시 부르면 지금 동자가 새로 기운을 얻는다.', target='self', mp=28, cd=20, anim='hb_sow', sfx='hb_root', sfxAt='strike',
  ops=[herb('b3', life=30, hp=0.5, coef=0.7, rate=1.4, range=2.6, heal=0.03, healEvery=4, limit=1, grow=0.7)], fx=dict(color=0xffd080))
S(J, 2, 1, HB, 4, 'hb_b4', '영지·녹각수호령', 'summon', '약초와 뿌리가 모여 영지 뿔을 단 사슴 수호령이 된다. 주변의 일반 몬스터를 끌어들이고(보스 제외) 가까운 적을 들이받으며, 발을 구르면 뿌리가 부채꼴로 뻗어 범위 피해를 준다.', target='ground', range=6, mp=34, cd=28, anim='hb_sow', sfx='hb_root', sfxAt='strike',
  ops=[herb('b4', life=20, hp=2.5, coef=0.5, rate=2.2, range=1.9, stomp=1.0, stompEvery=4.4, stompR=3.2, stompAng=100, limit=1, grow=0.8)], fx=dict(color=0x60c0a0))
S(J, 2, 1, HB, 5, 'hb_b5', '신농백초원', 'ultimate', '하늘에 커다란 본초 두루마리를 펼친다. 그려진 약초가 빛으로 내려와 넓은 약초밭이 되고, 그 순간 땅속 뿌리가 솟아 안의 적에게 피해를 준다. 약초밭은 적을 느리게 하고 그 안의 내 식물·영물 소환물을 강화한다.', target='self', mp=70, cd=70, cast=0.8, anim='hb_gather', sfx='hb_bloom', sfxAt='op',
  ops=[dict(op='telegraph', shape='circle', r=7, dur=0.8), herb('b5', r=7, dur=12, coef=2.4, slow=0.45, empower=0.5, tick=1.0)], fx=dict(color=0xb0ff70))
S(J, 2, 2, HC, 1, 'hb_c1', '목행·청룡승근', 'attack', '앞쪽 일직선으로 뿌리가 차례로 땅을 뚫고 솟아오르고, 마지막 뿌리가 수염 달린 청룡 머리가 되어 꿰뚫는다. 묶인(속박) 적에게는 추가 피해.', range=9, mp=20, cd=6, anim='hb_raise', sfx='hb_root', sfxAt='strike',
  ops=[herb('c1', coef=2.4, len=9, w=1.2, vsRoot=1.6, step=0.055)], fx=dict(color=0x4ad0a0))
S(J, 2, 2, HC, 2, 'hb_c2', '화행·주작천구', 'attack', '손에서 작은 쑥뜸에 불을 붙여 던지면 붉은 날개를 편 주작이 낮게 날아가 부딪친다. 좌우로 날개 모양 불꽃이 퍼져 범위 피해와 화상. 방어력이 깎인 적에게 더 아프다.', target='ground', range=9, mp=24, cd=8, anim='hb_moxa', sfx='throw', sfxAt='strike',
  ops=[herb('c2', coef=2.6, speed=11, core=1.3, wing=5.0, depth=1.4, burn=0.15, burnDur=4, vsDefdown=1.25)], fx=dict(color=0xff5a2a))
S(J, 2, 2, HC, 3, 'hb_c3', '오령산', 'attack', '약포지를 펼쳐 지정한 곳에 산제를 흩뿌린다. 둘레 다섯 곳에 푸른 약인이 찍히고, 거기서 시작한 낮은 물길이 가운데로 모이며 범위 안의 일반 몬스터를 끌어당긴다(보스는 끌리지 않음). 물길이 한 점에서 만나는 순간 마지막 물결이 범위 피해를 준다(적마다 한 번).', target='ground', range=7, mp=24, cd=11, anim='hb_scatter', sfx='hb_seal', sfxAt='op',
  ops=[herb('c3', coef=2.2, r=3.2, run=0.6, stop=0.55, vmax=7)], fx=dict(color=0x4ab0ff))
S(J, 2, 2, HC, 4, 'hb_c4', '소경활혈탕', 'attack', '붉은 탕액으로 허공에 한 획을 그으면 적 하나의 몸 위에 맥로가 나타나 따라붙는다. 붉은 빛이 세 마디를 차례로 지나며 \'탁, 탁\' 두 번 치고, 반 박자 뒤 마지막 마디가 크게 풀리며 큰 피해와 함께 방어력을 떨어뜨린다(주작천구가 더 아프게 들어감).', target='enemy', range=6, mp=22, cd=7, anim='hb_stroke', sfx='hb_tak', sfxAt='op',
  ops=[herb('c4', coefs=[0.7, 0.7, 1.8], times=[0.12, 0.26, 0.56], defdown=0.2, defdownDur=5, lose=11)], fx=dict(color=0xff4a3a))
S(J, 2, 2, HC, 5, 'hb_c5', '수행·현무약해', 'attack', '호리병의 청옥빛 약수가 넓고 낮은 물결이 되어 앞으로 밀려간다. 맞은 적은 밀려나고 느려지며(보스는 안 밀림), 물결이 지나간 내 약초 영역(백초 훈증진·자운화)은 2초 늘어난다(한 번 쓸 때 영역마다 한 번, 영역마다 최대 +4초).', range=8, mp=24, cd=9, anim='hb_pour', sfx='splash', sfxAt='strike',
  ops=[herb('c5', coef=1.8, len=8, w=2.4, speed=12, knock=2.5, slow=0.35, slowDur=3, extend=2.0, extendCap=4.0)], fx=dict(color=0x3a90ff))

# 누른 순간의 준비 연출(op 'pre', at = -동작의 타격 시각): 씨앗 뿌리기·손 원 그리기·쑥뜸 불붙이기·어깨 뒤 침·호리병 (그림만, 피해 없음)
HB_PRE = dict(hb_a1=('share', 0.30), hb_a2=('lift', 0.30), hb_a3=('tilt', 0.26), hb_a4=('sow', 0.34), hb_b1=('sow', 0.34), hb_b2=('sow', 0.34), hb_b3=('sow', 0.34), hb_b4=('sow', 0.34),
              hb_c1=('raise', 0.28), hb_c3=('scatter', 0.30), hb_c2=('moxa', 0.26), hb_c4=('stroke', 0.24), hb_c5=('gourd', 0.24))
for _d in SK:
    if _d['id'] in HB_PRE: w, t = HB_PRE[_d['id']]; _d['ops'].insert(0, herb('pre', what=w, at=-t))

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
# 뒤집기: 레벨 추가타는 한 방에 합침(oneHit, 총 피해 같음) — 한 번 퍼 올려 한 바퀴 뒤집으므로(예전엔 Lv3부터 2~3번 나눠 맞으며 공중에서 다시 띄워짐).
S(J, 1, 0, '식칼과 프라이팬', 3, 'ck1_a3', '뒤집기', 'attack', '큰 뒤집개로 적 하나를 부침개처럼 퍼 올려 뒤집는다. 일반 적은 잠시 떠서 움직이지 못하고, 띄울 수 없는 적에게는 추가 피해.', weapon='knife', target='enemy', range=1.8, mp=12, cd=8, anim='attack',
  ops=[dict(op='fx', cook='flip', at=-0.25), hit('single', 1.5, launch=0.8, vsImmune=1.6, oneHit=True, sfx='ck_flip', fx=dict(cook='flip'))], fx=dict(color=0xffd27a))
S(J, 1, 0, '식칼과 프라이팬', 4, 'ck1_a4', '도마 방어', 'support', '커다란 도마를 방패처럼 세워 정면에서 받는 피해를 줄인다.', target='self', mp=10, cd=14, anim='cast', sfxAt='op', ops=[buff('frontguard', 5, 0.5, cook='board', noAura=True)])
S(J, 1, 0, '식칼과 프라이팬', 5, 'ck1_a5', '손질 숙련', 'passive', '식칼 공격 속도와 식재료 획득량이 증가한다.', mods=[dict(stat='atkSpeed', mul=0.05, mulLv=0.02)], flags=dict(ingredientDrop=[0.1, 0.05]))
# 미트볼 던지기 (2026-11-14 소울 스트라이크식, 11-15 등 뒤에서 바로): 빈 손을 어깨 뒤로 튕기면(동작 ck_toss) 미트볼 5개가 등 뒤에서 퍼지며 곧바로 서로 다른 곡선으로 한 적에게
# 차례로 맞힘(js/meatball.js CUSTOM meatball_volley, 그림 js/cookfx.js volley). 단일 대상(주변 범위 피해 없음). 총 계수 = 1.7 x (1 + 0.06 x floor((Lv-1)/2))
# (예전 2~6개 split 총합과 같음) — 15/15/15/15/40 %로 나눔. 예전: 2~6개(Lv마다 +1), 하나하나 반경 1.2 m 작은 범위 피해.
S(J, 1, 1, '간단한 요리 공격', 1, 'ck1_b1', '미트볼 던지기', 'attack', '등 뒤에서 미트볼 다섯 개가 퍼져 나와 서로 다른 곡선으로 한 적에게 차례로 날아가 맞힌다. 마지막 한 방이 가장 세다.', target='enemy', range=7, mp=10, cd=4, anim='ck_toss', recover=0.38, sfxAt='op',
  ops=[custom('meatball_volley', coef=1.7, lvBonus=0.06, n=5, w=[0.15, 0.15, 0.15, 0.15, 0.40])], fx=dict(color=0xb06a3a))
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

# ======================================================================= 쉐프 (chef) — 2026-11-16 2차 개편: 전장을 고급 레스토랑 무대로
# 스킬 id·3×5 배치·배우는 레벨·최대 레벨·종류는 그대로(저장한 레벨·포인트·장착 칸이 그대로 새 스킬이 됨). 규칙은 js/chef.js(ChefKit, CUSTOM chef_*),
# 그림은 js/cheffx.js(메시 tools/blender/fx_chef.py), 동작 cf_* (tools/anim/swings.py), 소리 cf_* (tools/audio/chef_sfx.py), 아이콘 tools/ui/chef_icons.py.
# 수치는 개편 전 쉐프 값에서: 여러 번 때려도 총합은 그대로(split), 반응(증기 폭발·열충격)은 대상마다 시전 한 번에 한 번, 반응 피해는 다시 반응을 일으키지 않음.
J, C = 'chef', 0xff6a30
S(J, 2, 0, '불꽃의 오픈 키친', 1, 'cf_a1', '인페르노 웍', 'attack', '큰 웍을 두 번 뒤집어 정면 부채꼴을 볶는다. 첫 번째는 짧은 불꽃 호(70°, 3 m), 두 번째는 넓은 초승달 불길(120°, 3.6 m)로 화상을 남긴다. 공중으로 튄 재료는 다시 웍에 받아진다.', range=3.6, mp=22, cd=6, anim='cf_wok', sfx='cf_wok_toss', sfxAt='op', recover=0.45,
  ops=[custom('chef_wok', at=-1, r1=3.0, ang1=70, coef1=1.0, gap=0.28, r2=3.6, ang2=120, coef2=1.6, st=[st('burn', 3, 0.12)])], fx=dict(color=0xff6a30))
S(J, 2, 0, '불꽃의 오픈 키친', 2, 'cf_a2', '그랑 플람베', 'attack', '조준한 곳에 호박색 소스를 끼얹고 불씨를 던져 붙인다. 파란 불길이 소스를 따라 번진 뒤 주홍 불꽃이 솟아 범위 피해와 화상을 준다. 이미 둔화된 적은 시전마다 한 번 증기 폭발로 추가 피해를 받는다.', target='ground', range=6, mp=26, cd=9, anim='cf_splash', sfxAt='op', recover=0.4,
  ops=[custom('chef_flambe', at=-1, r=2.6, coef=2.8, ignite=0.45, st=[st('burn', 4, 0.15)], steam=dict(need='slow', coef=2.0))], fx=dict(color=0xffa030))
S(J, 2, 0, '불꽃의 오픈 키친', 3, 'cf_a3', '시그니처 압력솥', 'summon', '지정한 곳에 압력솥을 놓는다. 새어 나오는 증기가 곁의 적을 느리게 하고, 2.2초 뒤 뚜껑이 튀며 폭발해 피해·화상을 주고 적을 밀어낸다(보스는 밀리지 않음). 폭발 1초 전부터 바닥에 경고가 뜬다. 최대 2개, 더 놓으면 가장 오래된 솥이 조용히 치워진다.', target='ground', range=6, mp=26, cd=14, anim='cf_place', sfxAt='op',
  ops=[summon('pressure_cooker', ai='chef_cooker', life=3.0, hp=0.4, fuse=2.2, warn=1.0, steam=dict(r=2.4, tick=0.5, slow=0.3, dur=0.8), boom=dict(r=2.8, coef=4.0, knock=3, elem='fire', burst='none', quiet=True, st=[st('burn', 3, 0.12)]), limit=2, machine=True)], fx=dict(color=0xd87a3a))
S(J, 2, 0, '불꽃의 오픈 키친', 4, 'cf_a4', '브로셰트 러시', 'attack', '허공에서 재료가 꼬치에 꿰이고 짧은 불길에 구워진 뒤 차례로 날아간다. 꼬치는 앞쪽 직선(8 m)의 적을 모두 꿰뚫으며, 꼬치 하나는 같은 적을 한 번만 맞힌다. 스킬 레벨이 오르면 꼬치 수가 늘지만 총 피해는 나눠진다.', range=8, mp=28, cd=10, anim='cf_skewer', sfxAt='op', recover=0.35,
  ops=[custom('chef_skewers', at=-1, n=4, len=8, w=1.2, total=2.2, gap=0.11, speed=20, elem='fire')], fx=dict(color=0xff8a3a))
S(J, 2, 0, '불꽃의 오픈 키친', 5, 'cf_a5', '마스터 셰프 쇼타임', 'ultimate', '세 단계 쇼: ① 반투명 조리대 위로 식칼이 엇갈려 번뜩이며 재빨리 손질(3타) ② 거대한 웍이 재료를 불길과 함께 띄워 볶음(2타·화상) ③ 금빛 클로슈가 내려앉아 가장 큰 피해와 낮은 불꽃 충격파를 낸다. 단계마다 도구가 나타났다 사라진다.', target='self', mp=75, cd=70, cast=0.2, anim='cf_show', sfxAt='op',
  ops=[custom('chef_show', at=0.0, fwd=2.0, prep=dict(r=3.5, coef=0.8, n=3, t=0.15, gap=0.15), stir=dict(r=4.0, coef=1.6, n=2, t=0.8, gap=0.25, st=[st('burn', 3, 0.15)]), cloche=dict(r=4.5, coef=7.0, t=1.55), wave=dict(r=6.0, coef=1.4))], fx=dict(color=0xffc040))
S(J, 2, 1, '환상의 파티스리', 1, 'cf_b1', '소르베 퀸텟', 'attack', '다섯 가지 과일 소르베를 떠서 공중에 부채꼴로 펼친 뒤, 서로 다른 곡선으로 적 하나에게 차례로 날린다. 맞을 때마다 둔화가 조금씩 깊어진다(최대 40%). 대상이 쓰러지면 남은 소르베는 가까운 적을 찾고, 없으면 사라진다.', target='enemy', range=8, mp=20, cd=5, anim='cf_scoop', sfxAt='op', recover=0.3,
  ops=[custom('chef_sorbet', at=-1, n=5, coef=0.64, gap=0.09, speed=13, retarget=6, slow=dict(dur=2.5, first=0.12, step=0.07, cap=0.4))], fx=dict(color=0x9ad8ff))
S(J, 2, 1, '환상의 파티스리', 2, 'cf_b2', '프로즌 플레이팅', 'attack', '바닥에 얇은 접시 무늬를 그리고 소스로 장식하듯 서리 선을 그어 얼음꽃을 피운다. 범위 냉기 피해와 둔화. 맞기 직전에 화상이던 적은 화상이 사라지며 열충격 추가 피해를, 이미 둔화돼 있던 일반 적은 잠깐 빙결된다(보스 제외).', target='ground', range=6, mp=26, cd=9, anim='cf_plate', sfxAt='op', recover=0.4,
  ops=[custom('chef_plating', at=-1, r=2.6, coef=2.4, bloom=0.35, st=[st('slow', 3, 0.4)], shock=dict(need='burn', coef=2.2), freeze=1.2)], fx=dict(color=0xbfe8ff))
S(J, 2, 1, '환상의 파티스리', 3, 'cf_b3', '밀푀유 블레이드', 'attack', '금빛 페이스트리와 얇은 얼음 층을 겹친 원반을 던진다. 원반은 8 m를 꿰뚫고 날아갔다가 나에게 돌아오며, 갈 때와 올 때 같은 적을 한 번씩만 벤다. 돌아오는 동안 내가 움직이면 따라오고, 쓰러지면 그 자리에서 흩어진다.', range=8, mp=22, cd=7, anim='throw', sfxAt='op', recover=0.3,
  ops=[custom('chef_mille', at=-1, len=8, speed=13, w=1.3, coef=1.8, back=1.8, life=2.6)], fx=dict(color=0xffd88a))
S(J, 2, 1, '환상의 파티스리', 4, 'cf_b4', '슈가 아라베스크', 'summon', '허공에 그린 캐러멜 선이 이어져 굳으며 설탕 벽(폭 3.6 m)이 된다. 8초 동안 적의 이동과 적의 투사체를 막는다. 부서지거나 시간이 다 되면 설탕 파편이 한 번 터져 주변 적에게 피해를 준다(지역 이동 등으로 치워질 때는 터지지 않음). 지형 속·출입구·나나 동료와 겹치는 곳에는 세울 수 없다.', target='ground', range=5, mp=24, cd=18, anim='cf_draw', sfxAt='op',
  ops=[summon('sugar_wall', ai='chef_sugar', life=8, hp=1.5, width=3.6, shards=dict(r=2.4, coef=1.6, elem='ice'), limit=2, machine=True)], fx=dict(color=0xffc86a))
S(J, 2, 1, '환상의 파티스리', 5, 'cf_b5', '크로캉부슈 피날레', 'ultimate', '내 앞(1.5 m)에 작은 슈가 나선을 그리며 쌓여 디저트 탑이 되고, 금빛 캐러멜 실이 감기며 하얀 서리가 내려앉는다. 쌓이는 2초 동안 주변을 느리게 하고 약한 냉기 피해를 준다. 완성되면 위층부터 차례로 터져 냉기 피해를 주고, 맨 아래층은 넓은 냉기 고리를 내보내 일반 적을 잠깐 빙결시킨다.', target='self', mp=75, cd=70, cast=0.3, anim='cf_draw', sfxAt='op',
  ops=[custom('chef_tower', at=0.0, fwd=1.5, form=2.0, aura=dict(r=6.0, tick=0.5, coef=0.3, slow=0.45, max=4), layers=dict(n=3, r=4.0, coef=1.6, gap=0.15), base=dict(r=6.5, coef=2.6, freeze=1.2))], fx=dict(color=0xfff0d8))
S(J, 2, 2, '왕실의 테이블', 1, 'cf_c1', '시그니처 메뉴', 'craft', '공격·방어·회복 고급 코스 요리를 만든다. 성공하면 접시 위에 메인 → 곁들임 → 소스가 차례로 올라가고 테두리에 금빛이 돈다. 여러 개를 한 번에 만들 수 있다.')
S(J, 2, 2, '왕실의 테이블', 2, 'cf_c2', '황금 부용', 'support', '지정한 곳에 구리 냄비를 놓는다. 8초 동안 1초마다 범위(바닥 표시) 안의 나와 살아 있는 소환수(기계 제외)를 최대 체력의 2.5%씩 회복한다. 냄비는 하나만 — 다시 쓰면 예전 냄비는 사라진다.', target='ground', range=4, mp=28, cd=22, anim='cf_serve', sfx='cf_place', sfxAt='strike', sfxLead=0.0,
  ops=[area('heal', 3.0, 8, tick=1.0, heal=0.025, fx='none', chef='broth', living=True, single='broth')], fx=dict(color=0xffd27a))
S(J, 2, 2, '왕실의 테이블', 3, 'cf_c3', '봉 아페티!', 'support', '가방의 음식 하나를 은쟁반에 올려 먹는다. 즉시 최대 체력의 15%를 회복하고, 그 음식의 효과가 10초 동안 50% 강해진다(원래 효과에서 계산 — 다시 써도 겹쳐 커지지 않음). 먹을 음식이 없으면 기력·재사용 대기를 쓰지 않는다. 물약 재사용 대기와는 따로 돈다.', target='self', mp=10, cd=20, anim='cf_serve', sfxAt='op',
  ops=[consume('food', chef='bon', ops=[heal(pct=0.15)], boost=0.5, boostDur=10)], fx=dict(color=0xe8eef8))
S(J, 2, 2, '왕실의 테이블', 4, 'cf_c4', '셰프의 한 끗', 'passive', '내가 직접 만든 음식은 회복량과 지속 시간이 늘어난다(가방의 그 음식 중 직접 만든 개수만큼). 강화된 음식을 먹을 때 허브 잎과 작은 금빛 반짝임이 뜬다.', flags=dict(chefTouch=[0.10, 0.05]))
S(J, 2, 2, '왕실의 테이블', 5, 'cf_c5', '로열 그랑 디너', 'ultimate', '내 둘레에 작은 은쟁반 세 개가 놓이고 클로슈가 차례로 열린다. 첫째 — 은금빛 보호막, 둘째 — 공격력 30% 증가(10초), 셋째 — 최대 체력의 40% 회복. 효과는 뚜껑이 열리는 순간에 들어가며, 그 전에 쓰러지거나 지역을 옮기면 남은 쟁반은 취소된다. 가방의 음식과 무관하다.', target='self', mp=65, cd=75, cast=0.2, anim='cf_serve', sfxAt='op',
  ops=[custom('chef_royal', at=0.0, times=[0.45, 0.95, 1.45], shield=dict(base=80, coef=2.0, dur=8), atk=dict(val=0.3, dur=10), heal=0.4)], fx=dict(color=0xffe08a))

# ======================================================================= 대장장이 (blacksmith)
J, C = 'blacksmith', 0xff8a30
# 2026-11-13 대장장이 1차 전면 개편(스킬 id·배우는 레벨·5단계는 그대로 — 저장한 습득 레벨·장착 칸이 그대로 새 스킬이 됨):
#   A 단조와 제압: 모루 떨구기 · 집게 낚아채기 · 불량품 판정 · 백련타 · 장인의 박자(패시브)
#   B 열처리와 반격: 급랭 담금질 · 접이식 철벽 · 용광로 개방 · 튕김망치(2026-11-19, 예전 즉석 리벳 자리 — id bs1_b4 그대로) · 충격 재활용(패시브)
#   C 장인의 제작: 제작 4종은 그대로 + 재료 회수·알뜰 공급의 전투용 고철(임시 자원)
# 규칙·수치는 flags `smith`(js/smith.js SMITH가 기본값, 여기 값이 덮어씀)와 op 필드. 가열(heat, 최대 3중첩·5초, 더하면 시간 갱신)·
# 낙인(brand)은 STATUSES. 파생 피해(모루 충격파·급랭 번짐·낙인 파괴·충격 방출)는 derived — 가열·낙인·모루·충전을 다시 일으키지 않음.
# 타격 정지는 시전자·대상만(freezeT, op quiet), 카메라는 Renderer.kick 한 번. 이펙트 js/smithfx.js, 메시 tools/blender/fx_smith.py.
SM = dict(quiet=True, stOnHit=True)
S(J, 1, 0, '단조와 제압', 1, 'bs1_a1', '모루 떨구기', 'attack', '지정한 곳에 거대한 철 모루를 떨어뜨려 범위 피해와 짧은 경직을 준다. 모루는 5초 동안 남아, 내 망치 공격(기본 공격·백련타·집게 내려치기·튕김망치)이 닿으면 주변에 충격파를 낸다(0.4초 간격, 최대 4번). 모루는 하나만 둘 수 있고 길을 막지 않는다.', weapon='hammer', target='ground', range=5.0, mp=12, cd=7, anim='bs_call', sfx='bs_swing', sfxAt='strike', sfxLead=0.1, recover=0.25,
  ops=[custom('smith_anvil', r=2.0, coef=2.2, fall=0.34, at=-0.30, life=5.0, lifeLv=0.25, st=[st('stagger', 0.5)], pulse=dict(r=2.2, coef=0.6, gap=0.4, max=4))], fx=dict(color=C))
S(J, 1, 0, '단조와 제압', 2, 'bs1_a2', '집게 낚아채기', 'attack', '거대한 집게를 뻗어 적 하나를 붙잡아 내 앞으로 끌어온다. 끌려온 적이 내 모루 곁에 떨어지면 모루에 부딪혀 추가 피해를 받는다. 보스와 무거운 적은 끌려오지 않으므로 내가 다가가 집게로 내려친다. 장애물 너머의 적은 잡을 수 없다.', weapon='hammer', target='enemy', range=6.5, mp=12, cd=8, anim='bs_thrust', sfx='bs_swing', sfxAt='strike', sfxLead=0.08, recover=0.3,
  ops=[custom('smith_tongs', coef=1.3, heavy=2.1, reach=0.16, pull=0.24, stop=1.5, anvil=1.5, at=-0.16, st=[st('stagger', 0.6)])], fx=dict(color=0xd8dde6))
S(J, 1, 0, '단조와 제압', 3, 'bs1_a3', '불량품 판정', 'attack', '적 몸통에 붉은 \'불량\' 도장을 꽝 찍는다(10초). 작은 쇠 각인이 적을 따라다니며, 내 직접 공격이 맞을 때마다 금이 간다 — 첫 타에 실금, 둘째 타에 굵은 균열, 셋째 타에 \'쨍!\' 하고 깨지며 추가 피해를 주고 6초 동안 방어력을 낮춘다. 모루 충격파·화상·수증기 번짐 같은 파생 피해는 세지 않는다.', weapon='hammer', target='enemy', range=2.2, mp=12, cd=9, anim='bs_slam', sfx='bs_swing', sfxAt='strike', sfxLead=0.09,
  ops=[hit('single', 1.4, oneHit=True, sfx='bs_hit', brand=dict(dur=10, n=3, coef=2.0, defdown=0.22, defLv=0.02, defDur=6), fx=dict(smith='brand'), **SM)], fx=dict(color=0xff5a3a))
S(J, 1, 0, '단조와 제압', 4, 'bs1_a4', '백련타', 'attack', '앞쪽을 빠르게 세 번 두드리고(좌·우·좌) 크게 들어 올려 한 번 내려찍는다. 마지막 내려찍기는 맞은 적을 달군다(가열 1중첩). 내 모루가 닿는 곳에 있으면 모루 충격파가 함께 터진다.', weapon='hammer', target='dir', range=2.4, mp=16, cd=9, anim='bs_flurry', sfx='bs_swing', sfxAt='op', recover=0.3,
  ops=[hit('cone', 0.5, r=2.4, ang=110, hits=3, gap=0.14, oneHit=True, anvil=True, swingSfx='bs_swing', sfx='bs_hit', fx=dict(smith='tap'), **SM),
       hit('cone', 1.6, r=2.4, ang=80, at=0.62, oneHit=True, anvil=True, heat=1, swingSfx='bs_swing', sfx='bs_hit_heavy', st=[st('stagger', 0.4)], fx=dict(smith='finish'), **SM)], fx=dict(color=C))
S(J, 1, 0, '단조와 제압', 5, 'bs1_a5', '장인의 박자', 'passive', '전투 스킬을 쓰면 4초 안의 다음 기본 공격 한 번이 강화 망치질이 된다(피해 +60%, 레벨마다 +10%). 겹쳐 쌓이지 않으며, 강화된 동안 망치에 주황색 테두리가 뜬다.', weapon='hammer',
  flags=dict(tempo=[0.6, 0.1]))
S(J, 1, 1, '열처리와 반격', 1, 'bs1_b1', '급랭 담금질', 'attack', '허리의 담금통을 잡아 몸을 틀며 앞쪽 낮은 부채꼴로 냉각수를 끼얹는다. 물이 닿는 순간 피해와 짧은 둔화를 준다. 가열된 적은 가열을 모두 식히며 중첩마다 50% 추가 피해를 받고 \'치이익\' 흰 수증기가 터져 곁의 적에게도 조금 번진다(번진 피해는 다시 번지지 않음).', target='dir', range=3.2, mp=14, cd=9, anim='bs_douse', sfxAt='op',
  ops=[custom('smith_quench', at=-1, r=3.2, ang=80, coef=1.4, per=0.5, splash=0.2, splashR=1.6, speed=9.0, mouth=0.6, st=[st('slow', 2.5, 0.3)])], fx=dict(color=0xbfe8ff))
S(J, 1, 1, '열처리와 반격', 2, 'bs1_b2', '접이식 철벽', 'support', '앞에 철판을 펼쳐 5초 동안 앞쪽에서 오는 피해를 45%(레벨마다 +3%) 줄인다. 그동안 같은 버튼을 다시 누르면 철벽을 걷어차 앞으로 날려 피해를 주고 일반 적을 밀어낸다(보스는 피해만). 걷어차기는 기력이 들지 않고, 재사용 대기는 처음 펼칠 때부터 흐른다.', target='dir', range=6.0, mp=14, cd=16, anim='cast', sfx='bs_wall', recover=0.1,
  ops=[custom('smith_wall', at=-0.3, dur=5.0, block=0.45, blockLv=0.03, kick=dict(coef=1.8, w=2.4, len=6.0, push=2.6, speed=16))], fx=dict(color=0xb8c0cc))
S(J, 1, 1, '열처리와 반격', 3, 'bs1_b3', '용광로 개방', 'attack', '화구를 열어 앞쪽 부채꼴로 불꽃과 쇳물을 짧게 뿜는다. 맞은 적은 화상을 입고 달궈진다(가열 2중첩). 바닥의 쇳물 자국은 보이기만 한다.', target='dir', range=3.2, mp=12, cd=7, anim='bs_thrust', sfx='bs_swing', sfxAt='strike', sfxLead=0.08,
  ops=[hit('cone', 1.5, r=3.2, ang=70, elem='fire', heat=2, sfx='bs_forge', st=[st('burn', 3, 0.08)], fx=dict(smith='forge'), **SM)], fx=dict(color=0xff8a30))
# 튕김망치(2026-11-19, 예전 즉석 리벳 bs1_b4 자리 — 같은 id라 저장한 습득 레벨·칸이 그대로): 허리춤의 손망치를 왼손으로 옆으로 던짐(동작 bs_toss, 0.24 s에 손을 떠남).
#   적 = 묵직한 한 방(던질 때마다 직접 타격 최대 1번), 내 모루 = '깡!' + 모루 충격파 시도(0.4 s 간격·최대 4번 공유) 뒤 위로 튀어 모루 3.5 m 안 가장 가까운 적에게 포물선으로 떨어짐
#   (닿는 순간 피해 — 직접 타격으로 셈), 튈 적이 없으면 바닥에 떨어져 사라짐. 휴대폰: 조준선 위에 적과 모루가 겹칠 때만 모루 우선. 규칙 js/smith.js smith_throw.
S(J, 1, 1, '열처리와 반격', 4, 'bs1_b4', '튕김망치', 'attack', '허리춤의 손망치를 꺼내 옆으로 던진다. 망치는 돌며 날아가 처음 닿은 적 하나에게 묵직한 피해를 준다. 내 모루에 맞으면 \'깡!\' 하고 모루 충격파를 한 번 일으킨 뒤(모루의 0.4초 간격·최대 4번 제한을 함께 씀) 위로 튀어 올라, 모루 3.5m 안에서 가장 가까운 적에게 떨어진다. 튈 적이 없으면 바닥에 떨어져 사라진다. 한 번 던질 때 망치가 적을 직접 때리는 것은 한 번뿐이다.', weapon='hammer', target='ground', range=6.0, mp=12, cd=9, anim='bs_toss', sfxAt='op', recover=0.2,
  ops=[custom('smith_throw', at=-1, coef=2.4, speed=15.0, bounce=3.5, lob=0.46, hop=1.6, st=[st('stagger', 0.35)])], fx=dict(color=0xffb050))
S(J, 1, 1, '열처리와 반격', 5, 'bs1_b5', '충격 재활용', 'passive', '접이식 철벽으로 실제로 줄인 피해의 60%(레벨마다 +5%)를 8초 동안 모아 두었다가(모을 수 있는 양에 상한), 강화 기본 공격이나 튕김망치가 적을 직접 맞히는 순간 한 번에 추가 피해로 돌려준다(모루에서 튀어 떨어진 망치도 직접 타격). 빗나가거나 모루만 맞히면 모은 양은 그대로 남고, 모루 충격파로는 나가지 않는다. 최대 체력과 방어력도 조금 오른다.',
  flags=dict(recycle=[0.6, 0.05], recycleCap=[1.5, 0.25]), mods=[dict(stat='maxHp', mul=0.03, mulLv=0.015), dict(stat='def', add=2, addLv=1)])
S(J, 1, 2, '장인의 제작', 1, 'bs1_c1', '기초 무기 제작', 'craft', '기본 망치·도끼와 일반 무기를 만든다.')
S(J, 1, 2, '장인의 제작', 2, 'bs1_c2', '기초 방어구 제작', 'craft', '기본 금속 방어구를 만든다.')
S(J, 1, 2, '장인의 제작', 3, 'bs1_c3', '숫돌 연마', 'craft', '일시적으로 무기를 강화하는 숫돌을 만든다.')
S(J, 1, 2, '장인의 제작', 4, 'bs1_c4', '재료 회수', 'craft', '장비를 분해해 재료 일부를 얻는다. 전투에서는 낙인을 깨거나 철벽을 걷어차 맞히면 고철 조각이 튀어 저절로 모이고, 모을 때마다 기력을 조금 되찾는다(10초에 3개까지, 가방에는 들어가지 않음).', flags=dict(scrap=[3, 1]))
S(J, 1, 2, '장인의 제작', 5, 'bs1_c5', '알뜰 공급', 'passive', '기본 제작 비용이 줄어든다. (제작·분해·판매로 이익이 나지 않도록 상한 적용) 전투에서 고철 조각을 모으면 작은 보호막을 얻는다(겹치지 않음).', flags=dict(craftDiscount=[0.05, 0.03], scrapShield=[0.04, 0.01]))

# ======================================================================= 엔지니어 (engineer) — 전장에서 병기를 즉석 조립하고 지휘하는 마도공학자
# 2026-11-16 전면 개편: id·배우는 레벨(30/33/36/40/45)·최대 레벨·유형·3×5 배치·제작 레시피는 그대로 — 예전 저장의 습득 레벨·포인트·칸이 그대로 새 스킬이 됨.
# 규칙 js/engineer.js (EnKit, CUSTOM en_*, 기본 시각 EN), 화면 js/engfx.js (메시 tools/blender/fx_engineer.py), 동작 en_toss/en_signal/en_pile/en_cannon/en_rail (tools/anim/swings.py).
# 병기 표적 순서: 1) 내 테슬라 앵커가 지정한 대상 2) 사거리 안 내 선택 대상 3) 가까운 적. 피해는 모두 quiet(전역 정지·무작위 흔들림 없음), 카메라 kick은 파일 벙커·궁극기 주 타격만.
# 수치 출발점 = 예전 엔지니어: 포탑 0.7/0.8초·20초·2기, 지뢰 3.2(2.2 m)·3개, 드론 0.35×3/0.5초, 구속기 0.2/0.5초·둔화 40 %, 요새 14초, 철갑 2.6(방어 무시 40 %),
# 산탄 2.8(5 m 55°), 유도 미사일 1.1×4, 레일건 5.0(14 m), 궤도 포격 1.4×14 무작위, 수리 35 %, 동력 환급 30 %(+10 %/Lv), 오버클럭 8초 + 냉각 4초.
J, C = 'engineer', 0x5ac8ff
A_, B_, C_ = '전술 기계공학', '전자기 무장술', '현장 정비와 동력 제어'
S(J, 2, 0, A_, 1, 'en_a1', '전개식 센트리', 'summon', '공구함 장치를 지정한 곳에 던진다. 땅에 닿으면 지지대 세 개와 포신이 펼쳐지고, 적을 찾아 총구에서 탄을 쏜다. 같은 적을 4번 연속 맞히면 짧은 집중 사격을 한다(3초에 한 번). 대상이 죽거나 사거리를 벗어나면 다시 찾는다.',
  target='ground', range=6, mp=20, res=dict(type='power', cost=2), cd=8, anim='en_toss', recover=0.25,
  ops=[custom('en_sentry', life=20, hp=1.0, coef=0.7, rate=0.8, range=8, limit=2, focusN=4, burst=dict(n=3, gap=0.09, coef=0.45, cd=3.0))], fx=dict(color=0x5ac8ff))
S(J, 2, 0, A_, 2, 'en_a2', '스파이더 마인', 'summon', '원반 모양 지뢰를 던진다. 다리 네 개를 펴고 기다리다 적이 2.5 m 안에 들어오면 붉은 등을 깜박이며 짧게 쫓아가고, 가까워지면 뛰어올라 한 번 터진다. 한 번에 쫓는 거리와 수명에 한계가 있고 벽을 넘지 못한다.',
  target='ground', range=6, mp=16, res=dict(type='power', cost=1), cd=6, anim='en_toss', recover=0.25,
  ops=[custom('en_spider', life=25, trigger=2.5, speed=4.5, run=6.0, total=14.0, leap=0.9, r=2.2, coef=3.2, limit=3, elem='fire')], fx=dict(color=0xff8a40))
S(J, 2, 0, A_, 3, 'en_a3', '트라이윙 편대', 'summon', '등 뒤에서 접힌 드론 세 기를 차례로 쏘아 올린다. 날개를 펴고 내 둘레에 삼각 대형을 짜 같은 적을 차례로 쏘고, 3초마다 대형을 맞춰 한꺼번에 일제 사격한다. 편대의 공격력은 세 기가 나눠 가진다.',
  target='self', mp=26, res=dict(type='power', cost=3), cd=18, anim='en_signal', recover=0.25,
  ops=[custom('en_drones', n=3, life=18, hp=0.4, coef=1.05, rate=0.5, range=7, salvo=3.0, salvoMul=1.5)], fx=dict(color=0x6ae0ff))
S(J, 2, 0, A_, 4, 'en_a4', '테슬라 앵커', 'summon', '전극 세 개를 삼각형으로 박아 코일을 펴고 전류로 잇는다. 삼각형 안의 적은 감전 피해와 둔화를 받는다. 삼각형 안의 내 선택 대상(없으면 가운데에 가장 가까운 적)을 표적으로 지정해 내 병기들이 먼저 노린다.',
  target='ground', range=6, mp=22, res=dict(type='power', cost=2), cd=16, anim='en_toss', recover=0.25,
  ops=[custom('en_anchor', R=3.0, life=10, tick=0.5, coef=0.2, limit=1, elem='shock', st=[st('slow', 1, 0.4)])], fx=dict(color=0x7af0ff))
S(J, 2, 0, A_, 5, 'en_a5', '아틀라스 워커', 'ultimate', '가까운 곳에 동력 코어를 떨어뜨리면 다리·몸체·장갑이 차례로 붙어 커다란 보행 병기가 일어선다. 기관포 연사 → 미사일 → 주포 순서로 공격을 되풀이하고, 시간이 끝나면 장갑을 접고 흩어진다.',
  target='self', range=0, mp=60, res=dict(type='power', cost=5), cd=80, anim='en_toss', recover=0.3,
  ops=[custom('en_walker', life=14, hp=4.0, range=9, gun=dict(n=12, gap=0.12, coef=0.4), missile=dict(n=4, gap=0.14, coef=1.4, r=1.6, cap=3), cannon=dict(coef=5.0, r=2.2), cycle=6.0, walkMax=3.0)], fx=dict(color=0xffb050))
S(J, 2, 1, B_, 1, 'en_b1', '파일 벙커', 'attack', '자세를 낮추고 짧게 파고들며 팔 옆의 타격 장치를 편다. 피스톤이 압축·잠금된 뒤 강철 말뚝이 튀어나와 바로 앞의 적 하나를 꿰뚫는다(방어력 50 % 무시). 맞은 적 뒤쪽 원뿔로 충격파가 퍼져 그 뒤의 적에게도 피해를 준다. 사거리가 짧다.',
  target='enemy', range=2.4, mp=18, cd=5, anim='en_pile', recover=0.3,
  ops=[dict(op='lunge', dist=0.9, dur=0.16, at=-0.12), custom('en_pile', coef=3.4, pen=0.5, back=dict(r=2.4, ang=50, coef=0.9))], fx=dict(color=0xffc070))
S(J, 2, 1, B_, 2, 'en_b2', '브리치 캐논', 'attack', '짧고 굵은 포신을 두 손으로 받쳐 앞쪽 부채꼴로 산탄을 쏜다. 가까울수록 피해가 크고(최대 135 %, 최소 65 %) 짧게 경직시킨다. 테슬라 앵커가 지정한 적에게는 15 % 더 아프다.',
  target='dir', range=5, mp=20, cd=6, anim='en_cannon', recover=0.3,
  ops=[custom('en_breach', r=5, ang=55, coef=2.8, near=1.35, far=0.65, stagger=[0.6, 0.25], anchorBonus=0.15)], fx=dict(color=0xffa040))
S(J, 2, 1, B_, 3, 'en_b3', '벌집 미사일 포드', 'attack', '어깨 뒤 포드의 벌집 덮개가 열리고 작은 미사일 6발이 차례로 솟아올랐다가 서로 다른 곡선으로 대상에게 날아가 작게 터진다. 대상이 쓰러지면 가까운 적에게, 없으면 사라진다. 레드라인 중에는 2발 더.',
  target='enemy', range=11, mp=28, res=dict(type='power', gain=1), cd=9, anim='en_signal', recover=0.3,
  ops=[custom('en_hive', n=6, coef=0.75, r=1.0, retarget=6, extra=2)], fx=dict(color=0xff9a40))
S(J, 2, 1, B_, 4, 'en_b4', '헬릭스 레일캐논', 'attack', '두 레일을 좌우로 벌리고 코일을 뒤에서 앞으로 차례로 밝혀 0.85초 축전한 뒤, 누른 순간의 방향으로 청백 탄체를 쏜다. 14 m 직선 위의 적을 모두 한 번씩 꿰뚫고, 꿰뚫린 적은 8초 동안 궤도 포격의 우선 표적이 된다.',
  target='dir', range=14, mp=32, cd=12, anim='en_rail', recover=0.8,
  ops=[custom('en_rail', len=14, w=1.2, coef=5.0, elem='shock')], fx=dict(color=0xbfe8ff))
S(J, 2, 1, B_, 5, 'en_b5', '오비탈 브레이커', 'ultimate', '표적 지정기를 쏘아 올리면 바닥에 조준 고리 세 개가 차례로 고정되고, 가는 낙하 궤적과 함께 정밀 포격 3발이 떨어진 뒤 가운데에 강한 관통 포격이 꽂힌다. 레일캐논에 꿰뚫린 적을 먼저 노리고 20 % 더 아프다.',
  target='ground', range=9, mp=70, cd=75, anim='en_signal', recover=0.3,
  ops=[custom('en_orbital', R=5, n=3, coef=2.2, r=1.6, core=dict(coef=6.0, r=2.6), railBonus=0.2)], fx=dict(color=0xbfe8ff))
S(J, 2, 2, C_, 1, 'en_c1', '정밀 병기 제작', 'craft', '권총·산탄총·소총을 만든다. 완성하면 설계도 위에서 총열·몸체·동력 코어가 맞물려 결합된다.')
S(J, 2, 2, C_, 2, 'en_c2', '모듈 어셈블리', 'craft', '속사 모듈(공격 속도↑ 공격력↓)·확산 모듈(공격력↑ 공격 속도↓)을 만든다. 무기에 단 모듈은 내 센트리·드론·워커 기관포에도 같은 장단점으로 적용되고 외형 부품(회전 탄창 / 넓은 포구)이 바뀐다. 지뢰·앵커는 그대로.')
S(J, 2, 2, C_, 3, 'en_c3', '리페어 비콘', 'support', '발밑에 정비 비콘을 꽂고 작은 정비 드론을 부른다. 6초 동안 1초마다 6 m 안의 손상된 기계 병기를 수리하고(손상이 클수록 효율↑, 한 번에 최대 체력의 9 %까지), 나에게 작은 장갑 보호막을 씌운다. 생명체 소환물은 수리하지 않는다.',
  target='self', mp=18, cd=10, anim='en_toss', recover=0.25,
  ops=[custom('en_beacon', life=6, r=6, tick=1.0, pct=0.06, missingBonus=0.5, cap=0.09), shield(30, 0.6, 6, power='atk', noAura=True)], fx=dict(color=0x5ae6d2))
S(J, 2, 2, C_, 4, 'en_c4', '리커버리 코어', 'passive', '내 기계 병기가 수명을 다하면 들인 전력의 일부를 작은 청색 코어로 회수한다. 부서지면 절반만, 교체·지역 이동·쓰러짐으로 사라지면 회수하지 않는다. 기계마다 한 번, 들인 전력보다 많이 돌려받지 않는다.', flags=dict(powerRefund=[0.3, 0.1]))
S(J, 2, 2, C_, 5, 'en_c5', '레드라인 프로토콜', 'support', '내 기계 병기의 동력 코어를 한계까지 올린다. 8초 동안 병기의 공격 속도 40 %·화력 25 %가 오르고(발사 간격은 0.22초보다 짧아지지 않음), 끝나면 4초 동안 냉각되어 약해진다(공격 속도 −20 %, 화력 −20 %). 생명체 소환물에는 적용되지 않는다.',
  target='self', mp=24, cd=30, anim='en_signal', recover=0.25,
  ops=[custom('en_redline', dur=8, durLv=0.5, dmg=0.25, dmgLv=0.05, rate=1.4, minGap=0.22, cool=4, coolDmg=-0.2, coolRate=0.8)], fx=dict(color=0xff7a30))
for _d in SK:   # 엔지니어 소리는 규칙(js/engineer.js)이 실제 순간에 냄 — 누른 순간의 공용 소리는 없음
    if _d['job'] == 'engineer' and _d['type'] not in ('craft', 'passive'): _d['sfxAt'] = 'op'

# ======================================================================= 미용사 (hairdresser)
J, C = 'hairdresser', 0xff7ab0
# 2026-11-13 연출 개편 (수치·판정은 그대로): 이펙트 js/hairfx.js (fx op `hair`, hit op fx.hair), 동작 hd_snip / hd_trim (tools/anim/swings.py,
# 타격 0.25 s = 예전 'attack'과 같음), 명중 소리 hd_snip(맞았을 때만), 전역 히트스톱·무작위 흔들림 대신 시전자·대상만 짧게 멈춤.
S(J, 1, 0, '가위 기술', 1, 'hd1_a1', '가위 연격', 'attack', '허공에 나타난 큰 가위가 적 하나를 빠르게 세 번 싹뚝 자른다.', weapon='scissors', target='enemy', range=1.8, mp=8, cd=4, anim='hd_snip',
  ops=[dict(op='fx', hair='shears', at=-0.25, gap=0.1), hit('single', 0.75, hits=3, gap=0.1, sfx='hd_snip', fx=dict(hair='snip'))])
S(J, 1, 0, '가위 기술', 2, 'hd1_a2', '앞머리 정리', 'attack', '큰 가위를 가로로 쓸어 앞머리를 다듬듯 전방을 한 줄로 자른다. 짧고 빠른 전방 범위 공격.', weapon='scissors', range=2.2, mp=8, cd=4, anim='hd_trim',
  ops=[hit('cone', 1.4, r=2.2, ang=90, sfx='hd_snip', fx=dict(hair='trim'))])
# 2026-11-14 연출 교체(수치·판정 그대로): 끝단 자르기 = 내 큰 가위를 가로로 활짝 벌려 겨눴다가 닫음(hd_end, 타격 0.25 s) + 대상 허리 높이의
# 수평 절단면·잘린 머리끝 다발(fx hair 'end'), 추가 피해가 실제로 붙을 때(맞기 전 체력 35% 이하)만 마무리 섬광
S(J, 1, 0, '가위 기술', 3, 'hd1_a3', '끝단 자르기', 'attack', '큰 가위를 가로로 활짝 벌렸다가 끝단을 싹뚝 잘라 낸다. 체력이 낮은 적에게 추가 피해.', weapon='scissors', target='enemy', range=1.8, mp=10, cd=6, anim='hd_end',
  ops=[dict(op='fx', hair='end', at=-0.25), hit('single', 1.6, vsLowHp=dict(pct=0.35, mul=1.8), sfx='hd_snip', fx=dict(hair='end', heavy=True))])
# 스텝 커트 = 두 손 동작 hd_step(옆으로 뛰며 머리·가슴·무릎 높이로 세 번 싹뚝, 대상 쪽을 본 채 — dash op anim/face). 이동 2.2 m·무적 없음·
# 첫 피해(이동 시작 0.12 s 뒤)·행동 잠금 0.2786 s는 예전 'dash' 동작과 같게: dash/fx op at -0.12, recover 0.1586
S(J, 1, 0, '가위 기술', 4, 'hd1_a4', '스텝 커트', 'attack', '옆으로 짧게 이동하며 층층이 벤다. 무적 시간 없음.', weapon='scissors', range=2.0, mp=10, cd=6, anim='hd_step', recover=0.1586,
  ops=[dict(op='fx', hair='step', at=-0.12), dash(2.2, side=True, invuln=False, at=-0.12, anim='hd_step', face=True, hit=hit('cone', 1.3, r=2.8, ang=150, sfx='hd_snip', fx=dict(hair='step')))])
S(J, 1, 0, '가위 기술', 5, 'hd1_a5', '섬세한 손놀림', 'passive', '가위 공격 속도와 치명타 확률이 증가한다.', mods=[dict(stat='atkSpeed', mul=0.04, mulLv=0.02), dict(stat='crit', add=0.03, addLv=0.015)])
S(J, 1, 1, '빗과 드라이', 1, 'hd1_b1', '빗 투척', 'attack', '빙글빙글 도는 빗을 직선으로 던진다.', target='enemy', range=8, mp=8, cd=3, anim='throw', ops=[proj('normal', 1.6, speed=16, fx='comb', burst='hit_pierce', hairProj=True)])
S(J, 1, 1, '빗과 드라이', 2, 'hd1_b2', '드라이 돌풍', 'attack', '큰 드라이어의 센 바람으로 전방에 피해를 주고 밀쳐 낸다.', range=3.6, mp=12, cd=7, anim='cast', sfx='hd_gust',
  ops=[dict(op='fx', hair='dryer', mode='gust', r=3.6, ang=60, at=-1), hit('cone', 1.3, r=3.6, ang=60, knock=2.5, fx=dict(hair='dry'))])
S(J, 1, 1, '빗과 드라이', 3, 'hd1_b3', '온풍 드라이', 'attack', '뜨거운 드라이어 바람으로 근거리에 지속 공격. 이동하면 중단된다.', range=3.0, mp=14, cd=8, anim='cast', sfx='hd_hot',
  ops=[dict(op='fx', hair='dryer', mode='hot', r=3.0, ang=50, dur=2.0, at=-1), channel(2.0, 0.25, [hit('cone', 0.35, r=3.0, ang=50, elem='fire', fx=dict(hair='dry'))], breakOnMove=True)])
S(J, 1, 1, '빗과 드라이', 4, 'hd1_b4', '냉풍 드라이', 'attack', '차가운 드라이어 바람으로 냉기 피해와 둔화.', range=3.4, mp=12, cd=7, anim='cast', sfx='hd_cold',
  ops=[dict(op='fx', hair='dryer', mode='cold', r=3.4, ang=60, at=-1), hit('cone', 1.4, r=3.4, ang=60, elem='ice', st=[st('slow', 3, 0.35)], fx=dict(hair='dry'))])
S(J, 1, 1, '빗과 드라이', 5, 'hd1_b5', '헤어롤 덫', 'summon', '밟은 적을 머리카락으로 감아 잠시 속박하는 헤어롤 덫.', target='ground', range=6, mp=12, cd=10, anim='throw',
  ops=[summon('hair_roller', ai='trap', life=15, hp=0.2, trigger=1.0, onTrigger=dict(r=1.2, coef=0.8, st=[st('root', 1.5)], burst='dust', hair='trap'), limit=3, machine=True)])
S(J, 1, 2, '스타일링과 관리', 1, 'hd1_c1', '산뜻한 스타일링', 'support', '이동 속도를 높인다.', target='self', mp=10, cd=16, anim='cast', sfx='hd_style', ops=[dict(op='fx', hair='style', kind='haste'), buff('haste', 8, 0.25)])
S(J, 1, 2, '스타일링과 관리', 2, 'hd1_c2', '헤어 코팅', 'support', '윤기 나는 코팅으로 작은 보호막을 두른다.', target='self', mp=12, cd=14, anim='cast', sfx='hd_style', ops=[dict(op='fx', hair='style', kind='coat'), shield(30, 0.9, 6)])
S(J, 1, 2, '스타일링과 관리', 3, 'hd1_c3', '기분 전환', 'support', '둔화를 없애고 잠시 둔화 저항을 얻는다.', target='self', mp=10, cd=14, anim='cast', sfx='hd_style', ops=[dict(op='fx', hair='style', kind='fresh'), cleanse(9, ['slow']), buff('slowres', 5, 1)])
S(J, 1, 2, '스타일링과 관리', 4, 'hd1_c4', '염색약 배합', 'craft', '외형 색을 바꾸는 염색약을 만든다.')
S(J, 1, 2, '스타일링과 관리', 5, 'hd1_c5', '깔끔한 마무리', 'passive', '적을 처치하면 이동 속도가 증가한다. 중첩되지 않고 시간만 갱신.', flags=dict(killHaste=[0.15, 0.03]))

# ======================================================================= 디자이너 (designer) — 2026-11-16 2차 개편: 오트쿠튀르 마도사
# 스킬 id·3×5 배치·배우는 레벨·최대 레벨·종류는 그대로(저장한 레벨·포인트·장착 칸이 그대로 새 스킬이 됨). 규칙은 js/designer.js(DsKit, CUSTOM ds_*,
# 시침 표식 = 대상·시전자마다 최대 3·8초), 그림은 js/designerfx.js(메시 tools/blender/fx_designer.py), 동작 ds_* (tools/anim/swings.py),
# 소리 ds_* (tools/audio/designer_sfx.py), 아이콘 tools/ui/designer_icons.py. 레시피 r_outfit·r_emb_*·r_ribbon 은 그대로.
J, C = 'designer', 0xe060c0
S(J, 2, 0, '마법 입체재단', 1, 'ds_a1', '실크 드레이핑', 'attack', '실크 두 줄이 양옆에서 날아가 조준한 곳의 적들을 반투명 원단으로 감싸고, 금빛 핀이 모서리를 고정하는 순간 범위 피해와 짧은 속박을 주며 시침 표식을 남긴다. 보스는 속박 대신 둔화. 속박이 끝나면 원단이 풀려 사라진다.', target='ground', range=7, mp=24, cd=10, anim='ds_drape', sfxAt='op', recover=0.35,
  ops=[custom('ds_drape', at=-1, r=3.0, coef=1.2, pin=0.32, st=[st('root', 2.0)])], fx=dict(color=0xf0a0d8))
S(J, 2, 0, '마법 입체재단', 2, 'ds_a2', '패턴 브레이크', 'attack', '가까운 적에게 짧은 재단 점선을 긋고, 큰 마법 가위가 점선을 따라 한 번 닫히는 순간 벤다. 그 적에게 남긴 내 시침 표식을 모두 소비해 표식마다 피해가 커지고, 속박된 적은 더 크게 베인다(배율 상한 있음). 표식이 없어도 기본 피해를 준다.', target='enemy', range=2.4, mp=20, cd=6, anim='ds_snip', sfxAt='op', recover=0.3,
  ops=[custom('ds_break', at=-1, coef=2.0, per=0.7, bound=0.3, cap=2.8, total=3.2, len=2.2)], fx=dict(color=0xffd27a))
S(J, 2, 0, '마법 입체재단', 3, 'ds_a3', '오트쿠튀르 스티치', 'attack', '조준한 곳에 지그재그 봉제선이 그려지고, 금빛 바늘이 그 선을 따라 차례로 꿰뚫으며 뒤로 실을 잇는다. 바늘이 지나는 자리의 적이 피해를 받고(적마다 최대 4번) 시침 표식이 남는다. 마지막 바늘이 실을 당겨 꿰인 적을 가운데로 조이며 마무리한다.', target='ground', range=8, mp=26, cd=10, anim='ds_sew', sfxAt='op', recover=0.35,
  ops=[custom('ds_stitch', at=-1, r=2.4, n=6, gap=0.13, coef=0.55, w=1.3, maxPer=4, start=0.12, fin=dict(coef=0.8, pull=0.6))], fx=dict(color=0xffd27a))
S(J, 2, 0, '마법 입체재단', 4, 'ds_a4', '크로스 커팅', 'attack', '분홍 대각선 베기와 은빛 반대 대각선 베기로 앞에 X자를 새긴다. 두 절단 경로에 닿은 적은 각각 피해를 받고, 두 선이 교차한 중심의 적은 한 번 더 크게 베인다(시전마다 대상마다 한 번).', range=3.0, mp=22, cd=7, anim='ds_cross', sfxAt='op', recover=0.3,
  ops=[custom('ds_cross', at=-1, fwd=1.7, len=3.4, w=1.0, coef=1.6, gap=0.16, centre=dict(r=0.9, coef=1.5))], fx=dict(color=0xff8ac8))
S(J, 2, 0, '마법 입체재단', 5, 'ds_a5', '그랑 패턴 피날레', 'ultimate', '머리 위에 의상 패턴 도면을 펼치고 앞쪽 넓은 바닥에 금빛 재단 점선을 차례로 새긴 뒤(0.8초), 거대한 가위가 닫히는 순간 모든 선을 한꺼번에 잘라 강한 범위 피해를 준다. 적마다 내 시침 표식을 소비해 강해지고, 속박된 적은 추가 피해(배율 상한 있음). 자르는 즉시 다시 움직일 수 있다.', target='self', mp=70, cd=70, cast=0.8, anim='ds_finale', sfxAt='op', recover=0.3,
  ops=[custom('ds_finale', at=0, r=6.5, ang=110, coef=7.0, per=0.4, bound=0.5, cap=2.4, total=2.8, lines=7)], fx=dict(color=0xffd27a))
S(J, 2, 1, '쿠튀르 런웨이', 1, 'ds_b1', '실크 로드', 'attack', '앞으로 얇은 실크 길을 펼치고 그 위를 짧게 미끄러져 돌진한다. 지나가는 길의 적을 한 번씩 베고 시침 표식을 남긴다. 실크 길은 실제로 갈 수 있는 곳까지만 펼쳐지며(벽을 지나지 않음) 무적 시간은 없다.', range=6, mp=20, cd=8, anim='ds_glide', sfxAt='op', recover=0.2,
  ops=[custom('ds_road', at=-1, dist=5.0, speed=14, w=1.4, coef=1.8)], fx=dict(color=0xf0a0d8))
S(J, 2, 1, '쿠튀르 런웨이', 2, 'ds_b2', '리본 피루엣', 'attack', '짧게 돌며 넓은 리본 두 줄을 서로 다른 각도로 펼친다. 둘레의 적을 약하게 끌어당기며 여섯 번 휘감고, 마지막에 매듭처럼 조여 피해와 둔화를 준다. 보스와 무거운 적은 끌려오지 않는다.', target='self', range=2.8, mp=26, cd=11, anim='ds_spin', sfxAt='op', recover=0.55,
  ops=[custom('ds_pirouette', at=-1, r=2.8, n=6, gap=0.2, coef=0.35, pull=0.45, knot=dict(coef=0.9, slow=dict(val=0.3, dur=2.0)))], fx=dict(color=0xe07ad0))
S(J, 2, 1, '쿠튀르 런웨이', 3, 'ds_b3', '미러 피팅', 'summon', '뒤로 짧게 물러나고, 원래 자리에 남은 잔상이 실로 풀리며 재봉 마네킹이 조립된다. 리본 망토를 입은 마네킹은 6초 동안 일반 적의 주의를 끈다(보스는 끌리지 않음). 시간이 다 되거나 부서지면 망토가 풀려 퍼지며 둘레에 피해와 둔화를 준다. 하나만 둘 수 있다.', target='self', mp=22, cd=16, anim='ds_glide', sfxAt='op', recover=0.2,
  ops=[custom('ds_mirror', at=-1, back=3.0, life=6, hp=1.6, r=2.6, coef=1.2, slow=dict(val=0.4, dur=2.5), limit=1)], fx=dict(color=0xf0a0d8))
S(J, 2, 1, '쿠튀르 런웨이', 4, 'ds_b4', '뮤즈의 초대', 'support', '지정한 적 위에 작은 조명을 비추고 발밑에 무대 문양, 양옆에 보석 핀을 세운다. 8초 동안 그 적이 받는 치명타 피해가 커진다. 다시 쓰면 시간만 새로 채워지고 효과가 겹치지 않는다.', target='enemy', range=9, mp=16, cd=14, anim='ds_pose', sfxAt='op', recover=0.25,
  ops=[custom('ds_muse', at=-1, dur=8, val=0.5)], fx=dict(color=0xffe080))
S(J, 2, 1, '쿠튀르 런웨이', 5, 'ds_b5', '오트쿠튀르 컬렉션', 'ultimate', '앞으로 좁고 짧은 빛의 런웨이를 펼친다. 망토·리본·장식이 서로 다른 의상을 입은 분신 세 명이 차례로 엇갈려 질주하며 경로의 적을 베고 시침 표식을 남기고(분신마다 적 한 번), 마지막에 본체가 가위와 리본을 펼치며 피날레를 장식한다. 10초 동안 이동 속도가 오른다.', target='self', mp=70, cd=70, cast=0.4, anim='ds_pose', sfxAt='op', recover=0.3,
  ops=[buff('haste', 10, 0.4, noAura=True), custom('ds_collection', at=0, len=7.0, w=1.8, n=3, gap=0.3, run=0.34, coef=1.8, fin=dict(r=3.0, coef=2.6, t=1.3))], fx=dict(color=0xffd27a))
S(J, 2, 2, '마스터 아틀리에', 1, 'ds_c1', '시그니처 쿠튀르', 'craft', '직업별 고급 의상을 만든다. 성공하면 머리 위 작은 마네킹에 원단이 걸리고 재단·봉제·장식 순서로 완성된 뒤 한 바퀴 돌아 보인다. 여러 벌을 한 번에 만들 수 있고, 만든 의상에는 제작자가 기록된다.')
S(J, 2, 2, '마스터 아틀리에', 2, 'ds_c2', '아르카나 엠브로이더리', 'craft', '의상에 새기는 공격·방어·자원 회복 자수를 만든다. 공중의 바늘이 문양을 차례로 꿰매고(공격 = 뾰족한 별, 방어 = 촘촘한 격자, 회복 = 흐르는 곡선) 완성되면 선을 따라 빛이 한 번 흐른다. 자수는 입고 있는 의상에 적용되며 다시 입어도 겹치지 않는다.')
S(J, 2, 2, '마스터 아틀리에', 3, 'ds_c3', '주얼 리본 크래프트', 'craft', '이동을 돕는 리본 장신구를 만든다. 리본 양 끝이 접혀 매듭이 지고 가운데 보석이 끼워진 뒤 주름을 따라 빛이 흐른다.')
S(J, 2, 2, '마스터 아틀리에', 4, 'ds_c4', '미라클 리스티치', 'support', '누르는 즉시 보호막을 두르고 출혈을 없앤다(출혈이 없어도 보호막은 적용). 찢어진 천 조각이 몸을 감싸고 바늘이 가장자리를 빠르게 꿰매 실크 보호막이 된다. 맞을 때마다 주름과 빛 물결이 일고, 보호막이 줄어들수록 가장자리 실밥이 풀린다.', target='self', mp=18, cd=16, anim='ds_pose', sfxAt='op', recover=0.2,
  ops=[custom('ds_restitch', at=-1, dur=8), shield(50, 1.2, 8, at=-1, noAura=True), cleanse(9, ['bleed'], at=-1, noAura=True)], fx=dict(color=0xe8d8ff))
S(J, 2, 2, '마스터 아틀리에', 5, 'ds_c5', '테일러드 퍼펙션', 'passive', '내가 직접 만든 의상이나 자수가 새겨진 의상을 입으면 방어력과 이동 속도가 오른다. 조건이 맞는 순간 몸 윤곽을 따라 금빛 치수선이 지나가고 브로치가 한 번 빛난다(상시 입자 없음). 장비를 바꾸면 바로 다시 계산된다.', flags=dict(fitting=[0.08, 0.03]))

# ======================================================================= 예술가 (artist)
J, C = 'artist', 0x50c8c8
# 2026-11-13 예술가 1차 연출 개편 — 수치(계수·기력·재사용·사거리·대상·상태이상·개수)는 그대로, 동작은 양손 붓(ar_flick/ar_sweep/ar_dab/ar_baton/ar_stac,
# 타격 시각은 예전 throw 0.1667 s·attack 0.25 s·cast 0.30 s와 같음), 이펙트는 js/artfx.js (op/fx의 art = 종류).
S(J, 1, 0, '기초 회화', 1, 'ar1_a1', '물감 탄환', 'attack', '작은 물감 투사체를 쏜다.', target='enemy', range=8, mp=6, cd=2.5, anim='ar_flick', tags=['paint'],
  ops=[proj('normal', 1.5, speed=15, fx='paint_blue', burst='explosion_ink', paint=True, art='blob')])
S(J, 1, 0, '기초 회화', 2, 'ar1_a2', '붓 휘두르기', 'attack', '근거리 부채꼴 붓질.', weapon='brush', range=2.4, mp=8, cd=4, anim='ar_sweep', tags=['paint'],
  ops=[hit('cone', 1.5, r=2.4, ang=100, fx=dict(art='sweep'))])
S(J, 1, 0, '기초 회화', 3, 'ar1_a3', '잉크 웅덩이', 'attack', '지속 피해와 둔화를 주는 잉크 웅덩이.', target='ground', range=7, mp=14, cd=9, anim='ar_flick', tags=['paint'],
  ops=[area('dmg', 2.4, 6, tick=1.0, coef=0.35, st=[st('slow', 1.2, 0.3)], fx='none', art='pool')])
S(J, 1, 0, '기초 회화', 4, 'ar1_a4', '색칠 표식', 'support', '대상에 표식을 남겨 다음 물감 공격을 강화한다.', target='enemy', range=8, mp=8, cd=8, anim='ar_dab', tags=['paint'],
  ops=[hit('single', 0.0, st=[st('painted', 8, 0.6)], fx=dict(art='mark'))])
S(J, 1, 0, '기초 회화', 5, 'ar1_a5', '붓끝 숙련', 'passive', '물감 사거리와 투사체 속도가 증가한다.', flags=dict(paintRange=[1.0, 0.5], projSpeed=[0.1, 0.05]))
S(J, 1, 1, '기초 음악', 1, 'ar1_b1', '음파 파동', 'attack', '전방의 여러 적에게 음파를 보낸다.', range=4.5, mp=10, cd=5, anim='ar_baton', tags=['music'],
  ops=[hit('cone', 1.4, r=4.5, ang=60, elem='sound', fx=dict(art='wave'))])
S(J, 1, 1, '기초 음악', 2, 'ar1_b2', '스타카토', 'attack', '빠른 음표 세 발.', target='enemy', range=8, mp=10, cd=4, anim='ar_stac', tags=['music'],
  ops=[proj('normal', 0.7, count=3, gap=0.1, speed=16, elem='sound', fx='note', burst='explosion_note', art='note')])
S(J, 1, 1, '기초 음악', 3, 'ar1_b3', '작은 불협화음', 'attack', '근거리 피해와 일반 적의 동작을 끊는다.', target='self', range=2.6, mp=12, cd=8, anim='ar_baton', tags=['music'],
  ops=[hit('circle', 1.3, r=2.6, elem='sound', st=[st('stagger', 0.8)], fx=dict(art='discord'))])
S(J, 1, 1, '기초 음악', 4, 'ar1_b4', '가벼운 행진곡', 'support', '이동 속도를 높인다.', target='self', mp=10, cd=16, anim='ar_baton', tags=['music'], ops=[buff('haste', 8, 0.2, noAura=True), dict(op='fx', art='march')])
S(J, 1, 1, '기초 음악', 5, 'ar1_b5', '박자 감각', 'passive', '음악 스킬을 쓴 뒤 다음 기본 공격이 빨라진다.', flags=dict(beatHaste=[0.3, 0.1]))
S(J, 1, 2, '영감과 창작', 1, 'ar1_c1', '영감 충전', 'support', '짧게 집중해 기력(MP)을 회복한다. 피격 시 중단.', target='self', mp=0, cd=18, anim='cast',
  ops=[channel(2.0, 0.5, [dict(op='mp', pct=0.05)], breakOnHit=True, breakOnMove=True), dict(op='fx', art='inspire')])
S(J, 1, 2, '영감과 창작', 2, 'ar1_c2', '즉흥 창작', 'support', '다음 회화·음악 공격의 피해와 범위를 늘린다.', target='self', mp=12, cd=12, anim='ar_dab', ops=[buff('inspired', 10, 0.4, noAura=True), dict(op='fx', art='improv')])
S(J, 1, 2, '영감과 창작', 3, 'ar1_c3', '작은 걸작', 'summon', '그림 생명체가 잠시 나타나 공격한다.', target='ground', range=5, mp=18, cd=14, anim='ar_dab', tags=['paint'],
  ops=[summon('masterpiece', ai='chase_melee', life=10, hp=0.6, coef=0.8, rate=1.0, range=1.6, limit=1, living=True, art=True)])
S(J, 1, 2, '영감과 창작', 4, 'ar1_c4', '예술 부적 제작', 'craft', '공격·방어·기력 강화 부적을 만든다.')
S(J, 1, 2, '영감과 창작', 5, 'ar1_c5', '창작의 흐름', 'passive', '회화와 음악을 번갈아 쓰면 다음 스킬의 기력 소모가 줄어든다.', flags=dict(flow=[0.2, 0.06]))

# ======================================================================= 화가 (painter) — 2026-11-16 개편 '그린 그림을 현실로 꺼내는 창조 마도사'
# 밑그림 -> 채색 -> 실체화 -> 작품 완성. 스킬 id·3×5 배치·배우는 레벨·최대 레벨·종류는 그대로(예전 저장의 레벨·포인트·칸이 그대로 새 스킬이 됨).
# 규칙은 js/painter.js(PaintKit, CUSTOM 'paint' — op.k = 칸), 그림은 js/painterfx.js(메시 tools/blender/fx_painter.py), 동작 pt_* (tools/anim/swings.py,
# 양손 붓), 소리 pt_* (tools/audio/painter_sfx.py), 아이콘 tools/ui/painter_icons.py. 수치는 예전 화가 값에서(같은 레벨 기준 총 피해 비슷하게, 이전 값은 docs/STATUS.md).
# 채색(빨강·파랑·노랑)은 대상마다 시전자별로 색마다 하나(같은 색은 시간만 갱신, 8초). 혼색·궁극기 반응 피해는 파생(derived) — 다시 채색·반응을 만들지 않음.
J, C = 'painter', 0x8a5ae0
PA, PB, PC = '생명을 그리는 화필', '색채 연성술', '현실이 되는 풍경화'
def paint(k, **kw): return dict(op='custom', fn='paint', k=k, **kw)
S(J, 2, 0, PA, 1, 'pt_a1', '묵수·흑랑', 'summon', '붓으로 늑대의 윤곽을 그리면 먹이 번져 몸통이 되고, 늑대가 그림 밖으로 뛰어나온다. 적을 쫓아 물어뜯고, 때때로 짧게 돌진해 앞의 적을 물고 지나간다. 최대 2마리(더 그리면 가장 오래된 늑대가 사라짐).',
  target='ground', range=6, mp=24, cd=12, anim='pt_sketch', sfx='pt_sketch', sfxAt='op',
  ops=[paint('a1', at=-0.34, life=16, hp=0.9, bite=0.9, rate=0.9, range=1.6, dash=dict(coef=1.0, every=5.0, dist=4.5, w=1.0), limit=2, draw=0.75)], fx=dict(color=0x2a2238))
S(J, 2, 0, PA, 2, 'pt_a2', '비화·채색군학', 'summon', '작은 종이에 색이 번지고 접혀 종이학 편대가 된다. 편대는 적 둘레를 돌며 잉크 깃털을 쏘고, 학이 하나씩 차례로 급강하한다. 학이 몇 마리든 편대 전체의 피해는 정해져 있다. 다시 쓰면 지금 편대의 시간이 새로 채워진다.',
  target='self', mp=24, cd=16, anim='pt_sketch', sfx='pt_sketch', sfxAt='op',
  ops=[paint('a2', at=-0.34, life=14, hp=0.9, n=5, hits=3, feather=1.0, rate=0.9, range=7, dive=dict(coef=0.6, every=2.6, per=2.0), limit=1, draw=0.8)], fx=dict(color=0xf0e8d8))
S(J, 2, 0, PA, 3, 'pt_a3', '유화·팔레트 기사', 'summon', '황금 액자 안의 기사 밑그림에 두꺼운 물감이 갑옷을 채우고, 기사가 액자 밖으로 걸어 나온다. 일반 몬스터의 주의를 끌고(보스는 끌지 않음) 검을 크게 휘둘러 앞쪽 적들을 벤다. 다시 쓰면 지금 기사의 시간·체력이 새로 채워진다.',
  target='ground', range=6, mp=30, cd=24, anim='pt_sketch', sfx='pt_sketch', sfxAt='op',
  ops=[paint('a3', at=-0.34, life=20, hp=2.2, swing=1.1, rate=1.3, range=2.0, r=2.4, ang=110, maxT=4, limit=1, draw=0.95)], fx=dict(color=0x3a6ae8))
S(J, 2, 0, PA, 4, 'pt_a4', '크로키·잔상 모사', 'summon', '대상의 윤곽을 연필선으로 빠르게 스케치하면 겹친 선이 입체가 되어 흑백 드로잉 분신이 종이에서 떨어져 나온다. 분신은 정해진 소환 능력치로 기본 공격과 짧은 돌진만 한다(대상의 능력·보스 기술은 따라 하지 않음).',
  target='enemy', range=8, mp=28, cd=22, anim='pt_sketch', sfx='pt_sketch', sfxAt='op',
  ops=[paint('a4', at=-0.34, life=12, hp=1.2, atk=1.0, rate=1.0, range=1.8, dash=dict(coef=0.8, every=4.0, dist=3.0, w=1.0), limit=1, draw=0.7)], fx=dict(color=0x606068))
S(J, 2, 0, PA, 5, 'pt_a5', '궁극·화룡점정', 'ultimate', '앞쪽 공중에 긴 두루마리를 펼치고 굵은 먹선으로 용을 그린 뒤, 붓끝으로 마지막 눈을 찍는다. 눈이 빛나는 순간 용이 종이 밖으로 나와 앞쪽(12 m)을 가로지르며 경로의 적을 꿰뚫고, 끝에서 먹물 숨결을 뿜는다. 적마다 관통 한 번, 숨결 한 번.',
  range=12, mp=75, cd=75, cast=0.8, anim='pt_eye', sfxAt='op',
  ops=[dict(op='telegraph', shape='line', len=12, w=3.0, dur=0.8), paint('a5', len=12, w=3.0, pierce=4.4, fly=0.9, breath=dict(r=3.2, coef=4.4))], fx=dict(color=0x1a1622))
S(J, 2, 1, PB, 1, 'pt_b1', '진홍·임파스토', 'attack', '몸을 돌려 붓을 크게 휘두르면 두껍고 붓결이 살아 있는 붉은 물감 띠가 앞쪽 부채꼴을 휩쓴다. 붓질이 지나가는 순간 피해와 화상, 빨강 채색. 맞은 자리에 입체 붓 자국과 불씨가 잠깐 남는다.',
  range=4.0, mp=20, cd=6, anim='pt_sweep', sfx='pt_brush', sfxAt='strike', sfxLead=0.06,
  ops=[paint('b1', r=4.0, ang=80, coef=2.2, sweep=0.12, burn=0.12, burnDur=3)], fx=dict(color=0xe03040))
S(J, 2, 1, PB, 2, 'pt_b2', '청람·워터컬러', 'attack', '붓을 낮게 쓸어내리면 투명한 푸른 물감이 땅을 따라 넓고 낮은 파도가 되어 앞으로 번져 간다. 지나가는 적마다 한 번 피해·둔화·파랑 채색. 파도 뒤에 남는 옅은 번짐은 장식이다.',
  range=8, mp=22, cd=7, anim='pt_low', sfx='pt_wash', sfxAt='strike', sfxLead=0.05,
  ops=[paint('b2', len=8, w=2.2, speed=10, coef=2.0, slow=0.3, slowDur=3)], fx=dict(color=0x3a6aff))
S(J, 2, 1, PB, 3, 'pt_b3', '황금·포인틸리즘', 'attack', '처음 고른 자리 둘레에 붓끝을 톡톡 튕길 때마다 금빛 점이 차례로 찍히고, 바깥 고리부터 안쪽으로 터진 뒤 가운데 점이 크게 터진다. 처음 자리에 고정되므로 빠져나가면 피할 수 있다. 맞을 때마다 노랑 채색.',
  target='enemy', range=8, mp=24, cd=9, anim='pt_dots', sfx='pt_dot', sfxAt='strike',
  ops=[paint('b3', rings=[2.4, 1.7, 1.0], coef=0.6, gap=0.15, start=0.3, fin=dict(r=1.1, coef=1.2, after=0.2), dots=18)], fx=dict(color=0xffd040))
S(J, 2, 1, PB, 4, 'pt_b4', '팔레트 퓨전', 'attack', '대상과 둘레 적(2.6 m)에 묻은 내 채색이 떨어져 작은 팔레트로 모이고, 붓이 휘저으면 꽃처럼 펼쳐지며 피해를 준다. 색 조합마다 반응 하나: 빨강+파랑 = 증기 폭발, 파랑+노랑 = 넓은 둔화 파동, 노랑+빨강 = 가운데 강한 일격, 세 색 = 삼원색 반응. 채색이 하나 이하면 기본 피해만.',
  target='enemy', range=8, mp=26, cd=8, anim='pt_mix', sfx='pt_mix', sfxAt='strike',
  ops=[paint('b4', r=2.6, coef=1.6, steam=dict(r=1.6, coef=1.4), wave=dict(r=3.5, coef=0.4, slow=0.4, dur=3), core=dict(coef=2.2), tri=dict(coef=2.8, steam=1.0, slow=0.4))], fx=dict(color=0xd070ff))
S(J, 2, 1, PB, 5, 'pt_b5', '궁극·스펙트럼 걸작', 'ultimate', '둘레(6 m) 적들의 내 채색을 거둬 공중에 붉은·푸른·금빛 추상화를 그린다. 마지막 붓질로 그림이 완성되는 순간 다색 파동이 퍼진다. 거둔 색 종류와 수만큼 강해지고, 빨강 = 화상, 파랑 = 둔화, 노랑 = 가운데 파열. 채색이 없어도 기본 피해. 내 풍경 영역은 영역마다 한 번 함께 반응한다.',
  target='self', mp=70, cd=70, cast=0.6, anim='pt_finale', sfxAt='op',
  ops=[dict(op='telegraph', shape='circle', r=6, dur=0.6), paint('b5', r=6, coef=6.0, perKind=0.15, perCount=0.03, countCap=10, burn=0.15, burnDur=4, slow=0.4, slowDur=4, core=dict(r=2.2, coef=2.0), land=1.6)], fx=dict(color=0xffffff))
S(J, 2, 2, PC, 1, 'pt_c1', '수채정원·꽃의 들판', 'support', '연두 밑칠이 번지고 줄기가 붓선처럼 자라 꽃이 차례로 핀다. 들판(바닥 테두리 = 실제 범위) 안의 나와 생명 소환물(기계 제외)이 1초마다 회복하고, 회복할 때 꽃에서 빛방울이 날아든다. 들판은 하나만.',
  target='ground', range=6, mp=26, cd=20, anim='pt_land', sfx='pt_wash', sfxAt='strike',
  ops=[paint('c1', survival=True, r=3.0, dur=8, tick=1.0, heal=0.025, grow=0.6)], fx=dict(color=0x9ae070))
S(J, 2, 2, PC, 2, 'pt_c2', '원근화법·백색 성벽', 'summon', '공중에 원근 보조선과 성벽 윤곽을 긋고 흰 물감을 채우면, 평면 그림이 접히듯 일어서 입체 성벽(3.4 m)이 된다. 적의 이동과 적의 직선 투사체를 막는다. 내구도와 남은 시간은 따로이며, 끝나면 다시 평면 그림이 되어 지워진다. 지형 속·출입구·나와 겹치는 곳·통로를 완전히 막는 곳에는 세울 수 없다. 최대 2개.',
  target='ground', range=5, mp=24, cd=18, anim='pt_land', sfx='pt_fold', sfxAt='strike',
  ops=[paint('c2', width=3.4, life=8, hp=2.0, limit=2, grow=0.5)], fx=dict(color=0xf4f0e8))
S(J, 2, 2, PC, 3, 'pt_c3', '폭풍화·뇌운의 캔버스', 'attack', '공중의 작은 화폭에 먹구름을 그리면 구름이 흘러나와 정한 곳 위에 머문다. 1초마다 비가 범위 안 적에게 작은 피해를 주고, 번개가 떨어지기 직전 땅에 짧은 먹빛 예고가 뜬다(예고 자리 = 번개 자리). 폭풍은 하나만.',
  target='ground', range=7, mp=28, cd=14, anim='pt_land', sfx='pt_wash', sfxAt='strike',
  ops=[paint('c3', r=3.0, dur=7, rain=0.2, rainTick=1.0, bolt=0.62, boltEvery=1.4, boltR=1.2, warn=0.45)], fx=dict(color=0x5a6a9a))
S(J, 2, 2, PC, 4, 'pt_c4', '마스터의 구도', 'passive', '풍경 영역(꽃의 들판·백색 성벽·뇌운의 캔버스)의 크기와 지속 시간이 늘어난다. 그릴 때 가장자리에 보조 붓선이 한 번 더 그어진다. 성벽은 늘어난 길이로 세울 수 없는 자리면 원래 길이로 세운다.',
  flags=dict(landscapeSize=[0.15, 0.05], landscapeTime=[0.15, 0.05]))
S(J, 2, 2, PC, 5, 'pt_c5', '궁극·만상갤러리', 'ultimate', '등 뒤에 반투명 화폭 세 장을 펼치고, 이미 그린 풍경과 그림 소환물을 금빛 붓선으로 이은 뒤 마지막 색으로 강화한다. 시전 순간 한 번: 꽃의 들판 = 회복 파동, 백색 성벽 = 내구도 일부 회복, 뇌운 = 예고 뒤 추가 번개. 그림 소환물은 10초 동안 공격력이 오른다(겹치지 않음). 작품이 하나도 없으면 쓸 수 없다(기력·재사용 대기 안 씀).',
  target='self', mp=60, cd=60, cast=0.5, anim='pt_finale', sfxAt='op',
  ops=[paint('c5', range=20, dur=10, summonAtk=0.4, heal=0.06, repair=0.3, bolt=1.2, boost=0.3)], fx=dict(color=0xffd27a))

# 누른 순간의 준비 연출(op 'pre', at = -동작의 타격 시각): 붓끝에 물감 모으기 (그림만, 피해 없음)
PT_PRE = dict(pt_b1=('red', 0.28), pt_b2=('blue', 0.26), pt_b3=('gold', 0.16), pt_b4=('palette', 0.30), pt_c1=('green', 0.30), pt_c2=('white', 0.30), pt_c3=('ink', 0.30))
for _d in SK:
    if _d['id'] in PT_PRE: w, t = PT_PRE[_d['id']]; _d['ops'].insert(0, paint('pre', what=w, at=-t))

# ======================================================================= 음악가 (musician) — 2026-11-16 개편 '마에스트로'
# 연주로 전장을 움직이고 환영 오케스트라를 지휘한다. 규칙은 js/musician.js(MusicKit, CUSTOM 'mu' — op.k = 칸), 그림은 js/musicfx.js
# (Blender tools/blender/fx_music.py -> assets/fx/fx_music.glb.json: 바이올린·활·첼로·플루트·하프·심벌즈·지휘봉·나팔·악보·음표·환영 연주자),
# 동작은 tools/anim/swings.py mu_*(붓은 등에 — stow, 왼손은 handL IK로 악기를 잡음). id·배우는 레벨·최대 레벨·종류·기력·재사용·사거리·시전 시간은 그대로.
# 총 피해는 예전 값 그대로(같은 레벨·장비): 스트링 피어스 1.8(관통) · 디스코드 브레이크 1.8 · 크레셴도 러시 0.8 x 4(마지막 타 = 같은 대상 연속 명중이면
# x (1 + 0.35 x 연속 수), 4연속 = 4.32) · 레조넌스 버스트 2.4 + 약화 적 추가 파동 1.4 · 코다 4.0 x (1 + 0.35 x 소비 악절, 최대 8)를 현악 15/타악 15/관악 20/합주 50 %로 ·
# 심포니 0.9 x 10 + 합주 5.0 · 팬텀 트리오 = 예전 2명 x 0.6/0.9초(초당 1.33)를 3명이 0.45초마다 차례로 0.5 + 3바퀴마다 합주 0.9(초당 1.33).
J, C = 'musician', 0x60d0a0
MA, MB, MC = '전장의 협주곡', '생명을 잇는 선율', '환영 오케스트라'
def mu(k, **kw): return dict(op='custom', fn='mu', k=k, **kw)
S(J, 2, 0, MA, 1, 'mu_a1', '현악·스트링 피어스', 'attack', '눈앞에 빛나는 현 세 줄을 띄우고 손끝으로 튕긴다. 현의 진동이 금빛 파동이 되어 앞으로 곧게 날아가며 닿는 적을 모두 꿰뚫는다. 맞히면 악절 1개.', range=10, mp=18, cd=4, anim='mu_pluck', sfx='mu_pluck', sfxAt='strike', sfxLead=0.02, recover=0.3,
  ops=[mu('a1', coef=1.8, len=10, w=1.0, speed=18, phrase=1)], fx=dict(color=0xffd870))
S(J, 2, 0, MA, 2, 'mu_a2', '타악·디스코드 브레이크', 'attack', '양손의 환영 심벌즈를 크게 벌렸다가 맞부딪친다. 부딪는 순간 찌그러진 원형 음파가 퍼져 주변 적에게 피해를 주고 공격력을 낮추며, 일반 적의 동작을 잠깐 끊는다(보스는 경직 면역). 맞히면 악절 1개.', target='self', range=3.2, mp=22, cd=8, anim='mu_clash', sfx='mu_cymbal', sfxAt='strike', sfxLead=0.0,
  ops=[mu('a2', coef=1.8, r=3.2, atkdown=0.2, atkdownDur=5, stagger=0.35, phrase=1)], fx=dict(color=0xffb050))
S(J, 2, 0, MA, 3, 'mu_a3', '현악·크레셴도 러시', 'attack', '환영 바이올린을 어깨에 얹고 활을 켤 때마다 초승달 파동이 하나씩 날아간다. 점점 크고 밝아지며, 같은 적을 연달아 맞히면 마지막 굵은 화음이 크게 강해진다(대상이 쓰러지면 남은 파동은 다른 적에게 가지만 연속 기록은 새로 시작).', target='enemy', range=8, mp=22, cd=7, anim='mu_bow', sfx='mu_bow', sfxAt='op', recover=0.62,
  ops=[mu('a3', coef=0.8, n=4, gap=0.18, speed=14, cres=0.35, phrase=1)], fx=dict(color=0xffc8a0))
S(J, 2, 0, MA, 4, 'mu_a4', '관악·레조넌스 버스트', 'attack', '대상 둘레에 금빛 나팔구가 둥글게 나타나 음압을 가운데로 모은다. 부풀어 오른 공명막이 터지며 범위 피해. 공격력 감소 상태(디스코드 브레이크 등)인 적에게는 추가 파동이 한 번 더 울린다(한 번 쓸 때 적마다 한 번).', target='enemy', range=8, mp=24, cd=8, anim='mu_horn', sfx='mu_horn', sfxAt='strike', sfxLead=0.0, recover=0.45,
  ops=[mu('a4', coef=2.4, r=2.2, burst=0.34, react=dict(need='atkdown', coef=1.4, r=1.6), phrase=1)], fx=dict(color=0xffe08a))
S(J, 2, 0, MA, 5, 'mu_a5', '궁극·종악장: 파멸의 코다', 'ultimate', '모은 악절을 거대한 악보에 옮겨 적고 지휘봉을 내린다. 현악 파동 → 타악 충격 → 관악 포격 → 짧은 쉼 → 강한 합주가 차례로 앞쪽을 휩쓴다. 소비한 악절(최대 8)마다 피해 +35%, 악절이 없어도 기본 피해는 들어간다.', target='self', mp=60, cd=60, cast=0.7, anim='mu_coda', sfx='mu_coda', sfxAt='op', recover=1.4,
  ops=[mu('a5', coef=4.0, per=0.35, cap=8, r=6.0, ang=110, fr=4.5, fwd=2.5, w=[0.15, 0.15, 0.20, 0.50], at_=[0.10, 0.42, 0.74, 1.22])], fx=dict(color=0xfff0c0))
S(J, 2, 1, MB, 1, 'mu_b1', '하프·생명의 아리아', 'support', '작은 환영 하프의 현이 차례로 울린다. 움직이는 동안에도 1초마다 나와 주변(6 m) 생명 소환물이 회복한다(기계 제외). 지속 선율은 하나만 — 다른 선율을 켜면 바뀐다.', target='self', mp=20, cd=6, anim='mu_harp', sfx='mu_harp', sfxAt='strike', sfxLead=0.0,
  ops=[mu('b1', survival=True, mel='aria', dur=20, heal=0.012, tick=1.0, near=6)], fx=dict(color=0x9af07a))
S(J, 2, 1, MB, 2, 'mu_b2', '브라스·영웅의 행진', 'support', '등 뒤에 작은 금빛 관악기가 나타나 행진곡을 분다. 공격력과 이동 속도가 오른다(지속 선율).', target='self', mp=20, cd=6, anim='mu_horn', sfx='mu_fanfare', sfxAt='strike', sfxLead=0.0,
  ops=[mu('b2', mel='march', dur=20, atk=0.15, speed=0.12)], fx=dict(color=0xffd050))
S(J, 2, 1, MB, 3, 'mu_b3', '첼로·수호의 코랄', 'support', '낮은 첼로 소리가 몸 둘레에 청백색 오선 띠를 두른다. 받는 피해가 줄고(보호막이 아니라 피해 감소) 상태이상 시간이 짧아진다(지속 선율). 맞은 쪽 현이 잠깐 떨린다.', target='self', mp=20, cd=6, anim='mu_cello', sfx='mu_cello', sfxAt='strike', sfxLead=0.0,
  ops=[mu('b3', survival=True, mel='coral', dur=20, dr=0.15, ccres=0.5)], fx=dict(color=0xbfe6ff))
S(J, 2, 1, MB, 4, 'mu_b4', '플루트·월광 세레나데', 'support', '은빛 플루트의 푸른 선율에 작은 초승달과 음표가 모여든다. 1초마다 기력(MP)을 회복한다(지속 선율, 유지 비용 없음).', target='self', mp=0, cd=6, anim='mu_flute', sfx='mu_flute', sfxAt='strike', sfxLead=0.0,
  ops=[mu('b4', mel='serenade', dur=20, mp=0.02, tick=1.0)], fx=dict(color=0x7ab8ff))
S(J, 2, 1, MB, 5, 'mu_b5', '궁극·앙코르: 불멸의 선율', 'ultimate', '흐려진 오선이 다시 이어지고 커다란 하프 현이 펼쳐진다. 두 팔을 올리는 순간 크게 회복하고 보호막을 두르며, 지금 켜 둔 선율이 12초 동안 60% 강해진다(선율이 없어도 회복·보호막은 그대로).', target='self', mp=60, cd=70, cast=0.5, anim='mu_encore', sfx='mu_encore', sfxAt='op',
  ops=[mu('b5', survival=True, heal=0.35, shBase=80, shCoef=1.8, shDur=10, boost=0.6, boostDur=12)], fx=dict(color=0xf0ffd0))
S(J, 2, 2, MC, 1, 'mu_c1', '카논·에코 리프라이즈', 'support', '등 뒤에 반투명한 내 잔상이 서서 동작을 조금 늦게 따라 한다. 10초 안에 쓰는 다음 공격 선율(스트링 피어스·디스코드 브레이크·크레셴도 러시·레조넌스 버스트) 하나를 절반 위력으로 한 번 더 연주한다(기력·악절 없음, 메아리는 다시 메아리치지 않음).', target='self', mp=14, cd=12, anim='mu_baton', sfx='mu_echo', sfxAt='strike', sfxLead=0.0,
  ops=[mu('c1', dur=10, val=0.5, delay=0.4)], fx=dict(color=0xd8e0ff))
S(J, 2, 2, MC, 2, 'mu_c2', '공명 하프', 'summon', '접힌 금빛 틀을 내려놓으면 펼쳐지며 현이 이어져 작은 하프가 된다. 하프 둘레(5 m) 안에 서 있는 동안 내 음파 공격이 넓어진다 — 투사체는 사거리, 범위 공격은 반경 +35%(여러 개를 곱하지 않음).', target='ground', range=5, mp=22, cd=18, anim='mu_place', sfx='mu_harp', sfxAt='strike', sfxLead=0.0,
  ops=[mu('c2', life=15, amp=0.35, r=5, unfold=0.5)], fx=dict(color=0xffe090))
S(J, 2, 2, MC, 3, 'mu_c3', '실내악·팬텀 트리오', 'summon', '바이올린·첼로·플루트 환영 연주자가 차례로 나타나 작은 삼각 대형으로 선다. 내가 고른 적(없으면 가장 가까운 적)을 차례로 연주해 공격하고, 세 바퀴마다 셋이 함께 합주 타격. 다시 부르면 새 트리오로 바뀐다.', target='ground', range=6, mp=28, cd=20, anim='mu_baton', sfx='mu_trio', sfxAt='strike', sfxLead=0.0,
  ops=[mu('c3', life=15, hp=0.8, coef=0.5, chord=0.9, every=3, gap=0.45, range=8, enter=0.25)], fx=dict(color=0xc8b0ff))
S(J, 2, 2, MC, 4, 'mu_c4', '마에스트로의 청음', 'passive', '악절을 더 잘 모은다. 다른 선율로 바꾸면 작은 조율 파동과 금빛 악센트가 울리고, 다음 공격 선율 한 번이 강해진다(쌓이지 않음, 같은 선율을 다시 켜면 생기지 않음, 6초에 한 번).',
  flags=dict(phraseGain=[0.25, 0.1], switchBonus=[0.2, 0.08]))
S(J, 2, 2, MC, 5, 'mu_c5', '궁극·그랜드 심포니: 별빛 악단', 'ultimate', '등 뒤에 반원으로 별빛 환영 악단이 선다. 지휘에 맞춰 현악 → 관악 → 타악 순서로 앞쪽 적을 공격하고, 마지막에 모두 함께 앞으로 큰 화음 파동을 보낸다. 지금 켜 둔 선율도 10초 동안 50% 강해진다(앙코르와 겹치면 더 강한 쪽만).', target='self', mp=75, cd=75, cast=0.6, anim='mu_symph', sfx='mu_symph', sfxAt='op', recover=1.2,
  ops=[mu('c5', n=10, coef=0.9, r=7, fin=5.0, finR=7, finAng=140, boost=0.5, boostDur=10, at_=[0.10, 0.75, 1.20, 1.85], parts=[4, 3, 3], phrase=1)], fx=dict(color=0xe8d8ff))
# 누른 순간의 준비 연출(op 'pre', at = -동작의 타격 시각): 현 세 줄·심벌즈·바이올린·나팔구 등장(그림만, 피해 없음). 궁극기 3개는 시전 시작에 js/musician.js onCast.
MU_PRE = dict(mu_a1=('strings', 0.22), mu_a2=('cymbals', 0.30), mu_a3=('violin', 0.20), mu_a4=('bells', 0.30), mu_b1=('harp', 0.26), mu_b2=('horn', 0.30),
              mu_b3=('cello', 0.30), mu_b4=('flute', 0.30), mu_c1=('baton', 0.26), mu_c2=('frame', 0.30), mu_c3=('baton', 0.26))
for _d in SK:
    if _d['id'] in MU_PRE: w, t = MU_PRE[_d['id']]; _d['ops'].insert(0, mu('pre', what=w, at=-t))

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
    dict(id='sleep', name='수면', kind='stun', debuff=True, cleanse=True, stack='refresh', boss='immune', color='#c8b8ff'),   # 약사 꿈꽃가루: 피해(직접·지속)를 받으면 깨어남 (js/pharm1.js wakeOnHit, 머리 위 초승달 js/pharm1fx.js moon)
    dict(id='defdown', name='방어력 감소', kind='statMul', stat='def', sign=-1, debuff=True, cleanse=True, stack='max', cap=0.5, boss='normal', color='#c08040'),
    dict(id='atkdown', name='공격력 감소', kind='statMul', stat='atk', sign=-1, debuff=True, cleanse=True, stack='max', cap=0.5, boss='normal', color='#c04040'),
    dict(id='heat', name='가열', kind='mark', debuff=True, cleanse=False, stack='max', cap=3, boss='normal', color='#ff9a3a'),     # 대장장이: 값 = 중첩(1~3), 더할 때마다 시간 갱신 (js/smith.js addHeat)
    dict(id='brand', name='단조 낙인', kind='mark', debuff=True, cleanse=False, boss='normal', color='#ff5a3a'),               # 대장장이 불량품 판정: 직접 공격 3번에 깨짐
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
    dict(id='inspired', name='영감', kind='flag', buff=True, stack='max', color='#50c8c8'),
    dict(id='echo', name='메아리', kind='flag', buff=True, stack='max', color='#60d0a0'),
    dict(id='overclock', name='레드라인', kind='flag', buff=True, stack='refresh', color='#ff9a30'),
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
    item('c_potion_l', '농축 회복제', '불순물을 걸러 낸 고순도 회복제. HP를 크게 회복한다.', 'consumable', 2, sell=10, use=dict(healPercent=0.45, cooldown=1)),
    item('c_regen_hp', '지속 회복 제제', '서방형 캡슐. 15초 동안 조금씩 녹아 HP를 회복한다.', 'consumable', 2, sell=8, use=dict(status='regen', duration=15, value=0.02)),
    item('c_regen_sp', '지속 활력 제제', '서방형 캡슐. 15초 동안 조금씩 녹아 기력을 회복한다.', 'consumable', 2, sell=8, use=dict(status='mpregen', duration=15, value=6)),
    item('f_lunch', '간단한 도시락', 'HP 회복 음식.', 'consumable', 1, sell=3, use=dict(heal=120, cooldown=1)),
    item('f_soup', '따뜻한 수프', '20초 동안 HP를 회복하는 음식.', 'consumable', 1, sell=4, use=dict(status='regen', duration=20, value=0.015)),
    item('f_course_atk', '특제 코스: 불꽃 스테이크', '공격력이 오르는 고급 음식. (음식 효과는 중첩되지 않음)', 'consumable', 2, sell=12, use=dict(status='atkup', duration=60, value=0.15)),
    item('f_course_def', '특제 코스: 든든한 스튜', '방어력이 오르는 고급 음식.', 'consumable', 2, sell=12, use=dict(status='defup', duration=60, value=0.2)),
    item('f_course_heal', '특제 코스: 생명의 샐러드', '회복량이 오르는 고급 음식.', 'consumable', 2, sell=12, use=dict(status='healup', duration=60, value=0.2)),
    item('f_tonic', '보원탕', '구증구포로 달인 탕약. 90초 동안 최대 HP +15%.', 'consumable', 2, sell=10, use=dict(status='well_fed2', duration=90, value=0.15)),
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
def R(id_, skill, inputs, out, n=1, gold=0, group='', minLv=1, kind='make', req=None):
    d = dict(id=id_, skill=skill, inputs=[dict(item=a, count=b) for a, b in inputs], output=dict(item=out, count=n), gold=gold, group=group, minLv=minLv, kind=kind)
    if req: d['req'] = req   # 스킬 없는 직업 제작법(js/skillsys.js recipeBlock): 직업 계보 + 캐릭터 레벨
    return d
RECIPES = [
    # r_potion_s·r_potion_m (회복제 제작 ph1_c1) 삭제 2026-11-19: ph1_c1 이 꿈꽃가루로 바뀜 — 작은·중간 회복제는 상점·드롭·퀘스트 보상으로만 구함
    # r_sp (활력제, ph1_c2) 삭제 2026-11-11: 기력 회복제는 상점 판매·몬스터 드롭으로 구함
    R('r_potion_l', 'wp_c1', [('m_herb', 4), ('m_bottle', 1), ('m_wolf_fang', 1)], 'c_potion_l', 1, group='potion'),
    R('r_regen_hp', 'wp_c2', [('m_herb', 3), ('m_bottle', 1)], 'c_regen_hp', 1, group='potion'),
    R('r_regen_sp', 'wp_c2', [('m_herb', 2), ('m_spore', 2), ('m_bottle', 1)], 'c_regen_sp', 1, group='potion'),
    # 보원탕(2026-11-20): hb_a1 이 '탕약 나누기'(보조)로 바뀌어 제작 스킬이 없음 — 한약사(계보) Lv30 이상이면 제작 메뉴 '한약사 탕제'에서 (예전 습득 조건 그대로)
    R('r_tonic', None, [('m_herb', 4), ('m_meat', 1), ('m_boar_tusk', 1)], 'f_tonic', 1, group='food', req=dict(job='herbalist', level=30, name='한약사 탕제')),
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
    if d['type'] == 'craft' or d.get('craftName'): d['recipes'] = [r['id'] for r in RECIPES if r['skill'] == d['id']] + (['salvage'] if d['id'] == 'bs1_c4' else [])   # craftName: 제작이 아닌 스킬의 습득 효과 제작법(양약사 wp_c1·wp_c2, 2026-11-20)
by_job = {}
for d in SK: by_job.setdefault(d['job'], []).append(d)
assert len(SK) == 188, len(SK)
for j, lst in by_job.items(): assert len(lst) == (8 if j == 'novice' else 15), (j, len(lst))
assert len({d['id'] for d in SK}) == 188
json.dump(dict(version=1, skills=SK, statuses=STATUSES, items=ITEMS, recipes=RECIPES, salvage=SALVAGE, shopAdd=SHOP_ADD), open(OUT, 'w'), ensure_ascii=False, indent=0)
print('wrote', OUT, len(SK), 'skills', {j: len(v) for j, v in by_job.items()})
