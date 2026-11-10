# 기본공격 5단 콤보 (Sword_Combo_5Hit)

한손검 기본공격 5단 콤보의 Blender 장면·FBX·미리보기입니다. 동작의 원본은 게임 데이터이고, 이 폴더의 파일은 모두 생성물입니다.

| 단계 | 명령 | 결과 |
|---|---|---|
| 1. 동작 | `python3 tools/anim/swings.py` | `assets/models/actions.json`의 `combo_1`~`combo_5`, `combo_full` |
| 2. 굽기 | `URL=http://localhost:8765/index.html node tools/browser-tests/combo_bake.js` (`GENDER=f` 여자) | `bake_boy.json` — 게임 몸(IK·발 고정 끝난 결과) 60 fps, 뼈 67개 + 칼 + 칼날 + 루트 이동 |
| 3. Blender | `python3 tools/blender/combo5.py [bake.json] [--no-render]` | `combo5.blend`, `combo5.fbx`, `preview_quarter.mp4`, `views_front_side.png` |

## 동작 (60 fps, 150프레임)
| 타 | 프레임 | 타격 | 내용 |
|---|---|---|---|
| 1 | 1–22 | 12 | 오른쪽 어깨 위 → 왼쪽 허리 대각 내려베기, 오른발 0.18 m 내딛기 |
| 2 | 23–44 | 34 | 1타 끝(왼쪽 아래)에서 되감지 않고 오른쪽 위로 올려베기 — 1타와 X자 |
| 3 | 45–70 | 58 | 허리~가슴 높이 오른쪽 → 왼쪽 넓은 수평베기, 두 발 축 회전(등을 보이지 않음) |
| 4 | 71–94 | 83 | 팔꿈치를 접어 칼을 오른쪽 옆구리로, 앞발 0.22 m 내딛으며 짧은 찌르기(골반·가슴 전진) |
| 5 | 95–130 | 116 | 오른쪽 어깨 위로 들어 올려 길게 모은 뒤 묵직한 사선 내려베기, 앞발에 체중 |
| 복귀 | 131–150 | — | 무게를 받아내고 뒷발을 모아 전투 대기 자세 |

전체 전진은 0.24 m(루트 이동). 칼끝은 가장 낮을 때도 바닥에서 약 0.25 m 위입니다.

## 액션과 마커
- `Sword_Combo_5Hit` — 150프레임 전체(+1). 마커 `Hit_1`~`Hit_5`(12·34·58·83·116 → Blender 프레임은 +1), `Strike_1`~`Strike_5`(각 타 시작).
- `Attack_01`~`Attack_05` — 한 타씩. 첫 프레임 = 앞 타가 끝난 자세(1타는 대기 자세), 끝에는 대기 자세로 돌아가는 회복 구간(5타는 실제 마무리 131–150). 마커 `Hit`, `Chain_Open`(다음 입력을 받기 시작), `Chain_Close`(이후 누르면 1타부터).
- 모든 액션에 `_InPlace` 판이 있습니다.
- 히트스톱은 동작에 넣지 않았습니다. 게임에서 `Hit` 마커 프레임에 거세요.

## 루트 이동 / 제자리
- 뼈 `Root`(발밑, `Hips`의 부모)가 앞 방향 이동만 가집니다. 원본 액션은 `Root`가 앞으로 움직이고, 디딘 발은 땅에 고정됩니다.
- `_InPlace` 액션은 `Root`를 원점에 고정합니다. 디딘 발은 그 이동량만큼 뒤로 움직입니다. 엔진이 원본 액션의 `Root` 곡선만큼 캐릭터를 옮기면 발이 다시 고정됩니다.
- 게임(`js/actors.js` `comboRoot`)은 원본처럼 동작합니다. 동작의 `adv` 값만큼 배우를 옮기고, `js/model.js` `plantLegs`가 발을 `step - adv`에 둡니다.

## 축과 내보내기
- Blender에서 Z가 위이고, 캐릭터는 −Y를 봅니다. 미터 단위이고 크기 1.0입니다.
- FBX 내보내기 설정:
  - `axis_forward='-Z'`, `axis_up='Y'`, `apply_unit_scale=True`
  - `primary_bone_axis='Y'`, `secondary_bone_axis='X'`, `add_leaf_bones=False`
  - `bake_anim=True`, `bake_anim_use_all_actions=True`: 액션마다 테이크 하나, 모든 프레임에 키
  - 텍스처는 파일에 넣지 않습니다. `assets/models/boy.jpg`를 쓰세요.
- 뼈의 쉬는 자세(rest)는 게임 모델의 바인드 행렬입니다(`assets/models/boy.json`, 67뼈). 그래서 뼈 방향이 원래 GLB 관절 축을 따릅니다.

## 칼과 궤적
- 칼(`Sword`)은 단순한 한손검 메시이고, `Right_Hand` 뼈에 붙어 있습니다. 게임 소품과 같은 위치이고, 칼끝 오차는 0 mm로 확인했습니다.
- 궤적은 컬렉션 `Trails`에 있는 `Trail_1`~`Trail_5`입니다. 각 타의 게임 궤적 구간에서 실제 칼날의 밑과 끝을 이은 리본이고, 타격 −3~+5 프레임 동안만 보입니다. 컬렉션을 숨기면 꺼집니다.
  - 색은 흰 중심과 옅은 청색 가장자리입니다(재질 `M_trail`).
  - 5타는 칼날 아래쪽(20%)부터 그려 더 넓고 선명합니다.
  - 4타 찌르기는 직선 잔상이 됩니다.

## 미리보기
- `preview_quarter.mp4`: 게임과 같은 44° 쿼터뷰, 직교 카메라, 0.25 m 격자 바닥, Cycles CPU, 8샘플, 640×480, 60 fps.
- `views_front_side.png`: 정면(위)·측면(아래)이고, 대기 → 타격 1~5 → 복귀 순서입니다.
