# 25 · 맥 위젯 (macOS WidgetKit) — 오늘 할 일 · 캐릭터 · 월 캘린더

- 상태: **확정 v1.0** (2026-10-04) — 사용자가 §0 제안을 그대로 확정("제안대로"). 구현 메모는 §14. **v1.1 제안(2026-10-05): 월 캘린더 위젯 §15** (사용자 요청)
- 근거: PRD §7.2 F(2026-10-05 결정: "오늘 할 일 보기·체크 + 캐릭터·XP", Swift 위젯 확장 + App Group 파일), [09 메뉴바 미니 창](09-menubar.md)(가장 가까운 기존 기능), [10 성장](10-growth.md)(캐릭터·레벨·XP), [02 목록](02-task-list.md)(행 모양·날짜 표기), [00 토큰 §5](00-design-tokens.md)(테마 13개)
- 틱틱 조사: [research 23 맥 위젯](../ticktick-research/23-mac-widgets.md), [research 20 §5](../ticktick-research/20-mobile.md)
- 표기: **[틱틱]** 확인된 틱틱 동작 · **[sprout]** 새 설계 · **[임시]** 확인 전 값 · **[다음]** 이번 범위 밖

## 0. 결정 (2026-10-04 사용자 확정 — "제안대로")
| # | 질문 | **확정** | 왜 |
|---|---|---|---|
| D1 | 위젯을 몇 가지 만들까? | **2가지**: ① "오늘 할 일"(작게·중간·크게) ② "캐릭터"(작게 = 캐릭터·XP만, 중간 = 캐릭터 + 오늘 할 일 3개 체크) | ①은 틱틱 Tasks 위젯과 같다. ②는 틱틱에 없는 sprout 고유 위젯. 중간 크기에 할 일을 같이 두면 "체크 → 캐릭터 자람"을 한 위젯에서 본다 |
| D2 | "오늘 할 일" 위젯에서 다른 목록도 고를 수 있게? | **v1은 오늘만**(만료됨 포함). 목록 고르기는 [다음] | 고르기를 넣으면 앱이 모든 목록을 위젯에 미리 넘겨야 해서 일이 두 배다 |
| D3 | 위젯 색은? | **밝기·어둡기는 맥 시스템 설정을 따르고**, 강조색(머리 글자·시각·XP 막대)만 sprout 테마 색 | 위젯은 바탕화면에 앱과 따로 떠 있어서 시스템을 따르는 게 자연스럽다 |
| D4 | sprout이 꺼져 있을 때 위젯에서 체크하면? | 위젯에는 바로 체크 표시, 실제 완료·XP는 **sprout이 다시 켜질 때 반영**. **"로그인할 때 sprout 열기"를 기본으로 켠다** | 위젯은 혼자 DB를 고칠 수 없다(XP 규칙이 앱에 있음) |
| D5 | 앱 고유 이름(번들 ID) | **`app.sprout.desktop`** (이미 `apps/desktop/electron-builder.yml`에 있음). 위젯은 `app.sprout.desktop.widget` | 저장 칸 이름이 이 값에서 나온다. 배포 뒤에 바꾸면 기존 위젯이 빈다 |
| D6 | 인증서 | **지금은 개발용(Apple Development)으로 이 Mac에서**, 남에게 나눠 줄 때 Developer ID + 공증(§10) | 개발용으로도 이 Mac에서는 위젯·체크·딥 링크가 다 된다 |
| D7 | 지원 macOS 버전 | 위젯은 **macOS 14(Sonoma) 이상**. 13 이하에서는 위젯만 안 보이고 앱은 그대로 | 체크 가능한(대화형) 위젯이 macOS 14부터다 [틱틱도 14부터] |

## 1. 틱틱 기준 자료
| 주제 | 자료 | 한계 |
|---|---|---|
| 맥 위젯 5종, Tasks = "리스트 하나를 빠르게", 크기 S·M·L | [research 23 §2](../ticktick-research/23-mac-widgets.md), [도움말 Widgets](https://help.ticktick.com/articles/7055780404896202752) | 맥 그림은 13 이전 갤러리(체크박스 없는 모양) |
| 중간·크게 행 모양(체크박스 · 제목 · 오른쪽 시각), 머리 "Today 14" + `+` | research 23 §3.2 (iOS 그림) | iOS |
| 넘침 "+N more" | research 23 §3.2 (맥 Daily View 그림) | 다른 위젯 |
| 체크 = 앱 안 열고 완료, 제목 = 앱에서 열기, + = 추가 화면 | research 23 §4 | 맥 제목 누름은 추정 |
| 위젯 편집: Theme · View · Auto Dark Mode | research 23 §5 | 항목 이름은 미확인 |
- ⚠️ **확인 필요:** 사용자 Mac에서 바탕화면 우클릭 → "위젯 편집" → TickTick을 열어 14+ 대화형 Tasks 위젯 모양(체크박스 크기·행 높이·넘침)을 본다(로그인·데이터 변경 없이 볼 수 있다). 아래 [임시] 수치는 그 뒤 고친다.

## 2. 위젯 목록 (v1)
| 위젯 (갤러리 이름 · 설명) | 크기 | 설정 | 출처 |
|---|---|---|---|
| **오늘 할 일** · "오늘 할 일을 보고 바로 체크해요" | 작게 · 중간 · 크게 | 없음(오늘 고정, D2) | [틱틱] Tasks 위젯 |
| **캐릭터** · "내 캐릭터의 레벨과 XP를 봐요" | 작게 · 중간 | 없음 | [sprout] |
| **월 캘린더** · "이번 달 일정을 한눈에 봐요" (v1.1, §15) | 중간(이번 주) · 크게(이번 달) | 없음(앱 캘린더 보기 설정을 따른다) | [틱틱] Monthly Calendar View |
- 아주 크게(XL)는 [다음] — 틱틱 맥에도 없다.
- 위젯 편집(우클릭 → "위젯 편집")에 보일 설정이 없다(`StaticConfiguration`). 목록 고르기는 D2 결정에 따라 [다음].
- 갤러리 미리보기는 **가짜 예시 데이터**(한국어: "아침 스트레칭 08:00", "기획서 초안 09:30" …, 캐릭터 = 꼬마 고양이 Lv 4)로 그린다. 실제 할 일 제목을 갤러리에 보이지 않는다.

## 3. 레이아웃
- 크기(pt, macOS 14 기본 여백 포함) [임시 — 실측]: 작게 ≈170×170 · 중간 ≈364×170 · 크게 ≈364×382. 화면 해상도·OS에 따라 조금 달라서 **고정 좌표가 아니라 위에서부터 쌓는 배치**로 만들고, 행 수는 높이에서 계산한다.
- 공통 글자(시스템 글꼴, 00 §6 v1.2 실측 비율을 위젯 크기에 맞춤) [임시]: 머리 15pt 굵게 · 개수 15pt 보통(옅은 강조색) · 행 제목 13pt · 오른쪽 시각 11pt · 안내 문구 12pt.
- 바탕: 라이트 `color.bg.app #FFFFFF` · 다크 `#1B1B1B`(00 §4). 시스템이 바탕을 지우는 모드(§5.3)에서는 시스템 바탕.

### 3.1 오늘 할 일 — 작게 [틱틱 작게 모양]
```
┌────────────────────┐
│ 오늘 12             │ ← 머리: "오늘"(강조색 굵게) + 개수(옅은 강조색)
│ 아침 스트레칭        │
│ 기획서 초안 쓰기…     │ ← 제목만 5줄(체크박스·시각 없음), 긴 제목은 …
│   자료 조사          │ ← 하위 할 일은 12pt 들여쓰기
│ 점심 약속            │
│ 메일 답장            │
└────────────────────┘
```
- 체크박스가 없다(틱틱 작게와 같다. 작은 칸에 누를 곳이 여러 개면 잘못 누르기 쉽다). 위젯 전체가 한 덩어리로 눌린다.
- 넘침 표시 없음 — 머리의 개수가 전체 수다 [틱틱].

### 3.2 오늘 할 일 — 중간 · 크게 [틱틱 iOS 모양]
```
┌──────────────────────────────────────────┐
│ 오늘 12                               +  │ ← 머리 높이 24 [임시]
│ ☐ 아침 스트레칭                     08:00 │
│ ☐ 기획서 초안 쓰기                  09:30 │ ← 행 높이 22 [임시], 구분선·배경 없음
│   ☐ 자료 조사                             │ ← 하위 할 일 들여쓰기 16
│ ☐ 독서 30분                          오늘 │
│ ☐ 보고서 제출                       10월 2일│ ← 만료됨: 빨간 날짜
│                             +7개 더     │ ← 넘침(강조색, 오른쪽 맞춤)
└──────────────────────────────────────────┘
```
| 요소 | 모양 | 출처 |
|---|---|---|
| 머리 | 왼쪽 "오늘" + 개수, 오른쪽 `+` 아이콘 16(강조색, 테두리 없음) | [틱틱] |
| 체크박스 | 13pt 둥근 사각(모서리 3), 테두리 1.5 = **우선순위 색**(00 §2: 높음 `#C53C31`·중간 `#EFAB3E`·낮음 `#4E75F2`·없음 `#A6A7A9`) | [틱틱] 02 행과 같다 |
| 제목 | 13pt `color.text.primary`, 한 줄, 넘치면 … | [틱틱] |
| 오른쪽 날짜 | **02 "날짜 표기" 그대로**: 시각 있는 오늘 "08:00"/"오전 8:00"(앱의 12/24시간 설정), 시각 없는 오늘 "오늘" → 강조색 / 만료됨 "어제"·"10월 2일" → `color.text.danger`. 반복이면 앞에 ⟲ | [틱틱] |
| 넘침 | 들어가지 못한 수가 있으면 마지막 행 자리에 **"+N개 더"** 12pt 강조색 | [틱틱 맥 Daily View] |
| 행 수 [임시] | 중간 = 5행(넘치면 4행 + "+N개 더"), 크게 = 13행(넘치면 12행 + "+N개 더") | [틱틱 iOS] |
- 순서·묶음: **메뉴바 미니 창(09)의 "오늘"과 같다** — 단 위젯은 머리 없는 한 줄 목록이라 만료됨 먼저, 그다음 오늘(빨간 날짜가 맨 위에 보이게 — 만료됨 맨 아래 규칙은 머리 있는 묶음에만), 각각 02의 정렬. 위젯에는 그룹 머리("만료됨"·"오늘")를 넣지 않는다(틱틱 위젯에 없음) — 만료됨은 빨간 날짜로 구분한다.
- 하위 할 일: 부모 바로 아래, 한 단계만 들여쓴다(09와 같다). 부모가 오늘이 아닌 하위 할 일은 들여쓰지 않는다.
- 완료한 할 일은 목록에서 빠진다(완료 영역 없음).

### 3.3 캐릭터 — 작게 [sprout]
```
┌────────────────────┐
│      (캐릭터 72)     │ ← 캐릭터 그림, 가운데
│                    │
│ 미미  Lv 4 · 꼬마    │ ← 이름 13pt 굵게 + "Lv 4 · 꼬마" 11pt 보조색
│ ▓▓▓▓▓▓▓░░░░        │ ← XP 막대 높이 6, 모서리 3, 강조색 (10 §3과 같은 모양)
│ 다음 레벨까지 40 XP   │ ← 11pt 보조색
└────────────────────┘
```

### 3.4 캐릭터 — 중간 (캐릭터 + 오늘 할 일) [sprout]
```
┌──────────────────────────────────────────┐
│  (캐릭터 96)      │ 오늘 12              │
│                   │ ☐ 아침 스트레칭  08:00│
│ 미미 Lv 4 · 꼬마   │ ☐ 기획서 초안    09:30│ ← 할 일 3행, 3.2 행과 같은 모양
│ ▓▓▓▓▓▓░░░         │ ☐ 독서 30분      오늘 │
│ 오늘 XP 3/10       │ +9개 더              │
└──────────────────────────────────────────┘
```
- 왼쪽 폭 40%: 캐릭터 96 · 이름 + 레벨 · XP 막대 · **"오늘 XP 3/10"**(10 §6 할 일 XP 하루 상한). 상한에 닿으면 "오늘 할 일 XP 다 받았어요".
- 오른쪽 60%: 3.2와 같은 머리(`+` 없음)·행 3개·넘침. 할 일이 없으면 "오늘 할 일이 없어요".
- 이번 주 목표 진행("목표 1/3")은 [다음] — 공간이 좁다.

### 3.5 캐릭터 그림
- 그림은 앱의 `CharacterArt`(10 §2.2, 자리 표시 벡터)를 **앱이 PNG로 구워** 저장 칸에 둔다(§8.4). 위젯에 그림을 따로 넣지 않아 그림 원본이 한 곳뿐이다.
- 기분은 10 §3.1 규칙: 오늘 XP가 있으면 기쁨, 이틀 넘게 없으면 졸림, 그 밖은 보통. 성향 조사 전이면 "아직 모르는 알".
- 정식 그림 자산(20장)이 생기면 PNG 묶음을 위젯에 직접 넣는 쪽으로 바꿀 수 있다 [다음].

## 4. 상태
| 상태 | 오늘 할 일 위젯 | 캐릭터 위젯 |
|---|---|---|
| **처음(앱을 한 번도 안 열었거나 저장 파일 없음)** | 가운데 "sprout을 한 번 열어 주세요" 12pt 보조색 | 같은 문구 + 알 그림(위젯 안에 넣은 단색 실루엣) |
| **로그아웃** | "로그인이 필요해요" + 그 아래 "sprout 열기"(강조색) | 같다 |
| **빈 상태** | 머리 "오늘 0" + 가운데 "오늘 할 일이 없어요" + 시간대 한 줄(09 §2와 같은 문구 [임시]) | 작게: 그대로 / 중간: 오른쪽만 빈 문구 |
| **불러오는 중** (갤러리 미리보기·처음 그리기) | 시스템 자리 표시(회색 막대, `redacted(.placeholder)`) | 같다 |
| **오래된 데이터** — 저장 파일의 날짜 ≠ 오늘(앱이 자정을 못 넘김) | 목록 대신 "sprout을 열면 오늘 목록으로 바뀌어요" (어제 목록을 오늘처럼 보이지 않게) | 레벨·XP는 그대로 보이고 "오늘 XP"만 숨김 |
| **오류** — 파일을 못 읽음, 또는 위젯보다 새 형식 | "위젯을 불러오지 못했어요" + "sprout 열기" | 같다 |
| **넘침** | "+N개 더" (§3.2) | 중간: "+N개 더" |
| **체크 반영 대기** | 누른 행: 체크박스 채움(우선순위 색) + 제목 흐림(`color.text.tertiary`). 앱이 반영하면 행이 빠진다. **60초 넘게 반영이 안 되면** 위젯 맨 아래 11pt 회색 "sprout을 열면 반영돼요" [임시] | 중간의 할 일 행도 같다. XP는 앱이 반영한 뒤에만 오른다(위젯이 XP를 짐작해 올리지 않는다) |
| macOS 13 이하 | 위젯이 갤러리에 없다 (D7) | 같다 |

## 5. 색 · 테마
### 5.1 밝기 [sprout — D3]
- 위젯은 **맥 시스템의 밝게/어둡게**를 따른다(앱 안 테마가 다크여도 시스템이 밝으면 밝은 위젯). 틱틱의 "Auto Dark Mode" 켬과 같은 동작 [틱틱 위젯 편집 항목].
- 면·글자색: 라이트 = 00 §2 Default, 다크 = 00 §4 Dark 값. 색 테마(하늘·말차 …)의 옅은 면색은 위젯에 쓰지 않는다(작은 위젯에서 바탕이 물들면 글자 대비가 약해진다).

### 5.2 강조색 (머리 "오늘"·개수·시각·"오늘"·"+N개 더"·`+`·XP 막대)
| 시스템 | 쓰는 강조색 |
|---|---|
| 밝게 | 사용자의 **기본 테마**(`user_prefs.theme` 첫 칸)가 라이트 계열이면 그 테마 강조색(00 §5 표), 다크 계열이면 기본값 `#4E75F2` |
| 어둡게 | 사용자의 **다크일 때 테마**(두 번째 칸, 없으면 `dark`)의 강조색 — `dark #545DFA`, `black #5A62FA` |
- 앱이 계산한 두 값(밝게·어둡게)을 저장 파일에 넣는다(§8.3 `theme`). 위젯은 계산하지 않는다.
- 개수 글자는 강조색 55% 불투명 [임시 — 틱틱 그림의 옅은 파랑].
- 00 §5.4 대비 규칙: 라이트 테마 강조색은 흰 바탕 4.5:1 이상으로 골라져 있어 위젯 흰 바탕에도 맞다. `navy`·`gray` 강조색도 흰 바탕에서 대비 충분.

### 5.3 시스템이 색을 바꾸는 모드 (macOS 14 바탕화면 · macOS 26)
- 바탕화면 위젯은 앞에 창이 있으면 **흐린 단색(vibrant)** 으로, macOS 26에서 사용자가 "착색·투명" 스타일을 고르면 **강조(accented)** 모드로 그려진다.
- ~~처리: 캐릭터 그림은 시스템 기본에 맡긴다~~ → 2026-10-05 사용자 스크린숏(흐린 바탕화면에서 월 캘린더 막대가 빈 회색 알약, 공휴일 글자 사라짐, 캐릭터가 흰 덩어리)으로 **§16 규칙으로 바뀜**. 우선순위 색이 단색 모드에서 사라지는 것은 그대로 받아들인다.

## 6. 인터랙션
| 어디를 | 무엇이 | 출처 |
|---|---|---|
| 오늘 할 일 **작게** 아무 곳 | 앱을 앞으로 가져와 **오늘** 목록 (`sprout://today`) | [틱틱] |
| 머리 "오늘 N" | 오늘 목록 (`sprout://today`) | [틱틱 Daily View] |
| 머리 `+` | 앱 메인 창 + **빠른 추가**(04 데스크톱 입력, ⌃⇧A와 같은 화면) (`sprout://quick-add`) | [틱틱] |
| 행 **체크박스** | **앱을 열지 않고 완료**(AppIntent). 바로 §4 "반영 대기" 모양 → 앱이 정상 완료 경로로 처리(반복 다음 회차·하위 체크 항목·**XP +1, 하루 10 상한** 그대로) → 행이 빠진다 | [틱틱] |
| 반영 대기 중인 행의 체크박스 다시 누름 | 완료 취소(같은 날 XP 되돌림 — 10 §6) [임시] | [sprout] |
| 행 **제목·날짜** | 앱 메인 창에서 그 할 일 선택 + 상세 열림 (`sprout://task/<id>`) — 미니 창 행 클릭(09 §3)과 같은 동작 | [틱틱] |
| "+N개 더" | 오늘 목록 (`sprout://today`) | [틱틱 Daily View] |
| 캐릭터 위젯 왼쪽(캐릭터·XP) | 앱 **성장** 화면 (`sprout://growth`) | [sprout] |
| 로그아웃·처음·오류 상태 아무 곳 | 앱 열기(메인 창 — 로그인 화면이면 로그인) (`sprout://today`) | [sprout] |
- 우클릭 메뉴는 시스템 것(위젯 편집·제거)뿐. 키보드 조작 없음(OS 위젯).
- 움직임: 체크박스 채움은 시스템 위젯 전환(기본 애니메이션), 숫자(개수·XP)는 숫자 넘김 전환(`contentTransition(.numericText())`). 손쉬운 사용의 "동작 줄이기"는 시스템이 처리한다.
- **완료 토스트·되돌리기 버튼은 위젯에 없다** [틱틱 위젯에 없음]. 완료 취소는 위 "다시 누름" 또는 앱의 완료 영역에서.
- 딥 링크는 **보기·이동만** 한다. 완료·삭제 같은 변경은 URL로 받지 않는다(다른 앱이 `sprout://` 주소를 열어 데이터를 바꾸지 못하게).

## 7. 새로 고침 규칙
| 언제 | 누가 | 무엇을 |
|---|---|---|
| 할 일·XP·캐릭터·목표·테마가 바뀜(앱 화면·미니 창·동기화로 들어온 변경 모두) | 앱 메인 프로세스 | 0.8초 모아서 저장 파일 다시 쓰기 → 내용이 바뀌었을 때만 위젯 새로 고침 요청 |
| 새로 고침 요청 횟수 | 앱 | **최소 10초 간격**으로 묶는다 [임시]. 맥은 백그라운드 앱의 위젯 새로 고침 횟수를 하루 단위로 제한하기 때문(앱이 메뉴 막대에만 있을 때가 대부분) |
| 자정(로컬) + 5초, 잠자기에서 깨어남, 앱 시작, 로그인·로그아웃, 첫 동기화 끝 | 앱 | 저장 파일 다시 쓰기 + 새로 고침 |
| 위젯에서 체크 | 시스템 | 체크 직후 그 위젯을 자동으로 다시 그림(AppIntent 기본 동작) → "반영 대기" 모양 |
| 위젯 자체 시간표 | 위젯 | 지금 + **오늘 할 일의 시각마다**(그 시각이 지나면 만료 빨강으로 — 앱이 정해 준 `overdueAt`) + **다음 자정**(→ 앱이 새로 쓰지 않았으면 "오래된 데이터" 상태). 항목 최대 20개, 끝나면 다시 요청(`.atEnd`) |
| 앱이 꺼져 있음 | — | 위젯은 마지막 저장 파일을 계속 보여 준다. 체크는 대기열에 쌓이고 앱이 켜질 때 반영(D4) |

## 8. 기술 설계
### 8.1 전체 그림
```
 sprout.app (Electron, Developer ID 서명, 샌드박스 아님)
 ├─ Contents/MacOS/sprout ── 메인 프로세스(Node) ─┬─ PowerSync 로컬 DB (main/db.ts)
 │                                               ├─ main/widget.ts  ① 저장 파일 쓰기 ③ 대기열 감시·반영
 │                                               └─ widget_bridge.node ② WidgetCenter 새로 고침
 └─ Contents/PlugIns/SproutWidget.appex ── 위젯 확장(Swift, 샌드박스) ── 저장 파일 읽기, 체크를 대기열에 쓰기
                         ▲                                   │
                         └──── App Group 저장 칸 ◀───────────┘
        ~/Library/Group Containers/BU697KN34B.app.sprout.desktop/widget/
          snapshot.json  · art/*.png  · actions/*.json
```
- 위젯 확장은 DB도 네트워크도 만지지 않는다. **앱이 쓴 파일을 읽어 그리고, 체크는 파일 한 장으로 앱에 넘긴다.** XP 규칙·반복 규칙은 앱 한 곳에만 있다.

### 8.2 저장 칸(App Group)
- 이름: **`BU697KN34B.app.sprout.desktop`** (팀 ID + 번들 ID, D5). ⚠ 처음 초안의 `Z32F3Z65RD`는 인증서 이름 괄호 안 값(개인 식별자)이라 팀 ID가 아니다 — 실제 팀 ID는 인증서 OU `BU697KN34B`(개인 팀)다(2026-10-04 `security find-certificate`로 확인). `group.` 으로 시작하는 iOS식 이름은 쓰지 않는다 — macOS 15부터 저장 칸이 보호되어, App Store 밖 앱은 **팀 ID로 시작하는 이름**이어야 확인 창 없이 쓸 수 있다(그렇지 않으면 "다른 앱의 데이터에 접근하려고 합니다" 창이 뜨고 위젯 확장은 아예 거부된다).
- 그래서 **Electron 앱도 같은 팀(BU697KN34B)으로 서명하고, 앱 권한(entitlements)에 같은 저장 칸 이름**(`com.apple.security.application-groups`)을 넣어야 한다. 팀 ID로 시작하는 이름은 프로비저닝 프로파일 없이 쓸 수 있다.
- 메인 프로세스는 샌드박스가 아니므로 경로를 직접 만든다: `path.join(os.homedir(), 'Library/Group Containers', GROUP_ID, 'widget')`. 위젯 쪽은 `FileManager.containerURL(forSecurityApplicationGroupIdentifier:)`.
- **개발 실행(`electron-vite dev`)에서는 위젯 연동을 끈다** — 개발 실행 앱은 Electron 기본 서명이라 권한이 없고, macOS 15+에서 저장 칸 확인 창이 뜬다. 위젯 확인은 패키징한 앱으로만 한다(`SPROUT_WIDGET=1`이면 개발 실행에서도 켜기 [임시]).

### 8.3 데이터 계약 — `snapshot.json` (앱 → 위젯)
- 앱이 `snapshot.json.tmp`에 쓰고 **이름 바꾸기(rename)로 교체**한다(위젯이 반쯤 쓴 파일을 읽지 않게).
- TS 타입은 `src/shared/widgetContract.ts`, Swift `Codable`은 위젯 쪽 `Snapshot.swift`. **두 쪽 시험이 같은 예시 파일**(`native/widget/fixtures/snapshot.v1.json`)을 읽는다.
```jsonc
{
  "schema": 1,                         // 깨지는 변경 때만 올린다. 위젯은 모르는 schema면 "오류" 상태
  "generatedAt": "2026-10-04T09:12:03+09:00",
  "day": "2026-10-04",                 // 로컬 날짜. 위젯의 오늘과 다르면 "오래된 데이터"
  "account": { "signedIn": true },     // 이메일·사용자 id 넣지 않음
  "prefs": { "clock24h": true },
  "theme": { "accentLight": "#4E75F2", "accentDark": "#545DFA" },
  "today": {
    "count": 12,                       // 만료됨 + 오늘 미완료 전체 수(머리 숫자)
    "tasks": [                         // 보여줄 순서 그대로, 최대 20개(크게 13행 + 여유)
      {
        "id": "uuid",
        "title": "기획서 초안 쓰기",     // 제목만. 메모·체크 항목·태그·리스트 이름 없음
        "priority": 3,                 // 0~3 (체크박스 테두리 색)
        "depth": 0,                    // 0 | 1 (하위 할 일 들여쓰기)
        "label": "09:30",              // 앱이 02 규칙으로 만든 오른쪽 문구("오늘"·"어제"·"10월 2일"), 없으면 null
        "labelTone": "accent",         // "accent" | "danger"
        "overdueAt": "2026-10-04T09:30:00+09:00", // 이 시각부터 danger로 (앱 규칙이 지난 시각을 만료로 볼 때만), 아니면 null
        "repeat": false
      }
    ]
  },
  "growth": {
    "hasCharacter": true,              // 성향 조사 전이면 false → 알
    "name": "미미", "species": "cat", "level": 4, "stage": 2, "stageName": "꼬마",
    "xpInto": 20, "xpToNext": 60,      // 막대 = into / toNext, 문구 "다음 레벨까지 40 XP"
    "todayTaskXp": 3, "todayTaskXpCap": 10,
    "mood": "happy",                   // default | happy | sleepy
    "art": "art/cat-2-happy@2x.png"    // 저장 칸 안 상대 경로
  },
  "appliedActions": ["01J…"]           // 최근 반영한 대기열 id(최대 50) — 위젯이 "반영 대기"를 지울 때 확인
}
```
- 로그아웃 상태: `{ "schema": 1, "generatedAt": …, "account": { "signedIn": false } }`만 쓰고 나머지 필드·그림·대기열은 지운다(§8.8).
- 날짜 문구·순서·만료 판정은 **앱이 미리 계산**한다. 위젯은 문자열을 그대로 그리고, 시간표에서 `overdueAt`만 비교한다. 같은 규칙을 Swift로 두 번 짜지 않기 위해서다.

### 8.4 캐릭터 그림 굽기
- 앱 메인 프로세스가 (species, stage, mood) 조합이 바뀌었고 `art/` 에 그 파일이 없을 때만, **보이지 않는 창**(`?window=widget-art`, offscreen)에서 `CharacterArt`를 192×192(@2x)로 그려 `capturePage()`로 PNG 저장. 조합은 최대 4×5×3 + 알 = 61장이라 캐시로 둔다. 그림 컴포넌트가 바뀌면 앱 버전이 바뀔 때 `art/`를 비운다.

### 8.5 체크 대기열 (위젯 → 앱)
- 위젯의 AppIntent `ToggleTaskIntent(taskId, complete: Bool)`의 `perform()`:
  1. `actions/<ULID>.json`을 tmp에 쓰고 rename: `{ "schema": 1, "id": "<ULID>", "kind": "complete" | "uncomplete", "taskId": "uuid", "at": "ISO", "day": "2026-10-04" }`
  2. 끝(위젯은 시스템이 자동으로 다시 그린다). 다시 그릴 때 `actions/`에 남은 파일 = "반영 대기" 행.
- 앱(`main/widget.ts`):
  - 시작할 때 + `fs.watch(actions/)`(FSEvents) 알림마다 파일을 `at` 순서로 읽어 **정상 완료 경로**로 반영 → 파일 삭제 → `appliedActions`에 id 추가 → 저장 파일 다시 쓰기.
  - 멱등: 이미 완료된 할 일에 complete, 지워진 할 일 → 아무것도 안 하고 파일만 지운다. 깨진 파일은 `actions/bad/`로 옮긴다.
  - `day`가 오늘이 아닌 complete도 반영한다(XP는 반영하는 날 기준 — 10 §6의 "로컬 날짜" 규칙). 오래된 대기 항목(7일 초과)은 반영하지 않고 버린다 [임시].
- **정상 완료 경로를 메인 프로세스에서 부를 수 있게 옮긴다(선행 작업):** 지금 완료(`renderer/lib/taskActions.ts` `complete`)와 XP(`renderer/data/growth.ts` `grantTaskXp`·`revokeTaskXp`)가 렌더러에 있다. 이를 DB 인터페이스만 받는 순수 모듈 **`src/shared/taskCore.ts`**(완료·완료 취소·반복 다음 회차·체크 항목 초기화·XP 지급/회수)로 옮기고, 렌더러와 메인이 같이 쓴다. 이유: 메인 창을 닫아도(메뉴 막대만 있을 때) 위젯 체크가 반영돼야 하고, 숨은 창을 띄워 대신 처리하는 방식은 느리고 깨지기 쉽다. 렌더러의 실행 취소 토스트·"+1" 표시는 렌더러에 남기고, 메인이 반영하면 `growth:xp` IPC로 열린 창에 알려 사이드바 "+1"을 띄운다.
- 앱 → 위젯 반대 방향 알림(Darwin 알림)은 쓰지 않는다 — 앱이 켜져 있으면 FSEvents로 충분하고, 꺼져 있으면 어차피 받을 수 없다.

### 8.6 위젯 새로 고침 요청 — **결정: 메인 프로세스에 싣는 작은 네이티브 모듈**
| 방법 | 판단 |
|---|---|
| **A. N-API 네이티브 모듈 `widget_bridge.node`**(Swift `@_cdecl` 함수 1개 `sprout_reload_widgets(kind?)` → `WidgetCenter.shared.reloadAllTimelines()` / `reloadTimelines(ofKind:)` + C로 쓴 N-API 껍데기) | **채택.** WidgetKit은 "위젯을 담은 앱"이 부른 요청만 받는다. Electron 메인 프로세스가 바로 그 앱(번들 ID·서명·`PlugIns/`의 appex가 일치)이라 정체가 확실하다. 이미 `better-sqlite3` 같은 네이티브 모듈을 `@electron/rebuild`로 다루고 있어 빌드 흐름도 같다 |
| B. 앱 안에 넣은 Swift 명령줄 도구(`Contents/MacOS/sprout-widget-reload`)를 `execFile` | 예비안. 별도 실행 파일은 번들 ID가 없어서 WidgetKit이 "위젯을 담은 앱"으로 인정할지 확실하지 않다 → §9 스파이크에서 A가 막히면 시험 |
| C. Darwin 알림만 보내기 | 기각. 위젯 확장은 늘 떠 있는 프로세스가 아니라 알림을 받을 수 없다 — 새로 고침을 일으키지 못한다 |
| (보조) 위젯 시간표 `.atEnd` + 자정 항목 | A가 실패하거나 하루 한도에 걸려도 최소한 시각마다·자정에 다시 읽는다 |
- 모듈을 못 불러오면(Intel/구버전 OS·빌드 누락) 경고만 남기고 앱은 그대로 동작한다.

### 8.7 딥 링크 `sprout://`
- 주소: `sprout://today` · `sprout://task/<uuid>` · `sprout://growth` · `sprout://quick-add` (모바일 20 §2와 같은 체계). §15 월 캘린더: `sprout://calendar/<YYYY-MM-DD>` · `sprout://event/<id>`.
- Electron: 패키징 앱은 Info.plist `CFBundleURLTypes`(electron-builder `protocols`)로 등록. `app.on('open-url')`을 **`will-finish-launching`에서 등록**(앱이 꺼져 있을 때 위젯으로 켜지는 경우 첫 주소를 놓치지 않게), 창이 준비될 때까지 줄 세운 뒤 `getWindow()`로 보낸다. 할 일 열기는 기존 `reminder:open` IPC, 빠른 추가는 `desktop:quick-add` IPC를 다시 쓴다.
- 검사: 호스트가 위 4개가 아니거나 id가 uuid 모양이 아니면 메인 창만 연다. 로그아웃 상태면 로그인 화면.
- 개발 실행은 `sprout-dev://`로 따로 등록 [임시] — 설치된 정식 앱과 주소가 겹치지 않게.

### 8.8 개인정보
- 저장 파일에는 **오늘(만료됨 포함) 미완료 할 일 최대 20개의 제목·우선순위·날짜 문구**와 캐릭터 숫자만 들어간다. 메모·체크 항목·태그·리스트 이름·이메일·토큰·서버 주소는 넣지 않는다.
- **로그아웃하면** 저장 파일을 로그아웃 형태로 바꾸고 `art/`·`actions/`를 지운 뒤 새로 고침(위젯이 바로 "로그인이 필요해요"). 앱 삭제 시 저장 칸 정리는 macOS가 하지 않으므로 설정 › 계정에 "위젯 데이터 지우기"는 [다음].
- 저장 칸은 사용자 홈 아래 보통 파일이다(암호화 아님, 같은 사용자의 샌드박스 아닌 프로그램은 읽을 수 있다). 앱 자체 DB도 같은 수준이라 위험이 늘지 않는다. iCloud로 올라가지 않는다.
- 위젯 확장은 네트워크 권한을 갖지 않는다(`com.apple.security.network.client` 없음).

### 8.9 폴더 구조 (제안)
```
apps/desktop/native/widget/
├─ SproutWidget.xcodeproj           # Xcode 26 프로젝트(타깃 3개)
├─ SproutWidget/                    # 타깃 1: 위젯 확장(.appex), macOS 14+
│  ├─ SproutWidgetBundle.swift      # @main WidgetBundle { TodayWidget, CharacterWidget }
│  ├─ TodayWidget.swift · CharacterWidget.swift   # Provider(시간표) + 크기별 View
│  ├─ Views/ (TaskRow, Header, Overflow, CharacterCard, States)
│  ├─ Snapshot.swift                # Codable 계약 v1
│  ├─ Store.swift                   # 저장 칸 읽기, actions/ 쓰기
│  ├─ ToggleTaskIntent.swift        # AppIntent
│  ├─ Info.plist                    # NSExtensionPointIdentifier = com.apple.widgetkit-extension
│  ├─ SproutWidget.entitlements     # app-sandbox, application-groups
│  └─ Assets.xcassets               # 알 실루엣, 미리보기 예시 그림
├─ WidgetHost/                      # 타깃 2: Xcode에서 위젯을 띄워 보기 위한 빈 앱(배포 안 함)
├─ Bridge/                          # 타깃 3: libSproutWidgetBridge(Swift @_cdecl)
├─ addon/                           # binding.gyp + bridge.c → widget_bridge.node (N-API)
├─ fixtures/snapshot.v1.json        # 계약 예시(Swift·TS 시험 공용)
└─ build.sh                         # xcodebuild Release(arm64+x86_64) → out/SproutWidget.appex, addon 빌드
apps/desktop/src/main/widget.ts           # 저장 파일 쓰기·대기열·새로 고침·로그아웃 정리
apps/desktop/src/main/deeplink.ts         # open-url 처리
apps/desktop/src/shared/widgetContract.ts # 계약 타입 + 스냅숏 만들기(순수 함수, 시험 대상)
apps/desktop/src/shared/taskCore.ts       # 완료·XP 정상 경로(렌더러에서 옮김)
```
- 위젯 쪽 번들 ID = `<번들ID>.widget`(앱 번들 ID로 시작해야 한다). 버전 문자열은 빌드 때 앱 버전으로 맞춘다.
- 오늘 목록 쿼리(`renderer/data/views.ts`의 오늘 범위·정렬)와 날짜 문구(02 표기)도 메인에서 써야 하므로 `src/shared/`로 옮긴다(미니 창과 같은 결과를 보장).

### 8.10 패키징이 지켜야 할 것 (electron-builder 설정을 만드는 다른 작업에 넘김)
1. `appId` = D5에서 정한 번들 ID, 팀 `BU697KN34B`로 서명. 같은 값이 저장 칸 이름에 들어간다.
2. 앱 권한 파일(`mac.entitlements`)에 `com.apple.security.application-groups = ["BU697KN34B.app.sprout.desktop"]` + Electron 하드닝 런타임에 필요한 권한(`com.apple.security.cs.allow-jit` 등). 앱 본체는 샌드박스를 켜지 않는다.
3. `SproutWidget.appex`를 **`Contents/PlugIns/SproutWidget.appex`**에 넣는다(`extraFiles` 또는 `afterPack` 훅). `native/widget/build.sh`가 먼저 돌아 appex가 있어야 한다.
4. `widget_bridge.node`는 asar 밖(`asarUnpack`)에 두고 서명 대상에 포함.
5. **서명 순서 = 안쪽부터 바깥으로**: 네이티브 모듈·Frameworks·Helper 앱 → **appex(자기 권한 파일: `com.apple.security.app-sandbox = true`, `application-groups` 같은 값)** → 마지막에 앱 본체. `--deep` 서명 금지(appex 권한이 앱 권한으로 덮인다). `@electron/osx-sign`의 파일별 옵션으로 appex에만 다른 권한 파일을 준다. 모두 하드닝 런타임 + 타임스탬프.
6. `protocols: [{ name: "sprout", schemes: ["sprout"] }]`.
7. 앱과 appex의 CPU 아키텍처가 같아야 한다(앱이 universal이면 appex도 universal).
8. 배포 빌드: 서명 → `notarytool submit --wait` → `stapler staple` → 확인(`codesign --verify --strict`, `spctl -a -vv`, `pluginkit -m -p com.apple.widgetkit-extension`로 위젯 등록 확인).
9. 개발 빌드: `Apple Development` 인증서로 서명, 공증 끔. `/Applications`에 복사해 한 번 실행해야 위젯 갤러리에 뜬다.

## 9. 개발 순서 (명세 확인 뒤)
1. **스파이크 S1(반나절~하루):** 빈 위젯 1개 + `widget_bridge.node`를 넣은 Electron 앱을 개발 인증서로 패키징 → ① 갤러리에 뜨는지 ② 앱이 쓴 파일을 위젯이 읽는지(확인 창 없이) ③ 메인 프로세스 새로 고침이 먹는지(안 되면 §8.6 B 시험) ④ 위젯 체크 → `actions/` 파일이 생기는지 ⑤ `sprout://` 링크로 앱이 켜지는지. 결과를 `spikes/a2-mac-widget/RESULT.md`로 남긴다.
2. `taskCore`·오늘 쿼리·날짜 문구를 `src/shared/`로 옮기고 기존 시험 통과 확인(동작 변화 없음).
3. `widgetContract`(스냅숏 만들기 순수 함수) + 시험 → `main/widget.ts` 쓰기·대기열·로그아웃.
4. Swift 위젯 화면(크기별·상태별) → 미리보기(Xcode Preview)로 상태 표 전부 확인.
5. 딥 링크, 설정 "맥 로그인할 때 sprout 열기"(D4).
6. 패키징 작업과 합쳐 서명·공증 빌드.

## 10. 인증서로 되는 것
| 할 수 있나 | 개발용 Apple Development (지금 있음) | Developer ID Application + 공증 (아직 없음) |
|---|---|---|
| 이 Mac에서 패키징 앱 실행, 위젯 갤러리·체크·딥 링크 | **된다** (이 Mac이 팀 계정에 등록돼 있어야 함 — Xcode가 자동 등록) | 된다 |
| App Group(팀 ID 이름) 확인 창 없이 쓰기 | 된다 | 된다(프로파일 필요 없음) |
| 다른 사람 Mac에 설치(내려받은 앱) | **안 된다** — Gatekeeper가 막는다 | 된다 |
| 공증(notarization) | 안 된다 | 된다 — 배포 필수 |
| 자동 업데이트 배포 | 안 된다 | 된다 |

## 11. 데이터
| 동작 | 읽기·쓰기 |
|---|---|
| 스냅숏(읽기) | `tasks`(id, title, status, priority, start_at, due_at, is_all_day, parent_id, list_id, sort_order, repeat_rule, deleted_at) — 오늘 범위는 09·02와 같은 조건 / `user_prefs.theme`, 12/24시간 설정 / `characters`(name, species) / `xp_events`(합계, 오늘 `kind='task'` 합) |
| 체크(쓰기, 앱이 대신) | `taskCore` 경유: `tasks.status`·`completed_at`, 반복이면 다음 회차 `tasks` 행, `check_items` 초기화, `xp_events`(id `task:<taskId>:<day>`, 하루 10 상한) — 10 §6·§7 규칙 그대로 |
| 위젯 파일 | 저장 칸 `widget/snapshot.json`, `widget/art/*.png`, `widget/actions/*.json` (동기화하지 않음, 기기 로컬) |
| 스키마 변경 | **없음** (서버·PowerSync 손대지 않음) |

## 12. 완료 기준 (틱틱 위젯과 나란히 놓고 확인)
- 표시: [x] 확인 · [~] 앱 쪽은 확인, 실제 바탕화면 위젯에서 사용자 확인 남음(§14.4) · [ ] 아직
- [~] 패키징한 sprout을 한 번 열면 위젯 갤러리에 "오늘 할 일"(작게·중간·크게)과 "캐릭터"(작게·중간)가 보이고, 미리보기는 예시 데이터다(내 할 일 제목이 갤러리에 안 보인다).
- [x] 오늘 할 일 위젯의 항목·순서·날짜 문구가 메뉴바 미니 창 "오늘"과 같다. 만료됨은 빨간 날짜, 오늘 시각은 강조색.
- [ ] 틱틱 Tasks 위젯과 나란히 두고 머리("오늘 N"·`+`), 행(체크박스·제목·시각), 들여쓰기, 넘침 "+N개 더"가 같은 인상이다(사용자 Mac에서 틱틱 위젯 갤러리 확인 후).
- [ ] 앱에서 할 일을 추가·완료·날짜 변경하면 10초 안에 위젯이 바뀐다. 다른 기기에서 동기화된 변경도 같다.
- [~] 위젯 체크 → 앱을 열지 않고 완료된다. 반복 할 일은 다음 회차가 생기고, XP +1이 쌓이며(하루 11번째부터 없음), 캐릭터 위젯 XP 막대가 오른다. 같은 할 일을 앱에서 다시 체크해도 XP가 두 번 쌓이지 않는다.
- [ ] 메인 창을 닫고 메뉴 막대만 있어도 위젯 체크가 반영된다.
- [~] 앱을 끈 채 체크 → 위젯에 체크 표시가 남고, 앱을 켜면 반영되어 행이 빠진다. 60초 넘으면 "sprout을 열면 반영돼요".
- [ ] 반영 대기 행을 다시 누르면 완료가 취소되고 XP도 되돌아간다.
- [~] 행 제목 → 앱 메인 창에서 그 할 일 상세가 열린다. `+` → 빠른 추가. 머리·작게·"+N개 더" → 오늘 목록. 캐릭터 → 성장 화면. 앱이 꺼져 있어도 같다.
- [ ] 자정이 지나면 새 날 목록으로 바뀐다. 앱이 꺼져 있으면 "sprout을 열면 오늘 목록으로 바뀌어요".
- [ ] 시스템 밝게/어둡게를 바꾸면 위젯 면이 바뀌고, 강조색은 내 테마(밝게)·다크 테마(어둡게)의 강조색이다. 13개 테마를 하나씩 바꿔 위젯 강조색이 따라온다.
- [ ] 바탕화면 흐린 모드·macOS 26 착색 모드에서 글자·체크박스·XP 막대가 읽힌다.
- [x] 로그아웃하면 위젯이 바로 "로그인이 필요해요"가 되고 저장 칸에 할 일 제목이 남지 않는다(파일 확인).
- [ ] 빈 상태·처음·오류·불러오는 중 화면이 Xcode 미리보기와 실제 위젯에서 표대로 보인다.
- [~] `codesign --verify --strict`, `spctl -a -vv`(Developer ID 빌드), `pluginkit`에 위젯이 등록된다. macOS 15+에서 저장 칸 확인 창이 뜨지 않는다.
- [ ] macOS 13 이하에서 앱이 정상 실행된다(위젯만 없음).

## 13. 열린 질문
1. 틱틱 14+ 대화형 위젯의 실제 행 높이·체크박스 크기·완료 직후 모양(research 23 §7) — 사용자 Mac 갤러리로 확인.
2. 오늘 시각이 지난 할 일을 만료(빨강)로 볼지 — 02·09 구현 규칙을 그대로 따른다(위젯은 `overdueAt`만 받는다).
3. macOS가 백그라운드 앱의 위젯 새로 고침을 하루 몇 번까지 받아 주는지 — S1에서 실측하고 §7 "10초 간격"을 고친다.

## 14. 구현 메모 (2026-10-04, v1.0)
### 14.1 만든 것
| 위치 | 내용 |
|---|---|
| `packages/schema/src/taskCore.ts` (+ `taskCore.test.ts`) | 완료·완료 취소·반복 다음 회차·완료 기록·체크 항목 초기화·할 일 XP(하루 10)·회수를 **DB 읽기 인터페이스만 받아 SQL 문 목록을 돌려주는 순수 함수**로 옮김. 렌더러 `lib/taskActions.ts`(`complete`·`reopen`)와 `data/growth.ts`(`grantTaskXp`·`revokeTaskXp`)는 export·동작 그대로 이것을 부른다. 메인 프로세스(위젯)와 나중 모바일이 같이 쓴다. §8.9의 `src/shared/taskCore.ts` 대신 `@sprout/schema/taskCore`(모바일도 써야 해서) |
| `apps/desktop/src/main/widgetSnapshot.ts` | §8.3 저장 파일 만들기(순수 함수) + 대기열 파일 검사. 오늘 목록은 렌더러 `openTasksSql('smart:today')`·`rowDateLabel`을 그대로 써서 미니 창과 같은 결과. §8.9의 `src/shared/widgetContract.ts` 자리 |
| `apps/desktop/src/main/widget.ts` | 저장 파일 쓰기(표 변경 0.8초 모음, 내용 바뀔 때만), 새로 고침(10초 간격), 자정+5초·잠자기 깸·시작·로그인 상태 변화, 대기열 감시(FSEvents + 1분 안전망), 로그아웃 정리, 로그인 항목 기본 켬 |
| `apps/desktop/src/main/widgetArt.ts` | 캐릭터 그림 굽기: `CharacterArt`를 `react-dom/server`로 SVG 글자로 만들고 offscreen 창에서 192×192 PNG로 캡처. 조합마다 한 장 캐시 |
| `apps/desktop/native/widget/` | `SproutWidget.xcodeproj`(타깃 1개, 폴더 동기화 그룹), `SproutWidget/*.swift`(위젯 2종·AppIntent·계약), `Bridge/WidgetBridge.swift`(새로 고침 모듈), `fixtures/snapshot.v1.json`, `build.sh` |
| `main/index.ts` | `sprout://quick-add`(⌃⇧A와 같은 빠른 추가), `sprout://growth`, `sprout://today` 처리 + `startWidget`·`ensureLoginItemDefault` 등록 |
| `main/sync.ts` | 로그아웃 때 `clearWidget()` 한 줄 |

### 14.2 설계에서 바뀐 점
- **App Group 이름 = `BU697KN34B.app.sprout.desktop`** (§8.2 위 경고). 같은 값이 네 곳: `src/main/widget.ts`, `native/widget/SproutWidget/Snapshot.swift`·`SproutWidget.entitlements`, `build/entitlements.mac.plist`. Developer ID(유료 팀)로 바꿀 때 팀 ID가 달라지면 네 곳을 같이 바꾼다(`build.sh`는 `SPROUT_TEAM_ID`로 받음). **배포 뒤에는 바꾸면 안 된다**(D5와 같은 이유).
- **새로 고침 = §8.6 A안, 단 C 껍데기 없이 Swift 하나로**: `WidgetBridge.swift`가 `@_cdecl("napi_register_module_v1")`로 Node-API 등록 함수를 직접 내보낸다(브리징 헤더로 `node_api.h`만 가져옴). `swiftc` 한 줄로 `widget_bridge.node`가 나와 node-gyp·binding.gyp가 필요 없다. N-API는 ABI 고정이라 Node 22 헤더로 빌드해 Electron 37에서 그대로 로드됨(패키지 앱 로그에 로드 실패 경고 없음 확인). B안(별도 CLI)은 번들 정체가 불확실해서 쓰지 않았다.
- **위젯 확장 서명**: Xcode 자동 서명은 끄고(`CODE_SIGNING_ALLOWED=NO`) `build.sh`가 `codesign --entitlements`로 직접 서명한다 — 개인 팀이라 프로비저닝 프로파일이 없어서. 팀 ID 접두 App Group은 macOS에서 프로파일 없이 동작.
- **`npm run dist:mac`이 키체인의 Apple Development 인증서로 서명**하도록 바뀜(`build/dist-mac-local.mjs`). ad-hoc이면 App Group이 검증되지 않아 macOS 15+에서 "다른 앱의 데이터" 확인 창/거부가 난다. `SPROUT_ADHOC=1`이면 예전처럼 ad-hoc.
- **켜지는 조건**: 패키지 앱 + 기본 프로필만. `SPROUT_PROFILE`로 띄운 시험 앱은 저장 칸(기기에 하나)을 덮어쓰지 않게 꺼진다. `SPROUT_WIDGET=1`이면 강제로 켬(시험용), `0`이면 끔. 개발 실행도 꺼짐(§8.2와 같음).
- **오늘 순서는 앱 정렬 그대로**: 같은 날이면 종일 할 일이 시각 있는 할 일보다 앞(`due_at` 문자열 정렬 — 미니 창·목록과 같다). 미니 창은 하위 할 일을 안 보이지만 위젯은 §3.2대로 부모 바로 아래 한 단계(직속 자식만)를 넣는다. 머리 개수는 보이는 항목 전체 수(하위 포함).
- `overdueAt`은 늘 null — 앱 규칙(02·09)이 날짜로만 만료를 본다(§13-2 답).
- `prefs.clock24h`는 false 고정 — 앱에 12/24시간 설정이 아직 없다("오전 8:00").
- 반영 대기 행 다시 누르기 = 위젯이 대기 파일을 지운다(앱에 갈 필요 없음). 앱은 `uncomplete` 항목도 받는다(반복이면 가장 최근 완료 기록을 되돌림, 같은 날 XP 회수).
- **`sprout://today`·`sprout://growth` 이동 = `desktop:navigate` IPC**(2026-10-05): 메인 `showView()`가 `{view, selected?}`를 보내고 렌더러 `App.tsx`가 `setView`·`setSelected`만 바꾼다(다시 불러오지 않아 깜빡임 없음). 예전 `localStorage` + 다시 불러오기 방식은 지웠다. 개발 실행에서 두 번째 실행(`sprout://growth`·`sprout://today`)으로 화면이 다시 불리지 않고 바뀌는 것 확인.
- **위젯 체크 XP의 "+1"**(2026-10-05): `widget.ts`가 반영한 완료에서 XP가 나오면(`planCompleteWithXp().granted`) 모든 창에 `growth:xp`(양)를 보내고, 렌더러가 앱 안 완료와 같은 `sprout:xp` 이벤트로 바꿔 사이드바 캐릭터 카드 "+1"·성장 무대가 같은 길로 반응한다.
- 로그인 항목: 패키지 앱(기본 프로필) 첫 실행 때 한 번 `openAtLogin: true`(표시 파일 `userData/login-item-default`). 사용자가 시스템 설정에서 끄면 다시 켜지 않는다. **설정 › 일반 `로그인할 때 sprout 열기` 스위치**(2026-10-05, IPC `desktop:login-item`·`desktop:set-login-item` → `app.setLoginItemSettings`): 패키지 앱 + 기본 프로필에서만 바꿀 수 있고, 개발·프로필 실행은 꺼진 채 비활성 + `설치한 앱에서만 바꿀 수 있어요(개발 실행에서는 꺼져 있어요)`. 스위치로 바꾸면 표시 파일도 남겨 기본값을 다시 넣지 않는다.
- 대기열 주인 확인: 이 기기 DB에 있고 지워지지 않은 할 일만 받는다(로그아웃하면 DB를 비우므로 = 로그인한 내 계정). 로그아웃 상태·7일 넘은 항목·이미 반영한 id는 버린다. id·taskId는 `[A-Za-z0-9_-]`만 허용.

### 14.3 확인한 것 (2026-10-04, 패키지 앱 `SPROUT_PROFILE=e2e-widget SPROUT_WIDGET=1`, 로컬 서버, 시험 계정 `e2e-widget-<시각>@sprout.test`)
- `npm run widget:build && npm run dist:mac` → `Contents/PlugIns/SproutWidget.appex`(팀 BU697KN34B, 샌드박스 + App Group, `Metadata.appintents` 포함), `Contents/Resources/widget_bridge.node`, `codesign --verify --deep --strict` 통과, `pluginkit -m -p com.apple.widgetkit-extension`에 `app.sprout.desktop.widget` 등록.
- 앱이 저장 칸에 확인 창 없이 `snapshot.json`을 씀. 로그아웃 형태 → 가입 뒤 로그인 형태. 할 일 5개(만료 1·종일·하위·반복·시각) → 순서·날짜 문구·depth·반복 표시 맞음. 캐릭터 PNG(`art/cat-1-default@2x.png`, `egg@2x.png`) 구워짐.
- 대기열: 완료 파일 2장(일반·반복) + 깨진 파일 1장 → 일반 완료, 반복은 완료 기록 + 다음 회차(10월 5일), XP +2, 기분 happy로 그림 새로 구움, 깨진 파일은 `actions/bad/`로, `appliedActions`에 id.
- **앱을 끈 채** 대기열 파일을 두고 켬 → 시작하자마자 반영(완료 + XP).
- 딥 링크(`open sprout://…`): `growth` → 성장 화면, `today` → 할 일 › 오늘, `task/<id>` → 그 할 일 상세, `quick-add` → 빠른 추가 창.
- 로그아웃 → 저장 파일이 로그아웃 형태로, `art/`·대기열 비움, 할 일 제목이 저장 칸에 남지 않음.
- 위젯 화면: SwiftUI `ImageRenderer`로 실제 저장 파일을 그려 작게·중간·크게·캐릭터 작게·중간 × 라이트·다크를 눈으로 확인(반영 대기 행·"sprout을 열면 반영돼요" 포함).
- 시험 앱 종료, 로그인 항목에 sprout 없음(프로필 실행은 등록 안 함), 시험 데이터 저장 칸 삭제.

### 14.4 사용자가 직접 확인할 것 (스크립트로 위젯을 바탕화면에 놓을 수 없음)
1. `. scripts/node22.sh && npm run widget:build && npm run dist:mac`
2. `apps/desktop/release/mac-arm64/sprout.app`을 **응용 프로그램 폴더로 복사**해 한 번 열고 로그인(기본 프로필 — 위젯이 켜지는 조건).
3. 바탕화면 빈 곳 **우클릭 → "위젯 편집…"** → 왼쪽 목록에서 **sprout** → "오늘 할 일"(작게·중간·크게)과 "캐릭터"(작게·중간)를 바탕화면이나 알림 센터로 끌어 놓기. 갤러리 미리보기는 예시 데이터여야 한다.
4. 위젯 행 체크박스 누르기 → 바로 체크 표시 → 몇 초 안에 행이 빠지고 캐릭터 위젯 "오늘 XP"가 오른다. 앱 사이드바 XP도 같이.
5. 행 제목·`+`·머리 "오늘"·캐릭터를 눌러 각각 할 일 상세·빠른 추가·오늘·성장이 열리는지.
6. 시스템 설정 › 일반 › 로그인 항목에 sprout이 켜져 있는지(첫 실행 때 켜짐).
7. 확인 창("다른 앱의 데이터에 접근")이 뜨면 서명이 어긋난 것 — `codesign -dvv`로 앱·위젯 팀 ID가 둘 다 BU697KN34B인지 본다.


## 15. 월 캘린더 위젯 (v1.1 — 2026-10-05 사용자 요청 "틱틱처럼 이 위젯이 필요해")
- 상태: **제안 v1.1** — 사용자가 틱틱 맥 "크게" 월 위젯 스크린샷을 보내 요청. 아래 [제안]은 확인 전 값. 모바일 월 위젯은 다른 작업(20번대 명세)이 맡는다.
- 근거: [research 23 §8](../ticktick-research/23-mac-widgets.md)(도움말 macOS "Monthly Calendar View" · M·L 갤러리 그림 · 사용자 스크린샷), [06 캘린더 §5 월 보기 · §14 색 · §16 공휴일·주말](06-calendar.md), [00 토큰](00-design-tokens.md)

### 15.1 결정
| # | 질문 | 제안 | 왜 |
|---|---|---|---|
| M1 | 크기 | **중간 = 이번 주 한 줄, 크게 = 이번 달 전체(5~6주)** | [틱틱] 갤러리 M·L 두 크기, 중간 그림이 이번 주 한 줄 |
| M2 | 주 시작 | **월요일**(앱과 같다) | 06 v1.3.1 사용자 결정. 틱틱 맥 그림도 `M T W T F S S`. 사용자 스크린샷은 일요일 시작이지만 앱 달력과 위젯이 다르면 헷갈린다 |
| M3 | 날짜 숫자 색 | **일요일·공휴일 빨강 `color.holiday`, 토요일 파랑 `color.saturday`**, 요일 머리 `토`·`일`도 같은 색. 오늘은 강조색 채운 원 + 흰 숫자, 다른 달 날짜는 `color.cal.other` | 06 §16 사용자 결정(틱틱은 칠 없음 · 스크린샷은 토·일 파랑) |
| M4 | 공휴일 | **빨간 숫자 + 칸 맨 위 막대 하나로 이름**(빨강 면 · 흰/진한 글자) — 앱 "휴일 표시"가 꺼져 있으면 없음. "휴" 원 배지는 그리지 않는다(06 §16 사용자 결정 2026-10-05 "거슬려" — 위젯은 처음부터 배지 없음) | 스크린샷의 공휴일 막대 자리. 앱 월 칸의 오른쪽 이름 글자는 위젯 칸(≈50pt)에선 "+N"과 부딪힌다 |
| M5 | 보이는 항목 | 앱 캘린더와 **같은 보기 설정**(`view_settings.calendar`): 할 일(완료 보기 · 반복 미래 회차 · 리스트/태그 필터 · 색 기준), "내 일정"(sprout 일정, 보이기·색), 구글·Apple 일정(왼쪽 패널 체크된 캘린더) | 앱 월 보기와 위젯이 다르면 안 된다 |
| M6 | 완료 | **흐리게(면 20% · 글자 3단계 회색), 취소선 없음**. 지난 날 일정도 흐리게 | 06 v1.4 사용자 결정(취소선 삭제) · 스크린샷 |
| M7 | 제목 숨기기 | **설정 없음** — 오늘 할 일 위젯과 같은 수준(제목만). 잠긴 화면 등 시스템이 가리는 곳에서는 `privacySensitive()`로 가린다. "제목 숨기기" 위젯 설정은 [다음] | 위젯 설정(AppIntent 구성)을 넣으면 계약·미리보기가 늘어난다 |
| M8 | 체크 | **월 위젯에서는 체크하지 않는다**(누르면 앱으로) | 막대가 12pt라 체크 칸을 넣을 자리가 없다 · 틱틱 그림에도 체크박스가 없다 |

### 15.2 레이아웃 [임시 — 실측 전]
```
┌───────────────────────────────────────────────┐
│ 10월                                           │ ← 머리 15pt 굵게 primary, 높이 20
│  월    화    수    목    금    토    일          │ ← 요일 10pt secondary (토 파랑 · 일 빨강), 높이 16
├──────┬──────┬──────┬──────┬──────┬──────┬──────┤
│28    │29    │30    │ 1    │ 2    │ 3  +1│ 4    │ ← 날짜 11pt(다른 달 흐림) · "+N" 9pt 강조색 오른쪽 위
│      │      │      │ 국군…│      │ 개천절│      │ ← 막대 높이 13, 간격 2, 글자 9pt, 모서리 3, 좌우 여백 3
│      │      │      │ 보고…│      │      │      │
├──────┼──────┼──────┼──────┼──────┼──────┼──────┤
│ (5) …│                                         │ ← 오늘 = 강조색 원 16 + 흰 숫자
```
| 크기 | 줄 | 막대 수 / 칸 |
|---|---|---|
| 중간 ≈364×170 | 머리 + 요일 + **오늘이 있는 주 1줄** | 칸 높이에서 계산 — 보통 **6개** |
| 크게 ≈364×382 | 머리 + 요일 + **5 또는 6줄**(그 달에 필요한 만큼 — 06 §5와 같다) | 5줄이면 3개, 6줄이면 2~3개(높이에서 계산) |
- 칸 사이 세로·가로 구분선 0.5pt `color.border`(틱틱 그림). 칸 배경은 칠하지 않는다(06 §16).
- 막대 = 리스트(또는 태그·우선순위 — 앱 "색 기준") 색 면. **라이트: 면 = 색 60% + 흰 바탕, 글자 = 색 45% + `text.primary`** / **다크: 면 = 색 62% + `#1A1A1A`, 글자 흰색**(00 토큰 `--cal-fill`·`--cal-text`, 06 §14.1). 색 없는 리스트 = 테마 강조색. 완료·지난 날 일정: 면 20%, 글자 `text.tertiary`.
- 막대 안: [반복이면 ⟲ 7pt] + 제목(9pt, 한 줄, 칸 폭에서 자름). 시각 있는 항목도 시각은 쓰지 않는다(칸이 좁다 — 틱틱 그림도 제목만).
- 순서: 공휴일 → 종일(여러 날 먼저) → 시각 순. 여러 날 항목은 **날마다 막대 하나씩**(이어 그리기 [다음] — 위젯은 날 칸 단위로 그린다).
- "+N" = 그 날 항목 수 − 보인 막대 수(공휴일 막대 제외). 넘친 수가 없으면 숨김.
- 밝기·강조색·흐린/착색 모드는 §5와 같다. 날짜 원·"+N"은 `widgetAccentable()`.

### 15.3 상태
| 상태 | 모양 |
|---|---|
| 처음 · 로그아웃 · 오류 | §4와 같은 문구(가운데) |
| 빈 달 | 격자와 날짜만(빈 문구 없음 — 틱틱 월 보기와 같다) |
| 오래된 데이터(자정 넘김, 앱 꺼짐) | 격자는 저장 파일의 달 그대로, **오늘 원은 위젯 시계 기준**. 달이 바뀌었으면(저장 파일 달 ≠ 이번 달) 가운데 "sprout을 열면 이번 달로 바뀌어요" |
| 불러오는 중 · 갤러리 | 예시 데이터(가짜 제목 "아침 운동"·"팀 회의"…)·`redacted(.placeholder)` |

### 15.4 인터랙션
| 어디를 | 무엇이 | 출처 |
|---|---|---|
| 날짜 칸(막대 밖) | 앱 캘린더가 **그 날로** 이동(보기 종류 일·주·월은 그대로) — `sprout://calendar/<YYYY-MM-DD>` | [추정 — research 23 §8] |
| 할 일 막대 | 그 할 일 상세 — `sprout://task/<id>`(반복 미래 회차는 원래 할 일) | [추정] |
| 내 일정 막대 | 캘린더 그 날 + 일정 팝오버 — `sprout://event/<id>` | [sprout] |
| 구글·Apple 일정 막대 · 공휴일 막대 | 날짜 칸과 같다 | [sprout] |
| 머리 "10월" | 캘린더 오늘 — `sprout://calendar/<오늘>` | [sprout] |
- 딥 링크는 보기·이동만(§6). 날짜·id 모양이 아니면 앱만 앞으로.

### 15.5 데이터 계약 — `snapshot.json`에 `calendar` 추가 (schema 1 그대로, 필드 추가만)
```jsonc
"calendar": {
  "month": "2026-10",                  // 그린 달(로컬). 위젯 "이번 달"과 다르면 오래된 데이터
  "title": "10월",
  "days": [                            // 월요일 시작, 그 달에 필요한 주만큼(35 또는 42칸)
    { "d": "2026-09-28", "other": true, "count": 0, "items": [] },
    { "d": "2026-10-03", "holiday": "개천절", "count": 1,
      "items": [ { "id": "uuid", "kind": "task", "title": "보고서 제출", "color": "#4E75F2", "done": false, "allDay": true, "repeat": false } ] }
  ]
}
```
- `kind`: `task`(→ task 링크) · `event`(sprout 일정 → event 링크) · `ext`(구글·Apple → 날짜 링크). `id`는 task·event만(ext는 null). `color`가 null이면 강조색.
- 하루 막대는 **최대 6개**(중간 6줄)까지만 넣고 `count`에 전체 수. `holiday`는 앱 "휴일 표시"를 켰을 때만. 크기 목표: 보통 달 10KB 안팎.
- 넣지 않는 것: 메모·장소·참석자·리스트 이름·태그 이름. 로그아웃이면 `calendar` 없음(§8.8).
- 다시 쓰는 때(§7에 더함): `events`·`view_settings`·`tags`·`task_tags` 표 변경, 구글·Apple 일정 새로 고침이 끝났을 때, 자정(달 바뀜 포함).

### 15.6 데이터
| 동작 | 읽기 |
|---|---|
| 할 일 | `tasks` + `lists`(색·보관) + `task_tags`(태그 색 기준·필터) — 06 캘린더 쿼리와 같은 조건 |
| 일정 | `events`(제목·시작·끝·반복·색), `view_settings.calendar.options_json`(completed·repeats·lists·tags·color·myCal·myColor·holidays) |
| 외부 일정 | 메인 프로세스 캘린더 캐시(16, `CalendarStore.events(from, to, { panel: true })`) |
| 공휴일 | `@sprout/schema/holidays` `holidayMap` |
| 스키마 변경 | 없음 |

### 15.7 완료 기준
- [ ] 갤러리에 "월 캘린더"(중간·크게), 미리보기는 예시 데이터.
- [ ] 크게: 2026년 10월 — 3(토)·5(대체공휴일)·9(한글날) 빨강 + 공휴일 막대, 토 파랑·일 빨강, 9월 28~30일·11월 칸 흐림, 오늘 원.
- [ ] 막대 색·순서·완료 흐림이 앱 월 보기(같은 보기 설정)와 같다. "+N"이 앱 칸의 "+N"과 같은 수(위젯 막대 수 기준).
- [ ] 중간: 오늘이 있는 주 한 줄, 막대 6개.
- [ ] 칸 → 앱 캘린더 그 날, 할 일 막대 → 상세, 일정 막대 → 일정 팝오버, "10월" → 오늘.
- [ ] 라이트·다크 · 흐린 모드에서 읽힌다.
- [ ] 앱에서 일정·할 일을 바꾸면 위젯이 10초 안에 바뀐다(§7 규칙).

### 15.8 구현 메모 (2026-10-05)
| 위치 | 내용 |
|---|---|
| `src/main/widgetSnapshot.ts` | `calendarOf(db, today, extEvents)` — 06 `CalendarView`와 같은 쿼리·보기 설정(`calendarOptionsOf`)으로 `rangeOf('month')` 격자, `itemsOf`(반복 회차)·`colorOf`(색 기준)·`occurrences`(내 일정)·`holidayMap`. 하루 6개(`MAX_DAY_ITEMS`) + `count`. `buildSnapshot`이 `calendar`를 붙인다(로그아웃이면 없음) |
| `src/main/widget.ts` · `calendars.ts` | 감시 표에 `events`·`view_settings`·`tags`·`task_tags` 추가, `onCalendarsChanged`(구글·Apple 새로 고침 끝)로 다시 쓰기, `panelEvents`(왼쪽 패널 체크 캘린더) |
| `src/main/index.ts` · preload · `App.tsx` · `data/events.ts` · `CalendarView.tsx` | `sprout://calendar/<날짜>` → `desktop:navigate {view:'calendar', date}` → `requestCalendarDate` → 캘린더 커서만 그 날로(보기 종류 그대로, 팝오버·선택 닫음). `sprout://event/<id>` → `openEventById`(그 날 + 일정 팝오버) |
| `native/widget/SproutWidget/MonthWidget.swift` | `MonthWidget`(kind `SproutMonth`, 중간·크게). 칸 높이에서 막대 수 계산(날짜 줄 17 + 막대 12·간격 1.5) — 5주 달 크게 = 3개, 6주 = 2개, 중간 = 6개. 막대는 바탕 모양이 폭을 정하고 글자는 얹어서 자른다(… 없음). 칸 뒤 Link = 날짜, 막대 Link = 할 일·일정. 제목 `privacySensitive()` |
| `Snapshot.swift` · `Views.swift` · `Provider.swift` | `CalItem`·`CalDay`·`CalMonth`(선택 필드라 v1 파일도 그대로 읽힘), `Links.calendar`·`event`, 공휴일·토요일·다른 달·구분선 색, 갤러리 예시 달(`Sample.calendarJSON` — 가짜 제목) |
| `native/widget/fixtures/snapshot.calendar.json` | 사용자 스크린샷을 본뜬 2026년 10월 예시(할 일 파랑·생활 주황·구글 초록 "국군의 날"·반복 "⭐ 주말"·완료 2개·내 일정 "요가" 매주). TS 시험(`tests/widget-calendar.test.ts`)과 Swift 렌더러가 같이 읽는다 |
| `native/widget/preview/render.sh` | 위젯 화면 코드를 `-D WIDGET_RENDER`로 묶어 `ImageRenderer`로 크게·중간 × 라이트·다크 PNG(설치 없음). `WLink`가 렌더러에서는 Link 대신 내용만 그린다(ImageRenderer는 Link를 못 그림) |
- 바뀐 점: 칸 구분선은 토큰 `border.divider`(#F3F3F4)가 위젯에서 거의 안 보여 **한 단계 진한 #EBEBEC / 다크 #2A2A2A** [임시]. 주말 표시 끔(06 §8)은 위젯에 적용하지 않는다(늘 7칸) [다음].
- 남은 확인(§15.7): 실제 바탕화면 위젯에서 크기·여백·Link 영역(사용자 Mac — §14.4와 같은 방법, 갤러리에 "월 캘린더"가 추가로 보임).

## 16. 흐린(vibrant)·강조(accented) 렌더링 규칙 (2026-10-05 — 사용자 스크린숏 "앞에 다른 앱이 있을 때 위젯이 깨짐")
### 16.0 원인
- 바탕화면 위젯은 바탕화면을 만지고 있지 않으면 `widgetRenderingMode == .vibrant`로 그려진다. Apple: vibrant = "Desaturates text, images, and gauges into monochrome and creates a vibrant effect by coloring your content appropriately for the Lock Screen background or a macOS desktop", accented = "treats the widget's views as if they were template images. It replaces the view's color … while preserving the view's alpha channel". 두 경우 모두 시스템이 바탕(containerBackground)을 걷어낸다.
  - 근거: [Preparing widgets for additional contexts and appearances](https://developer.apple.com/documentation/widgetkit/preparing-widgets-for-additional-contexts-and-appearances) · [WidgetRenderingMode.vibrant](https://developer.apple.com/documentation/widgetkit/widgetrenderingmode/vibrant) · [WidgetRenderingMode.accented](https://developer.apple.com/documentation/widgetkit/widgetrenderingmode/accented) · [showsWidgetContainerBackground](https://developer.apple.com/documentation/swiftui/environmentvalues/showswidgetcontainerbackground) · [widgetAccentable(_:)](https://developer.apple.com/documentation/swiftui/view/widgetaccentable(_:))
- 그래서 색으로만 구분하던 것이 깨졌다: 옅은 색 막대(면 60%) 위의 진한 색 글자는 흑백·알파로 바뀌면 막대와 한 덩어리 → 빈 알약. 원본 캐릭터 PNG는 불투명 픽셀이 전부 같은 단색 → 흰 덩어리. 칠한 "오늘" 원 위 흰 숫자도 같은 이유로 사라진다.

### 16.1 바탕
- 바탕은 모든 위젯에서 `containerBackground(for: .widget) { pal.bg }` 하나로만 깐다(본문 안에 바탕 사각형을 따로 그리지 않는다) — 시스템이 흐림·강조 모드에서 이것만 걷어낸다. `containerBackgroundRemovable(false)`는 쓰지 않는다.

### 16.2 단색 팔레트 (`Palette.mono` = `widgetRenderingMode != .fullColor`)
- 색(hue) 대신 **흰색 + 불투명도 단계**로만 그린다: 글자 1 · 보조 0.62 · 3단계 0.4 · 다른 달 날짜 0.32 · 구분선 0.16. 강조색·우선순위색·공휴일 빨강·토요일 파랑은 모두 흰색 단계로 바뀐다.
- 월 캘린더
  - 막대 = **면 흰 20% + 글자 흰 100%**(제목이 늘 보인다). 지난 일정·완료 = 면 8% + 글자 40%, **완료는 제목 앞 체크 표시(✓)** — 색 흐림에 기대지 않는다.
  - 공휴일 = **테두리 막대(흰 55%, 0.8pt) + 이름 글자**(면 없음) — 빨강 대신 모양과 글자로 구분.
  - 오늘 = **테두리 원(1.3pt) + 숫자**(칠한 원 아님). 요일 머리는 전부 보조 단계, 날짜 숫자는 전부 글자 단계(다른 달만 0.32).
- 오늘 할 일: 체크박스 완료(대기) 상태는 면을 칠하지 않고 테두리 50% + 체크.
- `widgetAccentable()`(강조 묶음): 오늘 원, "+N", 머리 "오늘", `+`, 체크박스, XP 막대 채움 — 강조 모드에서 시스템 강조색을 받는다. 나머지는 기본 묶음.

### 16.3 캐릭터
- 단색 모드에서는 원본 PNG 대신 **선화**를 그린다(`LineArt.make`, 위젯 안에서 계산): 흰색 + 알파로 — 윤곽선(알파·밝기 경계, Sobel, 1px 두껍게)과 어두운 이목구비 = 불투명, 몸 면 = 20%. 그림을 아직 못 구웠을 때의 실루엣도 단색 모드에서는 테두리 + 옅은 면.
- XP 막대: 바탕 흰 14% + 채움 흰(강조 묶음) — 늘 보인다.

### 16.4 확인
- 미리보기: `sh native/widget/preview/render.sh` → 월 크게·중간, 캐릭터 작게·중간, 오늘 작게·중간·크게 × 라이트·다크 × `full`·`-vibrant`·`-accented` PNG, 비교용 `-before-vibrant`(고치기 전 색 팔레트를 같은 흉내에 넣은 것 — 사용자 스크린숏의 빈 막대·흰 덩어리가 재현됨). 흉내는 근사(흑백 밝기×알파 → 흰색 불투명도 / 알파만 남겨 한 색)라 최종 확인은 실제 바탕화면에서.
- 완료 기준
  - [ ] 다른 앱을 앞에 두고(흐린 모드) 월 캘린더 막대 제목이 모두 읽힌다, 공휴일 이름이 보인다, 오늘 원이 테두리로 보인다.
  - [ ] 완료 항목에 ✓, 지난 일정은 흐리게.
  - [ ] 캐릭터가 선화로 알아볼 수 있고 XP 막대가 보인다.
  - [ ] 바탕화면을 누르면(전체 색) 이전과 똑같다.

