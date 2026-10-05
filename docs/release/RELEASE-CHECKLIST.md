# 출시 체크리스트 (데스크톱 Mac·Windows + 모바일 iOS·Android + 서버)

> 작성 2026-10-05. 저장소·HANDOFF·PRD·server/README 기준으로 표시했다. **비용·정책 숫자는 작성 시점의 일반 정보라 결제·신청 직전에 공식 페이지에서 다시 확인한다(확인 필요).**
> 표시: **[완료]** 저장소에 있고 확인됨 · **[진행]** 일부 있음 · **[할 일]** 개발·문서 작업 · **[사용자]** 계정 가입·결제·결정 등 사용자가 직접 해야 함
> 관련 문서: [packaging.md](packaging.md)(맥 패키징 상세) · [brand/logo-concepts.html](brand/logo-concepts.html)(로고 후보) · [brand/name-candidates.md](brand/name-candidates.md)(이름 후보) · [legal/](legal/)(처리방침·약관·계정 삭제 안내) · [store/](store/)(스토어 문구·개인정보 답변·스크린샷 목록)

## 출시 차단 항목 (이것부터)
코드·데이터 흐름 점검 결과([legal/data-inventory.md](legal/data-inventory.md) 갭 G1~G12, [store/privacy-answers.md](store/privacy-answers.md) B1~B10)에서 나온, 이대로는 출시·심사가 안 되는 것들이다.
1. **고정 공개 도메인 없음**: 처리방침·약관·계정 삭제·지원 URL, Google OAuth 동의 화면 도메인 확인, 애플 로그인 반환 URL에 내 소유 도메인이 필요하다. `*.ts.net`은 Tailscale 소유라 쓸 수 없다 → D3
2. **iOS에 애플 로그인 없음**: 구글 로그인이 있으므로 지침 4.8에 따라 필요하다. 서버와 데스크톱은 구현됐고 모바일은 "준비 중" 버튼만 있다. 켜려면 탈퇴 때 애플 토큰 폐기, 모바일에서 애플로만 가입한 계정 삭제(지금 불가)도 함께 해야 한다
3. **이메일 인증 없음 → 계정 선점 위험**: 남이 내 이메일로 비밀번호 가입을 먼저 해 두면, 내가 나중에 구글로 들어올 때 그 계정에 연결된다. 메일 발송 수단 + 인증(또는 미인증 계정에는 소셜 자동 연결 금지)이 필요하다
4. **외부 백업 없음**(CLAUDE.md·PRD 필수): 백업이 같은 Mac mini에만 있고 암호화도 안 돼 있다
5. **비밀번호 재설정 없음**: 메일 수단이 없어서 막혀 있다
6. 가입 화면의 약관·처리방침 링크가 연결 안 됨(문서 호스팅 뒤)

## 0. 먼저 정할 것 (뒤 작업이 전부 여기에 걸려 있음)
| # | 결정 | 왜 먼저인가 | 상태 |
|---|---|---|---|
| D1 | ✅ 2026-10-05 **꿈틀(Kkumteul)** 확정 — 운영자 유니포트(대표 고윤서), kysk2295@naver.com (name-candidates.md) | 번들 표시 이름, 데이터 폴더 이름(`productName`), 스토어 이름, 도메인, 처리방침 문구가 모두 바뀐다. 출시 뒤에 바꾸면 데이터 폴더가 갈린다 | [사용자] |
| D2 | **로고 후보** (A 새싹 체크 추천) | 아이콘 적용은 `docs/release/brand/out/<id>/APPLY.md` 대로 | [완료] 로고 B 적용됨 2026-10-05 (달력 새싹, `out/b/`) |
| D3 | **공개 주소: Tailscale Funnel 유지 vs 자체 도메인** (§5-1) | 앱에 서버 주소가 박혀 출시되므로 나중에 바꾸면 앱 업데이트가 필요. 처리방침·계정 삭제 페이지에도 고정 주소가 필요 | [사용자] |
| D4 | **개인 vs 사업자로 스토어 가입** | Apple·Google 판매자 이름이 그대로 공개. 사업자(조직)면 D-U-N-S 번호(무료, 발급에 시간 걸림)가 필요. EU 배포 때 "트레이더" 여부 신고(트레이더면 주소·전화 공개) | [사용자] |
| D5 | **v1 범위** (PRD 8장 가·나·다) | 스토어 설명·스크린샷·심사 범위가 정해진다 | [사용자] |
| D6 | 출시 지역(한국만 / 전 세계) | 처리방침 언어·국외 이전 고지·EU 트레이더 신고·연령 등급 범위 | [사용자] |

## 1. 공통 — 버전·빌드
- [ ] [할 일] 버전 통일: 지금 루트 `0.0.0`, 데스크톱 `0.0.1`, 모바일 `0.1.0` → 출시 때 `1.0.0`(SemVer). iOS `buildNumber`, Android `versionCode`는 올리기만 하는 정수(Expo면 `eas.json`의 `autoIncrement` 또는 직접 관리)
- [ ] [할 일] **최소 지원 버전 강제 장치**: 동기화 스키마가 바뀌면 옛 앱이 깨진다 → API에 `GET /version`(최소 버전) + 앱에서 "업데이트가 필요해요" 화면. 출시 첫 버전에 넣어야 이후에 쓸 수 있다
- [ ] [할 일] 변경 기록(CHANGELOG) + 스토어 "새로운 기능" 문구 관리 방식
- [ ] [할 일] 서명 키·인증서 보관: `.p12`·`.p8`·`.jks`·`.env`를 암호화해 저장소 밖 2곳 이상에 백업(분실하면 Android 업로드 키는 재설정 신청, iOS·Mac은 재발급 — 기존 위젯 App Group 등 영향)

## 2. macOS (Developer ID 직접 배포, dmg)
| 항목 | 상태 | 메모 |
|---|---|---|
| electron-builder 설정·dmg·zip(arm64) | [완료] | `apps/desktop/electron-builder.yml`, packaging.md |
| 앱 아이콘·메뉴 막대 템플릿 아이콘 | [완료] | 로고 B(`out/b/macos/*`) 적용 |
| Apple Developer Program 가입 (연 $99, iOS와 공용) | [사용자] | 지금 키체인은 무료 개인 팀 개발용 인증서뿐 |
| Developer ID Application 인증서 + 공증 자격(App Store Connect API 키 권장) | [사용자] | 발급 절차: packaging.md §3-1 |
| 팀 ID 바뀌면 4곳 수정 | [할 일] | 유료 팀 ID가 지금 `BU697KN34B`와 다르면 entitlements·위젯·widget.ts 함께(packaging.md §4-2). 출시 뒤엔 못 바꿈 |
| 첫 Developer ID 서명 + 공증 + 스테이플 실제 실행 | [할 일] | 한 번도 안 돌려 봄. PowerSync dylib 로드 실패 시 `disable-library-validation` 검토 |
| 자동 업데이트 | [할 일] | `electron-updater` + zip·blockmap 이미 생성 중. **배포처 결정 필요**: GitHub Releases(저장소가 비공개라 별도 공개 저장소 필요) 또는 자체 도메인 정적 파일(R2·Cloudflare Pages). 맥 자동 업데이트는 서명된 앱에서만 동작 |
| 인텔 Mac 지원 여부 | [사용자] | arm64만 빌드 중. `x64`/`universal` 추가는 설정 한 줄 + 크기 2배 |
| 제품명 반영 | [완료] 2026-10-05 | 화면 이름 꿈틀(.app 표시 이름·메뉴·창·트레이·dmg·위젯·권한 문구·앱 문구), 파일 이름 Kkumteul, 데이터 폴더·키체인은 sprout 유지 — packaging.md |
| 다운로드 페이지 | [할 일] | 웹사이트에 dmg 링크 + 최소 macOS 12 표기 |

## 3. Windows
| 항목 | 상태 | 메모 |
|---|---|---|
| Windows 패키징 설정 | [할 일] | 아직 없음. `win` 대상(NSIS) 추가, `files`에서 지금 빼는 `*.dll`(PowerSync)·win32 better-sqlite3 프리빌드를 Windows 빌드 때는 넣도록 분리. 맥 전용(위젯·Apple 캘린더 도우미·URL 스킴 처리) 분기 확인 |
| Windows 아이콘·트레이 | [완료] | 로고 B `build/icon.ico`(`win.icon`)·`resources/tray.ico`, `mini.ts` win32 분기. Windows 실기기 확인은 아직 |
| 빌드·시험 환경 | [사용자] | Windows PC·VM이 필요. 또는 GitHub Actions Windows 러너(비공개 저장소는 무료 분 한도, Windows는 2배 차감) |
| **코드 서명** | [사용자] | 아래 표에서 고른다 |
| 자동 업데이트 | [할 일] | electron-updater NSIS. 서명 안 하면 업데이트 때마다 SmartScreen 경고 |

**Windows 서명 선택지 (가격은 확인 필요)**
| 방법 | 대략 비용 | SmartScreen | 메모 |
|---|---|---|---|
| ① Microsoft Store(MSIX)로 배포 | 개인 개발자 계정 무료(2024~, 확인 필요) | 경고 없음(스토어가 서명) | **가장 싸고 깔끔.** 스토어 심사 있음. MSIX 샌드박스에서 PowerSync·트레이·로그인 시 실행 동작 확인 필요. 웹 다운로드용 설치 파일은 따로 서명 필요 |
| ② Azure Trusted Signing(Artifact Signing) | 월 약 $10 | 평판이 쌓이면 사라짐 | 개인 신청 가능 국가가 제한적(한국 개인 가능 여부 **확인 필요**) |
| ③ OV 코드 서명 인증서 | 연 $200~400 + 하드웨어 토큰/클라우드 HSM | 다운로드가 쌓일 때까지 경고 | 2023년부터 키를 HSM에 둬야 함 → CI 서명이 번거로움 |
| ④ EV 인증서 | 연 $300~600 | 예전과 달리 즉시 평판 부여가 사라졌다는 공지가 있음(확인 필요) | 사업자 필요 |
| ⑤ 서명 안 함 | 0 | "Windows의 PC 보호" 경고 → 사용자가 "추가 정보 › 실행" | 공개 출시엔 비추천 |
권장: **①(무료) + 필요하면 웹 설치 파일은 ②**. PRD A5(영구 무료 비용 가정)에 반영.

## 4. iOS (App Store)
| 항목 | 상태 | 메모 |
|---|---|---|
| Expo 앱·시뮬레이터 동작 | [완료] | apps/mobile, HANDOFF |
| Apple Developer Program($99/년, 맥과 공용) | [사용자] | |
| App ID·App Group(`group.app.sprout.mobile`)·공유 확장·위젯 프로비저닝 | [친구] | 앱 `app.sprout.mobile` + 공유 확장 `app.sprout.mobile.share` + 위젯 확장(apps/mobile 위젯 플러그인의 번들 ID), 셋 다 같은 App Group. 빌드할 때 `SPROUT_APPLE_TEAM_ID=<팀 ID>` |
| **Sign in with Apple** | [완료] 코드(서버 `/auth/apple/native`·웹 흐름, 모바일 `SPROUT_APPLE_SIGN_IN=1`일 때 켜짐) / [친구] 키 | **구글 로그인이 있으므로 심사 지침 4.8에 따라 필수.** App ID에 Sign in with Apple 켜기, 키(.p8)·Services ID 만들기 → 아래 "친구에게 받을 값" |
| 앱 안 계정 삭제 | [완료] | 지침 5.1.1(v). 애플로만 가입한 계정도 "Apple로 다시 로그인" 후 삭제, 삭제 때 애플 토큰 폐기(키가 있을 때) |
| 푸시(APNs) | [할 일] | 지금 `pushIos: false`. APNs 인증 키(.p8) 발급 → FCM에 등록하거나 서버가 APNs 직접. 로컬 알림만으로 v1 내도 됨(결정) |
| 개인정보 매니페스트(PrivacyInfo.xcprivacy) | [완료] 2026-10-05 | `app.json` `ios.privacyManifests`: 추적 안 함, 필수 사유 API = UserDefaults CA92.1 · 파일 시각 C617.1 · 부팅 시각 35F9.1 · 디스크 공간 E174.1(RN·Expo·op-sqlite 라이브러리 매니페스트 합집합), 수집 데이터 = 이메일·사용자 ID·기타 사용자 콘텐츠·제품 상호작용(모두 연결·앱 기능, privacy-answers.md와 같음). 공유 확장은 자체 매니페스트(App Group UserDefaults 1C8F.1) |
| 암호화 수출 규정 | [완료] | `ITSAppUsesNonExemptEncryption: false`(HTTPS만) |
| 버전·이름·권한 문구 | [완료] 2026-10-05 | 표시 이름 `꿈틀`(공유 확장도), 1.0.0 / buildNumber 1 / Android versionCode 1. 권한 문구는 쓰는 것만: 알림(문구 필요 없음). 안 쓰는 Face ID 문구 제거(`expo-secure-store` `faceIDPermission: false`). 캘린더·사진·위치·카메라 권한 없음 |
| Release 빌드(서명 없이) | [완료] 2026-10-05 | `xcodebuild … -configuration Release -sdk iphoneos CODE_SIGNING_ALLOWED=NO` 성공, JS 번들(Hermes) 포함, 운영 서버 주소, `.env.local` 없이도 구글 로그인(공개 클라이언트 id를 `app.config.ts` 기본값으로) |
| App Store Connect 등록: 앱 이름·부제·설명·키워드·카테고리 | [진행] 초안 | [store/listing.md](store/listing.md) |
| 앱 개인정보(영양 성분표) 답변 | [진행] 초안 | [store/privacy-answers.md](store/privacy-answers.md) |
| 연령 등급 설문 | [진행] 초안 | listing.md. AI 대화(일기·비서)가 있어 "사용자 생성 콘텐츠/AI" 관련 질문 답변 주의 |
| 스크린샷 6.9"/6.5" | [완료] 2026-10-05 | [store/screenshots/ios/](store/screenshots/ios/) 6장씩 + 캡션. **아이폰 전용**(`supportsTablet: false`) → iPad 스크린샷 필요 없음 |
| 심사용 데모 계정 + 심사 메모 | [완료] 2026-10-05 | [store/review-notes.md](store/review-notes.md)(영어 본문). 비밀번호는 운영자 맥 `~/.config/sprout/review-account.txt`에만 — 제출자에게 따로 전달. 심사 기간 Mac mini 상시 가동 |
| 지원 URL·개인정보 처리방침 URL | [완료] | https://web-production-cd889.up.railway.app/support · /privacy · /terms · /account-deletion (`?lang=en` 영어) |
| TestFlight 외부 테스트 | [할 일] | 베타 심사 1회 |
| EU 디지털서비스법 트레이더 신고 | [사용자] | D4·D6 |


### 4-1. 친구(애플 개발자 계정)에게 부탁할 것 — 2026-10-05
1. **아이폰 앱 출시 (필수):** 위 표의 [친구] 항목 → `SPROUT_APPLE_SIGN_IN=1 SPROUT_APPLE_TEAM_ID=<팀 ID> npx expo prebuild --platform ios` → Xcode 아카이브 → TestFlight → App Store Connect 등록(설명 [store/listing.md](store/listing.md), 개인정보 [store/privacy-answers.md](store/privacy-answers.md), 스크린샷 [store/screenshots.md](store/screenshots.md)) → 심사 제출(데모 계정은 사용자가 만들어 전달).
2. **애플 로그인 키 (필수):** Keys에서 Sign in with Apple 키 만들기 + Identifiers에서 Services ID 만들기(반환 URL `https://macmini.tail425c97.ts.net/auth/apple/callback`).
3. **아이폰 푸시 키 APNs (선택):** Keys에서 APNs 키(.p8) → Firebase 프로젝트 `sprout-510614` › 클라우드 메시징 › Apple 앱 구성에 올리기. 없으면 아이폰은 폰 안 예약 알림만.
4. **맥 앱 서명 Developer ID (선택):** dmg 배포용. 없으면 "확인되지 않은 개발자" 경고. [packaging.md](packaging.md) §3-1.

**친구에게 받을 값 → 넣을 곳**
| 값 | 넣을 곳 |
|---|---|
| 팀 ID | 서버 `.env` `APPLE_TEAM_ID`, iOS 빌드 `SPROUT_APPLE_TEAM_ID`, 구글 클라우드 iOS OAuth 클라이언트의 팀 ID 칸 |
| Sign in with Apple Key ID + .p8 파일 | 서버 `.env` `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`(파일 경로) |
| Services ID | 서버 `.env` `APPLE_SERVICES_ID` |
| (선택) APNs 키 | Firebase 콘솔에 친구가 직접 올림 → 서버 `.env` `PUSH_IOS=1` |
| (선택) 번들 ID를 바꿨다면 새 값 | 구글 iOS OAuth 클라이언트 새로 만들기, 서버 `APPLE_BUNDLE_IDS` |
값을 받으면 서버(맥미니)에 넣고 `docker compose up -d --build api`.

## 5. Android (Google Play)
| 항목 | 상태 | 메모 |
|---|---|---|
| 에뮬레이터 실측(푸시 포함) | [완료] | a993163 |
| Play Console 가입($25 1회) + 본인 인증 | [사용자] | |
| **개인 계정 비공개 테스트 요건** | [사용자] | 2023-11 이후 만든 개인 계정은 프로덕션 전에 **테스터 12명 이상이 14일 연속** 비공개 테스트 참여 필요(확인 필요). 일정에 2주 이상 잡기. 조직 계정이면 면제 |
| 권한 점검 | [할 일] | prebuild 매니페스트에 `SYSTEM_ALERT_WINDOW`가 있다 — 필요 없으면 빼야 Play 심사에서 질문을 안 받는다 |
| 앱 서명 | [할 일] | Play 앱 서명 사용, 업로드 키(.jks) 생성·백업. `.jks`는 gitignore 됨 |
| 대상 API 수준 | [할 일] | Play는 매년 8월 말 기준을 올린다(2025: API 35, 2026-08 이후 새 앱은 API 36 예상 — **확인 필요**). Expo SDK 57 기본값 확인, `expo-build-properties`로 고정 |
| **정확한 알람(exact alarm) 정책** | [사용자] 결정 + [할 일] | Android 14+는 `SCHEDULE_EXACT_ALARM`이 새 설치에 기본 거부. 할 일 알림이 늦게 울릴 수 있다. 선택: (가) 정확하지 않은 알림 허용 + 서버 푸시 보완 (나) 캘린더·할 일 앱으로 `USE_EXACT_ALARM` 신청(Play 정책 선언 필요, 심사에서 거절 위험) (다) 설정 화면에서 "정확한 알람" 권한 안내. expo-notifications가 어떤 권한을 매니페스트에 넣는지 prebuild 결과로 확인 |
| 알림 권한(POST_NOTIFICATIONS, 13+) | [진행] | 설정 › 소리와 알림에서 요청(32) |
| FCM | [진행] | Firebase 프로젝트·`google-services.json`(저장소 밖) 사용 중. 서버 서비스 계정 키 보관. **국외 이전(구글) 처리방침 고지** |
| 데이터 보안(Data safety) 양식 | [진행] 초안 | [store/privacy-answers.md](store/privacy-answers.md) |
| 계정 삭제 웹 URL | [진행] 문구 / [할 일] 호스팅 | Play는 앱 밖에서 열 수 있는 삭제 요청 URL 필수 → [legal/account-deletion.ko.md](legal/) |
| 콘텐츠 등급(IARC) 설문 | [진행] 초안 | listing.md |
| 스토어 등록정보: 짧은 설명 80자·긴 설명·그래픽 이미지 1024×500·아이콘 512 | [진행] | listing.md, `out/<id>/store/` |
| Android 네이티브 폴더 | — | gitignore, `expo prebuild`로 생성. 빌드 방법(EAS 무료 한도 vs 로컬 Gradle) 결정 |

## 6. 서버 (Mac mini 셀프호스트)
### 6-1. 공개 주소
| 선택지 | 비용 | 장점 | 단점 |
|---|---|---|---|
| Tailscale Funnel(지금 결정) | 0 | 설정 끝, 도메인 불필요 | 주소가 `*.ts.net`이고 기계 이름이 그대로 공개. 포트 443·8443·10000만. 대역폭 제한(공개 안 됨). **무료 Personal 요금제의 공개 서비스 용도 허용 여부 확인 필요.** 처리방침·애플 로그인 반환 URL·심사용 지원 URL이 ts.net이 된다. 나중에 옮기면 앱 업데이트 필요 |
| 자체 도메인 + Cloudflare Tunnel(CLAUDE.md 원안) | 도메인 연 $10~20 | 고정 주소(`api.<도메인>`), 웹사이트·메일·처리방침을 같은 도메인으로, 서버를 Railway로 옮겨도 주소 유지 | 도메인 구입·Cloudflare 계정. 트래픽이 Cloudflare를 지나 TLS가 그쪽에서 풀림 → 처리방침에 위탁 고지 |
**권장: 이름(D1)이 정해지면 도메인을 사서 Cloudflare Tunnel로 `api.`·`sync.` 주소를 고정하고 앱 기본값을 그 주소로 낸다.** [사용자] 도메인 구입·Cloudflare 가입.

### 6-2. 운영
| 항목 | 상태 | 메모 |
|---|---|---|
| 일일 백업(pg_dump, 14일 보관, Mac mini 디스크) | [완료] | `server/backup/run.sh` |
| **외부 백업 (CLAUDE.md 필수)** | [할 일] + [사용자] 저장소 가입 | 암호화(age/gpg) 후 R2(10GB 무료)·Backblaze B2 등으로. **복원 연습 1회** 기록. 처리방침의 백업 보관 기간과 맞춘다 |
| 모니터링·알림 | [할 일] | 같은 기계 안의 감시는 기계가 꺼지면 무용 → 바깥 무료 업타임 감시(API `/health`, PowerSync) + 백업 작업 하트비트. 디스크 여유 경고 |
| 전원·재시작 | [사용자] | Mac mini 정전 후 자동 켜짐(`pmset autorestart 1`), Docker·Funnel/Tunnel 로그인 없이 자동 시작, macOS 자동 업데이트 재부팅 시간 관리, (선택) UPS |
| 요청 제한 | [진행] | 로그인·가입 IP/이메일 제한, AI 분당·일·주 상한 있음. 업로드·일반 API·푸시 등록 등 나머지 경로 점검. Funnel/Tunnel 뒤 실제 IP 구분 확인(server/README) |
| **메일 발송 수단** | [할 일] + [사용자] 가입 | 지금 없음 → 비밀번호 재설정·이메일 인증·삭제 확인·지원 답장 불가. 선택: Resend(무료 한도 있음)·Amazon SES·Postmark 등 + 도메인 SPF·DKIM·DMARC. 받는 메일은 Cloudflare Email Routing(무료)로 개인 메일에 전달 |
| 비밀번호 재설정·이메일 인증 | [할 일] | 메일 수단 다음. 비밀번호 가입 사용자가 잊으면 지금은 복구 방법 없음 → 출시 필수. 인증 전 계정에 소셜 로그인 자동 연결 막기(선점 위험) |
| 로그·보관 기한 | [할 일] | 500 오류 때 오류 객체 전체를 로그에 남기고(`server.ts`) Docker 로그 크기 제한이 없다 → 제한·순환 설정, 오류 로그에 요청 본문이 섞이지 않게. `ai_usage`·만료 세션·수동 백업(`backups/manual`)에 보관 기한을 정하고 처리방침과 맞춘다 |
| 시도 제한 저장 위치 | — | 메모리에만 있어 API를 다시 시작하면 초기화된다(한 대 운영이면 허용 가능) |
| AI 용량 | [진행] | Mac mini Ollama 한 대. 동시 사용자 늘면 대기열·상한. Mac mini 꺼지면 AI만 안내 문구(설계됨). 심사 기간 상시 가동 |
| 비밀값 관리 | [할 일] | JWT 서명 키·Google·Firebase·Apple 키 위치 목록, 교체 절차 |
| 보안 점검 | [할 일] | 출시 전 `/security-review` 또는 cso 한 번, PowerSync 토큰·동기화 규칙(남의 데이터 접근 불가) 재확인 |
| 이사 계획 | — | 같은 compose로 Railway·VPS 이동 가능 유지(CLAUDE.md) |

## 7. 법률·정책
| 항목 | 상태 | 메모 |
|---|---|---|
| 개인정보 처리방침(한·영) | [진행] 초안 | [legal/privacy-policy.ko.md](legal/) — **법률 검토 필요** |
| 이용약관(한·영) | [진행] 초안 | [legal/terms.ko.md](legal/) — **법률 검토 필요** |
| 계정 삭제 안내 페이지 | [진행] 초안 | Play 필수 URL |
| 데이터 목록(처리방침의 근거) | [진행] | [legal/data-inventory.md](legal/data-inventory.md) — 코드가 바뀌면 같이 고친다 |
| 개인정보 보호책임자·연락처 | [사용자] | 이름·이메일(지원 메일과 같아도 됨) |
| Google OAuth 앱 검증(구글 캘린더 읽기) | [사용자] + [할 일] | 캘린더 범위는 민감 범위라 외부 사용자에게 공개하려면 Google 검증을 받아야 한다(동의 화면 도메인 소유 확인, 처리방침 URL, 시연 영상). 검증 전엔 테스트 사용자 100명 제한·경고 화면. 몇 주가 걸릴 수 있다(확인 필요) |
| 국외 이전 고지 | [할 일] | Google(FCM·구글 로그인), Apple(애플 로그인·APNs), Cloudflare(쓰게 되면) |
| 만 14세 미만 | [사용자] 결정 | 가입 제한(권장) 또는 법정대리인 동의 절차. 스토어 연령 등급과 맞춤 |
| 일기 등 민감한 글 | [사용자] 결정 | 운영자 서버에 평문 저장·AI 처리. 종단 간 암호화는 v1 이후(PRD) → 처리방침에 솔직히 적고, 앱 안 일기 켜기 화면에도 한 줄 안내 권장 |
| 상표 | [사용자] | 이름 확정 뒤 KIPRIS 9·42류 검색, 필요하면 출원(유료). 스토어 문구에 "TickTick" 금지 |
| 오픈소스 고지 | [할 일] | Electron·React·PowerSync 등 라이선스 목록을 앱 정보 화면이나 웹에 |
| 사업자등록·통신판매업 | — | 무료·결제 없음이면 보통 불필요(확인 필요). 유료화 때 다시 |

## 8. 지원·웹사이트
- [ ] [사용자] 지원 메일 주소(예: `support@<도메인>`)
- [ ] [할 일] 정적 웹사이트(Cloudflare Pages/GitHub Pages 무료): 소개·다운로드(dmg·Windows)·처리방침·약관·계정 삭제 안내·FAQ. 파비콘은 `out/<id>/web/`
- [ ] [할 일] 앱 안 "도움말·문의" 링크, 버전 표시, 오픈소스 고지
- [ ] [선택] 카카오톡 채널(수집함 챗봇과 같이 — PRD 백로그)

## 9. 분석·오류 보고 (개인정보 우선)
- 지금: 분석·오류 보고 도구 없음 → 스토어 답변도 "수집 안 함"으로 단순.
- [ ] [사용자] 결정: v1에 오류 보고를 넣을지.
  - 권장: **선택 동의(기본 꺼짐) 오류 보고**를 자체 호스팅(GlitchTip 등 Sentry 호환, Mac mini에)으로. 할 일 제목·메모·이메일은 보내지 않게 걸러냄. 넣으면 처리방침·스토어 답변(진단 데이터) 갱신.
  - 사용 분석은 v1 제외. 필요하면 서버의 익명 집계(일일 활성 수 등)만.
- [ ] [할 일] Electron `crashReporter`는 기본 꺼짐 확인.

## 10. 출시 직전 점검 (PRD 8장 출시 체크와 함께)
- [ ] PRD 출시 체크 5항목(KR1·KR2, 틱틱 1단계 동급, 주간 루프 4주, AI 상한 서버 강제, 제품명)
- [ ] 새 계정으로 처음부터: 가입 → 성향 조사 → 할 일 → 동기화 → 다른 기기 → 계정 삭제까지 데스크톱·iOS·Android 각각
- [ ] 오프라인 → 다시 연결, 서버 꺼짐(AI만 안내), 로그인 제한 동작
- [ ] 백업에서 복원 연습
- [ ] 스토어 문구·스크린샷에 실제 이메일·개인 데이터 없음
- [ ] 처리방침 내용 = 실제 동작(data-inventory.md 대조)

## 11. 사용자가 할 일 요약 (돈·계정·결정)
| 무엇 | 비용(확인 필요) | 언제 |
|---|---|---|
| 제품명·로고·v1 범위·출시 지역 결정 | — | 가장 먼저 |
| Apple Developer Program | 연 $99 | 맥 공증·iOS 둘 다 필요 |
| Google Play Console + 본인 인증 + 테스터 12명 14일 | $25 1회 | 출시 3주 전까지 |
| Windows 서명 방식 선택 (MS Store 무료 권장) | 0 ~ 연 수십만 원 | Windows 출시 전 |
| 도메인 + Cloudflare(Tunnel·Pages·Email Routing) | 연 $10~20 | 이름 정한 직후 |
| 외부 백업 저장소(R2/B2) | 무료 한도 안 | 출시 전 필수 |
| 메일 발송 서비스(Resend/SES 등) | 무료 한도 안 | 출시 전 필수 |
| 개인정보 보호책임자·연락처, 14세 미만 정책, 일기 안내 방식 | — | 처리방침 확정 전 |
| 처리방침·약관 법률 검토(변리사·변호사 또는 공공 상담) | 상담 비용 | 출시 전 |
| Mac mini 상시 가동·전원 설정 | 전기료 | 심사 기간부터 |
