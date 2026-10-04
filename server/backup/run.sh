#!/bin/sh
# 매일 pg_dump(-Fc, 복원은 pg_restore) → /backups, BACKUP_KEEP_DAYS일 지난 파일은 지운다.
# 외부 저장소(예: Cloudflare R2) 전송은 배포 때 붙인다 — server/README.md 참고.
set -e
until pg_isready -q; do sleep 2; done
while true; do
  f="/backups/sprout-$(date +%Y%m%d-%H%M%S).dump"
  if pg_dump -Fc -f "$f.tmp"; then
    mv "$f.tmp" "$f"
    echo "backup ok: $f ($(du -h "$f" | cut -f1))"
  else
    rm -f "$f.tmp"
    echo "backup FAILED" >&2
  fi
  find /backups -name 'sprout-*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
  sleep "${BACKUP_INTERVAL_SEC:-86400}"
done
