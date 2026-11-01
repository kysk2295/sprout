-- 47 §20 서버 AI 비서 턴 — 사용자 범위 읽기 보기(새 DB). 이미 있는 DB는 migrations/20261101-assistant-scope.sql
CREATE SCHEMA IF NOT EXISTS assistant_scope;

-- SQLite instr(글, 찾을 말) = Postgres strpos
CREATE OR REPLACE FUNCTION assistant_scope.instr(a text, b text) RETURNS integer
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT strpos(a, b) $$;

-- 도구가 읽는 표만(47 §3.1 — 외부 캘린더 캐시는 없음). 표에 컬럼이 늘면 다시 부른다(API가 시작할 때 부름)
CREATE OR REPLACE FUNCTION assistant_scope.refresh() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  t text;
  cols text;
  n integer := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY['tasks', 'lists', 'folders', 'events', 'notes', 'diary_entries', 'tags', 'task_tags', 'relations', 'characters', 'xp_events'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    SELECT string_agg(
             CASE WHEN data_type = 'text' THEN format('%I COLLATE "C" AS %I', column_name, column_name) ELSE format('%I', column_name) END,
             ', ' ORDER BY ordinal_position)
      INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t;
    EXECUTE format('DROP VIEW IF EXISTS assistant_scope.%I', t);
    EXECUTE format('CREATE VIEW assistant_scope.%I WITH (security_barrier) AS SELECT %s FROM public.%I WHERE owner_id = current_setting(''sprout.user_id'')::uuid', t, cols, t);
    n := n + 1;
  END LOOP;
  RETURN n;
END
$$;

SELECT assistant_scope.refresh();
