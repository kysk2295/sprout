-- AI 프록시 사용량(서버 전용, 동기화하지 않는다: publication·packages/schema에 넣지 않는다).
-- 요청·응답 원문은 저장하지 않는다. 사용자·엔드포인트·날짜(한국 시각)별 숫자만 남긴다. 다시 돌려도 안전.
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,                 -- assistant·classify·map·diary·kpi-draft·weekly-report
  day date NOT NULL,                      -- AI_TZ_OFFSET_MIN 기준 날짜(기본 한국 시각)
  requests integer NOT NULL DEFAULT 0,    -- 성공했거나 처리 중인 요청 수(실패하면 되돌린다)
  failures integer NOT NULL DEFAULT 0,    -- 실패·시간 초과·중단
  prompt_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  duration_ms bigint NOT NULL DEFAULT 0,  -- Ollama 처리 시간 합
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, endpoint, day)
);
CREATE INDEX IF NOT EXISTS ai_usage_user_day_idx ON ai_usage (user_id, day);
