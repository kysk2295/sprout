# 데스크톱 패키징·서명·공증 (macOS)

sprout 데스크톱 앱(Electron + electron-vite)을 설치 가능한 `.app` / `.dmg` / `.zip`으로 만드는 방법이다. 2026-10-04에 처음 구성했고, 패키지 앱으로 가입·로그인·동기화(올리기·내려받기)·메뉴바 미니 창·종료까지 확인했다.

## 1. 한눈에

| 명령 (저장소 루트 또는 `apps/desktop`) | 결과 |
|---|---|
| `npm run dist:mac` | 로컬 확인용. **ad-hoc 서명**, 하드닝 런타임 끔, 공증 안 함. 이 Mac에서만 바로 열린다 |
| `npm run dist:mac:release` | 배포용. Developer ID 인증서가 있으면 그걸로 서명하고 하드닝 런타임을 켠다. 공증 환경 변수가 있으면 공증·스테이플까지 한다. 인증서가 없으면 경고하고 ad-hoc으로 만든다(배포 금지) |

**반드시 Node 22로 실행한다**(시스템 Node 26은 Electron 압축 풀기가 조용히 실패한다 — CLAUDE.md 참고).

```bash
. scripts/node22.sh
npm run dist:mac            # 또는 npm run dist:mac:release
```

산출물: `apps/desktop/release/` (`.gitignore`에 등록됨)

| 파일 | 크기(2026-10-04, arm64) |
|---|---|
| `release/mac-arm64/sprout.app` | 약 221MB |
| `release/sprout-0.0.1-arm64.dmg` | 약 100MB |
| `release/sprout-0.0.1-arm64.zip` | 약 100MB (자동 업데이트 도입 때 씀) |
| `*.blockmap` | 차등 업데이트용 |

## 2. 구성 파일

| 파일 | 내용 |
|---|---|
| `apps/desktop/electron-builder.yml` | 패키징 설정 전부. **번들 ID `app.sprout.desktop`는 여기 한 곳에만** 있다 |
| `apps/desktop/build/icon.svg` → `icon.icns`, `icon.png` | 임시 앱 아이콘(직접 만든 새싹 그림, 틱틱 자산 아님). 다시 만들기: `sh apps/desktop/build/make-icon.sh` (Chrome 헤드리스 + sips + iconutil) |
| `apps/desktop/build/entitlements.mac.plist` | 메인 앱 entitlements (`allow-jit`만. App Group은 주석으로 준비) |
| `apps/desktop/build/entitlements.mac.inherit.plist` | 도우미 프로세스용 (`allow-jit`) |
| `apps/desktop/build/after-pack.cjs` | 서명 전 훅. 위젯 확장(.appex)을 `Contents/PlugIns/`에 복사 |
| `apps/desktop/build/dist-mac-release.mjs` | `dist:mac:release`가 부르는 스크립트. 인증서·공증 환경 변수를 보고 옵션을 정한다 |

주요 설정과 이유:
- **`asar: false`** — `@powersync/node`의 기본 워커가 PowerSync 확장(`libpowersync_aarch64.macos.dylib`)을 `import.meta.url` 기준 경로로 sqlite `loadExtension`(dlopen)에 넘긴다. asar를 켜면 이 경로가 `app.asar/…` 안을 가리켜 **실제로 로드에 실패**한다(`asarUnpack`을 해도 경로는 그대로 `app.asar`라 실패 — 2026-10-04 직접 확인, 창이 뜨지 않음). 그래서 asar를 껐다. 다시 켜려면 §6-1 참고.
- **`npmRebuild: false`** — better-sqlite3 13은 Node-API 프리빌드(`prebuilds/darwin-arm64.node`)라 Electron용 재빌드가 필요 없다. 개발용 Node 22 시험도 같은 바이너리를 쓴다.
- **`dependencies`는 실행에 필요한 것만** — `@powersync/node`, `better-sqlite3` 두 개. React·xyflow·`@sprout/*` 등은 electron-vite가 번들에 넣으므로 `devDependencies`로 옮겼다(앱 안 `node_modules`가 13MB로 줄어듦). **메인 프로세스에서 새 npm 패키지를 `import`하면 `dependencies`에 넣어야 한다**(electron-vite가 dependencies만 외부로 빼고, electron-builder는 dependencies만 복사).
- **Electron 버전 고정**(`"electron": "37.10.3"`) — electron-builder는 범위(`^`)로는 버전을 못 정한다. 올릴 때 숫자를 직접 바꾼다.
- **`extraMetadata.productName: sprout`** — 패키지 앱의 `app.getName()`이 `sprout`가 되어 데이터 폴더는 `~/Library/Application Support/sprout`. 개발 실행(`npm run dev`)은 `@sprout/desktop` 폴더를 그대로 써서 둘이 섞이지 않는다. `SPROUT_PROFILE=이름`이면 둘 다 `sprout-이름` 폴더.
- **트레이 아이콘** `resources/trayTemplate*.png` → `Contents/Resources/`(`src/main/mini.ts`가 `process.resourcesPath`에서 읽음).
- **URL 스킴 `sprout://`** — Info.plist `CFBundleURLTypes`에 등록됨. 메인 프로세스 처리기는 아직 없다(§6-2).
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
  codesign --verify --deep --strict --verbose=2 apps/desktop/release/mac-arm64/sprout.app
  spctl -a -vvv -t exec apps/desktop/release/mac-arm64/sprout.app   # "Notarized Developer ID"가 나와야 함
  xcrun stapler validate apps/desktop/release/sprout-0.0.1-arm64.dmg
  ```

### 3-3. entitlements
- `com.apple.security.cs.allow-jit`: Electron(V8) JIT — 하드닝 런타임에서 필수.
- `allow-unsigned-executable-memory`, `disable-library-validation`은 **넣지 않았다**. 네이티브 모듈(better-sqlite3 `.node`, PowerSync `.dylib`)은 electron-builder가 앱과 같은 팀 ID로 다시 서명하므로 라이브러리 검증을 통과해야 한다. **Developer ID 서명 빌드로 아직 실행해 보지 않았다**(인증서 없음) — 첫 공증 빌드에서 PowerSync 확장 로드가 실패하면 `disable-library-validation`을 추가한다.
- 앱 샌드박스는 쓰지 않는다(Developer ID 배포엔 필요 없음. 위젯 확장 자체는 샌드박스 필수 — 확장 쪽 entitlements에 넣는다).

## 4. 위젯 확장(WidgetKit) 넣을 자리 — docs/screens/25-mac-widget.md
1. Xcode에서 위젯 확장을 빌드해 `.appex`를 만든다. 번들 ID는 `app.sprout.desktop.widget`처럼 **앱 ID를 접두로** 한다.
2. `apps/desktop/build/widget/Sprout Widget.appex`에 두거나 `SPROUT_WIDGET_APPEX=/경로/….appex`로 지정.
3. 확장용 entitlements(샌드박스 + App Group)를 만들고 `SPROUT_WIDGET_ENTITLEMENTS=/경로/widget.entitlements`.
4. `npm run dist:mac:release` → `after-pack.cjs`가 `Contents/PlugIns/`에 복사하고 `CSC_NAME`으로 확장을 먼저 서명 → electron-builder는 `mac.signIgnore`로 확장을 건너뛰고 앱 전체를 서명해 봉인한다.
5. `build/entitlements.mac.plist`의 App Group 주석을 풀고 `TEAMID`를 실제 값으로.
- 주의: 이 흐름은 아직 실제 `.appex`로 돌려 보지 않았다. 처음 붙일 때 `codesign -dvv --entitlements - …/PlugIns/*.appex`로 확장 entitlements가 유지됐는지 확인한다.

## 5. 패키지 앱 시험 방법
```bash
# 개발용 데이터와 섞이지 않게 프로필을 나누고, 원격 디버깅 포트는 9229(개발 앱) 말고 다른 번호
SPROUT_PROFILE=e2e-pkg apps/desktop/release/mac-arm64/sprout.app/Contents/MacOS/sprout --remote-debugging-port=9291
CDP_PORT=9291 node scripts/devtools/cdp.mjs 'document.body.innerText.slice(0,200)'
```
2026-10-04 확인 결과: 로그인 화면 → 새 계정 가입 → 동기화 연결·할 일 추가 후 올리기 대기 0 → 다른 프로필로 같은 계정 로그인 시 그 할 일이 내려옴(기본함 중복 없음) → 데모 데이터 없음 → PowerSync 확장 `0.5.3` 로드 → 메뉴바 미니 창이 트레이 아이콘 아래에 열림 → 미니 창의 종료로 프로세스 전부 정상 종료.

## 6. 알려진 문제·남은 일
1. **asar 끔** — 소스가 `Resources/app/out/`에 그대로 보인다(asar여도 쉽게 풀 수 있어 보안 차이는 작음). 다시 켜려면 A1 스파이크처럼 커스텀 PowerSync 워커를 만들어 확장 경로의 `app.asar`를 `app.asar.unpacked`로 바꾸고(`PowerSyncDatabase`의 `database.openWorker` 옵션), `asarUnpack: ['node_modules/@powersync/node/**', 'node_modules/better-sqlite3/**']`를 둔다 — `spikes/a1-powersync-electron/src/main/worker.ts` 참고.
2. **`sprout://` 처리기 없음** — Info.plist 등록만 했다. 메인 프로세스에 `app.setAsDefaultProtocolClient('sprout')`, `app.on('open-url', …)`(macOS), 단일 인스턴스 잠금(`app.requestSingleInstanceLock()` + `second-instance`)을 넣어야 한다. `open-url`은 `app.whenReady()` 전에 등록해야 첫 실행 링크를 놓치지 않는다.
3. **Developer ID 서명·공증은 아직 실제로 돌려 보지 않음**(인증서 없음). ad-hoc 빌드만 확인.
4. **자동 업데이트 없음** — `electron-updater` + `zip`/`blockmap` + 배포 서버(GitHub Releases 등)는 다음 단계.
5. **앱 메뉴 이름** — 기본 메뉴를 쓰므로 패키지 앱 메뉴 막대 이름은 `sprout`. 정식 제품명이 정해지면 `electron-builder.yml`의 `productName`·`extraMetadata.productName`·아이콘을 함께 바꾼다(데이터 폴더 이름도 바뀌므로 출시 전에 정한다).
6. Windows·Linux 패키징은 아직 없다.
