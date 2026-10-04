-- 32 푸시 알림(FCM): 서버 전용 테이블(동기화하지 않는다: publication·packages/schema에 넣지 않는다). 다시 돌려도 안전.
-- 할 일 제목 같은 원문은 저장하지 않는다(push_sent는 key·kind·task_id만).
CREATE TABLE IF NOT EXISTS device_tokens (
  id uuid PRIMARY KEY,                          -- 기기 id(앱이 처음 실행 때 만들어 보안 저장소에 둔다)
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'fcm',         -- 'fcm' (나중에 'apns' 직접)
  token text NOT NULL UNIQUE,                   -- FCM 등록 토큰. 같은 토큰이 다른 기기 id·사용자로 오면 옛 행을 지운다
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  app_version text,
  caps text[] NOT NULL DEFAULT '{}',            -- 이 앱이 열 수 있는 알림 종류: reminder·daily·sync·growth·inbox-cleanup
  timezone text NOT NULL,                       -- IANA. 떠 있는 시각을 이 기기 시각으로 바꿀 때 쓴다
  locale text,
  local_keys text[] NOT NULL DEFAULT '{}',      -- 이 기기가 로컬로 예약한 알림 id(r:<reminder id>@<ms>) — 서버는 이것을 보내지 않는다
  local_keys_at timestamptz,
  push_reminders boolean NOT NULL DEFAULT true, -- 이 기기가 서버 할 일 알림을 받는지(설정·OS 권한)
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_ok_at timestamptz,
  fail_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON device_tokens (user_id);

CREATE TABLE IF NOT EXISTS push_sent (          -- 중복 막기·지우기 대상 찾기. 7일 보관
  device_id uuid NOT NULL REFERENCES device_tokens(id) ON DELETE CASCADE,
  key text NOT NULL,                            -- r:<rid>@<ms> · daily:<날짜> · goaldue:<주> · evolve:<단계> · report:<주> …
  kind text NOT NULL,
  task_id text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, key)
);
CREATE INDEX IF NOT EXISTS push_sent_task_idx ON push_sent (task_id, sent_at);
CREATE INDEX IF NOT EXISTS push_sent_sent_idx ON push_sent (sent_at);

CREATE TABLE IF NOT EXISTS push_state (         -- 사용자별 마지막 진화 단계·리포트 주·기본함 제안 시각
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_stage integer,
  last_report_week text,
  last_draft_week text,
  last_inbox_nudge_at timestamptz
);

CREATE TABLE IF NOT EXISTS push_cursor (id integer PRIMARY KEY DEFAULT 1, at timestamptz NOT NULL);

CREATE INDEX IF NOT EXISTS tasks_open_due_idx ON tasks (due_at) WHERE status = 0 AND deleted_at IS NULL;
