# sprout 모바일 (apps/mobile)

React Native + **Expo SDK 57**(RN 0.86, React 19.2.3) **개발용 빌드**. Expo Go로는 못 연다(PowerSync 네이티브 SQLite).
명세: [20 개요](../../docs/screens/20-mobile-overview.md) · [21 오늘](../../docs/screens/21-mobile-today.md) · [22 빠른 입력](../../docs/screens/22-mobile-quick-add.md) · [23 성장](../../docs/screens/23-mobile-growth.md) · [24 공유](../../docs/screens/24-mobile-share-capture.md). 시안: `docs/screens/mockups/mobile.html`.

## 실행 (iOS 시뮬레이터)
```bash
. scripts/node22.sh            # 저장소 뿌리에서. 항상 Node 22
npm install                    # 뿌리에서(워크스페이스)
cd apps/mobile
npx expo prebuild --platform ios   # ios/ 생성(커밋 안 함). 네이티브 의존성이 바뀌면 다시
npx expo run:ios               # 빌드 + 설치 + Metro. 기기 지정: --device "iPhone 17 Pro"
```
- 이미 설치돼 있으면 `npm run mobile`(뿌리) = `expo start --dev-client`만 띄우고 앱을 연다.
- Android: `ANDROID_HOME=~/Library/Android/sdk JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home npx expo prebuild --platform android` → `npx expo run:android --device <AVD 이름> --port <내 Metro 포트>`. SDK 패키지: platform 36 · build-tools 36 · NDK 27.1.12297006 · CMake 3.22.1. 2026-10-05 에뮬레이터(API 35)에서 가입·동기화·5칸 탭 확인, iOS와 다른 점은 [20 §11](../../docs/screens/20-mobile-overview.md).
- 서버 주소 기본값은 Mac mini 공개 주소(app.json `extra`). 바꾸려면 `EXPO_PUBLIC_API_URL=… EXPO_PUBLIC_SYNC_URL=… npx expo start --dev-client`.

## 검사
- `npm run typecheck:mobile`, `npm run test:mobile`(뿌리) — 테마 색표·보기 묶음·날짜 표기 시험
- 토큰을 바꿨으면 `npm run tokens -w @sprout/mobile` → `src/theme/tokens.generated.ts` 다시 생성(정본 `packages/tokens/tokens.css`)

## 구조
| 위치 | 내용 |
|---|---|
| `app/` | expo-router 화면(파일 경로 = 딥 링크 `sprout://…`). `_layout`(로그인 가드·테마·토스트), `(tabs)/`(할 일·성장·설정), `task/[id]`(상세 시트), `move`·`tags`·`date`(시트), `quick-add`(빠른 입력 기초판), `login`·`signup` |
| `src/data/auth.ts` | 로그인·가입·새로 고침(한 번에 하나)·로그아웃, PowerSync 연결자(`/sync/upload`), 첫 로그인 규칙(서버에 데이터 있으면 내려받기, 없으면 기본함 생성), `syncNow`, `serverAccess`(AI 프록시용) |
| `src/data/db.ts` | PowerSync DB(스키마 = `@sprout/schema` TABLES), `run(stmts)`, `coreDb`(공용 taskCore용) |
| `src/data/tasks.ts` | 할 일 동작: 완료(공용 `@sprout/schema/taskCore` — 반복·하위·XP)·되돌리기·휴지통·날짜·우선순위·고정·이동·태그·체크리스트·새 할 일 |
| `src/data/views.ts` | 보기(오늘·내일·다음 7일·기본함·리스트·폴더·완료·휴지통)별 SQL과 묶음 카드 계산 |
| `src/data/events.ts` | `xpGained`(탭 바 +1), `taskDone`(성장 캐릭터 반응용) |
| `src/theme/` | 13종 테마 색표(`paletteOf`), `ThemeProvider`(동기화되는 `user_prefs.theme` + 시스템 다크), 모바일 크기 `M`·글자 `FONT` |
| `src/ui/` | 유리 머리 버튼·큰 제목·체크박스·할 일 행·묶음 카드·스와이프 행·길게 누름 메뉴·떠 있는 메뉴·서랍·탭 알약·토스트·설정 칸·시트 머리·빈 상태 그림 |

## 다음 작업이 이어 붙일 곳
- **빠른 입력(22)**: `app/quick-add.tsx`(지금은 기초판: 자연어 인식 + 날짜 칩 + 보내기)와 `app/date.tsx`(지금은 빠른 날짜 줄만)를 명세대로 바꾼다. 쓰기는 `createTask`·`moveDates`.
- **알림(20 §4.4)**: `expo-notifications` 추가 → 동기화 뒤 `tasks`·`reminders`로 예약. 알림 완료는 `completeTasks`.
- **성장(23)**: `app/(tabs)/growth.tsx` 자리를 바꾼다. XP·완료 신호는 `events.ts` 구독, 계산은 `@sprout/schema/growth`.
- **공유(24)**: 본 앱은 `serverAccess()`/`db`로 `notes`에 넣는다. 공유 확장은 키체인 공유 그룹에서 액세스 토큰만 읽는다(새로 고침은 본 앱만 — `auth.ts` 머리 설명).

## 주의
- **react는 앱 안 사본(19.2.3)으로 고정**: 뿌리에는 데스크톱용 react 19.3이 있어서 `metro.config.js`가 `react`를 이 폴더 기준으로 찾게 한다. RN 렌더러는 react와 버전이 정확히 같아야 한다.
- iOS formSheet 안에서는 ScrollView가 시트 맨 위에 붙는다 → 시트 머리·검색은 ScrollView **안**에 둔다(`move.tsx`·`tags.tsx` 참고).
- `ios/`·`android/`는 생성물이라 커밋하지 않는다(`.gitignore`).
