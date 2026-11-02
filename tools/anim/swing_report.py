"""Numbers from tools/browser-tests/swing_film.js: foot drift while the stance is planted, hand-to-blade distance
(grip stays attached), blade-tip speed per phase (slow wind-up, fastest at impact, slowing follow-through)."""
import json, sys, math
P = json.load(open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/swing/swing_probe.json'))
d = lambda a, b: math.dist(a, b)
for k, path in P.items():
    act = k.rsplit('_', 1)[0]
    pl = [f for f in path if f['act'] == act]                      # whole swing incl. blend in from idle
    post = [f for f in path if f['act'] != act]                    # blend back to idle
    drift = max(max(d(f['footL'], pl[0]['footL']), d(f['footR'], pl[0]['footR'])) for f in pl + post)
    grip = [d(f['hand'], f['base']) for f in path if f['base']]
    sp = []
    for a, b in zip(path, path[1:]):
        if a['tip'] and b['tip'] and b['t'] > a['t']: sp.append((b['t'], d(a['tip'], b['tip']) / (b['t'] - a['t'])))
    ph = lambda t0, t1: max([v for t, v in sp if t0 <= t <= t1] or [0])
    print(f"{k:14s} foot drift (whole swing + return) {drift*100:4.1f} cm | grip hand-blade {min(grip):.3f}-{max(grip):.3f} m | tip speed m/s: wind-up {ph(0.02,0.17):4.1f}  strike {ph(0.17,0.26):4.1f}  follow {ph(0.26,0.33):4.1f}  recover {ph(0.33,0.55):4.1f}")
