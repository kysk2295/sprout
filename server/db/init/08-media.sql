-- 28 §10 v7 일기 사진 바이트(서버 전용, 동기화 안 함). 이미 있는 DB는 migrations/20261025-diary-photos.sql
CREATE TABLE IF NOT EXISTS media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime text NOT NULL,
  bytes bytea NOT NULL,
  size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_owner_idx ON media (owner_id, created_at);
