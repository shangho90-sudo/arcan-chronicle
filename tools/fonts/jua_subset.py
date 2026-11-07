"""주아체(Jua, Google Fonts, OFL - assets/fonts/Jua-OFL.txt) -> assets/fonts/Jua.woff2
Keeps every character used by the game data / code / page plus the 2,350 common Hangul syllables (KS X 1001), so
dialogue added later still renders in Jua. Needs fontTools + brotli (tool only, not a game dependency).
Usage: python3 tools/fonts/jua_subset.py /path/to/Jua-Regular.ttf   (source: github.com/google/fonts ofl/jua)"""
import glob, os, sys
from fontTools import subset
from fontTools.ttLib import TTFont
src = sys.argv[1]
chars = set()
for f in glob.glob('assets/data/**/*.json', recursive=True) + glob.glob('js/*.js') + ['index.html']:
    chars |= set(open(f, encoding='utf-8').read())
for b1 in range(0xB0, 0xC9):
    for b2 in range(0xA1, 0xFF):
        try: chars |= set(bytes([b1, b2]).decode('euc-kr'))
        except UnicodeDecodeError: pass
chars |= set(chr(c) for c in range(0x20, 0x7f))
cmap = TTFont(src).getBestCmap(); keep = ''.join(c for c in chars if ord(c) in cmap)
opt = subset.Options(); opt.flavor = 'woff2'; s = subset.Subsetter(opt); s.populate(text=keep)
f2 = TTFont(src); s.subset(f2); f2.flavor = 'woff2'; f2.save('assets/fonts/Jua.woff2')
print(len(keep), 'glyphs', os.path.getsize('assets/fonts/Jua.woff2'), 'bytes')
