-- 06 §14.4 sprout 자체 일정(2026-10-05 사용자 결정). 이미 데이터가 있는 서버에 적용한다(다시 돌려도 안전).
-- 순서: 이 파일 → API 재시작(업로드 허용 목록은 @sprout/schema TABLES에서 자동) → PowerSync 동기화 규칙(events) → 앱.
-- 서버가 앱보다 먼저 올라가야 한다(모르는 표 = 409, 앱은 서버가 올라올 때까지 다시 보낸다).
-- 20261008-relations-wiki.sql 과 순서 상관없음(서로 다른 표).

CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  title text,
  notes text,
  start_at text,
  end_at text,
  is_all_day integer,
  time_zone text,
  repeat_rule text,
  location text,
  reminders text,
  color text,
  deleted_at text
);
CREATE INDEX IF NOT EXISTS events_owner_idx ON events (owner_id);
CREATE INDEX IF NOT EXISTS events_start_idx ON events (owner_id, start_at);
CREATE INDEX IF NOT EXISTS events_end_idx ON events (owner_id, end_at);

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='events') THEN
 ALTER PUBLICATION powersync ADD TABLE events;
 END IF;
END $$;
