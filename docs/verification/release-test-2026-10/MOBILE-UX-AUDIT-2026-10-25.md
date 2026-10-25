# 휴대폰 앱 UI·UX 세부 점검 (2026-10-25, 코드 읽기)

- 범위: `apps/mobile` 전체(`app/` 라우트 + `src/`). TextInput 64곳, Pressable 389곳, Modal·BottomSheet·SlideSheet, GestureDetector 20여 곳, 키보드 처리, 토스트, 로딩/빈 화면, 동기화 버튼을 읽었다.
- 방법: 코드만 읽었다. 고친 것도, 빌드한 것도, git 작업도, 시뮬레이터·에뮬레이터 조작도 없다. 기기에서 직접 확인해야 하는 항목은 **확인 필요**로 표시했다.
- 이미 고친 것(이 표에서 뺐다): 일기 대화·AI 비서 입력칸(엔터 = 줄 바꿈), 빠른 추가 두 번 제출(`quick-add.tsx:154` `sending` ref), Android 뒤로 가기 = 서랍부터 닫기, 서랍 겹침, 재시작 때 빈 화면(할 일 목록), 지난 날 GestureDetector 두 자식 문제.
- 기준: 틱틱 휴대폰 앱 동작과 플랫폼 기준(iOS HIG, Android Material).
  - 누를 수 있는 곳은 44pt/48dp 이상, 누르면 반응이 보여야 한다.
  - Android 뒤로 가기는 맨 위 층(시트·메뉴·패널)부터 닫는다.
  - 대화 입력칸의 엔터는 줄 바꿈이다(사용자 결정 2026-10-25).

## 한 줄 요약
- **엔터 한 번에 두 개가 만들어지는 꼴이 빠른 추가 말고도 7곳에 그대로 있다.** 빠른 추가에서 본 것은 "Android 엔터 한 번 → 같은 밀리초에 두 번 제출"이었다. `onSubmitEditing`에서 바로 만드는 곳 가운데 ref 잠금이 없는 곳이 모두 같은 위험을 안고 있다.
- **계획 대화(plan-chat)는 아직 엔터 = 보내기다.** 사용자가 싫다고 한 바로 그 동작이다. 게다가 Android에서는 키보드가 입력칸을 가린다.
- **동기화 단추는 실패해도 "동기화했어요"라고 한다.** 당겨서 새로 고침은 결과를 아무것도 알려 주지 않는다. 10-14부터 아이폰에서 동기화가 막혔는데도 사용자가 몰랐던 것과 이어진다.
- **토스트는 시트(Modal) 뒤에 숨고 키보드에도 가린다.** 시트 안에서 난 오류는 사용자 눈에 안 보인다.
- **눌림 반응이 없는 Pressable이 389곳 중 327곳**(직접 `pressed` 스타일 기준)이다. Android 물결(ripple)은 0곳이다.

---

## P1 — 사용자가 바로 불편하거나 데이터가 잘못된다

| # | 화면 | 증상(사용자 눈으로) | 위치 | 기준 | 고칠 방법 |
|---|---|---|---|---|---|
| 1 | 계획 대화(작업 지도 → 같이 계획 짜기) | 답을 적다 엔터를 누르면 바로 보내진다. 일기 대화·AI 비서와 다르게 움직인다. | `app/plan-chat.tsx:209` (`onSubmitEditing={send} returnKeyType="send"`, 한 줄) | 사용자 결정 2026-10-25 "엔터로 바로 보내지 않는다". 대화 입력칸 세 곳이 같아야 한다. | `multiline` + `maxLength`, `onSubmitEditing`·`returnKeyType` 없애기. 보내기는 ↑ 단추만. `chatParts.tsx` Composer를 그대로 써도 된다. 칩 답(`split-manual`의 "자료 조사, 목차 잡기")은 쉼표로 받으니 줄 바꿈도 쉼표처럼 나누면 된다. |
| 2 | 계획 대화 (Android) | 입력칸을 누르면 키보드가 입력 줄을 덮어서 내가 적는 글이 안 보인다. **확인 필요**(에뮬레이터 사용 중이라 못 봄) | `app/plan-chat.tsx:178` `KeyboardAvoidingView behavior={ios ? 'padding' : undefined}` | 이 앱의 Android는 전체 화면 그리기라 창이 줄지 않는다. 같은 이유로 `account.tsx:44-52`·`BottomSheet.tsx:47-50`은 키보드 높이를 직접 더한다. | 일기 대화처럼 `useKeyboardLift`(`src/diary/keyboard.ts`)를 쓰거나 Android에도 `behavior="padding"`. 아래 P2-1 목록의 다른 KAV 화면도 같은 방법으로. |
| 3 | 성장 → 이번 주 목표 시트 | 목표를 적고 엔터 한 번 → 같은 목표가 두 개 생길 수 있다. 엔터를 빨리 두 번 눌러도 마찬가지다. | `src/growth/GoalsSheet.tsx:89-101` `submit`(잠금 없음, `setText('')`는 await 뒤), 입력 `:168` `blurOnSubmit={false}` | 빠른 추가 #5와 같은 꼴(RESULT-2026-10-25 §2 #5). 틱틱은 한 번 누르면 한 개다. | `const busy = useRef(false)`로 감싸기. 값을 먼저 비우고(`setText('')`) 실패하면 되돌리기. `quick-add.tsx:154-159`와 같은 꼴. |
| 4 | 수집함 → 위 입력칸 | 붙여 넣고 엔터 → 같은 항목이 두 번 들어갈 수 있다. | `src/collect/CollectScreen.tsx:250-258` `submit`(잠금 없음), `:263-275` `submitBehavior="submit"` | 위와 같음 | ref 잠금, 먼저 비우기. |
| 5 | 할 일 상세 → 체크 항목 추가 | 항목을 적고 엔터 → 두 번 들어갈 수 있다(`newItem` 값이 아직 안 바뀐 채로 두 번 불린다). | `src/screens/TaskDetail.tsx:144-154` (`blurOnSubmit={false}`, `addCheckItem`을 기다리지 않음) | 위와 같음 | ref 잠금 + 넣을 값을 지역 변수로 먼저 비우기. |
| 6 | 리스트로 옮기기 → "리스트 추가" · 태그 시트 → 새 태그 | 새 이름을 적고 엔터 → 같은 이름의 리스트·태그가 두 개 생길 수 있다. | `app/move.tsx:75` (`createList` 잠금 없음), `app/tags.tsx:42` (`createTag` 잠금 없음) | 위와 같음 | 둘 다 ref 잠금. |
| 7 | 작업 지도 → 새 폴더·새 리스트·이름 바꾸기 대화 상자, 이름 입력 대화(OrgSheets Prompt) | 엔터 → 같은 폴더·리스트가 두 개 생길 수 있다. 저장이 실패해도 상자는 이미 닫혀 있어 아무것도 안 보인다. | `src/map/Dialog.tsx:23` (`onClose()` 다음 `await onConfirm`, 잠금 없음), `src/ui/OrgSheets.tsx:279-282` | 위와 같음 | ref 잠금. `Dialog`는 닫기 전에 `onConfirm`을 기다리고, 실패하면 상자 안에 오류 줄. |
| 8 | 새 프로젝트 시트 | 엔터 → 프로젝트가 두 개 생길 수 있다. `busy`가 state라서 같은 순간 두 번 불리면 둘 다 통과한다. | `src/map/v2/NewProjectSheet.tsx:34-36` | 위와 같음 | `busy`를 `useRef`로 바꾸거나 함께 쓰기. `make.tsx:161`의 ref 꼴이 맞다. |
| 9 | 설정 → 지금 동기화 | 인터넷이 끊겼거나 토큰이 만료돼 서버에 못 붙어도 8초 뒤 **"동기화했어요"**가 뜬다. `db.connect`가 오류를 내면 토스트 없이 조용히 끝난다. | `app/(tabs)/settings/index.tsx:94`, `src/data/auth.ts:416-431` (`syncNow`는 8초가 지나면 무조건 resolve, 결과값 없음) | 10-14부터 아이폰이 401로 못 붙는데 변경 47건이 쌓인 걸 사용자가 몰랐다(57aa4ca). 틱틱은 실패하면 "동기화 실패"를 띄운다. | `syncNow()`가 `{ ok, pending, error }`를 돌려주게 한다. 끝날 때 `connected`·`uploadError`·`downloadError`·`ps_crud` 남은 개수를 본다. 실패 = 오류 토스트 "동기화하지 못했어요 · 올리지 못한 변경 N개"(+ 로그인 만료면 "다시 로그인"). 성공일 때만 "동기화했어요". `try/catch`로 감싼다. |
| 10 | 할 일 목록·수집함 당겨서 새로 고침, 수집함 ⋯ "지금 동기화" | 당겨도 돌기만 하고 실패를 안 알려 준다. 수집함 ⋯ "지금 동기화"는 성공 알림도 없다. | `src/screens/TaskListScreen.tsx:187-190`, `src/collect/CollectScreen.tsx:73`, `:179` | 위와 같음 | #9의 결과를 써서 실패할 때만 오류 토스트를 띄운다(당겨서 새로 고침 성공은 조용히 둬도 된다 — 틱틱과 같음). ⋯ 메뉴에서 누른 것은 성공도 알린다. |

## P2 — 거슬리거나 특정 상황에서 막힌다

| # | 화면 | 증상(사용자 눈으로) | 위치 | 기준 | 고칠 방법 |
|---|---|---|---|---|---|
| 1 | Android: 로그인·가입, 캐릭터 이름(설문·만들기), 첫 할 일, 이름 바꾸기, 작업 지도 대화 상자, 리스트·폴더·태그·필터 편집 시트, 위키 설명 편집 | 키보드가 아래쪽 입력칸이나 [좋아요]·[로그인] 단추를 덮는다. 작은 화면(360dp)에서 특히 심하다. **확인 필요** | `KeyboardAvoidingView behavior={undefined}`(Android): `src/screens/AuthScreen.tsx:100`, `app/growth/survey.tsx:113`, `app/growth/make.tsx:359`·`:499`, `src/growth/RenameModal.tsx:18`, `src/map/Dialog.tsx:26`, `src/ui/OrgSheets.tsx:22`·`:285`, `src/wiki/PageCard.tsx:240` | 창이 줄지 않는 Android 구조. 코드 주석(`account.tsx:44`)이 그렇게 말한다. | 공용 훅 하나(`useKeyboardPad()` = Android에서 키보드 높이 + 아래 안전 영역)를 만들어 아래 여백에 쓰거나, 양쪽 모두 `behavior="padding"`. Modal 창도 같은지 Pixel에서 확인한다. |
| 2 | 시트 안 오류·알림 전체(수집 항목 시트의 "바꾸지 못했어요"·"등록하지 못했어요", 새 프로젝트 실패, 할 일 상세의 "작업이 완료되었습니다 · 되돌리기" 등) | 시트가 열려 있으면 토스트가 시트 **뒤**에 떠서 안 보인다. 오류가 조용히 사라진다. | 토스트는 뿌리에 하나: `app/_layout.tsx:66` `ToastProvider`. RN `Modal` 위에 못 올라간다. 예: `src/collect/ItemSheet.tsx:174`·`:230`, `src/map/v2/NewProjectSheet.tsx:43`, `src/screens/TaskDetail.tsx:106`(formSheet) | 틱틱은 시트 위에도 토스트를 띄운다. `GoalsSheet`는 이미 자기 스낵(`:57`)을 따로 둔다. | `BottomSheet`·`SlideSheet` 안에 `ToastHost` 자리를 하나 더 두고, 맨 위 Modal이 그 자리로 받게 한다. 또는 GoalsSheet 스낵 꼴을 공용으로. formSheet 화면(task·event)도 화면 안 토스트 자리를 둔다. |
| 3 | 키보드가 올라온 화면(수집함 입력, 할 일 상세 편집, 일기 혼자 쓰기 등)의 토스트 | "볼 것에 넣었어요"·"저장했어요"가 키보드 뒤에 숨는다. | `src/ui/Toast.tsx:58-60` (`bottom`이 탭바·+ 단추 기준이고 키보드를 안 본다) | 토스트는 키보드 위에 떠야 한다(Android Snackbar·iOS 관례). | `Keyboard` 높이를 듣다가 키보드가 있으면 `bottom = 키보드 높이 + 8`. |
| 4 | 캘린더(월) → 날짜를 눌러 연 아래 패널 · 수집함 검색 모드 | Android 뒤로 가기가 패널·검색을 닫지 않고 앱을 나간다. | `src/screens/CalendarScreen.tsx:557` (`open` state, BackHandler 없음), `src/collect/CollectScreen.tsx:52` (`search` state) | 서랍을 고친 것(d0765c0)과 같은 규칙: 뒤로 가기 = 맨 위 층부터. | `useFocusEffect` + `BackHandler.addEventListener('hardwareBackPress', () => { if (open) { doClose(); return true } return false })`. 검색은 `setSearch(null)`. 공용 `useBackClose(active, close)` 훅으로 만들면 다음에 같은 실수를 막는다. |
| 5 | 할 일 목록 왼쪽 가장자리 끌기(서랍), Android 제스처 탐색 | 화면 왼쪽 끝에서 오른쪽으로 끌면 서랍 대신 시스템 "뒤로"가 먹어 앱이 닫힐 수 있다. **확인 필요** | `src/ui/Drawer.tsx:322-336` (`left:0 width:24` 가장자리), `:353` | Android 10+ 제스처 탐색은 양쪽 가장자리를 시스템 뒤로 가기로 쓴다. 틱틱 Android는 ☰ 단추로 연다. | Android 제스처 탐색에서는 가장자리 끌기를 끄거나, 시작점을 가장자리에서 24dp 안쪽으로. 또는 `systemGestureExclusionRects` 모듈(세로 200dp 한도). |
| 6 | 일기(오늘·지난 날) 가로 밀기로 날 넘기기, 기분 달력 가로 밀기 | iOS에서 왼쪽 가장자리를 밀어 뒤로 가려다 "전날"로 넘어가거나 둘이 섞인다. **확인 필요** | `app/diary/index.tsx:104-111` (`activeOffsetX ±18`, 가장자리 예외 없음), `app/diary/calendar.tsx:48` | iOS 가장자리 밀기 = 뒤로(HIG). 틱틱은 캘린더 가로 넘김을 판 안에서만 받는다. | 손가락이 x < 24에서 시작하면 실패시키기: `.onTouchesDown`에서 `e.allTouches[0].absoluteX < 24`면 `manager.fail()`. 또는 `hitSlop={{ left: -24 }}`. |
| 7 | 일기 → 저장한 장 "고치기" | 고치는 중에 뒤로 가기, 다른 날로 밀기, Android 뒤로 가기를 하면 고친 글이 경고 없이 사라진다. | `src/diary/Conversation.tsx:604-623` (`SavedCard`의 `d`는 지역 state뿐) | 혼자 쓰기는 임시 저장을 한다(`SoloWrite.tsx:61-75`). 같은 일기 안에서 다르게 움직이면 안 된다. | 고치는 중이면 날 넘기기를 막고(`swipe.enabled(!editing)`), 떠날 때 임시 저장하거나 `usePreventRemove`로 "고친 내용을 버릴까요?"를 묻는다. |
| 8 | AI 비서 ↑ 보내기·■ 멈추기 | 단추가 32pt에 `hitSlop`도 없어서 잘 안 눌린다. 엔터로 못 보내게 된 지금은 이 단추가 보내는 유일한 길이다. | `src/assistant/AssistantChat.tsx:553-555`, 크기 `:685` (`32×32`) | 44pt(HIG)/48dp(Material). 일기 Composer는 40 + hitSlop 4 = 48이다(`chatParts.tsx:194`). | `hitSlop={6}`(32 + 12 = 44) 또는 원 크기를 36 + hitSlop 4로. |
| 9 | 앱 전체 단추·행 | 눌러도 색·투명도가 바뀌지 않는 곳이 많아 "눌렸나?" 싶다. Android 물결은 없다. | `<Pressable` 389곳 중 `pressed` 스타일이 있는 곳 62곳, `android_ripple` 0곳. 많은 파일: `GoalsSheet.tsx`(15), `map/project/[id].tsx`(14), `map/index.tsx`(14), `tidy.tsx`(12), `DateSheet.tsx`(11), `Conversation.tsx`(11), `ItemSheet.tsx`(11) | 틱틱 iOS는 행이 회색으로 눌리고, Android는 물결이 퍼진다. | 공용 `Tap` 컴포넌트(눌림 = `opacity 0.6` 또는 `bgSelected` 바탕, Android = `android_ripple={{ color: p.bgSelected }}`)를 만들고 한 파일씩 바꾼다. `Cell`·`GlassButton`은 이미 있는지 확인한 뒤 나머지부터. |
| 10 | 수집함 첫 화면 | 앱을 켜거나 탭에 처음 들어갈 때 잠깐 "무엇이든 던져 두세요"(빈 화면)가 보였다가 목록이 나온다. | `src/collect/CollectScreen.tsx:54`·`:137` (`useLiveQuery`의 `isLoading`을 안 봄) | 할 일 목록을 같은 꼴로 고쳤다(`TaskListScreen.tsx:254-255`). | `const q = useLiveQuery(...)`, `q.isLoading`이면 뼈대(또는 아무것도 안 그림). 같은 꼴: `app/(tabs)/more/tags.tsx:38`, `app/map/goals.tsx:35`, `app/map/link.tsx:47`. |
| 11 | 프로젝트 화면 | 열 때 잠깐 "이 프로젝트에 남은 일이 없어요"가 보인다(데이터를 읽는 중인데 없는 것으로 그림). | `app/map/project/[id].tsx:107-113` (`!x` = 읽는 중과 없음을 구분하지 않음) | 위와 같음 | 읽는 중이면 빈 화면이나 뼈대, 정말 없을 때만 그 글. |
| 12 | 모든 "입력 → 값 비우기" 칸(일기·AI 비서 보내기, 목표·체크 항목·수집 추가) — Android 삼성 키보드 | 한글을 조합하는 중에 ↑나 엔터를 누르면 칸을 비운 뒤 마지막 글자가 다시 나타나거나(유령 글자) 마지막 글자가 빠질 수 있다. **확인 필요**(실기기 갤럭시 + 삼성 키보드, Gboard) | `src/diary/chatParts.tsx:125` (`setV('')`), `src/assistant/AssistantChat.tsx` 보내기 뒤 `setDraft('')`, GoalsSheet·TaskDetail·CollectScreen 추가 칸 | RN Android의 controlled TextInput을 조합 중에 비울 때 생기는 알려진 문제 | 실기기에서 "안녕하세요" 마지막 '요'를 조합하는 중에 바로 ↑를 눌러 본다. 문제가 있으면 비우기 전에 `input.current?.clear()`를 부르거나, `setV('')`를 `requestAnimationFrame` 뒤로 미룬다. |
| 13 | 큰 글자(접근성 글자 크기 최대) | 연 달력 칸(글자 9, 칸 14px), 탭 알약, 높이가 고정된 머리(52)·단추(42·52)에서 글자가 잘리거나 겹칠 수 있다. **확인 필요** | `maxFontSizeMultiplier` 0곳. 예: `src/screens/CalendarScreen.tsx:365`(`cellW`)·`:390`(`fontSize: 9`), `app/diary/index.tsx:204-212`(`hdr height 52`, `today height 42`) | 틱틱은 큰 글자에서 줄이 늘어난다. 작은 칸만 막는다. | 작은 고정 칸(달력 숫자·연 모자이크·배지·탭 이름)에 `maxFontSizeMultiplier={1.2}`, 머리·단추는 `height` 대신 `minHeight`. iOS 시뮬레이터 "AX5"에서 오늘·캘린더·일기·성장 4화면을 캡처해 본다. |
| 14 | 로그인·가입 단추 | 빨리 두 번 누르거나 엔터("이동")와 단추를 함께 누르면 가입 요청이 두 번 갈 수 있다. 성공한 뒤에 "이미 가입된 이메일이에요"가 깜빡일 수 있다. **확인 필요** | `src/screens/AuthScreen.tsx:78-90` (`locked` = state `busy`) | #P1-3과 같은 꼴 | ref 잠금. |
| 15 | 가입 화면 약관 문구 | "이용 약관 · 개인정보 처리방침"에 밑줄이 있는데 눌러도 안 열린다. | `src/screens/AuthScreen.tsx:182-186` (`Text`에 onPress 없음) | 스토어 심사: 가입 화면에서 약관을 열 수 있어야 한다. | 각 `Text`에 `onPress={() => Linking.openURL(...)}` + `accessibilityRole="link"`. |

## P3 — 다듬기

| # | 화면 | 증상(사용자 눈으로) | 위치 | 기준 | 고칠 방법 |
|---|---|---|---|---|---|
| 1 | 검색 칸 전부(통합 검색, 일기 검색, 수집함 검색, 옮기기, 프로젝트·지도 할 일 찾기) | 영어로 찾을 때 iOS 자동 수정이 검색어를 바꾸고, 첫 글자가 대문자가 된다. | `app/search/index.tsx:110`, `app/diary/search.tsx:27`, `src/collect/CollectScreen.tsx:112`, `app/move.tsx:49`, `app/map/link.tsx:53`, `app/map/project/[id].tsx:234` | 검색 칸은 `autoCorrect={false}`·`autoCapitalize="none"`이 플랫폼 관례다. 틱틱 검색도 그렇다. | 두 속성 추가. `returnKeyType="search"`가 없는 곳(move·link·project)에도 추가. |
| 2 | 이름 칸(캐릭터 이름, 리스트·태그 이름, 프로젝트 이름) | 영어 이름을 쓰면 자동 수정이 이름을 바꿀 수 있다. | `app/growth/make.tsx:369`, `app/growth/survey.tsx:122`, `src/growth/RenameModal.tsx:22`, `src/ui/OrgSheets.tsx:54`, `src/map/Dialog.tsx:32` | 고유 이름 칸은 자동 수정을 끈다. | `autoCorrect={false}`. |
| 3 | 설문 캐릭터 이름 칸 | 엔터("완료")를 눌러도 아무 일도 없다(키보드도 안 내려간다). | `app/growth/survey.tsx:122` (`onSubmitEditing` 없음) | `make.tsx:370`은 엔터 = 저장이다. | `onSubmitEditing`에 저장(또는 최소한 키보드 내리기). |
| 4 | 할 일 상세 체크 항목 | 항목을 고치다 엔터를 눌러도 다음 항목이 안 생긴다. | `src/screens/TaskDetail.tsx:133-139` (`returnKeyType` 없음) | 틱틱은 체크 항목에서 엔터 = 바로 아래 새 항목이다. | `returnKeyType="next"`, 엔터 = 다음 줄(새 항목 칸)로 초점. 근거는 `docs/ticktick-research`에서 다시 확인한 뒤에. |
| 5 | 수집 항목 시트 제목 | 엔터 자판이 "return"으로 보이는데 누르면 그냥 칸을 벗어난다(줄 바꿈 아님). | `src/collect/ItemSheet.tsx:120-132` (`submitBehavior="blurAndSubmit"`, `returnKeyType` 없음) | 키 이름이 실제 동작과 맞아야 한다. | `returnKeyType="done"`. |
| 6 | 계획 대화 입력 줄 (iOS) | 키보드가 올라와도 입력 줄 아래에 홈 표시줄만큼 빈자리가 남는다. | `app/plan-chat.tsx:208` (`paddingBottom: insets.bottom + 8`을 늘 씀) | | 키보드가 있으면 `8`. |
| 7 | 계획 대화 입력이 잠긴 때 | 칸이 안 눌리는데 이유가 안 보인다(placeholder는 그대로). | `app/plan-chat.tsx:209` (`editable={inputOpen(state)}`) | 비활성은 이유를 알려 준다. | 잠겼을 때 placeholder를 "위 단추에서 골라 줘" 같은 말로. |
| 8 | AI 비서 입력칸 여러 줄 | 줄이 늘면 알약 모양(모서리 999)이 그대로라 양 끝이 크게 둥글어 어색하다. | `src/assistant/AssistantChat.tsx:683` | 메신저 입력칸은 여러 줄일 때 모서리 18~22 | `borderRadius: 22`. 일기 Composer(24)와 맞춘다. |
| 9 | 날짜 시트 −/+ 단추 | 30pt라 작다. | `src/ui/DateSheet.tsx:276-278`, `:349` | 44pt | `hitSlop={7}`. |
| 10 | 비밀번호 칸(로그인·계정 삭제 재확인) | 비밀번호를 보이게 하는 눈 단추가 없다. | `src/screens/AuthScreen.tsx:144`, `app/(tabs)/settings/account.tsx:233` | 틱틱 로그인에는 보기 단추가 있다(조사 확인 필요). | 오른쪽에 눈 아이콘, `secureTextEntry` 켜기·끄기. |
| 11 | 일정 시트 제목·장소·설명 | 저장이 실패해도(`void updateEvent`) 아무 표시가 없다. | `src/screens/EventSheet.tsx:45-49` | 오류를 조용히 삼키지 않는다. | `.catch(() => toast.show('저장하지 못했어요', { error: true }))`. P2-2의 시트 안 토스트와 함께. |
| 12 | 코드 주석 | Composer 위 주석이 아직 "한 줄 보내기(⏎ = 보내기)"다. 다음 작업자가 되돌릴 수 있다. | `src/diary/chatParts.tsx:118` | | "여러 줄, 엔터 = 줄 바꿈, ↑ = 보내기"로 고치기. |

---

## 점검했는데 괜찮았던 것
- **Modal 뒤로 가기:** `<Modal>` 15곳 모두에 `onRequestClose`가 있다. BottomSheet·SlideSheet·Menu·LongPressMenu·RenameModal·Dialog·PageCard·OrgSheets·CalendarScreen 시트·ItemSheet 날짜·calendars/actions·EvolutionMoment가 포함된다. 그래서 Android 뒤로 가기는 시트부터 닫는다.
- **GestureDetector 자식 하나 규칙:** 20여 곳 모두 자식이 하나다. `Conversation.tsx:462`는 PhotoSheet를 이미 밖에 둔다. `Toast`·`SwipeRow`·`DragReorder`·`DayDrag`·`CalendarScreen` 여러 곳·`PlayableCharacter`·`make/parts`·`diary/calendar`도 확인했다.
- **엔터 동작이 맞는 칸:**
  - 로그인: 이메일 `next` → 비밀번호 `go`. `textContentType`·`autoComplete`·`keyboardType`·`autoCapitalize`·`autoCorrect`도 맞다.
  - 혼자 쓰기: 제목 `next` → 본문.
  - 줄 바꿈인 칸: 일기 Composer·AI 비서(엔터 = 줄 바꿈), 각 설명 칸(`multiline`).
  - 잠금이 있는 칸: 빠른 추가(엔터 = 추가, 잠금 있음), 프로젝트 할 일 추가(`project/[id].tsx:427` ref 잠금), 캐릭터 만들기 첫 할 일(`make.tsx:467` ref 잠금), 목표 이름 바꾸기(`GoalsSheet.tsx:278` 한 번만).
- **키보드 내리기:** 대화 두 곳은 `keyboardDismissMode="interactive"`, 검색·수집함은 `on-drag`. 목록 시트는 `keyboardShouldPersistTaps="handled"`라 칸 바깥 단추가 한 번에 눌린다.
- **임시 저장:** 빠른 추가 초안(`quick-add.tsx:45`·`:99`)과 혼자 쓰기(`SoloWrite.tsx:61-75`, 떠날 때 저장)가 있다.
- **상태 표시줄:** 뿌리에서 테마를 따르고, 장면 화면(성장·일기 대화·장면·앨범·AI 비서·꾸미기)은 장면 밝기를 따른다. 로그인 장면은 테마와 같이 바뀌어 맞다.
- **오프라인:** 할 일 목록 머리에 30초 넘게 끊긴 띠와 "동기화에 실패했어요 — 다시 시도하는 중"이 있다(`TaskListScreen.tsx:433`, `OfflineBand.tsx`). 다만 설정 단추(P1-9)는 이 정보를 안 쓴다.

## 다음에 기기에서 볼 것(확인 필요 모음)
1. Pixel/갤럭시에서 계획 대화, 로그인, 캐릭터 이름, 작업 지도 대화 상자를 열고 키보드가 칸을 가리는지 본다(P1-2, P2-1).
2. Android에서 엔터 한 번으로 목표·수집·체크 항목·새 리스트·새 태그·새 폴더가 몇 개 생기는지 센다. 소프트 키보드와 adb 엔터를 둘 다 해 본다(P1-3~8).
3. Android 제스처 탐색에서 할 일 목록 왼쪽 끝을 끌어 본다(P2-5). iOS에서 일기 왼쪽 끝을 밀어 본다(P2-6).
4. 갤럭시 + 삼성 키보드에서 조합 중에 ↑를 누른다(P2-12).
5. iOS 시뮬레이터 접근성 글자 AX5로 오늘·캘린더·일기·성장 화면을 캡처한다(P2-13).
6. 비행기 모드에서 설정 → 지금 동기화를 누른다. 지금 코드라면 8초 뒤 "동기화했어요"가 뜬다(P1-9).
