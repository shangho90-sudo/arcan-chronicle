"""Contact sheet of a skill_film.js folder: python3 tools/anim/sheet.py DIR [COLS] [EVERY] -> DIR.jpg"""
import sys, os
from PIL import Image, ImageDraw
d = sys.argv[1].rstrip('/'); cols = int(sys.argv[2]) if len(sys.argv) > 2 else 8; every = int(sys.argv[3]) if len(sys.argv) > 3 else 1
fs = sorted(f for f in os.listdir(d) if f.endswith('.png'))[::every]
ims = [Image.open(os.path.join(d, f)).convert('RGB') for f in fs]; w, h = ims[0].size; s = 0.5
tw, th = int(w * s), int(h * s); rows = (len(ims) + cols - 1) // cols
sh = Image.new('RGB', (cols * tw, rows * th), (20, 20, 28)); dr = ImageDraw.Draw(sh)
for i, (f, im) in enumerate(zip(fs, ims)):
    x, y = (i % cols) * tw, (i // cols) * th; sh.paste(im.resize((tw, th)), (x, y)); dr.text((x + 4, y + 3), f[:-4], fill=(255, 255, 0))
sh.save(d + '.jpg', quality=85); print(d + '.jpg', sh.size)
