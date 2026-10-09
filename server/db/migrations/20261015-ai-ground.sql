-- 47 §19.4 AI 비서 근거 검사 횟수 — ai_usage(서버 전용, 동기화 안 함: publication·sync-config 변경 없음)에 숫자 칸 하나.
-- 앱이 근거 검사로 뺀 문장 수만 보낸다(POST /ai/ground {hits}). 원문·이유·턴 id는 받지도 저장하지도 않는다.
-- 다시 돌려도 안전(IF NOT EXISTS). 순서 상관없음: 칸이 없으면 API는 그 숫자만 건너뛰고 로그 한 줄(그 밖은 그대로).
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS ground_hits integer NOT NULL DEFAULT 0;
