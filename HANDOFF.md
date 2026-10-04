# sprout 작업 인계 (2026-10-04 기준, 새 탭 v2 구현 후 갱신)

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
| 성장 루프(성향 조사 → 동물 캐릭터 4종, XP, 주간 목표, 레벨업, 인터랙티브 방) | 1차 완료 | 10-growth |
| AI 비서 | **v2 구현 완료**(2026-10-04, 커밋 0e8fc69). 오너 기기에서 SSH로 Mac mini Ollama, 실제 집계 질문까지 확인 | 13 |
| 수집함(구 메모함) | v2 구현 완료(196caef). **v3(수집·볼 것·LLM 위키·카톡 가져오기) 확정, 구현 전** | 11 |
| 일기 | **v0.3 확정(캐릭터 공감 대화, 방식 하나), 구현 전**. 시안 ⑤ | 15 |
| 작업 지도 | 진입 화면만. **v1.2 확정(그래프 기본 + 보드, 선 3종, 자동 분류), 구현 전** | 14 |
| AI 사용량(CodexBar) | **v2 구현 완료**(721826b). 실계정 조회 확인 | 10-ai-usage |
| 서버(셀프호스트) | 이 Mac·Mac mini 둘 다 실행 중. **공개 주소(Cloudflare Tunnel) 없음** | server/README.md |

시안(디자인 확정본): [docs/screens/mockups/new-tabs.html](docs/screens/mockups/new-tabs.html) — 브라우저로 열면 4개 탭 시안, 라이트/다크 전환.

## 2. 바로 다음 할 일 (순서대로)
1. **서버 저장 칸 묶음 추가** — ⚠️ **사용자 승인 대기 중**(2026-10-04 설명함, 쉬운 말로 다시 설명 요청받음 → "새 정보를 저장할 칸이 없다"로 설명). 한 번에 넣을 것:
   - 작업 지도: `map_areas`, `task_areas`, `map_links` ([14 §5](docs/screens/14-work-map.md))
   - 일기: `diary_entries`, `diary_messages` ([15 §5](docs/screens/15-diary.md))
   - 수집함: `notes` 칸 추가 + `wiki_topics`, `wiki_versions` ([11 v3-6](docs/screens/11-notes.md))
   - 절차: `packages/schema/src/index.ts` → `npm run server:schema` → `server/db/migrations/2026100x-*.sql`(IF NOT EXISTS) → 이 Mac·Mac mini 서버 둘 다 적용(server/README.md). 승인 전에는 손대지 않는다.
2. **작업 지도 구현** ([14 v1.2](docs/screens/14-work-map.md)) — 그래프(기본, `@xyflow/react` + `@dagrejs/dagre`) + 보드, 선 3종(포함·순서·목표 연결), 새 할 일 자동 분류(5초 묶음), 진행 고리·집중 보기·주제 보관.
3. **수집함 v3 구현** ([11 v3](docs/screens/11-notes.md)) — 이름 메모함→수집함, `수집·볼 것·위키`, AI 4갈래 분류(할 일은 제안만), 링크 제목 가져오기(메인 프로세스, 요약 없음), 카톡 내보내기 파일 가져오기(PC·모바일 형식 파서 + 중복 지문), LLM 위키 자동 반영.
4. **일기 구현** ([15 v0.3](docs/screens/15-diary.md)) — 쓰기·돌아보기, 성장 캐릭터 대화(첫 답 공감+질문, 방식 고르기 없이 원하면 같이 정리), 동의·나만 보기, **위기 안전장치(109·1577-0199·112/119)**.
5. **Mac mini 공개 주소** — Cloudflare 계정·도메인 필요(사용자가 직접 로그인). `api`·`powersync`만 공개. 이후 카톡 채널 챗봇도 이게 있어야 가능.
6. **API AI 프록시** (`/ai/assistant`·`/ai/classify`·`/ai/diary`·`/ai/kpi-draft`·`/ai/weekly-report`) — JWT, 대기열, 사용자별 상한, 원문 저장 없음.
7. 이후: 카톡 채널 챗봇, AI 사용량 연결 해제, 비서 ⌘N, 성장 주간 리포트, 패키징, 외부 백업(R2), 비밀번호 재설정, 캐릭터 정식 그림, 일기 종단 간 암호화 검토.

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
| Mac mini (SSH 별칭 `macmini`, `~/sprout/server`) | 실행 중, 건강함. 16개 테이블 동기화, Ollama(qwen3.5:9b, bge-m3) API에서 접근 확인 | API 6060 · PowerSync 8080 · Postgres **55442** |
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
- 틱틱 조사: `docs/ticktick-research/` (18 = 노트 목록·칸반 실측)
- 설계 원본: `docs/superpowers/specs/` (노트·비서, 계정 한도)
- 빌드 주의(Electron·npm 11·webpack): [spikes/a1-powersync-electron/RESULT.md](spikes/a1-powersync-electron/RESULT.md)
- 사용자 세컨브레인(맥락이 필요할 때): `~/Library/Mobile Documents/com~apple~CloudDocs/LLM-Wiki/2_wiki/index.md`
