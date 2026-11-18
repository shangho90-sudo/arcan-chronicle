"""직업 계보별 무기 2단계(2026-11-17): 계열마다 '대표 머리 장식' Tripo 초안 → $RAW/wpn_<계열>_<변형>.glb
변형 a = 정령 장식(단계 4~5에 쓰는 기본 모양), b = 전설 장식(단계 6~7, 관·날개가 더 큼 — 예산이 남을 때만).
단계별 진화(보석·리본·구슬 줄·금테·후광)는 tools/blender/gear2_wpn.py가 절차로 붙임.

저작권 원칙(tools/gear/designs.py 머리말): 모티프는 이 세계의 것, 참고 그림은 입력하지 않음(텍스트 프롬프트만).
요청은 하나씩(동시 요청 금지), 받은 GLB는 건너뜀, 진행 중 작업 id와 쓴 크레딧(잔액 차이)은 $RAW/wpn_state.json.
Usage: python3 tools/tripo/gear2_wpn_assets.py [--list] [키 ...]   (키 = nov_a, pharm_a …; 키 ~/.tripo/key — 저장소에 넣지 말 것)
       LIMIT=700 (이 스크립트가 쓸 크레딧 상한)"""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.environ.get('RAW', '/home/claude/gear2_3d'); os.makedirs(RAW, exist_ok=True)
LIMIT = int(os.environ.get('LIMIT', '700'))
STATE = os.path.join(RAW, 'wpn_state.json')
STYLE = ('single decorative ornament piece only, stylized cute fantasy RPG game item, hand-painted brush-stroke texture look, chunky readable silhouette, '
         'strong two-to-three colour contrast, one glowing gem as the focal point, centered, floating, no handle, no stick, no shaft, '
         'no character, no hand, no base, no stand, no background, no text')
A = {
    'nov': 'an ornate sword crossguard ornament: a glowing five-point star-seed gem in the centre with two sprouting leaf wings spreading left and right, '
           'ivory, sky blue and gold colours',
    'pharm': 'a weapon head ornament: a round closed flower bud club head carved with leaves, small deer-antler twigs branching to both sides, '
             'tiny white lily-of-the-valley bell flowers hanging down, a dewdrop gem on top, pale green, ivory and gold colours',
    'smith': 'a chunky hammer head shaped like a curled-up ember salamander lizard with spiky back ridges, two broad flat striking faces on its sides, '
             'glowing orange ember cracks and an ember gem eye, black iron, crimson and glowing orange colours',
    'cook': 'a broad flat cleaver knife blade shaped like a silver carp fish in profile, engraved scales, a fin ridge along the spine, '
            'a teal water-drop gem as the eye, silver, teal and coral colours',
    'hair': 'a small ornament of a wind swallow bird spirit with wings spread wide and a long forked tail, a round rose-pink gem on its chest, '
            'white, rose pink and silver colours',
    'art': 'an ornament of a butterfly spirit with two pairs of large wings patterned like a painter colour palette with paint dabs, '
           'a glowing purple paint-drop gem body, purple, gold and cyan colours',
    'wpharm': 'a weapon head ornament: a clear glass round alchemy flask held in a slim platinum cage with glowing teal liquid inside, '
              'sharp ice-blue crystal spikes rising from the top, measuring rings, transparent sky blue, platinum and teal colours',
    'herb': 'a weapon head ornament: a cluster of layered glossy lingzhi mushroom caps around a round jade orb, small deer antler branches, '
            'a red knotted tassel hanging down, jade green, dark ebony brown and vermilion colours',
    'eng': 'a chunky hammer head: a brass cogwheel drum wrapped in copper coils, a piston on the back, small lightning-wing fins on top, '
           'a glowing lightning-blue core in the centre, brass, navy blue and electric blue colours',
    'chef': 'an ornament of a small fire fox spirit head with a big curling flame tail, a crimson flame gem on its forehead, '
            'crimson red, white and gold colours',
    'design': 'an ornament of a moonlight silk moth spirit with broad spread wings and feathery antennae, a round glowing moon gem on its body, '
              'deep indigo violet, silver and rose gold colours',
    'paint': 'an ornament of an ink-painted eastern dragon head with flowing mane and whiskers, a glowing golden eye gem, '
             'ink black, gold and vermilion colours',
    'music': 'a small ornate lyre harp musical instrument head shaped like a silver crescent moon, a nightingale bird with folded wings perched on top, '
             'thin glowing strings, a little glowing star gem in the centre, navy blue, silver and lilac colours',
    'artm': 'a small ornate lute musical instrument head: a rounded amber lute body whose sound hole is framed by a twilight dragonfly spirit '
            'with four translucent teal wings spread across the body, a short neck with tuning pegs, a glowing amber gem, amber, teal and cream colours',
}
B = {   # 전설 단계(6~7): 같은 정령이 관·후광·큰 날개를 갖춤
    'nov': 'a large ornate sword crossguard ornament: a big radiant star-seed gem with a dragon-eye pattern, large leaf wings spreading wide, a small golden crown of stars, ivory, sky blue and gold',
    'pharm': 'a weapon head ornament: a fully blooming white flower with a glowing dewdrop core, large white-blossom deer antlers, a small flower crown, gold trim, pale green, ivory and gold',
    'smith': 'a chunky hammer head shaped like a crowned ember salamander king with flaming wing crest, lava cracks, a glowing dragon-eye ember gem, black iron, crimson, orange and gold trim',
    'cook': 'a broad flat blade shaped like a royal carp king with long silky trailing fins and a splashing water crown, glowing water-drop eye gem, silver, teal, coral and gold trim',
    'hair': 'an ornament of a swallow queen spirit with large wings spread, a feather crown and long trailing feather ribbons, glowing rose gem, white, rose pink, silver and gold',
    'art': 'an ornament of a butterfly queen spirit with huge aurora rainbow wings, a wing crown, glowing paint-drop gem core, purple, gold and cyan',
    'wpharm': 'a weapon head ornament: a crystal golem heart made of faceted ice-blue crystal inside a platinum cage, crystal wings and a crystal crown, glowing teal core, gold trim',
    'herb': 'a weapon head ornament: blooming lingzhi mushroom caps like a flower crown around a glowing jade orb, large deer antlers, red knotted tassels, gold trim',
    'eng': 'a chunky hammer head like a clockwork golem face with a glowing lightning core, lightning-wing fins, a cogwheel crown, brass, navy and electric blue, gold trim',
    'chef': 'an ornament of twin fox spirits, a crimson fire fox and a white frost fox curled together with many flaming tails, glowing flame gem, gold trim',
    'design': 'an ornament of a moth queen spirit with huge spread silver-indigo wings, a full-moon crown, feathery antennae, glowing moon gem core, rose gold trim',
    'paint': 'an ornament of a crowned ink dragon head with cloud wings and a flowing mane, glowing golden eye gem, ink black, gold and vermilion tassels',
    'music': 'a small ornate lyre harp musical instrument head shaped like a crescent moon with large spread nightingale wings, a constellation crown of little stars, glowing star core, navy, silver, lilac and gold',
    'artm': 'a small ornate lute musical instrument head with a dragonfly queen spirit, huge translucent teal wings and a sunset crown, glowing amber gem, amber, teal, cream and gold',
}
PROMPTS = {**{k + '_a': v + ', ' + STYLE for k, v in A.items()}, **{k + '_b': v + ', ' + STYLE for k, v in B.items()}}

def state(): return json.load(open(STATE)) if os.path.exists(STATE) else {'tasks': {}, 'spent': {}}
def save(s): json.dump(s, open(STATE, 'w'), indent=1, ensure_ascii=False)
def balance(tripo): return tripo.req('GET', '/user/balance').get('data', {}).get('balance')

def gen(name):
    sys.path.insert(0, HERE); import tripo
    dst = os.path.join(RAW, 'wpn_' + name + '.glb')
    if os.path.exists(dst) and os.path.getsize(dst) > 10000: print(name, 'have', flush=True); return True
    st = state(); spent = sum(st['spent'].values())
    tid = st['tasks'].get(name)
    if not tid:
        if spent + 30 > LIMIT: print(name, 'skip: 상한', spent, '/', LIMIT, flush=True); return False
        b0 = balance(tripo)
        for _ in range(20):
            r = tripo.task({'type': 'text_to_model', 'model_version': 'v3.0-20250812', 'prompt': PROMPTS[name][:1000], 'texture': True, 'pbr': False,
                            'texture_quality': 'standard'})
            if r.get('http_error') != 429: break
            time.sleep(30)
        if 'data' not in r: print(name, 'Tripo 요청 실패:', json.dumps(r, ensure_ascii=False)[:300], flush=True); return False
        tid = r['data']['task_id']; st['tasks'][name] = tid; st.setdefault('b0', {})[name] = b0; save(st)
        print(name, 'task', tid, 'balance before', b0, flush=True)
    s = tripo.wait(tid, every=10)
    d = s.get('data', {}); out = d.get('output', {}) or {}
    url = out.get('pbr_model') or out.get('model') or out.get('base_model')
    if d.get('status') != 'success' or not url: print(name, 'failed', json.dumps(s, ensure_ascii=False)[:300], flush=True); return False
    for k in range(5):                                       # 받기가 끊기면(연결 재설정) 다시 — 요청은 다시 하지 않음
        try: tripo.download(url, dst); break
        except Exception as e: print(name, 'download retry', k, e, flush=True); time.sleep(10)
    else: return False
    if out.get('rendered_image'):
        try: tripo.download(out['rendered_image'], os.path.join(RAW, 'wpn_' + name + '_preview.webp'))
        except Exception: pass
    st = state(); b1 = balance(tripo); b0 = st.get('b0', {}).get(name)
    if b0 is not None and b1 is not None: st['spent'][name] = b0 - b1
    save(st); print(name, 'done', os.path.getsize(dst) // 1024, 'KB, spent', st['spent'].get(name), 'total', sum(st['spent'].values()), flush=True)
    return True

if __name__ == '__main__':
    if '--list' in sys.argv:
        for k, v in PROMPTS.items(): print(k, len(v), v)
        sys.exit()
    keys = [a for a in sys.argv[1:] if a in PROMPTS] or [k + '_a' for k in A]
    for k in keys: gen(k)
