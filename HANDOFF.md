# sprout 작업 인계 (2026-10-05 기준, 새 탭 3개·성장 마무리·AI 프록시 구현 후 갱신)

다른 계정·다른 세션이 이어받을 때 **이 파일부터** 읽는다. 그다음 [CLAUDE.md](CLAUDE.md) → [PRD-sprout.md](PRD-sprout.md) → 해당 화면 명세(`docs/screens/`).

## 0. 사용자와 일하는 규칙 (꼭 지킬 것)
- **답은 항상 한국어로.** 짧은 상태 보고도 한국어.
- **화면 명세 먼저, 코드는 그다음.** 명세를 사용자에게 확인받고 개발한다. 구현하다 달라지면 명세부터 고친다.
- **UI·UX는 틱틱(TickTick)과 똑같이.** 틱틱에 없는 화면(성장·AI 등)만 틱틱 디자인 언어로 새로 설계. 틱틱 로고·아이콘·그림 원본은 절대 쓰지 않는다.
- **인프라(Docker·서버·스키마 변경) 작업 전에는 계획과 이유를 먼저 설명**하고 승인받는다.
- **커밋은 요청받았을 때만.** 다른 세션(Codex 등)이 같은 저장소를 동시에 고치는 일이 잦다 → `git add -A` 금지, 내 파일만 골라 스테이징. 다른 세션 작업은 따로 커밋.
- 실제 계정 이메일이 보이는 스크린샷은 커밋하지 않는다(`.gitignore`에 등록).
- 틱틱 비교 때: 사용자의 틱틱 로그아웃 금지, 비밀번호 입력 금지, 실험은 틱틱 리스트 `sprout UI 조사`에서만, 끝나면 보기·설정을 원래대로(캘린더 월 보기 + 오른쪽 "할일 정렬" 패널), 개인 데이터 기록 금지.

## 1. 지금 상태 한눈에
| 영역 | 상태 | 명세 |
|---|---|---|
| 앱 셸·목록·상세·날짜·리스트 편집·캘린더·필터 | 다크·라이트 모두 틱틱과 나란히 맞춤 완료 | 00~07 |
| 로그인(A안: 먼저 로그인) · 동기화 | 완료, 두 사용자·오프라인 재시도 검증 | 08 |
| 섹션 · 메뉴바 미니 창(⇧⌘O) | 완료 | 02 §0, 09 |
| 성장 루프(성향 조사 → 동물 캐릭터 4종, XP, 주간 목표, 레벨업, 인터랙티브 방) | 완료 + **AI 주간 목표 초안·주간 마감·AI 리포트(dd80735)**. 화면 육안 확인 남음 | 10-growth v1.5 |
| AI 비서 | v2 완료(0e8fc69) + ⌘N 새 대화(ff5a755). 오너 기기에서 SSH로 Mac mini Ollama | 13 |
| 수집함(구 메모함) | **v3 구현(537878b)**: 수집·볼 것·위키, AI 4갈래 분류, 카톡 가져오기, LLM 위키. **실제 Mac mini AI로 끝까지 확인 남음**, 비서가 위키 찾기는 [다음] | 11 |
| 일기 | **v0.3 구현(241f849)**, 실제 모델 대화 확인(작은 모델이라 가끔 조언·존댓말 섞임). 위기 단어 검사 | 15 |
| 작업 지도 | **v1.2 구현(41127e0)**: 그래프·보드·선 3종·자동 분류·되돌리기. 목표 선 화면 확인 남음, 명세와 다른 점은 14 §7 | 14 |
| AI 사용량(CodexBar) | v2 완료(721826b) + 계정 연결 해제(ff5a755, Claude 키체인 항목 이름은 추정) | 10-ai-usage |
| 서버(셀프호스트) | 이 Mac·Mac mini 둘 다 실행 중, 동기화 테이블 23개 + 서버 전용 `ai_usage`. **AI 프록시(/ai/*, 0c3c90f) 두 서버 모두 배포**(Mac mini는 direct로 같은 기계 Ollama). **공개 주소: Tailscale Funnel로 결정, 사용자가 Mac mini에서 켜기 대기** | server/README.md |

시안(디자인 확정본): [docs/screens/mockups/new-tabs.html](docs/screens/mockups/new-tabs.html) — 브라우저로 열면 4개 탭 시안, 라이트/다크 전환.

## 2. 바로 다음 할 일 (순서대로)
> 2026-10-05 결정: **무료 구성** — 서버(Postgres·PowerSync·API)는 Mac mini에 그대로, 공개 주소는 **Tailscale Funnel**(도메인·Cloudflare 불필요). Railway는 비용(월 약 $6~7) 때문에 보류 — `server/railway/`(다른 세션)와 AI 워커 방식 코드는 옮길 때를 위해 남겨 둠. 레일 검색 버튼은 사용자 요청으로 뺌(⌘F).
1. **Funnel 켜기(사용자, Mac mini 터미널에서 — SSH로는 Tailscale 앱 제어 불가)**: `/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --bg 6060` · `… funnel --bg --https=8443 8080`. 처음엔 tailnet에 Funnel 허용 링크가 뜬다. 주소 `https://yunseo-mac-paperclip.tail425c97.ts.net`(API) · `:8443`(PowerSync). 기계 이름이 공개 주소가 되므로 바꾸려면 먼저.
2. 켜진 뒤: 바깥에서 주소 확인 → 데스크톱 기본 `SPROUT_API_URL`·`SPROUT_SYNC_URL`을 Funnel 주소로, 이 Mac 데이터 → Mac mini 옮길지 결정.
3. 앱 AI를 서버 프록시로: `data/ai.ts`·AI 비서·`growth-ai.ts`가 `POST {API}/ai/<용도>`(Bearer)로, 모델은 `GET /ai/status`. 응답 503/429 처리(0c3c90f 보고 내용은 server/README "AI 프록시").
4. 실제 앱(Electron)으로 새 탭 전부 육안 확인: 수집함(실제 AI 분류·위키 반영), 작업 지도(목표 선), 성장 리포트, 일기, 라이트·다크.
5. 사용자 확인 대기 명세: [16 구글 캘린더](docs/screens/16-google-calendar.md)(§0 결정 6개 + Google Cloud OAuth 클라이언트 필요), [20~24 모바일](docs/screens/20-mobile-overview.md)(§0 결정 10개).
6. 작은 남은 것: 작업 지도 요청(TaskMenu `prepend`, 토스트 이름 있는 버튼), 06 명세가 구글 명세를 07로 가리킴 → 16으로, AI 상한 숫자 [임시] 실측.
7. 이후: 외부 백업(R2), 비밀번호 재설정(메일 발송 수단), 패키징·서명, 카톡 채널 챗봇, 캐릭터 정식 그림, 일기 종단 간 암호화 검토.

## 2-1. 남은 일 전체 목록 (2026-10-04 코드·명세 점검)
새 탭(수집함·작업 지도·일기) 말고도 출시 전에 남은 일. ✅ = 있음, ❌ = 없음. 코드 검색 기준이라 "있음"도 실제 동작은 다시 확인한다.

**A. 출시 필수인데 안 된 것 (큰 덩어리)**
- ⏳ 공개 주소 — Tailscale Funnel로 결정, 사용자 켜기 대기
- ✅ API AI 프록시(0c3c90f, 두 서버 배포) — 앱 쪽 연결 남음
- ✅ 성장 마무리(dd80735): 주간 목표 AI 초안 · 주간 리포트 · 주 2회 상한(앱+서버)
- ⏳ 구글 캘린더 읽기(C) — 명세 초안 16, 사용자 확인 대기
- ⏳ 모바일 최소형 — 명세 초안 20~24, 사용자 확인 대기
- ❌ 계정: 구글·애플 로그인, 비밀번호 재설정, 이메일 인증, 계정 삭제(메일 발송 수단 필요)
- ❌ 외부 백업(R2 등) — 공개 사용자 데이터라 필수
- ❌ 패키징·배포: electron-builder, Mac 서명·공증, Windows 서명, 자동 업데이트, 트레이 아이콘 리소스 포함
- ❌ 제품명 확정, 개인정보 처리방침(사용자 글이 운영자 Mac mini에서 처리됨, 일기 포함)

**B. 틱틱 동급인데 빈 곳 (작은 것)**
- ❌ 리스트를 다른 리스트에 겹쳐 폴더 만들기(01)
- ❌ 큰 목록 가상 스크롤(1,000개 성능 기준, 02)
- ❌ `?` 단축키 시트(설정 › 단축키 표는 ✅), 글자 크기 ⌘+/−(00·01)
- ⚠️ 메뉴바 미니 창: 사용자 직접 확인·실제 틱틱과 크기 비교 남음(09)
- ⚠️ 00~03·06 명세의 완료 체크박스가 거의 표시 안 됨 — 다크·라이트 비교는 통과했지만 체크리스트를 항목별로 다시 돌려 표시해야 함
- ✅(확인 필요) 사이드바로 끌어 놓기, 하위 태스크 끌어 만들기, 다중 선택 박스, ⌘K, G→T, Sky 테마, OS 알림·스누즈, 자연어 날짜 인식

**C. 새 탭** — ✅ 2026-10-05 수집함 v3·작업 지도 v1.2·일기 v0.3·저장 칸 묶음 구현(육안 확인 남음)

**D. 출시 뒤로 미뤄도 되는 것** — 카톡 채널 챗봇(단, 수집함을 휴대폰에서 쓰려면 당길 가치 있음), 일기 잠금·종단 간 암호화(공개 전 검토), 틱틱 나머지 모듈(뽀모도로·습관 등)

## 3. 실행 방법
- 시스템 기본 Node(26)는 깨져 있다(simdutf). **항상 `. scripts/node22.sh`로 Node 22를 쓴다.** Electron 설치·패키징도 Node 22.
- 데스크톱 개발 실행(화면 검사 도구용 원격 디버깅 포함):
  ```bash
  cd apps/desktop && . ../../scripts/node22.sh && npx electron-vite dev --remoteDebuggingPort 9229
  ```
  메인 프로세스·preload는 핫 리로드가 안 된다 → 바꾸면 앱을 껐다 켠다.
- 검사: `npm run typecheck`, `npm test`(성장 계산 등), `npm run test:api`, `npm run test:desktop`, `npm run build`.
- 화면 확인 도구: [scripts/devtools/](scripts/devtools/README.md) (`cdp.mjs`, `shot2.mjs` 등).
- 웹 미리보기: `npm run web` (데스크톱 전용 기능은 제한됨).

## 4. 서버
| 위치 | 상태 | 포트(127.0.0.1) |
|---|---|---|
| 이 Mac (`server/`) | Docker Compose 실행 중. 데스크톱 앱 기본 연결 대상 | API 6060 · PowerSync **8089** · Postgres 55432 |
| Mac mini (SSH 별칭 `macmini`, `~/sprout/server`) | 실행 중, 건강함. AI 프록시 배포(적용 전 백업 `backups/manual/before-ai-20261005.sql`). 23개 테이블 동기화, Ollama(qwen3.5:9b, bge-m3) API에서 접근 확인 | API 6060 · PowerSync 8080 · Postgres **55442** |
- Mac mini 확인: `ssh macmini 'export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH; cd ~/sprout/server && docker compose ps'`
- Mac mini에 붙어 시험: `ssh -L 26060:127.0.0.1:6060 -L 28080:127.0.0.1:8080 macmini` 후 앱을 `SPROUT_API_URL=http://127.0.0.1:26060 SPROUT_SYNC_URL=http://127.0.0.1:28080`로.
- Mac mini에는 다른 서비스도 있다(UniPort 18080, postgres 55432/54329, Ollama 11434, 다른 cloudflared 임시 터널). 건드리지 않는다.
- 스키마 원본은 `packages/schema/src/index.ts` 하나. 바꾸면 `npm run server:schema` + `server/db/migrations/*.sql` 추가 + 두 서버 모두 적용(server/README.md 절차).
- `character`는 Postgres 예약어라 테이블 이름은 `characters`.

## 5. 중요한 결정 기록
- **모든 AI는 오너의 Mac mini Ollama**(qwen3.5:9b). 다른 사용자도 sprout API를 거쳐 같은 Mac mini를 쓴다. 외부 AI API 없음. Mac mini가 꺼지면 AI만 "지금은 쓸 수 없어요", 나머지는 로컬 퍼스트로 동작.
- 성장: 레벨 곡선 40 + 20×(L−1), 단계 시작 레벨 [1,3,6,10,15](아기·꼬마·친구·단짝·전설), 레벨은 내려가지 않음, 할 일 XP 하루 10 상한, 주간 목표 최대 5개·XP 3개까지·2개 이상 전부 달성 보너스 +20, 성향 조사 2축(계획↔즉흥, 몰입↔멀티) → 거북이·다람쥐·고양이·수달. AI 입력에 할 일 제목 포함.
- 2026-10-04 새 탭 결정: 메모 입력 Enter 저장 / 메모함 줄 목록 + 상세 / 작업 지도는 **노드·연결선 그래프(LangGraph처럼)** 가 기본이고 시안의 칸반은 보드 보기 / AI 사용량 필터 버튼 없애고 그룹 접기 / 디자인은 시안 그대로.
- 2026-10-04 추가 결정: 작업 지도 = 선 3종(포함·순서·목표 연결) + 새 할 일 자동 분류 + 칸반 유지 + 영역≠리스트 / 일기 = 성장 캐릭터가 공감·고민 상대, 켜야 동작, 일기로 XP 없음 / 메모함 → **수집함**(카톡 "나에게 보내기" 대신), 링크는 제목·주소만, 카톡은 내보내기 파일 먼저·채널 챗봇 다음 / 주제 위키는 사용자가 원한 "LLM 위키"(자동으로 쌓이는 주제 페이지)로 재정의.
- AI 사용량 화면의 `Unexpected token '<'` 오류: 오래된 preload로 떠 있던 앱 때문(코드 버그 아님). 다시 띄우면 정상.

## 6. 참고 위치
- **원격 저장소: https://github.com/kysk2295/sprout (비공개, `main`)** — 2026-10-04 사용자가 직접 생성·첫 push. 다른 컴퓨터에서는 `gh repo clone kysk2295/sprout`.
- 틱틱 조사: `docs/ticktick-research/` (18 = 노트 목록·칸반 실측)
- 설계 원본: `docs/superpowers/specs/` (노트·비서, 계정 한도)
- 빌드 주의(Electron·npm 11·webpack): [spikes/a1-powersync-electron/RESULT.md](spikes/a1-powersync-electron/RESULT.md)
- 사용자 세컨브레인(맥락이 필요할 때): `~/Library/Mobile Documents/com~apple~CloudDocs/LLM-Wiki/2_wiki/index.md`
