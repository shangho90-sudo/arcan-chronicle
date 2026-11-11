"""장비 40종(유봉 10·갑옷 10·장신구 20, 2026-11-11)의 Tripo 초안 모델.
Tripo text_to_model -> $RAW/gear_<id>.glb (+ _preview.webp). 정리·아이콘·게임용 메시는 tools/blender/gear.py.
이어 하기 가능: 받은 GLB는 건너뛰고, 진행 중인 작업 id는 $RAW/gear_tasks.json에 적어 두었다가 다시 기다림.
Usage: python3 tools/tripo/gear_assets.py [id ...]      (키 ~/.tripo/key — 저장소에 넣지 말 것; RAW 기본 /home/claude/gear3d)
       python3 tools/tripo/gear_assets.py --list         (프롬프트 목록)"""
import json, os, sys, threading, time
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW', '/home/claude/gear3d'); os.makedirs(RAW, exist_ok=True)
STYLE = ('single object only, stylized fantasy RPG game item, hand-painted look, clean readable silhouette, rich saturated colours, '
         'centered, floating, no base, no stand, no ground plate, no background, no text')
# 유봉: "pestle"/"mortar"라고 쓰면 절구 그릇까지 붙어 나와서(약사 이펙트 때 두 번) 방망이 모양으로 풀어서 씀
CLUB = ('a short one-handed club weapon shaped like a slim bowling pin or baseball bat: a thick heavy rounded head at the top that narrows smoothly '
        'into a straight handle with a wrapped grip and a small round pommel at the bottom, standing upright, no bowl, no cup, no container, ')
ARMOR = ('a single torso chest armor piece displayed alone as if on an invisible mannequin, front view, short shoulder guards, '
         'no person, no head, no arms, no legs, no helmet, ')
PROMPTS = {
    # ---- 유봉 10
    'w_pestle_g1': CLUB + 'made of plain polished oak wood with a brown leather grip, simple and sturdy, ' + STYLE,
    'w_pestle_g2': CLUB + 'bronze metal head with two engraved bands, dark wooden handle, ' + STYLE,
    'w_pestle_g3': CLUB + 'polished grey steel head with riveted bands, black leather grip, ' + STYLE,
    'w_pestle_g4': CLUB + 'white silver with engraved vine patterns and a small blue gem in the pommel, elegant, ' + STYLE,
    'w_pestle_g5': CLUB + 'the head is a clear faceted blue crystal, silver handle with a blue ribbon, ' + STYLE,
    'w_pestle_g6': CLUB + 'pale green jade head carved with small white flowers, mossy wooden handle wrapped with a vine, ' + STYLE,
    'w_pestle_g7': CLUB + 'the head is frosted ice crystal with snowflake engravings, icy blue and white, silver handle, ' + STYLE,
    'w_pestle_g8': CLUB + 'the head is dark volcanic rock with glowing orange lava cracks, blackened iron handle, ' + STYLE,
    'w_pestle_g9': CLUB + 'carved from ivory dragon bone with a small horn spike, red dragon scale grip, ' + STYLE,
    'w_pestle_g10': CLUB + 'ornate royal gold with a black dragon coiled around the head and a purple gem, luxurious legendary weapon, ' + STYLE,
    # ---- 갑옷 10
    'a_armor_g1': ARMOR + 'quilted padded beige cloth gambeson with leather straps, ' + STYLE,
    'a_armor_g2': ARMOR + 'chainmail vest over a brown leather jerkin, ' + STYLE,
    'a_armor_g3': ARMOR + 'plain steel breastplate with leather belts, ' + STYLE,
    'a_armor_g4': ARMOR + 'knight plate cuirass in polished steel with blue cloth trim and gold edges, ' + STYLE,
    'a_armor_g5': ARMOR + 'shining silver scale mail armor with a white collar, ' + STYLE,
    'a_armor_g6': ARMOR + 'grey wolf fur and dark leather armor with fang toggles, ' + STYLE,
    'a_armor_g7': ARMOR + 'frost blue steel armor decorated with ice crystals and white fur collar, ' + STYLE,
    'a_armor_g8': ARMOR + 'red dragon scale armor with golden rims, ' + STYLE,
    'a_armor_g9': ARMOR + 'dark purple abyss guardian armor with glowing violet runes, ' + STYLE,
    'a_armor_g10': ARMOR + 'black dragon plate armor with gold trim and a red gem on the chest, legendary, ' + STYLE,
    # ---- 장신구 일반 12
    'ac_g1': 'a simple polished silver ring with a tiny engraved band, jewelry, ' + STYLE,
    'ac_g2': 'a brown leather bracelet cuff with bronze studs and a buckle, ' + STYLE,
    'ac_g3': 'a pair of blue teardrop gem earrings with silver hooks, ' + STYLE,
    'ac_g4': 'a necklace made of a hawk feather and a small bronze talon charm on a leather cord, ' + STYLE,
    'ac_g5': 'a golden anklet ring with two small white feather wings, wind charm, ' + STYLE,
    'ac_g6': 'a pearl necklace with a pale misty blue-green glowing central pearl, ' + STYLE,
    'ac_g7': 'a single silver earring with a white-blue snowflake crystal, ' + STYLE,
    'ac_g8': 'a dark ring shaped like twisted red thorns holding a small crimson gem, ' + STYLE,
    'ac_g9': 'a pendant with a glowing orange flame-shaped heart gem in a gold frame on a chain, ' + STYLE,
    'ac_g10': 'a heavy steel signet ring with a small shield emblem and a blue gem, guardian seal, ' + STYLE,
    'ac_g11': 'an amulet with a large purple eye-shaped gem in a dark silver frame, mysterious abyss eye, ' + STYLE,
    'ac_g12': 'a legendary pendant with a large teal teardrop gem held by a small golden dragon claw, ' + STYLE,
    # ---- 직업 전용 8
    'ac_j_pharm': 'a small silver balance scale charm pendant with two tiny pans and a green leaf, apothecary charm, ' + STYLE,
    'ac_j_cook': 'a small golden soup ladle charm with a red ribbon, chef charm, ' + STYLE,
    'ac_j_smith': 'a small black iron anvil amulet with a glowing orange flame on top, blacksmith charm, ' + STYLE,
    'ac_j_hair': 'an elegant silver hair comb with pink gems, hairdresser charm, ' + STYLE,
    'ac_j_art': 'a round painter palette brooch with rainbow paint dabs and a tiny brush, artist charm, ' + STYLE,
    'ac_j_herb': 'a small jade green herbal medicine teapot pendant with steam swirl and a gold lid, ' + STYLE,
    'ac_j_craft': 'a golden gear cog brooch with a small hammer and a needle crossed in the centre, artisan badge, ' + STYLE,
    'ac_j_muse': 'an earring with a golden star and a blue music note hanging from it, sparkling, ' + STYLE,
}
SEM = threading.Semaphore(int(os.environ.get('PAR', '4')))
LOCK = threading.Lock()
TASKS = os.path.join(RAW, 'gear_tasks.json')
def tasks(): return json.load(open(TASKS)) if os.path.exists(TASKS) else {}
def save_task(name, tid):
    with LOCK: t = tasks(); t[name] = tid; json.dump(t, open(TASKS, 'w'), indent=1)

def gen(name):
    sys.path.insert(0, HERE); import tripo
    dst = os.path.join(RAW, 'gear_' + name + '.glb')
    if os.path.exists(dst) and os.path.getsize(dst) > 10000: print(name, 'have', flush=True); return
    with SEM:
        tid = tasks().get(name)
        if not tid:
            for k in range(20):                                   # 429(동시 생성 한도)면 기다렸다가 다시
                r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': PROMPTS[name], 'texture': True, 'pbr': True, 'texture_quality': 'standard'})
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
            try: tripo.download(out['rendered_image'], os.path.join(RAW, 'gear_' + name + '_preview.webp'))
            except Exception as e: print(name, 'preview', e, flush=True)

if __name__ == '__main__':
    if '--list' in sys.argv:
        for k, v in PROMPTS.items(): print(k, '|', v[:110])
        sys.exit(0)
    names = [a for a in sys.argv[1:] if a in PROMPTS] or list(PROMPTS)
    th = [threading.Thread(target=gen, args=(n,)) for n in names]
    for t in th: t.start()
    for t in th: t.join()
    print('done', len([n for n in PROMPTS if os.path.exists(os.path.join(RAW, 'gear_' + n + '.glb'))]), '/', len(PROMPTS), flush=True)
