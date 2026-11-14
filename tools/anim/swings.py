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
# (2026-11-10) '연(連)' effect (js/yeonfx.js): every strike gets hitFx[i].yeon = the crescent pattern drawn along that swing.
#   p     pattern: rl = right -> left (forehand), lr = left -> right (the cross stroke), up = rising, down = heavy downward,
#         ring = the spin; the LAST strike is always the finisher (fin: big double crescent + cross cut + burst)
#   roll  rotation of the crescent plane about the attack axis (rad, + = the start end high), mirror = swing from the other side
#   size  crescent radius multiplier, var = mesh variant (a = thickest late, b = thickest early) -> no two strikes look stamped
#   col   [body, halo] from the palette sky #78DFFF / blue-violet #8A65FF / pink #FF8BD8 (white core in the texture)
SKY, VIOLET, PINK, PALE = 0x78DFFF, 0x8A65FF, 0xFF8BD8, 0xB4ECFF
YPAT = {'fd': dict(p='rl', roll=0.50, mirror=False), 'br': dict(p='up', roll=-0.62, mirror=True), 'hz': dict(p='rl', roll=0.10, mirror=False),
        'hb': dict(p='lr', roll=-0.16, mirror=True), 'spin': dict(p='ring', roll=0.04, mirror=False), 'ov': dict(p='down', roll=1.30, mirror=False)}
YCOL = [[SKY, VIOLET], [VIOLET, PINK], [SKY, PINK], [PINK, VIOLET], [SKY, VIOLET]]
YSIZE = [1.0, 0.93, 1.08, 0.97, 1.12]
# rhythm (2026-11-10): 0.12 s between the quick strikes, a longer beat before the finisher (0.15, or 0.26 for the jump slam):
# 5 hits land at 0.20 / 0.32 / 0.44 / 0.56 / 0.82 s (the visible slashes run ~0.16 -> ~1.1 s). Damage follows hitTimes.
def yeon_combo(n, seq):
    gaps = [0.12] * (len(seq) - 2) + [0.26 if seq[-1] == 'ov' else 0.15]
    a = combo('nv_yeon_%d' % n, seq, gaps=gaps, trailColor=(0.85, 1.45, 1.75))
    a['trailLife'] = 0.14
    for i, (sid, fx) in enumerate(zip(seq, a['hitFx'])):
        fin = i == len(seq) - 1
        y = dict(YPAT[sid], var='ab'[i % 2], size=1.45 if fin else YSIZE[i % 5], col=[PALE, PINK] if fin else YCOL[i % 5])
        if fin: y['fin'] = True
        fx['yeon'] = y
    return a
COMBOS = [yeon_combo(n, seq) for n, seq in YEON.items()]
# 일격참 (nv_a1): left cut, right cut, jump slam. Impacts must match the skill data (hit ops at +0, +0.24, +0.58) and
# its own lunges move the body, so no lunges / hitFx here (the data keeps its blade + fire crack effects)
# 일격참 (nv_a1, 2026-11-09): one big forward thrust instead of the old 3-hit flurry. Sword pulled back to the right hip
# (shoulders turned away, weight sunk), a short hold, then an explosive lunge with the arm and blade driven straight
# forward; the stance stays deep while the ground cracks in front (skill data: lunge at -0.12, one line hit + crack at +0)
IL_T = 0.30
IL_KEYS = [
    key(0.00, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18]),
    key(0.15, 'o', twist=-42, lean=-4, sink=0.16, hand=[-78, -22, 0.52], blade=[-8, -2], elbow=[-0.5, -0.2, -1], armL=[40, 46], step=[0.18, -0.14]),
    key(0.23, 's', twist=-46, lean=-2, sink=0.20, hand=[-82, -24, 0.48], blade=[-6, -2], elbow=[-0.5, -0.2, -1], armL=[44, 48], step=[0.18, -0.14], squint=True),
    key(IL_T - 0.03, 'i', twist=-16, lean=10, sink=0.22, hand=[-36, -10, 0.82], blade=[-2, -4], elbow=[-0.6, -0.5, -0.6], armL=[24, 40], step=[0.30, -0.22], squint=True),
    key(IL_T, None, twist=16, lean=22, sink=0.28, hand=[-6, -4, 1.02], blade=[0, -6], elbow=[-0.5, -0.8, -0.2], armL=[8, 52], step=[0.40, -0.28], squint=True),
    key(IL_T + 0.08, 'o', twist=20, lean=25, sink=0.31, hand=[-4, -6, 1.04], blade=[0, -8], elbow=[-0.5, -0.8, -0.2], armL=[6, 56], step=[0.40, -0.28], squint=True),
    key(IL_T + 0.36, 's', twist=16, lean=20, sink=0.27, hand=[-8, -10, 0.96], blade=[0, -12], elbow=[-0.5, -0.9, -0.2], armL=[8, 50], step=[0.40, -0.28]),
    key(IL_T + 0.56, 's', twist=6, lean=6, sink=0.06, hand=[10, -40, 0.78], blade=[30, -12], elbow=[-0.5, -1, -0.1]),
    key(IL_T + 0.72, 's', hand=[-30, -40, 0.70], blade=[-10, 20]),
]
# trail: only the last 0.04 s of the thrust, short-lived, white / light pink, from the outer half of the blade -> it
# leads into the '살' beam instead of competing with it (other sword skills keep their gold trails)
IL = action('nv_ilgyeok', IL_KEYS, IL_T, IL_T + 0.50, [[IL_T - 0.045, IL_T + 0.02]], fadeIn=0.07, fadeOut=0.16)
IL.update(hitTimes=[IL_T], trailLife=0.11, trailBase=0.45, trailColor=[1.55, 1.3, 1.5])
# 비연참 (nv_a3): one huge horizontal sweep that throws the sword wave
# (2026-11-10) 비연파: pale sky blade trail (js/biyeonfx.js colours) instead of the gold one; impact time 0.22 unchanged
BI = combo('nv_biyeon', ['hz'], t0=0.22, lunge=False, trailColor=(1.25, 1.5, 1.7)); del BI['hitFx']
# 구르기 (회피, Shift): crouch -> tucked ball rolling forward 360 deg about a point 0.5 m up (action.flips, js/model.js)
# -> open up and stand. Matches config.json dodgeDuration 0.42 s (the flip ends just before the dash does)
TUCK = dict(lean=58, sink=0.40, legL=150, legR=140, tuck=55, armR=[72, 6], armL=[72, 6], wOff=40.0, ik=0, plant=0)
ROLL = action('roll', [
    key(0.00, None, ik=0, plant=0, lean=18, sink=0.12, legL=25, legR=-10, armR=[40, 18], armL=[40, 18]),
    key(0.08, 'o', **TUCK),
    key(0.30, 's', **dict(TUCK, lean=62, legL=145, legR=150)),
    key(0.41, 'o', ik=0, plant=0, lean=22, sink=0.16, legL=35, legR=-12, armR=[30, 22], armL=[30, 22]),
    key(0.54, 's', ik=0, plant=0),
], 0.0, 0.40, None, fadeIn=0.04, fadeOut=0.12)
ROLL['flips'] = [[0.05, 0.40, 360, 0.5]]

# ------------------------------------------------------------------------------------------------ basic attack: 5-hit combo
# (2026-11-10) 기본공격 5단 콤보 (one-handed sword, right hand; the left arm balances). Authored as ONE timeline at 60 fps
# (150 frames = 2.5 s), the same one the Blender export uses (tools/blender/combo5.py):
#   1  f1-22   hit f12   diagonal cut, right shoulder -> left hip, right foot steps in
#   2  f23-44  hit f34   rising cut from where 1 ended (low left -> high right): the two make an X
#   3  f45-70  hit f58   wide horizontal cut right -> left at waist / chest height, pivot on the feet (no full turn)
#   4  f71-94  hit f83   sword pulled to the right hip, front foot steps, short straight thrust (pelvis + chest go forward)
#   5  f95-130 hit f116  sword raised over the right shoulder (longer wind-up), heavy diagonal cut down, weight on the
#                        front foot; f131-150 absorb the weight and return to the guard
# Legs: step = [left, right] foot position (m forward of the idle footprint) in the ACTION-START space, adv = how far the
# root has travelled forward in that space (root motion: js/actors.js moves the actor by d(adv), model.js plants the feet
# at step - adv relative to the body, so a planted foot never slides); lift = [left, right] ankle lift (m) - a foot only
# moves while it is in the air. combo_1..combo_5 = the five strikes cut out of the timeline (entry pose = where the
# previous strike ended, times and positions re-based), each followed by its own recovery to the guard so it can also be
# played alone. Extra fields: hitT (impact, s), lock (= Chain_Open: input before this is buffered), chainClose (s; later
# than this the next press starts again from strike 1), atk = per-strike {coef, r, ang} multipliers of the job's basic
# attack (1-4 lighter, 5 heavier; ~same damage per second as the old 2-swing alternation), mark = the frame markers.
CF = 60.0
def F(n): return round(n / CF, 4)
GUARD = dict(hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18])
def ck(t, e, adv, step, lift=(0, 0), **kw):
    return key(t, e, adv=adv, step=[round(step[0], 3), round(step[1], 3)], lift=[lift[0], lift[1]], **kw)
FD, BR, HZ = ST['fd'], ST['br'], ST['hz']
def PZ(d, **kw): o = dict(d); o.update(kw); return o
C5 = [  # (t, ease, adv, step [L, R], lift [L, R], pose)
    (0.0,     None, 0.00, [0.00, 0.00], [0, 0],    PZ(GUARD, sink=0.05)),
    # 1 diagonal down: right foot lifts and plants 0.18 forward while the shoulders coil back
    (F(5),    'o',  0.02, [0.00, 0.07], [0, 0.07], PZ(FD['cock'], sink=0.07)),
    (F(10),   'i',  0.07, [0.00, 0.18], [0, 0.0],  PZ(FD['mid'])),
    (F(12),   None, 0.08, [0.00, 0.18], [0, 0],    PZ(FD['hit'])),
    (F(15),   'o',  0.09, [0.00, 0.18], [0, 0],    PZ(FD['fol'])),
    (F(22),   's',  0.09, [0.00, 0.18], [0, 0],    dict(twist=30, lean=10, sink=0.10, hand=[70, -30, 0.80], blade=[115, -32], elbow=[0.0, -1, 0.4], armL=[10, 40])),
    # 2 rising: no rewind - the blade leaves from the low left; the legs push up into the cut
    (F(29),   'o',  0.09, [0.00, 0.18], [0, 0],    PZ(BR['cock'], sink=0.12)),
    (F(32.5), 'i',  0.10, [0.00, 0.18], [0, 0],    PZ(BR['mid'], sink=0.09)),
    (F(34),   None, 0.10, [0.00, 0.18], [0, 0],    PZ(BR['hit'], sink=0.05)),
    (F(37),   'o',  0.10, [0.00, 0.18], [0, 0],    PZ(BR['fol'], sink=0.05)),
    (F(44),   's',  0.10, [0.00, 0.18], [0, 0],    dict(twist=-38, lean=2, sink=0.09, hand=[-104, 18, 0.84], blade=[-140, 14], elbow=[-0.5, -0.6, -0.8], armL=[32, 30])),
    # 3 wide horizontal: chest-height sweep, pivoting on both planted feet (twist -46 -> +44, never the back to the enemy)
    (F(52),   'o',  0.10, [0.00, 0.18], [0, 0],    PZ(HZ['cock'])),
    (F(56),   'i',  0.11, [0.00, 0.18], [0, 0],    PZ(HZ['mid'])),
    (F(58),   None, 0.11, [0.00, 0.18], [0, 0],    PZ(HZ['hit'])),
    (F(62),   'o',  0.11, [0.00, 0.18], [0, 0],    PZ(HZ['fol'])),
    (F(70),   's',  0.11, [0.00, 0.18], [0, 0],    dict(twist=24, lean=4, sink=0.12, hand=[20, -24, 0.66], blade=[40, -6], elbow=[-0.2, -1, -0.2], armL=[18, 34])),
    # 4 thrust: elbow folds, sword to the right hip with the point forward; the back leg drives, the front (left) foot
    # steps 0.22 and the pelvis follows (adv), arm and blade go straight out, then hold
    (F(76),   's',  0.11, [0.00, 0.18], [0, 0],    dict(twist=-40, lean=-2, sink=0.16, hand=[-78, -22, 0.52], blade=[-8, -2], elbow=[-0.5, -0.2, -1], armL=[40, 46])),
    (F(80),   's',  0.13, [0.08, 0.18], [0.06, 0], dict(twist=-44, lean=0, sink=0.18, hand=[-82, -24, 0.48], blade=[-6, -2], elbow=[-0.5, -0.2, -1], armL=[44, 48], squint=True)),
    (F(82),   'i',  0.18, [0.22, 0.18], [0.025, 0], dict(twist=-14, lean=10, sink=0.20, hand=[-36, -10, 0.84], blade=[-2, -4], elbow=[-0.6, -0.5, -0.6], armL=[24, 40], squint=True)),
    (F(83),   None, 0.20, [0.22, 0.18], [0, 0],    dict(twist=14, lean=20, sink=0.22, hand=[-6, -4, 1.02], blade=[0, -6], elbow=[-0.5, -0.8, -0.2], armL=[8, 52], squint=True)),
    (F(88),   'o',  0.21, [0.22, 0.18], [0, 0],    dict(twist=16, lean=22, sink=0.23, hand=[-4, -6, 1.03], blade=[0, -8], elbow=[-0.5, -0.8, -0.2], armL=[6, 54])),
    (F(94),   's',  0.21, [0.22, 0.18], [0, 0],    dict(twist=4, lean=12, sink=0.18, hand=[-40, 10, 0.80], blade=[-50, 30], elbow=[-0.6, -0.6, -0.6], armL=[20, 40])),
    # 5 heavy diagonal: pull the point back and lift the sword over the right shoulder, hold the coil, then cut down
    # hard with the weight sinking onto the front foot (blade stops short of the ground)
    (F(103),  'o',  0.21, [0.22, 0.18], [0, 0],    dict(twist=-40, lean=-8, sink=0.08, hand=[-100, 62, 0.80], blade=[-150, 78], elbow=[-0.4, -0.2, -1], armL=[40, 36])),
    (F(111),  's',  0.21, [0.22, 0.18], [0, 0],    dict(twist=-46, lean=-10, sink=0.10, hand=[-108, 66, 0.80], blade=[-158, 80], elbow=[-0.4, -0.2, -1], armL=[44, 38])),
    (F(114),  'i',  0.23, [0.22, 0.18], [0, 0],    dict(twist=-14, lean=8, sink=0.16, hand=[-50, 30, 0.97], blade=[-70, 20], elbow=[-0.6, -0.8, -0.6], armL=[30, 30], squint=True)),
    (F(116),  None, 0.24, [0.22, 0.18], [0, 0],    dict(twist=20, lean=22, sink=0.24, hand=[8, -18, 1.0], blade=[20, -36], elbow=[-0.5, -1, -0.1], armL=[14, 44], squint=True)),
    (F(121),  'o',  0.24, [0.22, 0.18], [0, 0],    dict(twist=30, lean=26, sink=0.28, hand=[46, -38, 0.88], blade=[68, -56], elbow=[-0.1, -1, 0.2], armL=[10, 48])),
    (F(130),  's',  0.24, [0.22, 0.18], [0, 0],    dict(twist=26, lean=20, sink=0.24, hand=[40, -38, 0.86], blade=[62, -52], elbow=[-0.1, -1, 0.2], armL=[12, 42])),
    # recovery: the back foot gathers in, the front foot settles, guard
    (F(138),  's',  0.24, [0.22, 0.24], [0, 0.05], dict(twist=10, lean=8, sink=0.10, hand=[10, -40, 0.78], blade=[30, -12], elbow=[-0.5, -1, -0.1], armL=[12, 26])),
    (F(144),  's',  0.24, [0.24, 0.24], [0.03, 0], PZ(GUARD, sink=0.05)),
    (F(150),  's',  0.24, [0.24, 0.24], [0, 0],    PZ(GUARD)),
]
C5_HIT = [F(12), F(34), F(58), F(83), F(116)]
C5_CUT = [0.0, F(22), F(44), F(70), F(94), F(130)]          # strike sections (start of each strike, end of the 5th)
C5_ATK = [dict(coef=0.8, r=1.0, ang=1.0), dict(coef=0.8, r=1.0, ang=1.0), dict(coef=0.95, r=1.0, ang=1.35),
          dict(coef=0.9, r=1.2, ang=0.55), dict(coef=1.3, r=1.1, ang=1.1)]
TRAIL_C = [1.45, 1.75, 2.15]; TRAIL_C5 = [1.9, 2.15, 2.6]   # white core / pale blue edge (HDR, the bloom whitens the middle)

def c5_keys(t0, t1, TL=None):
    return [x for x in (TL or C5) if t0 - 1e-6 <= x[0] <= t1 + 1e-6]

def c5_mk(x, dt, da):
    t, e, adv, step, lift, pose = x
    return ck(round(t - dt, 4), e, round(adv - da, 3), [step[0] - da, step[1] - da], lift, **pose)

def c5_strike(i, TL=None, name='combo_%d'):
    """combo_<i+1>: the section of strike i, re-based to start at 0 with the root at 0, plus its own recovery
    (TL = another timeline with the SAME times / adv / step / lift, only other upper-body poses: a job variant)"""
    TL = TL or C5
    t0, t1 = C5_CUT[i], C5_CUT[i + 1]; a0 = next(x for x in TL if abs(x[0] - t0) < 1e-6)[2]
    ks = [c5_mk(x, t0, a0) for x in c5_keys(t0, t1, TL)]
    if i == 4: ks += [c5_mk(x, t0, a0) for x in TL if x[0] > t1 + 1e-6]          # the real finish (f131-150)
    else:
        end = ks[-1][1]; ad = end['adv']; T = ks[-1][0]
        L, R = end['step']
        # recovery to the guard: each foot that is off the idle footprint lifts and steps back under the body (one at a
        # time, highest lift in the middle of its move); feet within 2 cm just stay
        mvR, mvL = abs(R - ad) > 0.02, abs(L - ad) > 0.02
        R1, L1 = (ad if mvR else R), (ad if mvL else L)
        mid = dict(twist=8, lean=5, sink=0.06, hand=[10, -40, 0.78], blade=[30, -12], elbow=[-0.5, -1, -0.1], armL=[12, 24])
        ks += [ck(round(T + 0.09, 4), 's', ad, [L, (R + R1) / 2], [0, 0.05 if mvR else 0], **mid),
               ck(round(T + 0.17, 4), 's', ad, [(L + L1) / 2, R1], [0.04 if mvL else 0, 0], **PZ(GUARD, sink=0.04)),
               ck(round(T + 0.25, 4), 's', ad, [L1, R1], [0, 0], **PZ(GUARD, sink=0.02)),
               ck(round(T + 0.32, 4), 's', ad, [L1, R1], [0, 0], **PZ(GUARD))]
    h = C5_HIT[i] - t0
    trail = [[round(h - 0.035, 3), round(h + 0.012, 3)]] if i == 3 else [[round(h - (0.06 if i == 4 else 0.05), 3), round(h + (0.05 if i == 4 else 0.04), 3)]]
    lock = round(t1 - t0 + (0.12 if i == 4 else 0.0), 3)               # 5: a longer recovery before the next round
    a = action(name % (i + 1), ks, round(h, 4), lock, trail, fadeIn=0.05, fadeOut=0.14)
    a.update(hitTimes=[round(h, 4)], chainOpen=round(h + 0.05, 3), chainClose=round(t1 - t0 + 0.30, 3), atk=C5_ATK[i],
             trailColor=TRAIL_C5 if i == 4 else TRAIL_C, trailLife=0.16 if i == 4 else 0.12, trailBase=0.2 if i == 4 else 0.38,
             adv=round(ks[-1][1]['adv'], 3), combo=i + 1,
             mark=dict(Hit=round(h * CF), Chain_Open=round((h + 0.05) * CF), Chain_Close=round((t1 - t0 + 0.30) * CF)))
    assert all(x < y for x, y in zip(a['keys'], a['keys'][1:])), a['keys']
    return a

C5_ACTS = [c5_strike(i) for i in range(5)]
# the whole 150-frame chain in one action (previews, Blender export, tools/browser-tests/combo_film.js)
C5_FULL = action('combo_full', [ck(*x[:5], **x[5]) for x in C5], C5_HIT[0], F(150), [[round(h - 0.05, 3), round(h + 0.045, 3)] for h in C5_HIT], fadeIn=0.05, fadeOut=0.14)
C5_FULL.update(hitTimes=C5_HIT, combo='full', trailColor=TRAIL_C, trailLife=0.12, trailBase=0.38, adv=0.24,
               mark=dict(Hit=[round(h * CF) for h in C5_HIT], Strike=[round(t * CF) + 1 for t in C5_CUT[:5]]))

# ------------------------------------------------------------------------------------------------ job combo variants
# (2026-11-13) 직업별 기본공격 모양: <prefix>_combo_1..5 (js/actors.js JOB_COMBO: blacksmith -> 'bs'). The timeline is C5
# itself - SAME key times, hit frames, root travel (adv), foot steps and lifts, so damage timing, attack interval, chain
# windows and root motion are identical - only the upper-body poses change. The game falls back to combo_N when a job
# has no variant. 대장장이 'bs' = a heavy hammer: every wind-up rises (sink down, lean back) and holds a beat, the strike
# accelerates late, the weight drops onto the front foot at the hit (sink / lean up), the follow-through is short and
# heavy (the head stops instead of flying through), the off hand helps on the overhead blows.
BS_POSE = {
    # 1 overhead diagonal smash
    F(5):  dict(twist=-30, lean=-12, sink=0.02, hand=[-62, 70, 0.78], blade=[-168, 74], elbow=[-0.4, 0.2, -1], armL=[60, 34]),
    F(10): dict(twist=-12, lean=6, sink=0.10, hand=[-34, 34, 0.95], blade=[-44, 26], elbow=[-0.6, -0.6, -0.6], armL=[36, 28], squint=True),
    F(12): dict(twist=10, lean=20, sink=0.17, hand=[-6, -18, 1.0], blade=[4, -40], elbow=[-0.5, -1, -0.1], armL=[16, 34], squint=True),
    F(15): dict(twist=14, lean=22, sink=0.19, hand=[4, -28, 0.94], blade=[10, -52], elbow=[-0.5, -1, -0.1], armL=[12, 38]),
    F(22): dict(twist=22, lean=12, sink=0.13, hand=[40, -32, 0.80], blade=[80, -36], elbow=[0.0, -1, 0.4], armL=[10, 36]),
    # 2 rising upper swing: crouch low (anticipation), drive up with the legs
    F(29): dict(twist=36, lean=12, sink=0.18, hand=[66, -40, 0.74], blade=[110, -48], elbow=[0.15, -1, 0.55], armL=[10, 44]),
    F(32.5): dict(twist=10, lean=6, sink=0.11, hand=[22, -8, 0.95], blade=[24, 6], elbow=[-0.3, -1, 0.2], armL=[18, 30], squint=True),
    F(34): dict(twist=-16, lean=0, sink=0.03, hand=[-22, 26, 1.0], blade=[-30, 52], elbow=[-0.6, -0.8, -0.3], armL=[26, 24], squint=True),
    F(37): dict(twist=-28, lean=-4, sink=0.03, hand=[-66, 46, 0.88], blade=[-104, 66], elbow=[-0.6, -0.4, -0.8], armL=[32, 26]),
    F(44): dict(twist=-42, lean=-2, sink=0.09, hand=[-102, 26, 0.84], blade=[-146, 28], elbow=[-0.5, -0.6, -0.8], armL=[34, 30]),
    # 3 heavy horizontal sweep at waist height
    F(52): dict(twist=-52, lean=-4, sink=0.15, hand=[-116, 6, 0.86], blade=[-162, 2], elbow=[-0.5, -0.6, -0.8], armL=[34, 36]),
    F(56): dict(twist=-18, lean=4, sink=0.15, hand=[-50, 2, 0.98], blade=[-62, -2], elbow=[-0.6, -0.8, -0.5], armL=[26, 30], squint=True),
    F(58): dict(twist=22, lean=9, sink=0.17, hand=[8, -2, 1.0], blade=[18, -6], elbow=[-0.5, -1, -0.1], armL=[14, 34], squint=True),
    F(62): dict(twist=40, lean=10, sink=0.17, hand=[58, -8, 0.88], blade=[96, -12], elbow=[-0.1, -1, 0.3], armL=[10, 40]),
    F(70): dict(twist=24, lean=5, sink=0.13, hand=[26, -24, 0.70], blade=[46, -8], elbow=[-0.2, -1, -0.2], armL=[18, 34]),
    # 4 ram the hammer head forward from the hip (same step-in as the thrust)
    F(76): dict(twist=-40, lean=-4, sink=0.17, hand=[-80, -18, 0.52], blade=[-14, 10], elbow=[-0.5, -0.2, -1], armL=[40, 46]),
    F(80): dict(twist=-44, lean=-2, sink=0.19, hand=[-84, -20, 0.48], blade=[-12, 12], elbow=[-0.5, -0.2, -1], armL=[44, 48], squint=True),
    F(82): dict(twist=-14, lean=10, sink=0.21, hand=[-36, -8, 0.84], blade=[-4, 8], elbow=[-0.6, -0.5, -0.6], armL=[24, 40], squint=True),
    F(83): dict(twist=12, lean=20, sink=0.23, hand=[-6, -4, 1.02], blade=[0, 4], elbow=[-0.5, -0.8, -0.2], armL=[8, 52], squint=True),
    F(88): dict(twist=14, lean=21, sink=0.24, hand=[-4, -8, 1.0], blade=[0, -4], elbow=[-0.5, -0.8, -0.2], armL=[6, 54]),
    F(94): dict(twist=2, lean=10, sink=0.18, hand=[-40, 12, 0.80], blade=[-54, 34], elbow=[-0.6, -0.6, -0.6], armL=[20, 40]),
    # 5 big overhead slam: rise and lean back with the hammer high behind the head, hold, then drop the whole body into it
    F(103): dict(twist=-26, lean=-14, sink=0.00, hand=[-58, 80, 0.82], blade=[-170, 84], elbow=[-0.4, 0.3, -1], armL=[70, 34]),
    F(111): dict(twist=-30, lean=-16, sink=0.00, hand=[-60, 84, 0.82], blade=[-174, 88], elbow=[-0.4, 0.3, -1], armL=[76, 34]),
    F(114): dict(twist=-10, lean=10, sink=0.14, hand=[-26, 40, 0.97], blade=[-22, 30], elbow=[-0.6, -0.6, -0.6], armL=[40, 30], squint=True),
    F(116): dict(twist=6, lean=26, sink=0.28, hand=[0, -22, 1.0], blade=[4, -52], elbow=[-0.5, -1, -0.1], armL=[18, 40], squint=True),
    F(121): dict(twist=8, lean=28, sink=0.30, hand=[2, -30, 0.94], blade=[6, -60], elbow=[-0.5, -1, -0.1], armL=[14, 44]),
    F(130): dict(twist=12, lean=22, sink=0.26, hand=[12, -34, 0.88], blade=[18, -56], elbow=[-0.3, -1, 0.0], armL=[12, 40]),
}
BS5 = [(t, e, adv, step, lift, BS_POSE.get(t, pose)) for t, e, adv, step, lift, pose in C5]
assert len(BS_POSE) == sum(1 for x in C5 if x[0] in BS_POSE)
BS_ACTS = [c5_strike(i, BS5, 'bs_combo_%d') for i in range(5)]
for i, a in enumerate(BS_ACTS):   # short, warm, head-only trail (a basic attack: dimmer than the skills)
    a.update(trailColor=[1.25, 1.05, 0.78] if i < 4 else [1.45, 1.2, 0.85], trailLife=0.09 if i < 4 else 0.12, trailBase=0.72, impact='hammer')
    assert a['hitTimes'] == C5_ACTS[i]['hitTimes'] and a['lock'] == C5_ACTS[i]['lock'] and a['chainClose'] == C5_ACTS[i]['chainClose'] and a['adv'] == C5_ACTS[i]['adv']

# ------------------------------------------------------------------------------------------------ draw / sheathe
# (2026-11-11) 무기 꺼내기 / 집어넣기. The weapon rides on the back (js/model.js backMount: grip over the right shoulder,
# blade diagonal to the left hip) while the character is out of combat. Both motions are UPPER-BODY OVERLAYS (model.js
# ModelBody.over): only hand / blade / elbow / ik / toBack (+ twist / lean when standing) are used, on top of idle or the
# walking gait, so the legs never stop. toBack = 1 puts the hand exactly on the back grip (IK target from the mesh), the
# weapon changes holder at grabT / releaseT and glides 0.1 s. ik 0 at both ends = the arm hands back to idle / gait.
#   draw     reach over the right shoulder -> grab (grabT) -> pull up out of the holder -> sweep forward down to guard
#            readyT = from here a swing / skill may take over (the first attack after a fast draw starts from this pose)
#   sheathe  raise the sword -> over the shoulder, tip down behind the back -> let go (releaseT) -> the hand comes down
HANG = dict(hand=[-12, -76, 0.96], blade=[0, -40], elbow=[-0.6, -1, -0.2])            # ~ the idle arm (ik 0 at the ends)
OVER = dict(hand=[-150, 66, 0.52], blade=[100, -60], elbow=[-0.75, 0.55, 0.35], toBack=1.0)   # hand on the back grip
DRAW = action('draw', [
    key(0.00, None, ik=0, plant=0, **HANG),
    key(0.11, 'o', ik=1, plant=0, twist=-10, lean=-2, **OVER),
    key(0.16, 's', ik=1, plant=0, twist=-12, lean=-2, **OVER),
    key(0.26, 'o', ik=1, plant=0, twist=-14, lean=-3, hand=[-72, 64, 0.88], blade=[-140, 72], elbow=[-0.7, 0.1, -0.7], toBack=0.0),
    key(0.36, 's', ik=1, plant=0, twist=-4, hand=[-42, 12, 0.86], blade=[-22, 40], elbow=[-0.7, -1, -0.3]),
    key(0.46, 's', ik=1, plant=0, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2]),
    key(0.58, 's', ik=0, plant=0, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2]),
], 0.0, 0.58, None, fadeIn=0.0, fadeOut=0.0)
DRAW.update(grabT=0.14, readyT=0.27, overlay=True)
SHEATHE = action('sheathe', [
    key(0.00, None, ik=0, plant=0, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2]),
    key(0.12, 'o', ik=1, plant=0, twist=-4, hand=[-42, 18, 0.86], blade=[-24, 46], elbow=[-0.7, -1, -0.3]),
    key(0.25, 's', ik=1, plant=0, twist=-12, lean=-2, hand=[-74, 66, 0.88], blade=[-140, 74], elbow=[-0.7, 0.1, -0.7]),
    key(0.37, 'o', ik=1, plant=0, twist=-12, lean=-2, **OVER),
    key(0.43, 's', ik=1, plant=0, twist=-10, lean=-2, **OVER),
    key(0.54, 'o', ik=0.6, plant=0, twist=-3, hand=[-40, 8, 0.62], blade=[-10, -30], elbow=[-0.6, -1, -0.3]),
    key(0.66, 's', ik=0, plant=0, **HANG),
], 0.0, 0.66, None, fadeIn=0.0, fadeOut=0.0)
SHEATHE.update(releaseT=0.41, overlay=True)

# ------------------------------------------------------------------------------------------------ 약사 1차 (2026-11-11)
# 유봉 휘두르기 (ph1_a3, anim ph_spin): crouch with the pestle held straight out to the right, then two full turns on the
# spot (720 deg, spins) while 5 hits land every 0.13 s (skill data hits=5 gap=0.13 from hitT 0.18); the last turn ends in a
# low heavy sweep that pushes everything away, then recover. The whole body turns, so the feet stay planted (no lunges).
SP_OUT = dict(hand=[-86, 2, 1.0], blade=[-96, -4], elbow=[-0.6, -0.8, -0.4], armL=[46, 54])
PH_SPIN = action('ph_spin', [
    key(0.00, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18]),
    key(0.10, 'o', twist=-40, lean=4, sink=0.16, **SP_OUT),
    key(0.18, 'i', twist=-10, lean=8, sink=0.18, squint=True, **SP_OUT),
    key(0.44, None, twist=-8, lean=8, sink=0.18, squint=True, **SP_OUT),
    key(0.70, 'o', twist=-6, lean=14, sink=0.24, squint=True, **dict(SP_OUT, hand=[-80, -14, 1.02], blade=[-92, -22])),
    key(0.80, 's', twist=18, lean=16, sink=0.24, hand=[30, -30, 0.92], blade=[60, -36], elbow=[-0.3, -1, 0.2], armL=[16, 40], step=[0.24, -0.2]),
    key(1.02, 's', twist=6, lean=6, sink=0.06, hand=[10, -40, 0.78], blade=[30, -12], elbow=[-0.5, -1, -0.1]),
    key(1.16, 's', hand=[-30, -40, 0.70], blade=[-10, 20]),
], 0.18, 0.86, [[0.14, 0.76]], fadeIn=0.06, fadeOut=0.14)
PH_SPIN.update(spins=[[0.12, 0.74, 720]], trailLife=0.18, trailBase=0.1, trailColor=[1.6, 1.35, 0.8], recover=0.3)
# 천근쇄약 (ph1_a6, anim ph_slam): raise the pestle high with both arms (calling the giant golden pestle down from the
# sky), hold, then drive it down at 0.30 s into a deep crouch as the giant one lands on the aim point (skill fx / delay ops)
PH_SLAM = action('ph_slam', [
    key(0.00, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18]),
    key(0.12, 'o', twist=-4, lean=-14, sink=0.06, hand=[-10, 80, 0.86], blade=[-4, 112], elbow=[-0.6, 0.3, -1], armL=[150, 30]),
    key(0.24, 's', twist=-2, lean=-18, sink=0.04, hand=[-8, 86, 0.86], blade=[-2, 118], elbow=[-0.6, 0.3, -1], armL=[160, 34], squint=True),
    key(0.30, None, twist=2, lean=30, sink=0.30, hand=[0, -24, 1.0], blade=[2, -54], elbow=[-0.4, -1, -0.2], armL=[30, 40], squint=True, step=[0.22, -0.18]),
    key(0.40, 'o', twist=4, lean=34, sink=0.34, hand=[4, -34, 0.94], blade=[4, -68], elbow=[-0.4, -1, -0.1], armL=[20, 44], step=[0.22, -0.18]),
    key(0.64, 's', twist=4, lean=24, sink=0.24, hand=[4, -32, 0.92], blade=[4, -60], elbow=[-0.4, -1, -0.1], armL=[16, 40], step=[0.22, -0.18]),
    key(0.86, 's', hand=[-30, -40, 0.70], blade=[-10, 20]),
], 0.30, 0.66, [[0.25, 0.33]], fadeIn=0.06, fadeOut=0.16)
PH_SLAM.update(trailLife=0.16, trailColor=[1.7, 1.4, 0.7])
# 유봉강타 (ph1_a1, anim ph_smash, 2026-11-12): 준비 0.17 s (무릎을 굽히고 상체를 뒤로 젖히며 유봉을 머리 위 뒤로)
# -> 내려찍기 (허리·어깨·팔이 함께, 가장 빠른 구간 끝이 타격) -> 앞으로 실린
# 자세로 잠깐 버팀 -> 부드러운 복귀 (전체 0.55 s 그대로). 발은 제자리(STEP). 칼 잔상은 쓰지 않고(trail 없음) 둔기 궤적은
# js/pharmfx.js swing()이 실제 유봉 끝을 따라 그림. windT / strikeT = 그 이펙트가 읽는 준비 끝 / 타격 시각.
PH_SMASH = action('ph_smash', [
    key(0.00, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18]),
    key(0.12, 'o', twist=-10, lean=-9, sink=0.13, hand=[-16, 66, 0.80], blade=[-10, 96], elbow=[-0.6, 0.2, -1], armL=[64, 30]),
    key(0.20, 's', twist=-14, lean=-16, sink=0.10, hand=[-10, 86, 0.86], blade=[-4, 128], elbow=[-0.6, 0.3, -1], armL=[84, 34], squint=True),
    key(0.275, 'i', twist=-5, lean=2, sink=0.14, hand=[-5, 54, 0.97], blade=[-2, 68], elbow=[-0.5, -0.4, -0.6], armL=[40, 36], squint=True),
    key(0.34, None, twist=6, lean=28, sink=0.28, hand=[0, -24, 1.0], blade=[2, -54], elbow=[-0.4, -1, -0.2], armL=[24, 40], squint=True),
    key(0.42, 'o', twist=8, lean=33, sink=0.32, hand=[2, -34, 0.95], blade=[4, -68], elbow=[-0.4, -1, -0.1], armL=[18, 44], squint=True),
    key(0.55, 's', twist=5, lean=15, sink=0.13, hand=[4, -38, 0.84], blade=[12, -28], elbow=[-0.5, -1, -0.1], armL=[14, 30]),
    key(0.67, 's', hand=[-30, -40, 0.70], blade=[-10, 20]),
], 0.34, 0.50, None, fadeIn=0.05, fadeOut=0.14)
PH_SMASH.update(windT=0.20, strikeT=0.34)
# (2026-11-13 '살짝 천천히 땅을 타격': 준비 0.20 s, 내려찍기 0.14 s — 타격 0.25 -> 0.34 s, 전체 0.55 -> 0.67 s. 더 커진 마력 유봉이 땅에
#  닿는 모습이 보이도록 내려오는 구간을 늘림)

# 약병 투구 (ph1_b1·b2·b4·b6, anim ph_pitch, 2026-11-13): 야구공을 던지듯 뒤에서 앞으로. 왼발을 들어 앞으로 내디디며 상체를 오른쪽
# 뒤로 틀고 오른손(약병)을 어깨 뒤로 젖힘(0.16 s) -> 허리·어깨가 먼저 돌고 팔이 머리 위로 넘어오며(가장 빠른 구간) 0.24 s에 손을 떠남
# (throwT = hitT: js/skillrt.js가 이때 실제 손 위치 handPoint에서 약병을 만듦) -> 팔이 몸 앞을 가로질러 내려가는 마무리 -> 복귀.
# stow: 유봉은 동작 내내 등에 있음(js/model.js: 손에 들고 있었으면 0.1 s에 등으로). 손의 약병은 js/skillrt.js release가 누른 순간부터
# 실제 손(handPoint)에 붙여 그리는 약병 이펙트(js/pharmfx.js proj) — 놓는 순간 그 약병이 그대로 날아감.
PH_PITCH = action('ph_pitch', [
    key(0.00, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18], lift=[0.0, 0.0]),
    key(0.09, 'o', twist=-30, lean=-5, sink=0.02, hand=[-118, 8, 0.72], blade=[-140, 30], elbow=[-0.8, -0.2, -0.7], armL=[72, 14], step=[0.14, 0.0], lift=[0.13, 0.0]),
    key(0.16, 's', twist=-44, lean=-11, sink=0.06, hand=[-152, 34, 0.66], blade=[-170, 62], elbow=[-0.9, 0.25, -0.5], armL=[88, 10], step=[0.36, 0.0], lift=[0.04, 0.0], squint=True),
    key(0.205, 'i', twist=-10, lean=6, sink=0.11, hand=[-66, 78, 0.92], blade=[-60, 80], elbow=[-0.8, 0.5, 0.2], armL=[46, 28], step=[0.40, 0.0], lift=[0.0, 0.0], squint=True),
    key(0.24, None, twist=24, lean=19, sink=0.15, hand=[-8, 40, 1.0], blade=[0, 30], elbow=[-0.6, -0.3, 0.3], armL=[22, 36], step=[0.40, 0.0], lift=[0.0, 0.03], squint=True),
    key(0.31, 'o', twist=44, lean=29, sink=0.19, hand=[42, -34, 0.92], blade=[60, -50], elbow=[-0.2, -1, 0.3], armL=[8, 42], step=[0.40, 0.0], lift=[0.0, 0.07]),
    key(0.44, 's', twist=16, lean=11, sink=0.08, hand=[12, -44, 0.78], blade=[20, -20], elbow=[-0.5, -1, -0.1], armL=[10, 26], step=[0.22, 0.0], lift=[0.05, 0.0]),
    key(0.56, 's', hand=[-30, -40, 0.70], blade=[-10, 20], lift=[0.0, 0.0]),
], 0.24, 0.40, None, fadeIn=0.05, fadeOut=0.14)
PH_PITCH.update(stow=True, throwT=0.24)

# 밀어내기 (ph1_a4, anim ph_sweep, 2026-11-13): 유봉을 오른쪽 뒤로 낮게 당겼다가 땅을 훑듯 가로로 크게 휘두름(오른쪽 -> 왼쪽, 타격 0.26 s).
# 그 순간 앞쪽 부채꼴의 땅이 바깥으로 뒤집히며 흙이 튐(js/pharmfx.js push). 발은 제자리, 잔상은 흙빛으로 짧게.
PH_SWEEP = action('ph_sweep', [
    key(0.00, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18]),
    key(0.11, 'o', twist=-44, lean=3, sink=0.15, hand=[-112, -8, 0.86], blade=[-152, -18], elbow=[-0.5, -0.6, -0.8], armL=[30, 34]),
    key(0.17, 's', twist=-50, lean=4, sink=0.17, hand=[-120, -6, 0.86], blade=[-162, -18], elbow=[-0.5, -0.6, -0.8], armL=[34, 36], squint=True),
    key(0.22, 'i', twist=-14, lean=12, sink=0.21, hand=[-50, -24, 1.0], blade=[-62, -32], elbow=[-0.5, -1, -0.5], armL=[22, 30], squint=True),
    key(0.26, None, twist=16, lean=17, sink=0.23, hand=[10, -28, 1.0], blade=[20, -36], elbow=[-0.4, -1, 0.0], armL=[14, 36], squint=True),
    key(0.33, 'o', twist=48, lean=13, sink=0.19, hand=[84, -12, 0.86], blade=[130, -14], elbow=[0.0, -1, 0.5], armL=[10, 42]),
    key(0.46, 's', twist=18, lean=6, sink=0.08, hand=[22, -38, 0.78], blade=[36, -14], elbow=[-0.5, -1, -0.1], armL=[10, 26]),
    key(0.58, 's', hand=[-30, -40, 0.70], blade=[-10, 20]),
], 0.26, 0.42, [[0.20, 0.32]], fadeIn=0.06, fadeOut=0.16)
PH_SWEEP.update(trailLife=0.14, trailColor=[1.5, 1.2, 0.8], strikeT=0.26)

# ------------------------------------------------------------------------------------------------ 요리사 1차 (2026-11-13)
# 식칼 썰기 (ck1_a1, anim ck_chop): 짧게 들어 올렸다가 도마에 내리치듯 한 번 써는 동작(타격 0.22 s). 연타는 허공의 큰 식칼이
# 대신 함(js/cookfx.js knife) — 캐릭터는 썬 자세로 잠깐 버틴 뒤 돌아옴. 발은 제자리, 칼 잔상은 짧게.
CK_CHOP = action('ck_chop', [
    key(0.00, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18]),
    key(0.10, 'o', twist=-8, lean=-6, sink=0.05, hand=[-14, 58, 0.78], blade=[-8, 104], elbow=[-0.6, 0.2, -1], armL=[30, 34]),
    key(0.15, 's', twist=-10, lean=-8, sink=0.05, hand=[-10, 64, 0.80], blade=[-6, 112], elbow=[-0.6, 0.25, -1], armL=[34, 36], squint=True),
    key(0.19, 'i', twist=-2, lean=4, sink=0.08, hand=[-4, 30, 0.96], blade=[-2, 44], elbow=[-0.5, -0.5, -0.5], armL=[28, 36], squint=True),
    key(0.22, None, twist=4, lean=16, sink=0.14, hand=[0, -16, 1.0], blade=[2, -34], elbow=[-0.4, -1, -0.2], armL=[22, 40], squint=True),
    key(0.28, 'o', twist=5, lean=19, sink=0.16, hand=[2, -24, 0.96], blade=[4, -46], elbow=[-0.4, -1, -0.1], armL=[18, 42], squint=True),
    key(0.40, 's', twist=3, lean=10, sink=0.08, hand=[4, -34, 0.84], blade=[10, -22], elbow=[-0.5, -1, -0.1], armL=[14, 30]),
    key(0.52, 's', hand=[-30, -40, 0.70], blade=[-10, 20]),
], 0.22, 0.36, [[0.17, 0.27]], fadeIn=0.05, fadeOut=0.14)
CK_CHOP.update(trailLife=0.12, trailColor=[1.5, 1.5, 1.45])
# 팬 강타 (ck1_a2, anim ck_pan): 왼손을 높이 들어 하늘의 큰 프라이팬을 부르고(준비) 0.30 s에 두 팔을 내리꽂음 — 그 순간 팬이
# 대상 위에 떨어짐(js/cookfx.js pan). 칼 잔상 없음.
CK_PAN = action('ck_pan', [
    key(0.00, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18]),
    key(0.12, 'o', twist=-4, lean=-12, sink=0.06, hand=[-12, 70, 0.84], blade=[-6, 104], elbow=[-0.6, 0.3, -1], armL=[150, 30]),
    key(0.23, 's', twist=-2, lean=-16, sink=0.04, hand=[-8, 80, 0.86], blade=[-2, 114], elbow=[-0.6, 0.3, -1], armL=[162, 34], squint=True),
    key(0.30, None, twist=2, lean=24, sink=0.24, hand=[0, -22, 1.0], blade=[2, -50], elbow=[-0.4, -1, -0.2], armL=[26, 40], squint=True),
    key(0.38, 'o', twist=4, lean=28, sink=0.27, hand=[4, -32, 0.94], blade=[4, -62], elbow=[-0.4, -1, -0.1], armL=[18, 44]),
    key(0.54, 's', twist=4, lean=14, sink=0.12, hand=[4, -34, 0.88], blade=[8, -30], elbow=[-0.5, -1, -0.1], armL=[14, 34]),
    key(0.68, 's', hand=[-30, -40, 0.70], blade=[-10, 20]),
], 0.30, 0.46, None, fadeIn=0.06, fadeOut=0.16)

# ------------------------------------------------------------------------------------------------ 대장장이 1차 (2026-11-13)
# bs_call (모루 떨구기): 왼손을 높이 들어 하늘의 모루를 부르고 0.34 s에 망치를 내리그음 — 모루는 그 직후 떨어짐(js/smith.js). 잔상 없음.
BS_CALL = action('bs_call', [
    key(0.00, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18]),
    key(0.13, 'o', twist=-6, lean=-12, sink=0.07, hand=[-14, 66, 0.84], blade=[-8, 100], elbow=[-0.6, 0.3, -1], armL=[150, 30]),
    key(0.26, 's', twist=-4, lean=-17, sink=0.05, hand=[-8, 80, 0.88], blade=[-2, 116], elbow=[-0.6, 0.3, -1], armL=[164, 34], squint=True),
    key(0.34, None, twist=3, lean=25, sink=0.25, hand=[0, -22, 1.0], blade=[2, -52], elbow=[-0.4, -1, -0.2], armL=[26, 40], squint=True),
    key(0.42, 'o', twist=4, lean=29, sink=0.28, hand=[4, -32, 0.94], blade=[4, -64], elbow=[-0.4, -1, -0.1], armL=[18, 44]),
    key(0.58, 's', twist=4, lean=14, sink=0.12, hand=[4, -34, 0.88], blade=[8, -30], elbow=[-0.5, -1, -0.1], armL=[14, 34]),
    key(0.72, 's', hand=[-30, -40, 0.70], blade=[-10, 20]),
], 0.34, 0.50, None, fadeIn=0.06, fadeOut=0.16)
# bs_thrust (집게 낚아채기 · 용광로 개방): 몸을 살짝 틀어 당겼다가 0.20 s에 두 팔을 앞으로 쭉 뻗고 잠깐 버팀. 잔상 없음.
BS_THRUST = action('bs_thrust', [
    key(0.00, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18]),
    key(0.09, 'o', twist=-18, lean=-6, sink=0.08, hand=[-50, -6, 0.52], blade=[-6, 10], elbow=[-1, -0.6, -0.5], armL=[20, 30]),
    key(0.14, 's', twist=-22, lean=-8, sink=0.09, hand=[-56, -4, 0.48], blade=[-4, 12], elbow=[-1, -0.6, -0.6], armL=[24, 34], squint=True),
    key(0.20, 'i', twist=10, lean=16, sink=0.13, hand=[-4, 4, 1.0], blade=[0, 6], elbow=[-0.6, -1, -0.1], armL=[78, 20], squint=True),
    key(0.34, 'o', twist=12, lean=19, sink=0.14, hand=[-2, 2, 1.0], blade=[0, 2], elbow=[-0.6, -1, -0.1], armL=[82, 18], squint=True),
    key(0.50, 's', twist=6, lean=9, sink=0.07, hand=[-14, -22, 0.84], blade=[-4, 10], elbow=[-0.6, -1, -0.2], armL=[36, 22]),
    key(0.64, 's', hand=[-30, -40, 0.70], blade=[-10, 20]),
], 0.20, 0.44, None, fadeIn=0.05, fadeOut=0.16)
# bs_slam (불량품 판정 · 보스에게 집게 내려치기): 머리 위로 들었다가 0.25 s에 수직으로 내려찍음 — 준비 0.17 s, 타격 구간 0.08 s.
BS_SLAM = action('bs_slam', [
    key(0.00, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18]),
    key(0.10, 'o', twist=-10, lean=-9, sink=0.12, hand=[-16, 66, 0.80], blade=[-10, 96], elbow=[-0.6, 0.2, -1], armL=[60, 30]),
    key(0.17, 's', twist=-13, lean=-14, sink=0.10, hand=[-10, 84, 0.86], blade=[-4, 124], elbow=[-0.6, 0.3, -1], armL=[80, 34], squint=True),
    key(0.205, 'i', twist=-4, lean=3, sink=0.14, hand=[-5, 52, 0.97], blade=[-2, 66], elbow=[-0.5, -0.4, -0.6], armL=[40, 36], squint=True),
    key(0.25, None, twist=6, lean=26, sink=0.26, hand=[0, -22, 1.0], blade=[2, -50], elbow=[-0.4, -1, -0.2], armL=[24, 40], squint=True),
    key(0.32, 'o', twist=8, lean=31, sink=0.30, hand=[2, -33, 0.95], blade=[4, -66], elbow=[-0.4, -1, -0.1], armL=[18, 44], squint=True),
    key(0.45, 's', twist=5, lean=15, sink=0.13, hand=[4, -38, 0.84], blade=[12, -28], elbow=[-0.5, -1, -0.1], armL=[14, 30]),
    key(0.58, 's', hand=[-30, -40, 0.70], blade=[-10, 20]),
], 0.25, 0.42, [[0.19, 0.30]], fadeIn=0.05, fadeOut=0.14)
BS_SLAM.update(trailLife=0.14, trailColor=[1.9, 1.15, 0.5])
# bs_flurry (백련타): 짧고 날카로운 가로 망치질 세 번(오른쪽에서 왼쪽 0.16 s -> 되받아 0.30 s -> 다시 0.44 s), 이어서 크게 들어 올려(준비 0.20 s)
# 0.78 s에 수직으로 내려찍는 무거운 마무리. 타격 시각 = 스킬 데이터의 hit op 시각(첫 타 hitT, 간격 0.14 s, 마무리 +0.62 s)과 같아야 함.
BS_FLURRY = action('bs_flurry', [
    key(0.00, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18]),
    key(0.09, 'o', twist=-26, lean=-2, sink=0.06, hand=[-96, 8, 0.78], blade=[-138, 16], elbow=[-0.5, -0.6, -1], armL=[26, 28]),
    key(0.16, 'i', twist=14, lean=9, sink=0.08, hand=[8, -2, 1.0], blade=[18, -6], elbow=[-0.5, -1, -0.1], armL=[16, 30], squint=True),
    key(0.22, 'o', twist=28, lean=8, sink=0.08, hand=[62, -8, 0.84], blade=[112, -10], elbow=[0.0, -1, 0.4], armL=[10, 38], squint=True),
    key(0.30, 'i', twist=-12, lean=9, sink=0.08, hand=[-18, 0, 1.0], blade=[-30, 2], elbow=[-0.6, -1, -0.2], armL=[24, 26], squint=True),
    key(0.36, 'o', twist=-28, lean=4, sink=0.07, hand=[-90, 10, 0.82], blade=[-128, 18], elbow=[-0.6, -0.6, -0.9], armL=[30, 26], squint=True),
    key(0.44, 'i', twist=14, lean=10, sink=0.09, hand=[10, -4, 1.0], blade=[20, -8], elbow=[-0.5, -1, -0.1], armL=[16, 30], squint=True),
    key(0.52, 'o', twist=18, lean=4, sink=0.10, hand=[30, 6, 0.80], blade=[52, 20], elbow=[-0.3, -1, 0.1], armL=[20, 34]),
    key(0.66, 's', twist=-12, lean=-16, sink=0.13, hand=[-12, 86, 0.88], blade=[-4, 128], elbow=[-0.6, 0.3, -1], armL=[92, 34], squint=True),
    key(0.72, 's', twist=-13, lean=-18, sink=0.11, hand=[-10, 88, 0.88], blade=[-2, 132], elbow=[-0.6, 0.3, -1], armL=[96, 36], squint=True),
    key(0.75, 'i', twist=-3, lean=4, sink=0.16, hand=[-4, 50, 0.98], blade=[-2, 62], elbow=[-0.5, -0.4, -0.6], armL=[42, 36], squint=True),
    key(0.78, None, twist=7, lean=29, sink=0.29, hand=[0, -24, 1.0], blade=[2, -54], elbow=[-0.4, -1, -0.2], armL=[24, 40], squint=True),
    key(0.86, 'o', twist=9, lean=33, sink=0.32, hand=[2, -34, 0.95], blade=[4, -68], elbow=[-0.4, -1, -0.1], armL=[18, 44], squint=True),
    key(1.00, 's', twist=5, lean=15, sink=0.13, hand=[4, -38, 0.84], blade=[12, -28], elbow=[-0.5, -1, -0.1], armL=[14, 30]),
    key(1.14, 's', hand=[-30, -40, 0.70], blade=[-10, 20]),
], 0.16, 0.96, [[0.11, 0.20], [0.25, 0.34], [0.39, 0.48], [0.735, 0.84]], fadeIn=0.05, fadeOut=0.16)
BS_FLURRY.update(trailLife=0.12, trailColor=[1.9, 1.2, 0.55], hitTimes=[0.16, 0.30, 0.44, 0.78])
# bs_sweep (급랭 담금질): 왼손의 물통을 뒤로 뺐다가 0.22 s에 앞으로 크게 끼얹음. 망치는 옆으로 내려 둠. 잔상 없음.
BS_SWEEP = action('bs_sweep', [
    key(0.00, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18]),
    key(0.10, 'o', twist=24, lean=-4, sink=0.07, hand=[-40, -46, 0.70], blade=[-20, 10], elbow=[-0.8, -1, -0.3], armL=[-30, 46]),
    key(0.16, 's', twist=30, lean=-6, sink=0.08, hand=[-44, -48, 0.68], blade=[-24, 8], elbow=[-0.8, -1, -0.3], armL=[-40, 52], squint=True),
    key(0.22, 'i', twist=-16, lean=14, sink=0.12, hand=[-36, -44, 0.72], blade=[-16, 12], elbow=[-0.8, -1, -0.2], armL=[84, 40], squint=True),
    key(0.32, 'o', twist=-24, lean=17, sink=0.13, hand=[-34, -44, 0.72], blade=[-14, 14], elbow=[-0.8, -1, -0.2], armL=[104, 26], squint=True),
    key(0.46, 's', twist=-10, lean=8, sink=0.06, hand=[-32, -42, 0.70], blade=[-12, 18], elbow=[-0.7, -1, -0.2], armL=[40, 22]),
    key(0.58, 's', hand=[-30, -40, 0.70], blade=[-10, 20]),
], 0.22, 0.40, None, fadeIn=0.05, fadeOut=0.15)
# bs_kick (접이식 철벽 걷어차기): 몸을 뒤로 젖히며 오른발을 앞으로 뻗어 찬다(0.10 s). 발 고정을 풀어(plant 0) 다리가 실제로 나감.
BS_KICK = action('bs_kick', [
    key(0.00, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18]),
    key(0.05, 'o', plant=0, twist=6, lean=-6, sink=0.06, legR=-18, hand=[-40, -30, 0.66], blade=[-20, 30], elbow=[-0.8, -1, -0.3], armL=[20, 26]),
    key(0.10, 'i', plant=0, twist=-8, lean=-15, sink=0.02, legR=62, hand=[-58, -18, 0.70], blade=[-40, 40], elbow=[-0.9, -0.8, -0.4], armL=[34, 34], squint=True),
    key(0.18, 'o', plant=0, twist=-10, lean=-17, sink=0.02, legR=70, hand=[-60, -16, 0.70], blade=[-42, 42], elbow=[-0.9, -0.8, -0.4], armL=[38, 36], squint=True),
    key(0.30, 's', plant=0, twist=-4, lean=-5, sink=0.03, legR=16, hand=[-40, -34, 0.70], blade=[-18, 26], elbow=[-0.8, -1, -0.3], armL=[18, 24]),
    key(0.40, 's', hand=[-30, -40, 0.70], blade=[-10, 20]),
], 0.10, 0.32, None, fadeIn=0.04, fadeOut=0.12)

# ------------------------------------------------------------------------------------------------ 미용사 1차 (2026-11-13)
# 큰 가위(예전의 3배)를 두 손으로 잡고 '싹뚝' 자름: pose.grip2 = 왼손도 가위 고리를 잡음(js/model.js 왼팔 IK), pose.snip = 가위가
# 벌어진 정도(0 닫힘 .. 1 활짝). 기본공격 5단 콤보 hd_combo_1..5는 C5와 똑같은 시간표(타격·연계·전진·발 디딤·배율)에 자세만 바꿈
# — 벌리고 → 내밀고 → 타격 순간에 닫음. 1 가로 싹뚝, 2 올려 자르기, 3 낮고 넓게, 4 길게 찔러 자르기, 5 머리 위에서 크게 내리 자르기.
def HP(az, el, reach, baz, bel, snip, twist=0, lean=0, sink=0.05, sq=False, **kw):
    d = dict(twist=twist, lean=lean, sink=sink, hand=[az, el, reach], blade=[baz, bel], elbow=[-0.7, -1, -0.15], armL=[20, 30], grip2=1, snip=snip, squint=sq); d.update(kw); return d
HD_GUARD = HP(16, -36, 0.60, 6, 14, 0.12, sink=0.03)
HD_POSES = [
    HP(16, -36, 0.60, 6, 14, 0.12, sink=0.05),
    # 1 가로 싹뚝: 가슴 앞에서 벌리며 당겼다가 앞으로 내밀며 닫음
    HP(4, -22, 0.52, -6, 10, 1.0, twist=-16, lean=-4, sink=0.07), HP(10, -16, 0.86, 0, 2, 1.0, twist=-4, lean=6, sink=0.08, sq=True),
    HP(14, -14, 1.0, 2, -2, 0.0, twist=8, lean=13, sink=0.10, sq=True), HP(16, -16, 0.98, 4, -4, 0.0, twist=10, lean=14, sink=0.10), HP(18, -24, 0.80, 8, 4, 0.2, twist=6, lean=8, sink=0.08),
    # 2 올려 자르기: 낮게 벌려 아래에서 위로 들어 올리며 닫음
    HP(22, -48, 0.60, 10, -30, 1.0, twist=14, lean=10, sink=0.14), HP(18, -26, 0.88, 6, 6, 1.0, twist=6, lean=8, sink=0.10, sq=True),
    HP(12, -2, 1.0, 2, 30, 0.0, twist=-6, lean=4, sink=0.05, sq=True), HP(10, 6, 0.96, 0, 40, 0.0, twist=-10, lean=0, sink=0.04), HP(4, -8, 0.78, -8, 26, 0.25, twist=-14, lean=0, sink=0.07),
    # 3 낮고 넓게: 오른쪽으로 크게 틀어 활짝 벌린 뒤 가슴 높이로 쓸며 닫음
    HP(-34, -18, 0.66, -60, 0, 1.0, twist=-40, lean=-2, sink=0.12), HP(-6, -18, 0.92, -22, -2, 1.0, twist=-12, lean=6, sink=0.12, sq=True),
    HP(18, -18, 1.0, 10, -4, 0.0, twist=22, lean=12, sink=0.12, sq=True), HP(30, -20, 0.94, 30, -6, 0.0, twist=34, lean=12, sink=0.12), HP(22, -26, 0.74, 18, 2, 0.2, twist=20, lean=6, sink=0.12),
    # 4 길게 찔러 자르기: 허리로 당겨 모았다가 발을 내디디며 곧게 뻗고 끝에서 닫음
    HP(6, -30, 0.44, 0, 0, 0.55, twist=-30, lean=-2, sink=0.16), HP(4, -30, 0.40, 0, 0, 1.0, twist=-36, lean=0, sink=0.18, sq=True),
    HP(10, -18, 0.84, 0, -2, 1.0, twist=-10, lean=10, sink=0.20, sq=True), HP(14, -10, 1.03, 0, -4, 0.0, twist=12, lean=20, sink=0.22, sq=True),
    HP(14, -12, 1.03, 0, -6, 0.0, twist=14, lean=22, sink=0.23), HP(10, -10, 0.80, -4, 30, 0.3, twist=2, lean=10, sink=0.18),
    # 5 크게 내리 자르기: 머리 위로 들어 활짝 벌리고 버텼다가 무게를 실어 내리며 닫음
    HP(6, 50, 0.80, 0, 78, 0.9, twist=-14, lean=-10, sink=0.08), HP(4, 58, 0.84, 0, 86, 1.0, twist=-18, lean=-14, sink=0.10),
    HP(10, 22, 0.98, 2, 30, 1.0, twist=-4, lean=8, sink=0.16, sq=True), HP(14, -22, 1.0, 4, -30, 0.0, twist=10, lean=24, sink=0.25, sq=True),
    HP(16, -32, 0.94, 6, -44, 0.0, twist=14, lean=28, sink=0.28), HP(16, -32, 0.90, 6, -40, 0.0, twist=12, lean=22, sink=0.24),
    # recovery
    HP(16, -36, 0.74, 8, -6, 0.1, twist=6, lean=8, sink=0.10), HP(16, -36, 0.62, 6, 10, 0.12, sink=0.05), HP(16, -36, 0.60, 6, 14, 0.12, sink=0.0),
]
assert len(HD_POSES) == len(C5), (len(HD_POSES), len(C5))
HD5 = [(x[0], x[1], x[2], x[3], x[4], HD_POSES[i]) for i, x in enumerate(C5)]
def hd_mk(x, dt, da):
    t, e, adv, step, lift, pose = x
    return ck(round(t - dt, 4), e, round(adv - da, 3), [step[0] - da, step[1] - da], lift, **pose)
def hd_strike(i):
    """hd_combo_<i+1>: same cut / hit / lock / chain / atk numbers as combo_<i+1> (c5_strike), two-hand shears poses"""
    t0, t1 = C5_CUT[i], C5_CUT[i + 1]; a0 = next(x for x in HD5 if abs(x[0] - t0) < 1e-6)[2]
    ks = [hd_mk(x, t0, a0) for x in HD5 if t0 - 1e-6 <= x[0] <= t1 + 1e-6]
    if i == 4: ks += [hd_mk(x, t0, a0) for x in HD5 if x[0] > t1 + 1e-6]
    else:
        end = ks[-1][1]; ad = end['adv']; T = ks[-1][0]; L, R = end['step']
        mvR, mvL = abs(R - ad) > 0.02, abs(L - ad) > 0.02; R1, L1 = (ad if mvR else R), (ad if mvL else L)
        ks += [ck(round(T + 0.09, 4), 's', ad, [L, (R + R1) / 2], [0, 0.05 if mvR else 0], **PZ(HD_GUARD, sink=0.06, lean=4)),
               ck(round(T + 0.17, 4), 's', ad, [(L + L1) / 2, R1], [0.04 if mvL else 0, 0], **PZ(HD_GUARD, sink=0.04)),
               ck(round(T + 0.25, 4), 's', ad, [L1, R1], [0, 0], **PZ(HD_GUARD, sink=0.02)),
               ck(round(T + 0.32, 4), 's', ad, [L1, R1], [0, 0], **PZ(HD_GUARD))]
    h = C5_HIT[i] - t0; base = C5_ACTS[i]
    a = action('hd_combo_%d' % (i + 1), ks, round(h, 4), base['lock'], None, fadeIn=0.05, fadeOut=0.14)
    a.update(hitTimes=[round(h, 4)], chainOpen=base['chainOpen'], chainClose=base['chainClose'], atk=base['atk'], adv=base['adv'], combo=i + 1, snipFx=dict(n=i + 1, big=i == 4))
    assert all(x < y for x, y in zip(a['keys'], a['keys'][1:])), a['keys']
    return a
HD_ACTS = [hd_strike(i) for i in range(5)]
# 스킬 동작 (타격 시각·잠금은 예전에 쓰던 'attack' 동작과 같음: 0.25 s / 0.40 s — 수치 변화 없음)
def hk(t, e=None, **kw): return key(t, e, **kw)
# hd_snip: 한 번 크게 '싹뚝' (가위 연격·끝단 자르기) — 벌려 당김 0.15 s → 내밀며 0.25 s에 닫음 → 버팀 → 복귀
HD_SNIP = action('hd_snip', [
    hk(0.00, **HD_GUARD),
    hk(0.11, 'o', **HP(4, -18, 0.50, -4, 14, 1.0, twist=-18, lean=-6, sink=0.07)),
    hk(0.16, 's', **HP(2, -16, 0.48, -6, 16, 1.0, twist=-22, lean=-8, sink=0.08, sq=True)),
    hk(0.225, 'i', **HP(10, -14, 0.90, 0, 2, 1.0, twist=-2, lean=8, sink=0.09, sq=True)),
    hk(0.25, None, **HP(14, -12, 1.0, 2, -2, 0.0, twist=10, lean=15, sink=0.11, sq=True)),
    hk(0.33, 'o', **HP(16, -14, 0.98, 4, -4, 0.0, twist=12, lean=16, sink=0.11)),
    hk(0.44, 's', **HP(16, -30, 0.74, 6, 6, 0.1, twist=6, lean=6, sink=0.06)),
    hk(0.55, 's', **HD_GUARD),
], 0.25, 0.40, None, fadeIn=0.07, fadeOut=0.16)
# hd_trim: 앞머리 정리 — 오른쪽으로 틀어 활짝 벌리고 이마 높이로 가로로 쓸며 닫음(0.25 s)
HD_TRIM = action('hd_trim', [
    hk(0.00, **HD_GUARD),
    hk(0.12, 'o', **HP(-36, -6, 0.68, -64, 8, 1.0, twist=-42, lean=-2, sink=0.10)),
    hk(0.17, 's', **HP(-40, -4, 0.66, -70, 8, 1.0, twist=-46, lean=-3, sink=0.11, sq=True)),
    hk(0.225, 'i', **HP(-6, -6, 0.94, -22, 4, 0.9, twist=-12, lean=6, sink=0.11, sq=True)),
    hk(0.25, None, **HP(18, -8, 1.0, 12, 2, 0.0, twist=22, lean=12, sink=0.12, sq=True)),
    hk(0.33, 'o', **HP(32, -10, 0.94, 34, 0, 0.0, twist=36, lean=12, sink=0.12)),
    hk(0.44, 's', **HP(22, -28, 0.76, 18, 4, 0.1, twist=16, lean=6, sink=0.07)),
    hk(0.55, 's', **HD_GUARD),
], 0.25, 0.40, None, fadeIn=0.07, fadeOut=0.16)

SKILL_ACTS = COMBOS + [dict(COMBOS[0], name='nv_yeon'), IL, BI, ROLL] + C5_ACTS + [C5_FULL] + BS_ACTS + [DRAW, SHEATHE, PH_SPIN, PH_SLAM, PH_SMASH, PH_PITCH, PH_SWEEP, CK_CHOP, CK_PAN, BS_CALL, BS_THRUST, BS_SLAM, BS_FLURRY, BS_SWEEP, BS_KICK] + HD_ACTS + [HD_SNIP, HD_TRIM]   # nv_yeon = the 2-hit flurry (fallback name in the skill data)

acts = json.load(open(P))
names = {'attack', 'attack2'} | {x['name'] for x in SKILL_ACTS}
acts = [a for a in acts if a['name'] not in names and not a['name'].startswith('nv_yeon_')]
i = next(i for i, a in enumerate(acts) if a['name'] == 'walk') + 1
acts[i:i] = [A, B]
acts += SKILL_ACTS
raw = open(P).read()
json.dump(acts, open(P, 'w'), ensure_ascii=False, indent=1 if raw.startswith('[\n ') else None)
print('wrote', [a['name'] for a in acts])
