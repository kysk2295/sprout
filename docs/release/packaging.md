# 데스크톱 패키징·서명·공증 (macOS)

sprout 데스크톱 앱(Electron + electron-vite)을 설치 가능한 `.app` / `.dmg` / `.zip`으로 만드는 방법이다. 2026-10-04에 처음 구성했고, 패키지 앱으로 가입·로그인·동기화(올리기·내려받기)·메뉴바 미니 창·종료까지 확인했다.

## 1. 한눈에

| 명령 (저장소 루트 또는 `apps/desktop`) | 결과 |
|---|---|
| `npm run dist:mac` | 로컬 확인용. 키체인에 **Apple Development 인증서가 있으면 그걸로 서명**(맥 위젯 App Group 때문 — §4), 없으면 ad-hoc(`SPROUT_ADHOC=1`로 강제). 하드닝 런타임 끔, 공증 안 함. 이 Mac에서만 바로 열린다 |
| `npm run widget:build` | 맥 위젯 확장(`SproutWidget.appex`)과 새로 고침 모듈(`widget_bridge.node`)을 빌드·서명해 `apps/desktop/build/widget/`에 둔다. **`dist:mac` 전에** 돌린다(안 하면 위젯 없이 패키징) |
| `npm run dist:mac:release` | 배포용. Developer ID 인증서가 있으면 그걸로 서명하고 하드닝 런타임을 켠다. 공증 환경 변수가 있으면 공증·스테이플까지 한다. 인증서가 없으면 경고하고 ad-hoc으로 만든다(배포 금지) |

**반드시 Node 22로 실행한다**(시스템 Node 26은 Electron 압축 풀기가 조용히 실패한다 — CLAUDE.md 참고).

```bash
. scripts/node22.sh
npm run dist:mac            # 또는 npm run dist:mac:release
```

산출물: `apps/desktop/release/` (`.gitignore`에 등록됨)

| 파일 | 크기(2026-10-04, arm64) |
|---|---|
| `release/mac-arm64/Kkumteul.app` | 약 221MB |
| `release/Kkumteul-0.0.1-arm64.dmg` | 약 100MB |
| `release/Kkumteul-0.0.1-arm64.zip` | 약 100MB (자동 업데이트 도입 때 씀) |
| `*.blockmap` | 차등 업데이트용 |

## 2. 구성 파일

| 파일 | 내용 |
|---|---|
| `apps/desktop/electron-builder.yml` | 패키징 설정 전부. **번들 ID `app.sprout.desktop`는 여기 한 곳에만** 있다 |
| `apps/desktop/build/icon.svg` → `icon.icns`, `icon.png`, `icon.ico` | 앱 아이콘 — 로고 B(달력 새싹, 2026-10-05 적용). 다시 만들기: `node scripts/brand/build-icons.mjs b` 후 `docs/release/brand/out/b/APPLY.md`대로 복사 |
| `apps/desktop/build/entitlements.mac.plist` | 메인 앱 entitlements (`allow-jit` + 위젯용 App Group `BU697KN34B.app.sprout.desktop`) |
| `apps/desktop/build/entitlements.mac.inherit.plist` | 도우미 프로세스용 (`allow-jit`) |
| `apps/desktop/build/after-pack.cjs` | 서명 전 훅. 위젯 확장(.appex)을 `Contents/PlugIns/`에, `widget_bridge.node`를 `Contents/Resources/`에 복사. `CSC_NAME`이 있으면 확장을 그 ID로 다시 서명 |
| `apps/desktop/build/dist-mac-local.mjs` | `dist:mac`이 부르는 스크립트. Apple Development 인증서를 찾아 서명 ID로 넘긴다 |
| `apps/desktop/native/widget/` | 위젯 Xcode 프로젝트·Swift 소스·`build.sh` (docs/screens/25-mac-widget.md §14) |
| `apps/desktop/build/dist-mac-release.mjs` | `dist:mac:release`가 부르는 스크립트. 인증서·공증 환경 변수를 보고 옵션을 정한다 |

주요 설정과 이유:
- **`asar: false`** — `@powersync/node`의 기본 워커가 PowerSync 확장(`libpowersync_aarch64.macos.dylib`)을 `import.meta.url` 기준 경로로 sqlite `loadExtension`(dlopen)에 넘긴다. asar를 켜면 이 경로가 `app.asar/…` 안을 가리켜 **실제로 로드에 실패**한다(`asarUnpack`을 해도 경로는 그대로 `app.asar`라 실패 — 2026-10-04 직접 확인, 창이 뜨지 않음). 그래서 asar를 껐다. 다시 켜려면 §6-1 참고.
- **`npmRebuild: false`** — better-sqlite3 13은 Node-API 프리빌드(`prebuilds/darwin-arm64.node`)라 Electron용 재빌드가 필요 없다. 개발용 Node 22 시험도 같은 바이너리를 쓴다.
- **`dependencies`는 실행에 필요한 것만** — `@powersync/node`, `better-sqlite3` 두 개. React·xyflow·`@sprout/*` 등은 electron-vite가 번들에 넣으므로 `devDependencies`로 옮겼다(앱 안 `node_modules`가 13MB로 줄어듦). **메인 프로세스에서 새 npm 패키지를 `import`하면 `dependencies`에 넣어야 한다**(electron-vite가 dependencies만 외부로 빼고, electron-builder는 dependencies만 복사).
- **Electron 버전 고정**(`"electron": "37.10.3"`) — electron-builder는 범위(`^`)로는 버전을 못 정한다. 올릴 때 숫자를 직접 바꾼다.
- **이름 두 갈래(2026-10-05)** — `productName: Kkumteul`은 파일 이름(Kkumteul.app·Kkumteul Helper·Kkumteul.exe·Kkumteul-*.dmg), 화면 이름 **꿈틀**은 `CFBundleDisplayName`·ko/en.lproj `InfoPlist.strings`(after-pack.cjs)·`dmg.title`·`nsis.shortcutName`·`src/main/brand.ts`(창 제목·메뉴·정보 창·트레이). 한글 productName이나 Info.plist `CFBundleName=꿈틀`로 패키징하면 시작 직후 SIGTRAP(133)으로 죽는다 — 직접 확인.
- **`extraMetadata.productName: sprout`** — 패키지 앱의 `app.getName()`이 `sprout`로 남아 데이터 폴더는 `~/Library/Application Support/sprout`, 키체인 `sprout Safe Storage`도 그대로(바꾸면 로그아웃). `src/main/profile.ts`가 폴더를 한 번 더 고정한다. 개발 실행(`npm run dev`)은 `@sprout/desktop` 폴더를 그대로 써서 둘이 섞이지 않는다. `SPROUT_PROFILE=이름`이면 둘 다 `sprout-이름` 폴더.
- **트레이 아이콘** `resources/trayTemplate*.png` → `Contents/Resources/`(`src/main/mini.ts`가 `process.resourcesPath`에서 읽음).
- **URL 스킴 `sprout://`** — Info.plist `CFBundleURLTypes`에 등록. 메인 프로세스가 `task/<id>`·`today`·`growth`·`quick-add`를 처리한다(`src/main/index.ts`).
- `electronLanguages: [ko, en]` — 안 쓰는 Electron 언어 파일을 빼서 크기를 줄임.
- 대상: arm64 `dmg` + `zip`, 최소 macOS 12. 인텔·유니버설이 필요하면 `mac.target[].arch`에 `x64`/`universal`을 추가(PowerSync x64 dylib·better-sqlite3 x64 프리빌드는 이미 들어 있음).

패키지 앱 동작(코드 기준, 2026-10-04 확인):
- 서버 기본값 = Mac mini 공개 주소(`https://macmini.tail425c97.ts.net`, PowerSync `:8443`) — `src/main/sync.ts`. 바꾸려면 `SPROUT_API_URL`·`SPROUT_SYNC_URL`.
- 예시(데모) 데이터를 넣지 않는다 — 패키지 앱은 `SPROUT_SEED=1`일 때만. 첫 실행엔 `기본함` 하나만 생긴다.

## 3. 서명·공증 (배포용)

### 3-1. 사용자가 Apple Developer 포털에서 할 일 (한 번만)
1. **Apple Developer Program** 가입(유료, 연 99달러). 지금 키체인에 있는 `Apple Development: …` 인증서는 개발용이라 배포 서명에 못 쓴다.
2. **Developer ID Application 인증서** 만들기: developer.apple.com → Certificates → `+` → *Developer ID Application* → Xcode 또는 CSR로 발급 → 이 Mac 키체인에 설치. (계정 소유자 권한 필요)
   - 확인: `security find-identity -v -p codesigning` 에 `Developer ID Application: 이름 (TEAMID)`가 보여야 한다.
3. **공증용 자격** 중 하나:
   - (권장) **App Store Connect API 키**: App Store Connect → 사용자 및 액세스 → 통합 → 키 생성(역할 Developer 이상) → `.p8` 파일 내려받기(한 번만 받을 수 있음), Key ID·Issuer ID 기록.
   - 또는 **앱 전용 암호**: appleid.apple.com → 로그인 및 보안 → 앱 전용 암호 생성 + 팀 ID.
4. (위젯을 넣을 때) **App Group**: 팀 ID 접두 형식(`TEAMID.app.sprout.desktop`)을 쓰면 Developer ID 배포에서 별도 등록·프로비저닝 프로파일 없이 쓸 수 있다. `group.` 형식을 쓰려면 포털에 App Group과 App ID를 등록하고 프로파일을 받아야 한다.

### 3-2. 빌드
```bash
. scripts/node22.sh
# 서명 ID — 키체인에 Developer ID가 하나뿐이면 생략 가능(자동 탐색)
export CSC_NAME="Developer ID Application: 이름 (TEAMID)"
# 공증 — 아래 셋 중 하나
export APPLE_API_KEY=~/keys/AuthKey_XXXXXX.p8 APPLE_API_KEY_ID=XXXXXX APPLE_API_ISSUER=xxxxxxxx-xxxx-…
# export APPLE_ID=me@example.com APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx APPLE_TEAM_ID=TEAMID
# export APPLE_KEYCHAIN_PROFILE=sprout-notary   # xcrun notarytool store-credentials로 저장한 경우
npm run dist:mac:release
```
- 공증 환경 변수가 없으면 서명만 하고 공증은 건너뛴다(다른 Mac에서 "확인되지 않은 개발자" 경고).
- CI에서는 `CSC_LINK`(.p12 경로·base64) + `CSC_KEY_PASSWORD`로 인증서를 넘길 수 있다.
- 확인:
  ```bash
  codesign --verify --deep --strict --verbose=2 apps/desktop/release/mac-arm64/Kkumteul.app
  spctl -a -vvv -t exec apps/desktop/release/mac-arm64/Kkumteul.app   # "Notarized Developer ID"가 나와야 함
  xcrun stapler validate apps/desktop/release/Kkumteul-0.0.1-arm64.dmg
  ```

### 3-3. entitlements
- `com.apple.security.cs.allow-jit`: Electron(V8) JIT — 하드닝 런타임에서 필수.
- `allow-unsigned-executable-memory`, `disable-library-validation`은 **넣지 않았다**. 네이티브 모듈(better-sqlite3 `.node`, PowerSync `.dylib`)은 electron-builder가 앱과 같은 팀 ID로 다시 서명하므로 라이브러리 검증을 통과해야 한다. **Developer ID 서명 빌드로 아직 실행해 보지 않았다**(인증서 없음) — 첫 공증 빌드에서 PowerSync 확장 로드가 실패하면 `disable-library-validation`을 추가한다.
- 앱 샌드박스는 쓰지 않는다(Developer ID 배포엔 필요 없음. 위젯 확장 자체는 샌드박스 필수 — 확장 쪽 entitlements에 넣는다).

## 4. 맥 위젯(WidgetKit) — docs/screens/25-mac-widget.md
### 4-1. 빌드·서명 순서 (안쪽 → 바깥)
```bash
. scripts/node22.sh
npm run widget:build   # ① native/widget/build.sh
npm run dist:mac       # ② electron-vite build → electron-builder(afterPack가 위젯을 넣음) → 앱 전체 서명
```
1. `build.sh`: `xcodebuild`(Release, arm64 — 앱과 같은 아키텍처, Xcode 서명 끔) → `swiftc`로 `widget_bridge.node` → **`widget_bridge.node`와 `SproutWidget.appex`를 먼저 서명**(위젯은 `SproutWidget.entitlements`: 샌드박스 + App Group, 하드닝 런타임) → `apps/desktop/build/widget/`로 복사(git 무시).
   - 서명 ID: `SPROUT_SIGN_ID` → 키체인의 첫 Apple Development → Developer ID → ad-hoc 순.
   - 팀 ID: `SPROUT_TEAM_ID`(기본 `BU697KN34B`).
2. electron-builder `afterPack`(`build/after-pack.cjs`): `.appex`를 `Contents/PlugIns/`, `widget_bridge.node`를 `Contents/Resources/`에 복사. `CSC_NAME`(배포 서명 ID)이 있으면 위젯을 그 ID로 다시 서명.
3. electron-builder 서명: `mac.signIgnore`로 PlugIns/*.appex는 건너뛰고(위젯 entitlements가 앱 것으로 덮이지 않게, `--deep` 금지와 같은 이유), `widget_bridge.node` 등 나머지 바이너리 → 앱 본체 순으로 서명하며 위젯을 봉인한다.
4. 확인:
   ```bash
   APP=apps/desktop/release/mac-arm64/Kkumteul.app
   codesign --verify --deep --strict --verbose=2 $APP
   codesign -d --entitlements - $APP | grep -A3 application-groups          # BU697KN34B.app.sprout.desktop
   codesign -dvv $APP/Contents/PlugIns/SproutWidget.appex 2>&1 | grep Team    # TeamIdentifier=BU697KN34B
   pluginkit -m -p com.apple.widgetkit-extension | grep sprout               # 앱을 한 번 연 뒤
   ```

### 4-2. 팀 ID · App Group
- App Group 이름은 **팀 ID + 번들 ID = `BU697KN34B.app.sprout.desktop`**. 팀 ID는 인증서의 **OU**다(`security find-certificate -c "Apple Development" -p | openssl x509 -noout -subject`). 인증서 이름 괄호 안 값(`Z32F3Z65RD`)은 팀 ID가 아니다.
- 지금은 무료 개인 팀(Personal Team) 개발 인증서. 팀 ID 접두 App Group은 프로비저닝 프로파일 없이 동작한다.
- **Developer ID(유료 팀)로 바꿀 때 팀 ID가 달라지면** 네 곳을 함께 바꾼다: `build/entitlements.mac.plist`, `native/widget/SproutWidget/SproutWidget.entitlements`, `native/widget/SproutWidget/Snapshot.swift`(`Store.groupID`), `src/main/widget.ts`(`WIDGET_TEAM_ID`) + `SPROUT_TEAM_ID`. 출시 뒤에는 바꾸지 않는다(기존 사용자 위젯이 빈다).
- 배포 빌드(`dist:mac:release`)는 `CSC_NAME`이 있으면 afterPack이 위젯도 Developer ID로 다시 서명한다(타임스탬프 포함). 공증은 앱 전체로 한 번.
- ad-hoc으로 만든 앱은 App Group이 검증되지 않아 macOS 15+에서 확인 창이 뜨거나 위젯이 데이터를 못 읽는다 — 위젯 확인은 서명한 빌드로만.

### 4-3. 실행 조건
- 위젯 연동(`src/main/widget.ts`)은 **패키지 앱 + 기본 프로필**에서만 켜진다. `SPROUT_PROFILE` 시험 앱·개발 실행은 꺼짐(저장 칸이 기기에 하나라 덮어쓰지 않게). 시험할 땐 `SPROUT_WIDGET=1`.
- 패키지 앱 첫 실행 때 "로그인할 때 열기"를 한 번 켠다(25 D4). 프로필 실행은 등록하지 않는다.
- 위젯 갤러리에 뜨려면 앱을 한 번 열어야 한다(`/Applications`에 두는 것을 권장).

## 5. 패키지 앱 시험 방법
```bash
# 개발용 데이터와 섞이지 않게 프로필을 나누고, 원격 디버깅 포트는 9229(개발 앱) 말고 다른 번호
SPROUT_PROFILE=e2e-pkg apps/desktop/release/mac-arm64/Kkumteul.app/Contents/MacOS/Kkumteul --remote-debugging-port=9291
CDP_PORT=9291 node scripts/devtools/cdp.mjs 'document.body.innerText.slice(0,200)'
```
2026-10-04 확인 결과: 로그인 화면 → 새 계정 가입 → 동기화 연결·할 일 추가 후 올리기 대기 0 → 다른 프로필로 같은 계정 로그인 시 그 할 일이 내려옴(기본함 중복 없음) → 데모 데이터 없음 → PowerSync 확장 `0.5.3` 로드 → 메뉴바 미니 창이 트레이 아이콘 아래에 열림 → 미니 창의 종료로 프로세스 전부 정상 종료.

## 6. 알려진 문제·남은 일
1. **asar 끔** — 소스가 `Resources/app/out/`에 그대로 보인다(asar여도 쉽게 풀 수 있어 보안 차이는 작음). 다시 켜려면 A1 스파이크처럼 커스텀 PowerSync 워커를 만들어 확장 경로의 `app.asar`를 `app.asar.unpacked`로 바꾸고(`PowerSyncDatabase`의 `database.openWorker` 옵션), `asarUnpack: ['node_modules/@powersync/node/**', 'node_modules/better-sqlite3/**']`를 둔다 — `spikes/a1-powersync-electron/src/main/worker.ts` 참고.
2. ~~`sprout://` 처리기 없음~~ — 해결: `src/main/index.ts`에 단일 인스턴스 잠금·`open-url`(whenReady 전 등록)·`second-instance` 처리, 25 위젯 링크 4종.
3. **Developer ID 서명·공증은 아직 실제로 돌려 보지 않음**(인증서 없음). ad-hoc 빌드만 확인.
4. **자동 업데이트 없음** — `electron-updater` + `zip`/`blockmap` + 배포 서버(GitHub Releases 등)는 다음 단계.
5. **앱 메뉴 이름** — 메뉴 막대 이름은 `꿈틀`(lproj CFBundleName), 앱 메뉴는 `src/main/index.ts` `setAppMenu`가 `꿈틀 정보·꿈틀 가리기·꿈틀 종료`로 만든다. `extraMetadata.productName`(sprout)은 바꾸지 않는다(데이터 폴더·키체인).
6. 사이트 내려받기용 서명 없는 설치 파일(맥 arm64·x64 dmg, Windows x64 NSIS)은 CI가 만든다 — [desktop-download.md](desktop-download.md). Linux는 없음.
