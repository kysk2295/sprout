-- 자동 생성: npm run server:schema (원본 packages/schema/src/index.ts). 직접 고치지 않는다.
CREATE TABLE IF NOT EXISTS notes (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  content text,
  task_id text,
  kind text,
  kind_source text,
  ai_state text,
  suggestion text,
  url text,
  link_title text,
  seen_at text,
  topic_id text,
  source text,
  captured_at text,
  fingerprint text
);
CREATE INDEX IF NOT EXISTS notes_owner_idx ON notes (owner_id);
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

CREATE TABLE IF NOT EXISTS folders (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  name text,
  sort_order double precision
);
CREATE INDEX IF NOT EXISTS folders_owner_idx ON folders (owner_id);

CREATE TABLE IF NOT EXISTS lists (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  name text,
  emoji text,
  color text,
  folder_id text,
  kind text,
  sort_order double precision,
  pinned integer,
  archived_at text,
  show_in_smart text,
  description text
);
CREATE INDEX IF NOT EXISTS lists_owner_idx ON lists (owner_id);

CREATE TABLE IF NOT EXISTS tags (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  name text,
  color text,
  parent_id text,
  sort_order double precision,
  pinned integer,
  kind text,
  aliases text,
  description text,
  topic_id text,
  home_type text,
  home_id text,
  source text,
  run_id text
);
CREATE INDEX IF NOT EXISTS tags_owner_idx ON tags (owner_id);

CREATE TABLE IF NOT EXISTS filters (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  name text,
  emoji text,
  rule_json text,
  sort_order double precision
);
CREATE INDEX IF NOT EXISTS filters_owner_idx ON filters (owner_id);

CREATE TABLE IF NOT EXISTS sections (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  list_id text,
  name text,
  sort_order double precision
);
CREATE INDEX IF NOT EXISTS sections_owner_idx ON sections (owner_id);
CREATE INDEX IF NOT EXISTS sections_list_idx ON sections (owner_id, list_id);

CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  list_id text,
  parent_id text,
  section_id text,
  title text,
  content text,
  content_mode text,
  status integer,
  priority integer,
  start_at text,
  due_at text,
  is_all_day integer,
  time_zone text,
  repeat_rule text,
  repeat_from text,
  repeat_origin_id text,
  sort_order double precision,
  pinned_at text,
  completed_at text,
  deleted_at text
);
CREATE INDEX IF NOT EXISTS tasks_owner_idx ON tasks (owner_id);
CREATE INDEX IF NOT EXISTS tasks_list_idx ON tasks (owner_id, list_id);
CREATE INDEX IF NOT EXISTS tasks_due_idx ON tasks (owner_id, due_at);
CREATE INDEX IF NOT EXISTS tasks_parent_idx ON tasks (owner_id, parent_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (owner_id, status);

CREATE TABLE IF NOT EXISTS check_items (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  task_id text,
  title text,
  done integer,
  sort_order double precision,
  completed_at text
);
CREATE INDEX IF NOT EXISTS check_items_owner_idx ON check_items (owner_id);
CREATE INDEX IF NOT EXISTS check_items_task_idx ON check_items (owner_id, task_id);

CREATE TABLE IF NOT EXISTS task_tags (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  task_id text,
  tag_id text,
  source text,
  state text,
  confidence integer,
  run_id text
);
CREATE INDEX IF NOT EXISTS task_tags_owner_idx ON task_tags (owner_id);
CREATE INDEX IF NOT EXISTS task_tags_task_idx ON task_tags (owner_id, task_id);
CREATE INDEX IF NOT EXISTS task_tags_tag_idx ON task_tags (owner_id, tag_id);

CREATE TABLE IF NOT EXISTS reminders (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  task_id text,
  trigger text
);
CREATE INDEX IF NOT EXISTS reminders_owner_idx ON reminders (owner_id);
CREATE INDEX IF NOT EXISTS reminders_task_idx ON reminders (owner_id, task_id);

CREATE TABLE IF NOT EXISTS view_settings (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  view_key text,
  group_by text,
  sort_by text,
  sort_dir text,
  show_completed integer,
  show_details integer,
  options_json text
);
CREATE INDEX IF NOT EXISTS view_settings_owner_idx ON view_settings (owner_id);
CREATE INDEX IF NOT EXISTS view_settings_key_idx ON view_settings (owner_id, view_key);

CREATE TABLE IF NOT EXISTS user_prefs (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  smart_list_visibility text,
  theme text,
  follow_system_dark integer,
  week_start integer,
  notify_json text,
  avatar_json text
);
CREATE INDEX IF NOT EXISTS user_prefs_owner_idx ON user_prefs (owner_id);

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

-- PowerSync는 이 publication으로 변경분을 읽는다
DROP PUBLICATION IF EXISTS powersync;
CREATE PUBLICATION powersync FOR TABLE notes, wiki_topics, wiki_versions, folders, lists, tags, filters, sections, tasks, check_items, task_tags, reminders, view_settings, user_prefs, xp_events, characters, kpis, weekly_reports, map_areas, task_areas, map_links, relations, events, diary_entries, diary_messages;
