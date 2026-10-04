import { Check, MoreHorizontal, Plus } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { levelsToNextStage, SPECIES, STAGES, XP } from '@sprout/schema/growth'
import { addDays } from '@sprout/schema/time'
import { addGoal, carryOver, nextWeek, removeGoal, renameCharacter, setGoalProgress, thisWeek, useGrowth, type GoalRow, type XpRow } from '../../data/growth'
import { useQuery } from '../../data/useQuery'
import { dayKey } from '../../lib/dates'
import { MenuItem, Popover } from '../Popover'
import { CharacterRoom, Confetti, Roadmap, streakOf, WeekChart, type RoomStats } from './Interactive'

// 10 §3 성장 화면: 왼쪽 640(캐릭터 · 주간 목표 · 이번 주 XP) · 오른쪽 298(주간 리포트)
const md = (d: string) => { const x = new Date(`${d}T00:00`); return `${x.getMonth() + 1}월 ${x.getDate()}일` }

export function GrowthView({ onSurvey }: { onSurvey: () => void }) {
  const { events, character, progress, loaded } = useGrowth()
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const species = character?.species ?? null
  const stageName = STAGES.find((s) => s.stage === progress.stage)!.name
  const next = levelsToNextStage(progress.level)
  const nextName = next !== null ? STAGES.find((s) => s.stage === progress.stage + 1)?.name : null
  const today = dayKey()
  const week = thisWeek()
  const weekDone = useQuery<{ n: number }>("SELECT count(*) n FROM tasks WHERE status = 1 AND deleted_at IS NULL AND completed_at >= ?", [`${week}T00:00`])?.[0]?.n ?? 0
  const goalCounts = useQuery<{ done: number; total: number }>("SELECT sum(status = 'achieved') done, count(*) total FROM kpis WHERE week_start = ?", [week])?.[0]
  const stats: RoomStats = useMemo(() => {
    const todayEv = events.filter((e) => e.day === today)
    const last = events.filter((e) => e.amount > 0).map((e) => e.day).sort().pop()
    const idleDays = last ? Math.round((new Date(`${today}T00:00`).getTime() - new Date(`${last}T00:00`).getTime()) / 86400000) : 0
    return {
      todayXp: todayEv.reduce((x, e) => x + e.amount, 0), todayTasks: todayEv.filter((e) => e.kind === 'task').length, weekDone,
      goalsDone: goalCounts?.done ?? 0, goalsTotal: goalCounts?.total ?? 0, streak: streakOf(events, today), idleDays
    }
  }, [events, today, weekDone, goalCounts])

  return (
    <div className="growth">
      <header className="growth__header">
        <h1 className="pane-header__title">성장</h1>
        <button ref={moreRef} className="icon-btn" aria-label="성장 메뉴" onClick={() => setMenu(!menu)}><MoreHorizontal /></button>
        {menu && (
          <Popover anchor={moreRef.current} align="end" width={200} className="menu" onClose={() => setMenu(false)}>
            <MenuItem label="캐릭터 이름 바꾸기" disabled={!species} onClick={() => { setMenu(false); setRenaming(true) }} />
            <MenuItem label={species ? '성향 다시 조사하기' : '성향 조사하기'} onClick={() => { setMenu(false); onSurvey() }} />
          </Popover>
        )}
      </header>
      <div className="growth__body">
        <div className="growth__main">
          {/* ① 캐릭터 방 + 정보 + 진화 로드맵 (10 §3.1) */}
          <section className="growth-card growth-hero">
            <div className="growth-hero__top">
              <CharacterRoom character={character} level={progress.level} stage={progress.stage} into={progress.into} toNext={progress.toNext} stats={stats} ready={loaded} />
              <div className="growth-hero__info">
                {species ? (
                  <>
                    {renaming ? (
                      <input className="growth-hero__rename" autoFocus defaultValue={character?.name ?? ''}
                        onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { const v = e.currentTarget.value.trim(); if (v) void renameCharacter(v); setRenaming(false) } if (e.key === 'Escape') setRenaming(false) }}
                        onBlur={() => setRenaming(false)} />
                    ) : (
                      <h2 className="growth-hero__name" onDoubleClick={() => setRenaming(true)} title="두 번 눌러 이름 바꾸기">{character?.name || SPECIES[species].name}</h2>
                    )}
                    <p className="growth-hero__type">{SPECIES[species].name}형 · {SPECIES[species].line}</p>
                  </>
                ) : (
                  <>
                    <h2 className="growth-hero__name">아직 모르는 알</h2>
                    <p className="growth-hero__type">나와 닮은 친구를 찾으면 알이 깨어나요</p>
                  </>
                )}
                <div className="growth-hero__level"><strong>Lv {progress.level}</strong> · {stageName}</div>
                <div className="xpbar xpbar--big" aria-label={`다음 레벨까지 ${progress.toNext - progress.into} XP`}><span key={progress.total} style={{ width: `${(progress.into / progress.toNext) * 100}%` }} /></div>
                <p className="growth-hero__hint"><b>{progress.into}</b> / {progress.toNext} XP{nextName ? ` · ${nextName}까지 ${next}레벨` : ''}</p>
                <div className="chips">
                  <span className="chip">이번 주 완료 <b>{stats.weekDone}</b></span>
                  <span className="chip">연속 <b>{stats.streak}</b>일</span>
                  <span className="chip">총 <b>{Math.max(0, progress.total)}</b> XP</span>
                </div>
                {!species && <button className="growth-hero__survey" onClick={onSurvey}>나와 닮은 친구 찾기</button>}
              </div>
            </div>
            <Roadmap species={species} level={progress.level} stage={progress.stage} />
          </section>
          <GoalsCard />
          <XpCard events={events} />
        </div>
        <aside className="growth__side">
          <section className="growth-card">
            <h3 className="growth-card__title">주간 리포트</h3>
            <p className="growth-card__empty">한 주가 끝나면 이번 주에 해낸 것과 다음 주 제안이 여기에 쌓여요.</p>
          </section>
        </aside>
      </div>
    </div>
  )
}

/** ② 주간 목표: 이번 주 · 다음 주 (10 §4) */
function GoalsCard() {
  const [tab, setTab] = useState<'this' | 'next'>('this')
  const week = tab === 'this' ? thisWeek() : nextWeek()
  const goals = useQuery<GoalRow>('SELECT id, week_start, title, target, progress, status, source, achieved_at, sort_order FROM kpis WHERE week_start = ? ORDER BY sort_order', [week]) ?? []
  const [full, setFull] = useState(false)
  const [rowMenu, setRowMenu] = useState<{ goal: GoalRow; anchor: HTMLElement }>()
  const [cheer, setCheer] = useState<string>()
  const progressTo = async (g: GoalRow, n: number) => {
    const before = g.status === 'achieved'
    await setGoalProgress(g, n)
    if (!before && n >= g.target) { setCheer(g.id); window.setTimeout(() => setCheer((c) => (c === g.id ? undefined : c)), 1300) }
  }
  // XP는 그 주에 먼저 이룬 3개까지
  const xpIds = useMemo(() => new Set(goals.filter((g) => g.status === 'achieved').sort((a, b) => (a.achieved_at ?? '').localeCompare(b.achieved_at ?? '')).slice(0, XP.kpiXpLimit).map((g) => g.id)), [goals])
  const done = goals.filter((g) => g.status === 'achieved').length
  return (
    <section className="growth-card">
      <div className="growth-card__head">
        <div className="seg">
          <button className={tab === 'this' ? 'is-on' : ''} onClick={() => setTab('this')}>이번 주</button>
          <button className={tab === 'next' ? 'is-on' : ''} onClick={() => setTab('next')}>다음 주</button>
        </div>
        <span className="growth-card__meta">{md(week)} – {md(addDays(week, 6))}{goals.length ? ` · ${done}/${goals.length}` : ''}</span>
      </div>
      {goals.map((g) => {
        const achieved = g.status === 'achieved'
        return (
          <div key={g.id} className={`row goal${achieved ? ' is-done' : ''}${cheer === g.id ? ' is-cheer' : ''}`}>
            <button className={`checkbox${achieved ? ' is-checked' : ''}`} aria-label={achieved ? '달성 취소' : '달성'}
              onClick={() => void progressTo(g, achieved ? (g.target > 1 ? g.target - 1 : 0) : g.target)}>
              {achieved && <Check strokeWidth={3} />}
            </button>
            <span className="row__title goal__title">{g.title}</span>
            {g.target > 1 && g.target <= 10 && (
              <span className="goal__dots" aria-label={`${g.progress}/${g.target}`}>
                {Array.from({ length: g.target }, (_, k) => (
                  <button key={k} className={k < g.progress ? 'is-on' : ''} aria-label={`${k + 1}번`} onClick={() => void progressTo(g, k + 1 === g.progress ? k : k + 1)} />
                ))}
                <span className="goal__dots-n">{g.progress}/{g.target}</span>
              </span>
            )}
            {g.target > 10 && (
              <span className="goal__count">
                <button aria-label="하나 빼기" onClick={() => void progressTo(g, g.progress - 1)}>−</button>
                {g.progress}/{g.target}
                <button aria-label="하나 더하기" onClick={() => void progressTo(g, g.progress + 1)}>+</button>
              </span>
            )}
            {cheer === g.id && <span className="goal__cheer"><Confetti count={14} spread={60} /></span>}
            {cheer === g.id && xpIds.has(g.id) && <span className="goal__float">+{XP.kpi}</span>}
            {achieved && (xpIds.has(g.id) ? <span className="goal__xp">+{XP.kpi}</span> : <span className="goal__xp is-muted">XP는 3개까지</span>)}
            <button className="goal__more" aria-label="목표 메뉴" onClick={(e) => setRowMenu({ goal: g, anchor: e.currentTarget })}><MoreHorizontal /></button>
          </div>
        )
      })}
      {rowMenu && (
        <Popover anchor={rowMenu.anchor} align="end" width={160} className="menu" onClose={() => setRowMenu(undefined)}>
          {tab === 'this' && rowMenu.goal.status !== 'achieved' && <MenuItem label="다음 주로 넘기기" onClick={() => { void carryOver(rowMenu.goal); setRowMenu(undefined) }} />}
          <MenuItem label="삭제" onClick={() => { void removeGoal(rowMenu.goal.id); setRowMenu(undefined) }} />
        </Popover>
      )}
      <div className="goal-add">
        <Plus className="addbar__icon" />
        <input
          className="addbar__input"
          placeholder={full ? `${tab === 'this' ? '이번' : '다음'} 주는 ${XP.goalsPerWeek}개까지 적을 수 있어요` : `${tab === 'this' ? '이번' : '다음'} 주에 하고 싶은 일 추가`}
          disabled={goals.length >= XP.goalsPerWeek}
          onKeyDown={async (e) => {
            if (e.nativeEvent.isComposing || e.key !== 'Enter') return
            const v = e.currentTarget.value.trim()
            if (!v) return
            const input = e.currentTarget
            const r = await addGoal(week, v)
            setFull(r === 'full')
            if (r === 'ok') input.value = ''
          }}
        />
      </div>
      {!goals.length && <p className="growth-card__empty">예: 논문 하나 읽기 · 운동 3번 · 포트폴리오 첫 장 쓰기</p>}
    </section>
  )
}

/** ③ 이번 주 XP: 날짜별 내역 */
function XpCard({ events }: { events: XpRow[] }) {
  const week = thisWeek()
  const mine = events.filter((e) => e.day >= week)
  const total = mine.reduce((s, e) => s + e.amount, 0)
  const days = [...new Set(mine.map((e) => e.day))].sort().reverse()
  const today = dayKey()
  const titles = useQuery<{ id: string; title: string }>(`SELECT id, title FROM tasks WHERE id IN (${mine.map(() => '?').join(',') || "''"}) UNION ALL SELECT id, title FROM kpis WHERE id IN (${mine.map(() => '?').join(',') || "''"})`, [...mine.map((e) => e.ref_id), ...mine.map((e) => e.ref_id)]) ?? []
  const name = (id: string) => titles.find((t) => t.id === id)?.title ?? ''
  const label = (e: XpRow) => e.kind === 'task' ? `할 일 완료 · ${name(e.ref_id)}` : e.kind === 'task_revoke' ? `완료 취소 · ${name(e.ref_id)}` : e.kind === 'kpi' ? `목표 달성 · ${name(e.ref_id)}` : e.kind === 'kpi_revoke' ? `목표 취소 · ${name(e.ref_id)}` : e.amount > 0 ? '이번 주 목표 모두 달성' : '모두 달성 취소'
  return (
    <section className="growth-card">
      <div className="growth-card__head"><h3 className="growth-card__title">이번 주 XP</h3><span className="growth-card__meta">{total >= 0 ? '+' : ''}{total}</span></div>
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
    </section>
  )
}
