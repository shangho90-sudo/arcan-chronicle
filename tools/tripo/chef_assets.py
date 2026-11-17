"""쉐프 2차 스킬 이펙트용 Tripo 소품 (2026-11-17 '화려하게' 개편): text_to_model 초안 -> $RAW/cf_<name>.glb
정리는 tools/blender/fx_chef_tripo.py (용접 -> 줄이기 -> 512 px 기본색 -> 축·크기 맞춤) -> assets/fx/fx_chef_tripo.glb.json
  * cloche : 금빛 클로슈(돔 뚜껑) — 마스터 셰프 쇼타임 마무리·로열 그랑 디너 쟁반 (절차 chef_cloche 와 같은 규격: 바닥 y 0, 반지름 1)
  * cooker : 통통한 구리 압력솥(뚜껑 포함 한 덩어리, 압력계) — 시그니처 압력솥 몸통 (바닥 y 0, 높이 0.62+뚜껑)
  * wok    : 손잡이 달린 무쇠 웍 — 인페르노 웍·쇼타임 거대 웍 (바닥 y 0, 테두리 반지름 1, 손잡이 +x)
Usage: python3 tools/tripo/chef_assets.py [name...]   (needs ~/.tripo/key; 하나씩 차례로 — 동시에 여러 개면 429)
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW', '/home/claude/chef3d'); os.makedirs(RAW, exist_ok=True)
STYLE = ('cute chubby stylized fantasy RPG game prop, hand-painted textures, bright clean saturated colours, storybook game style, '
         'single object, centered, no base, no ground plate, no text, no letters, no food')
PROMPTS = {
    'cloche': 'a shiny golden restaurant serving cloche dome lid, smooth round dome, ornate small round knob handle on top, thin decorative engraved band '
              'near the bottom rim, polished gold with warm highlights, seen alone without a plate, ' + STYLE,
    'cooker': 'a chubby round copper pressure cooker pot with its lid locked on, short and wide, two black side handles, a round white pressure gauge '
              'dial with a red needle on the front, a small red steam valve on top of the lid, polished copper and silver, ' + STYLE,
    'wok': 'a chef cooking wok pan, wide round bowl shape with a dark cast iron inside and a shiny copper rim, one long wooden handle sticking out '
           'to the side, slightly glowing hot, ' + STYLE,
}

def gen(name):
    sys.path.insert(0, HERE); import tripo
    dst = os.path.join(RAW, 'cf_' + name + '.glb')
    if os.path.exists(dst): print(name, 'already', dst, flush=True); return
    r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': PROMPTS[name], 'texture': True, 'pbr': True, 'texture_quality': 'detailed'})
    print(name, json.dumps(r)[:200], flush=True)
    if 'data' not in r: print(name, 'Tripo 요청 실패 — 절차 메시(tools/blender/fx_chef.py)를 그대로 씀', flush=True); return
    d = tripo.wait(r['data']['task_id']); d = d.get('data', d); out = d.get('output') or {}
    url = out.get('pbr_model') or out.get('model') or out.get('base_model'); print(name, d.get('status'), url is not None, flush=True)
    if not url: return
    tripo.download(url, dst)
    if out.get('rendered_image'): tripo.download(out['rendered_image'], os.path.join(RAW, 'cf_' + name + '_preview.webp'))

if __name__ == '__main__':
    for n in sys.argv[1:] or list(PROMPTS): gen(n)
