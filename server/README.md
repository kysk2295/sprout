# sprout 백엔드 (셀프호스트)

PRD 7.3·E. Mac mini에서 Docker Compose로 띄우고 Cloudflare Tunnel로 공개한다. 같은 compose를 Railway·VPS로 옮길 수 있다.

| 서비스 | 하는 일 | 이 컴퓨터 포트 |
|---|---|---|
| `db` | Postgres 18, `wal_level=logical`. 데이터 DB `sprout` + PowerSync 저장 DB `powersync_storage` | 127.0.0.1:55432 |
| `api` | 이메일 가입·로그인, JWT(RS256) 발급, JWKS, 업로드 | 127.0.0.1:6060 |
| `powersync` | 사용자별 변경분 스트리밍 (Open Edition) | 127.0.0.1:8089 |
| `backup` | 매일 `pg_dump -Fc` → `./backups`, 14일 보관 | — |

## 처음 띄우기
```bash
./scripts/init-env.sh          # server/.env 생성(무작위 비밀번호). 커밋하지 않는다
docker compose up -d --build
curl localhost:6060/health
```
데스크톱 앱은 기본으로 `http://127.0.0.1:6060`(API)·`http://127.0.0.1:8089`(PowerSync)에 붙는다. 바꾸려면 `SPROUT_API_URL`, `SPROUT_SYNC_URL`.

## 스키마 바꾸기
테이블 정의의 원본은 `packages/schema/src/index.ts`(앱과 같은 파일)다.
```bash
npm run server:schema          # db/init/02-schema.sql, powersync/sync-config.yaml 다시 생성
```
`db/init`은 **DB를 처음 만들 때만** 실행된다. 이미 데이터가 있는 DB에는 `db/migrations/*.sql`을 이름 순서대로 적용한다(모두 `IF NOT EXISTS`로 다시 돌려도 안전하게 쓴다):
```bash
for f in db/migrations/*.sql; do docker compose exec -T db psql -U sprout -d sprout -v ON_ERROR_STOP=1 < "$f"; done
docker compose up -d --build api && docker compose restart powersync   # 새 테이블 허용 + 동기화 규칙 다시 읽기
```

## 규칙 (api/src/upload.ts)
- 기기가 올린 변경은 표에 정의된 테이블·칸만 받는다(SQL 주입 차단). 모르는 테이블·칸은 **409** — 앱은 그 묶음을 지우지 않고 서버가 새 스키마로 올라올 때까지 다시 보낸다. 형식이 깨진 연산만 400(버림).
- `owner_id`는 기기가 보낸 값을 무시하고 로그인한 사용자로 넣는다. 남의 행은 고치거나 지우지 못한다.
- 동기화 규칙은 `owner_id = auth.user_id()` — 자기 데이터만 내려받는다.
- 테스트: `npm run test:api`

## 앱 쪽 동작 (apps/desktop/src/main/sync.ts)
- 로그인 정보는 OS 키체인 암호화(safeStorage)로 `userData/auth.bin`.
- 첫 로그인: 서버에 내 데이터가 없으면 이 기기 데이터를 내 계정으로 올린다. 있으면 로컬 시드를 지우고 내려받는다.
- 로그아웃: 이 기기의 내 데이터를 지우고 첫 실행 상태로 돌아간다.

## 배포 전에 남은 일
- [ ] Mac mini로 옮기기 + Cloudflare Tunnel(`api`, `powersync`만 공개, `db`는 공개하지 않는다)
- [ ] 백업을 외부 저장소로(예: Cloudflare R2 + rclone). PRD 필수
- [ ] Postgres 복제 전용 역할(지금은 슈퍼유저로 붙는다)
- [ ] 비밀번호 재설정·이메일 인증(메일 발송 수단 필요), 구글·애플 로그인
- [ ] 배포 주소를 앱 기본값으로(`SPROUT_API_URL`, `SPROUT_SYNC_URL`)
