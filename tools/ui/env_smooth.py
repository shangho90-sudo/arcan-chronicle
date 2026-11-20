"""예전 빌더 지형 텍스처(assets/env/*.png, 64 px 도트) 가운데 지금도 보이는 것을 매끈한 손그림 텍스처로 바꿈 — 2026-11-20.

Usage:  python3 tools/ui/env_smooth.py   ->  assets/env/{stone_wall,cobble,dirt,plaster_blue,boss_floor}.png (256 px) + /tmp/pixel/env_after.png

보이는 곳(빌더 존 메시 중 nature.js·town3d가 숨기지 않는 것): 독버섯 군락지·서리 고원·용의 유적·안개 골짜기의 고지대 벽·경사로·돌 바닥 패치.
원본 그림은 이미 저장소에 있는 손그림 텍스처(마을 tools/town/texgen*.py, 숲 tools/blender/paint.py 결과)를 쓰고, 예전 도트 텍스처의
평균 색에 맞춰 밝기 비율만 옮김(같은 UV·같은 반복 — 지형 배치는 그대로). 게임은 이 경로를 Linear + 밉맵으로 읽음(render.js `tex`).
"""
import os
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ENV, TOWN, FOREST = (os.path.join(ROOT, 'assets', p) for p in ('env', 'town3d/tex', 'forest/tex'))
N = 256
# env name -> (source, extra colour multiply)
MAP = {'stone_wall': (os.path.join(TOWN, 'basestone.jpg'), None), 'cobble': (os.path.join(TOWN, 'cobble.jpg'), None),
       'dirt': (os.path.join(FOREST, 'g_path.jpg'), None), 'plaster_blue': (os.path.join(TOWN, 'plaster.jpg'), None),
       'boss_floor': (os.path.join(FOREST, 'g_magic_soil_dark.jpg'), None)}
# the old pixel textures' mean colours (measured once from the 64 px originals, git 2026-11-19), so the re-made ones keep the zones' look
OLD_MEAN = {'stone_wall': (140, 136, 130), 'cobble': (181, 168, 148), 'dirt': (174, 140, 99), 'plaster_blue': (213, 224, 234), 'boss_floor': (118, 104, 136)}

def make(name):
    src, _ = MAP[name]
    a = np.asarray(Image.open(src).convert('RGB').resize((N, N), Image.LANCZOS), float)
    lum = a.mean(axis=2, keepdims=True); k = lum / lum.mean()                      # detail as brightness ratio
    tgt = np.array(OLD_MEAN[name], float)[None, None, :]
    col = np.clip(tgt * (0.55 + 0.45 * k) + (a - a.mean(axis=(0, 1))) * 0.12, 0, 255)   # mostly target colour, keep a little of the painted hue variation
    return Image.fromarray(col.astype(np.uint8), 'RGB')

if __name__ == '__main__':
    os.makedirs('/tmp/pixel', exist_ok=True); out = []
    for n in MAP:
        im = make(n); im.save(os.path.join(ENV, n + '.png'), optimize=True); out.append(im); print(n, im.size)
    sheet = Image.new('RGB', (N * len(out), N)); [sheet.paste(im, (i * N, 0)) for i, im in enumerate(out)]; sheet.save('/tmp/pixel/env_after.png')
