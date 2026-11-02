"""Joins the frames written by tools/browser-tests/swing_film.js into one contact sheet per (action, facing)."""
import json, sys, glob, base64, io, os
from PIL import Image
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/swing'
rows = []
for f in sorted(glob.glob(os.path.join(OUT, 'swing_*_*.json'))):
    if f.endswith('probe.json'): continue
    shots = [Image.open(io.BytesIO(base64.b64decode(s))).convert('RGB') for s in json.load(open(f))]
    shots = [im.resize((im.width * 2, im.height * 2), Image.LANCZOS) for im in shots]
    w, h = shots[0].size; strip = Image.new('RGB', (w * len(shots), h))
    for i, im in enumerate(shots): strip.paste(im, (i * w, 0))
    strip.save(f[:-5] + '.png'); rows.append(strip)
if rows:
    W = max(r.width for r in rows); sheet = Image.new('RGB', (W, sum(r.height for r in rows)))
    y = 0
    for r in rows: sheet.paste(r, (0, y)); y += r.height
    sheet.save(os.path.join(OUT, 'swing_sheet.png')); print('sheet', sheet.size)
