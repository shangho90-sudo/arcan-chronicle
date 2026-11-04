# Blender 자산 파이프라인 (tools/blender)

손그림풍 스타일라이즈드 자산을 Blender(bpy 모듈, 화면 없이 실행)로 절차 제작합니다. `pip install bpy` (Blender 5.2 LTS, Python 3.13에서 확인).

| 단계 | 명령 | 결과 |
|---|---|---|
| 1. 텍스처 | `python3 tools/blender/paint.py` | `tools/blender/tex/*.png`(잎·잎 카드·나무껍질·돌·나무판·식물 아틀라스), `assets/forest/tex/g_*.jpg`(바닥 세트 + 노멀) |
| 2. 모델 | `python3 tools/blender/assets.py [이름...]` | `tools/blender/out/<이름>{_l0,,_l2,_lo}.glb` |
| 3. 게임용 변환 | `python3 tools/blender/wrap.py` | `assets/forest/bl/*.glb.json`(base64), `assets/forest/bl/tex/`, `manifest.json` |
| 4. 검사 | `python3 tools/blender/validate_assets.py` | LOD 존재·삼각형 예산·COLOR_0/UV·재질-텍스처 매핑·`js/nature.js` 재질 표 일치 |
| 미리보기 | `python3 tools/blender/preview.py 이름...` | 게임과 같은 재질 규칙으로 Cycles 렌더(`/tmp/prev.png`) |

규칙
- 미터 단위, Blender Z 위(내보낼 때 Y 위), 원점은 줄기/바닥 중심.
- LOD: `_l0` 고정밀(미리보기·캡처용, 저장소에는 넣지 않음), 이름 그대로 = 게임용, `_l2` 저사양(휴대폰·그래픽 효과 끔), `_lo` 그림자 전용.
- GLB에는 이미지를 넣지 않습니다. 재질 이름(`M_bark`, `M_foliage_warm`, `M_leaf`, `M_stone`, `M_plants` …)이 공유 텍스처를 고릅니다(`texmap.py` ↔ `js/nature.js`의 `MAT_TEX`).
- 칠한 빛은 정점 색(COLOR_0)에 있습니다: Cycles AO 베이크 × 높이 그라데이션 × 위쪽 빛 × 색조 흔들림. 실시간 해는 방향만 더합니다.
- 나무: 줄기·가지·뿌리 튜브 + 잎 덩어리(겹친 울퉁불퉁한 구, 안쪽 면 제거, 덩어리 중심 기준 노멀) + 카메라를 향하는 잎 카드(4정점이 한 점, 두 번째 UV에 크기·회전 → 셰이더에서 펼침).
- 바위: 흔든 타원체 점들의 볼록 껍질 + 모서리 깎기 + 곡률 하이라이트 + 위쪽 면 이끼.
- 풀·꽃: 교차 카드 덩어리(아틀라스 4×2).
