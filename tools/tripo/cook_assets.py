"""요리사 1차 스킬 이펙트용 소품 (2026-11-13): Tripo text_to_model 초안 -> $RAW/cook_<name>.glb (저장소 밖) ->
python3 tools/blender/fx_cook_tripo.py -> assets/fx/fx_cook_tripo.glb.json (js/cookfx.js가 있으면 절차 메시 대신 씀).
  lunchbox 간단한 도시락 · soup 따뜻한 수프 · meal 든든한 한 끼 · snack 간식 시간 · pepper 후추 뿌리기 · flour 밀가루 구름 · kebab 꼬치 찌르기
Usage: RAW=/home/claude/cook3d python3 tools/tripo/cook_assets.py [name...]   (needs ~/.tripo/key — never commit it)"""
import json, os, sys, threading
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW', '/home/claude/cook3d'); os.makedirs(RAW, exist_ok=True)
STYLE = 'cute stylized fantasy RPG game prop, hand-painted textures, warm saturated colours, storybook adventure game style, single object, centered, no base, no ground plate, no text'
PROMPTS = {
    'lunchbox': 'an open wooden bento lunch box seen from above at an angle, compartments with white rice with a red pickled plum, a fried egg roll, green vegetables and small sausages, ' + STYLE,
    'soup': 'a round ceramic soup bowl full of warm orange-yellow vegetable soup with carrot and green herb pieces, a wooden spoon resting in it, ' + STYLE,
    'meal': 'a big round dinner plate with a large roasted chicken leg, mashed potato, green peas and a slice of bread, hearty feast meal, ' + STYLE,
    'snack': 'a big round chocolate chip cookie with one bite taken out of it, golden brown, ' + STYLE,
    'pepper': 'a wooden pepper mill grinder shaker, turned dark wood body with a round knob on top and a metal band, ' + STYLE,
    'flour': 'a plump burlap flour sack tied at the top with a rope, beige cloth with a simple wheat ear emblem, some white flour dust on it, ' + STYLE,
    'kebab': 'one long straight metal skewer kebab with chunks of grilled meat, red and green bell pepper and onion threaded along the middle, pointed tip and a ring handle, lying horizontal, ' + STYLE,
}

def gen(name):
    sys.path.insert(0, HERE); import tripo
    r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': PROMPTS[name], 'texture': True, 'pbr': True, 'texture_quality': 'detailed'})
    if 'data' not in r: print(name, 'Tripo 요청 실패', json.dumps(r)[:200], flush=True); return
    tid = r['data']['task_id']; d = tripo.wait(tid); d = d.get('data', d); out = d.get('output') or {}
    url = out.get('pbr_model') or out.get('model') or out.get('base_model'); print(name, d.get('status'), url is not None, flush=True)
    if not url: return
    tripo.download(url, os.path.join(RAW, 'cook_' + name + '.glb'))
    if out.get('rendered_image'): tripo.download(out['rendered_image'], os.path.join(RAW, 'cook_' + name + '_preview.webp'))

if __name__ == '__main__':
    names = sys.argv[1:] or list(PROMPTS)
    th = [threading.Thread(target=gen, args=(n,)) for n in names]
    for t in th: t.start()
    for t in th: t.join()
