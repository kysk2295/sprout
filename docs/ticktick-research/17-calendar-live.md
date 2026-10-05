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
