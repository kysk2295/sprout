# 21 · 틱틱 공식 Open API — 가져오기에 쓸 수 있는 것 / 없는 것

- 확인일: 2026-10-04. 1차 출처: 틱틱 개발자 문서 원문 `https://developer.ticktick.com/docs/openapi.md` (화면 주소 `developer.ticktick.com/api#/openapi`가 읽는 마크다운). 원문을 옮기지 않고 사실만 정리했다.
- 쓰는 곳: [17 틱틱에서 가져오기](../screens/17-ticktick-import.md).
- 원칙: **공식 Open API(`/open/v1/*`)만 쓴다.** 틱틱 웹앱이 쓰는 비공개 API(`/api/v2/*`, 로그인 쿠키·비밀번호)는 쓰지 않는다.
- 표기: **[문서]** 공식 문서에 적힌 사실 · **[커뮤니티]** 공식 문서에 없고 다른 개발자 보고로만 아는 것 · **[임시]** 실제 계정으로 확인 전 가정

## 1. 인증 [문서]
두 가지가 있다.

| 방식 | 언제 | 방법 |
|---|---|---|
| **개인 API 토큰** | 자기 계정을 혼자 쓸 때·시험 | 틱틱 웹 › 아바타 › 설정 › 계정 › **API Token**에서 만들어 복사 → `Authorization: Bearer <토큰>` |
| **OAuth2 인가 코드** | 다른 틱틱 사용자를 연결할 때(공개 제품) | 아래 3단계 |

OAuth2:
1. 브라우저를 `https://ticktick.com/oauth/authorize?client_id=…&scope=tasks:read&state=…&redirect_uri=…&response_type=code`로 보낸다. 범위(scope)는 `tasks:read`, `tasks:write` 두 개뿐(공백으로 구분).
2. 사용자가 허용하면 `redirect_uri?code=…&state=…`로 돌아온다. `redirect_uri`는 개발자 센터 **Manage Apps**(`https://developer.ticktick.com/manage`)에 등록한 값과 같아야 한다.
3. `POST https://ticktick.com/oauth/token` (`application/x-www-form-urlencoded`), **client_id·client_secret은 HTTP Basic 헤더**로, 본문은 `code`, `grant_type=authorization_code`, `scope`, `redirect_uri`. 응답 JSON의 `access_token`을 쓴다.
- 토큰 폐기: `POST https://api.ticktick.com/oauth/revoke` 본문 `token=…`.
- 문서에 **리프레시 토큰 설명이 없다**. 만료되면(401) 다시 연결한다 [임시].
- API 주소: `https://api.ticktick.com/open/v1/…`. 중국판(滴答清单, dida365)은 다른 주소라 v1 범위 밖 [다음].

## 2. 읽기 엔드포인트 (가져오기에 쓰는 것) [문서]
| 무엇 | 요청 | 비고 |
|---|---|---|
| 사용자 시간대 | `POST /open/v1/preference` → `{ timeZone }` | 할 일에 `timeZone`이 없을 때 기본값 |
| 리스트(프로젝트) 목록 | `GET /open/v1/project` | `offset`/`limit`(기본 200) 페이지. 필드: id, name, color, sortOrder, closed, groupId, viewMode(list/kanban/timeline), permission, **kind("TASK"/"NOTE")**. **받은함(inbox)은 목록에 없다** |
| 리스트 + 미완료 할 일 + 칸반 열 | `GET /open/v1/project/{id}/data` | `ProjectData { project, tasks, columns }`. **tasks는 미완료만** |
| 받은함 데이터 | `GET /open/v1/project/inbox/data` | 문서 다른 곳에 "`inbox`로 받은함을 가리킨다"는 설명(undone 검색)이 있다. `/project/inbox/data` 자체는 [커뮤니티]·[임시] |
| 폴더(프로젝트 그룹) | `GET /open/v1/project/group` | id, name, sortOrder, showAll, viewMode |
| 태그 | `GET /open/v1/tag` | name, label(표시 이름), sortOrder, color, **parent(부모 태그 이름)**, type(1 개인·2 팀) |
| **완료한 할 일** | `POST /open/v1/task/completed` `{ projectIds?, startDate?, endDate? }` | `completedTime` 범위로 거른다. **한 번에 최대 200개** → 200개가 차면 기간을 반으로 나눠 다시 묻는다 |
| 조건 검색 | `POST /open/v1/task/filter` | 최대 200개. status `[0]` 열림·`[2]` 완료 |
| 미완료(기간) | `POST /open/v1/task/undone` | 최대 14일 범위 — 전체 가져오기엔 안 씀 |
| 칸반 열 | `GET /open/v1/project/{id}/column` | ProjectData에 이미 들어 있음 |
| 댓글 | `GET …/task/{taskId}/comments` 류 | 할 일마다 1번씩이라 v1에서 안 씀 [다음] |
| 습관·집중(뽀모도로)·카운트다운 | `/open/v1/habit…`, `/focus…`, `/countdown` | sprout v1에 해당 기능 없음 → 가져오지 않음 [다음] |

### Task 필드 [문서]
`id, projectId, title, content, desc, isAllDay, startDate, dueDate, timeZone, reminders[], repeatFlag, repeatFrom, priority, status, completedTime, sortOrder, items[], tags[], kind, parentId, assigneeUsername, focusSummaries[]`
- 날짜 형식: `"yyyy-MM-dd'T'HH:mm:ssZ"` 예 `2019-11-13T03:00:00+0000` (실제 응답은 `.000+0000`처럼 밀리초가 붙기도 함 — 문서 예시에 둘 다 있음).
- `priority`: 0 없음 · 1 낮음 · 3 중간 · 5 높음.
- `status`: 0 보통 · 2 완료 · **-1 포기(Abandoned = "하지 않음")**.
- `kind`: `"TEXT"`, `"NOTE"`, `"CHECKLIST"`. 체크리스트 할 일의 설명은 `desc`.
- `items`(ChecklistItem): id, title, status(0/1), completedTime, isAllDay, sortOrder, startDate, timeZone — **체크 항목**이다(하위 태스크 아님).
- `parentId`: **하위 태스크**의 부모 할 일 id.
- `reminders`: `"TRIGGER:P0DT9H0M0S"`, `"TRIGGER:PT0S"`, `"TRIGGER:-PT15M"` 같은 iCal 기간 문자열.
- `repeatFlag`: `"RRULE:FREQ=DAILY;INTERVAL=1"`. `repeatFrom`: `"0"` 원래 마감일 기준 · `"1"` 완료일 기준 · `"2"` 달력 기준(기본).
- 문서의 Task 정의에 **만든 시각(createdTime)·고친 시각(modifiedTime)이 없다**. 실제 응답에 오면 쓰고, 없으면 대체값을 쓴다 [임시].
- `columnId`(칸반 열)도 Task 정의에 없다. 오면 섹션으로 옮기고, 없으면 섹션 없이 둔다 [임시].

## 3. 공식 API로 가져올 수 있는 것 / 없는 것
| 데이터 | 가능? | 메모 |
|---|---|---|
| 리스트(이름·색·보관 여부), 폴더, 칸반 열 | ✅ | |
| 미완료 할 일 전부(날짜·시간대·종일·우선순위·반복·알림·태그·체크 항목·하위 태스크) | ✅ | |
| 받은함 할 일 | ✅ [임시] | `inbox` 별칭 |
| **완료한 할 일(기록)** | ✅ | 200개씩, 기간을 나눠 전부 |
| 노트(노트 리스트, `kind: NOTE`) | ✅ | 노트 리스트의 `/data`로. 미완료로 취급됨 |
| 태그(부모 포함) | ✅ | |
| **포기한 할 일(하지 않음, status -1)** | ⚠️ 불확실 | 완료 목록은 `completedTime` 기준이라 포함 여부 불명. 오면 sprout "하지 않음"(2)으로 |
| 휴지통의 할 일 | ❌ | 엔드포인트 없음 |
| 만든 시각·고친 시각 | ⚠️ | 정의에 없음(위) |
| 첨부 파일·이미지 | ❌ | 엔드포인트 없음 |
| 댓글 | ⚠️ | 할 일마다 1번 요청 → v1 제외 |
| 리스트 공유 멤버·담당자 | ⚠️ | sprout v1에 협업 없음 → 제외 |
| 필터(스마트 리스트), 보기 설정, 습관·집중 기록 | ❌/제외 | 필터 엔드포인트 없음. 습관 등은 sprout에 기능 없음 |
| 위치 알림, 음력 반복(ERRULE), "공휴일 건너뛰기" | ❌ | sprout가 지원하지 않음 → 규칙 없이 가져오고 개수만 알림 |

**대체 경로 [다음]:** 틱틱 웹 › 설정 › 계정 › **백업 생성**(CSV)을 sprout에서 읽는 "백업 파일 가져오기". 휴지통·포기·만든 시각이 필요할 때를 위한 것. 비공개 API는 쓰지 않는다.

## 4. 요청 한도
- 공식 문서에 **숫자가 없다.** 다른 개발자 보고로는 **1분 100회, 5분 300회**, 넘으면 `429`와 `X-RateLimit-Remaining` 헤더 [커뮤니티]([hive 이슈 #5030](https://github.com/aden-hive/hive/issues/5030)).
- sprout는 **1분 80회·5분 250회** 안으로 스스로 줄 세우고, 429면 `Retry-After`(없으면 2·4·8·16초) 기다려 다시 한다. 리스트 30개 계정 ≈ 요청 35~45번 → 30초~1분.

## 5. 시간대 해석 (sprout 저장 형식으로)
- sprout는 floating(`YYYY-MM-DD` 또는 `YYYY-MM-DDTHH:mm`, 시간대 없음)으로 저장한다(03 §9).
- 시각 할 일: UTC 시각 → **그 할 일의 `timeZone`** 벽시계 시각. (예: `2026-10-05T00:30:00+0000`, `Asia/Seoul` → `2026-10-05T09:30`)
- 종일 할 일: 틱틱은 그 시간대의 자정을 UTC로 저장한다(서울 10/5 종일 = `2026-10-04T15:00:00+0000`) → 시간대로 바꾼 날짜만 쓴다.
- 여러 날 종일: `dueDate`가 **마지막 날 다음 자정(끝 미포함)** 인 것으로 본다(iCal 관례) → sprout는 마지막 날을 포함하므로 하루 뺀다 [임시 — 오너 데이터로 확인 필요].
