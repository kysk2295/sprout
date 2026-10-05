# 24 · 모바일 — 공유하기로 수집함 (다른 앱 → sprout 수집함)

- 상태: **확정 v1.1** (2026-10-05 Android 공유 받기 구현 — §8) · 확정 v1.0 (2026-10-05) — 20 §0의 제안대로 사용자 승인. 이전 v0.2 (2026-10-04).
- 시안: [mockups/mobile-sprout.html](mockups/mobile-sprout.html) **C1**(공유 카드) · **C2**(저장됨 · 로그아웃 상태). 수집함 목록은 [26](26-mobile-collect.md) [다음]
- 조사: [research 25 §3](../ticktick-research/25-mobile-sprout-patterns.md)(iOS 공유 확장 두 방식·메모리 120MB·App Groups·Todoist/Raindrop/Things 공유 화면), §7(카카오톡 '나에게 보내기' 습관)
- 근거: PRD §8 출시 경로 7 "모바일 최소형(… + 공유하기로 수집함)", PRD §7.2 G(카톡 "나에게 보내기" 대신), [11 수집함 v3](11-notes.md)
- 앞선 명세: [20 개요](20-mobile-overview.md), [11 v3-3·v3-6](11-notes.md)
- 표기: **[틱틱]** · **[sprout]** · **[임시]** · **[다음]**

### v0.1 → v0.2 바뀐 점
| 바뀜 | 이유 |
|---|---|
| "덧붙이기"를 편집 칸 첫 줄 자리 표시 → **따로 된 한 줄 입력**(연필 아이콘 · `메모 덧붙이기 — 예: 금요일까지 보기`)으로, 공유된 글은 그 아래 | 공유 글이 이미 있으면 자리 표시가 안 보여서 덧붙일 수 있다는 걸 모른다(시안 확인) |
| 저장 뒤 확인을 **가운데 작은 카드**(초록 체크 원 56 · `저장했어요` · 2줄 설명)로, 0.8초 뒤 닫힘 | 공유 카드가 사라지고 확인만 남아야 "됐다"가 분명하다 |
| 처음 한 번 개인정보 안내를 카드 **안쪽 띠**(강조색 연한 면 · 🔒 · `알겠어요`)로 | 카드 위 별도 안내는 시트 높이를 늘린다 |
| 구현 방식 제안: 공유 카드는 **작은 네이티브(Swift) 화면** | iOS 확장 메모리 약 120MB 한도, RN 확장 경험담(research 25 §3) |

## 0-1. 결정 (확정 2026-10-05 — 제안대로)
| # | 질문 | 결정(= 제안) |
|---|---|---|
| M-S1 | 링크만 공유하면 AI 없이 바로 "볼 것"? (= 20 D9) | **예** — 데스크톱 `itemRow`와 같은 결과(§5) |
| M-S2 | iOS 공유 카드를 RN으로? 네이티브로? | **네이티브(Swift) 작은 화면** + App Group 대기열. Android는 본 앱 Activity(RN) |
| M-S3 | Android에서 여러 개(`SEND_MULTIPLE`)·사진도? | v1은 **글·링크 하나**(`text/plain`)만 |

## 0. 한 줄
유튜브·브라우저·카카오톡·메모 앱 어디서든 **공유 → sprout** 를 누르면 그 글·링크가 **수집함 항목**으로 바로 저장되고, 분류(할 일·볼 것·위키·메모)는 나중에 AI가 한다(11 v3-3). 휴대폰에서 카톡 "나에게 보내기"를 대신하는 입구.

## 1. 틱틱 기준 자료
| 부분 | 근거 |
|---|---|
| iOS 공유 확장으로 추가, 공유 화면에서 속성도 고름 | [research 20 §6](../ticktick-research/20-mobile.md) |
| Android 공유: 공유한 글 = 제목, 링크는 항목에 붙어 남음 | [research 20 §6](../ticktick-research/20-mobile.md) |
| **차이 [sprout]** | 틱틱은 "할 일"로 받는다. sprout는 **수집함 항목**으로 받고 날짜·리스트를 묻지 않는다(분류는 AI, 할 일 등록은 사용자 한 번 누름 — 11 v3-3) |
- 공유 화면의 실제 크기·문구는 미확인 → 아래 배치는 [임시], 실기기에서 틱틱 공유 화면과 나란히 본다.

## 2. 레이아웃
### 2.1 공유 카드 (iOS 공유 확장 · Android 공유 받기 공통 모양)
| 영역 | 내용 |
|---|---|
| 모양 | 아래에서 올라오는 카드(iOS 확장 기본 시트 / Android 반투명 덮개 위 카드), 모서리 16, 배경 `color.bg.popover` |
| 모양 상세 | 높이 약 500(내용에 따라), 위 모서리 22(키트 시트), 맨 위 잡는 막대 |
| 머리 (52) | 왼쪽 `취소` · 가운데 **`수집함에 넣기`**(17/600) · 오른쪽 **`넣기`**(강조색, 600). 아래 0.5 구분선 |
| 덧붙이기 (44) | 회색 입력 한 줄(모서리 10): 연필 아이콘 + 자리 표시 `메모 덧붙이기 — 예: 금요일까지 보기`. 누르면 키보드 [sprout] |
| 공유된 글 | 그 아래 공유 내용(16/23, 최대 6줄 보이고 스크롤, 주소는 2차 글자색). 고칠 수 있다 |
| 링크 줄 | 링크가 있으면: 사이트 표시(유튜브 = 빨간 재생 칸, 그 밖 = 링크 칸) + 제목(공유 쪽이 준 것, 없으면 주소) + 3차 도메인. 11 v3-2 볼 것 행과 같은 표시 |
| 안내 한 줄 | ✦ + 3차 글자 `AI가 할 일·볼 것·위키·메모로 정리해 둘게요` |
| 개인정보 띠 (처음 한 번) | 강조색 연한 면 · 🔒 · `수집함 글은 외부 AI가 아니라 sprout 서버(운영자의 Mac mini) AI가 정리해요.` + `알겠어요`(강조색). 누르거나 한 번 넣으면 다시 안 보임 |
- 날짜·리스트·태그 고르기는 **없다**(분류는 수집함에서) [sprout — 빠르게 던지기가 목적].

### 2.2 저장 뒤
- 공유 카드가 내려가고 화면 가운데 **확인 카드**(좌우 24, 모서리 20): 초록 원 56 + 흰 체크(그려지는 애니메이션 0.4초) · `저장했어요`(19/700) · 3차 2줄 `수집함에서 AI가 정리해 둘게요` / `할 일 같으면 등록할지 물어볼게요`. **0.8초 뒤 저절로 닫혀 원래 앱으로 돌아간다** [임시 — 다른 앱의 자동 닫힘은 미확인, research 25 §3]. sprout 앱을 열지 않는다. 성공 흔들림 한 번.
- 오프라인·토큰 만료여도 같은 확인 카드(기기 대기열에 저장 — §3).

## 3. 구성 요소와 상태
| 상태 | 표시·동작 |
|---|---|
| 글만 공유 | 편집 칸에 글 |
| 링크만 공유(사파리·유튜브) | 편집 칸에 주소 한 줄 + 링크 줄. 공유 쪽이 제목을 함께 주면(`글 + 주소`) 둘 다 넣는다: `<제목>\n<주소>` |
| 글 + 링크(카톡 메시지 등) | 그대로 |
| 여러 개(글 여러 덩어리) | 하나의 항목으로 이어 붙인다(줄바꿈) [임시] |
| 사진·동영상·파일 | v1 받지 않음 → 공유 목록에 sprout가 **아예 안 뜨게** 받는 종류를 글·링크로 제한. 사진 수집은 [다음](업로드 저장소 필요 — 서버 변경) |
| 빈 내용으로 `넣기` | 흐림(눌리지 않음) |
| 로그아웃 상태 | 공유 카드 대신 아래 작은 카드: ⚠️ `sprout에 먼저 로그인해 주세요` + [sprout 열기](강조색 작은 버튼) — 시안 C2 아래 |
| 저장 중 | `넣기` 자리 작은 스피너, 1초 안 |
| **온라인** | 바로 서버에 올림 → 컴퓨터 수집함에 곧 `정리 중…`으로 나타남 |
| **오프라인·토큰 만료** | 휴대폰 안 대기열에 저장하고 똑같이 `저장했어요 ✓`. 다음에 sprout 앱이 열리면 로컬 DB에 넣고 동기화로 올라간다. 대기 중인 게 있으면 앱 오늘 탭 위에 띠 `공유한 2개를 수집함에 넣는 중…` [임시] |
| 실패(대기열 쓰기도 실패 — 거의 없음) | 카드에 빨간 한 줄 `저장하지 못했어요. 다시 시도해 주세요` + 글 유지 |

## 4. 인터랙션
| 동작 | 결과 |
|---|---|
| 다른 앱 공유 버튼 → `sprout` | 공유 카드. 처음 한 번은 iOS 공유 목록 `더 보기`에서 sprout를 켜야 할 수 있다 → 앱 설정 탭에 안내 `공유 목록에 sprout 추가하는 법` [sprout] |
| `넣기` | 저장(§5) → `저장했어요 ✓` → 닫힘 |
| `취소` / 아래로 끌기 / Android 뒤로 | 저장 없이 닫힘 |
| 키보드 | **초점 없이** 연다(대부분 그냥 `넣기`). 덧붙이기 줄을 누르면 키보드 [임시] |
- 처음 공유할 때 한 번: 카드 안 개인정보 띠(§2.1) [11 v3-6 개인정보 안내와 같은 뜻, 한 번만].

## 5. 데이터
| 항목 | 값 |
|---|---|
| 테이블 | `notes`(11 v3 칸, **스키마 변경 없음**) |
| `id` | 휴대폰에서 만든 uuid — 직접 업로드와 대기열 양쪽에 **같은 id**를 써서 두 번 들어가도 한 줄(업로드 PUT = 있으면 덮어쓰기) |
| `content` | 덧붙인 글 + 공유 내용(앞뒤 공백 정리) |
| `url` | 내용의 첫 링크(데스크톱 `firstUrl`과 같은 규칙 — 공용으로 옮김, 20 §4.2) |
| `kind` / `kind_source` | **NULL / NULL** (AI가 정함) |
| `ai_state` | **`'pending'`** → 데스크톱 수집기(또는 [다음] 서버 AI 프록시)가 집어 가서 분류. 링크 제목(`link_title`)도 데스크톱이 가져온다(11 v3-3, 휴대폰은 하지 않음) |
| `source` | **`'app'`** |
| `captured_at` | 공유한 시각(로컬 ISO). 대기열에서 늦게 들어가도 원래 시각 유지 |
| `fingerprint` | NULL (카톡 가져오기 전용 칸) |
| `created_at` / `modified_at` / `owner_id` | 공유 시각 / 같음 / 서버가 로그인 사용자로 강제 |
- 확인할 점 [임시]: 데스크톱 `itemRow`는 **링크만 있는 글**이면 AI 없이 바로 `kind='link'`, `ai_state='done'`으로 둔다. 휴대폰도 같은 공용 함수를 쓰면 이 규칙을 따르게 된다 → 사용자 확인: (가) 이 명세대로 언제나 `pending`(AI가 판단) / (나) 데스크톱과 같게 "링크만이면 바로 볼 것". **제안: (나)** — 데스크톱과 결과가 같고 Mac mini 부담이 준다.

### 저장 경로 (기술)
1. **iOS 공유 확장은 본 앱과 다른 작은 프로그램**이라 PowerSync DB를 같이 열지 않는다(동시 쓰기 위험).
2. 온라인이고 액세스 토큰이 유효하면(키체인 공유 그룹에서 읽음) 확장이 직접 `POST /sync/upload` `[{op:'PUT', table:'notes', id, data:{…}}]` — **기존 API 그대로**.
3. 아니면 App Group 공유 폴더의 대기열 파일(JSON 줄)에 쓴다. 본 앱이 앞으로 올 때 대기열을 읽어 로컬 DB에 같은 id로 INSERT OR IGNORE → PowerSync가 올린다 → 대기열 비움.
4. 리프레시 토큰은 확장에서 쓰지 않는다(쓸 때마다 바뀌어 본 앱 로그인이 깨질 수 있음). 토큰이 만료면 3번.
5. Android는 공유가 본 앱(MainActivity)으로 열려 바로 로컬 DB에 쓴다(1~4 불필요) — 구현은 §8.
- 라이브러리 후보(구현 때 하나 고름): `expo-share-intent`(커뮤니티, App Group 설정) / Expo 공식 `expo-sharing`의 받기 기능 / iOS 맞춤 화면이 필요하면 `expo-share-extension`.

## 6. 완료 기준
- [ ] 시안 C1·C2와 나란히: 머리 문구·버튼 위치, 덧붙이기 줄, 링크 줄, 확인 카드, 로그아웃 카드(라이트·다크).
- [ ] 유튜브 앱 공유 → sprout → `넣기` → 몇 초 안에 데스크톱 수집 탭에 항목, 정리 뒤 볼 것에 영상 제목.
- [ ] 카톡 메시지 `내일 3시 치과` 공유 → 데스크톱에서 `할 일 제안 · 내일 오후 3:00`(11 v3-7 첫 줄과 같은 결과).
- [ ] 비행기 모드에서 공유 → `저장했어요` → 연결 후 sprout를 열면 올라가고, 두 번 들어가지 않는다.
- [ ] 사진만 공유할 때는 공유 목록에 sprout가 보이지 않는다.
- [ ] 로그아웃 상태 안내, 처음 한 번 개인정보 안내.
- [ ] iPhone·Android, 라이트·다크에서 카드가 틱틱 공유 화면과 비슷한 무게(크기·버튼 위치)다.

## 7. 구현 메모 (2026-10-04, iOS)
| 부분 | 위치 · 내용 |
|---|---|
| 공유 확장(Swift) | `apps/mobile/plugins/share-extension/ios/` — `ShareViewController`(받은 글·링크 꺼내기), `ShareView`(SwiftUI 카드 C1·확인 C2·로그아웃 카드), `ShareCore`(링크 판정·행·대기열·업로드). 타깃 `SproutShare`, 번들 `app.sprout.mobile.share` |
| config 플러그인 | `apps/mobile/plugins/share-extension/index.js` — `expo prebuild` 때마다 타깃·entitlements·소스를 다시 붙인다(ios/는 커밋 안 함). app.json `plugins`에 `["./plugins/share-extension", { "teamId": "BU697KN34B", "appGroup": "group.app.sprout.mobile" }]` |
| 이름 | App Group `group.app.sprout.mobile`, 키체인 공유 그룹 `BU697KN34B.app.sprout.mobile.shared`(접두사를 글자로 박음 — `$(AppIdentifierPrefix)`는 시뮬레이터에서 비어 JS와 어긋남). 본 앱 키체인 첫 그룹은 `BU697KN34B.app.sprout.mobile`(세션·리프레시 토큰은 그대로 본 앱 전용) |
| 토큰 건네기 | 본 앱이 로그인 상태로 앞으로 올 때마다 `sprout.share.access` = `{access_token, user_id, api_url}`를 공유 그룹에 쓴다(expo-secure-store, `AFTER_FIRST_UNLOCK`). 로그아웃이면 지운다 → 확장은 로그인 카드. 확장은 JWT `exp`가 1분 넘게 남았을 때만 쓴다. 새로 고침은 본 앱만 |
| 저장 순서 | ① 대기열 파일 `share-queue/<uuid>.json`(`{v:1,id,content,captured_at,user_id}`)을 먼저 쓴다 ② 토큰이 쓸 만하면 `POST /sync/upload` `[{op:'PUT',table:'notes',id,data}]`(6초 제한) ③ 200이면 파일 삭제. 실패·만료·오프라인이면 파일이 남는다 → 같은 `저장했어요` |
| 대기열 비우기 | `apps/mobile/src/share/` — `useShareInbox()`(`app/_layout.tsx` 뿌리에서 한 줄)가 로그인 상태에서 시작·앞으로 올 때 `drainQueue`: 같은 id가 로컬에 있으면 넣지 않고 파일만 지움, 다른 계정(`user_id`)·망가진 파일은 지움, 넣기 실패면 파일을 남겨 다음에. 넣은 행은 PowerSync가 올린다 |
| 행 규칙 | `src/share/link.ts`·`row.ts` = 데스크톱 `shared/collect.ts`의 `firstUrl`·`isBareLink`·`itemRow`와 같은 규칙(M-S1): 링크만이면 `kind 'link'`·`kind_source 'ai'`·`ai_state 'done'`, 나머지는 `ai_state 'pending'`. `source 'app'`, `captured_at = created_at = modified_at = 공유 시각(UTC ISO)`, `fingerprint NULL`. 데스크톱 파일은 `./assistant`까지 끌고 와 Metro로 직접 가져오지 않고 옮겼다 — `share.test.ts`가 정규식 원문·본문이 데스크톱과 같은지 검사한다 |
| 시험 | `npm run test:mobile`(share.test.ts: 데스크톱과 같은 판정·업로드 모양·대기열 멱등) + `sh apps/mobile/plugins/share-extension/test/check-vectors.sh`(Swift 판정이 같은 예시 `src/share/vectors.json`을 통과) |
| 공유 목록 | `NSExtensionActivationSupportsText` + `WebURLWithMaxCount 1`만 → 사진·파일만 공유하면 sprout가 안 뜬다 |
| 안내 줄 | 링크만이면 `링크만 있어서 바로 ‘볼 것’에 넣어요`, 아니면 `AI가 할 일·볼 것·위키·메모로 정리해 둘게요` [임시 — 구현 때 추가, 결과가 다르다는 걸 미리 보여 줌] |
| 다른 점 [임시] | iOS 26에서 확장 화면은 시스템 시트 안에 뜬다(`overFullScreen`을 무시) → 덮개는 시트 안에만 그려진다. 카드 높이 500·모서리 22·머리 52는 명세대로. [sprout 열기]는 공식 API가 없어 응답자 사슬로 `sprout://`를 연다(안 되면 그냥 닫힘, 실기기 확인 필요) |
| 실기기 | Apple Developer에서 App ID `app.sprout.mobile`·`app.sprout.mobile.share` 둘 다 App Groups(`group.app.sprout.mobile`) 켜기, 팀 `BU697KN34B`로 서명. 키체인 공유는 같은 팀이면 따로 등록 없음 |
| [다음] | ~~Android 공유 받기~~ → §8 구현. Android 공유 카드(덧붙이기·넣기 확인) — 지금은 바로 저장. 오늘 탭 위 `공유한 N개를 수집함에 넣는 중…` 띠. 설정의 `공유 목록에 sprout 추가하는 법` 안내 |
| 확인 (iOS 26.5 시뮬레이터, 2026-10-05) | 사파리 링크 공유 → 바로 업로드(`kind link`·`done`), 글 공유 → 바로 업로드(`pending`), 토큰 만료 상태 공유 → 대기열 → 앱 열 때 넣기(같은 id 두 파일 → 한 줄, 원래 `captured_at` 유지), 다시 열어도 중복 없음, 로그아웃 → 로그인 카드 → [sprout 열기]로 앱 열림, 다크 모드 카드, 취소 = 저장 없음. 데스크톱 화면에서 직접은 보지 않았다(서버 행·모바일 수집함 탭으로 확인) |

## 8. 구현 메모 (2026-10-05, Android 공유 받기)
| 부분 | 위치 · 내용 |
|---|---|
| 받는 종류 | `apps/mobile/app.json` `android.intentFilters` = `SEND` · `DEFAULT` · `text/plain` 하나 → expo prebuild가 MainActivity(`singleTask`)에 붙인다. 링크도 Android에서는 `text/plain`(크롬·유튜브·카톡 모두)이라 이것만으로 글·링크를 받는다. 사진·파일만 공유하면 꿈틀이 목록에 안 뜬다(M-S3). `SEND_MULTIPLE`은 받지 않는다 |
| 인텐트 읽기 | `apps/mobile/modules/sprout-share`(앱 안 Expo 모듈, Android 전용, 자동 링크) — `take()`가 쌓인 공유 `{text, subject, at}`를 넘기고 비운다. 꺼져 있다 켜진 경우는 시작 인텐트를, 떠 있을 때는 `OnNewIntent` → `onShare` 이벤트. 읽은 인텐트는 action을 MAIN으로 바꾸고 extra를 지워 다시 불러오기에도 두 번 들어가지 않는다 |
| 글 합치기 | `src/share/row.ts` `androidShareContent(subject, text)` — 크롬처럼 제목(EXTRA_SUBJECT)과 주소(EXTRA_TEXT)를 따로 주면 `<제목>\n<주소>`(§3), 글에 제목이 이미 있으면 글만. 시험 `share.test.ts` ④ |
| 저장 | `src/share/android.ts` `useAndroidShare(signedIn)`(`app/_layout.tsx` Screens에서 한 줄): 로그인 상태에서 시작·앞으로 올 때·`onShare`마다 `notes`에 `shareRow`(iOS 대기열과 같은 행 — 링크만이면 바로 볼 것, 나머지 `pending`, `captured_at` = 공유 시각)로 INSERT → PowerSync가 올린다(오프라인이면 연결될 때 — iOS 대기열과 같은 결과). 넣었으면 **수집함 탭으로 가고** 토스트 `수집함에 넣었어요`(여러 개면 `공유한 N개를 수집함에 넣었어요`) |
| 로그아웃 상태 | 공유는 모듈에 쌓여 있다가 로그인하면 들어간다(앱 프로세스가 살아 있는 동안 — 앱을 완전히 닫으면 사라짐) [임시] |
| 빈 상태 문구 | 수집함 빈 상태 `다른 앱에서 공유 → 꿈틀…`은 공유를 받을 수 있는 빌드에서만(iOS · `sprout-share` 모듈이 든 Android). 모듈 없는 옛 Android 빌드는 `링크·글을 복사해 위 입력 칸에 붙여 넣으면 여기로 와요`(`canReceiveShare`) |
| iOS와 다른 점 [임시] | §2.1 공유 카드(덧붙이기 줄·`넣기`·확인 카드) 없이 **바로 저장 + 앱 수집함 탭**(틱틱 Android도 공유하면 앱 안 빠른 추가로 열린다 — research 20 §6). 카드는 [다음] |
| 확인 | `npx expo prebuild --platform android` → 매니페스트에 `SEND text/plain` intent-filter, `:sprout-share:compileDebugKotlin` 통과, `npm run typecheck:mobile`·`npm run test:mobile`. 에뮬레이터(Pixel 6a, 개발용 빌드): 앱이 떠 있을 때 `am start -a SEND -t text/plain`(제목 + 주소) → 수집함 탭으로 가고 `<제목>` 행 · `볼 것` 1개(링크만 판정). **앱이 꺼져 있을 때 공유는 개발용 빌드에서는 확인 못 함** — expo-dev-client 런처가 시작 인텐트를 가로챈다(출시 빌드에는 런처가 없어 MainActivity가 그대로 받는다). 출시 빌드·실기기에서 크롬·유튜브·카톡 공유로 다시 확인 |
