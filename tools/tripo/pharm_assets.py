"""약사 1차 새 스킬용 3D 소품 (2026-11-11): Tripo text_to_model 초안 -> Blender 정리(tools/monsters/blender_new.py: 조각 제거,
삼각형 줄이기, 바닥 맞춤, 기본색 1024 px 손그림 처리, 무광) -> assets/fx/pharm_<name>.glb.json
  * pestle_gold : 천근쇄약 — 하늘에서 내려와 땅을 찍는 거대한 황금 유봉
  * flask       : 약병폭격 — 떨어지는 약병(게임에서 화염/냉기/독 색으로 물들임)
  * syringe     : 아드레날린 주사 — 손에 잠깐 들었다가 팔에 꽂는 주사기
Usage: python3 tools/tripo/pharm_assets.py tripo [name...]   (needs ~/.tripo/key; raw GLB -> $RAW/pharm_<name>.glb)
       python3 tools/tripo/pharm_assets.py blender [name...]"""
import json, os, shutil, sys, threading
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
RAW = os.environ.get('RAW', '/home/claude/new3d'); os.makedirs(RAW, exist_ok=True)
STYLE = 'cute stylized fantasy RPG game prop, hand-painted textures, warm saturated colours, storybook adventure game style, single object, centered, no base, no ground plate, no text'
PROMPTS = {
    'pestle_gold': 'a giant ornate golden pestle (mortar pestle), thick rounded club head at the bottom, long golden handle with '
                   'engraved bands and a small jade gem ring near the top, shiny polished gold, ' + STYLE,
    'flask': 'a round-bottom alchemy potion flask with a long neck and a cork stopper tied with string, clear glass filled with '
             'bright glowing white liquid, small paper label, ' + STYLE,
    'syringe': 'a big cartoon medical syringe injector, clear glass barrel with glowing orange-red liquid, brass plunger and finger '
               'rings, short silver needle, ' + STYLE,
}
# 2026-11-11 그래픽 개선용(사용자 요청 2장): 황금 약병과 지면 파편. 크레딧이 없어 아직 못 만듦 — 지금 게임은
# tools/blender/fx_pharm.py의 절차 메시(pharm_flask + pharm_liquid, pharm_piece_NN, pharm_shard_N)를 씀.
PROMPTS.update({
    'flask_gold': 'a round fantasy potion bottle, round body, short neck, clear mouth with a cork stopper, thin glass shell with warm amber '
                  'golden liquid inside, tidy highlights, no glow ring, no base, no label text, low detail game asset, ' + STYLE,
    'shards': 'a set of eight separate irregular broken paving stone chunks, grey-beige flagstone top, darker rough stone sides, thick '
              'with small bevels and rough broken edges, laid out apart in a row, no glow, no cracks painted on, ' + STYLE,
})
# pestle_gold 첫 결과가 절구(그릇)까지 붙어 나와서, 절굿공이만 나오도록 다시 쓴 프롬프트 (2026-11-11)
PROMPTS['pestle_only'] = ('one single giant golden pestle club only, a heavy thick rounded bulbous head at the bottom tapering into a long straight '
                          'handle with engraved bands, a small jade ring and a round knob at the top, like a golden mace or baseball bat shape, '
                          'standing upright, shiny polished gold, absolutely no mortar, no bowl, no cup, no container, ' + STYLE)
# 2026-11-11 (남은 스킬 이펙트): pestle_only도 호리병처럼 나와서 유봉을 '방망이' 모양으로 다시 요청, 냉각 약병의 얼음 결정
PROMPTS['pestle_club'] = ('a single giant golden pestle shaped like a thick baseball bat or bowling pin: one smooth solid club, the lower half is a wide heavy '
                          'rounded cylinder head with a flat rounded bottom, it narrows smoothly into a straight cylindrical handle in the upper half, two simple '
                          'engraved rings on the handle, small round pommel on top, plain polished shiny yellow gold metal all over, no bottle, no flask, no neck '
                          'stopper, no window, no gems, no mortar, no bowl, standing upright, ' + STYLE)
PROMPTS['ice_crystals'] = ('a cluster of six sharp pointed ice crystal spikes growing outward from one centre like a frozen burst, different lengths, '
                           'pale blue translucent-looking ice with white edges, faceted, no base rock, no snow pile, ' + STYLE)
TARGET = {'pestle_gold': 6000, 'flask': 2500, 'syringe': 3000, 'flask_gold': 2500, 'shards': 4000, 'pestle_only': 6000, 'pestle_club': 6000, 'ice_crystals': 2500}

def gen(name):
    sys.path.insert(0, HERE); import tripo
    r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': PROMPTS[name], 'texture': True, 'pbr': True, 'texture_quality': 'detailed'})
    print(name, json.dumps(r)[:200], flush=True)
    if 'data' not in r: print(name, 'Tripo 요청 실패(크레딧 부족 등) — Blender 절차 소품(tools/blender/fx_pharm.py)을 그대로 씀', flush=True); return
    tid = r['data']['task_id']; d = tripo.wait(tid); d = d.get('data', d); out = d.get('output') or {}
    url = out.get('pbr_model') or out.get('model') or out.get('base_model'); print(name, d.get('status'), url is not None, flush=True)
    tripo.download(url, os.path.join(RAW, 'pharm_' + name + '.glb'))
    if out.get('rendered_image'): tripo.download(out['rendered_image'], os.path.join(RAW, 'pharm_' + name + '_preview.webp'))

cmd = sys.argv[1] if len(sys.argv) > 1 else 'tripo'; names = sys.argv[2:] or list(PROMPTS)
if cmd == 'tripo':
    th = [threading.Thread(target=gen, args=(n,)) for n in names]
    for t in th: t.start()
    for t in th: t.join()
elif cmd == 'blender':
    sys.path.insert(0, os.path.join(HERE, '..', 'monsters'))
    import blender_new
    blender_new.OUT = os.path.join(ROOT, 'assets', 'fx'); os.makedirs(blender_new.OUT, exist_ok=True)
    for n in names:
        blender_new.TARGET = TARGET[n]
        blender_new.process('pharm_' + n)
        shutil.move(os.path.join(blender_new.OUT, 'w_pharm_' + n + '.glb.json'), os.path.join(blender_new.OUT, 'pharm_' + n + '.glb.json'))
        print('ok', n, flush=True)
