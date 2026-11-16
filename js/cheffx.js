// 쉐프 2차 스킬 이펙트 (2026-11-16). 규칙은 js/chef.js, 메시는 tools/blender/fx_chef.py -> assets/fx/fx_chef.glb.json (+ 요리사 메시 fx_cook.glb.json의
// 식칼·꼬치·국자·조각 재사용). CookFx를 이어받아 풀·셰이더(정점 색 solid, 가산 spr: 0 원판 / 1 고리 / 2 베기 선 / 3 별 섬광, 알파 puff, 부채꼴 blend 5)를 그대로 씀.
// 원칙: 음식·도구는 제 색으로 또렷하게(빛은 테두리·타격에만), 소스는 낮은 바닥 효과, 김은 투명한 입자 몇 개, 흰 화면 섬광·강한 블룸 없음,
// 가장 밝은 순간 = 실제 피해 순간(js/chef.js가 부름), 고리·부채꼴은 실제 판정 반경 그대로. 매 프레임 메시·재질·텍스처를 만들지 않음(풀 재사용,
// 설탕 벽 판은 불러올 때 한 번 만든 지오메트리). 저사양(휴대폰·그래픽 효과 끔)은 장식(불티·김·조각 수)만 줄이고 웍 뒤집기·클로슈·탑 쌓기는 그대로.
// 종류(js/skillrt.js FX.chef(kind, a, o) / js/chef.js this.fx) — handle 메서드는 js/chef.js 의 call(...) 로 부름(없어도 안전):
//   wok(pc, {f, t1, t2, r1, ang1, r2, ang2})        웍이 손 앞에서 두 번 뒤집히고 재료가 포물선으로 떴다 받아짐. flame(k, hits) = 그 타의 불꽃 부채꼴
//   flambe(c, {from, f, r, splash, ignite})          소스 줄기 → 바닥 웅덩이 → 불씨 → 파란 불길이 테두리를 따라 → 주홍 불꽃. steam(p), burn(hits)
//   cooker(pos, {fuse, warn, r, sr})                 압력솥: 눈금이 오르고 뚜껑이 떨리고 김이 뿜어 나옴, 폭발 1초 전 바닥 경고. puff(), gauge(k), boom(n)
//   skewers(pc, {f, n, launch, gap})                 꼬치에 재료가 꿰이고 짧은 불에 구워짐. fire(i, p, dir) -> {set, pierce, end, dispose}
//   show(c, {f, prep, stir, cloche, wave})           반투명 조리대 + 엇갈리는 식칼(chop) → 거대한 웍(toss) → 금빛 클로슈(slam) + 낮은 불꽃 고리
//   sorbet(pc, {f, n, launch, gap})                  소르베가 부채꼴로 떠오름. fly(i) -> {set, hit(p, ok), vanish, dispose}
//   plating(c, {r, bloom, f})                        접시 테두리 → 서리 선 → 얼음꽃(bloom). shock(p), freeze(t)
//   mille(pc, {f})                                   밀푀유 원반: set(p, back), cut(p), turn(), catch(), drop(p)
//   sugar(pos, {f, w, life})                         캐러멜 선이 그려지고 굳어 설탕 벽. crack(frac), shatter()
//   tower(c, {form, layers, gap, r, rb})             슈가 나선으로 쌓이는 크로캉부슈 + 금빛 실 + 서리. frost(k), burst(i, n), ring(n)
//   broth(pos, {r, dur})                             구리 냄비·국자·김·바닥 범위 표시. pulse(t) = 회복 순간 허브 잎 물결, end()
//   bon(pc, {item, touch}) · touch(pc) · royal(pc, {times}) -> open(i), cancel() · menu(pc, {id, n}) (제작 완성 플레이팅)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CookFx, cookTop } from './cookfx.js';

export const CHEFFX = {
  intensity: 1.0,
  col: { fire: 0xff6a2a, fireB: 0xd8300a, ember: 0xffc060, amber: 0xffb040, amberB: 0xb86410, blue: 0x7ab8ff, blueB: 0x2a60e0, copper: 0xe08a50, gold: 0xffd27a, goldB: 0xd89a30,
         silver: 0xe8eef8, silverB: 0x9aa8c0, ice: 0xd8f0ff, iceB: 0x6ab0f0, cream: 0xfff4e0, herb: 0x8ad860, herbB: 0x3a8a28, steam: 0xfff8f0, steamB: 0xc8c0b8, sugar: 0xffc870, sugarB: 0xb87020 },
  fruit: [0xff8aa8, 0xffd060, 0x9ae070, 0xc8a0ff, 0xffa060],
  wok: { size: 0.42, y: 1.0, fwd: 0.55, food: 5, foodLite: 3, toss: 0.3, h: 0.9 },
  show: { counter: 1.6, wok: 1.25, cloche: 1.9, drop: 6.0 },
  tower: { tiers: [7, 5, 3, 1], h: 0.42, choux: 0.17, a: 0.85, rr: 0.55 },
  sugar: { h: 1.25, a: 0.5 },
};
const P3 = (p) => new THREE.Vector3(p.x, p.y || 0, -p.z);
const D3 = (f) => new THREE.Vector3(f.x, 0, -f.z).normalize();
const yawOf = (f) => Math.atan2(f.z, f.x);   // local +x -> game direction f (three rotation.y)
const lite = () => { const G = window.G; return !!(G && ((G.input && G.input.mobile) || (G.settings && G.settings.graphicsFx === false))); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
let _seed = 20261116; const rnd = (a, b) => { _seed = (_seed * 1664525 + 1013904223) >>> 0; return a + (_seed / 4294967296) * (b - a); };   // 이펙트 전용 난수 — 게임 Math.random(명중·치명)을 건드리지 않음
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _mx = new THREE.Matrix4();
const glbParse = async (url) => { const j = await (await fetch(url)).json(), raw = atob(j.b64), u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i); return new Promise((res, rej) => new GLTFLoader().parse(u8.buffer, '', res, rej)); };

export class ChefFx extends CookFx {
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const [a, b] = await Promise.all([glbParse('assets/fx/fx_chef.glb.json'), glbParse('assets/fx/fx_cook.glb.json')]);
      for (const g of [b, a]) g.scene.traverse(o => { if (o.isMesh) this.geo[o.name] = o.geometry; });
      this.chips = ['chef_food_a', 'chef_food_b', 'chef_food_c'].map(n => this.geo[n]).filter(Boolean);
      this.pane = new THREE.PlaneGeometry(1, 1); { const n = this.pane.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const top = this.pane.attributes.position.getY(i) > 0; c.set(top ? [1, 0.86, 0.55] : [0.95, 0.62, 0.25], i * 3); } this.pane.setAttribute('color', new THREE.BufferAttribute(c, 3)); }   // 설탕 벽 판(한 번만 만듦, 정점 색 = 호박색 사탕)
      this.ready = true;
    })().catch(e => console.warn('cheffx load', e));
    return this.loading;
  }
  _h(e, o = {}) { e.dispose = () => this._free(e); return Object.assign(e, o); }
  /** 수직 불꽃 혀: 세로로 늘인 가산 원판(빌보드) */
  flameTongue(e, order = 6) { return this.puff(e, CHEFFX.col.fireB, CHEFFX.col.ember, order); }   // 알파 혼합(밝은 바닥에서도 읽힘): 아래 노랑 -> 위 주홍
  flash(at, s, w, b, life = 0.14, a = 1.2) {
    const e = this._fx('flash', life, (e) => { const k = e.t / life; m.quaternion.copy(this.camQ); m.scale.setScalar(s * (0.6 + 0.6 * easeOut(k))); m.material.uniforms.uA.value = CHEFFX.intensity * a * (1 - smooth(0.1, 1, k)); });
    e.g.position.copy(at); const m = this.spr(e, 3, w, b, 7); return e;
  }
  ring(at, r, w, b, life = 0.3, a = 1.4, from = 0.4) {
    const e = this._fx('ring', life, (e) => { const k = e.t / life; this._flat(m, r * (from + (1 - from) * easeOut(k)), 0.06); m.material.uniforms.uA.value = CHEFFX.intensity * a * (1 - smooth(0.3, 1, k)); });
    e.g.position.copy(at); const m = this.spr(e, 1, w, b, 3); m.material.uniforms.uP.value = 0.6; return e;
  }
  steamPuffs(at, n, r, a = 0.4) { this._puffs(at, lite() ? Math.ceil(n / 2) : n, r, { c1: CHEFFX.col.steam, c2: CHEFFX.col.steamB, a, life: 0.6, rise: 0.8 }); }
  embers(at, n, gy) { if (this.geo.cook_drop) this._bits(at, lite() ? Math.ceil(n / 2) : n, { geo: this.geo.cook_drop, tint: 0xffa040, size: [0.025, 0.045], speed: [0.8, 2.0], up: [1.6, 3.0], ground: gy ?? at.y - 1, life: 0.5 }); }
  /** 손 위치(three) — 없으면 몸 앞 */
  hand(pc, f, fwd = 0.5, y = 1.0) { let h = null; try { h = pc.body && pc.body.handPoint && pc.body.handPoint(); } catch (e) { h = null; } return h ? new THREE.Vector3(h.x, h.y, h.z) : P3({ x: pc.pos.x + f.x * fwd, y: (pc.pos.y || 0) + y, z: pc.pos.z + f.z * fwd }); }

  // ================================================================== A1 인페르노 웍
  wok(pc, o = {}) {
    if (!this._ok() || !this.geo.chef_wok) return null;
    const K = CHEFFX.wok, f = o.f || { x: 0, z: 1 }, d3 = D3(f), flips = [o.t1 || 0.22, o.t2 || 0.5], low = lite(), I = CHEFFX.intensity;
    const life = flips[1] + 0.55, foods = [];
    const e = this._fx('wok', life, (e) => {
      const base = this.hand(pc, f, K.fwd, K.y).addScaledVector(d3, 0.32); base.y = Math.max(base.y - 0.1, (pc.pos.y || 0) + 0.75);
      // 뒤집기: 손목·팔꿈치가 움직이는 동안 웍이 앞으로 기울었다 위로 튕김(타격 = 재료가 떨어지는 순간)
      let tilt = 0, lift = 0; for (const T of flips) { const u = (e.t - (T - K.toss)) / (K.toss + 0.12); if (u > 0 && u < 1) { tilt += Math.sin(u * Math.PI) * (u < 0.45 ? 0.5 : -0.25); lift += Math.sin(u * Math.PI) * 0.12; } }
      w.position.copy(base).setY(base.y + lift); w.rotation.set(0, yawOf(f) + Math.PI, tilt, 'YXZ');
      const a = smooth(0, 0.08, e.t) * (1 - smooth(life - 0.15, life, e.t)); w.scale.setScalar(K.size * (0.7 + 0.3 * easeOut(e.t / 0.1))); w.material.uniforms.uA.value = a;
      // 재료: 웍 안에서 위로 포물선 -> 다음 타격 순간 웍에 다시 떨어짐(웍을 뚫고 지나가지 않음 — 바닥 높이 = 웍 안쪽)
      for (const p of foods) {
        let y = 0.06, u = -1; for (const T of flips) { const s = (e.t - (T - K.toss)) / K.toss; if (s >= 0 && s <= 1) u = s; }
        if (u >= 0) y = 0.06 + 4 * K.h * u * (1 - u) * p.h;
        p.m.position.copy(w.position).addScaledVector(d3, p.dx * K.size).add(_a.set(-d3.z, 0, d3.x).multiplyScalar(p.dz * K.size)); p.m.position.y = w.position.y + y * (0.9 + 0.2 * p.h);
        p.m.rotation.set(p.r0 + e.t * p.w, p.r0 * 2 + e.t * p.w * 0.6, 0); p.m.material.uniforms.uA.value = a;
      }
      gl.quaternion.copy(this.camQ); gl.position.copy(w.position).setY(w.position.y + 0.1); gl.scale.setScalar(0.9); gl.material.uniforms.uA.value = I * 0.35 * a * (0.7 + 0.3 * Math.sin(e.t * 20));
    });
    const w = this.solid(e, this.geo.chef_wok, { rim: 0xffb070, spec: 0.9 }), gl = this.spr(e, 0, CHEFFX.col.ember, CHEFFX.col.fire, 2);
    w.renderOrder = 5;
    for (let i = 0; i < (low ? K.foodLite : K.food); i++) { const m = this.solid(e, this.chips[i % this.chips.length], { spec: 0.4 }); m.scale.setScalar(0.09); m.renderOrder = 6; foods.push({ m, h: rnd(0.7, 1.15), dx: rnd(-0.3, 0.35), dz: rnd(-0.35, 0.35), r0: rnd(0, 6), w: rnd(-12, 12) }); }
    return this._h(e, { flame: (k, hits) => {
      const r = k ? o.r2 : o.r1, ang = k ? o.ang2 : o.ang1, g0 = P3(pc.pos), life2 = 0.36;
      const fx = this._fx('wokfan', life2, (x) => { const q = x.t / life2; fn.material.uniforms.uP.value = 0.25 + 0.85 * easeOut(q * 1.6); fn.material.uniforms.uA.value = I * (k ? 1.0 : 0.85) * (1 - smooth(0.45, 1, q));
        for (const t of tg) { t.m.quaternion.copy(this.camQ); t.m.position.y = t.y0 + q * 0.6; t.m.scale.set(t.s * 0.45, t.s * (1 + q), 1); t.m.material.uniforms.uA.value = I * 1.2 * smooth(0, 0.15, q) * (1 - smooth(0.4, 1, q)); } });
      fx.g.position.copy(g0); const fn = this.blend(fx, 5, this.fan(ang), CHEFFX.col.ember, CHEFFX.col.fire, 3); fn.position.y = 0.6; fn.rotation.set(0, yawOf(f), 0); fn.scale.set(r, 1, r);
      const tg = []; const n = low ? 3 : 6, h = ang * Math.PI / 360;
      for (let i = 0; i < n; i++) { const aa = -h + 2 * h * (i + 0.5) / n, rr = r * rnd(0.45, 0.9), m = this.flameTongue(fx); const dx = Math.cos(aa) * rr, dz = Math.sin(aa) * rr; m.position.set(d3.x * dx - d3.z * dz, 0.5, d3.z * dx + d3.x * dz); tg.push({ m, y0: 0.5, s: rnd(0.5, 0.8) * (k ? 1.2 : 1) }); }
      this.flash(w.position.clone(), k ? 0.9 : 0.6, 0xffffff, CHEFFX.col.fire);
      this.embers(w.position.clone(), k ? 7 : 4, g0.y);
      for (const p of hits || []) this.flash(P3({ x: p.x, y: (p.y || 0) + 0.9, z: p.z }), 0.55, CHEFFX.col.ember, CHEFFX.col.fire, 0.12, 1.0);
    } });
  }

  // ================================================================== A2 그랑 플람베
  flambe(c, o = {}) {
    if (!this._ok()) return null;
    const I = CHEFFX.intensity, C = CHEFFX.col, g0 = P3(c), r = o.r || 2.6, from = P3(o.from || c).setY((o.from ? o.from.y || 0 : 0) + 1.1), sp = o.splash || 0.24, ig = o.ignite || 0.7, low = lite();
    const life = ig + 0.9, tongues = [];
    const e = this._fx('flambe', life, (e) => {
      // 소스 줄기: 손에서 조준점으로 포물선(누른 순간 ~ splash)
      const u = clamp01(e.t / sp); blob.position.lerpVectors(from, g0, u); blob.position.y += Math.sin(u * Math.PI) * 1.0; blob.quaternion.copy(this.camQ); blob.scale.setScalar(0.6); blob.material.uniforms.uA.value = e.t < sp ? 0.95 : 0;
      // 바닥 웅덩이: 낮고 반투명한 호박색 원판(테두리 쪽 진함)
      const pk = smooth(sp, sp + 0.12, e.t); this._flat(pool, r * (0.4 + 0.6 * easeOut((e.t - sp) / 0.15))); pool.position.y = 0.09; pool.material.uniforms.uA.value = 1.6 * pk * (1 - smooth(life - 0.4, life, e.t));
      // 불씨: 점화 0.15초 전 손에서 웅덩이로
      const eu = clamp01((e.t - (ig - 0.15)) / 0.15); em.visible = eu > 0 && eu < 1; em.position.lerpVectors(from, g0, eu); em.position.y += Math.sin(eu * Math.PI) * 0.6; em.quaternion.copy(this.camQ); em.scale.setScalar(0.3); em.material.uniforms.uA.value = I * 1.4;
      // 파란 불길이 소스를 따라 테두리로 번짐(0.12초) -> 주홍 불꽃
      const bu = (e.t - ig) / 0.14; this._flat(blue, r * (0.2 + 0.8 * easeOut(bu))); blue.position.y = 0.07; blue.material.uniforms.uA.value = bu > 0 ? I * 1.6 * (1 - smooth(0.6, 2.2, bu)) : 0;
      for (const t of tongues) { const q = (e.t - ig - t.d) / 0.55; t.m.visible = q > 0 && q < 1; if (!t.m.visible) continue; t.m.quaternion.copy(this.camQ); t.m.position.y = 0.35 + q * 0.7; t.m.scale.set(t.s * 0.5, t.s * (1.1 + 0.6 * Math.sin(q * 3.1)), 1); t.m.material.uniforms.uA.value = I * 1.25 * smooth(0, 0.12, q) * (1 - smooth(0.5, 1, q)); }
    });
    e.g.position.copy(g0); from.sub(g0); g0.set(0, 0, 0);   // 그룹 기준 좌표
    const blob = this.puff(e, 0xffa030, 0xa04a10, 5), pool = this.puff(e, 0xe08020, 0x8a3a08, 2), em = this.spr(e, 0, 0xffffff, C.ember, 7), blue = this.spr(e, 1, C.blue, C.blueB, 3);
    blue.material.uniforms.uP.value = 1;
    const n = low ? 6 : 11; for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), rr = r * Math.sqrt(rnd(0.05, 0.85)), m = this.flameTongue(e); m.position.set(Math.cos(a) * rr, 0.3, Math.sin(a) * rr); tongues.push({ m, d: (rr / r) * 0.14, s: rnd(0.55, 0.95) }); }
    const at = e.g.position.clone();
    return this._h(e, {
      steam: (p) => { const q = P3({ x: p.x, y: (p.y || 0) + 0.8, z: p.z }); this.flash(q, 0.9, 0xffffff, C.steamB, 0.16, 1.0); this.steamPuffs(q, 5, 0.9, 0.5); this.ring(P3(p), Math.min(1.4, (p.r || 0.5) + 0.7), C.steam, C.steamB, 0.3, 1.0); },
      burn: (hits) => { this.embers(at.clone().setY(at.y + 0.4), 8, at.y); for (const p of hits) this.flash(P3({ x: p.x, y: (p.y || 0) + 0.7, z: p.z }), 0.5, C.ember, C.fire, 0.12, 0.9); },
    });
  }

  // ================================================================== A3 시그니처 압력솥
  cooker(pos, o = {}) {
    if (!this._ok() || !this.geo.chef_cooker) return null;
    const C = CHEFFX.col, I = CHEFFX.intensity, g0 = P3(pos), fuse = o.fuse || 2.2, warnAt = fuse - (o.warn || 1), r = o.r || 2.8; let gauge = 0, puffT = 0;
    const e = this._fx('cooker', 1e9, (e, dt) => {
      const shake = gauge > 0.5 ? (gauge - 0.5) * 2 : 0;
      body.scale.setScalar(0.85 * (0.4 + 0.6 * easeOut(e.t / 0.15))); body.position.set(Math.sin(e.t * 47) * 0.012 * shake, 0, 0); body.material.uniforms.uGlow.value = 0.18 * shake * (0.5 + 0.5 * Math.sin(e.t * 30));
      lid.scale.copy(body.scale); lid.position.set(body.position.x, 0.62 * body.scale.y + Math.abs(Math.sin(e.t * 38)) * 0.05 * shake, 0); lid.rotation.set(Math.sin(e.t * 41) * 0.08 * shake, 0, Math.sin(e.t * 33) * 0.08 * shake);
      // 바닥 경고: 폭발 1초 전부터 실제 반경 r의 얇은 고리가 깜빡이며 차오름
      const w = smooth(warnAt, warnAt + 0.2, e.t); this._flat(wr, r); wr.material.uniforms.uA.value = I * w * (0.55 + 0.45 * Math.sin(e.t * 18)); wr.material.uniforms.uP.value = 0.3 + 0.7 * clamp01((e.t - warnAt) / (fuse - warnAt));
      this._flat(sr, o.sr || 2.4); sr.material.uniforms.uA.value = 0.18 * smooth(0, 0.3, e.t);
      puffT -= dt; if (puffT <= 0 && e.t > 0.2) { puffT = 0.5 - 0.3 * gauge; const top = g0.clone().setY(g0.y + 0.9); this._puffs(top, lite() ? 1 : 2, 0.5, { c1: C.steam, c2: C.steamB, a: 0.35 + 0.2 * gauge, life: 0.6, rise: 1.0 }); }
    });
    e.g.position.copy(g0);
    const body = this.solid(e, this.geo.chef_cooker, { rim: 0xffc090, spec: 0.8 }), lid = this.solid(e, this.geo.chef_cooker_lid, { rim: 0xffffff, spec: 1.0 });
    const wr = this.spr(e, 1, 0xfff0d0, C.fire, 3), sr = this.spr(e, 1, C.steam, C.steamB, 2);
    let boomed = false;
    return this._h(e, {
      puff: () => {}, gauge: (k) => { gauge = k; },
      boom: () => {
        boomed = true; const at = g0.clone().setY(g0.y + 0.6), lidFrom = lid.getWorldPosition(new THREE.Vector3()), dir = new THREE.Vector3(rnd(-0.4, 0.4), 1, rnd(-0.4, 0.4)).normalize();
        const b = this._fx('cookerboom', 0.8, (x) => { const k = x.t / 0.8; ld.position.copy(lidFrom).addScaledVector(dir, 5.5 * x.t).setY(lidFrom.y + 6 * x.t - 9 * x.t * x.t); ld.rotation.set(x.t * 14, x.t * 9, 0); ld.material.uniforms.uA.value = 1 - smooth(0.6, 1, k); });
        const ld = this.solid(b, this.geo.chef_cooker_lid, { rim: 0xffffff, spec: 1 }); ld.scale.setScalar(0.85);   // 날아가는 뚜껑: 장식(판정 없음)
        this.flash(at, 1.6, 0xffffff, C.fire, 0.16, 1.3); this.ring(g0, r, 0xfff0d0, C.fire, 0.32, 1.6); this.steamPuffs(at, 7, r * 0.6, 0.45); this.embers(at, 10, g0.y);
      },
      dispose: () => { if (!boomed) this.steamPuffs(g0.clone().setY(g0.y + 0.4), 2, 0.4, 0.3); this._free(e); },
    });
  }

  // ================================================================== A4 브로셰트 러시
  skewers(pc, o = {}) {
    if (!this._ok() || !this.geo.cook_skewer) return null;
    const f = o.f || { x: 0, z: 1 }, d3 = D3(f), n = o.n || 4, launch = o.launch || 0.26, gap = o.gap || 0.11, side = new THREE.Vector3(-d3.z, 0, d3.x), C = CHEFFX.col, I = CHEFFX.intensity;
    const held = [];
    const e = this._fx('skewers', launch + n * gap + 0.2, (e) => {
      const base = P3(pc.pos);
      for (const h of held) {
        if (h.gone) { h.m.visible = false; continue; }
        const k = (h.i - (n - 1) / 2), a = smooth(0, 0.12, e.t - h.i * 0.03);
        h.m.position.copy(base).addScaledVector(side, k * 0.42).addScaledVector(d3, 0.2).setY(base.y + 1.55 + Math.abs(k) * 0.08); h.m.quaternion.setFromUnitVectors(_a.set(1, 0, 0), d3);
        h.m.scale.setScalar(1.7 * (0.4 + 0.6 * a)); h.m.material.uniforms.uA.value = a; h.m.material.uniforms.uGlow.value = 0.25 * smooth(launch - 0.15, launch, e.t);
        h.f.quaternion.copy(this.camQ); h.f.position.copy(h.m.position).addScaledVector(d3, 0.55).setY(h.m.position.y - 0.15); h.f.scale.set(0.35, 0.6, 1); h.f.material.uniforms.uA.value = I * 0.9 * smooth(launch - 0.2, launch - 0.08, e.t) * (0.7 + 0.3 * Math.sin(e.t * 30 + h.i));
      }
    });
    for (let i = 0; i < n; i++) held.push({ i, m: this.solid(e, this.geo.cook_skewer, { rim: 0xffd0a0, spec: 0.6 }), f: this.flameTongue(e), gone: false });
    return this._h(e, { fire: (i, p, dir) => {
      const h = held[i]; if (h) h.gone = true;
      const dd = D3(dir), x = this._fx('skewer', 3, (x) => { m.quaternion.setFromUnitVectors(_a.set(1, 0, 0), dd); tr.quaternion.copy(this.camQ); tr.position.copy(m.position).addScaledVector(dd, -0.3); tr.scale.set(0.9, 0.3, 1); tr.material.uniforms.uA.value = I * 0.7; });
      const m = this.solid(x, this.geo.cook_skewer, { rim: 0xffd0a0, spec: 0.6 }), tr = this.spr(x, 2, C.ember, C.fire, 3); m.scale.setScalar(1.7); m.material.uniforms.uGlow.value = 0.2;
      m.position.copy(P3(p)).addScaledVector(dd, -0.55);
      this._alignLine(tr, dd);
      return { set: (q) => { m.position.copy(P3(q)).addScaledVector(dd, -0.55); }, pierce: (q) => { const at = P3(q); this.flash(at, 0.6, 0xffffff, C.fire, 0.1, 1.1); if (this.chips.length) this._bits(at, lite() ? 1 : 3, { size: [0.05, 0.08], speed: [1, 2], up: [1.2, 2.2], ground: at.y - 0.9, life: 0.4 }); },
        end: (q) => { x.life = Math.min(x.life, x.t + 0.12); }, dispose: () => this._free(x) };
    } });
  }

  // ================================================================== A5 마스터 셰프 쇼타임
  show(c, o = {}) {
    if (!this._ok() || !this.geo.chef_cloche) return null;
    const K = CHEFFX.show, C = CHEFFX.col, I = CHEFFX.intensity, f = o.f || { x: 0, z: 1 }, g0 = P3(c), pr = o.prep, st = o.stir, cl = o.cloche, life = cl.t + 0.6, foods = [];
    const prepEnd = pr.t + pr.n * pr.gap + 0.05, stirEnd = st.t + st.n * st.gap + 0.15;
    let chopT = -9, tossT = -9;
    const e = this._fx('show', life, (e) => {
      // ① 반투명 조리대(은쟁반을 넓게) + 엇갈리는 식칼 두 자루 — 손질 단계에만
      const a1 = smooth(0, 0.1, e.t) * (1 - smooth(prepEnd, prepEnd + 0.15, e.t)); board.scale.set(K.counter, 1, K.counter); board.position.y = 0.05; board.material.uniforms.uA.value = 0.45 * a1;
      const cu = clamp01((e.t - chopT) / 0.12);
      for (let i = 0; i < 2; i++) { const kn = knives[i], s = i ? 1 : -1; kn.position.set(s * 0.35 * (1 - cu), 1.0 + 0.6 * (1 - Math.sin(cu * Math.PI)), 0); kn.rotation.set(0, Math.PI / 2, s * (0.9 - 1.6 * Math.sin(cu * Math.PI))); kn.scale.setScalar(1.3); kn.material.uniforms.uA.value = a1; }
      // ② 거대한 웍: 볶음 단계에만, 재료가 불과 함께 떠오름
      const a2 = smooth(prepEnd - 0.1, prepEnd + 0.05, e.t) * (1 - smooth(stirEnd, stirEnd + 0.15, e.t)), tu = clamp01((e.t - tossT) / 0.32);
      wk.scale.setScalar(K.wok * (0.6 + 0.4 * a2)); wk.position.y = 0.25 + 0.15 * Math.sin(tu * Math.PI); wk.rotation.set(0, yawOf(f), -0.25 * Math.sin(tu * Math.PI)); wk.material.uniforms.uA.value = a2;
      for (const p of foods) { const y = 0.4 + 2.2 * p.h * 4 * tu * (1 - tu); p.m.position.set(p.x, y, p.z); p.m.rotation.set(e.t * p.w, e.t * p.w * 0.7, 0); p.m.material.uniforms.uA.value = a2; }
      // ③ 금빛 클로슈: 하늘에서 내려와 cl.t에 바닥을 덮음
      const d = clamp01((e.t - (cl.t - 0.35)) / 0.35), after = e.t - cl.t;
      cloche.visible = e.t > cl.t - 0.4; cloche.scale.setScalar(K.cloche * (after > 0 ? 1 + 0.08 * Math.max(0, 1 - after / 0.1) : 1)); cloche.position.y = after > 0 ? Math.max(0, after - 0.25) * 3 : K.drop * (1 - d * d);
      cloche.material.uniforms.uA.value = (after > 0 ? 1 - smooth(0.25, 0.55, after) : smooth(0, 0.1, d)) * 0.95; cloche.material.uniforms.uGlow.value = after > 0 ? 0.4 * Math.max(0, 1 - after / 0.2) : 0.08;
      sh.visible = cloche.visible; this._flat(sh, K.cloche * 1.05 * (0.4 + 0.6 * d)); sh.position.y = 0.04; sh.material.uniforms.uA.value = after > 0 ? 0 : 0.7 * d;
    });
    e.g.position.copy(g0);
    const board = this.solid(e, this.geo.chef_tray, { tint: 0xd8e4f4, rim: 0xffffff, spec: 0.8 }), knives = [0, 1].map(() => this.solid(e, this.geo.cook_knife, { rim: 0xc8e0ff, spec: 1.3 }));
    const wk = this.solid(e, this.geo.chef_wok, { rim: 0xffb070, spec: 0.9 }), cloche = this.solid(e, this.geo.chef_cloche, { tint: 0xffb22a, rim: 0xffe090, spec: 1.6 }), sh = this.puff(e, 0x402010, 0x201008, 1);
    board.renderOrder = 1; cloche.renderOrder = 7;
    for (let i = 0; i < (lite() ? 4 : 7); i++) { const m = this.solid(e, this.chips[i % this.chips.length], { spec: 0.4 }); m.scale.setScalar(0.18); foods.push({ m, h: rnd(0.6, 1.1), x: rnd(-0.6, 0.6), z: rnd(-0.6, 0.6), w: rnd(-10, 10) }); }
    return this._h(e, {
      chop: (k, n) => { chopT = e.t; const at = g0.clone().setY(g0.y + 0.9); const lf = this._fx('chopline', 0.16, (x) => { const q = x.t / 0.16; ln.material.uniforms.uA.value = I * 2 * (1 - q); ln.scale.set(2.4 * (0.7 + 0.5 * q), 0.5, 1); });
        const ln = this.spr(lf, 2, 0xffffff, 0x9ad0ff, 7); lf.g.position.copy(at); this._alignLine(ln, _c.set(Math.cos(k * 1.3), 0, Math.sin(k * 1.3))); if (n) this._bits(at, lite() ? 2 : 4, { size: [0.08, 0.12], ground: g0.y, life: 0.45 }); },
      toss: (k, n) => { tossT = e.t; for (let i = 0; i < (lite() ? 4 : 8); i++) { const a = i / 8 * Math.PI * 2, rr = rnd(0.6, 1.8); const m = this.flameTongue(this._fx('showflame', 0.5, (x) => { const q = x.t / 0.5; m.quaternion.copy(this.camQ); m.position.set(g0.x + Math.cos(a) * rr, g0.y + 0.4 + q * 1.2, g0.z + Math.sin(a) * rr); m.scale.set(0.45, 0.9 + q, 1); m.material.uniforms.uA.value = I * 1.2 * (1 - smooth(0.4, 1, q)); })); } },
      slam: (n) => { this.flash(g0.clone().setY(g0.y + 0.4), 2.2, 0xfff4d0, C.gold, 0.16, 1.2); this.ring(g0, cl.r, 0xfff0c0, C.gold, 0.3, 1.8, 0.6); this.ring(g0, (o.wave && o.wave.r) || 6, C.ember, C.fire, 0.45, 1.5, 0.5); this.steamPuffs(g0.clone().setY(g0.y + 0.2), 8, cl.r * 0.8, 0.4); this.embers(g0.clone().setY(g0.y + 0.3), 10, g0.y); },
    });
  }

  // ================================================================== B1 소르베 퀸텟
  sorbet(pc, o = {}) {
    if (!this._ok() || !this.geo.chef_sorbet) return null;
    const f = o.f || { x: 0, z: 1 }, d3 = D3(f), side = new THREE.Vector3(-d3.z, 0, d3.x), n = o.n || 5, launch = o.launch || 0.24, gap = o.gap || 0.09, C = CHEFFX.col, I = CHEFFX.intensity;
    const fan = [];
    const e = this._fx('sorbetfan', launch + n * gap + 0.1, (e) => {
      const base = P3(pc.pos);
      for (const s of fan) { if (s.gone) { s.m.visible = false; s.gl.visible = false; continue; }
        const k = (s.i - (n - 1) / 2) / ((n - 1) / 2 || 1), a = easeOut((e.t - s.i * 0.03) / 0.16);
        s.m.position.copy(base).addScaledVector(side, k * 0.9 * a).addScaledVector(d3, -0.2).setY(base.y + 1.2 + 0.5 * a + 0.25 * (1 - k * k)); s.m.scale.setScalar(0.17 * a); s.m.rotation.y = e.t * 2; s.m.material.uniforms.uA.value = a;
        s.gl.quaternion.copy(this.camQ); s.gl.position.copy(s.m.position); s.gl.scale.setScalar(0.5 * a); s.gl.material.uniforms.uA.value = I * 0.25 * a; }
    });
    for (let i = 0; i < n; i++) fan.push({ i, m: this.solid(e, this.geo.chef_sorbet, { tint: CHEFFX.fruit[i % 5], rim: 0xffffff, spec: 0.5 }), gl: this.spr(e, 0, C.ice, CHEFFX.fruit[i % 5], 3), gone: false });
    return this._h(e, { fly: (i) => {
      if (fan[i]) fan[i].gone = true; const col = CHEFFX.fruit[i % 5], trail = [];
      const x = this._fx('sorbet', 3, (x) => { m.rotation.set(x.t * 7, x.t * 5, 0);
        for (let j = 0; j < trail.length; j++) { const t = trail[j]; t.quaternion.copy(this.camQ); t.position.lerp(m.position, 0.35 + j * 0.15); t.scale.setScalar(0.22 - j * 0.05); t.material.uniforms.uA.value = 0.35 - j * 0.1; } });
      const m = this.solid(x, this.geo.chef_sorbet, { tint: col, rim: 0xffffff, spec: 0.5 }); m.scale.setScalar(0.17);
      for (let j = 0; j < (lite() ? 1 : 3); j++) trail.push(this.puff(x, C.ice, col, 3));
      return { set: (p) => { m.position.copy(P3(p)); }, hit: (p, ok) => { const at = P3(p); if (ok) { this.flash(at, 0.6, 0xffffff, col, 0.12, 1.0); this.ring(P3({ x: p.x, y: (p.y || 0) - 0.85, z: p.z }), 0.7, C.ice, C.iceB, 0.25, 0.9); }
          this._bits(at, lite() ? 2 : 4, { geo: this.geo.chef_shard, tint: col, size: [0.05, 0.09], speed: [1, 2.2], up: [1, 2], ground: at.y - 0.9, life: 0.4 }); this._free(x); },
        vanish: () => { this._puffs(m.position.clone(), 1, 0.2, { c1: C.ice, c2: col, a: 0.4, life: 0.3 }); this._free(x); }, dispose: () => this._free(x) };
    } });
  }

  // ================================================================== B2 프로즌 플레이팅
  plating(c, o = {}) {
    if (!this._ok()) return null;
    const C = CHEFFX.col, I = CHEFFX.intensity, g0 = P3(c), r = o.r || 2.6, bl = o.bloom || 0.6, life = bl + 0.9, lines = [], flowers = [];
    const e = this._fx('plating', life, (e) => {
      const a = smooth(0, 0.12, e.t) * (1 - smooth(life - 0.3, life, e.t));
      this._flat(rim, r * (0.92 + 0.08 * easeOut(e.t / 0.2))); rim.material.uniforms.uA.value = I * 0.9 * a; this._flat(rim2, r * 0.72); rim2.material.uniforms.uA.value = I * 0.5 * a;
      for (const l of lines) { const q = clamp01((e.t - l.d) / (bl - l.d)); l.m.scale.set(r * 0.95 * q, 0.35, 1); l.m.position.set(l.dx * r * 0.475 * q, 0.06, l.dz * r * 0.475 * q); l.m.material.uniforms.uA.value = I * 1.3 * a * (q > 0 ? 1 : 0); }
      for (const fl of flowers) { const q = (e.t - bl - fl.d) / 0.2; fl.m.visible = q > 0; if (q <= 0) continue; fl.m.scale.setScalar(fl.s * easeOut(q)); fl.m.material.uniforms.uA.value = 0.85 * (1 - smooth(life - 0.35, life, e.t)); }
    });
    e.g.position.copy(g0);
    const rim = this.spr(e, 1, C.silver, C.iceB, 3), rim2 = this.spr(e, 1, C.ice, C.iceB, 3); rim.material.uniforms.uP.value = 0.5;
    for (let i = 0; i < 6; i++) { const ang = i * Math.PI / 3 + 0.3, m = this.spr(e, 2, 0xffffff, C.iceB, 4); m.rotation.set(-Math.PI / 2, 0, ang); lines.push({ m, dx: Math.cos(ang), dz: -Math.sin(ang), d: i * 0.03 }); }
    if (this.geo.chef_shard) { const rings = lite() ? [[0, 1], [0.45, 5]] : [[0, 1], [0.35, 6], [0.7, 10]];
      for (const [rr, cnt] of rings) for (let j = 0; j < cnt; j++) { const a = j / cnt * Math.PI * 2 + rr, m = this.solid(e, this.geo.chef_shard, { tint: 0xd8f0ff, rim: 0xffffff, spec: 1.2 }); m.position.set(Math.cos(a) * rr * r, 0.05, Math.sin(a) * rr * r); m.rotation.set(rnd(-0.3, 0.3), a, rnd(-0.4, 0.4)); m.visible = false; flowers.push({ m, d: rr * 0.25, s: 0.85 - rr * 0.3 }); } }
    return this._h(e, {
      bloom: (n) => { this.flash(g0.clone().setY(g0.y + 0.3), 1.2, 0xffffff, C.iceB, 0.14, 1.0); this.ring(g0, r, 0xffffff, C.iceB, 0.3, 1.4, 0.2); this._puffs(g0.clone().setY(g0.y + 0.1), lite() ? 2 : 5, r * 0.7, { c1: 0xf4fbff, c2: C.iceB, a: 0.3, life: 0.6, rise: 0.15 }); },
      shock: (p) => { const at = P3({ x: p.x, y: (p.y || 0) + 0.8, z: p.z }); this.flash(at, 1.0, 0xffffff, C.fire, 0.14, 1.1); this.steamPuffs(at, 5, 0.8, 0.5); },
      freeze: (t) => { const at = P3(t.pos); if (this.geo.chef_shard) this._bits(at.clone().setY(at.y + 0.3), lite() ? 3 : 6, { geo: this.geo.chef_shard, tint: 0xd8f0ff, size: [0.12, 0.2], speed: [0.2, 0.6], up: [0.4, 1.0], ground: at.y, life: 1.2 }); this.ring(at, (t.radius || 0.5) + 0.4, 0xffffff, C.iceB, 0.5, 1.2, 0.8); },
    });
  }

  // ================================================================== B3 밀푀유 블레이드
  mille(pc, o = {}) {
    if (!this._ok() || !this.geo.chef_mille) return null;
    const C = CHEFFX.col, I = CHEFFX.intensity; let back = false, sep = 0;
    const e = this._fx('mille', 4, (e, dt) => {
      sep += ((back ? 0 : 1) - sep) * Math.min(1, dt * 8);   // 날아가는 동안 층이 벌어지고 돌아오며 다시 겹침
      d.rotation.y += dt * 22; d.scale.set(0.42, 0.42 * (1 + 1.2 * sep), 0.42); d.material.uniforms.uA.value = smooth(0, 0.06, e.t);
      gl.quaternion.copy(this.camQ); gl.scale.setScalar(0.9); gl.material.uniforms.uA.value = I * 0.35;
      tr.quaternion.copy(this.camQ); tr.scale.setScalar(0.7); tr.material.uniforms.uA.value = 0.3;
    });
    const d = this.solid(e, this.geo.chef_mille, { rim: 0xfff0d0, spec: 0.7 }), gl = this.spr(e, 0, C.cream, C.gold, 3), tr = this.puff(e, C.ice, C.iceB, 2);
    let last = null;
    return this._h(e, {
      set: (p, b) => { const n = P3(p); if (last) tr.position.copy(last).sub(n).multiplyScalar(4); last = n.clone(); e.g.position.copy(n); back = !!b; },
      cut: (p) => { const at = P3(p); this.flash(at, 0.6, 0xffffff, C.gold, 0.1, 1.0); this._bits(at, lite() ? 2 : 4, { geo: this.geo.chef_shard, tint: 0xffe0a0, size: [0.04, 0.07], speed: [1, 2], up: [1, 2], ground: at.y - 0.9, life: 0.4 }); },
      turn: () => { this.flash(e.g.position.clone(), 0.5, C.cream, C.gold, 0.1, 0.8); },
      catch: () => { this.flash(e.g.position.clone(), 0.5, 0xffffff, C.gold, 0.1, 0.9); this._free(e); },
      drop: () => { const at = e.g.position.clone(); this._puffs(at, 3, 0.4, { c1: C.cream, c2: C.gold, a: 0.4, life: 0.4 }); this._bits(at, 5, { geo: this.geo.chef_shard, tint: 0xffe0a0, size: [0.05, 0.08], ground: at.y - 1, life: 0.6 }); this._free(e); },
    });
  }

  // ================================================================== B4 슈가 아라베스크
  sugar(pos, o = {}) {
    if (!this._ok() || !this.geo.chef_curl) return null;
    const K = CHEFFX.sugar, C = CHEFFX.col, I = CHEFFX.intensity, g0 = P3(pos), f = o.f || { x: 0, z: 1 }, w = o.w || 3.6, nC = Math.max(3, Math.round(w / 0.6)), curls = []; let crack = 0;
    const e = this._fx('sugar', 1e9, (e) => {
      const draw = clamp01(e.t / 0.4), set = smooth(0.3, 0.55, e.t);
      for (const c of curls) { const q = clamp01((draw * nC - c.i) / 1.2); c.m.visible = q > 0; c.m.scale.set(0.6 * q, 0.6, 0.6); c.m.material.uniforms.uA.value = 0.95; c.m.material.uniforms.uGlow.value = 0.35 * (1 - set); }
      pane.scale.set(w, K.h * set, 1); pane.position.y = K.h * set / 2 + 0.05; pane.material.uniforms.uA.value = K.a * set; pane.material.uniforms.uGlow.value = 0.08 + 0.25 * crack;
      for (const l of cracks) { l.material.uniforms.uA.value = I * 1.2 * Math.max(0, crack * 3 - l.userData.i) * set; }
    });
    e.g.position.copy(g0); e.g.rotation.y = Math.atan2(f.z, f.x) + Math.PI / 2;   // 판의 가로(로컬 x) = 시전 방향에 수직
    const pane = this.solid(e, this.pane, { tint: 0xffd890, rim: 0xffe8b0, spec: 1.4 }); pane.renderOrder = 6;
    for (const row of [0, 1]) for (let i = 0; i < nC; i++) { const m = this.solid(e, this.geo.chef_curl, { rim: 0xffe0a0, spec: 1.0 }); m.position.set(-w / 2 + (i + 0.5) * w / nC - 0.3, row ? K.h : 0.08, 0); m.rotation.set(0, 0, -Math.PI / 2); m.renderOrder = 7; curls.push({ m, i: i + row * 0.5 }); }
    const cracks = []; for (let i = 0; i < 3; i++) { const l = this.spr(e, 2, 0xffffff, C.sugarB, 8); l.userData.i = i; l.position.set(rnd(-w / 3, w / 3), K.h * rnd(0.3, 0.7), 0.03); l.rotation.z = rnd(-1, 1); l.scale.set(rnd(0.6, 1.1), 0.25, 1); cracks.push(l); }
    let shattered = false;
    return this._h(e, {
      crack: (k) => { crack = clamp01(k); },
      shatter: () => { shattered = true; const at = g0.clone().setY(g0.y + K.h / 2); this.flash(at, 1.4, 0xfff4d0, C.sugar, 0.14, 1.1);
        this._bits(at, lite() ? 6 : 14, { geo: this.geo.chef_shard, tint: 0xffe0a0, size: [0.12, 0.22], speed: [1.6, 3.4], up: [1.4, 2.8], ground: g0.y, life: 0.7 }); this.ring(g0, 2.4, 0xfff0c0, C.sugar, 0.3, 1.2); },
      dispose: () => { if (!shattered) this._puffs(g0.clone().setY(g0.y + 0.4), 2, 0.6, { c1: C.cream, c2: C.sugar, a: 0.3, life: 0.4 }); this._free(e); },
    });
  }

  // ================================================================== B5 크로캉부슈 피날레
  tower(c, o = {}) {
    if (!this._ok() || !this.geo.chef_choux) return null;
    const K = CHEFFX.tower, C = CHEFFX.col, I = CHEFFX.intensity, g0 = P3(c), form = o.form || 2, gap = o.gap || 0.15, nL = o.layers || 3, end = form + (nL + 1) * gap + 0.6;
    const choux = [], tiers = K.tiers, nT = tiers.length; let idx = 0;
    const tierBurst = new Array(nT).fill(-1);
    const e = this._fx('tower', end, (e) => {
      for (const ch of choux) {
        const bt = tierBurst[ch.tier];
        if (bt >= 0) { const q = (e.t - bt) / 0.4; ch.m.position.copy(ch.p).addScaledVector(ch.out, 2.2 * easeOut(q)); ch.m.position.y += 1.2 * q * (1 - q); ch.m.material.uniforms.uA.value = K.a * (1 - smooth(0.3, 1, q)); continue; }
        const q = clamp01((e.t - ch.d) / 0.35), a0 = ch.a + (1 - q) * 3;   // 나선을 그리며 제자리로
        ch.m.position.set(Math.cos(a0) * (ch.rr + 0.9 * (1 - q)), ch.y * q + 0.2 * (1 - q), Math.sin(a0) * (ch.rr + 0.9 * (1 - q)));
        ch.m.scale.setScalar(K.choux * easeOut(q)); ch.m.material.uniforms.uA.value = K.a * smooth(0, 0.2, q); ch.m.visible = q > 0;
      }
      const tq = smooth(form * 0.3, form, e.t), gone = tierBurst[nT - 1] >= 0 ? smooth(0, 0.3, e.t - tierBurst[nT - 1]) : 0;
      for (let i = 0; i < threads.length; i++) { const t = threads[i]; t.visible = tq > 0.02; t.scale.set(0.8 - i * 0.12, Math.max(0.05, nT * K.h * tq), 0.8 - i * 0.12); t.rotation.y = i * 2 + e.t * 0.5; t.material.uniforms.uA.value = 0.9 * tq * (1 - gone); }
      this._flat(zone, o.r || 6); zone.material.uniforms.uA.value = I * 0.35 * smooth(0, 0.3, e.t) * (1 - gone);
    });
    e.g.position.copy(g0);
    for (let t = 0; t < nT; t++) for (let j = 0; j < tiers[t]; j++) {
      const rr = tiers[t] > 1 ? (0.22 + 0.11 * tiers[t]) * K.rr : 0, a = j / tiers[t] * Math.PI * 2 + t * 0.4, m = this.solid(e, this.geo.chef_choux, { rim: 0xfff0d0, spec: 0.8 }); m.visible = false; m.renderOrder = 5;
      const y = 0.2 + t * K.h; choux.push({ m, tier: t, rr, a, y, d: idx++ * (form * 0.8 / 16), p: new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr), out: new THREE.Vector3(Math.cos(a), 0.2, Math.sin(a)).normalize() });
    }
    const threads = [0, 1].map(() => { const m = this.solid(e, this.geo.chef_curl, { rim: 0xffe0a0, spec: 1.2, tint: 0xffd080 }); m.renderOrder = 6; return m; });
    const zone = this.spr(e, 1, C.ice, C.iceB, 2); zone.material.uniforms.uP.value = 0.4;
    return this._h(e, {
      frost: (k) => { this._puffs(g0.clone().setY(g0.y + nT * K.h + 0.3), lite() ? 1 : 3, 0.6, { c1: 0xffffff, c2: C.iceB, a: 0.35, life: 0.6, rise: -0.6 }); },
      burst: (i) => { const t = nT - 1 - i; if (t < 0) return; tierBurst[t] = e.t; const at = g0.clone().setY(g0.y + 0.2 + t * K.h); this.flash(at, 1.0, 0xffffff, C.iceB, 0.12, 1.0); this.ring(g0, o.r ? Math.min(o.r, 4) : 4, C.ice, C.iceB, 0.25, 0.9, 0.3); },
      ring: () => { tierBurst[0] = e.t; this.flash(g0.clone().setY(g0.y + 0.3), 1.6, 0xffffff, C.iceB, 0.16, 1.1); this.ring(g0, o.rb || 6.5, 0xffffff, C.iceB, 0.45, 1.6, 0.2); this._puffs(g0.clone().setY(g0.y + 0.1), lite() ? 3 : 8, (o.rb || 6.5) * 0.6, { c1: 0xf4fbff, c2: C.iceB, a: 0.3, life: 0.6, rise: 0.1 }); },
    });
  }

  // ================================================================== C2 황금 부용
  broth(pos, o = {}) {
    if (!this._ok() || !this.geo.chef_pot) return null;
    const C = CHEFFX.col, I = CHEFFX.intensity, g0 = P3(pos), r = o.r || 3, dur = o.dur || 8; let puffT = 0, ending = -1;
    const e = this._fx('broth', dur + 0.5, (e, dt) => {
      const a = smooth(0, 0.2, e.t) * (ending >= 0 ? 1 - smooth(ending, ending + 0.3, e.t) : 1 - smooth(dur - 0.3, dur, e.t));
      pt.scale.setScalar(0.5 * (0.5 + 0.5 * easeOut(e.t / 0.2))); pt.material.uniforms.uA.value = a;
      ld.position.set(Math.cos(e.t * 2.4) * 0.18, 0.62, Math.sin(e.t * 2.4) * 0.18); ld.rotation.set(0.35 * Math.sin(e.t * 2.4), e.t * 2.4, 0.35 * Math.cos(e.t * 2.4)); ld.scale.setScalar(0.42); ld.material.uniforms.uA.value = a;
      this._flat(rg, r); rg.material.uniforms.uA.value = I * 0.6 * a; this._flat(sf, 0.45); sf.position.y = 0.27; sf.material.uniforms.uA.value = I * 0.5 * a * (0.8 + 0.2 * Math.sin(e.t * 5));
      puffT -= dt; if (puffT <= 0 && a > 0.5) { puffT = 0.7; this._puffs(g0.clone().setY(g0.y + 0.45), 1, 0.25, { c1: 0xfff4e0, c2: C.gold, a: 0.28, life: 0.9, rise: 0.9 }); }
      if (ending >= 0 && e.t > ending + 0.3) e.t = e.life;
    });
    e.g.position.copy(g0);
    const pt = this.solid(e, this.geo.chef_pot, { rim: 0xffd0a0, spec: 0.8 }), ld = this.solid(e, this.geo.cook_ladle, { rim: 0xffffff, spec: 1 }), rg = this.spr(e, 1, C.gold, C.goldB, 2), sf = this.spr(e, 0, C.gold, C.goldB, 3);
    rg.material.uniforms.uP.value = 0.8;
    return this._h(e, {
      pulse: (t) => { this.ring(g0, r, C.herb, C.herbB, 0.5, 1.0, 0.15); if (t && t.pos && this.geo.chef_leaf) { const at = P3(t.pos); this._bits(at.clone().setY(at.y + 0.3), lite() ? 1 : 3, { geo: this.geo.chef_leaf, size: [0.1, 0.14], speed: [0.2, 0.6], up: [2, 3], ground: at.y - 5, life: 0.6 }); } },
      end: () => { if (ending < 0) ending = e.t; },
    });
  }

  // ================================================================== C3 봉 아페티! · C4 셰프의 한 끗 · C5 로열 그랑 디너 · C1 제작 플레이팅
  /** 작은 은쟁반 + 클로슈 하나: open 시각에 뚜껑이 들림. 반환 = 쟁반 묶음(그룹 좌표) */
  _tray(e, tint = 0xffffff) {
    const tr = this.solid(e, this.geo.chef_tray, { rim: 0xffffff, spec: 1 }), cl = this.solid(e, this.geo.chef_cloche, { tint, rim: 0xffffff, spec: 1.2 }), fd = this.solid(e, this.geo.chef_food_c || this.geo.chef_choux, { spec: 0.4 }), gl = this.spr(e, 0, CHEFFX.col.gold, CHEFFX.col.goldB, 4);
    return { tr, cl, fd, gl, set: (p, s, open, a) => { tr.position.copy(p); tr.scale.set(s, s, s); cl.position.copy(p).setY(p.y + open * s * 1.4); cl.rotation.z = open * 0.6; cl.scale.setScalar(s * 0.8); fd.position.copy(p).setY(p.y + 0.06 * s * 3); fd.scale.setScalar(s * 0.4);
      gl.quaternion.copy(this.camQ); gl.position.copy(p).setY(p.y + 0.2 * s); gl.scale.setScalar(s * 3 * open); tr.material.uniforms.uA.value = a; cl.material.uniforms.uA.value = a * (1 - smooth(0.5, 1, open)); fd.material.uniforms.uA.value = a * (1 - smooth(0.6, 1, open)); gl.material.uniforms.uA.value = CHEFFX.intensity * 0.9 * a * Math.sin(Math.PI * clamp01(open)); } };
  }
  bon(pc, o = {}) {
    if (!this._ok() || !this.geo.chef_tray) return null;
    const T = [];
    const e = this._fx('bon', 1.1, (e) => { const base = P3(pc.pos), f = pc.facing || { x: 0, z: 1 }, p = base.clone().add(_a.set(f.x * 0.55, 1.05, -f.z * 0.55)); const open = clamp01((e.t - 0.15) / 0.4), a = smooth(0, 0.1, e.t) * (1 - smooth(0.85, 1.1, e.t));
      T[0].set(p, 0.32, open, a); const q = clamp01((e.t - 0.4) / 0.4); glow.quaternion.copy(this.camQ); glow.position.lerpVectors(p, base.clone().setY(base.y + 1.0), easeOut(q)); glow.scale.setScalar(0.5 * (1 - q * 0.6)); glow.material.uniforms.uA.value = CHEFFX.intensity * 1.2 * (q > 0 && q < 1 ? 1 : 0); });
    T.push(this._tray(e)); const glow = this.spr(e, 0, 0xffffff, CHEFFX.col.gold, 7);
    return e;
  }
  touch(pc) {
    if (!this._ok() || !this.geo.chef_leaf) return null;
    const e = this._fx('touch', 0.9, (e) => { const b = P3(pc.pos), q = e.t / 0.9; lf.position.copy(b).setY(b.y + 1.3 + q * 0.7); lf.rotation.set(0.4, e.t * 6, 0.3); lf.scale.setScalar(0.22); lf.material.uniforms.uA.value = 1 - smooth(0.6, 1, q);
      sp.quaternion.copy(this.camQ); sp.position.copy(lf.position).add(_a.set(0.18, 0.1, 0)); sp.scale.setScalar(0.35 * (1 + 0.3 * Math.sin(e.t * 20))); sp.material.uniforms.uA.value = CHEFFX.intensity * 1.2 * (1 - smooth(0.4, 1, q)); });
    const lf = this.solid(e, this.geo.chef_leaf, { spec: 0.4 }), sp = this.spr(e, 3, 0xffffff, CHEFFX.col.gold, 7); return e;
  }
  royal(pc, o = {}) {
    if (!this._ok() || !this.geo.chef_tray) return null;
    const times = o.times || [0.45, 0.95, 1.45], C = CHEFFX.col, I = CHEFFX.intensity, opened = [-1, -1, -1], tint = [0xe8eef8, 0xffb080, 0xffd27a]; let cancel = -1;
    const T = [];
    const e = this._fx('royal', times[2] + 0.9, (e) => {
      const b = P3(pc.pos), a0 = smooth(0, 0.15, e.t) * (cancel >= 0 ? 1 - smooth(cancel, cancel + 0.2, e.t) : 1);
      for (let i = 0; i < 3; i++) { const ang = (i / 3) * Math.PI * 2 + Math.PI / 2, p = b.clone().add(_a.set(Math.cos(ang) * 1.0, 0.75, Math.sin(ang) * 1.0)), op = opened[i] >= 0 ? clamp01((e.t - opened[i]) / 0.45) : 0;
        T[i].set(p, 0.26, op, a0 * (1 - smooth(0.7, 1, op))); }
      if (cancel >= 0 && e.t > cancel + 0.2) e.t = e.life;
    });
    for (let i = 0; i < 3; i++) T.push(this._tray(e, tint[i]));
    return this._h(e, {
      open: (i) => { opened[i] = e.t; const b = P3(pc.pos);
        if (i === 0) { const s = this._fx('royalshield', 0.9, (x) => { const q = x.t / 0.9, bb = P3(pc.pos); m.position.copy(bb); m.scale.setScalar(0.9 + 0.1 * easeOut(q)); m.material.uniforms.uA.value = 0.28 * (1 - smooth(0.4, 1, q)); m.material.uniforms.uGlow.value = 0.35; });
          const m = this.solid(s, this.geo.chef_cloche, { tint: 0xf4ecd0, rim: 0xffe8a0, spec: 1.4 }); m.renderOrder = 8; }
        if (i === 1) for (let k = 0; k < (lite() ? 3 : 6); k++) { const a = k / 6 * Math.PI * 2, m = this.flameTongue(this._fx('royalatk', 0.6, (x) => { const q = x.t / 0.6, bb = P3(pc.pos); m.quaternion.copy(this.camQ); m.position.set(bb.x + Math.cos(a) * 0.45, bb.y + 0.3 + q * 1.4, bb.z + Math.sin(a) * 0.45); m.scale.set(0.3, 0.6, 1); m.material.uniforms.uA.value = I * 1.1 * (1 - smooth(0.5, 1, q)); })); }
        if (i === 2 && this.geo.cook_drop) this._bits(b.clone().setY(b.y + 0.3), lite() ? 5 : 10, { geo: this.geo.cook_drop, tint: 0xffd27a, size: [0.04, 0.07], speed: [0.2, 0.7], up: [2.2, 3.4], ground: b.y - 5, life: 0.7 });
        this.flash(b.clone().setY(b.y + 1.0), 0.8, 0xffffff, [C.silver, C.fire, C.gold][i], 0.14, 0.9); },
      cancel: () => { if (cancel < 0) cancel = e.t; },
    });
  }
  /** 시그니처 메뉴 제작 성공: 접시 위에 메인 → 곁들임 → 소스, 테두리에 금빛이 한 바퀴 */
  menu(pc, o = {}) {
    if (!this._ok() || !this.geo.chef_tray) return null;
    const e = this._fx('menu', 1.8, (e) => { const b = P3(pc.pos), p = b.clone().setY(b.y + 2.4), a = smooth(0, 0.15, e.t) * (1 - smooth(1.5, 1.8, e.t));
      pl.position.copy(p); pl.scale.setScalar(0.4); pl.rotation.x = 0.6; pl.material.uniforms.uA.value = a;
      const step = (t0) => smooth(t0, t0 + 0.15, e.t);
      mn.position.copy(p).add(_a.set(-0.06, 0.08, 0)); mn.scale.setScalar(0.16 * step(0.2)); mn.material.uniforms.uA.value = a;
      sd.position.copy(p).add(_a.set(0.14, 0.1, 0.05)); sd.scale.setScalar(0.12 * step(0.45)); sd.material.uniforms.uA.value = a;
      sc.position.copy(p).setY(p.y + 0.05); sc.rotation.set(-Math.PI / 2 + 0.6, 0, 0); sc.scale.setScalar(0.5 * step(0.7)); sc.material.uniforms.uA.value = CHEFFX.intensity * 0.9 * a;
      gr.position.copy(p).setY(p.y + 0.04); gr.rotation.set(-Math.PI / 2 + 0.6, 0, e.t * 4); gr.scale.setScalar(0.85); gr.material.uniforms.uA.value = CHEFFX.intensity * 1.2 * smooth(0.9, 1.0, e.t) * a; });
    const pl = this.solid(e, this.geo.chef_tray, { tint: 0xffffff, spec: 0.6 }), mn = this.solid(e, this.geo.chef_food_c, { spec: 0.5 }), sd = this.solid(e, this.geo.chef_garnish, { spec: 0.4 }), sc = this.spr(e, 1, 0xff8060, 0xa02010, 6), gr = this.spr(e, 1, 0xfff0c0, CHEFFX.col.gold, 6);
    sc.material.uniforms.uP.value = 0.2; return e;
  }
}
