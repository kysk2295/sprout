# cal-subscription — 관찰 노트 (Mac)

- 근거 프레임: [zq f0118 캘린더 추가 메뉴](../_video/zqGeCiSgFOk/f0118.jpg), [zq f0119 Integrate Google Calendar](../_video/zqGeCiSgFOk/f0119.jpg), 이후 f0121~0124(구글 계정 선택 OAuth 창). 도움말은 [SOURCES.md](SOURCES.md), 조사 노트 [15](../../ticktick-research/15-google-calendar.md)

## 사이드바 "Calendar Subscription" 구역
- 소제목에 마우스를 올리면 `+`가 나타난다. 누르면 메뉴:
  - Local Calendars · Google Calendar · Outlook Calendar · Exchange Calendar · iCloud Calendar · CalDAV · URL("Support adding calendars with URL subscriptions in iCal(.ics) format.")
  - 항목마다 서비스 로고 아이콘이 있다.
- 구독한 계정은 캘린더 아이콘 + 계정 이메일 + 일정 개수("40")로 표시된다.

## Google Calendar 선택 → "Integrate Google Calendar (?)" 모달
- 카드 두 장:
  1. **Subscribe from Google Calendar** (G » 틱틱 아이콘) — 구글 일정을 틱틱으로 가져온다. 구독 후 사이드바 'Subscribed Calendars'에서 본다.
  2. **Integration with Google** (틱틱 » G 아이콘) — 틱틱 태스크를 구글 캘린더로 보낸다.
- 카드를 누르면 구글 계정 선택 창("Choose an account", OAuth)이 뜬다.

## sprout v1
- `+` 메뉴에는 Google Calendar만 둔다. 모달을 거치지 않고 바로 구독(읽기) OAuth로 간다.
- 사이드바 구역 이름·위치·계정 표시는 그대로 따른다.
