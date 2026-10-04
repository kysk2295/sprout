-- 10 성장 테이블. 이미 데이터가 있는 서버에 동기화 규칙을 올리기 전에 적용한다(다시 돌려도 안전).

CREATE TABLE IF NOT EXISTS xp_events (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  kind text,
  amount integer,
  ref_id text,
  day text
);
CREATE INDEX IF NOT EXISTS xp_events_owner_idx ON xp_events (owner_id);
CREATE INDEX IF NOT EXISTS xp_events_day_idx ON xp_events (owner_id, day);

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='xp_events') THEN
 ALTER PUBLICATION powersync ADD TABLE xp_events;
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS characters (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  name text,
  species text,
  type_code text,
  answers_json text,
  assessed_at text
);
CREATE INDEX IF NOT EXISTS characters_owner_idx ON characters (owner_id);

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='characters') THEN
 ALTER PUBLICATION powersync ADD TABLE characters;
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS kpis (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  week_start text,
  title text,
  target integer,
  progress integer,
  link_kind text,
  link_id text,
  status text,
  source text,
  achieved_at text,
  sort_order double precision
);
CREATE INDEX IF NOT EXISTS kpis_owner_idx ON kpis (owner_id);
CREATE INDEX IF NOT EXISTS kpis_week_idx ON kpis (owner_id, week_start);

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='kpis') THEN
 ALTER PUBLICATION powersync ADD TABLE kpis;
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS weekly_reports (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  week_start text,
  stats_json text,
  text_json text,
  xp_total integer,
  seen_at text
);
CREATE INDEX IF NOT EXISTS weekly_reports_owner_idx ON weekly_reports (owner_id);

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='weekly_reports') THEN
 ALTER PUBLICATION powersync ADD TABLE weekly_reports;
 END IF;
END $$;
