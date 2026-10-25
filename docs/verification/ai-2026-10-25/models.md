# 꿈틀(sprout) AI 모델·파인튜닝 구조 감사 — 2026-10-25

> 질문(오너): "AI가 쓰는 게 많잖아. 일기, 할 일 등록, 대화. 이게 지금 어떻게 파인튜닝돼서 어떻게 답변하는지 알려줘."
>
> 방법: 코드 읽기(main 3425abb), Jev 실험 워크트리 읽기, Mac mini를 SSH로 **읽기만** 했음(재시작·설정 변경 없음), 새 시험 계정 `qa-ai-audit-om5yxu@example.com`으로 지연을 쟀음. 오너 계정 데이터는 보지 않았다.

## 0. 결론 먼저

- **직접 학습시킨(파인튜닝한) 모델은 하나뿐이다. "Jev"라는 작은 분류 모델로, AI 비서에서 "이 말이 그냥 대화인지, 내 기록을 보라는 건지, 바꾸라는 건지"만 고른다.** 답을 쓰지는 않는다.
- **답을 쓰는 모델(일기 대화, 일기로 옮기기, 비서 답, 태그, 요약, 주간 리포트 등)은 모두 공개 모델 Qwen3.5-9B를 그대로 쓴다.** 학습은 하지 않았고, 매번 서버가 붙이는 **지시문(프롬프트)과 JSON 형식 검사**로 동작을 정한다.
- 할 일 **빠른 추가는 AI가 아니라 규칙**이다(날짜·시간 인식기).
- 모든 AI는 오너의 Mac mini(M1, 16GB) 한 대에서 돈다. 외부 AI API(OpenAI 등)는 쓰지 않는다.

## 1. 한 장 요약

| 기능(앱에서 보이는 것) | 모델 | 파인튜닝? | 답이 만들어지는 과정 |
|---|---|---|---|
| AI 비서: 말 종류 판단 | **Jev**(Qwen3.5-4B + LoRA + 고르기 머리, MLX 6bit) | **예** (합성 한국어 예문, 3단계 추가 학습) | 내 말 + 직전 대화 2쌍 → Jev가 chat/read/write/clarify 중 하나와 확신도 → 0.65 미만이면 되묻기, 아니면 아래 답 단계로 |
| AI 비서: 답·도구(할 일 찾기·만들기 제안 등) | Qwen3.5-9B (MLX 4bit) | 아니오 | 서버 지시문(`AGENT_SYSTEM`, 일반 대화면 `CHAT_SYSTEM` + 캐릭터 성격 카드) + 대화 → 필요하면 앱 도구 호출(최대 4번) → 앱이 결과를 근거와 대조 → 확인 카드(누르기 전엔 저장 안 함) |
| 일기: 캐릭터와 대화 | Qwen3.5-9B | 아니오 | `chatSystem`(대화 규칙 `COMPANION_RULES` + "들은 말만" `DIARY_GROUNDING`) + 그날 일기 + 이번 대화 → 1~3문장 공감 답 |
| 일기: 대화를 일기로 옮기기 | Qwen3.5-9B | 아니오 | 서버 지시문 `DISTILL_SYSTEM` + 대화 → JSON `{제목, 태그, 본문}` 형식 검사(깨지면 괄호 수리 후 다시 검사) → 일기 본문에 붙임 |
| 일기: 기억용 한 줄 요약 | Qwen3.5-9B | 아니오 | `SUMMARY_SYSTEM` + 일기 → 한 문장 → `diary_entries.summary` |
| 수집함 자동 분류(할 일/링크/위키/메모) + 위키 넣기 | Qwen3.5-9B | 아니오 | 메모 1,500자 + 리스트·위키 주제 이름 → JSON → 메모 종류·할 일 제안·위키 주제 (데스크톱만) |
| 볼 것 링크 요약 | Qwen3.5-9B | 아니오 | 페이지 제목·설명·본문 4,000자 → JSON `{한 줄, 요점 1~5}` |
| 자동 태그(aiTagId) | Qwen3.5-9B + 규칙 사전 | 아니오 | 먼저 규칙 사전, 그다음 할 일 제목·리스트 이름·태그 목록 → JSON 태그+확신도. `aiTagId`는 AI가 아니라 태그 이름으로 만든 고정 id (데스크톱만) |
| 리스트 정리·자동 이동(작업 지도) | Qwen3.5-9B + 키워드 | 아니오 | 할 일 제목·리스트 이름 → JSON 제안, 확신도 85 이상만 자동 이동 (데스크톱만) |
| 지난 할 일 정리 꼬리표 | Qwen3.5-9B | 아니오 | 지난 할 일 제목 → JSON 꼬리표 (데스크톱만, 저장 안 함) |
| AI로 나누기(계획 쪼개기) | Qwen3.5-9B | 아니오 | `BREAKDOWN_SYSTEM` + 할 일 제목·날짜·하위 할 일 → JSON 단계 → 하위 할 일로 넣음 |
| 성장: 주간 리포트 / 이번 주 목표 초안 | Qwen3.5-9B | 아니오 | 그 주 숫자·끝낸 할 일 제목 + 캐릭터 말투 → JSON (**각각 주 1회 = 합쳐서 주 2회 상한**, 데스크톱만) |
| 빠른 추가(자연어 할 일) | **AI 아님** — 규칙 | — | `@sprout/schema/recognition`이 날짜·시간·리스트를 글자 규칙으로 읽음 |
| bge-m3(임베딩) | Mac mini에 설치만 됨 | — | **앱 어디서도 쓰지 않음**(벡터 저장 없음) |

## 2. 기능별 상세

공통: 앱 → `POST /ai/<용도>`(로그인 토큰) → 서버 API의 대기열·상한(`server/api/src/ai.ts`) → AI 게이트웨이(`server/ai-runtime/runtime.py`, Mac mini 28011) → 모델. 요청·응답 원문은 서버가 **기록하지 않고** 숫자(요청 수·토큰·시간)만 `ai_usage` 표에 남긴다(ai.ts 주석·`pgUsageStore`). 공통 설정: 온도 0(일기 옮기기만 0.2), 생각 모드 끔, 입력 한도 6,144토큰, 출력 700토큰(태그 1,600, 비서 300/450), 사용자당 1분 6번·하루 100번.

| # | 기능 | 용도(purpose) | 지시문 위치 | 보내는 데이터 | 결과 형식 | 서버 상한 | 실패하면 | 결과 저장 | 앱 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 비서 말 종류 판단 | `assistant` mode `route` | 판단 질문: `server/ai-runtime/intent-question.json` | 내 말(≤4,000자), 직전 2쌍(각 300자) | `{intent, confidence}` | 비서 하루 40턴(턴의 첫 호출만 셈) | 모델이 안 되면 서버가 "chat, 확신 0"으로 바꿔 답만 하게 함 | 없음 | 둘 다 |
| 2 | 비서 답·도구 | `assistant` mode `agent` | `packages/schema/src/assistantTools.ts` `AGENT_SYSTEM`·`CHAT_SYSTEM`, `persona.ts` | 내 말, 최근 6턴, 캐릭터 이름; 도구 결과로 할 일·일정·메모 앞 200자·일기 200자×7일(일기는 동의+설정 켬일 때만) | 자유 글 + 도구 호출 | 한 턴 최대 4호출·150초 | "지금은 쓸 수 없어요" 문구 | 대화는 기기 안(데스크톱 localStorage, 휴대폰 로컬 파일). 확인 카드 누르면 `tasks`/`events` | 둘 다 |
| 3 | 비서 예전 경로 | `assistant` (mode 없음) | 데스크톱 `renderer/data/assistant.ts:89`, 휴대폰 `assistant/core.ts:95,102` | 말, 리스트 이름, 최근 4~8개 | JSON 의도 | 같음 | 서버가 agent를 지원 안 할 때만 쓰임 | — | 둘 다 |
| 4 | 수집함 분류·위키 | `classify` (뒷일) | `renderer/data/collector.ts:63-80` | 메모 1,500자, 리스트·위키 주제 이름 | JSON `classifySchema` | 하루 100 공용 | 60초 뒤 다시, 3번 실패면 `failed` | `notes.kind/suggestion`, `wiki_topics` | 데스크톱 |
| 5 | 링크 요약 | `classify` (뒷일) | `packages/schema/src/linkSummary.ts:63,69` | 페이지 제목·설명·본문 4,000자 | JSON `{head, lines}` | 기기당 자동 하루 20 | `fail` 표시, 다음 기회에 다시 | `notes.suggestion.linkSummary` | 둘 다 |
| 6 | 지난 일 꼬리표 | `classify` | `renderer/data/overdue.ts:197-216` | 제목 80자·리스트·기한, 최대 90개 | JSON | 공용 | 조용히 꼬리표 없음 | 저장 안 함 | 데스크톱 |
| 7 | 리스트 정리 | `map` (뒷일) | `renderer/data/listSuggest.ts:347` | 할 일 제목 120자, 리스트 이름 | JSON 제안 | 공용 | 키워드 결과만 적용 | `tasks.list_id`, `lists` | 데스크톱 |
| 8 | 자동 태그 | `tag` (뒷일) | `packages/schema/src/autoTag.ts:287,306` | 제목 120자, 리스트, 태그 ≤80개 | JSON 태그+확신도 | 하루 40 | 규칙 결과만 적용, 나중에 다시 | `task_tags`(source=ai), `tags` | 데스크톱 |
| 9 | AI로 나누기 | `breakdown` | `packages/schema/src/breakdown.ts:53` | 제목·리스트·날짜·하위 제목 | JSON 단계 | 하루 10 | 이유 문구(꺼짐·상한·형식) | 하위 `tasks`, `map_links` | 둘 다 |
| 10 | 일기 대화 | `diary` mode `chat` | `packages/schema/src/diaryPrompts.ts:19,31` + `diaryTalk.ts:339` | 그날 일기 3,000자 + 이번 대화 전부 | 자유 글 | 하루 30 | 미리 정한 공감 말로 대신 | `diary_messages`(캐릭터 말) | 둘 다 |
| 11 | 일기로 옮기기 | `diary` mode `distill` | `diaryPrompts.ts:38,50` (서버 것만 씀) | 내 말(각 1,200자·최근 40줄), 캐릭터 질문만 | JSON `{title,tags,entry}` | 하루 5 | 한 번 다시, 그래도 안 되면 "내 말 그대로 남겼어요" | `diary_entries.content` | 둘 다 |
| 12 | 일기 기억 요약 | `diary` (mode 없음) | `packages/schema/src/diary.ts:91` | 일기 3,000자 + 내 말 | 한 문장 | 공용 | 조용히 건너뜀 | `diary_entries.summary` | 둘 다 |
| 13 | 주간 리포트 | `weekly-report` | `renderer/data/growth-ai.ts:10` | 그 주 숫자, 끝낸 제목 30개 | JSON | **주 1** | 다음 실행 때 다시 | `weekly_reports.text_json` | 데스크톱 |
| 14 | 이번 주 목표 초안 | `kpi-draft` | `growth-ai.ts:19` | 지난주 숫자·목표 | JSON | **주 1** | 같음 | `weekly_reports.text_json.draft` | 데스크톱 |

참고: `polish`(다시 옮기기) 모드는 서버에만 있고 앱이 보내지 않는다. 데스크톱 `diary.ts`의 예전 "읽고 답해 주기"(`buddyReply`)는 부르는 화면이 없어 쓰이지 않는 코드로 보인다.

## 3. 서버 구성도

```
 휴대폰·데스크톱 앱
        │ HTTPS (Tailscale Funnel: macmini.tail425c97.ts.net)
        ▼
 Mac mini ─ Docker: sprout-api (이미지 sprout-api:photos-20261025)
        │  /ai/* : 로그인 확인 → 사용자별 상한 → 공용 대기열(동시 1, 대기 20, 사람이 기다리는 요청 먼저)
        │  .env  OLLAMA_URL=http://host.docker.internal:28011 · AI_ROUTING=jev · AI_CONCURRENCY=1
        ▼
 launchd com.sprout.ai-runtime (runtime.py, 127.0.0.1:28011) — Ollama처럼 보이는 게이트웨이, 한 번에 1건
        ├─ 말 종류 판단 → Jev 서버 127.0.0.1:28008 (serve_mlx_router.py)
        │      모델 ~/experiments/jev-routing-v3/mlx-model-v7-q6 (3.2GB)
        └─ 그 밖의 모든 답 → mlx_lm.server 127.0.0.1:28010
               모델 ~/experiments/jev-routing-v3/qwen-mlx-4bit (5.6GB, mlx-community/Qwen3.5-9B-4bit 원본 그대로)
        두 모델 늘 올려 둠 · 메모리 압력 4(위험)면 둘 다 내리고 멈춤 → 10분 정상이면 저절로 복구

 Ollama(11434): 켜져 있지만 지금 모델 안 올림. qwen3.5:9b(6.3GB)·bge-m3(1.1GB) 파일만 있음 — 게이트웨이가 처음 켤 때 Ollama 쪽 Qwen을 내림
 launchd com.sprout.ai-worker: Railway API(api-production-3716c.up.railway.app)에서 일을 당겨 와 같은 28011로 보냄(웹 미리보기용 경로)
```

- 게이트웨이·모델 상태(오늘 읽음): `/health` = `{"ok":true,"routing":"jev-q6","models":["qwen","jev"]}`, 메모리 압력 1(정상), 스왑 4.4GB/6GB, 디스크 남은 공간 16GB.
- 운영 중인 runtime.py는 main의 `server/ai-runtime/runtime.py`와 똑같다(diff 없음).
- 기록 `~/sprout/runtime/jev-v7/events.jsonl`(10-11~10-25): 요청 443건(판단 178·답 185·JSON 80). 하루 요청은 10-11 310건(시험) 뒤로 10-13 24 → 10-15 3 → 최근 하루 2~7건. 실패 25건 중 22건이 JSON 깨짐이고 모두 10-12 이전이다(10-12 괄호 수리 추가 뒤로는 없음). 멈춤(fault)은 10-12 21:24 한 번(메모리 압력 4), 10분 뒤 복구. 게이트웨이 전체 시간 중앙값 5.1초, 95% 28초, 최대 58초. 줄 서서 기다린 시간은 최대 19초.

### 오늘 잰 지연(새 시험 계정, 운영 주소)

| 요청 | 결과 | 시간 |
|---|---|---|
| `/ai/status` | 쓸 수 있음, features `agent·ground·jev-routing`, backend direct | 바로 |
| 판단 "오늘 좀 피곤하다" | chat 0.9999997 | **16.4초** (쉬고 있던 모델을 깨우는 첫 요청) |
| 그 답 | "피곤하다니, 오늘 하루 정말 고생했구나. 무슨 일로 그렇게 지치신 거야?" | 9.6초 |
| 판단 "요즘 잠이 잘 안 와…" | chat 0.9999999 | 1.6초 |
| 그 답 | "잠이 안 온다고? 나 오늘 밤에도 꿈나라에 들어가지 못해 좀 속상했어…" | 5.1초 |
| 판단 "내일 오후 3시에 치과 예약 추가해줘" | write 0.99998 | 1.4초 |
| JSON 분류 1건 | `{"area":"건강"}` | 1.9초 |
| 같은 사람이 동시에 3건 | 1건은 바로 거절(`user_busy`, 사용자당 동시 2), 2건은 차례로(대기열 1→0) | 1.9초·2.7초 |

→ 따뜻해진 뒤에는 판단 1.5초 + 답 5초 정도다. 오래 쉬고 난 첫 요청은 판단만 16초 걸렸다(HANDOFF의 "10~17분 쉬면 swap으로 밀려 12초" 문제와 같은 현상). 둘째 답의 "나 오늘 밤에도 꿈나라에 못 들어가서"는 `CHAT_SYSTEM`의 "실제 몸이나 밖에서 산 경험은 없어"를 어긴 지어낸 경험이고, 첫 답의 "지치신 거야"는 반말·존댓말이 섞였다. 지시문만으로 말투를 잡는 방식의 한계다.

## 4. 파인튜닝 상세 (Jev)

### 무엇인가
- **분류기**다. 글을 쓰지 않고 4개 선택지(chat·read·write·clarify) 중 하나에 확률을 매긴다. 모델의 마지막 숨은 상태를 작은 "고르기 머리(pointer head)"가 읽는다(`mlx_router.py` `Router.probabilities`, 어휘 출력 층을 쓰지 않음).
- 방식은 공개 프로젝트 **JevAny**(github.com/SimpleJev/JevAny, Apache-2.0)를 따른다. TypeSafe의 비공개 Jev와 같은 가중치는 아니다(실험 README에 명시).
- 베이스: **Qwen/Qwen3.5-4B**(revision `851bf6e8…`), 그 위에 JevAny가 공개한 LoRA·머리(`models/jevany-4b`)에서 시작.
- LoRA: rank 8, alpha 16, 모든 주의·MLP 층 대상(`checkpoint/adapter_config.json`, PEFT 0.21.2). 학습률 1e-5(v4는 5e-6), batch 1 × 누적 8. 학습은 오너의 MacBook(M3 Pro, PyTorch MPS)에서 했다. Mac mini에서는 학습하지 않았다.

### 운영 모델의 계보(근거: 학습 설정의 `init_from`, `export_v7_mlx.py`)
| 단계 | 시작점 | 학습 데이터 | 결과 |
|---|---|---|---|
| 공개 JevAny-4B-LoRA | Qwen3.5-4B | (공개 학습, 우리 데이터 아님) | 출발점 |
| v3 | 공개 모델 | 학습 672건(고유 발화 504), dev 160, test 160 | epoch1(step84) 선택. 새 test 160/160, 어려운 문항 55/64 |
| v4 | v3 step84 | 256건(새 128 + v3 다시 보기 128) | 분류 기준 **불합격**(42<46) — 하지만 다음 단계의 출발점으로 쓰임 |
| v6 | v4 step64 | 80건(질문 120) — 의도·대상 두 질문 | 두 질문 기준 **불합격**, 의도 질문만 따로 씀 |
| **v7 = 운영** | v6 step20의 **의도 질문만** | 추가 학습 없음 | 로컬 100문항 통과 → MLX 6bit 양자화 → Mac mini 100문항: 오류 0, 평균 9.37초, 일반 대화 76건 중 기록 조회 0 |

(v1·v2·v5는 갈래 실험으로 운영 계보에 없다.)

### 학습 데이터의 성격
- 모두 **AI가 쓰고 AI가 라벨을 붙인 합성 한국어 문장**이다. 사람 검수 없음, 실제 사용자 문장 없음(`data/v*/` 각 줄 `"human_reviewed": false`, 실험 README).
- 예: `"지난주 명상 완료 기록이 몇 개야?" → read`, `"내 기록과 상관없이 시험 준비 순서의 예를 들어봐" → chat`.

### 평가 결과(어디 있나)
- 워크트리 `/Users/koyunseo/orca/workspaces/ticktick/jev-routing` (브랜치 `kysk2295/jev-routing`) `docs/verification/assistant-routing-v3…v7-q6-concurrent-2026-10-11/`
- 운영 적용 보고서: main `docs/verification/assistant-routing-production-2026-10-11/REPORT.md`
- 기존 Qwen만 쓸 때와 비교(같은 100문항): 평균 20.0초 → 9.4초, 일반 대화를 기록 조회로 잘못 본 것 34/76 → 0/76. 단 기능 20문항 평균은 10.4 → 12.1초로 오히려 느려짐. 남은 오류: H29 "기타를 배우고 싶어"를 write로 반쯤 봐서 되묻기(확신 0.56), 지어낸 기억(H23), 계획 대신 되묻기(F20).
- **보고서가 스스로 밝힌 한계:** 100문항은 운영 프롬프트를 마지막으로 고치기 *전* 수치이고, 여러 턴 대화 품질은 검증하지 않았다. 역할·맥락 12문항은 9/12.

### 운영 적용 시점
- 2026-10-11 밤 Mac mini 적용(이미지 `sprout-api:jev-v7-contextfix-20261011`, 게이트웨이 launchd 등록). 10-12 21:54 마지막으로 다시 켠 뒤 13일째 계속 실행 중. 되돌리기 스크립트 `~/sprout/backups/jev-switch-20261011/rollback.sh`.
- 같은 날 실제 앱에서 생긴 문제(캐릭터 취미 질문을 기록 조회로 봄 등)는 **재학습이 아니라 앱 규칙**(`source:self_reference_guard`, 과거 오답 대화 빼기)으로 막았다. 학습 성과로 세지 않는다.
- 오늘(10-25) 다른 세션이 실서비스 경로 시험을 하는 중이다(`jev-routing/docs/verification/assistant-routing-runtime-e2e-2026-10-25/report.md`). 그 보고서에는 "판단이 실패하면 예전 경로로 가지 않고 턴 전체가 오류가 된다"(앱 `runTurn`)는 지적이 있다. 서버는 판단 실패를 chat으로 바꿔 주므로, 실제로 어떻게 보이는지는 그 세션 결과를 봐야 한다(이번에 확인 못 함).

### 파인튜닝하지 않은 것(명확히)
- **Qwen3.5-9B**: Hugging Face `mlx-community/Qwen3.5-9B-4bit`(revision `8b2b98c0…`)을 받은 그대로다. 파일 해시는 `qwen-mlx-manifest.json`에 있다. 운영 보고서에도 "Qwen은 파인튜닝하지 않았다"고 적혀 있다.
- 일기·할 일 태그·요약·리포트의 "똑똑함"은 모두 **지시문 + JSON 형식 + 앱 쪽 규칙(근거 검사, 확인 카드, 규칙 사전)**에서 나온다.

## 5. 위험·개선

### 개인정보 — 일기 원문은 어디까지 가나
1. **가는 곳:** 일기 대화·일기 본문은 앱 → Mac mini API → 같은 기계의 모델로만 간다. 외부 AI 회사로 나가지 않는다. 일기 AI는 동의했고 "나만 보기"가 아닌 날에만 불린다(`mayCallAi`).
2. **AI 서버 기록:** API는 원문을 기록하지 않는다(숫자만). 게이트웨이 `events.jsonl`에도 종류·시간·오류 이름만 있다. 모델 로그 `qwen.log`·`jev.log`에도 한글이 한 글자도 없었다(전체 검사). 처리 진행 숫자만 남는다.
3. **저장(더 큰 문제):** 일기 대화 원문(`diary_messages`)과 일기 본문(`diary_entries`)은 동기화 표라서 **서버 Postgres에 그대로(암호화 없이) 남는다.** 대화를 일기로 옮긴 뒤 원본 대화를 지우는 코드(`clearMessages`)가 있지만 **부르는 곳이 없다.** 그래서 원본 대화가 계속 쌓인다. 백업은 age로 암호화해서 구글 드라이브로 보낸다.
4. **비서에 들어가는 일기:** AI 비서의 `find_diary` 도구는 설정과 동의가 있을 때 일기 200자×7일을 모델에 넣는다.
5. **Railway 경로:** Mac mini 워커가 Railway API에서 일을 받아 온다. 그 경로를 쓰면 일기 원문이 Railway를 거친다. 지금 앱 기본 주소는 Mac mini라서 해당하지 않는다.

### 비용·부하(Mac mini 한 대)
- 모든 사용자, 모든 AI 기능이 **한 번에 1건**씩만 처리된다(`AI_CONCURRENCY=1`, 게이트웨이 LOCK). 지금은 하루 몇 건이라 괜찮다. 하지만 답 하나가 5~30초씩 걸리므로 동시 사용자가 5~10명만 돼도 대기 시간이 바로 쌓인다. 큐는 20건, 기다리는 상한은 3분이다.
- 16GB에 Jev 3.2GB + Qwen 5.6GB를 늘 올려 두고, 스왑을 4.4/6GB 쓰고 있다. 같은 기계에 Postgres·PowerSync·UniPort도 있어서 압력 4로 멈춘 적이 한 번 있다(10-12).
- 오래 쉬면 모델이 스왑으로 밀려 첫 응답이 16초다(오늘 측정). HANDOFF의 "깨우기 A안"은 아직 결정을 기다리는 중이다.
- 전기 말고 돈은 들지 않는다. 대신 사용자가 늘면 기계를 늘리는 것 말고는 확장할 방법이 없다.

### 모델이 꺼졌을 때
- 앱의 나머지 기능은 로컬 퍼스트라 그대로 돈다. AI는 "지금은 쓸 수 없어요"라고 보이고, 일기는 미리 정한 공감 말과 "내 말 그대로 저장"으로, 태그·리스트는 규칙만으로 돈다.
- 게이트웨이가 멈추면(fault) Jev와 Qwen이 **함께** 꺼진다. 모든 AI 기능이 503이 되고, 메모리가 10분 정상이어야 저절로 복구된다. 멈춤 알림 주소(`SPROUT_ALERT_URL`)는 launchd 설정에 없어서 알림이 가지 않는다(plist 확인).
- Jev와 Qwen 파일이 `~/experiments/jev-routing-v3`(실험 폴더)에 있고, 실행기도 실험용 가상환경이다. 정리하다 실수로 지우면 운영이 멈춘다.

### 파인튜닝 데이터와 실제 사용의 어긋남
- 학습 문장은 전부 AI가 만든 합성 문장이고 사람이 검수하지 않았다. 실제 사용자의 짧은 말, 오타, 띄어쓰기 없는 말('간지' 사례), 사투리, 여러 턴 맥락은 학습에 거의 없다.
- 평가 문항 상당수가 이미 학습·튜닝 중에 노출됐다. 그래서 "처음 보는 문장" 정확도는 확인되지 않았다. 보고서도 미노출 여러 턴 평가셋을 따로 만들라고 권한다.
- 운영 모델은 두 번 불합격한 단계(v4·v6) 위에 올린 것이다. 의도 질문만 따로 떼어 다시 검증해 통과시켰다.
- Jev는 **AI 비서의 길잡이 역할만** 한다. 일기·태그·요약의 품질 문제(지어낸 경험, 말투 섞임, JSON 깨짐)는 Jev 학습으로 고쳐지지 않는다.

### 개선 제안(우선순위)
1. 일기 원본 대화 보관 정책을 정한다: 옮긴 뒤 지우기(`clearMessages` 연결) 또는 기간 보관. 개인정보 처리방침과도 맞춘다.
2. 게이트웨이 멈춤 알림(`SPROUT_ALERT_URL`)을 켜고, 모델 파일을 `~/sprout/models` 같은 운영 경로로 옮긴다. 다음 배포 때 한다.
3. 실제 사용 문장으로 미노출 평가셋을 만든다(동의받은 익명 문장 또는 사람이 쓴 문장). 그다음에 재학습 여부를 판단한다. 답 모델(Qwen)의 말투 문제는 먼저 지시문과 시험으로 잡고, 파인튜닝은 그 뒤에 검토한다.
4. 사용자가 늘 때를 대비해 동시 처리 한계를 숫자로 공개한다. 예: "동시 1, 답 평균 5초 → 분당 약 10건". 넘치면 두 번째 기계나 외부 API 같은 대안을 미리 결정해 둔다.

## 부록: 이번 감사에서 한 일·하지 않은 일
- 만든 것: 이 문서, 시험 계정 1개(`~/.config/sprout/e2e-accounts.jsonl`에 `qa:true`로 추가, 비밀번호는 그 파일에만 있음). AI 요청 9건(판단 3, 답 2, JSON 1, 동시 3 중 2). 측정 스크립트는 세션 임시 폴더에만 있다.
- 안 한 것: 코드·서버·설정 수정, 재시작, git 변경, 오너 계정 데이터 열람, UniPort 등 다른 서비스 접근.
- 확인 못 한 것: 판단 실패 시 휴대폰·데스크톱 화면이 실제로 어떻게 보이는지, Railway API를 실제로 쓰는 사용자가 있는지.
