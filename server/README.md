# sprout 백엔드 (셀프호스트)

PRD 7.3·E. Mac mini에서 Docker Compose로 띄우고 Cloudflare Tunnel로 공개한다. 같은 compose를 Railway·VPS로 옮길 수 있다.

| 서비스 | 하는 일 | 이 컴퓨터 포트 |
|---|---|---|
| `db` | Postgres 18, `wal_level=logical`. 데이터 DB `sprout` + PowerSync 저장 DB `powersync_storage` | 127.0.0.1:55432 |
| `api` | 이메일 가입·로그인, JWT(RS256) 발급, JWKS, 업로드, AI 프록시(→ Mac mini Ollama, 직접 또는 워커) | 127.0.0.1:6060 |
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

## AI 프록시 (api/src/ai.ts · ai-backend.ts · ../ai-worker)
모든 사용자의 AI 요청은 `api`가 JWT·대기열·상한을 확인한 뒤 **오너 Mac mini의 Ollama**로 넘긴다. Ollama는 인터넷에 열지 않는다. Ollama까지 가는 길(백엔드)은 둘 중 하나:

| `AI_BACKEND` | 어떻게 | 언제 |
|---|---|---|
| `direct` | `api`가 `OLLAMA_URL`로 바로 부른다(`OLLAMA_TOKEN`이 있으면 Bearer로 붙임) | `api`와 Ollama가 같은 기계·사설망일 때(로컬 개발: `host.docker.internal`) |
| `worker` | Mac mini의 `ai-worker`가 `api`로 **바깥으로** 접속(긴 대기 poll)해 일을 당겨 가서 로컬 Ollama로 돌리고, 결과 NDJSON을 그대로 흘려 보낸다. 비밀 `AI_WORKER_TOKEN`(16자 이상, 양쪽 같은 값) | `api`가 Railway 등 밖에 있을 때. Mac mini는 포트를 열지 않는다 |

워커(`server/ai-worker/`, 의존성 없음, Node 22):
```bash
cd server/ai-worker && cp worker.env.example worker.env && chmod 600 worker.env   # SPROUT_API_URL, AI_WORKER_TOKEN 채우기
npm start                                                                        # 시험 실행
# 상시 실행: sprout-ai-worker.plist의 node 경로·폴더를 고친 뒤 ~/Library/LaunchAgents/에 두고 launchctl bootstrap (파일 안 주석 참고)
```
- 워커 경로: `POST /ai/worker/poll`(25초 대기, 그동안 Ollama 모델 목록도 보고), `POST /ai/worker/result/<id>`(결과 스트림). 앱이 끊거나 시간이 넘으면 `api`가 결과 연결을 끊고 → 워커가 Ollama 요청을 멈춘다.
- 워커가 40초 넘게 안 붙거나 Mac mini Ollama가 꺼져 있으면 `/ai/*`는 503 "지금은 AI를 쓸 수 없어요". 워커가 일을 15초 안에 가져가지 않아도 503.
- `WORKER_SLOTS`(기본 1)는 `AI_CONCURRENCY` 이상으로 둔다.

| 경로 | 쓰임 | 주간 상한 |
|---|---|---|
| `GET /ai/status` | 쓸 수 있는지·모델·대기열·내 오늘/이번 주 사용량 | — |
| `POST /ai/assistant` · `/ai/classify` · `/ai/map` · `/ai/diary` | AI 비서·수집함 분류·작업 지도·일기 | — |
| `POST /ai/kpi-draft` · `/ai/weekly-report` | 성장 주간 목표 초안·주간 리포트 | 각 1회(월요일 0시 한국 시각에 초기화) |

- 본문: `{messages:[{role,content}], format?(JSON 스키마 또는 "json"), model?, stream?, options?:{temperature}}`. 프롬프트는 앱이 만든다.
- 서버가 강제: `num_ctx 4096`, `num_predict 700`, `think:false`, 제한 시간. 모델은 Ollama에 설치된 **로컬 모델만**(클라우드·원격·임베딩 거절, `AI_MODELS`로 더 좁힐 수 있다). 생략하면 `AI_MODEL`.
- `stream:false` → `{model, message:{role,content}, done, prompt_eval_count, eval_count, queue_wait_ms}`.
  `stream:true` → NDJSON. 차례를 기다리는 동안 `{"queue":{"position":n,"waiting":m}}`, 차례가 오면 `position:0`, 그다음 Ollama 줄 그대로. 중간 오류는 `{"error":"…","code":"…"}` 한 줄.
- 오류는 `{error(한국어), code, retry_after?}` + 상태 코드: 401 로그인 · 400 형식/모델 · 413 너무 큼 · 429 상한(`Retry-After`) · 503 Mac mini 꺼짐/바쁨("지금은 AI를 쓸 수 없어요…", `Retry-After`) · 504 시간 초과.
- 앱이 연결을 끊으면 대기열에서 빠지고 Ollama 요청도 멈춘다. 실패·시간 초과·중단은 상한에서 되돌린다(주간 1회를 날리지 않는다).
- **원문은 저장·로그하지 않는다.** `ai_usage`(사용자·경로·날짜별 요청 수·실패 수·토큰 수·처리 시간)만 남는다. 동기화 대상 아님.
- 대기열·분당 상한은 프로세스 메모리에 있다(`api`는 한 개만 띄운다).

| 환경 변수 | 기본값 | 뜻 |
|---|---|---|
| `AI_BACKEND` | (비움 → `AI_WORKER_TOKEN` 있으면 worker, 없으면 direct) | 백엔드 고르기 |
| `AI_WORKER_TOKEN` | — | worker 방식 비밀(16자 이상, `openssl rand -hex 32`) |
| `OLLAMA_URL` · `OLLAMA_TOKEN` | `http://host.docker.internal:11434` · — | direct 방식 Ollama 주소(compose에 `host-gateway` 등록) · Bearer |
| `AI_MODEL` / `AI_MODELS` | `qwen3.5:9b` / (비움) | 기본 모델 / 허용 목록(쉼표) |
| `AI_CONCURRENCY` | 1 | 동시에 돌리는 요청 수(모든 사용자 공용) |
| `AI_QUEUE_MAX` · `AI_QUEUE_WAIT_MS` | 20 · 180000 | 대기열 길이(넘으면 503) · 최대 대기 |
| `AI_TIMEOUT_MS` | 120000 | 생성 제한 시간(넘으면 504) |
| `AI_USER_CONCURRENT` | 2 | 사용자당 동시(대기+실행) |
| `AI_USER_PER_MINUTE` · `AI_USER_PER_DAY` | 6 · 100 | 사용자당 상한 [임시] |
| `AI_WEEKLY_KPI_DRAFT` · `AI_WEEKLY_REPORT` | 1 · 1 | 주간 상한(PRD) |
| `AI_NUM_CTX` · `AI_NUM_PREDICT` · `AI_TZ_OFFSET_MIN` | 4096 · 700 · 540 | 토큰 제한 · 날짜/주 경계 시간대(한국) |

`ai_usage` 테이블은 새 DB면 `db/init/03-ai-usage.sql`로, 이미 있는 DB면 마이그레이션으로 만든다(다시 돌려도 안전):
```bash
docker compose exec -T db psql -U sprout -d sprout -v ON_ERROR_STOP=1 < db/migrations/20261005-ai-usage.sql
docker compose up -d --build api
curl -s localhost:6060/ai/status -H "authorization: Bearer <접근 토큰>"   # available: true 확인
```

## 배포 전에 남은 일
- [ ] Mac mini로 옮기기 + Cloudflare Tunnel(`api`, `powersync`만 공개, `db`는 공개하지 않는다)
- [ ] 백업을 외부 저장소로(예: Cloudflare R2 + rclone). PRD 필수
- [ ] Postgres 복제 전용 역할(지금은 슈퍼유저로 붙는다)
- [ ] 비밀번호 재설정·이메일 인증(메일 발송 수단 필요), 구글·애플 로그인
- [ ] 배포 주소를 앱 기본값으로(`SPROUT_API_URL`, `SPROUT_SYNC_URL`)
- [x] AI 프록시(`/ai/*`) + 대기열·상한 (코드·시험 완료, 배포·마이그레이션 적용은 승인 뒤)
- [ ] 앱 AI(비서·수집함·지도·일기·성장)를 SSH 포워딩 대신 프록시로(배포판)
- [ ] Mac mini 부하 측정(동시 요청·응답 시간)으로 상한 값 정하기
