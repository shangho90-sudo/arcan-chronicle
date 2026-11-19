"""화가 2차 스킬 효과음 — Runway sound_effect(eleven_text_to_sound_v2)로 만들기 (2026-11-17 fx2 '더 화려하게', 예전 합성 10개를 같은 이름으로 대체 + 그림용 8개).

Usage:  python3 tools/audio/painter_runway_sfx.py            표(이름·길이·프롬프트·예상 크레딧)만 출력
        python3 tools/audio/painter_runway_sfx.py --run [이름…]   생성(이어받기: tools/audio/pt_runway_state.json — 이미 받은 것은 건너뜀)
        python3 tools/audio/painter_runway_sfx.py --post [이름…]  받은 원본만 다시 다듬기(크레딧 없음)
키는 ~/.runway/key (출력·커밋 금지). 가격 1 크레딧/초(최소 1). 직업 예산 150 크레딧(재시도 포함) — BUDGET 이 넘으면 멈춤.
(최소 길이 0.5 초 — 더 짧으면 400.) Runway 일일 작업 한도(429 'daily task limit')면 바로 멈추고 상태를 남김 — 다음 날 --run 으로 남은 것만.
다듬기(ffmpeg): 앞뒤 무음 자르기 → 끝 페이드 → 음량 맞춤(loudnorm -16 LUFS) → mono 44.1 kHz mp3 96k -> assets/audio/sfx_<이름>.mp3
원본은 저장소 밖 $RAW (기본 /home/claude/painter3d/sfx). 출처 기록 assets/audio/painter-sfx-credits.json. 그 전까지는 tools/audio/painter_sfx.py 합성음.
"""
import json, os, subprocess, sys, time, urllib.request, urllib.error, datetime
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'audio'); RAW = os.environ.get('RAW', '/home/claude/painter3d/sfx'); os.makedirs(RAW, exist_ok=True)
STATE = os.path.join(HERE, 'pt_runway_state.json'); CREDITS = os.path.join(OUT, 'painter-sfx-credits.json')
API = 'https://api.dev.runwayml.com/v1'; BUDGET = 150
TAIL = ', bright fantasy RPG skill sound effect, clean, short, no music, no voice, no speech'
# 이름: (길이 초, 프롬프트, 쓰는 곳)
SOUNDS = {
    'pt_sketch': (0.8, 'quick pencil sketching scratches and paper rustle on a canvas, rising into a soft magical shimmer', '그림 소환물·궁극기 시전(밑그림)'),
    'pt_brush':  (0.6, 'thick wet oil paint brush sweeping hard, juicy heavy paint smear swoosh with a bright sparkle at the end', 'B1 임파스토·기사 베기'),
    'pt_wash':   (1.0, 'magical watercolor wave rushing forward, flowing water surge and splash with a bright glittering shimmer', 'B2 워터컬러·풍경 그리기'),
    'pt_dot':    (0.5, 'tiny bright magical paint dot pop, cute soft plink with a little sparkle', 'B3 점묘 점 터짐'),
    'pt_mix':    (1.0, 'swirling paint mixing gooey squelch blooming into a bright magical chord and sparkle burst', 'B4 팔레트 퓨전·B5 스펙트럼'),
    'pt_ink':    (1.0, 'black ink explosion splash, deep wet splat with a dark magical whoosh burst', 'A5 숨결·B3 마무리·A5 출발'),
    'pt_frame':  (1.2, 'ornate golden picture frame appearing, wooden knock followed by a warm magical golden chime swell', 'C5 만상갤러리'),
    'pt_fold':   (0.6, 'origami paper folding, crisp paper flaps and folds with a light magical sparkle', 'A2 종이학·C2 성벽 접힘'),
    'pt_bolt':   (1.0, 'magical lightning bolt strike, sharp electric crack with a short thunder rumble', 'C3 번개'),
    'pt_bite':   (0.5, 'ink spirit wolf bite snap, quick fierce chomp with a wet ink splat', '흑랑 물기·용 관통'),
    'pt_sigil':  (1.2, 'colourful magic circle appearing on the ground, rising shimmering chime swell with a soft paint swirl', '시전 마법진(그림)'),
    'pt_twinkle':(0.6, 'little cluster of twinkling star sparkles, light magical glitter chime', '잔광 별(그림)'),
    'pt_howl':   (1.2, 'magical ink spirit wolf howl, short fierce animal howl with an ethereal echo', '흑랑 완성(그림)'),
    'pt_roar':   (1.4, 'oriental dragon roar, powerful mystical dragon growl with rushing wind whoosh', 'A5 용 출발(그림)'),
    'pt_flap':   (0.6, 'flock of paper cranes flapping wings, soft fluttering paper whoosh', 'A2 학 날개·급강하(그림)'),
    'pt_clank':  (0.8, 'chubby armored knight stepping out of a painting, metal armor clank with a short heroic magical chime', 'A3 기사 완성(그림)'),
    'pt_splash': (0.6, 'watery paint splash hitting a target, bright liquid splat with tiny droplets', 'B2 파도 명중(그림)'),
    'pt_bloom':  (1.0, 'flowers blooming magically, soft rising sparkling chimes with a gentle petal whoosh', 'C1 꽃의 들판(그림)'),
}

def key(): return open(os.path.expanduser('~/.runway/key')).read().strip()
def call(method, path, body=None):
    r = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                               headers={'Authorization': 'Bearer ' + key(), 'X-Runway-Version': '2024-11-06', 'Content-Type': 'application/json'})
    for k in range(14):   # 429(요청 너무 잦음)은 기다렸다 다시 — 일일 한도는 기다려도 안 풀리니 바로 멈춤
        try:
            with urllib.request.urlopen(r, timeout=120) as f: return json.loads(f.read())
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='replace')[:300] if e.code == 429 else ''
            if e.code == 429 and 'daily' in msg.lower(): raise SystemExit('Runway 일일 작업 한도(429): ' + msg)
            if e.code != 429 or k == 13: raise
            time.sleep(20 + 15 * k)
def load_state(): return json.load(open(STATE)) if os.path.exists(STATE) else {'spent': 0, 'done': {}}
def save_state(s): json.dump(s, open(STATE, 'w'), indent=1, ensure_ascii=False)
def cost(d): return max(1, round(d + 0.4999))

def post(name):
    src = os.path.join(RAW, name + '.mp3'); dst = os.path.join(OUT, 'sfx_' + name + '.mp3'); d = SOUNDS[name][0]
    af = ('silenceremove=start_periods=1:start_threshold=-50dB:start_duration=0.005,areverse,'
          'silenceremove=start_periods=1:start_threshold=-55dB:start_duration=0.02,areverse,'
          f'atrim=0:{d + 0.35:.2f},afade=t=out:st={max(0.05, d + 0.15):.2f}:d=0.2,loudnorm=I=-16:TP=-1.5:LRA=11')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-af', af, '-ac', '1', '-ar', '44100', '-b:a', '96k', dst], check=True)
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst], capture_output=True, text=True).stdout or 0)
    print('  ->', os.path.relpath(dst, ROOT), round(dur, 2), 's', flush=True)

def run(names):
    # 2026-11-19: 한 번에 하나·기다림 한도·성공만 크레딧으로 셈(runway_task.py). 연속 3번 실패나 하루 한도면 멈춤.
    import runway_task as R
    st = load_state(); bal0 = R.balance(); print('잔액', bal0, flush=True)
    def todo(n):
        if n in st['done']: print(n, 'already'); return False
        if st['spent'] + R.cost(SOUNDS[n][0], 'mirelo_sfx_2_0') > BUDGET: print('budget stop', st['spent']); return False
        return True
    def one(n):
        d, prompt, _ = SOUNDS[n]
        ok, t, el, model = R.generate_any(prompt + TAIL, d)
        if not ok: print(n, 'failed', t, flush=True); return False
        fn = os.path.join(RAW, n + '.src'); R.download(t['output'][0], fn)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', fn, os.path.join(RAW, n + '.mp3')], check=True)
        st['spent'] += R.cost(d, model); st['done'][n] = {'task': t['id'], 'duration': d, 'model': model, 'date': datetime.date.today().isoformat()}; save_state(st)
        print(n, 'ok', model, f'{el:.0f}s, spent', st['spent'], flush=True); post(n); return True
    okn, why = R.run_batch(names, todo, one)
    print('이번에', len(okn), '개', '/ 멈춘 까닭:', why, '/ 잔액', bal0, '->', R.balance(), flush=True)
    credits(st)

def credits(st):
    c = {'note': '2026-11-17 fx2: Runway eleven_text_to_sound_v2 로 다시 만듦(예전 합성 10개를 같은 이름으로 대체 + 그림용 8개). 2026-11-19 eleven 이 THROTTLED 로 밀려 같은 프롬프트로 mirelo_sfx_2_0(2 크레딧/초) — 소리마다 model 항목. 아직 못 만든 것은 synthesized 에 — tools/audio/painter_sfx.py 합성음(예전 10개는 --force 일 때만 다시 씀).', 'model': 'runway eleven_text_to_sound_v2', 'tool': 'tools/audio/painter_runway_sfx.py', 'post': 'ffmpeg trim / loudnorm -16 LUFS / mono mp3 96k',
         'spentCredits': st['spent'], 'synthesized': {('sfx_' + n): 'tools/audio/painter_sfx.py 합성(2026-11-17 Runway 일일 작업 한도로 아직 대체 못 함 — --run 으로 이어받으면 대체됨)' for n in SOUNDS if n not in st['done']}, 'sounds': {('sfx_' + n): {'prompt': SOUNDS[n][1] + TAIL, 'duration': SOUNDS[n][0], 'use': SOUNDS[n][2], 'date': v['date'], 'model': 'runway ' + v.get('model', 'eleven_text_to_sound_v2')} for n, v in st['done'].items()}}
    json.dump(c, open(CREDITS, 'w'), indent=1, ensure_ascii=False)

if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--run':
        try: run(a[1:] or list(SOUNDS))
        except SystemExit as e: print(e); credits(load_state())
    elif a and a[0] == '--post':
        for n in a[1:] or list(load_state()['done']): post(n)
    else:
        for n, (d, p, u) in SOUNDS.items(): print(f'{n:12s} {d:4.1f}s  {u}\n   {p}')
        print('예상 크레딧', sum(cost(v[0]) for v in SOUNDS.values()))
