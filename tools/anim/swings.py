"""Writes the weapon-swing actions (attack, attack2) into assets/models/actions.json.

Swing keys are timed (seconds) and eased per segment; the sword arm is solved by IK in js/model.js:
  hand  = [azimuth, elevation, reach]  sword hand around the right shoulder, body space
          (az 0 = forward, + = towards the character's LEFT; el + = up; reach = fraction of arm length)
  blade = [azimuth, elevation]         where the blade points (the wrist bends up to 60 deg to follow it)
  elbow = [x, y, z]                    direction the elbow points (IK pole)
  step  = [left, right]                planted foot offsets forward (m) - feet stay fixed for the whole swing
  e     = easing INTO this key: i (accelerate) / o (decelerate) / io / s (smooth) / linear
Five phases: ready -> wind-up (shoulder and chest turn back, slow out) -> strike (accelerating) -> impact (fastest) ->
follow-through (decelerating) -> recovery (smooth, ends on the idle stance with IK weight 0 so it hands back to idle).
Usage: python3 tools/anim/swings.py
"""
import json, os
P = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'models', 'actions.json')

IDLE = dict(bob=0.0, lean=0.0, twist=0.0, legL=0.0, legR=0.0, wOff=75.0, wSide=0.0, offOff=60.0, fall=0.0, sink=0.0, squint=False, armR=[8, 14], armL=[8, 14], held=None)
STEP = [0.0, 0.0]   # feet stay exactly on the idle footprint (no slide when the swing blends in / out)

def key(t, e=None, ik=1, plant=1, **kw):
    k = dict(IDLE); k.update(wOff=90.0, step=STEP, ik=ik, plant=plant); k.update(kw)
    if e: k['e'] = e
    return t, k

def action(name, keys, hitT, lock, trail, fadeIn=0.06, fadeOut=0.14):
    T = [round(t, 3) for t, _ in keys]; poses = [k for _, k in keys]; dur = T[-1]; fps = len(poses) / dur
    return dict(name=name, frames=len(poses), fps=round(fps, 4), loop=False, hitFrame=round(hitT * fps, 4), keys=T, poses=poses,
                dur=dur, hitT=hitT, lock=lock, trail=trail, fadeIn=fadeIn, fadeOut=fadeOut, trailColor=[1.25, 1.45, 1.9])

# A: forehand diagonal cut, high right -> low left
A = action('attack', [
    key(0.00, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18]),
    key(0.13, 'o', twist=-32, lean=-5, sink=0.05, hand=[-112, 42, 0.80], blade=[-150, 58], elbow=[-0.4, -0.5, -1], armL=[30, 30], squint=False),
    key(0.17, 's', twist=-36, lean=-6, sink=0.06, hand=[-120, 46, 0.80], blade=[-162, 62], elbow=[-0.4, -0.4, -1], armL=[34, 32]),
    key(0.215, 'i', twist=-10, lean=5, sink=0.06, hand=[-55, 22, 0.97], blade=[-80, 18], elbow=[-0.6, -1, -0.4], armL=[26, 26], squint=True),
    key(0.25, None, twist=16, lean=12, sink=0.08, hand=[5, -4, 1.0], blade=[12, -14], elbow=[-0.5, -1, -0.1], armL=[14, 30], squint=True),
    key(0.32, 'o', twist=30, lean=14, sink=0.09, hand=[52, -30, 0.86], blade=[88, -42], elbow=[-0.1, -1, 0.2], armL=[10, 40]),
    key(0.42, 's', twist=14, lean=7, sink=0.06, hand=[10, -40, 0.78], blade=[30, -12], elbow=[-0.5, -1, -0.1], armL=[10, 26]),
    key(0.55, 's', hand=[-30, -40, 0.70], blade=[-10, 20]),
], hitT=0.25, lock=0.40, trail=[0.185, 0.335], fadeIn=0.09, fadeOut=0.16)

# B: backhand rising cut, low left -> high right (chains after A: the hand starts where A's follow-through ended)
B = action('attack2', [
    key(0.00, hand=[40, -35, 0.78], blade=[60, -15], elbow=[-0.2, -1, 0.1], armL=[12, 18]),
    key(0.12, 'o', twist=30, lean=4, sink=0.06, hand=[78, -28, 0.70], blade=[128, -24], elbow=[0.1, -1, 0.5], armL=[10, 40]),
    key(0.16, 's', twist=34, lean=5, sink=0.07, hand=[84, -30, 0.68], blade=[138, -26], elbow=[0.15, -1, 0.55], armL=[10, 42]),
    key(0.205, 'i', twist=8, lean=8, sink=0.07, hand=[24, -10, 0.95], blade=[40, -4], elbow=[-0.3, -1, 0.2], armL=[18, 30], squint=True),
    key(0.24, None, twist=-16, lean=8, sink=0.06, hand=[-32, 10, 1.0], blade=[-48, 16], elbow=[-0.6, -1, -0.2], armL=[26, 24], squint=True),
    key(0.31, 'o', twist=-30, lean=2, sink=0.05, hand=[-88, 32, 0.86], blade=[-122, 44], elbow=[-0.6, -0.6, -0.8], armL=[32, 26]),
    key(0.42, 's', twist=-12, lean=2, sink=0.03, hand=[-50, 0, 0.76], blade=[-40, 30], elbow=[-0.7, -1, -0.3], armL=[16, 20]),
    key(0.55, 's', hand=[-30, -40, 0.70], blade=[-10, 20]),
], hitT=0.24, lock=0.40, trail=[0.175, 0.325], fadeIn=0.09, fadeOut=0.16)


# ------------------------------------------------------------------------------------------------ sword skill combos
# Skill flurries are built from a small strike library. Each strike = cock (wind-up peak) -> accelerating mid -> impact
# (fastest) -> short follow-through; consecutive strikes chain because each one starts near where the previous ended
# (forehand ends low-left = backhand start, backhand ends high-right = forehand / horizontal start ...).
# Extra fields read by the game (js/skillrt.js, js/model.js):
#   hitTimes = impact time of every strike (s)  -> the skill's multi-hit op lands exactly on the impacts
#   hitFx    = per-strike slash effect (kind / mirror / tilt / size, finisher burst + shake + hit-stop)
#   lunges   = [time, dist, dur] root steps forward (replace the skill's own lunge ops while this action plays)
#   spins    = [start, end, deg] whole-body turns (root yaw on top of the facing, eased, never unwinds)
#   trail    = list of [start, end] windows (only the cutting part of each strike leaves the afterimage)
#   trailLife / trailBase = how long the afterimage lasts / how far down the blade it starts (wider for skills)
ST = {
    # forehand diagonal: high right -> low left
    'fd': dict(cock=dict(twist=-38, lean=-6, sink=0.08, hand=[-120, 48, 0.80], blade=[-162, 64], elbow=[-0.4, -0.4, -1], armL=[34, 32]),
               mid=dict(twist=-10, lean=6, sink=0.09, hand=[-55, 22, 0.97], blade=[-80, 18], elbow=[-0.6, -1, -0.4], armL=[26, 26], squint=True),
               hit=dict(twist=18, lean=13, sink=0.11, hand=[5, -4, 1.0], blade=[12, -14], elbow=[-0.5, -1, -0.1], armL=[14, 30], squint=True),
               fol=dict(twist=32, lean=14, sink=0.11, hand=[52, -30, 0.86], blade=[88, -42], elbow=[-0.1, -1, 0.2], armL=[10, 40]),
               fx=dict(mirror=False, tilt=0.45), lunge=0.30),
    # backhand rising: low left -> high right
    'br': dict(cock=dict(twist=36, lean=5, sink=0.09, hand=[86, -30, 0.68], blade=[140, -26], elbow=[0.15, -1, 0.55], armL=[10, 42]),
               mid=dict(twist=8, lean=8, sink=0.09, hand=[24, -10, 0.95], blade=[40, -4], elbow=[-0.3, -1, 0.2], armL=[18, 30], squint=True),
               hit=dict(twist=-18, lean=9, sink=0.08, hand=[-32, 12, 1.0], blade=[-48, 18], elbow=[-0.6, -1, -0.2], armL=[26, 24], squint=True),
               fol=dict(twist=-34, lean=2, sink=0.07, hand=[-92, 34, 0.86], blade=[-126, 46], elbow=[-0.6, -0.6, -0.8], armL=[32, 26]),
               fx=dict(mirror=True, tilt=-0.4), lunge=0.20),
    # horizontal forehand at chest height: right -> left, big chest turn
    'hz': dict(cock=dict(twist=-46, lean=-2, sink=0.12, hand=[-112, 8, 0.86], blade=[-152, 4], elbow=[-0.5, -0.6, -0.8], armL=[30, 34]),
               mid=dict(twist=-14, lean=8, sink=0.13, hand=[-50, 4, 1.0], blade=[-62, 0], elbow=[-0.5, -1, -0.5], armL=[22, 30], squint=True),
               hit=dict(twist=14, lean=12, sink=0.14, hand=[12, 2, 1.0], blade=[22, -2], elbow=[-0.4, -1, 0.0], armL=[14, 36], squint=True),
               fol=dict(twist=44, lean=10, sink=0.13, hand=[82, 0, 0.86], blade=[128, -6], elbow=[0.0, -1, 0.5], armL=[10, 42]),
               fx=dict(mirror=False, tilt=0.06, ang=150, r=1.12), lunge=0.20),
    # horizontal backhand: left -> right
    'hb': dict(cock=dict(twist=42, lean=2, sink=0.13, hand=[88, 4, 0.74], blade=[138, 4], elbow=[0.1, -1, 0.6], armL=[10, 42]),
               mid=dict(twist=12, lean=8, sink=0.13, hand=[30, 4, 0.96], blade=[50, 2], elbow=[-0.2, -1, 0.3], armL=[18, 32], squint=True),
               hit=dict(twist=-16, lean=11, sink=0.12, hand=[-26, 4, 1.0], blade=[-42, 2], elbow=[-0.6, -1, -0.2], armL=[26, 26], squint=True),
               fol=dict(twist=-42, lean=6, sink=0.11, hand=[-96, 6, 0.88], blade=[-142, 4], elbow=[-0.6, -0.6, -0.8], armL=[32, 26]),
               fx=dict(mirror=True, tilt=-0.06, ang=150, r=1.12), lunge=0.20),
}
GOLD = 0xffd27a

def combo(name, seq, t0=0.20, gap=0.125, gaps=None, trailColor=(1.55, 1.38, 0.95), lunge=True):
    """seq: strike ids from ST plus 'spin' (jumping 360 slash) and 'ov' (jumping overhead slam finisher);
    gaps: optional time from each impact to the next (overrides the default rhythm)"""
    keys = [key(0.00, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18])]
    hitT, fx, lun, spins, trail = [], [], [], [], []
    T = t0
    for n, sid in enumerate(seq):
        last = n == len(seq) - 1
        if sid in ST:
            S = ST[sid]
            if n: T = hitT[-1] + (gaps[n - 1] if gaps else gap)
            w = 0.085 if n == 0 else 0.062
            keys += [key(T - w, 'o' if n == 0 else 's', **S['cock']), key(T - 0.026, 'i', **S['mid']), key(T, None, **S['hit']), key(T + 0.045, 'o', **S['fol'])]
            hitT.append(T); trail.append([T - 0.05, T + 0.05])
            fx.append(dict(S['fx'], gold=n % 3 == 2))
            if lunge: lun.append([T - 0.09, S['lunge'] if n else 0.35, 0.11])
        elif sid == 'spin':
            # coil on the right, hop, turn a full circle with the blade held out (hit when it sweeps the front half)
            s0 = hitT[-1] + 0.075; s1 = s0 + 0.34; T = (s0 + s1) / 2
            out = dict(hand=[-82, 4, 0.98], blade=[-100, -2], elbow=[-0.6, -0.8, -0.4], armL=[40, 50])
            keys += [key(s0 - 0.01, 's', twist=-30, lean=4, sink=0.16, **out),
                     key(s0 + 0.08, 'o', twist=-16, lean=6, bob=0.42, plant=0, legL=34, legR=20, squint=True, **out),
                     key(T + 0.06, 's', twist=-12, lean=6, bob=0.48, plant=0, legL=38, legR=24, squint=True, **out),
                     key(s1, 'i', twist=-20, lean=8, sink=0.14, **out)]
            spins.append([s0, s1, 360]); hitT.append(T); trail.append([s0 + 0.02, s1])
            fx.append(dict(slash='spin', r=1.05, gold=True, shake=[0.06, 0.12]))
            if lunge: lun.append([s0, 0.40, 0.30])
        elif sid == 'ov':
            # jump, blade raised behind the head, slam straight down in front; land in a deep lunge
            T = (spins[-1][1] + 0.24) if seq[n - 1] == 'spin' else hitT[-1] + (gaps[n - 1] if gaps else 0.30)
            keys += [key(T - 0.20, 'o', twist=-6, lean=-12, bob=0.42, plant=0, legL=36, legR=18, hand=[-12, 74, 0.82], blade=[-6, 104], elbow=[-0.6, 0.2, -1], armL=[60, 40]),
                     key(T - 0.09, 's', twist=-4, lean=-18, bob=0.62, plant=0, legL=40, legR=26, hand=[-8, 82, 0.84], blade=[-4, 112], elbow=[-0.6, 0.3, -1], armL=[66, 44]),
                     key(T - 0.03, 'i', twist=0, lean=16, bob=0.22, plant=0, legL=26, legR=8, hand=[-4, 30, 0.98], blade=[0, 30], elbow=[-0.5, -0.6, -0.8], armL=[40, 30], squint=True),
                     key(T, None, twist=2, lean=36, sink=0.30, hand=[0, -26, 1.0], blade=[2, -56], elbow=[-0.4, -1, -0.2], armL=[20, 40], squint=True, step=[0.22, -0.18]),
                     key(T + 0.07, 'o', twist=4, lean=38, sink=0.34, hand=[4, -36, 0.94], blade=[4, -70], elbow=[-0.4, -1, -0.1], armL=[16, 44], step=[0.22, -0.18]),
                     key(T + 0.24, 's', twist=4, lean=30, sink=0.28, hand=[4, -34, 0.92], blade=[4, -66], elbow=[-0.4, -1, -0.1], armL=[16, 40], step=[0.22, -0.18])]
            hitT.append(T); trail.append([T - 0.07, T + 0.05])
            fx.append(dict(mirror=False, tilt=1.3, r=1.15, ang=120, gold=True, burst='ground_crack', burstR=0.7, burstFwd=1.3, shake=[0.16, 0.22], stop=0.06))
            if lunge: lun.append([T - 0.22, 0.80, 0.20])
        else: raise ValueError(sid)
    end = hitT[-1] + (0.30 if seq[-1] == 'ov' else 0.10)
    keys += [key(end, 's', twist=8, lean=6, sink=0.04, hand=[10, -40, 0.78], blade=[30, -12], elbow=[-0.5, -1, -0.1]),
             key(end + 0.16, 's', hand=[-30, -40, 0.70], blade=[-10, 20])]
    a = action(name, keys, hitT[0], end, trail, fadeIn=0.07, fadeOut=0.16)
    a.update(hitTimes=[round(t, 3) for t in hitT], hitFx=fx, spins=[[round(x, 3) for x in s] for s in spins], trailLife=0.2, trailBase=0.12,
             trailColor=list(trailColor), recover=round(end - hitT[-1] + 0.02, 3))
    if lunge: a['lunges'] = [[round(t, 3), d, u] for t, d, u in lun]
    assert all(x < y for x, y in zip(a['keys'], a['keys'][1:])), (name, a['keys'])
    return a

# 연 (nv_a2): 2 hits at skill Lv1, +1 per level up to 6 -> one action per hit count, each a bigger flurry
YEON = {2: ['fd', 'br'], 3: ['fd', 'br', 'ov'], 4: ['fd', 'br', 'hz', 'ov'], 5: ['fd', 'br', 'hz', 'hb', 'ov'], 6: ['fd', 'br', 'hz', 'hb', 'spin', 'ov']}
COMBOS = [combo('nv_yeon_%d' % n, seq) for n, seq in YEON.items()]
# 일격참 (nv_a1): left cut, right cut, jump slam. Impacts must match the skill data (hit ops at +0, +0.24, +0.58) and
# its own lunges move the body, so no lunges / hitFx here (the data keeps its blade + fire crack effects)
IL = combo('nv_ilgyeok', ['fd', 'br', 'ov'], gaps=[0.24, 0.34], lunge=False); del IL['hitFx']
# 비연참 (nv_a3): one huge horizontal sweep that throws the sword wave
BI = combo('nv_biyeon', ['hz'], t0=0.22, lunge=False); del BI['hitFx']
SKILL_ACTS = COMBOS + [dict(COMBOS[0], name='nv_yeon'), IL, BI]   # nv_yeon = the 2-hit flurry (fallback name in the skill data)

acts = json.load(open(P))
names = {'attack', 'attack2'} | {x['name'] for x in SKILL_ACTS}
acts = [a for a in acts if a['name'] not in names and not a['name'].startswith('nv_yeon_')]
i = next(i for i, a in enumerate(acts) if a['name'] == 'walk') + 1
acts[i:i] = [A, B]
acts += SKILL_ACTS
raw = open(P).read()
json.dump(acts, open(P, 'w'), ensure_ascii=False, indent=1 if raw.startswith('[\n ') else None)
print('wrote', [a['name'] for a in acts])
