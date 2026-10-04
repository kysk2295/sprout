# 틱틱 조사: 알림 받기 — 하루 요약 · 여러 기기 · 알림이 안 올 때

- 조사일: 2026-10-05 · 목적: [32 푸시 알림](../screens/32-push-notifications.md)의 근거. [09 알림](09-reminders.md)·[20 모바일 §4](20-mobile.md)·[24 모바일 UI §11·§12](24-mobile-ui.md)에 없는 부분만 보탠다.
- 표기: **[확인]** 공식 글에서 직접 봄 · **[추정]** 정황·사용자 글 · **[미확인]** 찾지 못함
- 출처(원문을 옮기지 않고 사실만 정리했다):
  - [20 Lesser-Known TickTick Features (공식 블로그, 2020-12)](https://blog.ticktick.com/2020/12/08/20-lesser-known-ticktick-features/) — Daily Notification
  - [Effective Reminder Feature (도움말)](https://help.ticktick.com/articles/7055782395743567872) — 알림 팝업 버튼, 여러 알림
  - [Constant Reminder (도움말)](https://help.ticktick.com/articles/7374017550633402368) — 설정 위치, 공유 리스트 방해 금지, 알림음
  - [FAQ (도움말)](https://help.ticktick.com/articles/7055792921664028672) — Android 보안 앱·시작 허용 목록(검색 요약으로 확인, 본문은 JS라 직접 열람 실패)
  - [SnapTask — TickTick Persistent Notification: Android Setup, Fixes, and Limits](https://snaptask.org/blog/ticktick-persistent-notification-android/) — 배터리 최적화·자동 시작(제3자 글)
  - Google Play 사용자 리뷰(검색 결과 요약, 원문 링크 없음) — PC와 휴대폰이 둘 다 울린다는 불만

## 1. 하루 요약 알림 (Daily Notification)
- **[확인]** 위치: 설정 › **Sounds & Notifications** › `Daily Notification` 켜기 → **받을 시각을 고른다**.
- **[확인]** 내용: 정한 시각에 **오늘 할 일 개요** — 끝낸 것과 아직 안 끝낸 것.
- **[확인]** 맞춤: **주말 건너뛰기** 같은 선택이 있다.
- **[미확인]** 기본값(켜짐/꺼짐, 기본 시각), 할 일이 0개인 날 보내는지. → sprout는 기본 꺼짐 · 08:00 · 0개인 날 안 보냄을 [임시]로 둔다(32 §5).

## 2. 알림 설정 묶음 (Sounds & Notifications)
- **[확인]** 같은 화면에 `Constant Reminder`(계속 알림), `Reminder Ringtone`(알림음), `Daily Notification`이 있다. 모바일 설정 첫 화면 칸 이름도 `Sounds & Notifications`(24 §11).
- **[확인]** 공유 리스트마다 `Notifications › Do not disturb` — 나에게 맡겨진 할 일이 없으면 그 리스트 알림을 받지 않는다. sprout v1에 공유 리스트가 없으므로 해당 없음.
- **[확인]** 계속 알림은 시스템 알람 권한으로 무음·방해 금지를 뚫는다. sprout v1 제외(09 "후보" 그대로).
- **[미확인]** 앱 안의 "조용한 시간(Quiet hours)" 설정은 찾지 못했다 → sprout도 따로 만들지 않고 **OS 방해 금지**를 따른다.

## 3. 여러 기기
- **[추정]** 할 일 알림은 **기기마다 울린다**. 사용자 리뷰에 "PC에서 이미 처리했는데 휴대폰에서 또 울린다, 소리도 두 번"이라는 불만이 있다 → 틱틱은 다른 기기에서 처리한 알림을 다른 기기에서 지워 주는 동작이 확실하지 않다.
- **[추정]** 완료한 할 일은 동기화 뒤 다른 기기의 예약이 사라진다(동기화되는 할 일 상태의 당연한 결과, 20 §4.4 sprout 메모와 같음).
- sprout 판단: "기기마다 울림"은 틱틱과 같게 두되, **한 기기에서 완료·삭제하면 다른 기기에 이미 떠 있는 알림도 지운다**(리뷰의 불만을 그대로 따라 하지 않는다 — 동작 개선이지 화면 발명이 아니다). 같은 휴대폰에서 로컬 예약과 서버 푸시가 **두 번 울리는 일은 없어야 한다**(32 §4.3).

## 4. 알림이 안 올 때 (Android)
- **[확인]** 틱틱 FAQ: 보안 앱·시스템 보안 서비스가 알림을 막을 수 있다 → 시작 허용 목록·메모리 정리 예외에 넣으라고 안내.
- **[추정, 제3자]** 샤오미·오포·비보·화웨이·삼성 One UI는 백그라운드를 강하게 끈다 → 앱 정보 › 배터리 › **제한 없음(최적화 안 함)** + 자동 시작 허용.
- sprout: 설정 › 소리와 알림 맨 아래 `알림이 늦게 오거나 안 와요` 도움 줄 → Android 배터리 최적화 예외 화면을 연다(32 §7).

## 5. 알림 팝업 버튼 (09 다시 확인)
- **[확인]** 닫기 · 집중 시작 · 완료 · 다시 알림. sprout 모바일은 이미 **완료 · 10분 뒤 · 1시간 뒤 · 내일 다시 알림**(22 §구현, 시안 J). 서버에서 온 알림도 **같은 버튼**을 단다.
