"""이야기 NPC용 색 바꾼 텍스처: 기존 NPC 모델(같은 메시)에 다른 옷 색을 입힘 → assets/models/npc_<name>.jpg
js/model.js NPC_MODELS 의 tex 로 고름. 피부색(살구색 계열)은 그대로 두고 나머지 색상만 돌림.
Usage: python3 tools/npcs/recolor.py"""
import os
import numpy as np
from PIL import Image
M = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'models')
# name: (source texture, hue shift deg, saturation mul, value mul)
JOBS = {'castilla': ('npc_artist', 95, 1.05, 1.0), 'kylus': ('npc_guard', 20, 0.75, 0.82), 'daisen': ('npc_blacksmith', -15, 1.15, 0.85), 'boldran': ('npc_blacksmith', 0, 0.35, 0.95),
        'gear_weapon': ('npc_armorer', 150, 1.1, 0.95), 'gear_armor': ('npc_merchant', -110, 1.1, 1.0),
        'warp_keeper': ('npc_pharmacist', 170, 1.3, 1.05),      # 마을 간 워프 안내인 (world.py WARP_KEEPERS)
        # 마을 주민(tools/world/residents.py, 2026-11-12): 같은 메시에 옷 색만 다르게
        'res_artist_a': ('npc_artist', 40, 1.0, 1.0), 'res_artist_b': ('npc_artist', -150, 0.9, 0.95), 'res_pharmacist_a': ('npc_pharmacist', 60, 1.0, 1.0), 'res_pharmacist_b': ('npc_pharmacist', -120, 1.05, 0.95), 'res_blacksmith_a': ('npc_blacksmith', 100, 0.8, 1.0), 'res_blacksmith_b': ('npc_blacksmith', -60, 0.9, 0.9), 'res_cook_a': ('npc_cook', 150, 0.9, 1.0), 'res_cook_b': ('npc_cook', -70, 1.0, 0.95), 'res_elder_a': ('npc_elder', 120, 0.85, 1.0), 'res_hairdresser_a': ('npc_hairdresser', 70, 1.0, 1.0), 'res_hairdresser_b': ('npc_hairdresser', -130, 1.0, 0.95), 'res_guard_a': ('npc_guard', 90, 0.9, 1.0), 'res_guard_b': ('npc_guard', -90, 1.0, 0.9), 'res_merchant_a': ('npc_merchant', 60, 1.0, 1.0), 'res_merchant_b': ('npc_merchant', 170, 0.9, 0.95)}
def recolor(src, dh, ks, kv):
    im = Image.open(os.path.join(M, src + '.jpg')).convert('HSV'); a = np.asarray(im).astype(np.float32)
    h, s, v = a[..., 0], a[..., 1], a[..., 2]
    skin = (h > 5) & (h < 30) & (s > 40) & (s < 150) & (v > 120)            # keep faces / hands
    h2 = (h + dh / 360 * 255) % 255; s2 = np.clip(s * ks, 0, 255); v2 = np.clip(v * kv, 0, 255)
    out = np.stack([np.where(skin, h, h2), np.where(skin, s, s2), np.where(skin, v, v2)], -1).astype(np.uint8)
    return Image.fromarray(out, 'HSV').convert('RGB')
if __name__ == '__main__':
    for n, (src, dh, ks, kv) in JOBS.items(): recolor(src, dh, ks, kv).save(os.path.join(M, 'npc_' + n + '.jpg'), quality=88); print('npc_' + n + '.jpg')
