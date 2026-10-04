# 틱틱 조사: 구글 캘린더 구독 — 화면 보강 (2026-10-04)

[15 구글 캘린더](15-google-calendar.md)의 보강. 15는 "구독 = 양방향, 통합 = 리스트 ⇄ 캘린더"라는 **방식**을 정리했고, 이 노트는 [16 구글 캘린더 명세](../screens/16-google-calendar.md)에 필요한 **화면 위치·목록·표시·읽기 전용 모양**을 정리한다.

- 출처(모두 텍스트로만 옮김, 이미지·로고는 쓰지 않는다):
  - TickTick Help — [Google Calendar](https://help.ticktick.com/articles/7055781593733922816): 이미 받아 둔 도움말 이미지 `docs/ticktick-captures/_help/google-calendar-922816/` 06~10(데스크톱 구독), 03~05(모바일), 27(통합 편집)
  - TickTick Help — [Calendar Subscriptions](https://help.ticktick.com/articles/7055781614550253568): `_help/calendar-subscriptions-253568/01`
  - TickTick Help — [Local Calendar](https://help.ticktick.com/articles/7209482814528421888): `_help/local-calendar-421888/03` (캘린더별 표시 옵션의 원형)
  - TickTick Help — Outlook·Exchange·iCloud Calendar: `_help/outlook-calendar-318912/02`, `_help/exchange-calendar-753728/02`, `_help/icloud-calendar-086592/03`
  - 실제 앱 실측: [17 캘린더 실측](17-calendar-live.md) §1 `...` 메뉴, §7 구독 일정 팝오버, §8 왼쪽 패널
  - 영상 관찰: [cal-subscription NOTES](../ticktick-captures/cal-subscription/NOTES.md)
- 도움말 페이지 본문은 스크립트로 그려져서 웹 가져오기로 읽히지 않았다(2026-10-04). 위 이미지와 실측으로 채웠다.

## 1. 들어가는 곳
| 진입점 | 틱틱 동작 | 근거 |
|---|---|---|
| 설정 › **연동 & 가져오기** | 맨 위 "Calendar" 구역에 카드 격자: Local Calendars · Google Calendar · Outlook · Exchange · iCloud · CalDAV · URL. 아래 "Integrate"(Google Calendar·Notion·Zapier·IFTTT), "Email" 구역 | outlook 02, exchange 02 |
| Google Calendar 카드 | **"Integrate Google Calendar (?)"** 모달: 카드 두 장 — "Subscribe from Google Calendar"(구글 → 틱틱, "구독 뒤 사이드바 'Subscribed Calendars'에서 본다") / "Integration with Google"(틱틱 → 구글) | google 07 |
| 사이드바 "Subscribed Calendars" 소제목의 `+` | 서비스 메뉴(로컬·구글·아웃룩·Exchange·iCloud·CalDAV·URL) | cal-subscription NOTES |
| 캘린더 머리글 `...` › **캘린더 구독** | 같은 설정 화면으로 | 17 §1 |
| 캘린더 왼쪽 패널 `› 캘린더 구독` | 접힘 그룹(캘린더별 체크) | 17 §8 |

## 2. 연결된 뒤 설정 화면 (google 08)
- 설정 › 연동 & 가져오기 상단이 **"Calendar"** 제목 + 옅은 카드로 바뀐다.
  - 카드 1행: "Subscribe other calendars to TickTick." … 오른쪽 강조색 **"+ Add Calendar"**
  - 계정 행: 서비스 로고 + **계정 이메일** … 오른쪽 강조색 **"Edit"**
  - "Don't disturb" 토글 + 회색 설명 "Don't receive notifications for calendar events in TickTick." (구독 일정 알림 끄기)
  - 별도 카드: "Subscribe TickTick in your calendar app (?)" + "+ Enable the URL" (반대 방향, sprout 범위 밖)
- "Edit"을 누르면 **계정 이메일을 제목으로 하는 모달**, 오른쪽 위 `⋯`(통합 편집 이미지 27에서 같은 모양 확인). 구독 쪽 모달의 내용(캘린더 목록)은 도움말 이미지가 없다 → 아래 §3 로컬 캘린더 모달을 원형으로 본다.

## 3. 캘린더별 표시 (로컬 캘린더 모달, local 03)
- 가운데 모달, 제목 "Local Calendars". 위 토글 카드("Local Calendar — Local calendar for local viewing only").
- 소제목 **"(Default)"** / **"(Other)"** 로 캘린더를 나누고, 행마다 **색 점 + 캘린더 이름 … 오른쪽 `Show ⌃⌄`** 선택.
- 선택지: **Show / Show only in calendar / Hide** (도움말 검색 결과 문장). "Show only in calendar"는 목록·스마트 리스트에는 안 넣고 캘린더 보기에만 보인다는 뜻으로 읽힌다 → **[추정]**.
- 아래 버튼 **Cancel / Confirm**(강조색). 즉 바로 반영이 아니라 확인을 눌러야 반영된다.
- 구글 구독도 같은 모양일 가능성이 높지만 **직접 확인하지 못했다** → 명세에서는 [임시]로 쓴다.

## 4. 사이드바 "Subscribed Calendars" 목록 보기 (google 09·10, 모바일 03~05, icloud 03)
- 사이드바 구역 "Subscribed Calendars"에 **계정 행 하나**(캘린더 아이콘 + 이메일, 영상에서는 오른쪽에 일정 개수).
- 누르면 가운데에 그 계정의 **일정 목록**: 머리 제목 = 이메일, 그룹 **Today / Next 7 Days / Later**(모바일은 그룹마다 개수, Later는 접힘).
- 행: **"G"가 들어간 작은 캘린더 아이콘**(태스크 체크박스 자리) + 제목 + 오른쪽 날짜(강조색 "Today"/"May 15", 시각이 있으면 시계 아이콘 + 시각). 행 왼쪽에 캘린더 색 세로 줄(모바일).
- 오른쪽 상세: 제목, 🕐 날짜, 📍 "Add location", 📄 "Notes".
- 틱틱은 양방향이라 목록 위에 "+ Add agenda to "<이메일>"" 입력창이 있다 → **sprout는 읽기 전용이므로 두지 않는다.**
- 빈 상태(모바일, iCloud): 그림 + **"It's all clear in the next 3 months." / "Enjoy your life."** → 목록 보기는 **앞으로 3개월**을 보여 주는 것으로 읽힌다.

## 5. 캘린더 보기 안의 구독 일정 (17 §7·§8)
- 태스크와 같은 막대 모양으로 겹쳐 보인다. 색은 캘린더 색(Local 모달의 색 점과 같은 색).
- 누르면 **읽기 전용 팝오버**: 제목 / 🕐 날짜 / 📄 설명 / 맨 아래 캘린더 이름. 체크박스·우선순위·리스트 선택이 없다.
- 왼쪽 패널 필터 맨 아래 `› 캘린더 구독` 접힘 그룹 → 펼치면 캘린더마다 체크칸(리스트·태그 그룹과 같은 모양).
- 옵션 보기의 "완료된 할일 보기"와 함께 **"완료한 태스크와 구독 일정 표시"**가 같은 옵션으로 묶여 있다([10 캘린더](10-calendar.md) 표). 지난 구독 일정은 지난 태스크처럼 옅게 보인다고 본다 → [추정].

## 6. 확인하지 못한 것 (명세에서 [임시])
1. 구글 구독 "Edit" 모달의 실제 항목(캘린더 목록·표시 선택이 로컬과 같은지, 색 바꾸기가 있는지).
2. 새로 고침 주기, 수동 새로 고침 버튼 위치.
3. 연결이 끊겼을 때(구글에서 권한 철회) 틱틱이 보여 주는 문구.
4. 여러 구글 계정 동시 구독 여부(영상·도움말에는 계정 하나만 보인다).
5. 거절한 초대·근무 위치·부재중 일정을 구독에서도 빼는지(통합 쪽은 근무 위치·부재중을 뺀다고 15에 있음).

→ 사용자 틱틱에 구글을 연결해 보면 1~5를 채울 수 있지만, **사용자 개인 계정을 건드리는 실험이라 하지 않았다.** 필요하면 사용자 허락을 받고 시험 계정으로 확인한다.
