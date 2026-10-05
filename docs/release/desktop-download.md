# 데스크톱 내려받기(사이트 Mac·Windows 버튼)

2026-10-05 처음 구성. 사이트 첫 화면의 Mac·Windows 버튼이 GitHub Releases(kysk2295/sprout)의 설치 파일을 바로 내려받는다.

## 파일과 주소
| 파일 | 대상 | 주소 |
|---|---|---|
| `Kkumteul-mac-arm64.dmg` | Apple 칩 Mac (macOS 12+) | `https://github.com/kysk2295/sprout/releases/latest/download/Kkumteul-mac-arm64.dmg` |
| `Kkumteul-mac-x64.dmg` | 인텔 Mac (macOS 12+) | `…/latest/download/Kkumteul-mac-x64.dmg` |
| `Kkumteul-windows-x64-setup.exe` | Windows 10·11 64비트 | `…/latest/download/Kkumteul-windows-x64-setup.exe` |
| `SHA256SUMS.txt` | 체크섬 | |

파일 이름에 버전이 없다 — 사이트 링크가 `releases/latest/download/<이름>`이라 **이름을 바꾸면 사이트 버튼이 깨진다.** `latest`는 가장 최근의 정식(프리릴리스 아님) 릴리스를 가리키므로, 이 저장소에 다른 종류의 릴리스(모바일 등)를 올릴 땐 `--latest=false`로 올린다.

## 새 버전 올리기
1. `apps/desktop/package.json` `version`을 올린다(루트 `package-lock.json`의 `apps/desktop` 항목도 같이).
2. 커밋·푸시 후 `git tag desktop-v1.0.1 && git push origin desktop-v1.0.1`.
3. `.github/workflows/desktop-release.yml`이 macos-14(arm64·x64 dmg)·windows-latest(x64 NSIS)에서 만들어 릴리스에 올린다(`gh run watch`). 같은 태그로 다시 돌리면 파일만 바꾼다.
- 구글 데스크톱 OAuth 클라이언트 값은 저장소 Actions 비밀 `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`(`~/.config/sprout/google.env`와 같은 값, `gh secret set`)에서 빌드할 때 넣는다(electron.vite.config.ts `define`). 설치형 클라이언트라 앱 안에 들어가는 게 정상(PKCE가 보안을 맡음).
- 로컬에서 맥 dmg만: `. scripts/node22.sh && set -a && . ~/.config/sprout/google.env && set +a && npm run calendar:build -w @sprout/desktop && npm run dist:public -w @sprout/desktop -- mac`. Windows는 이 Mac에서 만들지 않는다.

## 서명 상태와 사용자가 보는 경고
- **맥: ad-hoc 서명, 공증 없음**(Developer ID 인증서 없음 — 무료 개인 팀의 Apple Development 인증서는 배포용이 아니라 쓰지 않음). 처음 열 때 "확인할 수 없음" 창 → [완료] → 시스템 설정 › 개인정보 보호 및 보안 맨 아래 [그래도 열기] → [열기]. macOS 14 이하는 Control-클릭 › 열기도 됨(macOS 15부터는 설정에서만).
- **맥 위젯은 내려받기 판에 없다**(`SPROUT_SKIP_WIDGET=1`). ad-hoc 앱은 App Group이 검증되지 않아 위젯이 데이터를 못 읽고, 저장 칸을 건드리면 macOS 15+가 확인 창을 띄운다 → `src/main/widget.ts`는 `Contents/PlugIns/SproutWidget.appex`가 있을 때만 위젯 연동을 켠다. Developer ID를 받으면 `dist:mac:release`로 위젯까지 넣는다(packaging.md §3·§4).
- **Windows: 서명 없음** → SmartScreen "Windows의 PC 보호" → [추가 정보] → [실행]. 내려받기 수가 쌓이면 경고가 줄어들 수 있지만 확실히 없애려면 코드 서명 인증서가 필요.
- 맥 Apple 캘린더 도우미(`sprout-calendar`)는 arm64+x64 유니버설로 빌드해 두 dmg에 같이 들어간다. Windows는 도우미·위젯 없이(코드가 win32에서 건너뜀) 구글 캘린더만.

## 남은 일
- 자동 업데이트 없음(`electron-updater` + zip/blockmap + `latest*.yml` 필요). 지금은 사이트에서 새로 받아 덮어 설치(데이터는 그대로).
- Developer ID 서명·공증(맥), 코드 서명(Windows)으로 경고 없애기.
- Windows 앱은 CI 빌드만 확인 — 실제 Windows PC에서 설치·로그인·동기화 확인 남음.
