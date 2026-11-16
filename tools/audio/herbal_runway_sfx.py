"""한약사 2차 스킬 효과음 — Runway eleven_text_to_sound_v2 (2026-11-16 fx2, 이펙트 개편과 함께).

Usage:  python3 tools/audio/herbal_runway_sfx.py            표만 출력(예상 크레딧)
        python3 tools/audio/herbal_runway_sfx.py --run [이름…]   생성(이어받기: tools/audio/herbal_runway_state.json)
        python3 tools/audio/herbal_runway_sfx.py --post [이름…]  받은 원본(/tmp/herbal_runway/*.raw) 다시 다듬기만
키는 ~/.runway/key(출력·커밋 금지). 가격 1 크레딧/초(최소 1). 직업 예산 150 크레딧(재시도 포함) — 상태 파일의 spent로 막음.
받은 파일은 ffmpeg로 앞뒤 무음 자르기 · loudnorm -16 LUFS · mp3 96k mono → assets/audio/sfx_<이름>.mp3.
예전 합성음(tools/audio/herbal_sfx.py) 다섯 개(hb_simmer/root/needle/resonance/bloom)는 같은 이름으로 덮어씀. 나머지는 새 이름(js/sfx.js 등록, 음량 js/io.js).
출처 assets/audio/herbalist-sfx-credits.json.
"""
import json, os, subprocess, sys, time, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'audio'); STATE = os.path.join(ROOT, 'tools', 'audio', 'herbal_runway_state.json'); TMP = '/tmp/herbal_runway'
API = 'https://api.dev.runwayml.com/v1'; BUDGET = 150
TAIL = ', bright fantasy RPG skill sound effect, clean, short, no music, no voice'
# 이름 -> (길이 s, 프롬프트, 쓰는 곳)
SFX = {
    'hb_simmer':    (1.4, 'small clay herbal medicine pot bubbling and simmering, gentle boiling bubbles with a soft steam hiss and a faint magical chime' + TAIL, '백초 훈증진 설치·제작'),
    'hb_root':      (1.0, 'thick magical tree roots bursting up out of the earth, cracking soil, creaking wood stretching, crumbling dirt, green nature magic whoosh' + TAIL, '뿌리 솟음(소환·청룡승근·황정지맥)'),
    'hb_needle':    (0.6, 'several thin golden acupuncture needles whizzing through the air very fast, then a tiny bright metallic ting impact' + TAIL, '백호유침 꽂힘'),
    'hb_resonance': (1.4, 'deep calm qi energy resonance, soft singing bowl hum swelling with a rising mystical shimmer of light' + TAIL, '대주천·금강 약갑·백초귀원 응집'),
    'hb_bloom':     (1.6, 'magical golden flower of light blooming open, bright harp glissando with sparkling chimes, holy healing burst' + TAIL, '백초귀원 흡수·신농백초원'),
    'hb_dragon':    (1.2, 'a friendly azure dragon spirit bursting up from the ground with a short echoing roar, rushing wind and leaves, magical' + TAIL, '청룡 머리'),
    'hb_phoenix':   (1.0, 'small fire bird phoenix launching with a high clear bird cry and a whoosh of crackling flame wings' + TAIL, '주작 날아감'),
    'hb_flameburst':(1.0, 'fiery wings of flame spreading out in a wide burst, whoosh of fire with crackling embers, magical impact' + TAIL, '주작 착탄'),
    'hb_quake':     (1.0, 'golden earth magic, stone pillars rising out of the ground with a heavy rumble and crunch, ending with a warm golden chime' + TAIL, '황정지맥 지맥·돌기둥'),
    'hb_wave':      (1.4, 'a magical low wave of blue water rushing forward and splashing, flowing water whoosh with sparkling droplets' + TAIL, '현무약해 물결'),
    'hb_spore':     (0.8, 'soft poisonous flower releasing a puff of purple spores, airy pop and gentle hiss with a slightly eerie sparkle' + TAIL, '자운화 포자'),
    'hb_stomp':     (0.8, 'a spirit deer stamping its hoof on the ground, wooden thud with a burst of roots and a magical chime' + TAIL, '녹각수호령 발 구르기'),
    'hb_hop':       (0.5, 'a tiny cute bouncy pop as a little plant creature jumps out of the soil, soft boing with leaf rustle' + TAIL, '천년삼 동자 등장·응원'),
    'hb_scroll':    (1.6, 'a huge paper scroll unrolling in the sky with a magical whoosh, rustling parchment and a rising golden shimmer' + TAIL, '신농백초원 두루마리'),
    'hb_armor':     (0.9, 'protective armor of jade bark and leaves forming around a body, wooden creak with crystal clinks and a soft shield hum' + TAIL, '금강 약갑'),
    'hb_drop':      (0.6, 'a single golden healing droplet landing with a soft plip and warm sparkle chime' + TAIL, '천년삼 동자 약방울·훈증진 회복'),
}
def key(): return open(os.path.expanduser('~/.runway/key')).read().strip()
def call(method, path, body=None):
    r = urllib.request.Request(API + path, data=json.dumps(body).encode() if body else None, method=method,
                               headers={'Authorization': 'Bearer ' + key(), 'X-Runway-Version': '2024-11-06', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(r, timeout=120) as f: return json.loads(f.read())
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
    os.makedirs(TMP, exist_ok=True); s = load()
    for n in names:
        if n in s['done'] and os.path.exists(os.path.join(TMP, n + '.raw')): print(n, 'already'); continue
        dur, prompt, _ = SFX[n]; cost = max(1, round(dur + 0.4999))
        if s['spent'] + cost > BUDGET: print('예산 초과 — 멈춤', s['spent']); break
        t = call('POST', '/sound_effect', {'model': 'eleven_text_to_sound_v2', 'promptText': prompt, 'duration': dur}); s['spent'] += cost; save(s)
        for _ in range(90):
            time.sleep(3); st = call('GET', '/tasks/' + t['id'])
            if st.get('status') in ('SUCCEEDED', 'FAILED', 'CANCELLED'): break
        if st.get('status') != 'SUCCEEDED': print(n, 'failed', st.get('status'), str(st.get('failure', ''))[:120]); continue
        req = urllib.request.Request(st['output'][0], headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=120) as f, open(os.path.join(TMP, n + '.raw'), 'wb') as o: o.write(f.read())
        s['done'][n] = {'prompt': prompt, 'duration': dur, 'task': t['id'], 'date': time.strftime('%Y-%m-%d'), 'out': post(n)}; save(s); print(n, 'ok', s['done'][n]['out'], 's', 'spent', s['spent'], flush=True)
    credits(s)
def credits(s):
    p = os.path.join(OUT, 'herbalist-sfx-credits.json'); c = json.load(open(p))
    c['runway'] = {'provider': 'runway eleven_text_to_sound_v2 (tools/audio/herbal_runway_sfx.py)', 'generatedOn': '2026-11-16', 'creditsSpent': s['spent'],
                   'assets': {('sfx_' + n + '.mp3'): {'prompt': v['prompt'], 'duration': v['duration'], 'date': v['date']} for n, v in sorted(s['done'].items())}}
    c['note'] = '한약사 2차 스킬. 2026-11-16 fx2: 효과음을 Runway eleven_text_to_sound_v2로 새로 만듦(runway 항목). 예전 합성음 다섯 개는 같은 이름으로 덮어씀(합성 스크립트 herbal_sfx.py는 대체용으로 남김).'
    json.dump(c, open(p, 'w'), indent=1, ensure_ascii=False)
if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--run': run(a[1:] or list(SFX))
    elif a and a[0] == '--post': [print(n, post(n)) for n in (a[1:] or list(load()['done']))]
    else:
        tot = 0
        for n, (d, p, use) in SFX.items(): c = max(1, round(d + 0.4999)); tot += c; print(f'{n:14s} {d:4.1f}s {c:2d}cr  {use}')
        print('합계', tot, '크레딧 (예산', BUDGET, ')', '사용', load()['spent'])
