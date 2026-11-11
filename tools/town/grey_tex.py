"""마을별 색(town3d.palette)용 무채색 텍스처: slate·bluewood는 원래 파란색이라 색을 곱해도 다른 색이 안 나옴 →
밝기만 남긴 <name>_grey.jpg 를 만들고 js/town3d.js M()이 palette가 있을 때 그것에 색을 곱함. Usage: python3 tools/town/grey_tex.py"""
import os
from PIL import Image, ImageOps
T = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'town3d', 'tex')
for n in ('slate', 'bluewood', 'grass'):               # grass는 눈 덮인 마을(palette.snow)용
    g = ImageOps.grayscale(Image.open(os.path.join(T, n + '.jpg')))
    px = list(g.getdata()); mean = sum(px) / len(px)
    g = g.point(lambda v: max(0, min(255, int(205 + (v - mean) * 1.25))))        # 평균 밝기 0.8, 대비 조금 올림
    Image.merge('RGB', (g, g, g)).save(os.path.join(T, n + '_grey.jpg'), quality=88); print(n, 'mean', round(mean, 1))
