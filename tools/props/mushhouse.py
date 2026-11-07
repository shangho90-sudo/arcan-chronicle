"""Mushroom house landmark behind the 독버섯 군락지 warp (속삭이는 숲): Tripo text_to_model draft -> Blender clean-up
(tools/monsters/blender_new.py: drop fragments, decimate, ground + centre, base colour 1024 px painterly pass, matte)
-> assets/props/mushhouse.glb.json. Placed by zones.json forest prop {"type": "landmark", "model": "mushhouse"}.
Usage: python3 tools/props/mushhouse.py tripo   (needs ~/.tripo/key; raw GLB -> $RAW/mushhouse.glb)
       python3 tools/props/mushhouse.py blender"""
import json, os, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
RAW = os.environ.get('RAW', '/home/claude/new3d'); os.makedirs(RAW, exist_ok=True)
PROMPT = ('giant toadstool mushroom house, a cozy fairy cottage built inside a huge mushroom, big round red-violet cap with '
          'white spots, cream stalk with a round wooden door, two small round windows with warm light, little stone steps, '
          'tiny mushrooms and moss around the base, cute chibi stylized fantasy RPG building, hand-painted textures, '
          'warm saturated colours, cozy storybook adventure game style, single building, no ground plate, no text')
cmd = sys.argv[1] if len(sys.argv) > 1 else 'tripo'
if cmd == 'tripo':
    sys.path.insert(0, os.path.join(HERE, '..', 'tripo')); import tripo
    r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': PROMPT, 'texture': True, 'pbr': True, 'texture_quality': 'detailed'})
    print(json.dumps(r)[:200], flush=True); tid = r['data']['task_id']
    d = tripo.wait(tid)
    d = d.get('data', d); out = d.get('output') or {}
    url = out.get('pbr_model') or out.get('model') or out.get('base_model'); print(d.get('status'), url is not None, flush=True)
    tripo.download(url, os.path.join(RAW, 'mushhouse.glb'))
    if out.get('rendered_image'): tripo.download(out['rendered_image'], os.path.join(RAW, 'mushhouse_preview.webp'))
elif cmd == 'blender':
    sys.path.insert(0, os.path.join(HERE, '..', 'monsters')); os.environ.setdefault('TARGET', '14000')
    import blender_new
    blender_new.OUT = os.path.join(ROOT, 'assets', 'props'); os.makedirs(blender_new.OUT, exist_ok=True)
    blender_new.process('mushhouse')
    shutil.move(os.path.join(blender_new.OUT, 'w_mushhouse.glb.json'), os.path.join(blender_new.OUT, 'mushhouse.glb.json'))
