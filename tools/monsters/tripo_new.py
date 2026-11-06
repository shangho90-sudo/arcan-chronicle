"""World monsters (2026-11-06): Tripo text_to_model drafts for the new species, one per job (state in
tools/monsters/new_state.json, raw GLBs in /home/claude/new3d). Next step: Blender clean-up (blender_new.py).
Usage: python3 tools/monsters/tripo_new.py submit | poll | download"""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'tripo'))
import tripo
S = os.path.join(HERE, 'new_state.json'); RAW = os.environ.get('RAW', '/home/claude/new3d'); os.makedirs(RAW, exist_ok=True)
st = json.load(open(S)) if os.path.exists(S) else {}
STY = ('cute chibi stylized fantasy RPG monster, big head, round soft shapes, hand-painted textures, warm saturated colours, '
       'same art style as a cozy storybook adventure game, standing pose, single creature, no base, no text')
JOBS = {
    'mole': 'chubby brown mole monster with tiny pink nose, big digging claws, small round glasses-like eyes, dirt on its belly. ' + STY,
    'sapling': 'little walking tree sapling spirit, round leafy green crown with tiny flowers, wooden body with root legs and twig arms, friendly face carved in bark. ' + STY,
    'beetle': 'round armored horned beetle monster, glossy green and gold shell, six short legs, big shiny eyes, one big horn. ' + STY,
    'hawk': 'small fierce mountain hawk monster standing on its legs, brown and cream feathers, wings half open, sharp yellow beak, big eyes. ' + STY,
    'owl': 'round fluffy night owl monster, dark blue and grey feathers, huge golden glowing eyes, tiny feet, little ear tufts. ' + STY,
    'moth': 'glowing blue moth spirit monster, large soft pale blue wings with luminous spots, fluffy white body, feathery antennae, standing on small legs. ' + STY,
    'spider': 'forest spider spirit monster, round body with glowing blue crystal on its back, eight short sturdy legs, big cute eyes, mossy fur. ' + STY,
    'wisp': 'marsh will-o-wisp monster, floating green flame spirit with a small lantern-like core, wispy tail, mischievous face. ' + STY,
    'wraith': 'shadow wraith monster, small hooded black cloak ghost with glowing purple eyes, ragged smoky edges, tiny clawed hands, floating. ' + STY,
    'scorpion': 'desert scorpion monster, sandy orange armored body, big round pincers, curled tail stinger, cute eyes, six short legs. ' + STY,
    'soldier': 'shadow-possessed soldier monster, chibi knight in dark iron armor with a black tattered cape, glowing purple eyes in the helmet visor, holding a short spear. ' + STY,
    'crab': 'river crab monster, round red-orange shell with mossy stones on its back, one big claw and one small claw, eyes on stalks. ' + STY,
    'salamander': 'fire salamander monster, chubby orange and red lizard with glowing ember spots and a flame on its tail tip, stubby legs. ' + STY,
    'crystal': 'red crystal elemental monster, chunky body made of glowing crimson crystal shards on dark rock, two small rock arms, glowing core. ' + STY,
    'armor': 'ancient tomb guardian monster, empty golden-bronze armor suit with a glowing blue core in the chest, round helmet, large shield arm. ' + STY,
    'yeti': 'small snow yeti monster, white shaggy fur, light blue face and hands, icicles on its shoulders, big feet. ' + STY,
    'bat': 'abyss bat monster, round purple-black furry body, large leathery wings spread, glowing violet eyes, small fangs, standing on its feet. ' + STY,
}
cmd = sys.argv[1] if len(sys.argv) > 1 else 'poll'
if cmd == 'submit':
    for n, prompt in JOBS.items():
        s = st.setdefault(n, {})
        if s.get('task'): continue
        r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': prompt, 'texture': True, 'pbr': True, 'texture_quality': 'detailed'})
        print(n, json.dumps(r)[:200], flush=True)
        if r.get('code') == 0: s['task'] = r['data']['task_id']
        json.dump(st, open(S, 'w'), indent=1)
elif cmd in ('poll', 'download'):
    for n, s in st.items():
        if not s.get('task'): continue
        d = tripo.status(s['task']).get('data', {}); s['status'] = d.get('status'); s['progress'] = d.get('progress')
        out = d.get('output') or {}
        url = out.get('pbr_model') or out.get('model') or out.get('base_model')
        if cmd == 'download' and s['status'] == 'success' and url and not os.path.exists(os.path.join(RAW, n + '.glb')):
            tripo.download(url, os.path.join(RAW, n + '.glb')); s['file'] = os.path.join(RAW, n + '.glb')
            for k in ('rendered_image',):
                if out.get(k): tripo.download(out[k], os.path.join(RAW, n + '_preview.webp'))
        print(n, s['status'], s.get('progress'), 'file' if s.get('file') else '')
    json.dump(st, open(S, 'w'), indent=1)
