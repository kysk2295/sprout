#!/bin/sh
# 사용법: source scripts/node22.sh
# 시스템 기본 Node 26에서는 Electron 설치가 조용히 실패한다(spikes/a1 RESULT 참고). Homebrew node@22를 앞에 둔다.
NODE22_BIN=$(ls -d /opt/homebrew/Cellar/node@22/*/bin 2>/dev/null | tail -1)
if [ -z "$NODE22_BIN" ]; then echo "node@22가 없습니다: brew install node@22"; return 1 2>/dev/null || exit 1; fi
export PATH="$NODE22_BIN:$PATH"
echo "node $(node -v), npm $(npm -v)"
