// HUD portrait rendered from the player's actual 3D model (head and shoulders), instead of enlarging a small
// cut-out of a 2D picture. Rendered once per character / dye change into a data URL.
import * as THREE from 'three';

export function renderPortrait(body, size = 192) {
  const R = G.render.r, S = size * 2;
  const root = body.root, parent = root.parent, pos = root.position.clone(), rot = root.rotation.y, vis = root.visible;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a5a70, 1.6));
  const key = new THREE.DirectionalLight(0xffe8c8, 2.4); key.position.set(-1.2, 2.0, 2.2); scene.add(key);
  const rim = new THREE.DirectionalLight(0xa8d0ff, 1.4); rim.position.set(1.6, 1.2, -1.5); scene.add(rim);
  try {
    scene.add(root); root.position.set(0, 0, 0); root.rotation.y = 0.35; root.visible = true; root.updateMatrixWorld(true);
    const head = body.bones && body.bones.find(b => /head/i.test(b.name));
    const hp = new THREE.Vector3(); if (head) head.getWorldPosition(hp); else hp.set(0, 1.2, 0);
    const cam = new THREE.PerspectiveCamera(20, 1, 0.05, 50);
    cam.position.set(hp.x + 0.12, hp.y + 0.14, hp.z + 1.55); cam.lookAt(hp.x, hp.y + 0.1, hp.z);
    const rt = new THREE.WebGLRenderTarget(S, S, { samples: 4 });
    const prevT = R.getRenderTarget(), prevC = R.getClearColor(new THREE.Color()), prevA = R.getClearAlpha();
    R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(scene, cam);
    const px = new Uint8Array(S * S * 4); R.readRenderTargetPixels(rt, 0, 0, S, S, px);
    R.setRenderTarget(prevT); R.setClearColor(prevC, prevA); rt.dispose();
    // linear -> sRGB, flip rows, downscale 2x for smooth edges
    const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const img = g.createImageData(S, S);
    const lut = new Uint8Array(256); for (let i = 0; i < 256; i++) { const v = i / 255; lut[i] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const s = ((S - 1 - y) * S + x) * 4, d = (y * S + x) * 4;
      img.data[d] = lut[px[s]]; img.data[d + 1] = lut[px[s + 1]]; img.data[d + 2] = lut[px[s + 2]]; img.data[d + 3] = px[s + 3];
    }
    g.putImageData(img, 0, 0);
    const o = document.createElement('canvas'); o.width = o.height = size; const og = o.getContext('2d');
    const bg = og.createRadialGradient(size / 2, size * 0.42, size * 0.05, size / 2, size / 2, size * 0.7);
    bg.addColorStop(0, '#f7e7c4'); bg.addColorStop(1, '#b98d58'); og.fillStyle = bg; og.fillRect(0, 0, size, size);
    og.imageSmoothingQuality = 'high'; og.drawImage(c, 0, 0, size, size);
    return o.toDataURL('image/png');
  } catch (e) { console.warn('portrait', e); return null; }
  finally { if (parent) parent.add(root); root.position.copy(pos); root.rotation.y = rot; root.visible = vis; }
}

/** Small picture of any 3D body (monster / NPC) for lists such as the area map's "이 지역" panel.
 *  mode 'full' frames the whole model (monsters), 'bust' the head and shoulders (people, via renderPortrait).
 *  Temporarily moves the body's root into its own scene, like renderPortrait. Returns a data URL or null. */
export function renderThumb(body, mode = 'full', size = 96) {
  if (!body || !body.root) return null;
  if (mode === 'bust' && body.bones && body.bones.some(b => /head/i.test(b.name))) return renderPortrait(body, size);
  const R = G.render.r, S = size * 2;
  const root = body.root, parent = root.parent, pos = root.position.clone(), rot = root.rotation.y, vis = root.visible;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a5a70, 1.7));
  const key = new THREE.DirectionalLight(0xffe8c8, 2.2); key.position.set(-1.2, 2.0, 2.2); scene.add(key);
  const rim = new THREE.DirectionalLight(0xa8d0ff, 1.2); rim.position.set(1.6, 1.2, -1.5); scene.add(rim);
  try {
    scene.add(root); root.position.set(0, 0, 0); root.rotation.y = 0.5; root.visible = true; root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    if (!isFinite(sz.x) || sz.length() < 1e-3) return null;
    const fov = 24, r = Math.max(sz.y, Math.hypot(sz.x, sz.z) * 0.8) * 0.62, d = r / Math.tan(fov * Math.PI / 360);
    const cam = new THREE.PerspectiveCamera(fov, 1, 0.05, d * 4);
    cam.position.set(c.x, c.y + d * 0.28, c.z + d); cam.lookAt(c.x, c.y, c.z);
    const rt = new THREE.WebGLRenderTarget(S, S, { samples: 4 });
    const prevT = R.getRenderTarget(), prevC = R.getClearColor(new THREE.Color()), prevA = R.getClearAlpha();
    R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(scene, cam);
    const px = new Uint8Array(S * S * 4); R.readRenderTargetPixels(rt, 0, 0, S, S, px);
    R.setRenderTarget(prevT); R.setClearColor(prevC, prevA); rt.dispose();
    const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'); const img = g.createImageData(S, S);
    const lut = new Uint8Array(256); for (let i = 0; i < 256; i++) { const v = i / 255; lut[i] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const s = ((S - 1 - y) * S + x) * 4, o = (y * S + x) * 4;
      img.data[o] = lut[px[s]]; img.data[o + 1] = lut[px[s + 1]]; img.data[o + 2] = lut[px[s + 2]]; img.data[o + 3] = px[s + 3];
    }
    g.putImageData(img, 0, 0);
    const out = document.createElement('canvas'); out.width = out.height = size; const og = out.getContext('2d');
    const bg = og.createRadialGradient(size / 2, size * 0.45, size * 0.05, size / 2, size / 2, size * 0.72);
    bg.addColorStop(0, '#f7e7c4'); bg.addColorStop(1, '#b98d58'); og.fillStyle = bg; og.fillRect(0, 0, size, size);
    og.imageSmoothingQuality = 'high'; og.drawImage(cv, 0, 0, size, size);
    return out.toDataURL('image/png');
  } catch (e) { console.warn('thumb', e); return null; }
  finally { if (parent) parent.add(root); root.position.copy(pos); root.rotation.y = rot; root.visible = vis; root.updateMatrixWorld(true); }
}

/** true when every texture on the body's meshes has finished loading (a portrait taken earlier comes out as a black silhouette) */
export function bodyTexturesReady(body) {
  if (!body || !body.root) return false;
  let ok = true;
  body.root.traverse(o => {
    if (!ok || !o.isMesh) return;
    for (const m of [].concat(o.material || [])) {
      const t = m.map || (m.uniforms && m.uniforms.map && m.uniforms.map.value);
      if (t && !(t.image && (t.image.complete === undefined || t.image.complete) && (t.image.width || t.image.naturalWidth))) ok = false;
    }
  });
  return ok;
}

/** 메인 스토리 대화 장면(js/storyscene.js)의 큰 반신 초상: 허리 위 ~ 머리 위, 세로 3:4, 배경 투명 PNG data URL.
 *  The body faces a little to the viewer's right (CSS flips it for the right-hand slot). Same temporary re-parenting as renderPortrait. */
export function renderBust(body, w = 576, h = 768) {
  if (!body || !body.root) return null;
  const R = G.render.r;
  const root = body.root, parent = root.parent, pos = root.position.clone(), rot = root.rotation.y, vis = root.visible;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a5078, 1.55));
  const key = new THREE.DirectionalLight(0xffecd0, 2.5); key.position.set(-1.4, 2.2, 2.4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9cc4ff, 1.6); rim.position.set(1.8, 1.4, -1.6); scene.add(rim);
  const shadowVis = body.shadow ? body.shadow.visible : null; if (body.shadow) body.shadow.visible = false;
  try {
    scene.add(root); root.position.set(0, 0, 0); root.rotation.y = 0.42; root.visible = true; root.updateMatrixWorld(true);
    const H = (body.md && body.md.cfg && body.md.cfg.height) || 1.6;
    const head = body.bones && body.bones.find(b => /head/i.test(b.name));
    const hp = new THREE.Vector3(); if (head) head.getWorldPosition(hp); else hp.set(0, H * 0.82, 0);
    // the model is scaled to cfg.height with its feet at the root. Chibi NPC heads are ~half the height and their (Tripo) head
    // bones are unreliable: a fixed 0.8 H. The player (head bone at ~0.79 H) uses head length + 45 % of the head height.
    const npc = body.md && body.md.cfg && body.md.cfg.npc;
    const hy = head && hp.y > 0.45 * H && hp.y < 0.9 * H ? hp.y : 0.62 * H, span = npc ? 0.8 * H : (H - hy) + 0.45 * hy;
    const top = H * 1.03, bot = top - span * 1.04, mid = (top + bot) / 2, half = (top - bot) / 2;
    const fov = 16, d = half / Math.tan(fov * Math.PI / 360);
    const cam = new THREE.PerspectiveCamera(fov, w / h, 0.05, d * 4);
    cam.position.set(hp.x, mid + 0.05, hp.z + d); cam.lookAt(hp.x, mid, hp.z);
    const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
    const prevT = R.getRenderTarget(), prevC = R.getClearColor(new THREE.Color()), prevA = R.getClearAlpha();
    R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(scene, cam);
    const px = new Uint8Array(w * h * 4); R.readRenderTargetPixels(rt, 0, 0, w, h, px);
    R.setRenderTarget(prevT); R.setClearColor(prevC, prevA); rt.dispose();
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const img = g.createImageData(w, h);
    const lut = new Uint8Array(256); for (let i = 0; i < 256; i++) { const v = i / 255; lut[i] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }
    let any = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = ((h - 1 - y) * w + x) * 4, o = (y * w + x) * 4, a = px[s + 3];
      img.data[o] = lut[px[s]]; img.data[o + 1] = lut[px[s + 1]]; img.data[o + 2] = lut[px[s + 2]]; img.data[o + 3] = a; any += a > 8;
    }
    if (any < w * h * 0.02) return null;                                  // nothing drawn (model not ready)
    g.putImageData(img, 0, 0);
    // soft fade at the waist so the cut-off edge never shows as a hard line
    g.globalCompositeOperation = 'destination-out';
    const fade = g.createLinearGradient(0, h * 0.8, 0, h); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fade; g.fillRect(0, h * 0.8, w, h * 0.2);
    return c.toDataURL('image/png');
  } catch (e) { console.warn('bust', e); return null; }
  finally { if (parent) parent.add(root); else scene.remove(root); root.position.copy(pos); root.rotation.y = rot; root.visible = vis; if (body.shadow) body.shadow.visible = shadowVis; root.updateMatrixWorld(true); }
}
