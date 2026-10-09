// 말랑 아이콘 렌더러(데스크톱) — 그림 데이터는 @sprout/tokens/softIcons(휴대폰과 같은 것). 44 §4: 스마트 목록 20 · 설정 행 · 빈 상태 88.
// 할 일 자리의 "빛·글로우" 금지(44 ⓑ)와 별개로, 아이콘 면의 둥근 음영은 44 §4 말랑 아이콘 화풍이다.
import { SHADE_GEOM, TODAY_DIGIT, shadeId, shadeStops, shadesOf, softIcon, type SoftIconName, type SoftPaint, type SoftShape } from '@sprout/tokens/softIcons'

const paint = (p: SoftPaint) => (p === 'gloss' ? 'url(#soft-gloss)' : typeof p === 'object' ? `url(#${shadeId(p.shade)})` : p)

function Shape({ s }: { s: SoftShape }) {
  if (s.t === 'text') return <text x={s.x} y={s.y} textAnchor="middle" fontSize={s.size} fontWeight={800} fill={s.fill} fontFamily="var(--font-family)">{s.text}</text>
  const line = 'stroke' in s && s.stroke ? { stroke: s.stroke, strokeWidth: s.sw, strokeOpacity: s.so } : {}
  if (s.t === 'path') return <path d={s.d} fill={paint(s.fill)} {...line} strokeLinejoin="round" strokeLinecap={s.cap ? 'round' : undefined} opacity={s.op} />
  if (s.t === 'rect') return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} fill={paint(s.fill)} {...line} opacity={s.op} />
  return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={paint(s.fill)} {...line} opacity={s.op} transform={s.rot ? `rotate(${s.rot} ${s.cx} ${s.cy})` : undefined} />
}

export function SoftIcon({ name, size = 20, day, className }: { name: SoftIconName; size?: number; day?: number; className?: string }) {
  const shapes = softIcon(name)
  return (
    <svg className={`soft-ic${className ? ` ${className}` : ''}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <defs>
        {shadesOf(shapes).map((h) => (
          <radialGradient key={h} id={shadeId(h)} cx={SHADE_GEOM.cx} cy={SHADE_GEOM.cy} r={SHADE_GEOM.r} fx={SHADE_GEOM.fx} fy={SHADE_GEOM.fy}>
            {shadeStops(h).map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
          </radialGradient>
        ))}
        <radialGradient id="soft-gloss" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset=".55" stopColor="#fff" stopOpacity=".35" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {shapes.map((s, i) => <Shape key={i} s={s} />)}
      {name === 'today' && day != null && <text x={TODAY_DIGIT.x} y={TODAY_DIGIT.y} textAnchor="middle" fontSize={TODAY_DIGIT.size} fontWeight={800} fill={TODAY_DIGIT.fill} fontFamily="var(--font-family)">{day}</text>}
    </svg>
  )
}
