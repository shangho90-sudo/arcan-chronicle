import json, os, tripo, sys
st = json.load(open('state.json')); S = lambda: json.dump(st, open('state.json', 'w'), indent=1)
names = sys.argv[1].split(',')
for n in names:
    s = st[n]
    if s.get('rig_task'): continue
    c = tripo.wait(tripo.task({'type': 'animate_prerigcheck', 'original_model_task_id': s['model_task']})['data']['task_id'], every=3)
    o = c.get('data', {}).get('output') or {}; s['prerig'] = o
    rt = o.get('rig_type') or ('quadruped' if n in ('rabbit','squirrel','fox','boar','wolf','bear') else 'biped')
    r = tripo.task({'type': 'animate_rig', 'original_model_task_id': s['model_task'], 'out_format': 'glb', 'rig_type': rt, 'spec': 'tripo', 'model_version': 'v2.0-20250506'})
    if r.get('code') != 0:
        r = tripo.task({'type': 'animate_rig', 'original_model_task_id': s['model_task'], 'out_format': 'glb'})
    print(n, rt, json.dumps(r)[:200], flush=True)
    if r.get('code') == 0: s['rig_task'] = r['data']['task_id']
    S()
for n in names:
    s = st[n]
    if s.get('rig_task') and not s.get('rig_status'):
        w = tripo.wait(s['rig_task']); s['rig_status'] = w.get('data', {}).get('status'); s['rig_output'] = w.get('data', {}).get('output'); S()
        print(n, 'rig', s['rig_status'], flush=True)
