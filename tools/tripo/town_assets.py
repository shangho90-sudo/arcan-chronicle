"""마을 리뉴얼(2026-11-12) 랜드마크 건물·조형물의 Tripo 초안 모델 (마을마다 4개, 모두 36개).
Tripo text_to_model -> $RAW/town_<id>.glb (+ _preview.webp). 정리·게임용 메시는 tools/blender/town_assets.py.
이어 하기 가능: 받은 GLB는 건너뛰고, 진행 중인 작업 id는 $RAW/town_tasks.json에 적어 두었다가 다시 기다림.
Usage: python3 tools/tripo/town_assets.py [id ...]      (키 ~/.tripo/key — 저장소에 넣지 말 것; RAW 기본 /home/claude/town3d)
       python3 tools/tripo/town_assets.py --list"""
import json, os, sys, threading, time
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW', '/home/claude/town3d'); os.makedirs(RAW, exist_ok=True)
B = ('single isolated building, stylized fantasy RPG game asset, hand-painted look, cute chunky proportions, clean readable silhouette, warm saturated colours, '
     'complete model seen from outside, standing directly on the ground, no terrain, no ground plate, no base slab, no trees, no people, no background, no text')
P = ('single isolated prop, stylized fantasy RPG game asset, hand-painted look, chunky proportions, clean readable silhouette, warm saturated colours, '
     'no terrain, no ground plate, no people, no background, no text')
PROMPTS = {
    # 아르칸 마을 — 아늑한 시작 마을
    'arcan_windmill': 'a cozy village windmill with a round stone base, timber upper floor, four cloth sails and a red shingle roof, ' + B,
    'arcan_inn': 'a cozy two-storey village inn with a thatched straw roof, timber frame white plaster walls, a hanging mug sign and flower boxes, ' + B,
    'arcan_clocktower': 'a small rustic wooden village clock tower with a shingle roof and a brass bell on top, ' + B,
    'arcan_board': 'a wooden village notice board with a small shingle roof, pinned parchment notes and a lantern, ' + P,
    # 카이리온 왕도 — 왕국의 수도
    'kairion_guildhall': 'a grand royal guild hall, white stone walls, tall arched windows, blue slate roofs with gold trim, two small corner turrets and a wide entrance stair, ' + B,
    'kairion_academy': 'a royal academy building with a large blue dome, white marble columns and a golden spire, ' + B,
    'kairion_clocktower': 'a tall elegant white stone clock tower with a blue pointed roof, golden clock face and royal banners, ' + B,
    # 왕궁(2026-11-12): 왕이 사는 곳 — 북쪽 구역 한가운데
    'kairion_palace': 'a majestic royal palace, the residence of a king: white marble walls, a tall central hall with a golden crown-shaped spire, four round corner towers with royal blue conical roofs and gold finials, blue slate roofs with gold trim, a grand wide front staircase with a red carpet leading to a huge arched golden double door, balconies, tall arched stained glass windows, long royal blue banners with a golden crest, symmetrical front facade, ' + B,
    'kairion_statue': 'a monument statue of a noble king knight on a rearing horse holding a sword high, grey stone on a tall carved pedestal with gold plaque, ' + P,
    # 발테른 공국 — 바위산 교역 도시
    'baltern_tradehall': 'a ducal trade hall of grey mountain stone with steep dark blue roofs, a covered arcade of arches on the ground floor and hanging merchant banners, ' + B,
    'baltern_windmill': 'a sturdy mountain stone windmill tower with wooden sails and a blue conical roof, ' + B,
    'baltern_warehouse': 'a timber merchant warehouse with a big loading door, a wooden cargo crane with rope and stacked crates and barrels beside it, ' + B,
    'baltern_goat': 'a stone fountain with a proud mountain goat statue standing on a rock in the middle, water basin around, ' + P,
    # 루미에르 신전 — 신전 도시
    'lumiere_shrine': 'a small white marble shrine temple with a golden dome, slender columns, stained glass window and steps, ' + B,
    'lumiere_goddess': 'a white marble goddess statue with open arms and a halo on a round pedestal surrounded by lit candles, ' + P,
    'lumiere_belltower': 'a slender white stone bell tower with a golden bell under an open arched top and a pale blue pointed roof, ' + B,
    'lumiere_pavilion': 'a round white stone prayer pavilion gazebo with eight columns, a pale blue dome roof and climbing white flowers, ' + B,
    # 그라벨 — 변경 광산·채석 마을
    'gravel_headframe': 'a wooden mining headframe tower with a big pulley wheel, ropes, a small engine shed and an ore bucket, ' + B,
    'gravel_orecart': 'a wooden mine cart full of glittering ore on a short piece of rail track next to a pile of rocks and a pickaxe, ' + P,
    'gravel_crane': 'a wooden quarry treadwheel crane lifting a large cut stone block, ' + P,
    'gravel_lordhall': 'a rugged frontier lord stone hall with red tile roof, heavy timber beams, a watch balcony and red banners, ' + B,
    # 실베른 영지 — 숲의 영지
    'silvern_manor': 'an elegant forest manor house made of carved wood with curved green leaf-shaped roofs, round windows and vines, elven style, ' + B,
    'silvern_treehouse': 'a giant ancient tree with a cozy house built into the trunk, round door, small windows, a spiral stair and hanging lanterns, ' + B,
    'silvern_gazebo': 'a wooden garden gazebo covered with flowering vines, carved posts and a green shingle roof, ' + B,
    'silvern_deer': 'a carved wooden statue of a graceful deer with large antlers decorated with leaves and small lanterns, on a mossy stone plinth, ' + P,
    # 마르세온 — 동쪽 교역 도시
    'marseon_bazaar': 'an exotic trade bazaar pavilion with colourful striped cloth awnings, arched sandstone walls, hanging lamps and piles of goods, ' + B,
    'marseon_tower': 'a sandstone signal lighthouse tower with a bronze fire bowl on top and a spiral outer stair, ' + B,
    'marseon_bathhouse': 'an exotic sandstone bathhouse with a turquoise tiled dome, arched doorway and small minaret-like corner posts, ' + B,
    'marseon_caravan': 'a statue monument of a loaded merchant camel with packs and rugs, bronze on a sandstone plinth, ' + P,
    # 발타자르 왕도 — 검은 돌과 대장간의 수도
    'baltazar_forge': 'a great forge hall of dark basalt stone with three tall smoking chimneys, glowing orange furnace openings and red banners, ' + B,
    'baltazar_tower': 'a dark stone bell tower with a red pointed roof, iron clock face and crimson banners, ' + B,
    'baltazar_anvil': 'a giant black iron anvil monument with a huge hammer resting on it, on a dark stone pedestal with glowing orange runes, ' + P,
    'baltazar_kingstatue': 'a tall black obsidian statue of a stern armored king leaning on a great hammer, on a dark stone pedestal, ' + P,
    # 크로이츠 국경 요새 — 설원의 군사 요새
    'kreutz_watchtower': 'a tall wooden military watchtower with a snow covered roof, palisade base, ladder and a black imperial banner, ' + B,
    'kreutz_barracks': 'a long military barracks of dark timber and stone with a snow covered roof, small windows and weapon racks outside, ' + B,
    'kreutz_ballista': 'a large wooden siege ballista on a wheeled frame with iron fittings and a stack of bolts, dusted with snow, ' + P,
    'kreutz_brazier': 'a tall iron signal brazier tower with a blazing fire bowl on top of a stone column with chains, ' + P,
}
DETAILED = {'kairion_palace'}                    # 가까이서 크게 보이는 건물은 텍스처를 한 단계 높게
SEM = threading.Semaphore(int(os.environ.get('PAR', '4')))
LOCK = threading.Lock()
TASKS = os.path.join(RAW, 'town_tasks.json')
def tasks(): return json.load(open(TASKS)) if os.path.exists(TASKS) else {}
def save_task(name, tid):
    with LOCK: t = tasks(); t[name] = tid; json.dump(t, open(TASKS, 'w'), indent=1)

def gen(name):
    sys.path.insert(0, HERE); import tripo
    dst = os.path.join(RAW, 'town_' + name + '.glb')
    if os.path.exists(dst) and os.path.getsize(dst) > 10000: print(name, 'have', flush=True); return
    with SEM:
        tid = tasks().get(name)
        if not tid:
            for k in range(20):                                   # 429(동시 생성 한도)면 기다렸다가 다시
                r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': PROMPTS[name], 'texture': True, 'pbr': True, 'texture_quality': 'detailed' if name in DETAILED else 'standard'})
                if r.get('http_error') != 429: break
                time.sleep(30)
            if 'data' not in r: print(name, 'Tripo 요청 실패:', json.dumps(r, ensure_ascii=False)[:300], flush=True); return
            tid = r['data']['task_id']; save_task(name, tid)
        d = tripo.wait(tid); d = d.get('data', d); out = d.get('output') or {}
        url = out.get('pbr_model') or out.get('model') or out.get('base_model')
        print(name, d.get('status'), url is not None, flush=True)
        if not url:
            with LOCK: t = tasks(); t.pop(name, None); json.dump(t, open(TASKS, 'w'), indent=1)
            return
        for k in range(5):                                        # CDN이 가끔 연결을 끊음 — 몇 번 다시
            try: tripo.download(url, dst); break
            except Exception as e: print(name, 'download retry', k, e, flush=True); time.sleep(4)
        else: return
        if out.get('rendered_image'):
            try: tripo.download(out['rendered_image'], os.path.join(RAW, 'town_' + name + '_preview.webp'))
            except Exception as e: print(name, 'preview', e, flush=True)

if __name__ == '__main__':
    if '--list' in sys.argv:
        for k, v in PROMPTS.items(): print(k, '|', v[:110])
        sys.exit(0)
    names = [a for a in sys.argv[1:] if a in PROMPTS] or list(PROMPTS)
    th = [threading.Thread(target=gen, args=(n,)) for n in names]
    for t in th: t.start()
    for t in th: t.join()
    print('done', len([n for n in PROMPTS if os.path.exists(os.path.join(RAW, 'town_' + n + '.glb'))]), '/', len(PROMPTS), flush=True)
