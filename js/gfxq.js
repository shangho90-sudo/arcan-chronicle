// 그래픽 품질 (2026-11-19 하이브리드 리마스터 파일럿): settings.gfxQuality = 'high' | 'medium' | 'low'.
// 정하지 않았으면 데스크톱 'high', 휴대폰 'medium'. 'low' = 리마스터 전 모습 그대로(셰이더·메시를 하나도 더하지 않음).
// 저장은 설정(arcan_settings)에만 — 게임 저장(SAVE_VERSION 4)과 무관.
// 무엇이 바뀌는지: js/render.js paintMat({remaster}) 캐릭터 재질(지금은 약사만), js/remaster.js 아르칸 분수 광장 배경,
// js/flaskfx.js 약병폭격 5단계(rain). 바꾸면 game.js applySettings -> applyGfxQuality가 재질을 다시 컴파일하고 광장 장식을 켜고 끔.
export const GFX_LEVELS = ['high', 'medium', 'low'];
export const GFX_NAMES = { high: '높음', medium: '보통', low: '낮음 (예전 모습)' };
export function gfxQ() {
  const G = typeof window !== 'undefined' ? window.G : null;
  const s = G && G.settings && G.settings.gfxQuality;
  if (s === 'high' || s === 'medium' || s === 'low') return s;
  return G && G.input && G.input.mobile ? 'medium' : 'high';
}
/** remaster on (high or medium) */
export const gfxOn = () => gfxQ() !== 'low';
/** particle / instance count factor for the remaster extras: high 1, medium 0.5 (low draws none) */
export const gfxK = () => ({ high: 1, medium: 0.5, low: 0 }[gfxQ()]);
