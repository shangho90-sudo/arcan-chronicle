// 엔지니어 2차 스킬 이펙트 (2026-11-16). 규칙은 js/engineer.js, 부품 메시는 tools/blender/fx_engineer.py -> assets/fx/fx_engineer.glb.json
// (부품마다 피벗이 실제 관절·회전축 — 전개·조준·반동·코일 점등·덮개 개방·냉각판은 여기서 런타임으로 움직임).
// 시각 정체성: 동화풍 마도공학 — 강철 몸체 + 구리 코일 + 작은 동력 결정 + 가죽 끈. 색 역할(빛보다 부품의 움직임이 먼저):
//   일반 가동 청색·청록 / 실탄·폭발 주황·금 / 전자기 청백 / 과부하 주황 코어 + 붉은 경고등 + 냉각판 열림 / 정비 작은 청록 불빛 + 용접 불꽃.
// 병기 핸들은 규칙의 상태(s.en: phase·t·yaw·pitch·recoil·walking…)를 매 프레임 읽어 그림 — 규칙은 그림을 기다리지 않음.
// 가장 밝은 순간 = 실제 피해 순간(규칙이 그 순간 handle 메서드를 부름). 고리·부채꼴·삼각형은 실제 판정 크기 그대로. 전역 블룸·노출·정지는 안 건드림.
// 메시·재질은 종류별 풀(CookFx)에서 재사용, 탄·미사일·탄피·연기·파편도 풀. 저사양(휴대폰 / 그래픽 효과 끔)은 탄피·연기·파편·불꽃 수만 줄임.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CookFx, cookTop } from './cookfx.js';

export const ENFX = {
  intensity: 1.0,
  col: { teal: 0x5ae6d2, tealB: 0x1a8a9a, blue: 0x5aaaff, blueB: 0x1a4aa0, ice: 0xd8f0ff, iceB: 0x5a9aff, gold: 0xffd27a, goldB: 0xff8a2a, orange: 0xff9a3a, orangeB: 0xd84a10,
    red: 0xff3a2a, redB: 0x9a1008, steam: 0xf0f4f8, steamB: 0xb0bccc, smoke: 0x9aa0aa, smokeB: 0x5a5f68, spark: 0xffe0a0 },
  tint: 0x9aa8bc,          // 금속 부품 색을 조금 눌러 줌(밝은 바닥에서 하얗게 뜨지 않게) — 빛나는 부품은 glowM 이 따로 정함
  walkerScale: 1.18,       // 워커 높이 약 2.7 m (캐릭터의 약 1.6배)
  casings: 1, casingsLite: 0, sparks: 6, sparksLite: 3, puffs: 4, puffsLite: 2, helix: 26, helixLite: 12,
};
const C = ENFX.col;
const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const rnd = (a, b) => a + Math.random() * (b - a);
const yawRot = (yaw) => Math.atan2(Math.sin(yaw), -Math.cos(yaw));   // game yaw (atan2(fx, fz)) -> three rotation.y so local +Z looks along the facing
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1), _m4 = new THREE.Matrix4();
const FLAT_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
// 바닥 가산 층 uK: 0 부채꼴 파동(uv.x 가로 0..1, uv.y 반지름 0..1, uP = 파동 앞) / 1 삼각형 장판(uv.x = 0 가운데 .. 1 변) / 2 조준선(uv.x 길이, uv.y 가로 — 가장자리 두 줄)
const EN_FS = `uniform vec3 uW, uB; uniform float uA, uK, uP, uT; varying vec2 vUv;
void main(){ float a = 0., core = 0.;
  if (uK < .5) { float v = vUv.y, u = vUv.x, fr = uP; a = smoothstep(fr - .22, fr, v) * smoothstep(fr + .03, fr, v) * smoothstep(0., .12, u) * smoothstep(1., .88, u); core = smoothstep(fr - .06, fr, v) * smoothstep(fr + .02, fr, v); }
  else if (uK < 1.5) { float e = vUv.x; a = .10 + .08 * sin(uT * 9. + e * 20.) * .5 + smoothstep(.86, .99, e) * .8; core = smoothstep(.93, 1., e); }
  else { float e = abs(vUv.y - .5) * 2.; a = smoothstep(.75, .98, e) * smoothstep(1., .98, e) * (.6 + .4 * sin(vUv.x * 40. - uT * 14.)) + .05; core = smoothstep(.9, .98, e); a *= smoothstep(1., .9, vUv.x); }
  gl_FragColor = vec4(mix(uB, uW, clamp(core, 0., 1.)) * a * uA, 1.); }`;
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };

export class EnFx extends CookFx {
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const j = await (await fetch('assets/fx/fx_engineer.glb.json')).json(), raw = atob(j.b64), u8 = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
      const g = await new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      this.chips = [this.geo.en_casing].filter(Boolean);
      this.tri3 = new THREE.BufferGeometry();
      this.ready = true;
    })().catch(e => console.warn('engfx load', e));
    return this.loading;
  }
  _mat(kind) {
    const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }])), Cc = () => new THREE.Color(1, 1, 1);
    if (kind === 'enflat') return new THREE.ShaderMaterial({ uniforms: U({ uW: Cc(), uB: Cc(), uA: 0, uK: 0, uP: 0, uT: 0 }), vertexShader: FLAT_VS, fragmentShader: EN_FS, ...ADD });
    return super._mat(kind);
  }
  _h(e, o = {}) { e.dispose = () => this._free(e); return Object.assign(e, o); }
  part(e, name, parent, o = {}) {
    const m = this.solid(e, this.geo[name], { tint: o.tint ?? ENFX.tint, rim: o.rim ?? 0xd8ecff, spec: o.spec ?? 0.7 }); m.renderOrder = o.order ?? 1;
    if (parent && parent !== e.g) parent.add(m);
    if (o.p) m.position.set(...o.p); if (o.s != null) (Array.isArray(o.s) ? m.scale.set(...o.s) : m.scale.setScalar(o.s));
    return m;
  }
  /** quad (spr) stretched from A to B (three coords), facing the camera, width w (same as js/wpharmfx.js seg) */
  seg(m, A, B, w) {
    _a.subVectors(B, A); const L = _a.length() || 1e-4; _a.multiplyScalar(1 / L);
    _b.crossVectors(_a, this.toCam); if (_b.lengthSq() < 1e-8) _b.set(0, 0, 1); _b.normalize(); _c.crossVectors(_a, _b);
    _m4.makeBasis(_a, _b, _c); m.quaternion.setFromRotationMatrix(_m4); m.position.addVectors(A, B).multiplyScalar(0.5); m.scale.set(L, w, 1);
  }
  pivot(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
  glowM(m, col, k) { const u = m.material.uniforms; u.uTint.value.setHex(col); u.uGlow.value = k; }
  flat(e, k, w, b, order = 2) { const m = this._m(e, 'enflat', this.quad, order), u = m.material.uniforms; u.uK.value = k; u.uP.value = 0; u.uT.value = 0; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uA.value = 0; return m; }
  flash(at, w, b, size, life = 0.08, a = 1.2, k = 3) {
    const e = this._fx('enflash', life, (e) => { const t = e.t / life; f.quaternion.copy(this.camQ); f.scale.setScalar(size * (0.6 + 0.6 * easeOut(t))); f.material.uniforms.uA.value = ENFX.intensity * a * (1 - smooth(0.2, 1, t)); });
    e.g.position.copy(at); const f = this.spr(e, k, w, b, 7); return e;
  }
  ring(at, r, w, b, life = 0.3, a = 1.2, grow = true) {
    const e = this._fx('enring', life, (e) => { const t = e.t / life, s = r * 2 * (grow ? 0.3 + 0.7 * easeOut(t) : 1); m.scale.set(s, s, 1); m.material.uniforms.uA.value = ENFX.intensity * a * (1 - smooth(0.35, 1, t)); });
    e.g.position.copy(at); e.g.position.y += 0.06; const m = this.spr(e, 1, w, b, 3); m.rotation.set(-Math.PI / 2, 0, 0); return e;
  }
  puffs(at, n, r, o = {}) { this._puffs(at, lite() ? Math.min(n, ENFX.puffsLite) : n, r, { c1: o.c1 ?? C.steam, c2: o.c2 ?? C.steamB, a: o.a ?? 0.45, life: o.life ?? 0.55, rise: o.rise ?? 0.6 }); }
  sparks(at, n, o = {}) { if (!this.geo.en_lens) return; this._bits(at, lite() ? Math.min(n, ENFX.sparksLite) : n, { geo: this.geo.en_lens, tint: o.tint ?? C.spark, size: o.size || [0.012, 0.025], speed: o.speed || [1.5, 3.4], up: o.up || [1.2, 2.6], ground: o.ground ?? at.y - 1, life: o.life || 0.35 }); }
  casing(at, yaw) { if (!this.geo.en_casing || (lite() ? ENFX.casingsLite : ENFX.casings) <= 0) return; const side = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)); this._bits(at.clone().addScaledVector(side, 0.12), 1, { geo: this.geo.en_casing, size: [0.9, 1.1], speed: [0.8, 1.4], up: [1.4, 2.0], ground: at.y - 0.9, life: 0.5 }); }
  /** ground line quad from A to B (three coords), width w, lying flat */
  groundLine(m, A, B, w) { _a.subVectors(B, A); const L = Math.hypot(_a.x, _a.z) || 1e-4; m.position.set((A.x + B.x) / 2, Math.max(A.y, B.y) + 0.05, (A.z + B.z) / 2); m.rotation.set(-Math.PI / 2, 0, Math.atan2(-_a.z, _a.x)); m.scale.set(L, w, 1); }
  /** heat colour of the machines' core: 1 = redline (orange), -1 = cooling (grey-blue), 0 = normal teal */
  heatCol(kit) { const h = kit && kit.heat ? kit.heat() : 0; return h > 0 ? C.orange : h < 0 ? 0x8aa0c0 : C.teal; }
  /** device thrown along an arc from the hand to the ground point: returns the current position (three) */
  arc(from, to, k, h = 1.1) { return _b.copy(from).lerp(to, k).setY(from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * h); }

  // ------------------------------------------------------------------ A1 전개식 센트리 (s.en: fly → deploy → on; yaw/pitch/recoil from the rules)
  sentry(s, o) {
    if (!this._ok()) return null; const kit = o.kit, K = { fly: 0.36, deploy: 0.55 };
    let endT = -1; const from = s.en.from ? P3(s.en.from) : P3(s.pos).setY(1.2);
    const e = this._fx('sentry', 1e9, (e, dt) => {
      const en = s.en, at = P3(s.pos);
      if (endT >= 0) { endT += dt; const k = clamp01(endT / 0.4); e.g.scale.setScalar(1 - 0.6 * k); for (const m of e.items) if (m.material.uniforms.uA) m.material.uniforms.uA.value = 1 - k; if (k >= 1) e.t = e.life; return; }
      if (en.phase === 'fly') { e.g.scale.setScalar(1); e.g.position.copy(this.arc(from, at, en.t / K.fly)); base.rotation.set(en.t * 9, en.t * 5, 0); legs.forEach(l => l.rotation.x = 0); head.position.y = 0.1; head.scale.setScalar(0.01); barP.rotation.x = 0; return; }
      e.g.position.copy(at); e.g.scale.setScalar(1.3); base.rotation.set(0, 0, 0);
      const d = en.phase === 'deploy' ? en.t / K.deploy : 1, kl = easeOut(d / 0.55), kh = easeOut((d - 0.25) / 0.5), kb = easeOut((d - 0.55) / 0.45);
      legs.forEach(l => l.rotation.x = -0.65 * kl);                           // 지지대 세 개가 펼쳐짐
      head.position.y = 0.3 + 0.28 * kh; head.scale.setScalar(Math.max(0.01, kh));
      head.rotation.y = yawRot(en.yaw);
      barP.rotation.x = d < 1 ? -1.4 * (1 - kb) : -en.pitch;                 // 포신: 접혀 있다가 들어 올려져 조준
      bar.position.z = -0.09 * (en.recoil || 0);                              // 반동
      const h = kit.heat(), mod = kit.moduleOf();
      fins.forEach((f, i) => f.rotation.z = (i ? -1 : 1) * (h > 0 ? 0.9 : 0.15) );   // 레드라인: 냉각판 열림
      drum.visible = mod === 'speed'; if (drum.visible) drum.rotation.x += dt * (6 + 30 * (en.recoil || 0));
      muz.visible = mod === 'power';
      this.glowM(lens, this.heatCol(kit), 0.5 + 0.6 * kb + (h > 0 ? 0.3 * Math.sin(e.t * 18) : 0)); lens.visible = d > 0.7;
      hm.material.uniforms.uTint.value.setHex(h > 0 ? 0xd8a088 : h < 0 ? 0x8898b8 : ENFX.tint); hm.material.uniforms.uGlow.value = h > 0 ? 0.08 + 0.06 * Math.sin(e.t * 9) : 0;   // 과부하: 몸체가 달아오름 / 냉각: 푸르게
      warn.visible = h > 0; if (warn.visible) { warn.quaternion.copy(this.camQ); warn.material.uniforms.uA.value = 0.9 * (0.5 + 0.5 * Math.sin(e.t * 14)); }
    });
    const base = this.part(e, 'en_case', e.g), legs = [0, 1, 2].map(i => { const p = this.pivot(e.g, 0, 0.12, 0); p.rotation.y = i * 2.094; const q = this.pivot(p); this.part(e, 'en_leg', q); return q; });
    const head = this.pivot(e.g, 0, 0.3, 0), hm = this.part(e, 'en_head', head);
    const barP = this.pivot(head, 0, 0.16, 0.08), bar = this.pivot(barP), barM = this.part(e, 'en_barrel', bar); void barM;
    const drum = this.part(e, 'en_drum', bar, { p: [0, 0.1, 0.12] }), muz = this.part(e, 'en_muzzle', bar, { p: [0, 0, 0.62] });
    const fins = [-1, 1].map(sx => { const p = this.pivot(head, sx * 0.18, 0.26, -0.1); this.part(e, 'en_fin', p, { s: 1.15 }); return p; });
    const lens = this.part(e, 'en_lens', head, { p: [0, 0.16, 0.17], s: 0.045 });
    const warn = this.spr(e, 0, 0xffffff, C.red, 6); head.add(warn); warn.position.set(0, 0.36, -0.12); warn.scale.setScalar(0.26);
    const self = this;
    return this._h(e, {
      fire(o2 = {}) { if (e.dead) return; bar.updateMatrixWorld(true); const tip = new THREE.Vector3(0, 0, 0.66).applyMatrix4(bar.matrixWorld);
        self.flash(tip, 0xffffff, o2.burst ? C.orange : C.gold, o2.burst ? 0.42 : 0.32, 0.06, 1.3); self.casing(tip.clone().setY(tip.y - 0.05), -(s.en.yaw)); },
      focus() { if (e.dead) return; head.updateMatrixWorld(true); const p = new THREE.Vector3(0, 0.3, 0).applyMatrix4(head.matrixWorld); self.ring(p, 0.35, C.orange, C.red, 0.25, 1.0); },
      end(why) { if (endT < 0) endT = 0; if (why !== 'clear') self.puffs(P3(s.pos).setY(0.3), 3, 0.5); },
    });
  }

  // ------------------------------------------------------------------ A2 스파이더 마인
  spider(s) {
    if (!this._ok()) return null; const K = { fly: 0.32, unfold: 0.4 }; let endT = -1, last = { ...s.pos }, gait = 0, yaw = Math.atan2(s.en.yaw ? Math.sin(s.en.yaw) : 0, 1);
    const from = s.en.from ? P3(s.en.from) : P3(s.pos).setY(1.2);
    const e = this._fx('spider', 1e9, (e, dt) => {
      const en = s.en, at = P3(s.pos);
      if (endT >= 0) { endT += dt; const k = clamp01(endT / 0.3); for (const m of e.items) if (m.material.uniforms.uA) m.material.uniforms.uA.value = 1 - k; if (k >= 1) e.t = e.life; return; }
      const mv = Math.hypot(s.pos.x - last.x, s.pos.z - last.z); if (mv > 1e-4) { yaw = Math.atan2(s.pos.x - last.x, s.pos.z - last.z); gait += mv * 9; } last = { ...s.pos };
      if (en.phase === 'fly') { e.g.position.copy(this.arc(from, at, en.t / K.fly, 0.9)); body.rotation.set(en.t * 12, 0, 0); legs.forEach(l => l.rotation.z = 1.3); return; }
      e.g.position.copy(at); e.g.scale.setScalar(1.3); body.rotation.set(0, yawRot(yaw), 0);
      const ku = en.phase === 'unfold' ? easeOut(en.t / K.unfold) : 1;
      let lift = 0.16 * ku, bob = 0;
      if (en.phase === 'chase') { bob = Math.abs(Math.sin(gait)) * 0.04; }
      if (en.phase === 'leap') { const k = clamp01(en.t / 0.24); lift += Math.sin(k * Math.PI) * 0.7; }
      body.position.y = lift + bob;
      legs.forEach((l, i) => { const ph = gait + (i % 2) * Math.PI; l.rotation.z = 1.3 * (1 - ku) + (en.phase === 'chase' ? 0.35 * Math.sin(ph) : 0) + (en.phase === 'leap' ? 0.8 : 0); });
      const alarm = en.phase === 'chase' || en.phase === 'leap';
      this.glowM(lamp, alarm ? C.red : 0x5a2a20, alarm ? (Math.sin(e.t * 22) > 0 ? 1.4 : 0.2) : 0.15 + 0.1 * Math.sin(e.t * 3));
      halo.visible = alarm && Math.sin(e.t * 22) > 0; if (halo.visible) { halo.quaternion.copy(this.camQ); halo.material.uniforms.uA.value = 0.9; }
    });
    const body = this.pivot(e.g); this.part(e, 'en_spider', body);
    const legs = [0.6, 2.54, 3.74, 5.68].map(a => { const p = this.pivot(body, Math.sin(a) * 0.26, 0.1, Math.cos(a) * 0.26); p.rotation.y = a - Math.PI / 2; const q = this.pivot(p); this.part(e, 'en_sleg', q); return q; });
    const lamp = this.part(e, 'en_lens', body, { p: [0, 0.22, 0], s: 0.06 });
    const halo = this.spr(e, 0, 0xffffff, C.red, 6); body.add(halo); halo.position.set(0, 0.3, 0); halo.scale.setScalar(0.4);
    return this._h(e, { alert() { }, leap() { }, end(why) { if (endT < 0) endT = why === 'spent' ? 0.29 : 0; } });
  }

  // ------------------------------------------------------------------ A3 트라이윙 드론 (s.en.h = 높이, eject = 등 뒤에서 솟아 날개를 폄)
  drone(s, o) {
    if (!this._ok()) return null; const kit = o.kit; let endT = -1;
    const e = this._fx('drone', 1e9, (e, dt) => {
      const en = s.en, at = P3(s.pos).setY((s.pos.y || 0) + en.h);
      if (endT >= 0) { endT += dt; const k = clamp01(endT / 0.4); e.g.position.y += dt * 1.2; for (const m of e.items) if (m.material.uniforms.uA) m.material.uniforms.uA.value = 1 - k; if (k >= 1) e.t = e.life; return; }
      e.g.visible = en.phase !== 'wait'; if (!e.g.visible) return;
      const ke = en.phase === 'eject' ? easeOut(en.t / 0.35) : 1;
      e.g.scale.setScalar(1.6); e.g.position.copy(at); e.g.position.y += Math.sin(e.t * 4 + en.idx) * 0.05 + (en.phase === 'eject' ? (1 - ke) * -0.3 : 0);
      e.g.rotation.set(0.12 * (en.recoil || 0), yawRot(en.yaw), 0); en.recoil = Math.max(0, (en.recoil || 0) - dt * 6);
      wings.forEach((w, i) => w.rotation.z = (i ? -1 : 1) * (1.4 * (1 - ke)) + (i ? 1 : -1) * 0.08 * Math.sin(e.t * 30));
      const al = en.aligning > 0; this.glowM(eye, al ? C.gold : this.heatCol(kit), al ? 1.2 : 0.7);
      jet.quaternion.copy(this.camQ); jet.material.uniforms.uA.value = 0.5 + 0.2 * Math.sin(e.t * 40); jet.material.uniforms.uW.value.setHex(kit.heat() > 0 ? C.orange : C.teal);
    });
    this.part(e, 'en_drone', e.g); const wings = [1, -1].map(sx => { const p = this.pivot(e.g, sx * 0.1, 0.02, 0); p.rotation.y = sx > 0 ? 0 : Math.PI; const q = this.pivot(p); this.part(e, 'en_wing', q); return q; });
    const eye = this.part(e, 'en_lens', e.g, { p: [0, 0.02, 0.18], s: 0.035 });
    const jet = this.spr(e, 0, C.teal, C.tealB, 5); e.g.add(jet); jet.position.set(0, -0.12, -0.12); jet.scale.setScalar(0.22);
    const self = this;
    return this._h(e, {
      fire(o2 = {}) { if (e.dead) return; e.g.updateMatrixWorld(true); const tip = new THREE.Vector3(0, 0, 0.32).applyMatrix4(e.g.matrixWorld); self.flash(tip, 0xffffff, o2.salvo ? C.gold : C.teal, o2.salvo ? 0.3 : 0.2, 0.05, 1.1); },
      align() { if (e.dead) return; self.ring(e.g.position.clone().setY(e.g.position.y - 0.06), 0.28, C.gold, C.goldB, 0.3, 0.9); },
      end() { if (endT < 0) endT = 0; },
    });
  }

  // ------------------------------------------------------------------ A4 테슬라 앵커 (전극 3개 → 코일 전개 → 전류 연결; 바닥 삼각형 = 실제 판정)
  anchor(s, o) {
    if (!this._ok()) return null; const K = { fly: 0.3, pin: 0.1, link: 0.35 }, pts = s.en.pts.map(P3), from = s.en.from ? P3(s.en.from) : P3(s.pos).setY(1.2);
    let endT = -1; const zaps = [];
    const e = this._fx('anchor', 1e9, (e, dt) => {
      const en = s.en; let a = 1;
      if (endT >= 0) { endT += dt; a = 1 - clamp01(endT / 0.35); if (a <= 0) { e.t = e.life; g.dispose(); return; } }
      const tf = en.phase === 'fly' ? en.t : K.fly + 2 * K.pin + 1, tl = en.phase === 'link' ? en.t / K.link : en.phase === 'on' ? 1 : 0;
      pyl.forEach((p, i) => { const k = clamp01((tf - i * K.pin) / K.fly); p.position.copy(k < 1 ? this.arc(from, pts[i], k, 1.0) : pts[i]); p.rotation.set(k < 1 ? (1 - k) * 4 : 0, 0, 0);
        coils[i].forEach((c, j) => { c.position.y = 0.25 + j * 0.22 * (0.4 + 0.6 * easeOut(tl)); c.scale.setScalar(0.06 + 0.07 * easeOut(tl - j * 0.15)); });
        this.glowM(tops[i], C.ice, (tl > 0 ? 0.6 + 0.5 * Math.sin(e.t * 25 + i) : 0.1) * a); });
      // current: thin jagged lines between the pylon tops (only when linked), re-jittered every few frames
      const on = tl * a; for (let i = 0; i < 3; i++) { const A = pyl[i].position.clone().setY(pts[i].y + 1.0), B = pyl[(i + 1) % 3].position.clone().setY(pts[(i + 1) % 3].y + 1.0);
        segs[i].forEach((m, k) => { const t0 = k / segs[i].length, t1 = (k + 1) / segs[i].length, j0 = k === 0 ? 0 : Math.sin(e.t * 47 + i * 3 + k * 1.7) * 0.12, j1 = k === segs[i].length - 1 ? 0 : Math.sin(e.t * 47 + i * 3 + (k + 1) * 1.7) * 0.12;
          const P = A.clone().lerp(B, t0).setY(A.y + j0), Q = A.clone().lerp(B, t1).setY(A.y + j1); this.seg(m, P, Q, 0.12); m.material.uniforms.uA.value = 1.1 * on * (0.7 + 0.3 * Math.sin(e.t * 60 + k)); });
        this.groundLine(edges[i], pts[i], pts[(i + 1) % 3], 0.14); edges[i].material.uniforms.uA.value = 0.9 * on; edges[i].material.uniforms.uT.value = e.t; }
      fill.material.uniforms.uA.value = 0.7 * on; fill.material.uniforms.uT.value = e.t;
      for (const z of zaps) { z.t -= dt; z.m.material.uniforms.uA.value = Math.max(0, z.t / 0.12) * 1.3; }
    });
    const pyl = pts.map(() => { const p = this.pivot(e.g); this.part(e, 'en_pylon', p); return p; });
    const coils = pyl.map(p => [0, 1, 2].map(() => this.part(e, 'en_coil', p, { s: 0.06 })));
    const tops = pyl.map(p => this.part(e, 'en_lens', p, { p: [0, 1.08, 0], s: 0.07 }));
    const segs = [0, 1, 2].map(() => [0, 1, 2, 3, 4].map(() => this.spr(e, 2, 0xffffff, C.iceB, 6)));
    const edges = [0, 1, 2].map(() => this.flat(e, 2, C.ice, C.blueB, 2));
    // ground triangle fill = the real hit area (feet inside)
    const g = new THREE.BufferGeometry(), c3 = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / 3), pos = [], uv = [];
    for (let i = 0; i < 3; i++) { const A = pts[i], B = pts[(i + 1) % 3]; pos.push(c3.x, c3.y + 0.04, c3.z, A.x, A.y + 0.04, A.z, B.x, B.y + 0.04, B.z); uv.push(0, 0, 1, 0, 1, 0); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const fill = this._m(e, 'enflat', g, 2); fill.material.uniforms.uK.value = 1; fill.material.uniforms.uW.value.setHex(C.ice); fill.material.uniforms.uB.value.setHex(C.blueB);
    const self = this;
    return this._h(e, {
      zap(ps) { if (e.dead) return; for (const p of ps.slice(0, 4)) { let bi = 0, bd = 1e9; pyl.forEach((q, i) => { const d = q.position.distanceTo(P3(p)); if (d < bd) { bd = d; bi = i; } });
        const m = self.spr(e, 2, 0xffffff, C.iceB, 7); self.seg(m, pyl[bi].position.clone().setY(pts[bi].y + 1.0), P3(p).setY((p.y || 0) + 0.7), 0.1); zaps.push({ m, t: 0.12 }); }
        while (zaps.length > 8) { const z = zaps.shift(); z.m.visible = false; } },
      end() { if (endT < 0) endT = 0; },
      dispose() { g.dispose(); self._free(e); },
    });
  }
  /** 앵커 지정 대상: 발밑 얇은 청록 고리(이름표·체력 막대·경고를 가리지 않음) */
  focus(t) {
    const e = this._fx('focus', 1e9, (e) => { if (!t || t.dead || t.removed) { e.t = e.life; return; } e.g.position.copy(P3(t.pos)).setY((t.pos.y || 0) + 0.05);
      const R = (t.radius || 0.5) + 0.28; m.scale.set(R * 2, R * 2, 1); m.rotation.z = e.t * 1.5; m.material.uniforms.uA.value = 1.1 + 0.25 * Math.sin(e.t * 6); });
    const m = this.spr(e, 1, C.teal, C.tealB, 3); m.rotation.set(-Math.PI / 2, 0, 0); return this._h(e);
  }

  // ------------------------------------------------------------------ A5 아틀라스 워커 (drop → assemble → on → fold)
  walker(s, o) {
    if (!this._ok()) return null; const kit = o.kit, K = { drop: 0.35, assemble: 1.3, fold: 0.9 }, SC = ENFX.walkerScale; let endT = -1, puffT = 0, step = 0, gunSide = 1;
    const e = this._fx('walker', 1e9, (e, dt) => {
      const en = s.en, at = P3(s.pos);
      e.g.position.copy(at); e.g.rotation.y = yawRot(en.yaw); e.g.scale.setScalar(SC);
      if (endT >= 0) { endT += dt; const k = clamp01(endT / 0.45); for (const m of e.items) if (m.material.uniforms.uA) m.material.uniforms.uA.value = 1 - k; if (k >= 1) e.t = e.life; return; }
      let tA = en.phase === 'drop' ? -1 : en.phase === 'assemble' ? en.t : K.assemble + 1, open = 1, hip = 1.05;
      if (en.phase === 'drop') { const k = clamp01(en.t / K.drop); core.position.y = 6 * (1 - k * k) + 0.55 * k * k; core.visible = true; }
      if (en.phase === 'fold') { const k = clamp01(en.t / K.fold); tA = K.assemble * (1 - k); }
      const ka = (a, b) => easeOut((tA - a) / (b - a));
      legs.forEach(l => l.thigh.scale.setScalar(Math.max(0.01, ka(0, 0.35))));
      hull.position.y = (tA < 0.75 ? 0.55 + 2.2 * (1 - ka(0.3, 0.75)) : 0.55 + 0.5 * ka(0.85, 1.15)); hull.visible = tA >= 0.3;
      hip = hull.position.y;
      plates.forEach((p, i) => { p.visible = tA >= 0.6; p.position.y = 0.8 + 0.6 * (1 - ka(0.6, 0.9)); open = ka(1.1, K.assemble); p.rotation.x = -1.1 * open * (en.phase === 'on' ? 1 : 1); void i; });
      lid.rotation.x = -1.4 * open; core.visible = en.phase !== 'drop' ? tA < 0.75 : true; if (tA >= 0 && tA < 0.75) core.position.y = 0.55 + 0.6 * ka(0.3, 0.75);
      // legs: thigh/shin angles keep the feet on the ground as the hip rises; walking swings them
      const sw = en.walking ? Math.sin(step) * 0.35 : 0; if (en.walking) step += dt * 6;
      legs.forEach((l, i) => { const crouch = clamp01((1.05 - hip) / 0.5); l.thigh.position.y = hip; l.thigh.rotation.x = -0.6 * crouch + (i ? sw : -sw); l.shin.rotation.x = 1.2 * crouch - (i ? Math.max(0, sw) : Math.max(0, -sw)) * 0.6; });
      gun.rotation.z += dt * (en.recoil > 0.2 ? 30 : 2);
      cannonP.position.z = 0.35 - 0.25 * (en.cannon === 2 ? (en.recoil || 0) : 0);
      const ch = en.cannon === 1 ? clamp01((en.cyc - 3.6) / 0.4) : 0; this.glowM(muzzle, C.orange, ch * 1.6); muzzle.visible = ch > 0.02;
      this.glowM(eye, this.heatCol(kit), 0.6 + 0.3 * Math.sin(e.t * 5)); eye.visible = hull.visible;
      fins.forEach((f, i) => f.rotation.z = (i ? -1 : 1) * (kit.heat() > 0 ? 1.0 : 0.1));
      puffT -= dt; if ((en.phase === 'assemble' && en.t > 1.0 && en.t < 1.1) || (en.phase === 'on' && puffT <= 0 && kit.heat() < 0)) { puffT = 0.5; this.puffs(stackW(), 2, 0.4, { a: 0.5 }); }
    });
    const hull = this.pivot(e.g, 0, 1.05, 0), hm = this.part(e, 'en_w_hull', hull, { tint: 0x7f93b4 }); void hm;
    const legs = [-1, 1].map(sx => { const thigh = this.pivot(e.g, sx * 0.45, 1.05, 0); this.part(e, 'en_w_thigh', thigh); const shin = this.pivot(thigh, 0, -0.85, 0); this.part(e, 'en_w_shin', shin); return { thigh, shin }; });
    const plates = [-1, 1].map(sx => { const p = this.pivot(hull, sx * 0.32, 0.8, 0.58); this.part(e, 'en_w_plate', p); return p; });
    const gunP = this.pivot(hull, 0.82, 0.5, 0.1), gun = this.pivot(gunP); this.part(e, 'en_w_gun', gun);
    const rack = this.pivot(hull, -0.3, 0.84, -0.15); this.part(e, 'en_w_rack', rack); const lid = this.pivot(rack, 0, 0.3, -0.25); this.part(e, 'en_w_lid', lid);
    const cannonP = this.pivot(hull, 0, 0.45, 0.35); this.part(e, 'en_w_cannon', cannonP);
    const muzzle = this.part(e, 'en_lens', cannonP, { p: [0, 0, 1.55], s: 0.12 });
    const eye = this.part(e, 'en_lens', hull, { p: [0, 0.4, 0.6], s: 0.12 });
    const core = this.part(e, 'en_core', e.g, { s: 0.28 }); this.glowM(core, C.blue, 0.9);
    const fins = [-1, 1].map(sx => { const p = this.pivot(hull, sx * 0.62, 0.84, -0.42); this.part(e, 'en_fin', p, { s: 1.4 }); return p; });
    const stackW = () => { hull.updateMatrixWorld(true); return new THREE.Vector3(-0.45, 1.15, -0.42).applyMatrix4(hull.matrixWorld); };
    const W = (p, obj) => { obj.updateMatrixWorld(true); return new THREE.Vector3(...p).applyMatrix4(obj.matrixWorld); };
    const self = this;
    return this._h(e, {
      gun() { if (e.dead) return; gunSide = -gunSide; const tip = W([0, 0, 0.95], gun); self.flash(tip, 0xffffff, C.gold, 0.35, 0.05, 1.2); self.casing(tip.clone().setY(tip.y - 0.2), -s.en.yaw); },
      missile() { if (e.dead) return; const p = W([rnd(-0.13, 0.13), 0.35, rnd(-0.12, 0.12)], rack); self.flash(p, 0xffffff, C.orange, 0.3, 0.06, 1.0); self.puffs(p, 1, 0.2, { c1: C.smoke, c2: C.smokeB, a: 0.35 }); },
      charge() { },
      cannon() { if (e.dead) return; const tip = W([0, 0, 1.6], cannonP); self.flash(tip, 0xffffff, C.orange, 0.8, 0.08, 1.3); self.puffs(tip, 3, 0.4, { c1: C.smoke, c2: C.smokeB }); },
      vent() { if (!e.dead) self.puffs(stackW(), 2, 0.3); },
      fold() { if (!e.dead) self.puffs(P3(s.pos).setY(0.6), 4, 0.9); },
      end(why) { if (endT < 0) endT = 0; if (why !== 'clear') self.puffs(P3(s.pos).setY(0.5), 3, 0.8); },
    });
  }

  // ------------------------------------------------------------------ 탄·미사일·포탄·충격
  bullet(from, o = {}) {
    if (!this._ok()) return null; const col = o.col === 'teal' ? [C.ice, C.teal] : [0xffffff, C.gold];
    const e = this._fx('bullet', 2, () => { });
    const m = this.part(e, 'en_slug', e.g, { s: [0.025, 0.025, 0.11] }); this.glowM(m, col[1], 1.1); const tr = this.spr(e, 2, col[0], col[1], 6);
    e.g.position.copy(P3(from)); let prev = P3(from);
    return this._h(e, { set: (p, d) => { const q = P3(p); e.g.position.copy(q); _a.set(d.x, d.y || 0, -d.z).normalize(); m.quaternion.setFromUnitVectors(_z, _a); this.seg(tr, prev, q, 0.06); tr.position.sub(e.g.position); tr.material.uniforms.uA.value = 0.8; prev = prev.lerp(q, 0.5); } });
  }
  impact(at, o = {}) { if (!this._ok()) return; const p = P3(at); if (o.ok) { this.flash(p, 0xffffff, o.kind === 'gold' ? C.gold : C.orange, 0.3, 0.06, 1.0); this.sparks(p, 3, { ground: p.y - 0.7 }); } else this.flash(p, 0xffffff, C.steamB, 0.16, 0.05, 0.5); }
  blast(at, o = {}) {
    if (!this._ok()) return; const p = P3(at), r = o.r || 1, big = o.kind === 'cannon' || o.kind === 'orbital';
    this.flash(p.clone().setY(p.y + 0.4), 0xffffff, o.kind === 'mine' ? C.orange : C.gold, r * (big ? 1.2 : 1.0), 0.08, 1.3);
    this.ring(p, r, o.kind === 'orbital' ? C.ice : C.gold, o.kind === 'orbital' ? C.iceB : C.goldB, 0.28, 1.2);
    this.puffs(p, big ? 5 : 3, r * 0.8, { c1: C.smoke, c2: C.smokeB, a: 0.4, life: 0.7, rise: 0.8 });
    if (this.chips && this.geo.en_lens) this.sparks(p.clone().setY(p.y + 0.2), big ? 8 : 5, { tint: C.orange, speed: [2, 4.5], up: [2, 3.6], ground: p.y });
  }
  missile(from) {
    if (!this._ok()) return null; const puffs = [], low = lite(); let t = 0, next = 0, last = P3(from);
    const e = this._fx('missile', 4, (e, dt) => { t += dt; for (const pf of puffs) { pf.t += dt; const k = pf.t / 0.35; pf.m.scale.setScalar(0.12 + 0.18 * k); pf.m.quaternion.copy(this.camQ); pf.m.material.uniforms.uA.value = 0.4 * (1 - k); if (k >= 1) pf.m.visible = false; } });
    const body = this.part(e, 'en_missile', e.g, { s: 1.0 }), fl = this.spr(e, 3, 0xffffff, C.orange, 6); fl.scale.setScalar(0.22);
    const self = this;
    return this._h(e, {
      set(p, v) { const q = P3(p); body.position.copy(q); _a.set(v.x, v.y, -v.z).normalize(); body.quaternion.setFromUnitVectors(_z, _a); fl.position.copy(q).addScaledVector(_a, -0.22); fl.quaternion.copy(self.camQ); fl.material.uniforms.uA.value = 1.2;
        if (t >= next) { next = t + (low ? 0.08 : 0.04); let pf = puffs.find(x => !x.m.visible); if (!pf && puffs.length < (low ? 4 : 8)) { pf = { m: self.puff(e, C.steam, C.smokeB, 4), t: 0 }; puffs.push(pf); } if (pf) { pf.t = 0; pf.m.visible = true; pf.m.position.copy(last); } }
        last = q.clone().addScaledVector(_a, -0.25); },
      fizzle() { self.puffs(body.position.clone(), 1, 0.2, { c1: C.smoke, c2: C.smokeB, a: 0.3 }); },
    });
  }
  shell(from, o) {
    if (!this._ok()) return null; const A = P3(from), B = P3(o.to).setY((o.to.y || 0) + 0.3);
    const e = this._fx('shell', 3, () => { });
    const m = this.part(e, 'en_slug', e.g, { s: [0.08, 0.08, 0.3] }); this.glowM(m, C.orange, 1.2); const tr = this.spr(e, 2, 0xffffff, C.orange, 6);
    return this._h(e, { set: (k) => { const p = A.clone().lerp(B, clamp01(k)); p.y += Math.sin(clamp01(k) * Math.PI) * 0.4; _a.subVectors(B, A).normalize(); m.position.copy(p); m.quaternion.setFromUnitVectors(_z, _a); this.seg(tr, A.clone().lerp(B, Math.max(0, k - 0.25)), p, 0.16); tr.material.uniforms.uA.value = 1.0; } });
  }
  /** 파일 벙커 뒤쪽 원뿔 충격파(실제 원뿔 r·ang 그대로) */
  shock(at, o) {
    if (!this._ok()) return; const p = P3(at), f = o.f, ang = o.ang || 50, r = o.r || 2.4;
    const e = this._fx('shock', 0.32, (e) => { const k = e.t / 0.32; m.material.uniforms.uP.value = 0.1 + 0.95 * easeOut(k); m.material.uniforms.uA.value = 1.4 * (1 - smooth(0.5, 1, k)); });
    e.g.position.copy(p).setY(p.y + 0.06); const m = this._m(e, 'enflat', this.fan(ang), 3); const u = m.material.uniforms; u.uK.value = 0; u.uW.value.setHex(C.gold); u.uB.value.setHex(C.goldB);
    m.scale.setScalar(r); m.rotation.y = Math.atan2(f.z, f.x);   // fan points along local +x; game (fx, fz) -> three (fx, -fz)
    this.puffs(p, 2, r * 0.5, { a: 0.35 });
  }

  // ------------------------------------------------------------------ 손·팔·어깨의 화기 (누른 순간부터; 규칙이 피해 순간을 부름)
  hand(pc) { let h = null; try { h = pc.body && pc.body.handPoint && pc.body.handPoint(); } catch (er) { h = null; } return h ? h.clone() : P3(pc.pos).setY((pc.pos.y || 0) + 1.15); }
  handL(pc) { let h = null; try { h = pc.body && pc.body.handPointL && pc.body.handPointL(); } catch (er) { h = null; } return h ? h.clone() : P3(pc.pos).setY((pc.pos.y || 0) + 1.1); }
  /** B1 파일 벙커: 오른 팔뚝 옆 장치 — 0..0.16 피스톤 압축, 0.18 잠금(구리 띠 점등), strike = 말뚝 돌출(0.05 s) → 0.14 s 뒤 되돌아감 */
  pile(pc, o) {
    if (!this._ok()) return null; const f = o.f, rot = Math.atan2(f.x, -f.z); let stT = -1, hit = null;
    const e = this._fx('pile', 0.9, (e) => {
      e.g.position.copy(this.hand(pc)); e.g.rotation.set(0, rot, 0);
      const k0 = smooth(0, 0.16, e.t); piston.position.z = 0.32 - 0.18 * k0;
      this.glowM(lock, C.orange, e.t > 0.18 ? 0.9 : 0); const ks = stT < 0 ? 0 : e.t - stT;
      stake.position.z = 0.1 + (stT < 0 ? 0 : 0.55 * (ks < 0.05 ? ks / 0.05 : ks < 0.2 ? 1 : Math.max(0, 1 - (ks - 0.2) / 0.15)));
      const fade = 1 - smooth(0.7, 0.9, e.t); for (const m of e.items) if (m.material.uniforms.uA) m.material.uniforms.uA.value = fade;
    });
    const dev = this.pivot(e.g, 0.06, -0.04, -0.2); this.part(e, 'en_pile', dev); const piston = this.part(e, 'en_piston', dev, { p: [0, 0, 0.32] }), stake = this.part(e, 'en_stake', dev, { p: [0, 0, 0.1] });
    const lock = this.part(e, 'en_lens', dev, { p: [0, 0.12, 0.22], s: 0.03 });
    const self = this;
    return this._h(e, { strike(p) { stT = e.t; hit = p; dev.updateMatrixWorld(true); const tip = new THREE.Vector3(0, 0, 0.9).applyMatrix4(dev.matrixWorld);
      self.puffs(new THREE.Vector3(0, 0, 0.1).applyMatrix4(dev.matrixWorld), 2, 0.25, { a: 0.4 });
      if (p && p.ok) { const at = P3(p); self.flash(at, 0xffffff, C.gold, 0.9, 0.06, 1.4); self.sparks(at, ENFX.sparks, { ground: at.y - 0.9 }); } else self.flash(tip, 0xffffff, C.steamB, 0.25, 0.05, 0.6); void hit; } });
  }
  /** B2 브리치 캐논: 가슴 앞 짧은 포신, 탄약실 점등(0.1~0.3 s) → fire = 짧고 넓은 총구 불꽃 + 산탄 선 몇 개 + 반동 + 옆 증기 */
  breach(pc, o) {
    if (!this._ok()) return null; const f = o.f, rot = Math.atan2(f.x, -f.z); let fT = -1;
    const e = this._fx('breach', 0.95, (e) => {
      const base = P3(pc.pos).setY((pc.pos.y || 0) + 1.05); base.x += f.x * 0.45; base.z -= f.z * 0.45; e.g.position.copy(base); e.g.rotation.set(0, rot, 0);
      const kr = fT < 0 ? 0 : Math.max(0, 1 - (e.t - fT) / 0.22); cannon.position.z = -0.14 * kr; cannon.rotation.x = -0.25 * kr;
      this.glowM(ch, C.orange, fT < 0 ? smooth(0.08, 0.28, e.t) * 1.4 : Math.max(0, 1 - (e.t - fT) / 0.3));
      const fade = 1 - smooth(0.75, 0.95, e.t); for (const m of e.items) if (m.material.uniforms.uA && m.userData.kind === 'solid') m.material.uniforms.uA.value = fade;
    });
    const cannon = this.pivot(e.g); this.part(e, 'en_breach', cannon); const ch = this.part(e, 'en_lens', cannon, { p: [0, 0.16, 0.06], s: 0.045 });
    const self = this;
    return this._h(e, { fire(o2) { fT = e.t; cannon.updateMatrixWorld(true); const tip = new THREE.Vector3(0, 0, 0.62).applyMatrix4(cannon.matrixWorld);
      self.flash(tip, 0xffffff, C.orange, 0.9, 0.07, 1.4);
      // the real cone (r, ang) lights once as a short wave; a few pellet streaks inside it (drawing only — damage was rolled once per enemy)
      const gp = P3(pc.pos).setY((pc.pos.y || 0) + 0.06), ef = self._fx('breachfan', 0.22, (x) => { const k = x.t / 0.22; fm.material.uniforms.uP.value = 0.15 + 0.9 * easeOut(k); fm.material.uniforms.uA.value = 1.2 * (1 - smooth(0.5, 1, k)); });
      ef.g.position.copy(gp); const fm = self._m(ef, 'enflat', self.fan(o2.ang), 3); fm.material.uniforms.uK.value = 0; fm.material.uniforms.uW.value.setHex(C.gold); fm.material.uniforms.uB.value.setHex(C.orangeB); fm.scale.setScalar(o2.r); fm.rotation.y = Math.atan2(f.z, f.x);
      const n = lite() ? 4 : 7, base = Math.atan2(f.z, f.x);
      for (let i = 0; i < n; i++) { const a = base + ((i + 0.5) / n - 0.5) * o2.ang * Math.PI / 180 * 0.9, L = o2.r * rnd(0.55, 0.95), A = tip.clone(), B = new THREE.Vector3(gp.x + Math.cos(a) * L, tip.y - 0.4, gp.z - Math.sin(a) * L);
        const ls = self._fx('pellet', 0.12, (x) => { lm.material.uniforms.uA.value = 1.1 * (1 - x.t / 0.12); }); const lm = self.spr(ls, 2, 0xffffff, C.gold, 6); self.seg(lm, A, B, 0.05); }
      for (const t of o2.hits || []) self.impact(t, { ok: true });
      for (const sx of [-1, 1]) self.puffs(new THREE.Vector3(sx * 0.2, 0, 0.1).applyMatrix4(cannon.matrixWorld), 1, 0.2, { a: 0.5 }); } });
  }
  /** B4 헬릭스 레일캐논: 두 레일이 벌어지고 코일이 뒤 → 앞으로 점등(축전), 바닥 조준선 = 실제 직선, fire = 청백 탄체 + 나선 잔상 + 레일 후퇴 + 증기 */
  rail(pc, o) {
    if (!this._ok()) return null; const f = o.f, rot = Math.atan2(f.x, -f.z), len = o.len, FT = o.fire; let fT = -1, cancel = -1;
    const e = this._fx('rail', FT + 0.7, (e) => {
      const base = P3(pc.pos).setY((pc.pos.y || 0) + 1.08); base.x += f.x * 0.4; base.z -= f.z * 0.4; e.g.position.copy(base); e.g.rotation.set(0, rot, 0);
      const ks = easeOut(e.t / 0.2), kr = fT < 0 ? 0 : Math.max(0, 1 - (e.t - fT) / 0.3), fade = cancel >= 0 ? 1 - clamp01((e.t - cancel) / 0.2) : 1 - smooth(FT + 0.45, FT + 0.65, e.t);
      rails.forEach((r, i) => { r.position.x = (i ? 1 : -1) * (0.06 + 0.1 * ks); r.position.z = -0.2 * kr; });
      coils.forEach((c, i) => { const on = fT < 0 ? smooth(0.12 + i * 0.18, 0.22 + i * 0.18, e.t) : kr; c.position.z = 0.15 + i * 0.25 - 0.2 * kr; this.glowM(c, C.ice, on * 1.3 * fade); });
      // aim line on the ground (the real rect: from the caster along the press direction, width w)
      const A = P3(pc.pos), B = A.clone().add(new THREE.Vector3(f.x * len, 0, -f.z * len)); this.groundLine(aim, A, B, o.w); aim.material.uniforms.uA.value = (fT < 0 ? smooth(0, 0.2, e.t) * 0.9 : 0) * fade; aim.material.uniforms.uT.value = e.t;
      for (const m of e.items) if (m.userData.kind === 'solid') m.material.uniforms.uA.value = fade;
    });
    const rails = [-1, 1].map(() => { const p = this.pivot(e.g); this.part(e, 'en_rail', p); return p; });
    const coils = [0, 1, 2, 3].map(() => this.part(e, 'en_ring', e.g, { s: 0.16 }));
    const ae = this._fx('railaim', FT + 0.7, () => { }), aim = this.flat(ae, 2, C.ice, C.iceB, 2);   // 바닥 조준선은 장치(e.g)의 자식이 아니라 세계 좌표에
    const self = this;
    return this._h(e, {
      fire() { if (e.dead) return; fT = e.t; e.g.updateMatrixWorld(true); const tip = new THREE.Vector3(0, 0, 1.05).applyMatrix4(e.g.matrixWorld), end = tip.clone().add(new THREE.Vector3(f.x * (len - 0.5), 0, -f.z * (len - 0.5)));
        self.flash(tip, 0xffffff, C.ice, 0.7, 0.07, 1.2);
        const n = lite() ? ENFX.helixLite : ENFX.helix, side = new THREE.Vector3(-f.z, 0, -f.x).normalize(), up = new THREE.Vector3(0, 1, 0);
        const bm = self._fx('railbeam', 0.35, (x) => { const k = x.t / 0.35; beam.material.uniforms.uA.value = 1.5 * (1 - smooth(0.1, 1, k));
          dots.forEach((d, i) => { const t = i / n, a = t * 18 + x.t * 30; d.position.copy(tip).lerp(end, t).addScaledVector(side, Math.cos(a) * 0.22).addScaledVector(up, Math.sin(a) * 0.22); d.quaternion.copy(self.camQ); d.material.uniforms.uA.value = 1.2 * (1 - smooth(0.0, 1, k + t * 0.4)); }); });
        const beam = self.spr(bm, 2, 0xffffff, C.iceB, 7); self.seg(beam, tip, end, 0.34);
        const dots = Array.from({ length: n }, () => { const d = self.spr(bm, 0, C.ice, C.iceB, 6); d.scale.setScalar(0.2); return d; });
        for (const sx of [-1, 1]) self.puffs(tip.clone().addScaledVector(side, sx * 0.2), 1, 0.25, { a: 0.5 }); },
      cancel() { if (cancel < 0) cancel = e.t; ae.life = Math.min(ae.life, ae.t + 0.2); },
    });
  }
  /** B3 벌집 포드: 오른 어깨 뒤 — 덮개가 열리고(0.05~0.2 s) 미사일이 차례로 나감, 끝나면 닫힘 */
  pod(pc, o) {
    if (!this._ok()) return null; const end = o.first + o.n * o.gap + 0.35;
    const e = this._fx('pod', end + 0.3, (e) => {
      const yaw = Math.atan2(pc.facing.x, pc.facing.z); e.g.position.copy(P3(pc.pos)).setY((pc.pos.y || 0) + 1.35); e.g.rotation.set(0, yawRot(yaw), 0);
      lidP.rotation.x = -1.6 * (smooth(0.05, 0.2, e.t) * (1 - smooth(end - 0.2, end, e.t)));
      const fade = 1 - smooth(end, end + 0.25, e.t), app = easeOut(e.t / 0.12); podP.scale.setScalar(Math.max(0.01, app)); for (const m of e.items) if (m.userData.kind === 'solid') m.material.uniforms.uA.value = fade;
    });
    const podP = this.pivot(e.g, 0.2, 0, -0.28); podP.rotation.x = -0.35; this.part(e, 'en_pod', podP); const lidP = this.pivot(podP, 0, 0.41, -0.17); this.part(e, 'en_pod_lid', lidP);
    const self = this;
    return this._h(e, { launch(i) { if (e.dead) return; podP.updateMatrixWorld(true); const p = new THREE.Vector3(-0.13 + (i % 3) * 0.13, 0.45, (i % 2) ? 0.08 : -0.08).applyMatrix4(podP.matrixWorld); self.flash(p, 0xffffff, C.orange, 0.22, 0.05, 1.0); } });
  }
  /** 손목 단말 신호(드론 사출·레드라인·포격 지정): 왼손 작은 단말 + 청록(레드라인은 주황) 고리 */
  signal(pc, o) {
    if (!this._ok()) return null; const col = o.kind === 'en_redline' ? C.orange : o.kind === 'en_orbital' ? C.ice : C.teal;
    const e = this._fx('signal', 0.6, (e) => { const p = this.handL(pc); e.g.position.copy(p); wr.quaternion.copy(this.camQ); const k = e.t / 0.6; this.glowM(scr, col, 1.2 * (1 - k));
      g.quaternion.copy(this.camQ); g.scale.setScalar(0.18 + 0.4 * smooth(0.15, 0.35, e.t)); g.material.uniforms.uA.value = e.t > 0.15 ? 1.0 * (1 - smooth(0.3, 0.6, e.t)) : 0; });
    const wr = this.pivot(e.g); this.part(e, 'en_wrist', wr, { s: 1.4 }); const scr = this.part(e, 'en_lens', wr, { p: [0, 0.03, 0], s: 0.03 }); const g = this.spr(e, 1, 0xffffff, col, 6);
    if (o.kind === 'en_orbital') { const p0 = P3(pc.pos).setY((pc.pos.y || 0) + 1.4); const b = this._fx('uplink', 0.45, (x) => { const k = x.t / 0.45; this.seg(m, p0, p0.clone().setY(p0.y + 2 + 10 * easeOut(k)), 0.07); m.material.uniforms.uA.value = 1.1 * (1 - k); }); const m = this.spr(b, 2, 0xffffff, C.iceB, 6); }
    return this._h(e);
  }
  /** B5 오비탈 브레이커: 조준 고리가 차례로 고정(실제 반경), 가는 낙하 궤적이 점점 밝아짐, 정밀 포격 3 → 중심 포격(낮은 원형 충격파·파편; 화면을 덮는 기둥·흰 섬광 없음) */
  orbital(at, o) {
    if (!this._ok()) return null; const c = P3(at), locks = [], R = o.R;
    let coreT = -1, cancel = -1;
    const e = this._fx('orbital', 4.0, (e, dt) => {
      const fade = cancel >= 0 ? 1 - clamp01((e.t - cancel) / 0.25) : 1;
      outer.position.copy(c).setY(c.y + 0.05); outer.scale.set(R * 2, R * 2, 1); outer.material.uniforms.uA.value = 0.35 * smooth(0, 0.3, e.t) * (coreT < 0 ? 1 : 0) * fade;
      cr.position.copy(c).setY(c.y + 0.06); const kc = smooth(0.4, 1.9, e.t); cr.scale.set(o.core * 2, o.core * 2, 1); cr.rotation.z = -e.t; cr.material.uniforms.uA.value = (coreT < 0 ? 0.5 + 0.7 * kc : 0) * fade;
      ctrail.material.uniforms.uA.value = (coreT < 0 ? 0.25 + 0.9 * kc * kc : 0) * fade; this.seg(ctrail, c.clone().setY(c.y + 14), c.clone().setY(c.y + 0.1), 0.06 + 0.1 * kc);
      for (const L of locks) { L.t += dt; const k = clamp01(L.t / 0.18), kt = clamp01(L.t / 1.0); L.ring.scale.set(o.r * 2 * (1.6 - 0.6 * easeOut(k)), o.r * 2 * (1.6 - 0.6 * easeOut(k)), 1); L.ring.rotation.z = L.t * 2;
        L.ring.material.uniforms.uA.value = (L.done ? 0 : 1.2) * fade; L.tr.material.uniforms.uA.value = (L.done ? 0 : 0.2 + 1.0 * kt * kt) * fade; this.seg(L.tr, L.p.clone().setY(L.p.y + 14), L.p.clone().setY(L.p.y + 0.1), 0.04 + 0.05 * kt); }
      if (coreT >= 0 && e.t - coreT > 0.9) e.t = e.life;
    });
    const outer = this.spr(e, 1, C.ice, C.iceB, 3); outer.rotation.set(-Math.PI / 2, 0, 0);
    const cr = this.spr(e, 1, C.ice, C.blueB, 3); cr.rotation.set(-Math.PI / 2, 0, 0); const ctrail = this.spr(e, 2, 0xffffff, C.iceB, 6);
    const self = this;
    return this._h(e, {
      lock(i, p) { if (e.dead) return; const L = { p: P3(p), t: 0, ring: self.spr(e, 1, C.gold, C.orangeB, 4), tr: self.spr(e, 2, 0xffffff, C.goldB, 6), done: false }; L.ring.rotation.set(-Math.PI / 2, 0, 0); L.ring.position.copy(L.p).setY(L.p.y + 0.06); locks[i] = L; },
      strike(i, p, hit) { const L = locks[i]; if (L) L.done = true; const q = P3(p); self.flash(q.clone().setY(q.y + 0.5), 0xffffff, C.gold, 1.0, 0.07, 1.2); self.blast(p, { r: o.r, kind: 'missile', hit }); },
      core(hit) { coreT = e.t; const b = self._fx('orbcore', 0.16, (x) => { m.material.uniforms.uA.value = 1.4 * (1 - x.t / 0.16); }); const m = self.spr(b, 2, 0xffffff, C.iceB, 7); self.seg(m, c.clone().setY(c.y + 12), c.clone().setY(c.y + 0.1), 0.5);
        self.blast({ x: c.x, y: c.y, z: -c.z }, { r: o.core, kind: 'orbital', hit }); self.ring(c, o.core * 1.0, C.ice, C.iceB, 0.45, 1.0); self.sparks(c.clone().setY(c.y + 0.3), 10, { tint: C.ice, speed: [3, 6], up: [2.5, 4], ground: c.y }); },
      cancel() { if (cancel < 0) cancel = e.t; },
    });
  }

  // ------------------------------------------------------------------ C3 리페어 비콘 + 정비 드론 · C4 리커버리 코어 · C5 레드라인 · 제작
  beacon(at, o) {
    if (!this._ok()) return null; const p = P3(at); let endT = -1, weldT = 0, tgt = null; const home = p.clone().add(new THREE.Vector3(0.5, 1.4, 0.3));
    const e = this._fx('beacon', 1e9, (e, dt) => {
      const a = endT < 0 ? 1 : 1 - clamp01((endT += dt) / 0.35); if (a <= 0) { e.t = e.life; return; }
      const k = easeOut(e.t / 0.15); bea.position.copy(p).setY(p.y + 0.8 * (1 - k)); this.glowM(lamp, C.teal, (0.5 + 0.5 * Math.sin(e.t * 6)) * a);
      rng.position.copy(p).setY(p.y + 0.05); rng.scale.set(o.r * 2, o.r * 2, 1); rng.material.uniforms.uA.value = 0.28 * a * smooth(0, 0.3, e.t);
      weldT -= dt; const want = tgt && !tgt.dead && weldT > 0 ? P3(tgt.pos).setY((tgt.pos.y || 0) + (tgt.en && tgt.en.kind === 'drone' ? tgt.en.h + 0.3 : 0.9)).add(new THREE.Vector3(0.3, 0.2, 0.2)) : home.clone().setY(home.y + Math.sin(e.t * 3) * 0.1);
      dr.position.lerp(want, Math.min(1, dt * 5)); dr.rotation.y += dt * 2; for (const m of e.items) if (m.userData.kind === 'solid') m.material.uniforms.uA.value = a;
    });
    const bea = this.pivot(e.g); this.part(e, 'en_beacon', bea); const lamp = this.part(e, 'en_lens', bea, { p: [0, 0.82, 0], s: 0.07 });
    const rng = this.spr(e, 1, C.teal, C.tealB, 3); rng.rotation.set(-Math.PI / 2, 0, 0);
    const dr = this.pivot(e.g); dr.position.copy(home); this.part(e, 'en_drone', dr, { s: 0.55 }); this.part(e, 'en_wrench', dr, { p: [0, -0.05, 0.12], s: 1.0 });
    const self = this;
    return this._h(e, {
      weld(s) { tgt = s; weldT = 0.8; const q = P3(s.pos).setY((s.pos.y || 0) + (s.en && s.en.kind === 'drone' ? s.en.h : 0.6)); self.flash(q, 0xffffff, C.teal, 0.3, 0.08, 1.0); self.sparks(q, 5, { tint: C.spark, speed: [1, 2.4], up: [0.6, 1.6], ground: q.y - 0.6, life: 0.4 }); },
      end() { if (endT < 0) endT = 0; },
    });
  }
  core(from, o) {
    if (!this._ok()) return null; const A = P3(from), pc = o.to;
    const e = this._fx('recover', 0.6, (e) => { const k = e.t / 0.55, B = P3(pc.pos).setY((pc.pos.y || 0) + 1.15); cm.position.copy(this.arc(A, B, easeOut(k), 0.9)); cm.rotation.y += 0.2; cm.scale.setScalar(0.09 * (1 - 0.5 * k));
      gl.position.copy(cm.position); gl.quaternion.copy(this.camQ); gl.material.uniforms.uA.value = 0.9; if (k >= 1 && !e.done) { e.done = true; this.flash(B, 0xffffff, C.blue, 0.4, 0.1, 1.0); } });
    const cm = this.part(e, 'en_core', e.g); this.glowM(cm, C.blue, 1.0); const gl = this.spr(e, 0, C.ice, C.blue, 5); gl.scale.setScalar(0.35);
    return this._h(e, { noop() { } });
  }
  redline(pc, o) {
    if (!this._ok()) return null; const kit = o.kit; let puffT = 0;
    const e = this._fx('redline', o.dur + o.cool + 0.3, (e, dt) => {
      const h = kit.heat(); const p = P3(pc.pos).setY((pc.pos.y || 0) + 1.5); const yaw = Math.atan2(pc.facing.x, pc.facing.z); p.x -= Math.sin(yaw) * 0.25; p.z += Math.cos(yaw) * 0.25;
      w.position.copy(p); w.quaternion.copy(this.camQ); w.material.uniforms.uA.value = h > 0 ? (Math.sin(e.t * 14) > 0 ? 1.0 : 0.25) : 0;
      puffT -= dt; if (h < 0 && puffT <= 0) { puffT = 0.6; this.puffs(p, 1, 0.3, { a: 0.4 }); }
      if (h === 0 && e.t > 0.5) e.t = e.life;
    });
    const w = this.spr(e, 0, 0xffffff, C.red, 6); w.scale.setScalar(0.16);
    return this._h(e);
  }
  /** C1·C2 제작 완성: 설계도 원판 위에서 총열·몸체·코어가 모여 결합 → 완성품이 돌다 사라짐(한 번 제작 = 한 번, 여러 개도 한 묶음) */
  made(pc, o = {}) {
    if (!this._ok()) return null; const f = pc.facing, at = P3(pc.pos).add(new THREE.Vector3(f.x * 0.8, 1.2, -f.z * 0.8)), gun = o.kind !== 'module';
    const e = this._fx('made', 1.6, (e) => { const k = clamp01(e.t / 0.7), out = smooth(1.2, 1.6, e.t);
      bp.position.copy(at).setY(at.y - 0.3); bp.scale.set(0.9, 0.9, 1); bp.material.uniforms.uA.value = 0.8 * smooth(0, 0.2, e.t) * (1 - out);
      parts.forEach((p, i) => { const off = new THREE.Vector3((i - 1) * 0.5, 0.2 + i * 0.1, 0).multiplyScalar(1 - easeOut(k)); p.position.copy(off); });
      grp.position.copy(at); grp.scale.setScalar(2.0); grp.rotation.y = e.t > 0.7 ? (e.t - 0.7) * 3 : 0; for (const m of e.items) if (m.userData.kind === 'solid') m.material.uniforms.uA.value = 1 - out;
      if (e.t > 0.7 && !e.lit) { e.lit = true; this.flash(at, 0xffffff, C.teal, 0.5, 0.1, 1.0); this.sparks(at, 5, { tint: C.gold, ground: at.y - 1.1 }); } });
    const bp = this.spr(e, 1, C.blue, C.blueB, 3); bp.rotation.set(-Math.PI / 2, 0, 0);
    const grp = this.pivot(e.g); const parts = gun ? [this.part(e, 'en_barrel', grp, { s: 0.8 }), this.part(e, 'en_case', grp, { s: 0.5 }), this.part(e, 'en_core', grp, { s: 0.06 })]
      : [this.part(e, 'en_drum', grp, { s: 1.0 }), this.part(e, 'en_muzzle', grp, { s: 1.0 }), this.part(e, 'en_coil', grp, { s: 0.08 })];
    this.glowM(parts[2], C.teal, 0.8);
    return this._h(e);
  }
}
void cookTop;
