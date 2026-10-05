#!/bin/sh
# 25 §15 월 캘린더 위젯 미리보기 PNG(라이트·다크 × 크게·중간). 위젯을 설치하지 않는다.
#   sh native/widget/preview/render.sh [예시 JSON(기본 fixtures/snapshot.calendar.json)] [출력 폴더(기본 $TMPDIR/sprout-widget-preview)]
set -eu
cd "$(dirname "$0")/.."
OUT_BIN="${TMPDIR:-/tmp}/sprout-widget-render"
W=SproutWidget
swiftc -parse-as-library -O -D WIDGET_RENDER -target arm64-apple-macos14.0 -o "$OUT_BIN" \
  preview/render.swift $W/Snapshot.swift $W/Views.swift $W/MonthWidget.swift $W/Provider.swift $W/ToggleTaskIntent.swift \
  -framework SwiftUI -framework WidgetKit -framework AppIntents
"$OUT_BIN" "${1:-fixtures/snapshot.calendar.json}" "${2:-${TMPDIR:-/tmp}/sprout-widget-preview}"
