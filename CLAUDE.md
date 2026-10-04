# sprout — 프로젝트 지침

틱틱(TickTick)만큼 편한 할 일·캘린더 앱에 성장 루프(KPI → XP → 캐릭터 진화)를 얹은 제품. 코드네임 `sprout`, 정식 제품명은 출시 전에 정한다.

## 정본 문서
- 제품 범위·결정: [PRD-sprout.md](PRD-sprout.md) — v1 범위 밖 기능은 만들지 않고 백로그로 보낸다.
- 틱틱 조사 자료: `docs/ticktick-research/` — UI·UX·인터랙션의 근거.
- 화면 명세: `docs/screens/*.md` — 개발의 직접 입력.

## 개발 규칙: 화면 명세 먼저, 코드는 그 다음
1. **화면을 개발하기 전에 반드시 `docs/screens/<화면이름>.md`를 먼저 만든다.** 명세 없이 화면 코드를 쓰지 않는다.
2. 화면 명세에는 최소한 다음을 담는다.
   - 틱틱 기준 화면: 참고한 조사 자료 링크
   - 레이아웃: 영역 구성, 크기, 반응형 동작
   - 구성 요소: 컴포넌트 목록과 상태(기본·호버·선택·비활성·로딩·빈 상태·오류)
   - 인터랙션: 클릭, 더블클릭, 우클릭 메뉴, 드래그, 키보드 단축키, 애니메이션
   - 데이터: 읽고 쓰는 테이블·필드
   - 완료 기준: 틱틱과 나란히 놓고 확인할 체크리스트
3. 명세를 사용자와 확인한 뒤 그 명세를 바탕으로 개발을 시작한다. 구현하다 명세와 달라지면 명세를 먼저 고친다.

## UI·UX 원칙
- **UI·UX·인터랙션은 전부 틱틱을 따른다.** 새로 발명하지 않는다. 틱틱에 없는 화면(성장 루프·캐릭터 등)만 틱틱의 디자인 언어에 맞춰 새로 설계한다.
- 근거는 `docs/ticktick-research/`의 외부 조사 자료다. 조사에 없는 동작은 추측하지 말고 조사부터 보강한다.
- 공개 출시 제품이므로 틱틱의 로고, 이름, 아이콘·일러스트 원본 파일은 쓰지 않는다. 배치·동작·흐름은 따르되, 이런 자산은 직접 만들거나 오픈 라이선스 자산을 쓴다.

## 기술
- 데스크톱: Electron + React + TypeScript. PowerSync는 메인 프로세스에서 `@powersync/node`로 돌린다.
- 모바일(v1 최소형): React Native, 동기화 스키마를 공유한다.
- 백엔드: **셀프호스트** — 남는 Mac mini에서 Docker Compose로 Postgres(`wal_level=logical`) + PowerSync Service(Open Edition) + Node API(인증 JWT 발급·업로드·AI 프록시)를 띄우고, Cloudflare Tunnel로 공개한다. Supabase는 쓰지 않는다.
  - 같은 compose 파일을 Railway·VPS로 그대로 옮길 수 있게 유지한다(대안 배포처: Railway).
  - Postgres 자동 백업을 외부 저장소로 보낸다. 공개 사용자 데이터가 있으므로 필수다.
- AI는 서버에서만 호출하고, 사용자당 주 2회 상한을 서버에서 강제한다.

## 빌드 도구 주의 (A1 스파이크에서 확인)
- **Electron 설치·패키징은 Node 20/22로 돌린다.** 시스템 기본 Node 26에서는 `extract-zip`이 조용히 실패해서, 결과물 없이 "성공"으로 끝난다.
- npm 11은 설치 스크립트를 기본으로 막는다. `electron`, `better-sqlite3` 등은 `npm approve-scripts`로 허용하거나 `electron-rebuild`를 명시적으로 실행한다.
- webpack 5.110.x는 `new Worker(new URL(...))` 변환이 깨진다. webpack을 쓴다면 5.99.x로 고정한다.
- 상세: [spikes/a1-powersync-electron/RESULT.md](spikes/a1-powersync-electron/RESULT.md)
