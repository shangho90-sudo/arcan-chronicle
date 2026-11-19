// 메인 스토리 대화 장면에 나오는 NPC 화자 가운데 2D 일러스트(assets/ui/story/portraits.json)가 없는 사람 목록.
// 화자 = 메인 퀘스트(받기·진행·완료 대사)의 주는/완료 NPC + 대사 속 <b class='gold'>이름</b> + 대화 목표의 talkText(그 NPC).
//   node tools/story/missing_art.mjs            # 이 저장소 데이터
//   ROOT=/다른/작업트리 node tools/story/missing_art.mjs
// 일러스트가 없으면 게임은 3D 모델 반신 렌더를 씀(틀린 것은 아님) — 새 일러스트는 tools/story/portraits.py.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/** {key → {name, title, quests:Set}} of every NPC who speaks in a main-quest scene (players / story bosses left out) */
export function mainSpeakers(d, { parseStory, makeResolver }, questCategory) {
  const res = makeResolver(d, '테스터'), out = new Map();
  const add = (key, q) => {
    if (!key || key === 'player' || key.startsWith('mon:')) return;
    const n = d.npcs[key]; if (!n) return;
    if (!out.has(key)) out.set(key, { key, name: n.name, title: n.title, quests: new Set() });
    out.get(key).quests.add(q.id);
  };
  const speak = (q, html, npcId) => {
    if (!html) return; const npc = d.npcs[npcId];
    for (const p of parseStory(html, npc ? { key: npc.id, name: npc.name } : null, res)) if (p.who) add(p.who.key, q);
  };
  for (const q of d.questList.filter(q => questCategory(q) === 'main')) {
    speak(q, q.offerText, q.giver);
    speak(q, q.progressText, q.turnIn || q.giver);
    speak(q, q.completeText, q.turnIn || q.giver);
    for (const o of q.objectives || []) if (o.type === 'talk' && o.talkText) speak(q, o.talkText, o.target);
  }
  return out;
}

/** speaker keys whose portrait manifest has no illustration (by key or by `names`) */
export function missingArt(speakers, manifest) {
  const P = (manifest && manifest.portraits) || {};
  const names = new Set(Object.values(P).flatMap(v => (v && v.names) || []));
  return [...speakers.values()].filter(s => !P[s.key] && !names.has(s.name));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const ROOT = resolve(process.env.ROOT || new URL('../..', import.meta.url).pathname);
  globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  const { GameData, questCategory } = await import(pathToFileURL(ROOT + '/js/core.js').href);
  const sp = await import(pathToFileURL(ROOT + '/js/storyparse.js').href);
  const J = n => JSON.parse(readFileSync(ROOT + '/assets/data/' + n, 'utf8'));
  const files = {}; for (const f of ['config', 'levels', 'jobs', 'skills', 'skills2', 'items', 'monsters', 'quests', 'npcs', 'zones']) files[f] = J(f + '.json');
  const d = new GameData(files);
  const spk = mainSpeakers(d, sp, questCategory);
  const man = JSON.parse(readFileSync(process.env.MANIFEST || ROOT + '/assets/ui/story/portraits.json', 'utf8'));
  const miss = missingArt(spk, man);
  console.log(`메인 장면 NPC 화자 ${spk.size}명, 일러스트 없음 ${miss.length}명`);
  for (const s of miss) console.log(`  ${s.key}\t${s.name}\t${s.title || ''}\t${[...s.quests].slice(0, 6).join(',')}`);
}
