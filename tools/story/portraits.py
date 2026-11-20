"""메인 스토리 대화 장면(js/storyscene.js)의 주요 인물 반신 일러스트 — Runway API text_to_image.

결과: assets/ui/story/<key>.webp (세로 3:4, 1152x1536 이하, 배경 투명) + assets/ui/story/portraits.json의 "portraits"[key].
그림이 없는 화자는 게임이 3D 모델 반신 렌더를 쓰므로, 일부만 만들어도 됩니다.

  python3 tools/story/portraits.py                 # 목록·프롬프트·예상 크레딧만 출력 (API 호출 없음)
  python3 tools/story/portraits.py --balance       # 크레딧 잔액만 확인
  python3 tools/story/portraits.py --run [키…]     # 생성 (이어받기: 이미 있는 그림·진행 중 작업은 건너뜀/이어서 기다림)
  FORCE=1 … --run astel                            # 다시 만들기

키: ~/.runway/key (절대 출력·커밋하지 말 것). 참고 그림(같은 인물의 3D 반신 렌더, 색·옷 일관성 — USE_REF 인물만): REFS 폴더의 <key>.png
(브라우저에서 만들기: NODE_PATH=$(npm root -g) node tools/story/refs.js → /tmp/story_refs). 없으면 글만으로 만듦.
환경 변수: MODEL(기본 gpt_image_2_6_sunburst — 투명 배경을 지원하는 모델), RATIO(기본 1440:1920), COST(그림 한 장 크레딧, 기본 8 —
실제 값은 https://docs.dev.runwayml.com/ 가격표로 확인), EXTRA(요청에 덧붙일 JSON, 예 '{"background":"transparent"}'),
API(기본 https://api.dev.runwayml.com), VERSION(X-Runway-Version, 기본 2024-11-06).
모델이 투명 배경을 주지 않으면 프롬프트대로 '아무것도 없는 연한 단색 배경'을 네 귀퉁이에서 채우기로 지움(PIL, 도구 전용).
"""
import base64, json, os, sys, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/ui/story'
MANIFEST = OUT / 'portraits.json'
STATE = ROOT / 'tools/story/portraits_state.json'      # 작업 id (이어받기용, 비밀 없음)
REFS = Path(os.environ.get('REFS', '/tmp/story_refs'))
API = os.environ.get('API', 'https://api.dev.runwayml.com')
VERSION = os.environ.get('VERSION', '2024-11-06')
MODEL = os.environ.get('MODEL', 'gpt_image_2_6_sunburst')
RATIO = os.environ.get('RATIO', '1440:1920')
COST = float(os.environ.get('COST', '8'))
EXTRA = json.loads(os.environ.get('EXTRA', '{}'))

# 공통 화풍: 프롤로그 원화(assets/ui/prologue/README.md)와 같은 금빛·남색·보라 손그림 판타지, 게임 3D 모델의 귀여운 비율과 색
STYLE = ("Half-body character portrait for a premium Korean fantasy RPG visual-novel dialogue scene, Arcan Chronicle. "
         "Exquisite hand-painted anime-fantasy illustration, refined painterly brushwork, soft volumetric rim light, restrained jewel tones "
         "(antique gold, midnight navy, violet accents), warm key light from the upper left. Single character only, from the top of the head "
         "down to the hips, centered, facing three-quarter toward the viewer's right, natural dignified pose, expressive eyes, cute but not "
         "childish proportions matching a stylized chibi-leaning 3D game model. Transparent background. NO text, frame, border, UI, watermark, "
         "other people or scenery. Original design, not imitating any existing game character.")
# 프롬프트는 1000자에서 잘림(promptText 한도) — 금지 조건이 잘리지 않게 STYLE 끝을 짧게 씀(2026-11-16, 시안 2장 뒤)

# key: (이름, 직함, 화자 이름들, 인물 설명). 색·옷은 게임 3D 모델(참고 그림)을 따르라고 지시.
CAST = {
    'astel':     ('아스텔', '망명 왕자', ['아스텔'], "ASTEL, the exiled crown prince of Kairion, about 20, earnest and burdened. Tousled pale golden hair, clear blue eyes, "
                  "navy cloak with gold clasps over a white princely tunic and dark belt, a faint golden dragon-eye sigil glowing on the back of his right hand."),
    'castilla':  ('카스티야', '왕실 궁수', ['카스티야'], "CASTILLA, a cheerful, competitive young royal archer of Kairion. Wavy blond hair, bright green eyes, dark plum beret with a "
                  "feather, cream and green layered outfit, a longbow over the shoulder, playful confident smile."),
    'kylus':     ('카일러스', '호위기사', ['카일러스'], "KYLUS, the prince's stoic loyal bodyguard knight, late 20s. Short dark hair, calm serious face, steel plate armor with "
                  "navy surcoat and a kite shield, protective posture."),
    'kerin':     ('케린', '노기사', ['케린'], "KERIN, a legendary old knight of Baltern, about 65. Grey hair and short beard, scarred weathered face, worn but polished "
                  "armor with a dark green cloak, stern yet warm eyes, hand on a long sword."),
    'justina':   ('저스티나', '대사제', ['저스티나'], "A serene, kind-hearted head priestess of a temple of light, a woman in her twenties. Long pale silver hair, calm gentle eyes, "
                  "layered white and gold ceremonial vestments, a small golden circlet, a slender staff topped with a star emblem."),
    'malachion': ('말라키온', '대사제', ['말라키온'], "MALACHION, Justina's elder brother, a fallen high priest. Shoulder-length dark hair, pale face, cold violet eyes, elegant "
                  "layered ivory robe under a midnight-black cloak with gold embroidered trim, faint purple shadow aura, aloof and tragic."),
    'grace':     ('그레이스', '찬탈왕', ['그레이스'], "GRACE, Astel's younger brother, the usurper king, about 17. Neat black hair, beautiful but hollow black eyes with a faint "
                  "trace of black tears, a dark royal coat with silver trim and a thin crown, cold polite smile, wisps of shadow around him."),
    'roderick':  ('로데릭', '근위대장', ['로데릭'], "RODERICK, captain of the royal guard of Kairion. Broad-shouldered man in his 40s, short brown hair, square jaw, heavy blue and "
                  "silver plate armor with a royal crest, commanding stern expression."),
    'elder':     ('하람', '촌장', ['하람'], "HARAM, the kindly elder of Arcan village. Short old man with a long white beard, green hooded robe with golden trim, leather "
                  "belt with a pouch, warm grandfatherly smile."),
    'capital_merchant': ('베아', '왕도 상인', ['베아'], "BEA, a lively merchant woman of the royal capital. Auburn hair tied up with a scarf, apron over a practical dress, ledger in hand, cheerful."),
    'yoisen':    ('요이센', '정찰병', ['요이센'], "YOISEN, a quick-witted young scout. Messy short hair, light leather armor, hooded cloak, small crossbow, alert sly smile."),
    'daisen':    ('다이센', '베르그 전사', ['다이센'], "DAISEN, a proud warrior of the Berg mountain clan. Large muscular man, braided hair, fur mantle, heavy ancestral iron mace, gruff."),
    'chirzen':   ('치르젠', '영주의 아들', ['치르젠'], "CHIRZEN, the earnest son of the lord of Gravel. Young man with neat hair, noble desert-toned coat, scholarly gloves, brave but nervous."),
    'chirkai':   ('치르카이', '그라벨 영주', ['치르카이'], "CHIRKAI, the lord of Gravel. Middle-aged man with a trimmed grey beard, sand-colored noble robes and turban sash, shrewd tired eyes."),
    'derkai':    ('데르카이', '실베른 영주', ['데르카이'], "DERKAI, lord of Silvern. Older nobleman with a silver beard, forest-green velvet coat with fur collar, calm and fair."),
    'yanber':    ('얀베르', '발타자르 기사단장', ['얀베르'], "YANBER, knight commander of Baltazar. Tall woman knight in crimson and gold armor, short dark red hair, fierce disciplined gaze."),
    'berion':    ('베리온', '발타자르 왕자', ['베리온'], "BERION, prince of Baltazar. Young man with golden-brown hair, crimson princely coat with gold epaulettes and a rapier, confident."),
    'boldran':   ('볼드란', '전설의 대장장이', ['볼드란'], "BOLDRAN, a legendary old blacksmith. Bald with a thick braided grey beard, leather apron, soot-stained strong arms, big hammer, regretful eyes."),
    'erdin':     ('에르딘', '왕실 대장장이', ['에르딘'], "ERDIN, a young royal blacksmith. Freckles, goggles on the head, leather apron over a work shirt, tongs in hand, eager."),
    'ruin_monk': ('유디트', '살아남은 수도사', ['유디트'], "YUDIT, a surviving monk of the ruined temple. Young woman with short ash hair, grey-ivory monk robes with burn marks, clutching records."),
    # 2026-11-20 둘째 묶음: 메인 장면에 나오는데 3D 반신 렌더로 나오던 NPC(아르칸 마을 사람·전직 마스터·라엘). 색·옷은 게임 3D 모델을 따름
    # (자기 메시가 있는 사람은 USE_REF로 그 렌더를 참고, 다른 메시를 색만 바꿔 빌려 쓴 주민은 글로만 — 역할과 모델이 어긋나서)
    'merchant':  ('모아', '잡화 상인', ['모아'], "MOA, the cheerful item merchant girl of Arcan village. Light brown braids under an olive hood, amber "
                  "eyes, cream blouse, satchel and belt of potion bottles, holding up a red potion, friendly grin."),
    'armorer':   ('단오', '무기 상인', ['단오'], "DANO, Arcan's weapon dealer, a sturdy man in his 30s. Wavy brown hair, short beard, navy work vest with a crest over a cream "
                  "shirt, leather gloves, holding a short sword, confident smile."),
    'town_armor': ('보라', '방어구·장신구 상인', ['보라'], "BORA, the armor and trinket seller of Arcan village, a young woman. Light brown hair with a violet hood and violet-plum "
                  "dress, small round shield on her back, a violet gem amulet in her hand, warm sales smile."),
    'guard':     ('도윤', '경비병', ['도윤'], "DOYUN, the young village guard of Arcan. Short brown hair, round gold-trimmed steel helmet with a blue plume, blue tabard "
                  "with a gold fleur emblem over steel plate, a long spear, earnest dutiful face."),
    'warp_town': ('미르', '워프 안내인', ['미르'], "MIR, the warp guide of Arcan village, a gentle young woman. Long dark brown hair with a pale blue flower ornament, "
                  "layered indigo and teal mystic robe with silver embroidery, a small glowing blue warp stone floating above her palm, calm smile."),
    'arcan_guide': ('하늘', '전직 안내인', ['하늘'], "HANEUL, the friendly job guide of Arcan village, a young man. Fluffy sky-blue hair, light blue scarf, cream and sky-blue "
                  "traveler coat, a small open guidebook in one hand, pointing the way with the other, bright helpful smile."),
    'arcan_pharm_clerk': ('다래', '약국 점원', ['다래'], "DARAE, the pharmacy clerk of Arcan village, a kind young woman. Black hair tied with a cream flower hairpin, dark green "
                  "and cream herbalist apron dress, a mortar and pestle with fresh herbs in her hands, soft caring smile."),
    'arcan_smith_boy': ('쇠돌', '대장간 견습', ['쇠돌'], "SOEDOL, a young boy apprentice blacksmith of Arcan village, about 12, short and spirited. Messy black hair, soot "
                  "smudge on his cheek, no beard, dark green leather apron over a rolled-sleeve shirt, oversized gloves, a small hammer on "
                  "his shoulder, proud cheeky grin."),
    'arcan_innkeeper': ('보름', '여관 주인', ['보름'], "BOREUM, the warm-hearted innkeeper of Arcan village, a plump cheerful woman in her 40s. Dark green hair in a bun, "
                  "white cook cap, cream blouse, green apron, holding a steaming bowl of stew, motherly smile."),
    'arcan_miller': ('곡이', '풍차지기', ['곡이'], "GOGI, the old windmill keeper of Arcan village. Round glasses, bushy white beard and eyebrows, teal hooded work cloak, "
                  "flour-dusted sleeves, a small sack of flour under one arm, kindly cheerful face."),
    'arcan_child': ('토리', '마을 아이', ['토리'], "TORI, a lively little village girl of Arcan, about 8. Lime-green twin pigtails, big green eyes, leaf-green dress with a "
                  "cream collar, a shiny coin held up in her fingers, mischievous wink."),
    'arcan_farmer': ('한솔', '농부', ['한솔'], "HANSOL, a hard-working young farmer of Arcan village. Tanned skin, short dark hair under a straw hat, green neckerchief, "
                  "purple vest over a cream work shirt, a bunch of fresh white-purple turnips in his arms, honest smile."),
    'arcan_granny': ('옥분', '꽃 가꾸는 할머니', ['옥분'], "OKBUN, a sweet little grandmother of Arcan who tends flowers. Silver-white hair in a bun with a flower, rosy cheeks, "
                  "olive shawl over a cream dress, a watering can and a pot of pink flowers, gentle crinkled smile."),
    'master_pharmacist': ('소연', '약사 마스터', ['소연'], "SOYEON, the pharmacist guild master, a graceful woman. Long black hair with a cream flower and gold hairpin, dark "
                  "green robe with gold embroidery, a stone mortar and herbs, wise calm smile."),
    'master_cook': ('금강', '요리사 마스터', ['금강'], "GEUMGANG, the cook guild master, an energetic young man. Brown hair, tall white chef hat with a gold emblem, cream chef "
                  "jacket, teal neckerchief, a frying pan in hand, hearty grin."),
    'master_blacksmith': ('철산', '대장장이 마스터', ['철산'], "CHEOLSAN, the blacksmith guild master, a huge muscular man. Black hair, thick black beard, sleeveless cream shirt "
                  "under a heavy brown leather apron, a big hammer, stern but kind eyes."),
    'master_hairdresser': ('리라', '미용사 마스터', ['리라'], "LIRA, the hairdresser guild master, a stylish confident woman. Wavy rose-auburn hair in a high ponytail, cream blouse, "
                  "coral-red sash and skirt, large golden scissors, playful wink."),
    'master_artist': ('노을', '예술가 마스터', ['노을'], "NOEUL, the artist guild master, a dreamy young man. Tousled light brown hair, dark beret with a feather, dark navy "
                  "coat over cream clothes, a paint palette and long brush, gentle smile."),
    'silvern_hunter': ('라엘', '실베른 사냥꾼', ['라엘'], "RAEL, a keen-eyed hunter of the Silvern forests, a lean young woman. Short silver-ash hair, forest-green hooded "
                  "cloak, brown leather jerkin, a longbow and quiver of arrows, a wolf-fang charm at her neck, cool focused gaze."),
    # 2026-11-20 2차 전직 마스터 7명(여러 마을에 흩어짐, tools/world/jobmasters.py) — 다른 메시를 색만 바꿔 빌려 써서 글로만
    'master2_western_pharmacist': ('세린', '양약사 마스터', ['세린'], "SERIN, the master of precise western alchemy-pharmacy, a sharp elegant woman in her 30s. Sleek dark teal bob "
                  "hair, thin gold-rimmed round glasses, crisp white long lab coat with gold buttons over a navy vest, a glowing crystal capsule vial "
                  "held between two fingers, confident analytical smile."),
    'master2_herbalist': ('운학', '한약사 마스터', ['운학'], "UNHAK, the master of herbal medicine, a kindly old man with a long white goatee and topknot. Flowing moss-green and "
                  "cream layered robe with wide sleeves, a jade pendant, a bundle of dried ginseng roots and herbs in one hand, a small bronze "
                  "medicine pot at his side, wise twinkling eyes."),
    'master2_engineer': ('가온', '엔지니어 마스터', ['가온'], "GAON, the master engineer of magitech machines, an energetic young woman. Short copper-red hair with brass "
                  "goggles pushed up on her forehead, soot smudge on one cheek, teal work jacket with rolled sleeves over a dark apron with tool "
                  "pockets, one brass mechanical gauntlet, a tiny clockwork drone on her shoulder, bold grin."),
    'master2_chef': ('해담', '쉐프 마스터', ['해담'], "HAEDAM, the grand chef master, a jolly broad-shouldered man in his 40s. Neat dark mustache, tall pleated white "
                  "chef toque with a red ribbon, double-breasted white chef coat with gold buttons and a crimson neckerchief, holding a silver "
                  "cloche tray with a flame flicker, proud warm smile."),
    'master2_designer': ('나래', '디자이너 마스터', ['나래'], "NARAE, the haute-couture designer master, a glamorous graceful woman. Long wavy lavender hair in an elegant side "
                  "braid, violet tailored long coat with silver embroidery and a high collar, a measuring tape draped around her neck, a jeweled "
                  "brooch, silk ribbon fluttering, poised charming smile."),
    'master2_painter': ('현묵', '화가 마스터', ['현묵'], "HYEONMUK, the master painter of living ink, a calm artistic man in his 30s. Long black hair tied loosely, ink-black "
                  "and white flowing scholar coat splashed with vivid red, blue and gold paint, a huge calligraphy brush in hand, a small ink "
                  "dragon curling around his arm, serene focused gaze."),
    'master2_musician': ('하율', '음악가 마스터', ['하율'], "HAYUL, the maestro of music, a gentle charismatic young man. Wavy honey-blond hair, deep royal-blue tailcoat with "
                  "gold trim and a white cravat, a slender silver conductor's baton in one hand, a small golden lyre with a crescent moon at his "
                  "side, glowing musical notes drifting, warm smile."),
}


def key_auth():
    p = Path.home() / '.runway/key'
    if not p.exists(): sys.exit('~/.runway/key 없음')
    return p.read_text().strip()


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': 'Bearer ' + key_auth(), 'X-Runway-Version': VERSION, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{method} {path}: HTTP {e.code} {e.read()[:400].decode("utf-8", "replace")}')


# 참고 그림(3D 렌더)을 쓰는 인물: 자기 모델이 있는 아스텔, 그리고 마을 촌장. 나머지 이야기 NPC는 다른 NPC 모델을 빌려 써서
# (예: 저스티나 = 약사 모델) 렌더를 따르면 이야기 설정(은발 대사제 등)과 어긋나므로 글로만 만듦.
USE_REF = {'astel', 'elder',
           # 2026-11-20: 자기 메시를 그대로 쓰는 마을 상인·경비병·전직 마스터
           'merchant', 'armorer', 'guard', 'master_pharmacist', 'master_cook', 'master_blacksmith', 'master_hairdresser', 'master_artist'}


def ref_path(key):
    p = REFS / f'{key}.png'
    return p if key in USE_REF and p.exists() else None


def tag(key):
    return key.replace('_', '')[:16]            # referenceImages tag: 16자 이하


def prompt(key):
    n, t, _, desc = CAST[key]
    ref = f" Match the character's colors, hair and outfit to the reference image @{tag(key)}." if ref_path(key) else ''
    return f'{desc}{ref} {STYLE}'


def data_uri(p):
    return 'data:image/png;base64,' + base64.b64encode(Path(p).read_bytes()).decode()


def cut_background(img):
    """flat light background → transparent (flood fill from the four corners, soft 2 px edge)"""
    from PIL import Image, ImageDraw, ImageFilter
    img = img.convert('RGBA')
    if img.getextrema()[3][0] < 250: return img                       # already has transparency
    w, h = img.size; mask = Image.new('L', (w, h), 0)
    rgb = img.convert('RGB')
    for c in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        tmp = rgb.copy(); ImageDraw.floodfill(tmp, c, (255, 0, 255), thresh=28)
        m = Image.eval(tmp.convert('RGB').split()[1], lambda v: 255 if v == 0 else 0)   # green channel 0 only where filled magenta
        mask = Image.composite(Image.new('L', (w, h), 255), mask, m)
    alpha = Image.eval(mask, lambda v: 255 - v).filter(ImageFilter.GaussianBlur(1.2))
    img.putalpha(alpha); return img


def save_out(key, url):
    from PIL import Image
    import io
    raw = urllib.request.urlopen(url, timeout=120).read()
    img = cut_background(Image.open(io.BytesIO(raw)))
    img.thumbnail((1152, 1536))
    out = OUT / f'{key}.webp'; img.save(out, 'WEBP', quality=int(os.environ.get('Q', '78')), method=6)   # 장당 ≤ 400 KB 목표
    man = json.loads(MANIFEST.read_text()); man.setdefault('portraits', {})
    n, t, names, _ = CAST[key]
    man['portraits'][key] = {'file': out.name, 'facing': 'right', 'names': names}
    MANIFEST.write_text(json.dumps(man, ensure_ascii=False, indent=2) + '\n')
    print('  ->', out.relative_to(ROOT), img.size)


def run(keys):
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    for key in keys:
        if (OUT / f'{key}.webp').exists() and not os.environ.get('FORCE'): print(key, '이미 있음'); continue
        tid = state.get(key)
        if not tid or os.environ.get('FORCE'):
            body = {'model': MODEL, 'promptText': prompt(key)[:1000], 'ratio': RATIO, **EXTRA}
            if ref_path(key): body['referenceImages'] = [{'uri': data_uri(ref_path(key)), 'tag': tag(key)}]
            tid = call('POST', '/v1/text_to_image', body)['id']; state[key] = tid; STATE.write_text(json.dumps(state, indent=1))
            print(key, '작업', tid)
        for _ in range(120):
            t = call('GET', f'/v1/tasks/{tid}')
            if t.get('status') == 'SUCCEEDED': save_out(key, t['output'][0]); state.pop(key, None); STATE.write_text(json.dumps(state, indent=1)); break
            if t.get('status') in ('FAILED', 'CANCELLED'): print(key, '실패', t.get('failure') or t); state.pop(key, None); STATE.write_text(json.dumps(state, indent=1)); break
            time.sleep(5)


if __name__ == '__main__':
    a = sys.argv[1:]
    if '--balance' in a:
        o = call('GET', '/v1/organization'); print('크레딧 잔액:', o.get('creditBalance')); sys.exit()
    keys = [k for k in a if not k.startswith('--')] or list(CAST)
    bad = [k for k in keys if k not in CAST]
    if bad: sys.exit('모르는 키: ' + ', '.join(bad))
    todo = [k for k in keys if os.environ.get('FORCE') or not (OUT / f'{k}.webp').exists()]
    if '--run' not in a:
        for k in keys: print(f'[{k}] {CAST[k][0]} ({CAST[k][1]}) 참고그림:{"있음" if ref_path(k) else ("안 씀" if k not in USE_REF else "없음")}\n   {prompt(k)[:300]}…')
        print(f'\n모델 {MODEL}, 비율 {RATIO}: 새로 만들 그림 {len(todo)}장 × {COST:g} 크레딧 ≈ {len(todo) * COST:g} 크레딧 (다시 뽑기 여유 1.5배 ≈ {len(todo) * COST * 1.5:g}). 생성은 --run')
        sys.exit()
    run(todo)
