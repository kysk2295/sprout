# PNG(Blender 원본) → WebP. 캔버스는 자르지 않는다(기준점 메타데이터가 캔버스 비율 좌표라서).
#   python3 scripts/characters3d/encode.py <src_dir> <dst_dir> [--char 512,160] [--scene 780]
import sys, os, json
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
CH = [512, 160]; SC = 780
meta = json.load(open(os.path.join(src, 'meta.json')))
total = 0

def contact(im):
    """그림자 받는 바닥이 캔버스 전체에 옅은 그림자(α 30~50)를 남겨 네모 테가 보인다 →
    발밑 타원 안의 접촉 그림자만 남기고 바깥으로 부드럽게 지운다. 캐릭터 픽셀(색이 있거나 α 큼)은 그대로."""
    im = im.convert('RGBA'); w, h = im.size; px = im.load()
    cx, cy, rx, ry = w * 0.5, h * 0.9, w * 0.46, h * 0.085
    for y in range(int(h * 0.55), h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or max(r, g, b) > 10: continue
            d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            k = max(0.0, 1 - d) ** 1.3
            px[x, y] = (0, 0, 0, int(a * k * 0.62))
    for y in range(0, int(h * 0.55)):  # 위쪽 옅은 안개는 지운다
        for x in range(w):
            r, g, b, a = px[x, y]
            if 0 < a < 60 and max(r, g, b) <= 10: px[x, y] = (0, 0, 0, 0)
    return im
for name, m in meta.items():
    im = Image.open(os.path.join(src, name + '.png'))
    if 'perch' in m:  # 장면판: 폭 SC로, 불투명
        w = SC if im.width >= SC else im.width
        im2 = im.convert('RGB').resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        p = os.path.join(dst, name + '.webp'); im2.save(p, 'WEBP', quality=78, method=6); total += os.path.getsize(p)
        continue
    im = contact(im)
    sizes = [320] if name.startswith('seed') else CH
    for s in sizes:
        im2 = im.resize((s, s), Image.LANCZOS)
        suf = '' if s == sizes[0] else f'@{s}'
        p = os.path.join(dst, f'{name}{suf}.webp'); im2.save(p, 'WEBP', quality=82 if s > 200 else 80, method=6, exact=False); total += os.path.getsize(p)
json.dump(meta, open(os.path.join(dst, 'meta.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('bytes', total)
