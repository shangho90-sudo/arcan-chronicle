// HUD minimap (top-right). Drawn on a 2D canvas, oriented like the game camera (screen-up = camera-forward).
// The zone background (ground, paths, obstacles) is rasterised once per zone; markers are drawn every few frames.
const THEME = {
  town: ['#c9b58e', '#e2d4b2'], forest: ['#6d9a46', '#c49a63'], mist_valley: ['#6f8f78', '#b39a74'],
  frost_highland: ['#c9d6de', '#a9a49a'], dragon_ruins: ['#8e6c58', '#b0a08c'], mushroom_grove: ['#6e6488', '#a98f8a'],
};
import { CAM } from './render.js';
const PPM = 3;   // background pixels per metre

export class Minimap {
  constructor(canvas) { this.c = canvas; this.ctx = canvas.getContext('2d'); this.zoneId = null; this.bg = null; this.k = 3.4; this.n = 0; }

  build(zone) {
    const d = zone.def, g = zone.geo, [x0, z0, x1, z1] = d.bounds, W = Math.ceil((x1 - x0) * PPM), H = Math.ceil((z1 - z0) * PPM);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    const [base, path] = THEME[d.id] || ['#7f9a6a', '#b8a080'];
    c.fillStyle = base; c.fillRect(0, 0, W, H);
    // paths / patches
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const p of d.patches || []) {
      c.fillStyle = c.strokeStyle = p.tex === 'cobble' || p.tex === 'stone' || p.tex === 'pave' ? '#b9b2a2' : path;
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

  draw(G) {
    const z = G.zone, p = G.player; if (!z || !p) return;
    if ((this.n++ % 3) && this.zoneId === z.def.id) return;
    if (this.zoneId !== z.def.id) this.build(z);
    const cv = this.c, dpr = Math.min(2, window.devicePixelRatio || 1), cw = cv.clientWidth || 180, ch = cv.clientHeight || 180;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const ctx = this.ctx, k = this.k * (cw / 180) * dpr, W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
    const { ex, ez } = this.basis(G, p.pos), P = p.pos;
    const to = (x, zz) => ({ x: cx + ((x - P.x) * ex.x + (zz - P.z) * ez.x) * k, y: cy + ((x - P.x) * ex.y + (zz - P.z) * ez.y) * k });
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#16203a'; ctx.fillRect(0, 0, W, H);
    // background image: world (x,z) -> screen through an affine transform
    const [x0, z0, x1, z1] = this.bounds, o = to(x0, z0);
    ctx.setTransform(ex.x * k / PPM, ex.y * k / PPM, ez.x * k / PPM, ez.y * k / PPM, o.x, o.y);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dot = (q, r, fill, stroke) => { ctx.beginPath(); ctx.arc(q.x, q.y, r * dpr, 0, 6.283); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.lineWidth = 1.2 * dpr; ctx.strokeStyle = stroke; ctx.stroke(); } };
    // portals
    for (const pt of z.def.portals || []) {
      const q = to(pt.pos[0], pt.pos[1]), r = 5 * dpr;
      ctx.beginPath(); ctx.moveTo(q.x, q.y - r); ctx.lineTo(q.x + r, q.y); ctx.lineTo(q.x, q.y + r); ctx.lineTo(q.x - r, q.y); ctx.closePath();
      ctx.fillStyle = '#62d8ff'; ctx.fill(); ctx.lineWidth = 1.2 * dpr; ctx.strokeStyle = '#0b3550'; ctx.stroke();
    }
    // npcs (quest givers with something to say get a gold ring)
    for (const n of z.npcs || []) dot(to(n.pos.x, n.pos.z), 3.2, '#ffe07a', '#5a3a08');
    // monsters / boss
    for (const a of z.actors) {
      if (a === p || a.dead || !a.def || a.faction === 'player') continue;
      const boss = a === z.boss; dot(to(a.pos.x, a.pos.z), boss ? 5 : 2.6, boss ? '#c06bff' : '#ff5a4a', boss ? '#2a0838' : '#4a0a06');
    }
    // player arrow
    const f = p.facing || { x: 0, z: 1 }, fx = f.x * ex.x + f.z * ez.x, fy = f.x * ex.y + f.z * ez.y, fl = Math.hypot(fx, fy) || 1, ux = fx / fl, uy = fy / fl, s = 7 * dpr;
    ctx.beginPath(); ctx.moveTo(cx + ux * s, cy + uy * s); ctx.lineTo(cx - ux * s * 0.6 - uy * s * 0.6, cy - uy * s * 0.6 + ux * s * 0.6);
    ctx.lineTo(cx - ux * s * 0.25, cy - uy * s * 0.25); ctx.lineTo(cx - ux * s * 0.6 + uy * s * 0.6, cy - uy * s * 0.6 - ux * s * 0.6); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = '#1a2a4a'; ctx.stroke();
  }
}
