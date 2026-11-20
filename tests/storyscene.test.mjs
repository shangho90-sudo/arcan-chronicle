// 메인 스토리 대화 장면 대사 나누기(js/storyparse.js): 모든 메인 퀘스트 대사가 쪽으로 나뉘고, 화자 이름이 NPC로 이어지는지.  Run: node tests/storyscene.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
const { GameData, questCategory } = await import('../js/core.js');
const { parseStory, splitPages, makeResolver, plainText, PAGE_MAX } = await import('../js/storyparse.js');
const J = n => JSON.parse(readFileSync(new URL('../assets/data/' + n, import.meta.url), 'utf8'));
const files = {}; for (const f of ['config', 'levels', 'jobs', 'skills', 'skills2', 'items', 'monsters', 'quests', 'npcs', 'zones']) files[f] = J(f + '.json');
const d = new GameData(files); let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }, eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// 기본 규칙
const R = name => ({ 아스텔: 'astel', 카스티야: 'castilla' })[name] || null;
let P = parseStory("<b class='gold'>아스텔</b> 안녕.<br><i>바람이 분다.</i><br><b class='gold'>카스티야</b> 응!", { key: 'elder', name: '하람' }, R);
eq(P.map(p => p.who && p.who.key), ['astel', null, 'castilla'], '화자 / 서술 / 화자');
ok(P[1].narr && P[1].html === '바람이 분다.', '서술은 <i> 벗김');
P = parseStory('어서 오게. 마을에 온 걸 환영하네.', { key: 'elder', name: '하람' }, R);
eq(P.length, 1, '표시 없는 짧은 대사 = 한 쪽'); eq(P[0].who.key, 'elder', '표시 없으면 그 NPC');
P = parseStory("<b class='gold' data-expr='angry'>아스텔</b> 비켜!", null, R); eq(P[0].who.expr, 'angry', '표정');
P = parseStory("<b class='gold'>나</b> 좋아.", null, R); eq(P[0].who.key, 'player', "'나' = 플레이어");
const long = '가나다라마바사. '.repeat(30).trim();
const sp = splitPages(long); ok(sp.length > 1 && sp.every(s => s.length <= PAGE_MAX), '긴 대사는 문장 단위로 나눔');
eq(sp.join(' '), long, '나눠도 글자는 그대로');

// 모든 메인 퀘스트
const res = makeResolver(d, '테스터'), unknown = new Map();
const mains = d.questList.filter(q => questCategory(q) === 'main');
ok(mains.length >= 80, '메인 퀘스트 ' + mains.length);
let pages = 0, speakers = 0, npcSpk = 0;
for (const q of mains) for (const k of ['offerText', 'progressText', 'completeText']) {
  const t = q[k]; if (!t) continue;
  const npc = d.npcs[k === 'offerText' ? q.giver : (q.turnIn || q.giver)];
  const ps = parseStory(t, npc ? { key: npc.id, name: npc.name } : null, res);
  ok(ps.length >= 1, q.id + ' ' + k + ' 쪽 있음');
  eq(ps.map(p => plainText(p.html)).join('').replace(/\s/g, ''), plainText(t.replace(/<b class='gold'>.*?<\/b>/g, '')).replace(/\s/g, ''), q.id + ' ' + k + ' 글자 빠짐 없음');
  for (const p of ps) {
    pages++; ok(plainText(p.html).trim().length > 0, q.id + ' 빈 쪽 없음');
    if (p.who) { speakers++; if (p.who.key && !p.who.key.startsWith('mon:')) { npcSpk++; ok(p.who.key === 'player' || d.npcs[p.who.key], q.id + ' 화자 ' + p.who.key); } if (!p.who.key) unknown.set(p.who.name, (unknown.get(p.who.name) || 0) + 1); }
  }
}
// 대화 목표의 대사(objective talkText — 그 NPC에게 말을 걸면 장면으로 나옴): 화자가 NPC로 이어지고 글자가 빠지지 않음
let talks = 0;
for (const q of d.questList) for (const o of q.objectives || []) if (o.type === 'talk' && o.talkText) {
  talks++; const npc = d.npcs[o.target]; ok(npc, q.id + ' talk 대상 ' + o.target);
  const ps = parseStory(o.talkText, npc ? { key: npc.id, name: npc.name } : null, res);
  ok(ps.length >= 1 && ps.every(p => !p.who || p.who.key), q.id + ' talkText 화자');
  eq(ps.map(p => plainText(p.html)).join('').replace(/\s/g, ''), plainText(o.talkText.replace(/<b class='gold'>.*?<\/b>/g, '')).replace(/\s/g, ''), q.id + ' talkText 글자 빠짐 없음');
}
ok(talks >= 1, 'talkText ' + talks);
// 주요 인물은 모두 NPC로 이어져야 함(그림·3D 초상)
for (const nm of ['아스텔', '카스티야', '카일러스', '케린', '저스티나', '로데릭', '요이센', '다이센', '치르젠', '얀베르', '볼드란', '베리온', '하람']) ok(res(nm) && d.npcs[res(nm)], nm + ' → NPC');
ok(res('그레이스') === 'mon:qb_grace_1' && res('말라키온') === 'mon:qb_malachion', '그레이스·말라키온 → 이야기 보스');
const man = JSON.parse(readFileSync(new URL('../assets/ui/story/portraits.json', import.meta.url), 'utf8'));
for (const [k, v] of Object.entries(man.portraits || {})) ok(existsSync(new URL('../assets/ui/story/' + v.file, import.meta.url)), '초상 파일 ' + k);
// 2D 일러스트가 없는 메인 장면 NPC 화자(tools/story/missing_art.mjs): 2026-11-20에 그린 사람은 꼭 그림이 있어야 하고(아래 목록),
// 그 뒤에 새로 생긴 화자는 3D 반신 렌더로 나오므로 실패가 아니라 '참고'로만 출력 — 새 일러스트는 tools/story/portraits.py
const { mainSpeakers, missingArt } = await import('../tools/story/missing_art.mjs');
const spk = mainSpeakers(d, { parseStory, makeResolver }, questCategory), noArt = missingArt(spk, man);
const ART_REQUIRED = ['elder', 'astel', 'merchant', 'arcan_smith_boy', 'arcan_pharm_clerk', 'arcan_innkeeper', 'guard', 'arcan_guide', 'armorer', 'town_armor', 'warp_town',
  'master_pharmacist', 'master_cook', 'master_blacksmith', 'master_hairdresser', 'master_artist', 'silvern_hunter',
  // 2026-11-20 2차 전직 마스터 7명 (tools/world/jobmasters.py)
  'master2_western_pharmacist', 'master2_herbalist', 'master2_engineer', 'master2_chef', 'master2_designer', 'master2_painter', 'master2_musician'];
for (const k of ART_REQUIRED) ok(man.portraits[k] && existsSync(new URL('../assets/ui/story/' + man.portraits[k].file, import.meta.url)), '일러스트 ' + k);
for (const [k, v] of Object.entries(man.portraits)) ok(v.facing === 'right' && Array.isArray(v.names), '초상 manifest ' + k);
console.log(`  참고: 메인 장면 NPC 화자 ${spk.size}명 중 2D 일러스트 없음 ${noArt.length}명${noArt.length ? ' — ' + noArt.map(s => s.key + '(' + s.name + ')').join(', ') : ''}`);
console.log(`storyscene: ${n} 통과 — 메인 ${mains.length}개, ${pages}쪽, 화자 있는 쪽 ${speakers}(NPC ${npcSpk}), 이어지지 않은 이름: ${[...unknown].map(([a, b]) => a + '×' + b).join(', ') || '없음'}`);

// 대화 상자 글꼴(2026-11-17): 주아체 + 보충 DialogExtra 부분 집합에 메인 대사·프롤로그·상자 UI 글자가 빠짐없이 들어 있는지
// (WOFF2를 직접 읽어 cmap을 봄 — 빠졌으면 python3 tools/fonts/jua_subset.py <Jua-Regular.ttf>로 다시 만들 것)
import { brotliDecompressSync } from 'node:zlib';
function woff2Cmap(path) {
  const b = readFileSync(new URL('../' + path, import.meta.url)), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  assert.equal(v.getUint32(0), 0x774F4632, path + ' = wOF2');
  const nt = v.getUint16(12), comp = v.getUint32(20); let o = 48;
  const u128 = () => { let r = 0; for (let i = 0; i < 5; i++) { const x = b[o++]; r = r * 128 + (x & 127); if (!(x & 128)) return r; } throw new Error('u128'); };
  const tabs = [];
  for (let i = 0; i < nt; i++) {
    const fl = b[o++], ti = fl & 63; let tag = ti; if (ti === 63) { tag = b.toString('latin1', o, o + 4); o += 4; }
    const tv = (fl >> 6) & 3, orig = u128(); let len = orig;
    if ((ti === 10 || ti === 11) ? tv === 0 : tv !== 0) len = u128();
    tabs.push({ tag, len });
  }
  const data = brotliDecompressSync(b.subarray(o, o + comp)); let off = 0, cm = null;
  for (const t of tabs) { if (t.tag === 0) cm = data.subarray(off, off + t.len); off += t.len; }
  const d = new DataView(cm.buffer, cm.byteOffset, cm.byteLength), set = new Set(), n = d.getUint16(2);
  for (let i = 0; i < n; i++) {
    const p = d.getUint16(4 + i * 8), e = d.getUint16(6 + i * 8), so = d.getUint32(8 + i * 8);
    if (p !== 3 && p !== 0) continue; const f = d.getUint16(so);
    if (f === 12) { const ng = d.getUint32(so + 12); for (let g = 0; g < ng; g++) { const s0 = d.getUint32(so + 16 + g * 12), s1 = d.getUint32(so + 20 + g * 12); for (let c = s0; c <= s1; c++) set.add(c); } }
    else if (f === 4) { const sx = d.getUint16(so + 6) / 2; for (let g = 0; g < sx; g++) { const end = d.getUint16(so + 14 + g * 2), st = d.getUint16(so + 16 + sx * 2 + g * 2); for (let c = st; c <= end && c !== 0xFFFF; c++) set.add(c); } }
  }
  assert.ok(set.size > 0, path + ' cmap'); return set;
}
const jua = woff2Cmap('assets/fonts/Jua.woff2'), extra = woff2Cmap('assets/fonts/DialogExtra.woff2');
let need = '';
for (const q of mains) { need += q.name || ''; for (const k of ['offerText', 'progressText', 'completeText']) if (q[k]) for (const p of parseStory(q[k], null, res)) need += plainText(p.html) + (p.who ? p.who.name : ''); }
for (const q of d.questList) for (const o of q.objectives || []) if (o.talkText) for (const p of parseStory(o.talkText, null, res)) need += plainText(p.html) + (p.who ? p.who.name : '');
const pro = J('prologue.json'); for (const P of pro.panels) for (const L of P.lines) need += plainText(L.text) + (L.who || '');
need += '“”이야기아카디아 대륙의 기록건너뛰기›계속 읽기→수락하기나중에돌아가기대화 종료메인 퀘스트✦장보상0123456789/×';
for (const id of new Set(mains.flatMap(q => [q.giver, q.turnIn]).filter(Boolean))) { const nd = d.npcs[id]; if (nd) need += (nd.name || '') + (nd.title || ''); }
const miss = [...new Set(need)].filter(c => !/\s/.test(c) && c !== '✦' && !jua.has(c.codePointAt(0)) && !extra.has(c.codePointAt(0)));
eq(miss.join(''), '', '대화 상자 글꼴(주아체 + DialogExtra)에 빠진 글자 없음');
ok([...'『』①無龍…'].every(c => !jua.has(c.codePointAt(0)) ? extra.has(c.codePointAt(0)) : true), '주아체에 없는 기호·한자는 DialogExtra에');
console.log(`대화 글꼴: ${new Set(need).size}자 확인(주아체 ${jua.size} + 보충 ${extra.size} 글리프)`);
// 2026-11-20 도트 글꼴(Galmuri) 제거: NPC 대화창(.window.dialog = 주아체 + DialogExtra)·NPC/몬스터/아이템 이름표(주아체 + DialogExtra)의 글자도 빠짐없이
{ let dlg = '', plate = 'Lv0123456789×', em = 0;
  for (const nd of Object.values(d.npcs)) { dlg += (nd.name || '') + (nd.title || '') + (nd.lines || []).map(plainText).join(''); plate += (nd.name || '') + (nd.title || ''); }
  for (const q of d.questList) for (const k of ['name', 'offerText', 'progressText', 'completeText']) if (q[k]) dlg += plainText(q[k]);
  for (const m of Object.values(d.monsters)) plate += m.name || '';
  for (const it of d.itemList) plate += it.name || '';
  const missD = [...new Set(dlg)].filter(c => !/\s/.test(c) && !jua.has(c.codePointAt(0)) && !extra.has(c.codePointAt(0)));
  const missP = [...new Set(plate)].filter(c => !/\s/.test(c) && !jua.has(c.codePointAt(0)) && !extra.has(c.codePointAt(0)));
  eq(missD.join(''), '', 'NPC 대화창 글꼴(주아체 + DialogExtra)에 빠진 글자 없음');
  eq(missP.join(''), '', '이름표 글꼴(주아체 + DialogExtra)에 NPC·몬스터·아이템 이름 글자가 모두 있음');
  console.log(`대화창·이름표 글꼴: ${new Set(dlg + plate).size}자 확인`); }
