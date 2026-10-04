#!/bin/sh
# 25 맥 위젯 빌드 — npm run widget:build (apps/desktop)
#  ① SproutWidget.appex (Xcode, Release, arm64 — 앱과 같은 아키텍처) → out/SproutWidget.appex
#  ② widget_bridge.node (Swift Node-API 모듈, WidgetCenter 새로 고침) → out/widget_bridge.node
#  ③ 둘 다 서명: 위젯은 샌드박스 + App Group entitlements, 하드닝 런타임
#  ④ electron-builder가 쓰는 자리로 복사: build/widget/SproutWidget.appex(after-pack.cjs가 Contents/PlugIns/에 넣음)
#
# 환경 변수
#   SPROUT_SIGN_ID  서명 ID(기본: 키체인의 첫 "Apple Development" → 없으면 "Developer ID Application" → 없으면 ad-hoc "-")
#   SPROUT_TEAM_ID  App Group 앞자리 팀 ID(기본 BU697KN34B — 서명 인증서의 OU. 인증서를 바꾸면 이 값과
#                   src/main/widget.ts·SproutWidget/Snapshot.swift·build/entitlements.mac.plist를 같이 바꾼다)
# 설명: docs/release/packaging.md §4, docs/screens/25-mac-widget.md §14
set -eu
cd "$(dirname "$0")"
HERE=$(pwd)
OUT="$HERE/out"
TEAM="${SPROUT_TEAM_ID:-BU697KN34B}"
GROUP="$TEAM.app.sprout.desktop"

if [ -z "${SPROUT_SIGN_ID:-}" ]; then
  SPROUT_SIGN_ID=$(security find-identity -v -p codesigning | awk -F'"' '/Apple Development/{print $2; exit}')
  [ -z "$SPROUT_SIGN_ID" ] && SPROUT_SIGN_ID=$(security find-identity -v -p codesigning | awk -F'"' '/Developer ID Application/{print $2; exit}')
  [ -z "$SPROUT_SIGN_ID" ] && SPROUT_SIGN_ID="-"
fi
echo "[widget] 서명 ID: $SPROUT_SIGN_ID · App Group: $GROUP"
[ "$SPROUT_SIGN_ID" = "-" ] && echo "[widget] ⚠ ad-hoc 서명 — App Group(팀 ID 이름)을 쓸 수 없어 위젯이 데이터를 못 읽는다(확인 창/거부)."

rm -rf "$OUT"
mkdir -p "$OUT"

# ① 위젯 확장 — 서명은 아래에서 직접(Xcode 자동 서명은 프로비저닝 프로파일을 찾으려 해서 끈다)
xcodebuild -project SproutWidget.xcodeproj -target SproutWidget -configuration Release \
  SYMROOT="$OUT/build" OBJROOT="$OUT/dd" ARCHS=arm64 ONLY_ACTIVE_ARCH=NO \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" -quiet build
cp -R "$OUT/build/Release/SproutWidget.appex" "$OUT/SproutWidget.appex"

# ② 새로 고침 모듈(Node-API는 ABI 고정 → Node 22 헤더로 빌드해 Electron에서 그대로 로드)
NODE_INC=""
for d in "$(dirname "$(command -v node)")/../include/node" /opt/homebrew/Cellar/node@22/*/include/node "$HOME/.electron-gyp"/*/include/node; do
  if [ -f "$d/node_api.h" ]; then NODE_INC="$d"; break; fi
done
[ -z "$NODE_INC" ] && { echo "[widget] node_api.h를 찾을 수 없음(Node 22 필요)"; exit 1; }
swiftc -emit-library -O -o "$OUT/widget_bridge.node" -module-name SproutWidgetBridge \
  -import-objc-header Bridge/node_api_shim.h -I "$NODE_INC" -target arm64-apple-macos12.0 \
  -Xlinker -undefined -Xlinker dynamic_lookup -framework WidgetKit Bridge/WidgetBridge.swift

# ③ 서명 — 안쪽부터. 위젯 entitlements는 팀 ID를 바꿔 끼운 사본으로
sed "s/BU697KN34B/$TEAM/g" SproutWidget/SproutWidget.entitlements > "$OUT/SproutWidget.entitlements"
codesign --force --options runtime --timestamp=none --sign "$SPROUT_SIGN_ID" "$OUT/widget_bridge.node"
codesign --force --options runtime --timestamp=none --entitlements "$OUT/SproutWidget.entitlements" --sign "$SPROUT_SIGN_ID" "$OUT/SproutWidget.appex"
codesign --verify --strict "$OUT/SproutWidget.appex"

# ④ electron-builder 자리로
DEST="$HERE/../../build/widget"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$OUT/SproutWidget.appex" "$DEST/SproutWidget.appex"
cp "$OUT/SproutWidget.entitlements" "$DEST/SproutWidget.entitlements"
cp "$OUT/widget_bridge.node" "$DEST/widget_bridge.node"
rm -rf "$OUT/dd" "$OUT/build"
echo "[widget] 완료: $DEST/SproutWidget.appex, widget_bridge.node"
