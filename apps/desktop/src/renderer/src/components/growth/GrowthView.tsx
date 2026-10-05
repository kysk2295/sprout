import { Check, ChevronRight, MoreHorizontal, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SPECIES, XP, type Species } from '@sprout/schema/growth'
import { addDays } from '@sprout/schema/time'
import {
  addGoal, carryOver, dismissDraft, nextWeek, readLogOpen, removeGoal, setGoalProgress, thisWeek, useGoalDraft, useGrowth, useMotionReduced, useWeeklyClose,
  useWeeklyReports, writeLogOpen, writeMotionPref, type GoalRow, type StageStats, type XpRow
} from '../../data/growth'
import { useQuery } from '../../data/useQuery'
import { OPEN_SCREEN, takeScreen } from '../../data/mapMoments'
import type { ListRow } from '../../data/types'
import { ReviewScreen } from '../map/modes'
import { dayKey } from '../../lib/dates'
import { MenuItem, Popover } from '../Popover'
import { CharacterArt } from './CharacterArt'
import { Confetti, streakOf, WeekChart } from './Interactive'
import { GrowthStage, StageRoad } from './Stage'
import { WeeklyReports } from './WeeklyReports'
import { GuideButton, GuideLayer, useGuide } from '../guide/Guide'
import './growth-report.css'
import './growth-stage.css'

// 10 §3.2 성장 화면 v3(캐릭터 중심): 무대(캐릭터 방) + 진화 길 → 이번 주 퀘스트 · 이번 주 기록 | ○○의 일기
const md = (d: string) => { const x = new Date(`${d}T00:00`); return `${x.getMonth() + 1}월 ${x.getDate()}일` }

export function GrowthView({ onSurvey, lists = [] }: { onSurvey: () => void; lists?: ListRow[] }) {
  // 사용자 결정 2026-10-05: 주간 점검(31 §12 점검 3단계)은 성장 탭 안 — 일요일 카드·sprout://map?mode=review·일기 옆 `주간 점검`이 연다
  const [review, setReview] = useState(() => takeScreen('review'))
  useEffect(() => {
    const on = () => { if (takeScreen('review')) setReview(true) }
    window.addEventListener(OPEN_SCREEN, on)
    return () => window.removeEventListener(OPEN_SCREEN, on)
  }, [])
  if (review) return <ReviewScreen lists={lists} onClose={() => setReview(false)} />
  return <GrowthHome onSurvey={onSurvey} onReview={() => setReview(true)} />
}

function GrowthHome({ onSurvey, onReview }: { onSurvey: () => void; onReview: () => void }) {
  const { events, character, progress, loaded } = useGrowth()
  useWeeklyClose() // 10 §5 — 앱 전체에서는 LevelUpWatcher가 부른다. 여기서도 불러 성장 화면을 열면 확인
  const reduced = useMotionReduced()
  const [menu, setMenu] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const questsRef = useRef<HTMLElement>(null)
  const goalInputRef = useRef<HTMLInputElement>(null)
  const diaryRef = useRef<HTMLElement>(null)
  const species = character?.species ?? null
  const name = species ? (character?.name || SPECIES[species].name) : '알'
  const today = dayKey()
  const week = thisWeek()

  // 무대 말풍선·밥그릇에 쓰는 실제 숫자(10 §3.2.4)
  const todayStart = new Date(`${today}T00:00`).toISOString()
  const todayDone = useQuery<{ n: number }>('SELECT count(*) n FROM tasks WHERE status = 1 AND deleted_at IS NULL AND completed_at >= ?', [todayStart])?.[0]?.n ?? 0
  const todayOpen = useQuery<{ n: number }>('SELECT count(*) n FROM tasks WHERE status = 0 AND deleted_at IS NULL AND due_at >= ? AND due_at < ?', [today, addDays(today, 1)])?.[0]?.n ?? 0
  const weekGoals = useQuery<{ title: string; target: number; progress: number; status: string }>('SELECT title, target, progress, status FROM kpis WHERE week_start = ? ORDER BY sort_order', [week])
  const reports = useWeeklyReports()
  const stats: StageStats = useMemo(() => {
    const todayEv = events.filter((e) => e.day === today)
    const last = events.filter((e) => e.amount > 0).map((e) => e.day).sort().pop()
    const idleDays = last ? Math.round((new Date(`${today}T00:00`).getTime() - new Date(`${last}T00:00`).getTime()) / 86400000) : 0
    return {
      todayDone, todayOpen,
      todayTaskXp: todayEv.filter((e) => e.kind === 'task' || e.kind === 'task_revoke').reduce((s, e) => s + e.amount, 0),
      streak: streakOf(events, today), idleDays,
      level: progress.level, into: progress.into, toNext: progress.toNext,
      diaryUnseen: !!reports?.some((r) => !r.seen_at),
      goals: (weekGoals ?? []).map((g) => ({ title: g.title, target: g.target, progress: g.progress, achieved: g.status === 'achieved' }))
    }
  }, [events, today, todayDone, todayOpen, progress.level, progress.into, progress.toNext, reports, weekGoals])

  const toQuests = () => {
    questsRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
    window.setTimeout(() => goalInputRef.current?.focus({ preventScroll: true }), reduced ? 0 : 350)
  }
  const toDiary = () => diaryRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  const guide = useGuide('growth', { ready: loaded }) // 37 첫 둘러보기 · 머리 `?`

  return (
    <div className={`growth${reduced ? ' gs-reduced' : ''}`}>
      <header className="growth__header">
        <h1 className="pane-header__title">성장</h1>
        <span style={{ flex: 1 }} />
        <GuideButton guide={guide} />{/* 37 §3: ⋯ 왼쪽 */}
        <button ref={moreRef} className="icon-btn" aria-label="성장 메뉴" onClick={() => setMenu(!menu)}><MoreHorizontal /></button>
        {menu && (
          <Popover anchor={moreRef.current} align="end" width={200} className="menu" onClose={() => setMenu(false)}>
            <MenuItem label="캐릭터 이름 바꾸기" disabled={!species} onClick={() => { setMenu(false); window.setTimeout(() => document.querySelector<HTMLElement>('.gs-hud__name')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), 0) }} />
            <MenuItem label={species ? '성향 다시 조사하기' : '성향 조사하기'} onClick={() => { setMenu(false); onSurvey() }} />
            {/* 10 §3.2.11 결정: 기기별 스위치. OS 설정이 켜져 있으면 늘 줄인다 */}
            <MenuItem label="움직임 줄이기" active={reduced} trail={reduced ? <Check className="menu__check" /> : undefined} onClick={() => { writeMotionPref(!reduced); setMenu(false) }} />
          </Popover>
        )}
      </header>
      <GuideLayer guide={guide} onTry={(r) => { if (r === 'review') onReview(); else if (r === 'quest') toQuests(); else if (r === 'diary') toDiary() }} />
      <div className="growth__body gs-body">
        <div className="gs-wrap">
          <section className="gs-stage-card" aria-label="캐릭터 방">
            <GrowthStage character={character} events={events} progress={progress} ready={loaded} stats={stats} reduced={reduced} onSurvey={onSurvey} onQuests={toQuests} onDiary={toDiary} />
            <StageRoad species={species} level={progress.level} stage={progress.stage} />
          </section>
          <div className="gs-lower">
            <div className="gs-col">
              <GoalsCard sectionRef={questsRef} inputRef={goalInputRef} species={species} stage={progress.stage} name={name} />
              <LogCard events={events} />
            </div>
            <aside ref={diaryRef}>
              <button className="growth-card gs-review-entry" onClick={onReview}>
                <span><b>주간 점검</b><small>이번 주 돌아보기 → 밀린 일 → 다음 주 목표</small></span><ChevronRight />
              </button>
              <WeeklyReports diary={{ name, species, stage: progress.stage }} />
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 이번 주 퀘스트 = 주간 목표(10 §3.2.8, 규칙은 §4 그대로) */
function GoalsCard({ sectionRef, inputRef, species, stage, name }: { sectionRef: React.RefObject<HTMLElement | null>; inputRef: React.RefObject<HTMLInputElement | null>; species: Species | null; stage: number; name: string }) {
  const [tab, setTab] = useState<'this' | 'next'>('this')
  const week = tab === 'this' ? thisWeek() : nextWeek()
  const goals = useQuery<GoalRow>('SELECT id, week_start, title, target, progress, status, source, achieved_at, sort_order FROM kpis WHERE week_start = ? ORDER BY sort_order', [week]) ?? []
  // 한 주 5개가 차면 입력 줄이 막히고 안내 문구로 바뀐다(10 §4.1)
  const full = goals.length >= XP.goalsPerWeek
  const [rowMenu, setRowMenu] = useState<{ goal: GoalRow; anchor: HTMLElement }>()
  const [cheer, setCheer] = useState<string>()
  // 10 §4.3 AI 초안: 회색 제안 줄 — 누르면 입력 줄에 넣어 고친 뒤 확정, +는 그대로 추가, ×는 숨김
  const draft = useGoalDraft(week)
  const [pending, setPending] = useState<string>()
  const key = (t: string) => t.replace(/\s+/g, '').toLowerCase()
  const drafts = full ? [] : draft.items.filter((d) => !goals.some((g) => key(g.title) === key(d.title)))
  const editDraft = (title: string) => {
    const el = inputRef.current
    if (!el) return
    el.value = title
    setPending(title)
    el.focus()
    el.setSelectionRange(title.length, title.length)
  }
  /** 목표에 닿으면 그 행 체크박스에서 캐릭터로 큰 방울이 날아간다(10 §3.2.5) */
  const progressTo = async (g: GoalRow, n: number, from?: HTMLElement) => {
    const before = g.status === 'achieved'
    const reaching = !before && n >= g.target
    if (reaching && from) { const r = from.getBoundingClientRect(); window.dispatchEvent(new CustomEvent('sprout:growth-feed', { detail: { x: r.left + r.width / 2, y: r.top + r.height / 2 } })) }
    await setGoalProgress(g, n)
    if (reaching) { setCheer(g.id); window.setTimeout(() => setCheer((c) => (c === g.id ? undefined : c)), 1300) }
  }
  // XP는 그 주 3개까지 — 실제로 XP를 갖고 있는 목표(원장 순합 > 0)에만 "+30 ✓"
  const earned = useQuery<{ ref_id: string }>(
    "SELECT x.ref_id FROM xp_events x JOIN kpis k ON k.id = x.ref_id WHERE k.week_start = ? GROUP BY x.ref_id HAVING sum(x.amount) > 0", [week]
  )
  const xpIds = useMemo(() => new Set((earned ?? []).map((e) => e.ref_id)), [earned])
  const slotsLeft = xpIds.size < XP.kpiXpLimit
  const done = goals.filter((g) => g.status === 'achieved').length
  const reward = (g: GoalRow) => {
    if (g.status === 'achieved') return xpIds.has(g.id) ? <span className="gs-reward is-got">+{XP.kpi} ✓</span> : <span className="gs-reward is-none">보상 없음</span>
    return slotsLeft ? <span className="gs-reward">+{XP.kpi}</span> : <span className="gs-reward is-none" title={`XP는 한 주 ${XP.kpiXpLimit}개까지`}>보상 없음</span>
  }
  return (
    <section ref={sectionRef} className="growth-card">
      <div className="growth-card__head">
        <div className="gs-quests__title">
          <h3 className="growth-card__title">{tab === 'this' ? '이번 주' : '다음 주'} 퀘스트</h3>
          <div className="seg">
            <button className={tab === 'this' ? 'is-on' : ''} onClick={() => setTab('this')}>이번 주</button>
            <button className={tab === 'next' ? 'is-on' : ''} onClick={() => setTab('next')}>다음 주</button>
          </div>
        </div>
        <span className="growth-card__meta">{md(week)} – {md(addDays(week, 6))}{goals.length ? ` · ${done}/${goals.length}` : ''}</span>
      </div>
      {goals.map((g) => {
        const achieved = g.status === 'achieved'
        return (
          <div key={g.id} className={`row goal${achieved ? ' is-done' : ''}${cheer === g.id ? ' is-cheer' : ''}`}>
            <button className={`checkbox${achieved ? ' is-checked' : ''}`} aria-label={achieved ? '달성 취소' : '달성'}
              onClick={(e) => void progressTo(g, achieved ? (g.target > 1 ? g.target - 1 : 0) : g.target, e.currentTarget)}>
              {achieved && <Check strokeWidth={3} />}
            </button>
            <span className="row__title goal__title">{g.title}</span>
            {g.target > 1 && g.target <= 10 && (
              <span className="goal__dots" aria-label={`${g.progress}/${g.target}`}>
                {Array.from({ length: g.target }, (_, k) => (
                  <button key={k} className={k < g.progress ? 'is-on' : ''} aria-label={`${k + 1}번`} onClick={(e) => void progressTo(g, k + 1 === g.progress ? k : k + 1, e.currentTarget)} />
                ))}
                <span className="goal__dots-n">{g.progress}/{g.target}</span>
              </span>
            )}
            {g.target > 10 && (
              <span className="goal__count">
                <button aria-label="하나 빼기" onClick={() => void progressTo(g, g.progress - 1)}>−</button>
                {g.progress}/{g.target}
                <button aria-label="하나 더하기" onClick={(e) => void progressTo(g, g.progress + 1, e.currentTarget)}>+</button>
              </span>
            )}
            {cheer === g.id && <span className="goal__cheer"><Confetti count={14} spread={60} /></span>}
            {reward(g)}
            <button className="goal__more" aria-label="목표 메뉴" onClick={(e) => setRowMenu({ goal: g, anchor: e.currentTarget })}><MoreHorizontal /></button>
          </div>
        )
      })}
      {drafts.map((d) => (
        <div key={d.title} className="row goal-draft" title="눌러서 고친 뒤 Enter로 퀘스트에 넣어요" onClick={() => editDraft(d.title)}>
          <span className="gs-draft-face"><CharacterArt species={species} stage={stage} size={18} /></span>
          <span className="goal-draft__title">{d.title}</span>
          <span className="goal-draft__tag">{name}의 제안</span>
          <button className="goal-draft__btn is-add" aria-label="퀘스트로 추가" onClick={(e) => { e.stopPropagation(); void addGoal(week, d.title, 'ai') }}><Plus /></button>
          <button className="goal-draft__btn" aria-label="제안 숨기기" onClick={(e) => { e.stopPropagation(); void dismissDraft(draft.reportWeek, d.title) }}><X /></button>
        </div>
      ))}
      {rowMenu && (
        <Popover anchor={rowMenu.anchor} align="end" width={160} className="menu" onClose={() => setRowMenu(undefined)}>
          {tab === 'this' && rowMenu.goal.status !== 'achieved' && <MenuItem label="다음 주로 넘기기" onClick={() => { void carryOver(rowMenu.goal); setRowMenu(undefined) }} />}
          <MenuItem label="삭제" onClick={() => { void removeGoal(rowMenu.goal.id); setRowMenu(undefined) }} />
        </Popover>
      )}
      <div className="goal-add">
        <Plus className="addbar__icon" />
        <input
          ref={inputRef}
          className="addbar__input"
          placeholder={full ? `${tab === 'this' ? '이번' : '다음'} 주는 ${XP.goalsPerWeek}개까지 적을 수 있어요` : `${tab === 'this' ? '이번' : '다음'} 주에 하고 싶은 일 추가`}
          disabled={full}
          onKeyDown={async (e) => {
            if (e.nativeEvent.isComposing || e.key !== 'Enter') return
            const v = e.currentTarget.value.trim()
            if (!v) return
            const input = e.currentTarget
            // AI 제안을 고쳐 넣은 것이면 source 'ai', 그 제안 줄은 숨긴다
            const r = await addGoal(week, v, pending ? 'ai' : 'manual')
            if (r === 'ok') {
              input.value = ''
              if (pending) { void dismissDraft(draft.reportWeek, pending); setPending(undefined) }
            }
          }}
          onChange={(e) => { if (!e.currentTarget.value) setPending(undefined) }}
        />
      </div>
      {!goals.length && !drafts.length && <p className="growth-card__empty">예: 논문 하나 읽기 · 운동 3번 · 포트폴리오 첫 장 쓰기</p>}
      {goals.length >= 2 && (
        <div className="gs-bonus">
          <span>{done === goals.length ? <>퀘스트를 모두 이뤘어요 · 보너스 <b>+{XP.kpiAll}</b></> : <>퀘스트 2개 이상 모두 이루면 <b>+{XP.kpiAll}</b></>}</span>
          <span className="gs-bonus__bar"><span style={{ width: `${(done / goals.length) * 100}%` }} /></span>
          <span>{done}/{goals.length}</span>
        </div>
      )}
      <p className="goal-note">주간 KPI·리포트를 만들 때 이번 주 할 일 제목을 AI에 보내요.</p>
    </section>
  )
}

/** 이번 주 기록: 7일 막대 + 날짜별 XP 내역, 접힌 채로(10 §3.2.10) */
function LogCard({ events }: { events: XpRow[] }) {
  const [open, setOpen] = useState(readLogOpen)
  const week = thisWeek()
  const mine = events.filter((e) => e.day >= week)
  const total = mine.reduce((s, e) => s + e.amount, 0)
  const days = [...new Set(mine.map((e) => e.day))].sort().reverse()
  const today = dayKey()
  const ids = open ? mine.map((e) => e.ref_id) : []
  const titles = useQuery<{ id: string; title: string }>(`SELECT id, title FROM tasks WHERE id IN (${ids.map(() => '?').join(',') || "''"}) UNION ALL SELECT id, title FROM kpis WHERE id IN (${ids.map(() => '?').join(',') || "''"})`, [...ids, ...ids]) ?? []
  const name = (id: string) => titles.find((t) => t.id === id)?.title ?? ''
  // 지운 할 일·목표는 제목 없이 종류만
  const of = (what: string, id: string) => (name(id) ? `${what} · ${name(id)}` : what)
  const label = (e: XpRow) => e.kind === 'task' ? of('할 일 완료', e.ref_id) : e.kind === 'task_revoke' ? of('완료 취소', e.ref_id) : e.kind === 'kpi' ? of('퀘스트 달성', e.ref_id) : e.kind === 'kpi_revoke' ? of('퀘스트 취소', e.ref_id) : e.kind === 'review' ? '주간 점검 완료' : e.kind === 'tidy' ? '정리 보너스' : e.amount > 0 ? '이번 주 퀘스트 모두 달성' : '모두 달성 취소'
  const toggle = () => { setOpen(!open); writeLogOpen(!open) }
  return (
    <section className={`growth-card gs-log${open ? ' is-open' : ''}`}>
      <div className="growth-card__head">
        <button className={`gs-fold${open ? ' is-open' : ''}`} aria-expanded={open} onClick={toggle}><ChevronRight aria-hidden />이번 주 기록</button>
        <span className="growth-card__meta">완료 {mine.filter((e) => e.kind === 'task').length} · {total >= 0 ? '+' : ''}{total} XP</span>
      </div>
      {open && (
        <>
          <WeekChart events={events} />
          {!mine.length && <p className="growth-card__empty">할 일을 끝내면 XP가 쌓여요. 하루에 할 일로 {XP.taskDailyCap} XP까지 받을 수 있어요.</p>}
          {days.map((d) => {
            const list = mine.filter((e) => e.day === d)
            const taskXp = list.filter((e) => e.kind === 'task' || e.kind === 'task_revoke').reduce((s, e) => s + e.amount, 0)
            return (
              <div key={d} className="xp-day">
                <div className="mini__group">{d === today ? '오늘' : md(d)} <span>{taskXp >= XP.taskDailyCap ? `할 일 XP 다 받았어요(${XP.taskDailyCap}/${XP.taskDailyCap})` : ''}</span></div>
                {[...list].reverse().map((e) => (
                  <div key={e.id} className="xp-row"><span className="xp-row__label">{label(e)}</span><span className={`xp-row__amount${e.amount < 0 ? ' is-minus' : ''}`}>{e.amount > 0 ? '+' : ''}{e.amount}</span></div>
                ))}
              </div>
            )
          })}
        </>
      )}
    </section>
  )
}
