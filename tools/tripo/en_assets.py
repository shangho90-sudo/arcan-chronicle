"""엔지니어 2차 스킬 이펙트용 Tripo 병기 덩어리 (2026-11-17 fx2): Tripo text_to_model 초안 -> $RAW/en_<name>.glb (저장소 밖) ->
python3 tools/blender/fx_engineer_tripo.py -> assets/fx/fx_engineer_tripo.glb.json (js/engfx.js가 있으면 절차 부품 대신 씀).
병기는 부품 피벗(관절·회전축)으로 움직이므로 움직이는 부품(포신·날개·다리 관절·덮개)은 빼고 '덩어리'만 받는다:
  hull   아틀라스 워커 몸통(다리·무기 없음 — '상자 덩어리라 밋밋' 지적)      -> tripo_w_hull
  leg    워커 다리 하나(무릎에서 잘라 허벅지·정강이 둘로 나눔)               -> tripo_w_thigh / tripo_w_shin
  sentry 센트리 머리(포신 없음 — 포신은 절차 부품이 조준·반동)              -> tripo_sentry
  drone  트라이윙 드론 몸통(날개 없음 — 날개는 절차 부품이 펼침)            -> tripo_drone
Usage: RAW=/home/claude/engineer3d python3 tools/tripo/en_assets.py [name...]   (needs ~/.tripo/key — never commit it)
Tripo 요청은 하나씩 차례로(동시에 여러 개면 429)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW', '/home/claude/engineer3d'); os.makedirs(RAW, exist_ok=True)
STYLE = ('cute chubby stylized fantasy RPG game asset, magitech steampunk, polished steel plates with brass rivets and copper trim, small glowing blue power crystal, '
         'leather straps, hand-painted textures, soft saturated colours, storybook adventure game style, single object, centered, no base, no ground plate, no text')
PROMPTS = {
    'hull': 'the torso body of a cute chunky bipedal mech walker, rounded barrel-shaped armoured cockpit hull, round glowing blue crystal core window on the front, '
            'two short exhaust smokestacks on the back, shoulder armour plates, no legs, no arms, no weapons, front facing, ' + STYLE,
    'leg': 'an isolated spare part: one single mechanical robot leg only, no body, no head, no torso, thick armoured steel thigh cylinder at the top ending in a flat round hip joint plate, '
           'round brass knee joint with copper pistons in the middle, short sturdy shin, big round flat foot with three toes at the bottom, standing straight vertical, side view, ' + STYLE,
    'sentry': 'the head of a cute compact automatic gun turret, round steel dome housing with brass bands, one big glowing teal lens eye on the front, '
              'small cooling fins on the back, a round empty socket on the front for a gun barrel, no barrel, no legs, no tripod, ' + STYLE,
    'drone': 'a cute round flying scout drone body, plump egg-shaped steel shell with brass bands, one big glowing teal lens eye on the front, small jet nozzle at the back, '
             'small gun under the chin, no propellers, no wings, ' + STYLE,
}

def gen(name):
    sys.path.insert(0, HERE); import tripo
    r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': PROMPTS[name], 'texture': True, 'pbr': True, 'texture_quality': 'detailed'})
    if 'data' not in r: print(name, 'Tripo 요청 실패', json.dumps(r)[:200], flush=True); return
    tid = r['data']['task_id']; d = tripo.wait(tid); d = d.get('data', d); out = d.get('output') or {}
    url = out.get('pbr_model') or out.get('model') or out.get('base_model'); print(name, d.get('status'), url is not None, flush=True)
    if not url: return
    tripo.download(url, os.path.join(RAW, 'en_' + name + '.glb'))
    if out.get('rendered_image'): tripo.download(out['rendered_image'], os.path.join(RAW, 'en_' + name + '_preview.webp'))

if __name__ == '__main__':
    for n in (sys.argv[1:] or list(PROMPTS)):
        if os.path.exists(os.path.join(RAW, 'en_' + n + '.glb')): print(n, 'already'); continue
        gen(n)   # one at a time (parallel requests get 429)
