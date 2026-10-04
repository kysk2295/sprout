# A1 스파이크 결과 — PowerSync in Electron

- 날짜: 2026-09-13
- 가정: "PowerSync가 Electron에서 안정적으로 동작한다" (PRD 7.4 A1)
- **결론: 통과.** 메인 프로세스에서 `@powersync/node`로 개발 모드와 패키징 빌드 모두 동작했다.

## 구성
- 클라이언트: PowerSync 공식 예제 `example-electron-node` 기반. Electron 37, `@powersync/node` 1.0.1, core extension 0.5.3.
- 백엔드: `./backend` — PowerSync 공식 셀프호스트 예제 `nodejs-postgres-bucket-storage`. Docker Compose로 Postgres 18(`wal_level=logical`) + 버킷 저장용 Postgres + PowerSync Service(Open Edition) + Node 인증/업로드 서버를 띄운다. MongoDB가 필요 없어 Mac mini에 적합하다.
- 테스트 제어: 메인 프로세스의 `http://127.0.0.1:7777`(`/status`, `/todos`)로 UI 없이 curl로 검증했다.

## 결과
| # | 시나리오 | 결과 |
|---|---|---|
| T0 | 앱 시작 → 서버에서 내려받기 | ✅ 시드 2건이 로컬 SQLite에 동기화됨 |
| T1 | 온라인 로컬 쓰기 → Postgres | ✅ 업로드됨, 대기 0 |
| T2 | Postgres 직접 쓰기 → 앱 | ✅ 약 1초 안에 로컬에 반영 |
| T3 | PowerSync·백엔드 중지 → 로컬 쓰기 → 재시작 | ✅ 오프라인에서 쓰기 성공(연결 끊김, 대기 1, 서버 0건). 재시작 후 **11초** 만에 자동 업로드, 대기 0 |
| T4 | 패키징 빌드(.app)에서 쓰기 | ✅ extension이 `app.asar.unpacked/.webpack/main/powersync/`에 들어가서 로드되고, 업로드됨 |

## 부딪힌 문제와 해결 (본 개발에 그대로 적용)
1. **Node 26에서 `extract-zip`이 중간에 조용히 끝난다**(종료 코드 0, 파일 누락). 그래서 Electron 설치와 `electron-forge package`가 둘 다 결과물 없이 "성공"한다. → **Electron 빌드 도구는 Node 20/22로 돌린다.** 이번에는 `/opt/homebrew/opt/node@20`을 썼다. Node 20은 지원이 끝났으므로 본 개발 전에 Node 22 LTS를 설치한다.
2. **npm 11이 설치 스크립트를 기본 차단한다**(`allow-scripts`). `electron`, `better-sqlite3` 등의 postinstall이 실행되지 않는다. → `npm approve-scripts`로 허용 목록을 관리하거나, `electron-rebuild`를 명시적으로 실행한다.
3. **webpack 5.110.x가 `new Worker(new URL(...))`를 잘못 변환한다**(`Worker__webpack_require__.wc(`). → webpack `5.99.9`로 고정했다. 본 개발에서는 Vite 기반(electron-vite 등)으로 가거나 버전을 고정한다.
4. 예제의 `SyncStatus.toJSON()`이 설치 버전에 없다. → 필요한 필드만 뽑는 함수로 바꿨다.
5. 예제 `tsconfig.json`의 `paths`가 tsx와 충돌한다(모노레포 잔재). → 삭제했다.

## 본 개발로 넘길 것
- 업로드 API(`POST /api/data {batch:[{op,table,id,data}]}`)와 JWT 발급(`/api/auth/token`, JWKS)은 예제 서버를 그대로 쓸 수 없다. 자체 Node API에서 **실제 로그인과 사용자별 권한 검사**를 붙여 다시 만든다.
- 동기화 규칙(`sync-config.yaml`)이 지금은 전역(`SELECT * FROM todos`)이다. **사용자별 버킷**(`owner_id = auth.user_id()`)으로 바꿔야 한다.
- 오프라인 복구 시간(11초)은 재연결 백오프 때문이다. 틱틱 체감에 맞게 조정할 수 있는지 확인한다.

## 재현
```bash
cd backend && docker compose -f demos/nodejs-postgres-bucket-storage/docker-compose.yaml up -d pg-db pg-storage powersync demo-backend
cd .. && PATH=/opt/homebrew/opt/node@20/bin:$PATH npm start
curl localhost:7777/status
```
