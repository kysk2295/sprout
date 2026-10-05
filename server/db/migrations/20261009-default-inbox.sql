-- 기본함 기본값(2026-10-05 사용자 결정 "기본함은 있어야지. 이걸 디폴트로 해줘", 08 §8.1·02 §14.1).
-- 기본함(lists.kind = 'inbox')이 하나도 없는 모든 계정에 id = 'inbox-' || 사용자 id 로 하나 만든다.
-- 다시 돌려도 안전(기본함이 하나라도 있는 계정·이미 있는 id는 건드리지 않는다). 동기화 규칙·publication은 그대로(lists 표).
-- 이후 새 계정은 API(server/api/src/defaultInbox.ts)가 가입하는 같은 문에서 만들고, 로그인·리프레시 때도 없으면 채운다.
-- 순서 상관없음: 이 파일과 API 재시작 중 무엇을 먼저 해도 된다.
INSERT INTO lists (id, owner_id, created_at, modified_at, name, kind, sort_order, pinned, show_in_smart)
SELECT 'inbox-' || u.id::text, u.id,
       to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       '기본함', 'inbox', 0, 0, 'all'
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM lists x WHERE x.owner_id = u.id AND x.kind = 'inbox')
ON CONFLICT (id) DO NOTHING;
