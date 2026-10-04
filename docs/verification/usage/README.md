# AI 사용량 — 2026-10-04

## 제공 범위
설치된 CodexBar CLI 0.67.0의 usage JSON을 조회 전용으로 사용. 렌더러에 자격 증명/원본 페이로드를 전달하지 않으며, 허용한 계정·한도 필드만 투영한다. 네이티브 IPC와 localhost 개발 미리보기 모두 같은 서비스 코드를 사용한다.

- Codex: --all-accounts --source oauth. 실제 두 계정 발견, 한 계정 auth refresh 필요, 다른 계정 주간 46% 남음 표시. 일반 ChatGPT 채팅 한도로 표시하지 않음.
- Grok: --all-accounts 결과가 계정 없음이면 기존 로그인 조회. 실제 SuperGrok 주간 33% 남음, grok-cli-proxy 출처 표시.
- Claude: OAuth 조회 연결 구현. 현재 로그인 정보가 없어 재인증 필요 표시. 실계정 한도 성공 검증은 아직 불가.
- Gemini: CLI/Code Assist 현재 로그인 조회 연결 구현. 로그인 정보 없음. Gemini Apps 채팅 한도 아님. 현재 CLI가 다중 토큰 계정을 지원하지 않아 1개 로그인만 조회.
- 로그인·추가·재인증은 CodexBar에서 관리. 별도 OAuth 서버/자격 증명 저장/로그인 교체를 구현하지 않음. CodexBar 열기 실제 동작 성공. 앱의 숨기기는 대시보드 표시만 변경.

## 기능과 검증
- 전체/공급자 갱신, 공급자별 결과 독립 표시, 서비스 필터, 계정 별칭, 숨김·복원, 원본 페이지 링크.
- 5분 자동 갱신과 창 복귀 시 캐시 조회. 동시 요청 합치기. 수동 갱신 30초 이내 캐시 재사용. 실패 지수 백오프(반환된 공급자 오류), 429에 15분 대기. CodexBar가 Retry-After 원값을 노출하지 않아 정확한 공급자 대기 시간을 전달받는 것은 미지원.
- 만료 시각 이후 이전 값을 100%로 바꾸지 않으며 재조회 요청. 오래된 값은 마지막 확인값으로 표시. 프로세스 내 캐시는 재시작 시 초기화된다.
- 테스트: 여러 프로필/워크스페이스 분리, 누락/0/범위 초과 백분율, raw token 필드 제거, 다른 공급자/중복 identity 응답 거부, 오래된/리셋 지난 값, 요청 합치기, 30초 캐시, CLI 미설치, 한 계정 실패와 다른 계정 성공 공존.
- 실 UI: Codex 2계정 표시, 별칭 변경 후 복원, 숨기기→숨긴 계정 보기→다시 표시, 연결 안내 및 CodexBar 열기, 전체 갱신 확인.
- typecheck, desktop data tests, Electron production build 통과. 네이티브 앱 로그인 후 IPC UI 실행은 미검증. 실계정 대조는 설치된 CodexBar CLI 응답과 브라우저 카드 간에 수행.

## 근거
CodexBar 문서/라이선스 확인 커밋: 6dca28df4a543ee445fd12717057c1dd7b1f572d (MIT). 외부 CLI를 호출하며 코드를 복사/재배포하지 않는다.
- https://github.com/steipete/CodexBar/blob/6dca28df4a543ee445fd12717057c1dd7b1f572d/docs/cli.md
- https://github.com/steipete/CodexBar/blob/6dca28df4a543ee445fd12717057c1dd7b1f572d/docs/gemini.md
- https://github.com/steipete/CodexBar/blob/6dca28df4a543ee445fd12717057c1dd7b1f572d/docs/grok.md

## App-owned login flow — 2026-10-04 follow-up
- Replaced CodexBar settings handoff with provider selection, official browser login, waiting/cancel/retry states and successful-login refresh in sprout.
- Codex / Claude / Grok use installed official CLI login commands with independent UUID directories. CLI credentials remain in protected provider profiles / provider-owned Keychain; renderer only receives status and allowlisted authorization URL. Ambient CLI and CodexBar settings are untouched. Failed/cancelled profiles are never published.
- Gemini account addition is explicitly unavailable with the current installed CLI; ambient usage remains. This is not four-provider login completion.
- Real browser UI: Codex auth.openai.com and Grok auth.x.ai links generated; cancellation restored provider buttons. Claude CLI output uses claude.com, added to the allowlist after a real isolated login probe. No user login was submitted. Real authenticated completion and quota retrieval for newly added profiles remain unverified (require user authentication).
- Unit checks: environment isolation, provider/ID rejection, URL allowlist, cancellation followed by late success, success metadata, failure metadata. All desktop tests and typecheck passed; Electron production build passed.
- Evidence: login-waiting.png (Codex pending state). Existing dashboard evidence is from before login flow replacement.
- Claude follow-up: actual UI verified claude.com authorization link and manual-code callback. Added one-time-code input routed only to active CLI stdin; unit test verifies invalid/newline input rejection and single-session delivery. No real authentication code submitted.
