#!/bin/sh
# server/.env 를 무작위 비밀번호로 만든다. 이미 있으면 건드리지 않는다.
set -e
cd "$(dirname "$0")/.."
if [ -f .env ]; then echo ".env already exists — 그대로 둔다"; exit 0; fi
rand() { openssl rand -hex 24; }
cat > .env <<EOF
PG_USER=sprout
PG_PASSWORD=$(rand)
PG_DB=sprout
PS_ADMIN_TOKEN=$(rand)
# 이 컴퓨터에서만 열리는 포트(127.0.0.1)
PG_PORT=55432
API_PORT=6060
PS_PORT=8080
BACKUP_DIR=./backups
BACKUP_KEEP_DAYS=14
EOF
chmod 600 .env
echo "created server/.env"
