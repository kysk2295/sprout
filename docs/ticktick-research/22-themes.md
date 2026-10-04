# 22. 테마 (설정 › 외관 › 테마)

- 조사일: 2026-10-04. 이미지·일러스트 원본은 저장하지 않고 글로만 적는다.
- 쓰임: [00 디자인 토큰 §5](../screens/00-design-tokens.md), [01 앱 셸 §9](../screens/01-app-shell.md)

## 1. 출처
| 출처 | 본 것 | 신뢰도 |
|---|---|---|
| 제3자 Mac 튜토리얼 영상 프레임 [zq f0027](../ticktick-captures/_video/zqGeCiSgFOk/f0027.jpg) (2025.05, 다크 테마) | 설정 › Appearance › Theme 화면 전체: 시리즈 이름, 견본 순서, 선택 표시, 하단 토글 | 높음(화면 그대로) |
| 공식 8.0 영상 [f0104](../ticktick-captures/_video/aJ0ELyY215A/f0104.jpg), [f0061](../ticktick-captures/_video/aJ0ELyY215A/f0061.jpg) (2026.01) | Sky 테마가 실제 창에 적용된 모습(레일 채움, 선택 아이콘 흰 사각) | 높음 |
| [shell-theme 관찰 노트](../ticktick-captures/shell-theme/NOTES.md), [settings-general 노트](../ticktick-captures/settings-general/NOTES.md) | 다크 테마 면 색, 색 테마가 바꾸는 범위 | 높음 |
| [실제 Mac 앱 확인 2026-10-03](live-2026-10-03/README.md) | 외관 상단 탭(테마 / 앱 아이콘 / 표시), 시스템 다크 자동 전환 토글 | 높음(읽기만 함) |
| 틱틱 도움말 [What's New](https://help.ticktick.com/articles/7082552170989486080) 검색 요약, 공식 X [2025-11 게시물](https://x.com/ticktick/status/1989138338557886930) | "Custom Dark Theme": Dark를 고른 뒤 다크 모드의 강조색을 고를 수 있다(Android 먼저, 이어서 iOS·데스크톱) | 중간(본문 직접 열람 실패, 검색 요약) |

## 2. 화면 구성 (zq f0027)
- 설정 창 오른쪽 위 분절 탭 **Theme / App icons / Display**. Theme 탭 안에 시리즈별 소제목과 견본 격자.
- **Color Series** (12개, 한 줄 8개 격자): Default, Sky, Turquoise, Teal, Matcha, Sunshine, Peach, Lilac / Ebony, Navy, Gray, Dark.
  - 견본은 약 38pt 둥근 정사각형을 그 테마 대표색으로 채운 것. 이름은 견본 아래 작은 회색 글자.
  - 선택된 견본은 오른쪽 아래 모서리에 **파란 원 + 흰 체크** 배지.
  - 대표색(영상 JPEG 추출, 00 §5 표와 같음): Default `#FFFFFF`, Sky `#5A77F7`, Turquoise `#5CD9AF`, Teal `#77C8C2`, Matcha `#ACBF9F`, Sunshine `#F6BB77`, Peach `#F589A3`, Lilac `#B0A3D3`, Ebony `#A98A75`, Navy `#2B3455`, Gray `#363B41`, Dark `#1A1A1A`.
- **Season Series** (4개): Spring, Summer, Autumn, Winter — 가로로 긴 일러스트 카드. 일부 견본 왼쪽 위에 프리미엄 표시.
- **City Series**: Cairo, London, Los Angeles, Moscow … (스크롤 아래로 더 있음) — 도시 일러스트 카드.
- 맨 아래 고정 줄: 토글 **"Auto switch dark theme according to system appearance."** (8.0 표기 "Follow System Dark Mode").

## 3. 테마가 바꾸는 것
- 색 테마(Sky 등): 아이콘 레일 전체가 테마색으로 채워지고, 레일 아이콘은 흰색 반투명, 선택된 레일 항목은 흰 사각 + 테마색 아이콘. 사이드바·선택 배경에 테마색이 옅게 섞인다. 오늘 원·주요 버튼 등 강조도 테마색 계열.
- Dark: 창 전체 `#1A1A1A` 전후, 선택은 한 단계 밝은 회색, 구분선은 아주 옅게. 우선순위·리스트 색은 그대로.
- 일러스트 시리즈: 창 배경 전체에 그림이 깔리고 면이 반투명해진다(영상 [QKA](../ticktick-captures/_video/QKAA8p3PY_8/SOURCE.md) Default + 배경 이미지 참고).
- 시스템 자동 전환: 켜면 OS가 다크일 때 Dark, 라이트일 때 마지막 라이트 테마.
- Custom Dark Theme(2025 말~): Dark 안에서 강조색을 따로 고른다.

## 4. 확인 못 한 것
- Navy·Gray가 "어두운 면 + 색 레일"인지 "밝은 면 + 어두운 레일"인지 — 적용 화면 캡처가 없다. sprout는 **다른 색 테마와 같은 규칙(밝은 면 + 테마색 레일)**으로 두고, 실제 앱으로 확인되면 고친다.
- 각 색 테마의 정확한 면·강조 색 — 견본색만 있다. 면은 견본색을 옅게 섞어 계산했다(00 §5.1).
- "True Black(순검정)" 테마 — 틱틱 공식 자료에서 찾지 못했다. sprout가 OLED·야간용으로 더한 것이다([sprout]).
- Custom Dark Theme의 강조색 목록.

## 5. sprout 결정
- Color Series 12개는 이름·순서·대표색을 그대로 따른다(이름은 한국어로).
- 다크 변형 **트루 블랙**은 [sprout]로 더한다.
- 시스템 자동 전환 시 **어느 다크 테마를 쓸지 고르는 칸**을 더한다(Custom Dark Theme와 같은 자리, [sprout]).
- Season/City 일러스트 시리즈는 그림 원본을 쓸 수 없으므로 v1 제외 → [다음] 직접 만든 그라데이션·일러스트로 검토.
- Custom Dark Theme 강조색 고르기 → [다음].
