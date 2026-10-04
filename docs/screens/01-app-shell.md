# 01 · 앱 셸 (창 · 아이콘 레일 · 사이드바 · 레이아웃)

- 상태: **확정 v1.0** (2026-10-03 사용자 확인) — [임시] 항목은 틱틱 동작이 확인되면 고친다
- 토큰: [00-design-tokens](00-design-tokens.md)의 이름만 쓴다.
- 표기: **[틱틱]** = 캡처·도움말로 확인한 틱틱 동작 · **[sprout]** = 틱틱에 없어서 새로 설계 · **[임시]** = 틱틱 동작을 확인하지 못해 임시로 정한 것(확인되면 고친다)

## 1. 틱틱 기준 자료
| 주제 | 자료 |
|---|---|
| 전체 4단 구조, 시각 언어 | [shell-layout/NOTES](../ticktick-captures/shell-layout/NOTES.md), [공식 Mac 스크린샷](../ticktick-captures/shell-layout/site-mac-preview.png) |
| 사이드바 구성, 레일 아이콘(툴팁 확인) | [shell-sidebar/NOTES](../ticktick-captures/shell-sidebar/NOTES.md) |
| 스마트 리스트 표시 설정 | [settings-smart-lists/NOTES](../ticktick-captures/settings-smart-lists/NOTES.md), [research 04](../ticktick-research/04-lists.md) |
| 리스트·폴더·태그 메뉴 | [list-context-menu/NOTES](../ticktick-captures/list-context-menu/NOTES.md), [research 12](../ticktick-research/12-tags.md) |
| 사이드바로 끌어 놓기 | [research 06](../ticktick-research/06-desktop-interactions.md) |
| 명령 메뉴, 단축키 | [shell-command-menu/NOTES](../ticktick-captures/shell-command-menu/NOTES.md), [shell-shortcuts/NOTES](../ticktick-captures/shell-shortcuts/NOTES.md) |
| 검색 진입 | [shell-search/NOTES](../ticktick-captures/shell-search/NOTES.md) |
| 테마 | [shell-theme/NOTES](../ticktick-captures/shell-theme/NOTES.md) |
| 구독 캘린더 구역 | [cal-subscription/NOTES](../ticktick-captures/cal-subscription/NOTES.md) |

## 2. 레이아웃
```
┌──────┬──────────────┬───────────────────────┬──────────────────┐
│ 레일  │  사이드바     │  메인 (목록·캘린더·성장) │  상세 패널        │
│ 66px │ 264px        │  나머지 (최소 360px)    │ 336px            │
│      │ ↔ 200~400    │                       │ ↔ 280~560        │
└──────┴──────────────┴───────────────────────┴──────────────────┘
```
| 영역 | 크기 | 배경 | 비고 |
|---|---|---|---|
| 아이콘 레일 | `size.rail.width` 66px 고정 | `color.bg.rail` | [틱틱] |
| 사이드바 | `size.sidebar.width` 264px, 오른쪽 경계를 끌어 200~400px | `color.bg.sidebar` | [틱틱] 폭 조절 범위는 [임시] |
| 메인 | 나머지, 최소 `size.list.min-width` 360px | `color.bg.app` | 레일에서 고른 화면이 들어간다 |
| 상세 패널 | `size.detail.width` 336px, 왼쪽 경계를 끌어 280~560px | `color.bg.app` | [틱틱] 태스크 화면에만 있다. 캘린더에서는 팝오버로 대체 ([cal-week NOTES](../ticktick-captures/cal-week/NOTES.md)) |
- 영역 사이는 `color.border.divider` 1px 세로선만 쓴다. 그림자·카드 없음 [틱틱].
- 크기 조절 손잡이: 경계선 ±3px에서 커서가 `col-resize`로 바뀐다. 더블클릭하면 기본 폭으로 돌아간다 [임시].
- 사이드바·상세 폭은 기기에 저장한다(동기화하지 않음).

### 창
- 최소 크기 **800 × 560px** [임시].
- **Mac:** 제목 표시줄을 숨기고(`titleBarStyle: hiddenInset`), 신호등 버튼이 레일 맨 위에 겹쳐 놓인다. 레일 위쪽 40px은 창 끌기 영역이다 [틱틱].
- **Windows:** 오른쪽 위에 최소화·최대화·닫기(`titleBarOverlay`, 높이 40px), 레일 위쪽 40px이 끌기 영역이다 [임시].
- 각 영역 머리(제목 줄, `size.header.height` 56px)의 빈 곳도 창 끌기 영역이다. 버튼과 입력은 제외한다.

### 창이 좁아질 때 [임시 — 틱틱 동작 미확인]
| 창 폭 | 동작 |
|---|---|
| 1100px 이상 | 4단 모두 표시 |
| 900 ~ 1100px | 상세 패널이 메인 위에 오른쪽에서 겹쳐 뜨는 서랍이 된다(태스크를 고르면 열리고, Esc나 바깥 클릭으로 닫힘) |
| 900px 미만 | 사이드바가 자동으로 접힌다. 접기 버튼으로 잠깐 열면 메인 위에 겹쳐 뜬다 |

## 3. 아이콘 레일
위에서 아래로. 아이콘은 `size.icon.rail` 22px, 칸은 66×44px. 맨 위 52px은 신호등 버튼과 창 끌기 영역이다.

| 순서 | 항목 | 동작 | 출처 |
|---|---|---|---|
| 1 | 아바타 (지름 32px) | 클릭 → 아바타 메뉴 (아래 3.1) | [틱틱] 위치 / 메뉴 내용은 [임시] |
| 2 | **태스크** (체크 아이콘) | 태스크 화면(사이드바 + 목록 + 상세) | [틱틱] |
| 3 | **캘린더** | 캘린더 화면 ([cal-month NOTES](../ticktick-captures/cal-month/NOTES.md)) | [틱틱] |
| 4 | **성장** (새싹 아이콘) | 캐릭터·KPI·주간 리포트 화면 | [sprout] 틱틱의 습관·매트릭스·집중·카운트다운 자리 |
| 5 | **검색** (돋보기) | 검색 팝업 ([shell-search NOTES](../ticktick-captures/shell-search/NOTES.md)) | [틱틱] |
| (빈 공간) | | | |
| 6 | 동기화 | 클릭 → 바로 동기화. 상태 표시(아래 3.2) | [틱틱] |
| 7 | 알림 (종) | 앱 알림 목록(주간 리포트 도착, KPI 초안 준비 등) | 위치 [틱틱] / 내용 [sprout] |
| 8 | 도움말 (?) | 메뉴: 단축키 보기 · 도움말 · 피드백 보내기 | [틱틱] (QKA 영상 sheet01) |

### 상태
| 상태 | Default 테마 | Sky 테마 |
|---|---|---|
| 기본 | 아이콘 `color.text.tertiary` | 흰색 72% |
| 호버 | 칸 배경 `color.bg.hover`, `radius.sm` | 흰색 100% |
| 선택(현재 화면) | 아이콘 `color.accent` 채움 | 흰 사각 배경 + 테마색 아이콘 |
| 툴팁 | 0.5초 호버 → 오른쪽에 검은 알약 툴팁 "Task", "Calendar View" … [틱틱] | 같음 |

### 3.1 아바타 메뉴 [임시 — 틱틱 메뉴 내용 미확보]
- 설정 (⌘,) · 동기화 · 로그아웃. 도움말 문서에 "아바타 → 설정"으로 설정에 들어간다는 것까지만 확인했다.

### 3.2 동기화 아이콘
| 상태 | 표시 |
|---|---|
| 동기화됨 | 기본 아이콘 |
| 동기화 중 | 아이콘이 회전 (`motion.base` 반복) |
| 오프라인 | 아이콘 옆에 회색 점 + 툴팁 "오프라인 — 변경 사항은 기기에 저장되어 있습니다" [sprout] |
| 업로드 대기 있음 | 툴팁에 "동기화 대기 N건" [sprout] |
| 오류 | 아이콘 옆 빨간 점(`color.danger`) + 클릭하면 오류 내용과 다시 시도 [sprout] |
- 데이터: PowerSync `currentStatus`(connected, uploading, downloading, lastSyncedAt)와 `ps_crud` 대기 개수. A1 스파이크에서 같은 값을 읽었다.

## 4. 사이드바 (태스크 화면)
### 4.1 구성 (위 → 아래) [틱틱 8.0]
| 구역 | 항목 | 표시 조건 |
|---|---|---|
| 스마트 리스트 | All · Today · Tomorrow · Next 7 Days · Inbox | 설정 → 스마트 리스트에서 항목별 표시/숨김/비어 있지 않을 때만. **Inbox는 숨길 수 없다** |
| (구분선) | | |
| **Lists** | 리스트, 폴더(펼침/접힘), 맨 아래 Archived Lists(보관한 리스트가 있을 때만) | 항상 |
| **Filters** | 필터 | 설정에서 켰을 때 |
| **Tags** | 태그(2단계 태그는 들여쓰기) | 설정에서 켰을 때 |
| **Calendar Subscription** | 구독한 구글 계정(이메일 + 일정 개수) | 구글 계정을 연결했을 때 |
| (구분선) | | |
| 하단 | Completed · Won't Do · Trash | 설정 기본값: Completed·Trash 표시, Won't Do 숨김 |

### 4.2 행
- 높이 `size.sidebar-item.height` 40px, 행 간격 2px, 좌우 여백 8px, 안쪽 여백 12px, 모서리 `radius.sm`.
- 왼쪽: 아이콘 `size.icon.md` 20px(스마트 리스트는 선 아이콘, 리스트는 컬러 이모지, 이모지가 없으면 `≡`). 아이콘과 이름 사이 10px.
- 이름: `text.body`, 넘치면 말줄임.
- 오른쪽 **[결정 2026-10-03]**: 리스트 색 점(`size.dot` 6px, 색이 없으면 생략) + 미완료 개수(`text.caption`, `color.text.quaternary`). **개수가 0이면 숨긴다.**
  - 스마트 리스트·태그·필터도 같은 규칙(태그는 태그 색 점).
- 폴더: 왼쪽에 `›`/`⌄` 펼침 표시(12px), 하위 리스트는 16px 들여쓰기. 폴더 개수 = 하위 리스트 미완료 합계.
- 구역 소제목(Lists, Filters, Tags, Calendar Subscription): `text.caption`, `color.text.quaternary`, 높이 32px. **마우스를 올리면 오른쪽에 `⌄`(구역 접기) · `...` · `+`(추가)**가 나타난다 [틱틱].
- 태그가 하나도 없을 때 Tags 구역에 안내 카드: "#을 입력하면 태스크에 태그를 바로 붙일 수 있어요" [틱틱 문구 번역].

### 4.3 행 상태
| 상태 | 표시 |
|---|---|
| 기본 | 배경 없음 |
| 호버 | `color.bg.hover`. 리스트·폴더·태그·필터 행은 오른쪽 색 점·개수 자리에 **`...` 버튼**이 나타난다 [틱틱] |
| 선택 | `color.bg.selected`, 글자 굵기 그대로 |
| 끌어 놓기 대상(태스크를 끌고 있을 때) | 배경 `color.accent.subtle` + 테두리 1px `color.accent` |
| 리스트 순서 바꾸기 중 | 놓일 위치에 2px `color.accent` 가로선. 리스트 위에 놓으면 폴더 만들기 표시(배경 강조) |
| 이름 바꾸기 중 | 그 자리에서 입력창으로 바뀜 [임시] |

### 4.4 클릭·키보드
- 클릭 → 메인에 그 목록을 연다. 고른 항목은 기기에 저장해 다음 실행 때 복원한다.
- 사이드바에 포커스가 있을 때 **↑/↓로 항목 이동** [틱틱], Enter로 열기, ←/→로 폴더 접기/펴기 [임시].
- 폴더 행 클릭 → 폴더의 모든 리스트를 합친 목록(리스트별 그룹) [틱틱: 폴더·스마트 리스트에서 "리스트별 그룹" 제공].

### 4.5 우클릭 / `...` 메뉴
메뉴 모양은 [task-context-menu](../ticktick-captures/task-context-menu/NOTES.md)와 같다(`radius.lg`, `shadow.popover`, 항목 높이 36px).
| 대상 | 항목 | 출처 |
|---|---|---|
| 리스트 | 편집 · 고정 · 보관 · (구분선) · 삭제 | 행동 [틱틱], 배치 [임시] |
| 폴더 | 이름 바꾸기 · 폴더 해제 · (구분선) · 삭제(하위 리스트는 폴더 밖으로 나옴) | 폴더 해제 [틱틱], 나머지 [임시] |
| 태그 | 고정 · 편집 · (구분선) · 삭제 | [틱틱] |
| 필터 | 편집 · (구분선) · 삭제 | [임시] |
| 스마트 리스트 | 숨기기 | [임시] |
| 태스크 아이콘(레일) | "캘린더와 함께 보기" | [틱틱] ([cal-split NOTES](../ticktick-captures/cal-split/NOTES.md)) |
| 캘린더 아이콘(레일) | "태스크와 함께 보기" | [틱틱] |
- "고정"한 리스트·태그는 구역 맨 위로 올라간다 [임시].
- 삭제는 확인 모달을 띄운다: "리스트를 삭제하면 안의 태스크가 휴지통으로 이동합니다." [임시]

### 4.6 끌어 놓기 [틱틱 — research 06]
| 끄는 것 | 놓는 곳 | 결과 |
|---|---|---|
| 태스크(햄버거 손잡이, 여러 개 선택 포함) | 리스트 | 그 리스트로 이동 |
| 태스크 | 스마트 리스트(Today/Tomorrow/Next 7 Days) | 해당 마감일 설정 |
| 태스크 | 태그 | 태그 추가 |
| 리스트 | 리스트 사이 | 순서 변경 |
| 리스트 | 다른 리스트 위 | 두 리스트로 새 폴더 만들기 → 이름 입력 팝업 |
| 리스트 | 폴더 위·안 | 폴더로 이동 |
| 태그 | 다른 태그 아래 | 2단계 태그로 만들기 |
- 끄는 동안 사이드바 맨 위·아래 24px에 닿으면 자동 스크롤한다.

### 4.7 추가
- Lists 소제목의 `+` → "리스트 추가" 모달 ([list-edit NOTES](../ticktick-captures/list-edit/NOTES.md), 별도 명세 `05-list-edit.md`).
- `+` 메뉴는 리스트 추가 · 폴더 추가 두 가지 [임시].
- Tags `+` → 태그 추가 모달 ([tag-edit NOTES](../ticktick-captures/tag-edit/NOTES.md)). Filters `+` → 필터 편집 모달. Calendar Subscription `+` → 구글 캘린더 연결.

## 5. 사이드바 접기
- 메인 머리 왼쪽의 접기 아이콘(▯|)을 누르면 사이드바가 접힌다. 다시 누르면 펴진다 [틱틱: 아이콘 위치].
- 접기·펴기 애니메이션: 폭 264 → 0, `motion.base`.
- 접힌 상태는 기기에 저장한다.
- 단축키 [임시]: ⌘\ (Windows Ctrl+\\).

## 6. 메인 영역 머리 (공통 틀)
- 높이 56px, 좌우 여백 `space.list.gutter` 16px.
- 왼쪽: 접기 아이콘 → 제목(`text.title`, 리스트 이모지 포함). 오른쪽: 화면별 버튼(태스크: 전구(오늘만)·정렬·`...` / 캘린더: `+`·뷰 전환·`‹ Today ›`·`...`).
- 화면별 내용은 각 명세에서 정한다: 태스크 → `02-task-list.md`, 캘린더 → `06-calendar.md`.

## 7. 전역 단축키
| 키 (Mac / Windows) | 동작 | 출처 |
|---|---|---|
| ⌘K / Ctrl+K | 명령 메뉴 | [틱틱] |
| / | 검색 | [틱틱] |
| ? | 단축키 목록 | [틱틱] |
| Tab+N 또는 N | 새 태스크(현재 목록의 추가 바에 포커스) | [틱틱] |
| G → A / T / M / N / I | All · Today · Tomorrow · Next 7 Days · Inbox로 이동 | [틱틱] (Tomorrow의 M은 추정) |
| G → S | 설정 | [틱틱] |
| ⌘S / Ctrl+S | 지금 동기화 | [틱틱] |
| ⌘Z, ⇧⌘Z | 되돌리기, 다시 실행 | [틱틱] |
| ⌘+ / ⌘- / ⌘0 | 글자 크기 (루트 크기 12~20px, 기본 15px) | [틱틱] |
| ⌘, / Ctrl+, | 설정 | [임시, OS 관례] |
| ⌘\ / Ctrl+\\ | 사이드바 접기 | [임시] |
| **전역(앱이 뒤에 있어도)** ⌃⇧A / Alt+Shift+A | 빠른 추가 바 | [틱틱] 기본값은 사용자가 바꿀 수 있음 |
| **전역** ⇧⌘O / Alt+Shift+O | 메뉴바·트레이 창 보이기/숨기기 | [틱틱] Mac 값만 확인 |
| **전역** ⇧⌘E / Alt+Shift+E | 메인 창 보이기/숨기기 | [틱틱] Mac 값만 확인 |
- 입력창에 포커스가 있을 때는 한 글자 단축키(/, ?, N, G→X)를 쓰지 않는다.
- 단축키 표는 설정 → 단축키에서 바꿀 수 있게 한다(v1 후보).

## 8. 빈 상태 · 로딩 · 오류
| 상황 | 표시 |
|---|---|
| 첫 실행, 로그인 전 | 로그인 화면(별도 명세 `09-auth.md`) |
| 로그인 직후 첫 동기화 중 | 사이드바와 목록 자리에 회색 막대 뼈대 3~5줄. 동기화 아이콘 회전 [sprout] |
| 첫 동기화 실패 | 메인 가운데에 "동기화하지 못했어요" + 다시 시도 버튼. 기기에 데이터가 이미 있으면 그대로 보여주고 동기화 아이콘만 오류 표시 [sprout] |
| 리스트가 하나도 없음 | Lists 구역에 소제목만 있고, 호버하면 `+`. Inbox는 항상 있다 |
| 선택한 리스트가 다른 기기에서 삭제됨 | Inbox로 이동 + 토스트 "리스트가 삭제되었습니다" [sprout] |

## 9. 테마
- 레일·사이드바·선택 색은 [00 토큰 §3·§4](00-design-tokens.md)의 테마 덮어쓰기를 따른다.
- 시스템 다크 모드 연동이 켜져 있으면 OS 설정이 바뀔 때 Dark ↔ 마지막 라이트 테마로 즉시 바뀐다 [틱틱].

## 10. 데이터
### 읽는 것
| 테이블 (PowerSync, 동기화) | 필드 | 쓰임 |
|---|---|---|
| `lists` | id, name, emoji, color, folder_id, sort_order, pinned, archived_at, show_in_smart (`all`/`none`) | Lists 구역 |
| `folders` | id, name, sort_order | 폴더 행 |
| `tags` | id, name, color, parent_id, sort_order, pinned | Tags 구역 |
| `filters` | id, name, emoji, rule_json, sort_order | Filters 구역 |
| `tasks` | list_id, status(0 미완료 / 1 완료 / 2 하지 않음), due_at, deleted_at | 개수 계산 |
| `task_tags` | task_id, tag_id | 태그 개수 |
| `user_prefs` | smart_list_visibility(json), theme, follow_system_dark, week_start | 표시·테마 (기기 사이 동기화) |

| 기기에만 저장 | 내용 |
|---|---|
| `local_ui_state` | sidebar_width, sidebar_collapsed, detail_width, collapsed_sections, collapsed_folders, last_selected_view |
| `calendar_accounts` | 구글 계정 이메일, 구독한 캘린더 목록, 일정 캐시 (토큰은 OS 키체인) — PRD C |

### 개수 규칙
- 리스트·폴더·태그: `status = 0`이고 휴지통에 없는 태스크 수.
- Today: 마감일이 오늘이거나 **지난 미완료 태스크**(오늘 리스트에 Overdue 그룹으로 함께 보이므로) [틱틱 화면 구성 기준, 개수 포함 여부는 확인 필요].
- Tomorrow / Next 7 Days: 마감일이 해당 기간인 미완료 태스크. All: 미완료 전체. Inbox: Inbox 리스트의 미완료.
- 개수는 로컬 SQLite 쿼리로 계산하고, 태스크가 바뀔 때 `watch`로 다시 그린다(서버를 기다리지 않음).

### 쓰는 것
- 리스트·폴더·태그 순서(sort_order), 고정, 보관, 폴더 이동, 삭제.
- 끌어 놓기 결과: `tasks.list_id`, `tasks.due_at`, `task_tags` 추가.

## 11. 완료 기준 (틱틱과 나란히 놓고 확인)
- [ ] 1440×900 창에서 Default 테마 화면을 [공식 Mac 스크린샷](../ticktick-captures/shell-layout/site-mac-preview.png)과 같은 비율로 겹쳤을 때, 레일·사이드바·메인·상세의 경계가 ±4px 안에 들어온다.
- [ ] Sky 테마로 바꾸면 레일이 테마색으로 채워지고 선택 아이콘이 흰 사각이 된다 ([8.0 f0061](../ticktick-captures/_video/aJ0ELyY215A/f0061.jpg)과 비교).
- [ ] 사이드바 구역 순서와 하단 고정 구역이 [8.0 f0108](../ticktick-captures/_video/aJ0ELyY215A/f0108.jpg)과 같다(우리에게 없는 항목 제외).
- [ ] 행에 마우스를 올리면 `...`이 나타나고, 우클릭 메뉴가 태스크 우클릭 메뉴와 같은 모양이다.
- [ ] 태스크를 Today·리스트·태그로 끌어 놓으면 각각 날짜·리스트·태그가 바뀌고, 개수가 서버 응답 없이 바로 바뀐다.
- [ ] 리스트를 다른 리스트 위에 놓으면 폴더가 만들어진다.
- [ ] 오프라인에서도 모든 사이드바 동작이 되고, 동기화 아이콘이 오프라인을 보여준다. 다시 연결되면 자동 동기화된다.
- [ ] ⌘K, /, ?, G→T, ⌘S, ⌘+/-/0이 동작한다. 입력 중에는 한 글자 단축키가 동작하지 않는다.
- [ ] 사이드바 폭, 접힘, 마지막으로 본 목록이 다시 실행해도 유지된다.

## 12. 열린 질문
1. 창이 좁아질 때 틱틱의 실제 동작(상세 서랍, 사이드바 자동 접기) — [임시]안으로 진행한다.
2. 아바타 메뉴의 실제 항목 — 틱틱 앱을 열 수 있으면 확인한다.
3. ~~Today 개수~~ → **결정: 기한 지난 미완료 태스크를 포함한다.**
4. ~~성장 아이콘 위치~~ → **결정: 레일 3번째(태스크·캘린더 다음).**
