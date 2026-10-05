# 23. 맥 위젯 (macOS WidgetKit) — 종류 · 크기 · 보이는 것 · 누르면 · 테마

- 조사일: 2026-10-04. 도움말 글과 도움말 그림을 **글로만** 옮겼다. 그림·아이콘 원본은 저장하지 않는다(CLAUDE.md).
- 쓰임: [25 맥 위젯](../screens/25-mac-widget.md). 같이 볼 것: [20 모바일 §5 위젯](20-mobile.md), [22 테마](22-themes.md)
- 표기: **[확인]** 출처에 그대로 있음 · **[그림]** 도움말 그림을 보고 적음 · **[추정]** 출처가 직접 말하지 않음

## 1. 출처
| 출처 | 본 것 | 신뢰도 |
|---|---|---|
| 틱틱 도움말 [Widgets](https://help.ticktick.com/articles/7055780404896202752) (2026-10-03 수정본) macOS 탭 · FAQ | 맥 위젯 5종 이름·설명, 추가 방법, macOS 14 바탕화면·대화형, 위젯 편집 항목 | 높음 |
| 같은 글 iOS 탭 그림(Tasks 위젯 중간·큰 크기) | 머리·행·체크박스·오른쪽 시각 배치 | 높음(iOS지만 같은 디자인 계열) |
| 같은 글 macOS 탭 그림 3장(위젯 갤러리 화면) | 갤러리 이름·한 줄 설명, 크기 선택(S·M·L), 작은 Tasks·Daily View·Matrix 모양 | 중간 — **macOS 13 이전 알림 센터 갤러리** 화면이라 체크박스가 없다. 대화형(14+) 모양은 그림이 없다 |
| 틱틱 [Updates in 2023](https://help.ticktick.com/external/articles/7155128685119406080) | "macOS 14.0 Desktop Widgets — 바탕화면에 두고 상호작용" | 높음 |
| 틱틱 공식 X [2023-09 게시물](https://twitter.com/ticktick/status/1707372084576596223) | "이제 맥 바탕화면에 위젯을 두고 상호작용할 수 있다" | 높음(검색 요약) |
| [TidBITS 리뷰 2025-08](https://tidbits.com/2025/08/14/ticktick-provides-a-focused-daily-task-list-and-more/) | iOS 대화형 Today 위젯: 체크박스 = 완료, 제목 = 앱에서 편집, + = 새 할 일 | 높음(iOS) |
| Apple [Use widgets on your Mac desktop](https://support.apple.com/en-is/108996) | macOS 위젯 일반: 바탕화면 배치, 대화형 위젯에서 할 일 완료 가능 | 높음(OS 동작) |
| Mac App Store 틱틱 페이지 | 위젯 언급 없음 | — |

## 2. 맥 위젯 종류 [확인 + 그림]
도움말 macOS 탭: **"Tasks", "Eisenhower Matrix", "Today Habits", "Daily View", "Monthly Calendar View"** 다섯 가지.

| 위젯 | 갤러리 한 줄 설명 [그림] | 크기 [그림] | 보이는 것 |
|---|---|---|---|
| **Tasks** | "Get quick access to one of your lists." | **S · M · L** | 리스트 하나(기본 Today). 머리 = 리스트 이름(강조색) + 개수(옅은 강조색). 행 = 제목. 하위 할 일은 들여쓰기 [그림] |
| Daily View | "Quick view of today's schedule" | M | 왼쪽 작은 월 달력(오늘 = 강조색 원), 오른쪽 할 일 목록 + 오른쪽 날짜(지난 날짜 빨강, 앞날 회색), 넘치면 **"+8 more"**(강조색) [그림] |
| Eisenhower Matrix | "Focus on urgent & important tasks." | M · L | 4칸 사분면(칸 이름 색 다름), 머리 오른쪽 강조색 원형 `+`, 이름 옆 유료 표시 [그림] |
| Today Habits | "Get quick access to today's habits." | S · M · L | 습관 카드(아이콘 원 · 이름 · "20 days"/"0/3 Cup") [그림] |
| Monthly Calendar View | "Quick view of this month's schedule" | M · L | 월 달력 칸 안에 색 막대 [그림] |
- **extra large(XL)**: 도움말은 "iOS 27 이후 일부 위젯이 extra-large 지원"만 말한다. 맥 XL 언급 없음 [확인].
- sprout v1과 관계: 할 일 위젯(Tasks)을 따르고, **월 캘린더 위젯(Monthly Calendar View)도 2026-10-05 사용자 요청으로 추가**(§8, 25 §15). 매트릭스·습관 위젯은 sprout v1 기능 밖이라 만들지 않는다. 캐릭터 위젯은 틱틱에 없다(→ 틱틱 디자인 언어로 새로).

## 3. Tasks 위젯 모양 (크기별)
### 3.1 작게 (macOS 갤러리 그림, 13 이전) [그림]
- 흰 둥근 사각형. 위 왼쪽 **"Today"(강조색 파랑, 굵게) + "43"(옅은 파랑)**.
- 아래로 제목만 5줄(체크박스·날짜 없음), 긴 제목은 "…"로 자른다. 하위 할 일은 한 단계 들여쓰기.
- 넘친 개수 표시는 없다(머리의 숫자가 전체 개수).

### 3.2 중간 · 크게 (iOS 그림 — 맥 대화형 모양의 가장 가까운 근거) [그림]
- 머리: 왼쪽 **"Today" 강조색 + 개수 옅은 강조색**, 오른쪽 **`+`(강조색, 테두리 없는 아이콘)**.
- 행: **사각 체크박스(우선순위 색 테두리 — 높음은 빨강)** · 제목(검정) · 오른쪽 **시각 "08:00"(강조색)** 또는 시각 없는 오늘은 **"Today"(강조색)**.
- 중간 크기 = 머리 + 5행, 크게 = 머리 + 13행 정도. iOS 중간에는 넘침 표시가 없다(14개 중 5개만 보임).
- 맥 Daily View는 넘치면 맨 아래에 "+N more"(강조색)를 둔다 → 맥에서 넘침 표시를 쓰는 근거.
- 행 간격이 촘촘하다(구분선 없음, 배경 없음).

## 4. 누르면 · 체크 [확인]
| 동작 | 결과 | 출처 |
|---|---|---|
| 체크박스 누르기 | **앱을 열지 않고 완료** — macOS 14 이상 바탕화면·알림 센터 위젯 | 도움말 FAQ "with interactive support", Updates 2023, X 게시물 |
| 제목 누르기 | 앱에서 그 할 일을 연다(편집) | TidBITS(iOS) [맥은 추정 — 같은 동작] |
| `+` | 할 일 추가 화면을 연다 | 도움말 iOS "Add Task … quickly open the app to add tasks", TidBITS |
| Daily View의 할 일 | "Today" 스마트 리스트로 간다 | 도움말 iOS "click on tasks to quickly access the Today smart list" |
- 도움말 FAQ: "iOS 13 이후 시스템 제약으로 한 번 눌러 완료할 수 없다"는 옛 문장이 남아 있으나, 같은 글이 iOS 17·macOS 14 대화형을 말하므로 **옛 정보**로 본다.

## 5. 설정 · 테마 [확인]
- FAQ: **"위젯을 길게 눌러 Theme, View, Auto Dark Mode 등을 설정"** — 위젯마다 테마(색), 보기(리스트 고르기 등), 시스템 다크 따라가기를 고를 수 있다. 맥에서는 우클릭 → "위젯 편집"이 같은 자리 [추정 — OS 관례].
- Tasks 위젯 설명 "one of your lists" → **리스트 고르기**가 설정 항목이다 [확인].
- 갤러리 그림의 위젯은 모두 흰 바탕 + 강조색 파랑(틱틱 기본 테마) [그림].

## 6. 추가하는 방법 [확인]
- macOS: 메뉴 막대 오른쪽 위 시각 클릭 → 알림 센터 맨 아래 **"위젯 편집"** → TickTick 검색 → 위젯 고르기.
- macOS 14+: 위젯 편집 중 **바탕화면으로 끌어 놓기**(바탕화면 우클릭 → 위젯 편집도 OS 기본).

## 7. 확인 못 한 것 (사용자 Mac에서 보면 채울 수 있음)
1. macOS 14+ 대화형 Tasks 위젯 중간·크게의 실제 모양(체크박스 크기·행 높이·넘침 표시) — 도움말 그림이 13 이전 갤러리뿐. 사용자 Mac에서 바탕화면 우클릭 → 위젯 편집 → TickTick 갤러리를 열어 보면 된다(로그인·데이터 변경 없이 볼 수 있음).
2. 완료한 할 일이 위젯에서 바로 사라지는지, 체크된 채로 잠깐 남는지.
3. 위젯 편집 화면의 항목 이름(테마 목록, 리스트 고르기, 완료 보기 여부).
4. 다크 모드에서 위젯 바탕색(시스템 기본인지 틱틱 다크 `#1B1B1B`인지).
5. macOS 26의 "착색/투명" 위젯 스타일에서 어떻게 보이는지.

## 8. 월 캘린더 위젯 "Monthly Calendar View" (2026-10-05 보강 — 25 §15)
| 출처 | 본 것 | 신뢰도 |
|---|---|---|
| 틱틱 도움말 [Widgets](https://help.ticktick.com/articles/7055780404896202752) macOS 탭 | "Monthly Calendar View: All the events of the month are instantly displayed, so you can easily scan to know when you are busy and when you are free." | 높음 |
| 같은 글 macOS 탭 그림(위젯 갤러리 "Monthly Calendar View · Quick view of this month's schedule") | 크기 선택 **M · L** 두 가지(S 없음). **중간 그림 = 머리 "May"(굵게, 왼쪽) + 요일 줄 `M T W T F S S`(월요일 시작, `S S` 강조색 파랑) + 이번 주 한 줄**(7칸 세로 구분선). 오늘 칸 = **강조색 채운 원 안 흰 숫자 "4"** + 칸 오른쪽 위 **"+2"(강조색 작은 글자)**. 칸 안 막대는 위에서부터 쌓인 **한 줄 막대(리스트 색 옅은 면 + 진한 글자, 모서리 2~3)**, 오늘 칸에 7개, 막대 앞 작은 아이콘(⏰·🎉 — 습관·이모지), 제목은 칸 폭에서 잘림(… 없이 자름) | 높음(그림) |
| 같은 글 iOS 탭 그림(Monthly Calendar View 중간 · Today's Calendar) | iOS 중간 = 머리 `‹ September ›`(가운데, 강조색) + `S M T W T F S` + 이번 주 한 줄, 막대 = 왼쪽 색 띠 + 옅은 면, **지난 날 막대는 흐림**, 오른쪽 아래 강조색 원 `+`. Today's Calendar = 왼쪽 작은 월 달력(오늘 원) + 오른쪽 오늘 할 일 + "+ 9 more" | 높음(iOS) |
| 같은 글 Android 탭 | 캘린더 위젯 "Timeline", "Week", "Month" — "Monthly View: All your activities for the month are presented instantly" | 높음(Android) |
| 사용자 스크린샷(2026-10-05, 맥 크게 · 다크) | 다크 둥근 면, 왼쪽 위 "10월", 요일 `일 월 화 수 목 금 토`(일·토 파랑 계열), 5~6주 줄, 오늘 = 파란 채운 원, **다른 달 날짜 흐림**, 칸마다 막대 최대 3개(**리스트·캘린더 색 면 + 흰 글자**, 할 일 파랑 · 공휴일 일정 초록 "국군의날"·"한글날"), **칸 오른쪽 위 "+N"**, 반복 종일 항목 앞 아이콘(예 "⭐ 주말"), **완료 항목 흐림** | 높음(실물) |
- **누르면** [추정 — 도움말에 없음]: 위젯 칸을 누르면 앱 캘린더가 그 날로, 막대를 누르면 그 항목이 열린다(Daily View "click on tasks to quickly access" 문장과 같은 계열). 위젯 안에서 달 넘기기(iOS `‹ ›`)는 맥 그림에 없다.
- 위젯 편집 설정(Theme · View · Auto Dark Mode, §5)은 Tasks와 같은 FAQ 문장 — 월 위젯 고유 항목은 확인 못 함.
- 틱틱 공휴일은 **구독 캘린더 일정(초록 막대)** 으로 들어온 것(research 17 §15: 한국 계정엔 "휴일 표시" 스위치 없음).
