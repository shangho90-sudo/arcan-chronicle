// 미니맵·지역 지도의 NPC 종류 아이콘 (상점: 무기·방어구·물약·대장간, 전직 마스터: 약·망치·프라이팬·가위·팔레트).
// 종류는 NPC 데이터(role / job / shop)에서 정함 — 이름으로 정하지 않음. 그림은 캔버스 벡터(원판 + 흰 그림 + 짙은 테두리).
export const MAP_KINDS = {
  weapon:  { label: '무기 상점',   bg: '#c8463c', rim: '#4a0f0a' },
  armor:   { label: '방어구 상점', bg: '#3f78c8', rim: '#0c234a' },
  potion:  { label: '잡화·물약',   bg: '#2fa56a', rim: '#0a3a20' },
  forge:   { label: '대장간',       bg: '#7a6a5a', rim: '#2a2018' },
  job_pharmacist:  { label: '약사 전직',     bg: '#12a59a', rim: '#06403c', job: 1 },
  job_blacksmith:  { label: '대장장이 전직', bg: '#d0792a', rim: '#4a2406', job: 1 },
  job_cook:        { label: '요리사 전직',   bg: '#d9a520', rim: '#4a3604', job: 1 },
  job_hairdresser: { label: '미용사 전직',   bg: '#d0559a', rim: '#4a1034', job: 1 },
  job_artist:      { label: '예술가 전직',   bg: '#8a5ad0', rim: '#2a1250', job: 1 },
};
const SHOP_KIND = { shop_weapons: 'weapon', shop_armor: 'armor', shop_general: 'potion', shop_pharmacy: 'potion', shop_forge: 'forge', shop_smithy: 'forge' };

/** NPC 정의 → 아이콘 종류 ('' = 보통 점). 전직 마스터는 상점이 있어도 직업 아이콘. */
export function npcMapKind(def) {
  if (!def) return '';
  if (def.role === 'jobmaster' && def.job && MAP_KINDS['job_' + def.job]) return 'job_' + def.job;
  return SHOP_KIND[def.shop] || '';
}

// 그림: 단위 좌표(-1..1), 흰 채움 + 짙은 선
const GLYPH = {
  weapon(c) {      // 칼 (오른쪽 위로)
    c.save(); c.rotate(Math.PI / 4);
    poly(c, [[-0.2, -0.72], [0, -1.0], [0.2, -0.72], [0.2, 0.22], [-0.2, 0.22]]);
    rect(c, -0.5, 0.22, 1.0, 0.2); rect(c, -0.12, 0.42, 0.24, 0.34); circ(c, 0, 0.84, 0.15);
    c.restore();
  },
  armor(c) {       // 방패
    c.beginPath(); c.moveTo(-0.62, -0.62); c.lineTo(0.62, -0.62); c.lineTo(0.62, 0); c.quadraticCurveTo(0.56, 0.58, 0, 0.84); c.quadraticCurveTo(-0.56, 0.58, -0.62, 0); c.closePath(); ink(c);
    c.beginPath(); c.moveTo(0, -0.62); c.lineTo(0, 0.84); c.moveTo(-0.62, -0.08); c.lineTo(0.62, -0.08); line(c);
  },
  potion(c) {      // 둥근 물약병
    circ(c, 0, 0.26, 0.56); rect(c, -0.17, -0.62, 0.34, 0.44); rect(c, -0.27, -0.8, 0.54, 0.2);
    c.beginPath(); c.arc(0, 0.26, 0.56, 0.12, Math.PI - 0.12); c.closePath(); c.fillStyle = 'rgba(0,0,0,.28)'; c.fill();
  },
  forge(c) {       // 모루
    poly(c, [[-0.8, -0.5], [0.62, -0.5], [0.62, -0.16], [0.24, -0.1], [0.2, 0.3], [0.5, 0.36], [0.5, 0.66], [-0.5, 0.66], [-0.5, 0.36], [-0.2, 0.3], [-0.24, -0.1], [-0.46, -0.16]]);
  },
  job_pharmacist(c) {   // 알약 (캡슐)
    c.save(); c.rotate(-Math.PI / 4);
    c.beginPath(); c.moveTo(-0.44, -0.34); c.lineTo(0.44, -0.34); c.arc(0.44, 0, 0.34, -Math.PI / 2, Math.PI / 2); c.lineTo(-0.44, 0.34); c.arc(-0.44, 0, 0.34, Math.PI / 2, Math.PI * 1.5); c.closePath(); ink(c);
    c.beginPath(); c.moveTo(0, -0.34); c.lineTo(0.44, -0.34); c.arc(0.44, 0, 0.34, -Math.PI / 2, Math.PI / 2); c.lineTo(0, 0.34); c.closePath(); c.fillStyle = 'rgba(0,0,0,.3)'; c.fill();
    c.restore();
  },
  job_blacksmith(c) {   // 망치
    c.save(); c.rotate(Math.PI / 4);
    rect(c, -0.1, -0.3, 0.2, 1.2); rect(c, -0.52, -0.82, 1.04, 0.5);
    c.restore();
  },
  job_cook(c) {         // 프라이팬
    c.save(); c.rotate(-Math.PI / 4);
    rect(c, -0.11, 0.2, 0.22, 0.78); circ(c, 0, -0.26, 0.56);
    c.beginPath(); c.arc(0, -0.26, 0.34, 0, 6.283); line(c);
    c.restore();
  },
  job_hairdresser(c) {  // 가위
    c.save(); c.lineCap = 'round';
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * 0.3, 0.3); c.lineTo(-s * 0.36, -0.86); c.lineTo(-s * 0.12, -0.86); c.lineTo(s * 0.46, 0.2); c.closePath(); ink(c);
      c.beginPath(); c.arc(s * 0.42, 0.56, 0.26, 0, 6.283); c.lineWidth = 0.2; c.strokeStyle = INK; c.stroke(); c.lineWidth = 0.1; c.strokeStyle = '#fff'; c.stroke();
    }
    c.restore();
  },
  job_artist(c) {       // 팔레트
    c.beginPath(); c.moveTo(0.78, -0.1); c.bezierCurveTo(0.78, -0.72, 0.2, -0.86, -0.2, -0.8); c.bezierCurveTo(-0.9, -0.7, -1.0, 0.2, -0.5, 0.62);
    c.bezierCurveTo(-0.1, 0.92, 0.5, 0.82, 0.42, 0.44); c.bezierCurveTo(0.36, 0.14, 0.78, 0.3, 0.78, -0.1); c.closePath(); ink(c);
    for (const [x, y, col] of [[-0.42, -0.38, '#e0483c'], [0.08, -0.5, '#f0c020'], [-0.52, 0.14, '#3c8ae0'], [0.42, -0.22, '#3cb060']]) { c.beginPath(); c.arc(x, y, 0.15, 0, 6.283); c.fillStyle = col; c.fill(); }
  },
};
const INK = 'rgba(8,12,24,.92)';
function ink(c) { c.lineJoin = 'round'; c.lineWidth = 0.14; c.strokeStyle = INK; c.stroke(); c.fillStyle = '#fff'; c.fill(); }
function line(c) { c.lineWidth = 0.09; c.strokeStyle = INK; c.stroke(); }
function poly(c, p) { c.beginPath(); p.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); ink(c); }
function rect(c, x, y, w, h) { c.beginPath(); c.rect(x, y, w, h); ink(c); }
function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, 6.283); ink(c); }

/** (x, y) 가운데에 반지름 r(캔버스 px) 원판 아이콘 */
export function drawMapIcon(ctx, kind, x, y, r) {
  const K = MAP_KINDS[kind]; if (!K) return false;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283);
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.22, K.bg); g.addColorStop(1, K.bg);
  ctx.fillStyle = K.bg; ctx.fill(); ctx.globalAlpha = 0.35; ctx.fillStyle = g; ctx.fill(); ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(1.5, r * 0.2); ctx.strokeStyle = K.rim; ctx.stroke();
  ctx.lineWidth = Math.max(0.8, r * 0.09); ctx.strokeStyle = K.job ? '#ffe9a8' : 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(x, y, r * 0.86, 0, 6.283); ctx.stroke();
  ctx.translate(x, y); ctx.scale(r * 0.72, r * 0.72); GLYPH[kind](ctx);
  ctx.restore();
  return true;
}

const urls = new Map();
/** 범례·목록용 그림 주소 (한 번 그려 캐시) */
export function mapIconURL(kind, px = 40) {
  const key = kind + ':' + px; if (urls.has(key)) return urls.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = px;
  const ok = drawMapIcon(cv.getContext('2d'), kind, px / 2, px / 2, px / 2 - 2);
  const u = ok ? cv.toDataURL() : ''; urls.set(key, u); return u;
}
