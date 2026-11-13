// 대장장이 기본공격(망치 5단, actions bs_combo_*: impact 'hammer')의 타격 연출 — 실제 망치 머리 위치에서 짧게:
//  작은 섬광(카메라를 보는 사각형 하나) + 땅 위 얇은 충격 고리 + 흙먼지 몇 덩이 + 돌·불티 조각 몇 개, 0.35초 안에 사라짐.
// 기본공격이라 스킬 연출보다 작고 어둡게(가산 밝기 ≤ 1.3 — 블룸 문턱 2.6 아래라 화면이 번지지 않음, 전역 블룸·노출 그대로).
// 메시·재질은 처음 한 번 만들어 풀에서 재사용(존 이동·연타에도 쌓이지 않음). 저사양(그래픽 효과 끔)은 먼지·조각 수만 줄임.
import { THREE, T } from './render.js';

const HAMMER = {
  life: 0.34,                 // s, 전체
  flash: { size: 0.55, big: 0.8, dur: 0.07, col: [1.25, 1.1, 0.85] },
  ring: { r0: 0.2, r1: 0.8, big: 1.1, dur: 0.22, col: [0.9, 0.74, 0.5] },
  dust: { n: 5, lo: 3, col: [0.84, 0.76, 0.66] },
  chips: { n: 6, lo: 3 },
};
// own random stream: the effect must not consume the game's Math.random (miss / crit rolls stay the same as without it)
let _seed = 1234567; const rnd = () => (_seed = (_seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const RING_FS = `uniform float uT; uniform float uO; uniform vec3 uCol; varying vec2 vUv;
void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p); float w = 0.16 * (1.0 - uT) + 0.04;
  float band = smoothstep(1.0, 1.0 - w, r) * smoothstep(1.0 - 2.4 * w, 1.0 - w, r);
  gl_FragColor = vec4(uCol * band * uO * (1.0 - uT), 1.0); }`;
const FLASH_FS = `uniform float uO; uniform vec3 uCol; varying vec2 vUv;
void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p);
  float core = exp(-r * r * 9.0), star = exp(-abs(p.x * p.y) * 60.0) * smoothstep(1.0, 0.1, r);
  gl_FragColor = vec4(uCol * (core + 0.55 * star) * uO, 1.0); }`;
const DUST_FS = `uniform float uO; uniform vec3 uCol; varying vec2 vUv;
void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = smoothstep(1.0, 0.35, r) * uO * 0.55;
  gl_FragColor = vec4(uCol, a); }`;
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export class HammerFx {
  constructor(scene, cam) { this.scene = scene; this.cam = cam; this.pool = []; this.live = []; this.low = false; }
  make() {
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false };
    const uni = c => ({ uT: { value: 0 }, uO: { value: 0 }, uCol: { value: new THREE.Vector3(...c) } });
    const quad = new THREE.PlaneGeometry(1, 1);
    const flash = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: uni(HAMMER.flash.col), vertexShader: VS, fragmentShader: FLASH_FS, ...add }));
    const ring = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: uni(HAMMER.ring.col), vertexShader: VS, fragmentShader: RING_FS, ...add, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    const dustM = new THREE.ShaderMaterial({ uniforms: uni(HAMMER.dust.col), vertexShader: VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false });
    const dust = Array.from({ length: HAMMER.dust.n }, () => new THREE.Mesh(quad, dustM));
    const chipG = new THREE.BoxGeometry(0.06, 0.05, 0.07), stone = new THREE.MeshLambertMaterial({ color: 0x8a7c6c }), spark = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.9, 0.45), toneMapped: false });
    const chips = Array.from({ length: HAMMER.chips.n }, (_, i) => new THREE.Mesh(chipG, i % 3 === 0 ? spark : stone));
    const g = new THREE.Group(); g.add(flash, ring, ...dust, ...chips); g.visible = false; g.renderOrder = 7;
    for (const m of [flash, ring, ...dust]) m.renderOrder = 7;
    this.scene.add(g);
    return { g, flash, ring, dust, chips, dustM, v: [] };
  }
  /** pos = Unity-space hit point (real hammer head, clamped onto the target); dir = ground direction of the blow; big = 5th */
  hit(pos, { dir = { x: 0, z: 1 }, big = false, ground = 0 } = {}) {
    const e = this.pool.pop() || this.make(); e.t = 0; e.big = big; e.g.visible = true;
    const P = T(pos); e.g.position.copy(P); e.ground = ground - pos.y;
    e.ring.position.set(0, e.ground + 0.04, 0);
    const nD = this.low ? HAMMER.dust.lo : HAMMER.dust.n, nC = this.low ? HAMMER.chips.lo : HAMMER.chips.n;
    e.dust.forEach((d, i) => { d.visible = i < nD; const a = (i / nD) * 6.283 + rnd(); d.userData.v = [Math.cos(a) * 0.9, 0.25 + rnd() * 0.3, Math.sin(a) * 0.9]; d.position.set(0, e.ground + 0.12, 0); });
    e.chips.forEach((c, i) => { c.visible = i < nC; const a = Math.atan2(-dir.z, dir.x) + (rnd() - 0.5) * 2.4;   // spray away from the blow (three z = -unity z)
      c.userData.v = [Math.cos(a) * (1.4 + rnd()), 1.6 + rnd() * 1.4, Math.sin(a) * (1.4 + rnd())]; c.position.set(0, 0, 0); c.rotation.set(rnd() * 3, rnd() * 3, 0); });
    this.live.push(e); this.update(0);
  }
  update(dt) {
    const H = HAMMER;
    for (let k = this.live.length - 1; k >= 0; k--) {
      const e = this.live[k]; e.t += dt; const t = e.t, s = e.big ? 1.3 : 1;
      if (t >= H.life) { e.g.visible = false; this.live.splice(k, 1); this.pool.push(e); continue; }
      // flash: pops at once, gone in 0.07 s, faces the camera
      const fu = t / H.flash.dur; e.flash.visible = fu < 1; e.flash.quaternion.copy(this.cam.quaternion);
      e.flash.scale.setScalar((e.big ? H.flash.big : H.flash.size) * (0.7 + 0.5 * Math.min(1, fu * 3))); e.flash.material.uniforms.uO.value = (1 - fu) ** 2;
      // ring on the ground: grows fast, thins out
      const ru = Math.min(1, t / H.ring.dur), R = H.ring.r0 + ((e.big ? H.ring.big : H.ring.r1) - H.ring.r0) * (1 - (1 - ru) ** 3);
      e.ring.visible = ru < 1; e.ring.scale.setScalar(R * 2); e.ring.material.uniforms.uT.value = ru; e.ring.material.uniforms.uO.value = 0.9;
      // dust: soft puffs rolling outward along the ground, camera facing
      const du = t / H.life; e.dustM.uniforms.uO.value = Math.sin(Math.PI * Math.min(1, du * 1.15));
      for (const d of e.dust) if (d.visible) { const v = d.userData.v; d.position.x += v[0] * dt * s; d.position.z += v[2] * dt * s; d.position.y += v[1] * dt; v[0] *= 0.9; v[2] *= 0.9;
        d.quaternion.copy(this.cam.quaternion); d.scale.setScalar((0.28 + 0.5 * du) * s); }
      // chips: a short ballistic hop, they land and vanish (no lingering debris)
      for (const c of e.chips) if (c.visible) { const v = c.userData.v; v[1] -= 9.8 * dt; c.position.x += v[0] * dt; c.position.y = Math.max(e.ground + 0.03, c.position.y + v[1] * dt); c.position.z += v[2] * dt;
        c.rotation.x += dt * 9; c.rotation.y += dt * 7; c.scale.setScalar(Math.max(0.01, 1 - du * du)); }
    }
  }
  clear() { for (const e of this.live) { e.g.visible = false; this.pool.push(e); } this.live = []; }
}
export { HAMMER };
