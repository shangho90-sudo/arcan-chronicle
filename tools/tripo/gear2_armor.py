"""직업별 방어구 88개(ag_*, 2026-11-17)의 '대표 장식' — 계열 정령 모티프 브로치 9개만 Tripo로(나머지는 tools/blender/gear2_armor.py가 절차로 조립).
방어구 담당 Tripo 상한 200 크레딧. 요청은 하나씩(동시에 여러 개 = 429). 텍스트 프롬프트만(참고 그림을 넣지 말 것 — /home/claude/queue/gear2.md 저작권 원칙).
결과 $RAW/emb_<계열>.glb (+ _preview.webp), 이어 하기: $RAW/emb_tasks.json. 정리는 tools/blender/gear2_armor.py가 함(용접 → 줄이기 → 정점 색).
Usage: python3 tools/tripo/gear2_armor.py [계열 ...]   |   --list   (키 ~/.tripo/key — 저장소에 넣지 말 것; RAW 기본 /home/claude/gear2_3d)"""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW', '/home/claude/gear2_3d'); os.makedirs(RAW, exist_ok=True)
STYLE = ('a single small chunky figurine brooch ornament, compact rounded silhouette, stylized cute fantasy RPG game item, '
         'hand-painted look, strong colour contrast, centered, front view, no base, no stand, no pin, no chain, no background, no text')
# 모티프는 모두 이 세계(designs.py LINES의 motif) — 다른 작품의 캐릭터·특정 생물 모양을 따르지 말 것
PROMPTS = {
    'pharm': 'the head of a gentle forest spirit deer with small branching antlers carrying tiny white bell flowers, pale green and ivory with gold accents, a dewdrop gem on the forehead, ',
    'smith': 'a curled-up ember salamander lizard spirit, black iron scaly body with glowing orange lava cracks, a red crest along its back, a flame-tipped tail curling around, ',
    'cook': 'a leaping silver-scaled river carp fish spirit with flowing teal fins and coral-orange accents, a round water-drop gem eye, ',
    'hair': 'a swallow bird spirit with spread wings and a long forked tail, white feathers with rose-pink and silver accents, ',
    'art': 'a butterfly spirit with large rounded wings patterned like a painter palette with purple, gold and cyan paint spots, ',
    'chef': 'a curled sitting fox spirit with a big fluffy flame-shaped tail, crimson red and white fur with gold accents, ',
    'design': 'a moth spirit with broad soft wings marked with crescent moons, deep indigo-violet and silver with rose-gold edges, feathery antennae, ',
    'paint': 'a coiled eastern ink dragon spirit, black ink body with gold scales trim, a glowing golden eye and red whiskers, ',
    'music': 'a small nightingale songbird spirit perched on a silver crescent moon, navy blue and lavender feathers, a tiny star on its chest, ',
}
TASKS = os.path.join(RAW, 'emb_tasks.json')
def tasks(): return json.load(open(TASKS)) if os.path.exists(TASKS) else {}

def gen(name):
    sys.path.insert(0, HERE); import tripo
    dst = os.path.join(RAW, 'emb_' + name + '.glb')
    if os.path.exists(dst) and os.path.getsize(dst) > 10000: print(name, 'have', flush=True); return
    tid = tasks().get(name)
    if not tid:
        for k in range(20):
            r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': PROMPTS[name] + STYLE, 'texture': True, 'pbr': False, 'texture_quality': 'standard'})
            if r.get('http_error') != 429: break
            time.sleep(30)
        if 'data' not in r: print(name, 'Tripo 요청 실패:', json.dumps(r, ensure_ascii=False)[:300], flush=True); return
        tid = r['data']['task_id']; t = tasks(); t[name] = tid; json.dump(t, open(TASKS, 'w'), indent=1)
    d = tripo.wait(tid); d = d.get('data', d); out = d.get('output') or {}
    url = out.get('pbr_model') or out.get('model') or out.get('base_model')
    print(name, d.get('status'), url is not None, flush=True)
    if not url:
        t = tasks(); t.pop(name, None); json.dump(t, open(TASKS, 'w'), indent=1); return
    for k in range(5):
        try: tripo.download(url, dst); break
        except Exception as e: print(name, 'download retry', k, e, flush=True); time.sleep(4)
    if out.get('rendered_image'):
        try: tripo.download(out['rendered_image'], os.path.join(RAW, 'emb_' + name + '_preview.webp'))
        except Exception as e: print(name, 'preview', e, flush=True)

if __name__ == '__main__':
    if '--list' in sys.argv:
        for k, v in PROMPTS.items(): print(k, '|', v)
        sys.exit(0)
    for n in [a for a in sys.argv[1:] if a in PROMPTS] or list(PROMPTS): gen(n)
