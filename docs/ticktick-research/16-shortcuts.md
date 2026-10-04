# 틱틱 조사: 데스크톱 단축키·명령 메뉴

- 출처: [TickTick Help — Desktop Shortcuts](https://help.ticktick.com/articles/7055780449171275776), [Add Tasks](https://help.ticktick.com/articles/7055782422935240704), [Desktop Interaction Tips](https://help.ticktick.com/articles/7351523697951244288) (2026-09-13 확인)
- 상태: **부분 조사.** 도움말에는 단축키 전체 목록이 없다. 앱 안에서 `?`를 눌러야 볼 수 있다.

## 확인된 것
- **명령 메뉴:** ⌘K / Ctrl+K로 열고, 이름을 입력해 앱의 기능 화면으로 이동한다. 도움말은 "Mac 미지원"이라고 적지만, **2026 공식 영상에서는 Mac 설정 → Hotkeys에 "Open Command Menu ⌘K"가 있다**([캡처 노트](../ticktick-captures/shell-shortcuts/NOTES.md)). 도움말이 옛 정보다.
- **전체 단축키 표(Mac 2026)는 [shell-shortcuts/NOTES.md](../ticktick-captures/shell-shortcuts/NOTES.md)에서 확보했다.**
- **단축키 목록 보기:** `?` 입력. 또는 왼쪽 아래 `?` → 단축키.
- **단축키 변경:** 설정의 단축키 화면, 사이드바의 단축키 화면, 또는 명령 메뉴 → 도움말 → 단축키 보기에서 바꾼다. **회색으로 표시된 단축키는 바꿀 수 없다.**

## 지금까지 모은 단축키 (다른 문서에서 확인)
| 단축키 | 동작 | 출처 |
|---|---|---|
| Shift+Alt+A (Windows) / **Cmd+Shift+A (Mac)** | 전역 빠른 추가 | 01-add-tasks, [ticktick.com/mac](https://ticktick.com/mac) |
| Cmd+Shift+O (Mac) | 메뉴바 창 열기 (태스크 보기, 집중 시작) | [ticktick.com/mac](https://ticktick.com/mac) |
| Shift+Enter → Cmd/Ctrl+Enter | 추가 중 설명 입력 → 만들기 | 01-add-tasks |
| Ctrl+0 (태스크 선택 상태) | 선택한 태스크를 오늘로 | 06-desktop-interactions |
| Ctrl+Alt+0 (Mac: Cmd+Shift+0) | 몰입 쓰기 모드 | 06-desktop-interactions |
| ↑/↓, Shift+↑/↓ | 이동, 범위 선택 | 06-desktop-interactions |
| Cmd/Ctrl + `+`/`-`/`0` | 글자 크기 | 06-desktop-interactions |
| ⌘K / Ctrl+K | 명령 메뉴 | 이 문서 |
| `?` | 단축키 목록 | 이 문서 |

## 외부 단축키 목록 (⚠️ 신뢰도 낮음)
- 출처: [UseTheKeyboard](https://usethekeyboard.com/ticktick/), [QuickRef](https://quickref.me/ticktick.html). 두 목록의 내용이 같아서 한 출처를 복사한 것으로 보인다. 날짜 표기가 없다.
- **공식 도움말과 다르다.** 전역 빠른 추가를 공식은 `Shift+Alt+A`, 외부는 `Ctrl+Shift+A`로 적는다. 또 `Ctrl+0~3`이 날짜와 우선순위에 **중복으로** 적혀 있다. 조사 과정에서 수정 키가 빠진 것으로 보인다. 옛 버전 기준일 가능성이 크므로 **참고용으로만** 쓴다.

| 키 (Windows) | 동작 | 비고 |
|---|---|---|
| Ctrl+N | 태스크 추가 | |
| Ctrl+F | 태스크 검색 | |
| Ctrl+S | 동기화 | |
| Ctrl+Shift+M | 태스크 완료 | |
| Ctrl+D | 날짜 설정 | |
| Ctrl+0 / 1 / 2 / 3 | 날짜: 없음 / 오늘 / 내일 / 다음 주 | 우선순위와 중복 표기 |
| Ctrl+0 / 1 / 2 / 3 | 우선순위: 없음 / 낮음 / 중간 / 높음 | 날짜와 중복 표기 |
| Ctrl+Shift+L | 미니 창 보이기/숨기기 | |
| Ctrl+Shift+P | 뽀모도로 시작/포기 | v1 제외 |
| Ctrl+P | 인쇄 | |
| Ctrl+Alt+T / N / 1 | 오늘 / 다음 7일 / 받은함 열기 | |
| Ctrl+Alt+C | 캘린더 뷰 (또는 완료 목록) | 중복 표기 |
| Ctrl+Alt+A | 전체 목록 (또는 나에게 할당됨) | 중복 표기 |

- **결론:** 정확한 기본 단축키 표는 **틱틱 데스크톱 앱의 `?` 화면**에서 직접 확인해야 한다. 확인할 때까지 명세에는 공식 문서로 확인된 단축키만 쓴다.

## sprout 반영
- 명령 메뉴는 Mac에서도 지원한다(틱틱은 Mac 미지원이므로 동급 이상).
- 단축키 변경 기능은 v1 후보로 두고, 기본 배치는 틱틱과 같게 한다.
- **남은 조사:** 전체 단축키 표. 외부 자료나 앱 화면에서 확보해야 한다.
