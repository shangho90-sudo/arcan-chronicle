"""화가 2차 스킬 이펙트용 Tripo 소환물 (2026-11-17 fx2 '더 화려하게'): Tripo text_to_model 초안 -> $RAW/pt_<name>.glb (저장소 밖) ->
python3 tools/blender/fx_painter_tripo.py -> assets/fx/fx_painter_tripo.glb.json (js/painterfx.js 가 있으면 절차 메시 대신 씀).
  wolf   묵수·흑랑(절차 늑대가 '덩어리' 같다는 지적) — 먹물 늑대, 달리는 자세 한 덩어리(다리 움직임은 게임이 몸 기울기·튀기로 대신)
  crane  비화·채색군학(절차 학이 작고 밋밋함) — 색종이 학, 날개 편 자세
  knight 유화·팔레트 기사(절차 기사가 단순함) — 방패만 든 통통한 기사(검은 게임이 절차 검을 손에 붙여 휘두름)
  dragon 화룡점정 용 머리(몸통은 js 가 매 프레임 관 메시로 그림)
Usage: RAW=/home/claude/painter3d python3 tools/tripo/painter_assets.py [name...]   (needs ~/.tripo/key — never commit it)
Tripo 요청은 하나씩 차례로(동시에 여러 개면 429)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW', '/home/claude/painter3d'); os.makedirs(RAW, exist_ok=True)
STYLE = ('cute chubby stylized fantasy RPG game asset, hand-painted textures, bright clean saturated colours, storybook adventure game style, '
         'single object, centered, no base, no ground plate, no text, no letters')
PROMPTS = {
    'wolf': 'a magical wolf made of black sumi ink painting, glossy deep black and indigo blue fur with flowing brush-stroke tufts, white ink highlights, '
            'fierce but cute chunky wolf with big paws and a big fluffy tail, glowing gold eyes, running leap pose with all four legs, side view, full body, ' + STYLE,
    'crane': 'an origami paper crane made of colourful painted paper, pink white and sky blue folded paper with watercolour gradient, wings spread wide open, '
             'long elegant neck and pointed tail, gold leaf edges, ' + STYLE,
    'knight': 'a chubby little knight that looks painted with thick oil paint, royal blue armour with gold trim, red cape with visible brush strokes, '
              'round helmet with a red plume, holding a round painted shield on the left arm, right hand empty and closed, no sword, no weapon in right hand, '
              'standing heroic pose, front facing, full body, ' + STYLE,
    'dragon': 'the head of an oriental dragon painted in black sumi ink, long flowing whiskers, two golden antler horns, flowing ink mane like brush strokes, '
              'open mouth with small fangs, glowing gold eyes, head and short neck only, side profile facing forward, ' + STYLE,
}

def gen(name):
    sys.path.insert(0, HERE); import tripo
    r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': PROMPTS[name], 'texture': True, 'pbr': True, 'texture_quality': 'detailed'})
    if 'data' not in r: print(name, 'Tripo 요청 실패 — 절차 메시를 그대로 씀', json.dumps(r)[:200], flush=True); return
    tid = r['data']['task_id']; print(name, 'task', tid, flush=True); d = tripo.wait(tid); d = d.get('data', d); out = d.get('output') or {}
    url = out.get('pbr_model') or out.get('model') or out.get('base_model'); print(name, d.get('status'), url is not None, flush=True)
    if not url: return
    tripo.download(url, os.path.join(RAW, 'pt_' + name + '.glb'))
    if out.get('rendered_image'): tripo.download(out['rendered_image'], os.path.join(RAW, 'pt_' + name + '_preview.webp'))

if __name__ == '__main__':
    for n in (sys.argv[1:] or list(PROMPTS)):
        if os.path.exists(os.path.join(RAW, 'pt_' + n + '.glb')): print(n, 'already'); continue
        gen(n)   # one at a time (parallel requests get 429)
