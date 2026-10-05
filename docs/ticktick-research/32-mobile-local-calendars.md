# 틱틱 조사: 휴대폰 로컬 캘린더(시스템 캘린더)와 OS 권한 — 2026-10-05

사용자 요청 "이거는 나말고 다른 유저들한테도 되야하는거야. 그리고 앱같은경우는 퍼미션도 해야하고"에 대한 조사. 틱틱 휴대폰 앱이 **휴대폰에 등록된 캘린더(iOS 캘린더·Android 캘린더 제공자)**를 어떻게 보여 주고 권한을 묻는지 모았다. 결과는 [38 휴대폰 캘린더 연결](../screens/38-mobile-calendars.md)의 근거다. 앞선 조사: [31](31-calendar-two-way.md)(양방향), [24 §10](24-mobile-ui.md)(휴대폰 캘린더 ⋯ 메뉴), [19](19-google-calendar.md)(설정 화면).

- 표기: **[확인]** 원문을 직접 읽음 · **[추정]** 간접 근거 · **[못 찾음]** 공개 자료에 없음
- 출처(모두 2026-10-05 접근)
  - TickTick Help [Local Calendar](https://help.ticktick.com/articles/7209482814528421888) — 페이지가 자바스크립트로 그려져서 HTML 안 `__NEXT_DATA__`의 원문을 읽음(문서 id 6673f2183600fcadb49f4a79)
  - TickTick Help [Calendar Subscriptions](https://help.ticktick.com/articles/7055781614550253568), [iCloud Calendar](https://help.ticktick.com/articles/7209479055807086592)
  - [App Store 소개](https://apps.apple.com/us/app/ticktick-to-do-list-calendar/id626144601)
  - APKMirror TickTick 8.0.8.0 [APK 페이지](https://www.apkmirror.com/apk/ticktick-limited/ticktick-to-do-list-with-reminder-day-planner/ticktickto-do-list-calendar-8-0-8-0-release/ticktickto-do-list-calendar-8-0-8-0-android-apk-download/) — 직접 열면 403, **웹 검색 요약으로만** 확인
  - 맥 TickTick.app 문자열(research 31 §1)
- 레딧·커뮤니티 글은 찾지 못했다. 틱틱 휴대폰 앱을 직접 켜서 실측하지는 않았다(사용자 기기·계정을 건드리지 않음).

## 1. 위치와 켜는 법
| 항목 | 틱틱 | 근거 |
|---|---|---|
| 휴대폰 위치 | **Settings › Import & Integration › Local Calendars**, 스위치를 켜면 "view local calendars in TickTick" | [확인] Local Calendar 문서 휴대폰 탭 |
| 문서 첫 문장 | "If you want to display calendar events from your current device in TickTick, you can easily do so by subscribing to the local calendar." | [확인] 같은 문서 |
| 켠 뒤 보이는 곳 | 사이드바 **"Subscribed Calendars"** 아래 | [확인] 같은 문서 |
| 되는 기기 | "Currently, setting local calendars is only available on Android, iOS, and Mac clients."(Windows·웹 없음) | [확인] Calendar Subscriptions 문서 |
| 캘린더 탭 입구 | 캘린더 ⋯ 메뉴에 **Calendar Subscription** | [확인] research 24 §10(도움말 캡처) |
| 계정 캘린더와의 차이 | 구글·iCloud 등 계정 캘린더는 Settings › Import & Integration › Calendar(계정 연결) — 로컬 캘린더와 다른 칸 | [확인] iCloud 문서 |
| 한국어 이름 | `?language=ko_KR`도 영어 원문 그대로 | [못 찾음] — 꿈틀 이름(`휴대폰 캘린더`·`캘린더 연동`·`캘린더 구독`)은 새로 정함 |

## 2. 캘린더별 표시
- 휴대폰 탭에는 **스위치 하나**뿐이고 캘린더마다 켜고 끄는 설명이 없다 [확인 — 문서에 없음, 그림은 해상도 때문에 읽지 못함].
- **"Show" · "Show only in calendar" · "Hide"** 고르기는 같은 문서의 **macOS 탭에만** 있다 [확인]. 검색 요약 여러 곳이 이것을 휴대폰 기능처럼 적지만 틀린 요약이다.
- 색이 캘린더 색을 따르는지 [못 찾음] — 맥에서는 캘린더 색(research 17).

## 3. 읽기·쓰기
- 로컬 캘린더는 **보기 전용**: 맥 문자열 `local_calendar_for_local_viewing_only` = "Local calendar for local viewing only"(research 31 §1). Local Calendar 문서도 "display"만 말한다 [확인].
- 양방향은 **계정 연결(구글·iCloud)**만: iCloud 문서 "Click on the "+" icon to add events. Once added successfully, they will also sync to your iCloud calendar." [확인]
- iOS와 Android가 다르게 동작하는지 [못 찾음].
- 다른 기기로 동기화되는지: 공개 문장은 [못 찾음]. 휴대폰 OS에서 읽는 것이라 틱틱 서버를 거치지 않는다고 본다 [추정].

## 4. 권한
| 항목 | 내용 | 근거 |
|---|---|---|
| Android 매니페스트 | `android.permission.READ_CALENDAR`, `android.permission.WRITE_CALENDAR`(+ OPPO용 `com.coloros.permission.READ/WRITE_CALENDAR`) | [추정] APKMirror 8.0.8.0 페이지의 **검색 요약**(페이지는 403으로 직접 못 엶). WRITE가 있다고 로컬 캘린더 쓰기가 된다는 뜻은 아니다 |
| iOS 권한 문구(`NSCalendarsFullAccessUsageDescription` 등) | — | [못 찾음] |
| iOS 17+ 전체 접근인지 쓰기 전용인지 | 일정 보기가 있으니 전체 접근이 필요하다 | [추정] |
| 거부했을 때 화면·설정 열기 링크 | — | [못 찾음] |
| App Store 소개 | "Integrate with calendar application" 한 줄 | [확인] |

## 5. 꿈틀에 주는 뜻 ([38](../screens/38-mobile-calendars.md))
- 자리: 틱틱처럼 **설정 › 연동 칸**과 **캘린더 ⋯ › 캘린더 구독**에 둔다.
- 틱틱과 다르게 하는 것 [sprout]: ① 캘린더마다 켜고 끄기(사용자 요청) ② 쓸 수 있는 휴대폰 캘린더는 양방향(16 ⑦ 사용자 결정과 같은 결과 — 휴대폰에 iCloud·구글이 있으면 틱틱 계정 양방향과 같은 결과) ③ 권한 문구·거부 화면은 근거가 없어 직접 정함.
- 남은 확인: 틱틱 휴대폰 앱을 시뮬레이터·기기에서 열어 Local Calendars 화면 모양·권한 창 문구·거부 화면을 실측(가능하면 APK를 받아 `aapt dump permissions`).
