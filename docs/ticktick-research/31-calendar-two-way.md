# 틱틱 조사: 구독 캘린더 양방향(쓰기) — 2026-10-05

사용자 요청 "애플이랑 구글캘린더가 양방향으로 틱틱처럼 되야하는데"에 대한 조사. [15](15-google-calendar.md)(구독은 양방향이라는 사실), [19](19-google-calendar.md)(설정·목록 화면), [17 §13](17-calendar-live.md)(일정 vs 할 일)을 이어서, **틱틱에서 구독 일정을 만들고·고치고·옮기고·지울 때의 동작**을 모았다. 결과는 [16 캘린더 연동](../screens/16-google-calendar.md) §12(v2.0 제안)의 근거다.

- 출처
  - TickTick Help 문서 원문: 도움말 페이지 안 `__NEXT_DATA__`에 든 96개 문서를 2026-10-05에 다시 받아 글자 그대로 읽었다 — [Google Calendar](https://help.ticktick.com/articles/7055781593733922816), [iCloud Calendar](https://help.ticktick.com/articles/7209479055807086592), [Local Calendar](https://help.ticktick.com/articles/7209482814528421888), [Outlook Calendar](https://help.ticktick.com/articles/7209436222337318912), [Exchange Calendar](https://help.ticktick.com/articles/7209387581639753728), [CalDav](https://help.ticktick.com/articles/7209388126463066112), [URL](https://help.ticktick.com/articles/7209387325833347072), [FAQ - Calendar](https://help.ticktick.com/articles/7063851189372190720).
  - 이 Mac에 설치된 **TickTick.app의 문자열·화면 파일**(읽기만 함, 개인 데이터·설정은 열지 않음): `Contents/Resources/{en,ko}.lproj/Localizable.strings`, `Contents/Resources/*.nib` 이름과 안의 연결 이름, 실행 파일의 클래스 이름. research 17 §15와 같은 방법.
  - 웹 검색(2026-10-05): TickTick 커뮤니티·레딧에서 구독 일정 편집 세부 동작을 다룬 글은 찾지 못했다. 도움말 이상의 공개 자료는 없다.
- 틱틱 앱에서 구독 일정을 직접 고쳐 보지는 않았다. 사용자의 실제 구글 계정을 건드리는 실험이라서다(19 §6과 같은 이유).

## 1. 어떤 캘린더가 양방향인가
| 서비스 | 틱틱 동작 | 근거 |
|---|---|---|
| **구글** | 양방향: "You can add, modify, and delete calendar events in TickTick, and these actions are also synced to Google Calendar." / "Operations like adding, modifying, or deleting events will be synchronized bidirectionally" | Google Calendar 문서. 앱 문자열 `integrated_google_modal_desc` = "Add and edit Google Calendar events in %@, with all actions synced both ways." |
| **iCloud** | 양방향(앱 전용 비밀번호로 CalDAV 연결): "Click on the "+" icon to add events. Once added successfully, they will also sync to your iCloud calendar." | iCloud Calendar 문서. `integrated_icloud_modal_desc` = "Add and edit iCloud calendar events in %@." |
| Outlook · Exchange · CalDAV · URL | **보기만**: `integrated_outlook_modal_desc` "View Outlook calendar events", `integrated_exchange_modal_desc` "View Exchange calendar events", `integrated_caldav_modal_desc` "View calendar events subscribed via CalDAV", `integrated_url_modal_desc` "View calendar events subscribed via URL" | 앱 문자열 |
| **로컬 캘린더(맥 캘린더 앱)** | **보기만**: `local_calendar_for_local_viewing_only` "Local calendar for local viewing only". 도움말도 "display calendar events from your current device"라고만 쓴다 | 앱 문자열, Local Calendar 문서 |
| 유료 | 캘린더 구독·양방향은 프리미엄 기능: `ProFeature_Description_SubscribeCalendar` "integrate Google, iCloud calendars … for easy two-way synchronization", 만료 시 `Your Premium has expired. Unable to edit any Google events.` | 앱 문자열 — sprout는 무료라 해당 없음 |

→ 정리: 틱틱의 양방향은 **구글·iCloud 두 곳뿐**이다. 맥 "로컬 캘린더"(EventKit로 읽는 것 — sprout Apple 캘린더 §11과 같은 자리)는 틱틱에서 **읽기 전용**이다. sprout가 Apple(EventKit) 일정을 고치게 하면 틱틱보다 넓어진다. 다만 맥 캘린더 앱에 등록된 iCloud 캘린더를 고치면 결과는 틱틱의 iCloud 양방향과 같다.

## 2. 일정을 만드는 곳
| 사실 | 근거 |
|---|---|
| 데스크톱: 사이드바 "Subscribed Calendars" 계정 목록 위의 **입력창** `Add agenda to "<계정>"`(한국어 `스케줄을 "%@"로 추가`)에 쓰면 그 계정 캘린더에 일정이 생긴다 | Google Calendar 문서 Desktop 탭 "click on the "input box" in the subscribed calendar list to add events", 문자열 `Add agenda to "%@"`, 그림 `_help/google-calendar-922816/09·10` |
| 모바일: 구독 캘린더 목록의 `+` | Google·iCloud 문서 |
| 캘린더 보기의 빈 칸 클릭·끌기는 **할 일**을 만든다("Tasks can be added by clicking on the date grid") — 빠른 만들기에서 "어느 캘린더에" 고르는 화면이 있다는 근거는 없다 | FAQ - Calendar, research 17 §13.1 |
| 앱 안에 캘린더 고르기 문자열이 있다: `Which calendar?`(어떤 달력인가요?), `choose_calendar`(달력 선택), `Specify Calendar`(캘린더), `Which calendar would you want to add:` — 어느 화면에서 쓰는지는 확인 못 함(통합 설정의 캘린더 고르기일 수 있다) | 앱 문자열 → **[미확인]** |

## 3. 일정 상세(고치기) 화면
- 실행 파일·화면 파일에 구독 일정 상세 전용 화면 `TTCalSubEventDetailViewController`(폭 388)가 있고, 줄(셀)이 다음 순서로 있다: **제목**(`TitleCell`) · **날짜**(`DateCell`) · **반복**(`RepeatCell`) · **알림**(`ReminderCell`) · **장소**(`LocationCell`, 빈 칸 문구 `Add location`) · **설명**(`ContentCell`) · **캘린더**(`CalendarCell`) · **참석자**(`AttendeesCell`, `Attendee(s):`, `(Organizer)`) · **화상 회의**(`MeetingCell`) · **URL**(`URLCell`). 제목·날짜 줄에는 편집 위임(`TitleDelegate`·`DateDelegate`)과 `UpdateContext`가 있다 → 제목·날짜를 그 자리에서 고친다.
- 편집 가능 여부를 일정마다 판단하는 이름이 있다: `isEventEditable`, `isCalendarEditable`, `isTitleEditable`, `isOrganizer`, 화면 문자열 `Read Only`.
- **주최자가 아닌 초대 일정은 옮길 수 없다**: `event_move_non_organizer_hint` = "Not an organizer, unable to move the event."(한국어 "조직자가 아니면 이벤트를 이동할 수 없습니다.")
- research 17 §7 실측의 읽기 전용 팝오버(제목/날짜/설명/캘린더 이름)는 쓸 수 없는 캘린더(로컬 등) 일정의 모양으로 본다 [추정].

## 4. 옮기기·길이 바꾸기·지우기
| 항목 | 틱틱 | 근거 |
|---|---|---|
| 끌어 옮기기·길이 바꾸기 | 구독 일정도 된다(도움말 "modify", 주최자 아님 안내 문구가 "move"를 말한다). 끄는 모양은 할 일과 같다고 본다 | Google Calendar 문서, `event_move_non_organizer_hint` → 모양은 [추정] |
| 반복 회차 범위 | 할 일용 대화창 `Edit Recurring Task`/`Delete Recurring Task`: 본문 "You are changing the time of a recurring task. Please confirm the range of changes." 선택지 **`Only This Recurrence`(이번만) · `All Future Recurrences`(이후 모든 회차) · `All Unfinished Recurrences`(완료 안 된 모든 회차)**. 구독 일정 전용 대화창 문자열은 찾지 못했다 → 일정도 같은 대화창에서 "이번만 / 이후 모든 회차"를 쓴다고 본다(일정은 완료가 없어서 세 번째는 맞지 않음) | 앱 문자열, research 17 §14 `MhYkPy6xK4M/f0230` → 일정 쪽은 **[추정]** |
| 지우기 | "add, modify, and delete" — 지운 일정은 구글에서도 지워진다. 확인 대화 여부는 모름 | Google Calendar 문서 → 확인 대화 **[미확인]** |

## 5. 구독 설정(편집 모달) — 19 §6의 1번 일부 해결
- `TTCalSubscriptionEditViewController`(440×298): **이름**(`calNameLabel`, 이름 잘못됨 안내 `nameInvalidationLabel`) · **색**(`colorPickerView`, 글자 `Color`) · **표시 방식**(`displayTypeButton` — Show / Show only in calendar / Hide) · `⋯`(`cal_nav_more`) · `Cancel` / `Save`. → 틱틱은 구독 캘린더의 **이름·색을 바꿀 수 있다**(19 §6.1 "색 바꾸기가 있는지" → 있다). sprout 16 §2.2의 "색 바꾸기 없음 [임시]"와 다르다 — 쓰기와는 별개라 이번 명세에서는 [다음]으로 적는다.

## 6. 연결이 끊겼을 때·오류 문구 (19 §6의 3번 해결)
- `Authorization_has_Expired` "Third-Party Calendar Authorization has Expired", `subscribed_calendar_'%@'_has_expired_msg` "Authorization for subscribed calendar '%@' has expired. Please reauthorize it to ensure the normal updating of schedules.", `Calendar server error`, `calendar_authorization_tips` "Calendar events will no longer be synchronized after authorization is revoked."
- 동기화 실패·충돌 때 문구(예: "다른 곳에서 바뀌었어요")는 찾지 못했다 → **[미확인]**. 틱틱은 서버(틱틱 클라우드)가 구글과 동기화하는 구조라(구독 계정이 기기 사이에 따라다닌다) sprout(기기에서 직접 구글 호출)와 충돌 처리 방식이 같을 필요는 없다.

## 7. 확인하지 못한 것 → 16 §12에서 [임시]·[sprout]로 정함
1. 캘린더 보기 빠른 만들기에서 구독 캘린더를 고를 수 있는지(근거 없음 — sprout는 자체 일정 세그먼트가 이미 있어 고르기를 붙인다).
2. 구독 일정 반복 범위 대화창의 실제 선택지.
3. 지우기 확인 대화·되돌리기.
4. 오프라인에서 고친 일정이 나중에 올라가는지.
5. 다른 곳(구글 웹)에서 동시에 바뀐 일정의 충돌 처리.
6. 일정을 다른 캘린더로 옮기기(상세의 `CalendarCell`을 눌러 바꿀 수 있는지).
