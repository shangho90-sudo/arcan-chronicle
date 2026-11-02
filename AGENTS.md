# AGENTS.md — AI 코딩 도구용 작업 안내

개발 현황은 [docs/STATUS.md](docs/STATUS.md). 작업을 마치면 그 문서의 "변경 기록"과 해당 항목을 갱신하세요.

이 문서는 Claude, Codex, Cursor, Copilot 등 어떤 AI 도구가 이 저장소를 수정하든 따라야 할 규칙입니다.
(사람이 읽어도 됩니다. 응답과 UI 문구는 한국어로 작성하세요.)

## 기본
- 빌드 없음. `python3 -m http.server 8765` 후 `http://localhost:8765/index.html`.
- three.js r160을 로컬 import map(`index.html`, `vendor/three-r160/`)으로 불러옵니다. CDN 장애 시 0% 멈춤을 방지하기 위해 동일 버전과 LICENSE를 저장소에 포함합니다. npm 의존성 없음. 새 라이브러리 추가 금지(필요하면 먼저 사용자에게 확인).
- 수정 후 반드시 실행: `node tests/core.test.mjs && node tests/skills2.test.mjs` (현재 323 통과/6 생략, 603 통과).
- 테스트하지 않은 것을 "검증됨"이라고 보고하지 말 것.

## 데이터 우선
- 게임 내용은 전부 `assets/data/*.json`. 코드보다 데이터를 먼저 고치세요.
- `assets/data/skills2.json`은 **생성 파일**입니다. `tools/skills2/gen.py`를 수정하고 `python3 tools/skills2/gen.py`로 다시 만드세요(직업당 15개, id 중복 검사 포함).
- 스킬 런타임은 `js/skillrt.js`의 op(hit/proj/area/buff/shield/heal/summon/channel/melody/custom…)를 조합합니다. 새 동작은 가능한 기존 op 조합으로, 불가능할 때만 `CUSTOM` 핸들러 추가.

## 지켜야 할 규칙
- **저장 호환**: `core.js`의 `SAVE_VERSION`(현재 3)과 `migrate`. 저장 형식을 바꾸면 버전을 올리고 마이그레이션을 추가하세요. 기존 저장 데이터를 깨지 말 것.
- **레벨 상한(50)·전직 레벨(Lv10/Lv30)** 은 몰래 바꾸지 말고, 바꾼다면 영향(경험치 곡선, 퀘스트, 저장)을 보고하세요.
- 판정은 발 위치 기준. 텔레그래프와 피격 판정은 같은 `HitShape`를 사용(rect는 시전 위치에서 앞으로 뻗음).
- 스킬 이펙트 연출 등급: `(차수-1)*3 + 스킬Lv`(궁극기 `+2+Lv`), 최대 10. 물리 스킬은 Lv 2마다 연타 +1, 타당 계수 `coef*base/hits*(1+0.06*추가타)`.
- 쿨타임은 슬롯 교체·재접속 후에도 유지. 스킬 초기화는 마을에서만.
- 기본 검술(`job: novice`, `nv_*` 5종)은 모든 직업의 계보 맨 앞에 붙어 전직 후에도 유지되며, 직업 포인트(`sk.points`)와 별개인 `sk.npoints`를 씁니다(Lv1부터 레벨당 1).
- 몬스터 공격 방식은 `js/creature.js` `CREATURES[id].atk`(동작)와 `js/actors.js` `Monster.resolve`(판정·이펙트)에서 함께 정합니다.
- UI 문구는 한국어.

## 화면 연출 (그래픽 효과)
- `js/post.js`: HDR 렌더 → 블룸, 따뜻한 색보정(필믹 커브·채도·대비), 비네트. 화면 위아래 흐림(tilt)은 사용자 요청으로 0(꺼짐) — 다시 켜지 말 것. 값은 `Post.params`. 설정의 "그래픽 효과"로 끌 수 있음(`settings.graphicsFx`).
- 마을 바닥 텍스처는 `tools/town/texgen2.py`로 생성(`pave`, `cobble`). 장미 문양 바닥·꽃잎·나뭇잎 그림자(보이지 않는 나무 그늘 캐스터)·장식 가로등은 `js/town3d.js`.
- HUD는 `index.html`의 "ornate gold HUD" CSS 블록과 `js/ui.js`의 `MENU_ICON`/`HUD_ICON`(SVG 아이콘). 배치: 왼쪽 위 초상화·이름, 오른쪽 위 미니맵(`js/minimap.js`)·퀘스트, 가운데 아래 체력·기력·경험치·메뉴 버튼(`.botbar`). 경험치 구슬·레벨업 날개는 `js/rewardfx.js`, 합성 효과음은 `Audio.chime`. 화면 확인은 `tools/browser-tests/hudshots.js`. 퀘스트 창(미니맵 아래 고정 HUD, 접기·닫기·`L` 키, 상태는 `profile.ui`)과 지역 이름 배너·첫 시작 환영 문구는 `js/questhud.js` — 퀘스트 진행을 화면 가운데 토스트로 다시 띄우지 말 것, 확인 `questhud.js`(브라우저 테스트). 모든 게임 창은 장식 창(`ui.js`의 `PLAIN`/`BANNER`, CSS `.window.fancy`, 확인 `windowshots.js`). 대화·타이틀·캐릭터 만들기만 예외.

## 숲 그래픽 (속삭이는 숲, `zones.json`의 `"nature"`가 있는 존)
- `js/nature.js`가 빌더의 평평한 바닥·원뿔 나무·상자 소품을 숨기고 다시 그립니다: 손그림 지면 셰이더(햇빛 잔디/그늘 잔디/흙/이끼, 반복 완화), 곡선 흙길(마스크는 존의 `patches` 경로에서 생성), Tripo 나무·덤불·바위(모델·16 m 청크 단위 인스턴싱), 풀·꽃 카드(인스턴싱, 바람), 작은 돌, 플레이어를 가리는 나무 디더링.
- 배치는 `tools/forest/layout.py --write`(시드 고정)로 `zones.json`의 forest `props`를 다시 씁니다. 나무·바위·그루터기만 충돌(`propFootprint`), `shrub`·`flowers`는 장식. 배치를 바꾸면 `node tools/forest/check_nav.mjs`로 모든 포털·캠프·보스 입구 도달을 확인하세요.
- 모델 후처리 `tools/forest/process_models.py`, 텍스처 `tools/forest/texgen_forest.py`, 출처는 `assets/forest/README.md`.
- 그림자는 모델별 저폴리 사본(`*_lo`)만 그립니다(색 패스에서는 0개 인스턴스). 존별 후처리 값은 `zones.json`의 `"post"`.
- 화면 비교: `tools/browser-tests/forestshots.js` (정지·이동·근접·나무 뒤·전투, `W`/`H`/`TOUCH`로 화면비).

## 캐릭터 보행 (`js/model.js`)
- 걷기·달리기 다리는 절차 보행: `gaitParams`(속도·다리 길이 → 걸음/초, 보폭, 체공), `footAt`(발 궤적), `gaitPose`(3D 다리 IK, 상체), `ModelBody.lockFeet`(디딘 발 월드 고정). `alignLegs`는 키프레임 자세 전용.
- 보행 진단: `gait_probe.js`(FPS=30 가능) → `gait_report.py`(미끄러짐·걸음) + `gait_ik_report.py`(IK 도달 실패·무릎 각도), 화면은 `gait_views.js`(측면/정면/후면/게임 시점, 관절·접지 표시). 골반 좌우 이동은 `mesh.position.x`(시각 전용)이며 다리 IK 목표에서 빼서 보정합니다.
- 이동 속도(4.6 m/s)를 낮춰서 보행을 맞추지 말 것. 바꾼 뒤에는 `tools/browser-tests/gait_probe.js` + `gait_report.py`로 디딘 발 미끄러짐·걸음 수를 남녀 모두 비교하고, `gait_film.js`로 화면을 확인하세요.

## 칼 휘두르기 (`js/model.js`, `tools/anim/swings.py`)
- 공격 동작은 시간 키(`keys`, 초) + 구간 이징(`e`) + 칼 팔 IK(`hand`/`blade`/`elbow`) + 발 고정(`step`, `plant`)으로 정의합니다. actions.json의 `attack`/`attack2`는 `python3 tools/anim/swings.py`로 생성하세요(직접 편집 금지).
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
- 숲 그래픽 개편은 속삭이는 숲에만 적용(안개 골짜기·서리 고원·용의 유적은 예전 방식).
- 휴대폰 레이아웃의 스킬 버튼 배치 미확인. 사람이 처음부터 끝까지 플레이한 검증 없음.
- 원래 있던 Unity 프로젝트에는 미반영(이 저장소는 웹 버전만).
