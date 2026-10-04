import { Check, ChevronDown, ChevronRight, Circle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { readTextJson, weekLabel, XP, type WeeklyStats } from '@sprout/schema/growth'
import { carryMissed, markReportSeen, retryReport, thisWeek, useWeeklyReports, type ReportRow } from '../../data/growth'
import { useQuery } from '../../data/useQuery'
import './growth-report.css'

// 10 §5 오른쪽 칸: 주간 리포트 목록 — 주 행을 누르면 아래에 펼친다(가장 최근 주는 처음부터 펼침)
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`)
const sameTitle = (a: string, b: string) => a.replace(/\s+/g, '') === b.replace(/\s+/g, '')

export function WeeklyReports() {
  const reports = useWeeklyReports()
  const [openWeek, setOpenWeek] = useState<string | null>()
  const shown = openWeek === undefined ? reports?.[0]?.week_start : openWeek
  const opened = reports?.find((r) => r.week_start === shown)
  // 펼치면 본 것으로
  useEffect(() => { if (opened && !opened.seen_at) void markReportSeen(opened.id) }, [opened])
  return (
    <section className="growth-card">
      <h3 className="growth-card__title">주간 리포트</h3>
      {reports && !reports.length && <p className="growth-card__empty">한 주가 끝나면 이번 주에 해낸 것과 다음 주 제안이 여기에 쌓여요.</p>}
      {reports?.map((r) => {
        const on = r.week_start === shown
        return (
          <div key={r.id} className="report">
            <button className={`report__row${on ? ' is-open' : ''}`} aria-expanded={on} onClick={() => setOpenWeek(on ? null : r.week_start)}>
              {on ? <ChevronDown className="report__chev" /> : <ChevronRight className="report__chev" />}
              <span className="report__label">{weekLabel(r.week_start)}</span>
              {!r.seen_at && <span className="report__dot" aria-label="새 리포트" />}
              <span className="report__xp">{r.xp_total >= 0 ? '+' : ''}{r.xp_total} XP</span>
            </button>
            {on && <ReportDetail row={r} />}
          </div>
        )
      })}
    </section>
  )
}

function ReportDetail({ row }: { row: ReportRow }) {
  const stats = JSON.parse(row.stats_json) as WeeklyStats
  const text = readTextJson(row.text_json)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const week = thisWeek()
  const current = useQuery<{ title: string }>('SELECT title FROM kpis WHERE week_start = ?', [week]) ?? []
  const full = current.length >= XP.goalsPerWeek
  const retry = async () => {
    setBusy(true)
    setFailed(false)
    try { setFailed((await retryReport(row.week_start)) === 'unavailable') } finally { setBusy(false) }
  }
  const lead = [...stats.topTags.map((t) => `#${t.name} ${t.count}`), ...stats.topLists.map((l) => `${l.name} ${l.count}`)]
  return (
    <div className="report__body">
      <div className="chips report__chips">
        <span className="chip">완료 <b>{stats.completed}</b></span>
        {stats.scheduledMinutes > 0 && <span className="chip">일정 <b>{hm(stats.scheduledMinutes)}</b></span>}
        {stats.goals.length > 0 && <span className="chip">목표 <b>{stats.goalsAchieved}/{stats.goals.length}</b></span>}
        <span className="chip"><b>{stats.xp.total >= 0 ? '+' : ''}{stats.xp.total}</b> XP</span>
      </div>

      {!text.report && (
        text.reportTried
          ? <p className="report__ai is-muted">이번 주 문장은 만들지 못했어요. 숫자 리포트만 남겨 둘게요.</p>
          : (
            <p className="report__ai">
              {busy ? '리포트를 쓰는 중…' : failed ? '아직 AI에 연결할 수 없어요.' : '지금은 AI를 쓸 수 없어요.'}
              {!busy && <button className="report__retry" onClick={() => void retry()}>다시 시도</button>}
            </p>
          )
      )}

      <h4 className="report__h">해낸 것</h4>
      {text.report && <p className="report__text">{text.report.done}</p>}
      {lead.length > 0 ? <p className="report__meta">많이 한 것 · {lead.join(' · ')}</p> : !text.report && <p className="report__meta">완료한 할 일 {stats.completed}개</p>}

      <h4 className="report__h">목표 결과</h4>
      {stats.goals.length === 0 && <p className="report__meta">이 주에는 목표가 없었어요.</p>}
      {stats.goals.map((g) => {
        const carried = current.some((c) => sameTitle(c.title, g.title))
        return (
          <div key={g.id} className={`report-goal${g.achieved ? ' is-done' : ''}`}>
            {g.achieved ? <Check className="report-goal__icon" strokeWidth={3} /> : <Circle className="report-goal__icon" />}
            <span className="report-goal__title">{g.title}</span>
            {g.target > 1 && <span className="report-goal__n">{g.progress}/{g.target}</span>}
            {!g.achieved && row.week_start < week && (
              carried ? <span className="report-goal__carried">넘김</span>
                : <button className="report-goal__carry" disabled={full} title={full ? `이번 주는 ${XP.goalsPerWeek}개까지예요` : undefined} onClick={() => void carryMissed(g)}>이번 주로 넘기기</button>
            )}
          </div>
        )
      })}
      {text.report && <p className="report__text">{text.report.goals}</p>}

      {text.report && (
        <>
          <h4 className="report__h">다음 주 제안</h4>
          <ul className="report__next">{text.report.next.map((n) => <li key={n}>{n}</li>)}</ul>
        </>
      )}
    </div>
  )
}
