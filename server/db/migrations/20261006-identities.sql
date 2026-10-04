-- 소셜 로그인(08 §3.1): 구글·애플 식별자 ↔ 계정. 서버 전용(동기화하지 않는다: publication·packages/schema에 넣지 않는다).
-- 다시 돌려도 안전. 기존 행은 바뀌지 않는다(비밀번호 칸을 비워도 되게 풀기만 한다).
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL; -- 구글·애플로만 가입한 계정은 비밀번호가 없다

CREATE TABLE IF NOT EXISTS user_identities (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'apple')),
  subject text NOT NULL,          -- 공급자의 사용자 id(ID 토큰 sub). 이메일이 바뀌어도 그대로
  email text,                     -- 연결할 때 받은 이메일(애플 가림 주소일 수 있음). 참고용
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject)
);
CREATE INDEX IF NOT EXISTS user_identities_user_idx ON user_identities (user_id);
