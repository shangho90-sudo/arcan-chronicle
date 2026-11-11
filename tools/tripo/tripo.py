"""Minimal Tripo API v2 client: upload image -> image_to_model -> (prerig check) -> animate_rig -> download GLB."""
import json, os, sys, time, urllib.request, mimetypes, uuid
BASE = 'https://api.tripo3d.ai/v2/openapi'
KEY = open(os.path.expanduser('~/.tripo/key')).read().strip()
H = {'Authorization': 'Bearer ' + KEY, 'User-Agent': 'Mozilla/5.0 (arcan-chronicle asset tool)'}   # Cloudflare refuses Python's default UA (403 / 1010)

def req(method, path, body=None, raw=None, ctype='application/json'):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    r = urllib.request.Request(BASE + path, data=data, method=method, headers={**H, **({'Content-Type': ctype} if data else {})})
    try:
        with urllib.request.urlopen(r, timeout=120) as f: return json.loads(f.read())
    except urllib.error.HTTPError as e:
        return {'http_error': e.code, 'body': e.read().decode()[:800]}

def upload(path):
    b = '----' + uuid.uuid4().hex; fn = os.path.basename(path)
    body = (f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{fn}"\r\nContent-Type: image/png\r\n\r\n').encode() + open(path, 'rb').read() + f'\r\n--{b}--\r\n'.encode()
    r = req('POST', '/upload', raw=body, ctype='multipart/form-data; boundary=' + b)
    return r

def task(body): return req('POST', '/task', body)
def status(tid): return req('GET', '/task/' + tid)
def wait(tid, every=8, limit=1800):
    t0 = time.time()
    while time.time() - t0 < limit:
        s = status(tid); d = s.get('data', {})
        st = d.get('status')
        if st in ('success', 'failed', 'cancelled', 'banned', 'expired', 'unknown'): return s
        time.sleep(every)
    return {'timeout': tid}
def download(url, dst):
    # the data CDN refuses Python's default User-Agent (403)
    r = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (arcan-chronicle asset tool)'})
    with urllib.request.urlopen(r, timeout=600) as f, open(dst, 'wb') as o: o.write(f.read())

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'upload': print(json.dumps(upload(sys.argv[2])))
    elif cmd == 'status': print(json.dumps(status(sys.argv[2]), ensure_ascii=False)[:3000])
    elif cmd == 'balance': print(json.dumps(req('GET', '/user/balance')))
