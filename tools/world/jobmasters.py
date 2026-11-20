"""2차 전직 마스터 (2026-11-20 사용자 '2차 전직은 직업별로 따로 전직 npc 만들고 여러 마을에 흩어져서 배치').

world.py(배치·npcs.json)·gates.py(2차 전직 단계가 쓰는 지역)·story.py(전직 시험 qt_* 의 주는/완료 NPC)가 함께 씀.
마을은 모두 메인 22장 「다시 일어서는 손」(2차 전직, Lv30) 전에 열리는 곳(아르칸·카이리온·발테른·루미에르·그라벨·실베른).
(npc id, 2차 직업 id, 이름, 직함, 마을 id, 자리 힌트(towns.py stand), 모델(model.js NPC_MODELS), [대사…])
"""
MASTERS2 = [
    ('master2_western_pharmacist', 'western_pharmacist', '세린', '양약사 마스터', 'kairion_capital', 'lm:kairion_academy@-4', 'job2_wpharm',
     ['한 방울의 오차가 약을 독으로 바꾸지요. 정밀함이 곧 힘입니다.', '학술원 실험실에서 캡슐 제형을 연구하고 있어요.']),
    ('master2_herbalist', 'herbalist', '운학', '한약사 마스터', 'lumiere', 'lm:lumiere_pavilion@-3.5', 'job2_herb',
     ['풀 한 포기에도 하늘과 땅의 기운이 깃들어 있다네.', '신전 정원의 약초는 내가 돌보고 있지.']),
    ('master2_engineer', 'engineer', '가온', '엔지니어 마스터', 'gravel', 'lm:gravel_crane@-3.5', 'job2_eng',
     ['망치만 휘두르던 시절은 끝났어! 이제 기계가 대신 싸워 줄 차례야.', '이 기중기도 내가 손본 거라고.']),
    ('master2_chef', 'chef', '해담', '쉐프 마스터', 'town', 'lm:arcan_inn@3.5', 'job2_chef',
     ['요리는 무대고, 손님의 웃음이 박수지!', '산들바람 여관 부엌을 잠시 빌려 쓰고 있다네.']),
    ('master2_designer', 'designer', '나래', '디자이너 마스터', 'baltern', 'lm:baltern_tradehall@-3.5', 'job2_design',
     ['가위 한 번에 전장이 무대가 되지요.', '교역소에 들어오는 비단은 제가 먼저 골라요.']),
    ('master2_painter', 'painter', '현묵', '화가 마스터', 'silvern', 'lm:silvern_gazebo@3.5', 'job2_paint',
     ['붓끝에서 태어난 것은 붓끝으로 돌아가는 법.', '실베른의 숲은 그리고 싶은 것투성이로군.']),
    ('master2_musician', 'musician', '하율', '음악가 마스터', 'lumiere', 'lm:lumiere_belltower@3.5', 'job2_music',
     ['종소리도 노래의 한 소절이에요.', '선율로 사람의 마음을 움직이면, 전장도 움직일 수 있어요.']),
]
TOWNS2 = sorted({m[4] for m in MASTERS2})
