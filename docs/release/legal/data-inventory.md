# 데이터 인벤토리 — [제품명] (코드네임 sprout)

> **초안 — 법률 검토 필요.** 2026-10-05 코드 기준으로 직접 읽어 만든 사실 목록이다. 개인정보 처리방침·이용약관·계정 삭제 안내·스토어 개인정보 답변은 모두 이 문서를 근거로 쓴다. 코드가 바뀌면 이 문서를 먼저 고친다.
> 표기: **[갭]** = 출시 전에 고치거나 처리방침에 그대로 밝혀야 하는 빈틈 · **[확인 필요]** = 코드만으로 확정할 수 없음 · **[차단]** = 스토어 심사·법 준수상 출시 차단 요소

## 0. 구성 한눈에

| 구성 | 위치 | 근거 |
|---|---|---|
| 서버(Postgres 18 + PowerSync Open Edition + Node API) | 운영자 소유 Mac mini(대한민국), Docker Compose. 포트는 모두 `127.0.0.1`에만 열림 | `server/docker-compose.yaml` |
| 공개 경로 | Tailscale Funnel(`https://macmini.tail425c97.ts.net`, 동기화 `:8443`). TLS 인증서는 그 노드(Mac mini)에 있고, Tailscale 중계는 암호화된 TCP만 넘긴다 **[확인 필요: Tailscale 문서로 확정 + 중계 서버가 보는 메타데이터(IP·시각) 범위]**. README·PRD에는 아직 "Cloudflare Tunnel"이라 적힌 곳이 남아 있다 **[갭: 문서 불일치]** | `apps/desktop/src/main/sync.ts:18`, `apps/mobile/app.json` `extra`, `server/README.md` |
| AI | 운영자 Mac mini의 Ollama(로컬 모델, 기본 `qwen3.5:9b`). API가 대기열·상한을 걸고 넘긴다(`direct` 또는 `worker`). 제3자 AI API 없음 | `server/api/src/ai.ts`, `ai-backend.ts`, `server/ai-worker/worker.ts` |
| 푸시 | Google Firebase Cloud Messaging(HTTP v1). **Android만**(`pushIos: false`, `PUSH_IOS=0`). `FCM_PROJECT_ID`가 비면 전부 꺼짐 | `server/api/src/fcm.ts`, `push*.ts`, `apps/mobile/app.config.ts` |
| 분석·광고·크래시 리포트 SDK | **없음**(Sentry·Firebase Analytics·Crashlytics 등 검색 결과 없음). PowerSync 텔레메트리도 꺼 둠 | `server/powersync/service.yaml` `disable_telemetry_sharing: true` |
| 이메일 발송 | **없음** — 비밀번호 재설정·이메일 인증 없음 **[갭]** | `server/README.md` "배포 전에 남은 일" |

## 1. 서버에 저장되는 데이터

### 1.1 계정·인증 (서버 전용, 동기화하지 않음)

| 데이터 | 저장 위치 | 목적 | 보유 기간 | 삭제 동작 | 제3자 |
|---|---|---|---|---|---|
| 이메일(소문자 정규화) | `users.email` | 계정 식별·로그인 | 탈퇴 시까지 | `DELETE /auth/account` 즉시 삭제 | 없음 |
| 비밀번호 해시 | `users.password_hash` — scrypt(N=16384, r=8, p=1, 16바이트 솔트). 소셜 전용 계정은 NULL | 로그인 | 탈퇴 시까지 | 즉시 삭제 | 없음 |
| 가입 시각 | `users.created_at` | 운영 | 탈퇴 시까지 | 즉시 | 없음 |
| 리프레시 토큰 | `sessions.token_hash`(SHA-256 해시만), `created_at`, `expires_at`(60일). **IP·기기 정보 저장 안 함** | 로그인 유지 | 로그아웃·리프레시(회전)·탈퇴 때 삭제. **만료된 행을 지우는 작업은 없음 [갭]** | CASCADE | 없음 |
| 구글·애플 식별자 | `user_identities(provider, subject, email, created_at)` — `subject`=공급자 사용자 id, `email`=그때 받은 이메일(애플 가림 주소 가능). 이름·프로필 사진은 **저장 안 함** | 소셜 로그인·로그인 방법 연결 | 탈퇴 또는 연결 해제(`DELETE /auth/link/*`) 시까지 | CASCADE | 공급자(구글·애플)는 사용자가 직접 로그인 |
| 접근 토큰(JWT) | 저장 안 함(RS256 서명, 1시간, `auth_time`은 막 로그인했을 때만) | API·동기화 인증 | — | — | 없음 |
| JWT 서명 키 | `api_data` 볼륨 `/data/keys.json`(권한 600) | 토큰 서명 | — | — | 없음 |

근거: `server/db/init/01-base.sql`, `04-identities.sql`, `server/api/src/auth.ts`, `server/api/src/server.ts`(`ACCESS_TTL=3600`, `REFRESH_DAYS=60`), `server/api/src/social.ts:252-256`.

### 1.2 동기화되는 사용자 콘텐츠 (PowerSync, 모든 기기와 서버에 같은 사본)
정의 원본: `packages/schema/src/index.ts` → `server/db/init/02-schema.sql`(25개 표, 모두 `owner_id … REFERENCES users(id) ON DELETE CASCADE`). 동기화 규칙은 `owner_id = auth.user_id()` — 자기 행만 내려받는다. 업로드는 정의된 표·칸만 받고 `owner_id`는 서버가 로그인 사용자로 덮어쓴다(`server/api/src/upload.ts`).

| 범주 | 표(주요 칸) | 목적 | 비고 |
|---|---|---|---|
| 할 일 | `tasks`(제목·내용·날짜·반복·우선순위·완료/삭제 시각), `check_items`, `reminders`(트리거), `task_tags` | 핵심 기능 | 휴지통 = `deleted_at`(소프트 삭제). 휴지통에서 영구 삭제하면 행이 지워짐. **휴지통 자동 비우기 기간 [확인 필요]** |
| 정리 | `lists`(이름·이모지·색·설명), `folders`, `sections`, `tags`(이름·종류 person/project/place/topic·별칭·설명), `filters`, `view_settings`, `relations` | 정리·관계 위키 | `tags.kind='person'`이면 **사용자가 적은 타인 이름**이 들어갈 수 있음 |
| 일정 | `events`(제목·메모·시작/끝·장소·반복·알림) | [제품명] 자체 일정 | 외부 캘린더(구글·Apple)와 다름 — 아래 §2 |
| 수집함·위키 | `notes`(내용·URL·링크 제목·출처 app/kakao_import/kakao_channel·AI 분류 상태·제안), `wiki_topics`, `wiki_versions` | 메모·링크 모으기, 주제 위키 | 카카오톡 대화 내보내기 파일을 가져오면 그 메시지 원문이 들어감 — **대화 상대의 메시지·이름이 섞일 수 있음 [확인 필요: 작성자 필터 여부]** |
| 일기 | `diary_entries`(날짜·기분 1~5·본문·질문·나만 보기·AI 요약), `diary_messages`(role me/buddy, 내용, safety) | 일기·AI 대화 | **종단 간 암호화 아님 — 운영자가 DB에서 읽을 수 있음 [갭]**(PRD·`docs/screens/15-diary.md:73`가 출시 전 검토로 남김). 기분·심리 내용은 민감할 수 있음 |
| 성장 | `xp_events`, `characters`(이름·종류·성향 검사 답 `answers_json`), `kpis`, `weekly_reports`(통계·AI 리포트 글) | 성장 루프 | |
| 작업 지도 | `map_areas`, `task_areas`, `map_links` | 작업 지도 | |
| 설정 | `user_prefs`(스마트 목록 표시·테마·주 시작·`notify_json` 알림 설정 — 제목 숨기기 포함) | 설정 동기화 | |

- 보유: 탈퇴 시까지(또는 사용자가 개별 삭제할 때까지).
- 삭제: 탈퇴하면 `users` 삭제 → 모든 표 CASCADE. PowerSync가 다른 기기에도 삭제를 내려보낸다.
- PowerSync 저장 DB(`powersync_storage`)에 버킷 연산 기록(행 사본)이 남는다. 삭제 연산은 기록되지만 **이전 사본이 압축(compact)으로 실제 지워지는 시점 [확인 필요]**.

### 1.3 AI 사용량 (서버 전용)

| 데이터 | 위치 | 내용 | 보유 | 삭제 |
|---|---|---|---|---|
| 사용량 | `ai_usage(user_id, endpoint, day, requests, failures, prompt_tokens, output_tokens, duration_ms, updated_at)` | 용도·날짜(한국 시각)별 **숫자만** | **기한 없음(탈퇴 시까지) [갭: 보관 기한 정하기 — 상한 계산엔 최근 7일이면 충분]** | 탈퇴 때 명시적 DELETE + CASCADE |

- **요청·응답 원문은 서버가 저장하거나 로그로 남기지 않는다** — 확인: `server/db/init/03-ai-usage.sql`(숫자 칸만), `server/api/src/ai.ts:505`(쓰기 실패 로그도 용도 이름만), `ai.ts:523`(오류는 이름만, "원문·메시지는 남기지 않는다"), `server/ai-worker/worker.ts`(소요 시간·성공/실패만 로그).
- 원문은 처리 중에만 API 프로세스 메모리 → Ollama(같은 Mac mini 또는 워커 경유)로 흐른다. **Ollama 자체 로그(`~/.ollama/logs/server.log`)는 기본 설정에서 요청 줄(경로·시간)만 남기고 본문은 `OLLAMA_DEBUG`일 때만 남는다 [확인 필요: 운영 Mac mini에서 OLLAMA_DEBUG 꺼짐 확인]**.
- 단, **사용자가 앱에 저장한 AI 결과는 사용자 콘텐츠로 동기화·저장된다**: 일기 대화(`diary_messages` role=buddy, 내가 보낸 말 role=me), 일기 요약(`diary_entries.summary`), 주간 리포트(`weekly_reports.text_json`), 수집함 분류·제안(`notes.kind`, `suggestion`), 자동 태그(`task_tags.source='ai'`), 작업 지도 분류(`task_areas`).
- AI 비서 대화 기록은 **기기에만**(계정별 파일, 최근 100개) — 서버에 저장하지 않는다(PRD §7.3, `apps/mobile/src/assistant/store.ts`).
- 일기는 사용자가 "나누기"를 켠 날, `나만 보기`가 아닌 날만 AI로 보낸다(`docs/screens/15-diary.md:73`).
- AI로 보내는 것: 앱이 만든 프롬프트(할 일 제목·리스트 이름·메모·일기 본문 등 그 기능에 필요한 것). **외부 캘린더(구글·Apple) 일정은 AI 요청에 넣지 않는다**(AI 모듈에서 외부 캘린더 참조 없음).
- 상한(`ai.ts:56-60`, [임시]): 사용자당 분당 6 · 하루 100 · 동시 2 · 주간 목표 초안 주 1 · 주간 리포트 주 1(월요일 0시 KST 초기화) · 작업 쪼개기 하루 10 · 자동 태그 하루 40. 서버 전체 동시 1, 대기열 20.

### 1.4 푸시 알림 (서버 전용, Android)

| 데이터 | 위치 | 목적 | 보유 | 삭제 |
|---|---|---|---|---|
| 기기 등록 | `device_tokens`: 앱이 만든 기기 UUID, FCM 등록 토큰, 플랫폼, 앱 버전, 기능 목록, **시간대(IANA)**, 로캘, 로컬 예약 알림 id, 할 일 알림 수신 여부, 마지막 접속·성공 시각, 실패 횟수 | 알림 보내기 | 로그아웃·`DELETE /push/devices/:id`·탈퇴·FCM이 `UNREGISTERED` 응답 시 삭제. 30일 안 보인 기기는 보내지 않지만 **행은 남음 [갭]** | 탈퇴 시 명시적 DELETE + CASCADE |
| 보낸 기록 | `push_sent(device_id, key, kind, task_id, sent_at)` — **제목 없음** | 중복 막기·지우기 | **7일** 뒤 삭제(`push-store.ts:160`) | CASCADE |
| 상태 | `push_state`(마지막 진화 단계·리포트 주 등), `push_cursor` | 스케줄러 | 탈퇴 시 | CASCADE |

- **FCM 페이로드(Google을 지남)**: 할 일 알림 = 종류·키·할 일 id·시각·`body`("오늘 오후 3:00 · 리스트 이름")·`title`(할 일 제목, 100자 자름) · 하루 요약 = 오늘 할 일 수와 제목 일부 · 성장 소식 · 동기화 신호(`dismiss` = 할 일 id 목록). **"알림에 제목 숨기기"(설정 › 소리와 알림, 기본 꺼짐)를 켜면 제목·리스트 이름이 페이로드에 아예 없다**(`push-plan.ts:97`, `notify.ts:91`). AI 글은 어떤 페이로드에도 넣지 않는다.
- 서버 로그·DB에 할 일 제목을 남기지 않는다(`push.ts` 로그는 개수·오류 메시지만).

### 1.5 메모리에만 있는 것

| 데이터 | 위치 | 보유 |
|---|---|---|
| 시도 제한 키 | `ratelimit.ts` — `login:email:<이메일>`, `login:ip:<IP>`, `signup:ip:<IP>` 등 + 시각 | 창(최대 60분) 지나면 정리, 24시간 넘은 키 일괄 정리, API 재시작 시 사라짐. 디스크·DB에 쓰지 않음 |
| 애플 로그인 맡김 | `HandoffStore` — state별 애플 ID 토큰·코드 | 5분, 한 번 꺼내면 삭제 |
| AI 대기열·분당 상한 | `ai.ts` 프로세스 메모리 | 요청 동안 |

### 1.6 로그
- API는 **접속 로그(IP·이메일·경로)를 남기지 않는다.** 로그 줄: 시작 메시지, `[account] 계정 1건 삭제`(id·이메일 없음), `[social] google 식별자를 기존 계정에 연결`, `[push]` 개수·오류, AI 오류 이름.
- 500 오류일 때 `console.error(req.method, path, e)`로 **오류 객체 전체**를 찍는다(`server.ts:340`) — Postgres 오류 `detail`에 값이 들어갈 수 있음 **[확인 필요/갭: 오류 메시지만 남기도록]**.
- Docker 로그 드라이버 기본값(json-file, **크기·기간 제한 없음**) **[갭: `logging.options.max-size/max-file` 설정]**.
- PowerSync Service 자체 로그(연결·사용자 id 수준) **[확인 필요]**.

### 1.7 백업

| 항목 | 현재 | 근거 |
|---|---|---|
| 방식 | `backup` 컨테이너가 `pg_dump -Fc`(데이터 DB `sprout`만, PowerSync 저장 DB 제외) | `server/backup/run.sh` |
| 주기 | 24시간마다(`BACKUP_INTERVAL_SEC=86400`) | compose |
| 보관 | 14일 지난 파일 자동 삭제(`BACKUP_KEEP_DAYS=14`) | `run.sh` |
| 위치 | **같은 Mac mini의 `server/backups/`** (git 제외) | compose `BACKUP_DIR` |
| 외부 저장소 | **없음 [갭 — PRD·CLAUDE.md 필수 항목]** (예정: Cloudflare R2 + rclone) | README "배포 전에 남은 일" |
| 암호화 | **없음 — 덤프 파일 평문 [갭]** (디스크 FileVault 여부 [확인 필요]) | |
| 수동 백업 | 배포 절차가 `backups/manual/before-*.dump`를 만드는데 **자동 삭제 대상이 아님 [갭]** (`run.sh`는 `sprout-*.dump`만 지움) | README 배포 절차 |
| 탈퇴와의 관계 | 탈퇴해도 최대 14일(수동 백업은 지울 때까지) 백업 안에 남는다. 복원 시 탈퇴 계정을 다시 지우는 절차 **[갭: 복원 절차서]** | README "계정 삭제" |

## 2. 기기에만 저장되는 데이터 (서버로 가지 않음)

| 데이터 | 기기 | 위치 | 비고 |
|---|---|---|---|
| 동기화 데이터 로컬 사본 | 전부 | 앱 SQLite(PowerSync) | 로그아웃하면 지움(`sync.ts`, 모바일 `auth.ts`) |
| 로그인 정보(리프레시 토큰) | 데스크톱 | `userData/auth.bin` — Electron `safeStorage`(macOS 키체인·Windows DPAPI) | |
| 로그인 정보·기기 id | 모바일 | `expo-secure-store`(iOS 키체인·Android Keystore) | 공유 확장은 접근 토큰만 읽음 |
| 구글 캘린더 일정·토큰 | 데스크톱 | 캐시 SQLite(`ext_accounts/ext_calendars/ext_events`: 제목·설명·장소·시각·링크), 토큰은 `safeStorage`. 범위 `calendar.calendarlist.readonly`, `calendar.events.readonly` | 서버·AI로 보내지 않음(`docs/screens/16-google-calendar.md`). **Google 앱 검증(민감 범위) + 처리방침의 "제한적 사용" 문장 필요** |
| Apple(맥) 캘린더 일정 | 데스크톱 macOS | EventKit 도우미 → 같은 캐시 | 읽기 전용, 이 Mac에만(`electron-builder.yml` 권한 문구) |
| AI 비서 대화 기록 | 데스크톱·모바일 | 계정별 기기 파일, 최근 100개 | 요청할 때는 최근 몇 턴이 AI로 감(원문 비저장) |
| 맥 위젯 스냅샷 | macOS | `~/Library/Group Containers/<팀ID>.app.sprout.desktop/widget/snapshot.json`(할 일 제목 등) | 로그아웃 때 정리(`widget.ts`) |
| 공유 확장 대기열 | iOS | App Group `group.app.sprout.mobile` 파일 | 본 앱이 가져가면 지움 |
| 다른 할 일 서비스 가져오기 토큰 | 데스크톱 | `userData/ticktick.bin`(safeStorage) — 해당 서비스 공식 Open API | 가져온 할 일은 일반 동기화 데이터가 됨. **출시 범위 포함 여부 [확인 필요]** · 스토어 문구에 서비스 이름 쓰지 않음 |
| 카카오톡 내보내기 파일 | 데스크톱 | 사용자가 고른 파일을 기기에서 해석 → `notes`로 저장 | 파일 자체는 올리지 않음 |
| 링크 제목 가져오기 | 데스크톱(·모바일 [확인 필요]) | 기기가 그 URL(유튜브는 oEmbed)에 **직접** 요청 | 그 사이트가 사용자 IP를 본다. 내부망 주소는 열지 않음(`collect.ts`) |
| 알림 예약 | 전부 | OS 로컬 알림(데스크톱 48시간 창, 모바일 로컬 예약) | |

## 3. 제3자·국외 이전

| 받는 곳 | 무엇 | 언제 | 성격 | 국가 |
|---|---|---|---|---|
| Google LLC — Firebase Cloud Messaging | FCM 등록 토큰, 알림 페이로드(할 일 제목·시각·리스트 이름 — 숨기기면 제외, 할 일 id) | Android에서 서버 푸시가 켜진 경우 | 처리 위탁 + 국외 이전(알림 전송) | 미국 등 Google 데이터센터 |
| Google LLC — Google 로그인 | 사용자가 Google에 직접 로그인 → 우리는 ID 토큰(sub·이메일·이메일 확인 여부)만 받음. 범위 `openid email profile`(이름·사진은 저장 안 함) | 사용자가 선택할 때 | 이용자가 직접 이용하는 외부 로그인. 서버는 Google 공개키만 받아 검증 | 미국 |
| Google LLC — Google Calendar API | 기기 ↔ Google 직접(서버 경유 없음) | 데스크톱에서 연결할 때 | 이용자 직접 연결 | 미국 |
| Apple Inc. — Sign in with Apple | 사용자가 Apple에 직접 로그인 → ID 토큰(sub·이메일/가림 주소) | **데스크톱만 코드 있음, 모바일은 "준비 중"** | 위와 같음 | 미국 |
| Tailscale Inc. — Funnel | 암호화된 연결 중계(내용 복호화 안 함 [확인 필요]), 접속 IP·시각 메타데이터 | 모든 서버 통신 | 처리 위탁 여부 **[확인 필요 — 법률 검토]** | 캐나다·미국 |
| Ollama(소프트웨어) | 운영자 Mac mini 안에서 실행 — 데이터가 외부로 나가지 않음 | AI 사용 시 | 제3자 아님 | 대한민국 |
| 광고·분석 업체 | 없음 | — | — | — |

## 4. 권한·식별자 (모바일)
- iOS: 알림(로컬). 카메라·사진·위치·연락처·캘린더 권한 **쓰지 않음**. `ITSAppUsesNonExemptEncryption=false`. 광고 식별자(IDFA)·ATT 없음.
- Android: `INTERNET`, `VIBRATE`, 알림(POST_NOTIFICATIONS), 선택적 `SCHEDULE_EXACT_ALARM`(사용자 허용 시). 매니페스트에 `SYSTEM_ALERT_WINDOW`·외부 저장소(≤API 32)가 보임 — 개발 빌드 잔여물일 가능성 **[확인 필요: 출시 빌드에서 제거]**.
- `supportsTablet: true` → iPad 스크린숏 필요.

## 5. 계정 삭제 실제 동작
- 경로: 데스크톱 **설정 › 계정 › 맨 아래 `계정 삭제`**(`DesktopSettings.tsx:144`) · 모바일 **더보기 › 설정 › (맨 위 계정 카드) › 계정 › 맨 아래 `계정 삭제`**(`apps/mobile/app/(tabs)/settings/account.tsx`).
- 확인: "삭제" 입력 + 비밀번호(비밀번호 계정) 또는 10분 안 Google 재로그인(소셜 전용 계정). 서버 `DELETE /auth/account`(`server/api/src/account.ts`), 재확인 실패 시도 제한 사용자당 15분 5회.
- 지우는 것: 한 트랜잭션으로 `ai_usage` → `device_tokens` → `users` 삭제 → CASCADE로 `sessions`·`user_identities`·`push_state`·`push_sent`·동기화 25개 표 전부. 다른 기기는 PowerSync로 삭제를 받고, 리프레시는 401 → 로그아웃. 남은 접근 토큰(최대 1시간)으로 올려도 401.
- 남는 것: 서버 백업(최대 14일, 수동 백업은 지울 때까지), PowerSync 저장 DB 연산 기록(압축 전까지 [확인 필요]), Google·Apple 쪽 연결(사용자가 각 계정 설정에서 해제 — **Apple 토큰 폐기(revoke) 미구현 [갭]**).
- **[차단 후보]** 모바일에서 Apple로만 가입한 계정은 삭제할 수 없고 "컴퓨터 앱에서" 안내(`account.tsx:191`). 지금은 모바일에 Apple 로그인이 없어 실제로 생기진 않지만, iOS에 Apple 로그인을 켜면 반드시 고쳐야 한다(App Store 5.1.1(v)).

## 6. 출시 전 갭 요약

| # | 갭 | 영향 | 상태 |
|---|---|---|---|
| G1 | 백업 외부 저장소·암호화 없음, 수동 백업 무기한 | 재해 시 전체 유실, 처리방침 보유 기간과 불일치 | **[차단]** PRD 필수 |
| G2 | 이메일 발송 없음 → 비밀번호 재설정·이메일 인증 없음 | 비밀번호 분실 시 복구 불가, 이메일 선점 후 구글 로그인 연결 공격 가능(README "남은 위험") | **[차단]** 보안 |
| G3 | iOS에 Google 로그인이 있는데 Apple 로그인은 "준비 중" | App Store 4.8 위반 | **[차단]** iOS |
| G4 | Apple 로그인 켤 때: 탈퇴 시 Apple 토큰 폐기, 모바일 Apple 전용 계정 삭제 | App Store 5.1.1(v) | **[차단]** (G3과 함께) |
| G5 | 일기·대화 평문 저장(운영자 열람 가능) | 처리방침에 정직하게 적거나 E2E 도입 | 결정 필요 |
| G6 | 만 14세 미만 확인 장치 없음 | 개인정보 보호법 제22조의2 | 가입 화면에 연령 확인 필요 |
| G7 | 보관 기한 미정: `ai_usage`, 만료 `sessions`, 30일 넘은 `device_tokens`, Docker 로그, PowerSync 압축 | 최소 보관 원칙 | 정리 작업 추가 |
| G8 | 처리방침·약관 공개 URL·도메인 없음(ts.net은 Tailscale 도메인), 가입 화면 링크 미연결(`08-login.md:35`) | 스토어 필수 URL, Google OAuth 검증 | **[차단]** |
| G9 | 500 오류 로그에 오류 객체 전체 | 개인정보가 로그에 남을 수 있음 | 확인 |
| G10 | Android 매니페스트 `SYSTEM_ALERT_WINDOW` 등 | Play 정책 질의 | 확인 |
| G11 | 구글 캘린더 민감 범위 → Google 앱 검증 전엔 테스트 사용자 100명·경고 | 데스크톱 기능 | 처리방침 "제한적 사용" 문장 포함(이 초안에 있음) |
| G12 | README·PRD가 Cloudflare Tunnel로 적혀 있음(실제는 Tailscale Funnel) | 문서 정확성 | 문서 정리 |
