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

acts = json.load(open(P))
acts = [a for a in acts if a['name'] not in ('attack', 'attack2')]
i = next(i for i, a in enumerate(acts) if a['name'] == 'walk') + 1
acts[i:i] = [A, B]
raw = open(P).read()
json.dump(acts, open(P, 'w'), ensure_ascii=False, indent=1 if raw.startswith('[\n ') else None)
print('wrote', [a['name'] for a in acts])
