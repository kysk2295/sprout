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
| App ID (위젯 확장, 있으면) | `apps/mobile/plugins`의 위젯 플러그인에 적힌 번들 ID — App Groups |
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
open ios/*.xcworkspace     # Signing & Capabilities에서 팀 선택 → Product › Archive → TestFlight 업로드
```
- 버전 1.0.0 / 빌드 1. 다시 올릴 때는 빌드 번호만 올립니다(`app.json`의 `ios.buildNumber`).
- 앱은 운영 서버(`https://macmini.tail425c97.ts.net`)에 붙습니다. 서버 쪽 설정은 필요 없습니다.

## 5. 주인에게 보낼 값 (커밋 말고 메시지로)
| 값 | 주인이 넣는 곳 |
|---|---|
| 팀 ID | 서버 `APPLE_TEAM_ID`, 구글 iOS OAuth 클라이언트 |
| Sign in with Apple Key ID + .p8 | 서버 `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` |
| Services ID | 서버 `APPLE_SERVICES_ID` |

**심사 제출 전에 보내야 합니다.** 서버에 들어가기 전에는 애플 로그인이 실패하고, 그러면 심사에서 거절됩니다. 주인이 "넣었어"라고 하면 TestFlight 빌드에서 애플 로그인을 한 번 눌러 확인합니다.

## 6. App Store Connect
- 이름 **꿈틀**, 부제·설명·키워드: [store/listing.md](store/listing.md)
- 개인정보(영양 성분표): [store/privacy-answers.md](store/privacy-answers.md)
- 스크린샷: [store/screenshots](store/screenshots) (6.9"·6.5", 아이폰 전용)
- 지원 URL `https://web-production-cd889.up.railway.app/support`, 개인정보 처리방침 `…/privacy`
- 심사 메모(영문): [store/review-notes.md](store/review-notes.md). 데모 계정 비밀번호는 주인에게 따로 받습니다.
- 심사 기간에는 주인 맥미니 서버가 켜져 있어야 합니다(AI·동기화). 제출 전에 주인에게 알려 주세요.

## 7. 막히면
- 빌드 오류가 iOS 설정 문제면 고치고 PR에 적습니다.
- 공용 코드·서버 문제면 고치지 말고 이슈를 열어 주인에게 넘깁니다(재현 방법과 로그 포함).
