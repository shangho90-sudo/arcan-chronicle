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
// 주요 인물은 모두 NPC로 이어져야 함(그림·3D 초상)
for (const nm of ['아스텔', '카스티야', '카일러스', '케린', '저스티나', '로데릭', '요이센', '다이센', '치르젠', '얀베르', '볼드란', '베리온', '하람']) ok(res(nm) && d.npcs[res(nm)], nm + ' → NPC');
ok(res('그레이스') === 'mon:qb_grace_1' && res('말라키온') === 'mon:qb_malachion', '그레이스·말라키온 → 이야기 보스');
const man = JSON.parse(readFileSync(new URL('../assets/ui/story/portraits.json', import.meta.url), 'utf8'));
for (const [k, v] of Object.entries(man.portraits || {})) ok(existsSync(new URL('../assets/ui/story/' + v.file, import.meta.url)), '초상 파일 ' + k);
console.log(`storyscene: ${n} 통과 — 메인 ${mains.length}개, ${pages}쪽, 화자 있는 쪽 ${speakers}(NPC ${npcSpk}), 이어지지 않은 이름: ${[...unknown].map(([a, b]) => a + '×' + b).join(', ') || '없음'}`);
