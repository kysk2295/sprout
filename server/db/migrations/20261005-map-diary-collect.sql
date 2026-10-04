-- 작업 지도(14)·일기(15)·수집함 v3(11) 저장 칸. 이미 데이터가 있는 서버에 동기화 규칙을 올리기 전에 적용한다(다시 돌려도 안전).

-- 수집함 v3: notes 칸 추가(기존 행은 kind 없음 = memo)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS kind_source text;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS ai_state text;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS suggestion text;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS url text;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS link_title text;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS seen_at text;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS topic_id text;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS captured_at text;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS fingerprint text;
CREATE INDEX IF NOT EXISTS notes_topic_idx ON notes (owner_id, topic_id);
CREATE INDEX IF NOT EXISTS notes_fingerprint_idx ON notes (owner_id, fingerprint);

CREATE TABLE IF NOT EXISTS wiki_topics (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  name text,
  source text,
  content text,
  locked text,
  version integer
);
CREATE INDEX IF NOT EXISTS wiki_topics_owner_idx ON wiki_topics (owner_id);

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='wiki_topics') THEN
 ALTER PUBLICATION powersync ADD TABLE wiki_topics;
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS wiki_versions (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  topic_id text,
  version integer,
  content text,
  reason text
);
CREATE INDEX IF NOT EXISTS wiki_versions_owner_idx ON wiki_versions (owner_id);
CREATE INDEX IF NOT EXISTS wiki_versions_topic_idx ON wiki_versions (owner_id, topic_id);

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='wiki_versions') THEN
 ALTER PUBLICATION powersync ADD TABLE wiki_versions;
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS map_areas (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  name text,
  parent_id text,
  sort_order double precision,
  source text,
  color text,
  archived_at text
);
CREATE INDEX IF NOT EXISTS map_areas_owner_idx ON map_areas (owner_id);
CREATE INDEX IF NOT EXISTS map_areas_parent_idx ON map_areas (owner_id, parent_id);

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='map_areas') THEN
 ALTER PUBLICATION powersync ADD TABLE map_areas;
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS task_areas (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  task_id text,
  area_id text,
  source text,
  state text,
  run_id text
);
CREATE INDEX IF NOT EXISTS task_areas_owner_idx ON task_areas (owner_id);
CREATE INDEX IF NOT EXISTS task_areas_task_idx ON task_areas (owner_id, task_id);
CREATE INDEX IF NOT EXISTS task_areas_area_idx ON task_areas (owner_id, area_id);

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='task_areas') THEN
 ALTER PUBLICATION powersync ADD TABLE task_areas;
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS map_links (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  kind text,
  from_type text,
  from_id text,
  to_id text,
  source text,
  state text
);
CREATE INDEX IF NOT EXISTS map_links_owner_idx ON map_links (owner_id);
CREATE INDEX IF NOT EXISTS map_links_from_idx ON map_links (owner_id, from_id);
CREATE INDEX IF NOT EXISTS map_links_to_idx ON map_links (owner_id, to_id);

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='map_links') THEN
 ALTER PUBLICATION powersync ADD TABLE map_links;
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS diary_entries (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  date text,
  mood integer,
  content text,
  prompt text,
  private integer,
  summary text
);
CREATE INDEX IF NOT EXISTS diary_entries_owner_idx ON diary_entries (owner_id);
CREATE INDEX IF NOT EXISTS diary_entries_date_idx ON diary_entries (owner_id, date);

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='diary_entries') THEN
 ALTER PUBLICATION powersync ADD TABLE diary_entries;
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS diary_messages (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  entry_id text,
  role text,
  content text,
  safety integer
);
CREATE INDEX IF NOT EXISTS diary_messages_owner_idx ON diary_messages (owner_id);
CREATE INDEX IF NOT EXISTS diary_messages_entry_idx ON diary_messages (owner_id, entry_id);

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='diary_messages') THEN
 ALTER PUBLICATION powersync ADD TABLE diary_messages;
 END IF;
END $$;
