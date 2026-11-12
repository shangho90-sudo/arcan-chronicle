// HUD minimap (top-right). Drawn on a 2D canvas, oriented like the game camera (screen-up = camera-forward).
// The zone background (ground, paths, obstacles) is rasterised once per zone; markers are drawn every few frames.
const THEME = {
  town: ['#c9b58e', '#e2d4b2'], forest: ['#6d9a46', '#c49a63'], mist_valley: ['#6f8f78', '#b39a74'],
  frost_highland: ['#c9d6de', '#a9a49a'], dragon_ruins: ['#8e6c58', '#b0a08c'], mushroom_grove: ['#6e6488', '#a98f8a'],
};
import { CAM } from './render.js';
import { npcMapKind, drawMapIcon } from './mapicons.js';
const PPM = 3;   // background pixels per metre

export class Minimap {
  constructor(canvas) { this.c = canvas; this.ctx = canvas.getContext('2d'); this.zoneId = null; this.bg = null; this.k = 3.4; this.n = 0; }

  build(zone) {
    const d = zone.def, g = zone.geo, [x0, z0, x1, z1] = d.bounds, W = Math.ceil((x1 - x0) * PPM), H = Math.ceil((z1 - z0) * PPM);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    const [base, path] = THEME[d.id] || d.theme || (d.kind === 'town' ? THEME.town : ['#7f9a6a', '#b8a080']);
    c.fillStyle = base; c.fillRect(0, 0, W, H);
    // paths / patches
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const p of d.patches || []) {
      c.fillStyle = c.strokeStyle = p.tex === 'water' ? '#5f93c4' : p.tex === 'cobble' || p.tex === 'stone' || p.tex === 'pave' ? '#b9b2a2' : path;
      if (p.shape === 'path' && p.pos && p.pos.length >= 4) {
        c.lineWidth = (p.width || 3) * PPM; c.beginPath();
        for (let i = 0; i < p.pos.length; i += 2) { const X = (p.pos[i] - x0) * PPM, Z = (p.pos[i + 1] - z0) * PPM; i ? c.lineTo(X, Z) : c.moveTo(X, Z); }
        c.stroke();
      } else if (p.pos && p.radius > 0) { c.beginPath(); c.arc((p.pos[0] - x0) * PPM, (p.pos[1] - z0) * PPM, p.radius * PPM, 0, 6.283); c.fill(); }
      else if (p.pos && p.size) { c.fillRect((p.pos[0] - p.size[0] / 2 - x0) * PPM, (p.pos[1] - p.size[1] / 2 - z0) * PPM, p.size[0] * PPM, p.size[1] * PPM); }
    }
    // raised ground (platforms / ramps) slightly lighter
    for (const r of g.heights || []) { const q = r.rect; c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect((q[0] - x0) * PPM, (q[1] - z0) * PPM, (q[2] - q[0]) * PPM, (q[3] - q[1]) * PPM); }
    // obstacles: sample the collision geometry (trees, rocks, buildings, walls)
    const img = c.getImageData(0, 0, W, H), px = img.data, step = 1 / PPM;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = x0 + (i + 0.5) * step, z = z0 + (j + 0.5) * step;
      if (x < g.minX + 0.3 || x > g.maxX - 0.3 || z < g.minZ + 0.3 || z > g.maxZ - 0.3) continue;
      if (g.blocked(x, z, 0)) { const o = (j * W + i) * 4; px[o] *= 0.42; px[o + 1] *= 0.46; px[o + 2] *= 0.42; }
    }
    c.putImageData(img, 0, 0);
    this.bg = cv; this.zoneId = d.id; this.bounds = d.bounds;
  }

  /** world-axis directions on screen (top-down, with the camera's tilt removed) */
  basis(G, p) {
    const R = G.render, a = R.toScreen(p), b = R.toScreen({ x: p.x + 1, y: p.y, z: p.z }), c = R.toScreen({ x: p.x, y: p.y, z: p.z + 1 });
    let ex = { x: b.x - a.x, y: b.y - a.y }, ez = { x: c.x - a.x, y: c.y - a.y };
    const sp = Math.sin(CAM.pitch * Math.PI / 180); ex.y /= sp; ez.y /= sp;
    const l = Math.hypot(ex.x, ex.y) || 1, m = Math.hypot(ez.x, ez.y) || 1;
    ex = { x: ex.x / l, y: ex.y / l }; ez = { x: ez.x / m, y: ez.y / m };
    if (!isFinite(ex.x) || !isFinite(ez.x)) return this._b || { ex: { x: 1, y: 0 }, ez: { x: 0, y: 1 } };
    return (this._b = { ex, ez });
  }

  /** small HUD map around the player (redrawn every 3rd frame) */
  draw(G) {
    const z = G.zone, p = G.player; if (!z || !p) return;
    if ((this.n++ % 3) && this.zoneId === z.def.id) return;
    if (this.zoneId !== z.def.id) this.build(z);
    const cv = this.c, dpr = Math.min(2, window.devicePixelRatio || 1), cw = cv.clientWidth || 180, ch = cv.clientHeight || 180;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    this.render(G, this.ctx, cv.width, cv.height, p.pos.x, p.pos.z, this.k * (cw / 180) * dpr, dpr, false);
  }

  /** whole-area map (js/ui.js showAreaMap): the zone fitted to the canvas, then view.zoom (1 = whole map) and
   *  view.x / view.z (world-metre offset of the centre). Returns the world->canvas mapping for clicks / labels. */
  drawFull(G, cv, view) {
    const z = G.zone, p = G.player; if (!z || !p) return;
    if (this.zoneId !== z.def.id) this.build(z);
    const dpr = Math.min(2, window.devicePixelRatio || 1), cw = cv.clientWidth || 600, ch = cv.clientHeight || 600;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const W = cv.width, H = cv.height, { ex, ez } = this.basis(G, p.pos), [x0, z0, x1, z1] = this.bounds;
    // fit the (camera-rotated) zone rectangle into the canvas with a small margin
    let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
    for (const [x, zz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { const sx = x * ex.x + zz * ez.x, sy = x * ex.y + zz * ez.y; mnx = Math.min(mnx, sx); mxx = Math.max(mxx, sx); mny = Math.min(mny, sy); mxy = Math.max(mxy, sy); }
    const fit = Math.min(W / (mxx - mnx), H / (mxy - mny)) * 0.94, k = fit * (view.zoom || 1);
    const cx0 = (x0 + x1) / 2 + (view.x || 0), cz0 = (z0 + z1) / 2 + (view.z || 0);
    this.render(G, cv.getContext('2d'), W, H, cx0, cz0, k, dpr, true);
    return { k, cx: cx0, cz: cz0, ex, ez, dpr };
  }

  /** draws background + markers with (wx, wz) at the canvas centre and k canvas px per metre */
  render(G, ctx, W, H, wx, wz, k, dpr, full) {
    const z = G.zone, p = G.player, cx = W / 2, cy = H / 2;
    const { ex, ez } = this.basis(G, p.pos);
    const to = (x, zz) => ({ x: cx + ((x - wx) * ex.x + (zz - wz) * ez.x) * k, y: cy + ((x - wx) * ex.y + (zz - wz) * ez.y) * k });
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#16203a'; ctx.fillRect(0, 0, W, H);
    // background image: world (x,z) -> screen through an affine transform
    const [x0, z0] = this.bounds, o = to(x0, z0);
    ctx.setTransform(ex.x * k / PPM, ex.y * k / PPM, ez.x * k / PPM, ez.y * k / PPM, o.x, o.y);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const u = full ? 1.5 : 1;                                       // marker size on the big map
    const dot = (q, r, fill, stroke) => { ctx.beginPath(); ctx.arc(q.x, q.y, r * dpr * u, 0, 6.283); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.lineWidth = 1.2 * dpr * u; ctx.strokeStyle = stroke; ctx.stroke(); } };
    const label = (q, text, dy, col) => {
      if (!full || !text) return;
      ctx.font = `${Math.round(15 * dpr)}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.lineWidth = 3.5 * dpr; ctx.strokeStyle = 'rgba(10,14,28,.9)'; ctx.strokeText(text, q.x, q.y + dy * dpr); ctx.fillStyle = col; ctx.fillText(text, q.x, q.y + dy * dpr);
    };
    // portals
    for (const pt of z.def.portals || []) {
      const q = to(pt.pos[0], pt.pos[1]), r = 5 * dpr * u;
      ctx.beginPath(); ctx.moveTo(q.x, q.y - r); ctx.lineTo(q.x + r, q.y); ctx.lineTo(q.x, q.y + r); ctx.lineTo(q.x - r, q.y); ctx.closePath();
      ctx.fillStyle = '#62d8ff'; ctx.fill(); ctx.lineWidth = 1.2 * dpr; ctx.strokeStyle = '#0b3550'; ctx.stroke();
      label(q, pt.label || (G.data.zones[pt.targetZone] || {}).name, 9, '#bff0ff');
    }
    // 큰 건물 이름 (왕궁·길드 회관 등, 지역 전체 지도에서만)
    for (const m of (z.def.town3d && z.def.town3d.models) || []) if (m.name && m.size && m.size[0] >= 12) label(to(m.pos[0], m.pos[1]), m.name, -8, /palace/.test(m.id) ? '#ffe9a8' : '#e8ecf8');
    // monsters / boss
    for (const a of z.actors) {
      if (a === p || a.dead || !a.def || a.faction === 'player') continue;
      const boss = a === z.boss; dot(to(a.pos.x, a.pos.z), boss ? 5 : 2.6, boss ? '#c06bff' : '#ff5a4a', boss ? '#2a0838' : '#4a0a06');
    }
    // npcs: plain gold dot, or a green "?" badge when they have a quest to give or to hand in (G.questState)
    //       상점·전직 NPC는 종류 아이콘(js/mapicons.js); 퀘스트가 있으면 아이콘 오른쪽 위에 작은 "?"를 겹침
    const qn = [], ic = [];
    for (const n of z.npcs || []) {
      const st = G.questState ? G.questState(n.def.id) : '', q = to(n.pos.x, n.pos.z), kind = npcMapKind(n.def), quest = st === 'ready' || st === 'avail';
      if (kind) ic.push([q, n, kind, quest]);
      else if (quest) qn.push([q, n, 1]); else { dot(q, 3.2, '#ffe07a', '#5a3a08'); label(q, n.def.name, 6, '#ffe9b0'); }
    }
    const qbadge = (x, y, r) => {
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283);
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r); g.addColorStop(0, '#d8ffe0'); g.addColorStop(0.45, '#4fd36a'); g.addColorStop(1, '#16803a');
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.6 * dpr; ctx.strokeStyle = '#0a3a18'; ctx.stroke();
      ctx.font = `bold ${Math.round(r * 1.45)}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 2.2 * dpr; ctx.strokeStyle = '#0a3a18'; ctx.strokeText('?', x, y + r * 0.06); ctx.fillStyle = '#ffffff'; ctx.fillText('?', x, y + r * 0.06);
    };
    const ri = (full ? 11 : 7.5) * dpr;
    // 붙어 선 NPC(전직 마스터 줄 등)의 아이콘이 겹치지 않게 서로 밀어 냄 (화면 위치만, 최대 몇 px)
    for (let it = 0; it < 8; it++) for (let i = 0; i < ic.length; i++) for (let j = i + 1; j < ic.length; j++) {
      const A = ic[i][0], B = ic[j][0]; let dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy); const need = ri * 2.05;
      if (d >= need) continue; if (d < 0.01) { dx = 1; dy = 0; d = 1; }
      const m = (need - d) / 2 / d; A.x -= dx * m; A.y -= dy * m; B.x += dx * m; B.y += dy * m;
    }
    this.icons = ic.map(([q, n, kind]) => ({ id: n.def.id, kind, x: q.x, y: q.y, r: ri }));      // 확인용(tools/browser-tests/mapicons.js)
    for (const [q, n, kind, quest] of ic) {
      drawMapIcon(ctx, kind, q.x, q.y, ri);
      if (quest) qbadge(q.x + ri * 0.75, q.y - ri * 0.75, ri * 0.62);
      label(q, n.def.name, 12, quest ? '#b8ffc8' : '#ffe9b0');
    }
    for (const [q, n] of qn) { qbadge(q.x, q.y, (full ? 9 : 6.2) * dpr); label(q, n.def.name, 11, '#b8ffc8'); }
    // player arrow
    const P = p.pos, c = to(P.x, P.z);
    const f = p.facing || { x: 0, z: 1 }, fx = f.x * ex.x + f.z * ez.x, fy = f.x * ex.y + f.z * ez.y, fl = Math.hypot(fx, fy) || 1, ux = fx / fl, uy = fy / fl, s = 7 * dpr * u;
    ctx.beginPath(); ctx.moveTo(c.x + ux * s, c.y + uy * s); ctx.lineTo(c.x - ux * s * 0.6 - uy * s * 0.6, c.y - uy * s * 0.6 + ux * s * 0.6);
    ctx.lineTo(c.x - ux * s * 0.25, c.y - uy * s * 0.25); ctx.lineTo(c.x - ux * s * 0.6 + uy * s * 0.6, c.y - uy * s * 0.6 - ux * s * 0.6); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = '#1a2a4a'; ctx.stroke();
  }
}
