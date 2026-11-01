# 아르칸 연대기 (Arcan Chronicle) — 웹 3D 액션 RPG

쿼터뷰 3D 액션 RPG. three.js r160(ES 모듈, CDN import map)만 사용하며 빌드 단계가 없습니다.

## 실행

```bash
python3 -m http.server 8765
# 브라우저에서 http://localhost:8765/index.html
```

`file://`로 직접 열면 JSON/모델을 불러오지 못하므로 반드시 로컬 서버로 실행하세요.

### 조작
| 키 | 기능 |
|---|---|
| 마우스 클릭 / WASD | 이동 |
| Space | 기본 공격 |
| 1~4 | 스킬 슬롯 |
| R | 궁극기 |
| K | 스킬창 |
| N | 제작창 |
| F | 대화 |

### 개발 도구 (브라우저 콘솔)
```js
G.dev.level(45); G.dev.job('painter'); G.dev.learnAll(); G.dev.dummies();
```

## 테스트

```bash
node tests/core.test.mjs      # 핵심 로직 (전투·퀘스트·저장·전직 등)
node tests/skills2.test.mjs   # 180개 스킬 데이터·규칙
```

브라우저 자동 테스트(Playwright)는 `tools/browser-tests/` 참고.

## 폴더 구조

```
index.html            진입점, CSS, three.js import map
js/
  game.js             게임 루프, 존 로딩, 저장
  core.js             데이터 로딩(GameData), 캐릭터 시트, 퀘스트, 상태이상, 저장 마이그레이션
  actors.js           플레이어/몬스터/보스/NPC/드롭 아이템
  render.js           three.js 렌더러, 카메라, 존 메시
  post.js             후처리(블룸·색보정·틸트시프트·비네트)
  model.js            주인공·NPC 3D 모델, IK 보행
  creature.js         몬스터 3D 모델(Tripo GLB) + 절차 애니메이션
  town3d.js           3D 성 마을
  items3d.js          절차 생성 3D 아이템 + 아이콘 렌더
  warp.js             워프 게이트
  skillsys.js         스킬 포인트·습득·슬롯·초기화·제작 규칙
  skillrt.js          스킬 실행 엔진(데이터 기반 op), 투사체·장판·소환
  skillfx.js          3D 스킬 이펙트(연출 등급 1~10)
  skillui.js          스킬창·제작창·슬롯바 UI
  ui.js, io.js        HUD·메뉴, 입력
  devtools.js         G.dev 테스트 도구
assets/
  data/*.json         모든 게임 데이터 (skills2.json = 180 스킬)
  zone_*.json         존 지형 메시
  creatures/ models/ town3d/   3D 모델 (GLB는 base64 JSON으로 래핑: *.glb.json)
tools/                데이터 생성기·자산 파이프라인·브라우저 테스트
tests/                Node 테스트
```

AI 도구로 수정할 때의 규칙은 [AGENTS.md](AGENTS.md)를 보세요.
