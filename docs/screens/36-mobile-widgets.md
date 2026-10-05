# 36 · 모바일 홈 화면 위젯 (iOS WidgetKit · Android AppWidget) — 월 캘린더 · 오늘 할 일 · 캐릭터

- 상태: **초안 v0.9 → 구현** (2026-10-05) — 사용자 요청 "틱틱처럼 이 위젯(큰 월 캘린더)이 필요해. 모바일 위젯도 이거랑 마찬가지야." [임시] 값은 실기기에서 고친다.
- 근거: [25 맥 위젯](25-mac-widget.md)(데이터 계약·체크 대기열·상태·색 규칙 — **이 문서는 25의 휴대폰판**, 다른 점만 적는다), [06 캘린더 §16](06-calendar.md)(공휴일·주말 색), [20 §7](20-mobile-overview.md)(모바일 월 보기 칸 모양), [10 성장](10-growth.md)
- 틱틱 조사: [research 23](../ticktick-research/23-mac-widgets.md), [research 20 §5](../ticktick-research/20-mobile.md), 아래 §1
- 표기: **[틱틱]** 확인된 틱틱 동작 · **[sprout]** 새 설계 · **[임시]** 확인 전 값 · **[다음]** 이번 범위 밖

## 0. 결정
| # | 질문 | 결정 | 왜 |
|---|---|---|---|
| W1 | 위젯 몇 가지? | **3가지**: ① **월 캘린더**(크게) ② **오늘 할 일**(작게·중간) ③ **캐릭터**(작게) | ①은 사용자가 보여 준 틱틱 Monthly Calendar View, ②는 틱틱 Tasks(Today), ③은 sprout 고유(맥 위젯 25 ②의 작게) |
| W2 | 월 위젯 주 시작 | **월요일**(앱 캘린더와 같다 — 2026-10-05 사용자 결정) | 틱틱 그림은 일요일 시작이지만 앱 안 캘린더와 달라지면 헷갈린다 |
| W3 | 월 위젯 ‹ › 달 넘기기 | **한다**(iOS 17+ 버튼 · Android 버튼). 지난달 ~ 두 달 뒤(4달)까지 [임시] | 틱틱 iOS 월 위젯 머리에 ‹ 달 › 가 있다(§1). 앱이 4달 치를 미리 넘긴다 — 위젯은 DB가 없다 |
| W4 | 위젯 체크 반영 | 25 D4와 같다: 위젯은 **대기열에 쓰고 바로 체크 모양**, 실제 완료·XP는 앱이 정상 완료 경로(taskCore)로. 앱이 앞으로 올 때·백그라운드 새로 고침 때 반영. **Android는 앱 프로세스가 살아 있으면 즉시** | 위젯이 DB·XP 규칙을 갖지 않는다(25 §8.1) |
| W5 | 색 | 밝기·어둡기는 **휴대폰 시스템**을 따르고, 강조색은 사용자 테마(25 §5.2와 같은 계산). 공휴일·일요일 빨강, 토요일 파랑(06 §16) | 25 D3과 같다 |
| W6 | App Group(iOS) | **`group.app.sprout.mobile`**(공유 확장 24와 같은 칸) — 지금은 시뮬레이터(서명 팀 없이)로 확인, 실기기 서명은 친구 Apple 계정으로 나중에(docs/release/HANDOVER.md "위젯") | iOS는 `group.` 이름 + 프로비저닝 프로파일이 정석. 맥(25 §8.2)과 규칙이 다르다 |
| W7 | iOS 버전 | 위젯은 **iOS 17 이상**(체크·‹ › 버튼 = 대화형 위젯). 16.x에서는 위젯만 갤러리에 없다 | 앱 최소 16.4는 그대로 |

## 1. 틱틱 기준 자료
| 주제 | 자료 | 내용 |
|---|---|---|
| 모바일 위젯 종류 | 틱틱 도움말 [Widgets](https://help.ticktick.com/articles/7055780404896202752) (2026-10-03 수정본) iOS 탭 | **Tasks**: "Tasks"·"Task Completions"·"Add Task" / **Calendar**: "Today's Calendar"·"Daily View"·"**Monthly Calendar View** — All events for the month are displayed at a glance, making it easy to see when you are busy and when you are free." / Matrix·Habits·Focus·Countdown. "iOS 27 이후 일부 위젯 extra-large" |
| iOS 월 위젯 모양 [그림] | 같은 글 Calendar 그림(왼쪽 위 위젯) | 머리 가운데 **‹ September ›**(강조색), 요일 줄(S M T W T F S), 칸마다 날짜 숫자(왼쪽 위, **오늘 = 강조색 채운 원 + 흰 숫자**), 칸 안 **항목 막대**: 리스트 색 옅은 채움 + 왼쪽 진한 세로 줄 + 제목(잘림), 지난 날 항목은 더 옅게. 칸 사이 세로 구분선. 오른쪽 아래 **강조색 원형 `+`** |
| 맥 월 위젯 [그림] | 같은 글 macOS 그림(Monthly Calendar View 갤러리, 중간) | "May" 머리, 요일 줄(토·일 파랑 글자), 칸 막대 = 리스트 색 채움 + 제목, 넘치면 날짜 줄 오른쪽 **"+2"**(강조색), 오늘 = 강조색 원 |
| Windows 월 위젯 [그림] | 같은 글 Windows 그림 | 칸마다 막대 3개 + 넘치면 "6 more", 여러 날 막대는 칸을 이어 그림, 다른 달 날짜 회색 |
| Tasks(Today) 위젯 [그림] | 같은 글 Tasks 그림 | 중간: "Today 14"(강조색) + 오른쪽 `+`, 행 = 우선순위 색 사각 체크박스 · 제목 · 오른쪽 시각(강조색). 크게: 13행. "Add Task" 작게 = 제목 + 오른쪽 아래 `+` |
| 체크 | 같은 글 FAQ + [TidBITS 2025-08](https://tidbits.com/2025/08/14/ticktick-provides-a-focused-daily-task-list-and-more/) | iOS 대화형 위젯에서 체크박스로 바로 완료, 제목 = 앱에서 열기(research 23 §4) |
| 편집 | 같은 글 FAQ | "위젯을 길게 눌러 Theme·View·Auto Dark Mode 설정" → sprout v1은 설정 없음 [다음] |
| Android 추가 | 같은 글 Android 탭 | 홈 화면 길게 누름 → 위젯 → TickTick (Pixel·Samsung 절차) |
- 그림·아이콘 원본은 저장하지 않았다(글로만, CLAUDE.md).
- ⚠️ 확인 못 한 것: 틱틱 월 위젯 칸 하나에 막대가 최대 몇 개인지(그림은 3~6), 날짜를 누르면 어디로 가는지(도움말에 없음 → 앱 캘린더 그날로 **[sprout 추정]**), 다크 모양.

## 2. 위젯 목록
| 위젯 (갤러리 이름 · 설명) | iOS 크기 | Android 크기(기본 · 최소) | 출처 |
|---|---|---|---|
| **월 캘린더** · "이번 달 일정을 한눈에 봐요" | 크게(large) | 4×4 칸 · 3×3 [임시] | [틱틱] Monthly Calendar View |
| **오늘 할 일** · "오늘 할 일을 보고 바로 체크해요" | 작게 · 중간 | 4×2 · 2×2 | [틱틱] Tasks |
| **캐릭터** · "내 캐릭터의 레벨과 XP를 봐요" | 작게 | 2×2 | [sprout] (25 §3.3) |
- 갤러리 미리보기는 예시 데이터(25 §2와 같은 문구). 실제 할 일 제목을 갤러리에 보이지 않는다.
- 잠금 화면 위젯·Live Activity·Android 상주 알림·위젯 설정(리스트 고르기·테마)은 [다음].

## 3. 레이아웃
### 3.1 월 캘린더 — 크게 [틱틱 iOS 모양 + 앱 월 칸]
```
┌──────────────────────────────────────────┐
│            ‹    10월    ›            ( + ) │ ← 머리 24: 가운데 달 이름(강조색 15 굵게), 양옆 ‹ ›(강조색 13)
│  월   화   수   목   금   토   일          │ ← 요일 줄 14: 10pt, 토 파랑 · 일 빨강
│ 29  30 │1    │2    │③개천절│4   │5     │ ← 날짜 숫자 11pt 왼쪽 위, 다른 달 = 옅게
│        │▌회의 │▌보고서│     │    │▌등산  │ ← 막대 높이 12: 리스트 색 18% 채움 + 왼쪽 2pt 진한 줄 + 9pt 제목(잘림)
│        │▌점심 │      │     │    │      │
│        │+2   │      │     │    │      │ ← 넘침 "+N" 9pt 보조색
│ ...                                     │ ← 5줄 또는 6줄(그 달에 필요한 만큼)
└──────────────────────────────────────────┘
```
| 요소 | 모양 | 출처 |
|---|---|---|
| 머리 | 가운데 `10월`(올해) / `2027년 1월`(다른 해) — 앱 캘린더 머리(20 §7 `monthTitle`)와 같은 글. 양옆 ‹ ›. **오른쪽 끝 `+`** 원 18(강조색 채움, 흰 +) | [틱틱 iOS] 원형 +는 틱틱이 오른쪽 아래, sprout은 머리 오른쪽 — 막대와 겹치지 않게 [sprout] |
| 요일 줄 | `월 화 수 목 금 토 일`, 토 = 토요일 파랑, 일 = 빨강(06 §16 색) | [틱틱] + 06 §16 |
| 칸 | 7열 같은 폭, 줄 사이 옅은 선(`color.border.divider`), 칸 사이 세로선 없음(앱 월 칸과 같다) | 20 §7 |
| 날짜 숫자 | 11pt. **오늘 = 강조색 채운 원 16 + 흰 굵은 숫자**. 일요일·공휴일 빨강, 토요일 파랑, 다른 달 날짜 45% 옅게 | [틱틱] + 06 §16 |
| 공휴일 이름 | 숫자 오른쪽 8pt 빨강 한 줄(`개천절`, 잘림) — 휴일 표시 설정(06 §16)이 꺼져 있으면 없음 | 06 §16 "칸 오른쪽 이름" |
| 막대 | 할 일 = 리스트 색, 일정 = 일정 색, 색 없으면 강조색. 채움 18%(완료·지난 것 8%) + 왼쪽 2pt 줄(같은 색, 완료·지난 것 40%) + 제목 9pt(완료·지난 일정 = 3단계 글자색). 취소선 없음(06 §14.2). 여러 날 할 일은 걸친 날마다 따로 그린다(칸을 잇지 않음 [sprout — 위젯 칸 단순화]) | 20 §7 앱 월 칸 + [틱틱 iOS 왼쪽 줄] |
| 막대 수 | 칸 높이에서 계산: 6줄 달 = 2개, 5줄 달 = 3개 [임시]. 넘치면 마지막 자리에 `+N`(N = 못 보인 수) | 20 §7 `cellSummary` |
| 순서 | 앱 월 칸과 같다: 종일·여러 날 먼저 → 시각순 → 우선순위(`itemsOnDay`) | 20 §7 |
| 반복 | 미래 회차는 그리지 않는다(앱 월 보기와 같다 — 06 §12 "미래 회차" 표시는 데스크톱 옵션) | 20 §7 |

### 3.2 오늘 할 일 — 작게 · 중간 [틱틱 Tasks]
- **25 §3.1(작게)·§3.2(중간)와 같다.** 작게 = 머리 + 제목 5줄(체크박스 없음, 통째로 눌림). 중간 = 머리 `오늘 N` + `+` · 체크박스 행 5줄(넘치면 4줄 + `+N개 더`).
- 행 높이 22, 체크박스 15(iOS 손가락 크기 — 맥 13보다 크게 [임시]).

### 3.3 캐릭터 — 작게 [sprout]
- 25 §3.3과 같다: 캐릭터 그림 64 · 이름 + `Lv 4 · 꼬마` · XP 막대 · `다음 레벨까지 40 XP`. 그림은 앱이 PNG로 구워 넘긴다(§7.3).

## 4. 상태 (25 §4와 같은 표, 다른 점만)
| 상태 | 월 캘린더 | 오늘 할 일 · 캐릭터 |
|---|---|---|
| 처음(앱을 한 번도 안 열었음) | 가운데 `sprout을 한 번 열어 주세요` | 25 §4 |
| 로그아웃 | `로그인이 필요해요` + `sprout 열기` | 25 §4 |
| 빈 달 | 칸만 그린다(막대 없음). 앱 06 §11의 "이번 달 일정이 없어요" 문구는 위젯에 넣지 않는다(칸이 가려진다) | 25 §4 |
| 오래된 데이터(저장 파일의 날짜 ≠ 오늘) | 그대로 그리되 **오늘 원은 위젯의 진짜 오늘**로 옮긴다(달력은 어제 것이어도 틀리지 않는다). 달이 바뀌어 첫 달이 지난달이 되면 이번 달로 보정 | 25 §4 (목록 대신 안내) |
| 넘긴 달이 받은 범위 밖 | ‹ › 가 흐려지고 눌러도 그대로 | — |
| 체크 반영 대기 | — | 25 §4 (채운 체크박스 + 흐린 제목, 60초 넘으면 `sprout을 열면 반영돼요`) |

## 5. 색 · 테마
- 25 §5와 같다(면·글자색은 00 Default·Dark, 강조색은 앱이 계산한 `theme.accentLight/Dark`). 공휴일 빨강 `#E5484D`(다크 `#F2555A`), 토요일 파랑 `#3D74E0`(다크 `#6B9CFF`) — `tokens` 값 그대로.
- iOS 18 착색(tinted) 홈 화면: 머리·오늘 원·체크박스·XP 막대를 `widgetAccentable()`. 막대 색은 단색이 된다(시스템 동작).

## 6. 인터랙션
| 어디를 | 무엇이 | 주소 | 출처 |
|---|---|---|---|
| 월: 날짜 칸 | 앱 **캘린더 탭 월 보기, 그날 고름** | `sprout://calendar?date=2026-10-07` | [sprout 추정] (도움말에 없음) |
| 월: 막대 | 그 할 일 상세 / 그 일정 시트 | `sprout://task/<id>` · `sprout://event/<id>` | [틱틱 Tasks 제목과 같은 규칙] |
| 월: `+N` | 그날 캘린더(날짜 칸과 같다) | `sprout://calendar?date=…` | [sprout] |
| 월: ‹ › | 위젯 안에서 달 넘김(앱 안 열림). 위젯마다 따로 기억, 자정·앱 새 저장 때 이번 달로 돌아오지 않는다(사용자가 고른 달 유지) [임시] | iOS AppIntent · Android 브로드캐스트 | [틱틱 iOS] |
| 월: 머리 달 이름 | 이번 달로 돌아옴(넘겼을 때만) — 앱 캘린더 머리 "누르면 오늘로"와 같다 | 같음 | 20 §7 |
| 월: `+` | 빠른 추가(오늘 날짜) | `sprout://quick-add?view=date:<오늘>` | [틱틱] |
| 오늘: 체크박스 | 앱 열지 않고 완료(대기열) — 다시 누르면 대기 취소 | iOS `ToggleTaskIntent` · Android 브로드캐스트 | 25 §6 |
| 오늘: 제목 · `+` · 머리 · `+N개 더` · 작게 | 25 §6 그대로 | `sprout://task/<id>` · `sprout://quick-add?view=smart:today` · `sprout://today` | 25 §6 |
| 캐릭터 | 성장 탭 | `sprout://growth` | 25 §6 |
- 딥 링크는 보기·이동만(25 §6 마지막 줄). 링크 검사: 날짜는 `YYYY-MM-DD`, id는 `[A-Za-z0-9_-]`만.

## 7. 기술 설계
### 7.1 전체 그림
```
 sprout 앱(RN) ── src/widgets/useWidgets.ts ─┬─ 표 변경 1초 모음 → buildWidgetSnapshot(@sprout/schema/widget + 모바일 views·calendar)
                                            ├─ 캐릭터 그림 굽기(react-native-svg toDataURL → PNG)
                                            ├─ 앞으로 올 때·백그라운드 작업·(Android) 위젯 신호 → 대기열 반영(completeTasks)
                                            └─ modules/sprout-widgets(Expo 모듈) setSnapshot / writeArt / takeActions / clear
 iOS:     App Group group.app.sprout.mobile/widget/{snapshot.json, art/*.png, actions/*.json, nav.json} ← SproutWidget.appex(SwiftUI, iOS 17+)
 Android: 앱 files/widget/{snapshot.json, art/*.png} + SharedPreferences(대기열·달 넘김) ← AppWidgetProvider 3개(Kotlin, RemoteViews)
```
- iOS 위젯 확장은 **config 플러그인 `plugins/widgets`**가 prebuild 때 붙인다(공유 확장 플러그인과 같은 방식, `ios/`는 커밋하지 않음).
- Android 위젯은 **로컬 Expo 모듈 `modules/sprout-widgets/android`** 안에 둔다(라이브러리 매니페스트의 receiver가 앱에 합쳐진다 — 플러그인 불필요). `react-native-android-widget` 같은 라이브러리는 쓰지 않는다: 위젯을 그릴 때마다 헤드리스 JS를 깨워야 해서 앱이 꺼진 동안 느리고, Expo 57·새 아키텍처 호환 확인이 더 든다.

### 7.2 데이터 계약 — `snapshot.json` schema 1 (25 §8.3 + `calendar`)
- 25 §8.3의 필드(`schema`·`generatedAt`·`day`·`account`·`prefs`·`theme`·`today`·`growth`·`appliedActions`)를 **같은 모양**으로 쓰고 `calendar`를 더한다(맥 위젯은 모르는 필드를 무시한다).
- 타입·순수 함수: `packages/schema/src/widget.ts`(맥 위젯 월 캘린더도 같은 `calendar` 모양을 쓸 수 있게 공용).
```jsonc
"calendar": {
  "weekStart": 1,                       // 1 = 월요일
  "weekHead": ["월","화","수","목","금","토","일"],
  "current": 1,                         // months[current] = 이번 달
  "months": [{
    "month": "2026-10", "title": "10월",
    "weeks": [[{
      "date": "2026-10-03", "n": 3, "inMonth": true, "today": false,
      "tone": "holiday",                // "sun" | "sat" | "holiday" | null
      "holiday": "개천절",               // 휴일 표시 꺼짐이면 null
      "total": 2,                       // 그날 전체 항목 수(+N 계산)
      "items": [{ "id": "uuid", "kind": "task", "title": "회의", "color": "#4E75F2", "faded": false }]  // 최대 4개
    }]]
  }]
}
```
- 달 4개(지난달 · 이번 달 · 다음 달 · 그다음 달), 칸 항목 최대 4개, 제목 최대 40자. 크기 ≈ 4 × 42칸 → 수십 KB.
- `color`가 null이면 강조색. 일정 id는 `ev:` 없이(주소 `sprout://event/<id>`).

### 7.3 캐릭터 그림
- 25 §8.4와 같은 원칙(그림 원본은 앱 한 곳): 앱이 보이지 않는 곳에 `CharacterArt`를 그려 react-native-svg `toDataURL`로 192×192 PNG를 만들고 `art/<species>-<stage>-<mood>@2x.png`로 넘긴다. 조합마다 한 번.

### 7.4 체크 대기열 · 달 넘김
- iOS: 25 §8.5와 같은 파일(`actions/<id>.json`). 달 넘김은 `nav.json`(`{ "<위젯 kind>": offset }` — 위젯 하나에 하나, 같은 종류 여러 개는 같이 움직인다 [임시]).
- Android: SharedPreferences `sprout.widget` — `actions`(JSON 배열), 위젯 id마다 `nav.<id>`. 위젯 신호를 받은 Kotlin은 대기열에 넣고 바로 다시 그리고, 앱 JS가 살아 있으면 `onAction` 이벤트로 알려 즉시 반영.
- 앱 반영: `takeActions()` → 25 §8.5 규칙(내 DB에 있는 할 일만, 7일 넘은 것 버림) → `completeTasks` → `appliedActions`에 id → 저장 파일 다시 쓰기.

### 7.5 새로 고침
| 언제 | 무엇을 |
|---|---|
| 할 일·리스트·일정·XP·캐릭터·테마·캘린더 설정 표가 바뀜(화면·동기화) | 1초 모아 저장 파일 다시 쓰기 → 내용이 바뀌었을 때만 iOS `WidgetCenter.reloadAllTimelines()` / Android `AppWidgetManager` 갱신 |
| 앱 시작·앞으로 옴·로그인·로그아웃·자정 + 5초·백그라운드 새로 고침 작업 | 같음 |
| iOS 위젯 시간표 | 지금 + 다음 자정(+1초). `.atEnd` |
| Android | `updatePeriodMillis` 30분(시스템 최소) + 앱 갱신 + 자정에는 위젯이 오늘 원만 옮김 |

### 7.6 개인정보
- 25 §8.8과 같다. 월 캘린더에는 4달 치 할 일·일정의 **제목·색**만 들어간다(메모·장소·태그 없음). 로그아웃하면 저장 파일을 로그아웃 형태로 바꾸고 `art/`·대기열을 지운다.

## 8. 데이터
| 동작 | 읽기·쓰기 |
|---|---|
| 스냅숏(읽기) | `tasks`·`lists`(color·archived_at·show_in_smart) — 오늘 범위는 할 일 탭 `smart:today`와 같은 조건 / `events`(deleted_at·start_at·end_at·repeat_rule·color) / `view_settings` 'calendar'(휴일 표시·내 일정 색) / `user_prefs.theme` / `characters` / `xp_events` |
| 체크(쓰기, 앱이 대신) | `completeTasks`(taskCore) — 25 §11과 같다 |
| 위젯 파일 | iOS App Group · Android 앱 files·SharedPreferences (동기화 안 함, 기기 로컬) |
| 스키마 변경 | **없음** |

## 9. 완료 기준 (틱틱 위젯과 나란히)
- [ ] 홈 화면 위젯 갤러리에 sprout **월 캘린더(크게)·오늘 할 일(작게·중간)·캐릭터(작게)**가 보이고 미리보기는 예시 데이터다.
- [ ] 월 캘린더: 머리 ‹ 10월 ›, 월요일 시작, 오늘 강조색 원, 다른 달 옅게, 일·공휴일 빨강 / 토 파랑, 공휴일 이름, 칸마다 막대 2~3개 + `+N`. 앱 캘린더 탭 월 보기와 같은 날 같은 항목이 같은 순서로 보인다.
- [ ] 날짜 칸 → 앱 캘린더 그날, 막대 → 상세·일정 시트, `+` → 빠른 추가, ‹ › → 위젯 안에서 달 넘김.
- [ ] 오늘 할 일: 25 §12 항목(체크 → 대기 모양 → 앱이 반영해 빠짐, XP +1)이 휴대폰에서도 된다.
- [ ] 라이트·다크(시스템)에서 면·글자·강조색이 맞다. 테마를 바꾸면 강조색이 따라온다.
- [ ] 로그아웃하면 위젯이 바로 `로그인이 필요해요`가 되고 저장 칸에 제목이 남지 않는다.
- [ ] Android: 같은 3종이 위젯 목록에 있고 같은 동작(체크·달 넘김·링크).

## 10. 구현 메모
- (구현 뒤 채움)
