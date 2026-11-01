# AGENTS.md — AI 코딩 도구용 작업 안내

개발 현황은 [docs/STATUS.md](docs/STATUS.md). 작업을 마치면 그 문서의 "변경 기록"과 해당 항목을 갱신하세요.

이 문서는 Claude, Codex, Cursor, Copilot 등 어떤 AI 도구가 이 저장소를 수정하든 따라야 할 규칙입니다.
(사람이 읽어도 됩니다. 응답과 UI 문구는 한국어로 작성하세요.)

## 기본
- 빌드 없음. `python3 -m http.server 8765` 후 `http://localhost:8765/index.html`.
- three.js r160을 CDN import map(`index.html`)으로 불러옵니다. npm 의존성 없음. 새 라이브러리 추가 금지(필요하면 먼저 사용자에게 확인).
- 수정 후 반드시 실행: `node tests/core.test.mjs && node tests/skills2.test.mjs` (현재 323 통과/6 생략, 576 통과).
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
- UI 문구는 한국어.

## 화면 연출 (그래픽 효과)
- `js/post.js`: HDR 렌더 → 블룸, 따뜻한 색보정(필믹 커브·채도·대비), 비네트. 화면 위아래 흐림(tilt)은 사용자 요청으로 0(꺼짐) — 다시 켜지 말 것. 값은 `Post.params`. 설정의 "그래픽 효과"로 끌 수 있음(`settings.graphicsFx`).
- 마을 바닥 텍스처는 `tools/town/texgen2.py`로 생성(`pave`, `cobble`). 장미 문양 바닥·꽃잎·나뭇잎 그림자(보이지 않는 나무 그늘 캐스터)·장식 가로등은 `js/town3d.js`.
- HUD는 `index.html`의 "ornate gold HUD" CSS 블록과 `js/ui.js`의 `MENU_ICON`/`HUD_ICON`(SVG 아이콘).

## 3D 자산
- 아티팩트 호스팅이 바이너리를 거부해서 GLB는 base64 JSON(`*.glb.json`)으로 래핑되어 있습니다. 원본 `.glb`가 함께 있는 것도 있습니다.
- `tools/tripo/`는 Tripo3D API 파이프라인입니다. API 키는 `~/.tripo/key` 파일에서 읽습니다. **키를 저장소에 커밋하지 마세요.**

## 브라우저 테스트 (선택)
- `tools/browser-tests/*.js`는 Playwright 스크립트입니다. 원래 작업 환경 경로(`/tmp/three160`, `/opt/dl/three.module.js`로 CDN을 가로챔, 결과는 `/tmp/sk/`)가 하드코딩되어 있으니, 인터넷이 되는 환경에서는 `ctx.route(...)` 두 줄을 지우고 쓰세요.
- `skilltest.js`: 180개 스킬 자동 시전 (`JOBS=painter ONLY=pt_a1 node skilltest.js`).

## 알려진 미완료
- 스킬 아이콘은 코드 생성 임시 아이콘.
- 4족 몬스터는 걷기 애니메이션만 있고 공격/피격/죽음은 절차 동작.
- 휴대폰 레이아웃의 스킬 버튼 배치 미확인. 사람이 처음부터 끝까지 플레이한 검증 없음.
- 원래 있던 Unity 프로젝트에는 미반영(이 저장소는 웹 버전만).
