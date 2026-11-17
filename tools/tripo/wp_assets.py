"""양약사 2차 스킬 이펙트용 Tripo 소품 (2026-11-16 '화려하게' 개편): text_to_model 초안 -> $RAW/wp_<name>.glb
정리는 tools/blender/fx_wpharm_tripo.py (용접 -> 줄이기 -> 512 px 기본색 -> 축·크기 맞춤) -> assets/fx/fx_wpharm_tripo.glb.json
  * capsule  : 크고 통통한 두 색 캡슐(빨강/상아, 가운데 금띠) — 작열·분열 캡슐·대형 캡슐 붕괴·최종 처방 (Blender가 가운데에서 두 쪽으로 자름)
  * ampoule  : 금 장식 유리 앰플(청록 약액) — 극저온 결정화·촉매 활성화·생체 회복 분무
  * flask    : 금테 둥근 연금 플라스크(청록 약액, 코르크) — 조제 완성(C1·C2)
Usage: python3 tools/tripo/wp_assets.py [name...]   (needs ~/.tripo/key; 하나씩 차례로 — 동시에 여러 개면 429)
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW', '/home/claude/wpharm3d'); os.makedirs(RAW, exist_ok=True)
STYLE = ('cute chubby stylized fantasy RPG game prop, hand-painted textures, bright clean saturated colours, storybook game style, '
         'single object, centered, no base, no ground plate, no text, no letters')
PROMPTS = {
    'capsule': 'one big glossy medicine capsule pill lying horizontally, rounded chubby ends, left half bright cherry red, right half creamy ivory white, '
               'a thin shiny gold ring band exactly at the middle seam, smooth polished surface with soft highlights, ' + STYLE,
    'ampoule': 'an elegant small glass medicine ampoule vial standing upright, slim round body, narrow neck and a pointed sealed tip, clear glass filled '
               'with glowing turquoise teal liquid, delicate gold filigree band around the neck and a gold base ring, ' + STYLE,
    'flask': 'a round bottom alchemy flask with a short neck and a cork stopper, clear glass filled with bright turquoise teal potion, ornate thin gold '
             'cage wire wrapping the round body, small gold collar under the cork, ' + STYLE,
}

def gen(name):
    sys.path.insert(0, HERE); import tripo
    dst = os.path.join(RAW, 'wp_' + name + '.glb')
    if os.path.exists(dst): print(name, 'already', dst, flush=True); return
    r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': PROMPTS[name], 'texture': True, 'pbr': True, 'texture_quality': 'detailed'})
    print(name, json.dumps(r)[:200], flush=True)
    if 'data' not in r: print(name, 'Tripo 요청 실패 — 절차 메시(tools/blender/fx_wpharm.py)를 그대로 씀', flush=True); return
    d = tripo.wait(r['data']['task_id']); d = d.get('data', d); out = d.get('output') or {}
    url = out.get('pbr_model') or out.get('model') or out.get('base_model'); print(name, d.get('status'), url is not None, flush=True)
    if not url: return
    tripo.download(url, dst)
    if out.get('rendered_image'): tripo.download(out['rendered_image'], os.path.join(RAW, 'wp_' + name + '_preview.webp'))

if __name__ == '__main__':
    for n in sys.argv[1:] or list(PROMPTS): gen(n)
