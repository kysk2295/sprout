import { ChevronLeft, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { QUESTIONS, scoreSurvey, SPECIES, speciesFrom, type Pick2, type Species } from '@sprout/schema/growth'
import { assignCharacter } from '../../data/growth'
import { CharacterArt } from './CharacterArt'

// 10 §2.2 일하는 스타일 조사: 시작 → 8문항(+동점 문항) → 결과·이름 짓기
const MAIN = QUESTIONS.filter((q) => !q.tiebreak)
const DESC: Record<Species, string[]> = {
  turtle: ['정한 일을 끝까지 해내는 힘이 있어요.', '큰 일도 차근차근 나누면 반드시 끝내요.', 'sprout이 큰 목표를 작은 단계로 나눠 드릴게요.'],
  squirrel: ['여러 일을 빠짐없이 챙기는 정리왕이에요.', '목록이 깔끔할수록 마음이 편해요.', 'sprout이 리스트마다 균형 있게 목표를 제안할게요.'],
  cat: ['꽂힌 일에는 누구보다 깊이 빠져들어요.', '흐름을 탈 때 가장 큰 성과를 내요.', 'sprout이 몰입한 시간을 성장으로 바꿔 드릴게요.'],
  otter: ['아이디어가 많고 손이 빨라요.', '작은 완료를 자주 쌓을 때 신나요.', 'sprout이 작은 성공을 자주 모을 수 있게 도울게요.']
}

export function SurveyDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'intro' | 'quiz' | 'result'>('intro')
  const [answers, setAnswers] = useState<Record<string, Pick2>>({})
  const [i, setI] = useState(0)
  const [name, setName] = useState('')
  const score = useMemo(() => scoreSurvey(answers), [answers])
  // 8문항 뒤 동점인 축이 있으면 그 축의 동점 문항을 더 묻는다
  const queue = useMemo(() => {
    const done = MAIN.every((q) => answers[q.id])
    const extra = done ? QUESTIONS.filter((q) => q.tiebreak && score[q.axis].tie) : []
    return [...MAIN, ...extra]
  }, [answers, score])
  const species = speciesFrom(score)

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const pick = (p: Pick2) => {
    const q = queue[i]
    const next = { ...answers, [q.id]: p }
    setAnswers(next)
    const s = scoreSurvey(next)
    const allMain = MAIN.every((x) => next[x.id])
    if (allMain && speciesFrom(s)) { setName(SPECIES[speciesFrom(s)!].name.split(' ').pop() ?? ''); setStep('result'); return }
    setI(i + 1)
  }

  const q = queue[i]
  return createPortal(
    <div className="modal-scrim survey-scrim">
      <div className="survey" role="dialog" aria-label="일하는 스타일 조사">
        <button className="survey__close icon-btn" aria-label="닫기" onClick={onClose}><X /></button>
        {step === 'intro' && (
          <div className="survey__intro">
            <div className="survey__lineup">{(['turtle', 'squirrel', 'cat', 'otter'] as Species[]).map((s) => <CharacterArt key={s} species={s} size={64} />)}</div>
            <h2>나와 닮은 친구를 찾아볼까요?</h2>
            <p>할 일을 다루는 방식에 대한 질문 8개에 답하면, 나와 닮은 친구가 알에서 깨어나요. 그 친구는 내가 할 일을 끝낼 때마다 자라요.</p>
            <button className="survey__primary" onClick={() => setStep('quiz')}>시작하기</button>
            <button className="survey__link" onClick={onClose}>나중에</button>
          </div>
        )}
        {step === 'quiz' && q && (
          <div className="survey__quiz">
            <div className="survey__top">
              <button className="icon-btn" aria-label="이전" disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft /></button>
              <div className="survey__progress"><span style={{ width: `${((i) / MAIN.length) * 100}%` }} /></div>
              <span className="survey__count">{Math.min(i + 1, queue.length)}/{MAIN.length}</span>
            </div>
            <h2 className="survey__q">{q.text}</h2>
            <div className="survey__choices">
              <button className={answers[q.id] === 'A' ? 'is-on' : ''} onClick={() => pick('A')}>{q.a}</button>
              <button className={answers[q.id] === 'B' ? 'is-on' : ''} onClick={() => pick('B')}>{q.b}</button>
            </div>
          </div>
        )}
        {step === 'result' && species && (
          <div className="survey__result">
            <div className="survey__hatch"><CharacterArt species={species} stage={1} size={140} mood="happy" /></div>
            <p className="survey__eyebrow">당신은</p>
            <h2>{SPECIES[species].name}형</h2>
            <ul className="survey__desc">{DESC[species].map((d) => <li key={d}>{d}</li>)}</ul>
            <div className="survey__axes">
              <Axis left="계획" right="즉흥" ratio={score.plan.ratioA} />
              <Axis left="몰입" right="멀티" ratio={score.focus.ratioA} />
            </div>
            <label className="survey__name">이름을 지어 주세요<input value={name} maxLength={12} onChange={(e) => setName(e.target.value)} /></label>
            <button className="survey__primary" disabled={!name.trim()} onClick={async () => {
              await assignCharacter(species, `${score.plan.leanA ? 'plan' : 'flow'}-${score.focus.leanA ? 'deep' : 'multi'}`, answers, name.trim())
              onClose()
            }}>키우기 시작</button>
            <button className="survey__link" onClick={() => { setAnswers({}); setI(0); setStep('quiz') }}>다시 하기</button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

function Axis({ left, right, ratio }: { left: string; right: string; ratio: number }) {
  const pct = Math.round(ratio * 100)
  return (
    <div className="survey__axis">
      <span className={pct >= 50 ? 'is-strong' : ''}>{left} {pct}%</span>
      <div className="survey__axisbar"><span style={{ width: `${pct}%` }} /></div>
      <span className={pct < 50 ? 'is-strong' : ''}>{right} {100 - pct}%</span>
    </div>
  )
}
