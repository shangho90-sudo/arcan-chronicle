"""쉐프 2차 스킬 효과음 — Runway sound_effect(eleven_text_to_sound_v2)로 만들기 (2026-11-17 '화려하게' 개편, 예전 합성 26개를 같은 이름으로 대체 + 그림용 3개).

Usage:  python3 tools/audio/chef_runway_sfx.py            표(이름·길이·프롬프트·예상 크레딧)만 출력
        python3 tools/audio/chef_runway_sfx.py --run [이름…]   생성(이어받기: tools/audio/cf_runway_state.json — 이미 받은 것은 건너뜀)
        python3 tools/audio/chef_runway_sfx.py --post [이름…]  받은 원본만 다시 다듬기(크레딧 없음)
키는 ~/.runway/key (출력·커밋 금지). 가격 1 크레딧/초(최소 1). 직업 예산 150 크레딧(재시도 포함) — BUDGET 이 넘으면 멈춤.
다듬기(ffmpeg): 앞뒤 무음 자르기 → 끝 페이드 → 음량 맞춤(loudnorm -16 LUFS) → mono 44.1 kHz mp3 96k -> assets/audio/sfx_<이름>.mp3
원본은 저장소 밖 $RAW (기본 /home/claude/chef3d/sfx). 출처 기록 assets/audio/chef-sfx-credits.json. 예전 합성 tools/audio/chef_sfx.py 는 --force 일 때만 씀.
"""
import json, os, subprocess, sys, time, urllib.request, urllib.error, datetime
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'audio'); RAW = os.environ.get('RAW', '/home/claude/chef3d/sfx'); os.makedirs(RAW, exist_ok=True)
STATE = os.path.join(HERE, 'cf_runway_state.json'); CREDITS = os.path.join(OUT, 'chef-sfx-credits.json')
API = 'https://api.dev.runwayml.com/v1'; BUDGET = 150
TAIL = ', bright fantasy RPG skill sound effect, clean, short, no music, no voice, no speech'
# 이름: (길이 초, 프롬프트, 쓰는 곳)
SOUNDS = {
    'cf_wok_toss':    (0.6, 'heavy iron wok tossing food, metallic clang with a quick sizzle whoosh of vegetables flipping in the air', 'A1 웍 뒤집기'),
    'cf_sizzle':      (0.8, 'hot wok sizzle burst, oil crackling loudly with a short fiery whoosh', 'A1 1타 불꽃'),
    'cf_flame':       (1.0, 'big flame burst whoosh from a wok, roaring fire puff with crackling embers, magical cooking fire', 'A1 2타·A2 점화 불길·A5 볶음'),
    'cf_splash':      (0.6, 'thick sauce splashing onto the ground, wet liquid splash with a glossy splat', 'A2 소스 줄기'),
    'cf_ignite':      (0.9, 'flambe ignition, alcohol catching fire with a deep whoomp and blue flame rush', 'A2 점화'),
    'cf_steam':       (0.9, 'scalding steam burst explosion, sharp hiss with a puffy pop', 'A2 증기 폭발·B2 열충격'),
    'cf_place':       (0.6, 'heavy copper pot set down on stone with a solid thunk and a metallic ring', 'A3 압력솥 놓기·B4 설탕 벽 놓기'),
    'cf_steam_hiss':  (0.6, 'pressure cooker valve hissing short sharp burst of steam', 'A3 김 뿜기'),
    'cf_pop':         (1.4, 'pressure cooker lid blowing off, big cartoon boom with a metallic lid clang flying away and steam blast', 'A3 폭발'),
    'cf_skewer':      (0.8, 'loud metal skewer piercing through meat, quick stab with a juicy thunk', 'A4 꼬치 관통'),
    'cf_whoosh':      (0.5, 'fast thin object flying through the air, sharp short whoosh', 'A4 꼬치·B1 소르베 날아감'),
    'cf_knife':       (0.5, 'fast chef knife chopping on a cutting board, crisp double thock with a metallic shing', 'A5 손질'),
    'cf_cloche_fall': (0.9, 'giant golden dome falling from the sky, rising magical whoosh with sparkling shimmer', 'A5 클로슈 낙하'),
    'cf_cloche_slam': (1.8, 'huge golden cloche slamming down, massive deep boom with a bright bell ring and sparkling magical shimmer tail', 'A5 마무리'),
    'cf_scoop':       (0.5, 'ice cream scoop scraping frozen sorbet with a soft icy swish and a cute pop', 'B1 소르베 뜨기'),
    'cf_sorbet_hit':  (0.5, 'small frozen sorbet ball hitting and shattering with an icy crunch and a cute sparkle ping', 'B1 명중'),
    'cf_frost_draw':  (0.8, 'frost spreading quickly across a porcelain plate, crisp icy crackle rising', 'B2 서리 선'),
    'cf_frost':       (1.2, 'ice flower crystals bursting open, bright ringing chime with shattering frost sparkle', 'B2 얼음꽃·B5 층 파열'),
    'cf_disc':        (0.8, 'spinning thin pastry disc blade flying, airy whirring whoosh with a light shimmer', 'B3 밀푀유 날아감'),
    'cf_disc_hit':    (0.5, 'thin crispy pastry blade slicing through, quick crunchy slice', 'B3 명중'),
    'cf_disc_catch':  (0.5, 'catching a spinning disc in hand, soft click with a tiny chime', 'B3 받기'),
    'cf_sugar':       (1.0, 'caramel sugar glass forming and hardening, crystalline glassy ring with soft crackles', 'B4 설탕 벽·B5 쌓기'),
    'cf_shatter':     (1.0, 'sugar glass wall shattering, bright candy glass break with tinkling shards', 'B4 파편'),
    'cf_choux_pop':   (0.5, 'cute small cream puff popping, soft bubbly pop with a sweet sparkle', 'B5 슈 쌓임'),
    'cf_serve':       (0.7, 'silver serving tray ding, elegant bright metallic ting with a warm shimmer', 'C2 부용·C1 메뉴'),
    'cf_cloche_open': (1.0, 'silver cloche lid lifting off a dish, soft metallic clink followed by a magical sparkle reveal chime', 'C3·C5 뚜껑 열기'),
    'cf_sigil':       (1.2, 'golden magic circle appearing on the ground, rising shimmering chime swell with soft sparkles', '궁극기 마법진(그림)'),
    'cf_twinkle':     (0.6, 'little cluster of twinkling star sparkles, light magical glitter chime', '잔광 별(그림)'),
    'cf_bless':       (1.4, 'warm holy golden buff, ascending bright chimes with a gentle choir-like shimmer pad, no voice', 'C5 공격력 쟁반·C4 강화 음식(그림)'),
}

def key(): return open(os.path.expanduser('~/.runway/key')).read().strip()
def call(method, path, body=None):
    r = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                               headers={'Authorization': 'Bearer ' + key(), 'X-Runway-Version': '2024-11-06', 'Content-Type': 'application/json'})
    for k in range(14):   # 429(요청 너무 잦음)은 기다렸다 다시
        try:
            with urllib.request.urlopen(r, timeout=120) as f: return json.loads(f.read())
        except urllib.error.HTTPError as e:
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
    c = {'note': '2026-11-17 Runway eleven_text_to_sound_v2 로 다시 만듦(예전 합성 26개를 같은 이름으로 대체 + 그림용 cf_sigil/cf_twinkle/cf_bless). 예전 합성 스크립트 tools/audio/chef_sfx.py 는 --force 일 때만 씀.', 'model': 'runway eleven_text_to_sound_v2', 'tool': 'tools/audio/chef_runway_sfx.py', 'post': 'ffmpeg trim / loudnorm -16 LUFS / mono mp3 96k',
         'spentCredits': st['spent'], 'synthesized': {('sfx_' + n): 'tools/audio/chef_sfx.py 합성(2026-11-17 Runway 일일 작업 한도로 아직 대체 못 함 — --run 으로 이어받으면 대체됨)' for n in SOUNDS if n not in st['done']}, 'sounds': {('sfx_' + n): {'prompt': SOUNDS[n][1] + TAIL, 'duration': SOUNDS[n][0], 'use': SOUNDS[n][2], 'date': v['date']} for n, v in st['done'].items()}}
    json.dump(c, open(CREDITS, 'w'), indent=1, ensure_ascii=False)

if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--run': run(a[1:] or list(SOUNDS))
    elif a and a[0] == '--post':
        for n in a[1:] or list(load_state()['done']): post(n)
    else:
        for n, (d, p, u) in SOUNDS.items(): print(f'{n:12s} {d:4.1f}s  {u}\n   {p}')
        print('예상 크레딧', sum(cost(v[0]) for v in SOUNDS.values()))
