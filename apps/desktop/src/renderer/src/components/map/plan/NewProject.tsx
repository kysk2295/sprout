// 41 §2 `＋ 새 프로젝트` 한 줄 — 점선 카드가 그 자리에서 입력 카드로 바뀐다(창 없음). 빈 상태에서는 입력칸이 바로 보인다.
// 인식(날짜 하나·날짜 이름·아이콘)은 공용 parseProjectLine, 만들기는 data/projectDirect createProjectLine(태그 + ⚑ 할 일 하나뿐).
import { useEffect, useRef, useState } from 'react'
import { keyWordChips, mdWeek, dDay, parseProjectLine } from '@sprout/schema/planView'
import { splitPeople } from '@sprout/schema/projectScore'
import { createProjectLine } from '../../../data/projectDirect'
import { dayKey } from '../../../lib/dates'
import { EmojiPicker } from '../../EmojiPicker'
import { useToast } from '../../Toast'
import { highlightRecognized } from '../../DesktopEntry'
import './direct.css'

/** §2.5 예시 — 누르면 입력칸을 채운다(날짜 자리는 비워 두고 커서를 끝에) */
export const USE_EXAMPLES: { label: string; sub?: string; fill: string }[] = [
  { label: '자격증 시험', sub: '과목별 줄', fill: '투자자산운용사 시험 ' },
  { label: '공모전·해커톤', sub: '회의·조사·개발·제출', fill: 'K 데이터 공모전 ' },
  { label: '팀 과제·졸업작품', fill: '졸업작품 ' },
  { label: '장학금·지원사업', sub: '서류·면접·결과', fill: '창업지원장학금 ' },
  { label: '취업', sub: '회사별 줄', fill: '하반기 취업 ' },
  { label: '업무 프로젝트·행사', fill: '신제품 런칭 행사 ' },
  { label: '이사·여행', fill: '부산 이사 ' }
]
export function UseGuide({ onPick }: { onPick: (fill: string) => void }) {
  return (
    <div className="np-guide">
      <div className="np-guide__h">이럴 때 써요</div>
      <div className="np-guide__x">
        {USE_EXAMPLES.map((x) => <button key={x.label} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(x.fill)}>{x.label}{x.sub && <small>{x.sub}</small>}</button>)}
      </div>
      <div className="np-guide__no">이럴 땐 다른 걸 써요: 한 번 하고 끝나는 일은 리스트, 끝없이 하는 습관은 반복, 막연한 주제는 태그.</div>
    </div>
  )
}

/** 입력 카드(보드 점선 카드 자리 · 빈 상태 가운데). onDone = 만든 프로젝트 화면 열기 */
export function NewProjectCard({ onCancel, onDone, bare, focusKey }: { onCancel?: () => void; onDone: (tagId: string) => void; bare?: boolean; focusKey?: number }) {
  const toast = useToast()
  const today = dayKey()
  const [raw, setRaw] = useState('')
  const [word, setWord] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [team, setTeam] = useState('')
  const [emoji, setEmoji] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [scroll, setScroll] = useState(0)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const iconBtn = useRef<HTMLButtonElement>(null)
  useEffect(() => { input.current?.focus() }, [focusKey])
  const line = parseProjectLine(raw, today, word)
  const icon = emoji ?? line.icon
  const fill = (s: string) => { setRaw(s); requestAnimationFrame(() => { const el = input.current; if (el) { el.focus(); el.setSelectionRange(s.length, s.length) } }) }
  const reset = () => { setRaw(''); setWord(null); setTeam(''); setEmoji(null); setMore(false) }
  const save = async () => {
    if (!line.name || busy) return
    setBusy(true)
    try {
      const people = splitPeople(team)
      const r = await createProjectLine({ name: line.name, emoji: emoji ?? line.emoji ?? (line.icon !== '🚀' ? line.icon : null), day: line.day, word: line.word, team: people })
      toast.show(`'${line.name}' 프로젝트를 만들었어요${people.length ? ` · 팀원 ${people.length}명` : ''}`, r.undo)
      reset()
      onDone(r.tagId)
    } catch { toast.show('프로젝트를 만들지 못했어요. 다시 시도해 주세요.') } finally { setBusy(false) }
  }
  const key = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') { e.preventDefault(); void save() }
    else if (e.key === 'Escape' && onCancel) { e.preventDefault(); e.stopPropagation(); reset(); onCancel() }
  }
  return (
    <div className={`np${bare ? ' np--bare' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="np__field">
        {line.token && <span className="np__hl" aria-hidden="true"><span style={{ transform: `translateX(-${scroll}px)` }}>{highlightRecognized(raw, [line.token])}</span></span>}
        <input ref={input} className="np__in" value={raw} placeholder="예: 투자자산운용사 시험 11/23" aria-label="새 프로젝트" spellCheck={false}
          onChange={(e) => setRaw(e.target.value)} onScroll={(e) => setScroll(e.currentTarget.scrollLeft)} onKeyDown={key} />
      </div>
      <div className="np__prev">
        {!line.name ? <span>{raw.trim() ? '이름을 적어 주세요' : '이름과 날짜를 한 줄로 적어요'}</span> : <>
          <b>{icon} {line.name}</b>
          {line.day ? <><span>·</span><span className="np__date">⚑ {line.word} {mdWeek(line.day)}</span><span>· {dDay(line.day, today)}</span></> : <span>· 날짜 없이 만들어도 돼요</span>}
        </>}
      </div>
      {line.day && line.name && (
        <div className="np__words" role="radiogroup" aria-label="날짜 이름">
          {keyWordChips(line.starter.word).map((w) => <button key={w} type="button" role="radio" aria-checked={line.word === w} className={`np-chip${line.word === w ? ' is-on' : ''}`} onClick={() => { setWord(w); input.current?.focus() }}>{w}</button>)}
        </div>
      )}
      {more ? (
        <div className="np__more-open">
          <label><span>팀원</span><input className="np__sub" value={team} placeholder="예: 민수, 지은" aria-label="팀원" onChange={(e) => setTeam(e.target.value)} onKeyDown={key} /></label>
          <label><span>아이콘</span><button ref={iconBtn} type="button" className="np__icon" aria-label="아이콘 고르기" onClick={() => setPicking(true)}>{icon}</button></label>
        </div>
      ) : <button type="button" className="np__more" onClick={() => setMore(true)}>팀원 · 아이콘 ›</button>}
      <UseGuide onPick={fill} />
      <div className="np__acts">
        {onCancel && <button type="button" className="map-btn" onClick={() => { reset(); onCancel() }}>취소</button>}
        <button type="button" className="map-btn map-btn--primary" disabled={!line.name || busy} onClick={() => void save()}>만들기</button>
      </div>
      {picking && <EmojiPicker anchor={iconBtn.current} onPick={(e) => setEmoji(e)} onClose={() => setPicking(false)} />}
    </div>
  )
}
