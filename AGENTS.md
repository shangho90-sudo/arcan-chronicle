# AGENTS.md — AI 코딩 도구용 작업 안내

개발 현황은 [docs/STATUS.md](docs/STATUS.md). 작업을 마치면 그 문서의 "변경 기록"과 해당 항목을 갱신하세요.

이 문서는 Claude, Codex, Cursor, Copilot 등 어떤 AI 도구가 이 저장소를 수정하든 따라야 할 규칙입니다.
(사람이 읽어도 됩니다. 응답과 UI 문구는 한국어로 작성하세요.)

## 기본
- 빌드 없음. `python3 -m http.server 8765` 후 `http://localhost:8765/index.html`.
- three.js r160을 로컬 import map(`index.html`, `vendor/three-r160/`)으로 불러옵니다. CDN 장애 시 0% 멈춤을 방지하기 위해 동일 버전과 LICENSE를 저장소에 포함합니다. npm 의존성 없음. 새 라이브러리 추가 금지(필요하면 먼저 사용자에게 확인).
- 수정 후 반드시 실행: `node tests/core.test.mjs && node tests/skills2.test.mjs` (현재 377 통과/50 생략 — 존마다 C# 전용 검사 1개씩 생략, 606 통과).
- 테스트하지 않은 것을 "검증됨"이라고 보고하지 말 것.

## 데이터 우선
- 게임 내용은 전부 `assets/data/*.json`. 코드보다 데이터를 먼저 고치세요.
- `assets/data/skills2.json`은 **생성 파일**입니다. `tools/skills2/gen.py`를 수정하고 `python3 tools/skills2/gen.py`로 다시 만드세요(직업당 15개, id 중복 검사 포함).
- 스킬 런타임은 `js/skillrt.js`의 op(hit/proj/area/buff/shield/heal/summon/channel/melody/custom…)를 조합합니다. 새 동작은 가능한 기존 op 조합으로, 불가능할 때만 `CUSTOM` 핸들러 추가.

## 지켜야 할 규칙
- **저장 호환**: `core.js`의 `SAVE_VERSION`(현재 4 — v4에서 필드 위치 저장값은 버림, 필드 확대 때문)과 `migrate`. 저장 형식을 바꾸면 버전을 올리고 마이그레이션을 추가하세요. 기존 저장 데이터를 깨지 말 것.
- **저장 칸**: 0 = 자동 저장(`arcan_save_0`, 예전 키 그대로), 1~5 = 직접 저장(`SAVE_SLOTS`, `saveSlotKey`). 일시정지 "저장하기"와 시작 화면 "불러오기"는 `ui.js` `showSaveSlots`(`G.slotList`/`saveToSlot`/`loadSlot`), 확인 `tools/browser-tests/saveslots.js`. 시작 화면 그림의 버튼 글자는 그림에 들어 있음(`tools/ui/title_relabel.py`). 휴대폰 세로(`max-aspect-ratio:3/4`)에서는 그림 위쪽만 띠로 쓰고 실제 버튼을 아래에 세로로 배치, 캐릭터 만들기도 그림 위 64% + 아래 폼 패널(`index.html` title/create 블록, 확인 `tools/browser-tests/portraitshots.js`).
- **레벨 상한(50)·전직 레벨(Lv10/Lv30)** 은 몰래 바꾸지 말고, 바꾼다면 영향(경험치 곡선, 퀘스트, 저장)을 보고하세요.
- 판정은 발 위치 기준. 텔레그래프와 피격 판정은 같은 `HitShape`를 사용(rect는 시전 위치에서 앞으로 뻗음).
- 스킬 이펙트 연출 등급: `(차수-1)*3 + 스킬Lv`(궁극기 `+2+Lv`), 최대 10. 물리 스킬은 Lv 2마다 연타 +1, 타당 계수 `coef*base/hits*(1+0.06*추가타)`.
- 쿨타임은 슬롯 교체·재접속 후에도 유지. 스킬 초기화는 마을에서만.
- 능력치(힘·지능·민첩·생명력·행운, `core.js` `ATTRS`/`ATTR_FX`): 레벨당 3포인트(`P.apoints`), 투자분만 효과(기본 5는 직업 기본값에 포함). 명중·회피는 `missChance`(`Actor.takeDamage`에서 판정), 제작 성공은 `skillsys.js` `craftSuccessRate`(1단계 항상 성공). 수치를 바꾸면 `tests/core.test.mjs` TestAttributes도 함께.
- 기본 검술(`job: novice`, `nv_*` 5종)은 모든 직업의 계보 맨 앞에 붙어 전직 후에도 유지되며, 직업 포인트(`sk.points`)와 별개인 `sk.npoints`를 씁니다(Lv1부터 레벨당 1).
- 몬스터 능력치는 레벨 곡선으로 다시 계산(`core.js` `balanceMonsters`, monsters.json의 hp/atk/def/exp는 역할 판단용 원본), 레벨 차이 보정 `levelGapDamage`/`levelGapExp`. 필드 몬스터는 들어갈 때 고르게 다시 배치(`game.js` `Zone.evenSpawners`). 몬스터 이름표는 항상 표시(흰색 = 내 레벨 이하, 빨강 = 높음).
- 몬스터 공격 방식은 `js/creature.js` `CREATURES[id].atk`(동작)와 `js/actors.js` `Monster.resolve`(판정·이펙트)에서 함께 정합니다.
- UI 문구는 한국어.

## 화면 연출 (그래픽 효과)
- `js/post.js`: HDR 렌더 → 블룸, 따뜻한 색보정(필믹 커브·채도·대비), 비네트. 화면 위아래 흐림(tilt)은 사용자 요청으로 0(꺼짐) — 다시 켜지 말 것. 값은 `Post.params`(옅은 보라 대기 `haze`·`hazeCol` 포함, 존별 `zones.json` "post"). 설정의 "그래픽 효과"로 끌 수 있음(`settings.graphicsFx`).
- 마을 바닥 텍스처는 `tools/town/texgen2.py`로 생성(`pave`, `cobble`). 장미 문양 바닥·꽃잎·나뭇잎 그림자(보이지 않는 나무 그늘 캐스터)·장식 가로등은 `js/town3d.js`.
- HUD는 `index.html`의 "ornate gold HUD" CSS 블록과 `js/ui.js`의 `MENU_ICON`/`HUD_ICON`(SVG 아이콘). 배치: 왼쪽 위 초상화·이름, 오른쪽 위 미니맵(`js/minimap.js`, 퀘스트 NPC는 초록 "?" — `G.questState`; 누르면 지역 전체 지도 `ui.js` `showAreaMap`/`Minimap.drawFull`, 확인 `areamap.js`)·퀘스트, 가운데 아래 체력·기력·경험치·메뉴 버튼(`.botbar`). 처치 보상 연출(바닥 마법진·금빛 광주·별빛·EXP/골드 묶음 `.rwstack`, `RewardFx.kill`, 확인 `rewardshots.js`)·레벨업 날개는 `js/rewardfx.js`, 합성 효과음은 `Audio.chime`. 화면 확인은 `tools/browser-tests/hudshots.js`. 퀘스트 창(미니맵 아래 고정 HUD, 접기·닫기·`L` 키, 상태는 `profile.ui`)과 지역 이름 배너·첫 시작 환영 문구는 `js/questhud.js` — 퀘스트 진행을 화면 가운데 토스트로 다시 띄우지 말 것, 확인 `questhud.js`(브라우저 테스트). 퀘스트는 메인(이야기)/서브(사냥·채집)로 나뉨: `quests.json` `"category"`(새 퀘스트에 꼭 넣기), `core.js` `questCategory`, 목록 창(`ui.js` `showQuests`) 탭·HUD 표시, 확인 `questcats.js`. 휴대폰 배치는 `index.html` 끝의 "phone compact layout" 블록(세로: 체력 막대를 초상화 패널 안에, 가운데 비우기), 이동 패드는 유리 원판 + 금테 + 별 장식 SVG(`ui.js` `PAD_BASE`/`PAD_KNOB`, 확인 `padshots.js`), 휴대폰에서는 가운데 몬스터 정보 창(`#hTarget`)을 띄우지 않음(머리 위 이름표로 대신, 보스 막대는 유지), 휴대폰 게임 창은 `ui.fit`이 폭에 맞춰 재배치(`.window.phone`/`.narrow`, 최소 0.64배, 안에서 스크롤) — 확인 `mobileshots.js`. NPC 이름표·대화창 글꼴은 주아체(`assets/fonts/Jua.woff2`, OFL, 부분 집합 — `tools/fonts/jua_subset.py`로 다시 만듦). 모든 게임 창은 장식 창(`ui.js`의 `PLAIN`/`BANNER`, CSS `.window.fancy`, 확인 `windowshots.js`). 대화·타이틀·캐릭터 만들기만 예외.

## 프롤로그 (2026-11-08)
- 새 캐릭터는 마을에 나타나기 전에 서장을 봅니다(`game.js` `openCreate` → `playPrologue` → `enterWorld`). 대사·장면 제목·그림 설명·움직임은 `assets/data/prologue.json`, 재생 `js/prologue.js`. 그림 6장은 이미지 생성 도구로 만든 1600×900 일러스트(`assets/ui/prologue/p<N>.jpg`, 제작 정보·프롬프트는 같은 폴더 `README.md`). 교체하면 `fx` 위치 %도 조정. `tools/prologue/paint.py`는 예전 그림 보관용이며 `legacy-output/`으로만 출력합니다. 확인 `tools/browser-tests/prologue.js`(`BROWSER_PATH`로 설치된 브라우저 지정 가능).

## Blender 자산 (2026-11-04, `tools/blender/`, 자세한 내용 `tools/blender/README.md`)
- 나무·바위·덤불·풀/꽃·마을 소품은 Blender(bpy)로 절차 제작합니다: `paint.py`(손그림 텍스처) → `assets.py`(모델, LOD `_l0`/게임용/`_l2`/`_lo`) → `wrap.py`(→ `assets/forest/bl/`) → `validate_assets.py`. 직접 GLB를 고치지 말고 스크립트를 고친 뒤 다시 만드세요.
- GLB에는 이미지를 넣지 않습니다. 재질 이름이 공유 텍스처를 고릅니다(`tools/blender/texmap.py` ↔ `js/nature.js` `MAT_TEX`). 칠한 빛(AO·그라데이션)은 정점 색입니다.
- 잎 카드(`M_leaf*`)는 4정점이 한 점에 모인 카메라 빌보드(두 번째 UV = 크기·회전)입니다. 잘라낸 재질(`M_leaf*`, `M_plants`)은 뒷면 노멀을 뒤집지 않습니다.
- 마을 장식 배치는 `python3 tools/town/props_layout.py --write`(`town3d.blprops` + 충돌용 `props`의 `bl: true` 항목). 주의: 지금 저장된 배치는 스크립트 결과와 조금 다름(2026-11-08 모아 가게 앞 통·상자를 손으로 지움, 스크립트에는 `CLEAR`로 반영) — 다시 돌리면 다른 장식 위치도 바뀌니 결과를 화면으로 확인할 것. 숲 배치는 `tools/forest/layout.py --write`. 둘 다 바꾼 뒤 `node tools/forest/check_nav.mjs forest|town`(마을은 boss_gate 실패가 원래 상태).
- 카메라는 약한 원근(`render.js` `CAM`: 피치 44°(2026-11-06, 48°→44°), 거리 26 m, `ortho` = 초점 거리에서의 화면 반높이). 미리 그린 배경 그림 투영은 `CAM.artPitch`(48°, 바꾸지 말 것). 화면 → 땅 광선은 `Renderer.screenRay`.
- 화면 비교 캡처: `tools/browser-tests/styleshots.js`(마을 분수·대화, 숲 입구·길·나무·전투, 프레임 시간·draw call·삼각형).

## 필드 그래픽 (`zones.json`의 `"nature"`가 있는 존: 속삭이는 숲·독버섯 군락지·안개 골짜기·서리 고원·용의 유적)
- `js/nature.js`가 빌더의 평평한 바닥·원뿔 나무·상자 소품을 숨기고 다시 그립니다: 손그림 지면 셰이더(햇빛 잔디/그늘 잔디/흙/이끼, 반복 완화), 곡선 흙길(마스크는 존의 `patches` 경로에서 생성), Blender 나무·덤불·바위(모델·24 m 청크 단위 인스턴싱), 풀·꽃 덩어리(청크별 한 메시로 합침, 바람), 작은 돌, 플레이어를 가리는 나무 디더링.
- 배치는 `tools/forest/layout.py --write`(시드 고정)로 `zones.json`의 forest `props`를 다시 씁니다. 나무·바위·그루터기만 충돌(`propFootprint`), `shrub`·`flowers`는 장식. 배치를 바꾸면 `node tools/forest/check_nav.mjs`로 모든 포털·캠프·보스 입구 도달을 확인하세요.
- 모델 후처리 `tools/forest/process_models.py`, 텍스처 `tools/forest/texgen_forest.py`, 출처는 `assets/forest/README.md`.
- 호수·연못(존 `patches`의 `tex: water` 원판)은 `nature.js` `buildWater`가 셰이더 물(`WATER_FS`: 물가 마스크·깊이 색·물결·하늘 반사·반짝임·물가 물결선·젖은 띠)과 연잎으로 그림, 물가에는 갈대 카드. 빌더 물 메시는 `game.js`에서 숨김. 충돌은 그대로 원판(`r - 0.9`). 확인 `tools/browser-tests/watershots.js`.
- 그림자는 모델별 저폴리 사본(`*_lo`)만 그립니다(색 패스에서는 0개 인스턴스). 존별 후처리 값은 `zones.json`의 `"post"`.
- 화면 비교: `tools/browser-tests/forestshots.js` (정지·이동·근접·나무 뒤·전투, `W`/`H`/`TOUCH`로 화면비).

## 필드 크기·몬스터 배치 (2026-11-06)
- 네 필드는 160 m × 160 m(이전 80 m의 가로·세로 2배). 변환은 `tools/zones/scale_fields.py`(한 번만, 존에 `"scaled": 2` 표시): 좌표 2배, 고지대·경사로·보스 전장은 크기 그대로 통째로 이동, 길 폭 1.25배, 원형 패치 1.4배, 존 메시(`assets/zone_<id>.json`, 자연 존에서 보이는 지형·물·보스 바닥만)는 데이터에서 다시 생성. 숲은 `tools/forest/layout.py forest --write`, 나머지 세 필드의 빈 곳은 `tools/zones/fill_fields.py --write`(`"fill": true` 항목만 다시 만듦).
- 몬스터 스포너의 `"spread"`(m): 무리 대신 넓은 범위(`radius`)에 한 마리씩 최소 간격을 두고 나무 사이에도 생성, 각자 자기 자리 주변(최대 5 m)을 돌아다님. 플레이어 12 m 안에서는 다시 생기지 않음(`Zone.spacedSpot`). 스포너 중심 2.5 m 안에는 나무를 두지 않음.
- 충돌 판정 `ZoneGeometry.blocked`는 4 m 격자 버킷(`GRID_CELL`, 반지름 2 m 이하 질의)으로 찾음 — 소품이 수천 개라 필요.
- 숲 `to_grove` 워프 뒤 버섯 집: 소품 타입 `landmark`(`model` = `assets/props/<model>.glb.json`, `h` 높이, `r` 충돌), 만들기 `tools/props/mushhouse.py tripo|blender` → `tools/props/mushhouse_trim.py`(받침판 제거·틈 메움). 게임 재질 `nature.js` `landmarkMat`(손그림 음영 + 아래쪽 풀색 섞기), 둘레 꽃·덤불 `layout.py` `landmark_skirt`. 문은 모델 +X, `rot` 90 = 워프(-z) 쪽. 확인 `tools/browser-tests/mushhouse.js`. 글씨 표지판은 `signpost` + `text`(주아체 캔버스).
- 버섯 보스는 별도 존 `mushroom_grove`(독버섯 군락지, 경계 [-8,1,39,39]): 숲 북동쪽 길 끝 워프 `to_grove` ↔ `to_forest`. 배치는 `tools/forest/layout.py mushroom_grove --write`.

## 용흔 대륙 세계 (2026-11-06, 배경 스토리 『아르칸 연대기 — 흑룡의 계절』)
- `tools/world/world.py`가 마을 8곳(카이리온 왕도·발테른 공국·루미에르 신전·그라벨·실베른 영지·마르세온·발타자르 왕도·크로이츠 국경 요새)과 새 필드 35곳(기존 5곳 포함 필드 40곳), 연결(`LINKS`), 지도 좌표·권장 레벨·지역, 몬스터 변형, 이야기 NPC를 만듭니다. 결과: `assets/data/world/<id>.json`(존 전체 정의 + 존 메시 `mesh`), `zones.json`에는 스텁(`file`, `map`, `level`, `region`, `biome`)과 `"world"`(지역 이름·연결)만. 게임은 존에 들어갈 때 파일을 받습니다(`game.js` `buildZone`). 직접 고치지 말고 `world.py`를 고친 뒤 `python3 tools/world/world.py --write` → `node tools/forest/check_nav.mjs all`.
- 필드 생성: 140 m, 출구(이웃 방향)→중심 허브 길, 공터, 연못/강(물은 충돌), 생물군(`BIOMES`: 들판·숲·푸른숲·붉은숲·바위산·설원·황무지·심연·고원·습지·협곡·강변)별 소품 혼합과 밀도, 몬스터는 `spread` 스포너. 존별 잎 색 바꾸기는 `nature.foliage`(crimson/azure/ash/snow, `nature.js` `folSwap`, 텍스처 `paint.py` `foliage_world()`), 바닥 세트 `g_ash_`/`g_crimson_`/`g_stone_`(`ground_variants_world()`).
- 마을 생성: `town3d` 사양(성벽·탑·성문·궁/신전 `keep`(없어도 됨)·집·광장·장식·가로등)과 충돌 `blockPolys`. 첫 이웃은 남문 밖 워프, 나머지는 성 안 마법진 워프. NPC는 기존 3D 모델을 빌려 씀(npcs.json `model`), 마을마다 상인.
- 세계 지도: `js/worldmap.js`(M 키 / 메뉴 '지도'), 확대·축소, 장소를 누르면 권장 레벨·이어진 곳. 남색+금색 창(로고·나침반·범례·아래 정보 막대, CSS는 `index.html` "세계 지도 (js/worldmap.js, navy + gold chart)" 블록, 휴대폰은 로고 숨김). 배경 그림 `assets/ui/worldmap_bg.jpg`와 글꼴 `assets/fonts/ArcanSerif.woff`(Noto Serif CJK KR Bold 부분 집합, OFL)는 `python3 tools/world/paint_map.py`로 생성 — 세계 데이터(`world.py --write`)를 바꾸면 다시 실행. `paint_map.py`의 `OX, OY`와 `worldmap.js`의 `PAD`는 같아야 함. 글자 배치는 `layoutLabels`(화면 크기 고정·겹치면 자리 옮김/숨김, 확대할 때마다 다시). 확인 `tools/browser-tests/worldshots.js`(SIZE=390x844t 휴대폰).
- 새 몬스터 17종: Tripo 초안(`tools/monsters/tripo_new.py`, 키는 `~/.tripo/key`) → Blender 정리(`tools/monsters/blender_new.py`: 조각 제거, 9천 삼각형으로 줄이기, 바닥 맞춤, 기본색만 1024 px + 손그림 느낌 처리, 무광) → `assets/creatures/w_<name>.glb.json`. 능력치는 `world.py` `SPECIES`(공격 방식별 기존 몬스터 + 레벨 곡선 보간). 화면 확인 `tools/browser-tests/monstershots.js`.
- 몬스터 2차 묶음(`world.py` `SPECIES2`/`NEW_MONS`, Tripo `tools/monsters/tripo_more.py`): 모델이 있는 종만 들어감. 생성 필드의 무리는 필드 레벨 범위에 맞춘 `level`을 가짐(`core.js` `monsterAtLevel`).
- 지형 마스크(`nature.js` `paintMask`)는 길을 날카롭게 그린 뒤 한 번만 흐림 — 선분마다 blur 필터를 걸면 소프트웨어 GL에서 몇 분 걸림.

## 보스 전장 (독버섯 군락지 `mushroom_grove`, 2026-11-06)
- 바닥: `nature.js` `arenaMaterial`(빌더 `boss_floor` 지형에 적용) — 보라 흙·짙은 보라·갈색·이끼 색 덩어리, 붓 터치, 갈라짐, 낙엽·조약돌·포자, 흔들리는 잎 그늘. 텍스처는 `paint.py` `magic_floor()`(g_magic_*)를 잔결로만 씀.
- 배치: `tools/forest/layout.py mushroom_grove`의 "mushroom boss grove" 구간(플랫폼 위 가장자리 빽빽, 가운데 비움, 1 큰 + 2~4 중간 + 5~15 작은 묶음, 경계 밖 배경 나무 벽). 원형 바위는 `rock_magic*`. 타입 `mushdecor`(장식, 충돌 없음)·`mushtree`(충돌 `propFootprint`).
- 에셋(Blender `assets.py`): `mush_small_purple/blue`, `mush_glow_purple/blue`(약한 발광 + 바닥 빛 원판), `mush_orange`, `mush_cluster`, `mush_tree`, `rock_magic(_low)`, `tree_violet(_round)`. 발광 재질은 `MAT_TEX`의 `ec`/`ei`.
- NPC 머리 위 퀘스트 표시는 `game.js` `QMARK`(SVG "!"/"?"), 이름표 CSS `.plate.npc`(이름 20 px, 휴대폰 14 px, 주아체), 위치 `ui.js` `updatePlates`(+1.9 m).
- 지면 파쇄: `js/shatterfx.js`(`SkillFx.shatter.spawn(pos, R, {pal})`, BURST 정의의 `start`에서 호출), 메시는 `python3 tools/blender/fx_shatter.py` → `assets/fx/`. 화면 확인 `tools/browser-tests/shattershots.js`(KIND=ground_crack|fire_crack|explosion_big).
- 록온: `actors.js` `Player.lockOn`/`updateLock`(PC 클릭, 휴대폰 자동 — 멀어지면 `LOCK_RELEASE` 9 m에서 풀리고 가까운 몬스터로 다시/바꿔 록온), 표시 `render.js` `Fx.lockMark`, 확인 `tools/browser-tests/lockon.js`·`lockmobile.js`. 선공 없는 필드는 존 데이터 `"passiveMonsters": true`(지금은 속삭이는 숲만). 그와 별개로 Lv10 이하 몬스터는 어디서나 선공 없음(`actors.js` `PASSIVE_MAX_LEVEL`, `Monster.passive`, 보스 제외).
- 이동 클릭 표시: `render.js` `Fx.clickMark`(청록 마법진 셰이더 `CLICK_FRAG`, 하나만 재사용).
- 경고 표시: `render.js` `TelegraphView`(셰이더 하나: 바깥 빛 번짐·밝은 테두리·안쪽 그라데이션·룬 점선·전진 파동/맥동·입자, 공격은 산호색, 독 웅덩이는 보라 액체+거품, `seal`=봉인 마법진). 시간은 `TG_TIME`. 판정은 그대로 `HitShape`.
- 결계: `game.js` `setBarrier` — 봉인 마법진 + 거의 투명한 에너지 벽(위로 오르는 입자).
- 캐릭터/몬스터 재질: `render.js` `paintMat`(3단 밴딩·보라 그늘·아래쪽 따뜻한 차폐·림). 그림자 원판은 `contactShadowTex`(부드러운 보라).
- 화면 비교: `tools/browser-tests/bossshots.js`(같은 위치: gate·grove·arena·fight·barrier·rim, `ONLY`로 일부만, `TAG`로 이전/이후 구분). SwiftShader에서 전투 장면은 프레임당 1~2초라 한 번에 15~25분 걸림.

## 캐릭터 보행 (`js/model.js`)
- 걷기·달리기 다리는 절차 보행: `gaitParams`(속도·다리 길이 → 걸음/초, 보폭, 체공), `footAt`(발 궤적), `gaitPose`(3D 다리 IK, 상체), `ModelBody.lockFeet`(디딘 발 월드 고정). `alignLegs`는 키프레임 자세 전용.
- 보행 진단: `gait_probe.js`(FPS=30 가능) → `gait_report.py`(미끄러짐·걸음) + `gait_ik_report.py`(IK 도달 실패·무릎 각도), 화면은 `gait_views.js`(측면/정면/후면/게임 시점, 관절·접지 표시)와 `gait_side.js`(배경 없이 격자 위 캐릭터만, `PITCH=8 YAW=0`이면 옆모습, `MAG=0.35` 걷기). 달리기 흔들림 다리는 뒤꿈치 차올림(`footAt`의 `kick`). 골반 좌우 이동은 `mesh.position.x`(시각 전용)이며 다리 IK 목표에서 빼서 보정합니다.
- 이동 속도(4.6 m/s)를 낮춰서 보행을 맞추지 말 것. 바꾼 뒤에는 `tools/browser-tests/gait_probe.js` + `gait_report.py`로 디딘 발 미끄러짐·걸음 수를 남녀 모두 비교하고, `gait_film.js`로 화면을 확인하세요.

## 직업 모델 (2026-11-07)
- 전직하면 모습이 바뀌는 직업은 `model.js` `JOB_MODELS`(지금은 약사 `pharmacist_m`/`_f`, 대장장이 `blacksmith_m`/`_f`, 예술가 `artist_m`/`_f`, 요리사 `cook_m`/`_f`, 미용사 `hairdresser_m`/`_f` — 1차 직업 5개 모두). 모델은 반드시 같은 67뼈 휴머노이드 뼈대 GLB를 `python3 tools/models/glb_to_model.py <in.glb> <이름>`로 변환. 변신 연출은 `rewardfx.js` `JobChangeFx`(빛기둥·고치·날개·나팔·`Audio.chime('fanfare')`), 확인 `tools/browser-tests/jobchange.js`(`JOB=`·`GENDER=`).

## 칼 휘두르기 (`js/model.js`, `tools/anim/swings.py`)
- 공격 동작은 시간 키(`keys`, 초) + 구간 이징(`e`) + 칼 팔 IK(`hand`/`blade`/`elbow`) + 발 고정(`step`, `plant`)으로 정의합니다. actions.json의 `attack`/`attack2`는 `python3 tools/anim/swings.py`로 생성하세요(직접 편집 금지).
- 기본 검술 스킬 동작(`nv_yeon_<타수>`, `nv_ilgyeok`, `nv_biyeon`)도 `swings.py`의 `combo()`(타격 묶음 `ST` + `spin`/`ov`)로 생성. 여러 번 때리는 스킬은 `<anim>_<타수>` 동작이 있으면 그 동작의 `hitTimes`(타격 시각)·`hitFx`(타별 베기 효과)·`lunges`(전진)·`recover`를 씀(`skillrt.js` `cast`/`release`/`opHit`). 몸 회전은 `spins`(`model.js` `apply`). 확인 `tools/browser-tests/skill_film.js`(`SKILL= LV= ZOOM=`).
- 칼 잔상은 실제 칼날 위치에서 그립니다(`SwingTrail`, 동작의 `trail` 구간). 바꾼 뒤에는 `swing_film.js` → `tools/anim/strip.py`, `swing_report.py`(발 이동·그립·칼끝 속도)와 `attack_dirs.js`(실제 입력 8방향)로 확인하세요.

## 3D 자산
- 아티팩트 호스팅이 바이너리를 거부해서 GLB는 base64 JSON(`*.glb.json`)으로 래핑되어 있습니다. 원본 `.glb`가 함께 있는 것도 있습니다.
- `tools/tripo/`는 Tripo3D API 파이프라인입니다. API 키는 `~/.tripo/key` 파일에서 읽습니다. **키를 저장소에 커밋하지 마세요.**

## 브라우저 테스트 (선택)
- `tools/browser-tests/*.js`는 Playwright 스크립트입니다. 원래 작업 환경 경로(`/tmp/three160`, `/opt/dl/three.module.js`로 CDN을 가로챔, 결과는 `/tmp/sk/`)가 하드코딩되어 있으니, 인터넷이 되는 환경에서는 `ctx.route(...)` 두 줄을 지우고 쓰세요.
- `skilltest.js`: 180개 스킬 자동 시전 (`JOBS=painter ONLY=pt_a1 node skilltest.js`).

## 알려진 미완료
- 스킬 아이콘은 코드 생성 임시 아이콘.
- 몬스터: 귀여운 모델(`cute_*`)은 리깅이 없어 모든 동작이 절차 동작. 불씨 비룡 계열(drake)만 예전 모델.
- 모든 필드(40곳)가 `js/nature.js` 렌더(존별 `nature.ground`/`tint`/`rockTint`/`grass`/`lod`). 서리 고원은 색조만 차갑게(눈 덮인 잎 없음).
- 휴대폰 화면은 자동 화면 확인만 함(실기기 미확인). 사람이 처음부터 끝까지 플레이한 검증 없음.
- 원래 있던 Unity 프로젝트에는 미반영(이 저장소는 웹 버전만).
