"""Checks the Blender asset set: every expected LOD exists, triangle budgets, colour attribute + UVs present, every
material name has a texture (texmap.py) that exists, and js/nature.js knows the same material names.
Usage: python3 tools/blender/validate_assets.py   (exit 1 on problems)"""
import os, sys, json, re
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
sys.path.insert(0, HERE)
from texmap import TEXMAP, tex_path
from wrap import info
import glob
BUDGET = {'tree': {'l0': 30000, '': 8000, 'l2': 6000, 'lo': 1300}, 'shrub': {'l0': 4000, '': 1500, 'l2': 1000, 'lo': 300},
          'rock': {'l0': 3000, '': 1500, 'l2': 700, 'lo': 150}, 'town': {'l0': 6000, '': 3000, 'l2': 1500, 'lo': 700}}
def main():
    bad = []; out = os.path.join(HERE, 'out')
    names = sorted({re.sub(r'_(l0|l2|lo)$', '', os.path.basename(p)[:-4]) for p in glob.glob(os.path.join(out, '*.glb'))})
    js = open(os.path.join(ROOT, 'js', 'nature.js')).read()
    for n in names:
        kind = n.split('_')[0]; lods = ['l0', '', 'l2', 'lo'] if kind in BUDGET else ['']
        for l in lods:
            f = os.path.join(out, n + ('_' + l if l else '') + '.glb')
            if not os.path.exists(f): bad.append('missing ' + f); continue
            i = info(f)
            if kind in BUDGET and i['tris'] > BUDGET[kind][l]: bad.append(f'{n} {l or "game"}: {i["tris"]} tris > {BUDGET[kind][l]}')
            if l != 'lo':
                if 'COLOR_0' not in i['attrs']: bad.append(f'{n} {l}: no COLOR_0')
                if 'TEXCOORD_0' not in i['attrs']: bad.append(f'{n} {l}: no UV')
                for m in i['materials']:
                    if m not in TEXMAP: bad.append(f'{n}: material {m} has no texture mapping')
                    elif not os.path.exists(tex_path(TEXMAP[m]['tex'])): bad.append(f'{n}: texture {TEXMAP[m]["tex"]} missing')
                    elif f"'{m}'" not in js and f'"{m}"' not in js and m + ':' not in js: bad.append(f'{n}: material {m} unknown to js/nature.js')
            if max(i['size']) > 12 or max(i['size']) < 0.05: bad.append(f'{n} {l}: odd size {i["size"]}')
    print(len(names), 'assets checked'); [print(' -', b) for b in bad]
    sys.exit(1 if bad else 0)
if __name__ == '__main__': main()
