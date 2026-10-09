#!/bin/sh
# 49 §4 · 전체 굽기(몸 → 얼굴 → 칸 소품 → 옷 4종 → 씨앗 → 장면 → 장식). 이어 굽기: 이미 구운 항목(meta.json의 @이름)은 건너뛴다.
cd "$(dirname "$0")"
for j in bodies faces props spins acc-snail acc-bee acc-worm acc-frog seeds scenes decor; do
  blender -b --factory-startup -P kk3d.py -- "jobs/$j.json" 2>&1 | grep -E "DONE|SKIP|Error|Traceback|^  File" 
  echo "== $j $(date +%T)"
done
