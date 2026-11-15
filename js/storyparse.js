// 메인 스토리 대화 장면(js/storyscene.js)용 대사 나누기 — DOM·three.js 없이 순수 함수(tests/storyscene.test.mjs).
// quests.json의 offerText / progressText / completeText는 tools/quests/story.py `say()`가 만든 HTML:
//   "<b class='gold'>아스텔</b> 대사<br><i>서술</i><br>…"  (예전 퀘스트는 화자 표시 없이 대사만)
// 한 줄 = <br>로 나눈 조각. 화자 태그가 있으면 그 사람, <i>…</i>만 있으면 서술(화자 없음), 아무 표시도 없으면 그 퀘스트 NPC.
// 선택: <b class='gold' data-expr='angry'>아스텔</b> → 초상화 표정(assets/ui/story/portraits.json의 expr).
// 긴 줄은 문장 단위로 쪽(page)을 나눔(PAGE_MAX 글자).

export const PAGE_MAX = 86;
const TAG = /^<b class=['"]gold['"](?:\s+data-expr=['"]([\w-]+)['"])?>(.*?)<\/b>\s*/i;
const PLAYER_NAMES = new Set(['나', '{player}', '플레이어']);

export const plainText = h => String(h || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** split one line's HTML into pages of at most max visible characters, at sentence ends (lines with markup inside stay whole unless they are a single <i>) */
export function splitPages(html, max = PAGE_MAX) {
  html = String(html || '').trim(); if (!html) return [];
  if (plainText(html).length <= max) return [html];
  let wrap = null, body = html;
  const m = /^<i>([^<]*)<\/i>$/i.exec(html); if (m) { wrap = 'i'; body = m[1]; }
  if (/<[^>]+>/.test(body)) return [html];                       // inline markup: keep the line together
  const sents = body.split(/(?<=[.?!…~。]|다\.|요\.)\s+/).filter(Boolean);
  const out = []; let cur = '';
  for (const s of sents) {
    if (cur && (cur + ' ' + s).length > max) { out.push(cur); cur = s; }
    else cur = cur ? cur + ' ' + s : s;
  }
  if (cur) out.push(cur);
  return wrap ? out.map(t => `<${wrap}>${t}</${wrap}>`) : out;
}

/**
 * Turn a quest dialogue HTML into pages.
 * resolve(name) → speaker key or null (caller maps names to npc ids / 'player'); defaultWho = the NPC being talked to.
 * Returns [{ who: {key, name, expr} | null, html, narr }]
 */
export function parseStory(html, defaultWho, resolve = () => null, max = PAGE_MAX) {
  const pages = [];
  const lines = String(html || '').split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean);
  for (let line of lines) {
    let who = null, narr = false;
    const m = TAG.exec(line);
    if (m) {
      const name = plainText(m[2]).trim(); line = line.slice(m[0].length).trim();
      who = { key: PLAYER_NAMES.has(name) ? 'player' : (resolve(name) || null), name, expr: m[1] || null };
    } else if (/^<i>[\s\S]*<\/i>$/i.test(line) && !/<\/i>[\s\S]*<i>/i.test(line)) narr = true;
    else who = defaultWho ? { ...defaultWho } : null;
    if (!line) continue;
    for (const p of splitPages(line, max)) pages.push({ who: narr ? null : who, html: narr ? p.replace(/^<i>|<\/i>$/gi, '') : p, narr });
  }
  return pages;
}

/** speaker name → npc id (exact name) or monster id (name, or "칭호 이름" ending with the name) */
export function makeResolver(data, playerName) {
  const byName = new Map();
  for (const n of Object.values(data.npcs || {})) if (n && n.name && !byName.has(n.name)) byName.set(n.name, n.id);
  const mons = Object.values(data.monsters || {});
  return name => {
    if (!name) return null;
    if (playerName && name === playerName) return 'player';
    if (byName.has(name)) return byName.get(name);
    const m = mons.find(x => x && x.name === name) || mons.find(x => x && x.id && x.id.startsWith('qb_') && x.name && x.name.endsWith(' ' + name));
    return m ? 'mon:' + m.id : null;
  };
}
