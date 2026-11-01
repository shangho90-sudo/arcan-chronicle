# 숲 3D 에셋 출처

| 파일 | 내용 | 생성 방법 | Tripo 작업 ID |
|---|---|---|---|
| `models/tree_a.glb.json` (+ `tree_a_lo` 그림자용) | 큰 둥근 활엽수 (여러 겹 잎 덩어리, 뿌리 노출) | Tripo text_to_model v3.0 | 78e9379c-261a-44dc-89e2-72ab50aac3d7 |
| `models/tree_b.glb.json` (+ `tree_b_lo` 그림자용) | 키 큰 전나무 (층층이 처진 가지) | Tripo text_to_model v3.0 | 2ef5ed45-3a53-443f-9251-e5d241ebfaae |
| `models/tree_c.glb.json` (+ `tree_c_lo` 그림자용) | 비대칭 수관의 오래된 참나무 (뒤틀린 줄기, 이끼) | Tripo text_to_model v3.0 | 9329acd2-a5fe-4774-9929-ec083209ab20 |
| `models/tree_d.glb.json` (+ `tree_d_lo` 그림자용) | 가는 자작나무 계열 (흰 줄기, 가벼운 수관) | Tripo text_to_model v3.0 | 9f9b7c1e-30f5-4530-ae3d-1c098d1a2a25 |
| `models/bush_a.glb.json` | 둥근 잎 덤불 (흰 꽃 약간) | Tripo text_to_model v3.0 + texture_model(재텍스처) | 33509422-be1d-4d7a-b69d-9916c3455761 / a010e16e-548e-4150-ab43-6d1445fa331c |
| `models/bush_b.glb.json` | 고사리·넓은 잎 하층 식물 | Tripo text_to_model v3.0 | ae3417fd-33ab-4cbb-bd8a-52d746b33e01 |
| `models/rock_a.glb.json` (+ `rock_a_lo` 그림자용) | 이끼 낀 큰 바위 | Tripo text_to_model v3.0 | 304c6257-5f97-498f-a932-8f808d3061d2 |
| `models/rock_b.glb.json` (+ `rock_b_lo` 그림자용) | 작은 돌 무더기 | Tripo text_to_model v3.0 | 7bc64014-cf38-41cc-8394-0268bece1c73 |
| `models/stump.glb.json` (+ `stump_lo` 그림자용) | 이끼 낀 그루터기 | Tripo text_to_model v3.0 + texture_model(재텍스처) | f7a55de6-1eda-41c9-a49d-63df98b18f71 / 9b2986bb-ad3a-4bbe-a6f6-d14316349af3 |
| `models/ruin.glb.json` (+ `ruin_lo` 그림자용) | 이끼 낀 부서진 석주 | Tripo text_to_model v3.0 | eb773fee-0339-4d53-b68c-ea8da8aa87bb |
| `models/mushroom.glb.json` (+ `mushroom_lo` 그림자용) | 큰 숲 버섯 무리 | Tripo text_to_model v3.0 | a1d5ef2d-7424-48f1-8fc0-aec78d516c22 |

- 생성: 2026-11-01, 프로젝트 소유자의 Tripo3D 계정(API). 프롬프트 공통 스타일: "stylized hand-painted fantasy RPG game asset, Ghibli-like storybook style, soft painterly texture, matte, no ground plane".
- 사용 조건: Tripo3D 서비스 약관과 해당 계정 요금제의 생성물 이용 조건을 따릅니다(상업적 이용 가능 여부는 요금제에 따라 다르므로 배포 전 계정 요금제를 확인하세요).
- 후처리: `tools/forest/process_models.py` (바닥 패치 제거, gltfpack 정리, 텍스처 1024/512 축소, 그림자용 저폴리 사본 생성, base64 JSON 래핑).
- 원본 GLB(약 1.5~4 MB)는 저장소에 넣지 않았습니다. 다시 만들려면 위 작업 ID로 Tripo에서 내려받거나 같은 프롬프트로 재생성하세요.

## 텍스처
- `tex/grass_sun.jpg`, `tex/grass_shade.jpg`, `tex/dirt.jpg`, `tex/moss.jpg`, `tex/foliage_atlas.png`: `tools/forest/texgen_forest.py`로 절차 생성(외부 이미지 사용 없음, 시드 고정).
