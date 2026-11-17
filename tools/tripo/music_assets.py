"""음악가 2차 스킬 이펙트용 Tripo 소품 (2026-11-17 fx2 '화려하게'): text_to_model 초안 -> $RAW/mu_<name>.glb (저장소 밖)
정리는 tools/blender/fx_music_tripo.py (용접 -> 조각 제거 -> 줄이기 -> 512 px 기본색 -> 축·크기 맞춤) -> assets/fx/fx_music_tripo.glb.json
(js/musicfx.js가 있으면 절차 메시 대신 씀, 없으면 절차 메시)
  * violin : 금 장식 판타지 바이올린(통통하고 큼) — 현악 스킬 손 악기·팬텀 트리오·심포니 현악(절차 바이올린이 '팔에 붙은 밝은 덩어리'라는 지적)
  * cello  : 금 장식 첼로 — 수호의 코랄·팬텀 트리오
  * harp   : 금빛 하프 — 공명 하프·생명의 아리아
  * player : 환영 연주자(연미복 차림의 반투명 정령 음악가, 악기 없음) — 팬텀 트리오·그랜드 심포니(절차 상체 실루엣이 '단순하다'는 지적)
Usage: RAW=/home/claude/music3d python3 tools/tripo/music_assets.py [name...]   (needs ~/.tripo/key — 커밋 금지; 하나씩 차례로 — 동시에 여러 개면 429)
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW', '/home/claude/music3d'); os.makedirs(RAW, exist_ok=True)
STYLE = ('cute chubby stylized fantasy RPG game prop, hand-painted textures, bright warm colours with gold trim, storybook game style, '
         'single object, centered, no base plate, no ground, no text, no letters')
PROMPTS = {
    'violin': 'an ornate fantasy violin, glossy warm amber-orange wood body with slightly chunky rounded curves, golden f-holes, golden tailpiece and golden scroll, '
              'four bright gold strings, black fingerboard, lying flat with the front facing up, no bow, ' + STYLE,
    'cello': 'an ornate fantasy cello standing upright on its end pin, glossy rich red-brown wood, golden scroll and golden tailpiece, gold trim along the edges, '
             'four gold strings, no bow, ' + STYLE,
    'harp': 'an elegant golden concert harp standing upright, curved golden neck with small star ornaments, ivory soundboard with painted blue flowers, '
            'many thin glowing strings, ' + STYLE,
    'player': 'a cute chubby ghostly phantom musician spirit, translucent pale lavender body like a friendly ghost with a round head and big closed smiling eyes, '
              'wearing a small navy tailcoat with gold buttons and a red bow tie, arms held forward as if playing an instrument, empty hands, '
              'floating with a wispy tail instead of legs, no instrument, standing upright facing forward, ' + STYLE,
}

def gen(name):
    sys.path.insert(0, HERE); import tripo
    dst = os.path.join(RAW, 'mu_' + name + '.glb')
    if os.path.exists(dst): print(name, 'already', dst, flush=True); return
    r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': PROMPTS[name], 'texture': True, 'pbr': True, 'texture_quality': 'detailed'})
    if 'data' not in r: print(name, 'Tripo 요청 실패 — 절차 메시를 그대로 씀', json.dumps(r)[:200], flush=True); return
    d = tripo.wait(r['data']['task_id']); d = d.get('data', d); out = d.get('output') or {}
    url = out.get('pbr_model') or out.get('model') or out.get('base_model'); print(name, d.get('status'), url is not None, flush=True)
    if not url: return
    tripo.download(url, dst)
    if out.get('rendered_image'): tripo.download(out['rendered_image'], os.path.join(RAW, 'mu_' + name + '_preview.webp'))

if __name__ == '__main__':
    for n in sys.argv[1:] or list(PROMPTS): gen(n)   # one at a time (parallel requests get 429)
