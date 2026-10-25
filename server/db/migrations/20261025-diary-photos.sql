-- 28 §10 v7 일기 사진 한 장 (2026-10-25). 다시 돌려도 안전. 적용 전 pg_dump 백업(README).
-- 순서: 이 마이그레이션 → 동기화 규칙(npm run server:schema로 diary_photos 줄) → PowerSync 재시작 → API(POST/GET /media) → 앱.

-- 1) 그날 사진 목록(동기화)
CREATE TABLE IF NOT EXISTS diary_photos (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  date text,
  media_id text,
  width integer,
  height integer,
  sort_order integer
);
CREATE INDEX IF NOT EXISTS diary_photos_owner_date_idx ON diary_photos (owner_id, date);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='diary_photos') THEN
 ALTER PUBLICATION powersync ADD TABLE diary_photos;
 END IF;
END $$;

-- 2) 사진 바이트(서버 전용, 동기화·publication 없음). 계정을 지우면 함께. DB 백업(pg_dump)에 들어간다
CREATE TABLE IF NOT EXISTS media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime text NOT NULL,
  bytes bytea NOT NULL,
  size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_owner_idx ON media (owner_id, created_at);
