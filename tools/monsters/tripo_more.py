"""World monsters, batch 2 (2026-11-07): 30 more species with body plans the game did not have yet (Tripo
text_to_model drafts; state in tools/monsters/more_state.json, raw GLBs in $RAW). Next: blender_new.py <names>.
Tripo allows ~10 running jobs: 'submit' sends up to 10 new ones each call.
Usage: python3 tools/monsters/tripo_more.py submit | poll | download"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'tripo'))
import tripo
S = os.path.join(HERE, 'more_state.json'); RAW = os.environ.get('RAW', '/home/claude/new3d'); os.makedirs(RAW, exist_ok=True)
st = json.load(open(S)) if os.path.exists(S) else {}
STY = ('cute chibi stylized fantasy RPG monster, big head, round soft shapes, hand-painted textures, warm saturated colours, '
       'same art style as a cozy storybook adventure game, standing pose, single creature, no base, no text')
JOBS = {
    'hedgehog': 'round spiky hedgehog monster with brown quills and a pink nose, tiny paws, angry little eyebrows. ' + STY,
    'snail': 'giant garden snail monster with a swirly orange shell covered in moss and tiny flowers, long eye stalks, slimy green body. ' + STY,
    'hornet': 'chubby striped yellow and black hornet monster with big translucent wings, a sharp stinger, big glossy eyes, hovering. ' + STY,
    'mandrake': 'mandrake root monster, a screaming carrot-like root body with big leaves on its head, little root arms and legs. ' + STY,
    'turtle': 'little forest turtle monster with a mossy green dome shell with a small tree sprouting on it, stubby legs, sleepy face. ' + STY,
    'stumpling': 'walking tree stump monster with glowing yellow eyes in the bark, roots for legs, mushrooms and ivy growing on top. ' + STY,
    'armadillo': 'rock armadillo monster with grey stone armour plates on its back, long snout, curled tail, small claws. ' + STY,
    'goblin_miner': 'small green goblin miner monster with a helmet lamp, a pickaxe, patched brown clothes, big pointy ears, mischievous grin. ' + STY,
    'gargoyle': 'baby stone gargoyle monster, grey stone body with small bat wings, little horns, crouching, mossy cracks. ' + STY,
    'pixie': 'mischievous forest pixie monster, tiny girl fairy with blue glowing butterfly wings, leaf dress, holding a little wand, floating. ' + STY,
    'spirit_deer': 'blue spirit deer monster, translucent glowing body with star patterns, large crystal antlers, slender legs. ' + STY,
    'lantern_ghost': 'lantern ghost monster, a floating white sheet ghost holding an old glowing paper lantern, long tail, sleepy eyes. ' + STY,
    'treant': 'young treant monster, a walking tree with a big leafy crown, thick branch arms, wooden face with a frown, root feet. ' + STY,
    'frog_shaman': 'frog shaman monster, green frog standing upright wearing a feather mask and a bead necklace, holding a wooden staff. ' + STY,
    'snapping_turtle': 'swamp snapping turtle monster, dark spiky shell with algae, big beak jaw, muscular legs, red eyes. ' + STY,
    'swamp_serpent': 'swamp serpent monster, coiled green and yellow snake with a frilled hood, fangs, glowing yellow eyes. ' + STY,
    'pitcher_plant': 'carnivorous pitcher plant monster, big purple and green pitcher mouth with teeth, leaf arms, vine roots walking. ' + STY,
    'cactus': 'walking cactus monster with pink flowers on its head, needle arms raised to fight, little sombrero-free round body, angry eyes. ' + STY,
    'sandworm': 'desert sandworm monster, segmented sandy beige body rising from the ground, round mouth ring of teeth, tiny eyes. ' + STY,
    'vulture': 'bald desert vulture monster, dark brown feathers, pink bald head, hunched posture, big hooked beak, wings half open. ' + STY,
    'mummy': 'small mummy monster wrapped in old bandages, one glowing eye showing, arms stretched forward, loose bandage ends. ' + STY,
    'griffin_chick': 'young griffin monster, eagle head and wings with lion body, golden brown feathers, fluffy, sharp talons. ' + STY,
    'goblin_bandit': 'goblin bandit monster with a red bandana and eye patch, holding a curved dagger, leather vest, sneaky grin. ' + STY,
    'orc': 'orc warrior monster, green skin, tusks, iron shoulder armour, big wooden club, sturdy and stocky. ' + STY,
    'flame_imp': 'flame imp monster, small red devil with flaming hair, tiny bat wings, pointy tail, holding a fireball. ' + STY,
    'lava_turtle': 'lava turtle monster with a black volcanic rock shell cracked with glowing orange lava, small volcano on its back. ' + STY,
    'skeleton_knight': 'skeleton knight monster with a rusty helmet, round shield and short sword, glowing blue eyes, tattered cape. ' + STY,
    'mimic': 'mimic treasure chest monster with a wooden gold-trimmed chest body, open lid full of sharp teeth and a long tongue, little legs. ' + STY,
    'penguin_knight': 'penguin knight monster wearing a tiny blue steel helmet and scarf, holding an ice spear, waddling. ' + STY,
    'ice_golem': 'ice golem monster made of chunky blue ice blocks with frost on its shoulders, glowing cyan core, big fists. ' + STY,
    'shadow_eye': 'floating shadow eye monster, a round dark purple orb with one giant eye and small tentacles below, eerie glow. ' + STY,
    'demon_knight': 'demon knight monster in black spiked armour with red glowing eyes, curved horns on the helmet, holding a dark greatsword. ' + STY,
}
cmd = sys.argv[1] if len(sys.argv) > 1 else 'poll'
if cmd == 'submit':
    running = sum(1 for s in st.values() if s.get('task') and s.get('status') not in ('success', 'failed', 'cancelled', 'banned', 'expired'))
    for n, prompt in JOBS.items():
        s = st.setdefault(n, {})
        if s.get('task') or running >= 10: continue
        r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': prompt, 'texture': True, 'pbr': True, 'texture_quality': 'detailed'})
        print(n, json.dumps(r)[:160], flush=True)
        if r.get('code') == 0: s['task'] = r['data']['task_id']; running += 1
        json.dump(st, open(S, 'w'), indent=1)
elif cmd in ('poll', 'download'):
    for n, s in st.items():
        if not s.get('task'): continue
        if s.get('file') and os.path.exists(s['file']): print(n, 'done'); continue
        d = tripo.status(s['task']).get('data', {}); s['status'] = d.get('status'); s['progress'] = d.get('progress')
        out = d.get('output') or {}
        url = out.get('pbr_model') or out.get('model') or out.get('base_model')
        if cmd == 'download' and s['status'] == 'success' and url:
            tripo.download(url, os.path.join(RAW, n + '.glb')); s['file'] = os.path.join(RAW, n + '.glb')
            if out.get('rendered_image'): tripo.download(out['rendered_image'], os.path.join(RAW, n + '_preview.webp'))
        print(n, s['status'], s.get('progress'), 'file' if s.get('file') else '', flush=True)
    json.dump(st, open(S, 'w'), indent=1)
