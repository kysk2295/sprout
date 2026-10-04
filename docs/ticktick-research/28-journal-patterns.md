# 28 · 일기 화면 — 다른 일기 앱의 패턴 (2026-10-04 조사)

- 목적: [15 일기](../screens/15-diary.md) §9 "일기 v1 디자인"의 근거. 틱틱에는 일기 화면이 없으므로 **배치·흐름 근거는 아래 앱에서, 모양은 틱틱 디자인 언어(00 토큰) + 성장 v3 무대(10 §3.2)에서** 가져온다.
- 방법: 웹 검색 약 27회(공식 도움말·앱스토어·리뷰). 공식 자료가 아닌 것은 "2차"라고 적었다. 확인하지 못한 것은 "미확인"이라고 적었다.
- 남의 그림·아이콘·이름은 쓰지 않는다. 구조와 흐름만 참고한다.

## 1. 기분 고르기
| 앱 | 관찰 | 출처 |
|---|---|---|
| Daylio | 5단계 기분(awful·bad·meh·good·rad)을 **한 번 눌러** 고른 뒤 활동 태그 → 메모(선택). 30초 안에 끝나는 흐름. 기분 아이콘·색은 사용자가 바꿀 수 있다 | https://www.reflection.app/journaling-apps/daylio · https://en.wikipedia.org/wiki/Daylio |
| How We Feel | 에너지 × 기분 좋음 2축 **4색 사분면**(빨강·노랑·초록·파랑) → 세부 감정 낱말. "감정에 정확한 이름을 붙이면 세기가 줄어든다"는 근거 | https://www.nepsy.com/articles/leading-stories/yale-psychologists-launch-mood-meter-app/ · https://www.themoodmeter.com/the-how-we-feel-app-harnessing-emotional-awareness-for-a-healthier-mind/ |
| Stoic | 기분 체크인 뒤 "왜?"를 묻고 생활 사건과 잇는다 | https://screensdesign.com/showcase/journal-mental-health-stoic |
| Reflectly | 색이 바뀌는 슬라이더로 기분 → 기분에 맞춘 다음 질문 | https://www.choosingtherapy.com/reflectly-app-review/ |
| Apple Journal | 건강 앱의 "마음 상태(State of Mind)" 기록과 연결 | https://appleinsider.com/inside/ios-18/tips/how-to-use-search-and-other-new-features-in-the-ios-18-journal-app |

→ sprout: 5단계 그대로(데이터 바뀜 없음), 한 번 눌러 고르고 다시 누르면 해제. 이모지 대신 **캐릭터 화풍의 얼굴 5개**(둥근 몸·볼터치, 기분 색)로 그려 성장 세계와 맞춘다. 세부 감정 낱말·사분면은 [다음](데이터 변경 필요).

## 2. 질문(프롬프트)
| 앱 | 관찰 | 출처 |
|---|---|---|
| Stoic | 아침 계획 · 저녁 돌아보기 질문, 질문별로 지난 답을 찾아볼 수 있다 | https://apps.apple.com/us/app/stoic-journal-mental-health/id1312926037 · https://www.getstoic.com/premium |
| Apple Journal | 새 항목 위젯이 질문을 하나씩 무작위로 보여 준다 | https://support.apple.com/guide/iphone/build-a-journaling-habit-iph70107aec2/18.0/ios/18.0 |
| Finch | 노력 하나를 끝낼 때마다 짧은 돌아보기 질문, 하루 끝엔 감사 질문 | https://www.deconstructoroffun.com/blog/x0hd2ssr80y5n7gv0w967pg7hwd7tl (2차) |
| Reflectly | 긍정 심리·마음챙김 질문, 부정적 사건을 다시 보게 묻는다 | https://apps.apple.com/us/app/reflectly-journal-ai-diary/id1241229134 |

→ sprout: 질문은 빈 페이지에서 **쪽지 카드 하나**만(지금 동작 그대로: 날짜로 정해지고 `다른 질문`으로 바뀜, 누르면 `Q.` 줄로 들어감). 질문 수를 늘리거나 아침/저녁으로 나누는 건 [다음].

## 3. 돌아보기 · 통계
| 앱 | 관찰 | 출처 |
|---|---|---|
| Daylio | **Year in Pixels** — 1년을 하루 한 칸 모자이크로, 칸 색 = 기분. 월 기분 선 그래프, 요일별 평균, 활동–기분 상관 | https://en.wikipedia.org/wiki/Daylio · https://www.ixcoach.com/learn/daylio-mood-tracker-review-2026 (2차) |
| Apple Journal (iOS 18) | 인사이트: 연속 기록·총 글자 수·쓴 날 수·가장 긴 연속, 쓴 날에 점이 찍힌 달력 | https://9to5mac.com/2024/09/19/ios-18-brings-much-needed-features-to-journal-app/ · https://forums.macrumors.com/threads/ios-18-brings-new-insights-widgets-and-health-integration-to-apples-journal-app.2428736/ |
| Day One | 달력 보기, **On This Day**(몇 해 전 같은 날) | https://dayoneapp.com/features/calendar-view/ · https://dayoneapp.com/guides/day-one-for-android/on-this-day-view/ |
| Stoic | Trends(기분 흐름·자주 한 활동·감정), Journey(지난 기록) | https://www.getstoic.com/premium |
| 틱틱 | 습관마다 **1년 히트맵**, 습관 체크 때 "무엇을 했고 기분이 어땠는지" 기록 창(이모티콘) · 연 보기 히트맵 · 연말 Year in Review | https://help.ticktick.com/articles/7055781785312952320 · https://help.ticktick.com/articles/7399726920725692416 · https://x.com/ticktick/status/1740357178400104644 (도움말 일부만 확인) |

→ sprout: 돌아보기 = 월 기분 달력(칸을 기분 색으로 채움) + **기분 흐름 선** + 기분 비율 + 연속 기록(지금·가장 길었던) + 한 줄 발견 + 이번 달 기억에 남는 날. 연 보기는 틱틱 습관 히트맵·Daylio처럼 **12줄 × 31칸 모자이크**.

## 4. 연속 기록 — 벌주지 않기
| 앱 | 관찰 | 출처 |
|---|---|---|
| Day One | 연속 기록은 끌 수 없지만 일기장별로 빼는 설정이 있고, **빠진 날을 나중에 채우면 이어진다** | https://dayoneapp.com/guides/tips-and-tutorials/journal-streaks/ |
| Finch | 놓치거나 오래 쉬어도 격려만, 순위표 없음. 다만 리뷰는 "죄책감을 주는 새의 메시지·알림 폭탄"을 지적 — 펫은 거울이어야지 잔소리꾼이면 안 된다 | https://www.autonomous.ai/ourblog/finch-self-care-app-review-full-breakdown · https://slate.com/technology/2026/09/finch-app-self-care-wellness-review.html |
| Stoic | 건너뛰어도 아프지 않은 연속(2차, 완전 확인 못 함) | https://screensdesign.com/showcase/journal-mental-health-stoic |

→ sprout: 연속은 지금 계산 그대로(지난 날을 채우면 이어짐 — Day One과 같다). 문구는 "끊겼어요" 같은 말 없이 `오늘도 이어 가요`·`지난 날을 채워도 이어져요`. 불꽃 대신 새싹 잎(성장 세계와 맞춤, 결정 대기). 일기로 XP 없음(15 §4) 유지.

## 5. 동반자(캐릭터) · AI 말투
- Finch: 펫의 모험이 끝나면 저녁에 펫과 이야기한다 — 하루를 닫는 의식. https://www.deconstructoroffun.com/blog/x0hd2ssr80y5n7gv0w967pg7hwd7tl (2차)
- Reflectly: 고른 기분에 맞춰 AI가 다음 질문을 만든다. https://makeheadway.com/blog/reflectly-review/
- 공감 중심 UX: 위험한 말이 보이면 차분하게 묻고 선택지를 주되 털어놓기를 강요하지 않는다, 채도 낮은 부드러운 색. https://www.smashingmagazine.com/2026/02/building-empathy-centred-ux-framework-mental-health-apps/ (2차)

→ sprout: 캐릭터는 **페이지 옆에 앉아** 쓰는 동안 바라보고(말은 하지 않음), 다 쓰고 쉬면 그때 한 번 말을 건다(지금 3.6초 규칙 그대로). 기분이 낮아도 캐릭터는 슬퍼하지 않고 "곁에 있을게"(10 §3.2 원칙: 시들거나 슬퍼하지 않는다).

## 6. 개인정보 신호
| 앱 | 관찰 | 출처 |
|---|---|---|
| Day One | 종단 간 암호화(AES-GCM-256) + 암호·생체 잠금, 개인정보 서약 페이지 | https://dayoneapp.com/guides/tips-and-tutorials/is-my-data-secure-and-private/ · https://dayoneapp.com/privacy-pledge/ |
| Apple Journal | 메뉴의 "일기 잠금"(암호) | https://appleinsider.com/inside/ios-18/tips/how-to-use-search-and-other-new-features-in-the-ios-18-journal-app |
| How We Feel | 기본은 기기에만, 익명 연구 공유는 고를 때만(2차) | https://www.nepsy.com/articles/leading-stories/yale-psychologists-launch-mood-meter-app/ |
| Daylio | 기기 저장 + 선택 백업 | https://www.reflection.app/journaling-apps/daylio |

→ sprout: 나만 보기를 **보이는 상태**로 만든다 — 페이지에 자물쇠 책갈피, 캐릭터는 눈을 감고 "안 볼게". 바닥 줄에 지금 누가 읽는지 한 줄. 돌아보기의 "기억에 남는 날"에는 나만 보기 날 글을 미리 보이지 않는다(화면 공유 대비). 종단 간 암호화는 15 §5 [다음] 그대로.

## 7. 위기 안내 · 안전한 말하기
- 한국 109(자살예방상담전화)는 2024-01-02부터 24시간, 1393 등 여러 번호를 하나로 모았다. https://www.newspim.com/news/view/20240102000281 · https://www.korea.kr/news/policyNewsView.do?newsId=148921874
- **1577-0199(정신건강위기상담)**: 통합 뒤에도 그대로 운영한다는 2차 요약이 있으나 원문을 열지 못했다(미확인). https://www.medicalworldnews.co.kr/m/view.php?idx=1510957937 → 109를 맨 앞에 두고, 1577-0199는 출시 전 보건복지부 원문으로 다시 확인한다.
- 안전한 말하기: 방법·장소를 말하지 않는다, 미화하지 않는다, 늘 도움받을 곳과 **희망의 말**을 함께. https://afsp.org/SafeReporting · https://sprc.org/keys-to-success/safe-and-effective-messaging-and-reporting/ · https://who.int/publications/i/item/9789240076846
- 앱에서: 도움받을 곳이 몇 초 안에 닿아야 한다, 차분한 색. (2차) https://www.smashingmagazine.com/2026/02/building-empathy-centred-ux-framework-mental-health-apps/

→ sprout: 위기 카드는 **빨간 경고가 아니라 차분하고 따뜻한 카드** — 번호는 크게, 번호 복사 버튼, 캐릭터는 옆에서 조용히(웃는 얼굴 아님). 동작(검사 순서·AI 멈춤·기록)은 15 §7 그대로. ⋯ 메뉴에 `도움받을 곳` 항목을 늘 둔다.

## 8. 접근성 · 움직임
- WCAG 2.3.3: 상호작용으로 생기는 움직임은 꼭 필요한 게 아니면 끌 수 있어야 한다. https://dequeuniversity.com/resources/wcag2.1/2.3.3-animations-from-interactions
- `prefers-reduced-motion`을 따르고 앱 안 스위치도 둔다. https://motionspec.dev/blog/prefers-reduced-motion

→ sprout: OS 설정 + 성장 화면의 `움직임 줄이기`(`sprout.growthMotion`)를 일기도 **읽기만** 해서 따른다. 기분은 색만으로 구분하지 않는다(얼굴 모양 + 글자 라벨 + aria-label).

## 미확인
- Daylio 기본 색 배치(자료끼리 다름), 연속이 끊길 때의 표시.
- Reflectly 그라데이션·카드 모양 세부, 개인정보·접근성.
- Apple Journal에서 하루 빠질 때 연속 표시.
- 1577-0199 현재 운영(§7).
