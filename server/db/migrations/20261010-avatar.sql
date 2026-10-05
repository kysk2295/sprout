-- 35 프로필 이미지: user_prefs.avatar_json(아바타 고르기 — {kind, id?, color}, null = 글자 아바타).
-- 이미 데이터가 있는 서버에 적용한다(다시 돌려도 안전). 적용 전 pg_dump 백업(README).
-- 순서: 이 마이그레이션 → API 재시작(업로드 허용 칸은 TABLES에서 자동) → 앱. 앱이 먼저면 모르는 칸 = 409로 업로드가 계속 재시도한다.
-- PowerSync 규칙은 SELECT * 라 바꿀 것 없음.
ALTER TABLE user_prefs ADD COLUMN IF NOT EXISTS avatar_json text;
