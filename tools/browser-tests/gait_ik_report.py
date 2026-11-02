"""IK / pose numbers from gait_probe.js (needs the gdbg field): per segment, share of frames where a leg target was out of
reach (and by how much), knee flexion at toe-off / mid-swing / mid-stance, deepest trailing reach, and the gait
parameters (cadence, stance length S, duty). Usage: python3 tools/browser-tests/gait_ik_report.py /tmp/gait/gait_<tag>.json"""
import json, sys, statistics as st
d = json.load(open(sys.argv[1]))
for g in ('m', 'f'):
    if g not in d: continue
    print('--', g, 'leg', round(d[g]['leg']['L'], 3))
    print(f"{'segment':16} {'cad':>5} {'S m':>5} {'duty':>5} {'miss%':>6} {'missMax':>7} {'kneeSt':>6} {'kneeTO':>6} {'kneeSw':>6} {'reachMax':>8}")
    segs = {}
    for f in d[g]['frames']:
        if f.get('gd'): segs.setdefault(f['seg'], []).append(f['gd'])
    for k, L in segs.items():
        miss = [max(x['miss'].values()) for x in L]; pm = 100 * sum(1 for m in miss if m > 0) / len(L)
        ks, kt, kw, rm = [], [], [], 0
        for a, b in zip(L, L[1:]):
            for s in ('Left', 'Right'):
                if a['stance'].get(s) and b['stance'].get(s): ks.append(b['knee'][s])
                if a['stance'].get(s) and not b['stance'].get(s): kt.append(b['knee'][s])
                if not b['stance'].get(s): kw.append(b['knee'][s])
                rm = max(rm, b['reach'][s])
        av = lambda x: round(st.mean(x), 1) if x else 0
        print(f"{k:16} {L[-1]['cad']:5.2f} {L[-1]['S']:5.2f} {L[-1]['duty']:5.2f} {pm:6.1f} {max(miss):7.3f} {av(ks):6.1f} {av(kt):6.1f} {max(kw or [0]):6.1f} {rm:8.3f}")
