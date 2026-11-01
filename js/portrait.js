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
