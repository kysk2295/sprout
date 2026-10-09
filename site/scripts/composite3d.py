# 49 §8.1 사이트 캐릭터 그림: 미리 구운 3D 층(packages/schema/art3d/*.webp)을 겹쳐 한 장으로 굽는다.
# gen-characters.mjs가 부른다(stdin = JSON 작업 목록). 같은 캔버스 층을 순서대로 alpha 합성 → 상자(box, 캔버스 비율)로 자르기 → px 정사각형 WebP.
# 실행: scripts/characters3d/.venv/bin/python (PIL)
import json, sys
from PIL import Image

def main():
    jobs = json.load(sys.stdin)
    for j in jobs:
        canvas = None
        for f in j['files']:
            try:
                im = Image.open(f).convert('RGBA')
            except FileNotFoundError:
                continue
            if canvas is None:
                canvas = Image.new('RGBA', im.size, (0, 0, 0, 0))
            if im.size != canvas.size:
                im = im.resize(canvas.size, Image.LANCZOS)
            canvas.alpha_composite(im)
        if canvas is None:
            print('skip (no layers):', j['out'], file=sys.stderr)
            continue
        W, H = canvas.size
        b = j['box']
        crop = canvas.crop((round(b['x'] * W), round(b['y'] * H), round((b['x'] + b['w']) * W), round((b['y'] + b['h']) * H)))
        px = j['px']
        crop = crop.resize((px, px), Image.LANCZOS)
        crop.save(j['out'], 'WEBP', quality=j.get('quality', 84), method=6)
        print('->', j['out'])

main()
