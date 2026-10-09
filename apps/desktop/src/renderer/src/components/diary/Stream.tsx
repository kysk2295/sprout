import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { revealNext, type TextStream } from '@sprout/schema/diaryTalk'
import type { Buddy } from '../../data/diary'
import { CharacterArt, type CharacterMood } from '../growth/CharacterArt'

// 28 §8.11 · 15 §10.11 받는 글 — 저장소(createTextStream)를 이 부품들만 구독한다. 대화 칸(useTalk) 전체는 글이 붙을 때 다시 그리지 않는다.

/** 받은 글을 프레임마다 조금씩(revealNext). 움직임 줄이기면 받은 그대로 */
export function useRevealed(stream: TextStream, reduced: boolean) {
  const snap = useSyncExternalStore(stream.subscribe, stream.get)
  const [n, setN] = useState(() => (reduced ? snap.text.length : Math.min(snap.shown, snap.text.length)))
  const pos = useRef(n)
  useEffect(() => {
    const target = snap.text
    if (reduced) { pos.current = target.length; setN(target.length); stream.mark(target.length); return }
    if (pos.current > target.length) pos.current = 0
    let raf = 0
    let last = performance.now()
    const step = () => {
      const t = performance.now()
      const r = revealNext(pos.current, target, t - last)
      last = t
      pos.current = r.pos
      setN(r.shown)
      stream.mark(r.shown)
      if (r.shown < target.length) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [snap.seq, reduced]) // eslint-disable-line react-hooks/exhaustive-deps
  return { text: snap.text.slice(0, n), title: snap.title, full: snap.text }
}

/** 받는 말풍선 안 글 — 이 부품만 다시 그린다 */
export function StreamText({ stream, reduced }: { stream: TextStream; reduced: boolean }) {
  return <>{useRevealed(stream, reduced).text}</>
}

/** 말풍선 얼굴: think면 좌우 3° 흔들림(40 §7, 움직임 줄이기면 얼굴만) */
export function BubbleFace({ buddy, mood, live, think, reduced, ring }: { buddy: Buddy & { stage: number }; mood: CharacterMood; live: boolean; think?: boolean; reduced: boolean; ring?: string }) {
  return (
    <span className={`dmsg__av${think ? ' is-think' : ''}`} style={ring ? ({ '--ring': ring } as React.CSSProperties) : undefined}>
      <span className="dmsg__sway"><CharacterArt species={buddy.species} stage={buddy.stage} size={30} mood={mood} crop="bust" motion={live && !reduced ? 'idle' : 'still'} /></span>
    </span>
  )
}

/** 일기로 옮기는 중 카드: 생각 얼굴 · 진행 줄 · 흘러나오는 제목·본문(JSON은 안 보임) · 멈추기 */
export function DistillCard({ stream, buddy, name, again, reduced, onStop }: { stream: TextStream; buddy: Buddy & { stage: number }; name: string; again: boolean; reduced: boolean; onStop: () => void }) {
  const r = useRevealed(stream, reduced)
  return (
    <section className="ddraft is-distilling" aria-label="일기로 옮기는 중" aria-busy="true">
      <div className="ddistill__head">
        <BubbleFace buddy={buddy} mood="think" live think reduced={reduced} />
        <b>{again ? '한 번 더 옮기는 중…' : '일기로 옮기는 중…'}</b>
        <button className="dbtn is-ghost is-sm" onClick={onStop}>멈추기</button>
      </div>
      <div className="dprog" role="progressbar" aria-label="옮기는 중"><i /></div>
      {r.title && <div className="ddistill__title">{r.title}</div>}
      {r.text ? <p className="ddistill__body">{r.text}</p> : <p className="ddraft__note">{name}의 말은 빼고 내 말로 옮기고 있어</p>}
    </section>
  )
}
