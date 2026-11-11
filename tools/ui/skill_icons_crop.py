"""스킬 아이콘을 사용자가 준 스킬창 참고 그림(tools/ui/ref/*.png)에서 잘라 assets/ui/skills/<id>.png(128 px)로 만든다.
- 견습생 기본 검술 8종: skill_window_ref.png, 둥근 사각형(모서리 밖 투명)
- 약사 1차 15종: pharmacist_ref.png, 원형(원 밖 투명)
게임은 js/skillui.js `SKILL_ART`로 씀.
Usage: python3 tools/ui/skill_icons_crop.py
"""
import os
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'tools/ui/ref/skill_window_ref.png')
SRC_PH = os.path.join(ROOT, 'tools/ui/ref/pharmacist_ref.png')
OUT = os.path.join(ROOT, 'assets/ui/skills')
SIZE = 128
# 대략적인 칸(그림 좌표) — 안에서 남색 배경이 아닌 부분(금테 아이콘)만 다시 찾아 자름
BOXES = {
    'nv_a1': (50, 198, 140, 287), 'nv_a2': (50, 291, 140, 380), 'nv_a4': (50, 384, 140, 473),
    'nv_a3': (52, 640, 182, 770),   # 비연참은 아래 상세 칸의 큰 그림(선택 테두리 없음)
    'nv_p1': (828, 198, 918, 287), 'nv_p3': (828, 291, 918, 380), 'nv_p2': (828, 384, 918, 473), 'nv_p4': (828, 478, 918, 567),
}

# 약사 1차: 열 중심 x, 행 중심 y (그림 좌표) — 원은 주변에서 다시 찾음
PH_COLS = {'a': 75, 'b': 560, 'c': 1040}
PH_ROWS = [236, 342, 448, 553, 655]
PH_FIXED = {'ph1_b1': (517, 193, 602, 278)}   # 선택된 칸이라 바깥 빛 때문에 자동으로 못 찾음

def circle_box(im, cx, cy, r=52):
    """(cx, cy) 근처에서 남색 배경이 아닌 원(금테)의 경계 상자"""
    c = im.crop((cx - r, cy - r, cx + r, cy + r)); w, h = c.size; px = c.load()
    fg = lambda x, y: not (px[x, y][2] > px[x, y][0] + 12 and px[x, y][0] < 80 and px[x, y][1] < 100)
    rows = [y for y in range(h) if sum(fg(x, y) for x in range(w)) > w * 0.12]
    cols = [x for x in range(w) if sum(fg(x, y) for y in range(h)) > h * 0.12]
    # 가장 긴 연속 구간만(이웃 칸 테두리 제외)
    def run(v):
        best, cur = [], []
        for t in v:
            if cur and t != cur[-1] + 1: best = max(best, cur, key=len); cur = []
            cur.append(t)
        return max(best, cur, key=len)
    rows, cols = run(rows), run(cols)
    x0, x1, y0, y1 = cols[0], cols[-1], rows[0], rows[-1]; d = max(x1 - x0, y1 - y0) + 1
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    return (round(cx - r + mx - d / 2), round(cy - r + my - d / 2), round(cx - r + mx + d / 2), round(cy - r + my + d / 2))

def pharmacist():
    im = Image.open(SRC_PH).convert('RGB')
    # 2026-11-11 약사 개편: 그림의 칸 -> 지금 스킬 id. 지운 스킬(두 번 치기·전격 약병·활력제 제작·응급 복용·정화 약제)의 칸은
    # 쓰지 않음, '약물 조제'(c 5번째, 위로 솟는 초록 화살표) 그림은 새 패시브 '약사 수련'(ph1_c9)에 씀. 새 스킬 그림은
    # tools/blender/fx_pharm.py가 Blender로 그림(ph1_a6·b6·c6·c7·c8)
    use = {('a', 1): 'ph1_a1', ('a', 3): 'ph1_a3', ('a', 4): 'ph1_a4', ('a', 5): 'ph1_a5', ('b', 1): 'ph1_b1', ('b', 2): 'ph1_b2',
           ('b', 4): 'ph1_b4', ('b', 5): 'ph1_b5', ('c', 1): 'ph1_c1', ('c', 5): 'ph1_c9'}
    for col, x in PH_COLS.items():
        for i, y in enumerate(PH_ROWS):
            k = use.get((col, i + 1))
            if not k: continue
            b = PH_FIXED.get(f'ph1_{col}{i + 1}') or circle_box(im, x, y)
            ic = im.crop(b).resize((SIZE, SIZE), Image.LANCZOS).convert('RGBA')
            m = Image.new('L', (SIZE * 4, SIZE * 4), 0); ImageDraw.Draw(m).ellipse((2, 2, SIZE * 4 - 3, SIZE * 4 - 3), fill=255)
            ic.putalpha(m.resize((SIZE, SIZE), Image.LANCZOS)); ic.save(os.path.join(OUT, k + '.png'), optimize=True); print(k, b)

def trim(c):
    w, h = c.size; px = c.load()
    def fg(x, y):
        r, g, b = px[x, y][:3]
        return not (b > r + 12 and r < 70 and g < 90)          # 남색 배경이 아니면 아이콘
    rows = [y for y in range(h) if sum(fg(x, y) for x in range(w)) > w * 0.55]
    cols = [x for x in range(w) if sum(fg(x, y) for y in range(h)) > h * 0.55]
    return c.crop((min(cols), min(rows), max(cols) + 1, max(rows) + 1))

def main():
    im = Image.open(SRC).convert('RGB'); os.makedirs(OUT, exist_ok=True)
    for k, b in BOXES.items():
        c = trim(im.crop(b)); s = max(c.size)
        sq = Image.new('RGB', (s, s), c.getpixel((c.size[0] // 2, 2))); sq.paste(c, ((s - c.size[0]) // 2, (s - c.size[1]) // 2))
        ic = sq.resize((SIZE, SIZE), Image.LANCZOS).convert('RGBA')
        m = Image.new('L', (SIZE * 4, SIZE * 4), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, SIZE * 4 - 1, SIZE * 4 - 1), radius=int(SIZE * 4 * 0.13), fill=255)
        ic.putalpha(m.resize((SIZE, SIZE), Image.LANCZOS))
        ic.save(os.path.join(OUT, k + '.png'), optimize=True); print(k, c.size)

if __name__ == '__main__':
    main(); pharmacist()
