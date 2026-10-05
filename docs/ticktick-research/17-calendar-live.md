# 틱틱 조사: 캘린더 — 실제 앱 실측 (Mac, 2026-10-03)

- 출처: 사용자 Mac에 설치된 TickTick 앱(한국어 UI, 다크 테마)을 직접 열어 확인. 창 크기 1378×884pt, 스크린샷이 pt와 거의 1:1이라 **pt로 바로 잰 값**이다(영상 프레임 추정보다 우선).
- 사용자 개인 태스크 내용은 기록하지 않는다. 화면 캡처 파일도 저장하지 않았다.
- 레일 폭이 55pt로 잰다 — 00 디자인 토큰의 66pt(영상 프레임 + 신호등 간격 20pt 가정)와 다르다. §8 참고.

## 1. 공통 머리글
| 요소 | 실측 |
|---|---|
| 제목 "2026년 10월" | 굵게 약 20pt, 세로 중심 y≈32. **누르면 월 고르기 팝오버**: "2026 ‹ ○ ›" + 1월~12월 4×3 칸, 고른 달은 강조색 원 |
| 왼쪽 패널 아이콘 `▯` | 30×30, 제목 왼쪽 |
| `+` | 32×32, 테두리 있는 둥근 사각 |
| 보기 전환 "주 ⌄" | 54×32, 테두리 |
| `‹ │ 오늘 │ ›` | 36 + 47 + 36 = 119×32, 테두리 하나로 묶임 |
| `...` | 30×30, 테두리 없음 |
| 머리글 높이 | 약 56pt(요일 줄이 y≈56에서 시작) |

### 보기 전환 메뉴 (한국어 문구 그대로)
일 `D/1` · 주 `W/2` · 월 `M/3` · 일정 `A/4` · (구분선) · 멀티데이 `5 날들` · 다중 주 `2 주`. 현재 보기는 왼쪽 ✓ + 강조색 글자.

### `...` 메뉴
옵션 보기 · 할일 정렬 · 캘린더 구독 (각각 왼쪽 선 아이콘)

### 옵션 보기 (모달 440×498)
- 카드 1: 색상 (?) `목록 ◇` · 스타일 `간결한 ›`
- 카드 2: 완료된 할일 보기 · 하위 할일 보기 · 반복 주기 표시
- 카드 3: 습관 보기 · 전념 기록 보기 (?) · 디데이 표시
- 카드 4: 보조 시간대 (?)
- **스타일 하위 화면**: `간결한`(기본, 체크박스 아이콘 없음) / `상세한`(체크박스·종류 아이콘 표시). 설명: "상세" 스타일을 선택하면 작업을 표시된 체크박스를 클릭하여 빠르게 완료할 수 있다.

## 2. 요일 줄
- 높이 약 34pt. 요일 글자(일 월 화 …) 약 11pt 회색, 열 가운데. 주 시작은 설정값(사용자는 일요일).

## 3. 주 보기
| 요소 | 실측 |
|---|---|
| 시간 눈금 칸 | **55pt**. 글자 "12 PM", "1 PM" … (한국어 UI에서도 영어 AM/PM), 약 10pt 회색, 오른쪽 정렬(오른쪽 여백 6), 시각 선에 세로 가운데 |
| 1시간 높이 | **52pt** |
| 날짜 숫자 줄 | 종일 영역 맨 위 약 34pt, 숫자 13pt 왼쪽 위(왼쪽 여백 8). 오늘 = 22pt 강조색 원 + 흰 숫자 |
| 종일 막대 | 높이 **16pt**, 줄 간격 **19pt**, 좌우 여백 2~3pt, 모서리 3pt, 글자 11~12pt 굵게 |
| 종일 영역 높이 | **내용에 맞춰 자동**(가장 많은 날의 막대 수만큼). 6줄이면 약 146pt |
| 시각만 있는 태스크(기간 없음) | 그 시각 위치에 **막대 한 줄(16pt)**. 30분 블록이 아니다 |
| 현재 시각 | **오늘 열에만** 빨간 주황 선 + 열 왼쪽 끝 점(8pt). 다른 열에는 선 없음 |
| 선 | 시각·열 구분선은 아주 옅다. 주말·오늘 열 배경 칠 없음 |

## 4. 일 보기
- 주 보기와 같은 구조에 열 하나. 요일은 맨 위 가운데, 날짜 원은 왼쪽 위. 막대는 열 폭 전체.
- 시간 글자 "0 AM", "1 AM" … "11 AM", "12 PM".

## 5. 월 보기
| 요소 | 실측 |
|---|---|
| 줄 수 | **그 달에 필요한 주만큼**(2026년 10월 = 5줄). 6줄 고정이 아니다 |
| 칸 날짜 | 13pt 왼쪽 위. 1일은 "10월 1일". 다른 달 숫자는 회색 |
| 오늘 칸 | **칸 전체 배경이 한 단계 밝다** + 숫자 강조색 원 |
| 막대 | 주 보기 종일 막대와 같다(16/19pt). 시각은 오른쪽 "오후 7:00" |
| 넘침 | 마지막 줄 오른쪽에 "+2" 회색 칩 |
| 주말 칸 | 칠 없음 |

## 6. 막대 모양 (스타일 "간결한")
- 리스트 색으로 채운 막대 + 왼쪽 2pt 진한 줄. 다크 테마는 진한 채움 + 흰 글자, 라이트 테마(2026 영상 QKA f0101)는 옅은 채움 + 같은 색 계열의 진한 글자.
- **지난 항목·완료 항목은 훨씬 옅게**(채움·글자 모두).
- 반복 태스크는 제목 앞에 ⟲ 아이콘, 디데이는 앞에 작은 아이콘.

## 7. 팝오버
| 팝오버 | 실측 |
|---|---|
| 태스크 열기 | 카드 **400×300pt**. 머리(약 48): 체크박스 19 │ 📅 강조색 "오늘, 10월 3일, 오후 4:30" … 깃발. 제목 16pt 굵게 + 오른쪽 체크 항목 아이콘. 아래: `📥 기본함` … `A` 💬 `⋯`. 블록 옆에 블록 위쪽에 맞춰 뜬다 |
| 빠른 만들기 | 카드 약 400×296. 머리 "📅 오늘, 10월 3일" 강조색 … 깃발. 자리 표시 문구 **"무엇을 하고 싶으신가요?"**, 오른쪽 체크 항목 아이콘. 아래 `📥 기본함` |
| 구독 일정(읽기 전용) | 제목 / 🕐 날짜 / 📄 설명 / 맨 아래 캘린더 이름 |

## 8. 왼쪽 패널
- 폭 **223pt**. 위쪽에 작은 달력: "2026년 10월 ‹ ○ ›"(머리글 높이에 맞춤), 요일 첫 글자, 날짜 칸 약 29×34.
- 주 보기에서는 **이번 주 줄 전체를 둥근 띠**로 칠하고, 오늘은 강조색 원. 태스크가 있는 날 아래에 작은 강조색 점.
- 필터: `전체`(강조색 글자 + 채운 체크 원) · `› 리스트 ☐` · `› 태그 ☐` · `› 캘린더 구독`(접힘 그룹).

## 9. 다른 화면과 함께 확인한 치수 (목록 화면, 같은 창)
| 요소 | 실측 | 00 토큰 v1.1 |
|---|---|---|
| 레일 폭 | 55 | 66 |
| 레일 아이콘 간격 | 48 | 53 |
| 사이드바 폭 | 261 | 264 |
| 사이드바 항목 간격 | 40 | 40 |
| 머리글 제목 세로 중심 | 33 | 42 |
| 추가 바 | 위 58, 높이 37 | 위 70, 높이 40 |
| 행 높이 | 40 | 44 |
- 목록 화면도 이 실측으로 다시 맞출지는 사용자 결정 필요.
- 실제 앱의 한국어 용어: 받은함 → **기본함**, 기한 지남 → **만료됨**, 집중 기록 → **전념 기록**, D-day → **디데이**.

## 12. 색·완료 표시·항목 아이콘 — 공식 도움말 보강 (2026-10-05)
사용자 피드백(월 보기에서 완료/미완료가 똑같아 보임, 막대가 전부 같은 색)으로 공식 도움말을 다시 확인했다.
- **색은 리스트 색에서 온다. 리스트에 색이 없으면 색이 없다.** FAQ "Why do my tasks not have colors on the calendar view?" → "The colour that tasks are displayed on the calendar view is determined by the list they belong to. Please remember to set different colours for different lists." — [FAQ - Calendar](https://help.ticktick.com/articles/7063851189372190720)
- **옵션 보기 › 색상에서 리스트·태그별 색을 바로 고친다.** "Tasks can be colored by List, Tag, or Priority. When selecting By List or By Tag, you can directly customize colors for each list/tag below. By Priority uses fixed priority colors." — [Calendar View Options](https://help.ticktick.com/articles/7055782085826445312) (2026-09-11 수정본)
- **항목 아이콘 표시(Show Item Icons):** "In Style, toggle Show Item Icons to choose whether icons for tasks, subscribed calendars, habits, countdowns, and other items are shown." 데스크톱은 아이콘을 꺼도 "hold the Alt key (or Option on Mac) to temporarily display them. This helps you quickly distinguish different item types and complete tasks with a single click." — 같은 문서. 즉 **태스크와 구독 일정의 구분 = 종류 아이콘**(태스크 = 체크박스, 구독 일정 = 캘린더 아이콘), 색은 각각 리스트 색·캘린더 색.
- "Show Completed"는 완료한 태스크·습관·**구독 일정**을 함께 보이고 숨긴다 — 같은 문서.
- 2026 도움말의 스타일 이름은 Modern / Classic(우리 실측 한국어 앱은 간결한 / 상세한, §1). 아이콘 기본값(켬/끔)은 도움말에 없다 → [미확인].
- 빠른 만들기 팝오버를 연 채 다른 빈 칸·바깥을 누를 때의 동작은 도움말에 없다. 06 §7.1 실측("제목을 쓴 채 바깥 클릭 = 저장, Esc = 취소")과 사용자 보고("다시 누르면 틱틱처럼 닫혀야 한다")를 따른다.

## 13. 일정(구독 캘린더) vs 할 일 — 틱틱은 어떻게 나누나 (2026-10-05)
사용자 피드백 "일정이랑 할 일을 틱틱처럼 구분해서 보여줘야지"로 공식 도움말(2026-09 수정본 전문)과 이미 받아 둔 도움말 그림을 다시 확인했다. 도움말 본문은 페이지 안 `__NEXT_DATA__`에 96개 문서가 통째로 들어 있어 이번에는 글자 그대로 읽었다.

### 13.1 개념 — 틱틱의 "일정"은 구독 캘린더 항목뿐이다
| 사실 | 근거 |
|---|---|
| 틱틱이 스스로 만드는 항목은 **전부 할 일(태스크)**이다. 캘린더 보기에서 날짜 칸·시간 칸을 눌러 만드는 것도 태스크다: "Tasks can be added by clicking on the date grid of the calendar view. … click on a place on the timeline to add a task" | [FAQ - Calendar](https://help.ticktick.com/articles/7063851189372190720) |
| **"일정(event)"은 구독한 외부 캘린더(구글·iCloud·Outlook·Exchange·CalDAV·URL·로컬)에서 온 항목**이다. 구글 FAQ: 구독은 "Synchronize as calendar events", 통합은 "Synchronize as tasks" — 같은 구글 일정도 연결 방식에 따라 일정 또는 태스크가 된다 | [Google Calendar](https://help.ticktick.com/articles/7055781593733922816) FAQ, [Calendar Subscriptions](https://help.ticktick.com/articles/7055781614550253568) |
| 일정을 **만드는 곳**은 사이드바 "Subscribed Calendars" 목록의 입력창(데스크톱 "+ Add agenda to "<계정>"", 모바일 `+`). 만든 일정은 그 캘린더로 양방향 동기화된다(구글·iCloud) | Google Calendar(데스크톱 탭), [iCloud Calendar](https://help.ticktick.com/articles/7209479055807086592) "Click on the "+" icon to add events", 그림 `_help/google-calendar-922816/09·10` |
| 캘린더 보기의 빠른 만들기에 "태스크/일정" 고르기가 있다는 근거는 **도움말·영상 어디에도 없다** → [미확인]. 우리 실측(§7)의 빠른 만들기 팝오버에도 고르기가 없었다 | §7, FAQ - Calendar |
| **캘린더 계정을 하나도 연결하지 않으면 일정은 없다** — 캘린더에 보이는 것은 모두 할 일(체크박스)이다. 사용자가 틱틱에서 보던 일정은 구독 캘린더(구글 또는 맥 로컬 캘린더)에서 온 것으로 본다 | 위 사실들의 귀결 |
| 그 밖에 캘린더에 함께 보이는 종류: 습관, 집중 기록, 디데이(Countdown), 노트. 각각 따로 켜고 끈다 | [Calendar View Options](https://help.ticktick.com/articles/7055782085826445312) "Other View Options" |

### 13.2 캘린더 보기에서 보이는 차이 (그림 `_help/calendar-view-options-445312/07·08·09·13`, `_help/agenda-view-stringing-tasks-by-time-365120/01`)
| 항목 | 할 일 | 일정(구독) | 근거 |
|---|---|---|---|
| 막대·블록 모양 | 같은 모양 — "Modern" = 옅은 채움 + 왼쪽 진한 줄, "Classic" = 진한 채움(줄 없음). 스타일 미리 보기 그림에 **"Task"(파랑)와 "Event"(노랑) 블록이 같은 모양으로 나란히** 있다 | 같음 | 08·09 Style 그림 |
| 앞 아이콘 | **빈 체크박스**(회색 테두리 둥근 사각, 글자 크기). 누르면 완료 | **캘린더 아이콘**(같은 크기·같은 회색, 체크박스 자리). 누를 수 없다 | 09 미리 보기 확대, Show Item Icons 설명 |
| 색 | 색상 기준(목록·태그·우선순위)의 색 | 그 캘린더 색. 색상 기준과 상관없음 | Color 문단 "Task Color"는 태스크만 다룬다 |
| 아이콘 켜고 끄기 | 스타일 › **Show Item Icons** 하위 화면에 종류별 토글: **Task · Calendar · Note · Habit · Focus Record · Countdown**. 설명 "Icons can be shown or hidden by type to help you quickly distinguish content. When Task is enabled, you can quickly complete tasks by tapping the checkbox, **which automatically hides when space is limited**." | (같은 화면 Calendar 토글) | 08 Style·Show Item Icons 그림(모바일 2026) |
| 아이콘 끈 상태(데스크톱) | Alt/Option을 누르는 동안 잠깐 보인다 — "quickly distinguish different item types and complete tasks with a single click" | 같음 | Calendar View Options 데스크톱 탭 |
| 완료 | 체크된 체크박스 + 막대·글자 옅게, **취소선 없음**(월 보기 그림의 "Start project 10:00 AM") | 일정은 완료가 없다. 지난 일정은 "Show Completed"에 함께 묶인다("completed tasks, habits, and subscribed calendar events") | agenda 01 그림, Other View Options |
| 시각 표시(월 보기·종일 줄) | 시각 있는 할 일 = 막대 오른쪽 "10:00 AM", 종일 할 일 = 시각 없음 | 같음 | agenda 01 그림 |
| 끌기·길이 바꾸기 | 됨 | 틱틱은 양방향이라 됨(구글·iCloud) — sprout v1은 읽기 전용이라 안 됨(16 §3.1) | Google Calendar "add, modify, and delete" |
- 주 보기 구성(도움말): 종일 줄 = "unassigned time" 태스크·종일·여러 날 태스크, 세로 시간 축 = 시각 있는 태스크 — 일정도 같은 규칙으로 놓인다([Week View](https://help.ticktick.com/articles/7055782149730861056)).

### 13.3 목록(스마트 리스트)에서
| 사실 | 근거 |
|---|---|
| 구독 일정은 **"오늘", "다음 7일" 스마트 리스트와 캘린더 보기에** 함께 보인다: "These calendar events will also be intelligently displayed in the "Today", "Next 7 Days" smart lists, and calendar view." | Google Calendar(모바일 탭) |
| 캘린더마다 표시 범위를 고른다: **Show / Show only in calendar / Hide**(로컬 캘린더, 맥). "캘린더에서만"을 고르면 스마트 리스트에는 안 나온다 | [Local Calendar](https://help.ticktick.com/articles/7209482814528421888) |
| 목록 행 모양(구독 캘린더 목록 그림): 체크박스 자리에 **회색 캘린더 아이콘**, 제목, 오른쪽에 날짜(강조색 "Today"/"May 15", 알림이 있으면 ⏰). 모바일은 행 왼쪽에 캘린더 색 세로 줄 | `_help/google-calendar-922816/04·09·10` |
| "내일" 스마트 리스트에도 나오는지, 오늘 목록에서 할 일과 섞이는 순서는 도움말에 없다 → [미확인] | — |
| 사이드바 스마트 리스트 개수에 일정이 들어가는지 → [미확인](모바일 그림의 Today 2는 태스크·일정 구분 불가) | 04 그림 |

### 13.4 sprout에 주는 결론
1. 사용자 데이터(구독 캘린더 없음)에서는 틱틱도 모든 항목이 할 일이다 → **구분이 보이려면 구글·Apple 캘린더를 연결**해야 한다(16 명세, 이미 구현).
2. 화면 규칙은 이미 맞는 것: 같은 모양, 할 일 = 체크박스 / 일정 = 캘린더 아이콘, 일정 = 캘린더 색, 일정은 체크·끌기 없음, 완료 취소선 없음.
3. 틱틱에 있고 sprout에 없던 것: ① 아이콘을 **종류별로**(할 일·캘린더) 켜고 끄기 ② 일정 아이콘이 체크박스와 **같은 자리·같은 크기·회색** ③ 좁으면 체크박스 자동 숨김 ④ **오늘·다음 7일 목록에 일정 표시** ⑤ 캘린더별 "캘린더에서만 보이기". → 06 §14.3에 반영.
4. 틱틱식 "일정 만들기"는 구독 캘린더에 쓰기(양방향)다 — 자체 일정 테이블이 아니다. sprout v1은 읽기 전용이라 제안으로만 남긴다(06 §14.4).

## 14. 끌기 모양 (2026-10-05 영상·도움말 프레임 조사 — 06 §7.2 끌기 정리의 근거)
틱틱 앱을 직접 끌어 보지는 않았다. 아래는 공식 영상(1초 프레임)·도움말 그림에서 **끄는 도중** 화면을 찾은 것이다. 프레임 번호는 중복 제거 후 번호(초 아님, 각 폴더 `times.tsv`).

| 상황 | 틱틱 모양 | 근거 | 구분 |
|---|---|---|---|
| 월 칸에서 막대 끌기 | **원래 막대와 같은 모양(같은 색·크기·제목·시각)** 이 포인터를 따라 떠다닌다(칸에 붙지 않음, 두 칸에 걸쳐 보이기도). 살짝 비치고 부드러운 그림자. 포인터 아래 칸이 옅게 칠해지고(2025 영상 옅은 보라, 도움말 그림 옅은 회색), **원래 막대는 제자리에 옅게** 남는다 | `_video/EUBxb9MgYWg/f0081`, `_help/desktop-interaction-tips-244288/06-desktop-duplicate-tasks-quickly.png`, `_video/QKAA8p3PY_8/f0087·f0088` | 실측(그림) |
| 주·일 시간 칸 | 미리 보기가 **열 전체 폭·시각 줄에 붙어** 놓일 자리에 그려진다. 원래 항목은 옅게 | `_video/MhYkPy6xK4M/f0172`, `f0228`, `_video/hLWIRnKAg6I/f0057·f0058` | 실측(그림) |
| 종일 막대·목록 → 시간 칸 | 미리 보기도, 놓은 뒤에도 **한 줄 막대(시각 한 점, 기간 없음)**. 길이는 가장자리를 끌어 늘린다 | `MhYkPy6xK4M/f0228`(끄는 중) → `f0231`("30-minute cardio sessions" 07:00 한 줄), `f0172`("Yoga class" 14:00 한 줄) | 실측(그림) |
| 기간 블록을 시간 칸 안에서 옮기기 | 끄는 도중 프레임 없음. 길이 유지·15분 단위로 본다(가장자리 끌기가 15분 단위) | — | 추정 |
| 위·아래 가장자리 | 커서 ↕, **블록 자체가 바로 늘어나고** 시간 글자가 15분 단위로 바뀐다(14:00-15:45 → 14:00-16:00) | `MhYkPy6xK4M/f0173~f0175`, `f0232·f0233`, [Week View 도움말](https://help.ticktick.com/articles/7055782149730861056) "up and down arrow icons appear" | 실측 |
| 막대 끝(여러 날) | 캘린더에서 막대 끝을 끌면 여러 날 할 일이 된다 | [Desktop Interaction Tips](https://help.ticktick.com/articles/7351523697951244288), [Updates in 2024](https://help.ticktick.com/external/articles/7301088783166865408) | 도움말 |
| 목록 패널 → 캘린더 | 목록 위에서는 흰 행 카드가 떠다니고 원래 자리는 빈다. 월 칸 위에서는 작은 막대가 떠다니고 칸이 칠해진다. 시간 칸 위에서는 칸에 붙은 미리 보기 | `MhYkPy6xK4M/f0144`, `f0149`, `QKAA8p3PY_8/f0058`, `hLWIRnKAg6I/f0057` | 실측(그림). 할일 정렬 패널 자체에서 끄는 프레임은 없음 → 같은 규칙으로 본다 |
| 커서 | Mac은 보통 화살표, 웹은 이동 십자 | `MhYkPy6xK4M/f0149·f0172`, `hLWIRnKAg6I/f0056` | 실측 |
| 반복 할 일 놓기 | "Edit Recurring Task"(이번만 / 완료 안 된 모든 회차) 대화창 | `MhYkPy6xK4M/f0230` | 실측 — sprout v1은 §7.2대로 전체 이동(대화창은 [후보]) |
| Esc 취소 · 놓을 때 애니메이션 | 영상·도움말에 없음 | — | 미확인 → sprout는 Esc = 취소, 애니메이션 없음 |

## 15. 공휴일 · 주말 · 추가 달력(음력) · 주 번호 (2026-10-05 조사 — 06 §16의 근거)
사용자 피드백 "공휴일이나 이런 것들이 표시가 안 돼. 주말이나 이것도 확인해 줘."에 대한 조사. 개인 데이터·설정은 읽기만 했고 바꾸지 않았다.

### 15.1 주말
| 항목 | 틱틱 | 근거 |
|---|---|---|
| 주말 칸 배경 | **칠 없음**(주·월 모두) | 이 문서 §3·§5 실측, 영상 `_video/EUBxb9MgYWg/f0007`(June 2025 월 보기) |
| 주말 날짜 숫자·요일 머리 색 | **보통 글자색 그대로**(토·일도 검정/회색) — 빨강·파랑 없음 | 같은 프레임, 디다 도움말 월·주 보기 그림(`_help/dida-calendar-display/01·02`) |
| **옵션 보기 › Show Weekends**(한국어 문자열 `주말 표시`) | 켜기/끄기 토글, 기본 켬. 끄면 토·일 열을 숨긴다(주말 숨기기). 색상·스타일과 같은 첫 카드 | 영상 `EUBxb9MgYWg/f0069`(4 Weeks 보기의 View Options), 맥 앱 `TTCalendarDisplayOptionsViewController.nib`의 `weekendRowView`·`Show Weekend`, `ko.lproj` `show_weekends = 주말 표시`. 2026-10-03 한국어 주 보기 실측(§1) 옵션 목록에는 없었다 → 보기에 따라 행을 숨기는 것으로 보인다 |
→ 06 §8의 "주말 숨기기 옵션은 데스크톱에 없다"는 틀렸다(고침).

### 15.2 휴일(공휴일) 표시
| 항목 | 틱틱/디다 | 근거 |
|---|---|---|
| 설정 자리 | 설정 › **날짜 & 시간**의 스위치 **"휴일 표시"**(영문 `Show Holidays`, 설명 `Display holidays in the calendar`). 디다(중국판)는 같은 자리 `显示节假日调休` | 맥 앱 `TTFuncPreferencesDateTimeViewController.nib`(`holidayButton`·`holidayLabel` · 문구 "Display holidays in the calendar"), `ko.lproj` `Show Holidays = 휴일 표시`, 디다 도움말 [日历显示设置](https://help.dida365.com/articles/6950647988939128832) 그림 `_help/dida-calendar-display/03·04` |
| 한국 계정에서 | **스위치가 보이지 않는다** — 한국어 틱틱 설정 › 날짜 & 시간은 `일주일을 시작하는 요일 / 추가 달력 · 주 번호 표시(W) / 시간대`뿐 | `live-2026-10-03/date-time.jpg` 실측. 실행 파일에는 중국(`holidayInfosJSONString`)·일본(`japanHolidayInfosJSONString`, `isJapanese`) 휴일 자료만 있고 한국 공휴일 자료·문자열(설날·추석·개천절 등)은 없다 → **틱틱은 한국 공휴일을 보여 주지 않는다** |
| 월 칸 모양 | 날짜 숫자 **오른쪽 위에 작은 원 배지 "休"(초록, 쉬는 날)** / "班"(빨강, 보충 근무일 — 한국에는 없음). 칸 오른쪽(음력 글자 자리)에 **휴일·명절 이름을 초록 글자**로(元旦·圣诞节·平安夜). 날짜 숫자 색은 그대로 | 디다 도움말 [月视图](https://help.dida365.com/articles/6950640298334617600) 그림 `01`(2025년 12월 · 2026년 1월 1~4일), 배지 면 색 실측 #38D6AC |
| 주 보기 | 날짜 줄 오른쪽에 같은 글자(음력·절기·휴일), 왼쪽 위 칸에 주 번호(`第 51 周`) | 그림 `02` |
| 모바일 | 숫자 아래 한 줄(휴일 이름 초록 / 음력 / 주 번호 `2周`), 배지는 숫자 오른쪽 위 — 위쪽 한 주 띠(작은 달력)에도 배지 | 그림 `03` |
| 작은 달력(왼쪽 패널·날짜 선택기) | 데스크톱 그림 없음. 모바일 한 주 띠에 배지가 있어 **배지만** 따른다(이름은 마우스를 올리면) | [추정 — 그림 03] |
| 휴일 자료 | 서버에서 받는 것으로 보인다(앱 안에 날짜 표 없음) | 실행 파일 문자열 |

### 15.3 추가 달력(음력) · 주 번호
| 항목 | 틱틱 | 근거 |
|---|---|---|
| 추가 달력 | 설정 › 날짜 & 시간 **"추가 달력"**: 없음 · 중국 음력 · 히브리 · 히즈라 · 인도 · **한국 음력** · 페르시아 · (베트남 음력). 기본 없음 | [FAQ - Calendar](https://help.ticktick.com/articles/7063851189372190720) "How to display Alternate Calendar?" 그림(`_help/dida-calendar-display/05`), `ko.lproj` `alternate_calendar = 추가 달력`, `korean_lunar = 한국 음력` |
| 칸에 쓰는 음력 표기 | 중국 음력은 `初一`·`十五`·달 첫날 `十一月`. **한국 음력 표기(숫자 형식)는 확인 못 함** — sprout는 `8.15`, 윤달 `윤6.1` [제안] | 디다 그림 01·03 |
| 주 번호 | 설정 › 날짜 & 시간 **"주 번호 표시(W)"** 토글, 기본 끔. 월 보기는 각 줄 첫 칸 오른쪽, 주 보기는 왼쪽 위. 영문 `W33`, 디다 `第 49 周`(월요일 시작 ISO 주 — 2025-12-01 = 49, 2025-12-29 = 1) | live README 설정, research 24 §월 보기(`W22`), 그림 01·02 |

### 15.4 한국 공휴일 자료 출처(sprout가 직접 묶는다)
- 「공휴일에 관한 법률」·「관공서의 공휴일에 관한 규정」 제2조(공휴일)·제3조(대체공휴일): 설날·추석 연휴는 일요일 또는 다른 공휴일과 겹칠 때만, 그 밖의 공휴일(3·1절·어린이날·부처님오신날·광복절·개천절·한글날·성탄절 + 2026년부터 제헌절·노동절)은 토·일·다른 공휴일과 겹칠 때 다음 첫 비공휴일. 1월 1일·현충일·선거일·임시공휴일은 대체 없음.
- 제헌절 공휴일 재지정: 2026-01-29 국회 본회의 통과([서울신문](https://www.seoul.co.kr/news/politics/congress/2026/01/29/20260129500182)). 노동절(5/1) 공휴일: 2026-03-31 국회 통과·4-6 국무회의([MBC](https://imnews.imbc.com/news/2026/politics/article/6811610_36911.html), [정책브리핑](https://www.korea.kr/news/policyNewsView.do?newsId=148962129)).
- 월력요항(우주항공청·한국천문연구원): [2026년 월력요항](https://www.korea.kr/briefing/pressReleaseView.do?newsId=156738544)(관공서 공휴일 70일, 대체 3/2·5/25·8/17·10/5 — [경남뉴스](https://www.gnnews24.kr/news/articleView.html?idxno=28394)), 2027년 월력요항(72일, 대체 2/9·5/3·7/19·8/16·10/4·10/11·12/27 — [뉴스스페이스](https://www.newsspace.kr/news/article.html?no=15867), [KASA X](https://x.com/with_KASA/status/2071460565407662383)). 2028~2030 대체공휴일은 같은 규칙으로 계산해 [대체공휴일 목록](https://holiday.kimgoon.kr/substitute)과 맞춰 봤다.
- 음력 날짜(설날·부처님오신날·추석): ICU `dangi`(한국 음력, UTC+9)로 2023-12~2031-02 달 첫날 표를 만들어 묶고, 테스트가 월력요항 발표 날짜와 맞춘다(2028 설날은 한국 1/27 — 중국 1/26과 하루 다름).
- 선거일: 2024-04-10 국회의원, 2025-06-03 대통령(조기), 2026-06-03 지방(확정). 2028-04-12 국회의원·2030-03-27 대통령·2030-06-12 지방은 공직선거법 제34조로 계산한 **예정일**(`tentative`) — 월력요항이 나오면 확인.
- 임시공휴일: 2024-10-01(국군의 날), 2025-01-27.

## 16. 팝오버 열고 닫는 움직임 (2026-10-05 영상 프레임 조사 — 06 §7.5의 근거)
사용자 피드백 "캘린더 빈 공간을 눌렀을 때 틱틱이랑 비교해서 애니메이션이 조금 딱딱한 것 같아." → 공식 영상 [EUBxb9MgYWg](https://www.youtube.com/watch?v=EUBxb9MgYWg)(TickTick, 2025-06, macOS 라이트)을 30fps 원본으로 받아 프레임 하나씩(33ms) 봤다. 프레임 번호는 클릭 뒤 첫 변화 = 1.

| 장면 | 영상 시각 | 프레임별 관찰 | 정리 |
|---|---|---|---|
| 월 빈 칸 클릭 → 빠른 만들기 | 4:09.9~4:10.1 | 1: **칸 칠(옅은 파랑)은 이미 다 칠해짐**, 카드 약 30% 비침·조금 작음(폭 약 95%, 좌우·위아래가 거의 같은 만큼 안쪽) / 2: 약 70%, 폭 약 98% / 3: 약 95% / 4: 그대로 멈춤 | 카드 = **약 100~130ms 페이드 + 0.95 → 1 확대, 가운데쯤 기준, 끝으로 갈수록 느려짐(ease-out)**. 칸 칠은 움직임 없이 바로. 월 칸에 따로 그리는 초안 막대는 없다 |
| 같은 카드 닫기(제목 쓴 채 바깥 클릭 = 저장) | 4:36.7 | 한 프레임 안에 카드·칸 칠이 함께 사라지고, 새 막대("Meeting")가 칸 맨 아래 줄에 **바로** 생김 | 닫기 = **움직임 없음(33ms 안)**, 막대도 자라는 움직임 없음 |
| 주 보기 블록 클릭 → 태스크 팝오버 | 1:22.6~1:22.8 | 1: 약 10% / 2: 약 40%, 폭 약 97%(가운데 기준) / 3: 약 80% / 4: 멈춤 | 빠른 만들기와 같은 움직임 |

- 영상은 30fps라 33ms보다 짧은 차이는 보이지 않는다. 실제 길이는 120ms 안팎으로 본다.
- 주·일 시간 칸 클릭의 선택 표시(옅은 파랑 한 줄/범위)는 끌기와 함께 바로 그려진다(§14, 같은 영상 f0022~0025).

## 17. 세로 스크롤 — 월·주·일 (2026-10-06 조사 — 06 §5.1·§7.4의 근거)
사용자 피드백 "캘린더 상하 스크롤도 틱틱처럼 자연스럽게 안 돼." → 공식 도움말 원문, 공식 영상 프레임, 설치된 Mac 앱(6.3.60) 안의 이름을 다시 봤다. 사용자 틱틱은 열거나 만지지 않았다. **[확인]** = 도움말 문장이나 영상 프레임으로 본 것, **[추정]** = 정황으로 고른 것.

### 17.1 근거
| 자료 | 내용 |
|---|---|
| 도움말 [Month View](https://help.ticktick.com/articles/7055782128335716352) 데스크톱 탭 | "Swipe up and down with two fingers on the computer touchpad, or switch using the left and right arrows in the calendar view." / "Click "Today" to quickly jump back to this month." 모바일 탭은 "Swipe up and down to switch months", 핀치로 주 수 조절(8.0, **모바일만** — What's New "Flexible Month View … Mobile only") |
| 도움말 [Week View](https://help.ticktick.com/articles/7055782149730861056) 데스크톱 탭 | "swipe left or right with two fingers on your trackpad to navigate forward or backward through the displayed weeks … or use the keyboard arrow keys (left/right/up/down)". 모바일은 "any sliding" — 빠르게 밀면 한 주, 천천히 끌면 7일 범위를 자유롭게 |
| 도움말 [Desktop Interaction Tips](https://help.ticktick.com/articles/7351523697951244288) | "In Day, Week, or Multi-Day view, hold down Shift and scroll your mouse wheel to move horizontally across dates" / "Hold Ctrl (or Command on Mac) and scroll your mouse wheel to zoom the timeline" |
| 영상 [EUBxb9MgYWg](https://www.youtube.com/watch?v=EUBxb9MgYWg) (TickTick 공식, 2025-06, macOS) 1초 프레임 | 월 보기 위아래 스크롤 장면 0:25~0:31, 1:05~1:12 — [f0009](../ticktick-captures/_video/EUBxb9MgYWg/f0009.jpg) · [f0011](../ticktick-captures/_video/EUBxb9MgYWg/f0011.jpg) · [f0012](../ticktick-captures/_video/EUBxb9MgYWg/f0012.jpg) · [f0013](../ticktick-captures/_video/EUBxb9MgYWg/f0013.jpg) · [f0016](../ticktick-captures/_video/EUBxb9MgYWg/f0016.jpg) · [f0018](../ticktick-captures/_video/EUBxb9MgYWg/f0018.jpg). 30fps 원본은 이번엔 받지 못함(YouTube 403) |
| `/Applications/TickTick.app` 6.3.60 실행 파일 이름(읽기만) | 월 보기 = `TTMonthCalViewController` + `TTCalendarCollectionView`/`TTMonthCollectionViewLayout`(세로로 이어지는 컬렉션), 주 = `TTWeekCalViewController` + `TTSingleDirectionScrollView`·`HorizontalOnlyScrollView`, `scrollWheel:` · `momentumPhase` · `hasPreciseScrollingDeltas` · `scrollViewDidEndLiveScroll:` · `handleScrollEnd` 사용 |

### 17.2 월 보기
| 항목 | 관찰 | 근거 |
|---|---|---|
| 넘기는 방식 | **[확인] 한 달씩 갈아 끼우지 않고 주 줄이 이어서 위아래로 흐른다.** 스크롤 중 프레임에서 줄이 화면 위·아래에서 반쯤 잘려 있고(f0011·f0012·f0018), 5월 5일~6월 15일처럼 달 경계와 상관없는 범위가 보인다(f0016) | EUB 프레임 |
| 트랙패드 관성 | **[추정] 있다.** 줄이 픽셀 단위로 움직이고, 앱이 `momentumPhase`·`hasPreciseScrollingDeltas`를 본다. 한 번 밀면 여러 주가 흘러간다 | 프레임 + 앱 이름 |
| 멈춘 자리 | **[추정] 주 줄 경계에 맞춰 멈춘다.** 멈춘 프레임(f0009·f0013·f0015·f0016)은 모두 맨 윗줄이 요일 줄 바로 아래에 딱 맞다. 움직이는 동안은 맞추지 않는다 | EUB 프레임 |
| 줄 높이 | **[확인] 스크롤하는 동안 줄 높이는 그대로.** 6월(6줄)에서 5월(5줄) 쪽으로 가도 줄 높이가 같다(f0013 vs f0016, 약 123px). 멈춘 상태 줄 수는 그 달에 필요한 주만큼(§5) | EUB 프레임, §5 실측 |
| 머리 제목 | **[확인] 스크롤하면서 바뀐다.** 화면에 가장 많이 보이는 달을 쓴다 — 5/12~6/22이 보이면 "June 2025"(f0009), 5/5~6/15이면 "May 2025"(f0016). 화면 가운데 줄의 달과 같다 | EUB 프레임 |
| 이번 달 진하게 | **[확인] 제목 달이 바뀌면 진한 날짜도 따라 바뀐다.** "June"일 때 5월 숫자가 회색, "May"일 때 6월 숫자가 회색 | f0012 vs f0016 |
| 떠 있는 달 이름 | **[확인] 스크롤하는 동안 각 달 1일이 든 줄 왼쪽 첫 칸 위에 큰 굵은 달 이름("June 2025", "July 2025")이 겹쳐 뜬다.** 날짜 숫자 줄 높이, 글자 약 26pt 굵게. **[추정] 멈추면 사라진다**(멈춘 f0013에는 없음, 멈춘 직후 f0009·f0015에는 아직 있음 → 잠깐 뒤 흐려짐) | EUB 프레임 |
| ‹ › · ← → · 오늘 | **[확인] 한 달씩 / 이번 달로.** **[추정]** 움직임은 같은 세로 스크롤로 미끄러진다(애니메이션 길이는 미확인) | 도움말 |
| 마우스 휠 | **[추정]** 한 칸(노치)마다 한 주씩 | 앱이 정밀/비정밀 휠을 나눔 |

### 17.3 주·일 보기
| 항목 | 관찰 | 근거 |
|---|---|---|
| 시간 칸 세로 | **[확인] 보통 스크롤**(관성 있음, 줄에 맞추지 않음). 종일 영역·날짜 줄은 위에 고정 | 도움말 Week View 그림 20~22, §3 |
| 좌우 | **[확인] 두 손가락 좌우 = 이전·다음 주**, Shift+휠 = 가로로 날짜 넘김, ⌘/Ctrl+휠·핀치 = 시간 칸 확대 | 도움말 |
| 처음 위치 | **[추정]** 오늘이 보이면 지금 시각 근처, 아니면 아침(06 §4.1 [임시] 그대로) | — |

### 17.4 멀티데이 · 다중 주 · 일정(Agenda)
- **[확인]** 멀티데이·다중 주는 데스크톱만("Multi-Day View and Multi-Week View are available on desktop only"). 스크롤 방식은 자료에 없다 → **[추정]** 멀티데이 = 주 보기와 같은 시간 칸, 다중 주 = 월 보기와 같은 이어지는 주 줄. Agenda는 `TTAgendaScrollView`·`TTAgendaCalLoadingDateCell`(끝에 닿으면 날짜를 더 불러오는 목록)로 보아 **[추정] 끝없는 세로 목록**. sprout v1에는 세 보기 모두 없음(06 §3 [후보]).

### 17.5 sprout에 주는 결론
- 월 보기는 **이어지는 주 줄 스크롤 + 멈추면 주 경계에 맞춤 + 제목·진한 달이 스크롤 따라 바뀜 + 스크롤 중 달 이름 겹침**으로 바꾼다. 휠 한 번에 한 달을 넘기던 sprout 방식(누적 60px → 한 달, 450ms 잠금)은 틱틱과 다르고, 트랙패드 관성 꼬리가 다음 달을 한 번 더 넘기는 원인이었다.
