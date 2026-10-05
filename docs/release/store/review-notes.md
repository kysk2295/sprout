# App Review 메모 — 꿈틀 (Kkumteul) iOS 1.0.0 (1)

> App Store Connect › 앱 › 버전 › **App Review에 관한 정보**에 아래 영어 본문을 붙여 넣는다.
> 데모 계정 **비밀번호는 저장소에 두지 않는다** — 운영자 맥의 `~/.config/sprout/review-account.txt`(권한 600)에만 있다. 제출하는 사람에게 따로(메신저 등) 전달하고, App Store Connect의 "로그인 정보" 칸에만 적는다.
> 데모 계정은 지우지 않는다(심사·재심사 내내 필요). 데이터는 2026-10-05에 넣은 샘플(할 일·일정·프로젝트·성장 캐릭터)이다.

| 칸 | 값 |
|---|---|
| 로그인 필요 | 예 |
| 사용자 이름 | `demo-store-202610050756@sprout.test` |
| 암호 | `~/.config/sprout/review-account.txt` 참고 (저장소에 없음) |
| 연락처 이름 | 고윤서 (Ko Yunseo) — 유니포트 UniPort |
| 연락처 이메일 | kysk2295@naver.com |
| 연락처 전화 | [제출자가 입력] |

## Notes (English — paste into "Notes")

```
Kkumteul (꿈틀) is a free to-do list and calendar app with a growth loop: every task you finish earns XP, and a small character you choose grows and evolves. There are no ads, no in-app purchases and no tracking.

DEMO ACCOUNT
Email: demo-store-202610050756@sprout.test
Password: (entered in the Sign-In Information field)
On the first screen, enter the email and password above and tap "로그인" (Log in). It already contains sample data:
- Tasks tab > Today: today's tasks with priorities, one completed
- Calendar tab: tasks and events for this month, Korean public holidays
- More > Work Map: two projects ("제주 가족 여행", "포트폴리오 사이트") with ordered steps
- Growth tab: a level 7 character, this week's goals

SIGN IN
Email/password, Sign in with Apple and Google Sign-In are all available on the first screen. Sign in with Apple is offered as an equivalent option to Google Sign-In (Guideline 4.8).

ACCOUNT DELETION
More (bottom-right tab) > Settings > Account > Delete account. This permanently deletes the account and all synced data on our server. Accounts created with Sign in with Apple are re-authenticated with Apple first, and the Apple token is revoked on deletion. A web page is also available: https://web-production-cd889.up.railway.app/account-deletion?lang=en

AI FEATURES
The AI features on iPhone (the assistant chat under More > AI Assistant, the journal conversation with the character, and "plan together" step suggestions for a project) run on our own server (a self-hosted Mac mini with an open-source model). No third-party AI service receives user data. AI requests may take several seconds, and some AI features have a per-user usage limit enforced by the server. If the server is busy, the app shows "AI is not available right now" and every other feature keeps working offline.

SERVER
The app syncs with our server at https://macmini.tail425c97.ts.net. It is kept online during review. All traffic uses HTTPS.

PRIVACY
No analytics, advertising or crash-reporting SDKs. No tracking (no ATT prompt). Data is used only to provide the app's features. Privacy policy: https://web-production-cd889.up.railway.app/privacy?lang=en

PERMISSIONS
Notifications only (task reminders, scheduled on the device). The app does not access contacts, photos, location, camera or the microphone.

SHARE EXTENSION
From another app's share sheet, choose "꿈틀" to save text or a link to the app's Inbox (requires being logged in).

Contact: kysk2295@naver.com
```

## 제출 전 확인 (제출자)
- [ ] Mac mini 서버가 켜져 있고 `https://macmini.tail425c97.ts.net/health`가 `{"ok":true}` — 심사 기간 내내(잠자기 끔)
- [ ] 위 계정으로 실기기(TestFlight)에서 로그인되는지 한 번 확인
- [ ] Apple 로그인 버튼이 진짜로 동작(빌드할 때 `SPROUT_APPLE_SIGN_IN=1`, 서버 `.env`에 Apple 키 값) — 안 되면 위 "SIGN IN" 문단과 맞지 않으니 제출하지 않는다
- [ ] 위젯 확장을 넣고 빌드했다면 "SHARE EXTENSION" 아래에 위젯 한 줄을 더한다
