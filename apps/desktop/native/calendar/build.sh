#!/bin/sh
# 16 §11.4 Apple 캘린더 도우미 빌드 — npm run calendar:build (apps/desktop)
# 결과: out/sprout-calendar (arm64, Info.plist 포함). 패키징 때 electron-builder extraResources가 Contents/Resources/로 넣는다.
# 서명: SPROUT_SIGN_ID가 있으면 하드닝 런타임으로 서명(없으면 ad-hoc). 앱 서명 때 electron-builder가 다시 서명한다.
set -eu
cd "$(dirname "$0")"
mkdir -p out
xcrun swiftc -O -target arm64-apple-macos12.0 main.swift -o out/sprout-calendar \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker Info.plist
codesign --force --options runtime --sign "${SPROUT_SIGN_ID:--}" --identifier app.sprout.desktop.calendar-helper out/sprout-calendar
echo "[calendar] 빌드: $(pwd)/out/sprout-calendar"
