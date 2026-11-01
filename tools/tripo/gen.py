import json, os, tripo
S = 'state.json'; st = json.load(open(S)) if os.path.exists(S) else {}
STY = ('cute chibi stylized fantasy RPG character, hand-painted textures, warm colours, same art style as a cozy medieval village game, '
       'full body standing pose, arms slightly away from the body, clean single character, no base')
jobs = {n: ('img', f'crops/{n}.png') for n in ['rabbit', 'squirrel', 'fox', 'boar', 'wolf', 'bear']}
jobs['elder'] = ('txt', 'kind old village elder, chibi proportions with big head, long white beard and white hair, round glasses, green hooded robe with gold trim, brown leather belt with pouches, holding a wooden staff with a small blue crystal, brown boots. ' + STY)
jobs['guard'] = ('txt', 'young castle guard, chibi proportions with big head, short brown hair, steel helmet with blue plume, blue tabard with gold fleur-de-lis over chainmail, steel shoulder plates, leather belt, holding a spear upright, brown boots. ' + STY)
jobs['boss_mushroom'] = ('txt', 'giant cute but menacing poison mushroom monster, huge purple cap with glowing green spots, thick pale stalk body with angry eyes and a fanged mouth, stubby root legs, small mushrooms growing around its base, moss, hand-painted stylized fantasy game monster, chibi proportions, single creature, no base')
for n, (kind, src) in jobs.items():
    s = st.setdefault(n, {})
    if s.get('model_task'): continue
    if kind == 'img':
        tok = tripo.upload(src)['data']['image_token']
        r = tripo.task({'type': 'image_to_model', 'model_version': 'v3.0-20250812', 'file': {'type': 'png', 'file_token': tok}, 'texture': True, 'pbr': True, 'texture_quality': 'detailed', 'orientation': 'align_image'})
    else:
        r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': src, 'texture': True, 'pbr': True, 'texture_quality': 'detailed'})
    print(n, json.dumps(r)[:200], flush=True)
    if r.get('code') == 0: s['model_task'] = r['data']['task_id']
    json.dump(st, open(S, 'w'), indent=1)
