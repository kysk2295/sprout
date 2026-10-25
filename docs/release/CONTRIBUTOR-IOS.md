# iOS 출시 — 기여자(Claude Code)용 작업 지시서

이 문서는 **iOS 앱 '꿈틀'을 자기 Apple 개발자 계정으로 출시하는 기여자**와, 그 기여자가 쓰는 **Claude Code**가 읽는 문서입니다.
Claude는 이 문서와 [CLAUDE.md](../../CLAUDE.md)·[HANDOFF.md](../../HANDOFF.md)·[RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) §4를 먼저 읽습니다.

## 0. 역할 나누기
| 누가 | 하는 일 |
|---|---|
| **기여자(너)** | Apple 계정 설정, iOS 빌드·서명, TestFlight, App Store Connect 등록·심사 제출 |
| **저장소 주인(유니포트·고윤서)** | 서버(맥미니) 운영과 서버 환경 변수, 비밀 값 보관, PR 병합, Android·데스크톱 |
| **하지 않는 것** | 서버 코드·데이터 구조·공용 로직 수정, 기능 추가. 필요하면 이슈로 남기고 주인에게 요청 |

## 0.1 ⚠️ 먼저 읽기 — 번들 ID·App Group은 새 이름으로 (2026-10-26)
**증상:** 기여자 팀(예: `LU9899WD2P`)에서 App Group `group.app.sprout.mobile`이나 App ID `app.sprout.mobile`을 등록하면 "이미 다른 팀에서 사용 중"으로 막힌다.
**원인:** 옛 이름이 **주인의 무료 개인 팀 `BU697KN34B`**에 잡혀 있다. 주인이 이 맥에서 아이폰에 직접 설치할 때 Xcode 자동 서명이 등록한 것이다(기여자 잘못 아님, 다른 기여자 팀도 아님). 무료 개인 팀은 개발자 웹사이트에서 식별자를 지울 수 없어서, 옛 이름을 풀어 주기를 기다리는 방법은 쓰지 않는다.
**해결(정한 방법): iOS만 새 이름으로 등록한다.** 아직 App Store에 낸 적이 없어서 잃는 것이 없다. Android 패키지(`app.sprout.mobile`, Play 출시 중)는 그대로다.

| 항목 | 새 값(권장) |
|---|---|
| 번들 ID(앱) | `app.kkumteul.mobile` |
| 공유 확장 / 위젯 | `app.kkumteul.mobile.share` / `app.kkumteul.mobile.widget` (앱 번들 ID + 접미사 — 자동) |
| App Group | `group.app.kkumteul.mobile` (자동 = `group.<번들 ID>`) |

- 다른 이름을 쓰고 싶으면 위 세 줄이 같은 규칙을 따르게만 하면 된다. **한 번 App Store에 올린 번들 ID는 바꿀 수 없으니** 주인과 정하고 시작한다.
- 코드·설정은 이미 준비돼 있다(`apps/mobile/app.config.ts`, 2026-10-26): 아래 환경 변수 세 개를 **prebuild 때** 주면 앱·공유 확장·위젯·App Group·키체인 공유 그룹·JS(`src/share/native.ts`, `src/widgets/native.ts`)가 같이 바뀐다. 그 뒤 Xcode 아카이브(환경 변수 없음)는 `ios/` 파일에서 같은 값을 다시 읽는다 → `app.json`은 고치지 않는다.
```bash
SPROUT_IOS_BUNDLE_ID=app.kkumteul.mobile SPROUT_APPLE_TEAM_ID=<내 팀 ID> SPROUT_APPLE_SIGN_IN=1 \
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<주인이 보낸 새 iOS 클라이언트 id> \
npx expo prebuild --platform ios --clean
# 확인: npx expo config --json | grep -E 'bundleIdentifier|appGroup|keychainGroup'
```
- 이름을 바꾸면 **주인 쪽에서 두 가지**가 필요하다(§5 표에도 있음): ① 구글 로그인 — Google Cloud 프로젝트 `sprout-510614`에 새 번들 ID용 **iOS OAuth 클라이언트**를 만들어 그 id(공개 값)를 기여자에게 준다. 없으면 아이폰 구글 로그인 버튼이 동작하지 않는다. ② 애플 로그인 — 맥미니 서버 `.env`의 `APPLE_BUNDLE_IDS`에 새 번들 ID를 더하고(쉼표로 옛 값과 함께) API를 다시 띄운다. 없으면 아이폰 애플 로그인이 "aud 불일치"로 실패한다.

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
| App ID (앱) | `app.kkumteul.mobile`(§0.1) — Sign in with Apple, Push Notifications, App Groups 켜기 |
| App ID (공유 확장) | `app.kkumteul.mobile.share` — App Groups |
| App ID (위젯 확장) | `app.kkumteul.mobile.widget` — App Groups (아래 §8 위젯) |
| App Group | `group.app.kkumteul.mobile` (위 App ID 모두에) |
| Sign in with Apple 키 | Keys에서 생성 → **Key ID + .p8** |
| Services ID | 예: `app.sprout.signin` — Sign in with Apple 켜고 반환 URL `https://macmini.tail425c97.ts.net/auth/apple/callback` |
| (선택) APNs 키 | Keys에서 생성 → Firebase 프로젝트 `sprout-510614`에 올리려면 주인에게 전달 |

옛 이름(`app.sprout.mobile`·`group.app.sprout.mobile`)은 쓰지 않는다 — §0.1. 아래 §8·§9의 옛 이름 예시도 새 이름으로 읽는다.

## 4. 빌드
```bash
. scripts/node22.sh
cd apps/mobile
SPROUT_IOS_BUNDLE_ID=app.kkumteul.mobile SPROUT_APPLE_SIGN_IN=1 SPROUT_APPLE_TEAM_ID=<팀 ID> \
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<주인이 보낸 iOS 클라이언트 id> npx expo prebuild --platform ios --clean
open ios/*.xcworkspace     # 타깃 3개(앱·SproutShare·SproutWidget) 모두 Signing & Capabilities에서 팀 선택(자동 서명) → Product › Archive → App Store Connect 업로드
```
- 앱 App ID에는 **Push Notifications도 켜야** 서명됩니다(권한 파일에 `aps-environment`가 있음).
- 버전 **1.0.1**(2026-10-26, Android와 같음) / 빌드 1. 다시 올릴 때는 빌드 번호만 올립니다(`app.json`의 `ios.buildNumber`).
- 앱은 운영 서버(`https://macmini.tail425c97.ts.net`)에 붙습니다. 서버 쪽 설정은 필요 없습니다.

## 5. 주인에게 보낼 값 (커밋 말고 메시지로)
| 값 | 주인이 넣는 곳 |
|---|---|
| 팀 ID | 서버 `APPLE_TEAM_ID`, 구글 iOS OAuth 클라이언트 |
| Sign in with Apple Key ID + .p8 | 서버 `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` |
| Services ID | 서버 `APPLE_SERVICES_ID` |
| 새 번들 ID(§0.1) | 서버 `APPLE_BUNDLE_IDS`에 추가(아이폰 애플 로그인), Google Cloud에 새 iOS OAuth 클라이언트 만들기 → 그 id를 기여자에게 |
| **주인 → 기여자** | 새 iOS OAuth 클라이언트 id(공개 값, 메시지로) |

**아이폰 앱의 애플 로그인은 이 값 없이도 바로 됩니다.** 서버는 애플 공개키와 번들 ID만으로 토큰을 확인합니다 — 단 새 번들 ID(§0.1)를 서버 `APPLE_BUNDLE_IDS`에 주인이 넣은 뒤부터. 그러니 기다리지 말고 진행해도 됩니다. 이 값은 ① 계정 삭제 때 애플 토큰 폐기(애플 권장 사항), ② 데스크톱의 웹 방식 애플 로그인에만 쓰이니, 만들면 되도록 빨리(가능하면 심사 전에) 주인에게 보냅니다. TestFlight 빌드에서 애플 로그인을 한 번 눌러 확인합니다.

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


---

## 9. 이 문서 뒤에 늘어난 네이티브 요구 (2026-10-10 갱신)
아래는 모두 `app.json`·`package.json`에 이미 들어 있습니다. 기여자는 **`npx expo prebuild --platform ios --clean`을 한 번 새로 돌리고**(§4) 아래만 확인하면 됩니다. 저장소 주인의 작업 폴더에서는 `--clean`을 쓰지 않지만, 기여자의 새 브랜치에서는 써도 됩니다.

| 무엇 | 어디서 들어옴 | 확인할 것 |
|---|---|---|
| 휴대폰 캘린더 권한 문구 (38) | `expo-calendar` 플러그인 `calendarPermission` | Info.plist에 `NSCalendarsUsageDescription`·`NSCalendarsFullAccessUsageDescription`(iOS 17+)이 한국어 문구로 들어갔는지. 미리 알림(`remindersPermission`)은 끔 — `NSRemindersUsageDescription`이 없어야 정상. 심사 메모에 "설정 › 캘린더 연동에서 사용자가 켤 때만 묻는다"고 적혀 있음 |
| 완료음 (39) | `expo-audio` (플러그인 없음) | 소리만 냄(녹음 없음) — 마이크 권한 문구(`NSMicrophoneUsageDescription`)가 없어야 정상. 생기면 PR에 적기 |
| 흔들기 (49, 들어왔을 때만) | `expo-sensors` | `package.json`에 있으면 가속도계만 씀 — 권한 문구 필요 없음. `NSMotionUsageDescription`은 걸음 수(Pedometer)를 쓸 때만이라 넣지 않음 |
| 글꼴 Pretendard (44) | `expo-font` 플러그인, `apps/mobile/assets/fonts/` | 빌드 산출물 Info.plist `UIAppFonts`에 Pretendard 파일들이 들어갔는지. 라이선스(SIL OFL 1.1) 파일이 같은 폴더에 있음 — 지우지 말 것 |
| 앱 아이콘·스플래시 (45 브랜드) | `app.json` `ios.icon`(기본·다크·색조 1024) · `expo-splash-screen` | prebuild 뒤 Xcode `Images.xcassets/AppIcon`에 새 씨앗 아이콘(옛 파랑 아님)과 다크·색조 변형이 있는지. 스토어용 1024는 `docs/release/store/app-store-assets/icon-1024.png` |
| 캐릭터 그림 종 묶음 (49) | 코드(`src/growth/art/art3dPacks.ts`) — 네이티브 설정 없음 | 앱은 기본 그림만 품고, 큰 그림은 처음 종을 고를 때 `https://web-production-cd889.up.railway.app/art3d/v3/`에서 받아 문서 폴더에 둠. HTTPS라 ATS 예외 필요 없음. 심사 전에 주소 하나가 열리는지 확인(안 열리면 주인에게 — 사이트 배포 문제) |

- 위 항목이 없는 예전 빌드를 TestFlight에 올렸다면 빌드 번호를 올려 다시 올립니다.
- 개인정보 답변(`store/privacy-answers.md`)은 위 항목으로 바뀌지 않습니다(휴대폰 캘린더에서 읽기만 한 일정은 기기 안 처리, 꿈틀에서 만든 일정은 이미 "캘린더 일정" 항목 — 같은 파일 26·51줄).

---

## 10. 2026-10-18 갱신 — 10-10 뒤 바뀐 것
네이티브 설정(권한 파일·App ID·확장 타깃)은 **새로 생긴 것 없음**. `npx expo prebuild --platform ios --clean`을 한 번 새로 돌리고 아래만 확인하면 됩니다.

| 무엇 | 확인할 것 |
|---|---|
| 저녁 일기 알림(28 §9 A) | 로컬 알림 + 카테고리 `sprout-diary`(답장 글 입력 · 😊 좋았어 · 😣 힘들었어). 이미 있는 알림 권한만 씀 — 새 entitlement·Info.plist 문구 없음. 첫 일기를 저장하면 "저녁에 물어봐도 될까요?" 뒤 OS 권한 창이 한 번 뜨는 게 정상 |
| 일기 화면 v3 | 캐릭터와 대화 → 자동 저장, 머리 ✎ = 혼자 쓰기. 코드만 바뀜(설정 없음). **나만 보기는 없앰** — 스토어 설명·스크린샷에 나만 보기가 나오면 빼기 |
| `expo-sensors` | 이제 `package.json`에 들어 있음(§9 표대로 권한 문구 필요 없음, `NSMotionUsageDescription`이 생기면 PR에 적기) |
| 위젯 그림 | 마스코트 그림이 바뀜(`plugins/widgets`) — prebuild만 다시 하면 됨 |
| 스크린샷 | `store/screenshots/ios/6.9/`·`6.5/` 6장씩 새로 바뀜(01-today · 02-calendar · 03-growth · 04-quickadd · 05-ai · 06-ai-answer), 캡션 `captions.md`도 같이 |
| 심사 메모 | [store/review-notes.md](store/review-notes.md) PERMISSIONS(알림 = 할 일 + 저녁 일기, 캘린더 = 켤 때만)와 JOURNAL 문단을 새로 넣음 — App Store Connect의 심사 메모 칸에 **새 글로 다시 붙여 넣기** |
| 데모 데이터 | 2026-10-05 기준이라 지금은 날짜가 지났음 — **제출 전에 주인에게 새로 넣어 달라고 요청** |
| 빌드 번호 | `app.json` `ios.buildNumber`는 아직 `1`. 이미 TestFlight에 1을 올렸다면 `2`로 올려서 다시 올리기 |

## 11. 2026-10-25 추가 — 일기 사진(v7)
| 무엇 | 확인할 것 |
|---|---|
| `expo-image-picker` · `expo-image-manipulator` (새 네이티브 모듈) | `npx expo prebuild --platform ios --clean` 다시 → Info.plist에 `NSPhotoLibraryUsageDescription`·`NSCameraUsageDescription`이 한국어 문구로(app.json 플러그인), 마이크 문구는 **없어야** 정상(`microphonePermission: false`). 앨범 고르기는 시스템 사진 창이라 권한 창이 뜨지 않는 게 정상, "지금 찍기"만 카메라 권한 |
| 개인정보 라벨 | App Store Connect App Privacy에 **사진 또는 동영상(앱 기능·사용자와 연결·추적 아님)** 추가 — [store/privacy-answers.md](store/privacy-answers.md) |
| 심사 메모 | [store/review-notes.md](store/review-notes.md) PERMISSIONS에 Photos 줄 추가됨 — 다시 붙여 넣기 |

## 12. 2026-10-26 추가 — 이번 판에서 바뀐 것
- **식별자:** §0.1(새 번들 ID·App Group). 가장 먼저.
- **버전 1.0.1** — Android는 Play 프로덕션 7(1.0.1) 검토 제출. iOS도 1.0.1 / 빌드 1로 처음 올린다.
- 새 네이티브 모듈 없음. JS만 바뀜: 일기 대화 = 늘 AI(동의 카드 없음), 장면 카드 v2(사진 배경·캐릭터 기분 표정, 새 3D 표정 `sad`), 휴대폰 UX 고침(키보드 가림·토스트·두 번 제출·동기화 결과 표시). 개인정보 답변(`store/privacy-answers.md`)은 바뀌지 않는다 — 일기 대화가 AI 서버로 가는 것은 원래 답에 있다.
- **Android 전용 메모(참고):** 카메라를 필수 아님으로, `ACTIVITY_RECOGNITION`(expo-sensors 만보기용) 권한 제거 — iOS는 해당 없음(가속도계만 쓰고 동작 권한 문구를 요구하지 않음). 그래도 App Store Connect가 `NSMotionUsageDescription`을 묻는다면 `app.json`의 iOS `infoPlist`에 "흔들어서 캐릭터와 놀 때 휴대폰 움직임을 읽어요"를 넣는다.
- 주인 쪽 진행 상황(서버 `APPLE_BUNDLE_IDS`, 새 iOS OAuth 클라이언트)은 PR·메시지로 확인하고, 그 전에는 구글·애플 로그인 확인만 미루고 나머지(빌드·TestFlight·등록 정보)를 먼저 진행한다.
