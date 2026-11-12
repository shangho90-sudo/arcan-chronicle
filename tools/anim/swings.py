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

def c5_keys(t0, t1):
    return [x for x in C5 if t0 - 1e-6 <= x[0] <= t1 + 1e-6]

def c5_mk(x, dt, da):
    t, e, adv, step, lift, pose = x
    return ck(round(t - dt, 4), e, round(adv - da, 3), [step[0] - da, step[1] - da], lift, **pose)

def c5_strike(i):
    """combo_<i+1>: the section of strike i, re-based to start at 0 with the root at 0, plus its own recovery"""
    t0, t1 = C5_CUT[i], C5_CUT[i + 1]; a0 = next(x for x in C5 if abs(x[0] - t0) < 1e-6)[2]
    ks = [c5_mk(x, t0, a0) for x in c5_keys(t0, t1)]
    if i == 4: ks += [c5_mk(x, t0, a0) for x in C5 if x[0] > t1 + 1e-6]          # the real finish (f131-150)
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
    a = action('combo_%d' % (i + 1), ks, round(h, 4), lock, trail, fadeIn=0.05, fadeOut=0.14)
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
# 유봉 내려찍기 (ph1_a1 '유봉강타', anim ph_smash, 2026-11-12): 준비 0.17 s (무릎을 굽히고 상체를 뒤로 젖히며 유봉을 머리 위 뒤로)
# -> 내려찍기 0.08 s (허리·어깨·팔이 함께, 가장 빠른 구간 끝이 타격 0.25 s = 예전 attack 동작과 같은 타격 시각) -> 앞으로 실린
# 자세로 잠깐 버팀 -> 부드러운 복귀 (전체 0.55 s 그대로). 발은 제자리(STEP). 칼 잔상은 쓰지 않고(trail 없음) 둔기 궤적은
# js/pharmfx.js swing()이 실제 유봉 끝을 따라 그림. windT / strikeT = 그 이펙트가 읽는 준비 끝 / 타격 시각.
PH_SMASH = action('ph_smash', [
    key(0.00, hand=[-30, -40, 0.70], blade=[-10, 20], elbow=[-0.7, -1, -0.2], armL=[12, 18]),
    key(0.10, 'o', twist=-10, lean=-9, sink=0.13, hand=[-16, 66, 0.80], blade=[-10, 96], elbow=[-0.6, 0.2, -1], armL=[64, 30]),
    key(0.17, 's', twist=-14, lean=-15, sink=0.11, hand=[-10, 84, 0.86], blade=[-4, 126], elbow=[-0.6, 0.3, -1], armL=[84, 34], squint=True),
    key(0.205, 'i', twist=-4, lean=3, sink=0.14, hand=[-5, 52, 0.97], blade=[-2, 66], elbow=[-0.5, -0.4, -0.6], armL=[40, 36], squint=True),
    key(0.25, None, twist=6, lean=27, sink=0.27, hand=[0, -22, 1.0], blade=[2, -50], elbow=[-0.4, -1, -0.2], armL=[24, 40], squint=True),
    key(0.31, 'o', twist=8, lean=32, sink=0.31, hand=[2, -33, 0.95], blade=[4, -66], elbow=[-0.4, -1, -0.1], armL=[18, 44], squint=True),
    key(0.43, 's', twist=5, lean=15, sink=0.13, hand=[4, -38, 0.84], blade=[12, -28], elbow=[-0.5, -1, -0.1], armL=[14, 30]),
    key(0.55, 's', hand=[-30, -40, 0.70], blade=[-10, 20]),
], 0.25, 0.40, None, fadeIn=0.05, fadeOut=0.14)
PH_SMASH.update(windT=0.17, strikeT=0.25)

SKILL_ACTS = COMBOS + [dict(COMBOS[0], name='nv_yeon'), IL, BI, ROLL] + C5_ACTS + [C5_FULL] + [DRAW, SHEATHE, PH_SPIN, PH_SLAM, PH_SMASH]   # nv_yeon = the 2-hit flurry (fallback name in the skill data)

acts = json.load(open(P))
names = {'attack', 'attack2'} | {x['name'] for x in SKILL_ACTS}
acts = [a for a in acts if a['name'] not in names and not a['name'].startswith('nv_yeon_')]
i = next(i for i, a in enumerate(acts) if a['name'] == 'walk') + 1
acts[i:i] = [A, B]
acts += SKILL_ACTS
raw = open(P).read()
json.dump(acts, open(P, 'w'), ensure_ascii=False, indent=1 if raw.startswith('[\n ') else None)
print('wrote', [a['name'] for a in acts])
