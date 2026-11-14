"""예술가 1차 스킬 소품 (2026-11-13): Tripo text_to_model 초안 -> tools/blender/fx_art_tripo.py 정리 -> assets/fx/fx_art_tripo.glb.json
  * canvas  : 작은 걸작 — 그림 생명체가 튀어나오는 금테 액자 캔버스
  * bulb    : 영감 충전 — 머리 위에 켜지는 전구
  * palette : 즉흥 창작 — 주위를 도는 팔레트
Usage: python3 tools/tripo/art_assets.py [name...]   (needs ~/.tripo/key; raw GLB -> $RAW/art_<name>.glb, RAW 기본 /home/claude/art3d — 저장소 밖)
없거나 품질이 나쁘면 게임은 tools/blender/fx_art.py의 절차 메시(art_frame / art_bulb / art_palette)를 그대로 씀."""
import json, os, sys, threading
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW', '/home/claude/art3d'); os.makedirs(RAW, exist_ok=True)
STYLE = 'cute stylized fantasy RPG game prop, hand-painted textures, warm saturated colours, storybook adventure game style, single object, centered, no base, no ground plate, no text'
PROMPTS = {
    'canvas': 'a small rectangular oil painting in a thick ornate golden picture frame, the painting shows a simple cheerful colourful abstract blob creature '
              'with big eyes on a pale cream background, upright, front facing, flat back, no easel, no stand, ' + STYLE,
    'bulb': 'a big cartoon light bulb, round clear glass bulb glowing warm yellow with a simple filament inside, short brass screw base at the bottom, '
            'chunky simple shape, ' + STYLE,
    'palette': 'a wooden painter palette, kidney shaped flat board with a thumb hole, six round blobs of thick bright paint (red, orange, yellow, green, blue, violet) '
               'along the edge, lying flat, ' + STYLE,
}
def gen(name):
    sys.path.insert(0, HERE); import tripo
    r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': PROMPTS[name], 'texture': True, 'pbr': True, 'texture_quality': 'detailed'})
    print(name, json.dumps(r)[:200], flush=True)
    if 'data' not in r: print(name, 'Tripo 요청 실패(크레딧 부족 등) — Blender 절차 소품을 그대로 씀', flush=True); return
    d = tripo.wait(r['data']['task_id']); d = d.get('data', d); out = d.get('output') or {}
    url = out.get('pbr_model') or out.get('model') or out.get('base_model'); print(name, d.get('status'), url is not None, flush=True)
    if url: tripo.download(url, os.path.join(RAW, 'art_' + name + '.glb'))
    if out.get('rendered_image'): tripo.download(out['rendered_image'], os.path.join(RAW, 'art_' + name + '_preview.webp'))
if __name__ == '__main__':
    names = sys.argv[1:] or list(PROMPTS); th = [threading.Thread(target=gen, args=(n,)) for n in names]
    for t in th: t.start()
    for t in th: t.join()
