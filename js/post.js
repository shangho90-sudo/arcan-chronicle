// Post-processing for the painted "golden afternoon" look: the scene is rendered into an HDR target, then one
// composite pass adds bloom (lamps, water, magic), a warm colour grade with a soft filmic curve, a tilt-shift blur
// toward the top/bottom edges and corners (miniature / illustration feel), and a warm vignette.
// No extra libraries: a few full-screen triangles with small shaders.
import * as THREE from 'three';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// 13-tap separable gaussian (linear sampling)
const BLUR = `uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
void main(){
  vec4 c = texture2D(tSrc, vUv) * 0.1964825501511404;
  vec2 o1 = dir * 1.411764705882353, o2 = dir * 3.2941176470588234, o3 = dir * 5.176470588235294;
  c += (texture2D(tSrc, vUv + o1) + texture2D(tSrc, vUv - o1)) * 0.2969069646728344;
  c += (texture2D(tSrc, vUv + o2) + texture2D(tSrc, vUv - o2)) * 0.09447039785044732;
  c += (texture2D(tSrc, vUv + o3) + texture2D(tSrc, vUv - o3)) * 0.010381362401148057;
  gl_FragColor = c; }`;

// bright pass + 2x downsample (4-tap box)
const BRIGHT = `uniform sampler2D tSrc; uniform vec2 px; uniform float threshold; varying vec2 vUv;
void main(){
  vec3 c = (texture2D(tSrc, vUv + px * vec2(-0.5,-0.5)).rgb + texture2D(tSrc, vUv + px * vec2(0.5,-0.5)).rgb
          + texture2D(tSrc, vUv + px * vec2(-0.5,0.5)).rgb + texture2D(tSrc, vUv + px * vec2(0.5,0.5)).rgb) * 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(threshold, threshold * 1.8, l);
  gl_FragColor = vec4(c * k, 1.0); }`;

const COPY = `uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tSrc, vUv); }`;

const FINAL = `uniform sampler2D tScene, tBloom1, tBloom2, tSoft; uniform float bloom, exposure, warmth, sat, contrast, vignette, tilt, aspect;
varying vec2 vUv;
vec3 filmic(vec3 x){ // soft shoulder, keeps saturation (closer to a painted look than ACES)
  x *= exposure; return x * (1.0 + x / 9.0) / (1.0 + x); }
vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec3 c = texture2D(tScene, vUv).rgb;
  // tilt-shift: blur toward the top / bottom edges and strongest in the corners
  vec2 d = vUv - 0.5; d.x *= aspect;
  float band = smoothstep(0.30, 0.52, abs(vUv.y - 0.48));
  float corner = smoothstep(0.55, 0.95, length(d * vec2(0.85, 1.0)));
  float b = clamp(max(band, corner) * tilt, 0.0, 1.0);
  c = mix(c, texture2D(tSoft, vUv).rgb, b);
  c += (texture2D(tBloom1, vUv).rgb * 0.6 + texture2D(tBloom2, vUv).rgb * 0.9) * bloom;
  // warm grade: lift warm highlights, keep shadows slightly cool-violet, a touch more saturation
  c = filmic(c);
  c = mix(c, c * c * (3.0 - 2.0 * c), contrast);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, sat);
  c *= mix(vec3(0.97, 0.96, 1.03), vec3(1.05, 1.0, 0.9), smoothstep(0.05, 0.8, l) * warmth + (1.0 - warmth) * 0.5);
  // vignette (warm brown, not black)
  float v = smoothstep(0.45, 1.15, length(d * vec2(0.9, 1.15)));
  c = mix(c, c * vec3(0.62, 0.5, 0.4), v * vignette);
  gl_FragColor = vec4(toSRGB(c), 1.0); }`;

export class Post {
  constructor(renderer) {
    this.r = renderer; this.enabled = true;
    this.params = { bloom: 0.65, threshold: 2.6, exposure: 1.12, warmth: 1.0, sat: 1.25, contrast: 0.32, vignette: 0.4, tilt: 0 };   // tilt 0 = no top/bottom edge blur (the user asked to remove it)
    const hf = { type: THREE.HalfFloatType, depthBuffer: false };
    this.scene = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.b1 = [new THREE.WebGLRenderTarget(4, 4, hf), new THREE.WebGLRenderTarget(4, 4, hf)];   // 1/2
    this.b2 = [new THREE.WebGLRenderTarget(4, 4, hf), new THREE.WebGLRenderTarget(4, 4, hf)];   // 1/8
    this.soft = [new THREE.WebGLRenderTarget(4, 4, hf), new THREE.WebGLRenderTarget(4, 4, hf)]; // 1/4 colour for tilt-shift
    for (const t of [...this.b1, ...this.b2, ...this.soft]) { t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter; }
    const mat = (fs, u) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
    this.mBright = mat(BRIGHT, { tSrc: { value: null }, px: { value: new THREE.Vector2() }, threshold: { value: 1 } });
    this.mBlur = mat(BLUR, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
    this.mCopy = mat(COPY, { tSrc: { value: null } });
    this.mFinal = mat(FINAL, { tScene: { value: this.scene.texture }, tBloom1: { value: this.b1[0].texture }, tBloom2: { value: this.b2[0].texture }, tSoft: { value: this.soft[0].texture },
      bloom: { value: 0 }, exposure: { value: 1 }, warmth: { value: 1 }, sat: { value: 1 }, contrast: { value: 0 }, vignette: { value: 0 }, tilt: { value: 0 }, aspect: { value: 1 } });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(g, this.mCopy); this.quad.frustumCulled = false;
    this.qScene = new THREE.Scene(); this.qScene.add(this.quad); this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.w = 0; this.h = 0;
  }
  setSize(w, h) {
    if (w === this.w && h === this.h) return; this.w = w; this.h = h;
    this.scene.setSize(w, h);
    for (const t of this.b1) t.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    for (const t of this.b2) t.setSize(Math.max(1, w >> 3), Math.max(1, h >> 3));
    for (const t of this.soft) t.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
  }
  pass(m, target) { this.quad.material = m; this.r.setRenderTarget(target); this.r.render(this.qScene, this.qCam); }
  blur(pair, radius = 1) {
    const [a, b] = pair, w = a.width, h = a.height;
    this.mBlur.uniforms.tSrc.value = a.texture; this.mBlur.uniforms.dir.value.set(radius / w, 0); this.pass(this.mBlur, b);
    this.mBlur.uniforms.tSrc.value = b.texture; this.mBlur.uniforms.dir.value.set(0, radius / h); this.pass(this.mBlur, a);
  }
  render(scene, cam) {
    const r = this.r;
    if (!this.enabled) { r.setRenderTarget(null); r.render(scene, cam); return; }
    const size = r.getDrawingBufferSize(new THREE.Vector2()); this.setSize(size.x, size.y);
    const p = this.params;
    r.setRenderTarget(this.scene); r.render(scene, cam);
    // bloom: bright pass to 1/2, blur; 1/8 copy, blur twice (wide glow)
    this.mBright.uniforms.tSrc.value = this.scene.texture; this.mBright.uniforms.px.value.set(1 / size.x, 1 / size.y); this.mBright.uniforms.threshold.value = p.threshold;
    this.pass(this.mBright, this.b1[0]); this.blur(this.b1, 1.2);
    this.mCopy.uniforms.tSrc.value = this.b1[0].texture; this.pass(this.mCopy, this.b2[0]); this.blur(this.b2, 1.5); this.blur(this.b2, 2.5);
    // tilt-shift source: scene at 1/4, blurred
    if (p.tilt > 0) { this.mCopy.uniforms.tSrc.value = this.scene.texture; this.pass(this.mCopy, this.soft[0]); this.blur(this.soft, 1.0); this.blur(this.soft, 1.8); }
    const u = this.mFinal.uniforms;
    u.bloom.value = p.bloom; u.exposure.value = p.exposure; u.warmth.value = p.warmth; u.sat.value = p.sat; u.contrast.value = p.contrast; u.vignette.value = p.vignette; u.tilt.value = p.tilt; u.aspect.value = size.x / size.y;
    this.pass(this.mFinal, null);
  }
}
