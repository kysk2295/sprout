#!/bin/sh
# 16 §11.4 Apple 캘린더 도우미 빌드 — npm run calendar:build (apps/desktop)
# 결과: out/sprout-calendar (arm64 + x64 유니버설, Info.plist 포함 — 인텔 맥용 앱에도 같은 파일). 패키징 때 electron-builder extraResources가 Contents/Resources/로 넣는다.
# 서명: SPROUT_SIGN_ID가 있으면 하드닝 런타임으로 서명(없으면 ad-hoc). 앱 서명 때 electron-builder가 다시 서명한다.
set -eu
cd "$(dirname "$0")"
mkdir -p out
for arch in arm64 x86_64; do
  xcrun swiftc -O -target "$arch-apple-macos12.0" main.swift -o "out/sprout-calendar-$arch" \
    -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker Info.plist
done
lipo -create out/sprout-calendar-arm64 out/sprout-calendar-x86_64 -output out/sprout-calendar
rm -f out/sprout-calendar-arm64 out/sprout-calendar-x86_64
codesign --force --options runtime --sign "${SPROUT_SIGN_ID:--}" --identifier app.sprout.desktop.calendar-helper out/sprout-calendar
echo "[calendar] 빌드: $(pwd)/out/sprout-calendar"
