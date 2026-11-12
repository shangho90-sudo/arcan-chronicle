// Exercise authored skill timing and area-owned music cancellation without WebGL.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { HitShape, CombatMath, clamp, clamp01 } from '../js/core.js';
import { skillSound } from '../js/sfx.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const skills = JSON.parse(read('../assets/data/skills2.json')).skills;
const actions = Object.fromEntries(JSON.parse(read('../assets/models/actions.json')).map(a => [a.name, a]));
const sandbox = { HitShape, CombatMath, clamp, clamp01, skillSound, console };
vm.createContext(sandbox);
vm.runInContext(read('../js/skillrt.js').replace(/^import .*;\n/gm, '').replace(/\bexport /g, '') + '\nthis.api={SkillEngine,SkillArea,bindSkillRt,FX};', sandbox);
const { SkillEngine, SkillArea, bindSkillRt, FX } = sandbox.api;
for (const k of Object.keys(FX).filter(k => k !== 'on')) FX[k] = () => ({set(){},dispose(){},end(){},pulse(){}});
for (const [id, sound, count] of [['ph1_a3','ph_spin',5],['ph1_a6','ph_slam',1],['ph1_b6','ph_flask',10]]) {
  const d = skills.find(s => s.id === id), sounds = [];
  const pc = { pos:{x:0,y:0,z:0}, facing:{x:0,z:1}, skills:{lock:0}, body:{sh:{actions}},
    sheet:{p:{sk:{}},book:{passive:()=>0}}, status:{flag:()=>0}, zone:{actors:[],geo:{ground:(x,z)=>({x,y:0,z})}} };
  const eng = new SkillEngine(pc);
  bindSkillRt({audio:{sfx:name=>sounds.push({name,t:eng.clock})},render:{addShake(){}},data:{}});
  const ctx = {d,L:1,grade:1,mult:1,origin:{...pc.pos},facing:{...pc.facing},aim:{x:0,y:0,z:2},hitOnce:new Set()};
  eng.release(ctx);
  assert.ok(!sounds.some(s=>s.name===sound),'no impact sound on button press');
  for(let i=0;i<400;i++) eng.tick(.01);
  const actual=sounds.filter(s=>s.name===sound);
  assert.equal(actual.length,count,id);
  if(count>1) actual.slice(1).forEach((s,i)=>assert.ok(Math.abs(s.t-actual[i].t-(id==='ph1_a3'?.13:.2))<.025,'repeat timing'));
  if(id==='ph1_b6') assert.ok(actual[0].t>=.5,'bottle waits for fall');
  if(id==='ph1_a6') assert.ok(actual[0].t>=.3,'slam waits for landing');
}
// 유봉 내려찍기 ('유봉강타'): whoosh once just before the impact (0.25 s - 0.09 s), never the hit sound on a whiff; one blow at every level
{ const d = skills.find(s => s.id === 'ph1_a1'), sounds = [];
  assert.equal(d.anim, 'ph_smash'); assert.equal(actions.ph_smash.hitT, 0.25); assert.equal(actions.ph_smash.dur, actions.attack.dur, 'same total motion time as before');
  const hitOp = d.ops.find(o => o.op === 'hit'); assert.equal(hitOp.coef, 2.2); assert.equal(hitOp.shape, 'single'); assert.ok(hitOp.oneHit); assert.equal(d.mp, 8); assert.equal(d.cd, 4); assert.equal(d.range, 2.0);
  for (const L of [1, 5]) { sounds.length = 0;
    const pc = { pos:{x:0,y:0,z:0}, facing:{x:0,z:1}, skills:{lock:0}, body:{sh:{actions}, bladePoints:()=>null},
      sheet:{p:{sk:{}},book:{passive:()=>0}}, status:{flag:()=>0}, zone:{actors:[],nearestEnemy:()=>null,geo:{ground:(x,z)=>({x,y:0,z})}}, dist:()=>99 };
    const eng = new SkillEngine(pc);
    bindSkillRt({audio:{sfx:name=>sounds.push({name,t:eng.clock})},render:{addShake(){},kick(){ throw new Error('no camera kick on a whiff'); }},data:{}});
    eng.release({d,L,grade:1,mult:1,origin:{...pc.pos},facing:{...pc.facing},aim:{x:0,y:0,z:2},hitOnce:new Set(),act:'ph_smash'});
    const lock = pc.skills.lock;
    for(let i=0;i<200;i++) eng.tick(.01);
    const sw = sounds.filter(s=>s.name==='ph_smash_swing');
    assert.equal(sw.length,1,'one whoosh'); assert.ok(Math.abs(sw[0].t-.16)<.025,'whoosh 0.09 s before the impact');
    assert.ok(!sounds.some(s=>s.name==='ph_smash_hit'||s.name==='heavy'||s.name==='hit'),'no hit sound on a whiff');
    assert.ok(Math.abs(lock-.6)<.005,'same lock as before (hit 0.25 + recover 0.35): '+lock);
    assert.ok(!pc.freezeT,'no hit-stop on a whiff'); }
}
for(const [id,name] of [['ph1_c6','ph_adrenaline'],['ph1_c7','ph_shield'],['ph1_c8','ph_heal']]) {
  const d=skills.find(s=>s.id===id);assert.equal(skillSound(d),name);assert.equal(d.sfxAt,'strike');
}
let stopped=0, started=0;
bindSkillRt({audio:{skillBed:()=>{started++;return()=>stopped++;}}});
const eng={pc:{pos:{x:0,y:0,z:0}},summons:[]};
const d=skills.find(s=>s.id==='ph1_c8'),op=d.ops[0];
const area=new SkillArea(eng,op,{d,mult:1},{x:0,y:0,z:0},op.r,op.dur);
assert.equal(started,1);area.dispose();area.dispose();assert.equal(stopped,1,'area disposal cancels bed exactly once');
// Actual Audio class: cancel while loading, music mute, replacement, music-bus routing.
const src=read('../js/io.js').replace("import { screenToWorldDir } from './render.js';",'const screenToWorldDir=()=>({});').replace("'./sfx.js'",JSON.stringify(new URL('../js/sfx.js',import.meta.url).href));
const {Audio}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const a=new Audio(), sources=[], routes=[];
a.ctx={state:'running',createBufferSource(){const s={connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;this.onended?.();}};sources.push(s);return s;},createGain(){return{gain:{},connect:x=>routes.push(x),disconnect(){}};}};
a.gMusic={gain:{}};a.gSfx={gain:{}};
let resolve;a.buf=()=>new Promise(r=>resolve=r);
const stop=a.skillBed('bgm_ph_heal_bed');stop();resolve({});await Promise.resolve();assert.equal(sources.length,0,'cancel pending decode');
a.buf=async()=>({});a.skillBed('bgm_ph_heal_bed');await Promise.resolve();assert.ok(sources[0].started);assert.equal(routes[0],a.gMusic);
a.skillBed('bgm_ph_heal_bed');await Promise.resolve();assert.ok(sources[0].stopped,'replace previous bed');
a.music=0;a.apply();assert.ok(sources[1].stopped,'mute stops bed');
a.skillBed('bgm_ph_heal_bed');await Promise.resolve();assert.equal(sources.length,2,'muted music never starts');
console.log('pharmacist audio: smash whoosh / whiff, 5 spins, delayed slam, 10 bottle landings, support cues, area cancellation, pending loads, music bus and mute passed');
