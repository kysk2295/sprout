// 43 §19 연속 불꽃(데스크톱): 공용 FLAME 데이터로 그린 불꽃 + 성장 홈 칩 `N일 연속`(오늘 아직이면 꺼진 불꽃 + `· 오늘 하면 N+1일`).
import { FLAME, STREAK_HINT, streakText, type Streak } from '@sprout/schema/streak'
import { forwardRef, useId } from 'react'

export function Flame({ size = 16, lit }: { size?: number; lit: boolean }) {
  const c = lit ? FLAME.lit : FLAME.unlit
  const id = useId().replace(/:/g, '')
  return (
    <svg className="gs3-flame" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}o`} cx="0.48" cy="0.72" r="0.62">
          <stop offset="0" stopColor={c.outer[0]} /><stop offset="0.55" stopColor={c.outer[1]} /><stop offset="1" stopColor={c.outer[2]} />
        </radialGradient>
        <linearGradient id={`${id}i`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c.inner[0]} /><stop offset="1" stopColor={c.inner[1]} /></linearGradient>
      </defs>
      <ellipse cx={FLAME.shadow.cx} cy={FLAME.shadow.cy} rx={FLAME.shadow.rx} ry={FLAME.shadow.ry} fill="#0F2316" opacity={c.shadow} />
      <path d={FLAME.outer} fill={`url(#${id}o)`} />
      <path d={FLAME.inner} fill={`url(#${id}i)`} />
      {c.shine ? <path d={FLAME.shine} fill="#FFFFFF" opacity={c.shine} /> : null}
    </svg>
  )
}

/** 성장 홈 칩(예전 `한 날 N일` 자리) — 이정표 축하는 부르는 쪽이 이 요소에 WAAPI로 */
export const StreakChip = forwardRef<HTMLSpanElement, { streak: Streak }>(function StreakChip({ streak }, ref) {
  const t = streakText(streak)
  return (
    <span ref={ref} className={`gs3-pill gs3-glass gs3-streak${streak.today ? ' is-lit' : ''}`} title={STREAK_HINT} aria-label={t.a11y} role="img">
      <Flame lit={streak.today} />
      <b>{t.main}</b>
      {t.sub ? <em>· {t.sub}</em> : null}
    </span>
  )
})
