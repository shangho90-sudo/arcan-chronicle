"""Runway sound_effect 작업 하나를 안전하게 돌리는 공용 도우미 (2026-11-19, '나눠서 진행').

- 한 번에 하나만: 이 계정의 eleven_text_to_sound_v2 는 동시 1개·하루 50개(GET /organization 의 tier/usage).
  그래서 작업마다 먼저 하루 남은 수를 보고, 다 쓰면 멈춤(QuotaStop).
- 기다림 한도: THROTTLED/PENDING 으로 WAIT_QUEUE 초(기본 8분), 전체 WAIT_ALL 초(기본 10분)를 넘으면
  DELETE /v1/tasks/<id> 로 취소하고 실패로 돌려줌.
- 크레딧은 SUCCEEDED 일 때만 셈(실패·취소는 청구되지 않음 — 잔액으로 확인).
키는 ~/.runway/key (출력·커밋 금지).
"""
import json, os, sys, time, urllib.request, urllib.error

API = 'https://api.dev.runwayml.com/v1'
MODEL = os.environ.get('RW_MODEL', 'eleven_text_to_sound_v2')   # 대안: mirelo_sfx_2_0 (2 크레딧/초)
PRICE = {'eleven_text_to_sound_v2': 1, 'mirelo_sfx_2_0': 2}
WAIT_QUEUE = float(os.environ.get('WAIT_QUEUE', 480))
WAIT_ALL = float(os.environ.get('WAIT_ALL', 600))


class QuotaStop(Exception):
    pass


def _key():
    return open(os.path.expanduser('~/.runway/key')).read().strip()


def call(method, path, body=None, tries=12):
    for k in range(tries):
        r = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                   headers={'Authorization': 'Bearer ' + _key(), 'X-Runway-Version': '2024-11-06', 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(r, timeout=120) as f:
                txt = f.read()
                return json.loads(txt) if txt else {}
        except urllib.error.HTTPError as e:
            msg = e.read().decode('utf-8', 'replace')
            if 'daily' in msg and 'limit' in msg:
                raise QuotaStop('Runway 하루 작업 한도: ' + msg.strip()[:200])
            if e.code != 429 or k == tries - 1:
                raise RuntimeError(f'HTTP {e.code} {method} {path}: {msg.strip()[:200]}')
            time.sleep(15 + 10 * k)
        except (urllib.error.URLError, TimeoutError) as e:
            if k == tries - 1:
                raise
            time.sleep(10)


def org():
    return call('GET', '/organization')


def balance():
    return org().get('creditBalance')


def quota():
    """(오늘 쓴 수, 하루 한도) — 모르면 (None, None)."""
    o = org()
    lim = o.get('tier', {}).get('models', {}).get(MODEL, {}).get('maxDailyGenerations')
    used = o.get('usage', {}).get('models', {}).get(MODEL, {}).get('dailyGenerations', 0)
    return used, lim


def cost(d, model=None):
    return max(1, round(PRICE.get(model or MODEL, 1) * d + 0.4999))


FLOOR = float(os.environ.get('RW_FLOOR', 0))   # 잔액이 이 아래로 내려가면 멈춤(작업 전체 예산)
_skip = {'n': 0}   # eleven 이 밀려 있으면 몇 개 동안 건너뜀


def generate_any(prompt, duration, log=print):
    """eleven 을 먼저 짧게(QUICK 초) 기다려 보고, 밀려 있으면 취소하고 mirelo_sfx_2_0 으로. (ok, task|사유, 걸린 초, 모델)"""
    global MODEL
    if FLOOR:
        b = balance()
        if b - cost(duration, 'mirelo_sfx_2_0') < FLOOR:
            raise QuotaStop(f'예산 한도 — 잔액 {b}, 바닥 {FLOOR}')
    order = ['eleven_text_to_sound_v2', 'mirelo_sfx_2_0']
    if _skip['n'] > 0:
        _skip['n'] -= 1; order = order[1:]
    why = ''
    for m in order:
        MODEL = m
        quick = m.startswith('eleven') and len(order) > 1
        global WAIT_QUEUE, WAIT_ALL
        wq, wa = WAIT_QUEUE, WAIT_ALL
        if quick:
            WAIT_QUEUE, WAIT_ALL = float(os.environ.get('QUICK', 40)), float(os.environ.get('QUICK', 40)) + 120
        try:
            ok, t, el = generate(prompt, duration, log)
        except QuotaStop as e:
            ok, t, el = False, str(e), 0
            if not m.startswith('eleven'): raise
        finally:
            WAIT_QUEUE, WAIT_ALL = wq, wa
        if ok:
            return True, t, el, m
        why += f'[{m}] {t} '
        if m.startswith('eleven'):
            _skip['n'] = int(os.environ.get('SKIP', 8)); log('  eleven 밀림/실패 →', 'mirelo', f'(다음 {_skip["n"]}개는 mirelo 바로)')
    return False, why, 0, None


def generate(prompt, duration, log=print):
    """작업 하나: 성공이면 (True, task_json, 걸린 초), 실패면 (False, '사유', 걸린 초). 하루 한도면 QuotaStop."""
    used, lim = quota()
    if lim is not None and used >= lim:
        raise QuotaStop(f'Runway 하루 한도 {used}/{lim}')
    body = {'model': MODEL, 'promptText': prompt, 'duration': duration}
    if MODEL.startswith('mirelo'): body.update(format='mp3', numVariants=1)
    r = call('POST', '/sound_effect', body)
    tid = r['id']; log(f'  task {tid} ({duration}s, 오늘 {used}/{lim})'); t0 = time.time(); last = None; queued = 0.0; tq = t0; trail = []
    while True:
        time.sleep(4)
        t = call('GET', '/tasks/' + tid); s = t.get('status'); now = time.time()
        if s != last:
            trail.append(f'{s}@{now - t0:.0f}s'); last = s; log(f'  [{tid[:8]}] {s} @{now - t0:.0f}s')
        if s in ('SUCCEEDED', 'FAILED', 'CANCELLED'):
            break
        if s in ('THROTTLED', 'PENDING'):
            queued += now - tq
        tq = now
        if queued > WAIT_QUEUE or now - t0 > WAIT_ALL:
            try:
                call('DELETE', '/tasks/' + tid, tries=3)
            except Exception as e:
                log('  (취소 실패', str(e)[:80], ')')
            return False, f'시간 초과 → 취소 ({" ".join(trail)})', now - t0
    el = time.time() - t0
    if s != 'SUCCEEDED':
        return False, f'{s} {str(t.get("failure") or "")[:120]} ({" ".join(trail)})', el
    log(f'  상태 {" ".join(trail)}')
    return True, t, el


def download(url, path):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=120) as f, open(path, 'wb') as o:
        o.write(f.read())


def run_batch(names, todo, gen_one, max_fail=3, log=print):
    """names 차례로 gen_one(name) → True/False. 연속 max_fail 번 실패나 하루 한도면 멈춤. 돌려줌: (성공 이름들, 멈춘 사유 또는 None)."""
    okn = []; fails = 0
    for n in names:
        if not todo(n):
            continue
        try:
            ok = gen_one(n)
        except QuotaStop as e:
            return okn, str(e)
        if ok:
            okn.append(n); fails = 0
        else:
            fails += 1
            if fails >= max_fail:
                return okn, f'연속 {fails}번 실패 — 멈춤'
    return okn, None
