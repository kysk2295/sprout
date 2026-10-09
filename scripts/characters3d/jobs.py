# 49 §4 · 구울 목록 만들기 — jobs/*.json 을 쓴다.
#   python3 scripts/characters3d/jobs.py [--preview]
# 이름 규칙(앱 manifest와 같다):
#   몸     <종>-<단계>[갈래]      예) snail-3a · frog-2 · bee-1s2(아기 = 씨앗 껍질 색 s0~s3, 개구리 아기는 frog-1)
#   얼굴   <종>-<단계>-face-<표정>  (갈래·씨앗과 상관없이 같은 모양)
#   옷     <종>-<단계>-acc-<옷>     (갈래 a 몸에 맞춰 굽는다 — 갈래는 색·소품만 다르다)
#   칸 소품 <종>-<단계><갈래>-prop  (관·가방·등불 — 같은 칸 옷을 입으면 숨는다)
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
PREVIEW = '--preview' in sys.argv
SPECIES = ['snail', 'bee', 'worm', 'frog']
MOODS = ['default', 'happy', 'sleepy', 'wow', 'think']
HAT = ['acorn-cap', 'leaf-hat', 'straw', 'beanie', 'santa']
NECK = ['ribbon', 'bandana', 'bowtie', 'lei']
HAND = ['pencil', 'balloon', 'mug', 'flag', 'songpyeon', 'bok']
BACK = ['backpack', 'wings', 'lantern']
PROPS = {('frog', 5): 'hat', ('bee', 4): 'hat', ('bee', 5): 'hand', ('worm', 3): 'back'}
DECOR = ['pot', 'fence', 'mushlamp', 'butterfly', 'ball', 'bunting', 'tent', 'firefly', 'arch']

def bodies():
    for sp in SPECIES:
        for st in range(1, 6):
            if st == 1:
                if sp == 'frog': yield sp, st, 'a', 0, 'frog-1'
                else:
                    for s in range(4): yield sp, st, 'a', s, f'{sp}-1s{s}'
            elif st == 2: yield sp, st, 'a', 0, f'{sp}-2'
            else:
                for br in 'ab': yield sp, st, br, 0, f'{sp}-{st}{br}'

def acc_ids(st):
    return HAT + HAND if st == 1 else HAT + NECK + HAND + BACK

def write(name, d):
    os.makedirs(os.path.join(HERE, 'jobs'), exist_ok=True)
    json.dump(d, open(os.path.join(HERE, 'jobs', name + '.json'), 'w'), ensure_ascii=False, indent=0)
    print(name, len(d['items']))

size, samples = (320, 16) if PREVIEW else (640, 64)
pre = 'preview-' if PREVIEW else ''
out = lambda d: os.path.join('build', ('preview/' if PREVIEW else '') + d)

write(pre + 'bodies', {'out': out('body'), 'size': size, 'samples': samples, 'skip_existing': not PREVIEW,
      'items': [{'kind': 'char', 'species': sp, 'stage': st, 'branch': br, 'seed': s, 'layer': 'body', 'name': n} for sp, st, br, s, n in bodies()]})
faces = [{'kind': 'char', 'species': sp, 'stage': st, 'layer': 'faces', 'name': f'{sp}-{st}-face'} for sp in SPECIES for st in range(1, 6)]
write(pre + 'faces', {'out': out('face'), 'size': size, 'samples': samples, 'skip_existing': not PREVIEW, 'items': faces})
props = [{'kind': 'char', 'species': sp, 'stage': st, 'branch': br, 'layer': 'props', 'name': f'{sp}-{st}{br}-prop'} for (sp, st) in PROPS for br in 'ab']
write(pre + 'props', {'out': out('prop'), 'size': size, 'samples': samples, 'skip_existing': not PREVIEW, 'items': props})
for sp in SPECIES:
    acc = []
    for st in range(1, 6):
        ids = [a for a in acc_ids(st) if not PREVIEW or a in ('straw', 'bandana', 'balloon', 'backpack', 'lei', 'santa', 'lantern', 'wings')]
        acc.append({'kind': 'char', 'species': sp, 'stage': st, 'layer': 'accs', 'ids': ids, 'name': f'{sp}-{st}-acc'})
    write(pre + 'acc-' + sp, {'out': out('acc'), 'size': size, 'samples': samples, 'skip_existing': not PREVIEW, 'items': acc})
spins = [{'kind': 'char', 'species': sp, 'stage': st, 'branch': br, 'seed': s, 'layer': 'spin', 'frames': 12, 'name': f'{n}-spin'} for sp, st, br, s, n in bodies()]
write(pre + 'spins', {'out': out('spin'), 'size': 240 if not PREVIEW else 160, 'samples': 32 if not PREVIEW else 12, 'skip_existing': not PREVIEW, 'items': spins})
seeds = []
for s in range(4):
    for t in range(12):
        seeds.append({'kind': 'seed', 'seed': s, 'turn': t * 30, 'name': f'seed{s}-t{t:02d}'})
    for c in (1, 2):
        seeds.append({'kind': 'seed', 'seed': s, 'turn': 0, 'crack': c, 'name': f'seed{s}-crack{c}'})
if PREVIEW: seeds = [x for x in seeds if x['name'] in ('seed0-t00', 'seed0-crack1', 'seed0-crack2', 'seed3-t03')]
write(pre + 'seeds', {'out': out('seed'), 'size': 320, 'samples': 48 if not PREVIEW else 16, 'skip_existing': not PREVIEW, 'items': seeds})
scenes = [{'kind': 'scene', 'time': t, 'w': 780, 'h': 1560, 'name': f'scene-{t}'} for t in ('day', 'dawn', 'dusk', 'sunset', 'moon', 'snow')]
scenes += [{'kind': 'scene', 'time': t, 'w': 1170, 'h': 420, 'band': True, 'cz': 1.4, 'tz': 1.6, 'lens': 40, 'name': f'band-{t}'} for t in ('day', 'dusk')]
if PREVIEW:
    for s in scenes: s['w'] //= 3; s['h'] //= 3
write(pre + 'scenes', {'out': out('scene'), 'samples': 64 if not PREVIEW else 16, 'skip_existing': not PREVIEW, 'items': scenes})
write(pre + 'decor', {'out': out('decor'), 'size': 320 if not PREVIEW else 200, 'samples': 48 if not PREVIEW else 16, 'skip_existing': not PREVIEW,
      'items': [{'kind': 'decor', 'id': d, 'name': f'decor-{d}'} for d in DECOR]})
