#!/bin/sh
# 45 확정 로고(씨앗 친구 × 깊은 숲) 아이콘을 다시 만들어 제자리에 덮어쓴다(macOS 전용: Chrome 헤드리스 + sips + iconutil).
# 데스크톱(icon.icns·ico·png·svg, 메뉴 막대·트레이 기호)뿐 아니라 휴대폰·사이트·스토어 아이콘도 같이 바뀐다.
# 원본: scripts/brand/glyphs.mjs(CONCEPTS.seed) → compose.mjs → build-icons.mjs
# 사용법: sh apps/desktop/build/make-icon.sh
set -e
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
. "$ROOT/scripts/node22.sh" >/dev/null
node "$ROOT/scripts/brand/build-icons.mjs" seed --apply
