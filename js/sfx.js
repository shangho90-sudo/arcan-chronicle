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
  'nv_sal_cast', 'nv_sal_hit', 'nv_yeon_cast', 'nv_yeon_hit',
  'nv_biyeon_cast', 'nv_biyeon_hit', 'nv_bash_cast', 'nv_bash_hit',
  'heal', 'shield', 'dodge', 'throw', 'boss_slam', 'monster_attack', 'monster_die',
  'hurt', 'die', 'quest', 'coin', 'pickup', 'crit', 'ui', 'ui_back', 'warn'];
export const SFX_REWARDS = new Set(['levelup', 'jobchange', 'quest', 'coin', 'pickup', 'die']);
