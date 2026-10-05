# sprout 출시 인계서 (iOS 친구 · Android·데스크톱 사용자 · 리드)

> 작성 2026-10-05. 저장소 코드 기준으로 적었다. Apple·Google 콘솔 메뉴 이름과 정책 숫자는 이날 기준이라, 결제·신청 직전에 공식 화면에서 다시 확인한다.
> 함께 볼 문서: [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md)(전체 출시 체크) · [packaging.md](packaging.md)(맥 서명·공증) · [store/](store/)(스토어 문구·개인정보 답변·스크린샷 목록) · [legal/](legal/)(처리방침·약관·계정 삭제 안내 원문)

**담당**
- **친구**: 친구의 Apple Developer 계정으로 iOS 앱을 낸다.
- **사용자**: 저장소 주인. Android(Google Play)·데스크톱·서버(Mac mini)를 맡는다.
- **리드**: 커밋·푸시·공개 전환·배포 같은 바깥 작업을 한다.

---

## 0. 지금 결정된 것 (2026-10-05)
| 항목 | 결정 |
|---|---|
| 서버 | **Mac mini 한 대**(Docker Compose: Postgres·PowerSync·API·백업) + **Tailscale Funnel** 공개 주소. 비용 0. Railway로 옮기는 건 나중 일(§5.8) |
| API 주소 | `https://macmini.tail425c97.ts.net` (Funnel 443 → Mac mini 127.0.0.1:6060) |
| 동기화(PowerSync) 주소 | `https://macmini.tail425c97.ts.net:8443` (Funnel 8443 → 127.0.0.1:8080) |
| 공개 웹 페이지(처리방침·약관·계정 삭제·지원·소개) | **Railway에 올리는 소개 사이트**(다른 작업자가 만드는 중). 스토어에는 `https://<railway-domain>/privacy` 같은 주소를 적는다. 도메인은 리드가 채운다(§7) |
| AI | Mac mini의 Ollama. API와 같은 기계라 `AI_BACKEND=direct` |
| 저장소 | GitHub `kysk2295/sprout`. 사용자가 **공개 저장소**로 바꾼 뒤 친구가 받는다. 공개 전 점검 결과는 §1 |
| iOS 빌드 | **로컬 Xcode 빌드를 권장**(§3). EAS(Expo 클라우드 빌드)는 안 쓴다 |

---

## 1. 공개 전 점검 결과 (2026-10-05 비밀 정보 검사)
**검사 방법**: `gitleaks`(모든 브랜치·모든 커밋 131개 + 작업 폴더)와 직접 패턴 검사(개인 키, `AIza…`, `GOCSPX-…`, `sk-…`, `ghp_…`, AWS 키, 서비스 계정 `"private_key"`, JWT, 비밀번호·토큰 대입, 이메일, 전화번호, Tailscale 주소)를 함께 돌렸다.

**결론: 공개를 막을 비밀 정보는 이력에 없다.**
| 찾은 것 | 위치 | 판단 |
|---|---|---|
| `token: 'tok-12345678'` | `apps/mobile/src/notifications/pushLogic.test.ts:62` (커밋 a993163) | 시험용 가짜 값. 문제없음 |
| `PG_PASSWORD`·`PS_ADMIN_TOKEN` 실제 값 | `server/.env` (작업 폴더만) | `.gitignore`(`.env`) 덕분에 **커밋된 적 없음**. 공개 저장소에 안 올라간다 |
| PowerSync 예제의 키 | `spikes/a1-powersync-electron/backend/demos/*/.env` (작업 폴더만) | 공개 예제 저장소의 데모 키. 커밋 안 됨 |
| Google OAuth **클라이언트 id** | 저장소에 없음. `~/.config/sprout/google.env`, `apps/mobile/.env.local`에만 | 클라이언트 id는 원래 앱에 들어가는 공개 값이라 들어가도 괜찮다. **클라이언트 secret(`GOCSPX-…`)은 어디에도 없다** |
| FCM 서비스 계정 이메일 `sprout-push@sprout-510614.iam.gserviceaccount.com`, GCP 프로젝트 id `sprout-510614` | `docs/screens/32-push-notifications.md`, `server/README.md` | 식별자일 뿐 비밀 아님. 키 파일은 `~/.config/sprout/`에만 있다 |
| Tailscale 주소 `macmini.tail425c97.ts.net`(16곳), 예전 이름 `yunseo-mac-paperclip.tail425c97.ts.net`(HANDOFF 1곳) | 문서·코드 | 앱에 들어가는 공개 주소라 괜찮다. 다만 tailnet 이름 `tail425c97`과 기계 이름이 공개된다는 점은 알아 둔다 |
| 이메일 | 시험 데이터뿐(`me@gmail.com`, `qa-ui@sprout.test`, `abc@privaterelay.appleid.com` 등). 커밋 작성자는 GitHub noreply 주소 | 실제 개인 이메일 없음 |
| 전화번호 | 틱틱 도움말 URL과 뉴스 URL 안의 숫자, 공개 상담 번호(109·1577-0199) | 개인 번호 없음 |
| 화면 캡처 37장(`docs/verification/`) | 계정 이메일이 보이는 캡처는 이미 `.gitignore`에 있음. 3장을 눈으로 확인했고 개인정보는 없었다 | 공개 전에 나머지를 한 번 훑어보길 권장 |

**공개 전에 리드가 할 일 (막는 것은 아니고 정리 차원)**
1. `apps/mobile/modules/sprout-alarms/android/build/`(Gradle 빌드 결과 99개, 커밋 b6f9a8b에서 들어감)는 산출물이라 저장소에서 뺀다. `.gitignore`에는 이번에 넣었다: `git rm -r --cached apps/mobile/modules/sprout-alarms/android/build`
2. `HANDOFF.md`의 개인 경로(세컨브레인 iCloud 경로)와 `.claude/launch.json`의 `/Users/koyunseo/...` 경로는 비밀은 아니지만 사적인 정보다. 남길지 정한다.
3. `docs/ticktick-research/`·`docs/ticktick-captures/`의 글은 틱틱 조사 메모다. 그림 원본은 이미 git 밖에 있다. 공개 저장소에 틱틱 비교 글이 보여도 괜찮은지 사용자가 정한다.
4. 혹시 나중에 비밀이 커밋되면 이렇게 처리한다. ① 그 키를 **먼저 폐기·재발급**한다(이력을 지워도 이미 퍼진 사본은 남는다) ② `brew install git-filter-repo` → `git filter-repo --path <파일> --invert-paths` 또는 `--replace-text` ③ 강제 푸시하고 다른 사본은 모두 새로 받는다 ④ GitHub 지원팀에 캐시 삭제를 요청한다. 이번에는 해당 없다.

**`.gitignore` 점검**: `.env`·`.env.*`, `google-services.json`, `GoogleService-Info.plist`, `*service-account*.json`, `*firebase-adminsdk*.json`, `fcm*.json`, `server/backups/`, `apps/desktop/release/`, `out/`·`dist/`는 이미 있었다. 이번에 루트 `.gitignore`에 `*.p8 *.p12 *.pem *.key *.jks *.keystore *.mobileprovision *.provisionprofile *.cer`, `apps/desktop/.live*/`(전에는 이 컴퓨터의 `.git/info/exclude`에만 있었음), 네이티브 빌드 산출물(`*.ipa *.aab *.apk *.xcarchive`, `modules/*/android/build/`)을 더했다. `apps/mobile/ios`·`android`는 이전부터 git 밖이다(prebuild로 만든다).

---

## 2. 저장소 구조
| 위치 | 내용 |
|---|---|
| `apps/desktop/` | Electron + React + TypeScript. 동기화는 메인 프로세스의 `@powersync/node`. 패키징 `electron-builder.yml`(appId `app.sprout.desktop`), 맥 위젯·Apple 캘린더 도우미(`native/`) |
| `apps/mobile/` | React Native + **Expo SDK 57**(RN 0.86) 개발용 빌드(Expo Go로는 안 열림). `app.json` + `app.config.ts`(환경 변수로 구글·애플·푸시 설정), 공유 확장 플러그인 `plugins/share-extension`, 안드로이드 정확한 알람 모듈 `modules/sprout-alarms` |
| `packages/schema/` | 앱과 서버가 함께 쓰는 동기화 스키마·공용 로직(정본) |
| `packages/tokens/` | 디자인 토큰 |
| `server/` | `docker-compose.yaml`(db·api·powersync·backup), `api/`(Node API: 로그인·JWT·업로드·AI 프록시·푸시), `db/init`·`db/migrations`, `powersync/`, `ai-worker/`(Railway로 옮길 때 쓰는 AI 워커), `README.md`(서버 정본 설명) |
| `docs/screens/` | 화면 명세(개발 정본). 로그인 08, 모바일 20 |
| `docs/release/` | 이 문서, 체크리스트, 패키징, 법률 문서, 스토어 문구, 브랜드(로고 B 적용됨 — `brand/out/b/`) |
| `scripts/node22.sh` | **항상 Node 22로**: `. scripts/node22.sh` |

---

## 3. 준비물과 빌드 방법
**모두 공통**
- macOS + **Node 22**(시스템 Node 26은 Electron 설치와 simdutf가 깨진다): `brew install node@22` 후 저장소 맨 위 폴더에서 `. scripts/node22.sh`
- `npm install`(맨 위 폴더 한 번 — 워크스페이스)
- 확인 명령: `npm run typecheck:mobile` · `npm run test:mobile` · `npm run test:api` · `npm test`

**iOS (친구)**
- Xcode 26 이상(이 저장소는 Xcode 26.5로 확인함), CocoaPods 1.16 이상(`brew install cocoapods`)
- **권장 경로: 로컬 빌드**(`expo prebuild` → Xcode Archive → App Store Connect 업로드). 이유는 세 가지다. ① 저장소에 `eas.json`이 없고, 공유 확장·App Group 플러그인을 로컬에서만 확인했다. ② 친구의 Apple 인증서·키를 Expo 서버에 맡기지 않아도 된다. ③ 무료다.
- 처음 한 번:
  ```bash
  git clone https://github.com/kysk2295/sprout && cd sprout
  . scripts/node22.sh && npm install
  cd apps/mobile
  touch .env.local   # 아래 값을 채운다(git 밖 — 루트 .gitignore의 .env.*)
  ```
  `apps/mobile/.env.local` 내용(§9에서 받는 값):
  ```bash
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<사용자에게 받음>.apps.googleusercontent.com
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<사용자에게 받음>.apps.googleusercontent.com
  ```
- 빌드할 때마다:
  ```bash
  cd apps/mobile
  SPROUT_APPLE_TEAM_ID=<친구 팀 ID 10자리> SPROUT_APPLE_SIGN_IN=1 npx expo prebuild --platform ios --clean
  open ios/sprout.xcworkspace
  ```
  Xcode에서 ① `sprout`·`SproutShare` 두 타깃 모두 Signing & Capabilities → Team = 친구 팀, "Automatically manage signing" ② 스킴 `sprout`, 대상 "Any iOS Device (arm64)" ③ Product › Archive → Organizer › Distribute App › App Store Connect › Upload.
  - `SPROUT_APPLE_TEAM_ID`: 공유 확장의 키체인 그룹(`<팀>.app.sprout.mobile.shared`)과 `DEVELOPMENT_TEAM`을 친구 팀으로 바꾼다. 빼면 `app.json`의 `BU697KN34B`(사용자의 무료 개인 팀)가 들어가서 서명에 실패한다.
  - `SPROUT_APPLE_SIGN_IN=1`: 애플 로그인 권한(`com.apple.developer.applesignin`)을 넣고 버튼을 켠다. **App Store에 내는 빌드는 꼭 켠다**(심사 지침 4.8). 기능을 안 켠 팀이나 시뮬레이터에서 실험할 때는 빼도 된다. 그러면 버튼이 "준비 중"으로 보인다.
  - 버전: `app.json`의 `expo.version`(사용자에게 보이는 버전, 지금 0.1.0 → 출시 때 1.0.0)과 `ios.buildNumber`(올릴 때마다 +1. 없으면 Xcode에서 Build 번호를 올린다).
  - 시뮬레이터에서 먼저 확인하려면: `npx expo run:ios --device "iPhone 17 Pro"`.

**Android (사용자)**
- JDK 21, Android SDK(platform 36 · build-tools 36 · NDK 27.1.12297006 · CMake 3.22.1). 자세한 내용은 [apps/mobile/README.md](../../apps/mobile/README.md)
- 권장 경로: 로컬 `bundleRelease`(§10.3)

**데스크톱 (사용자)**: [packaging.md](packaging.md). `npm run dist:mac:release`(서명·공증 환경 변수가 필요하다)

---

## 4. 식별자 한눈에
| 무엇 | 값 | 어디에 있나 |
|---|---|---|
| iOS 앱 번들 ID | `app.sprout.mobile` | `apps/mobile/app.json` `ios.bundleIdentifier` |
| iOS 공유 확장 | `app.sprout.mobile.share` | 플러그인이 `<앱 id>.share`로 만든다 |
| App Group | `group.app.sprout.mobile` | `app.json` 플러그인 옵션 `appGroup` |
| 키체인 공유 그룹 | `<팀 ID>.app.sprout.mobile.shared` | 플러그인이 팀 ID로 만든다 |
| Android 패키지 | `app.sprout.mobile` | `app.json` `android.package` |
| 데스크톱 appId | `app.sprout.desktop` (위젯 `app.sprout.desktop.widget`) | `apps/desktop/electron-builder.yml` |
| 데스크톱 위젯 App Group | `BU697KN34B.app.sprout.desktop` | `apps/desktop/build/entitlements.mac.plist`, `src/main/widget.ts` (팀 ID가 바뀌면 여기도, packaging.md §4-2) |
| URL 스킴 | `sprout://` | 앱 둘 다 |
| 애플 로그인 기기 토큰 aud | `app.sprout.mobile` | 서버 `APPLE_BUNDLE_IDS`(비우면 이 값) |
| 애플 로그인 웹(데스크톱) aud | Services ID(친구가 만든다, 예: `app.sprout.signin`) | 서버 `APPLE_SERVICES_ID` |
| Google Cloud 프로젝트 | `sprout-510614` | OAuth 클라이언트·FCM |

**번들 ID 충돌 주의**: 번들 ID는 Apple 전체에서 하나만 쓸 수 있다. 사용자가 무료 개인 팀(`BU697KN34B`)에서 Xcode로 시뮬레이터나 기기 실행을 해 봤다면 `app.sprout.mobile`이 그 팀에 잡혀 있을 수 있다. 친구 계정에서 "not available"이 뜨면 이렇게 한다.
① 사용자가 developer.apple.com에서 그 개인 팀으로 로그인해 Identifiers에서 지울 수 있으면 지운다.
② 지울 수 없으면 새 번들 ID(예: `com.<친구도메인>.sprout`)로 바꾼다. 이때 바꿀 곳은 `app.json`의 `bundleIdentifier`·`appGroup`(`group.<새 id>`), 서버 `APPLE_BUNDLE_IDS=<새 id>`, Google iOS OAuth 클라이언트(새로 만들어야 함, §9.2), Android는 그대로 둬도 된다. **출시 뒤에는 바꿀 수 없으니** 첫 업로드 전에 정한다.

---

## 5. 서버 — Mac mini + Tailscale Funnel
### 5.1 구성
| 서비스(compose) | 하는 일 | Mac mini 포트(127.0.0.1만) | 바깥 주소 |
|---|---|---|---|
| `db` | Postgres 18, `wal_level=logical`(PowerSync가 필요로 함). 데이터 DB `sprout` + `powersync_storage` | 55442 | 없음(공개하지 않는다) |
| `api` | 이메일·구글·애플 로그인, JWT(RS256) 발급·JWKS, `/sync/upload`, AI 프록시(같은 기계 Ollama), FCM 푸시 스케줄러 | 6060 | `https://macmini.tail425c97.ts.net` |
| `powersync` | PowerSync Open Edition. 사용자별 변경분 스트리밍 | 8080 | `https://macmini.tail425c97.ts.net:8443` |
| `backup` | 매일 `pg_dump -Fc` → `server/backups/`, 14일 보관 | — | — |
| (호스트) Ollama | `qwen3.5:9b`·`bge-m3`. 인터넷에 열지 않음 | 11434 | 없음 |

Funnel 켜기(Mac mini 화면 앞에서, SSH로는 Tailscale 앱 제어가 안 됨):
```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --bg 6060
/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --bg --https=8443 8080
/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel status
```
(Funnel이 쓸 수 있는 포트는 443·8443·10000뿐이다.)

### 5.2 늘 켜져 있어야 하는 조건 (가동 주의)
앱은 로컬 퍼스트라 서버가 꺼져도 할 일은 계속 쓸 수 있다. 하지만 **로그인·가입·기기 간 동기화·AI·서버 알림은 멈춘다.** 심사 기간에 서버가 꺼져 있으면 **심사관이 로그인을 못 해서 거절된다.**
- 전원과 잠자기: `sudo pmset -a sleep 0 disksleep 0 autorestart 1 womp 1`(잠들지 않기, 정전 뒤 자동 켜짐). 가능하면 UPS를 쓴다.
- macOS 자동 로그인 + **Docker Desktop "로그인 시 시작"** + **Tailscale "로그인 시 시작"**. compose 서비스는 `restart: unless-stopped`라 Docker가 뜨면 같이 뜬다.
- 인터넷: 공유기나 회선이 끊기면 Funnel도 끊긴다.
- macOS 업데이트로 재부팅되면 위 자동 시작이 다 되는지 한 번 확인해 둔다.
- 점검(어디서든):
  ```bash
  curl -s https://macmini.tail425c97.ts.net/health                 # {"ok":true}
  curl -s https://macmini.tail425c97.ts.net/auth/providers         # 구글·애플 설정 여부
  ssh macmini 'export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH; cd ~/sprout/server && docker compose ps'
  ssh macmini 'cd ~/sprout/server && /usr/local/bin/docker compose logs --tail 50 api'
  ```
- 바깥 감시(무료 권장): UptimeRobot 같은 서비스로 `/health`를 5분마다 확인하고, 실패하면 메일을 받는다(사용자가 가입).

### 5.3 Funnel 주소가 바뀌면 생기는 일 (중요)
주소 `macmini.tail425c97.ts.net`은 **기계 이름(`macmini`) + tailnet 이름(`tail425c97`)** 으로 정해지고, **출시된 앱 안에 그대로 들어간다.** 그래서 이렇게 된다.
- Mac mini 이름을 바꾸거나, Tailscale에서 기계를 지웠다 다시 등록하거나, tailnet 이름을 바꾸거나, 다른 Tailscale 계정으로 옮기면 → **이미 깔린 모든 앱이 서버를 못 찾는다**(로그인·동기화 끊김). 고치려면 앱을 새로 빌드해서 스토어 업데이트를 내야 한다.
- 애플 로그인의 돌아오는 주소(`…/auth/apple/callback`)와 Google OAuth 리디렉트 설정도 같이 깨진다.
- 그러니 **기계 이름과 tailnet은 바꾸지 않는다.** Mac mini를 바꿀 때는 새 기계에 같은 이름을 쓰고, 예전 기계는 Tailscale에서 먼저 지운다. 나중에 정식 도메인을 사면 그때 한 번 앱 업데이트로 옮긴다.

### 5.4 서버 환경 변수 (`~/sprout/server/.env`, git 밖, 권한 600)
처음 만들 때는 `./scripts/init-env.sh`(무작위 비밀번호)를 쓴다. 근거는 `server/docker-compose.yaml`·`server/README.md`다.
| 변수 | 지금/예 | 설명 |
|---|---|---|
| `PG_USER` · `PG_PASSWORD` · `PG_DB` | `sprout` · (무작위) · `sprout` | Postgres |
| `PS_ADMIN_TOKEN` | (무작위) | PowerSync 관리 토큰 |
| `PG_PORT` · `API_PORT` · `PS_PORT` | `55442` · `6060` · `8080` (Mac mini) | 127.0.0.1에만 열림 |
| `BACKUP_DIR` · `BACKUP_KEEP_DAYS` · `BACKUP_INTERVAL_SEC` | `./backups` · `14` · `86400` | 백업 |
| `TRUST_PROXY` | `private`(기본) | Funnel → Docker 안에서 X-Forwarded-For를 믿음(시도 제한이 IP별로 동작) |
| `API_PUBLIC_URL` | `https://macmini.tail425c97.ts.net` | 애플 돌아오는 주소 = `<이 값>/auth/apple/callback` |
| `GOOGLE_CLIENT_IDS` | 데스크톱 클라이언트 id, 웹 클라이언트 id(쉼표) | 구글 ID 토큰의 aud로 받아 줄 값 |
| `APPLE_SERVICES_ID` | 친구가 만든 Services ID | 데스크톱(웹 흐름) 애플 로그인. 비우면 데스크톱 애플 버튼은 "준비 중" |
| `APPLE_TEAM_ID` | **친구 팀 ID** | client_secret 서명용. 비우면 `BU697KN34B`가 들어가 틀린 값이 된다 → **꼭 넣는다** |
| `APPLE_KEY_ID` · `APPLE_PRIVATE_KEY` | 키 id · `/Users/<나>/.config/sprout/AuthKey_XXXX.p8` | Sign in with Apple 키. 호스트 경로를 넣으면 compose가 `/run/secrets/apple.p8`에 읽기 전용으로 붙인다. **애플 토큰 폐기(탈퇴)에 필요하므로 출시 서버에는 필수** |
| `APPLE_BUNDLE_IDS` | (비움 = `app.sprout.mobile`) | iOS 기기 애플 로그인 토큰의 aud. 번들 ID를 바꿨을 때만 넣는다. `off` = 끔 |
| `AI_BACKEND` · `OLLAMA_URL` · `AI_MODEL` | `direct` · `http://host.docker.internal:11434` · `qwen3.5:9b` | AI. 상한은 `AI_USER_PER_DAY`(100)·`AI_WEEKLY_KPI_DRAFT`(1)·`AI_WEEKLY_REPORT`(1) 등 compose 기본값 |
| `FCM_PROJECT_ID` · `FCM_SERVICE_ACCOUNT` | `sprout-510614` · `~/.config/sprout/fcm-service-account.json` | Android 서버 푸시. 비우면 푸시만 꺼진다 |
| `PUSH_IOS` | `0` | iOS 서버 푸시. 앱 쪽 iOS 푸시가 아직 없어 v1은 `0`(§8.6) |

### 5.5 배포 순서 — 아직 Mac mini에 안 올린 것 (리드)
**서버가 앱보다 먼저**다. 순서가 바뀌면 새 앱이 올리는 칸을 옛 서버가 409로 거절한다.
```bash
ssh macmini && cd ~/sprout/server && git pull     # 또는 rsync
docker compose exec -T db pg_dump -U sprout -Fc sprout > backups/manual/before-release-$(date +%Y%m%d).dump
for f in db/migrations/20261008-events.sql db/migrations/20261010-avatar.sql db/migrations/20261011-apple-tokens.sql; do
  docker compose exec -T db psql -U sprout -d sprout -v ON_ERROR_STOP=1 < "$f"; done
npm run server:schema   # (저장소에서) sync-config.yaml이 최신인지
docker compose up -d --build api && docker compose restart powersync
curl -s localhost:6060/health
```
- `20261011-apple-tokens.sql`(이번에 추가)은 `user_identities`에 서버 전용 칸 `apple_client_id`·`apple_refresh_token`을 더한다. 칸이 없어도 API는 로그만 남기고 로그인은 된다. 하지만 그동안 들어온 애플 계정은 토큰을 저장하지 못해서 탈퇴할 때 폐기를 못 한다 → **애플 로그인을 켜기 전에 적용한다.**

### 5.6 백업
- 지금은 매일 `pg_dump`를 같은 Mac mini 디스크에 14일 보관한다. **외부 백업은 아직 없다**(CLAUDE.md·PRD 필수, 체크리스트 차단 항목 4). 무료로 할 수 있는 방법: Cloudflare R2 무료 10GB + `rclone` + `age` 암호화를 하루 한 번 launchd로 돌린다. 처리방침의 보관 문구와 맞춘다.
- 복원 시험: `pg_restore`로 다른 DB에 한 번 복원해 본다.

### 5.7 AI
같은 기계 Ollama를 `direct`로 부른다. Ollama가 꺼지면 `/ai/*`만 503("지금은 AI를 쓸 수 없어요")이 나고 나머지는 정상이다. 심사 메모에 이 사실을 적는다(§8.5).

### 5.8 (선택) 나중에 Railway로 옮길 때
compose는 그대로 옮길 수 있게 만들어 뒀다(`server/railway/`에 db·powersync Dockerfile, `server/ai-worker/`). 옮기면 api·db·powersync는 Railway에서 돌고, AI는 Mac mini의 `ai-worker`가 Railway API로 **바깥으로만** 접속해서 일을 가져간다(`AI_BACKEND=worker`, `AI_WORKER_TOKEN` 양쪽 같은 값, Mac mini는 포트를 열지 않는다). 다만 **앱에 들어간 주소가 바뀌므로 앱 업데이트가 필요하다.** 그래서 옮길 생각이 있다면 정식 도메인을 사서 그 도메인으로 한 번에 옮기는 게 좋다. 비용은 월 약 $6~7(2026-10-05 기준, 확인 필요)이다.

---

## 6. 앱에 들어가는 서버 주소
| 앱 | 기본값 위치 | 지금 값 | 빌드 때 바꾸기 |
|---|---|---|---|
| 데스크톱 | `apps/desktop/src/main/sync.ts` 19~20줄 | API `https://macmini.tail425c97.ts.net` · 동기화 `…:8443` | 실행 환경 변수 `SPROUT_API_URL`·`SPROUT_SYNC_URL`(개발용). **출시 빌드는 이 기본값이 들어간다** |
| 모바일 | `apps/mobile/app.json` `expo.extra.apiUrl`·`syncUrl` (+ `src/config.ts` 대체값) | 같음 | `EXPO_PUBLIC_API_URL`·`EXPO_PUBLIC_SYNC_URL`(빌드 때 들어감) 또는 `app.json` 수정 |
| 서버 | `server/api/src/social.ts`(`API_PUBLIC_URL` 기본), compose | 같음 | `.env`의 `API_PUBLIC_URL` |

지금 결정(Mac mini + Funnel)이면 **바꿀 것이 없다.** 주소를 바꾸게 되면 위 세 곳을 한 번에 바꾸고, 애플 Services ID의 Return URL(§8.2-④)과 Google OAuth 설정도 같이 고친다.

---

## 7. 공개 웹 페이지 (Railway 소개 사이트)
다른 작업자가 Railway에 소개 사이트를 만들고, 같은 사이트에서 아래 주소를 함께 제공한다. Mac mini API에는 페이지를 넣지 않는다. Mac mini가 꺼져도 처리방침은 보여야 하기 때문이다.
| 쓰임 | 주소(리드가 도메인 채움) | 원문 |
|---|---|---|
| 개인정보 처리방침 (App Store Connect "Privacy Policy URL", Play "개인정보처리방침") | `https://<railway-domain>/privacy` (영문 `?lang=en` 또는 사이트 규칙대로) | `legal/privacy-policy.ko.md`·`.en.md` |
| 이용 약관 (App Store 라이선스 계약 칸은 기본 EULA를 써도 됨) | `https://<railway-domain>/terms` | `legal/terms.*.md` |
| 계정 삭제 안내 (**Google Play "데이터 삭제 URL" 필수**) | `https://<railway-domain>/account-deletion` | `legal/account-deletion.*.md` |
| 지원 (App Store "Support URL" 필수) | `https://<railway-domain>/support` | 사이트에서 작성 |
| 마케팅 URL(선택) | `https://<railway-domain>/` | — |

**올리기 전에 문서에서 채울 자리**(사용자): `[제품명]`, `[운영자 성명 또는 상호]`, `[privacy@도메인]`·`[support@도메인]`(받을 수 있는 실제 메일. Gmail 별칭도 가능), 시행일, 그리고 남은 `[확인 필요]`. 맨 위 "초안 — 법률 검토 필요" 머리글은 공개본에서 지운다. 앱 가입 화면의 약관·처리방침 글자(모바일 `AuthScreen.tsx`, 데스크톱 로그인)도 이 주소로 연결해야 한다(체크리스트 차단 항목 6).

---

## 8. iOS — 친구가 할 일 (친구의 Apple Developer 계정)
### 8.1 먼저
- Apple Developer Program(유료) 계정의 **팀 ID**(Membership 화면 10자리)를 확인해서 사용자에게 알려 준다.
- 저장소를 받고 §3대로 빌드 환경을 만든다.

### 8.2 developer.apple.com › Certificates, Identifiers & Profiles에서 만들 것
① **App Group**: Identifiers › `+` › App Groups › `group.app.sprout.mobile`

② **App ID (앱)**: Identifiers › `+` › App IDs › App › Bundle ID **Explicit** `app.sprout.mobile`, 설명 `sprout`. Capabilities에서 켤 것:
   - **Sign in with Apple** — "Enable as a primary App ID"
   - **App Groups** → Configure → `group.app.sprout.mobile`
   - **Push Notifications** — 지금 v1은 iOS 서버 푸시를 쓰지 않지만 나중을 위해 켜 둬도 괜찮다(켜면 빌드에 aps 권한이 필요해진다. 지금 플러그인에 `aps-environment`가 없으니 **v1에서는 켜지 않는 것을 권장**. 켤 때 §8.6)
   - Associated Domains: **쓰지 않는다**(유니버설 링크 없음. `sprout://` 스킴만)
   - Keychain Sharing은 별도 Capability가 아니라 엔타이틀먼트(플러그인이 넣음)라 따로 할 일이 없다

③ **App ID (공유 확장)**: `app.sprout.mobile.share`, Capabilities: **App Groups** → `group.app.sprout.mobile`

④ **Services ID (데스크톱 앱의 애플 로그인 = 웹 흐름)**: Identifiers › `+` › Services IDs › 예: `app.sprout.signin`(설명 `sprout 로그인`) → 저장 후 다시 열어 **Sign in with Apple** 체크 → Configure:
   - Primary App ID: `app.sprout.mobile`
   - Domains and Subdomains: `macmini.tail425c97.ts.net`
   - Return URLs: `https://macmini.tail425c97.ts.net/auth/apple/callback` (정확히 이 값. 끝에 `/`를 붙이지 않는다)
   - (참고) 예전에는 도메인 확인 파일이 필요했지만 지금 Apple 화면에서는 요구하지 않을 수 있다. 만약 요구하면 그 파일을 사용자에게 보내 준다. 그러면 API에 경로를 하나 더하는 작업이 필요하다(**확인 필요**).

⑤ **Key (Sign in with Apple)**: Keys › `+` › 이름 `sprout SIWA`, **Sign in with Apple** 체크 → Configure → Primary App ID `app.sprout.mobile` → 등록 → **`AuthKey_<KEYID>.p8`을 내려받는다(딱 한 번만 받을 수 있다)**. Key ID를 적어 둔다.
   - 이 키 하나로 웹(Services ID)과 기기(번들 ID) 양쪽의 client_secret을 만든다. 서버는 이 키로 ① 인가 코드를 확인하고 ② **탈퇴·연결 해제 때 애플 토큰을 폐기**한다(지침 5.1.1(v)).

⑥ (나중, 선택) **APNs 키**: Keys › `+` › **Apple Push Notifications service (APNs)** → `.p8`(⑤와 같은 키에 함께 체크해도 된다). Firebase 콘솔(`sprout-510614`) › 프로젝트 설정 › 클라우드 메시징 › Apple 앱 구성 › APNs 인증 키 업로드(Key ID·팀 ID). **v1은 iOS 서버 푸시가 없어서(앱 `pushIos: false`, 서버 `PUSH_IOS=0`) 지금은 안 해도 된다.** §8.6 참고.

⑦ 프로비저닝: Xcode "Automatically manage signing"이 ②③의 App Store 프로파일을 알아서 만든다. 수동으로 하려면 Profiles › App Store Connect 배포 프로파일 2개(앱·확장)를 만든다.

### 8.3 사용자에게 보낼 것 (안전한 방법으로: 1Password 공유, 암호 걸린 zip + 다른 채널로 암호 — **메신저에 `.p8`을 그대로 붙이지 않는다**)
| 값 | 받는 곳 |
|---|---|
| 팀 ID | 서버 `.env` `APPLE_TEAM_ID` · 친구 빌드의 `SPROUT_APPLE_TEAM_ID` · (데스크톱도 친구 팀으로 서명하면) packaging.md §4-2의 4곳 |
| Services ID(④) | 서버 `.env` `APPLE_SERVICES_ID` |
| SIWA Key ID(⑤) | 서버 `.env` `APPLE_KEY_ID` |
| `AuthKey_<KEYID>.p8`(⑤) | Mac mini `~/.config/sprout/`(권한 600) → `.env` `APPLE_PRIVATE_KEY=<그 경로>`. **git·iCloud에 넣지 않는다** |
| (나중) APNs 키 | Firebase 콘솔에 친구가 직접 올리거나, 사용자가 Firebase에서 친구를 멤버로 초대 |
| App Store Connect 앱의 Apple ID(숫자) | (선택) Google iOS OAuth 클라이언트의 "App Store ID" 칸 |

사용자/리드는 받은 값을 넣고 `docker compose up -d api`를 실행한 다음 `curl -s https://macmini.tail425c97.ts.net/auth/providers`에서 `apple`이 `null`이 아닌지 확인한다.

### 8.4 App Store Connect
1. 나의 앱 › `+` › 새로운 앱: 플랫폼 iOS, 이름(정식 제품명, 체크리스트 D1), 기본 언어 한국어, 번들 ID `app.sprout.mobile`, SKU 예: `sprout-ios`, 사용자 액세스 전체
2. **앱 개인정보(App Privacy)**: [store/privacy-answers.md](store/privacy-answers.md) §1을 그대로 입력한다. "추적 안 함", 수집하는 것은 이메일·사용자 ID·사용자 콘텐츠 등이고 모두 "앱 기능" 목적이며 사용자와 연결된다. 개인정보 처리방침 URL은 §7.
3. 연령 등급·카테고리·설명·키워드: [store/listing.md](store/listing.md)
4. **스크린샷**: [store/screenshots.md](store/screenshots.md). 6.9"(1320×2868 등)는 필수다. **`app.json`이 `supportsTablet: true`라 iPad 13" 스크린샷도 필수**다. iPad를 안 낼 거면 첫 업로드 전에 `supportsTablet: false`로 바꾼다(사용자와 정함).
5. 수출 규정: `ITSAppUsesNonExemptEncryption: false`가 이미 들어가 있다(HTTPS만 씀)
6. 가격: 무료. 판매 지역: 사용자 결정(D6)
7. 빌드 업로드(§3) → TestFlight 내부 테스트로 먼저 확인 → 심사 제출

### 8.5 심사 메모(App Review Information)에 적을 것
- **데모 계정**: 사용자가 만든 심사 전용 이메일·비밀번호 계정(샘플 할 일·일정·캐릭터가 들어 있는 계정. 실제 개인 이메일이 아닌 것). 친구는 사용자에게 받는다.
- 메모 예시(영문):
  > Sign in with the demo account above (email + password). Sign in with Apple and Google are also available on the login screen. AI features (assistant, auto-sorting, weekly report) run on the developer's own server and may take a few seconds or be briefly unavailable; all other features work offline. Account deletion: More › Settings › tap the account card › Delete Account (type "삭제" to confirm). Deleting an account that uses Sign in with Apple also revokes the Apple token.
- 심사 기간에는 §5.2의 서버 가동 조건을 꼭 지킨다.

### 8.6 iOS 푸시 (v1 범위 밖, 메모만)
v1 iOS는 **로컬 알림만** 쓴다(할 일 알림은 휴대폰이 직접 울림). 나중에 서버 푸시를 켜려면 다음이 필요하다. ① App ID에 Push Notifications ② APNs 키를 Firebase에 등록(§8.2-⑥) ③ Firebase iOS 앱 등록 → `GoogleService-Info.plist`(git 밖) ④ 앱에 iOS FCM 연결 코드와 `aps-environment` 권한, `extra.pushIos: true`(지금 `app.config.ts`에서 `false`로 고정) ⑤ 서버 `PUSH_IOS=1` ⑥ 앱 개인정보 라벨에 "기기 ID"를 추가한다(privacy-answers B6). 아직 코드 작업이 남아 있다.

### 8.7 친구 팀으로 바뀔 때 Google iOS 로그인
- 지금 GCP 프로젝트 `sprout-510614`의 **iOS OAuth 클라이언트**는 번들 ID `app.sprout.mobile`, 팀 ID `BU697KN34B`로 만들어져 있다.
- 구글의 iOS 클라이언트에서 **꼭 맞아야 하는 것은 번들 ID**다. 팀 ID 칸은 선택 항목이고, App Check 같은 기능에서만 쓰인다. 그래서:
  - **번들 ID가 그대로(`app.sprout.mobile`)면 새 클라이언트는 필요 없다.** 사용자가 Google Cloud 콘솔 › API 및 서비스 › 사용자 인증 정보 › 그 iOS 클라이언트에서 팀 ID를 친구 팀으로 고치거나 비운다. 클라이언트 id는 그대로라 `.env.local`도 그대로다.
  - **번들 ID를 바꿨다면**(§4 충돌) iOS 클라이언트를 **새 번들 ID로 새로 만들고**, 새 `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`를 친구에게 준다. 서버 `GOOGLE_CLIENT_IDS`는 **웹 클라이언트 id만 aud로 받으므로 바꿀 필요가 없다**(모바일 토큰의 aud = 웹 클라이언트).
- 확인: 친구 빌드에서 "Google로 계속하기" → 계정 고르기 → 로그인이 되면 끝.

---

## 9. 사용자 → 친구에게 줄 것
| 값 | 넣는 곳 |
|---|---|
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`(웹 애플리케이션 클라이언트 id) | 친구의 `apps/mobile/.env.local` |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`(iOS 클라이언트 id) | 같음 |
| 심사용 데모 계정(이메일·비밀번호) | App Store Connect 심사 정보 |
| 정식 제품명, 처리방침·지원 URL(§7) | App Store Connect |
| (선택) 저장소 접근: 공개 전이라면 GitHub collaborator 초대 | — |

---

## 10. Android — 사용자가 할 일 (Google Play)
### 10.1 Play Console
1. 앱 만들기: 앱 이름, 기본 언어 한국어, 앱/무료, 정책 동의
2. **앱 콘텐츠**:
   - 개인정보처리방침 URL: §7
   - **앱 액세스**: "일부 기능 제한(로그인 필요)" → 데모 계정·설명
   - 광고: 없음
   - **데이터 보안**: [store/privacy-answers.md](store/privacy-answers.md) §2. **계정 삭제 URL** = `https://<railway-domain>/account-deletion`. 앱 안 삭제 경로도 적는다(더보기 › 설정 › 계정 › 계정 삭제)
   - 콘텐츠 등급(IARC 설문): listing.md §3
   - 타깃층: 만 13세 이상 등(사용자 결정)
   - **정확한 알람 권한 선언**: 앱이 `SCHEDULE_EXACT_ALARM`(Android 12+ "알람 및 리마인더")을 쓴다(`modules/sprout-alarms`). 앱 콘텐츠 › "정확한 알람" 선언에서 **"사용자가 정한 시각의 할 일 알림(캘린더·리마인더 앱)"** 을 핵심 기능으로 고른다. `USE_EXACT_ALARM`은 쓰지 않는다(32 §17.6). 허용이 없으면 서버 푸시가 대신 울린다
   - 금융·건강 등: 해당 없음
3. 스토어 등록정보: listing.md, 스크린샷 screenshots.md(휴대폰 2~8장, 그래픽 이미지 1024×500, 아이콘 512)

### 10.2 업로드 키와 Play 앱 서명
```bash
keytool -genkeypair -v -keystore ~/.config/sprout/sprout-upload.jks -alias sprout-upload -keyalg RSA -keysize 2048 -validity 10000
chmod 600 ~/.config/sprout/sprout-upload.jks     # git·iCloud 밖. 암호와 함께 두 곳 이상에 따로 백업
keytool -list -v -keystore ~/.config/sprout/sprout-upload.jks -alias sprout-upload | grep SHA1
```
- Play 앱 서명(기본 켜짐): 구글이 **앱 서명 키**를 갖고, 나는 **업로드 키**로 서명해서 올린다.
- **Google 로그인을 위해 SHA-1을 두 개 등록한다**: Play Console › 설정 › 앱 무결성 › 앱 서명에서 **앱 서명 키 SHA-1**과 **업로드 키 SHA-1**을 복사한다. Google Cloud 콘솔(`sprout-510614`) › 사용자 인증 정보 › **Android OAuth 클라이언트**(패키지 `app.sprout.mobile`)에 넣는다. 클라이언트 하나에 SHA-1 하나만 들어가면 Android 클라이언트를 SHA-1마다 하나씩 만든다. 개발용 debug 키 SHA-1 클라이언트는 남겨 둬도 된다.
  - 빠뜨리면 스토어에서 받은 앱에서 Google 로그인이 `DEVELOPER_ERROR`(앱 문구 "구글 로그인 설정이 아직 없어요")로 실패한다.
- Firebase(푸시): Firebase 콘솔 › Android 앱 `app.sprout.mobile` › 같은 SHA-1 두 개를 넣고 `google-services.json`을 내려받는다 → `~/.config/sprout/google-services.json`(빌드가 자동으로 찾음, `app.config.ts`).

### 10.3 출시 빌드(로컬)
```bash
. scripts/node22.sh && cd apps/mobile
ANDROID_HOME=~/Library/Android/sdk JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home npx expo prebuild --platform android --clean
```
그다음 `android/app/build.gradle`의 `signingConfigs`에 release를 더하고 `buildTypes.release.signingConfig signingConfigs.release`로 바꾼다. **Expo 기본 템플릿은 release도 debug 키로 서명하므로 이 단계를 꼭 해야 한다.** `prebuild --clean`을 다시 돌리면 지워지니 매번 다시 하거나, 나중에 작은 설정 플러그인으로 만든다(할 일).
```gradle
// android/app/build.gradle — signingConfigs { … } 안
release {
    storeFile file(System.getenv("SPROUT_UPLOAD_STORE") ?: "/Users/<나>/.config/sprout/sprout-upload.jks")
    storePassword System.getenv("SPROUT_UPLOAD_STORE_PASSWORD")
    keyAlias "sprout-upload"
    keyPassword System.getenv("SPROUT_UPLOAD_KEY_PASSWORD")
}
```
```bash
cd android && SPROUT_UPLOAD_STORE_PASSWORD=… SPROUT_UPLOAD_KEY_PASSWORD=… ./gradlew bundleRelease
# 결과: android/app/build/outputs/bundle/release/app-release.aab → Play Console 업로드
```
- 버전: `app.json` `expo.version`, `android.versionCode`(올릴 때마다 +1, 없으면 1로 시작)
- 출시 빌드에서 `SYSTEM_ALERT_WINDOW`·외부 저장소 권한이 빠졌는지 `aapt dump permissions`로 확인한다(privacy-answers B7)

### 10.4 비공개 테스트 의무 (개인 개발자 계정)
2023-11 이후 만든 **개인** 계정은 프로덕션 출시 전에 **비공개 테스트에 테스터 12명 이상이 14일 연속으로 참여**해야 한다(2026-10 기준 숫자, 신청 직전 확인). 순서: 테스트 › 비공개 테스트 트랙 → 테스터 이메일 목록(Google 그룹 가능) → 링크로 참여·설치 → 14일 → 프로덕션 액세스 신청(설문). **이 14일이 출시 일정에서 가장 오래 걸리니 가장 먼저 시작한다.**

---

## 11. 데스크톱 — 사용자
### 11.1 macOS (Developer ID 직접 배포, dmg)
- **Developer ID Application 인증서는 Apple Developer Program 유료 팀에서만** 나온다. 둘 중 하나를 고른다.
  - (가) **친구 팀**으로 서명: 친구가 Developer ID Application 인증서를 만들어 `.p12`(암호 포함)로 보내 주고, 공증용 App Store Connect API 키(.p8 + Key ID + Issuer ID)도 준다. 앱의 "개발자"가 친구 이름으로 보인다. 팀 ID가 바뀌므로 packaging.md §4-2의 4곳(위젯 App Group `BU697KN34B.app.sprout.desktop` 등)을 친구 팀 ID로 바꾼다.
  - (나) **사용자가 자기 팀을 가입**(연 $99): iOS와 상관없이 데스크톱만 사용자 이름으로 낸다. 팀 ID 4곳은 사용자 유료 팀 ID로 바꾼다.
  - 어느 쪽이든 **첫 배포 뒤에는 팀 ID를 바꾸기 어렵다**(위젯 App Group·키체인 데이터가 팀에 묶임).
- 빌드·공증: [packaging.md](packaging.md) §3 (`CSC_NAME`, `APPLE_API_KEY`… → `npm run dist:mac:release`, `spctl`·`stapler` 확인). **아직 Developer ID로 한 번도 서명·공증해 보지 않았다.** PowerSync dylib 로드가 실패하면 `disable-library-validation`을 검토한다.
- 데스크톱 애플 로그인은 서버의 Services ID(§8.2-④)만 있으면 된다. 앱 서명 팀과는 상관없다.
- 배포처: Railway 소개 사이트의 다운로드 링크. 자동 업데이트는 저장소가 공개되면 GitHub Releases + `electron-updater`를 쓸 수 있다(할 일).

### 11.2 Windows
체크리스트 §3의 표를 따른다. **권장: Microsoft Store(MSIX) — 개인 개발자 계정이 무료고 스토어가 서명해 준다.** 웹 설치 파일은 Azure Trusted Signing(월 약 $10, 한국 개인 가능 여부 확인 필요)을 쓰거나, 서명 없이 SmartScreen 안내를 띄운다. Windows 패키징 설정(`win` NSIS/MSIX 대상, PowerSync `.dll` 포함)은 아직 없다(할 일). Windows PC나 VM에서 시험해야 한다.

---

## 12. Google OAuth 동의 화면과 `ts.net` 도메인
- 지금 쓰는 범위: 로그인은 `openid email profile`(민감하지 않음), 캘린더 연동(16)은 `calendar.readonly`(**민감 범위**).
- **게시 상태를 "프로덕션"으로 바꾸면** 민감 범위가 있을 때 구글 **앱 확인(verification)** 이 필요하다. 이 확인에는 **내가 소유를 증명한 도메인**(승인된 도메인, Search Console 확인)과 그 도메인의 홈페이지·처리방침이 필요하다. `macmini.tail425c97.ts.net`은 Tailscale의 하위 도메인이라 **확인이 안 될 수 있다**(확인 필요).
- 선택지:
  1. **테스트 상태로 둔다**: 테스트 사용자를 직접 등록(최대 100명)한 사람만 구글 로그인·캘린더를 쓸 수 있고, 리프레시 토큰이 7일마다 끝나 다시 연결해야 한다. 공개 출시용으로는 맞지 않는다.
  2. **로그인만 프로덕션으로 하고 캘린더 범위는 빼서 낸다**: 비민감 범위만 쓰면 확인 없이 게시할 수 있다(이름·로고를 보이려면 브랜드 확인이 따로 필요). 캘린더 연동은 v1에서 숨기거나 "테스트 사용자만"으로 둔다.
  3. **Railway 사이트 도메인으로 확인을 시도한다**: `*.up.railway.app`이 공개 접미사 목록(PSL)에 있다면 하위 도메인 단위로 Search Console HTML 파일 확인이 될 수도 있다(**확인 필요**). 승인된 도메인에 그 도메인을 넣고 홈·처리방침을 그 사이트로 가리킨다.
  4. **도메인을 산다**(연 1~2만 원): 가장 확실하다. 소개 사이트·처리방침·(나중에) API 주소를 한 도메인으로 모은다.
- 권장: 지금은 **2번**(로그인만 프로덕션, 캘린더는 테스트 사용자)으로 출시하고, 도메인을 사면 4번으로 옮긴다. 사용자가 결정한다.

---

## 13. 애플 로그인 — 이번에 구현된 것 (2026-10-05)
- **iOS 앱**(`apps/mobile/src/data/apple.ts`, `AuthScreen.tsx`, 설정 › 계정): `expo-apple-authentication` 시스템 창 → `POST /auth/apple/native {id_token, nonce, authorization_code}`. nonce는 앱이 만든 무작위 값이고 애플에는 SHA-256만 보낸다. `SPROUT_APPLE_SIGN_IN=1` 빌드에서만 진짜 버튼이 되고, 아니면 "준비 중"이다. 설정 › 계정에서 연결·해제와, 애플로만 가입한 계정의 "Apple로 방금 다시 로그인" → 삭제가 된다.
- **서버**(`server/api/src/social.ts`·`server.ts`·`account.ts`): 기기 토큰 검증(aud = `APPLE_BUNDLE_IDS`, 웹 Services ID 토큰과 섞이지 않음), `POST /auth/link/apple/native`, `.p8`이 있으면 인가 코드 교환으로 사용자 확인 + refresh_token 보관(서버 전용 칸), **계정 삭제·애플 연결 해제 때 `appleid.apple.com/auth/revoke`로 폐기**(최선 노력 — 실패해도 삭제는 끝남). 시험: `npm run test:api`.
- 명세: [08 §3.1·§7.1](../screens/08-login.md), [20 §4.3.1](../screens/20-mobile-overview.md). 문서: legal 계정 삭제·처리방침에 애플 토큰 문구를 반영했다.
- **남은 것**: 친구 팀 값과 키를 서버에 넣고(§8.3), 마이그레이션 `20261011`을 적용하고(§5.5), 실제 기기 TestFlight에서 확인(애플 가입 → 로그아웃 → 다시 로그인 → 설정에서 삭제 → iPhone 설정 › Apple ID › Apple로 로그인 목록에서 sprout가 사라지는지).

---

## 14. 전체 체크리스트 (담당)
| # | 할 일 | 담당 | 막는 것 |
|---|---|---|---|
| 1 | 공개 전 정리(§1: build 폴더 빼기, 개인 경로 판단) 후 저장소 공개 전환·푸시 | 리드(사용자 승인) | 친구 시작 |
| 2 | 정식 제품명·운영자 이름·연락 메일 정하기 → legal 문서 자리 채우기 | 사용자 | 스토어 등록·처리방침 |
| 3 | Railway 소개 사이트 + `/privacy` `/terms` `/account-deletion` `/support` 배포, 도메인을 이 문서·스토어에 채우기 | 다른 작업자 → 리드 | 스토어 제출 |
| 4 | Mac mini 가동 조건(§5.2) 설정, 바깥 `/health` 감시 | 사용자 | 심사 |
| 5 | 서버 배포: 백업 → 마이그레이션 3개 → api 다시 빌드(§5.5) | 리드 | 새 앱, 애플 로그인 |
| 6 | 외부 백업(R2 + rclone + 암호화) | 사용자/리드 | 공개 사용자 데이터(필수) |
| 7 | 이메일 인증·비밀번호 재설정(메일 발송 수단) — 계정 선점 위험 | 사용자 결정 → 개발 | 체크리스트 차단 3·5 |
| 8 | 친구: 팀 ID 알리기, App Group·App ID 2개·Services ID·SIWA 키 만들기(§8.2) | 친구 | 애플 로그인 |
| 9 | 친구 → 사용자: 팀 ID·Services ID·Key ID·`.p8` 전달(§8.3) → 서버 `.env`에 넣고 api 재시작 | 친구 → 사용자/리드 | 애플 로그인 |
| 10 | Google iOS OAuth 클라이언트의 팀 ID 고치기(번들 ID 같으면) 또는 새 클라이언트(§8.7) | 사용자 | 구글 로그인(iOS) |
| 11 | 사용자 → 친구: 구글 클라이언트 id 2개, 데모 계정(§9) | 사용자 | 빌드·심사 |
| 12 | 친구: `SPROUT_APPLE_TEAM_ID=… SPROUT_APPLE_SIGN_IN=1` 빌드 → TestFlight → 애플·구글·이메일 로그인, 공유 확장, 계정 삭제 확인 | 친구 | 제출 |
| 13 | iPad 지원 여부(`supportsTablet`) 정하기 → 스크린샷 | 사용자 | 제출 |
| 14 | App Store Connect 앱 기록·개인정보 답변·스크린샷·심사 메모 → 제출 | 친구 | 출시 |
| 15 | Play: 앱 만들기, 업로드 키, SHA-1 두 개를 Android OAuth 클라이언트·Firebase에, `google-services.json` | 사용자 | Android 구글 로그인·푸시 |
| 16 | Play: 데이터 보안·계정 삭제 URL·정확한 알람 선언·콘텐츠 등급 | 사용자 | 제출 |
| 17 | Play: **비공개 테스트 12명 × 14일**(가장 먼저 시작) | 사용자 | 프로덕션 |
| 18 | 출시 빌드 서명 설정(build.gradle) + `bundleRelease` | 사용자 | 업로드 |
| 19 | Google OAuth 동의 화면 게시 방식 결정(§12) | 사용자 | 구글 로그인 공개 |
| 20 | 맥: 서명할 팀 고르기(친구 팀 / 사용자 팀), 팀 ID 4곳, 첫 서명·공증 | 사용자(+친구) | 데스크톱 배포 |
| 21 | Windows: 스토어(MSIX) 또는 서명 방식 결정, 패키징 설정 | 사용자 → 개발 | Windows 배포 |
| 22 | 버전 1.0.0 통일, iOS buildNumber·Android versionCode | 리드 | 제출 |
| 23 | 서명 키·인증서(.p8·.p12·.jks)를 암호화해 git 밖 두 곳에 백업 | 사용자·친구 | 분실 대비 |
