# task-repeat — 관찰 노트

- 근거: 도움말 [01-how-to-set-repeat](../_help/set-up-recurring-tasks-770752/01-desktop-how-to-set-repeat.png), [05-by-due-dates](../_help/set-up-recurring-tasks-770752/05-desktop-by-due-dates.png). ⚠️ 이미지 속 UI는 **iOS**다(도움말 라벨이 잘못 붙어 있음). 데스크톱은 날짜 선택기 팝오버의 Repeat 행에서 같은 목록이 열린다 — [task-date-picker](../task-date-picker/NOTES.md). 조사 노트 [07](../../ticktick-research/07-recurring.md)

## 반복 목록 (날짜 선택기 → Repeat)
| 항목 | 보조 표기 (선택한 날짜 기준) |
|---|---|
| None ✓ | |
| Daily | |
| Weekly | (Tuesday) |
| Monthly | (the 20th day) |
| Yearly | (20 Jan) |
| Every Weekday | (Mon - Fri) |
| Custom › | |
- **보조 표기가 선택한 날짜에 따라 바뀐다**(20일 화요일을 고르면 "Weekly (Tuesday)", "Monthly (the 20th day)").

## Custom Repeat 화면
- 머리: × · "Custom Repeat" · ✓(파랑)
- **Repeat Type (?)** → "By Due Dates"(다른 값: By Completion Date, By Specific Dates)
- **Frequency:** 휠 선택 "Every [1] [Day / Week / Month / Year]". 아래 요약 문구 "Every week on Fri".
- **Week:** 요일 알약 Mon~Sun, 선택한 요일은 파란 채움.

## 설정 후 날짜 선택기
- 행 값이 파랗게 채워진다: Time 13:00 × · Reminder On time × · Repeat "Every week on Fri" ×(빨간 테두리로 강조됨)
- **Repeat Ends** 행이 새로 생긴다 → "Never"(다른 값: 종료일, N회).
- 하단: 빨간 "Clear".
- 빠른 추가 입력("Plan next week fri 13pm")에서 스마트 인식된 부분은 **파란 배경 하이라이트**로 표시되고, 입력 바 아래에 "Fri, 13:00" 날짜 칩이 붙는다 → [task-quick-add](../task-quick-add/NOTES.md)
