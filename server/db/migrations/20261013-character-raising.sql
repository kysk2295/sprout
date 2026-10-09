-- 43 캐릭터 키우기 · 42 §10 꿈틀 정원 친구들 (2026-10-09 사용자 결정 "추천대로").
-- 이미 데이터가 있는 서버에 적용한다(다시 돌려도 안전). 적용 전 pg_dump 백업(README).
-- 순서: 이 마이그레이션 → 동기화 규칙(sync-config.yaml에 character_items 줄 추가) → PowerSync 재시작 → API 재시작(업로드 허용 칸은 TABLES에서 자동) → 앱.
--   앱이 먼저면 모르는 표·칸 = 409로 업로드가 계속 재시도한다(다른 표의 업로드도 그 뒤에 막힌다).

-- 1) 입힌 모습(동기화): {path, eq:{hat,neck,hand,back,bg}, decorOff:[]} — packages/schema/src/wardrobe.ts parseLook
ALTER TABLE characters ADD COLUMN IF NOT EXISTS look_json text;

-- 2) 받은 옷·트로피(지우지 않는다). id = 사건(item:<캐릭터>:<옷> · trophy:<캐릭터>:project:<프로젝트> · trophy:<캐릭터>:days:30)
CREATE TABLE IF NOT EXISTS character_items (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text,
  modified_at text,
  character_id text,
  item_id text,
  kind text,
  source text,
  ref_id text,
  title text,
  earned_at text,
  seen_at text
);
CREATE INDEX IF NOT EXISTS character_items_owner_idx ON character_items (owner_id);
CREATE INDEX IF NOT EXISTS character_items_character_idx ON character_items (owner_id, character_id);

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='character_items') THEN
 ALTER PUBLICATION powersync ADD TABLE character_items;
 END IF;
END $$;

-- 3) 종 id 한 번 옮기기(43 결정 ⑥, 성향 칸 그대로): 거북이 → 달팽이 · 다람쥐 → 꿀벌 · 고양이 → 애벌레 · 수달 → 개구리.
--    앱도 같은 표(growth.ts LEGACY_SPECIES)로 읽으므로 순서가 바뀌어도 화면은 같다. modified_at을 올려 기기에도 내려가게 한다.
UPDATE characters SET
  species = CASE species WHEN 'turtle' THEN 'snail' WHEN 'squirrel' THEN 'bee' WHEN 'cat' THEN 'worm' WHEN 'otter' THEN 'frog' END,
  modified_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE species IN ('turtle', 'squirrel', 'cat', 'otter');

-- 4) 프로필 아바타에 저장된 캐릭터 id(35 avatar_json {"kind":"char","id":"otter-3"})도 같은 표로(앱 parseCharId도 옛 id를 읽는다)
UPDATE user_prefs SET
  avatar_json = regexp_replace(avatar_json, '"id"\s*:\s*"(turtle|squirrel|cat|otter)-([1-5])"',
    '"id":"' || CASE substring(avatar_json from '"id"\s*:\s*"(turtle|squirrel|cat|otter)-')
      WHEN 'turtle' THEN 'snail' WHEN 'squirrel' THEN 'bee' WHEN 'cat' THEN 'worm' ELSE 'frog' END || '-\2"'),
  modified_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE avatar_json ~ '"kind"\s*:\s*"char"' AND avatar_json ~ '"id"\s*:\s*"(turtle|squirrel|cat|otter)-[1-5]"';
