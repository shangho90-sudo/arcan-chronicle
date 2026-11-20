// 약사 1차 5종 교체(2026-11-19) 그림: 유봉 되던지기 · 불꽃심지병 · 서리병 굴리기 · 결정침 개화 · 꿈꽃가루 + 수면 초승달.
// 규칙(피해·시각)은 js/pharm1.js — 여기서는 그 핸들 호출에 맞춰 그리기만 한다(피해·판정·난수 굴림 없음, 난수는 파일 안 xorshift).
// PharmFx(js/pharmfx.js)의 풀(_fx/_m/spr/ring/flat/solid)과 FlaskKit(js/flaskfx.js)의 인스턴스 입자 묶음(P: spark/flame/cloud/drop/petal/shardA/B/iceA/B)·
// 바닥 원판(disc: 0 얼룩 / 1 충격파 / 2 착탄 표시 / 3 문양)·꼬리 리본(trail)을 그대로 쓴다 — 새 텍스처 파일·전역 블룸/노출 변경 없음.
//   rang(pc)    handle: throw(start, f) / set(pos, back, dir) / turn(p) / hit(p) / catch() / dispose()
//               손의 실제 유봉 메시를 복제해 날림(머리·손잡이가 보이게 카메라 쪽으로 기울여 옆으로 돎) + 짧은 금빛 잔상(kit trail), 돌아올 땐 실제 손 높이로
//   wick(aim)   handle: fly(p) / land(n) / ignite() / tick(i, n) / end() / dispose()   착탄 표시(실제 반경) → 호박색 약액 얼룩 → 심지 불씨 → 가장자리 한 바퀴 → 안쪽으로, 낮은 불꽃만
//   frost(pc)   handle: roll0() / roll(pos, k) / shatter(p, n) / end() / dispose()   누른 순간 실제 굴러갈 길 + 끝 부채꼴 안내선(휴대폰에서도 읽히게), 흰 줄무늬 둥근 병, 얼음길 조각
//   crystal(t)  handle: pierce(i, ok) / scatter(i) / dispose()                      표적 왼쪽·오른쪽·머리 위 보라 결정 봉오리(표적을 따라감) → 차례로 꽂힘 → 마지막은 꽃잎처럼 갈라짐
//   dream(pc)   handle: blow() / dispose()                                           손바닥 위 연보라 꽃 → 꽃잎 + 금빛 꽃가루가 실제 부채꼴로
//   moon(t)     handle: wake() / dispose()                                           잠든 몬스터 머리 위 작은 초승달(숨쉬듯 둥실), 깨면 톡 사라짐
import * as THREE from 'three';
import { gfxOn } from './gfxq.js';

export const PH1FX = {
  rang: { spin: 15, tilt: 0.3, h: 1.0, size: 1.6, trail: { liq: 0xffc24a }, trailW: 0.3, trailA: 1.2 },   // size: 날아가는 유봉 그림 배율(손의 유봉은 게임 카메라에서 너무 작게 보임 — 판정과 무관)
  wick: { amber: 0xffa53a, amberD: 0x9a4a10, ring: 0.28, spread: 0.5, flameS: 0.16, flameH: 1.2 },
  frost: { ball: 0.17, guideA: 0.55, segLife: 3.0 },
  crystal: { side: 0.75, top: 0.55, len: 0.7, w: 0.9, fly: 0.07, col: 0xb27aff, hi: 0xf0dcff },
  dream: { petal: 0xd2b4ff, pollen: 0xffd36a },
  moon: { size: 0.72, lift: 0.1, side: 0.42 },   // 이름표(HTML) 바로 아래·살짝 옆 — 이름표 높이면 가려짐
};
let _s = 1119; const rnd = (a, b) => { _s = (_s * 1664525 + 1013904223) >>> 0; return a + (_s / 4294967296) * (b - a); };
const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
const gy = (p) => { try { const g = window.G && window.G.zone && window.G.zone.geo; return g ? g.ground(p.x, p.z).y : (p.y || 0); } catch (e) { return p.y || 0; } };
const hand = (pc) => { try { return pc && pc.body && pc.body.handPoint && pc.body.handPoint(); } catch (e) { return null; } };

const NOOP_RENDER = THREE.Object3D.prototype.onBeforeRender;
let moonTex = null;
function crescentTex() {
  if (moonTex) return moonTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 18, 64, 64, 62); grd.addColorStop(0, 'rgba(40,24,90,0.55)'); grd.addColorStop(0.7, 'rgba(60,40,120,0.25)'); grd.addColorStop(1, 'rgba(60,40,120,0)'); g.fillStyle = grd; g.fillRect(0, 0, 128, 128);   // 밝은 바닥에서도 읽히게 남보라 후광
  const moon = new Path2D(); moon.arc(58, 66, 36, 0, Math.PI * 2); const cut = new Path2D(); cut.arc(78, 54, 31, 0, Math.PI * 2);
  g.save(); g.beginPath(); g.rect(0, 0, 128, 128); g.arc(78, 54, 31, 0, Math.PI * 2, true); g.clip('evenodd');
  g.lineWidth = 7; g.strokeStyle = '#3a2410'; g.stroke(moon); g.fillStyle = '#ffe07a'; g.fill(moon); g.restore();
  g.lineWidth = 3; g.strokeStyle = '#3a2410'; g.font = 'bold 26px sans-serif'; g.strokeText('z', 90, 36); g.fillStyle = '#f2ecff'; g.fillText('z', 90, 36); g.font = 'bold 18px sans-serif'; g.strokeText('z', 108, 20); g.fillText('z', 108, 20);
  void cut;
  moonTex = new THREE.CanvasTexture(c); moonTex.colorSpace = THREE.SRGBColorSpace; return moonTex;
}

export class Ph1Fx {
  constructor(px) { this.px = px; this.mats = {}; this.geos = {}; }
  get kit() { return this.px.kit; }
  ok() { return this.px._ok() && this.kit.ready; }
  low() { return this.px.low(); }
  n(k) { return Math.max(1, Math.round(k * (this.low() ? 0.5 : 1))); }
  mat(k) {
    if (this.mats[k]) return this.mats[k];
    const M = {
      guide: () => new THREE.MeshBasicMaterial({ color: 0xbfeeff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      guideD: () => new THREE.MeshBasicMaterial({ color: 0x0c2a48, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
      ice: () => new THREE.MeshBasicMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      iceA: () => new THREE.MeshBasicMaterial({ color: 0x5ab8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      ball: () => new THREE.ShaderMaterial({ uniforms: { uRot: { value: 0 } }, vertexShader: 'varying vec3 vP, vN; void main(){ vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
        fragmentShader: 'varying vec3 vP, vN; void main(){ vec3 n = normalize(vN); float d = max(0., dot(n, normalize(vec3(-.4,.8,.5)))); float a = atan(vP.y, vP.z); float st = smoothstep(.62, .7, abs(sin(a * 3.))); float rim = pow(1. - max(0., n.z), 2.);\n  vec3 c = mix(vec3(.16,.42,.86), vec3(.97,.99,1.), st * .9) * (.45 + .7 * d) + vec3(.6,.85,1.) * rim * .6 + vec3(1.) * pow(max(0., dot(reflect(-normalize(vec3(-.4,.8,.5)), n), vec3(0.,0.,1.))), 24.) * .8; gl_FragColor = vec4(c, 1.); }' }),
      petal: () => new THREE.MeshBasicMaterial({ color: PH1FX.dream.petal, transparent: true, opacity: 1 }),
      core: () => new THREE.MeshBasicMaterial({ color: PH1FX.dream.pollen }),
      stem: () => new THREE.MeshBasicMaterial({ color: 0x6ab06a }),
      moon: () => new THREE.MeshBasicMaterial({ map: crescentTex(), transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false }),
    }; return (this.mats[k] = M[k]());
  }
  geo(k) { if (this.geos[k]) return this.geos[k];
    const G = { quad: () => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0, -0.5); return g; },   // flat strip: width x, length along -z (three) = forward
      ball: () => new THREE.SphereGeometry(1, 20, 14), neck: () => new THREE.CylinderGeometry(0.32, 0.4, 0.5, 10), petal: () => { const g = new THREE.SphereGeometry(1, 10, 6); g.scale(0.5, 0.12, 1); g.translate(0, 0, 0.9); return g; },
      dot: () => new THREE.SphereGeometry(1, 10, 8), card: () => new THREE.PlaneGeometry(1, 1), stem: () => new THREE.CylinderGeometry(0.15, 0.2, 1, 6) };
    return (this.geos[k] = G[k]()); }
  mesh(e, gk, mk) { const m = new THREE.Mesh(this.geo(gk), mk === 'ball' || mk === 'guide' || mk === 'guideD' || mk === 'ice' || mk === 'iceA' ? this.mat(mk).clone() : this.mat(mk)); m.frustumCulled = false; e.g.add(m); (e.own || (e.own = [])).push(m); return m; }
  free(e) { for (const m of e.items) if (m.onBeforeRender !== NOOP_RENDER) { m.onBeforeRender = NOOP_RENDER; m.visible = true; }   // pooled meshes go back without our per-frame closures
    if (e.own) for (const m of e.own) if (m.material !== this.mats.petal && m.material !== this.mats.core && m.material !== this.mats.stem && m.material !== this.mats.moon) m.material.dispose(); if (e.ownGeo) for (const g of e.ownGeo) g.dispose(); }
  /** 리마스터 공용 키트(js/rmfx.js) — 높음·보통만, 낮음 = null(예전 연출 그대로) */
  rmk() { const r = this.px.rm; return r && gfxOn() && r.ok() ? r : null; }
  fx(kind, life, upd) { const e = this.px._fx(kind, life, upd); e.onFree = () => { this.free(e); if (e.tr) this.kit.trailFree(e.tr); }; return e; }

  // ================================================================== 유봉 되던지기
  rang(pc, o = {}) {
    if (!this.ok() || !pc) return null;
    const px = this.px, K = this.kit, R = PH1FX.rang; let pos = null, back = false, flying = false, spin = 0, caughtT = null, from = null, ht = o.ht || 0.22;
    const pivot = new THREE.Group(), tiltG = new THREE.Group(); pivot.add(tiltG); pivot.visible = false;
    const e = this.fx('ph_rang', 12, (e, dt) => {
      const t = e.t;
      if (!flying && caughtT == null) { if (t > ht + 0.4) e.t = e.life; return; }
      if (caughtT != null) { if (t - caughtT > 0.25) e.t = e.life; return; }
      if (!pos) return;
      spin += R.spin * dt * (back ? 1.1 : 1);
      const g = gy(pos), H = hand(pc); let P = new THREE.Vector3(pos.x, g + R.h, -pos.z);
      if (back && H) { const d = Math.hypot(pos.x - pc.pos.x, pos.z - pc.pos.z), k = 1 - smooth(0.6, 3.0, d); P.y = g + R.h + (H.y - g - R.h) * k; if (d < 1.3) P.lerp(H, smooth(1.3, 0.5, d) * 0.85); }
      pivot.position.copy(P); pivot.quaternion.setFromAxisAngle(_y, spin);
      if (rtr) rtr.set({ x: P.x, y: P.y, z: -P.z });
      // trail = the head end of the spinning pestle
      _v.set(0, 0, (tiltG.userData.L || 0.6) * 0.5).applyQuaternion(tiltG.quaternion).applyQuaternion(pivot.quaternion).add(P);
      if (!e.tr) e.tr = K.trail(R.trail); K.trailPush(e.tr, _v, t); K.trailDraw(e.tr, t, R.trailA, R.trailW);
      if (!this.low() && rnd(0, 1) < 0.35) K.P('spark', { x: _v.x, y: _v.y, z: _v.z, vy: rnd(-0.2, 0.3), orient: 'cam', sx: 0.04, sy: 0.04, sz: 0.04, col: 0xffd27a, glow: 0.4, a: 1, fade: 0.6, life: rnd(0.2, 0.35) });
    });
    e.g.add(pivot);
    // the REAL pestle of the hand (same mesh / colours), centred on its middle so it spins end over end around it
    let L = 0.6; try { const holder = pc.body && pc.body.props && pc.body.props.R; const src = holder && holder.children[0];
      if (src) { holder.updateMatrixWorld(true); const s = new THREE.Vector3(); holder.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s); const c = src.clone(true);
        const bb = new THREE.Box3().setFromObject(src); bb.applyMatrix4(new THREE.Matrix4().copy(holder.matrixWorld).invert()); L = Math.max(0.3, (bb.max.z - bb.min.z) * s.x);
        c.scale.multiplyScalar(s.x * R.size); c.position.set(0, 0, -((bb.min.z + bb.max.z) / 2) * s.x * R.size); L *= R.size; tiltG.add(c); } } catch (err) { /* no prop */ }
    if (!tiltG.children.length) { const m = px.solid(e, px.geo.pharm_pestle, { spec: 0.6, fill: 0.4 }); if (m) { m.parent.remove(m); m.scale.setScalar(0.45); m.rotation.x = Math.PI / 2; m.position.z = -0.25; tiltG.add(m); } }
    tiltG.userData.L = L; tiltG.rotation.x = -R.tilt;   // the pestle lies almost flat (axis +Z tipped up R.tilt rad) and spins about the vertical: head + handle both read from the 44 deg camera
    const RM = this.rmk(); let rtr = null; const rEnd = () => { if (rtr) { rtr.dispose(); rtr = null; } };   // 리마스터 12묶음: 도는 유봉 둘레 금빛 빛 궤적, 낚아챌 때 별 반짝임
    const sparkle = (p, n, col) => { for (let i = 0; i < this.n(n); i++) { const a = rnd(0, 6.283), sp = rnd(1, 2.6); K.P('spark', { x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rnd(0.5, 2.5), g: 3, drag: 2.5, orient: 'cam', sx: 0.05, sy: 0.05, sz: 0.05, col, glow: 0.4, a: 1, fade: 0.5, life: rnd(0.2, 0.4) }); } };
    return {
      throw: (start) => { flying = true; pos = { ...start }; from = { ...start }; pivot.visible = true; const H = hand(pc); if (H) sparkle(H, 6, 0xffe0a0);
        if (RM) { rEnd(); rtr = RM.tracer({ x: start.x, y: gy(start) + R.h, z: start.z }, { col: 0xffa020, hi: 0xfff0b0, light: 0xffd27a, w: 0.34, glow: 0.7, trail: 14 }); } },
      set: (p, b) => { pos = { ...p }; back = !!b; },
      turn: (p) => { const g = gy(p); sparkle({ x: p.x, y: g + R.h, z: -p.z }, 5, 0xffd27a); if (RM) RM.pop(new THREE.Vector3(p.x, g + R.h, -p.z), { col: 0xffb030, hi: 0xfff0c0, size: 0.6, sparks: 4, stars: 2 }); },
      hit: (p) => { const P = P3(p); sparkle(P, 8, 0xfff0c0); if (RM) RM.pop(P, { col: 0xffa020, hi: 0xfff0c0, size: 0.85, sparks: 7, stars: 2 }); const f = px.spr(e, 'flare', { w: 0xffffff, b: 0xffc04a, h: 0xc07010 }, 8), t0 = e.t; f.position.copy(P); f.scale.setScalar(0.9);
        f.onBeforeRender = () => { const k = (e.t - t0) / 0.12; f.material.uniforms.uA.value = Math.max(0, 1.4 * (1 - k)); f.quaternion.copy(px.camQ); f.visible = k < 1; }; },
      catch: () => { flying = false; caughtT = e.t; pivot.visible = false; const H = hand(pc); if (H) sparkle(H, 10, 0xffd27a); rEnd(); if (RM && H) RM.pop(H, { col: 0xffc040, hi: 0xffffff, size: 0.8, sparks: 6, stars: 6, roll: 0.785 }); },
      dispose: () => { rEnd(); px._free(e); },
    };
  }

  // ================================================================== 불꽃심지병
  wick(aim, o = {}) {
    if (!this.ok()) return null;
    const px = this.px, K = this.kit, W = PH1FX.wick, r = o.r || 1.6, c = P3(aim), g0 = c.y, tick = o.tick || 0.4, ticks = o.ticks || 5;
    let landT = null, igT = null, endT = null, fly = null, emberA = rnd(0, 6.283), nextF = 0;
    const burnEnd = () => igT + (ticks - 1) * tick + 0.25;
    const e = this.fx('ph_wick', 14, (e, dt) => {
      const t = e.t;
      // landing mark at the REAL radius while the bottle is in the air
      const mu = mark.material.uniforms; mu.uA.value = landT == null ? 0.75 * smooth(0, 0.1, t) : Math.max(0, 0.75 * (1 - (t - landT) / 0.15)); mu.uGrow.value = landT == null ? 0.4 + 0.6 * clamp01(t / (o.flight || 0.5)) : 1; mark.visible = mu.uA.value > 0.01;
      if (fly && landT == null) { if (rnd(0, 1) < 0.7) K.P('spark', { x: fly.x, y: fly.y + 0.32, z: fly.z, vy: rnd(0.2, 0.6), orient: 'cam', sx: 0.05, sy: 0.05, sz: 0.05, col: 0xffc040, glow: 0.6, a: 1, fade: 0.6, life: rnd(0.15, 0.3) }); }   // the wick ember in flight
      if (landT == null) return;
      const lt = t - landT;
      // amber puddle spreads round, darkens to scorch after the fire, eaten away at the end
      const su = st.material.uniforms; su.uGrow.value = 0.35 + 0.65 * easeOut(lt / W.ring); su.uA.value = 0.8 * smooth(0, 0.04, lt);
      if (igT != null) { const k = smooth(igT, igT + 0.6, t); su.uCol.value.setHex(k > 0.5 ? 0x7a3a12 : W.amber); su.uDeep.value.setHex(k > 0.5 ? 0x2a120a : W.amberD); }
      su.uErode.value = endT != null ? smooth(endT, endT + 0.6, t) * 1.05 : 0; if (endT != null && t > endT + 0.65) e.t = e.life;
      // the wick lies at the edge: ember glows + sizzling sparks until the ignition
      if (igT == null) { const ex = c.x + Math.cos(emberA) * r * 0.85, ez = c.z + Math.sin(emberA) * r * 0.85;
        if (rnd(0, 1) < 0.6) K.P('spark', { x: ex, y: g0 + 0.06, z: ez, vx: rnd(-0.6, 0.6), vz: rnd(-0.6, 0.6), vy: rnd(0.8, 1.8), g: 4, orient: 'cam', sx: 0.04, sy: 0.04, sz: 0.04, col: 0xffd060, glow: 0.7, a: 1, fade: 0.5, life: rnd(0.15, 0.3) });
        ember.position.set(ex, g0 + 0.08, ez); ember.quaternion.copy(px.camQ); ember.material.uniforms.uA.value = 1.2 + 0.4 * Math.sin(t * 40); ember.visible = true; }
      else ember.visible = false;
      // ignition: the flame runs once round the rim (W.ring s) from the wick, then spreads inward (W.spread s); then low flames all over until the end
      if (igT != null && (endT == null || t < endT + 0.1) && t >= nextF) {
        const it = t - igT; nextF = t + (this.low() ? 0.05 : 0.025);
        let a, rr;
        if (it < W.ring) { a = emberA + 6.283 * (it / W.ring) + rnd(-0.1, 0.1); rr = r * rnd(0.86, 0.97); }
        else if (it < W.ring + W.spread) { const k = (it - W.ring) / W.spread; a = rnd(0, 6.283); rr = r * (0.9 - 0.8 * k) * rnd(0.8, 1.05); }
        else { a = rnd(0, 6.283); rr = r * Math.sqrt(rnd(0, 1)) * 0.95; }
        const s = W.flameS * rnd(0.7, 1.15) * (it < W.ring ? 1.1 : 1), x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
        K.P('flame', { x, y: g0 + 0.05, z, vy: rnd(0.5, 1.0) * W.flameH, drag: 2.5, dragY: true, q: K.q(K.randAx(), rnd(0, 6)), ax: _y.clone(), w: rnd(3, 6), sx: s, sy: s * 1.3, sz: s, grow: 0.05, sk: (u) => 1 + 0.3 * u, glF: (u) => 1 - 0.7 * u, erode: [0.25, 1], a: 0.85, col: 0xffffff, life: rnd(0.3, 0.45) });
        if (rnd(0, 1) < 0.25) K.P('spark', { x, y: g0 + 0.2, z, vx: rnd(-0.4, 0.4), vz: rnd(-0.4, 0.4), vy: rnd(1.2, 2.6), g: 2, drag: 1.5, orient: 'cam', sx: 0.035, sy: 0.035, sz: 0.035, col: 0xffc040, glow: 0.6, a: 1, fade: 0.5, life: rnd(0.25, 0.5) });
      }
      gl.visible = igT != null && (endT == null || t < endT + 0.3); if (gl.visible) { const k = smooth(igT, igT + 0.15, t) * (endT != null ? 1 - smooth(endT, endT + 0.3, t) : 1); gl.material.uniforms.uA.value = 0.42 * k * (0.85 + 0.15 * Math.sin(t * 17)); }
    });
    const mark = K.disc(e, 2, false, 2); mark.position.set(c.x, g0 + 0.04, c.z); mark.scale.setScalar(r); mark.material.uniforms.uCol.value.setHex(0xffb24a);
    const st = K.disc(e, 0, false, 2); st.position.set(c.x, g0 + 0.03, c.z); st.quaternion.copy(K.groundQ(aim, r)); st.scale.setScalar(r * 1.05); st.material.uniforms.uA.value = 0; st.material.uniforms.uCol.value.setHex(W.amber); st.material.uniforms.uDeep.value.setHex(W.amberD); st.material.uniforms.uHi.value.setHex(0xffe6a0);
    const gl = px.flat(e, 'glow', { w: 0xffe8b0, b: 0xff8a2a, h: 0xc04000 }, 3); gl.position.set(c.x, g0 + 0.06, c.z); gl.scale.setScalar(r * 1.05); gl.visible = false;
    const ember = px.spr(e, 'glow', { w: 0xffffff, b: 0xffb030, h: 0xff5000 }, 8); ember.scale.setScalar(0.32); ember.visible = false;
    return {
      fly: (p) => { fly = P3(p); },
      land: (n) => { landT = e.t; fly = null; const RM = this.rmk(); if (RM) RM.pop(new THREE.Vector3(c.x, g0 + 0.35, c.z), { col: 0xffa040, hi: 0xffe8b0, size: 0.9, groundY: g0, ring: r * 0.75, sparks: 6, stars: 2 });   // 리마스터 12묶음: 깨지는 순간 섬광·고리
        for (let i = 0; i < this.n(8); i++) { const a = rnd(0, 6.283), hs = rnd(1.5, 3.5), s = rnd(0.06, 0.12); K.P(i % 2 ? 'shardA' : 'shardB', { x: c.x, y: g0 + 0.3, z: c.z, vx: Math.cos(a) * hs, vz: Math.sin(a) * hs, vy: rnd(2, 4), g: 16, drag: 3, gy: g0 + 0.03, bounce: 0.28, life: rnd(0.5, 0.8), q: K.q(K.randAx(), rnd(0, 6)), ax: K.randAx(), w: rnd(10, 20), sx: s, sy: s, sz: s, col: 0xffe6b8, shrink: 0.3 }); }
        for (let i = 0; i < this.n(10); i++) { const a = rnd(0, 6.283), vy = rnd(1.8, 3.4), sp = rnd(0.6, 2.0), s = rnd(0.06, 0.1); K.P('drop', { x: c.x, y: g0 + 0.3, z: c.z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy, g: 9, gy: g0 + 0.03, orient: 'vel', stretch: 0.1, sx: s, sy: s * 1.15, sz: s, col: W.amber, life: 0.9, shrink: 0.3 }); }
        const fl = K.flashQuad(e, { accent: 0xffd070 }); fl.position.set(c.x, g0 + 0.35, c.z); fl.quaternion.copy(px.camQ); fl.scale.setScalar(r * 0.6); fl.material.uniforms.uA.value = 1.2; fl.onBeforeRender = () => { const k = (e.t - landT) / 0.07; fl.material.uniforms.uA.value = Math.max(0, 1.2 * (1 - k)); fl.visible = k < 1; }; },
      ignite: () => { igT = e.t; nextF = e.t; const RM = this.rmk(); if (RM) RM.fireHit({ x: c.x, y: g0, z: -c.z }, Math.min(r, 1.6) * 0.9, { pal: 'fire' });   // 리마스터 12묶음: 점화 = 섬광 + 판정 반경 안 불꽃 혀 고리 + 땅 고리 + 불티
        const wv = K.disc(e, 1, true, 3); wv.position.set(c.x, g0 + 0.05, c.z); wv.scale.setScalar(r); wv.material.uniforms.uCol.value.setHex(0xff8a2a); wv.material.uniforms.uHi.value.setHex(0xffe0a0); const t0 = e.t;
        wv.onBeforeRender = () => { const k = (e.t - t0) / 0.25; wv.material.uniforms.uFront.value = 0.15 + 0.82 * easeOut(k); wv.material.uniforms.uA.value = Math.max(0, 0.9 * (1 - k)); wv.visible = k < 1; }; },
      tick: () => { },
      end: () => { endT = e.t; },
      dispose: () => px._free(e),
    };
  }

  // ================================================================== 서리병 굴리기
  frost(pc, o = {}) {
    if (!this.ok() || !pc) return null;
    const px = this.px, K = this.kit, F = PH1FX.frost, f = o.dir, from = o.from, end = o.end, dist = Math.hypot(end.x - from.x, end.z - from.z), yaw = Math.atan2(f.x, f.z);
    const ht = o.ht || 0.3, R = F.ball; let rollT = null, pos = null, trav = 0, shT = null, endT = null, lastSeg = null; const segs = [];
    const e = this.fx('ph_frost', 20, (e, dt) => {
      const t = e.t;
      // aim guide: the REAL path (thin dashed strip) + the end fan outline, from the press until the shatter
      const gk = shT == null ? smooth(0, 0.1, t) : 1 - smooth(shT, shT + 0.3, t);
      path.material.opacity = F.guideA * gk * (0.75 + 0.25 * Math.sin(t * 9)); pathD.material.opacity = 0.35 * gk; fan.material.opacity = Math.min(1, F.guideA * 1.5) * gk; fanD.material.opacity = 0.32 * gk;
      path.visible = pathD.visible = fan.visible = fanD.visible = gk > 0.01;
      if (rollT != null && pos) { const k = clamp01(trav / Math.max(0.01, dist)); path.scale.z = Math.max(0.01, dist * (1 - k)); path.position.set(pos.x, gy(pos) + 0.05, -pos.z); }
      // the round striped bottle: in the hand until the release, then rolling on the ground
      if (rollT == null && shT == null) { const H = hand(pc); if (H) { ball.position.copy(H); ball.visible = true; } }
      else if (pos && shT == null) { ball.position.set(pos.x, gy(pos) + R, -pos.z); ball.quaternion.setFromAxisAngle(_v.set(Math.cos(yaw), 0, Math.sin(yaw)).normalize(), -trav / R); ball.visible = true;
        if (rnd(0, 1) < 0.5 && !this.low()) K.P('spark', { x: ball.position.x + rnd(-0.1, 0.1), y: ball.position.y - R * 0.6, z: ball.position.z + rnd(-0.1, 0.1), vy: rnd(0.2, 0.6), orient: 'cam', sx: 0.04, sy: 0.04, sz: 0.04, col: 0xe8fbff, glow: 0.3, a: 1, fade: 0.6, life: rnd(0.3, 0.5) }); }
      else ball.visible = false;
      // ice path pieces fade with their real time on the ground
      for (const s of segs) { const age = t - s.t0, k = smooth(0, 0.12, age) * (1 - smooth(F.segLife - 0.5, F.segLife, age)); s.m.material.opacity = 0.75 * k; s.a.material.opacity = 0.35 * k * (0.8 + 0.2 * Math.sin(t * 4 + s.t0 * 9)); s.m.visible = s.a.visible = k > 0.005; }
      if (endT != null && t > endT + 0.8) e.t = e.life;
    });
    e.ownGeo = [];
    const ball = this.mesh(e, 'ball', 'ball'); ball.scale.setScalar(R); ball.visible = false;
    const neck = new THREE.Mesh(this.geo('neck'), new THREE.MeshBasicMaterial({ color: 0xd8b060 })); neck.position.y = 1.05; neck.scale.setScalar(0.9); ball.add(neck); e.own.push(neck);
    const g0 = gy(from), P0 = new THREE.Vector3(from.x, g0 + 0.05, -from.z);
    const path = this.mesh(e, 'quad', 'guide'), pathD = this.mesh(e, 'quad', 'guideD');
    for (const [m, w] of [[path, 0.12], [pathD, 0.32]]) { m.position.copy(P0); m.rotation.y = -yaw; m.scale.set(w, 1, Math.max(0.01, dist)); }
    pathD.position.y -= 0.005;
    // end fan outline (thin arc + two edges) at the REAL shard fan: origin 0.5 m back from the end, radius fanR, angle fanAng
    const half = (o.fanAng || 70) * Math.PI / 360, fr = o.fanR || 3, ox = end.x - f.x * 0.5, oz = end.z - f.z * 0.5;
    const ring = new THREE.RingGeometry(fr - 0.1, fr, 28, 1, -half, half * 2); ring.rotateX(-Math.PI / 2); e.ownGeo.push(ring);
    const sector = new THREE.CircleGeometry(fr, 28, -half, half * 2); sector.rotateX(-Math.PI / 2); e.ownGeo.push(sector);
    const fan = new THREE.Mesh(ring, this.mat('guide').clone()), fanD = new THREE.Mesh(sector, this.mat('guideD').clone()); for (const m of [fan, fanD]) { m.frustumCulled = false; e.g.add(m); e.own.push(m); m.position.set(ox, gy({ x: ox, z: oz }) + 0.06, -oz); m.rotation.y = -yaw + Math.PI / 2; }
    fanD.material.opacity = 0; fanD.position.y -= 0.01;
    return {
      roll0: () => { rollT = e.t; pos = { ...from }; },
      roll: (p) => { const prev = pos || from; pos = { ...p }; trav = Math.hypot(p.x - from.x, p.z - from.z);
        if (!lastSeg) lastSeg = { ...from };
        const d = Math.hypot(p.x - lastSeg.x, p.z - lastSeg.z);
        if (d >= 0.3) { const mx = (p.x + lastSeg.x) / 2, mz = (p.z + lastSeg.z) / 2, y = gy({ x: mx, z: mz }) + 0.03 + (segs.length % 2) * 0.003;
          const m = this.mesh(e, 'quad', 'ice'), a = this.mesh(e, 'quad', 'iceA');
          for (const q of [m, a]) { q.position.set(lastSeg.x, y, -lastSeg.z); q.rotation.y = -yaw; q.scale.set(q === m ? 0.38 : 0.6, 1, d + 0.04); q.material.opacity = 0; }
          segs.push({ m, a, t0: e.t }); lastSeg = { ...p };
          if (segs.length % 2 === 1) { const RM = this.rmk(); if (RM) RM.frostBits(new THREE.Vector3(mx, y, -mz)); }   // 리마스터 12묶음: 얼음길 위 작은 결정·반짝임
          if (!this.low() && segs.length % 2 === 0) K.P('iceB', { x: mx + rnd(-0.15, 0.15), y: y, z: -mz + rnd(-0.15, 0.15), q: K.q(K.randAx(), rnd(0, 6)), sx: 0.05, sy: 0.12, sz: 0.05, glow: 0.2, a: 1, col: 0xeafaff, grow: 0.1, life: F.segLife * 0.8, shrink: 0.2 }); }
        void prev; },
      shatter: (p, n) => { shT = e.t; endT = e.t; ball.visible = false; const c = P3(p); c.y = gy(p) + 0.25;
        { const RM = this.rmk(); if (RM) RM.iceCone({ pos: { x: ox, y: gy({ x: ox, z: oz }), z: oz } }, { f, r: fr, ang: o.fanAng || 70, at: 0, hold: 0.45 }); }   // 리마스터 12묶음: 실제 파편 부채꼴 안 서리 무늬·마법진·결정이 솟았다 깨짐
        K.burst({ x: p.x, y: gy(p), z: p.z }, { elem: 'ice', r: 1.0 });
        for (let i = 0; i < this.n(14); i++) { const a = yaw - half + rnd(0, 2 * half), sp = rnd(4, 8), L = Math.min(fr * rnd(0.5, 1.0), fr) / sp, s = rnd(0.06, 0.12);
          K.P(i % 2 ? 'iceB' : 'iceA', { x: c.x, y: c.y, z: c.z, vx: Math.sin(a) * sp, vz: -Math.cos(a) * sp, vy: rnd(0.5, 1.6), g: 6, q: K.q(K.randAx(), rnd(0, 6)), ax: K.randAx(), w: rnd(8, 16), sx: s, sy: s * 1.8, sz: s, glow: 0.3, a: 1, col: 0xeafaff, life: L + rnd(0.1, 0.3), shrink: 0.3 }); }
        for (let i = 0; i < this.n(10); i++) { const a = yaw - half + rnd(0, 2 * half), sp = rnd(3, 6); K.P('spark', { x: c.x, y: c.y, z: c.z, vx: Math.sin(a) * sp, vz: -Math.cos(a) * sp, vy: rnd(0.3, 1.2), drag: 1.5, orient: 'vel', stretch: 0.08, sx: 0.03, sy: 0.08, sz: 0.03, col: 0xffffff, glow: 0.4, a: 1, fade: 0.5, life: rnd(0.3, 0.5) }); }
        void n; },
      end: () => { endT = e.t; },
      dispose: () => px._free(e),
    };
  }

  // ================================================================== 결정침 개화
  crystal(t, o = {}) {
    if (!this.ok() || !t) return null;
    const px = this.px, K = this.kit, C = PH1FX.crystal, pc = o.pc, hits = o.hits || [0.46, 0.55, 0.78], grow = o.grow || 0.38, pal = { w: C.hi, b: C.col, h: 0x5a20b0 };
    const done = [false, false, false]; let scatterT = null, lastHit = null, motes = 0;
    const slot = (i) => {   // bud spot around the target: left / right of the caster -> target line, and above the head (three coords)
      const dx = t.pos.x - pc.pos.x, dz = t.pos.z - pc.pos.z, m = Math.hypot(dx, dz) || 1, sx = -dz / m, sz = dx / m, r = t.radius || 0.5, y = (t.pos.y || 0);
      if (i === 2) return new THREE.Vector3(t.pos.x - dx / m * 0.2, y + r * 2 + 0.9 + C.top, -(t.pos.z - dz / m * 0.2));
      const k = (i === 0 ? 1 : -1) * (r + C.side); return new THREE.Vector3(t.pos.x + sx * k - dx / m * 0.35, y + 0.95 + r * 0.4, -(t.pos.z + sz * k - dz / m * 0.35));
    };
    const aimAt = (i) => new THREE.Vector3(t.pos.x, (t.pos.y || 0) + Math.min(1.2, 0.45 + (t.radius || 0.5) * 0.8), -t.pos.z);
    const e = this.fx('ph_crystal', 3, (e, dt) => {
      const tt = e.t;
      if (pc && tt < grow && (motes -= dt) <= 0) { motes = this.low() ? 0.06 : 0.03; const H = hand(pc); if (H) { const a = rnd(0, 6.283), d = rnd(0.3, 0.6), ox = Math.cos(a) * d, oz = Math.sin(a) * d, oy = rnd(-0.2, 0.4), hx = H.x, hy = H.y, hz = H.z;
        K.P('spark', { col: rnd(0, 1) < 0.5 ? C.col : C.hi, glow: 0.4, orient: 'cam', sx: 0.045, sy: 0.045, sz: 0.045, life: 0.18, a: 1, fade: 0.2, fn: (p, dt, u) => { const k = easeOut(u); p.x = hx + ox * (1 - k); p.y = hy + oy * (1 - k); p.z = hz + oz * (1 - k); } }); } }
      for (let i = 0; i < 3; i++) {
        const b = buds[i], S = i === 2 ? 1.45 : 1; if (done[i] || scatterT != null) { b.visible = false; continue; }
        const at = slot(i), tgt = aimAt(i), tf = hits[i] - C.fly, g = easeOut(tt / grow);
        let P = at; if (tt > tf) { const k = clamp01((tt - tf) / C.fly); P = at.clone().lerp(tgt, k * k); }
        b.position.copy(P); _v.copy(tgt).sub(P); if (_v.lengthSq() < 1e-6) _v.copy(tgt).sub(at);
        b.quaternion.setFromUnitVectors(_y, _v.normalize());
        const bud = 0.35 + 0.65 * g, wob = tt < tf ? 1 + 0.06 * Math.sin(tt * 18 + i * 2) : 1;
        b.scale.set(C.w * S * bud * wob, C.len * S * (0.25 + 0.75 * g) * (tt > tf ? 1.2 : 1), C.w * S * bud * wob); b.visible = tt > 0.02;
        b.material.uniforms.uGlow.value = 0.35 + 0.6 * smooth(tf - 0.1, tf, tt);
      }
      if (lastHit) { const k = (tt - lastHit.t) / 0.14; lastHit.f.visible = k < 1; lastHit.f.quaternion.copy(px.camQ); lastHit.f.material.uniforms.uA.value = Math.max(0, lastHit.a * (1 - k)); lastHit.f.position.copy(aimAt(0)); }
      if (scatterT != null && tt > scatterT + 0.5) e.t = e.life;
    });
    const buds = [0, 1, 2].map(() => { const m = px.solid(e, px.geo.pharm_crystal, { mode: 2, tint: C.col, em: C.col, glow: 0.35, rim: C.hi, spec: 1.2 }); m.visible = false; return m; });
    const burst = (P, n, big) => { for (let i = 0; i < this.n(n); i++) { const a = rnd(0, 6.283), sp = rnd(1, big ? 3.4 : 2.2), s = rnd(0.04, big ? 0.1 : 0.06);
      K.P(big && i % 2 ? 'petal' : 'shardA', { x: P.x, y: P.y, z: P.z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rnd(0.4, big ? 3 : 1.8), g: 7, drag: 1.5, gy: (t.pos.y || 0) + 0.03, q: K.q(K.randAx(), rnd(0, 6)), ax: K.randAx(), w: rnd(6, 14), sx: s, sy: s * (big ? 0.6 : 1), sz: s, col: i % 3 ? C.col : C.hi, life: rnd(0.4, 0.8), shrink: 0.4,
        fn: big && i % 2 ? undefined : undefined }); } };
    return {
      pierce: (i, ok) => { done[i] = true; const P = aimAt(i), big = i === 2; const RM = ok ? this.rmk() : null;
        if (RM) RM.pop(P, { col: C.col, hi: C.hi, size: big ? 1.4 : 0.75, groundY: t.pos.y || 0, ring: big ? (t.radius || 0.5) + 0.6 : 0, sparks: big ? 10 : 5, stars: big ? 5 : 2, shards: big ? 10 : 2, shardCols: [C.col, C.hi, 0xffb0e0], shardA: 0.8, roll: 0.4 * i });   // 리마스터 12묶음: 꽂힐 때마다 결정 섬광, 마지막 = 꽃잎 같은 결정 파편 폭발 + 고리
        if (ok) { burst(P, big ? 18 : 6, big); const f = px.spr(e, 'flare', pal, 8); f.position.copy(P); f.scale.setScalar(big ? 1.4 : 0.7); lastHit = { f, t: e.t, a: big ? 1.6 : 1.1 };
          if (big) for (let k = 0; k < 6; k++) { const a = k * 1.047; K.P('petal', { x: P.x, y: P.y, z: P.z, vx: Math.cos(a) * 1.6, vz: Math.sin(a) * 1.6, vy: 1.2, g: 3, drag: 2, q: K.qDir(a, 0.5), sx: 0.18, sy: 0.18, sz: 0.18, col: C.col, life: 0.5, shrink: 0.5 }); } } },
      scatter: (i) => { scatterT = e.t; for (let k = i; k < 3; k++) if (!done[k]) { const P = buds[k].position.clone(); for (let j = 0; j < this.n(6); j++) { const a = rnd(0, 6.283), sp = rnd(0.6, 1.6); K.P('spark', { x: P.x, y: P.y, z: P.z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rnd(-0.5, 0.8), g: 2, orient: 'cam', sx: 0.05, sy: 0.05, sz: 0.05, col: C.col, glow: 0.35, a: 1, fade: 0.6, life: rnd(0.3, 0.6) }); } } },
      dispose: () => px._free(e),
    };
  }

  // ================================================================== 꿈꽃가루
  dream(pc, o = {}) {
    if (!this.ok() || !pc) return null;
    const px = this.px, K = this.kit, D = PH1FX.dream, ht = o.ht || 0.32, r = o.r || 3.2, half = (o.ang || 80) * Math.PI / 360, wave = o.wave || 0.35, f = o.f || pc.facing, yaw = Math.atan2(f.x, f.z);
    let blowT = null, nextP = 0;
    const flower = new THREE.Group(), petals = [];
    const e = this.fx('ph_dream', 4, (e, dt) => {
      const t = e.t;
      if (blowT == null) { const H = hand(pc); if (H) { flower.position.set(H.x, H.y + 0.08, H.z); flower.visible = true; } const g = easeOut(t / Math.max(0.1, ht * 0.8)); flower.scale.setScalar(0.17 * Math.max(0.05, g)); flower.rotation.y = t * 1.5; return; }
      const bt = t - blowT; flower.scale.setScalar(0.17 * Math.max(0, 1 - bt / 0.15)); flower.visible = bt < 0.15;
      // petals + gold pollen carried by the wave front inside the REAL fan
      if (bt < wave + 0.05 && t >= nextP) { nextP = t + (this.low() ? 0.03 : 0.015); const o0 = P3(pc.pos);
        for (let i = 0; i < 2; i++) { const a = yaw + rnd(-half, half), sp = r / wave * rnd(0.75, 1.0), L = wave * rnd(0.9, 1.15), pol = i === 1;
          K.P(pol ? 'spark' : 'petal', { x: o0.x + Math.sin(a) * 0.4, y: o0.y + rnd(0.7, 1.3), z: o0.z - Math.cos(a) * 0.4, vx: Math.sin(a) * sp, vz: -Math.cos(a) * sp, vy: rnd(-0.6, 0.4), drag: 1.2,
            ...(pol ? { orient: 'cam', sx: 0.06, sy: 0.06, sz: 0.06, glow: 0.5, fade: 0.5 } : { q: K.q(K.randAx(), rnd(0, 6)), ax: K.randAx(), w: rnd(4, 9), sx: 0.12, sy: 0.12, sz: 0.12, shrink: 0.4 }), col: pol ? D.pollen : D.petal, a: 1, life: L + rnd(0.2, 0.5) }); } }
      if (bt > wave + 0.9) e.t = e.life;
    });
    e.g.add(flower); flower.visible = false;
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(this.geo('petal'), this.mat('petal')); m.rotation.y = i * 1.2566; m.rotation.x = -0.35; flower.add(m); petals.push(m); (e.own || (e.own = [])).push(m); }
    const core = new THREE.Mesh(this.geo('dot'), this.mat('core')); core.scale.setScalar(0.32); core.position.y = 0.1; flower.add(core); e.own.push(core);
    return {
      blow: () => { blowT = e.t; const RM = this.rmk(); if (RM) { RM.windCone(pc, { f, r, ang: o.ang || 80, at: 0, cols: [0xfff0ff, 0xc89aff] }); RM.buffAura(pc, { s: 10, gold: 0xffe8a8, col: 0xd8a8ff, cols: [0xffe8a8, 0xffc0f0, 0xffffff], dur: 0.9, r: 0.8, rings: 0, flash: 0.6 }); }   // 리마스터 12묶음: 판정 부채꼴 안 몽환 꽃바람 리본 + 발밑 연보라 잎 마법진
        const H = hand(pc); if (H) for (let i = 0; i < this.n(8); i++) { const a = yaw + rnd(-half, half), sp = rnd(1, 2.4); K.P('spark', { x: H.x, y: H.y, z: H.z, vx: Math.sin(a) * sp, vz: -Math.cos(a) * sp, vy: rnd(0, 1), drag: 2, orient: 'cam', sx: 0.05, sy: 0.05, sz: 0.05, col: D.pollen, glow: 0.5, a: 1, fade: 0.5, life: rnd(0.3, 0.6) }); } },
      dispose: () => px._free(e),
    };
  }

  // ================================================================== 수면 초승달
  moon(t, o = {}) {
    if (!this.ok() || !t) return null;
    const M = PH1FX.moon; let wakeT = null;
    const sp = new THREE.Mesh(this.geo('card'), this.mat('moon')); sp.renderOrder = 20; sp.frustumCulled = false;
    const e = this.fx('ph_moon', 60, (e) => {
      const tt = e.t, h = (t._plateH || (t.radius || 0.5) * 2 + 0.4) + M.lift;   // 머리 꼭대기 바로 위(이름표는 +0.45 m — js/ui.js updatePlates)
      sp.position.set(t.pos.x, (t.pos.y || 0) + h + 0.06 * Math.sin(tt * 2.2), -t.pos.z).addScaledVector(this.px.camR, M.side);
      const pop = wakeT == null ? easeOut(tt / 0.25) : 1 + 0.4 * clamp01((tt - wakeT) / 0.2), a = wakeT == null ? 1 : 1 - clamp01((tt - wakeT) / 0.2);
      sp.quaternion.copy(this.px.camQ); sp.scale.setScalar(M.size * pop * (1 + 0.05 * Math.sin(tt * 3))); sp.material.opacity = a;
      if (wakeT != null && tt > wakeT + 0.22) e.t = e.life;
    });
    sp.material = this.mat('moon').clone(); e.g.add(sp); (e.own || (e.own = [])).push(sp);
    return { wake: () => { if (wakeT == null) wakeT = e.t; }, dispose: () => this.px._free(e) };
  }
}
