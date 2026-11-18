"""주아체(Jua, Google Fonts, OFL - assets/fonts/Jua-OFL.txt) -> assets/fonts/Jua.woff2
   + 보충 글꼴 DialogExtra(Noto Sans CJK KR Regular, OFL - assets/fonts/NotoSansCJK-OFL.txt) -> assets/fonts/DialogExtra.woff2

Jua keeps every character used by the game data / code / page plus the 2,350 common Hangul syllables (KS X 1001), so
dialogue added later still renders in Jua. Jua has no Hanja and few symbols (『』 ① … → ‘’ 無 龍 …), so DialogExtra holds
exactly the game characters Jua lacks; CSS --gb-font / name plates list "Jua, DialogExtra" so the 대화 상자 never falls
back to a random system font. tests/storyscene.test.mjs reads both files and checks that every character of the main
quest dialogue, the prologue and the box UI is in one of them — run this again after adding text with new symbols/Hanja.
Needs fontTools + brotli (tool only, not a game dependency).
Usage: python3 tools/fonts/jua_subset.py /path/to/Jua-Regular.ttf [/path/to/NotoSansCJK-Regular.ttc]
       (sources: github.com/google/fonts ofl/jua, github.com/notofonts/noto-cjk Sans OTC; the .ttc index 1 = KR)"""
import glob, os, sys
from fontTools import subset
from fontTools.ttLib import TTFont

src = sys.argv[1]
noto = sys.argv[2] if len(sys.argv) > 2 else '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'

used = set()
for f in glob.glob('assets/data/**/*.json', recursive=True) + glob.glob('js/*.js') + ['index.html']:
    used |= set(open(f, encoding='utf-8').read())
used = {c for c in used if ord(c) >= 0x20 and not (0xD800 <= ord(c) <= 0xDFFF)}
common = set()
for b1 in range(0xB0, 0xC9):
    for b2 in range(0xA1, 0xFF):
        try: common |= set(bytes([b1, b2]).decode('euc-kr'))
        except UnicodeDecodeError: pass
ascii_ = set(chr(c) for c in range(0x20, 0x7f))


def save(font_path, text, out, num=-1):
    opt = subset.Options(); opt.flavor = 'woff2'; opt.font_number = num
    s = subset.Subsetter(opt); s.populate(text=text)
    f2 = TTFont(font_path, fontNumber=num) if num >= 0 else TTFont(font_path)
    s.subset(f2); f2.flavor = 'woff2'; f2.save(out)
    print(out, len(text), 'glyphs', os.path.getsize(out), 'bytes')


cmap = TTFont(src).getBestCmap()
save(src, ''.join(sorted(c for c in used | common | ascii_ if ord(c) in cmap)), 'assets/fonts/Jua.woff2')

ncmap = TTFont(noto, fontNumber=1).getBestCmap()
extra = sorted(c for c in used if ord(c) not in cmap and ord(c) in ncmap and not c.isspace())
missing = sorted(c for c in used if ord(c) not in cmap and ord(c) not in ncmap and not c.isspace() and ord(c) > 0x7f)
save(noto, ''.join(extra), 'assets/fonts/DialogExtra.woff2', 1)
if missing: print('neither font has:', ''.join(missing)[:200])
