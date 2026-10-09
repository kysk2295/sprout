# 00 · 디자인 토큰

> **v2.1 (2026-10-09) — 45 브랜드 깊은 숲.** 기본 테마 강조 `#12715E`(강조 글자도 같은 색, 흰 글자 5.9:1), 옅은 면 `#DCEFE9`, 막대 끝 `#3DB79B`, 면·선·글자 회색 청록 기운(바닥 `#F3F5F1`, 글자 `#13201C`·`#56655F`·`#8D9A94`·`#B5C0BA`), 위험 `#D9343A`, 우선순위 `#D9343A`·`#C98200`·`#4169E8`, 새 `--color-brand-honey`·`-apricot`(캐릭터·축하 자리 전용). 다크: 바닥 `#0A100E` → 카드 `#141B18` → 칸 `#1C2521`, 강조 채움 `#19856B`(흰 글자 4.6:1) · 글자 `#6EE0C2`. 정본 [45 §3·§8](45-brand-identity.md). 아래 v2.0 표의 초록 값은 기록.
>
> **v2.0 (2026-10-09) — 44 시각 개편 반영. 크기·배치(실측)는 그대로, 색·글자·면·모서리·그림자만 바뀐다.** 정본 [44 §3·§9](44-visual-refresh.md), 사용자 결정 "추천대로"(ⓑ 그라데이션·빛은 캐릭터 자리에서만, ⓒ 기본 테마 강조만 꿈틀 초록).
>
> | 토큰 | v2.0 | v1.x |
> |---|---|---|
> | `--color-accent` · `-ink` · `-subtle` · `-hi` · `--color-on-accent` | 기본 `#22A45D` · `#117F44` · `#E2F5E9` · `#5CD08F` · 흰색 | `#4E75F2` 하나 |
> | 새 `--color-bg-ground` | 기본 `#F7F9F6` · 다크 `#0C0F0D` (데스크톱 레일 뒤·목록 칸 바닥, 그 위에 흰 묶음 카드). 색 테마는 견본색을 아주 옅게 섞은 값 | — |
> | `--color-bg-app` | 흰 면(카드·사이드바 옆 상세·대화 상자) 그대로 `#FFFFFF` — 44 §9의 "bg-app = 바닥"은 이름이 넓게 쓰여 있어 `bg-ground`를 따로 두었다 | `#FFFFFF` |
> | `--color-bg-card` | 흰 면 위 옅은 칸 `#F6F8F5`(설정 묶음·체크리스트). 휴대폰 묶음 카드는 `Palette.cardBg`(흰색) | `#FAFAFA` |
> | 레일 · 사이드바 · 입력 · 고른 · 호버 | `#EEF2EE` · `#FAFBF9` · `#EEF2EE` · `#E2F5E9` · `#F1F4F0` | `#F8F8F8` · 흰 · `#F8F8F9` · `#F1F1F1` · `#F5F5F5` |
> | 선 · 진한 선 | `#E5EAE6` · 새 `--color-border-strong` `#D3DBD5` | `#F3F3F4` |
> | 글자 1·2·3·4 | `#16201A` · `#59665E` · `#8F9B93` · `#B6C0B9` (초록 기운 회색) | `#191919` · `#7D7D7D` · `#A3A4A7` · `#B5B6B8` |
> | 우선순위 높음·중간 / 오류 채움 / 빨강 글자 | `#E5484D` · `#FFB927` / `#E5484D` / `#CF3E3E` | `#C53C31` · `#EFAB3E` / `#D44343` |
> | 다크(`dark`) | 면 세 단계 바닥 `#0C0F0D` → 카드 `#161A17` → 칸 `#1F2420`, 떠 있는 것 `#1C211D`, 그림자 대신 1px 흰 3.5~6% 선. 강조 채움 `#22A45D`(흰 글자 3.2:1), 강조 글자 `#6FE09F` | `#1A1A1A` 계열 · `#545DFA` |
> | 트루 블랙 · 다른 색 테마 11개 | 강조·레일·면은 각자 그대로(하늘 = 예전 기본 파랑 `#4E75F2`). 글자·선·모서리·그림자·글꼴은 v2.0을 받는다 | — |
> | 글꼴 | **Pretendard 우선**(SIL OFL, 데스크톱 앱에 `PretendardVariable.woff2` 동봉). 휴대폰은 iOS 시스템 글꼴 그대로 [다음] | 시스템 우선 |
> | 글자 단계 | 새 `--text-display` 800 30/36 · `--text-h1` 800 28/34(= `--text-title`, 목록 머리) · `--text-h2` 700 18/24 · `--text-num` 800 46/1 · `--text-label` 500 12.5/18, `--text-group` 700 13/18, `--text-detail-title` 750 21/28 | 제목 700 20/26 |
> | 체크 칸 | 데스크톱 17 · 모서리 5(`--radius-check`), 휴대폰 22 · 모서리 7 | 14 · 3 / 17 |
> | 모서리 | `xs 4 · check 5 · sm 8 · md 10 · lg 16 · xl 20 · 2xl 28` (데스크톱 = 휴대폰보다 한 단계 작게) | `3 · 6 · 8 · 12` |
> | 그림자 | `--shadow-card`(sh-1) · `--shadow-float`(sh-2) · `--shadow-popover`/`--shadow-modal`(sh-3) · `--shadow-accent` — 초록 기운 남색 `rgba(18,40,26,…)`, 다크는 선 | 검정 10%·16% |
> | 움직임 | 길이는 그대로. 새 `--ease-spring` `cubic-bezier(.34,1.56,.64,1)` · `--motion-spring` 360ms(들어오는 것만), 움직임 줄이기면 스프링 → 보통 곡선 | — |
> - 대비 시험(`apps/desktop/tests/theme.test.ts`)에 강조 글자 4.5:1(바닥·면·사이드바), 고른 면 4:1, 빨강 글자 4.4:1, 높음 테두리 3:1, 강조 위 글자 3:1(기본·다크)을 더했다.
> - 아래 v1.x 표의 **크기·간격은 그대로 유효**하다. 색 값이 이 표와 다르면 이 표(와 `packages/tokens/tokens.css`)가 우선한다.
> - 글자 렌더링 규칙(antialiased 안 씀)은 그대로.

- 상태: **v2.1** (2026-10-09, 45 브랜드 깊은 숲) · v2.0 (2026-10-09, 44 시각 개편) · 확정 v1.1 (2026-10-03) — v1.0 확인 후 크기·글자를 실측으로 보정(§1 보정 기록)
- v1.3 (2026-10-04): 테마 13개(§5) — 색상 시리즈 12개 + 트루 블랙, 다크 변형 속성·저장 형식·대비 규칙. 사용자 확인 전 구현(사용자 요청 "테마를 다양하게")

> **v1.2 (2026-10-03) — 실제 앱 실측으로 다시 맞춤.** 사용자 Mac의 TickTick 앱을 직접 재서([research 17 §9](../ticktick-research/17-calendar-live.md)) 크기·글자를 바꿨다. 아래 표의 v1.1 값(영상 프레임 + 신호등 20pt 가정으로 1.18배 보정)과 다르면 **이 표가 우선**한다. 토큰 파일은 px로 적는다.
>
> | 토큰 | v1.2 실측 | v1.1 |
> |---|---|---|
> | 본문 / 굵은 본문 | 14px / 20 | 15 |
> | 제목 | 20px 굵게 | 24 |
> | 메타·캡션 / 작은 글자 / 그룹 머리 | 11px / 10.5px / 12.5px 굵게 | 13 / 12 / 15 |
> | 레일 폭 · 아바타 위 · 아이콘 칸·간격 | 55 · 35 · 40 + 8 (중심 간격 48, 첫 아이콘 중심 107) | 66 · 44 · 44 + 9 |
> | 사이드바 폭 · 첫 항목 위 · 항목 높이 | 261 · 12 · 40 | 264 · 20 · 40 |
> | 머리글 높이 · 위 여백 | 57 · 9 (제목 중심 33) | 70 · 14 |
> | 추가 바 높이 · 아래 간격 · 목록 좌우 여백 | 38 · 8 · 21 (2026-10-04 픽셀 재측정) | 40 · 12 · 20 |
> | 행 높이 · 체크박스 · 체크박스–제목 간격 | 40 · 14 · 8 | 44 · 17 · 12 |
> | 아이콘 레일 / 중간 / 작은 | 20 / 18 / 13 | 22 / 20 / 15 |
> - 한국어 용어도 실제 앱을 따른다: Inbox = **기본함**, Overdue = **만료됨**, Add task = **할일 추가**.
> - 글자 렌더링: 틱틱은 macOS 기본 렌더링(획 두께 보정)이라 글자가 더 굵어 보인다. `-webkit-font-smoothing: antialiased`를 쓰지 않는다(2026-10-04 나란히 비교).

- 모든 화면 명세(`docs/screens/*.md`)가 이 문서의 토큰 이름을 쓴다. 화면 코드에 색·크기 값을 직접 쓰지 않는다.

## 1. 근거와 측정 방법
| 출처 | 쓴 곳 | 신뢰도 |
|---|---|---|
| 공식 Mac 스크린샷 [site-mac-preview.png](../ticktick-captures/shell-layout/site-mac-preview.png) (PNG 3621×2136) | Default 테마 배경·선택·구분선, **크기 비율** | 높음 |
| 도움말 PNG ([06 하위 태스크](../ticktick-captures/_help/multilevel-tasks-349248/06-desktop-create-subtasks.png), [13 부모 연결](../ticktick-captures/_help/multilevel-tasks-349248/13-desktop-link-parent-task.png), [10 그룹·정렬](../ticktick-captures/_help/manage-tasks-with-group-sort-801280/10-desktop-how-to-use-group-sort.png), [스마트 리스트 설정](../ticktick-captures/_help/manage-tasks-with-lists-396608/02-desktop-how-to-enable-smart-lists.png), [계정](../ticktick-captures/_help/faq-028672/12-desktop-account-data.png)) — **1x 캡처** | 강조색, 우선순위, 글자색, Sky 테마, 설정 화면, 행 간격 | 높음 |
| 영상 프레임 JPEG (8.0 [f0104](../ticktick-captures/_video/aJ0ELyY215A/f0104.jpg), [EUB f0072](../ticktick-captures/_video/EUBxb9MgYWg/f0072.jpg), [QKA f0008](../ticktick-captures/_video/QKAA8p3PY_8/f0008.jpg), zq 다크 프레임) | 테마 색 목록, 리스트 색 팔레트, 다크 테마 면 색 | 중간 (넓은 면만. JPEG이라 채도가 약간 튈 수 있음) |

- 색: 넓은 면은 5×5 픽셀 중앙값, 글자·테두리는 배경에서 가장 먼 픽셀 4개의 평균(안티앨리어싱 제외)으로 뽑았다. 스크립트는 `scratchpad/sample*.py`.
- 크기: **macOS 신호등 버튼 중심 간격(약 20pt, OS 고정값)을 자로 삼아** 캡처의 px→pt 배율을 구한 뒤 쟀다. 8.0 영상(1px=1.015pt), 2026 영상(1.060pt), 공식 Mac 스크린샷(0.572pt) 세 곳이 서로 맞는다. 스크립트 `scratchpad/calib.py`.
- **보정 기록 (v1.0 → v1.1, 2026-10-03):** v1.0은 도움말 PNG를 1x로 가정했는데, 실제로는 약 85%로 줄인 캡처였다. 그래서 크기·글자가 15~20% 작게 잡혔다. 색은 바뀌지 않았다.
- 틱틱 v1 기준 테마는 **Default(흰색)**. Sky와 Dark를 함께 제공한다.

## 2. 색 토큰 — Default (라이트)
### 면 (surface)
| 토큰 | 값 | 근거 |
|---|---|---|
| `color.bg.app` | `#FFFFFF` | 목록·상세·사이드바 배경 (Mac 스크린샷) |
| `color.bg.rail` | `#F5F5F5` | 아이콘 레일 |
| `color.bg.sidebar` | `#FFFFFF` | Default 테마는 사이드바도 흰색 |
| `color.bg.input` | `#F8F8F9` | 추가 바 등 회색 입력창 |
| `color.bg.selected` | `#F1F1F1` | 사이드바 선택 항목, 선택된 행 |
| `color.bg.hover` | `#F5F5F5` | 선택보다 한 단계 옅게 (추정) |
| `color.bg.card` | `#FAFAFA` | 설정 창 안의 묶음 카드 |
| `color.bg.settings-nav` | `#F8F8F8` | 설정 창 왼쪽 메뉴 |
| `color.bg.popover` | `#FFFFFF` | 메뉴·팝오버·모달 |
| `color.overlay.scrim` | `rgba(0,0,0,0.18)` | 모달 뒤 배경 (계정 캡처 #D0D0D0 기준 역산) |

### 선
| 토큰 | 값 | 근거 |
|---|---|---|
| `color.border.divider` | `#F3F3F4` | 사이드바\|목록\|상세 세로 구분선 (1px) |
| `color.border.row` | `#F1F1F1` | 목록 행 사이 가로선 (1px, 제목 시작점부터) |
| `color.border.input-focus` | `color.accent` | 입력 포커스 테두리 |

### 글자
| 토큰 | 값 | 쓰임 |
|---|---|---|
| `color.text.primary` | `#191919` | 제목, 태스크 이름, 메뉴 항목 |
| `color.text.secondary` | `#7D7D7D` | 설정 값("Show", "Custom"), 보조 설명 |
| `color.text.tertiary` | `#A3A4A7` | 자리 표시 문구("Due Date", "Add task"), 미래 날짜 |
| `color.text.quaternary` | `#B5B6B8` | 개수, 구역 소제목("Lists", "Date") |
| `color.text.link` | `color.accent` | "Change Password", "Postpone" |
| `color.text.danger` | `#D44343` | "Delete Account", **기한 지난 날짜** |

### 강조·상태
| 토큰 | 값 | 근거 |
|---|---|---|
| `color.accent` | `#4E75F2` | 상세 날짜, 오늘 날짜 글자, 링크, 토글 켬, OK·Save 버튼, 오늘 원 (도움말 3곳에서 일치) |
| `color.accent.subtle` | `#ECF0FD` | 메뉴에서 현재 값 표시 배경(우선순위 줄의 선택 칸) |
| `color.danger` | `#D44343` | 삭제, 만료됨, 현재 시각 선 |
| `color.search-highlight` | `#FBE38E` | 검색 일치 부분 (다크 캡처 #DCBF77에서 추정, 라이트 값은 확인 필요) |
| `color.saturday` | `#3D74E0` | 캘린더 토요일 날짜·요일 글자 (06 §16 — 사용자 결정 2026-10-05 "주말도 표시". 일요일은 `color.holiday`) |
| `color.holiday` | `#E5484D` | 캘린더 공휴일 날짜 숫자·이름·"휴" 배지 (06 §16 — 사용자 결정 2026-10-05 "공휴일은 빨간색". 틱틱/디다는 초록 休 #38D6AC) |

### 우선순위 (체크박스 테두리·깃발에 공통)
| 토큰 | 값 | 비고 |
|---|---|---|
| `color.priority.high` | `#C53C31` | 깃발 채움. 체크박스 1.5px 테두리는 렌더링되면 `#D35E59`처럼 보인다 |
| `color.priority.medium` | `#EFAB3E` | |
| `color.priority.low` | `#4E75F2` | = accent |
| `color.priority.none` | `#A6A7A9` | 체크박스 기본 테두리 |

### 리스트·태그 색 팔레트 (Edit List / Add Tag 스와치)
| 토큰 | 값 (2026 캡처) | 값 (2025 캡처) |
|---|---|---|
| `color.list.red` | `#EF5260` | `#F14457` |
| `color.list.orange` | `#F6AC3E` | `#F39F33` |
| `color.list.yellow` | `#F9DC29` | `#FAD525` |
| `color.list.lime` | `#E4F54D` | `#DEF546` |
| `color.list.green` | `#44F273` | `#3AEE64` |
| `color.list.blue` | `#52A4FA` | `#4E99F7` |
| `color.list.purple` | `#6F6EEE` | `#6264EA` |
| (없음) | 사선 원 | |
| (사용자 지정) | 무지개 원 → 계열별 팔레트(Macaron, Morandi, Rococo, Classic …) | |
- JPEG에서 뽑아 초록·연두는 실제보다 채도가 높을 수 있다. **2026 값을 기준으로 삼고, 구현할 때 채도를 10~15% 낮춰 틱틱과 비교한다.**
- 사용자 지정 색이 흔하다(캡처 속 사이드바 점: `#B37974`, `#D28C41`, `#E1CF88`, `#81A694`, `#848DAE`). 리스트 색은 임의의 hex를 허용한다.

### 파생 규칙 (리스트·태그 색에서 계산)
| 요소 | 규칙 | 캡처 확인값 |
|---|---|---|
| 사이드바 색 점 | 리스트 색 그대로, 지름 6px | |
| 캘린더 태스크 막대 배경 | 리스트 색 **35%** + 흰색 | 주황 `#F0C9A8` |
| 캘린더 막대 글자 | 리스트 색 **45%** + 검정 | 주황 막대 글자 `#754F33` |
| 지난 날짜·완료 막대 | 배경 15%, 글자 `color.text.tertiary` | 옅은 복숭아 `#EDE2D3` |
| 폴더·스마트 리스트의 행 왼쪽 세로 막대 | 리스트 색 50% + 흰색, 폭 3px | `#F7D9B5` |
| 태그 알약 배경 | 태그 색 **35%** + 흰색, 글자는 `color.text.primary` | 분홍 `#CFA5BA` / 글자 `#31282C` |

## 3. 색 토큰 — Sky 테마 (8.0 기본 색 테마)
Default와 다른 토큰만 적는다.
| 토큰 | 값 | 근거 |
|---|---|---|
| `color.bg.rail` | `#6387F5` | 레일 전체가 테마색으로 채워짐 (8.0 영상 `#5A79F8`) |
| `color.rail.icon` | `rgba(255,255,255,0.72)` | 레일 아이콘 |
| `color.rail.icon-selected-bg` | `#FFFFFF` | 선택된 레일 아이콘의 흰 사각 배경, 아이콘은 테마색 |
| `color.bg.sidebar` | `#F5F7FF` | |
| `color.bg.app` | `#FBFCFF` | 목록·상세 |
| `color.bg.selected` | `#E3EAFE` | 사이드바 선택, 선택된 행 (`#E8EEFE`) |
| `color.bg.input` | `#EFF3F6` | |
- 강조색은 Sky 테마에서도 `#4E75F2` 계열 그대로다.

## 4. 색 토큰 — Dark
| 토큰 | 값 | 근거 (zq 프레임) |
|---|---|---|
| `color.bg.app` / `sidebar` / `rail` | `#1B1B1B` | 창 전체가 한 색 |
| `color.bg.popover` | `#212121` | 검색 팝업, 메뉴 |
| `color.bg.selected` | `#2B2B2B` | 선택 항목 |
| `color.bg.input` | `#252525` | (추정) |
| `color.border.divider` | `#262626` | (추정, 아주 옅음) |
| `color.text.primary` | `#CDCDCD` | |
| `color.text.secondary` | `#8A8A8A` | (추정) |
| `color.text.quaternary` | `#5A5A5A` | 구역 소제목 (`#505050` 근처) |
| `color.search-highlight` | `#DCBF77` | 검색 일치 부분 |
| `color.saturday` | `#6B9CFF` | 캘린더 토요일 (06 §16) |
| `color.holiday` | `#F2555A` | 캘린더 공휴일 날짜·이름·"휴" 배지 (06 §16) |
- 강조색, 우선순위색, 리스트 색은 라이트와 같다.

## 5. 테마 목록 (v1.3, 2026-10-04 — 설정 → 외관 → 테마)
근거: [research 22 테마](../ticktick-research/22-themes.md). [틱틱] = 틱틱에 있는 테마, [sprout] = 우리가 더한 것, [다음] = v1 제외.

| id | 이름 | 계열 · 묶음 | 견본(레일) | 강조색 | 출처 |
|---|---|---|---|---|---|
| `default` | 기본값 | 라이트 · 색상 시리즈 | `#F8F8F8` | `#4E75F2` | [틱틱] |
| `sky` | 하늘 | 라이트 · 색상 시리즈 | `#6387F5` | `#4E75F2` | [틱틱] |
| `turquoise` | 터쿼이즈 | 라이트 · 색상 시리즈 | `#5CD9AF` | `#117B58` | [틱틱] |
| `teal` | 틸 | 라이트 · 색상 시리즈 | `#77C8C2` | `#237973` | [틱틱] |
| `matcha` | 말차 | 라이트 · 색상 시리즈 | `#ACBF9F` | `#55793D` | [틱틱] |
| `sunshine` | 햇살 | 라이트 · 색상 시리즈 | `#F6BB77` | `#AB5C00` | [틱틱] |
| `peach` | 복숭아 | 라이트 · 색상 시리즈 | `#F589A3` | `#C4286A` | [틱틱] |
| `lilac` | 라일락 | 라이트 · 색상 시리즈 | `#B0A3D3` | `#775DBE` | [틱틱] |
| `ebony` | 에보니 | 라이트 · 색상 시리즈 | `#A98A75` | `#87634A` | [틱틱] |
| `navy` | 네이비 | 라이트 · 색상 시리즈 | `#2B3455` | `#2B3455` | [틱틱] (면이 밝은지 확인 못 함 — research 22 §4) |
| `gray` | 그레이 | 라이트 · 색상 시리즈 | `#363B41` | `#363B41` | [틱틱] (같음) |
| `dark` | 다크 | 다크 · 색상 시리즈 | `#212121` | `#545DFA` | [틱틱] (§4) |
| `black` | 트루 블랙 | 다크 · 다크 시리즈 | `#0A0A0A` | `#5A62FA` | [sprout] OLED·야간용 |
- 계절·도시 일러스트 시리즈: 그림 원본을 쓸 수 없어 v1 제외 → [다음] 직접 만든 그라데이션·그림으로 검토.
- 다크 강조색 고르기(틱틱 Custom Dark Theme) → [다음].
- 값의 정본은 `packages/tokens/tokens.css`. 위 표는 대표값만 적는다.

### 5.1 색 테마가 덮는 변수 (라이트 계열)
견본색 C 하나에서 계산한다(`turquoise`~`gray`). 어두운 견본(네이비·그레이)은 섞는 비율을 0.55배로 줄인다.
| 변수 | 값 |
|---|---|
| `--color-bg-rail` | C |
| `--color-bg-app` / `-sidebar`(=`-settings-nav`) / `-card` | C를 흰색에 2% / 5% / 3.5% |
| `--color-bg-selected` / `-hover` / `-input` / `--color-seg-track` | C 16% / 9% / 7% / 10% |
| `--color-accent` | C의 명도를 낮춰 선택 면 위에서 4.5:1이 되는 첫 값(이미 진하면 C) |
| `--color-accent-subtle` | 강조색 12% |
| `--color-rail-icon` | 흰 아이콘이 레일 위 3:1 이상이면 흰색(82%), 아니면 C의 진한 같은 계열 [sprout — 틱틱은 항상 흰색] |
| `--color-rail-icon-selected` / `-selected-bg` | 강조색 / 흰 사각(틱틱 Sky와 같음) |
| `--color-rail-hover` / `--color-rail-icon-hover` | 밝은 레일: 흰색 35% 덮기 + 레일 아이콘색. 흰 아이콘 레일: 흰색 12%(에보니는 검정 12%) + 흰색 |
- 글자색·우선순위·리스트 색·구분선은 기본값 그대로.
- `--color-rail-hover`·`--color-rail-icon-hover`는 v1.3에 새로 만든 토큰이다. 기본값은 `--color-bg-hover`·`--color-rail-icon`.

### 5.2 다크 계열
- `dark`: §4 값.
- `black`: dark 위에 면만 덮는다 — 앱·사이드바 `#000000`, 레일 `#0A0A0A`, 팝오버 `#161616`, 선택 `#222222`, 호버·입력 `#141414`, 카드 `#111111`, 구분선 `#1C1C1C`, 행 선 `#141414`, 강조 `#5A62FA`(순검정에서 4.5:1을 넘기려고 다크 강조를 한 단계 밝힘), 옅은 강조 `#1E2147`.
- 다크 계열은 모두 `color-scheme: dark`(스크롤 막대·기본 입력 요소).

### 5.3 문서에 붙는 속성 · 저장 형식
- 라이트 계열: `<html data-theme="<id>">`.
- 다크 계열: 모두 `data-theme="dark"`, 변형은 `data-theme-variant="<id>"`(dark 자신은 없음). 화면 CSS의 `[data-theme="dark"] …` 규칙을 변형이 그대로 받는다. tokens.css의 변형 선택자는 `[data-theme="dark"][data-theme-variant="black"]`.
- `[data-theme="default"]`는 `:root`와 같은 값을 다시 선언한다 — 설정의 테마 견본처럼 문서 일부를 기본값으로 되돌린 뒤 그 테마 변수만 덮을 때 쓴다.
- `user_prefs.theme`(스키마 그대로): `"<고른 테마>"` 또는 `"<고른 테마>|<시스템 다크일 때 테마>"`. 두 번째 칸이 없거나 다크 계열이 아니면 `dark`. 예전 값 `default`·`sky`·`dark`는 그대로 읽힌다. 모르는 id는 `default`.
- 코드: `data/theme.ts`(목록·해석), `usePreferences()`가 `theme`(=data-theme 값)·`themeId`·`darkThemeId`를 주고 `data-theme-variant`를 붙인다.

### 5.4 대비 규칙 (시험: `apps/desktop/tests/theme.test.ts`)
| 무엇 | 기준 | 대상 |
|---|---|---|
| 본문 글자 `--color-text-primary` / 모든 면(앱·사이드바·선택·카드·팝오버·입력·호버) | ≥ 4.5:1 | 모든 테마 |
| 보조 글자 `--color-text-secondary` / 앱·사이드바 | ≥ 3.8:1 (틱틱 실측 `#7D7D7D`가 흰 바탕 4.1:1이라 그 기준선) | 모든 테마 |
| 보조 글자 / 선택 면 | ≥ 3.4:1 | 모든 테마 |
| 강조색 / 앱·사이드바, 흰 글자 / 강조 버튼 | ≥ 4.5:1 (실측 3종 `default`·`sky`·`dark`는 ≥ 3:1) | 새 테마 |
| 강조색 / 옅은 강조 면 | ≥ 3:1 | 새 테마 |
| 레일 아이콘 · 선택 레일 아이콘 · 호버 레일 아이콘 / 그 바탕 | ≥ 3:1 (비텍스트) | 새 테마 |
- 3급·4급 글자(`tertiary`·`quaternary`: 자리 표시·비활성)는 기준 밖 — 틱틱 실측값을 따른다.

## 6. 글꼴
| 토큰 | 값 |
|---|---|
| `font.family` | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif` |
| `font.family.numeric` | 같은 글꼴 + `font-variant-numeric: tabular-nums` (시간·개수) |
- 틱틱은 OS 기본 글꼴을 쓴다. 한국어는 Pretendard를 앱에 넣어 Mac·Windows에서 같게 보이게 한다.

| 토큰 | 크기 / 굵기 / 줄 높이 | 쓰임 | 근거 |
|---|---|---|---|
| `text.title` | 24px / 700 / 32px | 목록 제목("Inbox"), 상세 제목 | 8.0 대문자 높이 17.3pt |
| `text.body` | 15px / 400 / 22px | 태스크 이름, 사이드바 항목, 메뉴 항목, 본문 | 8.0 행 제목 15.3~16.4pt |
| `text.body-strong` | 15px / 600 / 22px | 그룹 머리("Today"), 모달 제목 | 8.0 그룹 머리 |
| `text.meta` | 13px / 400 / 18px | 행 오른쪽 날짜·시간, 리스트 이름, 태그 알약 | 8.0 "Jul 11" 12.7pt |
| `text.caption` | 13px / 500 / 18px | 구역 소제목("Lists"), 개수 | 8.0 "Lists" |
| `text.small` | 12px / 500 / 16px | 메뉴 소제목("Date", "Priority") | 8.0 12.0pt |
| `text.placeholder-large` | 20px / 400 | 캘린더 빠른 만들기 "What would you like to do?" | |
| `text.cal-day` | 14px / 500 | 캘린더 날짜 숫자 | |
- 크기를 사용자가 바꿀 수 있다(Cmd/Ctrl + `+`/`-`/`0`). 모든 크기는 `rem` 기준으로 두고(기본 루트 15px), 루트 크기를 12~20px로 바꿔서 조절한다.

## 7. 크기·간격
기본 단위 `space.1 = 4px`. 간격은 4의 배수만 쓴다.
| 토큰 | 값 | 근거 |
|---|---|---|
| `size.rail.width` | 66px | 실측 67pt (8.0) / 65pt (공식) |
| `size.sidebar.width` | 264px (최소 200, 최대 400, 끌어서 조절) | 실측 271pt (8.0) / 259pt (공식) |
| `size.detail.width` | 336px (최소 280, 최대 560, 끌어서 조절) | 실측 338pt (8.0) |
| `size.list.min-width` | 360px | |
| `size.header.height` | 70px (위 14px는 신호등 줄, 내용 중심 42) | 목록·캘린더·상세 머리. 실측 제목 중심 42.6pt, 추가 바 위 71pt |
| `size.rail.top` / `size.rail.item-gap` | 44px / 9px | 레일 맨 위 신호등 영역 / 아이콘 중심 간격 53pt(44+9). 아바타 중심 61pt |
| `size.sidebar.top` | 20px | 사이드바 첫 항목 위. 첫 항목 중심 40pt |
| `size.addbar.height` | 40px | 실측 41.6pt. 둥근 모서리 `radius.md` |
| `size.row.height` | 44px | 실측 44.7pt (8.0) |
| `size.sidebar-item.height` | 40px | 실측 간격 42.6pt에서 위아래 1px씩 |
| `size.checkbox` | 17px, 테두리 1.5px, `radius.xs` | 실측 17.3pt |
| `size.dot` | 6px | 리스트 색 점 |
| `size.icon.sm` / `md` / `rail` | 15 / 20 / 22px | 행 메타 아이콘 / 사이드바·메뉴 / 레일 |
| `space.list.gutter` | 좌우 20px | 목록 영역 안쪽 여백 |
| `space.row.icon-gap` | 12px | 체크박스와 제목 사이 |
| `space.meta-gap` | 8px | 행 오른쪽 메타 사이 (태그·리스트·아이콘·날짜) |
| `size.menu.width` | 200~240px | 우클릭 메뉴 |
| `size.menu.item-height` | 38px | 메뉴 항목 |
| `size.modal.width` | 설정 720px, 리스트 편집 840px(폼 + 미리보기), 일반 모달 400~480px | |

## 8. 모서리·그림자·아이콘·움직임
| 토큰 | 값 |
|---|---|
| `radius.xs` | 3px (체크박스) |
| `radius.sm` | 6px (선택 배경, 알약, 버튼) |
| `radius.md` | 8px (추가 바, 입력창, 카드) |
| `radius.lg` | 12px (메뉴, 팝오버, 모달) |
| `radius.full` | 999px (오늘 원, 토글, 색 점) |
| `shadow.popover` | `0 4px 16px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)` |
| `shadow.modal` | `0 12px 40px rgba(0,0,0,0.16)` |
| `shadow.toast` | 없음. 검정 둥근 알약 `#1F1F1F`, 흰 글자 |
| 아이콘 | 가는 선(1.5px) 아이콘. 리스트 아이콘은 컬러 이모지. 틱틱 아이콘 원본은 쓰지 않고 오픈 라이선스 아이콘 세트(Lucide 등)에서 가까운 모양을 고른다 |
| `motion.fast` | 120ms ease-out (호버, 체크) |
| `motion.base` | 180ms ease-out (메뉴·팝오버 열기, 패널 접기) |
| `motion.toast` | 등장 180ms, 3초 뒤 사라짐 |
- 그림자, 움직임은 캡처로 잴 수 없어서 **추정값**이다. 구현 후 영상과 나란히 놓고 맞춘다.

## 9. 구현 규칙
- 토큰은 CSS 변수로 둔다: `--color-bg-app`, `--text-body-size` 등. 테마는 `[data-theme="<id>"]`(다크 변형은 `[data-theme="dark"][data-theme-variant="<id>"]`)에서 변수만 덮어쓴다(§5.3). 화면 CSS는 색 값을 직접 쓰지 않는다 — 강조 위 흰 글자(`#fff`)만 예외(§5.4가 대비를 보장).
- 리스트 색 파생값(막대 배경, 글자, 알약)은 `color-mix(in srgb, var(--list-color) 35%, white)`처럼 계산한다. 색마다 값을 따로 저장하지 않는다.
- 데스크톱(Electron)과 모바일(React Native)이 같은 토큰 JSON(`packages/tokens/tokens.json`)을 쓰고, 웹용 CSS 변수와 RN 상수를 그 JSON에서 생성한다.

## 10. 완료 기준 (틱틱과 나란히 놓고 확인)
- [ ] Default 테마 목록 화면 캡처와 우리 화면을 같은 창 크기로 겹쳤을 때, 레일·사이드바·목록·상세 경계가 ±4px 안에 들어온다.
- [ ] 신호등 간격으로 환산한 틱틱 8.0 캡처와 행 높이·체크박스·글자 크기가 ±1px.
- [ ] 우선순위 4색, 강조색, 만료됨 빨강이 캡처와 눈으로 구분되지 않는다.
- [ ] Sky·Dark로 바꿔도 토큰 3~5개 덮어쓰기만으로 캡처와 같은 인상이 난다.
- [x] 13개 테마 모두 §5.4 대비 시험 통과(`npm run test:desktop`).
- [x] 13개 테마를 실제 앱에서 하나씩 적용해 목록·캘린더·성장·수집함·작업 지도·설정·미니 창 확인(2026-10-04, 육안).
- [ ] 글자 크기를 바꾸면(Cmd +/-) 모든 크기가 비율대로 따라간다.

## 11. 열린 질문
1. 라이트 테마의 검색 강조색 — 라이트 캡처가 없다. 다크 값에서 추정했다.
2. 리스트 색 팔레트의 정확한 값 — JPEG 채도 문제. 앱을 직접 열 수 있으면 확정한다.
3. ~~사이드바 오른쪽 표시~~ → **결정(2026-10-03): 색 점 + 개수, 개수가 0이면 숨김.** [01-app-shell](01-app-shell.md) 참고.
