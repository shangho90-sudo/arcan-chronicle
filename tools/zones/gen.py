import json, os, sys, tripo
S = 'tripo_state.json'; st = json.load(open(S)) if os.path.exists(S) else {}
STY = ('cute but fierce stylized hand-painted fantasy RPG monster, chibi proportions with big head, warm hand-painted textures, '
       'same art style as a cozy fantasy village game, single creature, no base, no ground')
P = {
 'toad': 'chubby fog swamp toad monster crouching on four stubby legs, pale lavender grey skin with misty teal spots and warts, big glowing yellow eyes, wide grumpy mouth, puffed throat sac, small mushrooms on its back. ' + STY,
 'ram': 'frost mountain ram monster standing on four legs, thick fluffy white wool with icy blue tips, huge curled crystal ice horns, angry eyes, frosty breath, hooves. ' + STY,
 'drake': 'small fierce wingless fire drake lizard standing on four legs, crimson red scales, golden yellow belly, short curved horns, spiky back ridge, long tail, fanged snarl, glowing amber eyes. ' + STY,
 'golem': 'ancient ruin stone guardian golem monster, hunched heavy body of cracked grey mossy stone blocks, glowing orange rune carvings, huge stone fists, short thick legs, single glowing eye. ' + STY,
 'dragon': 'ancient elder dragon boss standing on four legs, dark obsidian purple scales with glowing ember orange cracks, large curved horns, folded bat wings, long spiked tail, menacing fanged grin, glowing eyes. ' + STY,
}
for n in sys.argv[1].split(','):
    s = st.setdefault(n, {})
    if s.get('model_task'): continue
    r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': P[n], 'texture': True, 'pbr': True, 'texture_quality': 'detailed'})
    print(n, json.dumps(r)[:300], flush=True)
    if r.get('code') == 0: s['model_task'] = r['data']['task_id']
    json.dump(st, open(S, 'w'), indent=1)
