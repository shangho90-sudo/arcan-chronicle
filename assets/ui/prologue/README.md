# 서장 · 별을 잇는 자 — 일러스트

2026-11-08, 기본 이미지 생성 도구(image_gen)로 만든 원화 6장입니다.
기존 대사 16줄과 장면 순서를 유지하고, 금빛·남색·보라를 중심으로 신화 삽화 분위기를 통일했습니다.
게임에는 1600×900, 품질 90의 progressive JPEG로 저장했습니다(6장 합계 약 2.2 MB).
그림 안에 글자나 대화창은 없으며, 한국어 제목과 대사는 실제 HTML로 표시합니다.

| 파일 | 장면 | 구성 |
| --- | --- | --- |
| p1.jpg | 태초의 두 의지 | 성운 속에서 탄생하는 백룡과 흑룡 |
| p2.jpg | 세상에 새겨진 상흔 | 용의 충돌, 갈라진 산맥과 바다 |
| p3.jpg | 다섯 개의 빛 | 번개·불꽃·바람·대지·생명의 다섯 빛 |
| p4.jpg | 별을 잇는 자 | 용의 별자리, 예언을 상징하는 여행자 |
| p5.jpg | 깨어나지 않은 심장 | 지라트 지하의 검은 결정 심장 |
| p6.jpg | 돌아보지 않은 밤 | 말라키온의 떠남, 저스티나의 손짓 |

## 제작 프롬프트

공통 지시:

> Create one full-bleed cinematic 16:9 landscape illustration, 1920x1080 or greater, for a premium Korean fantasy RPG prologue, Arcan Chronicle. Sophisticated hand-painted fantasy book cover, exquisite painterly detail and fine textured brushwork, atmospheric volumetric light, restrained jewel tones, beautiful value structure, rich midnight navy and antique gold, elegant rather than cartoonish. NOT a screenshot, NO text, NO lettering, NO border, NO UI, NO watermark. Keep the lower 22 percent quieter and darker for an external dialogue overlay.

각 장면 추가 지시:

1. **THE FIRST TWO WILLS.** In the primordial cosmic void two embryonic dragon spirits awaken, an enormous graceful pearlescent white serpentine dragon of warm golden starlight coils out of luminous ivory nebula on the left, a dark obsidian dragon of violet-black smoke coils out of purple nebula on the right. Both have refined antler-like horns, long whiskers, elegant elongated bodies, no wings. They are ethereal half-formed spirits, not solid monsters. Their faces face each other across a deep mysterious central abyss sprinkled with tiny gold stars. Sweeping balanced S-curves. Wide panoramic majestic composition, the focal heads around x35% and x65%, y40%. Sense of silence, divine birth and beautiful opposing forces.
2. **WAR THAT CARVED THE WORLD.** Two enormous elegant serpentine dragons with antler-like horns and whiskers, NO wings: pearlescent white and golden Arcan on the left and obsidian black with amethyst edge highlights on the right, clash above a newborn continent. Their long coiling bodies frame a brilliant white-gold collision at center upper third. Below, vast dark ocean surges between newly broken craggy mountain ranges, molten gold cracks cut the cliffs, lightning links sky and earth. Dynamic but legible dramatic composition, dragon faces detailed and noble, the black dragon menacing not grotesque. Painterly epic landscape, blue-black storm with warm gold and violet light, no gore.
3. **FIVE GIFTS TO A WOUNDED CONTINENT.** Majestic oblique aerial view over a vast richly painted fantasy continent with intricate mountain ranges, forests, rivers and coastlines in blue-green atmospheric mist. Across the upper sky a fading pearlescent serpentine dragon with antler horns dissolves into flowing golden dust. From its heart EXACTLY FIVE graceful luminous trails arc downward across the world, ending in five distinct small radiant jewel-like stars colored electric violet (lightning), orange ember (fire), pale cyan (wind), warm amber (earth), and emerald green (life), spread across the middle of the panorama. Far lower right a small barren dark peninsula with faint crimson wound hints at an evil heart buried underground. Not a diagram, not a game map, no labels or writing, an exquisite cinematic mythological painting, lyrical and bittersweet.
4. **PROPHECY OF THE STAR WEAVER.** A sublime deep indigo night sky above faraway misty mountains and a still reflective sea. A single majestic serpentine dragon-shaped constellation curves across the wide sky, made of delicate interconnected warm gold stars and shimmering fine nebula dust. The dragon's horned head is in the upper right middle, its long flowing S-shaped body sweeps left; very subtle translucent pearl dragon spirit within the constellation. At the bottom center a tiny solitary cloaked traveler stands on an ancient stone observatory terrace looking upward, dwarfed by the celestial vision. Subtle antique celestial circular arcs etched in starlight, not a technical diagram. Poetic, hushed, hopeful, luminous but not neon, lots of navy negative space and beautiful nuanced nebula.
5. **THE HEART BENEATH ZIRAT.** Epic wide landscape of a forsaken volcanic wasteland under a dusky black-red sky. Jagged ancient mountains and ruined monolithic stone spires recede into smoky burgundy haze. In the mid foreground a vast deep chasm opens in the earth; deep INSIDE it, a large obsidian heart-like crystal glows with dim red fissures, buried beneath the landscape, sending delicate branching crimson veins through surrounding black stone. This is a dark magical crystal, NOT an anatomical organ, NO gore. The landscape remains the main subject, heart is a restrained ominous focal point near center 55% height, no eruption or giant fireball. A few dead twisted trees along the rim, ash drifting, subtle amber horizon. Brooding, ancient, melancholic and cinematic.
6. **LEAVING LUMIERE.** Emotional wide cinematic fantasy painting on a moonlit temple terrace. On the LEFT, a magnificent ivory Gothic temple with tall slender columns, intricate carved arches and a softly golden open doorway. A young adult priestess with long pale silver hair in ivory and gold robes stands on the steps at x30%, reaching one hand toward her departing brother. On the RIGHT at x64%, a young adult male high priest with shoulder-length dark hair, elegant layered ivory robe with dark midnight cloak and gold embroidered trim walks away into the cool blue night, seen three-quarter from behind, head slightly lowered, never looking back. Both figures visibly detailed, dignified natural anatomy, not silhouettes. Cool moonlight casts long shadows across pale stone paving, distant mountains and cypresses, a full moon high on the right. Tension between the inviting warm temple doorway and vast cold darkness, sorrow and irreversible choice. Keep both figures in middle horizontal band so they survive landscape crops. No other people.

## 유지보수

- `assets/data/prologue.json`: 대사·제목·접근성 그림 설명·확대율·빛 위치. 이미지를 교체하면 빛 위치도 함께 조정합니다.
- `js/prologue.js`, `index.html`: 재생 및 반응형 화면. 본문은 시스템 한국어 고딕, 장면 제목은 시스템 명조를 사용합니다. 일부 글자만 있는 세계 지도용 ArcanSerif를 쓰지 않아 한 제목 안에서 글꼴이 섞이지 않습니다.
- `js/game.js`의 `playPrologue`: 캐릭터 선택창을 닫기 전에 즉시 서장 배경을 표시하고, 프롤로그 준비 후 넘깁니다. 실제 그림만 페이드인하므로 로딩 중 마을이 비치지 않습니다. `SLOW_PROLOGUE=1 LOCAL_FILES=1`로 파일 로딩을 지연시켜 전환 검증 가능.
- `tools/prologue/paint.py`: 이전 절차 그림을 보존한 도구. 새 원화를 덮어쓰지 않도록 `tools/prologue/legacy-output/`에만 출력합니다.
- 확인: `tools/browser-tests/prologue.js`. `SIZES=1280x720,390x844t,844x390t`, `OUT`, `BROWSER_PATH`, `GAME_URL` 지정 가능. 로컬 서버에 연결할 수 없는 환경은 `LOCAL_FILES=1`로 동일 저장소 파일을 브라우저 요청에 직접 제공합니다.

생성 원본 식별자(p1~p6 순서):
`625fae97-9a51-4235-94cc-ee65ddf704dc`, `51fe3b3f-1d73-44e0-8c37-80ba650ac787`, `7291219a-b6bf-4057-9a3a-fe98b7fba61d`, `e5f3aaea-abcc-4079-952b-4d7e5ac6d66e`, `b3ddbdba-ac9c-4c44-980f-c5ef733cb95c`, `9acd44de-5987-4e83-8a46-4f3012dbbb73`.
