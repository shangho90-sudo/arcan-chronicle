"""미용사 1차 스킬 이펙트용 3D 소품 (2026-11-13): Tripo text_to_model 초안 -> Blender 정리(tools/blender/fx_hair_tripo.py) ->
assets/fx/fx_hair_tripo.glb.json (기본색 텍스처 포함). 게임은 js/hairfx.js가 있으면 쓰고, 없으면 tools/blender/fx_hair.py의 절차 메시를 씀.
  * dryer  : 드라이 돌풍·온풍·냉풍 — 허공에 뜨는 큰 헤어드라이어
  * comb   : 빗 투척 — 빙글빙글 도는 큰 빗
  * roller : 헤어롤 덫 — 바닥의 헤어롤
Usage: python3 tools/tripo/hair_assets.py tripo [name...]   (needs ~/.tripo/key; raw GLB -> $RAW/hair_<name>.glb, 저장소 밖)
       python3 tools/tripo/hair_assets.py blender [name...]"""
import json, os, sys, threading
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
RAW = os.environ.get('RAW', '/home/claude/hair3d'); os.makedirs(RAW, exist_ok=True)
STYLE = 'cute stylized fantasy RPG game prop, hand-painted textures, warm saturated colours, storybook adventure game style, single object, centered, no base, no ground plate, no text'
PROMPTS = {
    'dryer': 'a chunky cartoon hair dryer (blow dryer), rounded pink body with a wide silver nozzle at the front, a round grille at the back, '
             'a short straight handle underneath with one button, glossy pink and violet plastic with silver trim, no cord, no cable, ' + STYLE,
    'comb': 'a single large flat hair comb, long straight spine with a row of many even straight teeth along one side, rounded ends, '
            'glossy pink plastic with a thin gold line on the spine, seen flat, ' + STYLE,
    'roller': 'a single hair roller curler, a short fat cylinder tube with small soft bristles all around and open ends, bright pink with '
              'a violet clip clamp on top, ' + STYLE,
}
TARGET = {'dryer': 3500, 'comb': 2500, 'roller': 2500}

def gen(name):
    sys.path.insert(0, HERE); import tripo
    r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': PROMPTS[name], 'texture': True, 'pbr': True, 'texture_quality': 'detailed'})
    print(name, json.dumps(r)[:200], flush=True)
    if 'data' not in r: print(name, 'Tripo 요청 실패(크레딧 부족 등) — Blender 절차 소품(tools/blender/fx_hair.py)을 그대로 씀', flush=True); return
    tid = r['data']['task_id']; d = tripo.wait(tid); d = d.get('data', d); out = d.get('output') or {}
    url = out.get('pbr_model') or out.get('model') or out.get('base_model'); print(name, d.get('status'), url is not None, flush=True)
    tripo.download(url, os.path.join(RAW, 'hair_' + name + '.glb'))
    if out.get('rendered_image'): tripo.download(out['rendered_image'], os.path.join(RAW, 'hair_' + name + '_preview.webp'))

cmd = sys.argv[1] if len(sys.argv) > 1 else 'tripo'; names = sys.argv[2:] or list(PROMPTS)
if cmd == 'tripo':
    th = [threading.Thread(target=gen, args=(n,)) for n in names]
    for t in th: t.start()
    for t in th: t.join()
elif cmd == 'blender':
    os.system('RAW=%s python3 %s %s' % (RAW, os.path.join(ROOT, 'tools', 'blender', 'fx_hair_tripo.py'), ' '.join(names)))
