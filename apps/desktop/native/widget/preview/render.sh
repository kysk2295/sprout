#!/bin/sh
# 25 위젯 미리보기 PNG(§15 월 캘린더 크게·중간 · 캐릭터 작게·중간 · 오늘 작게·중간·크게)
#   × 라이트·다크 × 렌더링 모드(full · vibrant · accented, §16) + 고치기 전 vibrant(비교용). 위젯을 설치하지 않는다.
#   sh native/widget/preview/render.sh [예시 JSON(기본 fixtures/snapshot.calendar.json)] [출력 폴더(기본 $TMPDIR/sprout-widget-preview)]
# 캐릭터 그림: 앱이 구워 둔 App Group의 art/ 중 첫 PNG를 임시 폴더로 복사해 쓴다(없으면 단색 실루엣).
set -eu
cd "$(dirname "$0")/.."
OUT_BIN="${TMPDIR:-/tmp}/sprout-widget-render"
ROOT="${TMPDIR:-/tmp}/sprout-widget-preview-root"
W=SproutWidget
swiftc -parse-as-library -O -D WIDGET_RENDER -target arm64-apple-macos14.0 -o "$OUT_BIN" \
  preview/render.swift $W/Snapshot.swift $W/Views.swift $W/MonthWidget.swift $W/SproutWidgetBundle.swift $W/Provider.swift $W/ToggleTaskIntent.swift \
  -framework SwiftUI -framework WidgetKit -framework AppIntents
rm -rf "$ROOT"; mkdir -p "$ROOT/art"
ART_SRC="$HOME/Library/Group Containers/BU697KN34B.app.sprout.desktop/widget/art"
ART=$(ls "$ART_SRC" 2>/dev/null | grep '\.png$' | head -1 || true)
if [ -n "$ART" ]; then
  cp "$ART_SRC/$ART" "$ROOT/art/$ART"
  export SPROUT_PREVIEW_ART="art/$ART"
fi
SPROUT_WIDGET_ROOT="$ROOT" "$OUT_BIN" "${1:-fixtures/snapshot.calendar.json}" "${2:-${TMPDIR:-/tmp}/sprout-widget-preview}"
