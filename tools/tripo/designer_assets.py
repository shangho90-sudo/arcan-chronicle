"""디자이너 2차 스킬 이펙트용 Tripo 소품 (2026-11-17 fx2 '화려하게'): text_to_model 초안 -> $RAW/ds_<name>.glb (저장소 밖)
정리는 tools/blender/fx_designer_tripo.py (용접 -> 조각 제거 -> 줄이기 -> 512 px 기본색 -> 축·크기 맞춤) -> assets/fx/fx_designer_tripo.glb.json
(js/designerfx.js가 있으면 절차 메시 대신 씀, 없으면 절차 메시)
  * mannequin : 금 장식 재봉 마네킹(드레스 폼) — 미러 피팅 마네킹·의상 제작 완성(절차 모델이 '투박하다'는 지적)
  * brooch    : 큰 보석 브로치 핀(분홍 보석 + 금 꽃잎 테) — 시침 표식(멀리서 안 보인다는 지적)·뮤즈의 초대·테일러드 퍼펙션
  * spool     : 금실이 감긴 마법 실패(실타래) — 오트쿠튀르 스티치·미라클 리스티치·자수 제작
Usage: RAW=/home/claude/designer3d python3 tools/tripo/designer_assets.py [name...]   (needs ~/.tripo/key — 커밋 금지; 하나씩 차례로 — 동시에 여러 개면 429)
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW', '/home/claude/designer3d'); os.makedirs(RAW, exist_ok=True)
STYLE = ('cute chubby stylized fantasy RPG game prop, hand-painted textures, bright pastel colours with gold trim, storybook game style, '
         'single object, centered, no base plate, no ground, no text, no letters')
PROMPTS = {
    'mannequin': 'an elegant tailor dress form mannequin, rounded pastel pink fabric torso with a narrow waist and no head, a small gold knob on top, '
                 'a gold measuring tape draped around the waist, standing on a single slim gold pole with a small round three-leg gold stand, ' + STYLE,
    'brooch': 'a large jeweled brooch pin, one big faceted pink heart-shaped gemstone in the centre set in an ornate gold flower-petal frame with tiny '
              'pearls around the edge, flat front facing the viewer, ' + STYLE,
    'spool': 'a magic wooden sewing thread spool with ornate gold end caps, thick shiny golden thread wound around the middle, a small loose thread end, '
             'standing upright, ' + STYLE,
}

def gen(name):
    sys.path.insert(0, HERE); import tripo
    dst = os.path.join(RAW, 'ds_' + name + '.glb')
    if os.path.exists(dst): print(name, 'already', dst, flush=True); return
    r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': PROMPTS[name], 'texture': True, 'pbr': True, 'texture_quality': 'detailed'})
    if 'data' not in r: print(name, 'Tripo 요청 실패 — 절차 메시를 그대로 씀', json.dumps(r)[:200], flush=True); return
    d = tripo.wait(r['data']['task_id']); d = d.get('data', d); out = d.get('output') or {}
    url = out.get('pbr_model') or out.get('model') or out.get('base_model'); print(name, d.get('status'), url is not None, flush=True)
    if not url: return
    tripo.download(url, dst)
    if out.get('rendered_image'): tripo.download(out['rendered_image'], os.path.join(RAW, 'ds_' + name + '_preview.webp'))

if __name__ == '__main__':
    for n in sys.argv[1:] or list(PROMPTS): gen(n)   # one at a time (parallel requests get 429)
