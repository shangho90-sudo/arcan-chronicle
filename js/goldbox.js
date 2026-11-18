// 금테 대화 상자(공용) — 프롤로그(js/prologue.js)와 메인 스토리 대화 장면(js/storyscene.js)이 같은 상자를 씀(2026-11-17, 사용자 그림).
// 모양은 index.html "금테 대화 상자" CSS 블록(.gb-*): 남색~보라 반투명 상자, 금빛 이중 테 + 네 모서리 장식(border-image SVG),
// 위 가운데 네 갈래 별 + 양옆 금선, 왼쪽 위 이름 패(양 끝 다이아몬드), 오른쪽 위 쪽수, 본문 아래 금 구분선,
// 왼쪽 아래 다이아몬드 진행 점, 오른쪽 아래 '계속 읽기 →'(뾰족한 금테 단추). 대사 글꼴은 CSS 변수 --gb-font.

/** star ornament on the top edge (put it first inside .gb-box) */
export const GB_STAR = '<span class="gb-star" aria-hidden="true"></span>';

/** two-digit "01 / 06" page counter */
export const gbCount = (i, n) => `${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;

/** diamond progress dots: pages before and at i are filled, i glows */
export const gbSteps = (i, n) => Array.from({ length: n }, (_, k) => `<i class="${k < i ? 'lit' : k === i ? 'lit cur' : ''}"></i>`).join('');
