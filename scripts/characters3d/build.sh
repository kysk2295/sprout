#!/bin/sh
# 49 §4 · 3D 스프라이트 전체 굽기: jobs.py(구울 목록) → Blender 헤드리스(run_all.sh, PNG는 build/ — 커밋 안 함) → encode.py
#   → packages/schema/art3d/*.webp + packages/schema/src/art3dManifest.ts + apps/mobile/src/growth/art/art3dFiles.ts
# 준비: brew install --cask blender (5.2+) · python3 -m venv .venv && .venv/bin/pip install numpy pillow
# 이어 굽기: 이미 구운 항목은 건너뛴다. 처음부터 = rm -rf build. 전체 ≈ 1시간(M3 Pro CPU, 640px · 64샘플 + OIDN).
set -e
cd "$(dirname "$0")"
python3 jobs.py
./run_all.sh
.venv/bin/python encode.py
