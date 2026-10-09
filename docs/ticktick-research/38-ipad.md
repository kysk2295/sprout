# 틱틱 조사: iPad 앱 — 배치(세로·가로·나눠 보기) · 캘린더 · 키보드 · 포인터 · Pencil · 멀티태스킹 (2026-10-09)

- 요청(2026-10-09): "아이패드도 시안을 만들어줘. 이것도 틱틱을 참고해서 해줘" — iPad판은 출시 뒤 1.1 업데이트(지금 휴대폰 앱은 `supportsTablet: false`). 이 문서는 [46 iPad 명세](../screens/46-ipad.md)·[시안](../screens/mockups/ipad.html)의 근거다.
- 방법: App Store iPad 스크린샷 4장(1286×964로 받아 눈으로 읽음, 저장소에 넣지 않음), 틱틱 도움말 센터 글 97개 본문(도움말 페이지의 `__NEXT_DATA__`에서 뽑아 `iPad`·`tablet`·`pencil`·`split view`·`trackpad` 검색), Apple 지원 문서, 리뷰 글. 실기기 iPad로 틱틱을 열어 보지는 못했다.
- 표기: **[확인]** 자료에서 직접 봄 · **[추정]** 다른 자료·휴대폰/데스크톱 동작에서 짐작(실기기 확인 필요) · **[없음]** 찾아봤지만 틱틱 자료에 없다
- 결론 한 줄: **틱틱 iPad = 데스크톱 배치 그대로(색 레일 + 리스트 사이드바 + 목록 + 상세 3단) + 손가락 크기.** 좁아지면 상세가 "옆 칸 ↔ 팝업"으로 바뀌고, 아주 좁으면 휴대폰 배치. Pencil 전용 기능·iPad 전용 단축키 문서는 없다.

## 0. 출처
| # | 자료 | 무엇을 봤나 |
|---|---|---|
| S1 | [App Store 틱틱 iOS(iPad 스크린샷)](https://apps.apple.com/us/app/ticktick-to-do-list-calendar/id626144601?platform=ipad) — 스크린샷 4장 "Intelligent Management" · "Calendar" · "Reminder" · "Eisenhower Matrix" | 가로 iPad 배치, 레일·사이드바·목록·상세, 캘린더 머리와 보기 전환, 날짜 팝오버 |
| S2 | 같은 페이지 정보 | "Requires iPadOS 15.5 or later", iPhone·iPad·Watch 하나로 구매 |
| S3 | [도움말 Updates in 2024 — "Tablet UI Enhancements"(3월 5일)](https://help.ticktick.com/external/articles/7301088783166865408) | "task detail page will now intelligently switch between split column or pop-up style depending on your usage scenario", Android 태블릿 내비게이션 왼쪽, 캘린더 보기 쉽게 바꾸기, Android 태블릿 칸반 여러 열 |
| S4 | [도움말 Show Tasks with Calendar](https://help.ticktick.com/articles/7358389904469917696) | 앱 안 "나눠 보기"(할 일 + 캘린더 나란히), 끌어서 일정 잡기, 닫기 |
| S5 | [도움말 Widgets](https://help.ticktick.com/articles/7055780404896202752) · [What's New(2026-10-08)](https://help.ticktick.com/articles/7082552170989486080) | "StandBy widgets are currently not supported on iPad", iOS 27 아주 큰 위젯 |
| S6 | [도움말 Week View](https://help.ticktick.com/articles/7055782149730861056) (desktop 탭) | 트랙패드 두 손가락 좌우 = 주 넘기기, 핀치 = 시간 눈금 확대(데스크톱) |
| S7 | [Toolfinder — Best To-Do List Apps for iPad (2026-09-12 갱신)](https://toolfinder.com/best/to-do-list-apps-for-ipad) | "multi-column layout showing your lists, tasks, and details", Split View·Slide Over 지원, "Calendar view works particularly well on the bigger screen" |
| S8 | [Apple — iPad 키보드 단축키](https://support.apple.com/en-ph/102393) · [외장 키보드 단축키](https://support.apple.com/guide/ipad/use-shortcuts-ipaddf61a0c2/ipados) | 앱 단축키 목록 보기: iPadOS 26은 화면 위 가운데에서 아래로 쓸어 메뉴 막대 → 메뉴, 이전 iPadOS는 ⌘ 길게 누르기 |
| S9 | [iPadOS 26 멀티태스킹 안내(Slatepad, 2026-01)](https://slatepad.org/2026/01/24/ipados-26-multitasking-guide/) · [Apple — Stage Manager](https://support.apple.com/guide/ipad/organize-windows-with-stage-manager-ipad1240f36f/ipados) | 전체 화면 · 창 · Stage Manager 세 모드, 반·삼분·네 귀퉁이 타일, Slide Over는 26.1에서 돌아옴(한 앱만), 창 수 제한 없음 |
| S10 | [Apple — Scribble로 글자 입력](https://support.apple.com/guide/ipad/enter-text-with-scribble-ipad355ab2a7/ipados) | Pencil 손글씨 → 모든 글 입력 칸에서 글자로(시스템 기능, 앱이 따로 할 일 없음) |
| S11 | [Apple HIG — Split views](https://developers.apple.com/design/human-interface-guidelines/components/layout-and-organization/split-views/) | 사이드바 · 목록 · 내용 3열, 좁으면 접힘 |
| 기존 | [research 06 데스크톱 인터랙션](06-desktop-interactions.md) · [16 단축키](16-shortcuts.md) · [14 캘린더 나눠 보기](14-calendar-month-split.md) · [24 모바일 UI](24-mobile-ui.md) · [29 타임라인](29-timeline-view.md) | 데스크톱·휴대폰 쪽 동작(iPad가 둘 중 무엇을 따르는지 판단할 때) |

## 1. 배치 — 가로 (전체 화면)
### 1.1 할 일 화면 [확인 — S1 "Intelligent Management"·"Reminder"]
```
┌────┬──────────────┬──────────────────────────┬────────────────────┐
│레일 │ 사이드바       │ ☰   다음 7일           ⋯ │ □  ⏰ 오늘, 5월 6일 11:00  ⚑│
│(색) │ 전체      59  │ 목, 오늘             5 ⌄ │ 제목                │
│ 👤 │ 오늘       5  │ ┃□ 팀 회의       9:00 AM │ 설명 …              │
│ ✓  │ 다음 7일  13  │ ┃□ 기획서       11:00 AM │                    │
│ 📅 │ 나에게 배정 3  │  □ 생일 선물        오늘 │                    │
│ ◎  │ 기본함     5  │ 금, 내일             3 ⌄ │                    │
│ ⏱ │ 태그       ‹  │  □ 요가          7:00 PM │                    │
│ 🔍 │ 완료          │ …                        │                    │
│ ⚙  │ 😌 쉬기  5 ‹  │                          │                    │
│    │ …  보관한 리스트│                          │                    │
└────┴──────────────┴──────────────────────────┴────────────────────┘
```
- **레일**: 화면 왼쪽 끝 세로 막대가 **테마색으로 칠해져 있다**(파랑·분홍·초록 테마 모두 레일 전체가 테마색, 아이콘은 흰색). 맨 위 아바타, 아래로 할 일 ✓ · 캘린더(오늘 날짜 숫자) · 매트릭스 · 집중(◎) · 습관 · 검색 · 설정. 데스크톱 레일과 같은 순서·같은 역할 [확인]. 레일 폭 ≈ 40pt(스크린샷 비율 환산, [추정]).
- **사이드바**: 스마트 목록(전체 · 오늘 · 다음 7일 · 나에게 배정 · 기본함) → 태그(‹ 접힘) → 완료 → 리스트들(이모지 + 이름 + 개수, 폴더는 ‹) → 보관한 리스트. 행 ≈ 38pt, 고른 행 = 테마색 옅은 면 [확인]. 폭 ≈ 250pt [추정].
- **목록**: 머리 = 왼쪽 **☰(사이드바 접기)** · 가운데 제목 · 오른쪽 ⋯. 날짜 묶음마다 흰 카드(묶음 머리 `THU, TODAY` + 개수 + ⌄), 행 왼쪽 얇은 리스트 색 띠, 체크 칸 테두리 = 우선순위 색, 오른쪽 시각·날짜(테마색 글자) [확인]. 데스크톱 목록과 같은 구성.
- **상세**: 세 번째 열. 머리 = 체크 칸 · `⏰ Today, May 6, 11:00 AM` · ⚑(우선순위 깃발). 날짜를 누르면 **상세 위에 팝오버**(Clear · Date/Duration 세그먼트 · 월 달력 · 시간 · 미리 알림 · 반복 · 취소/완료)와 나머지 화면은 회색 막 [확인 — S1 Reminder].
- 목록 열 폭 ≈ 상세 열 폭(스크린샷에서 둘이 비슷) [확인 — 비율만].

### 1.2 캘린더 [확인 — S1 "Calendar"]
- **사이드바 없이 레일 + 캘린더 전체 폭.** 머리 = 왼쪽 큰 달 이름 `May` · 가운데 세그먼트 **List · Day · 3 Day · Week · Month**(고른 것 = 테마색 옅은 알약) · 오른쪽 📅(오늘로/날짜 고르기) · ⋯.
- 월 보기: 요일 머리 S M T W T F S, 칸마다 날짜 숫자(오늘 = 테마색 원) + **색 막대**(리스트 색 옅은 면 + 진한 글자) 여러 줄. 지난 일정은 옅게 [확인].
- **List 보기**(같은 스크린샷의 작은 두 번째 화면): 위 작은 월 달력(일정 있는 날 점) + 아래 `TODAY` 할 일 목록(체크 · 제목 · 아래 리스트 이름 · 오른쪽 `Today, 9:00 AM`). 휴대폰 캘린더 "목록" 보기와 같은 구성. 이 두 번째 화면이 **세로 iPad인지 좁은 창인지는 자료로 알 수 없다** [추정 — 세로 또는 나눠 보기].
- 3 Day · Week 보기의 iPad 모양은 스크린샷 없음 → 데스크톱 주 보기와 같다고 본다 [추정 — S6 데스크톱 주 보기, S3 "Easily switch between different views on the calendar page"].

### 1.3 기타 화면
- 아이젠하워 매트릭스: 레일 + 전체 폭 2×2 카드 [확인]. 꿈틀엔 없는 기능(PRD 범위 밖).
- 칸반: "Android tablet: Kanban is displayed in a multi-column format" — 태블릿은 칸반 열 여러 개를 나란히 [확인 — S3, Android]. iPad도 넓으면 여러 열 [추정].
- 타임라인: iPad 자료 없음. 데스크톱 타임라인(research 29)이 넓은 화면 전제라 iPad 가로에서도 같은 모양으로 본다 [추정].
- 설정: iPad 자료 없음. 휴대폰처럼 묶음 카드 목록, iPad에선 왼쪽 목록 + 오른쪽 내용 2열(iOS 설정 앱 관례) [추정].

## 2. 세로 · 나눠 보기 · 좁은 창에서 접히는 법
| 상황 | 틱틱 | 근거 |
|---|---|---|
| 상세 열 ↔ 팝업 | "task detail page will now intelligently switch between **split column** or **pop-up** style depending on your usage scenario" — 넓으면 옆 열, 좁으면 위에 뜨는 시트 | [확인 — S3] |
| 사이드바 | 목록 머리 ☰로 접고 편다(가로에서도) | [확인 — S1 ☰ 아이콘] / 세로에서 처음부터 접히는지는 [추정] |
| 세로 전체 화면(820pt) | 레일 + 목록 + (상세 열 또는 팝업). 사이드바는 ☰로 겹쳐 뜸 | [추정] — S3의 "상황에 따라"를 폭 기준으로 해석 |
| Split View 1/2(11" 가로 ≈ 590pt) · 1/3(≈ 375pt) · Slide Over | 가로 크기 등급이 compact가 되면 **휴대폰 배치**(아래 탭 막대, 사이드바 = 서랍, 상세 = 아래 시트) | [추정] — UIKit 범용 앱의 기본 동작 + S7 "works particularly well as side panels" |
| Split View·Slide Over 지원 자체 | 지원(전체 화면 고정 아님) | [확인 — S7] |
| Stage Manager · 여러 창(같은 앱 두 창) | 자료 없음 | [없음] |
| 회전 | 가로·세로 모두 | [확인 — S1 가로 스크린샷 + 세로 작은 화면] |

- iPadOS 26 창 모드에서는 창을 아무 폭으로나 늘이고 줄이므로(S9), **고정된 "1/2·1/3" 대신 창 폭에 따라 배치를 고르는 규칙**이 필요하다. Apple 관례: 가로 크기 등급 regular ↔ compact 경계는 기기·분할에 따라 다르다(11" 가로 1/2 = compact, 13" 가로 1/2 = regular).

## 3. 입력 — 빠른 추가 · 키보드 · 포인터 · Pencil
### 3.1 빠른 추가
- iPad 스크린샷에 + 버튼은 보이지 않는다. 데스크톱처럼 **목록 맨 위 "할 일 추가" 입력 줄**인지 휴대폰처럼 떠 있는 + 인지 자료 없음 [없음]. 꿈틀은 목록 맨 위 입력 줄(데스크톱 02) + compact에서 + 버튼(휴대폰 22)으로 정한다.
- 자연어 인식·`#` `~` `!`은 플랫폼 공통 [확인 — research 01·02].

### 3.2 하드웨어 키보드 단축키
- 틱틱 도움말의 단축키 글(`⌨️ Desktop Shortcuts`, `🔜 Shortcuts`)은 **데스크톱(Windows·Mac·웹)** 표다. iPad 전용 표는 없다 [없음].
- iPad에서 앱 단축키를 보는 법(시스템): iPadOS 26 = 화면 위 가운데에서 아래로 쓸거나 포인터를 맨 위로 → **메뉴 막대**에서 메뉴를 열면 단축키가 옆에 보인다. iPadOS 15~18 = **⌘ 길게 누르기 → 단축키 판**(앱이 등록한 UIKeyCommand 목록) [확인 — S8].
- 틱틱 iPad가 어떤 키를 등록했는지는 실기기로만 볼 수 있다 [없음]. 꿈틀은 데스크톱에서 정한 키(⌘N · ⌘K · ⌘F · ⌘, · ⌘S · ⌘\ · g+글자 · ?)를 iPad에도 그대로 두고 iPad 관례(⌘1~5 화면 바꾸기, ⌘↵ 저장, Esc 닫기, ↑↓ 고르기, Space 완료)를 더한다 [sprout].

### 3.3 트랙패드·마우스 포인터
- 데스크톱 도움말의 트랙패드 동작(두 손가락 좌우 = 기간 넘기기, 핀치 = 시간 눈금 확대)은 iPad에도 같은 손짓이 있다 [추정 — S6은 desktop 탭].
- 우클릭 메뉴: iPadOS는 트랙패드 두 손가락 클릭·마우스 오른쪽 버튼 = 길게 누르기 메뉴(UIContextMenu)라 **휴대폰 길게 누름 메뉴가 그대로 우클릭 메뉴**가 된다 [추정 — iPadOS 관례]. 도움말의 "Right-click the task icon → Show with Calendar"(S4)는 데스크톱 기준이다.
- 포인터 호버(행 위에 올리면 옅은 면): iPadOS 포인터 효과 기본 [추정].

### 3.4 Apple Pencil
- 틱틱 자료에 Pencil 전용 기능(손글씨 메모·그리기·Pencil로 끌기)은 **없다** [없음 — S1·S2·도움말 97개 모두].
- 시스템 **Scribble**은 모든 글 입력 칸에서 손글씨를 글자로 바꾼다 — 빠른 추가·제목·설명에 앱이 따로 할 일 없이 된다 [확인 — S10]. Pencil로 누르기·끌기는 손가락과 같다.

### 3.5 끌어 놓기
- 앱 안: 할 일을 캘린더 칸으로 끌어 일정 잡기(S4, 나눠 보기에서), 사이드바 리스트로 끌어 옮기기, 하위 할 일로 넣기 [확인 — S4·도움말 Task, 데스크톱·휴대폰 공통].
- **앱 사이**(다른 앱의 글·링크를 틱틱으로 끌어와 할 일 만들기, 틱틱 할 일을 메모 앱으로 끌어내기): 자료 없음 [없음]. 휴대폰의 "공유하기로 수집"(꿈틀 24)이 같은 일을 한다.

## 4. 위젯 · 기타
- iPad 홈 화면 위젯: 휴대폰과 같은 종류(목록·캘린더·습관 등) + iPadOS의 아주 큰 크기(XL). 2026-10 What's New "Extra-Large Widgets"는 iOS 27 iPhone 기준 [확인 — S5].
- **StandBy 위젯은 iPad 미지원** [확인 — S5]. 잠금 화면 위젯은 iPadOS 17+ 시스템이 지원(틱틱 iPad 지원 여부 [없음]).
- Apple Watch·Live Activities는 iPad와 무관.
- 하나로 구매(universal): iPhone 앱을 사면 iPad도 같은 앱 [확인 — S2]. 꿈틀도 같은 번들(`app.sprout.mobile`)에 iPad를 켜는 방식.

## 5. 꿈틀에 가져갈 것 (46 명세 입력)
1. **넓으면 데스크톱 배치, 좁으면 휴대폰 배치** — 틱틱 iPad가 데스크톱 레일·사이드바·목록·상세를 그대로 쓴다(§1.1). 꿈틀 데스크톱 01(레일 66 · 사이드바 264 · 상세 336)의 정보 구조를 그대로 옮기고 누르는 칸만 44pt로.
2. **레일은 테마색으로 칠하지 않는다** — 틱틱 iPad는 레일을 테마색으로 칠하지만, 꿈틀 데스크톱 레일(01 §3)은 면 색 + 고른 아이콘만 강조색이다. 데스크톱과 같게 간다(44 "할 일 자리는 차분하게").
3. **상세 = 넓으면 열, 좁으면 팝업**(S3) — 폭 기준으로 정한다.
4. **캘린더는 사이드바 없이 전체 폭 + 머리 세그먼트**(§1.2) — 꿈틀 데스크톱 06과 같다.
5. Pencil은 시스템 Scribble만(틱틱도 전용 기능 없음). 앱 사이 끌어 놓기·여러 창은 틱틱 근거가 없어 [다음].
6. 단축키는 데스크톱 표 + iPad 관례, 메뉴 막대(iPadOS 26)·⌘ 판(이전)에 이름이 보이게 등록.

## 6. 못 본 것 (실기기 iPad로 확인할 것)
1. 세로 전체 화면에서 사이드바·상세가 처음에 어떻게 보이는지(§2 [추정]).
2. Split View 1/2·2/3에서 바뀌는 정확한 폭.
3. iPad 틱틱이 등록한 단축키 목록(메뉴 막대 / ⌘ 판).
4. 빠른 추가 진입(+ 버튼인지 입력 줄인지), 상세 팝업의 모양(가운데 폼 시트인지 오른쪽 시트인지).
5. 같은 앱 두 창(Stage Manager), 앱 사이 끌어 놓기.
