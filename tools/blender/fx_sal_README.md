# 일격참 '살(殺)' 찌르기 이펙트 — 자산과 적용 안내

웹 게임(three.js)에는 `js/salfx.js`로 적용되어 있습니다. 이 저장소에는 Unity 프로젝트가 없으므로 Unity Prefab은 만들지 않았고, 아래에 Unity로 옮길 때의 재질·타이밍·구성 값을 적어 둡니다.

## 파일

| 파일 | 내용 |
| --- | --- |
| `tools/blender/fx_sal.py` | 생성 스크립트 (Blender 5.2 bpy, `python3 tools/blender/fx_sal.py`). 맨 위 값으로 길이·굵기·광선 개수 조절 |
| `tools/blender/sal/fx_sal.blend` | 수정용 원본. 컬렉션 `SAL_cast`(응집·전방 섬광) / `SAL_hit`(명중광) / `SAL_shared`(파편·빌보드). 재질 `M_sal`은 Blender 미리보기 전용(마스크 → 흰·분홍·보라 발광) |
| `tools/blender/sal/fx_sal.fbx` | 다른 엔진용 메시 (axis_forward −Z, up Y, bake_space_transform) |
| `assets/fx/fx_sal.glb.json` | 게임 메시 (base64 GLB, 이미지 없음) |
| `assets/fx/fx_sal.png` | 512×512 아틀라스. 색이 아니라 마스크: R = 백색 코어, G = 본체(분홍/자홍), B = 보라 잔광, A = 덮임 |

메시(게임 축: +Z = 공격 방향, +Y = 위), 합계 494삼각형:

| 메시 | 삼각형 | 기준점 | 역할 |
| --- | --- | --- | --- |
| `sal_thrust_core` | 24 | 칼끝, 길이 1(+Z) | 흰 중심 광선 (교차 면 2장) |
| `sal_thrust_sheet` | 36 | 칼끝 | 분홍→보라 얇은 빛막 (0/60/120° 3장, 연 모양) |
| `sal_thrust_side` | 72 | 칼끝 | 길이가 다른 보조 광선 3개 (저사양에서 숨김) |
| `sal_hit_rays` | 192 | 명중점, 반지름 1 | 분홍 주광선 8개, 가장 긴 것이 +Z |
| `sal_hit_thin` | 144 | 명중점 | 보라 가는 광선 6개 (저사양에서 숨김) |
| `sal_shard` | 24 | 가운데, 길이 1 | 마름모 파편 (인스턴스) |
| `sal_quad` | 2 | 가운데 | 카메라를 보는 빛 (칼끝 응집, 명중 코어, 보라 잔광) |

## 타이밍 (시전 시작 = 0, 명중 = 0.10 s)

| 시간 | 내용 |
| --- | --- |
| 0.00–0.05 | 칼끝 빛 커짐 + 작은 빛 조각 4~6개가 중심으로 모임 |
| 0.05–0.12 | 전방 섬광이 지수 감속 곡선으로 늘어남 (시전자를 따라감) |
| 0.10–0.16 | 명중점: 백색 코어 0.025 s 만에 최대, 분홍 광선 0.035 s 만에 뻗음 |
| 0.16–0.30 | 코어 붕괴, 광선이 가늘어짐(텍스처 폭 0.15배까지), 분홍 → 보라 |
| 0.30–0.45 | 보라 잔광·가는 광선·파편 소멸, 전방 섬광은 0.34 s에 사라짐 |

게임에서는 스킬 데이터(`tools/skills2/gen.py` `nv_a1`)의 `fx` op `sal: 'cast'`를 타격 0.10 s 전(`at: -0.10`)에, 명중광은 `hit` op의 `fx.sal`로 실제 타격 이벤트에서 맞은 적마다 띄웁니다(아무도 안 맞으면 판정 선 끝). 명중광은 월드에 고정되어 캐릭터를 따라가지 않습니다.

## 조절 값 (`js/salfx.js` `SAL`, 브라우저 콘솔에서 `SAL_FX`)

`white / pink / magenta / purple` 색, `intensity`(밝기), `length`·`width`(전방 섬광), `hitSize`(명중광), `speed`(재생 속도). 저사양(휴대폰 또는 '그래픽 효과' 꺼짐): 보조 광선·가는 광선 숨김, 파편 14 → 6, 응집 조각 6 → 4. '섬광 효과 줄이기': 밝기 0.6배.

## Unity로 옮길 때 (URP 기준 예시, 프로젝트 확인 후 조정)

- 재질: Unlit 셰이더 하나. 텍스처 `fx_sal.png`(sRGB 끔, 압축 없음 또는 고품질). `col = white*R*(1-0.7h) + lerp(pink, magenta, h)*G + purple*B*0.85`, 결과에 `intensity * fade`를 곱하고 알파 = `A * fade * 0.6`. 블렌드 `One OneMinusSrcAlpha`(밝게 더하면서 배경을 조금 눌러 Bloom 없이도 모양이 보임), ZWrite Off, ZTest LEqual, Cull Off.
- 가늘어짐: 광선 메시의 UV v를 셀 중심(0.25) 기준으로 `1/thin`배 늘려 샘플링하고 셀 밖은 버림.
- Prefab: `Sal_Cast`(칼끝에 붙임: core·sheet·side MeshRenderer + 칼끝 빌보드 + 응집 Particle System 6개, Burst, 수명 0.055 s) / `Sal_Hit`(월드에 생성: rays·thin MeshRenderer + 코어·잔광 빌보드 + 파편 Particle System 14개, Mesh 렌더 모드 `sal_shard`, Stretched, 속도 3~7.5, Drag 5). 위 타이밍은 Animator 또는 스크립트 커브로.
- 연결: 공격 애니메이션의 타격 이벤트 0.10 s 전에 `Sal_Cast`, 타격 이벤트에서 맞은 대상 위치에 `Sal_Hit`. 풀링은 Prefab 단위로.
