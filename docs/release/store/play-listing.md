# Google Play 등록정보 — 꿈틀 (Android 1.0.0 · versionCode 1)

> Play Console 입력 순서대로 정리했다. 공통 문구의 원본은 [listing.md](listing.md)(App Store와 공유) — 여기 문구는 그중 **Android에 실제로 있는 기능만** 남긴 판이다(공유 확장·iPad 줄 뺌, 홈 화면 위젯 넣음).
> 데이터 보안·권한·정확한 알람: [data-safety.md](data-safety.md) · 올리는 순서: [../RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md) §5-1
> 상표: 다른 회사 앱 이름을 어디에도 쓰지 않는다.

## 0. 앱 만들기 (처음 한 번)
| 칸 | 값 |
|---|---|
| 앱 이름 | `꿈틀: 할 일·캘린더` (10자, 한도 30) — 홈 화면 표시 이름은 빌드의 `꿈틀` |
| 기본 언어 | 한국어(ko-KR) — 영어(en-US) 번역 추가 |
| 앱 또는 게임 | 앱 |
| 무료 또는 유료 | 무료 (나중에 유료로 바꿀 수 없음) |
| 패키지 이름 | `app.sprout.mobile` (첫 AAB 업로드로 고정, 바꿀 수 없음) |
| 개발자 계정 | **조직 계정 — 유니포트** (D-U-N-S·조직 인증 완료 전제). 조직 계정이라 개인 계정의 "테스터 12명·14일 비공개 테스트" 요건이 없다 → 내부 테스트로 확인 후 바로 프로덕션 |

## 1. 기본 스토어 등록정보 — 한국어(ko-KR)

**앱 이름 (30)**: `꿈틀: 할 일·캘린더`

**간단한 설명 (80)**: `할 일·캘린더·메모를 한곳에. 할 일을 끝낼수록 캐릭터가 자라는 무료 플래너` (42자)

**자세한 설명 (4000)** — 약 1,000자
```
꿈틀은 할 일과 캘린더를 한곳에서 관리하고, 해낸 만큼 캐릭터가 자라는 무료 플래너예요.

■ 할 일 관리
· 오늘·내일·다음 7일·기본함 등 스마트 목록으로 해야 할 일을 바로 확인
· 리스트·폴더·태그·필터로 원하는 대로 정리
· 마감일·시간·반복·알림, 체크리스트, 우선순위
· 빠른 추가로 떠오른 일을 바로 적기

■ 캘린더
· 목록·일·3일·월 보기로 할 일과 일정을 함께
· 끌어서 날짜와 시간 옮기기

■ 성장 — 해낸 만큼 자라는 캐릭터
· 할 일을 끝내면 경험치가 쌓이고 캐릭터가 진화해요
· 이번 주 목표를 세우고, 한 주를 돌아보는 주간 리포트를 받아요

■ 홈 화면 위젯
· 오늘 할 일, 이번 달 캘린더, 내 캐릭터를 홈 화면에서 바로
· 위젯에서 체크하면 바로 완료

■ 수집함과 위키
· 메모·링크를 일단 던져 두면 할 일·메모·볼 것으로 나눠 줘요
· 태그가 곧 위키 페이지 — 사람·프로젝트·주제별로 모아 보기

■ AI 비서·작업 지도·일기
· 말하듯 적으면 할 일을 만들고, 일정을 찾아 줘요
· 내 할 일을 영역별로 묶어 보는 작업 지도
· 하루를 적고 캐릭터와 짧게 이야기하는 일기
· AI는 운영자의 서버에서 직접 돌리는 모델로 처리하고, 외부 AI 회사로 보내지 않아요. 요청 원문은 저장하지 않아요.

■ 어디서나 같이
· 휴대폰·컴퓨터 앱이 자동으로 동기화
· 인터넷이 끊겨도 기기에서 그대로 쓰고, 다시 연결되면 맞춰요

■ 광고·추적 없음
· 완전 무료, 광고 없음, 분석·추적 도구 없음
· 언제든 앱에서 계정과 데이터를 완전히 삭제할 수 있어요

개인정보 처리방침: https://web-production-cd889.up.railway.app/privacy
이용약관: https://web-production-cd889.up.railway.app/terms
문의: kysk2295@naver.com
```
> 컴퓨터 앱(Mac·Windows)이 Play 출시와 같이 공개되지 않으면 "휴대폰·컴퓨터 앱이" → "기기 사이에서"로 바꾼다.

**그래픽**
| 칸 | 파일 | 규격 |
|---|---|---|
| 앱 아이콘 | `docs/release/store/play-assets/icon-512.png` (로고 B, `brand/out/b/store/play-icon-512.png`와 같음) | 512×512 PNG, 32비트 |
| 그래픽 이미지(Feature graphic) | `docs/release/store/play-assets/feature-graphic-1024x500.png` (아이콘 + "꿈틀" + 한 줄 소개, 2026-10-05 새로 만듦). 글자 없는 판: `brand/out/b/store/play-feature-graphic-1024x500.png`(git 제외 폴더) | 1024×500, 투명 없음 |
| 휴대전화 스크린샷 | `docs/release/store/screenshots/android/` 6장, 번호 순서대로: 01 오늘 · 02 캘린더(월) · 03 성장(캐릭터) · 04 리스트(제주 여행) · 05 할 일 상세(체크리스트) · 06 캘린더 다크. 릴리스 빌드(1.0.0) + 데모 계정(가짜 데이터, 촬영 뒤 삭제), 상태 표시줄 데모 모드 9:41 | 1080×2400(9:20), 2~8장 |
| 태블릿 스크린샷 | 올리지 않음(선택 항목) | |
| 동영상(YouTube) | 없음 | |

## 2. 영어(en-US) 번역

**App name (30)**: `Kkumteul: Tasks & Calendar` (26)

**Short description (80)**: `Tasks, calendar and notes in one place, plus a character that grows as you go` (77)

**Full description (4000)**
```
Kkumteul is a free planner that keeps your tasks and calendar in one place — and grows a character as you get things done.

TASKS
• Smart lists: Today, Tomorrow, Next 7 Days, Inbox
• Lists, folders, tags and filters
• Due dates, times, repeats, reminders, checklists, priorities
• Quick add for whatever comes to mind

CALENDAR
• List, day, 3-day and month views with tasks and events together
• Drag to reschedule

GROWTH
• Earn XP for finished tasks and evolve your character
• Set weekly goals and get a weekly review

HOME SCREEN WIDGETS
• Today's tasks, this month's calendar and your character on the home screen
• Check off tasks right from the widget

INBOX & WIKI
• Drop notes and links; they get sorted into tasks, notes and things to read
• Every tag is a wiki page for people, projects and topics

AI ASSISTANT, WORK MAP & JOURNAL
• Type naturally to create tasks or find what's scheduled
• See your work grouped into areas on a map
• Write about your day and chat briefly with your character
• AI runs on a model hosted on the operator's own server — never sent to third-party AI companies, and request text isn't stored.

EVERYWHERE
• Phone and computer apps stay in sync
• Works offline and catches up when you reconnect

NO ADS, NO TRACKING
• Completely free, no ads, no analytics
• Delete your account and data in the app at any time

The app is available in Korean only.

Privacy: https://web-production-cd889.up.railway.app/privacy?lang=en
Terms: https://web-production-cd889.up.railway.app/terms?lang=en
Contact: kysk2295@naver.com
```

## 3. 스토어 설정
| 칸 | 값 |
|---|---|
| 앱 카테고리 | **생산성(Productivity)** |
| 태그 | 할 일 목록, 캘린더, 플래너(콘솔이 보여 주는 목록에서 최대 5개) |
| 이메일(외부 공개 연락처) | `kysk2295@naver.com` |
| 전화번호 | 비움(선택) |
| 웹사이트 | `https://web-production-cd889.up.railway.app` |
| 개발자 이름(계정 프로필) | **유니포트** (UniPort) |

## 4. 앱 콘텐츠(정책) 답변
| 항목 | 답 |
|---|---|
| 개인정보처리방침 | `https://web-production-cd889.up.railway.app/privacy` (운영자: 유니포트, 대표 고윤서) |
| 앱 액세스 | **일부 기능 제한(로그인 필요)** → 심사용 데모 계정 이메일·비밀번호 입력(출시 직전 만든 전용 계정, 이 문서에 쓰지 않음). 안내 문구: `로그인 화면에서 이메일로 가입·로그인을 골라 위 계정으로 로그인하세요. AI 기능(비서·일기 대화·작업 지도)은 운영자 서버에서 처리되어 응답까지 몇 초~수십 초 걸릴 수 있습니다.` |
| 광고 | 아니요, 광고 없음 |
| 콘텐츠 등급(IARC) | 아래 §5 |
| 타겟층 | 아래 §6 |
| 뉴스 앱 | 아니요 |
| 코로나19 접촉 추적 | 아니요 |
| 데이터 보안 | [data-safety.md](data-safety.md) |
| 정부 앱 | 아니요 |
| 금융 기능 | 해당 없음 |
| 건강 앱 | 아니요(건강 기능 없음 — 일기 기분 기록은 메모) |
| 정확한 알람 | 질문이 나오면 [data-safety.md §4](data-safety.md#4-정확한-알람-exact-alarm) 문구 |
| 포그라운드 서비스 | 해당 없음(1.0.0 빌드에 FOREGROUND_SERVICE 권한 없음) |
| 계정 삭제 | URL `https://web-production-cd889.up.railway.app/account-deletion` |

## 5. 콘텐츠 등급(IARC 설문) 답
| 질문 | 답 |
|---|---|
| 이메일 | `kysk2295@naver.com` |
| 카테고리 | **기타 모든 앱 유형**(또는 "유틸리티, 생산성, 커뮤니케이션 또는 기타") — 게임·소셜·엔터테인먼트 아님 |
| 폭력·공포·성적 콘텐츠·욕설·약물(마약·알코올·담배)·차별 | 모두 **아니요** |
| 도박·모의 도박 | 아니요 |
| 사용자 간 상호작용(채팅·콘텐츠 공유) | **아니요** — 콘텐츠는 본인만 봄. 일기 캐릭터 대화는 AI와의 대화이지 사용자 간 소통이 아님 |
| 사용자 생성 콘텐츠를 다른 사용자가 볼 수 있음 | 아니요 |
| 사용자 위치 공유 | 아니요 |
| 디지털 상품 구매 | 아니요 |
| 웹 브라우저·검색 엔진 | 아니요(링크는 시스템 브라우저로 엶) |
| 생성형 AI 콘텐츠(문항이 있으면) | 예 — 운영자 모델이 만들고 그 사용자에게만 보임 |
| 예상 등급 | IARC 3+ / 한국 전체이용가 |

## 6. 타겟층 및 콘텐츠
- **권장: 16–17세, 18세 이상**만 체크. 처리방침이 만 14세 이상 가입이고, 13–15를 넣으면 추가 질문·가족 정책 검토 범위가 넓어진다.
- 13세 미만 체크 안 함 → 가족 정책 대상 아님. "어린이의 관심을 끌 수 있나요?" → **아니요**(일반 생산성 앱. 캐릭터는 성장 기록 표현).

## 7. 출시 노트(새로운 기능, 500)
- ko-KR: `꿈틀의 첫 버전이에요. 할 일·캘린더·성장 캐릭터·홈 화면 위젯·수집함·AI 비서·일기를 만나 보세요. 의견은 kysk2295@naver.com으로 보내 주세요.`
- en-US: `First release of Kkumteul: tasks, calendar, a growing character, home screen widgets, inbox, AI assistant and journal. Send feedback to kysk2295@naver.com.`

## 8. 출시 트랙 (조직 계정)
1. **내부 테스트**(최대 100명, 심사 없이 몇 분 안에 배포): AAB 올리기 → 본인 Google 계정을 테스터로 → Play 스토어에서 받아 실제 기기로 로그인·구글 로그인·알림 확인. 여기서 **앱 서명 키 SHA-1**을 확인해 OAuth에 등록(체크리스트 §5-1).
2. **프로덕션**: 같은 버전을 프로덕션으로 승격 → 국가: 대한민국(필요하면 추가) → 심사 제출(보통 며칠, 첫 앱은 더 걸릴 수 있음).
3. (참고) 개인 계정이었다면 프로덕션 전에 비공개 테스트에 테스터 12명 이상이 14일 연속 참여해야 한다 — 이 계정(조직)은 해당 없음.
