# 26 · 캐릭터 중심 성장 화면 — 다른 앱의 패턴 (2026-10-04 조사)

- 목적: [10 성장](../screens/10-growth.md) §3.2 "캐릭터 중심 v3"의 근거. 틱틱에는 이런 화면이 없으므로 **배치·동작 근거는 아래 앱들에서, 모양은 틱틱 디자인 언어(00 토큰)에서** 가져온다.
- 방법: 웹 검색 약 12회(리뷰·위키·공식 블로그). 1차 자료(공식 블로그·W3C)가 아닌 것은 "2차"라고 적었다. 출처에서 확인하지 못한 것은 맨 아래에 따로 둔다.
- 남의 그림·캐릭터·이름은 쓰지 않는다. 구조와 흐름만 참고한다.

## 1. 보상이 캐릭터에게 흘러드는 구조
| 앱 | 관찰 | 출처 |
|---|---|---|
| Finch | 할 일을 체크하면 펫 에너지 바가 오른다 — 완료가 곧바로 캐릭터 상태로 보인다 | https://screensdesign.com/showcase/finch-self-care-pet |
| Finch | 하루 에너지가 차면 새가 모험을 떠났다가 돌아와 본 것을 이야기한다 | https://www.makeuseof.com/finch-app-virtual-pet-motivation/ |
| Finch | 루프: 작은 돌봄 → 에너지 → 탐험 → 보상 → 내일 다시 | https://www.aidorable.ai/blog/finch-self-care-pet-app |
| Finch | 완료로 받은 재화로 옷·가구를 산다 | https://www.engadget.com/apps/this-self-care-virtual-pet-is-helping-me-get-my-act-together-160027169.html |
| Habitica | 할 일 완료 때 음식이 떨어지고, 먹일 때마다 성장 바가 찬다. 바가 차면 펫이 탈것으로 바뀐다 | https://habitica.fandom.com/wiki/Pets · https://habitica.fandom.com/wiki/Mounts |
| Pokemon Sleep | 하루 세 번(아침·오후·밤) 요리를 먹인다 — 먹이는 시간이 정해진 의식 | https://bulbapedia.bulbagarden.net/wiki/Snorlax_(Sleep) |

→ sprout: **할 일 완료 = 먹이**. 하루 할 일 XP 상한(10)을 "밥그릇 10칸"으로 보여 주면 상한이 벌이 아니라 "오늘은 배불러"가 된다. 자리를 비운 사이 받은 XP는 성장 화면에 들어올 때 방울로 날아와 먹는다(Habitica의 "먹일 때마다 바가 찬다").

## 2. 기분 · 반응 · 대기 동작
- 가상 펫은 기분 상태마다 대기 통통·기쁨 점프·시무룩·잠든 숨쉬기 애니메이션을 둔다(개인 개발 블로그, 참고용). https://dev.to/tech-aficionado/i-rebuilt-the-90s-tamagotchi-for-the-browser-and-accidentally-learned-more-about-state-machines-254j
- Duolingo식 마스코트는 Rive **상태 머신**(대기·쓰기·손 흔들기·축하)으로 만든다(2차). https://uianimation.medium.com/bringing-mascots-to-life-duolingo-style-character-animation-in-rive-a075d648cf19

→ sprout: 캐릭터를 상태 머신(대기·궁금·기쁨·배부름·졸림·축하·진화)으로 정의한다. 지금 그림이 SVG라 Rive 없이 CSS 애니메이션 + 얼굴 바꾸기로 한다(정식 그림 때 Rive 검토는 [다음]).

## 3. 하루 첫 인사 · 체크인
- Finch: 아침 기분 체크를 하면 펫이 에너지를 얻어 탐험하러 간다. https://apps.apple.com/us/app/finch-self-care-pet/id1528595748
- Pokemon Sleep: 아침에 수면 결과를 보여 주고, 결과에 맞는 친구들이 주변에 나타난다. 주마다 새 지역으로 바뀐다. https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Sleep · https://pokemonnj.fandom.com/wiki/Pok%C3%A9mon_Sleep/Gameplay

→ sprout: 하루 처음 성장 화면을 열면 캐릭터가 시간대 인사 + 오늘 할 일 수를 말한다. 주 단위 리듬은 이미 있는 주간 목표·리포트로 잇는다.

## 4. 퀘스트 · 모험 · 일기
- Finch: 모험에서 돌아온 새가 이야기를 들려준다 — 목표를 캐릭터의 외출 보고로 포장한다. https://www.makeuseof.com/finch-app-virtual-pet-motivation/
- Finch: 퀘스트, 사용자 일기·감사 일기가 있다. https://www.bustle.com/wellness/finch-app-review-features-price
- Habitica: 퀘스트로 펫을 얻는다. https://habitica.fandom.com/wiki/Pets

→ sprout: 주간 목표를 **캐릭터의 이번 주 퀘스트**로, 주간 리포트를 **캐릭터가 쓴 한 주 일기**로 보여 준다(데이터·규칙은 그대로, 모양과 말투만).

## 5. 방 꾸미기 · 수집
- Finch: 재화로 옷장·방을 꾸민다. (Engadget, 위 링크)
- Neko Atsume: 먹이·장난감을 놓을수록 손님이 늘고, 수집 진행이 뚜렷해서 다시 올 이유가 된다. 목표·끝·"밥그릇이 비었다" 알림이 없다. https://medium.com/@CarrotCreative/neko-atsume-the-cult-of-collecting-cats-c4bee5a9cb0b · https://alexiamandeville.medium.com/game-design-breakdown-the-simplicity-of-neko-atsume-a8616a937a47

→ sprout: 재화를 새로 만들지 않는다(XP 규칙 그대로). **레벨에 따라 장식이 열리고**, 사용자는 놓을지 말지만 고른다.

## 6. 진화 · 레벨업 순간 · 연속 축하
- Duolingo는 연속 7·30·100일·1년에 마스코트가 불사조로 변신하는 축하를 만들었다. "타이밍이 전부"라며 리듬을 바꿔 여러 번 다시 그렸고, 풍선 들던 예전 연출은 축하답지 않아 바꿨다. 업데이트 뒤 연속 유지·축하 참여가 늘었다고 한다(공식 블로그). https://blog.duolingo.com/streak-milestone-design-animation
- Habitica: 성장 바가 가득 차는 순간이 변환 지점. https://habitica.fandom.com/wiki/Mounts

→ sprout: 레벨업은 짧게(약 2초), 진화는 길게(약 3초) 무대 위에서 연출한다. 레벨업 때 새로 열린 장식을 함께 보여 준다.

## 7. 벌 없는 설계 vs 죄책감 설계
- Finch: 목표를 못 채우거나 오래 안 들어와도 격려만 한다. 못 한 것이 아니라 한 것을 보여 준다. Slate는 "Duolingo의 짓궂은 알림 vs Finch의 부드러운 돌봄"으로 대비했다. 너무 귀여운 말투가 안 맞는 사용자도 있다고 했다. https://slate.com/technology/2026/09/finch-app-self-care-wellness-review.html
- Habitica: 펫은 굶겨도 죽지 않는다(꾸밈용). 대신 일과를 놓치면 플레이어 HP가 깎인다. (위키 링크)
- Duolingo 알림이 친근함 → 수동공격 → 슬픈 마스코트로 이어지고 연속 손실 회피가 불안을 만든다는 비판(칼럼·블로그 수준). https://webdesignerdepot.com/the-art-of-duolingo-notifications-the-subtle-manipulation-of-language-learners/ · https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification
- Forest: 앱을 떠나면 나무가 시든다(손실 회피가 핵심). https://en.wikipedia.org/wiki/Forest_(application)
- Tamagotchi 계열: 방치하면 나쁜 모습이 되거나 죽는다. https://www.aidorable.ai/blog/tamagotchi-virtual-pet-apps

→ sprout(10 §2.2.1 "벌은 주지 않는다"와 같은 방향): 캐릭터는 **시들거나 슬퍼하지 않는다**. 오래 안 오면 졸 뿐이고, 깨우면 반긴다. 연속 일수가 끊겨도 "다시 1일" 같은 경고 없이 조용히 0으로. 말풍선 문장은 한 것만 말한다.

## 8. 접근성 — 움직임 줄이기
- WCAG 2.3.3(AAA): 상호작용으로 생기는 움직임은 끌 수 있어야 한다(기능에 꼭 필요하면 예외). https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html
- 구현은 `@media (prefers-reduced-motion: reduce)`. https://testparty.ai/blog/wcag-2-3-3-animation-from-interactions-2025-guide
- 대상은 이동·확대·회전·패럴랙스. 색 변화·불투명도 페이드는 해당하지 않는다. https://silktide.com/accessibility-guide/the-wcag-standard/2-3/seizures-and-physical-reactions/2-3-3-animation-from-interactions/
- iOS Reduce Motion: 큰 확대·레이어 움직임을 페이드 같은 단순 전환으로 바꾼다(2차 해설, Apple HIG 원문은 못 가져옴). https://tanaschita.com/ios-accessibility-reduced-motion/

→ sprout: 움직임 줄이기면 숨쉬기·날아가기·튀기·색종이·구름을 끄고, **정보는 그대로** 보인다(레벨 배너·XP 숫자·말풍선은 페이드로).

## 확인하지 못한 것
- Plant Nanny는 찾아보지 못했다.
- 탭 반응·눈 깜빡임·숨쉬기의 구체 수치(주기·이징)는 1차 자료가 없다 → 10 §3.2의 값은 [임시].
- 펫이 사용자에게 편지·일기를 쓰는 형식의 출처는 못 찾았다(Finch는 "모험 이야기"). 일기 카드는 sprout 설계.
