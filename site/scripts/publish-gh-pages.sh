#!/usr/bin/env bash
# 소개 사이트를 gh-pages 브랜치로 올린다(Pages 출처 = gh-pages /). Actions가 막혀도 이 맥에서 바로 배포할 때 쓴다.
#   . scripts/node22.sh && site/scripts/publish-gh-pages.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
node site/build.mjs
node site/scripts/pages.mjs
remote="${GH_PAGES_REMOTE:-$(git remote get-url origin)}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -R site/.pages/. "$tmp"/
cd "$tmp"
git init -q -b gh-pages
git add -A
git -c user.name="${GIT_AUTHOR_NAME:-$(git -C "$OLDPWD" config user.name)}" -c user.email="${GIT_AUTHOR_EMAIL:-$(git -C "$OLDPWD" config user.email)}" \
  commit -q -m "소개 사이트 $(git -C "$OLDPWD" rev-parse --short HEAD)"
git push -q -f "$remote" gh-pages
echo "gh-pages 올림 → https://kysk2295.github.io/sprout/ (반영까지 1~2분)"
