#!/bin/sh
# 49 §4 · 3D 스프라이트 전체 굽기: Blender(헤드리스) → PNG(build/, 커밋 안 함) → WebP(docs/screens/mockups/assets/char3d/)
# 사용: sh scripts/characters3d/build.sh [characters|seeds|scenes ...]   (기본: 셋 다)
# Blender 5.2 이상(brew install --cask blender). Node 쪽 의존 없음. PIL(python3) 필요.
set -e
cd "$(dirname "$0")"
OUT=../../docs/screens/mockups/assets/char3d
for j in ${@:-characters seeds scenes}; do
  blender -b --factory-startup -P kk3d.py -- "jobs/$j.json" 2>&1 | grep -E "DONE|Error|Traceback" || true
done
for d in char seed scene; do [ -f "build/$d/meta.json" ] && python3 encode.py "build/$d" "$OUT/$d"; done
