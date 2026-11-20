"""양약사 2차 6종 교체(2026-11-20) 스킬 아이콘 6장 — 사용자가 2026-11-20 넣은 금테 원형 메달 아이콘(8e67a81, 그림 160x160)과 같은 모양.
속 그림은 Runway text_to_image(텍스트 프롬프트만, 키 ~/.runway/key — 출력·커밋 금지), 테두리는 사용자 아이콘(wp_b3.png)의 금테 고리를 그대로 잘라 씀.
남은 9개(wp_a1·a3·a4·a5·b3·b4·b5·c4·c5)의 사용자 아이콘은 건드리지 않음.

  python3 tools/ui/wp2_icons.py                 # 프롬프트·예상 크레딧만
  python3 tools/ui/wp2_icons.py --run [id…]     # 생성(이어받기 /tmp/wp2icons/state.json, 원본 /tmp/wp2icons/<id>.png) + 합성
  python3 tools/ui/wp2_icons.py --compose       # 이미 받은 원본으로 합성만 -> assets/ui/skills/<id>.png + /tmp/wp2icons/sheet.png
환경: MODEL(기본 gpt_image_2_6_sunburst), RATIO(1920:1920), COST(장당 크레딧 11 — 2026-11-20 1920:1920 실측), FLOOR(잔액 바닥 3700 — 아래로 내려가면 멈춤)
"""
import json, os, sys, time, io, urllib.request, urllib.error
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'assets/ui/skills'; RAW = Path('/tmp/wp2icons'); RAW.mkdir(exist_ok=True)
API = 'https://api.dev.runwayml.com'; VERSION = '2024-11-06'
MODEL = os.environ.get('MODEL', 'gpt_image_2_6_sunburst'); RATIO = os.environ.get('RATIO', '1920:1920'); COST = float(os.environ.get('COST', '11')); FLOOR = float(os.environ.get('FLOOR', '3700'))
STYLE = ("Round fantasy RPG skill icon artwork, premium mobile MMORPG style, glossy painterly digital illustration, rich saturated jewel tones, dramatic rim light and glow, "
         "ornate cream porcelain and gold details with small gold flower motifs, single clear subject centered and filling the circle, dark vignette background. "
         "NO text, NO letters, NO border, NO frame, NO ring around the edge.")
ICONS = {
    'wp_b1': 'A white round pharmaceutical tablet with a score line, split open in two halves revealing a brilliant glowing sapphire-blue crystal core inside, white shell fragments, blue sparkles.',
    'wp_a2': 'A large white effervescent tablet dissolving on a stone floor in a low ring of white foam, a big glossy transparent bubble swelling up in the center, many small bubbles, icy light blue glow.',
    'wp_b2': 'A glowing sapphire-blue crystal core cracking apart with bright white fissures, bursting with blue-white energy and flying crystal shards, motion lines, intense flash.',
    'wp_c1': 'A small open red leather doctor\'s bag with a white cross on it, three white emergency medical patches with red crosses standing up inside, soft mint-green healing glow and sparkles.',
    'wp_c2': 'A cream medical adhesive patch with three glowing mint-green square cells in a row, the last cell dimmed grey, gentle healing sparkles, teal background.',
    'wp_c3': 'A brass wrist reel on a gloved forearm shooting a wide cream bandage that unrolls in a sweeping spiral, mint-green healing light along the bandage.',
}
def key(): return (Path.home() / '.runway/key').read_text().strip()
def call(m, p, b=None):
    r = urllib.request.Request(API + p, method=m, data=json.dumps(b).encode() if b is not None else None, headers={'Authorization': 'Bearer ' + key(), 'X-Runway-Version': VERSION, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(r, timeout=60) as f: return json.loads(f.read() or b'{}')
    except urllib.error.HTTPError as e: raise SystemExit(f'{m} {p}: HTTP {e.code} {e.read()[:300].decode("utf-8", "replace")}')
def balance(): return call('GET', '/v1/organization').get('creditBalance')
def run(ids):
    sf = RAW / 'state.json'; st = json.loads(sf.read_text()) if sf.exists() else {}
    for i in ids:
        if (RAW / f'{i}.png').exists() and not os.environ.get('FORCE'): print(i, '원본 있음'); continue
        b = balance(); print('잔액', b)
        if b is not None and b - COST < FLOOR: sys.exit('잔액 바닥 — 멈춤')
        tid = st.get(i)
        if not tid: tid = call('POST', '/v1/text_to_image', {'model': MODEL, 'promptText': (ICONS[i] + ' ' + STYLE)[:1000], 'ratio': RATIO})['id']; st[i] = tid; sf.write_text(json.dumps(st))
        for _ in range(120):
            t = call('GET', f'/v1/tasks/{tid}')
            if t.get('status') == 'SUCCEEDED': (RAW / f'{i}.png').write_bytes(urllib.request.urlopen(t['output'][0], timeout=120).read()); st.pop(i); sf.write_text(json.dumps(st)); print(i, '받음'); break
            if t.get('status') in ('FAILED', 'CANCELLED'): print(i, '실패', t.get('failure')); st.pop(i); sf.write_text(json.dumps(st)); break
            time.sleep(5)
    print('잔액', balance())
def compose():
    from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
    import numpy as np
    ref = np.array(Image.open(OUT / 'wp_b3.png').convert('RGBA')).astype(np.float32); S = ref.shape[0]; c = (S - 1) / 2
    yy, xx = np.mgrid[0:S, 0:S]; rr = np.hypot(xx - c, yy - c)
    # 사용자 아이콘의 고리: 바깥 가장자리 ~ 안쪽(밝기 변화로 찾은 두께) — 160 px 아이콘은 반지름 73 안쪽이 그림
    R_IN = float(os.environ.get('RIN', '72.5')) * S / 160
    ring_a = np.clip((rr - R_IN) / 1.5, 0, 1)                                  # 0 = 그림, 1 = 고리
    outs = []
    for i in ICONS:
        p = RAW / f'{i}.png'
        if not p.exists(): print(i, '원본 없음'); continue
        art = Image.open(p).convert('RGB'); w, h = art.size; m = min(w, h); art = art.crop(((w - m) // 2, (h - m) // 2, (w + m) // 2, (h + m) // 2))
        art = art.resize((S, S), Image.LANCZOS); art = ImageEnhance.Contrast(art).enhance(1.06); art = ImageEnhance.Color(art).enhance(1.08)
        a = np.array(art).astype(np.float32)
        vig = np.clip(1 - 0.35 * ((rr / R_IN) ** 4), 0.55, 1)[..., None]               # 가장자리 쪽 살짝 어둡게(사용자 아이콘처럼 고리 안쪽 그늘)
        a = a * vig
        out = np.zeros_like(ref); k = ring_a[..., None]
        out[..., :3] = a * (1 - k) + ref[..., :3] * k; out[..., 3] = np.where(rr <= R_IN + 0.5, 255, ref[..., 3])
        im = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA'); im.save(OUT / f'{i}.png', optimize=True); outs.append(im); print('->', (OUT / f'{i}.png').relative_to(ROOT))
    if outs:
        allids = [f'wp_{x}{n}' for x in 'abc' for n in range(1, 6)]
        sh = Image.new('RGBA', (S * 5 + 40, S * 3 + 30), (36, 34, 44, 255)); d = ImageDraw.Draw(sh)
        for k2, sid in enumerate(allids):
            im = Image.open(OUT / f'{sid}.png').convert('RGBA'); x, y = 8 + (k2 % 5) * (S + 8), 8 + (k2 // 5) * (S + 8); sh.paste(im, (x, y), im)
            if sid in ICONS: d.rectangle([x - 3, y - 3, x + S + 2, y + S + 2], outline=(120, 230, 200, 255), width=2)
        sh.save(RAW / 'sheet.png'); print('sheet', RAW / 'sheet.png')
if __name__ == '__main__':
    a = sys.argv[1:]; ids = [x for x in a if not x.startswith('--')] or list(ICONS)
    if '--run' in a: run(ids); compose()
    elif '--compose' in a: compose()
    else:
        for i in ids: print(i, (ICONS[i] + ' ' + STYLE)[:200], '…')
        print(f'{len(ids)}장 × {COST:g} ≈ {len(ids) * COST:g} 크레딧, 모델 {MODEL} {RATIO}')
