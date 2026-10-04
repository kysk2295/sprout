# m-widget — 관찰 노트 (macOS 위젯, 모바일 위젯 공통 참고)

- 근거: 도움말 위젯 문서 [19-macos-widgets](../_help/widgets-202752/19-macos-widgets.png), [31-macos-how-to-add-widgets](../_help/widgets-202752/31-macos-how-to-add-widgets.png). 모바일 위젯 이미지는 같은 문서의 01~18번.

## macOS 위젯 종류 (위젯 갤러리)
| 위젯 | 설명 문구 | 모양 |
|---|---|---|
| **Daily View** | Quick view of today's schedule | 왼쪽 미니 월 달력(오늘 파란 원) + 오른쪽 태스크 목록(날짜 빨강=지남), "+8 more" |
| Eisenhower Matrix (프리미엄 👑) | Focus on urgent & important tasks. | 4분면(색 소제목) + 오른쪽 위 `+` |
| **Monthly Calendar View** | Quick view of this month's schedule | 월 그리드 + 칸마다 태스크 색 막대 |
| **Tasks** | Get quick access to one of your lists. | "Today 43" + 태스크 제목 목록 |
- 흰 둥근 카드(macOS 기본 위젯 스타일)이고 강조색은 파랑이다.

## sprout
- PRD에서 진짜 위젯(WidgetKit)은 v1 이후다. 만들 때는 **Tasks**(리스트 하나) + **Daily View** 두 가지를 먼저 만들고, 캐릭터 성장 위젯을 추가한다.
- 모바일 최소형 위젯도 같은 두 가지를 기준으로 삼는다.
