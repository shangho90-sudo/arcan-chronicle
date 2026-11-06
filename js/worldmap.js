// 세계 지도 (용흔 대륙): every town and field from zones.json (map / level / region / biome stubs written by
// tools/world/world.py, plus "world": regions and links) drawn as one SVG — painted continent, region names, roads
// between linked zones, towns as castles, fields as coloured markers, the player's zone highlighted.
// Tap a place for its details; +/- zoom (the map scrolls inside the window). Opened with M or the 지도 button.

const BIOME_COL = { meadow: '#9cc56a', woods: '#4f8a3e', blue: '#5aa6c8', crimson: '#c0503c', stone: '#9a9a8a', frost: '#cfe2ee', ash: '#8a8478',
  abyss: '#7a5aa8', highland: '#c8a464', marsh: '#5f8f78', canyon: '#c08a58', river: '#6fb0d0', town: '#e8c45a' };
const OLD_BIOME = { forest: 'woods', mushroom_grove: 'abyss', mist_valley: 'marsh', frost_highland: 'frost', dragon_ruins: 'highland' };
const BIOME_KR = { meadow: '들판', woods: '숲', blue: '환영의 숲', crimson: '붉은 숲', stone: '바위산', frost: '설원', ash: '황무지', abyss: '심연', highland: '고원', marsh: '습지', canyon: '협곡', river: '강변' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function hash(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

/** continent outline: farthest place in each direction from the centre + margin + gentle noise, smoothed */
function coast(pts, cx, cy, margin, n = 72) {
  const r = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a); let best = 120;
    for (const [x, y] of pts) { const dx = x - cx, dy = y - cy, along = dx * ux + dy * uy, side = Math.abs(-dx * uy + dy * ux); if (side < 110) best = Math.max(best, along + Math.max(0, 40 - side * 0.3)); }
    r.push(best + margin + (hash(i) - 0.5) * 34);
  }
  for (let k = 0; k < 2; k++) for (let i = 0; i < n; i++) r[i] = (r[(i + n - 1) % n] + r[i] * 2 + r[(i + 1) % n]) / 4;
  const P = r.map((v, i) => [cx + Math.cos(i / n * Math.PI * 2) * v, cy + Math.sin(i / n * Math.PI * 2) * v]);
  let d = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; d += ` Q${a[0].toFixed(1)},${a[1].toFixed(1)} ${m[0].toFixed(1)},${m[1].toFixed(1)}`; }
  return d + 'Z';
}

export function worldMapSvg(data, here) {
  const W = data.world || { regions: [], links: [], size: [1000, 760] }, [SW, SH] = W.size || [1000, 760];
  const Z = Object.values(data.zones).filter(z => z.map);
  const at = id => data.zones[id] && data.zones[id].map;
  const pts = Z.map(z => z.map), cx = SW / 2, cy = SH / 2 + 10;
  let s = `<svg class="wmsvg" viewBox="0 0 ${SW} ${SH}" xmlns="http://www.w3.org/2000/svg">
<defs>
 <radialGradient id="wmsea" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#3a6a8c"/><stop offset="1" stop-color="#14304a"/></radialGradient>
 <radialGradient id="wmland" cx="50%" cy="45%" r="65%"><stop offset="0" stop-color="#ecdcae"/><stop offset=".75" stop-color="#d8c290"/><stop offset="1" stop-color="#b89c68"/></radialGradient>
 <filter id="wmsoft"><feGaussianBlur stdDeviation="18"/></filter>
 <pattern id="wmwave" width="46" height="22" patternUnits="userSpaceOnUse"><path d="M2 14 q9 -8 18 0 t18 0" fill="none" stroke="#9cc4dc" stroke-opacity=".28" stroke-width="1.6"/></pattern>
</defs>
<rect width="${SW}" height="${SH}" fill="url(#wmsea)"/><rect width="${SW}" height="${SH}" fill="url(#wmwave)"/>`;
  const land = coast(pts, cx, cy, 70);
  s += `<path d="${land}" fill="#0c2236" opacity=".45" transform="translate(6 9)"/><path d="${land}" fill="url(#wmland)" stroke="#6e5434" stroke-width="3"/>`;
  s += `<path d="${land}" fill="none" stroke="#f4e8c8" stroke-opacity=".5" stroke-width="1.2" transform="translate(0 -3) scale(1)"/>`;
  // biome washes under each place (soft blobs), the Zirat scar darker
  s += `<g filter="url(#wmsoft)" opacity=".55">`;
  for (const z of Z) { const b = z.kind === 'town' ? null : (z.biome || OLD_BIOME[z.id]); if (!b) continue; s += `<circle cx="${z.map[0]}" cy="${z.map[1]}" r="46" fill="${BIOME_COL[b]}"/>`; }
  s += `</g>`;
  // mountains / trees doodles for flavour
  for (const z of Z) {
    const b = z.biome || OLD_BIOME[z.id], [x, y] = z.map;
    if (b === 'stone' || b === 'canyon' || b === 'frost') for (let k = 0; k < 3; k++) { const ox = x - 30 + k * 22 + hash(x + k) * 8, oy = y - 26 + hash(y + k) * 10; s += `<path d="M${ox - 11},${oy + 9} L${ox},${oy - 9} L${ox + 11},${oy + 9}Z" fill="${b === 'frost' ? '#eef4f8' : '#a39a86'}" stroke="#5e5040" stroke-width="1.2"/><path d="M${ox - 4},${oy - 3} L${ox},${oy - 9} L${ox + 4},${oy - 3}" fill="#fff" opacity=".8"/>`; }
    if (b === 'woods' || b === 'blue' || b === 'crimson' || b === 'marsh' || b === 'abyss') for (let k = 0; k < 4; k++) { const ox = x - 34 + k * 20 + hash(x * 3 + k) * 10, oy = y + 18 + hash(y * 3 + k) * 10; s += `<circle cx="${ox}" cy="${oy}" r="7" fill="${BIOME_COL[b]}" stroke="#3a3020" stroke-width="1"/><rect x="${ox - 1}" y="${oy + 6}" width="2" height="5" fill="#5a4030"/>`; }
  }
  // region names
  for (const r of W.regions || []) s += `<text class="wmregion" x="${r.x}" y="${r.y}" text-anchor="${r.anchor || 'middle'}">${esc(r.name)}</text>`;
  // roads
  for (const [a, b] of W.links || []) { const p = at(a), q = at(b); if (!p || !q) continue; s += `<path d="M${p[0]},${p[1]} L${q[0]},${q[1]}" class="wmroad"/>`; }
  // places
  for (const z of Z) {
    const [x, y] = z.map, cur = z.id === here, town = z.kind === 'town', col = BIOME_COL[town ? 'town' : (z.biome || OLD_BIOME[z.id])] || '#ccc';
    s += `<g class="wmnode${cur ? ' here' : ''}" data-z="${z.id}" transform="translate(${x} ${y})">`;
    if (cur) s += `<circle r="22" class="wmpulse"/>`;
    if (town) s += `<path d="M-13,9 V-4 H-9 V-9 H-5 V-4 H-2 V-12 H2 V-4 H5 V-9 H9 V-4 H13 V9 Z" fill="${col}" stroke="#4a3418" stroke-width="2"/><rect x="-3" y="2" width="6" height="7" fill="#4a3418"/>`;
    else s += `<circle r="8.5" fill="${col}" stroke="#3a2a18" stroke-width="2.2"/><circle r="3" fill="#fff8e0" opacity=".85"/>`;
    s += `<rect x="-30" y="-30" width="60" height="60" fill="transparent"/>`;
    s += `<text class="wmlabel${town ? ' town' : ''}" y="${town ? 26 : 23}" text-anchor="middle">${esc(z.name)}</text></g>`;
  }
  return s + `</svg>`;
}

export function showWorldMap(ui) {
  const D = G.data, here = G.zone && G.zone.def.id, b = ui.open('worldmap', '세계 지도', 1380, 0);
  const top = document.createElement('div'); top.className = 'wmtop'; b.appendChild(top);
  const cur = D.zones[here];
  top.innerHTML = `<span class="wmhere">현재 위치 <b>${esc(cur ? cur.name : '')}</b></span><span class="wmlegend"><i class="lt"></i>마을 <i class="lf"></i>필드 <i class="lh"></i>현재 위치</span>`;
  const zb = document.createElement('span'); zb.className = 'wmzoom'; top.appendChild(zb);
  const box = document.createElement('div'); box.className = 'wmbox'; b.appendChild(box);
  const inner = document.createElement('div'); inner.className = 'wminner'; inner.innerHTML = worldMapSvg(D, here); box.appendChild(inner);
  const info = document.createElement('div'); info.className = 'wminfo'; b.appendChild(info);
  let zoom = 1; const SZ = D.world && D.world.size || [1000, 760];
  const fitW = () => { const k = (box.getBoundingClientRect().width / (box.offsetWidth || 1)) || 1; return Math.min(box.clientWidth || 1000, Math.max(240, window.innerHeight * 0.66 / k * SZ[0] / SZ[1])); };
  const setZoom = (z, focus) => {
    zoom = Math.max(1, Math.min(3, z)); inner.style.width = Math.round(zoom * fitW()) + 'px'; inner.style.margin = zoom === 1 ? '0 auto' : '0';
    if (focus) requestAnimationFrame(() => { const r = inner.getBoundingClientRect(), W0 = (D.world && D.world.size || [1000, 760]); box.scrollLeft = focus[0] / W0[0] * r.width - box.clientWidth / 2; box.scrollTop = focus[1] / W0[1] * r.height - box.clientHeight / 2; });
  };
  ui.button(zb, '－', 'blue', () => setZoom(zoom - 0.5, cur && cur.map)); ui.button(zb, '＋', 'blue', () => setZoom(zoom + 0.5, cur && cur.map));
  const show = id => {
    const z = D.zones[id]; if (!z) return;
    const links = (D.world && D.world.links || []).filter(l => l.includes(id)).map(l => D.zones[l[0] === id ? l[1] : l[0]]).filter(Boolean);
    const reg = (D.world && D.world.regions || []).find(r => r.id === z.region);
    const kind = z.kind === 'town' ? '마을' : '필드 · ' + (BIOME_KR[z.biome || OLD_BIOME[z.id]] || '');
    const lv = z.level ? (z.kind === 'town' ? '' : `권장 Lv ${z.level[0]}~${z.level[1]}`) : '';
    info.innerHTML = `<b>${esc(z.name)}</b> <small>${esc(kind)}${reg ? ' · ' + esc(reg.name) : ''}</small> ${lv ? `<span class="wmlv">${lv}</span>` : ''}${id === here ? ' <span class="wmlv here">현재 위치</span>' : ''}` +
      `<div class="small muted">이어진 곳: ${links.map(l => esc(l.name)).join(', ') || '없음'}</div>`;
    for (const n of inner.querySelectorAll('.wmnode')) n.classList.toggle('sel', n.dataset.z === id);
  };
  for (const n of inner.querySelectorAll('.wmnode')) n.addEventListener('click', () => { G.audio.sfx('ui'); show(n.dataset.z); });
  show(here);
  setZoom(G.input && G.input.mobile ? 1.6 : 1, cur && cur.map);
}
