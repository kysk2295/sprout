# Railway용 Postgres — 빌드 컨텍스트는 저장소 루트(railway up). docker-compose의 db와 같은 설정:
# wal_level=logical(PowerSync 복제) + 처음 만들 때 db/init(저장 DB·기본 표·동기화 스키마) 실행
FROM postgres:18
COPY server/db/init/ /docker-entrypoint-initdb.d/
CMD ["postgres", "-c", "wal_level=logical"]
