"""한약사 처방 5종(2026-11-20) 스킬 아이콘 + '남은 한 잔' 아이콘 — 사용자가 넣은 금테 원형 메달 그림(2026-11-20 8e67a81)과 같은 모양.

Usage:  python3 tools/ui/herbal_rx_icons.py            표(프롬프트·예상 크레딧)
        python3 tools/ui/herbal_rx_icons.py --run [키…] Runway text_to_image(그림만, 테 없이) -> /home/claude/hbrw_icons/<키>.png (이어받기)
        python3 tools/ui/herbal_rx_icons.py --compose  그림 + 사용자 아이콘의 금테(원본 hb_c3.png 의 반지름 72.5 px 바깥 그대로) -> assets/ui/skills/<id>.png
                                                      + 확인표 /tmp/hbrw/icons_sheet.png
그림 안쪽만 새로 그리고 금테는 사용자 그림의 테를 그대로 씀(다른 한약사 10개 아이콘은 건드리지 않음). 키는 ~/.runway/key(출력하지 않음).
대표 모양: 탕약 나누기 = 두 잔, 남은 한 잔 = 잔 하나, 보중익기탕 = 위로 오르는 금빛 김, 구풍해독탕 = 대상에서 바깥으로 퍼지는 잎,
소경활혈탕 = 붉은 세 마디, 오령산 = 중앙으로 모이는 다섯 물길.
"""
import base64, json, os, sys, time, urllib.request, urllib.error
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
RAW = Path(os.environ.get('RAW', '/home/claude/hbrw_icons')); RAW.mkdir(parents=True, exist_ok=True)
STATE = RAW / 'state.json'
API = 'https://api.dev.runwayml.com'; VERSION = '2024-11-06'
MODEL = os.environ.get('MODEL', 'gpt_image_2_6_sunburst'); RATIO = os.environ.get('RATIO', '1920:1920')
EXTRA = json.loads(os.environ.get('EXTRA', '{"quality":"medium"}'))
STYLE = ("Square painterly fantasy RPG skill icon artwork, rich glowing magical lighting, detailed digital painting like an ornate Korean "
         "fantasy mobile game, saturated jewel colours, dramatic soft rim light, centred subject filling a circular composition, dark "
         "vignette edges. Oriental herbal medicine theme. NO frame, NO border, NO ring, NO text, NO letters, NO watermark.")
ICONS = {
    'hb_a1': 'Two small celadon porcelain tea cups side by side, each filled with glowing amber herbal decoction, a little clay herbal teapot pouring into them, warm golden steam, ginseng slices and red jujubes around.',
    'hb_a1_cup': 'One single small celadon porcelain cup held up, filled with glowing amber herbal decoction, a curl of warm golden steam above it, soft glow, simple and clear.',
    'hb_a2': 'A raised medicinal tea bowl at chest height with thin golden steam spiralling straight upward in tall elegant curls, golden wind swirls, warm amber and gold light.',
    'hb_a3': 'A burst of green leaves and golden herbal mist flying outward in a ring from a glowing centre, amber liquid splash in the middle, a faint protective golden bubble, wind of leaves.',
    'hb_c4': 'A dark ink brush stroke meridian line crossing the frame with exactly three glowing crimson nodes along it, red light flowing through the nodes, the last node bursting brightly, red herbal decoction droplets.',
    'hb_c3': 'Top-down view of five small glowing blue seal stamps arranged in a circle on the ground, five low water channels flowing from them inward and converging into a bright splash at the centre, blue water and herbal powder.',
}
OUT_ID = {k: k for k in ICONS}

def key(): return (Path.home() / '.runway/key').read_text().strip()
def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': 'Bearer ' + key(), 'X-Runway-Version': VERSION, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=90) as r: return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{method} {path}: HTTP {e.code} {e.read()[:400].decode("utf-8", "replace")}')
def ref():
    p = ROOT / 'assets/ui/skills/hb_c2.png'
    return 'data:image/png;base64,' + base64.b64encode(p.read_bytes()).decode()

def run(keys):
    st = json.loads(STATE.read_text()) if STATE.exists() else {}
    b0 = call('GET', '/v1/organization').get('creditBalance'); print('잔액', b0)
    for k in keys:
        if (RAW / f'{k}.png').exists() and not os.environ.get('FORCE'): print(k, '이미 있음'); continue
        tid = st.get(k)
        if not tid:
            body = {'model': MODEL, 'promptText': (STYLE + ' Subject: ' + ICONS[k] + ' Match the painting style of @style (colour richness, glow, brushwork) but not its subject.')[:1000],
                    'ratio': RATIO, 'referenceImages': [{'uri': ref(), 'tag': 'style'}], **EXTRA}
            tid = call('POST', '/v1/text_to_image', body)['id']; st[k] = tid; STATE.write_text(json.dumps(st, indent=1)); print(k, '작업', tid)
        for _ in range(150):
            t = call('GET', f'/v1/tasks/{tid}')
            if t.get('status') == 'SUCCEEDED':
                with urllib.request.urlopen(t['output'][0], timeout=120) as r: (RAW / f'{k}.png').write_bytes(r.read())
                st.pop(k, None); STATE.write_text(json.dumps(st, indent=1)); print(k, '저장'); break
            if t.get('status') in ('FAILED', 'CANCELLED'): print(k, '실패', t.get('failure')); st.pop(k, None); STATE.write_text(json.dumps(st, indent=1)); break
            time.sleep(5)
    print('잔액', call('GET', '/v1/organization').get('creditBalance'), '(시작', b0, ')')

def compose():
    from PIL import Image, ImageDraw, ImageFilter
    import numpy as np
    frame = Image.open(ROOT / 'assets/ui/skills/hb_c2.png').convert('RGBA')   # 사용자 금테(바깥 고리)만 씀
    W = frame.size[0]; c = (W - 1) / 2; R_IN = W * 72.5 / 160
    yy, xx = np.mgrid[0:W, 0:W]; rr = np.hypot(xx - c, yy - c)
    inner = np.clip((R_IN - rr) / 1.5 + 0.5, 0, 1)                                 # 안쪽 = 새 그림(테 안쪽 가장자리에서 부드럽게)
    sheet = Image.new('RGBA', (W * len(ICONS), W), (34, 30, 44, 255))
    for i, k in enumerate(ICONS):
        p = RAW / f'{k}.png'
        if not p.exists(): print('그림 없음', k); continue
        art = Image.open(p).convert('RGBA'); s = min(art.size); art = art.crop(((art.size[0] - s) // 2, (art.size[1] - s) // 2, (art.size[0] + s) // 2, (art.size[1] + s) // 2))
        art = art.resize((int(W * 0.94), int(W * 0.94)), Image.LANCZOS); pad = Image.new('RGBA', (W, W), (0, 0, 0, 255)); pad.paste(art, ((W - art.size[0]) // 2, (W - art.size[1]) // 2))
        a = np.array(pad).astype(float); f = np.array(frame).astype(float); m = inner[..., None]
        # 안쪽 가장자리 어둡게(사용자 그림처럼 테 안쪽 그늘)
        vig = 1 - 0.45 * np.clip((rr - R_IN * 0.78) / (R_IN * 0.22), 0, 1) ** 2
        a[..., :3] *= vig[..., None]
        out = f.copy(); out[..., :3] = a[..., :3] * m + f[..., :3] * (1 - m); out[..., 3] = np.maximum(f[..., 3], 255 * inner)
        img = Image.fromarray(out.clip(0, 255).astype('uint8'), 'RGBA'); img.save(ROOT / f'assets/ui/skills/{OUT_ID[k]}.png', optimize=True)
        sheet.alpha_composite(img, (i * W, 0)); print('wrote', OUT_ID[k])
    os.makedirs('/tmp/hbrw', exist_ok=True); sheet.save('/tmp/hbrw/icons_sheet.png')

if __name__ == '__main__':
    a = sys.argv[1:]
    if '--run' in a: run([x for x in a if x in ICONS] or list(ICONS))
    elif '--compose' in a: compose()
    else:
        for k, v in ICONS.items(): print(k, '|', v)
        print('예상 크레딧: 6장 × 약 2~4 (gpt_image medium)')
