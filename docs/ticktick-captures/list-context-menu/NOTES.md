# list-context-menu — 관찰 노트 (데스크톱) · ⚠️ 메뉴 항목은 일부 추정

- 근거:
  - [EUB f0071](../_video/EUBxb9MgYWg/f0071.jpg): 사이드바 리스트에 마우스를 올린 상태 → 다음 프레임 [f0072](../_video/EUBxb9MgYWg/f0072.jpg)가 Edit List 모달
  - 도움말 [06-x-edit-list](../_help/manage-tasks-with-lists-396608/06-x-edit-list.png) (iOS: 스와이프 메뉴 + Edit List 화면 하단의 Archive/Delete)
  - 도움말 Folders 문서: "데스크톱에서는 폴더를 우클릭해 폴더 해제"
  - 도움말 Tags 문서: "태그 우클릭 → Pin, Edit, Delete"

## 확인된 것
- **사이드바 리스트 행에 마우스를 올리면** 오른쪽 색 점 옆에 **`...` 버튼**이 나타난다(f0071). 이 버튼 또는 우클릭으로 리스트 메뉴가 열리고, "Edit"을 누르면 Edit List 모달이 뜬다.
- **태그 우클릭:** Pin · Edit · Delete (도움말 문장).
- **폴더 우클릭:** 폴더 해제(Ungroup) 등(도움말 문장).
- **리스트 편집 화면 하단 행동**(iOS 캡처): **Archive List**(검정 글자) · **Delete List**(빨강). 보관한 리스트는 사이드바의 "Archived Lists"로 간다.
- 모바일 스와이프 메뉴: 고정(노랑) · 편집(주황) · 삭제(빨강).

## 추정 (데스크톱 메뉴 화면 미확보)
- 리스트 메뉴 항목: Edit · Pin · Share · Duplicate(추정) · Archive · Delete.
- **데스크톱 메뉴 화면 자체는 공개 자료에서 찾지 못했다.** 명세에서는 위 확인된 행동(Edit, Pin, Archive, Delete)만 확정하고, 배치·아이콘은 태스크 우클릭 메뉴([task-context-menu](../task-context-menu/NOTES.md))와 같은 스타일로 설계한다.

## sprout v1
- 리스트: Edit · Pin · Archive · Delete. 폴더: Edit(이름 변경) · Ungroup · Delete. 태그: Pin · Edit · Delete.
