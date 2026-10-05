-- 16 §12.0 연결된 일정: 꿈틀 일정 ↔ 구글·Apple 캘린더 양쪽 저장(2026-10-05 사용자 결정). 이미 데이터가 있는 서버에 적용한다(다시 돌려도 안전).
-- 적용 전 pg_dump 백업(README). 순서: 이 마이그레이션 → API 재시작(업로드 허용 칸은 @sprout/schema TABLES에서 자동) → 앱.
-- 앱이 먼저면 모르는 칸 = 409로 업로드가 계속 재시도한다. PowerSync 규칙은 SELECT * 라 바꿀 것 없음.
ALTER TABLE events ADD COLUMN IF NOT EXISTS ext_provider text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ext_account text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ext_calendar text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ext_id text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ext_etag text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ext_updated text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ext_hash text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ext_error text;
CREATE INDEX IF NOT EXISTS events_ext_idx ON events (owner_id, ext_provider);
