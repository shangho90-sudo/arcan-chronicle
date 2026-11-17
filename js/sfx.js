// Skill audio selection uses the same operations as the visual/combat runtime.
export function skillSound(d, op = null) {
  if (op) {
    if (op.sfx) return op.sfx;
    if (op.elem === 'fire') return 'fire';
    if (op.elem === 'ice') return 'ice';
    if (op.elem) return 'magic';
    if (op.tag === 'flask') return 'splash';
    if (d.type === 'ultimate') return 'boss_slam';
    return op.coef >= 2 ? 'heavy' : 'hit';
  }
  if (d.sfx) return d.sfx;
  const ops = d.ops || [];
  if (ops.some(o => o.op === 'shield')) return 'shield';
  if (ops.some(o => ['heal', 'cleanse', 'consume'].includes(o.op))) return 'heal';
  if (ops.some(o => o.op === 'proj')) return 'throw';
  if (d.weapon || d.job === 'novice') return 'swing';
  return 'magic';
}

export const SFX_EVENTS = new Set(['levelup', 'jobchange', 'dialog', 'warp']);
export const SFX_NAMES = ['levelup', 'jobchange', 'dialog', 'warp', 'hit', 'heavy', 'swing', 'magic', 'fire', 'ice', 'splash',
  'ph_spin', 'ph_slam', 'ph_smash_swing', 'ph_smash_hit', 'ph_push_hit', 'ph_flask', 'ph_glass_fire', 'ph_glass_ice', 'ph_glass_acid', 'ph_shield', 'ph_adrenaline', 'ph_heal',
  'bs_swing', 'bs_hit', 'bs_hit_heavy', 'bs_anvil', 'bs_anvil_ring', 'bs_tongs', 'bs_quench', 'bs_steam', 'bs_steam3',   // 대장장이 1차 (tools/audio/smith_sfx.py)
  'bs_wall', 'bs_block', 'bs_rivet', 'bs_rivet_pop', 'bs_rivet_shot', 'bs_forge', 'bs_break',
  'ck_flip', 'ck_board', 'ck_soup', 'ck_pepper', 'ck_flour', 'ck_skewer', 'ck_eat', 'ck_ball_toss', 'ck_ball_fly', 'ck_ball_hit', 'ck_ball_fin',
  'cf_wok_toss', 'cf_sizzle', 'cf_flame', 'cf_splash', 'cf_ignite', 'cf_steam', 'cf_place', 'cf_steam_hiss', 'cf_pop', 'cf_skewer', 'cf_whoosh', 'cf_knife', 'cf_cloche_fall', 'cf_cloche_slam', 'cf_scoop', 'cf_sorbet_hit', 'cf_frost_draw', 'cf_frost', 'cf_disc', 'cf_disc_hit', 'cf_disc_catch', 'cf_sugar', 'cf_shatter', 'cf_choux_pop', 'cf_serve', 'cf_cloche_open', 'cf_sigil', 'cf_twinkle', 'cf_bless',   // 쉐프 2차 (Runway: tools/audio/chef_runway_sfx.py)
  'hb_simmer', 'hb_root', 'hb_needle', 'hb_resonance', 'hb_bloom', 'hb_dragon', 'hb_phoenix', 'hb_flameburst', 'hb_quake', 'hb_wave', 'hb_spore', 'hb_stomp', 'hb_hop', 'hb_scroll', 'hb_armor', 'hb_drop',   // fx2 Runway (tools/audio/herbal_runway_sfx.py)
    // 한약사 2차 (tools/audio/herbal_sfx.py)
  'ds_snip_open', 'ds_snip', 'ds_snip_silver', 'ds_needle', 'ds_thread', 'ds_pin', 'ds_silk', 'ds_silk_hit', 'ds_cloth', 'ds_ribbon', 'ds_whoosh', 'ds_spot', 'ds_unfold', 'ds_finale', 'ds_sparkle', 'ds_sigil', 'ds_jewel', 'ds_mannequin', 'ds_flashbulb',   // 디자이너 2차 (tools/audio/designer_sfx.py)
  'pt_sketch', 'pt_brush', 'pt_wash', 'pt_dot', 'pt_mix', 'pt_ink', 'pt_frame', 'pt_fold', 'pt_bolt', 'pt_bite',   // 화가 2차 (tools/audio/painter_sfx.py)
  'mu_bow', 'mu_burst', 'mu_cello', 'mu_chord', 'mu_coda', 'mu_cymbal', 'mu_echo', 'mu_encore', 'mu_fanfare', 'mu_flute', 'mu_flute_tick', 'mu_harp', 'mu_harp_tick', 'mu_horn', 'mu_note', 'mu_pluck', 'mu_string', 'mu_symph', 'mu_trio', 'mu_tune', 'mu_wave_hit',   // 음악가 2차 (tools/audio/music_sfx.py)
  'hd_snip', 'hd_dryer', 'hd_style', 'hd_gust', 'hd_hot', 'hd_cold',
  'wp_granule', 'wp_ring', 'wp_crystal', 'wp_ion', 'wp_collapse',   // 양약사 2차 (Runway — tools/audio/wp_runway_sfx.py)
  'wp_split', 'wp_frost', 'wp_align', 'wp_triad', 'wp_charge', 'wp_catalyst', 'wp_spark', 'wp_carrier', 'wp_chain', 'wp_spray', 'wp_coat', 'wp_lastrx', 'wp_brew',
  'en_lock', 'en_motor', 'en_shot', 'en_pile', 'en_cannon', 'en_missile', 'en_pop', 'en_charge', 'en_rail', 'en_zap', 'en_weld', 'en_exhaust', 'en_drop', 'en_deploy', 'en_assemble', 'en_vent', 'en_target', 'en_whistle', 'en_core', 'en_alarm', 'en_craft',   // 엔지니어 2차 (tools/audio/en_sfx.py)
  'nv_sal_cast', 'nv_sal_hit', 'nv_yeon_cast', 'nv_yeon_hit',
  'nv_biyeon_cast', 'nv_biyeon_hit', 'nv_bash_cast', 'nv_bash_hit',
  'heal', 'shield', 'dodge', 'throw', 'boss_slam', 'monster_attack', 'monster_die',
  'hurt', 'die', 'quest', 'coin', 'pickup', 'crit', 'ui', 'ui_back', 'warn'];
export const SFX_REWARDS = new Set(['levelup', 'jobchange', 'quest', 'coin', 'pickup', 'die']);
