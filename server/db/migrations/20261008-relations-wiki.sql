-- 33 관계 위키(태그 = 위키 페이지 · 자동 태그 · [[링크]]). 이미 데이터가 있는 서버에 적용한다(다시 돌려도 안전).
-- 순서: 이 파일 → API(새 칸을 받는 upload 허용 목록 + /ai/tag) → PowerSync 동기화 규칙(relations) → 앱.
-- 서버가 앱보다 먼저 올라가야 한다(모르는 칸·표 = 409, 앱은 서버가 올라올 때까지 다시 보낸다).

-- ① tags: 종류·별칭·설명·위키 주제·집·출처·일괄 묶음
ALTER TABLE tags ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS aliases text;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS topic_id text;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS home_type text;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS home_id text;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS run_id text;

-- ② task_tags: 출처·상태·점수·일괄 묶음(기존 행은 비어 있음 = user·accepted)
ALTER TABLE task_tags ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE task_tags ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE task_tags ADD COLUMN IF NOT EXISTS confidence integer;
ALTER TABLE task_tags ADD COLUMN IF NOT EXISTS run_id text;

-- ③ lists: 페이지 머리 설명
ALTER TABLE lists ADD COLUMN IF NOT EXISTS description text;

-- ④ relations: [[링크]]·리스트 고정 쌍·메모 ↔ 태그 (db/init/02-schema.sql 과 같다)
CREATE TABLE IF NOT EXISTS relations (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  from_type text,
  from_id text,
  to_type text,
  to_id text,
  source text,
  state text,
  field text
);
CREATE INDEX IF NOT EXISTS relations_owner_idx ON relations (owner_id);
CREATE INDEX IF NOT EXISTS relations_from_idx ON relations (owner_id, from_id);
CREATE INDEX IF NOT EXISTS relations_to_idx ON relations (owner_id, to_id);

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='relations') THEN
 ALTER PUBLICATION powersync ADD TABLE relations;
 END IF;
END $$;

-- ⑤ 이름이 같은 태그 ↔ 수집함 위키 주제를 한 번 이어 준다(33 §8.1). 이미 이어진 태그는 그대로
UPDATE tags t SET topic_id = w.id, modified_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
FROM (
  SELECT DISTINCT ON (owner_id, lower(btrim(name))) id, owner_id, lower(btrim(name)) AS key
  FROM wiki_topics WHERE name IS NOT NULL ORDER BY owner_id, lower(btrim(name)), created_at
) w
WHERE t.owner_id = w.owner_id AND lower(btrim(t.name)) = w.key AND t.topic_id IS NULL;
