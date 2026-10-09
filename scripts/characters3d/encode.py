# 49 §4 · PNG(Blender 원본, build/) → 앱 WebP(packages/schema/art3d/) + 그림 목록(packages/schema/src/art3dManifest.ts)
#   python3 scripts/characters3d/encode.py [--build build] [--out ../../packages/schema/art3d]
# 캔버스는 자르지 않는다(같은 종·단계의 층은 같은 캔버스에 겹친다). 대신 칸 그림(아이콘)용 테두리 상자를 목록에 적는다.
#
# 옷 층(49 §4.5 ⑤ 고침): 옷을 몸을 투명면으로 두고 구우면 몸에서 튕긴 빛을 못 받아 한 톤 어둡다.
#   → accfull(몸 + 기본 얼굴 + 옷을 한 번에)에서 색을 가져오고, accmask(몸·얼굴 = holdout)에서 모양(알파)을 가져온다.
#   → 옷이 몸에 드리운 그림자는 accfull 과 기준(몸 + 기본 얼굴 겹침)의 밝기 비로 구해 검은 반투명 픽셀로 같은 층에 넣는다.
import sys, os, json, glob
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../..'))
arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
B = os.path.join(HERE, arg('--build', 'build'))
OUT = os.path.abspath(arg('--out', os.path.join(ROOT, 'packages/schema/art3d')))
MAN = os.path.join(ROOT, 'packages/schema/src/art3dManifest.ts')
os.makedirs(OUT, exist_ok=True)
for f in glob.glob(os.path.join(OUT, '*.webp')): os.remove(f)  # 지난 굽기에서 남은 이름이 섞이지 않게
Q = {'char': 84, 'small': 82, 'acc': 74, 'scene': 76, 'seed': 80}
# 알파는 손실 압축(무손실 알파가 파일의 2/3였다). 가장자리 확인: 60이면 눈으로 차이 없음
AQ = {'body': 90, 'face': 95, 'acc': 70, 'prop': 85, 'seed': 80, 'decor': 85}
total = {'base': 0}
sizes = {}

def load(p):
    return np.asarray(Image.open(p).convert('RGBA')).astype(np.float32) / 255.0

def contact(a):
    """그림자 받는 바닥이 남긴 옅은 그림자(캔버스 전체 α 30~50) → 발밑 타원 안만 남기고 62%로"""
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    d = ((xx - w * 0.5) / (w * 0.46)) ** 2 + ((yy - h * 0.9) / (h * 0.085)) ** 2
    k = np.clip(1 - d, 0, 1) ** 1.3
    dark = a[..., :3].max(-1) <= 10 / 255
    low = yy >= h * 0.55
    m = dark & low & (a[..., 3] > 0)
    a = a.copy()
    a[..., 3] = np.where(m, a[..., 3] * k * 0.62, a[..., 3])
    a[..., :3] = np.where(m[..., None], 0, a[..., :3])
    haze = dark & ~low & (a[..., 3] < 60 / 255)
    a[..., 3] = np.where(haze, 0, a[..., 3])
    return a

def over(top, bot):
    ta, ba = top[..., 3:4], bot[..., 3:4]
    oa = ta + ba * (1 - ta)
    rgb = np.where(oa > 1e-4, (top[..., :3] * ta + bot[..., :3] * ba * (1 - ta)) / np.maximum(oa, 1e-4), 0)
    return np.concatenate([rgb, oa], -1)

def lum(a):
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722

def bbox(a, thr=0.06):
    m = a[..., 3] > thr
    if not m.any(): return [0, 0, 0, 0]
    ys, xs = np.where(m); h, w = m.shape
    return [round(xs.min() / w, 4), round(ys.min() / h, 4), round((xs.max() + 1) / w, 4), round((ys.max() + 1) / h, 4)]

def save(a, name, px, q, group):
    a = np.clip(a, 0, 1)
    # 줄일 때 가장자리 무리(halo) 방지: 미리 곱한 알파(premultiplied)로 줄이고 다시 나눈다 — 투명 픽셀의 색이 가장자리로 번지지 않게
    pm = Image.fromarray((np.concatenate([a[..., :3] * a[..., 3:4], a[..., 3:4]], -1) * 255 + 0.5).astype(np.uint8), 'RGBA')
    out = []
    for s in px:
        size = (s, s) if pm.width == pm.height else (s, round(pm.height * s / pm.width))
        if size == pm.size: r = np.asarray(pm).astype(np.float32) / 255
        else: r = np.asarray(Image.merge('RGBA', [c.resize(size, Image.LANCZOS) for c in pm.split()])).astype(np.float32) / 255
        al = np.clip(r[..., 3:4], 0, 1)
        rgb = np.where(al > 1 / 255, np.clip(r[..., :3] / np.maximum(al, 1e-4), 0, 1), 0)
        im2 = Image.fromarray((np.concatenate([rgb, al], -1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        fn = f'{name}@{s}.webp'
        p = os.path.join(OUT, fn)
        if im2.mode == 'RGBA' and a.shape[-1] == 4 and (a[..., 3] < 0.999).any():
            im2.save(p, 'WEBP', quality=q, method=6, exact=False, alpha_quality=AQ.get(group, 60))
        else:
            im2.convert('RGB').save(p, 'WEBP', quality=q, method=6)
        sz = os.path.getsize(p); sizes[fn] = sz
        total[group] = total.get(group, 0) + sz
        out.append(s)
    return out

meta = {}
def readmeta(d):
    p = os.path.join(B, d, 'meta.json')
    return json.load(open(p)) if os.path.exists(p) else {}

# ── 몸 ──
bm = readmeta('body'); BODY = {}; RAW = {}
for name, m in sorted(bm.items()):
    p = os.path.join(B, 'body', name + '.png')
    if not os.path.exists(p): continue
    raw = load(p); RAW[name] = raw
    a = contact(raw)
    save(a, name, [768, 384, 160], Q['char'], 'body')
    BODY[name] = {k: m[k] for k in ('head', 'face', 'top', 'neck', 'hand', 'back') if k in m}
    BODY[name]['props'] = m.get('props', [])
    BODY[name]['box'] = bbox(a)

# ── 얼굴 ──
FACES = {}; FRAW = {}
for p in sorted(glob.glob(os.path.join(B, 'face', '*.png'))):
    name = os.path.basename(p)[:-4]
    a = load(p)
    a[..., 3] = np.where(a[..., 3] < 10 / 255, 0, a[..., 3])
    FRAW[name] = a
    save(a, name, [768, 384, 160], Q['small'], 'face')
    FACES[name] = bbox(a)

def ref_key(sp, st, br='a'):
    return f'{sp}-1s0' if st == 1 and sp != 'frog' else f'{sp}-1' if st == 1 else f'{sp}-2' if st == 2 else f'{sp}-{st}{br}'

def extract(full, mask, ref):
    """옷(또는 칸 소품) 층 = 한 번에 구운 색 × holdout 알파 + 몸에 진 그림자"""
    ma = np.clip(mask[..., 3:4], 0, 1)
    acc = np.concatenate([full[..., :3], ma], -1)
    # 몸 위 그림자: 기준보다 어두워진 만큼(옷 자리 밖, 몸이 꽉 찬 곳만)
    lr, lf = lum(ref), lum(full)
    body = (ref[..., 3] > 0.97) & (ma[..., 0] < 0.02)
    s = np.where(body & (lr > 0.02), 1 - lf / np.maximum(lr, 1e-3), 0)
    s = np.clip((s - 0.04) * 1.15, 0, 0.85)
    sh = Image.fromarray((s * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    s = np.asarray(sh).astype(np.float32) / 255 * body
    # 바닥 그림자(옷이 바닥에 드리운 것): 기준보다 진해진 알파
    dark = full[..., :3].max(-1) <= 12 / 255
    g = np.where(dark & (ref[..., 3] < 0.97) & (ma[..., 0] < 0.02), np.clip(full[..., 3] - ref[..., 3], 0, 1) * 0.62, 0)
    shadow = np.zeros_like(full); shadow[..., 3] = np.maximum(s, g)
    return over(acc, shadow)

def refimg(key, face):
    r = RAW.get(key)
    if r is None: return None
    f = FRAW.get(face)
    return over(f, r) if f is not None else r

# ── 옷 ──
ACC = {}
for p in sorted(glob.glob(os.path.join(B, 'acc', '*-full.png'))):
    name = os.path.basename(p)[:-9]  # <sp>-<st>-acc-<id>
    mp = os.path.join(B, 'acc', name + '-mask.png')
    if not os.path.exists(mp): continue
    sp, st = name.split('-')[0], int(name.split('-')[1])
    ref = refimg(ref_key(sp, st), f'{sp}-{st}-face-default')
    if ref is None: continue
    a = extract(load(p), load(mp), ref)
    save(a, name, [768, 160], Q['acc'], 'acc')
    ACC[name] = bbox(a, 0.25)

# ── 칸 소품 ──
PROP = {}
for p in sorted(glob.glob(os.path.join(B, 'prop', '*-prop-full.png'))):
    name = os.path.basename(p)[:-9]  # <sp>-<st><br>-prop
    mp = os.path.join(B, 'prop', name + '-mask.png')
    if not os.path.exists(mp): continue
    sp, stbr = name.split('-')[0], name.split('-')[1]
    ref = refimg(f'{sp}-{stbr}', f'{sp}-{stbr[0]}-face-default')
    if ref is None: continue
    a = extract(load(p), load(mp), ref)
    save(a, name, [768, 384, 160], Q['acc'], 'prop')
    PROP[name] = bbox(a, 0.25)

# ── 한 바퀴 회전 컷(만지기 49 §5.x): 12컷을 가로 띠 한 장으로(앱은 띠를 translateX로 넘긴다 — 컷마다 다시 그리기 없음) ──
SPIN = {}
spm = readmeta('spin')
for name, m in sorted(spm.items()):
    if name.startswith('@') or not isinstance(m, dict): continue
    n = m.get('frames', 12)
    fr = [os.path.join(B, 'spin', f'{name}-t{k:02d}.png') for k in range(n)]
    if not all(os.path.exists(f) for f in fr): continue
    ims = [Image.open(f).convert('RGBA').resize((300, 300), Image.LANCZOS) for f in fr]  # 회전은 0.5초 동안만 보인다 — 300px(100pt @3x)
    w = ims[0].width
    strip = Image.new('RGBA', (w * n, w))
    for k, im in enumerate(ims): strip.paste(im, (k * w, 0))
    a = np.asarray(strip).astype(np.float32) / 255
    a[..., 3] = np.where(a[..., 3] < 8 / 255, 0, a[..., 3])
    im2 = Image.fromarray((a * 255 + 0.5).astype(np.uint8), 'RGBA')
    fn = f'{name}@{w}.webp'; pth = os.path.join(OUT, fn)
    im2.save(pth, 'WEBP', quality=72, method=6, exact=False, alpha_quality=70)
    sizes[fn] = os.path.getsize(pth); total['spin'] = total.get('spin', 0) + sizes[fn]
    SPIN[name[:-5]] = [n, w]

# ── 씨앗(320 한 크기) ──
SEED = []
for p in sorted(glob.glob(os.path.join(B, 'seed', '*.png'))):
    name = os.path.basename(p)[:-4]
    save(contact(load(p)), name, [512] if name.endswith(('-t00', '-crack1', '-crack2')) else [384], Q['seed'], 'seed'); SEED.append(name)  # 돌아가는 컷은 384(움직이는 동안 차이 안 보임), 멈춰 보이는 앞모습·금은 512

# ── 장면 · 띠 ──
SCENE = {}
sm = readmeta('scene')
for name, m in sm.items():
    p = os.path.join(B, 'scene', name + '.png')
    if not os.path.exists(p): continue
    im = Image.open(p).convert('RGB')
    w = 1170
    a = np.asarray(im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)).astype(np.float32) / 255
    a = np.concatenate([a, np.ones_like(a[..., :1])], -1)
    save(a, name, [w, 390] if name.startswith('scene') else [w], Q['scene'], 'scene')  # 390 = 배경 묶음 받기 전 미리보기
    SCENE[name] = {'perch': m['perch'], 'unit': round(m['unit_px'] / m['w'], 4), 'aspect': round(m['h'] / m['w'], 4)}

# ── 방 장식 ──
DEC = {}
for p in sorted(glob.glob(os.path.join(B, 'decor', '*.png'))):
    name = os.path.basename(p)[:-4]
    a = contact(load(p))
    save(a, name, [256], Q['small'], 'decor'); DEC[name] = bbox(a)

def ts(o):
    return json.dumps(o, ensure_ascii=False, separators=(',', ':'))

src = f"""// 자동 생성 — scripts/characters3d/encode.py (손으로 고치지 않는다). 49 §4 그림 목록.
// 좌표는 모두 캔버스 비율(0~1, 왼쪽 위 원점). 같은 종·단계의 층(몸·얼굴·옷·소품)은 같은 캔버스·같은 카메라다.
export const ART3D_VERSION = 'v3'
/** 몸: head=[x,y,반지름], face=[x,y](얼굴 가운데), top=[x,y](새싹 꼭대기), neck·hand·back=[x,y], props=칸 소품의 칸, box=그려진 테두리 */
export const BODIES: Record<string, {{ head: number[]; face: number[]; top: number[]; neck?: number[]; hand?: number[]; back?: number[]; props: string[]; box: number[] }}> = {ts(BODY)}
/** 얼굴 층 테두리 상자 */
export const FACES: Record<string, number[]> = {ts(FACES)}
/** 옷 층(<종>-<단계>-acc-<옷>) 테두리 상자 — 옷장 칸 그림은 이 상자로 자른다 */
export const ACCS: Record<string, number[]> = {ts(ACC)}
/** 칸 소품 층(<종>-<단계><갈래>-prop) */
export const PROPS: Record<string, number[]> = {ts(PROP)}
export const SEEDS3D: string[] = {ts(SEED)}
/** 장면: perch=받침 윗면(캐릭터 발밑) 자리, unit=1 m가 캔버스 폭에서 차지하는 비율, aspect=높이/폭 */
export const SCENES3D: Record<string, {{ perch: number[]; unit: number; aspect: number }}> = {ts(SCENE)}
export const DECOR3D: Record<string, number[]> = {ts(DEC)}
/** 한 바퀴 회전 띠: 몸 이름 → [컷 수, 컷 크기 px] (파일 = <몸>-spin@<px>.webp, 가로로 컷이 이어짐) */
export const SPINS3D: Record<string, number[]> = {ts(SPIN)}
/** 파일 크기(바이트) — 예산 시험용 */
export const FILE_BYTES: Record<string, number> = {ts(sizes)}
"""
DEFAULT_OUT = '--out' not in sys.argv
if DEFAULT_OUT: open(MAN, 'w').write(src)
print(json.dumps({k: round(v / 1024) for k, v in total.items()}), 'KB · files', len(sizes), '· all', round(sum(sizes.values()) / 1024), 'KB')

# ── 휴대폰 그림 목록(Metro는 require 글자가 그대로 있어야 묶는다) ──
MOB = os.path.join(ROOT, 'apps/mobile/src/growth/art/art3dFiles.ts')
rel = os.path.relpath(OUT, os.path.dirname(MOB))
import re
HATS = {'acorn-cap', 'leaf-hat', 'straw', 'beanie', 'santa'}
def tier(fn):
    # packages/schema/src/art3d.ts mobileTier와 같은 규칙(시험이 둘을 맞춰 본다)
    m = re.match(r'^(.+)@(\d+)\.webp$', fn)
    if not m: return 'none'
    key, px = m.group(1), int(m.group(2))
    if key.startswith('scene-'): return 'base' if px == 390 or re.match(r'^scene-(day|dawn|dusk|sunset)$', key) else 'bg'
    if re.match(r'^(seed|band|decor)', key): return 'base'
    if key.endswith('-spin'): return 'pack'
    a = re.match(r'^[a-z]+-\d-acc-(.+)$', key)
    if a: return 'pack' if px == 768 else ('base' if a.group(1) in HATS else 'none')
    st = int(re.match(r'^[a-z]+-(\d)', key).group(1))
    if px == 160: return 'base'
    if px == 384: return 'pack'
    return 'base' if st == 1 and not key.endswith('-prop') else 'pack'
base = [fn for fn in sorted(sizes) if tier(fn) == 'base']
print('mobile base', round(sum(sizes[f] for f in base) / 1024), 'KB ·', len(base), 'files')
for sp in ('snail', 'bee', 'worm', 'frog'):
    print(' pack', sp, round(sum(v for f, v in sizes.items() if f.startswith(sp + '-') and tier(f) == 'pack') / 1024), 'KB')
lines = [f"  '{fn}': require('{rel}/{fn}')," for fn in base]
if DEFAULT_OUT: open(MOB, 'w').write("// 자동 생성 — scripts/characters3d/encode.py (손으로 고치지 않는다). 49 §4.4: 휴대폰 앱에 넣는 기본 묶음(파일 이름 → require). 종 묶음은 art3dPacks.ts가 내려받는다.\n"
                     "/* eslint-disable @typescript-eslint/no-require-imports */\nexport const ART_FILES: Record<string, number> = {\n" + "\n".join(lines) + "\n}\n")
print('mobile list', len(lines))
