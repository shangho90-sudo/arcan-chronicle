"""Material name -> shared texture (kept in sync with MAT_TEX in js/nature.js; validate_assets.py checks both)."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
TEXMAP = {
    'M_bark': dict(tex='bark.png'), 'M_foliage': dict(tex='foliage.png'), 'M_foliage_warm': dict(tex='foliage_warm.png'), 'M_foliage_cool': dict(tex='foliage_cool.png'),
    'M_leaf': dict(tex='leafcard.png', alpha=True), 'M_leaf_warm': dict(tex='leafcard_warm.png', alpha=True), 'M_leaf_cool': dict(tex='leafcard_cool.png', alpha=True),
    'M_stone': dict(tex='stone.png'), 'M_stone_warm': dict(tex='stone_warm.png'), 'M_moss': dict(tex='foliage.png', scale=1.6),
    'M_plants': dict(tex='plants.png', alpha=True),
    'M_wood': dict(tex='wood.png'), 'M_wood_dark': dict(tex='wood_dark.png'), 'M_iron': dict(tex='iron.png'), 'M_gold': dict(tex='gold.png'),
    'M_navy': dict(tex='navy.png'), 'M_cream': dict(tex='cream.png'), 'M_roof_blue': dict(tex='roof_blue.png'), 'M_terracotta': dict(tex='terracotta.png'),
    'M_plaster': dict(tex='plaster.png'), 'M_glow': dict(tex='lampglow.png', emissive=True), 'M_red': dict(tex='red.png'), 'M_soil': dict(tex='soilpot.png'),
}
def tex_path(t): return os.path.join(HERE, 'tex', t)
