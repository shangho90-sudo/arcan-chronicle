"""Numbers from tools/browser-tests/combo_film.js (basic 5-hit combo in the real game loop):
strike order / impact times, damage per strike, root travel, and foot sliding - horizontal movement of an ankle while it is
on the ground (within 1.2 cm of its lowest height in that strike), summed per strike and the worst single frame.
Usage: python3 tools/anim/combo_report.py /tmp/combo/after_90_1100x760.json [...]"""
import json, sys, math
for fn in sys.argv[1:] or ['/tmp/combo/after_90_1100x760.json']:
    R = json.load(open(fn)); rec = R['rec']
    print(fn.rsplit('/', 1)[-1], '| strikes', ' '.join(f"{e['cn']}@{e['t']}" for e in R['ex']), '| dmg', ' '.join(f"{d['a']}" for d in R['dmg']))
    segs = []
    for r in rec:
        if not segs or segs[-1][0] != r['act'] or r['bt'] < segs[-1][1][-1]['bt']: segs.append((r['act'], [r]))
        else: segs[-1][1].append(r)
    worst = 0
    for act, fr in segs:
        if len(fr) < 3: continue
        out = []
        for side in ('fL', 'fR'):
            lo = min(f[side][1] for f in fr); slide = 0; mx = 0
            for a, b in zip(fr, fr[1:]):
                if a[side][1] - lo < 0.012 and b[side][1] - lo < 0.012:
                    d = math.hypot(b[side][0] - a[side][0], b[side][2] - a[side][2]); slide += d; mx = max(mx, d)
            out.append(f"{side[1]} {slide*100:4.1f} cm (max {mx*1000:3.0f} mm/f)"); worst = max(worst, mx)
        root = math.hypot(fr[-1]['pos'][0] - fr[0]['pos'][0], fr[-1]['pos'][1] - fr[0]['pos'][1])
        print(f"  {act:11s} {fr[0]['t']:5.2f}-{fr[-1]['t']:5.2f}s  root {root*100:4.1f} cm  planted-foot slide: " + ' | '.join(out))
    print(f"  worst planted-foot move in one frame: {worst*1000:.1f} mm")
