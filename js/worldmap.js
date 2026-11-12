// 세계 지도 (용흔 대륙), navy + gold chart (2026-11-07 design): painted continent background
// (assets/ui/worldmap_bg.jpg from tools/world/paint_map.py — sea, coast, mountains, forests, rivers, compass, ship),
// with the live data drawn on top as SVG: region names, dashed roads between linked zones, towns as gold castles,
// fields as biome-coloured gems, the player's zone with a glowing marker. Tap a place for its details; +/- zoom.
// Opened with M or the 지도 button. Map text uses ArcanSerif (Noto Serif KR subset, assets/fonts).

const PAD = [90, 80];       // sea margin round the 1000 x 760 map area: must match OX / OY in tools/world/paint_map.py
const BIOME_COL = { meadow: '#a6d05c', woods: '#4f9a3e', blue: '#4fb4dc', crimson: '#e0503c', stone: '#a8a69a', frost: '#dff0fa', ash: '#9a948a',
  abyss: '#9a6ad0', highland: '#e0a84c', marsh: '#5fae84', canyon: '#e08a4a', river: '#62b8e0', town: '#f0c84a' };
const OLD_BIOME = { forest: 'woods', mushroom_grove: 'abyss', mist_valley: 'marsh', frost_highland: 'frost', dragon_ruins: 'highland' };
const BIOME_KR = { meadow: '들판', woods: '숲', blue: '환영의 숲', crimson: '붉은 숲', stone: '바위산', frost: '설원', ash: '황무지', abyss: '심연', highland: '고원', marsh: '습지', canyon: '협곡', river: '강변' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const biomeOf = z => z.kind === 'town' ? 'town' : (z.biome || OLD_BIOME[z.id] || 'meadow');

const CASTLE = `<path d="M-14,10 V-3 H-10 V-8 H-6.5 V-3 H-3 V-11 H3 V-3 H6.5 V-8 H10 V-3 H14 V10 Z" fill="url(#wmgold)" stroke="#3a2208" stroke-width="2" stroke-linejoin="round"/>
<path d="M-2.6,10 V4.5 a2.6,2.6 0 0 1 5.2,0 V10 Z" fill="#3a2208"/><path d="M0,-11 V-18 L6,-15.5 L0,-13" fill="#c8402e" stroke="#3a2208" stroke-width="1"/>
<path d="M-10,-8 h3.5 M6.5,-8 h3.5 M-3,-11 h6" stroke="#fff3c0" stroke-width="1" opacity=".7"/>`;

export function worldMapSvg(data, here) {
  const W = data.world || { regions: [], links: [], size: [1000, 760] }, [SW, SH] = W.size || [1000, 760];
  const Z = Object.values(data.zones).filter(z => z.map), at = id => data.zones[id] && data.zones[id].map;
  const vb = [-PAD[0], -PAD[1], SW + 2 * PAD[0], SH + 2 * PAD[1]];
  let s = `<svg class="wmsvg" viewBox="${vb.join(' ')}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
<defs>
 <linearGradient id="wmgold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".45" stop-color="#f0c040"/><stop offset="1" stop-color="#a86a10"/></linearGradient>
 <radialGradient id="wmgem" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".35" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient>
 <radialGradient id="wmhalo"><stop offset="0" stop-color="#fff2a8" stop-opacity=".95"/><stop offset=".45" stop-color="#ffd25a" stop-opacity=".55"/><stop offset="1" stop-color="#ffb020" stop-opacity="0"/></radialGradient>
</defs>
<pattern id="wmwave" width="60" height="30" patternUnits="userSpaceOnUse"><path d="M4 18 q8 -7 16 0 t16 0" fill="none" stroke="#d2e6ee" stroke-opacity=".22" stroke-width="1.4"/></pattern>
<rect x="-4000" y="-3000" width="9000" height="7000" fill="#0e2c4c"/><rect x="-4000" y="-3000" width="9000" height="7000" fill="url(#wmwave)"/>
<image href="assets/ui/worldmap_bg.jpg" x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" preserveAspectRatio="none"/>`;
  // region names (painted-in feel: dark ink with a light halo)
  for (const r of W.regions || []) s += `<text class="wmregion" x="${r.x}" y="${r.y}" text-anchor="${r.anchor || 'middle'}">${esc(r.name)}</text>`;
  // roads: dark under-stroke + dashed ochre line
  for (const [a, b] of W.links || []) { const p = at(a), q = at(b); if (!p || !q) continue; const d = `M${p[0]},${p[1]} L${q[0]},${q[1]}`; s += `<path d="${d}" class="wmroad0"/><path d="${d}" class="wmroad"/>`; }
  // places
  for (const z of Z) {
    const [x, y] = z.map, cur = z.id === here, town = z.kind === 'town', col = BIOME_COL[biomeOf(z)];
    s += `<g class="wmnode${cur ? ' here' : ''}${town ? ' town' : ''}" data-z="${z.id}" transform="translate(${x} ${y})">`;
    if (cur) s += `<circle r="30" fill="url(#wmhalo)"/><circle r="20" class="wmpulse"/>`;
    if (town) s += `<g transform="scale(1.15)">${CASTLE}</g>`;
    else s += `<circle r="11" fill="#2a1a0c"/><circle r="9" fill="${col}" stroke="#fffaf0" stroke-width="2"/><circle r="9" fill="url(#wmgem)"/>`;
    if (cur) s += `<path d="M0,${town ? -26 : -20} l-7,-11 h14 Z" fill="url(#wmgold)" stroke="#3a2208" stroke-width="1.6"/>`;
    s += `<rect x="-34" y="-30" width="68" height="62" fill="transparent"/>`;
    s += `<text class="wmlabel${town ? ' town' : ''}${cur ? ' cur' : ''}" y="${town ? 29 : 26}" text-anchor="middle">${esc(z.name)}</text></g>`;
  }
  return s + `</svg>`;
}

/** label layout for the current zoom: labels keep a constant on-screen size (towns 14 px, fields 12 px, regions
 *  18-30 px), each tries 8 spots round its marker and takes the first that hits no marker / other label (region names
 *  are a soft obstacle); field labels that fit nowhere are hidden until you zoom in (or select / hover them). */
function layoutLabels(svg, selId) {
  const ctm = svg.getScreenCTM(); if (!ctm) return; const k = ctm.a || 1;              // screen px per map unit
  const boxes = [], hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const nodes = [...svg.querySelectorAll('.wmnode')].map(g => { const t = g.transform.baseVal.consolidate().matrix; return { g, x: t.e, y: t.f, town: g.classList.contains('town'), cur: g.classList.contains('here'), id: g.dataset.z }; });
  for (const n of nodes) { const r = (n.town ? 21 : 11) + 1 / k; boxes.push({ x0: n.x - r, x1: n.x + r, y0: n.y - r - (n.town ? 6 : 0), y1: n.y + r, hard: true }); }
  const VB = svg.viewBox.baseVal, regs = [...svg.querySelectorAll('.wmregion')], rpx = Math.max(16, Math.min(28, 31 * k));
  for (const t of regs) { t.style.fontSize = (rpx / k) + 'px'; t.style.letterSpacing = (3 / k) + 'px'; t.style.strokeWidth = (4 / k) + 'px'; }
  const order = nodes.slice().sort((a, b) => (b.cur - a.cur) || ((b.id === selId) - (a.id === selId)) || (b.town - a.town));
  for (const n of order) {
    const t = n.g.querySelector('.wmlabel'), px = n.cur ? 15 : n.town ? 14 : 12, fs = px / k, len = [...t.textContent].length;
    t.style.fontSize = fs + 'px'; t.style.strokeWidth = (3.2 / k) + 'px';
    const w = len * fs * 0.95, h = fs * 1.15, r = (n.town ? 22 : 12) + 2 / k;
    const C = [[0, r + fs * 0.95, 'middle'], [0, -r - fs * 0.3 - (n.cur ? 12 : 0), 'middle'], [r + 3 / k, fs * 0.35, 'start'], [-r - 3 / k, fs * 0.35, 'end'],
      [r * 0.7, r + fs * 0.9, 'start'], [-r * 0.7, r + fs * 0.9, 'end'], [r * 0.7, -r - fs * 0.2, 'start'], [-r * 0.7, -r - fs * 0.2, 'end']];
    let best = null, bestCost = 1e9;
    for (const [dx, dy, an] of C) {
      const x0 = an === 'middle' ? n.x + dx - w / 2 : an === 'start' ? n.x + dx : n.x + dx - w, b = { x0, x1: x0 + w, y0: n.y + dy - fs * 0.85, y1: n.y + dy - fs * 0.85 + h };
      let cost = 0; for (const o of boxes) if (o.g !== n.g && hit(b, o)) cost += o.soft ? 1 : 100;
      if (cost < bestCost) { bestCost = cost; best = { dx, dy, an, b }; if (!cost) break; }
    }
    const show = bestCost < 100 || n.town || n.cur || n.id === selId;
    t.style.display = show ? '' : 'none'; n.g.classList.toggle('lblhid', !show);
    if (show) { t.setAttribute('x', best.dx); t.setAttribute('y', best.dy); t.setAttribute('text-anchor', best.an); boxes.push(Object.assign(best.b, { hard: true, g: n.g })); }
  }
  // region names go last: each slides (up to ~2 letters' height / width) to the spot that covers the fewest places
  for (const t of regs) {
    const x0 = +(t.dataset.x ??= t.getAttribute('x')), y0 = +(t.dataset.y ??= t.getAttribute('y'));
    t.setAttribute('x', x0); t.setAttribute('y', y0); const bb = t.getBBox(), step = rpx / k * 0.55;
    let best = [0, 0], bc = 1e9;
    // 넓게 찾음(2026-11-12: '그라벨 변경령'·'베르그 고원'이 장소 이름 밑에 깔려 흐려졌음) — 가까운 자리부터, 아무것도 안 가리는 첫 자리
    const DY = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6, -7, 7, -8, 8, -9, 9, -10, 10], DX = [0, -1.5, 1.5, -3, 3, -4.5, 4.5, -6, 6, -7.5, 7.5, -9, 9, -10.5, 10.5];
    for (const dy of DY) for (const dx of DX) {
      const b = { x0: bb.x + dx * step, x1: bb.x + bb.width + dx * step, y0: bb.y + dy * step, y1: bb.y + bb.height + dy * step };
      if ((dx || dy) && (b.x0 < VB.x + 4 || b.y0 < VB.y + 4 || b.x1 > VB.x + VB.width - 4 || b.y1 > VB.y + VB.height - 4)) continue;   // 옮길 때는 지도 밖으로 내보내지 않음
      let c = Math.abs(dx) * 0.2 + Math.abs(dy) * 0.25; for (const o of boxes) if (hit(b, o)) c += 10;
      if (c < bc) { bc = c; best = [dx * step, dy * step]; }
    }
    t.setAttribute('x', x0 + best[0]); t.setAttribute('y', y0 + best[1]); t.style.opacity = bc >= 10 ? '.42' : '';   // still crowded: fade it under the places
    const b2 = t.getBBox(); boxes.push({ x0: b2.x, x1: b2.x + b2.width, y0: b2.y, y1: b2.y + b2.height, hard: true });
  }
}

const LOGO_WING = `<svg viewBox="0 0 120 50" class="wmwing"><path d="M118 30 C96 26 86 12 64 6 C70 14 66 18 58 16 C62 22 56 26 48 23 C52 30 44 33 36 29 C38 36 30 38 22 33 C22 40 12 40 2 36 C22 48 60 46 84 40 C98 37 108 34 118 30 Z" fill="url(#lg)" stroke="#3a2208" stroke-width="1.6"/><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6dc8a"/><stop offset="1" stop-color="#8a5a14"/></linearGradient></defs></svg>`;
const COMPASS = `<svg viewBox="-40 -40 80 80" class="wmcompass"><circle r="30" fill="none" stroke="#c9a24a" stroke-width="1.5"/><circle r="24" fill="none" stroke="#c9a24a" stroke-width=".8"/>
${[0, 90, 180, 270].map(a => `<path d="M0,-36 L5,0 L0,5 L-5,0 Z" transform="rotate(${a})" fill="#e8c46a" stroke="#6a4a14" stroke-width=".8"/>`).join('')}
${[45, 135, 225, 315].map(a => `<path d="M0,-22 L3.5,0 L0,3 L-3.5,0 Z" transform="rotate(${a})" fill="#b8902e"/>`).join('')}<circle r="3" fill="#f6dc8a"/></svg>`;
const SKYLINE = `<svg viewBox="0 0 220 70" class="wmskyline"><path d="M0 70 V52 H14 V40 H20 V30 L25 22 L30 30 V40 H38 V48 H52 V34 H58 V18 L64 6 L70 18 V34 H78 V44 H92 V26 H98 V12 L104 2 L110 12 V26 H118 V40 H132 V30 H140 V20 L146 10 L152 20 V30 H160 V46 H176 V36 H184 V28 L189 20 L194 28 V36 H202 V50 H220 V70 Z" fill="#c9a24a" opacity=".55"/>
<path d="M0 70 V60 H220 V70 Z" fill="#c9a24a" opacity=".35"/></svg>`;

export function showWorldMap(ui) {
  const D = G.data, here = G.zone && G.zone.def.id, b = ui.open('worldmap', '세계 지도', 1400, 0);
  const wnd = ui.current, cur = D.zones[here];
  const logo = document.createElement('div'); logo.className = 'wmlogo';
  logo.innerHTML = `${LOGO_WING}<div><b>아르칸 연대기</b><small>ARKAN CHRONICLES</small></div>${LOGO_WING.replace('class="wmwing"', 'class="wmwing r"')}`;
  wnd.appendChild(logo);
  const cp = document.createElement('div'); cp.className = 'wmcorner'; cp.innerHTML = COMPASS; wnd.appendChild(cp);
  const top = document.createElement('div'); top.className = 'wmtop'; b.appendChild(top);
  top.innerHTML = `<span class="wmhere"><i class="dia">◆</i> 현재 위치 <b>${esc(cur ? cur.name : '')}</b></span><span class="wmsep"></span>` +
    `<span class="wmlegend"><i class="lt"></i>마을 <i class="lf"></i>필드 <i class="lh"></i>현재 위치</span>`;
  const zb = document.createElement('span'); zb.className = 'wmzoom'; top.appendChild(zb);
  const box = document.createElement('div'); box.className = 'wmbox'; b.appendChild(box);
  const inner = document.createElement('div'); inner.className = 'wminner'; inner.innerHTML = worldMapSvg(D, here); box.appendChild(inner);
  const info = document.createElement('div'); info.className = 'wminfo'; b.appendChild(info);
  const txt = document.createElement('div'); txt.className = 'wminfotxt'; info.appendChild(txt);
  const sk = document.createElement('div'); sk.className = 'wminfoart'; sk.innerHTML = SKYLINE; info.appendChild(sk);
  const SZ = D.world && D.world.size || [1000, 760];
  let zoom = 1;
  // the chart fills the frame: the box is as wide as the window, its height follows the screen, the SVG keeps its aspect
  // ("meet") and the open sea around it is the box's own painted-sea background
  let selId = here; const relayout = () => requestAnimationFrame(() => layoutLabels(inner.querySelector('svg'), selId));
  const setZoom = (z, focus) => {
    zoom = Math.max(1, Math.min(3.5, z)); inner.style.width = (zoom * 100) + '%'; inner.style.height = (zoom * 100) + '%'; relayout();
    if (focus) requestAnimationFrame(() => { const r = inner.getBoundingClientRect(), Wv = SZ[0] + 2 * PAD[0], Hv = SZ[1] + 2 * PAD[1];
      const k = Math.min(r.width / Wv, r.height / Hv), ox = (r.width - Wv * k) / 2, oy = (r.height - Hv * k) / 2, sc = box.getBoundingClientRect().width / (box.offsetWidth || 1) || 1;
      box.scrollLeft = (ox + (focus[0] + PAD[0]) * k) / sc - box.clientWidth / 2; box.scrollTop = (oy + (focus[1] + PAD[1]) * k) / sc - box.clientHeight / 2; });
  };
  const zbtn = (t, fn) => { const x = document.createElement('button'); x.className = 'wmzb'; x.textContent = t; x.onclick = () => { G.audio.sfx('ui'); fn(); }; zb.appendChild(x); };
  zbtn('－', () => setZoom(zoom - 0.5, cur && cur.map)); zbtn('＋', () => setZoom(zoom + 0.5, cur && cur.map));
  const show = id => {
    const z = D.zones[id]; if (!z) return;
    const links = (D.world && D.world.links || []).filter(l => l.includes(id)).map(l => D.zones[l[0] === id ? l[1] : l[0]]).filter(Boolean);
    const reg = (D.world && D.world.regions || []).find(r => r.id === z.region);
    const kind = z.kind === 'town' ? '마을' : '필드 · ' + (BIOME_KR[biomeOf(z)] || '');
    const lv = z.level && z.kind !== 'town' ? `<span class="wmlv">권장 Lv ${z.level[0]}~${z.level[1]}</span>` : '';
    txt.innerHTML = `<div class="wmname"><b>${esc(z.name)}</b> <small>${esc(kind)}${reg ? ' · ' + esc(reg.name) : ''}</small> ${lv}${id === here ? ' <span class="wmlv here">현재 위치</span>' : ''}</div>` +
      `<div class="wmlinks"><span>이어진 곳 :</span> ${links.map(l => `<b>${esc(l.name)}</b>`).join(', ') || '없음'}</div>`;
    for (const n of inner.querySelectorAll('.wmnode')) n.classList.toggle('sel', n.dataset.z === id);
    if (selId !== id) { selId = id; relayout(); }
  };
  // mouse wheel zooms around the pointer's place on the map
  box.addEventListener('wheel', e => { e.preventDefault(); const r = box.getBoundingClientRect(), fx = (box.scrollLeft + e.clientX - r.left) / inner.offsetWidth, fy = (box.scrollTop + e.clientY - r.top) / inner.offsetHeight;
    setZoom(zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)); requestAnimationFrame(() => { box.scrollLeft = fx * inner.offsetWidth - (e.clientX - r.left); box.scrollTop = fy * inner.offsetHeight - (e.clientY - r.top); }); }, { passive: false });
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (!box.isConnected) return ro.disconnect(); relayout(); }); ro.observe(box); }
  for (const n of inner.querySelectorAll('.wmnode')) n.addEventListener('click', () => { G.audio.sfx('ui'); show(n.dataset.z); });
  show(here);
  setZoom(G.input && G.input.mobile ? 1.7 : 1, cur && cur.map);
}
