# iOS 출시 — 기여자(Claude Code)용 작업 지시서

이 문서는 **iOS 앱 '꿈틀'을 자기 Apple 개발자 계정으로 출시하는 기여자**와, 그 기여자가 쓰는 **Claude Code**가 읽는 문서입니다.
Claude는 이 문서와 [CLAUDE.md](../../CLAUDE.md)·[HANDOFF.md](../../HANDOFF.md)·[RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) §4를 먼저 읽습니다.

## 0. 역할 나누기
| 누가 | 하는 일 |
|---|---|
| **기여자(너)** | Apple 계정 설정, iOS 빌드·서명, TestFlight, App Store Connect 등록·심사 제출 |
| **저장소 주인(유니포트·고윤서)** | 서버(맥미니) 운영과 서버 환경 변수, 비밀 값 보관, PR 병합, Android·데스크톱 |
| **하지 않는 것** | 서버 코드·데이터 구조·공용 로직 수정, 기능 추가. 필요하면 이슈로 남기고 주인에게 요청 |

## 1. 브랜치와 PR 규칙
- `main`에서 `release/ios` 브랜치를 만들어 작업하고 PR을 엽니다. `main`에 직접 푸시하지 않습니다.
- 고치는 곳은 **iOS 빌드 설정과 스토어 자료로 한정**: `apps/mobile/app.json`·`app.config.ts`의 iOS 부분, `apps/mobile/plugins/`의 iOS 서명 관련, `docs/release/store/`.
- 다른 곳(공용 코드·서버·데스크톱)은 주인 쪽에서 동시에 바뀌고 있습니다. 충돌을 피하려고 건드리지 않습니다.
- **비밀 값은 커밋하지 않습니다**: `.p8`, 인증서, 프로비저닝 프로파일, 비밀번호. (`.gitignore`가 막지만 확인)

## 2. 준비물
- macOS + Xcode(최신), CocoaPods, **Node 22**(`. scripts/node22.sh` — Node 26에서는 설치가 조용히 실패), npm 11(`npm approve-scripts`로 설치 스크립트 허용)
- `npm install` → `npm run typecheck:mobile && npm run test:mobile`가 통과하는지 먼저 확인

## 3. Apple 계정에서 만들 것
| 항목 | 값 |
|---|---|
| App ID (앱) | `app.sprout.mobile` — Sign in with Apple, Push Notifications, App Groups 켜기 |
| App ID (공유 확장) | `app.sprout.mobile.share` — App Groups |
| App ID (위젯 확장) | `app.sprout.mobile.widget` — App Groups (아래 §8 위젯) |
| App Group | `group.app.sprout.mobile` (위 App ID 모두에) |
| Sign in with Apple 키 | Keys에서 생성 → **Key ID + .p8** |
| Services ID | 예: `app.sprout.signin` — Sign in with Apple 켜고 반환 URL `https://macmini.tail425c97.ts.net/auth/apple/callback` |
| (선택) APNs 키 | Keys에서 생성 → Firebase 프로젝트 `sprout-510614`에 올리려면 주인에게 전달 |

`app.sprout.mobile`이 이미 다른 팀에 잡혀 있다고 나오면 주인에게 알립니다(번들 ID를 바꾸면 구글 로그인 설정도 바뀌어야 함).

## 4. 빌드
```bash
. scripts/node22.sh
cd apps/mobile
SPROUT_APPLE_SIGN_IN=1 SPROUT_APPLE_TEAM_ID=<팀 ID> npx expo prebuild --platform ios --clean
open ios/*.xcworkspace     # 타깃 3개(앱·SproutShare·SproutWidget) 모두 Signing & Capabilities에서 팀 선택(자동 서명) → Product › Archive → App Store Connect 업로드
```
- 앱 App ID에는 **Push Notifications도 켜야** 서명됩니다(권한 파일에 `aps-environment`가 있음).
- 버전 1.0.0 / 빌드 1. 다시 올릴 때는 빌드 번호만 올립니다(`app.json`의 `ios.buildNumber`).
- 앱은 운영 서버(`https://macmini.tail425c97.ts.net`)에 붙습니다. 서버 쪽 설정은 필요 없습니다.

## 5. 주인에게 보낼 값 (커밋 말고 메시지로)
| 값 | 주인이 넣는 곳 |
|---|---|
| 팀 ID | 서버 `APPLE_TEAM_ID`, 구글 iOS OAuth 클라이언트 |
| Sign in with Apple Key ID + .p8 | 서버 `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` |
| Services ID | 서버 `APPLE_SERVICES_ID` |

**아이폰 앱의 애플 로그인은 이 값 없이도 바로 됩니다.** 서버는 애플 공개키와 번들 ID(`app.sprout.mobile`)만으로 토큰을 확인합니다. 그러니 기다리지 말고 진행해도 됩니다. 이 값은 ① 계정 삭제 때 애플 토큰 폐기(애플 권장 사항), ② 데스크톱의 웹 방식 애플 로그인에만 쓰이니, 만들면 되도록 빨리(가능하면 심사 전에) 주인에게 보냅니다. TestFlight 빌드에서 애플 로그인을 한 번 눌러 확인합니다.

## 6. App Store Connect
- 이름 **꿈틀**, 부제·설명·키워드: [store/listing.md](store/listing.md)
- 개인정보(영양 성분표): [store/privacy-answers.md](store/privacy-answers.md)
- 스크린샷: [store/screenshots/ios](store/screenshots/ios) — `6.9/`·`6.5/` 각 6장, 캡션 `captions.md` (아이폰 전용, iPad 없음)
- 지원 URL `https://web-production-cd889.up.railway.app/support`, 개인정보 처리방침 `…/privacy`
- 심사 메모(영문): [store/review-notes.md](store/review-notes.md). 데모 계정 비밀번호는 주인에게 따로 받습니다. 데모 데이터는 2026-10-05 기준이라 심사가 늦어지면 주인에게 새로 넣어 달라고 합니다.
- 심사 기간에는 주인 맥미니 서버가 켜져 있어야 합니다(AI·동기화). 제출 전에 주인에게 알려 주세요.

## 7. 막히면
- 빌드 오류가 iOS 설정 문제면 고치고 PR에 적습니다.
- 공용 코드·서버 문제면 고치지 말고 이슈를 열어 주인에게 넘깁니다(재현 방법과 로그 포함).

---

## 8. 위젯 (36 모바일 위젯 — 2026-10-05 추가)
홈 화면 위젯 3종(월 캘린더·오늘 할 일·캐릭터)은 앱 확장 타깃 `SproutWidget`(iOS 17+)으로 들어간다. `ios/`는 커밋하지 않으므로 `expo prebuild` 때 `apps/mobile/plugins/widgets` 플러그인이 타깃을 다시 붙인다. 자세한 설계는 [36 §7](../screens/36-mobile-widgets.md).

| 할 일 | 값 · 방법 |
|---|---|
| App ID | `app.sprout.mobile.widget` (앱 번들 ID + `.widget`, 바꾸지 말 것) — Capabilities에서 **App Groups** 켜고 `group.app.sprout.mobile` 선택 |
| App Group | 앱·공유 확장·위젯 **세 App ID 모두 같은** `group.app.sprout.mobile`. 하나라도 빠지면 위젯이 "꿈틀을 한 번 열어 주세요"에서 멈춘다(저장 칸을 못 읽음) |
| 프로비저닝 | Xcode 자동 서명이면 팀만 고르면 된다. 수동이면 위젯용 프로파일(App Group 포함)을 따로 만든다 |
| 팀 ID | 빌드할 때 `SPROUT_APPLE_TEAM_ID=<팀 ID>` — 공유 확장과 위젯 플러그인의 `teamId`가 같이 바뀐다(`app.config.ts`) |
| 버전 | 위젯 `MARKETING_VERSION`·`CURRENT_PROJECT_VERSION`은 `app.json`의 `version`·`ios.buildNumber`를 따른다(플러그인이 넣음). 다르면 App Store 업로드가 거부된다 |

확인 순서(실기기):
1. `npx expo prebuild --platform ios --clean` 뒤 Xcode에서 타깃 `SproutWidget`이 보이고 Signing & Capabilities에 App Groups(`group.app.sprout.mobile`)가 있는지.
2. 앱을 설치해 로그인 → 홈 화면 길게 누르기 → 편집 › 위젯 추가 → "꿈틀" → 월 캘린더(크게)·오늘 할 일(작게·중간)·캐릭터(작게)를 놓는다.
3. 월 위젯 ‹ › 로 달이 넘어가고, 날짜 칸을 누르면 앱 캘린더 그날이 열리는지. 오늘 할 일 체크 → 체크 모양 → 앱을 열면 완료·XP +1 반영되고 행이 빠지는지.
4. 안 되면: Console.app에서 `SproutWidget` 프로세스 로그(`container_create_or_lookup_app_group_path` 실패 = App Group 권한 누락).

시뮬레이터 빌드는 프로비저닝 프로파일 없이도 App Group이 동작한다(2026-10-05 iPhone 17 Pro · iOS 26.5에서 확인, 스크린샷 `docs/screens/shots/36-mobile-widgets/`).

