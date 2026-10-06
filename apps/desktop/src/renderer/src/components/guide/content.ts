// 37 탭 사용법 — 탭마다 둘러보기(3단계까지) · 사용법 창 절(4~6개) · "이렇게 쓰면 좋아요"(2~3개).
// 글은 짧은 해요체. `**굵게**` · `` `키` `` 두 가지 표시만 쓴다(Rich가 그린다). 그림은 illustrations.tsx(직접 그린 선화).
import type { GuideTab } from './core'

export type IllId =
  | 'map-what' | 'map-now' | 'map-seq' | 'map-goal' | 'map-split' | 'map-views'
  | 'tasks-smart' | 'tasks-quick' | 'tasks-natural' | 'tasks-tags' | 'tasks-ai' | 'tasks-inbox'
  | 'cal-kinds' | 'cal-create' | 'cal-arrange' | 'cal-views' | 'cal-holiday'
  | 'growth-xp' | 'growth-evolve' | 'growth-quests' | 'growth-review' | 'growth-diary'
  | 'ai-talk' | 'ai-ask' | 'ai-undo' | 'ai-quick'
  | 'collect-throw' | 'collect-sort' | 'collect-watch' | 'collect-wiki' | 'collect-share'
  | 'diary-page' | 'diary-private' | 'diary-consent' | 'diary-talk' | 'diary-review'

export type GuideSectionDef = { id: string; ill: IllId; title: string; body: string; /** AI를 쓸 수 없을 때 절 아래 회색 한 줄 */ aiOff?: string }
export type RecipeDef = { id: string; title: string; steps: string[]; cta: string }
export type TourStepDef = { /** 차례로 찾고, 없으면 다음 후보 → 모두 없으면 가운데 카드. `@all:` = 맞는 것 모두 감싸기 */ targets: string[]; title: string; body: string; ill?: IllId }
export type GuideContent = {
  /** 사용법 창 제목·`?` 툴팁 */ title: string
  /** 제목 아래 한 줄 */ lead: string
  sections: GuideSectionDef[]
  recipes: RecipeDef[]
  steps: TourStepDef[]
  /** 사용법 창 맨 아래 오른쪽 작은 안내(없으면 `? 단축키 모음`) */ foot?: string
}

const LAST = ' 사용법은 머리의 **?**에서 언제든 다시 볼 수 있어요.'

export const GUIDES: Record<GuideTab, GuideContent> = {
  // ── 할 일 ──
  tasks: {
    title: '할 일 사용법',
    lead: '적고, 끝내고, 알아서 정리되는 곳이에요.',
    sections: [
      { id: 'smart', ill: 'tasks-smart', title: '스마트 목록', body: '**오늘 · 내일 · 다음 7일**은 날짜를 보고 저절로 모여요. 리스트를 고를 필요 없이 오늘 할 일만 보면 돼요. 단축키 `G` `T`는 오늘, `G` `I`는 기본함.' },
      { id: 'quick', ill: 'tasks-quick', title: '빠른 추가', body: '어느 화면에서든 `⌘N`, 앱이 뒤에 있어도 `⌃⇧A`로 작은 창이 떠요. 목록 위 입력 줄에 바로 적고 `Enter`를 눌러도 돼요.' },
      { id: 'natural', ill: 'tasks-natural', title: '날짜는 말하듯이', body: '"**내일 오후 3시** 치과", "**매주 월요일** 운동"처럼 쓰면 날짜·반복을 알아보고 칩으로 보여 줘요. 칩을 누르면 인식을 풀어요.' },
      { id: 'tags', ill: 'tasks-tags', title: '#태그와 [[링크]]', body: '`#`을 치면 태그를, `[[`를 치면 리스트·태그·다른 할 일을 골라 이어요. 이어진 것은 사이드바와 위키에서 한데 모여요.' },
      { id: 'ai', ill: 'tasks-ai', title: '✦ AI가 정리해 줘요', body: '기본함에 넣은 새 할 일은 AI가 제목을 보고 **알맞은 리스트**와 **태그**를 붙여요. ✦ 표시가 AI가 한 것이고, 상세에서 ✕로 떼면 다시 안 붙어요.', aiOff: '지금은 AI가 쉬고 있어요. 돌아오면 이어서 정리해요' },
      { id: 'inbox', ill: 'tasks-inbox', title: '기본함 정리', body: '기본함에 쌓인 일은 기본함 카드의 **정리하기**(또는 `⌘K` › 기본함 정리하기)에서 한 번에 제자리로 옮겨요. 다 정리하면 XP도 받아요.' }
    ],
    recipes: [
      { id: 'quick', title: '떠오르면 바로 적기', steps: ['`⌃⇧A`로 빠른 추가 열기', '"금요일까지 보고서 #일"처럼 한 줄로', '`Enter` — 정리는 AI에게 맡겨요'], cta: '빠른 추가 열기' },
      { id: 'natural', title: '날짜를 말로 넣어 보기', steps: ['입력 줄에 "내일 오후 3시 치과"', '날짜 칩이 생기는지 보기', '`Enter`로 넣으면 오늘·내일 목록에 떠요'], cta: '예시 넣어 보기' },
      { id: 'tidy', title: '기본함 비우기', steps: ['기본함 카드 › 정리하기', 'AI가 고른 자리를 보고 고치기', '다 정리했어! — XP 받기'], cta: '기본함 정리하기' }
    ],
    steps: [
      { targets: ['@all:' + ['all', 'today', 'tomorrow', 'next7', 'inbox'].map((v) => `.sidebar__item[data-view="smart:${v}"]`).join(', '), '.app__sidebar', '.list .pane-header'], title: '오늘 할 일만 보면 돼요',
        body: '**오늘 · 내일 · 다음 7일**은 날짜를 보고 저절로 모여요. 리스트를 고르지 않고 적어도 기본함에 들어가요.' },
      { targets: ['.list .addbar', '.list .pane-header'], title: '말하듯이 적어요',
        body: '"**내일 오후 3시** 치과 **#건강**"처럼 적으면 날짜와 태그를 알아봐요. 앱 밖에서도 `⌃⇧A`로 빠른 추가가 떠요.', ill: 'tasks-natural' },
      { targets: ['.sidebar__item[data-view="smart:inbox"]', '.app__sidebar', '.list .pane-header'], title: '정리는 ✦ AI가 도와줘요',
        body: '기본함의 새 할 일은 AI가 리스트·태그를 붙여요. 쌓이면 **정리하기**로 한 번에 옮겨요.' + LAST }
    ]
  },

  // ── 캘린더 ──
  calendar: {
    title: '캘린더 사용법',
    lead: '할 일과 일정을 시간 위에 놓고 보는 곳이에요.',
    sections: [
      { id: 'kinds', ill: 'cal-kinds', title: '할 일과 일정', body: '모양은 같고 앞 아이콘으로 나눠요. **체크박스**는 할 일(누르면 완료), **달력 아이콘**은 일정이에요. 연결한 구글·Apple 캘린더 일정도 끌고 고치면 그 캘린더에 바로 저장돼요.' },
      { id: 'create', ill: 'cal-create', title: '빈 칸에서 만들기', body: '빈 칸을 누르면 그 시각에, **끌면** 그 길이만큼 만들어요. 팝오버에서 할 일·일정을 골라요. 막대를 끌어 옮기고 가장자리로 길이를 바꿔요. `⌘Z`로 되돌려요.' },
      { id: 'arrange', ill: 'cal-arrange', title: '할일 정렬 칸', body: '⋯ › **할일 정렬**을 켜면 오른쪽에 날짜 없는 할 일이 모여요. 끌어서 캘린더에 놓으면 그 시각으로 잡혀요.' },
      { id: 'views', ill: 'cal-views', title: '보기와 옵션', body: '머리 보기 단추로 **일** `D` · **주** `W` · **월** `M`을 바꿔요. ⋯ › **옵션 보기**에서 완료 표시·반복·색 기준·아이콘을 골라요.' },
      { id: 'holiday', ill: 'cal-holiday', title: '공휴일 · 다른 캘린더', body: '공휴일과 일요일은 빨강, 토요일은 파랑이에요. 휴일 표시·음력·주 번호는 **설정 › 날짜 & 시간**, 구글·Apple 연결은 ⋯ › **캘린더 구독**에서.' }
    ],
    recipes: [
      { id: 'arrange', title: '날짜 없는 일에 시간 잡기', steps: ['⋯ › 할일 정렬 켜기', '할 일을 끌어 비는 시간에 놓기', '잘못 놓으면 `⌘Z`'], cta: '할일 정렬 열기' },
      { id: 'options', title: '보기를 내 맘대로', steps: ['⋯ › 옵션 보기', '완료한 일·반복·색 기준 고르기', '항목 아이콘을 켜면 할 일·일정이 한눈에'], cta: '옵션 보기 열기' },
      { id: 'subscribe', title: '구글·Apple 일정도 함께', steps: ['⋯ › 캘린더 구독', '계정을 연결하고 캘린더 고르기', '왼쪽 패널에서 켜고 끄기'], cta: '캘린더 구독 열기' }
    ],
    steps: [
      { targets: ['.cal__body'], title: '빈 칸을 눌러 만들어요',
        body: '누르면 그 시각에, **끌면** 그 길이만큼 할 일이나 일정이 생겨요. 체크박스가 있으면 할 일, 달력 아이콘이면 일정이에요.', ill: 'cal-create' },
      { targets: ['.cal__tools [aria-label="캘린더 메뉴"]', '.cal__tools'], title: '옵션과 할일 정렬은 ⋯에',
        body: '**옵션 보기**에서 보이는 것을 고르고, **할일 정렬**을 켜면 날짜 없는 할 일을 끌어 시간에 놓을 수 있어요.' },
      { targets: ['.cal__side', '.cal__header'], title: '왼쪽은 작은 달력과 거르기',
        body: '날짜를 골라 이동하고, 리스트·태그로 거르고, 구독한 캘린더를 켜고 꺼요. 공휴일은 빨강으로 보여요.' + LAST }
    ]
  },

  // ── 성장 ──
  growth: {
    title: '성장 사용법',
    lead: '해낸 일이 캐릭터를 키우는 곳이에요.',
    sections: [
      { id: 'xp', ill: 'growth-xp', title: 'XP는 이렇게 쌓여요', body: '할 일 하나 끝내면 **+1**(하루 10까지), 이번 주 퀘스트 달성 **+30**(한 주 3개까지), 다 달성하면 **+20** 더. 주간 점검 **+30**, 기본함 정리 **+20**.' },
      { id: 'evolve', ill: 'growth-evolve', title: '캐릭터가 자라요', body: '레벨이 오르면 진화해요 — **아기 → 꼬마(Lv 3) → 친구(Lv 6) → 단짝(Lv 10) → 전설(Lv 15)**. 캐릭터 종류는 처음 성향 조사로 정해져요.' },
      { id: 'quests', ill: 'growth-quests', title: '이번 주 퀘스트', body: '한 주에 지킬 목표를 5개까지 적어요. "운동 3번"처럼 횟수를 넣으면 점으로 채워요. 회색 줄은 캐릭터의 제안이에요 — 눌러서 고치고 `Enter`.' },
      { id: 'review', ill: 'growth-review', title: '주간 점검', body: '일주일에 한 번 **돌아보기 → 밀린 일 정하기 → 다음 주 목표**를 차례로 해요. 일요일 저녁엔 오늘 목록 카드가 여기로 데려와요.' },
      { id: 'diary', ill: 'growth-diary', title: '캐릭터의 일기', body: '한 주가 끝나면 캐릭터가 내 한 주를 일기로 써 줘요. 새 일기가 오면 레일 종에 알림이 떠요.', aiOff: '지금은 AI가 쉬고 있어요. 돌아오면 일기를 써 둘게요' }
    ],
    recipes: [
      { id: 'review', title: '일요일 저녁 10분', steps: ['주간 점검 시작', '밀린 일은 다음 주로 넘기거나 놓아 주기', '다음 주 퀘스트 골라 두기'], cta: '주간 점검 시작' },
      { id: 'quest', title: '이번 주 목표 세우기', steps: ['이번 주 퀘스트에 한 줄 적기', '횟수가 있으면 "독서 3번"처럼', '3개만 달성해도 +90 XP'], cta: '퀘스트 적기' },
      { id: 'diary', title: '캐릭터 일기 읽기', steps: ['오른쪽 ○○의 일기로', '지난주 기록을 다시 보기', '좋았던 일을 다음 주에도'], cta: '일기 보기' }
    ],
    steps: [
      { targets: ['.gs-stage-card'], title: '해낸 만큼 자라요',
        body: '할 일을 끝내면 XP가 쌓이고 레벨이 오르면 캐릭터가 진화해요. 아래 길에서 다음 모습까지 남은 레벨을 봐요.' },
      { targets: ['.gs-col > .growth-card:first-child', '.gs-lower'], title: '이번 주 퀘스트',
        body: '한 주 목표를 5개까지 적어요. 달성하면 **+30 XP**(한 주 3개까지).', ill: 'growth-xp' },
      { targets: ['.gs-review-entry', '.gs-lower'], title: '일주일에 한 번 점검',
        body: '**돌아보기 → 밀린 일 → 다음 주 목표**. 끝내면 **+30 XP**, 한 주가 끝나면 캐릭터가 일기를 써 줘요.' + LAST }
    ]
  },

  // ── AI 비서 ──
  assistant: {
    title: 'AI 비서 사용법',
    lead: '말로 할 일을 넣고, 내 기록을 물어보는 곳이에요.',
    sections: [
      { id: 'talk', ill: 'ai-talk', title: '말로 할 일 넣기', body: '"**다음 주 화요일 오전 10시 팀 회의** 넣어 줘"처럼 말하면 날짜·시간까지 넣어 할 일로 만들어요.' },
      { id: 'ask', ill: 'ai-ask', title: '내 기록 물어보기', body: '"이번 주에 끝낸 일", "내일 일정 뭐 있어?"처럼 물으면 내 할 일·일정·완료 기록에서 찾아 숫자와 근거 행으로 보여 줘요.' },
      { id: 'undo', ill: 'ai-undo', title: '결과 카드와 되돌리기', body: '만든 할 일은 카드로 보여 줘요. 줄을 누르면 상세가 열리고, 마음에 안 들면 **되돌리기** 한 번으로 없던 일이 돼요.' },
      { id: 'quick', ill: 'ai-quick', title: '어디서든 빠른 창', body: '다른 탭에서는 오른쪽 아래 **말풍선 단추**로 작은 창을 열어요. 쓰던 글은 그대로 이어져요. 대화 기록은 이 기기에만 남아요.', aiOff: '지금은 AI에 연결할 수 없어요. 머리의 상태 알약을 눌러 다시 연결해요' }
    ],
    recipes: [
      { id: 'add', title: '말 한마디로 할 일', steps: ['입력 칸에 날짜와 할 일을 한 줄로', '`Enter`로 보내기', '결과 카드에서 확인 — 아니면 되돌리기'], cta: '예시 적어 보기' },
      { id: 'week', title: '이번 주 돌아보기', steps: ['"이번 주에 끝낸 일 정리해 줘"', '숫자와 근거 행 보기', '줄을 눌러 그 할 일 열기'], cta: '물어보기 적기' },
      { id: 'plan', title: '오늘 무엇부터', steps: ['"오늘 할 일 중 먼저 할 3가지 골라 줘"', '이유와 함께 보기', '마음에 들면 바로 시작'], cta: '부탁 적어 보기' }
    ],
    steps: [
      { targets: ['.assistant-composer'], title: '말로 시키면 돼요',
        body: '"**내일 오후 3시** 치과 넣어 줘"처럼 적고 `Enter`. 할 일을 만들거나 내 기록에서 답을 찾아요.' },
      { targets: ['.assistant-chips', '.assistant-messages'], title: '예시부터 눌러 보세요',
        body: '자주 쓰는 부탁을 예시로 두었어요. 누르면 바로 보내요. 만든 할 일은 카드에서 **되돌리기**할 수 있어요.', ill: 'ai-undo' },
      { targets: ['.assistant-status', '.assistant-view .pane-header'], title: '연결 상태',
        body: '초록이면 바로 쓸 수 있어요. 끊기면 알약을 눌러 다시 연결해요. 다른 탭에선 오른쪽 아래 말풍선으로 빠른 창을 열어요.' + LAST }
    ]
  },

  // ── 수집함 ──
  collect: {
    title: '수집함 사용법',
    lead: '생각나는 건 일단 던져 두는 곳이에요.',
    sections: [
      { id: 'throw', ill: 'collect-throw', title: '무엇이든 던져 두기', body: '할 일·링크·메모를 가리지 말고 적고 `Enter`(`Shift+Enter`는 줄바꿈). AI가 알아서 **할 일 · 볼 것 · 메모**로 나눠 둬요.' },
      { id: 'sort', ill: 'collect-sort', title: '할 일로 등록', body: '할 일처럼 보이는 줄에는 제안이 붙어요. **등록**을 누르면 날짜까지 넣어 할 일이 되고, 오른쪽 클릭으로 직접 바꿀 수도 있어요.', aiOff: '지금은 AI가 쉬고 있어요. 던져 둔 것은 그대로 남고, 돌아오면 나눠요' },
      { id: 'watch', ill: 'collect-watch', title: '볼 것', body: '영상·글 링크는 **볼 것**에 제목과 함께 모여요. 다 본 건 동그라미를 눌러 **다 본 것**으로 넘겨요.' },
      { id: 'wiki', ill: 'collect-wiki', title: '위키', body: '모아 둔 것과 할 일을 **주제별**로 엮어 보여 줘요. `[[링크]]`로 이은 것도 여기서 한데 보여요.' },
      { id: 'share', ill: 'collect-share', title: '밖에서 넣기', body: '휴대폰 공유 단추나 카카오톡 대화 가져오기로도 들어와요. 가져온 건 위 띠에서 정리되는 걸 볼 수 있어요.' }
    ],
    recipes: [
      { id: 'throw', title: '머릿속 비우기', steps: ['떠오르는 걸 한 줄씩 던지기', 'AI가 나눌 때까지 그냥 두기', '할 일 제안은 등록으로'], cta: '던져 두기' },
      { id: 'watch', title: '주말에 볼 것 고르기', steps: ['볼 것 칸 열기', '보고 싶은 것부터', '다 본 건 동그라미 눌러 넘기기'], cta: '볼 것 열기' },
      { id: 'wiki', title: '주제로 다시 보기', steps: ['위키 칸 열기', '주제를 눌러 모인 것 보기', '이어진 할 일로 바로 가기'], cta: '위키 열기' }
    ],
    steps: [
      { targets: ['.notes__addbar', '.notes__main .pane-header'], title: '일단 던져 두세요',
        body: '할 일·링크·메모를 가리지 말고 적고 `Enter`. 나누는 건 AI가 해요.' },
      { targets: ['.notes__seg'], title: '수집 · 볼 것 · 위키',
        body: '던진 것은 **수집**에, 영상·글은 **볼 것**에, 주제별 묶음은 **위키**에 모여요.', ill: 'collect-wiki' },
      { targets: ['.notes__scroll .row', '.notes__scroll'], title: '할 일은 등록 한 번',
        body: '할 일처럼 보이는 줄에 제안이 붙으면 **등록**을 눌러요. 휴대폰 공유로 넣은 것도 여기로 와요.' + LAST }
    ]
  },

  // ── 일기 ──
  diary: {
    title: '일기 사용법',
    lead: '하루를 적고, 원하면 캐릭터와 나누는 곳이에요.',
    sections: [
      { id: 'page', ill: 'diary-page', title: '하루 한 장', body: '기분 얼굴을 고르고 적으면 저절로 저장돼요. 막막하면 **오늘의 질문**으로 시작해요. 그날 끝낸 할 일은 아래에 저절로 붙어요. `↑` `↓`로 하루씩, `T`는 오늘.' },
      { id: 'private', ill: 'diary-private', title: '나만 보기', body: '페이지 위 🔒을 켜면 그날 일기는 **AI가 읽지 않아요**. 캐릭터도 눈을 감아요. 다시 누르면 꺼져요.' },
      { id: 'consent', ill: 'diary-consent', title: '나눌지는 내가 정해요', body: '처음 한 번 캐릭터와 나눌지 물어요. 나누면 캐릭터가 일기를 읽고 답해 줘요. ⋯ 메뉴에서 언제든 끌 수 있어요.' },
      { id: 'talk', ill: 'diary-talk', title: '캐릭터와 이야기', body: '다 쓰고 잠깐 쉬면 캐릭터가 먼저 공감하고 하나 물어요. 고민이 행동으로 이어지면 **할 일로** 칩이 생겨요. 친구처럼 들어 주지만 전문 상담은 아니에요.', aiOff: '지금은 캐릭터가 쉬고 있어요. 일기는 그대로 저장돼요' },
      { id: 'review', ill: 'diary-review', title: '돌아보기', body: '머리의 **돌아보기**에서 한 해 기분 칸, 이달 기록, 연속 쓴 날을 봐요. 날짜를 누르면 그날로 가요.' }
    ],
    recipes: [
      { id: 'today', title: '자기 전 3분', steps: ['기분 얼굴 하나 고르기', '질문 쪽지로 한두 줄', '캐릭터의 한마디 듣기'], cta: '오늘 일기 쓰기' },
      { id: 'review', title: '한 달에 한 번 돌아보기', steps: ['돌아보기 열기', '기분 칸에서 좋았던 날 찾기', '그날 일기 다시 읽기'], cta: '돌아보기 열기' },
      { id: 'talk', title: '고민 털어놓기', steps: ['일기에 고민을 그대로 적기', '캐릭터와 이야기 칸에서 이어 말하기', '할 일로 칩이 생기면 눌러 두기'], cta: '이야기 칸 보기' }
    ],
    steps: [
      { targets: ['.diary-page', '.diary__editor'], title: '하루 한 장',
        body: '기분을 고르고 적으면 저절로 저장돼요. 그날 끝낸 할 일은 아래에 저절로 붙어요.' },
      { targets: ['.diary-mark', '.diary__foot-btn'], title: '🔒 나만 보기',
        body: '켜면 그날 일기는 **AI가 읽지 않아요**. 나누기 자체를 끄는 건 ⋯ 메뉴에서.', ill: 'diary-private' },
      { targets: ['.diary-comp', '.diary__foot', '.diary__editor'], title: '캐릭터와 이야기',
        body: '나누기를 켜면 다 쓴 뒤 캐릭터가 먼저 공감하고 물어요. 머리의 **돌아보기**에서 지난 기분을 한눈에 봐요.' + LAST }
    ]
  },

  // ── 작업 지도(34 — 공통 체계로 옮김, 글은 그대로) ──
  map: {
    title: '작업 지도 사용법',
    lead: '할 일이 많을 때 무엇부터 할지 보여 주는 곳이에요.',
    sections: [
      { id: 'what', ill: 'map-what', title: '무엇을 보여 주나요', body: '**계획**은 흩어진 할 일을 프로젝트별로 모아 보여 줘요. 공모전·시험·사이드 프로젝트처럼 여러 리스트에 걸친 일도 제목을 보고 **저절로 묶어요**(태그를 달 필요 없음). 카드를 누르면 관련 일이 날짜순으로 이어진 타임라인이 열려요. 폴더 › 리스트 › 할 일 나무는 머리 **전체 지도** 아이콘에서 볼 수 있어요. 이럴 때 써요: 자격증 시험 · 공모전·해커톤 · 팀 과제·졸업작품 · 장학금·지원사업 · 취업 · 행사 · 이사·여행.' },
      { id: 'now', ill: 'map-now', title: '지금 할 일', body: '계획 맨 위 `⚡ 지금 할 일`에는 오늘 마감인 일과 지금 시작할 수 있는 계획 단계만 3개까지 올려요. 기한이 지난 일은 여기 섞지 않고 **정리하기**에서 한꺼번에 봐요.' },
      { id: 'seq', ill: 'map-seq', title: '잘못 묶였거나 빠졌으면', body: '프로젝트 타임라인에서 할 일에 마우스를 올리고 **✕ 이건 아니야**를 누르면 그 일만 빠져요(할 일은 그대로). 빠진 일은 말풍선의 **＋ 더 넣기**로 넣어요. 선은 순서(먼저 해야 함)이고, 순서를 정하지 않았으면 조사 → 개발 → 제출 순으로 점선으로 이어 보여 줘요. 순서 선은 전체 지도에서 할 일 아래 점을 끌어 이어요.' },
      { id: 'goal', ill: 'map-goal', title: '한 주 점검', body: '이번 주 돌아보기 → 밀린 일 정하기 → 다음 주 목표 고르기는 **성장** 탭의 **주간 점검**에서 해요. 일요일 저녁엔 오늘 목록 카드가 그리로 열어 줘요. 할 일 오른쪽 클릭 › 목표에 연결하면 목표 고리로 모여요.' },
      { id: 'split', ill: 'map-split', title: '같이 계획 짜기', body: '프로젝트는 보드의 **＋ 새 프로젝트**에 이름과 날짜를 한 줄로 적어 만들어요. 단계를 같이 정하고 싶으면 프로젝트 **⋯ › 다음 단계 같이 짜기** — 내 캐릭터가 무엇을·언제까지를 짧게 묻고, 답하는 대로 할 일·마감·순서 선이 생겨요. 대화 칸 **되돌리기**로 한 번에 되돌려요.', aiOff: '지금은 AI가 쉬고 있어요. 단계를 직접 적어도 같이 짤 수 있어요' },
      { id: 'views', ill: 'map-views', title: '정리와 전체 지도', body: '작업 지도는 **프로젝트 한 화면**이에요. 기본함에 쌓인 일은 기본함 카드의 **정리하기**(또는 `⌘K` › 기본함 정리하기)에서 제자리로 옮겨요. 폴더 › 리스트 › 할 일 나무·보드·타임라인은 머리 **전체 지도** 아이콘 안에 있어요.' }
    ],
    recipes: [
      { id: 'split', title: '날짜가 있는 큰 일', steps: ['계획 › ＋ 새 프로젝트에 `이름 날짜` 한 줄', '＋ 줄 추가로 과목·단계별 태그 줄을 만들고 그 줄에 할 일 적기', '칩을 끌어 날짜·줄, 칩 끝을 끌어 기간'], cta: '만들어 보기' },
      { id: 'morning', title: '매일 아침 3분', steps: ['작업 지도 › 계획 열기', '⚡ 지금 할 일에서 오늘 것부터', '기한 지난 일은 정리하기에서 한꺼번에'], cta: '계획 열기' },
      { id: 'goal', title: '이번 주 진행 확인', steps: ['성장 › 주간 점검(일요일 저녁엔 오늘 목록 카드로)', '목표 고리·이번 주 7칸 보기', '밀린 일은 다음 주로'], cta: '주간 점검 열기' }
    ],
    steps: [
      { targets: ['.pc-card[data-project]', '.plan-grid', '.plan-empty', '.map-canvas', '.map-board', '.map__main .tl', '.map-empty'], title: '카드를 누르면 열려요',
        body: '여러 리스트에 흩어진 일을 프로젝트로 묶어요. 카드를 누르면 **타임라인**과 **관계도**가 열리고, 끌어서 날짜·순서를 바꾸고 사람·메모를 직접 이을 수 있어요.' },
      { targets: ['.plan-now', '.map-now'], title: '지금 할 일',
        body: '오늘 마감인 일과 지금 시작할 수 있는 계획 단계만 3개까지 올려요. 기한이 지난 일은 **정리하기**에서 한꺼번에 봐요.' },
      { targets: ['.pc-card--new', '.plan-empty__new', '.plan-grid'], title: '한 줄로 만들어요', ill: 'map-split',
        body: '**＋ 새 프로젝트**에 `투자자산운용사 시험 11/23`처럼 이름과 날짜를 한 줄로 적으면 프로젝트와 ⚑ 핵심 날짜가 생겨요. 안에서는 줄(태그)을 만들고 칩을 끌어 고쳐요. 잘못 묶인 일은 칩의 **✕**로 빼고, 빠진 일은 **＋ 할 일**로 넣어요. 손으로 고친 건 자동 묶기가 다시 바꾸지 않아요. 한 주 점검은 **성장** 탭에, 폴더 나무는 머리 **전체 지도** 아이콘에 있어요. 사용법은 **?**에서 언제든.' }
    ],
    foot: '`N` 지금 집중'
  }
}

/** 시험·명세용 한도(37 §2) */
export const LIMITS = { steps: 3, sectionsMin: 4, sectionsMax: 6, recipesMin: 2, recipesMax: 3 } as const
