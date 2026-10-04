# 27 · 로그인 방식 · 첫 실행(온보딩)

- 조사일: 2026-10-06. 쓰는 곳: [08 로그인](../screens/08-login.md) §3.1, [18 첫 실행 안내](../screens/18-onboarding.md)
- 표기: **[확인]** 출처에서 직접 확인 · **[추정]** 일반 관찰·간접 자료 · **[없음]** 찾지 못함

## 1. 로그인 · 가입 화면
| 항목 | 내용 | 출처 |
|---|---|---|
| 소셜 버튼 | **[확인]** 웹 로그인·가입 카드 아래 구분선 다음에 테두리 버튼 2개 "Google로 계속하기" · "Apple로 계속하세요"(한국어 웹 문구 그대로, 288×38) | ticktick.com/signin · /signup 실측(2026-10-04, 08 §3) |
| 모바일 첫 화면 | **[추정]** 그림 + "Continue with Apple" · "Continue with Google" · "Sign up or Log in with email" 묶음 + 약관 | [24 모바일](24-mobile-ui.md) §9 |
| 이메일 가입 | **[확인]** 이메일로 가입하면 인증 메일의 링크를 눌러야 가입이 끝난다 | 도움말 "Sign Up and Log In"(아래 링크) |
| 이메일 바꾸기·연결 | **[확인]** 모바일 설정 › 아바타 › 닉네임 › 이메일 / 데스크톱은 웹앱 설정 › 계정 › 이메일 바꾸기 — 소셜로 가입한 계정에도 이메일을 붙이는 통로("Bind Email") | 같은 글 |
| 비밀번호 찾기 | **[확인]** 로그인 상자 아래 "Forgot Password" → 메일 링크 또는 휴대폰 인증 코드 | 같은 글 |
| 로그아웃 | **[확인]** 데스크톱: 왼쪽 위 아바타 › Sign out | 같은 글 |
| 로그인 기기 관리 | **[확인]** 웹 설정 › 계정 › Login Devices | 같은 글 |
| Apple ID 연결 | **[확인]** 기존 계정에 Apple ID를 연결해 다음부터 Apple로 로그인(영상 튜토리얼) | YouTube "Connect Apple ID to TickTick for Easy Login" |
| 계정 합치기 | **[확인]** 지원하지 않는다 — 한쪽을 백업해 다른 계정으로 가져오라고 안내 | 도움말 FAQ "Delete Account" 항목 |
| 같은 이메일, 다른 로그인 방식 | **[없음]** 자동 연결 규칙은 공개 자료에 없다 → sprout 규칙은 08 §3.1에서 새로 정함 |

## 2. 첫 실행
| 항목 | 내용 | 출처 |
|---|---|---|
| 모바일 첫 실행 | **[확인]** 스플래시 → 소개 → **6단계 온보딩** → 결제 화면(페이월). 단계 내용은 유료 자료라 보지 못함 | appllama.io 화면 목록(공개 부분) |
| 시작 영상 | **[확인]** "Beginner's Guide" — iOS/Android 시작 영상, 모듈 소개(할 일·캘린더·아이젠하워·뽀모도로·습관) | 도움말 Beginner's Guide |
| 데스크톱 첫 실행 | **[없음]** 공개 자료 없음. 사용자 틱틱은 로그인 상태라 로그아웃해 보지 않는다(HANDOFF 규칙) |
| 캘린더 연결 위치 | **[확인]** 설정 › 연동 & 가져오기 › 캘린더 › iCloud(앱 전용 암호) / 구글 — 첫 실행 단계가 아니라 설정에 있다 | 도움말 iCloud Calendar · Google Calendar |
| 가져오기 | **[확인]** 설정 › 연동 & 가져오기에 다른 앱 가져오기 | 도움말 "Migrate from other apps" (17 §1) |

## 3. sprout에 주는 뜻
1. 소셜 버튼 위치·문구·크기는 틱틱 웹을 그대로 따른다(08 §3.1). 다만 Apple 버튼은 애플 지침 한국어 문구 "Apple로 계속하기"를 쓴다(틱틱의 "계속하세요"는 번역 흔들림으로 보임).
2. 틱틱은 계정을 합치지 않는다 → sprout는 "확인된 같은 이메일이면 기존 계정에 연결"을 새로 정한다(사용자가 데이터가 갈라졌다고 느끼지 않게). 위험과 대책은 08 §3.1.
3. 틱틱 모바일은 짧은 단계형 온보딩을 둔다 → sprout 데스크톱도 **단계형 카드**(5단계, 모두 건너뛰기 가능)로 한다. 단계 내용(캘린더·가져오기·캐릭터)은 sprout 고유라 틱틱 디자인 언어(가운데 카드, 강조색 주 버튼)로 새로 그린다. 페이월은 없다.
4. 캘린더 연결·가져오기는 틱틱처럼 설정에도 그대로 남긴다(첫 실행은 바로 가는 길일 뿐).

## 출처
- TickTick 도움말 "Sign Up and Log In": https://help.ticktick.com/articles/7055781436309110784 (2026-10-01 수정본)
- TickTick 도움말 "Account and Security": https://help.ticktick.com/articles/7055781452310380544
- TickTick 도움말 "Beginner's Guide": https://help.ticktick.com/articles/7054286604315131904
- TickTick 도움말 "iCloud Calendar": https://help.ticktick.com/articles/7209479055807086592
- TickTick 로그인·가입: https://ticktick.com/signin · https://ticktick.com/signup
- 모바일 첫 실행 화면 목록: https://appllama.io/apps/626144601/ticktick-to-do-list-calendar
- Apple ID 연결 영상: https://www.youtube.com/watch?v=l6-2D1FLifo
- Apple "Hide My Email with Sign in with Apple": https://support.apple.com/en-us/105078
