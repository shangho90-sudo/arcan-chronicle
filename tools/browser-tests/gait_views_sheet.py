"""Contact sheet from gait_views.js output: one row per (gender, view, speed). Usage: python3 gait_views_sheet.py [dir] [cols]"""
import json, sys, glob, base64, io, os
from PIL import Image, ImageDraw
D = sys.argv[1] if len(sys.argv) > 1 else '/tmp/gview'; C = int(sys.argv[2]) if len(sys.argv) > 2 else 16
rows = []
for f in sorted(glob.glob(os.path.join(D, 'view_*.json'))):
    ims = [Image.open(io.BytesIO(base64.b64decode(s))).convert('RGB') for s in json.load(open(f))][:C]
    w, h = ims[0].size; r = Image.new('RGB', (w * len(ims), h + 18), (30, 30, 30))
    for i, im in enumerate(ims): r.paste(im, (i * w, 18))
    ImageDraw.Draw(r).text((4, 3), os.path.basename(f)[5:-5], fill=(255, 255, 255)); rows.append(r)
W = max(r.width for r in rows); S = Image.new('RGB', (W, sum(r.height for r in rows)), (30, 30, 30)); y = 0
for r in rows: S.paste(r, (0, y)); y += r.height
S.save(os.path.join(D, 'sheet.png')); print(S.size)
