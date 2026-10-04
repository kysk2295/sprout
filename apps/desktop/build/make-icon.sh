#!/bin/sh
# build/icon.svg → build/icon.icns, build/icon.png 를 다시 만든다(macOS 전용: Chrome 헤드리스 + sips + iconutil).
# 사용법: sh apps/desktop/build/make-icon.sh
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP=$(mktemp -d)
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
  --window-size=1024,1024 --screenshot="$TMP/icon-1024.png" "file://$DIR/icon.svg" >/dev/null 2>&1
cp "$TMP/icon-1024.png" "$DIR/icon.png"
SET="$TMP/icon.iconset"; mkdir -p "$SET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$TMP/icon-1024.png" --out "$SET/icon_${s}x${s}.png" >/dev/null
  d=$((s*2)); sips -z $d $d "$TMP/icon-1024.png" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o "$DIR/icon.icns"
rm -rf "$TMP"
echo "icon.icns, icon.png 생성: $DIR"
