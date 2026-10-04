# 여러 AI 계정의 구독 한도 대시보드

조사일: 2026-10-04. 상태: 사용자가 CodexBar 방식의 표시와 공급자별 조회 방식을 승인함. 실계정 연결·응답 검증 전.

## 목적

GPT/Claude/Grok/Gemini의 여러 계정을 한곳에 등록해 남은 구독 사용 한도와 초기화 시각을 본다. sprout 내부 AI 토큰 집계와 별도 기능이다. API 비용·토큰 집계는 첫 범위에서 제외한다. 계정 연결은 조회용이며 사용 계정을 자동 전환하거나 요청을 분산하지 않는다.

## 조사 결과와 지원 범위

| 서비스 | 확인된 근거 | 구현 후보 및 한계 |
|---|---|---|
| OpenAI | 공식 Codex 소스에 account/rateLimits/read 구현이 있다. CodexBar는 OAuth, app-server 및 웹 경로를 사용한다. | 우선 Codex 구독 한도. 이것을 일반 ChatGPT 채팅 한도라고 표시하지 않는다. ChatGPT 채팅 전체 한도 조회는 이번 조사에서 확정하지 못했다. |
| Claude | 공식 도움말에 웹·Desktop·Code의 구독 한도 공유가 설명되어 있다. CodexBar는 OAuth/CLI/웹 경로를 제공한다. | 구독 한도 조회 후보. 오픈소스의 연결 성공이 제3자용 공식 OAuth 등록·API 계약을 보장하지 않는다. 실제 계정 응답·권한 범위 검증 필요. |
| Gemini | CodexBar는 Gemini CLI OAuth와 private quota API를 사용한다. 공식 Gemini Apps 도움말에는 별도 앱 한도가 설명되어 있다. | CLI/Code Assist 지표를 Gemini Apps 한도로 대체하지 않는다. 일반 Gemini 채팅 잔여 한도와 다중 계정 연결은 검증 전이다. 오래된 CLI 문서는 최신 배포 지원 보장이 아니다. |
| Grok | 공식 FAQ는 SuperGrok의 제품 간 공유 주간 한도를 설명한다. CodexBar는 CLI/OAuth billing 및 웹 대체 경로를 구현한다. | 공유 구독 한도 후보. CLI credit 지표의 실제 플랜·범위를 확인해야 한다. 일부 버전의 ACP billing 미지원 및 팀 계정 조회 제약이 문서화되어 있다. |

근거의 등급을 구분한다. 공식 문서·공식 소스는 제품 기능 근거다. CodexBar 문서는 그 프로젝트의 통합 방식에 대한 일차 자료이며, 공급자가 외부 앱에 해당 연동을 공식 지원한다는 증거는 아니다. 네 서비스 모두의 ‘범용 OAuth 로그인 버튼’을 현재 지원한다고 약속하지 않는다.

## 확정 기준: CodexBar 방식

사용자 확인: CodexBar처럼 계정별 사용 한도를 표시하면 된다. 별도 범용 OAuth 서비스를 새로 설계하는 대신 CodexBar의 공급자별 조회 방식과 지원 범위를 구현 참고 기준으로 삼는다. 앱 내부 AI 호출 통계는 이 화면의 데이터 소스가 아니다.

- 서비스 아래 여러 계정 카드를 동시에 표시한다. 한 계정만 선택해서 보도록 제한하지 않는다.
- 카드의 각 한도는 남은 비율을 중심으로 표시하고 기간 이름·초기화까지 남은 시간·정확한 초기화 시각을 제공한다.
- 첫 화면에 전체 계정의 상태가 보인다. 각 카드에서 갱신·재연결·별칭 변경·연결 해제를 제공한다.
- CodexBar가 제공하는 값이라도 제품 범위와 출처를 유지한다. 지원하지 않는 값은 빈 막대나 임의 숫자로 대체하지 않는다.
- CodexBar 설치 의존 또는 소스 이식 중 어느 방식을 사용할지는 소스·라이선스·배포 호환성 검토로 결정한다. 사용자가 CodexBar 별도 설치를 승인한 것으로 간주하지 않는다.

## 연결 및 다중 계정

계정 레코드는 provider + 공급자 account ID + workspace ID + 연결 프로필 ID로 구분한다. 이메일은 표시값이며 유일 키가 아니다. 별칭은 개인/업무/서브 등 사용자가 정한다.

- 공급자가 외부 앱용 OAuth 등록을 지원하면 그 방식으로 연결한다.
- CLI 지원 경로는 계정별 격리된 프로필로 로그인·조회한다. 각 CLI의 실제 프로필 지원을 확인한 뒤 활성화한다.
- 공개 OAuth 지원이 확인되지 않은 서비스는 ‘OAuth 지원’으로 표시하지 않는다. 검증된 세션 방식이 있다면 연결 화면에 그 차이를 설명한다.
- 기존 CLI 로그인 파일을 자동 덮어쓰거나 다른 계정 자격 증명으로 교체하지 않는다.
- 자격 증명은 로컬 OS 보안 저장소/계정별 보호된 세션에 보관한다. PowerSync·메모 DB·로그에 토큰이나 쿠키를 넣지 않는다.
- 계정별 갱신 요청, 취소, 캐시, 재로그인을 격리한다. 늦게 도착한 응답의 계정이 다르면 폐기한다.
- 연결 해제는 sprout의 해당 연결만 제거한다. 공급자 계정 삭제·다른 앱 로그아웃과 구분한다.

## 공통 응답 모델

Account: id, provider, externalAccountId, workspaceId, alias, displayIdentity, planLabel, credentialRef, connectionKind.
Snapshot: accountId, productScope, sourceKind, observedAt, status, windows.
Window: id, label, usedPercent?, remainingCount?, limitCount?, resetsAt?, durationSeconds?, unit.

status는 fresh/stale/auth_required/unavailable/unsupported/error로 구분한다. 값이 없으면 null이며 0% 사용/100% 남음으로 치환하지 않는다. 공급자가 보고한 기간과 단위를 유지하며 주간·세션을 하드코딩하지 않는다. 백분율은 분모가 알려져 있거나 공급자가 직접 반환할 때만 표시한다. 서로 다른 서비스의 퍼센트를 합산하지 않는다.

## 화면

독립적인 ‘AI 사용량’ 메뉴. 상단 계정 추가·전체 갱신·서비스 필터. 본문 서비스별 계정 카드. 카드에는 별칭, 서비스/제품 범위, 구독 플랜, 각 한도 막대, 초기화 시각, 연결 상태, 마지막 성공 갱신 시각을 표시한다.

조회 불가는 숫자 막대 없이 이유와 원본 사용량 페이지 열기를 제공한다. 오래된 값은 마지막 확인값으로 명시하고 현재 사용 가능 판정을 하지 않는다. 한도 시각이 지나도 100%로 임의 초기화하지 않고 재조회한다.

표시된 계정은 기본 5분 주기로 갱신하며 새로고침은 동시 요청을 합친다. 공급자 Retry-After와 실패 백오프를 우선한다. 잠자기 후 한 번 갱신한다. 계정별 인증 오류는 해당 계정만 중지한다. 서비스별 지원 상태가 미검증이면 로그인 성공처럼 보이는 더미 연결을 제공하지 않는다.

## 구현 순서

1. 계정/한도 응답 형식과 공급자별 지원 범위 표를 만든다.
2. 공식 Codex app-server 경로로 계정 식별·한도 조회를 검증한다. 격리된 두 계정으로 혼합 여부를 검사한다.
3. Claude 연결 경로·권한·한도 응답을 실계정으로 검증한다.
4. Gemini Apps 및 SuperGrok의 실제 구독 범위·연결 지원을 검증한다. 확인하지 못하면 해당 카드는 미지원으로 유지한다.
5. 통과한 공급자만 대시보드 연결 기능으로 노출한다. 네 서비스 전체 지원 완료 여부를 별도로 보고한다.

단순히 Codex와 Gemini CLI만 연결한 상태를 사용자가 요청한 네 채팅 서비스의 전체 한도 지원 완료로 보고하지 않는다.

## 검증 기준

- 동일 서비스 두 계정의 로그인·갱신·재로그인·연결 해제가 서로 영향 없음.
- 이메일이 같아도 워크스페이스가 다르면 데이터 분리.
- 계정 변경 중 늦은 응답, 부분 응답, 401/403/429, 타임아웃, 초기화 시각 경과 검증.
- null, 무제한, 알 수 없는 분모, 새 한도 종류가 거짓 숫자로 표시되지 않음.
- 공급자 원본 화면과 계정·제품 범위·기간·남은 값·초기화 시각 대조.
- 자동 갱신이 모델 추론이나 유료 결제를 실행하지 않음.
- 토큰·쿠키가 렌더러, 진단 로그, 동기화 저장소에 노출되지 않음.

## 출처

- OpenAI 공식 도움말: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- OpenAI 공식 소스: https://github.com/openai/codex/blob/main/codex-rs/app-server/src/request_processors/account_processor.rs
- Claude 공식 한도: https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work
- Gemini Apps 공식 한도: https://support.google.com/gemini/answer/16275805
- Google Code Assist 공식 한도: https://docs.cloud.google.com/gemini/docs/quotas
- Grok 공식 FAQ: https://docs.x.ai/grok/faq
- CodexBar 구현 문서: https://github.com/steipete/CodexBar/blob/main/docs/codex.md
- https://github.com/steipete/CodexBar/blob/main/docs/claude.md
- https://github.com/steipete/CodexBar/blob/main/docs/gemini.md
- https://github.com/steipete/CodexBar/blob/main/docs/grok.md

위 링크는 조사 시점 main/현재 문서이다. 실제 어댑터 구현 시 참고 소스의 커밋을 고정하고 라이선스를 확인한다.
