#!/bin/sh
# PowerSync 버킷 저장용 DB를 같은 Postgres 안에 따로 만든다(데이터 DB와 분리, 컨테이너는 하나)
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE powersync_storage;
EOSQL
