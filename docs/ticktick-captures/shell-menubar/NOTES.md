# shell-menubar — 관찰 노트 (Mac 메뉴바, Windows 작업 표시줄·위젯)

- 근거:
  - Mac 메뉴바 팝업: [macmenubar-2020.jpg](macmenubar-2020.jpg) (MacMenuBar.com, **2020년 스크린샷 — 옛 버전**)
  - Mac 단축키: 공식 [Mac 페이지](https://ticktick.com/mac)의 Cmd+Shift+O(메뉴바에서 태스크 보기·집중 시작), 2026 Hotkeys의 "Show/Hide Mini Window ⇧⌘O" — [shell-shortcuts](../shell-shortcuts/NOTES.md)
  - Windows: 도움말 위젯 문서 [22-windows-widgets.png](../_help/widgets-202752/22-windows-widgets.png), [32-windows-how-to-add-widgets.png](../_help/widgets-202752/32-windows-how-to-add-widgets.png)

## Mac 메뉴바 팝업 (2020)
- 메뉴바의 틱틱 아이콘을 누르면 아이콘 아래로 **말풍선 모양 패널**이 내려온다(다크 모드 캡처).
- 맨 위 분절 탭: **Task / Pomo**.
- 머리: "Today ⌄"(리스트 전환 드롭다운) + 오른쪽에 정렬/시계 아이콘 · `...`.
- 추가 바: `Add task to "Inbox" on "Today"`.
- 빈 상태: 등대 일러스트 + **"No tasks for today."** + "It's getting late, buddy."(시간대별 문구로 추정)
- ⚠️ 2020년 화면이다. 현재(2026) 모양은 확인하지 못했다. 단축키가 ⇧⌘O로 이어지고 있어서 기능은 유지되는 것으로 판단한다.

## Windows 리스트 위젯 (미니 창과 같은 역할)
- 반투명 어두운 패널. 머리 "Next 7 Days ⌄"(리스트 전환) + `...`.
- 추가 바: `+ Add task to "Inbox" on "Today"`.
- 날짜 그룹("Thu, Today", "Fri, Tomorrow") → 행: 우선순위 색 체크박스 + 제목 + 오른쪽 날짜·시간. 하위 태스크는 `⌄` 펼침 + 들여쓰기.

## Windows 작업 표시줄 우클릭 메뉴
- Task: Add A Task · Today · Calendar · Inbox
- Others: Add List Widget · Add Calendar Widget · Add Eisenhower Matrix Widget · Start Pomo · Start Stopwatch
- TickTick · Pin to taskbar · Close window

## sprout v1 (PRD F)
- Mac 메뉴바 팝업 = 위 구조에서 **Pomo 탭을 빼고**, 리스트 전환 + 추가 바 + 목록 + 체크만 둔다. 빈 상태 문구는 시간대별로 바꾼다.
- Windows는 트레이 아이콘 클릭으로 같은 패널을 연다. 작업 표시줄 메뉴는 Add A Task · Today · Calendar · Inbox만 둔다.
