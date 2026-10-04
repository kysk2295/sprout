#!/bin/sh
# Swift 링크 판정·행 모양 확인(맥에서): sh apps/mobile/plugins/share-extension/test/check-vectors.sh
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$(mktemp -d)
swiftc -O -o "$OUT/check" "$HERE/../ios/ShareCore.swift" "$HERE/main.swift"
"$OUT/check" "$HERE/../../../src/share/vectors.json"
