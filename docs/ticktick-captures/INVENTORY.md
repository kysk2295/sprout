# 틱틱 화면 캡처 인벤토리

틱틱을 똑같이 따라 만들기 위한 화면 자료 모음이다. 화면 명세(`docs/screens/*.md`)는 이 캡처와 [조사 노트](../ticktick-research/README.md)를 근거로 쓴다.

> **내부 참고용이다.** 캡처 원본은 틱틱의 저작물이므로 공개 레포, 앱, 마케팅 자료에 넣지 않는다.

## 수집 현황 (2026-09-13)
| 출처 | 양 | 위치 |
|---|---|---|
| 도움말 센터 이미지 | 문서 82개, 이미지 937개 (114MB). 플랫폼·섹션 라벨 포함 | [_help/INDEX.md](_help/INDEX.md) |
| 공식 사이트 전체 화면 | Mac·Windows 앱 전체 스크린샷 (3621×2136) | [shell-layout/](shell-layout/) |
| 유튜브 프레임 | 영상 7개, 1080p, 프레임 1,166장. 1초 샘플링 + 중복 제거. 영상별 `SOURCE.md`, `times.tsv`, `_sheets/` 접촉 인화지 | [_video/](_video/) |

| 영상 | 내용 | 주요 쓰임 |
|---|---|---|
| [aJ0ELyY215A](_video/aJ0ELyY215A/SOURCE.md) | 공식 · TickTick 8.0 (2026.01) | 최신 데스크톱 레이아웃, 우클릭 메뉴, 설정·테마 |
| [QKAA8p3PY_8](_video/QKAA8p3PY_8/SOURCE.md) | 공식 · 2026 워크플로 | Hotkeys, 전역 추가, `~` 선택, 필터 편집, 2026 뷰 전환 |
| [EUBxb9MgYWg](_video/EUBxb9MgYWg/SOURCE.md) | 공식 · 캘린더 (2025.06) | 월·주·4주 뷰, 빠른 만들기, 보기 옵션, 미루기, 리스트 편집 |
| [MhYkPy6xK4M](_video/MhYkPy6xK4M/SOURCE.md) | 공식 · 캘린더 (2024.08) | 분할 보기, 태스크 배치, 빈 상태 |
| [XeyQd9aXJXE](_video/XeyQd9aXJXE/SOURCE.md) | 공식 · 새 주간 뷰 (모바일) | 모바일 주 뷰 |
| [zqGeCiSgFOk](_video/zqGeCiSgFOk/SOURCE.md) | 제3자 · 전체 튜토리얼 (2025.05, Mac 다크) | 날짜 선택기, 검색, 설정 페이지, 태그·구독, 다크 테마 |
| [hLWIRnKAg6I](_video/hLWIRnKAg6I/SOURCE.md) | 제3자 · 분할 보기 팁 (웹) | 레일 아이콘 툴팁, 웹 분할 보기 |

## 폴더 규칙
- 원본은 출처별 폴더(`_help/`, `_video/`)에 두고 **복사하지 않는다.**
- 화면 폴더(`<화면-id>/`)에는 `SOURCES.md`(도움말 이미지 목록)와 `NOTES.md`(프레임을 보고 기록한 관찰)를 둔다.
- 영상 접촉 인화지: `_sheets/sheetNN.jpg`의 k번째 칸 = 프레임 `f{25×(NN−1)+k}.jpg`

## v1 화면 목록
상태: ⬜ 자료 없음 · 🟨 일부(도움말 이미지 또는 한 상태만) · ✅ 명세를 쓸 수 있음(데스크톱 관찰 노트 있음)

### A. 앱 셸
| id | 화면 | 상태 | 노트 |
|---|---|---|---|
| shell-layout | 전체 레이아웃 | ✅ | [NOTES](shell-layout/NOTES.md) |
| shell-sidebar | 사이드바 + 아이콘 레일 | ✅ | [NOTES](shell-sidebar/NOTES.md) |
| shell-command-menu | 명령 메뉴 (⌘K) | ✅ | [NOTES](shell-command-menu/NOTES.md) |
| shell-search | 검색 (팝업 + 결과 화면) | ✅ | [NOTES](shell-search/NOTES.md) |
| shell-shortcuts | 단축키 (설정 → Hotkeys) | ✅ | [NOTES](shell-shortcuts/NOTES.md) |
| shell-menubar | 메뉴바·미니 창 | 🟨 2020 캡처 + Windows 위젯·작업 표시줄 (현재 Mac 모양 미확인) | [NOTES](shell-menubar/NOTES.md) |
| shell-theme | 테마·다크 모드 | ✅ | [NOTES](shell-theme/NOTES.md) |

### B. 태스크
| id | 화면 | 상태 | 노트 |
|---|---|---|---|
| task-list | 리스트 뷰 (그룹, 행 메타, 빈 상태, 토스트) | ✅ | [NOTES](task-list/NOTES.md) |
| task-quick-add | 앱 안 추가 바 + 스마트 인식 하이라이트 | ✅ (하이라이트는 iOS 캡처 기준) | [NOTES](task-quick-add/NOTES.md) |
| task-global-add | 전역 빠른 추가 + `~` 선택 | ✅ | [NOTES](task-global-add/NOTES.md) |
| task-detail | 상세 패널 | ✅ | [NOTES](task-detail/NOTES.md) |
| task-date-picker | 날짜 선택기 | ✅ (Duration·하위 화면은 도움말 이미지) | [NOTES](task-date-picker/NOTES.md) |
| task-repeat | 반복 설정 | ✅ (iOS 캡처, 데스크톱도 같은 목록) | [NOTES](task-repeat/NOTES.md) |
| task-reminder | 알림 설정 | ✅ (iOS 캡처, 데스크톱도 같은 목록) | [NOTES](task-reminder/NOTES.md) |
| task-priority-tag | 우선순위·태그 선택 | ✅ (우클릭 메뉴·팝오버·체크박스 색) | [task-context-menu](task-context-menu/NOTES.md), [tag-edit](tag-edit/NOTES.md) |
| task-context-menu | 태스크 우클릭 메뉴 | ✅ | [NOTES](task-context-menu/NOTES.md) |
| task-batch | 다중 선택 + 일괄 도구 모음·미루기 | ✅ | [NOTES](task-batch/NOTES.md) |
| task-subtask | 하위 태스크 | ✅ | [NOTES](task-subtask/NOTES.md) |
| task-drag | 드래그 표시 | 🟨 도움말 11장 + 손잡이 관찰 | |
| task-group-sort | 그룹·정렬 메뉴 + 리스트 `...` 메뉴 | ✅ | [NOTES](task-group-sort/NOTES.md) |
| task-completed | 완료 & 하지 않음 | ✅ | [NOTES](task-completed/NOTES.md) |
| task-reminder-popup | 알림 팝업 | 🟨 도움말 2장 | |

### C. 리스트·태그·필터
| id | 화면 | 상태 | 노트 |
|---|---|---|---|
| list-edit | 리스트 만들기·편집 | ✅ | [NOTES](list-edit/NOTES.md) |
| list-context-menu | 리스트·폴더·태그 우클릭 메뉴 | 🟨 진입점(`...`)·행동 확인, 메뉴 배치는 추정 | [NOTES](list-context-menu/NOTES.md) |
| tag-edit | 태그 만들기·표시 | ✅ | [NOTES](tag-edit/NOTES.md) |
| filter-edit | 필터 편집 | ✅ | [NOTES](filter-edit/NOTES.md) |

### D. 캘린더
| id | 화면 | 상태 | 노트 |
|---|---|---|---|
| cal-day | 일 뷰 | 🟨 EUB f0022 (주 뷰와 같은 구조) | [cal-week](cal-week/NOTES.md) |
| cal-week | 주 뷰 + 태스크 팝오버 | ✅ | [NOTES](cal-week/NOTES.md) |
| cal-month | 월 뷰 + 뷰 전환 메뉴 | ✅ | [NOTES](cal-month/NOTES.md) |
| cal-split | 분할 보기 | ✅ | [NOTES](cal-split/NOTES.md) |
| cal-arrange | 태스크 배치 패널 | 🟨 MhY sheet07 | |
| cal-view-options | 보기 옵션 + `...` 메뉴 | ✅ | [NOTES](cal-view-options/NOTES.md) |
| cal-create-drag | 빠른 만들기 팝오버 | ✅ | [NOTES](cal-create-drag/NOTES.md) |
| cal-subscription | 캘린더 구독 | ✅ | [NOTES](cal-subscription/NOTES.md) |

### E. 설정
| id | 화면 | 상태 | 노트 |
|---|---|---|---|
| settings-general | 설정 창 구조, 외관, More, 알림 | ✅ | [NOTES](settings-general/NOTES.md) |
| settings-smart-lists | 스마트 리스트 표시 | ✅ | [NOTES](settings-smart-lists/NOTES.md) |
| settings-account | 계정 | ✅ | [NOTES](settings-account/NOTES.md) |

### F. 모바일 최소형
| id | 화면 | 상태 |
|---|---|---|
| m-today | 오늘 목록 | 🟨 8.0 영상 sheet04 + 도움말 mobile 이미지 |
| m-quick-add | 빠른 추가 | 🟨 도움말 mobile 이미지 |
| m-widget | 위젯 | ✅ macOS 위젯 4종 — [NOTES](m-widget/NOTES.md) |
| m-notification | 알림 | 🟨 |

## 남은 공백 (2026-09-13 2차 보강 후)
1. **Mac 메뉴바 팝업의 현재(2026) 모양** — 2020년 캡처뿐이다. 구조(탭·리스트 전환·추가 바·목록)는 확인했다.
2. **데스크톱 리스트 우클릭 메뉴 화면** — 진입점(`...`)과 행동(Edit·Pin·Archive·Delete)은 확인했고, 메뉴 배치만 추정이다.
3. 알림 팝업 실물(도움말 2장만), 태스크 배치 패널(MhY sheet07), 일 뷰 단독 노트.
4. 모바일 화면 정리(v1 최소형이라 후순위).

→ 1·2는 공개 자료로는 더 이상 확보하기 어렵다. 필요하면 틱틱 앱을 직접 열어 캡처한다. 명세 작성에는 지장이 없다.
