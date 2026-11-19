"""음악가 2차 스킬 효과음 — Runway eleven_text_to_sound_v2 (2026-11-17 fx2, 이펙트 개편과 함께).

Usage:  python3 tools/audio/music_runway_sfx.py            표만 출력(예상 크레딧)
        python3 tools/audio/music_runway_sfx.py --run [이름…]   생성(이어받기: tools/audio/music_runway_state.json — 이미 받은 것은 건너뜀)
        python3 tools/audio/music_runway_sfx.py --post [이름…]  받은 원본(/tmp/music_runway/*.raw) 다시 다듬기만
키는 ~/.runway/key(출력·커밋 금지). 가격 1 크레딧/초(최소 1). 직업 예산 150 크레딧(재시도 포함) — 상태 파일의 spent(= 요청한 소리 길이 합)로 막음.
계정 '하루 작업 수 한도'(429 daily task limit)에 걸리면 기다리지 않고 바로 멈춤 — 다음 날 --run 이면 남은 것만 만듦.
받은 파일은 ffmpeg로 앞뒤 무음 자르기 · loudnorm -16 LUFS · mp3 96k mono → assets/audio/sfx_<이름>.mp3.
예전 합성음(tools/audio/music_sfx.py) 21개(규칙 js/musician.js·스킬 데이터가 내는 소리)는 같은 이름으로 덮어씀.
새 이름(mu_sigil/mu_sparkle/mu_staff/mu_phantom)은 js/musicfx.js가 그림 순간에 덧붙임(js/sfx.js 등록, 음량 js/io.js) —
Runway로 만들기 전까지는 music_sfx.py 의 임시 합성음.
출처 assets/audio/musician-sfx-credits.json (runway 항목).
"""
import json, os, subprocess, sys, time, urllib.request, urllib.error
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'audio'); STATE = os.path.join(ROOT, 'tools', 'audio', 'music_runway_state.json'); TMP = '/tmp/music_runway'
API = 'https://api.dev.runwayml.com/v1'; BUDGET = 150
TAIL = ', bright magical fantasy RPG skill sound effect, D major, clean, short, no voice, no background music'
# 이름 -> (길이 s, 프롬프트, 쓰는 곳)
SFX = {
    'mu_pluck':      (0.6, 'a bright golden harp-like string pluck of two notes A and D with a sparkling shimmer' + TAIL, '스트링 피어스 현 튕김'),
    'mu_bow':        (0.5, 'a single quick expressive violin bow stroke, short bright legato note with a soft magical sparkle' + TAIL, '크레셴도 러시 활 한 번'),
    'mu_string':     (0.6, 'a short rapid string tremolo of violins swelling, shimmering magical strings' + TAIL, '현악 파트·코랄 피격'),
    'mu_harp':       (1.0, 'a sparkling magical harp glissando arpeggio rising up' + TAIL, '생명의 아리아·공명 하프'),
    'mu_harp_tick':  (0.4, 'a single soft gentle harp note with a tiny healing chime' + TAIL, '아리아 회복 틱'),
    'mu_cello':      (0.9, 'a deep warm cello bow stroke on a low D note, rich and noble with a soft glow' + TAIL, '수호의 코랄'),
    'mu_note':       (0.4, 'one short ghostly ethereal plucked note, soft and airy with a faint echo' + TAIL, '팬텀 트리오 연주자 한 음'),
    'mu_cymbal':     (0.8, 'a crisp bright cymbal crash with a short punchy shockwave thump' + TAIL, '디스코드 브레이크·타악 파트'),
    'mu_burst':      (1.0, 'a resonant membrane bursting with a deep drum boom and a golden bell shimmer tail' + TAIL, '레조넌스 버스트 파열'),
    'mu_horn':       (0.7, 'a short heroic brass horn call of two notes, bright fanfare blast' + TAIL, '관악 파트·나팔'),
    'mu_fanfare':    (1.0, 'a triumphant short trumpet fanfare of three rising notes, marching heroic brass' + TAIL, '영웅의 행진 시작'),
    'mu_flute':      (0.8, 'a light dreamy flute melody of two notes under moonlight, airy and soft with sparkles' + TAIL, '월광 세레나데'),
    'mu_flute_tick': (0.4, 'a single soft breathy flute note, gentle and calm' + TAIL, '세레나데 기력 틱'),
    'mu_wave_hit':   (0.4, 'a bright crystalline ting impact of a magical sound wave hitting, short ringing chime' + TAIL, '음파 적중'),
    'mu_chord':      (1.0, 'a big full orchestra D major chord hit, strings brass and timpani together, powerful and bright with a shimmering tail' + TAIL, '합주·크레셴도 마무리'),
    'mu_tune':       (0.6, 'two rising tuning notes on a violin A string with a soft magical glint' + TAIL, '선율 조율'),
    'mu_echo':       (0.8, 'two soft reverberating notes echoing in a large hall, ghostly repeat' + TAIL, '에코 리프라이즈'),
    'mu_trio':       (0.8, 'a short sweet chamber trio chord of violin cello and flute playing together' + TAIL, '팬텀 트리오 합주'),
    'mu_coda':       (1.4, 'an ominous dramatic descending brass motif of three notes with timpani rolls, epic finale beginning' + TAIL, '파멸의 코다 시작'),
    'mu_encore':     (1.4, 'a rising heavenly harp arpeggio that blooms into a warm glowing chord, healing and uplifting' + TAIL, '앙코르: 불멸의 선율'),
    'mu_symph':      (1.4, 'a grand orchestral string tremolo swelling upward, starry magical symphony beginning with twinkling bells' + TAIL, '그랜드 심포니 시작'),
    'mu_sigil':      (1.0, 'a magic musical circle forming on the ground, rising glassy shimmer hum with music box bell tones' + TAIL, '마법진(그림)'),
    'mu_sparkle':    (0.6, 'a cute bright sparkle pop of twinkling star chimes and a tiny music box note' + TAIL, '명중 별 팡(그림)'),
    'mu_staff':      (0.8, 'glowing musical notes lighting up one after another, quick ascending glockenspiel twinkles' + TAIL, '코다 악보 음표 점등(그림)'),
    'mu_phantom':    (0.8, 'ghostly phantom musicians materializing, airy whoosh with a soft shimmering choir-like pad, no words' + TAIL, '환영 연주자 등장(그림)'),
}
def key(): return open(os.path.expanduser('~/.runway/key')).read().strip()
def call(method, path, body=None):
    r = urllib.request.Request(API + path, data=json.dumps(body).encode() if body else None, method=method,
                               headers={'Authorization': 'Bearer ' + key(), 'X-Runway-Version': '2024-11-06', 'Content-Type': 'application/json'})
    for k in range(12):   # 같은 계정을 다른 작업도 쓰므로 429면 기다렸다 다시(요청이 받아지지 않았으니 크레딧은 안 씀)
        try:
            with urllib.request.urlopen(r, timeout=120) as f: return json.loads(f.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')
            if 'daily task limit' in body: sys.exit('Runway: 하루 작업 수 한도에 걸림(' + body.strip() + ') — 다음 날 다시 --run (이어받기)')   # 2026-11-17 같은 계정 다른 작업 때문에 걸림
            if e.code != 429 or k == 11: raise
            time.sleep(10 + 10 * k)
def load(): return json.load(open(STATE)) if os.path.exists(STATE) else {'spent': 0, 'done': {}}
def save(s): json.dump(s, open(STATE, 'w'), indent=1, ensure_ascii=False)
def post(name):
    raw = os.path.join(TMP, name + '.raw'); dst = os.path.join(OUT, 'sfx_' + name + '.mp3')
    af = ('silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.01,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,afade=t=in:d=0.03,areverse,'
          'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100,alimiter=limit=0.7:level=false')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-af', af, '-ac', '1', '-ar', '44100', '-b:a', '96k', dst], check=True)
    d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst], capture_output=True, text=True).stdout.strip() or 0)
    return round(d, 2)
def run(names):
    # 2026-11-19: 한 번에 하나·기다림 한도·성공만 크레딧으로 셈(runway_task.py). eleven 이 밀려 있으면 같은 프롬프트로 mirelo_sfx_2_0.
    # 연속 3번 실패·하루 한도·예산(RW_FLOOR 잔액 바닥)이면 멈춤. 받은 것마다 상태 파일에 바로 저장(이어받기).
    import runway_task as R
    os.makedirs(TMP, exist_ok=True); s = load(); bal0 = R.balance(); print('잔액', bal0, flush=True)
    def todo(n):
        if n in s['done'] and os.path.exists(os.path.join(TMP, n + '.raw')): print(n, 'already'); return False
        if s['spent'] + R.cost(SFX[n][0], 'mirelo_sfx_2_0') > BUDGET: print('예산 초과 — 건너뜀', n, s['spent']); return False
        return True
    def one(n):
        dur, prompt, _ = SFX[n]
        ok, t, el, model = R.generate_any(prompt, dur)
        if not ok: print(n, 'failed', t, flush=True); return False
        R.download(t['output'][0], os.path.join(TMP, n + '.raw'))
        s['spent'] += R.cost(dur, model)
        s['done'][n] = {'prompt': prompt, 'duration': dur, 'task': t['id'], 'model': model, 'date': time.strftime('%Y-%m-%d'), 'out': post(n)}; save(s)
        print(n, 'ok', model, s['done'][n]['out'], 's', 'spent', s['spent'], flush=True); return True
    okn, why = R.run_batch(names, todo, one)
    print('이번에', len(okn), '개 / 멈춘 까닭:', why, '/ 잔액', bal0, '->', R.balance(), flush=True)
    credits(s)
def credits(s):
    p = os.path.join(OUT, 'musician-sfx-credits.json'); c = json.load(open(p))
    c['runway'] = {'provider': 'runway eleven_text_to_sound_v2 · 2026-11-19부터 eleven 이 THROTTLED 로 밀리면 같은 프롬프트로 mirelo_sfx_2_0 — 소리마다 model (tools/audio/music_runway_sfx.py)', 'generatedOn': '2026-11-19', 'creditsSpent': s['spent'],
                   'assets': {('sfx_' + n + '.mp3'): {'prompt': v['prompt'], 'duration': v['duration'], 'date': v['date'], 'model': 'runway ' + v.get('model', 'eleven_text_to_sound_v2')} for n, v in sorted(s['done'].items())}}
    c['note'] = '음악가 2차 스킬. 2026-11-17 fx2: 효과음을 Runway eleven_text_to_sound_v2로 새로 만듦(runway 항목, 받은 것만). 받은 소리는 예전 합성음과 같은 이름으로 덮어씀(합성 스크립트 music_sfx.py는 대체용 — 다시 돌리면 Runway 소리를 덮어쓰니 주의).'
    json.dump(c, open(p, 'w'), indent=1, ensure_ascii=False)
if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--run': run(a[1:] or list(SFX))
    elif a and a[0] == '--post': [print(n, post(n)) for n in (a[1:] or list(load()['done']))]
    else:
        tot = 0
        for n, (d, p, use) in SFX.items(): c = max(1, round(d + 0.4999)); tot += c; print(f'{n:14s} {d:4.1f}s {c:2d}cr  {use}')
        print('합계', tot, '크레딧 (예산', BUDGET, ')', '사용', load()['spent'])
