// 37 사용법 그림 — 직접 그린 단순 선화(64×44). 틱틱 그림 원본은 쓰지 않는다. 색은 guide.css의 토큰 클래스만(13개 테마 라이트·다크).
import type { ReactNode } from 'react'
import type { IllId } from './content'

const Ill = ({ children, label }: { children: ReactNode; label: string }) => (
  <svg className="mg-ill" viewBox="0 0 64 44" role="img" aria-label={label} fill="none" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const Card = ({ x, y, w = 18, h = 8, on }: { x: number; y: number; w?: number; h?: number; on?: boolean }) => (
  <rect x={x} y={y} width={w} height={h} rx={2} className={on ? 'mg-ill__card is-on' : 'mg-ill__card'} />
)
/** 작은 체크 동그라미(할 일) */
const Check = ({ x, y, on }: { x: number; y: number; on?: boolean }) => <>
  <circle cx={x} cy={y} r={2.6} className={on ? 'mg-ill__accent-fill' : 'mg-ill__ring-thin'} />
  {on && <path d={`M${x - 1.3} ${y}l.9 .9 1.7-1.8`} className="mg-ill__tick" />}
</>
/** 반짝 ✦ */
const Spark = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <path className="mg-ill__accent-fill" transform={`translate(${x} ${y}) scale(${s})`} d="M0 -5l1.4 3.6L5 0l-3.6 1.4L0 5l-1.4-3.6L-5 0l3.6-1.4z" />
)
const Line = ({ d }: { d: string }) => <path className="mg-ill__line" d={d} />
const Text = ({ x, y, children, cls = 'mg-ill__cap' }: { x: number; y: number; children: ReactNode; cls?: string }) => <text x={x} y={y} className={cls}>{children}</text>
/** 캐릭터(둥근 새싹 얼굴) — 성장·일기 그림 공통 */
const Buddy = ({ x, y, r = 7 }: { x: number; y: number; r?: number }) => <>
  <circle cx={x} cy={y} r={r} className="mg-ill__buddy" />
  <circle cx={x - r * .35} cy={y - r * .1} r={r * .1} className="mg-ill__eye" /><circle cx={x + r * .35} cy={y - r * .1} r={r * .1} className="mg-ill__eye" />
  <path d={`M${x - r * .25} ${y + r * .3}q${r * .25} ${r * .2} ${r * .5} 0`} className="mg-ill__mouth" />
  <path d={`M${x} ${y - r}c-1-3 1-4 3-4c0 2-1 3-3 4z`} className="mg-ill__leaf" />
</>

export const ILLUS: Record<IllId, ReactNode> = {
  // ── 작업 지도(34) ──
  'map-what': <Ill label="폴더에서 리스트, 할 일로 펼쳐지는 나무">
    <Card x={23} y={3} w={18} /><Line d="M32 11v4M14 15h36M14 15v3M50 15v3" />
    <Card x={5} y={18} /><Card x={41} y={18} />
    <Line d="M14 26v3M50 26v3" /><Card x={7} y={29} w={14} h={6} on /><Card x={43} y={29} w={14} h={6} /><Card x={7} y={37} w={14} h={5} /></Ill>,
  'map-now': <Ill label="지금 할 수 있는 일 띠">
    <rect x={2} y={6} width={60} height={12} rx={3} className="mg-ill__band" />
    <path className="mg-ill__accent-fill" d="M7 8.5l-2 4h2.4l-1 3.2 3.4-4.6H7.4l1.2-2.6z" />
    <Card x={13} y={9} w={14} h={6} on /><Card x={30} y={9} w={14} h={6} on /><Card x={47} y={9} w={12} h={6} />
    <Card x={6} y={26} w={18} on /><Card x={28} y={26} w={14} /><Card x={46} y={26} w={14} /><Card x={6} y={36} w={18} /></Ill>,
  'map-seq': <Ill label="점을 끌어 두 할 일을 잇기">
    <Card x={4} y={6} w={22} h={10} on /><circle cx={15} cy={16} r={2.4} className="mg-ill__accent-fill" />
    <path className="mg-ill__accent" d="M15 18c0 10 16 6 25 12" strokeDasharray="2 2.4" /><path className="mg-ill__accent" d="M37 27.5l3.4 2.6-4 1" />
    <Card x={38} y={30} w={22} h={10} />
    <path className="mg-ill__cursor" d="M47 15l0 8 2-2 1.6 3 1.4-.7-1.6-3 2.8-.2z" /></Ill>,
  'map-goal': <Ill label="목표에 할 일을 연결하고 진행 고리로 보기">
    <circle cx={14} cy={22} r={9} className="mg-ill__ring" /><path className="mg-ill__goal" d="M14 13a9 9 0 0 1 8.6 11.6" /><text x={14} y={25.5} className="mg-ill__emoji">🎯</text>
    <path className="mg-ill__goal" d="M23 18L38 10M23 22h15M23 26l15 8" />
    <Card x={39} y={6} w={20} h={7} on /><Card x={39} y={18.5} w={20} h={7} on /><Card x={39} y={31} w={20} h={7} /></Ill>,
  'map-split': <Ill label="큰 할 일을 AI가 작은 단계로 쪼개기">
    <Card x={3} y={15} w={22} h={14} /><Spark x={31} y={22} />
    <Card x={41} y={5} w={20} h={7} on /><Card x={41} y={18.5} w={20} h={7} /><Card x={41} y={32} w={20} h={7} />
    <Line d="M51 12v6.5M51 25.5V32" /></Ill>,
  'map-views': <Ill label="그래프, 보드, 타임라인 세 가지 보기">
    <circle cx={10} cy={10} r={3} className="mg-ill__dot" /><circle cx={5} cy={22} r={3} className="mg-ill__dot" /><circle cx={15} cy={22} r={3} className="mg-ill__dot" /><Line d="M9 13l-3 6M11 13l3 6" />
    <rect x={24} y={6} width={6} height={20} rx={1.5} className="mg-ill__card" /><rect x={32} y={6} width={6} height={14} rx={1.5} className="mg-ill__card" />
    <rect x={44} y={8} width={14} height={4} rx={2} className="mg-ill__card is-on" /><rect x={48} y={15} width={12} height={4} rx={2} className="mg-ill__card" /><rect x={46} y={22} width={8} height={4} rx={2} className="mg-ill__card" />
    <Text x={11} y={40}>그래프</Text><Text x={31} y={40}>보드</Text><Text x={52} y={40}>타임라인</Text></Ill>,

  // ── 할 일 ──
  'tasks-smart': <Ill label="오늘, 내일, 다음 7일 스마트 목록">
    <rect x={3} y={4} width={22} height={36} rx={3} className="mg-ill__card" />
    <rect x={5} y={7} width={18} height={6} rx={1.5} className="mg-ill__band" /><circle cx={8.5} cy={10} r={1.6} className="mg-ill__accent-fill" /><Line d="M12 10h8" />
    <circle cx={8.5} cy={17} r={1.6} className="mg-ill__dot" /><Line d="M12 17h8" /><circle cx={8.5} cy={23} r={1.6} className="mg-ill__dot" /><Line d="M12 23h6" />
    <Line d="M6 28.5h16" /><circle cx={8.5} cy={33} r={1.6} className="mg-ill__dot" /><Line d="M12 33h7" />
    <Check x={32} y={10} /><Line d="M37 10h20" /><Check x={32} y={19} on /><Line d="M37 19h15" /><Check x={32} y={28} /><Line d="M37 28h18" /></Ill>,
  'tasks-quick': <Ill label="단축키로 여는 빠른 추가 창">
    <rect x={8} y={5} width={48} height={18} rx={3} className="mg-ill__card is-on" /><path className="mg-ill__accent" d="M13 14h2M17 14h16" /><path className="mg-ill__accent" d="M36 11v6" />
    <rect x={8} y={29} width={13} height={10} rx={2} className="mg-ill__key" /><Text x={14.5} y={36} cls="mg-ill__keycap">⌃</Text>
    <rect x={25} y={29} width={13} height={10} rx={2} className="mg-ill__key" /><Text x={31.5} y={36} cls="mg-ill__keycap">⇧</Text>
    <rect x={42} y={29} width={13} height={10} rx={2} className="mg-ill__key" /><Text x={48.5} y={36} cls="mg-ill__keycap">A</Text></Ill>,
  'tasks-natural': <Ill label="말로 쓴 날짜를 알아보고 칩으로 보여 주기">
    <rect x={3} y={6} width={58} height={12} rx={3} className="mg-ill__card" />
    <rect x={7} y={9} width={18} height={6} rx={1.5} className="mg-ill__band" /><Line d="M28 12h12" />
    <rect x={44} y={8.5} width={14} height={7} rx={3.5} className="mg-ill__card is-on" /><Text x={51} y={13.6} cls="mg-ill__cap mg-ill__cap--on">내일</Text>
    <path className="mg-ill__accent" d="M16 20v5" strokeDasharray="1.5 1.6" />
    <rect x={8} y={27} width={18} height={14} rx={2} className="mg-ill__card" /><path className="mg-ill__line" d="M8 31h18" /><rect x={18} y={33.5} width={4} height={4} rx={1} className="mg-ill__accent-fill" />
    <Check x={33} y={34} /><Line d="M38 34h20" /></Ill>,
  'tasks-tags': <Ill label="샵 태그와 대괄호 링크">
    <rect x={3} y={5} width={58} height={11} rx={3} className="mg-ill__card" /><Line d="M7 10.5h12" />
    <rect x={22} y={7.5} width={14} height={6} rx={3} className="mg-ill__band" /><Text x={29} y={12} cls="mg-ill__cap mg-ill__cap--on">#일</Text>
    <rect x={39} y={7.5} width={19} height={6} rx={1.5} className="mg-ill__card is-on" /><Text x={48.5} y={12} cls="mg-ill__cap mg-ill__cap--on">[[보고서]]</Text>
    <path className="mg-ill__accent" d="M29 16v6M48 16v6" strokeDasharray="1.5 1.6" />
    <circle cx={29} cy={30} r={6} className="mg-ill__card" /><Text x={29} y={32} cls="mg-ill__keycap">#</Text>
    <rect x={40} y={24} width={17} height={12} rx={2} className="mg-ill__card" /><Line d="M43 28h11M43 32h7" /><Line d="M35 30h5" /></Ill>,
  'tasks-ai': <Ill label="새 할 일에 AI가 리스트와 태그를 붙이기">
    <Check x={7} y={11} /><Line d="M12 11h16" />
    <Spark x={33} y={11} s={.9} />
    <rect x={38} y={6} width={22} height={10} rx={2} className="mg-ill__card mg-ill__dashed" /><Text x={49} y={12.8} cls="mg-ill__cap">리스트</Text>
    <rect x={8} y={26} width={48} height={12} rx={3} className="mg-ill__card" /><Check x={14} y={32} /><Line d="M19 32h12" />
    <rect x={34} y={29} width={18} height={6} rx={3} className="mg-ill__band" /><Text x={43} y={33.4} cls="mg-ill__cap mg-ill__cap--on">✦ #일</Text></Ill>,
  'tasks-inbox': <Ill label="기본함에 쌓인 일을 제자리로 옮기기">
    <path className="mg-ill__card" d="M4 22l5-12h14l5 12v12H4z" /><path className="mg-ill__line" d="M4 22h7l2 3h6l2-3h7" />
    <Line d="M11 14h10M10 18h12" />
    <path className="mg-ill__accent" d="M31 20h8M36 17l3 3-3 3" />
    <Card x={43} y={6} w={17} h={7} on /><Card x={43} y={18} w={17} h={7} /><Card x={43} y={30} w={17} h={7} /></Ill>,

  // ── 캘린더 ──
  'cal-kinds': <Ill label="체크박스는 할 일, 달력 아이콘은 일정">
    <rect x={4} y={8} width={56} height={11} rx={2} className="mg-ill__band" /><rect x={4} y={8} width={2} height={11} className="mg-ill__accent-fill" />
    <rect x={9} y={11} width={5} height={5} rx={1} className="mg-ill__ring-thin" /><Line d="M18 13.5h20" />
    <rect x={4} y={25} width={56} height={11} rx={2} className="mg-ill__soft2" /><rect x={4} y={25} width={2} height={11} className="mg-ill__blue-fill" />
    <rect x={9} y={27.5} width={5.5} height={5.5} rx={1} className="mg-ill__ring-thin" /><path className="mg-ill__line" d="M9 29.3h5.5M10.8 27v1.4M12.8 27v1.4" /><Line d="M18 30.5h24" /></Ill>,
  'cal-create': <Ill label="빈 칸을 끌어 일정 만들기">
    <Line d="M4 6h56M4 16h56M4 26h56M4 36h56M22 4v36M42 4v36" />
    <rect x={24} y={11} width={16} height={18} rx={2} className="mg-ill__band mg-ill__dashed-accent" />
    <path className="mg-ill__cursor" d="M36 25l0 8 2-2 1.6 3 1.4-.7-1.6-3 2.8-.2z" /></Ill>,
  'cal-arrange': <Ill label="날짜 없는 할 일을 캘린더로 끌어 놓기">
    <Line d="M4 6h34M4 16h34M4 26h34M4 36h34M16 4v36M28 4v36" />
    <rect x={17} y={17} width={10} height={8} rx={1.5} className="mg-ill__card is-on" />
    <rect x={42} y={4} width={19} height={36} rx={2} className="mg-ill__card" />
    <Check x={46.5} y={11} /><Line d="M50 11h8" /><Check x={46.5} y={19} /><Line d="M50 19h6" /><Check x={46.5} y={27} /><Line d="M50 27h8" />
    <path className="mg-ill__accent" d="M44 19c-6 0-10 0-15 2" strokeDasharray="1.6 1.8" /></Ill>,
  'cal-views': <Ill label="일, 주, 월 보기 바꾸기">
    <rect x={4} y={4} width={56} height={9} rx={2} className="mg-ill__card" />
    <rect x={23} y={5.5} width={18} height={6} rx={1.5} className="mg-ill__card is-on" />
    <Text x={13.5} y={10.3}>일</Text><Text x={32} y={10.3} cls="mg-ill__cap mg-ill__cap--on">주</Text><Text x={50.5} y={10.3}>월</Text>
    {[0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x={5 + i * 8} y={18} width={6} height={20} rx={1} className={i === 2 ? 'mg-ill__card is-on' : 'mg-ill__card'} />)}</Ill>,
  'cal-holiday': <Ill label="공휴일은 빨강, 토요일은 파랑">
    <rect x={4} y={4} width={56} height={36} rx={3} className="mg-ill__card" /><Line d="M4 12h56" />
    {[0, 1, 2, 3, 4, 5, 6].map((i) => <text key={i} x={8 + i * 8} y={10} className={i === 5 ? 'mg-ill__cap mg-ill__cap--blue' : i === 6 ? 'mg-ill__cap mg-ill__cap--red' : 'mg-ill__cap'}>{'월화수목금토일'[i]}</text>)}
    {[0, 1, 2, 3, 4, 5, 6].map((i) => <text key={`d${i}`} x={8 + i * 8} y={22} className={i === 5 ? 'mg-ill__num mg-ill__cap--blue' : i === 6 || i === 2 ? 'mg-ill__num mg-ill__cap--red' : 'mg-ill__num'}>{i + 1}</text>)}
    <circle cx={26.5} cy={16.5} r={2} className="mg-ill__red-fill" />
    <rect x={8} y={27} width={22} height={5} rx={1.5} className="mg-ill__band" /><rect x={34} y={27} width={18} height={5} rx={1.5} className="mg-ill__soft2" /></Ill>,

  // ── 성장 ──
  'growth-xp': <Ill label="할 일을 끝내면 XP가 쌓이는 막대">
    <Check x={8} y={10} on /><Line d="M13 10h14" /><Text x={34} y={12} cls="mg-ill__xp">+1</Text>
    <rect x={44} y={6} width={16} height={8} rx={4} className="mg-ill__card is-on" /><Text x={52} y={11.6} cls="mg-ill__cap mg-ill__cap--on">+30</Text>
    <rect x={4} y={26} width={56} height={6} rx={3} className="mg-ill__card" /><rect x={4} y={26} width={36} height={6} rx={3} className="mg-ill__accent-fill" />
    <Text x={8} y={41}>Lv 4</Text><Text x={56} y={41}>Lv 5</Text></Ill>,
  'growth-evolve': <Ill label="알에서 캐릭터가 단계별로 자라기">
    <ellipse cx={8} cy={30} rx={4.5} ry={5.5} className="mg-ill__card" />
    <path className="mg-ill__line" d="M15 30h4" /><Buddy x={25} y={30} r={4.5} />
    <path className="mg-ill__line" d="M32 30h4" /><Buddy x={44} y={28} r={6.5} />
    <path className="mg-ill__accent" d="M4 40h56" strokeDasharray="1 2.4" /><Spark x={56} y={12} s={.8} /></Ill>,
  'growth-quests': <Ill label="이번 주 퀘스트 목록과 진행 점">
    <rect x={3} y={4} width={58} height={36} rx={3} className="mg-ill__card" />
    <Check x={9} y={12} on /><Line d="M14 12h22" /><Text x={53} y={13.8} cls="mg-ill__xp">+30</Text>
    <Check x={9} y={22} /><Line d="M14 22h14" />{[0, 1, 2].map((i) => <circle key={i} cx={34 + i * 5} cy={22} r={1.8} className={i < 2 ? 'mg-ill__accent-fill' : 'mg-ill__ring-thin'} />)}
    <Buddy x={9} y={32} r={3} /><path className="mg-ill__line" d="M14 32h20" strokeDasharray="2 2" /></Ill>,
  'growth-review': <Ill label="돌아보기, 밀린 일, 다음 주 세 단계">
    <circle cx={10} cy={20} r={6} className="mg-ill__card is-on" /><path className="mg-ill__accent" d="M7.5 20l2 2 3.5-3.5" />
    <path className="mg-ill__line" d="M17 20h8" /><circle cx={32} cy={20} r={6} className="mg-ill__card" /><path className="mg-ill__line" d="M29 18.5h6M29 21.5h4" />
    <path className="mg-ill__line" d="M39 20h8" /><circle cx={54} cy={20} r={6} className="mg-ill__card" /><path className="mg-ill__line" d="M54 16.5v7M50.5 20h7" />
    <Text x={10} y={36}>돌아보기</Text><Text x={32} y={36}>밀린 일</Text><Text x={54} y={36}>다음 주</Text></Ill>,
  'growth-diary': <Ill label="캐릭터가 쓴 한 주 일기">
    <path className="mg-ill__card" d="M10 8h20v30H10z" /><path className="mg-ill__card" d="M30 8h20v30H30z" />
    <Line d="M14 15h12M14 20h10M14 25h12M34 15h12M34 20h8" />
    <Buddy x={52} y={32} r={6} /></Ill>,

  // ── AI 비서 ──
  'ai-talk': <Ill label="말풍선이 할 일이 되기">
    <path className="mg-ill__card is-on" d="M30 5h28a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H36l-4 4v-4h-2a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" />
    <path className="mg-ill__accent" d="M33 11h22M33 15h14" />
    <Spark x={9} y={28} s={.9} />
    <rect x={16} y={26} width={44} height={12} rx={3} className="mg-ill__card" /><Check x={22} y={32} /><Line d="M27 32h18" />
    <rect x={48} y={29.5} width={9} height={5} rx={2.5} className="mg-ill__band" /></Ill>,
  'ai-ask': <Ill label="질문하면 숫자와 근거로 답하기">
    <path className="mg-ill__card" d="M6 5h24a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H12l-4 3v-3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" /><Text x={18} y={13.4}>이번 주?</Text>
    <rect x={30} y={22} width={30} height={18} rx={3} className="mg-ill__card" />
    <rect x={35} y={32} width={4} height={5} rx={1} className="mg-ill__accent-fill" /><rect x={42} y={28} width={4} height={9} rx={1} className="mg-ill__accent-fill" /><rect x={49} y={25} width={4} height={12} rx={1} className="mg-ill__accent-fill" />
    <Spark x={22} y={30} s={.8} /></Ill>,
  'ai-undo': <Ill label="결과 카드와 되돌리기">
    <rect x={4} y={4} width={56} height={26} rx={3} className="mg-ill__card" />
    <Check x={10} y={12} on /><Line d="M15 12h24" /><Check x={10} y={21} on /><Line d="M15 21h18" />
    <rect x={4} y={34} width={24} height={7} rx={3.5} className="mg-ill__card is-on" /><path className="mg-ill__accent" d="M10 37.5a2.6 2.6 0 1 1 .9 2" /><path className="mg-ill__accent" d="M9.2 35.5l.1 2.2 2.1-.4" />
    <Text x={19} y={39.6} cls="mg-ill__cap mg-ill__cap--on">되돌리기</Text></Ill>,
  'ai-quick': <Ill label="오른쪽 아래 말풍선 단추로 여는 빠른 창">
    <rect x={3} y={3} width={58} height={38} rx={3} className="mg-ill__card" />
    <rect x={30} y={8} width={26} height={22} rx={2.5} className="mg-ill__card is-on" /><path className="mg-ill__accent" d="M34 14h16M34 18h11" /><rect x={33} y={24} width={20} height={4} rx={2} className="mg-ill__card" />
    <circle cx={53} cy={35.5} r={4} className="mg-ill__accent-fill" /><path d="M51 35h4" className="mg-ill__tick" /></Ill>,

  // ── 수집함 ──
  'collect-throw': <Ill label="던져 둔 것을 AI가 셋으로 나누기">
    <rect x={3} y={4} width={58} height={10} rx={3} className="mg-ill__card is-on" /><path className="mg-ill__accent" d="M8 9h3M13 9h22" />
    <Spark x={32} y={21} s={.85} />
    <rect x={4} y={28} width={16} height={12} rx={2} className="mg-ill__card" /><Check x={12} y={34} />
    <rect x={24} y={28} width={16} height={12} rx={2} className="mg-ill__card" /><path className="mg-ill__accent-fill" d="M30 31v6l5-3z" />
    <rect x={44} y={28} width={16} height={12} rx={2} className="mg-ill__card" /><Line d="M48 32h8M48 36h5" /></Ill>,
  'collect-sort': <Ill label="할 일 제안을 등록하기">
    <rect x={3} y={8} width={58} height={13} rx={3} className="mg-ill__card" /><Line d="M8 14.5h20" />
    <rect x={40} y={11} width={17} height={7} rx={3.5} className="mg-ill__accent-fill" /><Text x={48.5} y={16} cls="mg-ill__cap mg-ill__cap--inv">등록</Text>
    <path className="mg-ill__accent" d="M48 22v5" />
    <rect x={14} y={28} width={46} height={11} rx={3} className="mg-ill__card is-on" /><Check x={20} y={33.5} /><Line d="M25 33.5h16" /><rect x={45} y={31} width={11} height={5} rx={2.5} className="mg-ill__band" /></Ill>,
  'collect-watch': <Ill label="볼 것 링크 목록">
    {[0, 1, 2].map((i) => <g key={i}>
      <circle cx={8} cy={9 + i * 13} r={2.6} className={i === 2 ? 'mg-ill__accent-fill' : 'mg-ill__ring-thin'} />
      <rect x={14} y={4 + i * 13} width={14} height={10} rx={2} className="mg-ill__card" /><path className="mg-ill__dot" d={`M19.5 ${6.5 + i * 13}v5l4-2.5z`} />
      <path className="mg-ill__line" d={`M32 ${8 + i * 13}h22M32 ${11.5 + i * 13}h12`} />
    </g>)}</Ill>,
  'collect-wiki': <Ill label="주제로 엮인 위키">
    <circle cx={32} cy={22} r={7} className="mg-ill__card is-on" /><Text x={32} y={24.2} cls="mg-ill__keycap">#</Text>
    <Line d="M26 18l-10-7M38 18l10-7M26 26l-10 7M38 26l10 7" />
    <Card x={4} y={6} w={14} h={7} /><Card x={46} y={6} w={14} h={7} /><Card x={4} y={31} w={14} h={7} /><Card x={46} y={31} w={14} h={7} on /></Ill>,
  'collect-share': <Ill label="휴대폰 공유로 수집함에 넣기">
    <rect x={6} y={4} width={18} height={34} rx={4} className="mg-ill__card" /><path className="mg-ill__accent" d="M15 24v-9M11.5 18.5L15 15l3.5 3.5" /><path className="mg-ill__line" d="M11 26v3h8v-3" />
    <path className="mg-ill__accent" d="M28 21h9M34 18l3 3-3 3" strokeDasharray="0" />
    <path className="mg-ill__card" d="M41 18l4-9h12l4 9v14H41z" /><path className="mg-ill__line" d="M41 18h6l1.5 2.5h5L55 18h6" /></Ill>,

  // ── 일기 ──
  'diary-page': <Ill label="기분 얼굴을 고르고 쓰는 일기 한 장">
    <rect x={8} y={3} width={48} height={38} rx={3} className="mg-ill__card" /><rect x={8} y={3} width={48} height={7} rx={3} className="mg-ill__band" />
    {[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={17 + i * 7.5} cy={17} r={2.8} className={i === 3 ? 'mg-ill__accent-fill' : 'mg-ill__ring-thin'} />)}
    <Line d="M14 26h36M14 31h30M14 36h20" /></Ill>,
  'diary-private': <Ill label="자물쇠로 나만 보기">
    <rect x={8} y={3} width={40} height={38} rx={3} className="mg-ill__card" /><Line d="M14 14h28M14 20h24M14 26h28M14 32h18" />
    <rect x={44} y={20} width={14} height={12} rx={2.5} className="mg-ill__accent-fill" /><path className="mg-ill__accent" d="M47 20v-3a4 4 0 0 1 8 0v3" /><circle cx={51} cy={26} r={1.3} className="mg-ill__hole" /></Ill>,
  'diary-consent': <Ill label="캐릭터와 일기 나누기를 켜고 끄기">
    <Buddy x={14} y={26} r={8} />
    <path className="mg-ill__card" d="M26 14h14v20H26zM40 14h14v20H40z" /><Line d="M29 20h8M29 24h6M43 20h8" />
    <rect x={40} y={37} width={14} height={6} rx={3} className="mg-ill__accent-fill" /><circle cx={50.5} cy={40} r={2.2} className="mg-ill__hole" /></Ill>,
  'diary-talk': <Ill label="캐릭터와 주고받는 말풍선">
    <Buddy x={9} y={12} r={5} />
    <path className="mg-ill__card" d="M17 6h28a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H21l-4 3z" /><Line d="M21 11h20M21 14.5h12" />
    <path className="mg-ill__card is-on" d="M58 24H30a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h24l4 3z" /><path className="mg-ill__accent" d="M31 29h20M31 32.5h12" /></Ill>,
  'diary-review': <Ill label="한 해 기분 칸으로 돌아보기">
    {Array.from({ length: 30 }, (_, k) => <rect key={k} x={4 + (k % 10) * 5.8} y={6 + Math.floor(k / 10) * 6.5} width={4.6} height={4.6} rx={1}
      className={[2, 5, 6, 11, 14, 17, 18, 22, 25, 27].includes(k) ? 'mg-ill__accent-fill' : [3, 9, 12, 20, 23].includes(k) ? 'mg-ill__band' : 'mg-ill__card'} />)}
    <Line d="M4 32h56" /><Text x={10} y={40}>1월</Text><Text x={32} y={40}>연속 5일</Text><Text x={54} y={40}>12월</Text></Ill>
}
