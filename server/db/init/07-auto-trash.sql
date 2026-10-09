-- 48 만료 2주 지난 할 일 자동 정리(서버 전용, 동기화 안 함) — migrations/20261014-auto-trash.sql과 같다
CREATE TABLE IF NOT EXISTS auto_trash_log (     -- 자동으로 옮긴 (할 일, 그때 마감). 같은 마감인 동안 되살린 일을 다시 옮기지 않으려고
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id text NOT NULL,
  due_at text,
  batch_id text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, task_id, batch_id)
);
CREATE INDEX IF NOT EXISTS auto_trash_log_owner_idx ON auto_trash_log (owner_id, task_id);

CREATE TABLE IF NOT EXISTS auto_trash_state (   -- 사용자마다 마지막으로 돈 날(그 사용자 시간대) — 하루 한 번
  owner_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_day text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
