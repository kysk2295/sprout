# 32 · 푸시 알림 (FCM) — 할 일 알림 · 하루 요약 · 다른 기기 변경 · 성장 소식

- 상태: **확정 v1.0 (2026-10-05)** — 사용자 "추천대로 전부, 나머지는 다 승인": §12 N1~N5 = 추천안, §10 인프라 I1~I8 승인. 서버 쪽(1·3·4·5·6단계 서버) 구현 완료 — §15 구현 메모 · 7단계 데스크톱 `알림` 탭 구현 완료 — §16
- 사용자 결정(2026-10-05): FCM(HTTP v1, 셀프호스트 Node API가 서비스 계정으로 보냄). 알림 종류 4가지 모두 — ① 서버가 보내는 할 일 알림 ② 아침 하루 요약 ③ 다른 기기 변경 즉시 반영(조용한 푸시) ④ 성장·AI 소식. **Android 먼저 끝까지**, iOS는 코드 길만 준비하고 Apple 개발자 계정·APNs 키가 생기면 켠다(그 전까지 iOS는 지금의 로컬 알림 그대로).
- 바꾸는 결정: [20 모바일 §0 D3](20-mobile-overview.md)("로컬 알림, 서버 푸시는 [다음]") → **로컬 알림은 그대로 두고 서버 푸시를 더한다**(§4.3 하이브리드). 20 §4.4의 로컬 예약 규칙(48시간·50개·버튼·완료 경로)은 그대로 쓴다.
- 표기: **[틱틱]** 틱틱 동작 근거 있음 · **[sprout]** 틱틱에 없음(성장·AI·동기화) · **[임시]** 숫자·문구 추정값 · **[승인]** 인프라 변경이라 사용자 승인 필요

## 1. 틱틱 기준 자료
| 주제 | 자료 |
|---|---|
| 알림 버튼(완료·다시 알림), 여러 알림, 끝날 때 | [research 09](../ticktick-research/09-reminders.md), [20 §4](../ticktick-research/20-mobile.md) |
| 하루 요약(Daily Notification: 시각·주말 건너뛰기), 설정 묶음 `Sounds & Notifications`, 여러 기기, Android 배터리 | **[research 30](../ticktick-research/30-push-notifications.md)** (새로 씀) |
| 설정 첫 화면 칸 이름, 알림 권한 안내, Android 잠금 화면 버튼 | [research 24 §11·§12](../ticktick-research/24-mobile-ui.md) |
| 지금 sprout 로컬 알림 | [20 §4.4](20-mobile-overview.md), [22 §구현](22-mobile-quick-add.md), 코드 `apps/mobile/src/notifications/`(plan·index·background·NotificationCell) |
| 데스크톱 알림 | [03 §7](03-date-picker.md), `apps/desktop/src/main/reminders.ts` |
| 성장·AI 사건 | [10 성장 §2.4·§4.3·§5](10-growth.md), [30 리스트 B.1](30-lists-and-areas.md), [23 모바일 성장](23-mobile-growth.md) |

## 2. 전체 그림
```
 데스크톱/휴대폰 ──POST /sync/upload──▶ api ──COMMIT──▶ Postgres ──▶ PowerSync ──▶ (앱이 켜져 있으면 바로)
                     X-Sprout-Device         │
                                             ├─ 효과 판정(pushEffects) ─▶ 조용한 동기화 푸시(§6) · 지우기(§4.5) · 성장 소식(§8)
 api 안 스케줄러(30초마다) ─ tasks·reminders·device_tokens ─▶ 할 일 알림(§4) · 하루 요약(§5) · 목표 마감(§8)
                                             │
                                  FCM HTTP v1 (서비스 계정 OAuth) ──▶ Android(지금) / APNs 경유 iOS(나중)
 휴대폰 앱: 데이터 메시지를 받아 **앱이 직접 알림을 그린다**(로컬 알림과 같은 모양·같은 버튼·같은 id)
```
- 모든 FCM 메시지는 **데이터 메시지**(notification 칸 없음). 앱이 받아서 `expo-notifications`로 직접 띄운다 → 로컬 알림과 버튼·채널·식별자가 완전히 같아지고, 중복을 앱이 걸러 낼 수 있다(§4.3).
- 데스크톱(Electron)은 푸시를 받지 않는다. 지금처럼 로컬 예약(03 §7). 데스크톱은 **설정만** 고친다(§9.2).

## 3. 기기 등록
### 3.1 `device_tokens` (서버 전용 테이블 — 동기화하지 않음)
`ai_usage`와 같은 방식: `packages/schema`·PowerSync 규칙에 넣지 않는다. 이유: FCM 토큰은 비밀에 가깝고(가진 사람은 그 기기로 메시지를 보낼 수 있음 — 서버 키가 있어야 하지만), 다른 기기가 알 필요가 없으며, 서버만 쓴다.

| 칸 | 형 | 설명 |
|---|---|---|
| `id` | uuid PK | **기기 id** — 앱이 처음 실행 때 만들어 보안 저장소(`sprout.deviceId`)에 둔다. 다시 설치하면 새 id |
| `user_id` | uuid → users ON DELETE CASCADE | 계정 삭제 = 토큰도 삭제 |
| `provider` | text | `fcm` (나중에 `apns` 직접 보내기를 고르면 여기로 갈린다, §11) |
| `token` | text UNIQUE | FCM 등록 토큰. 같은 토큰이 다른 사용자로 오면 옛 행을 지우고 새로(같은 휴대폰에서 계정 바꿈) |
| `platform` | text | `android` · `ios` |
| `app_version` | text | `0.1.0 (12)` — 기능 지원 판단·문제 추적 |
| `caps` | text[] | 이 앱 버전이 열 수 있는 것: `reminder` `daily` `sync` `growth` `inbox-cleanup` … 서버는 `caps`에 없는 종류를 보내지 않는다(옛 앱 보호) |
| `timezone` | text | IANA(`Asia/Seoul`). 떠 있는 시각(`due_at` floating)을 이 기기 시각으로 바꿀 때 쓴다 |
| `locale` | text | `ko-KR` (문구는 v1 한국어뿐, 나중 대비) |
| `local_keys` | text[] | 이 기기가 **로컬로 예약해 둔 알림 id**(`r:<reminder id>@<ms>`, 최대 50) — 중복 막기(§4.3) |
| `local_keys_at` | timestamptz | 위를 보고한 시각 |
| `push_reminders` | boolean | 이 기기가 서버 할 일 알림을 받는지(설정 › 할 일 알림 꺼짐·OS 권한 꺼짐이면 false) |
| `last_seen_at` · `last_ok_at` · `fail_count` · `created_at` | | 30일 넘게 안 보이면 보내지 않음, FCM이 `UNREGISTERED`·`INVALID_ARGUMENT(토큰)`이면 행 삭제 |

### 3.2 경로 (Bearer, `server.ts` → 새 파일 `push.ts`)
| 경로 | 본문 | 동작 |
|---|---|---|
| `PUT /push/devices/:id` | `{token, platform, app_version, caps[], timezone, locale, push_reminders}` | 있으면 덮어쓰기, `last_seen_at = now()`. 부르는 때: 로그인 직후 · 앱 시작 · 앞으로 올 때(하루 한 번 이하) · FCM 토큰이 바뀔 때(`addPushTokenListener`) · 시간대·설정이 바뀔 때. 시도 제한 사용자당 분당 10 |
| `PUT /push/devices/:id/local` | `{keys[], until}` | 로컬 예약 목록 보고(§4.3). 다시 계산 결과가 바뀔 때만, 최소 30초 간격 |
| `DELETE /push/devices/:id` | — | 이 기기 등록 해제. **로그아웃 때 `/auth/logout`보다 먼저** 부른다(접근 토큰이 살아 있을 때) |
| `POST /push/test` | `{device_id}` | 이 기기에 시험 알림 1개(설정 화면 버튼). 사용자당 10분에 3번 |
- `/auth/logout` 본문에 `device_id`(선택)를 받아 그 행도 지운다 — 앱이 위 DELETE에 실패해도 정리된다.
- 계정 삭제는 `users` CASCADE로 지워진다(`account.ts`는 손대지 않아도 됨, 시험만 추가).
- 응답에 `{ push: { enabled: bool, ios: bool } }` — 서버에 FCM 설정이 없으면(`FCM_PROJECT_ID` 없음) 앱은 로컬 알림만 쓰고 설정 화면에 "서버 알림 준비 중"을 보인다.

### 3.3 앱이 토큰 얻기 (Android)
- `Notifications.getDevicePushTokenAsync()` → Android는 **FCM 토큰 그대로**(Expo 푸시 서비스를 거치지 않는다 — Expo 서버에 의존하지 않게) [§12 N3].
- `app.json` → `android.googleServicesFile: "./google-services.json"`(파일은 git에 넣지 않음, §10).
- OS 알림 권한이 없으면 토큰은 등록하되 `push_reminders=false`, 조용한 동기화 푸시는 권한 없이도 받는다(데이터 메시지는 화면에 안 뜸).

## 4. 할 일 알림 (서버가 보냄)
### 4.1 시각 계산 — 휴대폰과 **같은 함수**
- 대상: `reminders r JOIN tasks t` where `t.status = 0 AND t.deleted_at IS NULL AND t.due_at IS NOT NULL` — 모바일 `QUERY`와 같은 조건.
- 시각: 공용 `reminderFireTime()`의 **시간대 버전** `reminderFireTimeIn(task, trigger, timeZone)`을 `packages/schema/src/time.ts`에 새로 둔다(Intl만 씀, 의존성 없음). 휴대폰은 기기 시간대, 서버는 `device_tokens.timezone` → 같은 ms가 나와야 같은 알림 id(`r:<rid>@<ms>`)가 된다. 시험: 같은 입력으로 두 함수 결과가 같다(서울·뉴욕·서머타임 하루).
- 종일 할 일: 트리거가 이미 "당일 09:00" 꼴(`P0DT9H` 등, 03 §3.2)이라 따로 처리하지 않는다. 기간 할 일 `END-PT0M` = 끝날 때.
- **반복**: sprout는 지금 회차가 한 행이고 완료하면 다음 회차 행이 생긴다(03 §8) → 서버는 RRULE을 펼치지 않는다. 휴대폰 `planReminders`와 똑같이 "지금 행의 알림"만 본다.
- 한 할 일의 두 알림이 같은 순간이면 하나만(plan.ts와 같은 규칙).

### 4.2 스케줄러 (api 프로세스 안)
- `setInterval` 30초(`PUSH_TICK_MS`) [임시]. Postgres **advisory lock**으로 한 프로세스만 돈다(Railway·VPS로 옮겨 여러 개가 떠도 안전).
- 한 번 돌 때: 창 `(cursor, now]`에 울릴 알림을 기기별로 계산 → 보냄 → `push_sent(device_id, key)`에 기록 → `cursor = now`(`push_cursor` 한 행에 저장).
- 후보 줄이기: 시작(없으면 마감) 또는 마감의 날짜 부분이 `[오늘-2일, 오늘+15일]`(문자열 비교, 떠 있는 시각이라 시간대 여유를 둠. +15일 = '1주 전' 알림과 기간 할 일의 시작 기준 알림이 빠지지 않게 — v0.1의 +3일에서 고침) + 부분 색인 `tasks (due_at) WHERE status = 0 AND deleted_at IS NULL`.
- **중복 안 보냄**: `push_sent` PRIMARY KEY `(device_id, key)` → `INSERT … ON CONFLICT DO NOTHING`이 성공한 것만 보낸다. 7일 지난 기록은 지운다.
- **서버가 꺼져 있던 동안(따라잡기)**: 다시 켜지면 창의 시작을 `max(cursor, now - 60분)`으로 — **지난 1시간 안 것만** 보낸다(데스크톱 03 §7 "지난 1시간"과 같은 값). 그보다 오래된 것은 버린다(늦은 알림은 소음). FCM `ttl` = 1시간: 휴대폰이 꺼져 있다 1시간 넘어 켜지면 FCM도 버린다.
- 실패: FCM 429·5xx는 `Retry-After`/지수 백오프로 3번까지(같은 tick 안 10초 이하), 그래도 실패하면 `push_sent`에서 지우고 다음 tick에 다시(1시간 창 안에서만). 동시 전송 10개.

### 4.3 휴대폰에서 두 번 울리지 않게 — **하이브리드 + 같은 id** [§12 N1]
로컬 예약은 **끄지 않는다**(오프라인·Mac mini 꺼짐에도 울려야 함, KR2). 대신:
1. 휴대폰이 로컬로 예약한 알림 id 목록을 서버에 보고한다(`PUT /push/devices/:id/local`, §3.2). 다시 계산(20 §4.4: 앱 시작·동기화 변경·30분마다·백그라운드) 결과가 바뀔 때마다.
2. 서버는 그 기기의 `local_keys`에 **이미 있는 key는 보내지 않는다**. → 서버 푸시는 "휴대폰이 아직 모르는 알림"(데스크톱에서 만들고 휴대폰 앱을 안 연 경우 등)에만 간다.
3. 그래도 겹칠 수 있는 순간(보고 직전에 데스크톱에서 시각을 바꿈 등)을 위해 앱이 받을 때 다시 확인: 같은 id가 **예약돼 있거나(`getAllScheduledNotificationsAsync`) 이미 떠 있으면(`getPresentedNotificationsAsync`)** 띄우지 않는다. 띄울 때는 같은 id로 띄우고, 혹시 남은 같은 id 로컬 예약은 취소한다.
- 왜 2번이 필요한가: Android는 **높은 우선순위 데이터 메시지를 받고도 알림을 안 띄우는 일이 잦은 앱의 우선순위를 낮춘다**. 서버가 매번 보내고 앱이 대부분 버리면 진짜 필요할 때 늦게 온다.
- 다시 알림(스누즈)은 지금처럼 **기기에만**(`s:<taskId>@<ms>`, 로컬 예약). 서버는 모른다 — 다른 기기에서 다시 울리지 않는다(틱틱과 같음 [추정]).

### 4.4 알림 모양·버튼 — 로컬 알림과 **똑같이** [틱틱]
| 칸 | 값 |
|---|---|
| 채널 | `tasks` "할 일 알림"(높음) — 이미 있음 |
| 제목 | 할 일 제목(없으면 `제목 없음`) |
| 본문 | `오늘 오후 3:00 · 기본함`(plan.ts `bodyOf` — 서버도 같은 함수를 `packages/schema`로 옮겨 씀) |
| 버튼 | **완료 · 10분 뒤 다시 알림 · 1시간 뒤 다시 알림 · 내일 다시 알림**(카테고리 `sprout-task`, 앱을 열지 않음) |
| 누르기 | `sprout://task/<id>` |
| "알림에 제목 숨기기" 켬 | 제목 `할 일 알림`, 본문 `오늘 오후 3:00` — 서버 페이로드에 제목·리스트 이름이 **아예 없다**. 앱이 로컬 DB에서 제목을 찾을 수 있으면 화면에는 제목을 보인다(기기 안 데이터라 괜찮음) |
- 버튼 동작은 지금 `handleResponse` 그대로: 완료 = 로컬 DB에 완료 + XP(공용 `completeTasks`) → 연결되면 업로드(오프라인 OK). API를 직접 부르지 않는다(로컬 퍼스트 한 길만 유지).
- 휴대폰이 그 할 일을 아직 내려받지 못했으면(새 할 일): 완료를 누르면 먼저 `syncNow()`(최대 8초) → 그래도 없으면 앱을 열어 상세로(그때 내려받힘) [임시].

### 4.5 다른 기기에서 완료·삭제·시각 변경 → 떠 있는 알림 지우기 [sprout]
- `/sync/upload`가 커밋된 뒤 `pushEffects(batch)`(순수 함수, 시험 있음)가 고른다: `tasks`의 `status`가 1·2로, `deleted_at` 채워짐, `due_at`·`start_at` 바뀜, `tasks`·`reminders` DELETE.
- 그 할 일로 **최근 24시간 안에 알림이 나간 기기**(`push_sent.task_id`) + 그 사용자의 다른 모든 Android 기기(로컬 알림이 떠 있을 수 있음)에 조용한 메시지 `{type:"sync", dismiss:[task ids]}`를 **바로**(§6의 모으기 기다림 없이) 보낸다. 올린 기기는 빼고(`X-Sprout-Device`).
- 앱: 떠 있는 알림 중 `data.taskId`가 목록에 있는 것을 지우고(`dismissNotificationAsync`), 다시 계산.

### 4.6 Doze·배터리
- 할 일 알림 = FCM `android.priority: "high"`, `ttl: "3600s"` → Doze 중에도 바로 깨운다. 조용한 동기화 = `normal`(Doze면 유지 창까지 늦어도 괜찮다).
- 앱을 **강제 종료**한 상태(설정 › 강제 중지, 일부 제조사는 최근 앱 밀어 닫기도 이렇게 처리)에서는 Android가 FCM을 전하지 않는다 → 로컬 예약이 남아 있어 그때도 대부분 울린다(하이브리드의 이유).
- 설정 › 소리와 알림 맨 아래 `알림이 늦게 오거나 안 와요` → 배터리 최적화 예외 화면 열기(`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`는 Play 정책상 할 일 앱은 허용 범주이나, **v1은 설정 화면만 연다** — 권한 추가 없음) [틱틱 FAQ, research 30 §4].
- 정확한 알람 권한(`SCHEDULE_EXACT_ALARM`)은 로컬 예약용으로 지금처럼 확인(20 §4.4).

## 5. 아침 하루 요약 [틱틱 Daily Notification]
- 설정(사용자 단위, 데스크톱·휴대폰이 같은 값): `user_prefs.notify_json`(새 칸, §10) 안 `daily: { on, time:"08:00", skipWeekends }`. **기본 꺼짐**, 시각 기본 08:00 [임시 — research 30 §1 미확인].
- 보내는 시각: 각 Android 기기의 `timezone`으로 `time`이 된 순간(스케줄러 같은 tick). 하루 한 번: `push_sent` key `daily:<그 기기 날짜>`. 주말 건너뛰기면 토·일 안 보냄. 따라잡기는 2시간까지(09:30에 서버가 켜지면 08:00 요약을 보냄, 10:01이면 안 보냄) [임시].
- 내용(채널 `daily` "하루 요약", 기본 중요도):
  | 경우 | 제목 | 본문 |
  |---|---|---|
  | 오늘 할 일 있음 | `오늘 할 일 5개` | `보고서 제출 · 운동 · 장보기 외 2개` (+ 만료가 있으면 줄 끝 ` · 밀린 할 일 3개`) |
  | 이미 몇 개 끝냄 | `오늘 할 일 5개 중 1개 완료` | 위와 같음(남은 것만 나열) |
  | 오늘 0개 · 밀린 것만 | `밀린 할 일 3개가 있어요` | `오늘 정리해 볼까요?` |
  | 둘 다 0개 | 보내지 않음 [임시] | |
  | 제목 숨기기 켬 | `오늘 할 일 5개` | `눌러서 오늘 목록 보기` (+ 밀린 수) |
- "오늘"·"만료"는 스마트 목록 오늘과 같은 규칙(기기 날짜 기준, `due_at`/기간이 오늘에 걸침, 미완료·휴지통 아님). 순서 = 시각 있는 것 시각순 → 우선순위 → 나머지(02 정렬 [임시]).
- 누르면 `sprout://today`. 버튼 없음.

## 6. 다른 기기 변경 즉시 반영 (조용한 동기화 푸시) [sprout]
- 왜: PowerSync는 앱이 켜져 있을 때만 흐른다. 휴대폰이 백그라운드면 데스크톱의 변경이 다음 실행까지 안 내려와 로컬 알림 예약·(나중) 위젯이 낡는다.
- 보내는 때: `/sync/upload` 커밋 뒤, 올린 사용자의 **다른** 기기들(헤더 `X-Sprout-Device`로 올린 기기를 뺌. 데스크톱은 기기 등록이 없으니 헤더 없음 = 모든 휴대폰).
- **모으기**: 기기마다 30초에 최대 1번(`PUSH_SYNC_MIN_SEC`) [임시]. 30초 안에 또 오면 끝에 한 번만(마지막 변경 뒤 꼬리 전송). FCM `collapse_key: "sync"` → 휴대폰이 꺼져 있다 켜져도 하나만 받는다. 메모리 표(api는 한 대) — 서버를 다시 켜면 잃어도 괜찮다.
- 대상 테이블: `tasks` `reminders` `lists` `check_items`(위젯 대비) + 성장 판정용 `xp_events` `kpis` `weekly_reports`. 그 밖(일기·수집함·위키 등)은 보내지 않는다.
- 페이로드: `{type:"sync", dismiss?:[…]}` 뿐(내용 없음). `priority: normal`, `ttl: 600s`.
- 앱: 백그라운드 작업(지금 `background.ts`와 같은 일) — `startAuth()` → `syncNow()`(최대 8초) → `rescheduleNow()` → 로컬 예약 보고(§4.3). 화면에 아무것도 안 띄운다. 앱이 앞에 있으면 무시(PowerSync가 이미 받음).

## 7. 설정 › 소리와 알림 (모바일) [틱틱 `Sounds & Notifications` + sprout 칸]
### 7.1 레이아웃 (설정 하위 화면, 24 §11 칸 묶음 모양)
```
‹ 설정          소리와 알림
┌ 알림 권한 ───────────── 켜짐 ┐   ← 지금 NotificationCell 동작(꺼짐 → 설정 열기)
└──────────────────────────────┘
┌ 할 일 알림 ─────────────── ● ┐   켬: 로컬 예약 + 서버 알림
│ 알림에 제목 숨기기 ──────── ○ │   설명: "잠금 화면·서버 전송에 할 일 제목을 넣지 않아요"
└──────────────────────────────┘
┌ 하루 요약 ──────────────── ○ ┐   [틱틱]
│ 받을 시각 ───────── 오전 8:00 │   휠 시트(22 시간 휠 재사용)
│ 주말 건너뛰기 ───────────── ○ │
└──────────────────────────────┘
  성장 소식
┌ 캐릭터 진화 ────────────── ● ┐
│ 주간 리포트 도착 ────────── ● │
│ 이번 주 목표 마감 알림 ──── ● │   설명: "일요일 저녁 8시, 남은 목표가 있을 때"
│ 기본함 정리 제안 ────────── ○ │   (모바일이 기본함 정리를 열 수 있을 때만 보임 — caps)
└──────────────────────────────┘
┌ 시험 알림 보내기 ─────────── › ┐
│ 알림이 늦게 오거나 안 와요 ── › │ (Android만)
└──────────────────────────────┘
  서버 알림 연결됨 · 3분 전 확인     ← 작은 회색 상태 줄
```
- 설정 첫 화면의 `소리와 알림` 칸은 그대로(값 `켜짐`/`알림이 꺼져 있어요 · 설정 열기`), 누르면 이제 이 화면으로 간다(권한이 아직 안 물었으면 먼저 묻는다 — 지금 동작 유지).
- 칸 높이·글자·스위치는 기존 `ui/Cells` 그대로. 테마 13종·라이트·다크.

### 7.2 상태
| 상태 | 보임 |
|---|---|
| OS 권한 꺼짐 | 맨 위 줄 빨간 글자 `알림이 꺼져 있어요 · 설정 열기`, 아래 스위치들은 흐리게(바꿀 수는 있음 — 값은 저장, 권한이 켜지면 적용) |
| 서버에 FCM 설정 없음(`push.enabled=false`) | 상태 줄 `서버 알림 준비 중 · 할 일 알림은 이 휴대폰에서 울려요`, 하루 요약·성장 소식 칸 흐림 + 탭하면 같은 안내 토스트 |
| 등록 실패·오프라인 | 상태 줄 `서버에 연결되면 알림을 등록해요` |
| iOS(푸시 꺼진 동안) | 할 일 알림·제목 숨기기만 보임(로컬). 하루 요약·성장 소식은 숨김 |
| 시험 알림 | 누르면 토스트 `시험 알림을 보냈어요` → 몇 초 안에 알림 `sprout 알림이 잘 와요` / 본문 `이 휴대폰에서 서버 알림을 받을 수 있어요`. 429면 `잠시 뒤에 다시 해 주세요` |

### 7.3 권한 묻기 (Android 13+ `POST_NOTIFICATIONS`) [틱틱 흐름 + 20 §4.4]
- 앱 첫 실행에 묻지 않는다(지금 그대로). 묻는 때: ① 알림 있는 할 일을 처음 저장할 때(지금) ② 하루 요약·성장 소식 스위치를 처음 켤 때 ③ 이 화면의 권한 줄을 누를 때.
- 안내 문구(지금 것 유지): `알림을 켤까요?` / `정한 시간에 할 일을 알려 드려요. 알림에서 바로 완료하거나 다시 알림을 고를 수 있어요.` [나중에] [알림 켜기] → OS 창. 거부 상태면 `설정 열기` 한 번.
- 권한이 생기면 바로 `PUT /push/devices/:id`(`push_reminders=true`).

## 8. 성장·AI 소식 [sprout] — 종류와 문구
원칙: **AI가 쓴 글은 페이로드에 넣지 않는다**(숫자·정해진 문구·캐릭터 이름만). 올린 기기(그 화면에서 이미 연출을 본 기기)에는 보내지 않는다. 채널 `growth` "성장 소식"(기본 중요도). `{이름}`은 캐릭터 이름, 조사(이/가·은/는)는 받침으로 고른다(`josa()` 공용 함수).

| 종류(kind) | 언제 | 제목 | 본문 | 누르면 | 기본 |
|---|---|---|---|---|---|
| `growth_evolve` 캐릭터 진화 | 업로드 뒤 `xp_events` 합으로 계산한 단계(`stageOf(levelFromXp)`, 공용 growth.ts)가 `push_state.last_stage`보다 올라감 | `{이름}가 {단계}로 자랐어요!` | `할 일을 끝낸 덕분이에요. 새 모습을 보러 갈까요?` | `sprout://growth` | 켬 |
| `weekly_report` 주간 리포트 도착 | `weekly_reports` 행의 `text_json.report`가 새로 채워짐(데스크톱이 주간 마감, 10 §5) | `지난주 리포트가 도착했어요` | `할 일 12개 완료 · 목표 3개 중 2개 달성`(`stats_json` 숫자). 초안도 같이 생겼으면 끝에 ` · 이번 주 목표 초안 3개` | `sprout://growth?report=<week_start>` | 켬 |
| `weekly_draft` 목표 초안만 | `text_json.draft`만 새로 생김(리포트 없이) | `이번 주 목표 초안이 준비됐어요` | `{이름}가 목표 3개를 제안했어요. 골라서 정해 볼까요?` | `sprout://growth` | 켬(`weekly_report`와 같은 스위치) |
| `weekly_goal_due` 목표 마감 | 기기 시각 **일요일 20:00**, 이번 주 `kpis` 중 진행 < 목표인 것이 있음. 주 1번 | `이번 주 목표가 2개 남았어요` | `오늘 자정에 마감돼요. 하나만 더 해 볼까요?` | `sprout://growth` | 켬 |
| `inbox_cleanup` 기본함 정리 제안 | 기본함 미완료 > 20개, 마지막 보낸 지 7일 이상(30 B.1 ①과 같은 기준), 기기 `caps`에 `inbox-cleanup` | `기본함에 할 일이 24개 쌓였어요` | `AI가 리스트로 나눠 드릴게요. 눌러서 정리를 시작해요.` | `sprout://lists/inbox?cleanup=1` | 꺼짐(모바일 기본함 정리 화면이 생기면 켬) |
- **넣지 않은 것과 이유**: 레벨업(진화가 아닌 것) — 할 일마다 거의 매번이라 소음, 앱 안 연출로 충분 · 새 할 일 자동 이동(30 B.1 ②) — 앱 안 토스트 · 수집함 분류 끝남(11) — 데스크톱이 켜져 있을 때 몇 초 안에 끝나 알릴 틈이 없음 · 일기 쓰기 권유 — 사용자 결정 없이 넣지 않음 [다음 후보] · AI 비서 답 — 화면 안.
- 주의: 주간 리포트·초안은 **데스크톱이 주간 마감을 돌려야** 생긴다(10 §5). 데스크톱을 안 켜는 주에는 오지 않는다 — 서버 주간 마감은 [다음].

## 9. 데이터
### 9.1 서버 전용 새 테이블 (마이그레이션 `server/db/migrations/20261007-push.sql` + `db/init/05-push.sql`) [승인]
```sql
CREATE TABLE IF NOT EXISTS device_tokens (   -- §3.1 칸 그대로
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'fcm', token text NOT NULL UNIQUE, platform text NOT NULL,
  app_version text, caps text[] NOT NULL DEFAULT '{}', timezone text NOT NULL, locale text,
  local_keys text[] NOT NULL DEFAULT '{}', local_keys_at timestamptz, push_reminders boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(), last_ok_at timestamptz, fail_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON device_tokens (user_id);
CREATE TABLE IF NOT EXISTS push_sent (        -- 중복 막기·지우기 대상 찾기, 7일 보관
  device_id uuid NOT NULL REFERENCES device_tokens(id) ON DELETE CASCADE,
  key text NOT NULL, kind text NOT NULL, task_id text, sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, key));
CREATE INDEX IF NOT EXISTS push_sent_task_idx ON push_sent (task_id, sent_at);
CREATE TABLE IF NOT EXISTS push_state (       -- 사용자별 마지막 진화 단계·기본함 제안 시각
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_stage integer, last_report_week text, last_draft_week text, last_inbox_nudge_at timestamptz);
CREATE TABLE IF NOT EXISTS push_cursor (id integer PRIMARY KEY DEFAULT 1, at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS tasks_open_due_idx ON tasks (due_at) WHERE status = 0 AND deleted_at IS NULL;
```
- 원문(할 일 제목 등)은 이 테이블들에 **저장하지 않는다**. 로그도 "사용자 1명·기기 2대에 1건"처럼 숫자만.

### 9.2 동기화 테이블 한 칸 추가 — `user_prefs.notify_json` (text) [승인]
- `{ "reminders": true, "hideTitles": false, "daily": {"on": false, "time": "08:00", "skipWeekends": false}, "growth": {"evolve": true, "report": true, "goalDue": true, "inboxCleanup": false} }` — 없으면 이 기본값.
- 사용자 단위라 데스크톱 설정에서도 바꾼다: 데스크톱 설정에 **`알림` 탭**(DesktopSettings의 탭 줄, `일반` 앞)을 더하고 위 칸들을 `휴대폰으로 받는 알림` 머리 아래 같은 순서로 둔다(시험 알림·배터리 줄 없음). 데스크톱 자기 OS 알림은 지금처럼 늘 켜짐(03 §7) — 이 탭에 `이 컴퓨터의 할 일 알림` 스위치를 둘지는 [다음]. → 구현 §16.
- 바꾸는 곳: `packages/schema` TABLES → `npm run server:schema`(gen-sql·sync-config 다시 생성) → `ALTER TABLE user_prefs ADD COLUMN IF NOT EXISTS notify_json text`. **서버를 먼저 배포**하고 앱을 낸다(모르는 칸 = 409, upload.ts 규칙).
- 기기별 값(이 휴대폰의 권한·`push_reminders`)은 `device_tokens`에만.

### 9.3 읽는 테이블 (서버)
`tasks` `reminders` `lists`(본문 리스트 이름·기본함 수) `xp_events`(진화) `characters`(이름·종) `kpis`(목표 마감) `weekly_reports`(리포트 도착) `user_prefs`(설정).

### 9.4 FCM 메시지 모양 (data만, 값은 모두 문자열)
| type | 필드 | android |
|---|---|---|
| `reminder` | `key`(`r:<rid>@<ms>`) · `taskId` · `at` · `title`?(숨기기면 없음) · `body` · `url` | high · ttl 3600s |
| `daily` / `growth` | `kind` · `title` · `body` · `url` · `key` | high · ttl 3h(daily)/24h(growth) |
| `sync` | `dismiss`?(JSON 배열) | normal · ttl 600s · collapse_key `sync` |
| `test` | `title` · `body` | high · ttl 60s |
- 크기 4KB 이하: 제목은 100자에서 자른다.

## 10. 인프라 변경 — **사용자 승인 필요** [승인]
| # | 무엇 | 내용 | 비용·주의 |
|---|---|---|---|
| I1 | **Firebase 프로젝트** | 이미 있는 GCP 프로젝트 `sprout-510614`에 Firebase를 붙인다(콘솔 "기존 Google Cloud 프로젝트에 Firebase 추가"). Android 앱 `app.sprout.mobile` 등록(FCM에는 SHA-1 불필요). "Firebase Cloud Messaging API (V1)" 사용 설정 | 무료(Spark 요금제 그대로, FCM은 메시지 수 과금 없음). 구글 로그인 OAuth 설정과 같은 프로젝트라 관리가 한곳 |
| I2 | **서비스 계정 키** | 서비스 계정 `sprout-push@sprout-510614.iam.gserviceaccount.com`, 역할 **Firebase Cloud Messaging API Admin**만(`roles/firebasecloudmessaging.admin`). JSON 키 1개 | 키 파일 = 비밀. Mac mini `~/.config/sprout/fcm-service-account.json`(권한 600, iCloud·git 밖) → compose가 읽기 전용으로 `/run/secrets/fcm.json`에 붙인다(apple.p8과 같은 방식). Railway처럼 파일을 못 붙이는 곳은 환경 변수 `FCM_SERVICE_ACCOUNT_B64`(base64)도 받는다(`FCM_SERVICE_ACCOUNT_JSON`도 같은 뜻으로 받음) |
| I3 | **google-services.json** | Firebase에서 받은 Android 설정 파일 → `apps/mobile/google-services.json` | 엄밀한 비밀은 아니다(앱 안에 들어가고 API 키는 앱 패키지로 제한됨). 그래도 **git에 넣지 않는다**(`apps/mobile/.gitignore`에 추가) — 공개 저장소가 될 수 있고, 키 제한을 확인하기 전까지 퍼지지 않게. 원본은 `~/.config/sprout/google-services.json`, 빌드 전에 복사(또는 EAS 파일 비밀) |
| I4 | **DB 마이그레이션** | §9.1 새 테이블 4개 + 부분 색인 1개(서버 전용), §9.2 `user_prefs.notify_json` 한 칸(동기화) | 적용 전 `pg_dump` 백업(README 절차 그대로). 다시 돌려도 안전(`IF NOT EXISTS`) |
| I5 | **docker-compose** | `api.environment`: `FCM_PROJECT_ID`(=`sprout-510614`), `FCM_SERVICE_ACCOUNT: ${FCM_SERVICE_ACCOUNT:+/run/secrets/fcm.json}`, `FCM_SERVICE_ACCOUNT_B64`, `PUSH_TICK_MS`(30000), `PUSH_SYNC_MIN_SEC`(30), `PUSH_IOS`(0) · `volumes`: `${FCM_SERVICE_ACCOUNT:-/dev/null}:/run/secrets/fcm.json:ro`. **새 컨테이너 없음**(스케줄러는 api 안) | `FCM_PROJECT_ID`가 비면 푸시 전체가 꺼지고 앱은 로컬 알림만 — 지금과 같은 상태로 안전하게 되돌아간다 |
| I6 | **API 의존성** | 새 패키지 없음 — OAuth 토큰은 이미 쓰는 `jose`로 서비스 계정 JWT(RS256, scope `https://www.googleapis.com/auth/firebase.messaging`)를 만들어 `oauth2.googleapis.com/token`과 바꾼다(55분 캐시). `firebase-admin`은 쓰지 않는다(무겁고 필요 없음) | Mac mini에서 `fcm.googleapis.com`·`oauth2.googleapis.com`으로 나가는 HTTPS만 필요(들어오는 포트 없음) |
| I7 | **모바일 네이티브 설정** | `app.json` `android.googleServicesFile`, 채널 `daily`·`growth` 추가. 새 네이티브 모듈은 N3 결과에 따라(기본안: 없음) → 개발용 빌드 다시 만들기 | — |
| I8 | **운영** | 할 일 알림이 **Mac mini가 켜져 있어야** 서버에서 나간다 → 잠자기 끔(`pmset`)·정전 뒤 자동 켜기 확인. 꺼져 있어도 로컬 예약이 있어 휴대폰이 아는 알림은 울린다 | 개인정보 처리방침에 "Google FCM으로 알림 전송(제목 포함, 숨기기 가능)" 한 줄(출시 준비 A 목록과 함께) |

## 11. iOS 준비 (지금은 꺼 둠)
- 지금: iOS 앱은 등록하지 않는다(`PUSH_IOS=0`이면 서버가 `platform=ios` 등록을 받아만 두고 보내지 않음). iOS는 로컬 알림 그대로 — 설정 화면은 §7.2 iOS 줄.
- 켜려면 필요한 것(사용자: Apple 개발자 계정 뒤):
  1. Apple Developer › Keys에서 **APNs 키(.p8)** 만들기(Sign in with Apple 키에 APNs를 같이 켜도 됨) → **Firebase 콘솔 › 프로젝트 설정 › Cloud Messaging › Apple 앱 구성에 업로드**(키 ID·팀 ID `BU697KN34B`). 서버에는 아무것도 안 넣는다(FCM이 APNs로 넘김).
  2. Firebase에 iOS 앱 `app.sprout.mobile` 등록 → `GoogleService-Info.plist`(google-services.json과 같은 취급, git 밖) → `ios.googleServicesFile`.
  3. 앱 능력: Push Notifications, Background Modes › Remote notifications(`expo-notifications` 플러그인이 `aps-environment` 권한을 넣음). 공유 확장 App Group은 그대로.
  4. **FCM 토큰 얻기**: iOS에서 `getDevicePushTokenAsync()`는 FCM이 아니라 **APNs 토큰**을 준다 → FCM으로 보내려면 `@react-native-firebase/messaging`(FCM 토큰) 또는 서버가 APNs로 직접(같은 .p8, `provider='apns'`). §12 N3에서 정한다.
  5. iOS는 데이터 메시지만으로는 앱이 꺼져 있으면 알림을 못 그린다 → iOS 할 일 알림은 `apns.payload.aps.alert` + `category: "sprout-task"` + `mutable-content`로 **보이는 알림**을 보내고, 중복 막기는 §4.3의 2번(로컬 목록 보고)에만 기댄다. 조용한 동기화는 `content-available: 1`(iOS가 횟수를 줄일 수 있음).
- 스위치: 서버 `PUSH_IOS=1` + 앱 `extra.pushIos: true`(원격 설정 없이 빌드 값) — 둘 다 켜져야 iOS가 등록·수신한다.

## 12. 결정 (5개 — 2026-10-05 모두 추천안으로 확정)
| # | 질문 | 결정 | 이유 |
|---|---|---|---|
| N1 | Android에서 할 일 알림을 누가 울리나? ⓐ 하이브리드(로컬 예약 유지 + 서버는 휴대폰이 모르는 것만, 같은 id) ⓑ 서버만(푸시가 켜지면 로컬 예약 끔) | **ⓐ 하이브리드** ✅ | 오프라인·Mac mini 꺼짐·앱 강제 종료에도 울린다(KR2). ⓑ는 단순하지만 휴대폰에서 오프라인으로 만든 할 일·서버 다운 때 안 울림 |
| N2 | 서버 페이로드에 할 일 제목을 넣나? | **넣는다 + `알림에 제목 숨기기`(기본 꺼짐)** ✅ | 휴대폰이 아직 그 할 일을 내려받지 못해도 제목이 보여야 쓸모가 있다. 제목은 Google(FCM)을 지나간다 — 설정 설명과 처리방침에 적고, 원하면 숨긴다. AI 글은 어떤 경우에도 넣지 않는다 |
| N3 | 휴대폰 쪽 FCM 라이브러리 | **먼저 `expo-notifications`만** ✅(이미 설치, `getDevicePushTokenAsync` + 백그라운드 알림 작업). 0단계 실험에서 앱이 꺼진 상태의 데이터 메시지 처리가 안 되면 `@react-native-firebase/messaging`(`setBackgroundMessageHandler`)으로 | 새 네이티브 모듈 없이 갈 수 있으면 빌드·iOS 위험이 작다. RN Firebase는 iOS에서 정적 프레임워크 설정이 필요해 다른 모듈과 부딪칠 수 있다. iOS 토큰 문제(§11-4)는 iOS를 켤 때 다시 정한다 |
| N4 | 하루 요약 기본값 | **꺼짐 · 08:00 · 0개인 날 안 보냄** ✅ | 틱틱도 켜야 받는 기능 [research 30]. 첫 할 일 알림 권한을 받은 뒤 설정 화면에서만 켠다 |
| N5 | 성장 소식 기본 묶음 | **진화·주간 리포트(초안 포함)·일요일 목표 마감 = 켬, 기본함 정리 = 꺼짐(모바일 정리 화면 생기면 켬), 레벨업은 안 보냄** ✅ | 주 2~3건 이하로 성장 루프를 끌어오되 소음은 피한다. 기본함 정리는 지금 휴대폰에서 열 화면이 없다 |

## 13. 구현 순서 (단계)
| 단계 | 내용 | 확인 |
|---|---|---|
| 0. 실험 (반나절~1일) | 개발용 Firebase 설정(I1~I3 승인 뒤) → Android 실기기/에뮬레이터에서 토큰 받기 → curl로 데이터 메시지 → **앱이 백그라운드·완전히 닫힘·Doze**(`adb shell dumpsys deviceidle force-idle`)에서 버튼 달린 알림이 뜨는지, 완료 버튼이 앱을 안 열고 기록되는지 | N3 확정. 안 되면 RN Firebase로 바꿔 다시 |
| 1. 서버 바탕 | 마이그레이션(I4) · `push.ts`(경로 4개·FCM 보내기·OAuth·실패 처리·토큰 삭제) · `/auth/logout` device_id · compose(I5) · 시험(`push.test.ts`: 등록·소유권·계정 삭제 CASCADE·FCM 오류 처리 가짜) | `POST /push/test`로 휴대폰에 알림 |
| 2. 모바일 등록·받기 | 기기 id · 토큰 등록/갱신/해제(로그아웃 순서) · 받기 처리기(`reminder`/`daily`/`growth`/`sync`/`test`) · 채널 3개 · 설정 › 소리와 알림 화면(§7) · `notify_json` | 설정 화면 상태 4가지 |
| 3. 할 일 알림 | `reminderFireTimeIn`·`bodyOf` 공용으로 옮기기(시험) · 스케줄러(advisory lock·cursor·1시간 따라잡기) · 로컬 목록 보고 · 받을 때 중복 확인 · 지우기(§4.5) | 아래 완료 기준 1~6 |
| 4. 조용한 동기화 | `X-Sprout-Device` 헤더(데스크톱은 없음) · `pushEffects` · 30초 모으기 | 완료 기준 7 |
| 5. 하루 요약 | 시간대별 tick · 내용 계산 · 주말 건너뛰기 | 완료 기준 8 |
| 6. 성장 소식 | 진화·리포트·초안·목표 마감 · `josa()` · `caps` 확인 | 완료 기준 9 |
| 7. 데스크톱 설정 `알림` 탭 | `notify_json` 편집(§9.2) | 데스크톱에서 바꾸면 휴대폰 설정에 보임 |
| 8. iOS (계정 생긴 뒤) | §11 1~5, N3 다시 | iPhone에서 1~9 |

## 14. 완료 기준
- [ ] 1. 휴대폰 앱을 **설치 후 한 번도 다시 안 연 상태**(백그라운드·닫힘)에서 데스크톱으로 "10분 뒤" 알림 할 일을 만들면 휴대폰에 제때(±1분) 알림이 뜨고, 버튼 **완료 · 10분 뒤 · 1시간 뒤 · 내일**이 잠금 화면에서 바로 보인다(틱틱 Android와 나란히 — research 20 §4).
- [ ] 2. 휴대폰이 이미 아는 할 일(로컬 예약 있음)은 **한 번만** 울린다 — 같은 할 일 20개로 확인, 겹침 0.
- [ ] 3. 서버 알림의 완료 버튼 → 앱을 열지 않고 완료 + XP(하루 상한 그대로), 데스크톱에 동기화된다. 비행기 모드에서 눌러도 다시 연결되면 올라간다.
- [ ] 4. 데스크톱에서 완료·삭제·시각 변경 → 휴대폰에 떠 있던 알림이 몇 초 안에 사라진다(서버 알림·로컬 알림 둘 다).
- [ ] 5. api를 20분 끈 사이 지나간 알림은 다시 켜면 나가고, 2시간 끈 사이 1시간보다 오래된 것은 안 나간다.
- [ ] 6. Doze(`force-idle`)에서도 할 일 알림이 1분 안에 온다. Mac mini가 꺼져 있어도 휴대폰이 아는 알림은 로컬로 울린다.
- [ ] 7. 데스크톱에서 할 일 10개를 연달아 바꾸면 휴대폰에 조용한 푸시가 30초에 1번 이하로 가고, 앱을 열지 않아도 로컬 예약이 새 값으로 바뀐다(`scheduledSummary`).
- [ ] 8. 하루 요약을 08:00으로 켜면 그 기기 시각 08:00에 `오늘 할 일 N개` 한 번, 주말 건너뛰기면 토·일 없음, 제목 숨기기면 제목이 페이로드에 없다(서버 로그·FCM 요청 본문 확인).
- [ ] 9. 성장: 데스크톱에서 진화하면 휴대폰에 `○○가 꼬마로 자랐어요!`, 데스크톱 주간 마감 뒤 `지난주 리포트가 도착했어요` + 숫자 본문, 일요일 20:00 남은 목표 알림. 각 스위치를 끄면 오지 않는다. 페이로드에 AI 글이 없다.
- [ ] 10. 로그아웃하면 그 기기 행이 지워져 더 이상 안 오고, 계정 삭제하면 모든 기기 행이 지워진다. 같은 휴대폰에서 다른 계정으로 로그인하면 이전 계정 알림이 오지 않는다.
- [ ] 11. `FCM_PROJECT_ID`를 비우면 서버는 아무것도 안 보내고, 앱은 로컬 알림만으로 지금과 똑같이 동작한다(되돌리기 확인).
- [ ] 12. 설정 › 소리와 알림이 틱틱 `Sounds & Notifications`와 같은 자리·같은 칸 모양(라이트·다크·13 테마), 권한 꺼짐·서버 준비 중·오프라인 상태 문구가 맞다.
- [ ] 13. 서버 로그·DB에 할 일 제목이 남지 않는다(`push_sent`는 key·kind·task_id만).

## 15. 구현 메모 — 서버 (2026-10-05, 1·3·4·5·6단계 서버 쪽)
| 곳 | 내용 |
|---|---|
| `packages/schema/src/time.ts` | `reminderFireTimeIn(task, trigger, timeZone)` · `floatingToMs` · `msToFloating` · `dayKeyIn` · `zonedParts` · `isTimeZone`(Intl만). JS Date와 같은 규칙(없는 시각 = 바뀌기 전 오프셋, 두 번 있는 시각 = 앞의 것) → 서울·뉴욕·런던·로드하우(30분 서머타임)에서 `reminderFireTime`과 720건 같음(`notify.test.ts`) |
| `packages/schema/src/notify.ts` (`@sprout/schema/notify`) | `parseNotifyPrefs`·`DEFAULT_NOTIFY`(§9.2) · `reminderKey` · `CHANNELS`·`TASK_CATEGORY`·`PUSH_CAPS` · `josa()` · `reminderBody(row, fireAt, tz, withList)`(plan.ts `bodyOf`의 시간대 버전) · `dailySummary` · `growthCopy`·`TEST_NOTICE` — 휴대폰·데스크톱 설정도 이것을 쓴다 |
| `packages/schema` TABLES | `user_prefs.notify_json` 추가 → `npm run server:schema`(02-schema.sql) |
| `server/db` | `migrations/20261007-push.sql`(ALTER + 테이블 4개 + 부분 색인), `init/05-push.sql`(새 DB) |
| `server/api/src/fcm.ts` | 서비스 계정 JWT(jose RS256) → OAuth 토큰(55분 캐시) → `messages:send`. `UNREGISTERED`·`SENDER_ID_MISMATCH`·토큰 형식 오류 = 기기 행 삭제, 429·5xx 3번(10초 이하), 401은 토큰 새로 받기 |
| `server/api/src/push.ts` · `push-plan.ts` · `push-store.ts` | 경로 4개(§3.2) · 스케줄러(§4.2·§5·§8 목표 마감) · `afterUpload`(§4.5·§6·§8) · 순수 계산 · Postgres/메모리 저장소 |
| `server.ts` | `push.handle` 연결, `/sync/upload` 커밋 뒤 `afterUpload`(기다리지 않음, `X-Sprout-Device`), `/auth/logout {device_id}`, 시작 때 스케줄러 |
| `account.ts` | 계정 삭제 트랜잭션에서 `device_tokens`도 명시적으로 지움(+ CASCADE) |

명세와 다르게/더 정한 것:
- FCM 메시지 `data`에 앱이 그리기 편하게 **`channel`**(`tasks`·`daily`·`growth`)을 넣는다. `reminder`는 `category: "sprout-task"`도. `daily`·`growth`는 `type`=`daily`/`growth` + `kind`. 시험 알림은 `{type:"test", kind:"test", key, title, body, channel:"tasks"}`.
- iOS(`PUSH_IOS=1`)는 `apns` 블록(보이는 알림 + `category`, 동기화는 `content-available`)까지 서버에 준비해 두었다.
- 하루 요약에서 오늘 할 일이 모두 끝났으면 본문 `오늘 할 일을 모두 끝냈어요` [임시]. 목록 이름은 40자에서 자른다. "오늘"은 보관·스마트 목록 숨김 리스트를 뺀다(views.ts와 같음).
- 목표 마감의 "남은 목표" = 그 주(`월요일 시작`) `kpis.status`가 `active`(또는 비어 있음)인 것.
- 진화: 처음 보는 사용자는 기준 단계만 저장하고 보내지 않는다(배포 직후 몰려 가지 않게). 캐릭터 이름이 없으면 종 이름(`꾸준한 거북이`), 캐릭터가 없으면 `캐릭터`.
- 주간 리포트·초안 중복 막기 = `push_state.last_report_week`·`last_draft_week`(주 단위라 push_sent 7일 보관보다 길게).
- 지운 알림(`reminders` DELETE·트리거 변경)은 할 일 id를 `push_sent`에서 찾아 지우기 목록에 넣는다(서버가 보낸 적 없는 알림은 휴대폰이 다시 계산할 때 정리).
- 같은 할 일·같은 순간 알림이 여럿이면 가장 작은 reminder id 하나로 보내고, 기기의 `local_keys`에 그중 어느 id라도 있으면 보내지 않는다(휴대폰 plan.ts는 행 순서로 하나를 고르므로).
- `FCM_PROJECT_ID`가 있는데 키가 없거나 깨졌으면 api는 그대로 뜨고 푸시만 꺼진다(로그 `[push] FCM 설정 오류`).

휴대폰 쪽이 할 일(2단계): 기기 id(`sprout.deviceId`, uuid v4) · `PUT /push/devices/:id`(caps: 지금 열 수 있는 것만) · 업로드에 헤더 `X-Sprout-Device` · 로컬 예약 바뀔 때 `PUT …/local` · 로그아웃 때 DELETE → `/auth/logout {refresh_token, device_id}` · 받기 처리기(`reminder`/`daily`/`growth`/`sync`/`test`) · 채널 `daily`·`growth` 추가 · plan.ts `bodyOf`를 `reminderBody`로 바꾸기(같은 문구).

## 16. 구현 메모 — 데스크톱 설정 `알림` 탭 (2026-10-05, 7단계)
| 곳 | 내용 |
|---|---|
| `apps/desktop/src/renderer/src/data/notifyPrefs.ts` | `useNotifyPrefs()`(user_prefs.notify_json → 공용 `parseNotifyPrefs`) · `saveNotifyPrefs(patch)`(DB에서 지금 값을 다시 읽어 안쪽까지 합친 뒤 **모든 칸을 담은 JSON**을 일반 동기화 쓰기 `update`/`insert`로 — `/sync/upload`로 올라가 휴대폰·서버가 받는다) · `mergeNotify` · `dailyTimeOptions` |
| `apps/desktop/src/renderer/src/components/NotifySettings.tsx` | 탭 내용. DesktopSettings 탭 줄 `연동` 뒤·`일반` 앞에 `알림`(종 아이콘) |
| `apps/desktop/tests/notify.test.ts` | 합치기·깨진 값 기본값·행 없음 insert/있음 update(다른 칸 보존)·시각 목록 |

레이아웃(위에서 아래, 기존 `settings-card`·`settings-row`·`dp__switch` 그대로):
```
알림
휴대폰으로 받는 알림
┌ 할 일 알림 ─────────────── ● ┐ 설명 "정한 시간에 휴대폰으로 할 일을 알려 드려요"
│ 알림에 제목 숨기기 ──────── ○ │ 설명 "잠금 화면·서버 전송에 할 일 제목을 넣지 않아요"
└──────────────────────────────┘
┌ 하루 요약 ──────────────── ○ ┐ 설명 "정한 시각에 오늘 할 일을 한 번에 알려 드려요"
│ 받을 시각 ───────── 오전 8:00 │ 드롭다운 30분 간격(휴대폰에서 고른 08:15 같은 값은 목록에 끼워 보인다)
│ 주말 건너뛰기 ───────────── ○ │ 하루 요약이 꺼져 있으면 두 줄 흐림·잠금
└──────────────────────────────┘
성장 소식
┌ 캐릭터 진화 ────────────── ● ┐
│ 주간 리포트 도착 ────────── ● │
│ 이번 주 목표 마감 알림 ──── ● │ 설명 "일요일 저녁 8시, 남은 목표가 있을 때"
└──────────────────────────────┘
휴대폰 앱에 로그인한 기기로 보내요. 이 컴퓨터의 할 일 알림은 앱이 켜져 있을 때 늘 울려요(시스템 설정 › 알림에서 끌 수 있어요).
```
명세와 다르게/더 정한 것:
- `기본함 정리 제안` 줄은 데스크톱에서 **숨긴다** — 휴대폰 `caps`에 `inbox-cleanup`이 생길 때만 휴대폰에 보이는 줄이고(§7.1), 데스크톱은 휴대폰의 caps를 모른다. 값은 저장할 때 그대로 보존된다.
- 서버 FCM 상태(`push.enabled`)는 데스크톱이 기기 등록을 안 하므로 묻지 않는다 — 상태 줄 없이 맨 아래 안내 한 줄만.
- `이 컴퓨터의 할 일 알림` 스위치는 계속 [다음] — 안내 문구로 OS 설정을 가리킨다.
- 확인(2026-10-05): 새 계정에서 칸을 바꾸고 로그아웃(로컬 삭제) → 다시 로그인하면 서버에서 같은 `notify_json`이 내려옴.

