"""Analyse gait_probe.js output: foot slip while planted, cadence, step length, planted-foot rotation, toe-out,
track width, ground penetration and pose jumps, per model and per scenario.
Usage: python3 tools/browser-tests/gait_report.py /tmp/gait/gait_before.json [/tmp/gait/gait_after.json]"""
import json, math, sys
TELE = {'idle', 'turn180_a', 'blocked', 'run_attack'}   # segments that start with a teleport

def ang(a):
    return (a + math.pi) % (2 * math.pi) - math.pi

def gaitflag(f): return bool(f.get('st')) and f['gw'] > 0.95

def analyse(frames, leg):
    ha = leg['ha']
    # toe-joint height when the foot is flat: take it from the idle frames
    idle = [f for f in frames if f['seg'] == 'idle'][10:] or frames[:20]
    toe0 = min(min(f['lt'][1], f['rt'][1]) for f in idle)
    segs = {}
    for f in frames: segs.setdefault(f['seg'], []).append(f)
    for k, F in segs.items():
        if len(F) > 1 and math.hypot(F[1]['pos'][0] - F[0]['pos'][0], F[1]['pos'][1] - F[0]['pos'][1]) > 0.5 or k in TELE: F[0]['tele'] = True
    rows = {}
    for name, F in segs.items():
        r = {'n': len(F)}
        dist = sum(math.hypot(F[i]['pos'][0] - F[i - 1]['pos'][0], F[i]['pos'][1] - F[i - 1]['pos'][1]) for i in range(1, len(F)))
        T = len(F) / 60; r['speed'] = dist / T
        slips, onsets, rots, toeouts, lats, pen = [], 0, [], [], [], 0.0
        jumps = []
        for side in ('l', 'r'):
            a, t = side + 'a', side + 't'
            prev = None; yaw0 = None
            for i, f in enumerate(F):
                heel = f[a][1] - ha; toe = f[t][1] - toe0
                c = (f['st'][0 if side == 'l' else 1] == 1) if (f.get('st') and f['gw'] > 0.95) else (min(heel, toe) < 0.018)
                pen = min(pen, heel, toe)
                anc = f[a] if heel <= toe else f[t]
                fy = math.atan2(f[t][0] - f[a][0], f[t][2] - f[a][2])
                tele = i < 3 and F[0].get('tele')
                if gaitflag(f) and gaitflag(F[i - 1] if i else f):
                    # gait frames: the model's own stance flag; planted ankle should only move by the heel-raise roll (< 1.5 cm)
                    if c and prev is not None and prev['c'] and not tele:
                        slips.append(math.hypot(f[a][0] - F[i - 1][a][0], f[a][2] - F[i - 1][a][2]) * 60)
                elif c and prev is not None and prev['c'] and prev['which'] == (heel <= toe) and not tele:
                    slips.append(math.hypot(anc[0] - prev['anc'][0], anc[2] - prev['anc'][2]) * 60)
                if c and (prev is None or not prev['c']):
                    if prev is not None: onsets += 1
                    yaw0 = fy
                if c and yaw0 is not None: rots.append(abs(math.degrees(ang(fy - yaw0))))
                if c and f['gw'] > 0.9 and i > 0:
                    mv = math.atan2(f['pos'][0] - F[i - 1]['pos'][0], f['pos'][1] - F[i - 1]['pos'][1])
                    if math.hypot(f['pos'][0] - F[i - 1]['pos'][0], f['pos'][1] - F[i - 1]['pos'][1]) > 0.02:
                        toeouts.append(abs(math.degrees(ang(fy - mv))))
                        dx, dz = anc[0] - f['pos'][0], anc[2] - f['pos'][1]
                        lats.append(abs(dx * math.cos(mv) - dz * math.sin(mv)))
                if i > 0:
                    jumps.append(math.hypot(f[a][0] - F[i - 1][a][0] - (f['pos'][0] - F[i - 1]['pos'][0]), f[a][1] - F[i - 1][a][1], f[a][2] - F[i - 1][a][2] - (f['pos'][1] - F[i - 1]['pos'][1])) * 60)
                prev = {'c': c, 'anc': anc, 'which': heel <= toe}
        hipj = [abs(F[i]['hip'][1] - F[i - 1]['hip'][1]) * 60 for i in range(1, len(F))]
        slips.sort(); jumps.sort()
        q = lambda L, p: L[min(len(L) - 1, int(len(L) * p))] if L else 0
        r.update({'slip_mean': sum(slips) / len(slips) if slips else 0, 'slip_p90': q(slips, 0.9), 'cadence': onsets / T,
                  'step_len': dist / onsets if onsets else 0, 'plant_rot_p90': q(sorted(rots), 0.9), 'toe_out': sum(toeouts) / len(toeouts) if toeouts else 0,
                  'track': 2 * sum(lats) / len(lats) if lats else 0, 'pen_cm': pen * 100, 'foot_v_p99': q(jumps, 0.99), 'hip_v_max': max(hipj) if hipj else 0})
        rows[name] = r
    return rows

def show(path):
    d = json.load(open(path)); print('==', path, 'errors:', len(d.get('errors', [])))
    for g in ('m', 'f'):
        if g not in d: continue
        leg = d[g]['leg']; rows = analyse(d[g]['frames'], leg)
        print(f"-- {g}: leg {leg['L']:.3f} m, ankle h {leg['ha']:.3f}, speed stat {leg['speed']}")
        print(f"{'segment':16} {'v m/s':>6} {'steps/s':>7} {'step m':>6} {'slip avg':>8} {'slip p90':>8} {'rot p90':>7} {'toeout':>6} {'track':>6} {'pen cm':>6} {'footV99':>7} {'hipV':>5}")
        for k, r in rows.items():
            print(f"{k:16} {r['speed']:6.2f} {r['cadence']:7.2f} {r['step_len']:6.2f} {r['slip_mean']:8.3f} {r['slip_p90']:8.3f} {r['plant_rot_p90']:7.1f} {r['toe_out']:6.1f} {r['track']:6.3f} {r['pen_cm']:6.1f} {r['foot_v_p99']:7.2f} {r['hip_v_max']:5.2f}")

for p in sys.argv[1:]: show(p)
