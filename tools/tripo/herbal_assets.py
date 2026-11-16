"""한약사 2차 스킬 이펙트용 Tripo 소품·소환물 (2026-11-16 fx2): Tripo text_to_model 초안 -> $RAW/herbal_<name>.glb (저장소 밖) ->
python3 tools/blender/fx_herbal_tripo.py -> assets/fx/fx_herbal_tripo.glb.json (js/herbalfx.js가 있으면 절차 메시 대신 씀).
  ginseng 천년삼 동자(절차 모델이 '눈사람처럼 보인다'는 지적) · dragon 청룡 머리 · pot 약탕관 · phoenix 주작 몸통
Usage: RAW=/home/claude/herbal3d python3 tools/tripo/herbal_assets.py [name...]   (needs ~/.tripo/key — never commit it)
Tripo 요청은 하나씩 차례로(동시에 여러 개면 429)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW', '/home/claude/herbal3d'); os.makedirs(RAW, exist_ok=True)
STYLE = 'cute chubby stylized fantasy RPG game asset, hand-painted textures, soft saturated colours, storybook adventure game style, single object, centered, no base, no ground plate, no text'
PROMPTS = {
    'ginseng': 'a cute little ginseng root spirit child, the body is a plump cream-beige ginseng root shaped like a small chibi person with root arms and two short root legs, '
               'fine root hairs, a tuft of bright green five-fingered ginseng leaves with a cluster of shiny red berries growing from the top of its head, tiny happy face with dot eyes and rosy cheeks, '
               'standing upright, full body, front facing, ' + STYLE,
    'dragon': 'the head and short neck of a friendly oriental azure blue-green dragon, long flowing whiskers, small golden antler horns, open mouth with a gentle grin, jade scales, '
              'leaf-like mane, emerging upward, ' + STYLE,
    'pot': 'a traditional korean clay herbal medicine brewing pot, round dark brown earthenware body with a short spout and a side handle, rope tied around the neck, no lid, '
           'herbs and steam not included, ' + STYLE,
    'phoenix': 'a small vermilion fire bird phoenix in flight, orange-red feathers with golden tips, long flowing tail feathers, wings swept back, compact chubby body, '
               'side view gliding pose, ' + STYLE,
}

def gen(name):
    sys.path.insert(0, HERE); import tripo
    r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': PROMPTS[name], 'texture': True, 'pbr': True, 'texture_quality': 'detailed'})
    if 'data' not in r: print(name, 'Tripo 요청 실패', json.dumps(r)[:200], flush=True); return
    tid = r['data']['task_id']; d = tripo.wait(tid); d = d.get('data', d); out = d.get('output') or {}
    url = out.get('pbr_model') or out.get('model') or out.get('base_model'); print(name, d.get('status'), url is not None, flush=True)
    if not url: return
    tripo.download(url, os.path.join(RAW, 'herbal_' + name + '.glb'))
    if out.get('rendered_image'): tripo.download(out['rendered_image'], os.path.join(RAW, 'herbal_' + name + '_preview.webp'))

if __name__ == '__main__':
    for n in (sys.argv[1:] or list(PROMPTS)):
        if os.path.exists(os.path.join(RAW, 'herbal_' + n + '.glb')): print(n, 'already'); continue
        gen(n)   # one at a time (parallel requests get 429)
