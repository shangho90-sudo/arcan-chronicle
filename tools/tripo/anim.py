import json, os, time, tripo
st = json.load(open('state.json')); S = lambda: json.dump(st, open('state.json', 'w'), indent=1)
quad = ['rabbit', 'squirrel', 'fox', 'boar', 'wolf', 'bear']
st['rabbit']['walk_task'] = st['rabbit'].get('walk_task') or '2a8e1aca-9d4f-47dc-ab20-72ff0911947b'
for n in quad + ['elder', 'guard', 'boss_mushroom']:
    s = st[n]
    if n == 'boss_mushroom':
        if not s.get('model_output'):
            w = tripo.wait(s['model_task']); s['model_output'] = w.get('data', {}).get('output'); S()
        continue
    if not s.get('rig_status'):
        w = tripo.wait(s['rig_task']); s['rig_status'] = w.get('data', {}).get('status'); s['rig_output'] = w.get('data', {}).get('output'); S()
    if n in quad and not s.get('walk_task'):
        r = tripo.task({'type': 'animate_retarget', 'original_model_task_id': s['rig_task'], 'out_format': 'glb', 'animations': ['preset:quadruped:walk'], 'bake_animation': True, 'export_with_geometry': True})
        if r.get('code') == 0: s['walk_task'] = r['data']['task_id']; S()
        print(n, 'walk', json.dumps(r)[:120], flush=True)
for n in quad:
    s = st[n]
    if s.get('walk_task') and not s.get('walk_output'):
        w = tripo.wait(s['walk_task']); s['walk_output'] = w.get('data', {}).get('output'); s['walk_status'] = w.get('data', {}).get('status'); S()
        print(n, 'walk', s['walk_status'], flush=True)
os.makedirs('out', exist_ok=True)
for n in quad + ['elder', 'guard', 'boss_mushroom']:
    s = st[n]
    o = s.get('walk_output') if n in quad else (s.get('rig_output') if n != 'boss_mushroom' else s.get('model_output'))
    o = o or {}; url = o.get('model') or o.get('pbr_model')
    fn = f'out/{n}.glb'
    if url and not os.path.exists(fn):
        for i in range(3):
            try: tripo.download(url, fn); print('dl', fn, os.path.getsize(fn), flush=True); break
            except Exception as e: print('dl fail', n, e, flush=True); time.sleep(3)
print('done', flush=True)
