-- 47 §20 서버에서 도는 AI 비서 턴 (2026-11-01). 다시 돌려도 안전. 동기화·앱 변경 없음.
-- 도구 SQL(packages/schema assistantExec — 기기 SQLite용, 사용자 조건 없음)을 서버에서 돌릴 때 이 스키마의 보기로만 읽는다:
-- 보기마다 owner_id = current_setting('sprout.user_id') — 값이 없으면 오류(아무것도 안 보임). API가 쿼리마다 READ ONLY 트랜잭션 안에서
-- set_config('sprout.user_id', 사용자, true) + search_path = assistant_scope, pg_catalog로 돌린다(server/api/src/assistantDb.ts).
-- 글자 컬럼은 COLLATE "C"로 내보내 정렬·비교가 SQLite(바이트 순)와 같다.
-- 순서: 이 마이그레이션 → API 재시작(시작할 때 assistant_scope.refresh()를 불러 표 컬럼이 바뀐 것도 반영, 실패하면 서버 턴만 꺼짐) → 앱.

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
