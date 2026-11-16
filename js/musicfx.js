// 음악가 2차 스킬 이펙트·환영 악단 모습 (2026-11-16 '마에스트로'). 규칙은 js/musician.js(MusicKit), 메시는 tools/blender/fx_music.py ->
// assets/fx/fx_music.glb.json(바이올린·활·첼로·플루트·나팔·나팔구·심벌즈·지휘봉·하프 틀/현·음표·초승달·꽃잎·환영 연주자·팔·오선 조각, 정점 색만).
// 악기는 실제 손 위치(ModelBody.handPoint = 오른손, bonePoint('Left_Hand') = 왼손)에 매 프레임 맞춰 놓음 — 손에서 떠 있거나 몸을 뚫지 않게:
// 바이올린 = 턱(목과 왼 어깨 사이) -> 왼손, 활 = 오른손에서 바이올린 브리지를 지나감, 첼로 = 앞 왼쪽 땅 -> 왼손, 플루트 = 입 옆 -> 두 손을 잇는 축,
// 심벌즈 = 각 손(서로를 향함), 지휘봉 = 오른 팔뚝 방향. 동작은 tools/anim/swings.py mu_*.
// 악기별 빛: 현악 = 얇고 긴 현 진동·초승달 띠(얇은 곡면 셰이더 ARC), 타악 = 짧고 강한 찌그러진 원형 충격파, 관악 = 나팔구에서 퍼지는 음압 고리,
// 하프 = 현이 차례로 점등, 지휘 = 동작에 맞춰 악단·공격이 차례로. 가장 밝은 순간 = 실제 피해·회복 순간, 바닥 고리 = 실제 판정 반경(넘지 않음),
// 백색 전체 섬광·불투명 장막 없음, 전역 블룸·노출·히트스톱은 건드리지 않음. 풀 재사용(CookFx 상속), 프레임마다 새 지오메트리·재질 없음
// (악보 그림은 캔버스 텍스처 한 번). 저사양(휴대폰·그래픽 효과 끔): 음표·꽃잎·장식 연주자 수만 줄임 — 실제 타수·결과는 같음.
// 종류 (MusicFx.make(kind, a, o) ← js/skillrt.js FX.music ← js/musician.js kit.fx):
//   pre(pc,{what,lead,tgt,aim})  strings(pluck) · cymbals(clash) · violin(stroke) · bells(blow/burst/react) · harp · horn · cello · flute · baton · frame
//   wave(p,{f,len,w}) set/hit/end · cres(p,{i,last}) set/hit/end · clash(pc,{r,hits}) · melody(pc,{mel}) refresh/boost/pulse/flinch/end
//   score(pc,{cast,n}) consume/stage/cancel · encore(pc,{cast}) raise/cancel · stage(pc,{cast}) play/land/tutti/cancel
//   ghost(pc,{dur}) replay/end · echo · fizzle · tune · accent · harp(c,{r,life,unfold}) near/strum/end · trio(s,{enter}) sync/play/chord/hurt/regroup/fade
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CookFx } from './cookfx.js';

export const MUFX = {
  intensity: 1.0,
  col: { gold: 0xffe08a, goldB: 0xffa020, silver: 0xeaf4ff, silverB: 0x8aa8e0, mint: 0xb8ffb0, mintB: 0x40c060, blue: 0x9ad0ff, blueB: 0x2a6ae0,
    ice: 0xe8f6ff, iceB: 0x7ab0e0, rose: 0xffc8d8, roseB: 0xd06090, violet: 0xe0d0ff, violetB: 0x7a5ad0, white: 0xffffff, warm: 0xfff0d0 },
  mel: { aria: [0xc8ffa0, 0x60c040], march: [0xffe080, 0xd09020], coral: [0xe8f4ff, 0x7aa8e0], serenade: [0xa8d8ff, 0x3a6ae0] },
  size: { violin: 0.72, cello: 1.25, flute: 0.66, horn: 0.5, cymbal: 0.21, baton: 0.42, harpSmall: 0.7, harpBig: 2.6, note: 0.22, player: 1.15, bell: 0.55 },
};
const C = MUFX.col;
const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const D3 = (f) => new THREE.Vector3(f.x, 0, -f.z).normalize();
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeBack = (x) => { x = clamp01(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
let SEED = 11; const rnd = (a, b) => { SEED = (SEED * 16807) % 2147483647; return a + (SEED / 2147483647) * (b - a); };   // 자기 난수 — 게임 Math.random(명중·치명)을 건드리지 않음
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _mx = new THREE.Matrix4();
const groundY = (x, z) => { try { return window.G.zone.geo.ground(x, z).y; } catch (e) { return 0; } };
const top = (t) => Math.min(1.7, 0.75 + (t.radius || 0.5) * 0.9);
// 하프 현 자리(fx_music.py 와 같은 식): 공명판 (0.08, 0.08) -> (0.62, 0.82), 목 y_top(x)
const HARP_N = 7, harpTop = (x) => 1.0 - 0.18 * Math.sin(Math.PI * x / 0.62) + 0.05 * x, harpBot = (x) => 0.08 + (x - 0.08) / 0.54 * 0.74;

// 얇은 곡면 띠(현악 초승달·음파·충격파): 부채꼴 지오메트리(uv.x = 각도 0..1, uv.y = 반지름 0..1), uP = 띠 반지름, uW2 = 띠 두께, uWob = 찌그러짐
const ARC_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const ARC_FS = `uniform vec3 uW, uB; uniform float uA, uP, uW2, uWob, uT; varying vec2 vUv;
void main(){ float u = vUv.x, v = vUv.y, side = smoothstep(0., .14, u) * smoothstep(1., .86, u);
  float fr = uP + uWob * (.5 * sin(u * 23. + uT * 7.) + .3 * sin(u * 51. - uT * 11.));
  float d = abs(v - fr), band = exp(-d * d / (uW2 * uW2)), core = exp(-d * d / (uW2 * uW2 * .12));
  float tail = smoothstep(fr - .35, fr, v) * step(v, fr) * .18;
  gl_FragColor = vec4(mix(uB, uW, clamp(core, 0., 1.)) * (band + tail) * side * uA, 1.); }`;
// 환영(연주자·악단·잔상 하프): 정점 색 + 가장자리 빛, 반투명(깊이 안 씀)
const GH_VS = `attribute vec3 color; varying vec3 vC, vN, vV; void main(){ vC = color; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const GH_FS = `uniform vec3 uTint, uRim; uniform float uA, uGlow; varying vec3 vC, vN, vV;
void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; float rim = pow(1. - max(0., dot(n, vV)), 2.); float d = max(0., dot(n, normalize(vec3(-.4, .8, .5))));
  vec3 c = vC * uTint * (.55 + .5 * d) + uRim * (rim * .9 + uGlow); gl_FragColor = vec4(c, uA * (.55 + .45 * rim)); }`;
const TX_FS = `uniform sampler2D uMap; uniform float uA, uP, uLit; varying vec2 vUv;
void main(){ vec4 t = texture2D(uMap, vUv); float open = smoothstep(uP * .5 + .01, uP * .5 - .01, abs(vUv.x - .5)); gl_FragColor = vec4(t.rgb * (1. + uLit * t.a * .0), t.a * uA * open); }`;

/** 악보 그림(크림색 종이·금테·오선 5줄·음자리표, 음표는 게임이 메시로 점등) — 처음 한 번만 */
let SCORE = null;
function scoreTex() {
  if (SCORE) return SCORE;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const g = cv.getContext('2d');
  g.fillStyle = 'rgba(255,248,226,0.92)'; g.beginPath(); g.roundRect(6, 6, 500, 244, 18); g.fill();
  g.strokeStyle = '#d8a43a'; g.lineWidth = 6; g.stroke(); g.lineWidth = 2; g.strokeStyle = '#e8c070'; g.strokeRect(22, 22, 468, 212);
  g.strokeStyle = '#4a3a5a'; g.lineWidth = 3; for (let i = 0; i < 5; i++) { const y = 82 + i * 22; g.beginPath(); g.moveTo(40, y); g.lineTo(474, y); g.stroke(); }
  g.fillStyle = '#4a3a5a'; g.font = 'bold 120px serif'; g.fillText('𝄞', 36, 196);
  g.font = 'bold 26px serif'; g.fillStyle = '#9a6a20'; g.fillText('Finale · Coda', 300, 52);
  SCORE = new THREE.CanvasTexture(cv); SCORE.colorSpace = THREE.SRGBColorSpace; return SCORE;
}

export class MusicFx extends CookFx {
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const j = await (await fetch('assets/fx/fx_music.glb.json')).json(), raw = atob(j.b64), u8 = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
      const g = await new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej));
      g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      this.plane = new THREE.PlaneGeometry(1, 1);
      this.ready = true;
    })().catch(e => console.warn('musicfx load', e));
    return this.loading;
  }
  _mat(kind) {
    const U = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }])), Cc = () => new THREE.Color(1, 1, 1);
    if (kind === 'arc') return new THREE.ShaderMaterial({ uniforms: U({ uW: Cc(), uB: Cc(), uA: 0, uP: 0.5, uW2: 0.05, uWob: 0, uT: 0 }), vertexShader: ARC_VS, fragmentShader: ARC_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    if (kind === 'gh') return new THREE.ShaderMaterial({ uniforms: U({ uTint: Cc(), uRim: new THREE.Color(0xc8d8ff), uA: 0.8, uGlow: 0 }), vertexShader: GH_VS, fragmentShader: GH_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    if (kind === 'tx') return new THREE.ShaderMaterial({ uniforms: U({ uMap: null, uA: 0, uP: 0, uLit: 0 }), vertexShader: ARC_VS, fragmentShader: TX_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    return super._mat(kind);
  }
  make(kind, a, o = {}) { if (!this._ok()) return null; const f = this['k_' + kind]; return f ? f.call(this, a, o) : null; }
  _h(e, o = {}) { e.dispose = () => this._free(e); return Object.assign(e, o); }
  _end(e, t = 0.35) { if (!e || e.dead || e.ending != null) return; e.ending = e.t; e.life = e.t + t; }
  _fk(e) { return e.ending != null ? 1 - clamp01((e.t - e.ending) / Math.max(0.01, e.life - e.ending)) : 1; }
  /** 악기·소품(정점 색, 밝은 재질) — see = 반투명 환영 */
  inst(e, name, o = {}) { const geo = this.geo[name]; if (!geo) return null; if (o.ghost) { const m = this._m(e, 'gh', geo, o.order ?? 3), u = m.material.uniforms; u.uTint.value.setHex(o.tint ?? 0xffffff); u.uRim.value.setHex(o.rim ?? 0xc8d8ff); u.uA.value = o.a ?? 0.8; u.uGlow.value = o.glow ?? 0; return m; }
    const m = this.solid(e, geo, { tint: o.tint, rim: o.rim, spec: o.spec ?? 0.7 }); m.material.uniforms.uGlow.value = o.glow ?? 0; return m; }
  arc(e, ang, w, b, order = 5) { const m = this._m(e, 'arc', this.fan(ang), order), u = m.material.uniforms; u.uW.value.setHex(w); u.uB.value.setHex(b); u.uA.value = 0; u.uP.value = 0.5; u.uW2.value = 0.05; u.uWob.value = 0; return m; }
  /** z축을 dir로, y를 up 쪽으로 (악기 놓기) */
  orient(m, dir, up = UP) { const z = _a.copy(dir).normalize(), x = _b.crossVectors(up, z); if (x.lengthSq() < 1e-6) x.set(1, 0, 0); x.normalize(); const y = _c.crossVectors(z, x); _mx.makeBasis(x, y, z); m.quaternion.setFromRotationMatrix(_mx); return m; }
  /** x축을 dir로 (활·플루트·현) */
  orientX(m, dir, up = UP) { const x = _a.copy(dir).normalize(), z = _b.crossVectors(x, up); if (z.lengthSq() < 1e-6) z.set(0, 0, 1); z.normalize(); const y = _c.crossVectors(z, x); _mx.makeBasis(x, y, z); m.quaternion.setFromRotationMatrix(_mx); return m; }
  /** 손·뼈 위치(three 좌표) */
  hand(pc) { let h = null; try { h = pc.body && pc.body.handPoint ? pc.body.handPoint() : null; } catch (e) { h = null; } return h ? h.clone() : P3(pc.pos).add(D3(pc.facing).multiplyScalar(0.35)).setY((pc.pos.y || 0) + 1.05); }
  bone(pc, n, fb) { let h = null; try { h = pc.body && pc.body.bonePoint ? pc.body.bonePoint(n) : null; } catch (e) { h = null; } return h ? h.clone() : fb(); }
  handL(pc) { const f = D3(pc.facing), r = _a.crossVectors(f, UP).normalize().clone(); return this.bone(pc, 'Left_Hand', () => P3(pc.pos).addScaledVector(f, 0.3).addScaledVector(r, -0.25).setY((pc.pos.y || 0) + 1.05)); }
  chin(pc) { const f = D3(pc.facing), r = _a.crossVectors(f, UP).normalize().clone(); const h = this.bone(pc, 'Head', () => P3(pc.pos).setY((pc.pos.y || 0) + 1.45)); return h.addScaledVector(r, -0.1).addScaledVector(f, 0.06).setY(h.y - 0.12); }
  /** 두 점 사이 얇은 빛줄(현악 파동·관악 포격·연주자 음파) */
  beam(a, b, w, c, life = 0.22, wd = 0.12) {
    const e = this._fx('beam', life, (e) => { const k = e.t / life; m.material.uniforms.uA.value = MUFX.intensity * 1.3 * (1 - smooth(0.2, 1, k)); });
    const m = this.spr(e, 2, w, c, 6), d = _a.subVectors(b, a); m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(d.length(), wd, 1); this._alignLine(m, d); return e;
  }
  /** 바닥 원형 충격파(실제 반경 r까지): wob = 찌그러짐(타악) */
  shock(at, r, w, b, o = {}) {
    const life = o.life ?? 0.32, e = this._fx('shock', life, (e) => { const k = e.t / life; m.position.set(at.x, (o.y ?? at.y) + 0.06, at.z); m.scale.setScalar(r); m.material.uniforms.uP.value = 0.15 + 0.85 * easeOut(k); m.material.uniforms.uW2.value = (o.w2 ?? 0.05) * (1 + k); m.material.uniforms.uT.value = e.t; m.material.uniforms.uA.value = MUFX.intensity * (o.a ?? 1.6) * (1 - smooth(0.45, 1, k)); });
    const m = this.arc(e, 360, w, b, 4); m.material.uniforms.uWob.value = o.wob ?? 0; return e;
  }
  flashAt(at, w, b, s = 0.6, life = 0.16) { const e = this._fx('fl', life, (e) => { const k = e.t / life; f.quaternion.copy(this.camQ); f.scale.setScalar(s * (0.6 + 0.5 * easeOut(k))); f.material.uniforms.uA.value = MUFX.intensity * 1.2 * (1 - smooth(0.15, 1, k)); }); e.g.position.copy(at); const f = this.spr(e, 3, w, b, 7); return e; }
  /** 떠오르는·날아가는 음표(to = 날아갈 곳) */
  notes(at, n, o = {}) {
    if (n <= 0) return null; const ps = [], life = o.life || 0.9;
    const e = this._fx('notes', life, (e) => { const k = e.t / life;
      for (const p of ps) { const kk = clamp01((e.t - p.d) / (life - p.d)); if (o.to) { p.m.position.copy(p.p0).lerp(o.to, easeOut(kk)); p.m.position.y += Math.sin(kk * Math.PI) * (o.arc ?? 0.5); } else p.m.position.copy(p.p0).addScaledVector(p.v, e.t);
        p.m.quaternion.copy(this.camQ); p.m.scale.setScalar(p.s * (kk < 0.1 ? kk * 10 : 1)); p.m.material.uniforms.uGlow.value = 0.35; p.m.material.uniforms.uA.value = (1 - smooth(0.7, 1, k)) * (e.t < p.d ? 0 : 1); } });
    for (let i = 0; i < n; i++) { const m = this.inst(e, i % 3 === 2 ? 'mu_note2' : 'mu_note', { tint: o.tint ?? 0xffffff }); if (!m) break; m.material.transparent = true; const a = rnd(0, 6.283), r = rnd(0, o.r ?? 0.3);
      ps.push({ m, p0: at.clone().add(new THREE.Vector3(Math.cos(a) * r, rnd(0, 0.3), Math.sin(a) * r)), v: new THREE.Vector3(Math.cos(a) * 0.3, rnd(0.5, 1.1), Math.sin(a) * 0.3), s: (o.size ?? MUFX.size.note) * rnd(0.8, 1.15), d: i * (o.gap ?? 0.05) }); }
    return e;
  }

  // ================================================================== 누른 순간: 손의 악기
  k_pre(pc, o) {
    const what = o.what, lead = Math.max(0.1, o.lead || 0.25), S = MUFX.size, low = lite();
    let life = lead + 0.5; if (what === 'violin') life = 1.1; if (what === 'bells') life = 2.2;
    const st = { pluck: -1, clash: -1, strokes: [], blowT: -1, burstAt: null, burstT: -1, r: 1 };
    const e = this._fx('pre_' + what, life, (e) => {
      const t = e.t, f = D3(pc.facing), rr = _a.crossVectors(f, UP).normalize().clone(), base = P3(pc.pos), fk = this._fk(e), inA = smooth(0, 0.08, t) * fk;
      const hR = this.hand(pc), hL = this.handL(pc);
      if (what === 'strings') {   // 앞에 빛나는 현 3줄 -> 튕기면 진동
        const c = base.clone().addScaledVector(f, 0.62).setY(base.y + 1.12), vib = st.pluck >= 0 ? Math.exp(-(t - st.pluck) * 9) : 0;
        const fade = st.pluck >= 0 ? 1 - smooth(0.14, 0.4, t - st.pluck) : 1;
        strs.forEach((m, i) => { m.position.copy(c).setY(c.y + (i - 1) * 0.12 + Math.sin(t * 90 + i * 2) * 0.03 * vib); m.scale.set(1.0, 0.07 + 0.08 * vib, 1); this._alignLine(m, rr); m.material.uniforms.uA.value = (0.9 + 1.6 * vib) * inA * fade; });
        glow.position.copy(c); glow.quaternion.copy(this.camQ); glow.scale.set(1.1, 0.5, 1); glow.material.uniforms.uA.value = 0.35 * inA * (1 + vib * 2) * (st.pluck >= 0 ? 1 - smooth(0.1, 0.3, t - st.pluck) : 1);
      } else if (what === 'cymbals') {   // 두 손의 심벌즈(서로를 향함)
        const d = _b.subVectors(hL, hR); const len = d.length(); d.normalize();
        cym[0].position.copy(hR).addScaledVector(d, 0.02); this.orient(cym[0], UP, d); cym[0].quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
        cym[1].position.copy(hL).addScaledVector(d, -0.02); this.orient(cym[1], UP, d.clone().negate()); cym[1].quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
        const ring = st.clash >= 0 ? Math.exp(-(t - st.clash) * 14) : 0;
        for (const m of cym) { m.scale.setScalar(S.cymbal * (0.4 + 0.6 * easeBack(t / 0.12))); m.material.uniforms.uGlow.value = 0.6 * ring; m.material.uniforms.uA.value = st.clash >= 0 ? 1 - smooth(0.25, 0.45, t - st.clash) : 1; }
        void len;
      } else if (what === 'violin') {   // 바이올린(턱 -> 왼손) + 활(오른손에서 브리지를 지나감)
        const ch = this.chin(pc), dir = _b.subVectors(hL, ch), L = Math.max(0.3, dir.length()); dir.normalize();
        vn.position.copy(ch); this.orient(vn, dir, UP); vn.scale.setScalar(L / 0.71);
        const br = ch.clone().addScaledVector(dir, 0.19 * L / 0.71).addScaledVector(UP, 0.06 * L / 0.71), bd = _c.subVectors(br, hR).normalize();
        bw.position.copy(hR); this.orientX(bw, bd, dir); bw.scale.setScalar(0.7);
        const last = st.strokes.length ? t - st.strokes[st.strokes.length - 1] : 9, vib = Math.exp(-last * 7);
        vn.material.uniforms.uGlow.value = 0.08 + 0.4 * vib; const a = fk * smooth(0, 0.1, t); vn.material.uniforms.uA.value = a; bw.material.uniforms.uA.value = a; e.br = br;
      } else if (what === 'bells') {   // 대상 둘레 금빛 나팔구 -> 음압이 가운데로 -> 공명막 -> 파열
        const tg = o.tgt && !o.tgt.dead ? o.tgt : null, c = tg ? P3(tg.pos) : (e.c0 || (e.c0 = P3(o.aim || pc.pos))); if (tg) e.c0 = c.clone();
        const R = Math.max(1.2, st.r * 0.95), y = c.y + 1.0;
        bells.forEach((m, i) => { const a = i / bells.length * 6.283 + 0.3, p = c.clone().add(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R)).setY(y + 0.15 * Math.sin(i * 2.1));
          m.position.copy(p); this.orient(m, _a.subVectors(c.clone().setY(y), p)); const k = easeBack(clamp01((t - i * 0.03) / 0.18)); m.scale.setScalar(S.bell * k);
          const blow = st.blowT >= 0 ? clamp01((t - st.blowT) / st.burstT) : 0; m.material.uniforms.uGlow.value = 0.15 + 0.7 * blow; m.material.uniforms.uA.value = st.burstAt != null ? 1 - smooth(0.05, 0.3, t - st.burstAt) : 1; });
        if (st.blowT >= 0 && st.burstAt == null) {   // 가운데로 모이는 음압 고리 + 부푸는 공명막
          const k = clamp01((t - st.blowT) / st.burstT);
          rings.forEach((m, i) => { const kk = (k * 1.6 + i / rings.length) % 1; m.position.set(c.x, y, c.z); m.scale.setScalar(R * (1 - kk) * 1.1 + 0.2); m.material.uniforms.uP.value = 0.9; m.material.uniforms.uW2.value = 0.04; m.rotation.set(-Math.PI / 2, 0, 0); m.material.uniforms.uA.value = 0.9 * smooth(0, 0.2, kk) * (1 - smooth(0.7, 1, kk)); });
          mem.position.set(c.x, y, c.z); mem.quaternion.copy(this.camQ); mem.scale.setScalar(0.3 + 0.9 * easeOut(k)); mem.material.uniforms.uA.value = 0.3 + 0.6 * k;
        } else { for (const m of rings) m.material.uniforms.uA.value = 0; mem.material.uniforms.uA.value = st.burstAt != null ? 0 : 0; }
      } else {   // 손에 든 악기(하프·나팔·첼로·플루트·지휘봉·접힌 틀)
        const a = fk * smooth(0, 0.08, t) * (1 - smooth(lead + 0.25, lead + 0.45, t));
        if (what === 'harp') { const p = base.clone().addScaledVector(f, 0.55).addScaledVector(rr, -0.12).setY(base.y + 0.7); hp.position.copy(p); this.orient(hp, rr.clone().negate()); hp.scale.setScalar(S.harpSmall); hp.material.uniforms.uA.value = a; hp.material.uniforms.uGlow.value = 0.15 + 0.5 * Math.exp(-Math.abs(t - lead) * 8); }
        if (what === 'horn') { const hd = this.bone(pc, 'Head', () => base.clone().setY(base.y + 1.45)); const mouth = hd.clone().addScaledVector(f, 0.13).setY(hd.y - 0.08); hn.position.copy(mouth); this.orient(hn, f.clone().setY(0.18)); hn.scale.setScalar(S.horn); hn.material.uniforms.uA.value = a; hn.material.uniforms.uGlow.value = 0.6 * Math.exp(-Math.abs(t - lead) * 10); }
        if (what === 'cello') { const g = base.clone().addScaledVector(f, 0.42).addScaledVector(rr, -0.22); g.y = groundY(g.x, -g.z); const d = _b.subVectors(hL, g).clone(); const L = d.length(); d.normalize(); ce.position.copy(g); this.orientY(ce, d, f); ce.scale.setScalar(L / 0.8);
          const cp = g.clone().addScaledVector(d, 0.3 * L); bw.position.copy(hR); this.orientX(bw, _c.subVectors(cp, hR).normalize(), f); bw.scale.setScalar(0.85); ce.material.uniforms.uA.value = a; bw.material.uniforms.uA.value = a; ce.material.uniforms.uGlow.value = 0.3 * Math.exp(-Math.abs(t - lead) * 6); }
        if (what === 'flute') { const d = _b.subVectors(hR, hL).normalize(); fl.position.copy(hL).addScaledVector(d, -0.14); this.orientX(fl, d); fl.scale.setScalar(S.flute); fl.material.uniforms.uA.value = a; fl.material.uniforms.uGlow.value = 0.4 * Math.exp(-Math.abs(t - lead) * 8); }
        if (what === 'baton' || what === 'frame') { const el = this.bone(pc, 'Right_LowerArm', () => hR.clone().addScaledVector(f, -0.25)); const d = _b.subVectors(hR, el).normalize();
          bt.position.copy(hR); this.orient(bt, d); bt.scale.setScalar(what === 'frame' ? 0.0001 : S.baton); bt.material.uniforms.uA.value = a; bt.material.uniforms.uGlow.value = 0.6 * Math.exp(-Math.abs(t - lead) * 10);
          if (fr) { fr.position.copy(hR).lerp(hL, 0.5).setY(Math.min(hR.y, hL.y) - 0.1); this.orient(fr, rr.clone().negate()); fr.scale.set(0.35, 0.18, 0.35); fr.material.uniforms.uA.value = a; } }
      }
    });
    const strs = [], cym = [], bells = [], rings = []; let glow = null, vn = null, bw = null, hp = null, hn = null, ce = null, fl = null, bt = null, fr = null, mem = null;
    if (what === 'strings') { for (let i = 0; i < 3; i++) strs.push(this.spr(e, 2, C.gold, C.goldB, 6)); glow = this.spr(e, 0, C.gold, C.goldB, 4); }
    if (what === 'cymbals') for (let i = 0; i < 2; i++) { const m = this.inst(e, 'mu_cymbal', { spec: 1.2 }); if (m) { m.material.transparent = true; cym.push(m); } }
    if (what === 'violin') { vn = this.inst(e, 'mu_violin', { spec: 0.6 }); bw = this.inst(e, 'mu_bow', {}); for (const m of [vn, bw]) if (m) m.material.transparent = true; }
    if (what === 'bells') { for (let i = 0; i < (low ? 4 : 6); i++) { const m = this.inst(e, 'mu_bell', { spec: 1.0 }); if (m) { m.material.transparent = true; bells.push(m); } } for (let i = 0; i < 3; i++) rings.push(this.arc(e, 360, C.gold, C.goldB, 5)); mem = this.spr(e, 0, C.warm, C.goldB, 5); }
    if (what === 'harp') { hp = this.inst(e, 'mu_harp', {}); hp && (hp.material.transparent = true); }
    if (what === 'horn') { hn = this.inst(e, 'mu_horn', { spec: 1.0 }); hn && (hn.material.transparent = true); }
    if (what === 'cello') { ce = this.inst(e, 'mu_cello', {}); bw = this.inst(e, 'mu_bow', {}); for (const m of [ce, bw]) if (m) m.material.transparent = true; }
    if (what === 'flute') { fl = this.inst(e, 'mu_flute', { spec: 1.2 }); fl && (fl.material.transparent = true); }
    if (what === 'baton' || what === 'frame') { bt = this.inst(e, 'mu_baton', {}); bt && (bt.material.transparent = true); if (what === 'frame') { fr = this.inst(e, 'mu_harp', { tint: 0xfff0c0 }); fr && (fr.material.transparent = true); } }
    return this._h(e, { what,
      pluck: () => { st.pluck = e.t; const c = P3(pc.pos).addScaledVector(D3(pc.facing), 0.62).setY((pc.pos.y || 0) + 1.12); this.flashAt(c, C.gold, C.goldB, 0.5, 0.12); },
      clash: (q) => { st.clash = e.t; const c = this.hand(pc).lerp(this.handL(pc), 0.5); this.flashAt(c, C.warm, C.goldB, 0.7, 0.14); this.k_clash(pc, { r: q.r, hits: q.hits, noFlash: true }); },
      stroke: (i, n) => { st.strokes.push(e.t); if (e.br) this.flashAt(e.br, C.gold, C.goldB, 0.25 + 0.08 * i, 0.1); if (i === n - 1) this._end(e, 0.3); },
      blow: (bt_, r) => { st.blowT = e.t; st.burstT = bt_; st.r = r; },
      burst: (c, r, hits) => { st.burstAt = e.t; const p = P3(c); p.y = groundY(c.x, c.z); this.flashAt(p.clone().setY(p.y + 1.0), C.warm, C.goldB, 1.0, 0.16); this.shock(p, r, C.gold, C.goldB, { a: 1.8, w2: 0.04, life: 0.35 });
        this.notes(p.clone().setY(p.y + 0.8), lite() ? 3 : 6, { r: r * 0.6, size: 0.18, life: 0.8 }); for (const t of hits) this.flashAt(P3(t.pos).setY((t.pos.y || 0) + top(t) * 0.7), C.gold, C.goldB, 0.4, 0.12); this._end(e, 0.35); },
      react: (pos, r, hits) => { const p = P3(pos); p.y = groundY(pos.x, pos.z); this.shock(p, r, C.violet, C.violetB, { a: 1.5, wob: 0.03, life: 0.3 }); for (const t of hits) this.flashAt(P3(t.pos).setY((t.pos.y || 0) + top(t) * 0.6), C.violet, C.violetB, 0.3, 0.1); },
      end: () => this._end(e, 0.25) });
  }
  orientY(m, ydir, fwd) { const y = _a.copy(ydir).normalize(), x = _b.crossVectors(y, fwd); if (x.lengthSq() < 1e-6) x.set(1, 0, 0); x.normalize(); const z = _c.crossVectors(x, y); _mx.makeBasis(x, y, z); m.quaternion.setFromRotationMatrix(_mx); return m; }

  // ================================================================== A1 현의 금빛 파동 / A3 초승달 / A2 충격파
  k_wave(p0, o) {
    const f = D3(o.f), w = o.w || 1, gold = !o.echo, amp = !!o.amp;
    const e = this._fx('wave', 3, (e) => { const fk = this._fk(e), k = e.prog || 0, sw = 1 + 0.25 * Math.sin(e.t * 30);
      m.position.copy(e.pos || P3(p0)).addScaledVector(f, -0.3); m.rotation.set(0, Math.atan2(f.x, f.z) - Math.PI / 2, 0); m.scale.set(0.9 * w, 1, 0.9 * w); m.material.uniforms.uP.value = 0.85; m.material.uniforms.uW2.value = 0.06 * sw; m.material.uniforms.uT.value = e.t; m.material.uniforms.uA.value = 2.4 * fk * (1 - 0.3 * k);
      m2.position.copy(m.position).addScaledVector(f, -0.25); m2.rotation.copy(m.rotation); m2.scale.set(0.75 * w, 1, 0.75 * w); m2.material.uniforms.uP.value = 0.85; m2.material.uniforms.uW2.value = 0.04; m2.material.uniforms.uT.value = e.t + 1; m2.material.uniforms.uA.value = 1.4 * fk;
      tr.position.copy(m.position).addScaledVector(f, -0.6); tr.scale.set(1.6, 0.16, 1); this._alignLine(tr, f); tr.material.uniforms.uA.value = 0.8 * fk;
      if (rim) { rim.position.copy(m.position); rim.rotation.copy(m.rotation); rim.scale.set(1.15 * w, 1, 1.15 * w); rim.material.uniforms.uP.value = 0.85; rim.material.uniforms.uA.value = 0.9 * fk; } });
    const m = this.arc(e, 110, gold ? C.gold : C.silver, gold ? C.goldB : C.silverB, 6), m2 = this.arc(e, 100, gold ? C.warm : C.silver, gold ? C.goldB : C.silverB, 6), tr = this.spr(e, 2, gold ? C.gold : C.silver, gold ? C.goldB : C.silverB, 5), rim = amp ? this.arc(e, 110, C.warm, C.goldB, 5) : null;
    e.pos = P3(p0);
    return this._h(e, { set: (p, k) => { e.pos = P3(p).setY(P3(p0).y); e.prog = k; }, hit: (t, ok) => { const q = P3(t.pos).setY((t.pos.y || 0) + top(t) * 0.7); if (ok) { this.flashAt(q, C.warm, C.goldB, 0.55, 0.12); this.notes(q, 1, { size: 0.16, life: 0.5 }); } else this.flashAt(q, C.silver, C.silverB, 0.25, 0.08); }, end: () => this._end(e, 0.18) });
  }
  k_cres(p0, o) {
    const i = o.i || 0, last = !!o.last, s = 0.55 + 0.18 * i + (last ? 0.25 : 0), gold = !o.echo;
    const e = this._fx('cres', 2, (e) => { const fk = this._fk(e), p = e.pos || P3(p0), d = e.dir || new THREE.Vector3(0, 0, -1);
      m.position.copy(p).addScaledVector(d, -0.35 * s); m.rotation.set(0, Math.atan2(d.x, d.z) - Math.PI / 2, 0); m.scale.set(s, 1, s); m.material.uniforms.uP.value = 0.8; m.material.uniforms.uW2.value = 0.05 + 0.02 * i; m.material.uniforms.uT.value = e.t; m.material.uniforms.uA.value = (1.2 + 0.25 * i) * fk; });
    const m = this.arc(e, 130, gold ? (last ? C.warm : C.rose) : C.silver, gold ? (last ? C.goldB : C.roseB) : C.silverB, 6);
    let lastP = P3(p0);
    return this._h(e, { set: (p, t) => { const q = P3(p).setY(P3(p0).y - 0.1); e.dir = q.clone().sub(lastP).setY(0); if (e.dir.lengthSq() < 1e-8) e.dir.set(0, 0, -1); e.dir.normalize(); lastP = q; e.pos = q; void t; },
      hit: (t, ok, k) => { const q = P3(t.pos).setY((t.pos.y || 0) + top(t) * 0.7); if (!ok) return this.flashAt(q, C.silver, C.silverB, 0.25, 0.08);
        const big = last && k > 1; this.flashAt(q, big ? C.warm : C.rose, big ? C.goldB : C.roseB, big ? 1.0 : 0.4 + 0.08 * i, big ? 0.18 : 0.1);
        if (big) { const g = P3(t.pos); g.y = groundY(t.pos.x, t.pos.z); this.shock(g, 1.4, C.gold, C.goldB, { a: 1.6, life: 0.32 }); this.notes(q, lite() ? 2 : 5, { r: 0.4, size: 0.2, life: 0.8 }); } },
      end: () => this._end(e, 0.12) });
  }
  k_clash(pc, o) {   // 찌그러진 원형 음파 + 깨진 오선 조각 (실제 반경 r)
    const c = P3(pc.pos); c.y = groundY(pc.pos.x, pc.pos.z);
    this.shock(c, o.r, C.warm, C.goldB, { a: 2.0, wob: 0.05, w2: 0.05, life: 0.3 });
    if (o.amp) this.shock(c, o.r, C.gold, C.goldB, { a: 1.0, life: 0.38, w2: 0.03 });
    if (!o.noFlash) this.flashAt(c.clone().setY(c.y + 1.2), C.warm, C.goldB, 0.6, 0.12);
    const n = lite() ? 3 : 6, parts = [], life = 0.5;
    const e = this._fx('shards', life, (e, dt) => { const k = e.t / life; for (const p of parts) { p.m.position.addScaledVector(p.v, dt); p.v.y -= 2 * dt; p.m.rotation.z += p.w * dt; p.m.material.uniforms.uA.value = 1 - smooth(0.4, 1, k); } });
    for (let i = 0; i < n; i++) { const m = this.inst(e, 'mu_shard', { glow: 0.5 }); if (!m) break; m.material.transparent = true; const a = i / n * 6.283 + rnd(-0.3, 0.3); m.scale.setScalar(0.32); m.position.copy(c).add(new THREE.Vector3(Math.cos(a) * 0.5, 1.1, Math.sin(a) * 0.5)); m.rotation.set(0, -a, rnd(-0.5, 0.5));
      parts.push({ m, v: new THREE.Vector3(Math.cos(a) * o.r * 1.2, rnd(0.4, 1.2), Math.sin(a) * o.r * 1.2), w: rnd(-6, 6) }); }
    for (const t of o.hits || []) this.flashAt(P3(t.pos).setY((t.pos.y || 0) + top(t) * 0.7), C.warm, C.goldB, 0.35, 0.1);
    return e;
  }

  // ================================================================== 지속 선율
  k_melody(pc, o) {
    const mel = o.mel, col = MUFX.mel[mel], low = lite(); let boost = 0, bcol = null, lastP = null, beatT = 0, fl = null;
    const e = this._fx('mel_' + mel, (o.dur || 20) + 1, (e, dt) => {
      const base = P3(pc.pos), f = D3(pc.facing), r = _a.crossVectors(f, UP).normalize().clone(), fk = this._fk(e) * smooth(0, 0.25, e.t), t = e.t, bk = 1 + boost * 1.2;
      if (mel === 'aria' && hp) { const p = base.clone().addScaledVector(r, 0.62).addScaledVector(f, -0.1).setY(base.y + 1.25 + 0.06 * Math.sin(t * 2)); hp.position.copy(p); this.orient(hp, f.clone().negate()); hp.scale.setScalar(0.45); hp.material.uniforms.uA.value = 0.85 * fk; hp.material.uniforms.uGlow.value = 0.1 * bk;
        strs.forEach((m, i) => { const x = 0.12 + i * 0.07, y0 = harpBot(x), y1 = harpTop(x), lit = Math.max(0, Math.sin(t * 6 - i * 0.9)) ** 8; m.position.copy(p).addScaledVector(r, -x * 0.45).setY(p.y + y0 * 0.45); m.scale.set(1, (y1 - y0) * 0.45, 1); m.quaternion.identity(); m.material.uniforms.uGlow.value = 0.2 + 0.8 * lit * bk; m.material.uniforms.uA.value = fk; }); }
      if (mel === 'march' && hn) { const p = base.clone().addScaledVector(f, -0.55).addScaledVector(r, 0.25).setY(base.y + 1.6 + 0.05 * Math.sin(t * 5)); hn.position.copy(p); this.orient(hn, f.clone().setY(0.6)); hn.scale.setScalar(0.42); hn.material.uniforms.uA.value = 0.75 * fk; hn.material.uniforms.uGlow.value = 0.15 * bk;
        const moved = lastP && Math.hypot(base.x - lastP.x, base.z - lastP.z) > 0.01; lastP = base.clone(); beatT -= dt;
        if (moved && beatT <= 0 && fk > 0.5) { beatT = 0.45; this.chevron(base.clone().addScaledVector(f, 0.5), f, col); } }
      if (mel === 'coral') { rings.forEach((m, i) => { m.position.set(base.x, base.y + 0.55 + i * 0.13, base.z); m.rotation.set(-Math.PI / 2, 0, t * 0.3 * (i % 2 ? 1 : -1)); m.scale.setScalar(0.78 + 0.02 * Math.sin(t * 3 + i)); m.material.uniforms.uP.value = 0.92; m.material.uniforms.uW2.value = 0.02;
          m.material.uniforms.uWob.value = 0.012 * (e.fl || 0); m.material.uniforms.uT.value = t; m.material.uniforms.uA.value = (0.55 + 0.6 * (e.fl || 0)) * fk * bk * 0.8; }); e.fl = Math.max(0, (e.fl || 0) - dt * 4);
        if (fl) { fl.m.position.copy(base).addScaledVector(fl.d, 0.8).setY(base.y + 0.85); fl.m.quaternion.copy(this.camQ); fl.m.scale.setScalar(0.5); fl.m.material.uniforms.uA.value = (e.fl || 0) * 1.5; } }
      if (mel === 'serenade' && fu) { const p = base.clone().addScaledVector(r, 0.55).setY(base.y + 1.5 + 0.05 * Math.sin(t * 2.3)); fu.position.copy(p); this.orientX(fu, r.clone().addScaledVector(UP, 0.15)); fu.scale.setScalar(0.5); fu.material.uniforms.uA.value = 0.85 * fk; fu.material.uniforms.uGlow.value = 0.15 * bk;
        if (mn) { mn.position.copy(p).addScaledVector(UP, 0.35); mn.quaternion.copy(this.camQ); mn.rotateZ(0.4); mn.scale.setScalar(0.11); mn.material.uniforms.uA.value = 0.9 * fk; mn.material.uniforms.uGlow.value = 0.4; } }
      if (bl) { bl.position.set(base.x, base.y + 0.06, base.z); this._flat(bl, 0.7, base.y + 0.06); bl.material.uniforms.uA.value = 0.5 * boost * fk; }
    });
    let hp = null, hn = null, fu = null, mn = null, bl = null; const strs = [], rings = [];
    if (mel === 'aria') { hp = this.inst(e, 'mu_harp', { ghost: true, tint: 0xfff4c8, rim: col[0], a: 0.85 }); for (let i = 0; i < (low ? 4 : HARP_N); i++) { const m = this.inst(e, 'mu_string', { glow: 0.2 }); if (m) { m.material.transparent = true; strs.push(m); } } }
    if (mel === 'march') hn = this.inst(e, 'mu_horn', { ghost: true, tint: 0xffe8a0, rim: col[0], a: 0.75 });
    if (mel === 'coral') for (let i = 0; i < 5; i++) rings.push(this.arc(e, 360, col[0], col[1], 4));
    if (mel === 'serenade') { fu = this.inst(e, 'mu_flute', { ghost: true, tint: 0xeaf4ff, rim: col[0], a: 0.85 }); mn = this.inst(e, 'mu_moon', {}); mn && (mn.material.transparent = true); }
    bl = this.spr(e, 1, col[0], col[1], 2);
    this.notes(P3(pc.pos).setY((pc.pos.y || 0) + 1.3), low ? 2 : 4, { tint: col[0], size: 0.16, life: 0.8 });
    return this._h(e, { mel,
      refresh: () => this.notes(P3(pc.pos).setY((pc.pos.y || 0) + 1.3), 2, { tint: col[0], size: 0.15, life: 0.6 }),
      boost: (b, src) => { boost = b; bcol = src; void bcol; },
      pulse: (list) => { const from = P3(pc.pos).setY((pc.pos.y || 0) + 1.35);
        for (const t of list) { const to = P3(t.pos).setY((t.pos.y || 0) + 0.9); if (mel === 'aria') { this.notes(from.clone().addScaledVector(_a.crossVectors(D3(pc.facing), UP).normalize(), 0.6), low ? 1 : 2, { to, tint: col[0], size: 0.14, life: 0.45, gap: 0.08, arc: 0.35 }); this.petals(P3(t.pos).setY(groundY(t.pos.x, t.pos.z)), low ? 3 : 6); }
          else { this.crescents(to, low ? 2 : 4); } } },
      flinch: (d) => { e.fl = 1; if (!fl) { fl = { m: this.spr(e, 3, C.ice, C.iceB, 6) }; } fl.d = D3(d); this.sfx('mu_string'); },
      end: () => this._end(e, 0.4) });
  }
  chevron(at, f, col) {   // 행진: 발밑에서 앞으로 나아가는 짧은 화살깃 박자선
    const life = 0.5, g = at.clone(); g.y = groundY(at.x, -at.z) + 0.05; const r = _a.crossVectors(f, UP).normalize().clone();
    const e = this._fx('chev', life, (e) => { const k = e.t / life; ls.forEach((m, i) => { const s = i ? 1 : -1, p = g.clone().addScaledVector(f, 0.5 * k).addScaledVector(r, s * 0.13); m.position.copy(p); m.rotation.set(-Math.PI / 2, 0, Math.atan2(f.x, f.z) + Math.PI / 2 + s * 0.7); m.scale.set(0.34, 0.1, 1); m.material.uniforms.uA.value = 0.9 * smooth(0, 0.15, k) * (1 - smooth(0.5, 1, k)); }); });
    const ls = [this.spr(e, 2, col[0], col[1], 3), this.spr(e, 2, col[0], col[1], 3)]; return e;
  }
  petals(at, n) { const ps = [], life = 0.7; const e = this._fx('petals', life, (e, dt) => { const k = e.t / life; for (const p of ps) { p.m.position.addScaledVector(p.v, dt); p.v.y -= 0.6 * dt; p.m.rotation.y += p.w * dt; p.m.material.uniforms.uA.value = 1 - smooth(0.5, 1, k); } });
    for (let i = 0; i < n; i++) { const m = this.inst(e, 'mu_petal', { glow: 0.2 }); if (!m) break; m.material.transparent = true; const a = i / n * 6.283; m.scale.setScalar(0.09); m.position.copy(at).add(new THREE.Vector3(Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3)); m.rotation.set(-1.2, a, 0); ps.push({ m, v: new THREE.Vector3(Math.cos(a) * 0.9, 0.9, Math.sin(a) * 0.9), w: rnd(-4, 4) }); }
    this.shock(at, 0.85, C.mint, C.mintB, { a: 1.1, life: 0.4, w2: 0.04 }); return e; }
  crescents(to, n) { const ps = [], life = 0.6; const e = this._fx('moons', life, () => { const k = e.t / life; for (const p of ps) { const kk = easeOut(clamp01(k * 1.3)); p.m.position.copy(p.p0).lerp(to, kk); p.m.quaternion.copy(this.camQ); p.m.rotateZ(p.a); p.m.scale.setScalar(0.09 * (1 - 0.5 * kk)); p.m.material.uniforms.uA.value = 1 - smooth(0.7, 1, k); } });
    for (let i = 0; i < n; i++) { const m = this.inst(e, 'mu_moon', { glow: 0.5, tint: 0xd0e8ff }); if (!m) break; m.material.transparent = true; const a = i / n * 6.283; ps.push({ m, a, p0: to.clone().add(new THREE.Vector3(Math.cos(a) * 0.8, rnd(0.2, 0.7), Math.sin(a) * 0.8)) }); }
    this.flashAt(to, C.blue, C.blueB, 0.35, 0.14); return e; }
  k_tune(pc, o) { const c = P3(pc.pos); c.y = groundY(pc.pos.x, pc.pos.z); const col = MUFX.mel[o.mel] || [C.gold, C.goldB]; this.shock(c, 1.1, col[0], col[1], { a: 1.0, life: 0.45, w2: 0.03 }); this.flashAt(c.clone().setY(c.y + 1.3), C.gold, C.goldB, 0.35, 0.18); return null; }
  k_accent(pc, o) { const h = this.hand(pc); this.flashAt(h, o.gold ? C.gold : C.warm, C.goldB, 0.32, 0.14); this.notes(h, 1, { size: 0.14, life: 0.5 }); return null; }
  k_echo(pc) { const c = P3(pc.pos); c.y = groundY(pc.pos.x, pc.pos.z); this.shock(c, 1.2, C.silver, C.silverB, { a: 1.0, life: 0.4, w2: 0.04 }); return null; }
  k_fizzle(pc) { this.notes(P3(pc.pos).setY((pc.pos.y || 0) + 1.6), 1, { tint: 0x9098a8, size: 0.14, life: 0.5 }); return null; }

  // ================================================================== 궁극기
  k_score(pc, o) {   // 파멸의 코다: 거대 악보 -> 음표 점등 -> 현악·타악·관악·쉼·합주
    const f = D3(o.facing || pc.facing), org = P3(o.origin || pc.pos), r = _a.crossVectors(f, UP).normalize().clone(), cast = o.cast || 0, low = lite();
    const sp = org.clone().addScaledVector(f, -0.9).setY(org.y + 2.55), W = 2.6, H = 1.3; let lit = Math.min(8, o.n || 0), stage = -1, consumed = -1;
    const e = this._fx('score', cast + 2.6, (e) => {
      const t = e.t, fk = this._fk(e), open = easeOut(t / 0.45);
      pg.position.copy(sp); pg.quaternion.copy(this.camQ); pg.scale.set(W, H, 1); pg.material.uniforms.uP.value = open; pg.material.uniforms.uA.value = 0.95 * fk;
      ns.forEach((m, i) => { const x = -0.32 + i * 0.09, y = -0.08 + 0.05 * Math.sin(i * 1.9); m.position.copy(sp).addScaledVector(this.camR, x * W).addScaledVector(UP, y * H).addScaledVector(this.toCam, 0.03);
        m.quaternion.copy(this.camQ); m.scale.setScalar(0.17); const on = i < lit ? smooth(0.12 + i * (Math.max(0.2, cast - 0.15) / 8), 0.2 + i * (Math.max(0.2, cast - 0.15) / 8), t) : 0;
        m.material.uniforms.uGlow.value = 0.1 + 0.8 * on * (consumed >= 0 ? Math.exp(-(t - consumed) * 2) + 0.3 : 1); m.material.uniforms.uA.value = (i < lit ? 0.4 + 0.6 * on : 0.12) * open * fk; });
      void stage;
    });
    const pg = this._m(e, 'tx', this.plane, 4); pg.material.uniforms.uMap.value = scoreTex();
    const ns = []; for (let i = 0; i < 8; i++) { const m = this.inst(e, 'mu_note', { glow: 0.1 }); if (m) { m.material.transparent = true; ns.push(m); } }
    const sideBells = [];
    return this._h(e, {
      consume: (n) => { lit = n; consumed = e.t; if (n > 0) this.notes(P3(pc.pos).setY((pc.pos.y || 0) + 1.2), Math.min(n, low ? 3 : 8), { to: sp.clone(), size: 0.16, life: 0.4, gap: 0.03, arc: 0.3 }); },
      stage: (i, q) => { stage = i; const g = org.clone(); g.y = groundY(org.x, -org.z);
        if (i === 0) { for (let k = 0; k < (low ? 2 : 3); k++) { const ee = this._fx('codaArc', 0.5, (ee) => { const kk = ee.t / 0.5; m.position.copy(g).setY(g.y + 0.9); m.rotation.set(0, Math.atan2(f.x, f.z) - Math.PI / 2, 0); m.scale.setScalar(q.r); m.material.uniforms.uP.value = 0.1 + 0.9 * easeOut(clamp01(kk * 1.3 - k * 0.12)); m.material.uniforms.uW2.value = 0.025; m.material.uniforms.uA.value = 1.4 * (1 - smooth(0.6, 1, kk)); }); const m = this.arc(ee, q.ang, C.gold, C.goldB, 6); } }
        if (i === 1) { this.flashAt(sp, C.warm, C.goldB, 0.8, 0.14); for (const t of q.hits) { const p = P3(t.pos); p.y = groundY(t.pos.x, t.pos.z); this.shock(p, 1.2, C.warm, C.goldB, { a: 1.8, wob: 0.06, life: 0.22 }); } }
        if (i === 2) { for (const s of [-1, 1]) { const bp = sp.clone().addScaledVector(r, s * 1.5).setY(sp.y - 0.5); sideBells.push(bp); this.flashAt(bp, C.gold, C.goldB, 0.5, 0.12); for (const t of q.hits) this.beam(bp, P3(t.pos).setY((t.pos.y || 0) + top(t) * 0.6), C.gold, C.goldB, 0.2, 0.16); } }
        if (i === 3) { const c = g.clone().addScaledVector(f, q.fwd); this.shock(c, q.r, C.warm, C.goldB, { a: 2.2, life: 0.45, w2: 0.04 }); this.shock(c, q.r * 0.6, C.gold, C.goldB, { a: 1.4, life: 0.35 });
          this.notes(c.clone().setY(c.y + 0.8), low ? 4 : 10, { r: q.r * 0.6, size: 0.22, life: 0.9 }); this.flashAt(sp, C.warm, C.goldB, 1.0, 0.18); this._end(e, 0.7); } },
      cancel: () => this._end(e, 0.25) });
  }
  k_encore(pc, o) {   // 앙코르: 흐려진 오선이 이어지고 큰 하프 현이 펼쳐짐 -> 두 팔을 올리는 순간 회복 파동
    const cast = o.cast || 0, low = lite(); let raised = -1, mcol = null;
    const e = this._fx('encore', cast + 1.6, (e) => {
      const t = e.t, base = P3(pc.pos), f = D3(pc.facing), r = _a.crossVectors(f, UP).normalize().clone(), fk = this._fk(e), join = easeOut(t / Math.max(0.3, cast || 0.4));
      staff.forEach((m, i) => { m.position.set(base.x, base.y + 0.5 + i * 0.16, base.z); m.rotation.set(-Math.PI / 2, 0, i * 0.7 + t * 0.4); m.scale.setScalar(0.95 + 0.25 * (1 - join)); m.material.uniforms.uP.value = 0.95; m.material.uniforms.uW2.value = 0.015; m.material.uniforms.uWob.value = 0.04 * (1 - join); m.material.uniforms.uT.value = t; m.material.uniforms.uA.value = (0.3 + 0.6 * join) * fk; });
      hs.forEach((m, i) => { const a = (i / (hs.length - 1) - 0.5) * 2.2, p = base.clone().addScaledVector(f, -0.9 * Math.cos(a)).addScaledVector(r, 1.3 * Math.sin(a)).setY(base.y + 0.2); const L = 2.4 * smooth(0, 0.3, t - i * 0.03);
        m.position.copy(p); m.quaternion.identity(); m.scale.set(1.6, Math.max(0.001, L), 1.6); const pl = raised >= 0 ? Math.exp(-Math.abs(t - raised - i * 0.03) * 6) : 0; m.material.uniforms.uGlow.value = 0.25 + 1.2 * pl; m.material.uniforms.uA.value = 0.8 * fk; });
    });
    const staff = [], hs = []; for (let i = 0; i < 5; i++) staff.push(this.arc(e, 360, C.mint, C.mintB, 4));
    for (let i = 0; i < (low ? 7 : 13); i++) { const m = this.inst(e, 'mu_string', { glow: 0.3 }); if (m) { m.material.transparent = true; hs.push(m); } }
    return this._h(e, { raise: (q) => { raised = e.t; mcol = q && q.mel ? MUFX.mel[q.mel] : null; const c = P3(pc.pos); c.y = groundY(pc.pos.x, pc.pos.z);
        this.shock(c, 2.4, C.mint, C.mintB, { a: 1.8, life: 0.5, w2: 0.05 }); this.flashAt(c.clone().setY(c.y + 1.5), C.mint, C.mintB, 0.6, 0.2); this.notes(c.clone().setY(c.y + 0.4), low ? 4 : 9, { r: 1.2, size: 0.18, life: 1.0, tint: mcol ? mcol[0] : 0xc8ffa0 });
        if (mcol) this.shock(c, 1.4, mcol[0], mcol[1], { a: 1.4, life: 0.6, w2: 0.04 }); this.petals(c, low ? 4 : 8); this._end(e, 0.9); },
      cancel: () => this._end(e, 0.25) });
  }
  k_stage(pc, o) {   // 그랜드 심포니: 뒤편 반원 별빛 악단(현악 2·관악 2·타악 1, 저사양 3) -> 차례로 연주 -> 합주
    const f = D3(o.facing || pc.facing), org = P3(o.origin || pc.pos), r = _a.crossVectors(f, UP).normalize().clone(), cast = o.cast || 0, low = lite() || o.low;
    const kinds = low ? ['strings', 'brass', 'perc'] : ['strings', 'brass', 'perc', 'brass', 'strings'], inst = { strings: 'mu_violin', brass: 'mu_horn', perc: 'mu_cymbal' };
    const g = org.clone(); g.y = groundY(org.x, -org.z);
    const P = kinds.map((k, i) => { const a = (i / (kinds.length - 1) - 0.5) * 2.4; return { k, p: g.clone().addScaledVector(f, -2.2 * Math.cos(a) - 0.6).addScaledVector(r, 2.4 * Math.sin(a)), play: -9, out: -1 }; });
    let tutti = -1;
    const e = this._fx('stage', cast + 3.6, (e) => {
      const t = e.t, fk = this._fk(e);
      P.forEach((q, i) => { const inK = easeBack(clamp01((t - i * 0.08) / 0.35)), outK = q.out >= 0 ? 1 - smooth(0, 0.35, t - q.out) : 1, pl = Math.exp(-Math.max(0, t - q.play) * 5);
        q.b.position.copy(q.p).setY(q.p.y + 0.05 * Math.sin(t * 3 + i)); this.orient(q.b, f); q.b.scale.setScalar(MUFX.size.player * inK); q.b.material.uniforms.uA.value = 0.7 * outK * fk; q.b.material.uniforms.uGlow.value = 0.1 + 0.5 * pl + (tutti >= 0 ? 0.4 * Math.exp(-(t - tutti) * 2) : 0);
        const ip = q.p.clone().addScaledVector(f, 0.3).setY(q.p.y + 0.9 * MUFX.size.player); q.i.position.copy(ip); q.k === 'brass' ? this.orient(q.i, f.clone().setY(0.4)) : q.k === 'perc' ? this.orient(q.i, f, UP) : this.orient(q.i, r.clone().negate().addScaledVector(f, 0.5), UP);
        q.i.scale.setScalar((q.k === 'strings' ? 0.55 : q.k === 'brass' ? 0.45 : 0.2) * inK * (1 + 0.1 * pl)); q.i.material.uniforms.uA.value = 0.9 * outK * fk; q.i.material.uniforms.uGlow.value = 0.2 + 0.8 * pl; });
      arcF.position.copy(g).setY(g.y + 0.06); this._flat(arcF, 3.0, g.y + 0.05); arcF.material.uniforms.uA.value = 0.25 * smooth(0, 0.4, t) * fk;
    });
    for (const q of P) { q.b = this.inst(e, 'mu_player', { ghost: true, tint: 0xe8e0ff, rim: 0xd8c8ff, a: 0.7 }); q.i = this.inst(e, inst[q.k], { ghost: true, tint: 0xfff0c0, rim: 0xffe8a0, a: 0.9 }); }
    const arcF = this.spr(e, 1, C.violet, C.violetB, 2);
    const of = (part) => P.filter(q => q.k === part);
    return this._h(e, {
      play: (part, j, tg) => { const qs = of(part); const q = qs[j % qs.length]; if (!q) return; q.play = e.t; this.flashAt(q.p.clone().setY(q.p.y + 1.0), C.violet, C.violetB, 0.3, 0.1); void tg; },
      land: (part, tg, ok) => { const qs = of(part), q = qs[0]; if (!q || !tg) return; const to = P3(tg.pos).setY((tg.pos.y || 0) + top(tg) * 0.6), from = q.p.clone().setY(q.p.y + 1.0);
        if (part === 'strings') this.beam(from, to, C.rose, C.roseB, 0.2, 0.1); else if (part === 'brass') this.beam(from, to, C.gold, C.goldB, 0.22, 0.18);
        else { const p = P3(tg.pos); p.y = groundY(tg.pos.x, tg.pos.z); this.shock(p, 1.1, C.warm, C.goldB, { a: 1.8, wob: 0.06, life: 0.2 }); }
        if (ok) this.flashAt(to, C.warm, C.violetB, 0.35, 0.1); },
      tutti: (q) => { tutti = e.t; for (let k = 0; k < (low ? 2 : 3); k++) { const ee = this._fx('symArc', 0.6, (ee) => { const kk = ee.t / 0.6; m.position.copy(g).setY(g.y + 0.8); m.rotation.set(0, Math.atan2(f.x, f.z) - Math.PI / 2, 0); m.scale.setScalar(q.r); m.material.uniforms.uP.value = 0.1 + 0.9 * easeOut(clamp01(kk * 1.2 - k * 0.1)); m.material.uniforms.uW2.value = 0.03; m.material.uniforms.uA.value = 1.6 * (1 - smooth(0.6, 1, kk)); }); const m = this.arc(ee, q.ang, k === 1 ? C.violet : C.warm, k === 1 ? C.violetB : C.goldB, 6); }
        for (const t of q.hits) this.flashAt(P3(t.pos).setY((t.pos.y || 0) + top(t) * 0.7), C.warm, C.goldB, 0.5, 0.14);
        this.notes(g.clone().addScaledVector(f, 2).setY(g.y + 1.0), low ? 4 : 10, { r: 1.5, size: 0.22, life: 1.0 });
        P.forEach((p, i) => { p.out = e.t + 0.5 + i * 0.12; }); this._end(e, 0.5 + P.length * 0.12 + 0.4); },
      cancel: () => this._end(e, 0.25) });
  }

  // ================================================================== 에코: 등 뒤 잔상이 동작을 조금 늦게 따라 함
  k_ghost(pc, o) {
    const body = pc.body, live = body && body.mesh; if (!live || !live.isSkinnedMesh || !body.bones) return null;
    const lag = 0.12, buf = [], nb = body.bones.length; let replayAt = -1;
    const e = this._fx('ghost', (o.dur || 10) + 0.6, (e) => {
      const fk = this._fk(e); body.root.updateMatrixWorld(true);
      const snap = new Float32Array(nb * 16); for (let k = 0; k < nb; k++) body.bones[k].matrixWorld.toArray(snap, k * 16); buf.push({ t: e.t, s: snap }); while (buf.length > 2 && buf[1].t <= e.t - lag) buf.shift();
      const s = buf[0].s, f = D3(pc.facing), off = new THREE.Matrix4().makeTranslation(-f.x * 0.55, 0, -f.z * 0.55);
      g.skeleton.bones.forEach((b, k) => { b.matrixWorld.fromArray(s, k * 16).premultiply(off); });
      this.root.updateMatrixWorld(true); g.matrix.copy(this.root.matrixWorld).invert().multiply(live.matrixWorld).premultiply(off); g.matrixWorldNeedsUpdate = true;
      const rp = replayAt >= 0 ? Math.exp(-Math.abs(e.t - replayAt) * 5) : 0; g.material.opacity = (0.16 + 0.03 * Math.sin(e.t * 4) + 0.3 * rp) * fk * smooth(0, 0.3, e.t);
    });
    const p = this.pool.ghost || (this.pool.ghost = []); let i = p.findIndex(x => x.geometry === live.geometry && x.skeleton.bones.length === nb), g = i >= 0 ? p.splice(i, 1)[0] : null;
    if (!g) { const bones = body.bones.map(() => { const b = new THREE.Bone(); b.matrixAutoUpdate = false; b.matrixWorldAutoUpdate = false; return b; });
      g = new THREE.SkinnedMesh(live.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      g.bind(new THREE.Skeleton(bones, live.skeleton.boneInverses), live.bindMatrix); g.frustumCulled = false; g.matrixAutoUpdate = false; g.userData.kind = 'ghost'; }
    g.material.color.setHex(0xb8c8ff); g.visible = true; g.renderOrder = 3; e.items.push(g); e.g.add(g);
    return this._h(e, { replay: (d) => { replayAt = e.t + (d || 0.4); this._end(e, (d || 0.4) + 0.5); }, end: () => this._end(e, 0.3) });
  }

  // ================================================================== C2 공명 하프
  k_harp(c, o) {
    const at = P3(c), f = D3(o.facing || { x: 0, z: 1 }), r = _a.crossVectors(f, UP).normalize().clone(), R = o.r || 5, low = lite(); let near = false, strum = -9;
    const e = this._fx('harp', (o.life || 15) + 0.6, (e) => {
      const t = e.t, fk = this._fk(e), un = easeBack(clamp01(t / (o.unfold || 0.5))), y = at.y;
      hp.position.copy(at).addScaledVector(r, 0.3 * 1.4); this.orient(hp, f.clone().negate().addScaledVector(r, 0.4)); hp.scale.set(1.4, 1.4 * Math.max(0.15, un), 1.4); hp.material.uniforms.uA.value = fk; hp.material.uniforms.uGlow.value = 0.08 + (near ? 0.12 : 0);
      ss.forEach((m, i) => { const x = 0.12 + i * (0.44 / (ss.length - 1)), y0 = harpBot(x) * 1.4, y1 = harpTop(x) * 1.4, on = smooth(0, 0.08, t - (o.unfold || 0.5) - i * 0.05);
        m.position.copy(hp.position).addScaledVector(_b.set(1, 0, 0).applyQuaternion(hp.quaternion), x * 1.4).setY(y + y0); m.quaternion.identity(); m.scale.set(1, Math.max(0.001, (y1 - y0) * on), 1);
        const pl = Math.exp(-Math.max(0, t - strum - i * 0.04) * 10) * (t >= strum + i * 0.04 ? 1 : 0); m.material.uniforms.uGlow.value = 0.2 + (near ? 0.25 : 0) + 1.2 * pl; m.material.uniforms.uA.value = fk; });
      rg.position.set(at.x, y + 0.05, at.z); this._flat(rg, R, y + 0.05); rg.material.uniforms.uA.value = (near ? 0.55 : 0.28) * fk * smooth(0, 0.3, t);
    });
    const hp = this.inst(e, 'mu_harp', { spec: 1.0 }); hp && (hp.material.transparent = true);
    const ss = []; for (let i = 0; i < (low ? 5 : HARP_N); i++) { const m = this.inst(e, 'mu_string', {}); if (m) { m.material.transparent = true; ss.push(m); } }
    const rg = this.spr(e, 1, C.gold, C.goldB, 2);
    this.flashAt(at.clone().setY(at.y + 0.6), C.gold, C.goldB, 0.4, 0.15);
    return this._h(e, { near: (v) => { near = v; }, strum: () => { strum = e.t; }, end: () => this._end(e, 0.4) });
  }

  // ================================================================== C3 팬텀 트리오
  k_trio(s, o) {
    const enter = o.enter || 0.25, parts = ['mu_violin', 'mu_cello', 'mu_flute'], P = [0, 1, 2].map(i => ({ play: -9, b: null, i: null, arm: null })); let hurt = -9, regroup = -9, fade = -1;
    const e = this._fx('trio', 40, (e) => {
      const t = e.t, c = P3(s.pos), f = D3(s.facing), r = _a.crossVectors(f, UP).normalize().clone(), fk = fade >= 0 ? 1 - smooth(0, 0.5, t - fade) : 1;
      P.forEach((q, i) => { const a = i * 2.094 + 0.5, p = c.clone().addScaledVector(f, Math.cos(a) * 0.75).addScaledVector(r, Math.sin(a) * 0.75), inK = easeBack(clamp01((t - i * enter) / 0.3)), pl = Math.exp(-Math.max(0, t - q.play) * 6);
        const out = fade >= 0 ? 1 - smooth(i * 0.12, i * 0.12 + 0.35, t - fade) : 1, rg = Math.exp(-Math.max(0, t - regroup) * 4);
        q.b.position.copy(p).setY(p.y + 0.04 * Math.sin(t * 2.6 + i)); this.orient(q.b, f); q.b.scale.setScalar(0.95 * inK); q.b.material.uniforms.uA.value = 0.72 * out * (1 - 0.5 * Math.exp(-Math.max(0, t - hurt) * 10)) * (1 - 0.5 * rg); q.b.material.uniforms.uGlow.value = 0.1 + 0.5 * pl;
        const sh = p.clone().addScaledVector(f, 0.12).setY(p.y + 0.62 * 0.95);
        if (i === 0) { q.i.position.copy(sh).addScaledVector(r, -0.12).setY(sh.y + 0.1); this.orient(q.i, f.clone().addScaledVector(r, -0.6)); q.i.scale.setScalar(0.4 * inK); }
        else if (i === 1) { q.i.position.copy(p).addScaledVector(f, 0.35); this.orientY(q.i, UP.clone().addScaledVector(f, -0.2), f); q.i.scale.setScalar(0.62 * inK); }
        else { q.i.position.copy(sh).addScaledVector(r, -0.12).setY(sh.y + 0.18); this.orientX(q.i, r.clone().negate()); q.i.scale.setScalar(0.42 * inK); }
        q.i.material.uniforms.uA.value = 0.9 * out; q.i.material.uniforms.uGlow.value = 0.15 + 0.7 * pl;
        q.arm.position.copy(sh).addScaledVector(r, 0.16); q.arm.rotation.set(0, Math.atan2(f.x, f.z), 0); q.arm.rotateX(-0.6 - 0.9 * Math.sin(Math.min(1, pl) * 3.14) * (i === 2 ? 0.2 : 1)); q.arm.rotateZ(i === 0 ? 0.4 * Math.sin(t * 9) * pl : 0); q.arm.scale.setScalar(0.95 * inK); q.arm.material.uniforms.uA.value = 0.72 * out; });
      if (fade >= 0 && t - fade > 0.9) e.t = e.life;
    });
    for (const [i, q] of P.entries()) { q.b = this.inst(e, 'mu_player', { ghost: true, tint: [0xffe0f0, 0xe0e8ff, 0xe0fff0][i], rim: 0xd8c8ff, a: 0.7 }); q.i = this.inst(e, parts[i], { ghost: true, tint: 0xfff0c0, rim: 0xffe8a0, a: 0.9 }); q.arm = this.inst(e, 'mu_arm', { ghost: true, tint: 0xe8e0ff, a: 0.7 }); }
    this.notes(P3(s.pos).setY((s.pos.y || 0) + 0.8), lite() ? 2 : 4, { r: 0.6, size: 0.16, life: 0.8, tint: 0xe0d0ff });
    const from = (i) => { const c = P3(s.pos), f = D3(s.facing), r = _a.crossVectors(f, UP).normalize().clone(), a = i * 2.094 + 0.5; return c.addScaledVector(f, Math.cos(a) * 0.75 + 0.3).addScaledVector(r, Math.sin(a) * 0.75).setY(c.y + 0.7); };
    return this._h(e, {
      sync: () => { },
      play: (i, t, ok) => { P[i].play = e.t; const a = from(i), b = P3(t.pos).setY((t.pos.y || 0) + top(t) * 0.6);
        if (i === 0) this.beam(a, b, C.rose, C.roseB, 0.18, 0.08);
        else if (i === 1) { const g = P3(t.pos); g.y = groundY(t.pos.x, t.pos.z); this.shock(g, 0.9, C.violet, C.violetB, { a: 1.3, life: 0.3, w2: 0.06 }); }
        else { const m = a.clone().lerp(b, 0.5).setY(Math.max(a.y, b.y) + 0.6); this.beam(a, m, C.blue, C.blueB, 0.2, 0.08); this.beam(m, b, C.blue, C.blueB, 0.2, 0.08); }
        if (ok) this.flashAt(b, C.warm, C.violetB, 0.28, 0.08); },
      chord: (t, ok) => { for (let i = 0; i < 3; i++) { P[i].play = e.t; this.beam(from(i), P3(t.pos).setY((t.pos.y || 0) + top(t) * 0.6), C.violet, C.violetB, 0.26, 0.14); }
        if (ok) { const g = P3(t.pos); g.y = groundY(t.pos.x, t.pos.z); this.shock(g, 1.2, C.warm, C.violetB, { a: 1.6, life: 0.32 }); this.notes(g.clone().setY(g.y + 1.0), 3, { size: 0.16, life: 0.7, tint: 0xe0d0ff }); } },
      hurt: () => { hurt = e.t; }, regroup: () => { regroup = e.t; }, fade: () => { if (fade < 0) fade = e.t; }, dispose: () => this._free(e) });
  }
}
