"""엔지니어 2차 스킬 효과음 — Runway eleven_text_to_sound_v2 (2026-11-17 fx2, 이펙트 개편과 함께).

Usage:  python3 tools/audio/en_runway_sfx.py            표만 출력(예상 크레딧)
        python3 tools/audio/en_runway_sfx.py --run [이름…]   생성(이어받기: tools/audio/en_runway_state.json)
        python3 tools/audio/en_runway_sfx.py --post [이름…]  받은 원본(/tmp/en_runway/*.raw) 다시 다듬기만
키는 ~/.runway/key(출력·커밋 금지). 가격 1 크레딧/초(최소 1). 직업 예산 150 크레딧(재시도 포함) — 상태 파일의 spent로 막음.
받은 파일은 ffmpeg로 앞뒤 무음 자르기 · loudnorm -16 LUFS · mp3 96k mono → assets/audio/sfx_<이름>.mp3.
예전 합성음(tools/audio/en_sfx.py) 13개(en_lock/motor/shot/pile/cannon/missile/pop/charge/rail/zap/weld/exhaust/drop)는 같은 이름으로 덮어씀 —
규칙(js/engineer.js)이 실제 순간에 그대로 냄. 새 이름(en_deploy/assemble/vent/target/whistle/core/alarm/craft)은 js/engfx.js가 그림 순간에 냄
(js/sfx.js 등록, 음량 js/io.js). 출처 assets/audio/engineer-sfx-credits.json.
"""
import json, os, subprocess, sys, time, urllib.request, urllib.error
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'audio'); STATE = os.path.join(ROOT, 'tools', 'audio', 'en_runway_state.json'); TMP = '/tmp/en_runway'
API = 'https://api.dev.runwayml.com/v1'; BUDGET = 150
TAIL = ', fantasy RPG magitech skill sound effect, clean, short, no music, no voice'
# 이름 -> (길이 s, 프롬프트, 쓰는 곳)
SFX = {
    'en_lock':    (0.5, 'small mechanical device locking into place, two crisp metallic clicks and a tiny servo chirp' + TAIL, '설치·잠금·조준 고정'),
    'en_motor':   (0.8, 'small electric servo motor spinning up with a rising whirr and soft gear clatter' + TAIL, '센트리 가동·스파이더 추적·레드라인'),
    'en_shot':    (0.4, 'single small compact magic turret gun shot, short dry punchy pop with a tiny metallic ring, very short' + TAIL, '센트리·드론·기관포 한 발(자주 남)'),
    'en_pile':    (1.0, 'hydraulic piston hiss followed by a massive steel pile driver stake slamming into armor, heavy metallic impact with ringing clang' + TAIL, '파일 벙커 명중'),
    'en_cannon':  (1.2, 'short heavy steampunk cannon blast, deep boom with a wide punchy explosion and a burst of hissing steam' + TAIL, '브리치 캐논·워커 주포·오비탈 중심 포격'),
    'en_missile': (0.7, 'small rocket missile launching from a pod, quick whoosh with a sparkling fizzing thrust' + TAIL, '벌집 미사일·워커 미사일 발사'),
    'en_pop':     (0.6, 'small bright explosion pop with a puff of smoke and tiny metal debris' + TAIL, '미사일·지뢰·정밀 포격 폭발'),
    'en_charge':  (1.0, 'electromagnetic coil capacitor charging up, rising electric whine with crackling sparks' + TAIL, '테슬라 연결·워커 주포 축전'),
    'en_rail':    (1.0, 'powerful railgun firing, sharp high electric zing crack with a thunderous whoosh and blue lightning sizzle' + TAIL, '헬릭스 레일캐논 발사'),
    'en_zap':     (0.5, 'short tesla coil electric zap, crackling blue spark arc' + TAIL, '테슬라 앵커 감전'),
    'en_weld':    (0.8, 'small welding torch sparks sizzling and crackling, repair tool buzz' + TAIL, '리페어 비콘 수리'),
    'en_exhaust': (0.9, 'mechanical steam exhaust vent releasing a strong pressurized hiss puff' + TAIL, '워커 기동·해체·레드라인 냉각'),
    'en_drop':    (1.0, 'heavy glowing power core falling from the sky and slamming into the ground, deep metallic thud with a humming energy ring' + TAIL, '아틀라스 워커 코어 낙하'),
    'en_deploy':  (0.8, 'compact folded metal gadget unfolding quickly, springy hinges snapping open, legs and plates clacking into place' + TAIL, '센트리·스파이더 전개(그림)'),
    'en_assemble':(1.4, 'big robot mech assembling itself, heavy armor plates and legs clanking together in sequence, bolts tightening, hydraulic whirr' + TAIL, '아틀라스 워커 조립(그림)'),
    'en_vent':    (0.7, 'cooling fins snapping open on a machine with a short burst of hot steam and a warning beep' + TAIL, '레드라인 냉각판 열림(그림)'),
    'en_target':  (0.7, 'high tech targeting reticle locking on, quick rising digital beeps ending in a confirm tone' + TAIL, '오비탈 조준 고리 고정(그림)'),
    'en_whistle': (1.2, 'orbital artillery shell falling from the sky, descending whistle with a faint electric hum' + TAIL, '오비탈 낙하 궤적(그림)'),
    'en_core':    (0.6, 'small blue energy core flying into a device, soft magical whoosh ending in a bright chime click' + TAIL, '리커버리 코어 회수(그림)'),
    'en_alarm':   (1.0, 'machine overload alarm, two short urgent red warning beeps with an engine revving up hard' + TAIL, '레드라인 과부하 시작(그림)'),
    'en_craft':   (1.4, 'blueprint magic crafting, metal gun parts sliding and clicking together, a final satisfying lock and sparkling chime' + TAIL, '정밀 병기 제작·모듈 어셈블리(그림)'),
}
def key(): return open(os.path.expanduser('~/.runway/key')).read().strip()
def call(method, path, body=None):
    for i in range(12):   # 다른 직업 작업과 동시에 돌면 429 — 기다렸다 다시(요청이 거절되면 크레딧은 안 씀)
        r = urllib.request.Request(API + path, data=json.dumps(body).encode() if body else None, method=method,
                                   headers={'Authorization': 'Bearer ' + key(), 'X-Runway-Version': '2024-11-06', 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(r, timeout=120) as f: return json.loads(f.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')
            if e.code == 429 and 'daily' in body: raise SystemExit('Runway: 일일 작업 한도(daily task limit) — 내일 다시 --run (이어받기)')   # 2026-11-17 다른 직업 작업과 겹쳐 걸림
            if e.code != 429 or i == 11: raise
            time.sleep(10 + 10 * i)
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
    p = os.path.join(OUT, 'engineer-sfx-credits.json'); c = json.load(open(p))
    c['runway'] = {'provider': 'runway eleven_text_to_sound_v2 (tools/audio/en_runway_sfx.py)', 'generatedOn': '2026-11-17', 'creditsSpent': s['spent'],
                   'assets': {('sfx_' + n + '.mp3'): {'prompt': v['prompt'], 'duration': v['duration'], 'date': v['date']} for n, v in sorted(s['done'].items())}}
    c['note'] = ('엔지니어 2차 스킬. 2026-11-17 fx2: 효과음을 Runway eleven_text_to_sound_v2로 새로 만듦(runway 항목). 예전 합성음 13개는 같은 이름으로 덮어씀'
                 '(합성 스크립트 en_sfx.py는 대체용으로 남김 — 다시 돌리면 Runway 소리를 덮어쓰니 주의).')
    json.dump(c, open(p, 'w'), indent=1, ensure_ascii=False)
if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--run': run(a[1:] or list(SFX))
    elif a and a[0] == '--post': [print(n, post(n)) for n in (a[1:] or list(load()['done']))]
    else:
        tot = 0
        for n, (d, p, use) in SFX.items(): c = max(1, round(d + 0.4999)); tot += c; print(f'{n:14s} {d:4.1f}s {c:2d}cr  {use}')
        print('합계', tot, '크레딧 (예산', BUDGET, ')', '사용', load()['spent'])
