"""디자이너 2차 스킬 효과음 — Runway eleven_text_to_sound_v2 (2026-11-17 fx2, 이펙트 개편과 함께).

Usage:  python3 tools/audio/designer_runway_sfx.py            표만 출력(예상 크레딧)
        python3 tools/audio/designer_runway_sfx.py --run [이름…]   생성(이어받기: tools/audio/designer_runway_state.json)
        python3 tools/audio/designer_runway_sfx.py --post [이름…]  받은 원본(/tmp/designer_runway/*.raw) 다시 다듬기만
키는 ~/.runway/key(출력·커밋 금지). 가격 1 크레딧/초(최소 1). 직업 예산 150 크레딧(재시도 포함) — 상태 파일의 spent로 막음.
받은 파일은 ffmpeg로 앞뒤 무음 자르기 · loudnorm -16 LUFS · mp3 96k mono → assets/audio/sfx_<이름>.mp3.
예전 합성음(tools/audio/designer_sfx.py) 14개(규칙 js/designer.js 가 내는 소리)는 같은 이름으로 덮어씀.
새 이름(ds_sparkle/ds_sigil/ds_jewel/ds_mannequin/ds_flashbulb)은 js/designerfx.js가 그림 순간에 덧붙임(js/sfx.js 등록, 음량 js/io.js).
출처 assets/audio/designer-sfx-credits.json (runway 항목).
"""
import json, os, subprocess, sys, time, urllib.request, urllib.error
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'audio'); STATE = os.path.join(ROOT, 'tools', 'audio', 'designer_runway_state.json'); TMP = '/tmp/designer_runway'
API = 'https://api.dev.runwayml.com/v1'; BUDGET = 150
TAIL = ', bright magical fantasy RPG skill sound effect, clean, short, no music, no voice'
# 이름 -> (길이 s, 프롬프트, 쓰는 곳)
SFX = {
    'ds_snip_open':   (0.5, 'large ornate golden tailor scissors opening with a smooth metallic slide and a tiny shimmering sparkle' + TAIL, '가위 벌림(패턴 브레이크 직전)'),
    'ds_snip':        (0.6, 'big magical tailor scissors snapping shut, crisp sharp metal snip with a bright crystal chime and a quick fabric tear' + TAIL, '가위 닫힘(패턴 브레이크·크로스 1타·분신)'),
    'ds_snip_silver': (0.7, 'giant silver scissors slicing shut with a high ringing metallic schwing and a sparkling glass shimmer tail' + TAIL, '크로스 커팅 2타'),
    'ds_needle':      (0.4, 'tiny golden sewing needle piercing through cloth with a small bright metallic ting' + TAIL, '바늘 관통(스티치)·리스티치'),
    'ds_thread':      (0.8, 'magical golden thread pulled tight with a stretching zip and a twinkling harp pluck at the end' + TAIL, '실 당김·매듭·마네킹 조립'),
    'ds_pin':         (0.5, 'jeweled pins snapping into place, quick crisp metallic clicks with a sparkling gem chime' + TAIL, '실크 드레이핑 핀 고정'),
    'ds_silk':        (0.8, 'long silk fabric flying through the air, soft swooshing flutter of satin with a light magical shimmer' + TAIL, '실크 드레이핑 던짐'),
    'ds_silk_hit':    (0.4, 'quick soft slap of silk ribbon striking, short swish with a light sparkle' + TAIL, '실크 로드 명중'),
    'ds_cloth':       (0.6, 'satin cloth whipping and fluttering in a short burst, fabric snap with a soft whoosh' + TAIL, '리본 채찍·망토 펼침·제작'),
    'ds_ribbon':      (1.0, 'graceful ribbon dance swirling around, airy spinning whoosh of silk ribbons with soft glittering chimes' + TAIL, '실크 로드·피루엣·컬렉션 시작'),
    'ds_whoosh':      (0.5, 'fast elegant dash past the listener, swift fabric whoosh with a tiny sparkle trail' + TAIL, '분신 질주'),
    'ds_spot':        (1.0, 'a magical stage spotlight switching on, bright ascending glass chime with a warm shimmering glow' + TAIL, '뮤즈의 초대·테일러드 퍼펙션'),
    'ds_unfold':      (1.2, 'a large magical sewing pattern paper unfolding in the air, crisp paper rustle with a rising mystical hum' + TAIL, '피날레 도면 펼침'),
    'ds_finale':      (1.4, 'grand finale giant golden scissors slam shut with a powerful metallic crash, then a sparkling magical shimmer burst and glittering tail' + TAIL, '그랑 패턴 피날레·컬렉션 피날레'),
    'ds_sparkle':     (0.6, 'a cute bright magical sparkle pop, twinkling star chimes bursting outward' + TAIL, '명중 별 팡(그림)'),
    'ds_sigil':       (1.0, 'a pastel magic circle forming on the ground, soft rising shimmer hum with gentle bell tones' + TAIL, '궁극기·드레이핑 마법진'),
    'ds_jewel':       (0.7, 'a precious gemstone brooch gleaming, high crystal ting with a sparkling glint' + TAIL, '브로치·보석 장식'),
    'ds_mannequin':   (0.8, 'a wooden tailor mannequin assembling with a soft knock and a magical poof of glitter' + TAIL, '미러 피팅 마네킹 등장'),
    'ds_flashbulb':   (0.8, 'fashion runway camera flashes, a few quick vintage flash bulb pops and shutter clicks with a magical shimmer' + TAIL, '컬렉션 런웨이 피날레'),
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
    p = os.path.join(OUT, 'designer-sfx-credits.json'); c = json.load(open(p))
    c['runway'] = {'provider': 'runway eleven_text_to_sound_v2 (tools/audio/designer_runway_sfx.py)', 'generatedOn': '2026-11-17', 'creditsSpent': s['spent'],
                   'assets': {('sfx_' + n + '.mp3'): {'prompt': v['prompt'], 'duration': v['duration'], 'date': v['date']} for n, v in sorted(s['done'].items())}}
    c['note'] = '디자이너 2차 스킬. 2026-11-17 fx2: 효과음을 Runway eleven_text_to_sound_v2로 새로 만듦(runway 항목). 예전 합성음 14개는 같은 이름으로 덮어씀(합성 스크립트 designer_sfx.py는 대체용으로 남김 — 다시 돌리면 Runway 소리를 덮어쓰니 주의).'
    json.dump(c, open(p, 'w'), indent=1, ensure_ascii=False)
if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--run': run(a[1:] or list(SFX))
    elif a and a[0] == '--post': [print(n, post(n)) for n in (a[1:] or list(load()['done']))]
    else:
        tot = 0
        for n, (d, p, use) in SFX.items(): c = max(1, round(d + 0.4999)); tot += c; print(f'{n:15s} {d:4.1f}s {c:2d}cr  {use}')
        print('합계', tot, '크레딧 (예산', BUDGET, ')', '사용', load()['spent'])
