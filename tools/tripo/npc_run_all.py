import json, os, time, tripo
names = ['armorer', 'merchant', 'master_pharmacist', 'master_cook', 'master_blacksmith', 'master_hairdresser', 'master_artist']
state = json.load(open('state.json')) if os.path.exists('state.json') else {}
state.setdefault('armorer', {})['model_task'] = state.get('armorer', {}).get('model_task') or 'ca48c1f8-50dd-4bb2-ac39-ef6b06dc5e29'
def save(): json.dump(state, open('state.json', 'w'), indent=1)
for n in names:
    s = state.setdefault(n, {})
    if s.get('model_task'): continue
    up = tripo.upload(f'crops/{n}.png'); tok = up['data']['image_token']
    r = tripo.task({'type': 'image_to_model', 'model_version': 'v3.0-20250812', 'file': {'type': 'png', 'file_token': tok}, 'texture': True, 'pbr': True, 'texture_quality': 'detailed', 'orientation': 'align_image'})
    s['model_task'] = r['data']['task_id']; save(); print('submitted', n, flush=True)
# wait for models, then rig each
for n in names:
    s = state[n]
    if not s.get('model_done'):
        r = tripo.wait(s['model_task']); d = r.get('data', {})
        s['model_status'] = d.get('status'); s['model_output'] = d.get('output'); s['model_done'] = True; save()
        print(n, 'model', d.get('status'), flush=True)
    if s['model_status'] != 'success': continue
    if not s.get('rig_task'):
        chk = tripo.task({'type': 'animate_prerigcheck', 'original_model_task_id': s['model_task']})
        if chk.get('code') == 0:
            c = tripo.wait(chk['data']['task_id'], every=4); s['prerig'] = c.get('data', {}).get('output'); save()
        r = tripo.task({'type': 'animate_rig', 'original_model_task_id': s['model_task'], 'out_format': 'glb'})
        print(n, 'rig submit', json.dumps(r)[:200], flush=True)
        if r.get('code') == 0: s['rig_task'] = r['data']['task_id']; save()
for n in names:
    s = state[n]
    if s.get('rig_task') and not s.get('rig_done'):
        r = tripo.wait(s['rig_task']); d = r.get('data', {})
        s['rig_status'] = d.get('status'); s['rig_output'] = d.get('output'); s['rig_done'] = True; save()
        print(n, 'rig', d.get('status'), flush=True)
    for key, fn in (('rig_output', f'out/{n}_rig.glb'), ('model_output', f'out/{n}_model.glb')):
        o = s.get(key) or {}
        url = o.get('model') or o.get('pbr_model') or o.get('base_model')
        if url and not os.path.exists(fn):
            try: tripo.download(url, fn); print('downloaded', fn, os.path.getsize(fn), flush=True)
            except Exception as e: print('download failed', fn, e, flush=True)
print('done', flush=True)
