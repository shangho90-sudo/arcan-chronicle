// 2026-11-19 리마스터 6단계 — 1차 직업 주력 스킬의 5단계 틀(시전 준비·발사·명중·지속·종료) 중 기존 연출에 없던 단계만 더함.
// 약병폭격(flaskfx.js rain)과 같은 생각: ① 시전 준비 = 발밑 직업 문양 마법진이 그려지며 손으로 빛이 빨려 듦 ② 발사 = 손(던지는 스킬)
// 또는 무기 끝에서 '퐁' 빛 ③ 명중 = 각 스킬의 기존 연출 그대로(건드리지 않음) ④ 지속 = 마법진 둘레에서 피어오르는 빛 알갱이
// ⑤ 종료 = 마법진이 녹아 사라지며 바깥으로 퍼지는 고리 + 반짝임(대장장이는 불티 비).
// 그림만: 피해·시각·판정·카메라는 skillrt 그대로, 난수는 이 파일의 xorshift(게임 Math.random 안 씀), 품질 낮음이면 아무것도 만들지 않음
// (skillrt.js release가 gfxOn()일 때만 부름). 마법진은 시전자 발밑 반지름 ≤ 1.2 m(판정 범위 그림이 아님 — 범위 그림은 각 스킬 것).
// draw call: 살아 있는 마법진마다 1 + 고리 1 + 빛 알갱이 전체 1(카메라를 보는 판 인스턴스 묶음 하나, 상한 STAGEFX.cap). 보통 = 알갱이 수 0.55배.
import * as THREE from 'three';
import { T } from './render.js';
import { gfxQ } from './gfxq.js';

const C = (h) => new THREE.Color(h);
// 직업 묶음: col = 선, dark = 바탕 번짐, spark = 알갱이, v = 문양 (0 연금술 육망성 / 1 접시 살 / 2 톱니 모루 / 3 실 소용돌이 / 4 색상환)
const KIT = {
  pharm: { col: 0x7ff0d8, dark: 0x0c3a3a, spark: 0xbafff0, v: 0 },
  cook: { col: 0xffb35a, dark: 0x4a1c08, spark: 0xffe0a0, v: 1 },
  smith: { col: 0xff8a3a, dark: 0x3a1206, spark: 0xffb050, v: 2, ember: true },
  hair: { col: 0xff9ad0, dark: 0x3a1038, spark: 0xffe0f4, v: 3 },
  art: { col: 0xffd36a, dark: 0x2a1648, spark: 0xffffff, v: 4, rainbow: true },
};
// 스킬 id → 직업 묶음 + 발사 지점(hand = 던지는 손, tip = 무기 끝, none) + 끝 시각 덧붙임(초, 동작 잠금 뒤)
export const STAGES = {
  ph1_a1: { k: 'pharm', launch: 'tip' }, ph1_a4: { k: 'pharm', launch: 'hand' }, ph1_a3: { k: 'pharm', launch: 'tip' }, ph1_a6: { k: 'pharm', launch: 'tip', r: 1.2 },
  ph1_b1: { k: 'pharm', launch: 'hand' }, ph1_b2: { k: 'pharm', launch: 'hand' }, ph1_b4: { k: 'pharm', launch: 'hand' }, ph1_c1: { k: 'pharm', launch: 'hand' },
  ck1_a1: { k: 'cook', launch: 'tip' }, ck1_a2: { k: 'cook', launch: 'tip' }, ck1_a3: { k: 'cook', launch: 'tip' }, ck1_b1: { k: 'cook', launch: 'hand', end: 1.05 },
  ck1_b2: { k: 'cook', launch: 'hand' }, ck1_b3: { k: 'cook', launch: 'hand' }, ck1_b5: { k: 'cook', launch: 'tip' },
  bs1_a1: { k: 'smith', launch: 'none' }, bs1_a2: { k: 'smith', launch: 'tip' }, bs1_a3: { k: 'smith', launch: 'tip' }, bs1_a4: { k: 'smith', launch: 'tip' },
  bs1_b1: { k: 'smith', launch: 'tip' }, bs1_b3: { k: 'smith', launch: 'tip' },
  hd1_a1: { k: 'hair', launch: 'tip' }, hd1_a2: { k: 'hair', launch: 'tip' }, hd1_a3: { k: 'hair', launch: 'tip' }, hd1_a4: { k: 'hair', launch: 'none' },
  hd1_b1: { k: 'hair', launch: 'hand' }, hd1_b2: { k: 'hair', launch: 'hand' }, hd1_b3: { k: 'hair', launch: 'hand' }, hd1_b4: { k: 'hair', launch: 'hand' },
  ar1_a1: { k: 'art', launch: 'tip' }, ar1_a2: { k: 'art', launch: 'tip' }, ar1_a3: { k: 'art', launch: 'tip' },
  ar1_b1: { k: 'art', launch: 'tip' }, ar1_b2: { k: 'art', launch: 'tip' }, ar1_b3: { k: 'art', launch: 'tip' },
};
export const STAGEFX = { size: 1.7, cap: 700, r: 1.05, draw: 0.2, fadeOut: 0.4, gather: 12, rise: 0.06, endBurst: 16, medK: 0.55 };

let seed = 0x9e3779b9;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };

const SIG_VS = 'varying vec2 vU; void main(){ vU = uv * 2. - 1.; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const SIG_FS = `uniform vec3 uC, uD; uniform float uA, uT, uDraw, uErode, uV, uRing; varying vec2 vU;
float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float line(float d, float w){ return 1. - smoothstep(w * .5, w, abs(d)); }
float seg(vec2 p, vec2 a, vec2 b, float w){ vec2 pa = p - a, ba = b - a; float t = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return line(length(pa - ba * t), w); }
void main(){
  float r = length(vU), a = atan(vU.y, vU.x), a01 = fract(a / 6.28318 + .25);
  if (r > 1.) discard;
  if (uRing > 0.) { float k = line(r - uRing, .06) * (1. - uRing) * 1.4; if (k < .01) discard; gl_FragColor = vec4(uC, k * uA); return; }
  float L = line(r - .93, .035) + line(r - .8, .02) * .8;
  float rt = a + uT * .7; float tick = step(.5, fract(rt / 6.28318 * 32.)) * step(.82, r) * step(r, .9) * .7;
  float rt2 = a - uT * .45; float dots = (1. - smoothstep(.0, .028, length(vec2(r - .705, (fract(rt2 / 6.28318 * 12.) - .5) * 4.43 * .705)))) ;
  vec2 q = vec2(cos(a + uT * .25), sin(a + uT * .25)) * r; float G = 0.;
  if (uV < .5) { for (int i = 0; i < 6; i++) { float t0 = float(i) * 2.0944 + (i > 2 ? 1.0472 : 0.); vec2 A = vec2(cos(t0), sin(t0)) * .62, B = vec2(cos(t0 + 2.0944), sin(t0 + 2.0944)) * .62; G += seg(q, A, B, .03); } G += line(r - .3, .02); }
  else if (uV < 1.5) { G = step(.25, r) * step(r, .62) * line(sin(a * 12. + uT * .3) * r, .025) + line(r - .62, .025) + line(r - .25, .03); }
  else if (uV < 2.5) { float tooth = step(.5, fract((a + uT * .3) / 6.28318 * 14.)); G = line(r - (.55 + .07 * tooth), .03) + line(r - .3, .02) + seg(q, vec2(-.32, -.08), vec2(.32, -.08), .05) * .8; }
  else if (uV < 3.5) { G = line(sin(a * 2. + r * 13. - uT * 2.4) * .12, .04) * step(.18, r) * step(r, .7); G += line(r - .7, .02); }
  else { float pet = abs(cos(a * 3. + uT * .3)) * .6; G = line(r - pet, .035) * step(.1, r) + line(r - .7, .02); }
  float body = clamp(L + tick + dots * .9 + G * .9, 0., 1.);
  float draw = smoothstep(uDraw * 1.02 - .02, uDraw * 1.02, a01) ; body *= 1. - draw;
  float n = h(floor(vU * 22.)); body *= step(uErode, n * .92 + .04);
  float glow = (1. - smoothstep(.0, 1., r)) * .25 * (1. - draw);
  vec3 col = mix(uD, uC, clamp(body * 1.2, 0., 1.));
  float alpha = clamp(body * .95 + glow * .5, 0., 1.) * uA;
  if (alpha < .01) discard;
  gl_FragColor = vec4(col * (1. + body * .35), alpha);
}`;
// camera-facing quads (one instanced draw): aP = centre, aS = size (m), aC = colour + alpha
const PT_VS = `attribute vec3 aP; attribute vec4 aC; attribute float aS; varying vec4 vC; varying vec2 vQ;
void main(){ vC = aC; vQ = position.xy * 2.; vec4 mv = viewMatrix * vec4(aP, 1.); mv.xy += position.xy * aS * 2.; gl_Position = projectionMatrix * mv; }`;
const PT_FS = `varying vec4 vC; varying vec2 vQ; void main(){ vec2 p = vQ; float d = length(p);
  float star = max(1. - smoothstep(.0, .12, abs(p.x)) , 0.) * (1. - abs(p.y)) + max(1. - smoothstep(.0, .12, abs(p.y)), 0.) * (1. - abs(p.x));
  float k = clamp(star * .8 + (1. - smoothstep(.0, .45, d)) , 0., 1.) * vC.a; if (k < .01) discard; gl_FragColor = vec4(vC.rgb * (1. + .6 * (1. - d)), k); }`;   // normal blend (additive vanished on the bright paving)

export class StageFx {
  constructor(scene) {
    this.scene = scene; this.live = []; this.pool = []; this.ringPool = [];
    this.geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const N = STAGEFX.cap; this.N = N; this.parts = [];
    const g = new THREE.InstancedBufferGeometry(); const q = new THREE.PlaneGeometry(1, 1); g.index = q.index; g.setAttribute('position', q.attributes.position);
    this.P = new Float32Array(N * 3); this.Cc = new Float32Array(N * 4); this.S = new Float32Array(N);
    g.setAttribute('aP', new THREE.InstancedBufferAttribute(this.P, 3)); g.setAttribute('aC', new THREE.InstancedBufferAttribute(this.Cc, 4)); g.setAttribute('aS', new THREE.InstancedBufferAttribute(this.S, 1));
    for (const k of ['aP', 'aC', 'aS']) g.attributes[k].setUsage(THREE.DynamicDrawUsage);
    g.instanceCount = 0;
    this.pm = new THREE.ShaderMaterial({ vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false });
    this.points = new THREE.Mesh(g, this.pm); this.points.frustumCulled = false; this.points.renderOrder = 6; scene.add(this.points);
  }
  _sig() {
    const m = this.pool.pop() || new THREE.Mesh(this.geo, new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color() }, uD: { value: new THREE.Color() }, uA: { value: 0 }, uT: { value: 0 }, uDraw: { value: 0 }, uErode: { value: 0 }, uV: { value: 0 }, uRing: { value: 0 } },
      vertexShader: SIG_VS, fragmentShader: SIG_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.renderOrder = 1; m.visible = true; this.scene.add(m); return m;
  }
  _free(m) { this.scene.remove(m); this.pool.push(m); }
  _k() { return gfxQ() === 'high' ? 1 : STAGEFX.medK; }
  emit(x, y, z, o) {
    if (this.parts.length >= this.N) return;
    this.parts.push({ x, y, z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, g: o.g || 0, t: -(o.delay || 0), life: o.life || 0.6, s: (o.s || 0.08) * STAGEFX.size, c: o.c, to: o.to || null, sp: o.sp || 0 });
  }
  /** skillrt release: pc = caster, id = skill id, o = { ht (hit time s), end (lock end s), aim } */
  play(pc, id, o = {}) {
    const st = STAGES[id]; if (!st) return null;
    const K = KIT[st.k], gy = pc.zone && pc.zone.geo ? pc.zone.geo.ground(pc.pos.x, pc.pos.z).y : (pc.pos.y || 0);
    const R = st.r || STAGEFX.r, m = this._sig(), u = m.material.uniforms;
    u.uC.value.set(K.col); u.uD.value.set(K.dark); u.uV.value = K.v; u.uDraw.value = 0; u.uErode.value = 0; u.uA.value = 0; u.uRing.value = 0;
    m.position.copy(T({ x: pc.pos.x, y: gy + 0.04, z: pc.pos.z })); m.scale.setScalar(R);
    const k = this._k(), e = { pc, st, K, m, R, t: 0, ht: o.ht || 0.25, end: Math.max((o.end || 0.6), st.end || 0) + 0.15, launched: false, ended: false, ring: null, rise: 0, gy };
    // ① gather into the hand (or weapon tip) through the first ~ht
    const hp = this._hand(pc), n = Math.round(STAGEFX.gather * k);
    for (let i = 0; i < n; i++) { const a = rnd() * 6.283, rr = 0.7 + rnd() * 0.4, sx = pc.pos.x + Math.cos(a) * rr, sz = pc.pos.z + Math.sin(a) * rr, sy = gy + 0.1 + rnd() * 0.5;
      this.emit(sx, sy, sz, { life: Math.max(0.16, e.ht * 0.9), s: 0.07 + rnd() * 0.05, c: this._col(K, i), to: hp, delay: rnd() * 0.06 }); }
    this.live.push(e); return e;
  }
  _col(K, i) { if (K.rainbow) { const c = new THREE.Color().setHSL((i * 0.13 + rnd() * 0.05) % 1, 0.85, 0.62); return [c.r, c.g, c.b]; } const c = C(K.spark).lerp(C(K.col), 0.55); return [c.r, c.g, c.b]; }
  _hand(pc) { let h = null; try { h = pc.body && pc.body.handPoint && pc.body.handPoint(); } catch (e) { h = null; } return h ? { x: h.x, y: h.y, z: -h.z } : { x: pc.pos.x, y: (pc.pos.y || 0) + 1.0, z: pc.pos.z }; }
  _tip(pc) { let b = null; try { b = pc.body && pc.body.bladePoints && pc.body.bladePoints(); } catch (e) { b = null; } if (b && b.tip) return { x: b.tip.x, y: b.tip.y, z: -b.tip.z }; if (b && b[1]) return { x: b[1].x, y: b[1].y, z: -b[1].z }; return this._hand(pc); }
  update(dt) {
    const k = this._k();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i], u = e.m.material.uniforms; e.t += dt; u.uT.value += dt;
      if (e.pc.dead) e.end = Math.min(e.end, e.t);
      // ① draw in, then hold
      u.uDraw.value = Math.min(1, e.t / STAGEFX.draw);
      if (!e.ended) u.uA.value = Math.min(0.85, e.t / 0.12 * 0.85) * (0.9 + 0.1 * Math.sin(e.t * 14));
      // ② launch pop at the hit frame
      if (!e.launched && e.t >= e.ht) { e.launched = true; if (e.st.launch !== 'none') { const p = e.st.launch === 'hand' ? this._hand(e.pc) : this._tip(e.pc), nn = Math.round(10 * k);
          for (let j = 0; j < nn; j++) { const a = rnd() * 6.283, b = rnd() * 3.14, sp = 1.4 + rnd() * 1.6; this.emit(p.x, p.y, p.z, { vx: Math.cos(a) * Math.sin(b) * sp, vy: Math.cos(b) * sp, vz: Math.sin(a) * Math.sin(b) * sp, life: 0.28 + rnd() * 0.15, s: 0.09 + rnd() * 0.06, c: this._col(e.K, j) }); }
          this.emit(p.x, p.y, p.z, { life: 0.12, s: 0.3, c: [1, 1, 0.95] }); } }
      // ④ sustain: motes rising off the sigil rim
      if (!e.ended) { e.rise += dt; while (e.rise > STAGEFX.rise / k) { e.rise -= STAGEFX.rise / k; const a = rnd() * 6.283, rr = e.R * (0.8 + rnd() * 0.15);
          this.emit(e.m.position.x + Math.cos(a) * rr, e.gy + 0.05, -e.m.position.z + Math.sin(a) * rr, e.K.ember ? { vy: 1.2 + rnd(), vx: (rnd() - 0.5) * 0.6, vz: (rnd() - 0.5) * 0.6, g: -1.5, life: 0.5 + rnd() * 0.3, s: 0.05 + rnd() * 0.04, c: this._col(e.K, 0) }
            : { vy: 0.7 + rnd() * 0.6, life: 0.55 + rnd() * 0.35, s: 0.06 + rnd() * 0.05, c: this._col(e.K, Math.floor(rnd() * 8)) }); } }
      // ⑤ end: dissolve + one ring sweeping out + a burst (embers fall for the smith)
      if (!e.ended && e.t >= e.end) { e.ended = true; e.endT = e.t;
        const r = this._sig(), ru = r.material.uniforms; ru.uC.value.set(e.K.col); ru.uD.value.set(e.K.dark); ru.uRing.value = 0.3; ru.uA.value = 0.9; r.position.copy(e.m.position); r.position.y += 0.005; r.scale.setScalar(e.R * 1.35); e.ring = r;
        const nn = Math.round(STAGEFX.endBurst * k);
        for (let j = 0; j < nn; j++) { const a = j / nn * 6.283 + rnd() * 0.3, sp = 1.2 + rnd() * 1.0, x = e.m.position.x + Math.cos(a) * e.R * 0.9, z = -e.m.position.z + Math.sin(a) * e.R * 0.9;
          this.emit(x, e.gy + 0.08, z, e.K.ember ? { vx: Math.cos(a) * sp * 0.6, vy: 2 + rnd() * 1.5, vz: Math.sin(a) * sp * 0.6, g: -7, life: 0.55 + rnd() * 0.2, s: 0.06, c: this._col(e.K, j) }
            : { vx: Math.cos(a) * sp * 0.5, vy: 0.9 + rnd() * 0.8, vz: Math.sin(a) * sp * 0.5, life: 0.5 + rnd() * 0.25, s: 0.07 + rnd() * 0.05, c: this._col(e.K, j) }); } }
      if (e.ended) { const f = (e.t - e.endT) / STAGEFX.fadeOut; u.uErode.value = Math.min(1, f); u.uA.value = 0.85 * Math.max(0, 1 - f);
        if (e.ring) { const ru = e.ring.material.uniforms; ru.uRing.value = Math.min(0.98, 0.3 + f * 0.7); ru.uA.value = 0.9 * Math.max(0, 1 - f); }
        if (f >= 1) { this._free(e.m); if (e.ring) { e.ring.material.uniforms.uRing.value = 0; this._free(e.ring); } this.live.splice(i, 1); } }
    }
    // particles
    const P = this.P, Cc = this.Cc, S = this.S; let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.t += dt; if (p.t < 0) continue;
      if (p.t >= p.life) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
      const f = p.t / p.life;
      if (p.to) { const kk = Math.min(1, dt * 9 / Math.max(0.05, 1 - f)); p.x += (p.to.x - p.x) * kk; p.y += (p.to.y - p.y) * kk; p.z += (p.to.z - p.z) * kk; }
      else { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 1 - dt * 2; p.vz *= 1 - dt * 2; }
    }
    for (const p of this.parts) { if (p.t < 0 || n >= this.N) continue; const f = p.t / p.life, a = Math.min(1, p.t / 0.05) * (1 - f * f);
      P[n * 3] = p.x; P[n * 3 + 1] = p.y; P[n * 3 + 2] = -p.z; Cc[n * 4] = p.c[0]; Cc[n * 4 + 1] = p.c[1]; Cc[n * 4 + 2] = p.c[2]; Cc[n * 4 + 3] = a * 0.9; S[n] = p.s; n++; }
    const g = this.points.geometry; g.instanceCount = n; g.attributes.aP.needsUpdate = true; g.attributes.aC.needsUpdate = true; g.attributes.aS.needsUpdate = true;
  }
  clear() { for (const e of this.live) { this._free(e.m); if (e.ring) this._free(e.ring); } this.live.length = 0; this.parts.length = 0; this.points.geometry.instanceCount = 0; }
  get count() { return this.live.length + this.parts.length; }
}
