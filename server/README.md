# sprout 백엔드 (셀프호스트)

PRD 7.3·E. Mac mini에서 Docker Compose로 띄우고 Cloudflare Tunnel로 공개한다. 같은 compose를 Railway·VPS로 옮길 수 있다.

| 서비스 | 하는 일 | 이 컴퓨터 포트 |
|---|---|---|
| `db` | Postgres 18, `wal_level=logical`. 데이터 DB `sprout` + PowerSync 저장 DB `powersync_storage` | 127.0.0.1:55432 |
| `api` | 이메일·구글·애플 가입·로그인, JWT(RS256) 발급, JWKS, 업로드, AI 프록시(→ Mac mini Ollama, 직접 또는 워커) | 127.0.0.1:6060 |
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

## 소셜 로그인 — 구글·애플 (api/src/social.ts · 명세 08 §3.1)
- `POST /auth/google {id_token, nonce}`: 데스크톱이 시스템 브라우저 + PKCE + 루프백으로 받은 구글 ID 토큰을 구글 공개키(JWKS)로 검증(iss·aud=우리 클라이언트 id·만료·`email_verified`·nonce).
- 애플(웹 흐름, `response_mode=form_post`): 애플 → `POST /auth/apple/callback`(이 API의 https 주소) → 토큰은 **서버 메모리에 state별로 5분, 한 번만** 맡기고 브라우저는 `sprout://auth/apple?state=…`로 앱을 깨운다(토큰은 URL에 싣지 않는다). 앱은 `POST /auth/apple {state, nonce}`로 찾아간다(아직이면 202, 2초마다). 애플에는 nonce의 SHA-256만 보내므로 원래 nonce를 가진 그 앱만 교환할 수 있다. `.p8` 키가 있으면 인가 코드를 애플에 한 번 더 확인한다.
  - 맡김 칸이 메모리라 **API는 한 대만** 돌린다(지금 구성 그대로). 여러 대가 되면 Postgres/Redis로 옮긴다.
- 계정 규칙: (공급자, sub)가 있으면 그 계정 → 없으면 **확인된 같은 이메일** 계정에 연결 → 없으면 새 계정(`password_hash` NULL). 애플 가림 주소(`…@privaterelay.appleid.com`)는 따로 계정이 된다. 비밀번호 없는 계정에 이메일 로그인을 하면 401 `social account: google,apple`.
- `GET /auth/providers` → `{google: bool, apple: {services_id, redirect_uri} | null}` (앱이 버튼 설정 여부를 안다).
- 응답은 `/auth/login`과 같고 `created`(새 계정이면 true — 앱이 첫 실행 안내 18을 띄운다)가 붙는다.

| 환경 변수(server/.env) | 예 | 설명 |
|---|---|---|
| `GOOGLE_CLIENT_IDS` | `123-abc.apps.googleusercontent.com` | 받아 줄 구글 클라이언트 id(쉼표로 여러 개 — 데스크톱 클라이언트 + 모바일이 쓰는 웹 클라이언트, 08·20 §4.3). `GOOGLE_CLIENT_ID` 하나만 써도 된다. 비우면 `/auth/google` 503 |
| `APPLE_SERVICES_ID` | `com.example.sprout.signin` | 애플 Services ID(= 애플 토큰의 aud). 비우면 애플 로그인 끔 |
| `APPLE_TEAM_ID` | `BU697KN34B` | 기본값 그대로(인증서 이름 괄호 안 `Z32F3Z65RD`는 팀 ID가 아니다) |
| `APPLE_KEY_ID` · `APPLE_PRIVATE_KEY` | `ABC123DEFG` · `/run/secrets/apple.p8` | Sign in with Apple 키(.p8)와 그 id. 없어도 로그인은 되지만(ID 토큰 검증만), 있으면 코드 교환으로 한 번 더 확인하고 나중에 계정 삭제 때 애플 토큰 폐기에 쓴다 |
| `API_PUBLIC_URL` | `https://macmini.tail425c97.ts.net` | 애플 돌아오는 주소 = `<이 값>/auth/apple/callback`(`APPLE_REDIRECT_URI`로 직접 정해도 됨) |

`docker-compose.yaml`의 `api.environment`에 아래를 더하고, `.p8`은 읽기 전용으로 붙인다(**리드 승인 뒤 적용**):
```yaml
      GOOGLE_CLIENT_IDS: ${GOOGLE_CLIENT_IDS:-}
      APPLE_SERVICES_ID: ${APPLE_SERVICES_ID:-}
      APPLE_TEAM_ID: ${APPLE_TEAM_ID:-BU697KN34B}
      APPLE_KEY_ID: ${APPLE_KEY_ID:-}
      APPLE_PRIVATE_KEY: ${APPLE_PRIVATE_KEY:+/run/secrets/apple.p8}
      API_PUBLIC_URL: ${API_PUBLIC_URL:-https://macmini.tail425c97.ts.net}
    # volumes: 에 추가 (파일이 있을 때만)
      - ${APPLE_PRIVATE_KEY:-/dev/null}:/run/secrets/apple.p8:ro
```
배포(적용 전 백업 → 마이그레이션 → API 다시 빌드):
```bash
docker compose exec -T db pg_dump -U sprout -Fc sprout > backups/manual/before-identities-$(date +%Y%m%d).dump
docker compose exec -T db psql -U sprout -d sprout -v ON_ERROR_STOP=1 < db/migrations/20261006-identities.sql
docker compose up -d --build api
curl -s localhost:6060/auth/providers     # {"google":true,"apple":{...}} 확인
```
- 남은 위험: 이메일 인증이 아직 없어서, 남이 **내 이메일로 먼저 비밀번호 가입**해 두면 내가 구글로 들어올 때 그 계정에 연결된다(선점 공격). 공개 출시 전 이메일 인증을 넣고, 인증 안 된 비밀번호 계정에 소셜을 연결할 때는 비밀번호를 지우거나 확인 메일을 받는다(08 §3.1).

## 시도 제한 (api/src/ratelimit.ts · 명세 08 §4)
메모리에 키별 최근 시각만 둔다(API 한 대 — 재시작하면 초기화). 막히면 **429** + `Retry-After`(초) + `{error:"로그인 시도가 너무 많아요. N분 뒤 다시 시도해 주세요.", code:"too_many_attempts", retry_after}`.

| 경로 | 기본 한도 [임시] | 세는 것 | 환경 변수 |
|---|---|---|---|
| `/auth/login` | 이메일당 15분 10회 · IP당 15분 30회 | 실패만, 성공하면 이메일 기록 초기화 | `RL_LOGIN_EMAIL_*` · `RL_LOGIN_IP_*` |
| `/auth/signup` | IP당 60분 5회 | 성공 포함 모든 시도 | `RL_SIGNUP_IP_*` |
| `/auth/refresh` | IP당 15분 60회 | 실패만 | `RL_REFRESH_IP_*` |
| `/auth/google` · `/auth/apple` | IP당 15분 30회 | 검증 실패만(애플 202 기다림은 안 셈) | `RL_SOCIAL_IP_*` |
| `/auth/apple/callback` | IP당 15분 60회 | 모든 시도 | `RL_CALLBACK_IP_*` |
| `DELETE /auth/account` | 사용자당 15분 5회 | 비밀번호 틀림·재확인 필요 | `RL_DELETE_USER_*` |
`*`는 `_MAX`(횟수)·`_WINDOW_MIN`(분). 예: `RL_SIGNUP_IP_MAX=20`.

**클라이언트 IP — `TRUST_PROXY`** (기본 `loopback`)
- `X-Forwarded-For`는 **믿을 수 있는 앞단에서 온 연결일 때만** 쓰고, 맨 오른쪽 값(앞단이 직접 붙인 주소)을 쓴다. 그 밖에는 연결한 쪽 주소. 예전 `cf-connecting-ip`는 아무나 꾸밀 수 있어 더 이상 보지 않는다.
- `loopback`: 127.0.0.1·::1에서 온 연결만 믿는다(API를 Docker 없이 호스트에서 돌리고 Tailscale Funnel이 127.0.0.1로 넘길 때).
- `private`: 루프백 + 사설 주소(10/8·172.16/12·192.168/16·fc00::/7·링크 로컬). **Docker로 돌리면 이것이 필요하다** — Funnel → 호스트 127.0.0.1:6060 → 컨테이너로 들어올 때 연결 주소가 도커 게이트웨이(172.x·192.168.65.x)라서, `loopback`이면 모든 사용자가 한 IP로 세어져 IP 한도(가입 5회/시간)를 다 같이 쓰게 된다. 포트는 `127.0.0.1`에만 열려 있어 사설 주소로 들어오는 것은 호스트(Funnel)와 같은 compose 안 컨테이너뿐이다.
- `none`: 헤더를 전혀 믿지 않는다.
- Tailscale Funnel(`tailscale funnel`)은 앞단 역방향 프록시로 `X-Forwarded-For`에 바깥 주소를 붙인다 — 배포 뒤 바깥 망 두 곳에서 틀린 로그인을 해 보고 서로 따로 세어지는지 확인한다.

## 계정 삭제 (api/src/account.ts · 명세 08 §7.1)
- `DELETE /auth/account` (Bearer, 본문 `{password?}`) → `{ok:true}`.
- 다시 확인: 비밀번호 계정은 **비밀번호**(403 `invalid password`). 구글·애플로만 가입한 계정은 접근 토큰의 **`auth_time`이 10분 안**(403 `reauth required`) — `auth_time`은 비밀번호·구글·애플로 막 로그인해 받은 토큰에만 있고 `/auth/refresh`로 받은 토큰에는 없다. 그래서 앱은 삭제 직전에 구글·애플로 다시 로그인시킨다. 마이그레이션 없음(토큰 클레임만).
- 한 트랜잭션: `DELETE FROM ai_usage`(이미 CASCADE지만 명시) → `DELETE FROM users` → 동기화 테이블·`sessions`·`user_identities`는 모두 `ON DELETE CASCADE`. PowerSync가 지워진 행을 다른 기기로 내려보내고, 세션이 없어 다른 기기의 리프레시는 401. 다른 기기가 남은 접근 토큰(최대 1시간)으로 `/sync/upload` 하면 외래 키 오류 대신 401.
- 로그는 "계정 1건 삭제"만. 백업(`backups/`, 14일)에는 그 기간 남는다 → 개인정보 처리방침에 적는다. 애플 토큰 폐기(`.p8`)는 [다음].
- `GET /auth/me`가 `has_password`·`providers`를 더 준다(앱이 확인 방법을 고른다).

## 푸시 알림 — FCM (api/src/push.ts · push-plan.ts · push-store.ts · fcm.ts · 명세 32)
api 프로세스 안에서 돈다(새 컨테이너 없음). **`FCM_PROJECT_ID`가 비면 푸시 전체가 꺼진다** — 기기 등록은 받아 두고 `push.enabled=false`를 돌려주며 아무것도 보내지 않는다(앱은 로컬 알림만 = 지금과 같음). 키가 잘못돼도 푸시만 꺼지고 로그인·동기화는 그대로(로그 `[push] FCM 설정 오류`).

| 경로 (Bearer) | 본문 | 응답 |
|---|---|---|
| `PUT /push/devices/:id` | `{token, platform:"android"\|"ios", app_version?, caps[], timezone(IANA), locale?, push_reminders}` | `{ok, push:{enabled, ios}}` · 사용자당 분당 10 |
| `PUT /push/devices/:id/local` | `{keys:["r:<rid>@<ms>"…] (≤200), until?}` | `{ok}` · 남의 기기 404 |
| `DELETE /push/devices/:id` | — | `{ok, deleted}` |
| `POST /push/test` | `{device_id}` | `{ok}` · 404 · 429(10분에 3) · 503(푸시 꺼짐) · 502(FCM 실패) |
- `/auth/logout {refresh_token, device_id?}` → 그 세션 사용자의 기기 행도 지운다. 계정 삭제는 `device_tokens`를 명시적으로 지운다(+ CASCADE).
- `/sync/upload`에 헤더 `X-Sprout-Device: <기기 id>`(휴대폰만)가 오면 그 기기는 효과에서 뺀다. 커밋 뒤(응답을 기다리게 하지 않음): 완료·휴지통·삭제·시각 변경 → 다른 기기에 **바로** `{type:"sync", dismiss:"[ids]"}` · 그 밖의 `tasks·reminders·lists·check_items·xp_events·kpis·weekly_reports` 변경 → 기기마다 30초에 1번(꼬리 1번) `{type:"sync"}` · 진화·주간 리포트·초안·기본함 정리 소식.
- 스케줄러: 30초마다(`PUSH_TICK_MS`), Postgres advisory lock(여러 api가 떠도 하나만). 창 `(max(cursor, now-1h), now]`의 할 일 알림 · 기기 시각 하루 요약(따라잡기 2시간) · 일요일 20:00 목표 마감. `push_sent (device_id, key)`로 중복 막기(7일 보관), 기기가 보고한 로컬 예약 id(`local_keys`)는 보내지 않는다. 실패(429·5xx)는 3번까지 다시, 그래도 실패면 울릴 시각 뒤 1시간 안에서 다음 tick에. FCM이 `UNREGISTERED` 등이면 그 기기 행을 지운다.
- 로그·DB에 할 일 제목을 남기지 않는다(`push_sent`는 key·kind·task_id만). "알림에 제목 숨기기"면 페이로드에도 없다. AI 글은 어떤 페이로드에도 넣지 않는다.

| 환경 변수(server/.env) | 예 | 설명 |
|---|---|---|
| `FCM_PROJECT_ID` | `sprout-510614` | 비면 푸시 꺼짐 |
| `FCM_SERVICE_ACCOUNT` | `/Users/<나>/.config/sprout/fcm-service-account.json` | 호스트의 키 파일 경로 → compose가 `/run/secrets/fcm.json`에 읽기 전용으로 붙인다(apple.p8과 같은 방식) |
| `FCM_SERVICE_ACCOUNT_B64` | `base64 -i key.json` 결과 | 파일을 붙일 수 없는 곳(Railway). 있으면 파일보다 먼저 쓴다 |
| `PUSH_TICK_MS` · `PUSH_SYNC_MIN_SEC` · `PUSH_IOS` | `30000` · `30` · `0` | 스케줄러 간격 · 조용한 동기화 최소 간격 · iOS 보내기(Apple 계정 뒤 `1`) |
- 나가는 HTTPS만 필요: `oauth2.googleapis.com`(서비스 계정 JWT → 토큰, 55분 캐시), `fcm.googleapis.com`. 들어오는 포트 없음. 새 npm 패키지 없음(`jose`).
- 서비스 계정 역할은 **Firebase Cloud Messaging API Admin**만. 키 파일은 권한 600, iCloud·git 밖(`.gitignore`에 `google-services.json`·`*service-account*.json`·`fcm*.json`).

배포(Mac mini, 순서대로 — **서버를 앱보다 먼저**: 앱이 `user_prefs.notify_json`을 올리면 옛 서버는 409):
```bash
cd ~/sprout/server
docker compose exec -T db pg_dump -U sprout -Fc sprout > backups/manual/before-push-$(date +%Y%m%d).dump        # 1. 백업
docker compose exec -T db psql -U sprout -d sprout -v ON_ERROR_STOP=1 < db/migrations/20261007-push.sql          # 2. 마이그레이션(다시 돌려도 안전)
chmod 600 ~/.config/sprout/fcm-service-account.json                                                              # 3. 키 파일(Firebase 콘솔에서 받은 것)
cat >> .env <<'ENV'                                                                                              # 4. 환경 변수
FCM_PROJECT_ID=sprout-510614
FCM_SERVICE_ACCOUNT=/Users/<나>/.config/sprout/fcm-service-account.json
ENV
docker compose up -d --build api && docker compose restart powersync                                             # 5. api 다시 빌드 + 동기화 규칙 다시 읽기
docker compose logs api | grep -E 'push (on|off)|\[push\]'                                                      # "push on" · "[push] 켜짐 · 30초마다"
```
- 되돌리기: `.env`에서 `FCM_PROJECT_ID`를 비우고 `docker compose up -d api` → 푸시만 꺼진다(테이블은 둬도 된다).
- Mac mini가 잠들면 서버 알림이 나가지 않는다 → `sudo pmset -a sleep 0 autorestart 1`. 꺼져 있어도 휴대폰이 아는 알림은 로컬로 울린다.
- 시험: `npm run test:api`(가짜 FCM·OAuth, 네트워크 없음) — `push.test.ts`.

## 배포 전에 남은 일
- [ ] Mac mini로 옮기기 + Cloudflare Tunnel(`api`, `powersync`만 공개, `db`는 공개하지 않는다)
- [ ] 백업을 외부 저장소로(예: Cloudflare R2 + rclone). PRD 필수
- [ ] Postgres 복제 전용 역할(지금은 슈퍼유저로 붙는다)
- [ ] 비밀번호 재설정·이메일 인증(메일 발송 수단 필요)
- [x] 로그인·가입 시도 제한, 계정 삭제(`DELETE /auth/account`) — 코드·시험 완료, compose에 `TRUST_PROXY: private` 추가 후 배포
- [x] 구글·애플 로그인(`/auth/google`·`/auth/apple`, 코드·시험 완료 — 마이그레이션 적용·환경 변수는 승인 뒤)
- [x] 푸시 알림(FCM, 32) 서버 — 코드·시험 완료. 마이그레이션 `20261007-push.sql`·환경 변수·키 파일은 위 "푸시 알림" 순서대로
- [ ] 배포 주소를 앱 기본값으로(`SPROUT_API_URL`, `SPROUT_SYNC_URL`)
- [x] AI 프록시(`/ai/*`) + 대기열·상한 (코드·시험 완료, 배포·마이그레이션 적용은 승인 뒤)
- [ ] 앱 AI(비서·수집함·지도·일기·성장)를 SSH 포워딩 대신 프록시로(배포판)
- [ ] Mac mini 부하 측정(동시 요청·응답 시간)으로 상한 값 정하기
