-- 애플 토큰 폐기(심사 지침 5.1.1(v), 08 §7.1): 계정 삭제·애플 연결 해제 때 애플 refresh_token을 폐기하려고 서버에만 둔다.
-- 서버 전용 칸(동기화하지 않음). client_id = 토큰을 받은 쪽(Services ID 또는 앱 번들 id). 다시 돌려도 안전.
-- 순서: 이 SQL → API 재시작(칸이 없어도 API는 로그만 남기고 로그인은 된다).
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS apple_client_id text;
ALTER TABLE user_identities ADD COLUMN IF NOT EXISTS apple_refresh_token text;
