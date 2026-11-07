"""한 번만 실행: 시작 화면 그림(assets/ui/title-screen.png)의 금색 버튼 글자 '이어하기'를 '불러오기'로 바꿉니다.
버튼 글자를 지운 자리는 같은 줄의 글자 양옆 색을 직선 보간해서 메우고(버튼은 세로 그라데이션이라 자연스럽게 이어짐),
Noto Sans CJK KR Medium으로 같은 크기·같은 가운데에 새 글자를 그립니다(옅은 밝은 그림자 + 짙은 갈색).
원본은 git 기록(b5dd474)에 있습니다. 다시 하려면: git show b5dd474:assets/ui/title-screen.png > /tmp/t.png; python3 tools/ui/title_relabel.py /tmp/t.png"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
SRC = sys.argv[1] if len(sys.argv) > 1 else 'assets/ui/title-screen.png'
OUT = 'assets/ui/title-screen.png'
X0, X1, Y0, Y1 = 640, 806, 638, 690          # 지울 영역 (원래 글자 653..791 x 645..681 + 여유)
CX, CY, TEXT = 722, 663, '불러오기'
im = Image.open(SRC).convert('RGB'); a = np.asarray(im).astype(float)
L = a[Y0:Y1, X0 - 3:X0].mean(1); R = a[Y0:Y1, X1:X1 + 3].mean(1)
t = np.linspace(0, 1, X1 - X0)[None, :, None]
a[Y0:Y1, X0:X1] = L[:, None, :] * (1 - t) + R[:, None, :] * t
im = Image.fromarray(a.clip(0, 255).astype(np.uint8))
font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc', 39, index=1)  # index 1 = KR
bb = font.getbbox(TEXT); w, h = bb[2] - bb[0], bb[3] - bb[1]
x, y = CX - w / 2 - bb[0], CY - h / 2 - bb[1]
glow = Image.new('L', im.size, 0); ImageDraw.Draw(glow).text((x, y + 1.5), TEXT, font=font, fill=150)
glow = glow.filter(ImageFilter.GaussianBlur(1.2))
im = Image.composite(Image.new('RGB', im.size, (255, 246, 214)), im, glow)
ImageDraw.Draw(im).text((x, y), TEXT, font=font, fill=(38, 24, 10))
im.save(OUT, optimize=True)
print('ok', OUT, (w, h))
