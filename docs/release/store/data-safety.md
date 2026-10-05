# Google Play 데이터 보안(Data safety) 답변 — 꿈틀 Android 1.0.0 (versionCode 1)

> 근거: [privacy-answers.md](privacy-answers.md) §2(같은 내용, 이 문서는 Play Console 입력 순서대로 옮긴 것) · [../legal/data-inventory.md](../legal/data-inventory.md) · 실제 빌드 매니페스트(2026-10-05 `bundleRelease`).
> 개발자: **유니포트**(대표 고윤서, 조직 계정) · 연락처 `kysk2295@naver.com` · 처리방침 `https://web-production-cd889.up.railway.app/privacy`
> 코드가 바뀌면 data-inventory → privacy-answers → 이 문서 순서로 고친다.

## 전제 (이 빌드 기준)
- 분석·광고·크래시 리포트 SDK 없음. Firebase는 **Cloud Messaging(FCM)만** 들어 있다(Analytics·Crashlytics 없음).
- 서버는 운영자(유니포트)가 직접 운영(셀프호스트). AI도 운영자 서버의 모델로 처리하고 외부 AI 회사로 보내지 않는다.
- Google 로그인: Google이 준 ID 토큰에서 이메일·Google 계정 ID(sub)만 저장. 이름·사진 저장 안 함.
- **휴대폰 캘린더 권한 있음**(READ_CALENDAR·WRITE_CALENDAR — 38 휴대폰 캘린더 연결). 사용자가 설정 › 캘린더 연동에서 `휴대폰 캘린더 연결`을 눌러야 묻는다. 휴대폰 캘린더의 일정·캘린더 이름·색은 **기기 안에서만** 읽고 쓰며 서버·AI로 보내지 않는다(Play 기준 "수집" 아님). 사용자가 꿈틀에서 만들어 휴대폰 캘린더에도 저장하기로 고른 일정만 꿈틀 일정(`events`)으로 동기화되고, 연결 정보는 해시 값(`ext_account`·`ext_calendar`)뿐이다(캘린더 이름·id·이메일 없음).
- 연락처·위치·사진·파일 접근 권한 없음(매니페스트에 없음).

> ⚠️ **Play Console 데이터 보안 양식을 다시 제출해야 함(캘린더 권한 추가).** 답 자체("캘린더 일정 = 수집·선택·앱 기능")는 그대로지만 권한이 늘어 새 빌드와 함께 다시 확인·제출한다. App Store 개인정보(앱 개인정보 보호 라벨)는 기기 안 처리라 바뀌는 항목이 없다 — privacy-answers.md 메모 확인.

## 1. 데이터 수집 및 보안 (개요)
| 질문 | 답 |
|---|---|
| 앱이 필수 사용자 데이터 유형을 수집하거나 공유하나요? | **예** |
| 앱에서 수집하는 모든 사용자 데이터가 전송 중에 암호화되나요? | **예** — API·동기화 모두 HTTPS(TLS) |
| 사용자가 데이터 삭제를 요청할 수 있는 방법을 제공하나요? | **예** — 앱 안(더보기 › 설정 › 계정 › 계정 삭제) + 웹 `https://web-production-cd889.up.railway.app/account-deletion` |
| 계정 만들기 방법 | 이메일·비밀번호, Google 로그인 (앱 안에서 계정 생성) |
| 계정 삭제 URL | `https://web-production-cd889.up.railway.app/account-deletion` |
| 일부 데이터만 삭제 요청(계정 유지) | 예 — 할 일·메모·일기 등은 앱에서 개별 삭제 가능. 별도 요청 URL 칸이 나오면 위 URL과 같게 |
| 독립 보안 검토(MASA) | 아니요 |
| 가족 정책 준수 | 해당 없음(대상 연령 16세 이상) |

## 2. 데이터 유형별 답 (수집 = 예인 것만 체크)
모든 항목 공통: **공유 아니요** · **일시적 처리 아니요**(서버에 저장) · 전송 중 암호화 예.
"공유"가 아닌 이유: FCM(Google)은 운영자를 대신해 알림을 전달하는 서비스 제공업체 → Play 정의상 공유 아님.

| Play 데이터 유형 | 수집 | 필수/선택 | 목적(체크할 칸) | 근거 |
|---|---|---|---|---|
| 개인 정보 › **이메일 주소** | 예 | 필수 | 앱 기능, 계정 관리 | 로그인 계정 |
| 개인 정보 › **사용자 ID** | 예 | 필수 | 앱 기능, 계정 관리 | 계정 UUID, Google 계정 ID |
| 메시지 › **기타 인앱 메시지** | 예 | 선택 | 앱 기능 | 일기의 캐릭터(AI) 대화 — 보수적으로 신고 |
| 캘린더 › **캘린더 일정** | 예 | 선택 | 앱 기능 | 꿈틀 안에서 만든 일정(서버 동기화 — 데스크톱에서 구글·Apple 캘린더에, 휴대폰에서 휴대폰 캘린더에 함께 저장한 일정 포함). 휴대폰 캘린더에서 읽기만 한 일정은 기기 밖으로 나가지 않아 수집 아님 |
| 앱 활동 › **기타 사용자 생성 콘텐츠** | 예 | 필수 | 앱 기능 | 할 일·리스트·메모·일기·태그·성장 기록. AI 요청(비서·분류·작업 지도·주간 리포트)도 이 내용을 운영자 서버에서 처리 |
| 앱 활동 › **앱 상호작용** | 예 | 필수 | 앱 기능, 사기 방지·보안·규정 준수 | AI 사용 횟수(주 2회 상한 등 서버 강제) |
| 기기 또는 기타 ID › **기기 또는 기타 ID** | 예 | 선택(알림을 허용할 때) | 앱 기능 | 기기 UUID + FCM 등록 토큰(푸시 알림) |

**수집 안 함(체크하지 않음)**: 이름·주소·전화번호·인종 등 개인 정보 나머지 · 금융 정보 · 건강 및 피트니스 · 사진·동영상 · 오디오 · 파일 및 문서 · 연락처 · 위치(대략·정확) · 웹 탐색 기록 · 앱 정보 및 성능(**비정상 종료 로그·진단 없음**) · 설치된 앱 · 검색 기록.

메모
- 기기에만 남는 것(로그인 토큰, AI 비서 대화 기록, 로컬 알림 예약, 위젯 화면 정보)은 "수집"이 아니다(기기 밖으로 안 나감).
- AI 요청 원문은 서버에서 처리 후 저장하지 않지만, 같은 내용이 "기타 사용자 생성 콘텐츠"로 이미 신고돼 있다.
- 시간대(타임존)는 Play 기준 위치 정보가 아니다.
- 일기의 기분 기록(1~5)은 사용자가 쓰는 메모라 "건강"으로 신고하지 않는다(privacy-answers.md와 같음).

## 3. 매니페스트 권한 ↔ 데이터 보안 대조 (1.0.0 빌드)
| 권한 | 왜 있나 | 데이터 보안 영향 |
|---|---|---|
| INTERNET, ACCESS_NETWORK_STATE | 서버 동기화·API | — |
| POST_NOTIFICATIONS | 할 일 알림(Android 13+, 설정에서 요청) | — |
| SCHEDULE_EXACT_ALARM | 할 일·일정 알림을 정한 시각에 울림 | — (아래 [§4](#4-정확한-알람-exact-alarm)) |
| RECEIVE_BOOT_COMPLETED | 재부팅 뒤 예약 알림 다시 걸기(expo-notifications) | — |
| VIBRATE | 햅틱·알림 진동 | — |
| WAKE_LOCK, c2dm RECEIVE | FCM 푸시 수신 | 기기 ID(FCM 토큰) — 위 표에 신고 |
| 런처 배지 권한들(삼성·화웨이 등), READ_APP_BADGE | 앱 아이콘 배지 숫자(expo-notifications) | — |
| READ_CALENDAR, WRITE_CALENDAR | 휴대폰 캘린더 연결(38) — 사용자가 연결을 누를 때만 요청. 휴대폰 캘린더 일정을 꿈틀 캘린더에 함께 보이고, 꿈틀에서 만든·고친 일정을 고른 캘린더에 저장 | 기기 안 처리 — 수집 아님. 꿈틀에서 만든 연결 일정은 "캘린더 일정"에 이미 신고 |
| BIND_GET_INSTALL_REFERRER_SERVICE | expo-application 라이브러리 기본 선언. 앱 코드에서 설치 리퍼러를 읽지 않음 | 수집 아님 |
| 제거함 | SYSTEM_ALERT_WINDOW, READ/WRITE_EXTERNAL_STORAGE, FOREGROUND_SERVICE, USE_BIOMETRIC, USE_FINGERPRINT | `apps/mobile/plugins/android-release` |

## 4. 정확한 알람 (exact alarm)
- 이 빌드는 **SCHEDULE_EXACT_ALARM**만 선언한다(USE_EXACT_ALARM 아님). SCHEDULE_EXACT_ALARM은 Play 선언 양식 대상이 아니다(USE_EXACT_ALARM만 제한 권한 — 2026-10 기준, 콘솔에서 "정확한 알람" 질문이 나오면 아래 문구 사용).
- Android 14+ 새 설치는 기본 "허용 안 됨" → expo-notifications가 자동으로 부정확 알람(`setAndAllowWhileIdle`)으로 대신 건다(몇 분 늦을 수 있음). 사용자가 시스템 설정 › 앱 › 꿈틀 › "알람 및 리마인더"를 켜면 정확해진다. (앱 안 안내 화면은 v1.1 후보.)
- 콘솔 선언이 필요할 때 쓸 문구:
  - 한국어: `꿈틀은 할 일·캘린더 앱입니다. 사용자가 할 일과 일정에 직접 정한 알림 시각(예: 오후 3시 회의 10분 전)에 정확히 알림을 보내기 위해 정확한 알람을 사용합니다. 알람은 사용자가 알림을 설정한 항목에만 예약되며, 다른 목적(광고·백그라운드 작업 깨우기 등)으로 쓰지 않습니다.`
  - English: `Kkumteul is a to-do list and calendar app. It uses exact alarms only to deliver reminders at the exact time the user set for a task or calendar event (e.g. 10 minutes before a 3 PM meeting). Alarms are scheduled only for items the user added a reminder to, and are never used for any other purpose.`
  - 핵심 기능 분류: **캘린더 / 할 일 알림(Calendar or alarm/reminder app)**
