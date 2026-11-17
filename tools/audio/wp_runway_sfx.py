"""양약사 2차 스킬 효과음 — Runway sound_effect(eleven_text_to_sound_v2)로 만들기 (2026-11-16 '화려하게' 개편).

Usage:  python3 tools/audio/wp_runway_sfx.py            표(이름·길이·프롬프트·예상 크레딧)만 출력
        python3 tools/audio/wp_runway_sfx.py --run [이름…]   생성(이어받기: tools/audio/wp_runway_state.json — 이미 받은 것은 건너뜀)
        python3 tools/audio/wp_runway_sfx.py --post [이름…]  받은 원본만 다시 다듬기(크레딧 없음)
키는 ~/.runway/key (출력·커밋 금지). 가격 1 크레딧/초(최소 1). 직업 예산 150 크레딧(재시도 포함) — BUDGET 이 넘으면 멈춤.
다듬기(ffmpeg): 앞뒤 무음 자르기 → 끝 페이드 → 음량 맞춤(loudnorm -16 LUFS) → mono 44.1 kHz mp3 96k -> assets/audio/sfx_<이름>.mp3
원본은 저장소 밖 $RAW (기본 /home/claude/wpharm3d/sfx). 출처 기록 assets/audio/western-pharmacist-sfx-credits.json.
"""
import json, os, subprocess, sys, time, urllib.request, datetime
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'audio'); RAW = os.environ.get('RAW', '/home/claude/wpharm3d/sfx'); os.makedirs(RAW, exist_ok=True)
STATE = os.path.join(HERE, 'wp_runway_state.json'); CREDITS = os.path.join(OUT, 'western-pharmacist-sfx-credits.json')
API = 'https://api.dev.runwayml.com/v1'; BUDGET = 150
TAIL = ', bright fantasy RPG skill sound effect, clean, short, no music, no voice, no speech'
# 이름: (길이 초, 프롬프트, 쓰는 곳)
SOUNDS = {
    'wp_granule':  (0.5, 'tiny glass bead hitting a target with a crisp sparkling tick and a soft fizzy pop', 'A1 과립 명중, B3 이어진 용출'),
    'wp_ring':     (1.0, 'small glass capsule bursting into a fiery red magic ring, quick glassy pop followed by a warm flame whoosh', 'A1 반응 고리, B3 용출 시작'),
    'wp_split':    (0.6, 'a magic medicine capsule clicking open in mid air, bright glassy snap with a quick rising sparkle', 'A1 캡슐이 갈라짐(그림)'),
    'wp_crystal':  (1.2, 'ice crystals bursting and shattering with a bright ringing chime, frosty glass sparkle tail', 'A2 결정 폭발, A4 복합 반응'),
    'wp_frost':    (1.0, 'glass ampoule cracking on the ground and frost quickly spreading with crisp icy crackles', 'A2 막이 퍼짐(그림)'),
    'wp_ion':      (0.9, 'sharp blue electric lightning zap piercing straight through, crackling arc with a bright snap', 'A3 이온 관통, A4 전격'),
    'wp_align':    (0.6, 'three small metallic orbs humming and charging with rising electric whine', 'A3 구슬 정렬(그림)'),
    'wp_triad':    (0.7, 'three magic potion orbs swirling into place with a soft magical whoosh and chime', 'A4 셋이 자리 잡음(그림)'),
    'wp_charge':   (1.3, 'magical energy gathering into a glowing core, rising shimmering hum with sparkles converging', 'A5 핵이 모임, B5 표식 흡수(그림)'),
    'wp_collapse': (1.8, 'huge magical impact, deep heavy boom with a big glass crystal explosion and sparkling shards raining down', 'A5·B5 궁극기 주 타격'),
    'wp_catalyst': (1.2, 'golden catalyst activating, three ascending bright chimes with warm magical shimmer', 'B1 촉매 활성화(그림)'),
    'wp_spark':    (0.5, 'single small golden spark chime ping, magical and bright', 'B1 충전 하나 사용(그림)'),
    'wp_carrier':  (0.8, 'a soft glass bubble orb whooshing through the air and latching on with a gentle magical lock click', 'B2 정밀 표적 전달(그림)'),
    'wp_chain':    (0.8, 'bubbling toxic potion splash bursting with a wet glassy pop and fizz', 'B3 연쇄 고리마다(그림)'),
    'wp_spray':    (1.4, 'gentle healing mist spray hiss with soft sparkling chimes, soothing magic', 'C3 생체 회복 분무(그림)'),
    'wp_coat':     (1.0, 'protective glassy magic barrier layers forming, smooth shimmering hum with a crystalline ring', 'C4 다층 코팅막(그림)'),
    'wp_lastrx':   (1.6, 'miraculous golden revival, bright holy chime swell with a glass capsule pop and warm sparkles', 'C5 최종 처방(그림)'),
    'wp_brew':     (1.3, 'alchemy potion brewing, quick bubbling glass flask and a bright completion ding', 'C1·C2 조제 완성(그림)'),
}

def key(): return open(os.path.expanduser('~/.runway/key')).read().strip()
def call(method, path, body=None):
    r = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                               headers={'Authorization': 'Bearer ' + key(), 'X-Runway-Version': '2024-11-06', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(r, timeout=120) as f: return json.loads(f.read())
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
    st = load_state()
    for n in names:
        if n in st['done']: print(n, 'already'); continue
        d, prompt, _ = SOUNDS[n]
        if st['spent'] + cost(d) > BUDGET: print('budget stop', st['spent']); break
        r = call('POST', '/sound_effect', {'model': 'eleven_text_to_sound_v2', 'promptText': prompt + TAIL, 'duration': d})
        st['spent'] += cost(d); save_state(st); tid = r['id']; t0 = time.time()
        while True:
            time.sleep(3); t = call('GET', '/tasks/' + tid)
            if t.get('status') in ('SUCCEEDED', 'FAILED', 'CANCELLED') or time.time() - t0 > 300: break
        if t.get('status') != 'SUCCEEDED': print(n, 'failed', t.get('status'), str(t.get('failure') or '')[:200]); continue
        url = t['output'][0]; ext = '.mp3'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        raw = urllib.request.urlopen(req, timeout=120).read(); fn = os.path.join(RAW, n + '.src')
        open(fn, 'wb').write(raw)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', fn, os.path.join(RAW, n + ext)], check=True)
        st['done'][n] = {'task': tid, 'duration': d, 'date': datetime.date.today().isoformat()}; save_state(st)
        print(n, 'ok', len(raw), 'bytes, spent', st['spent'], flush=True); post(n)
    credits(st)

def credits(st):
    c = {'note': '2026-11-16 Runway eleven_text_to_sound_v2 로 다시 만듦(이전 합성음 5개를 같은 이름으로 대체). 예전 합성 스크립트 tools/audio/wp_sfx.py 는 --force 일 때만 씀.', 'model': 'runway eleven_text_to_sound_v2', 'tool': 'tools/audio/wp_runway_sfx.py', 'post': 'ffmpeg trim / loudnorm -16 LUFS / mono mp3 96k',
         'spentCredits': st['spent'], 'sounds': {('sfx_' + n): {'prompt': SOUNDS[n][1] + TAIL, 'duration': SOUNDS[n][0], 'use': SOUNDS[n][2], 'date': v['date']} for n, v in st['done'].items()}}
    json.dump(c, open(CREDITS, 'w'), indent=1, ensure_ascii=False)

if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--run': run(a[1:] or list(SOUNDS))
    elif a and a[0] == '--post':
        for n in a[1:] or list(load_state()['done']): post(n)
    else:
        for n, (d, p, u) in SOUNDS.items(): print(f'{n:12s} {d:4.1f}s  {u}\n   {p}')
        print('예상 크레딧', sum(cost(v[0]) for v in SOUNDS.values()))
