# sprout 공개 사이트

제품 소개 첫 화면 + 스토어 제출용 법률·지원 페이지. 프레임워크 없는 정적 HTML/CSS/JS이고, Railway에서 Caddy 한 개로 서빙한다.

- 주소: https://web-production-cd889.up.railway.app
- Railway: 프로젝트 `sprout-site` › 서비스 `web` (환경 `production`)

| 경로 | 내용 | 원본 |
|---|---|---|
| `/` | 소개(기능·성장 캐릭터·개인정보 약속·FAQ) | `src/pages.mjs` |
| `/privacy` | 개인정보 처리방침 | `../docs/release/legal/privacy-policy.{ko,en}.md` |
| `/terms` | 이용약관 | `../docs/release/legal/terms.{ko,en}.md` |
| `/account-deletion` | 계정 삭제 안내 (Play "데이터 삭제 URL") | `../docs/release/legal/account-deletion.{ko,en}.md` |
| `/support` | 지원·문의 | `src/pages.mjs` |
| `/delete-account`, `/privacy-policy` | 위 주소로 301 | `Caddyfile` |

한국어가 기본이고 오른쪽 위 `EN`으로 바꾼다. `?lang=en`을 붙이면 영어로 열린다(스토어 영어 등록 정보에는 `/privacy?lang=en`처럼 쓰면 된다). 밝게·어둡게는 시스템을 따르고 버튼으로 바꿀 수 있다.

## 고치기

Node 22에서 돌린다(`. ../scripts/node22.sh`).

- **제품명·주소·연락처**: `site.config.mjs` 한 곳. `name`을 바꾸면 화면과 법률 문서의 `[제품명]`이 같이 바뀐다. 값이 `[`로 시작하면 아직 미정으로 보고 노란 표시로 드러낸다(지금 문의 이메일·운영자).
- **법률 문서**: 정본은 `docs/release/legal/*.md`. 고친 뒤 `npm run build`만 하면 된다. 맨 위 "초안" 인용 메모는 빌드에서 빠지고, 대신 `legalDraftBanner: true`면 "출시 전 초안" 띠가 붙는다. 남은 `[ ]` 칸은 노란 표시.
- **첫 화면 문구**: `src/pages.mjs` (`T('한국어', 'English')` 쌍). 스타일은 `src/styles.css`, 동작은 `src/app.js`.
- **스크린샷**: `public/assets/img/*.webp` — 데스크톱 앱을 1440×900(2배)으로 찍어 1600×1000 WebP q82로 줄인 것(틀 없이, macOS 창 틀은 CSS `.win`). `data-dark`가 있으면 어두운 화면에서 그 그림으로 바뀐다. 시연 계정(`demo-site-…@sprout.test`, 찍은 뒤 삭제)의 예시 데이터만 쓴다 — 실제 사용자 데이터 금지.
- **캐릭터 그림**: 앱의 `CharacterArt.tsx`를 그대로 SVG로 뽑는다 — `npm run characters` (레포 루트 node_modules 필요).
- **OG 이미지**: `npm run og` (맥 Chrome 헤드리스로 `scripts/og.html`을 찍어 `public/og.png`).

미리보기: `npm run dev` → http://localhost:4173 (Caddy와 같은 주소 규칙).

## 배포

```bash
cd site
. ../scripts/node22.sh
npm run build          # public/ 다시 만들기 (법률 문서가 ../docs에 있어서 빌드는 로컬에서)
railway up --service web --detach   # 또는 npm run deploy
```

- `site/`는 `sprout-site` 프로젝트에 링크돼 있다(`railway status`로 확인). 레포 루트는 다른 프로젝트(`sprout`)에 링크돼 있으니 **꼭 `site/` 안에서** 실행한다.
- 빌드는 `Dockerfile`(caddy:2.10-alpine + `public/`)이고, 헬스체크는 `/healthz`(railway.json).
- 자체 도메인을 붙이려면 `railway domain 도메인 --service web` → 안내된 DNS 레코드 추가 → `site.config.mjs`의 `baseUrl` 바꾸고 다시 빌드·배포.

## 비용

정적 파일만 내는 Caddy 컨테이너 하나(메모리 약 20MB, CPU 거의 0)라 Railway Hobby 요금제($5/월, 사용료 $5 포함) 안에서 사용료는 월 $1 미만으로 예상된다. DB·볼륨 없음.
