#!/bin/sh
# 외부 백업(CLAUDE.md "Postgres 자동 백업을 외부 저장소로" · RELEASE-CHECKLIST §6) — 구글 드라이브(사용자 결정 2026-10-10, iCloud 아님):
# server/backups의 pg_dump 파일을 age로 암호화해 backups/offsite/에 두고, rclone으로 구글 드라이브 `sprout-backups`에 올린다.
# 구글 권한은 drive.file(이 백업이 만든 파일만). rclone 원격 이름 = gdrive(server/README.md "외부 백업"에서 운영자가 한 번 만든다).
# 복원 키(비밀 키)는 운영자 맥 ~/.config/sprout/backup-age.key에만 — 서버·드라이브에는 잠그는 공개 키만.
#   복원: rclone copy gdrive:sprout-backups/sprout-<날짜>.dump.age . && age -d -i ~/.config/sprout/backup-age.key sprout-<날짜>.dump.age > x.dump && pg_restore -d <DB> x.dump
# 실행: launchd(server/backup/app.sprout.backup-offsite.plist)가 매일 한 번. 수동: sh server/backup/offsite.sh
set -eu
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
HERE=$(cd "$(dirname "$0")" && pwd)
SRC=${BACKUP_SRC:-"$HERE/../backups"}
STAGE="$SRC/offsite"
REMOTE=${BACKUP_REMOTE:-gdrive:sprout-backups}
RECIPIENT_FILE=${BACKUP_AGE_RECIPIENT:-"$HOME/.config/sprout/backup-age.pub"}
KEEP=${BACKUP_OFFSITE_KEEP_DAYS:-30}

[ -s "$RECIPIENT_FILE" ] || { echo "offsite: 공개 키 없음 $RECIPIENT_FILE" >&2; exit 1; }
mkdir -p "$STAGE"
for f in "$SRC"/sprout-*.dump; do
  [ -e "$f" ] || continue
  out="$STAGE/$(basename "$f").age"
  [ -e "$out" ] || { age -R "$RECIPIENT_FILE" -o "$out.tmp" "$f" && mv "$out.tmp" "$out"; }
done
find "$STAGE" -name 'sprout-*.dump.age' -mtime +"$KEEP" -delete
rclone copy "$STAGE" "$REMOTE" --include 'sprout-*.dump.age'
rclone delete "$REMOTE" --include 'sprout-*.dump.age' --min-age "${KEEP}d"
echo "offsite $(date '+%F %T'): 드라이브 $(rclone lsf "$REMOTE" --include 'sprout-*.dump.age' | wc -l | tr -d ' ')개"
