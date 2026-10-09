// 말랑 아이콘 렌더러(휴대폰) — 그림 데이터는 @sprout/tokens/softIcons(데스크톱과 같은 것). 44 §4: 서랍 스마트 목록 20 · 설정 행 32 · 빈 상태 88.
// 39 §11: 할 일 행 안에는 넣지 않는다(서랍·설정·빈 상태처럼 몇 개만 그리는 자리). memo — 같은 이름·크기면 다시 그리지 않음.
import { SHADE_GEOM, TODAY_DIGIT, shadeId, shadeStops, shadesOf, softIcon, type SoftIconName, type SoftPaint, type SoftShape } from '@sprout/tokens/softIcons'
import { memo } from 'react'
import Svg, { Defs, Ellipse, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg'

export type { SoftIconName }

/** 말랑 아이콘 뒤 옅은 칸 색(44 시안 설정 행 · 꿈틀 5색 옅은 면) — [라이트, 다크] */
const TILE = {
  sprout: ['#E3F5E6', 'rgba(79,191,106,0.16)'], sun: ['#FFF3D6', 'rgba(255,185,39,0.14)'], petal: ['#FFE6EE', 'rgba(255,127,166,0.15)'],
  sky: ['#E3F2FD', 'rgba(90,180,240,0.15)'], deep: ['#E8EDFD', 'rgba(78,117,242,0.18)'], plain: ['#EEF2EE', '#1F2420']
} as const
export type SoftTone = keyof typeof TILE
export const softTile = (tone: SoftTone, dark: boolean) => TILE[tone][dark ? 1 : 0]
const paint = (p: SoftPaint) => (p === 'gloss' ? 'url(#soft-gloss)' : typeof p === 'object' ? `url(#${shadeId(p.shade)})` : p)

function Shape({ s }: { s: SoftShape }) {
  if (s.t === 'text') return <SvgText x={s.x} y={s.y} textAnchor="middle" fontSize={s.size} fontWeight="800" fill={s.fill}>{s.text}</SvgText>
  const line = s.stroke ? { stroke: s.stroke, strokeWidth: s.sw, strokeOpacity: s.so } : {}
  if (s.t === 'path') return <Path d={s.d} fill={paint(s.fill)} {...line} strokeLinejoin="round" strokeLinecap={s.cap ? 'round' : undefined} opacity={s.op} />
  if (s.t === 'rect') return <Rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} fill={paint(s.fill)} {...line} opacity={s.op} />
  return <Ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={paint(s.fill)} {...line} opacity={s.op} transform={s.rot ? `rotate(${s.rot} ${s.cx} ${s.cy})` : undefined} />
}

export const SoftIcon = memo(function SoftIcon({ name, size = 20, day }: { name: SoftIconName; size?: number; day?: number }) {
  const shapes = softIcon(name)
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        {shadesOf(shapes).map((h) => (
          <RadialGradient key={h} id={shadeId(h)} cx={SHADE_GEOM.cx} cy={SHADE_GEOM.cy} r={SHADE_GEOM.r} fx={SHADE_GEOM.fx} fy={SHADE_GEOM.fy}>
            {shadeStops(h).map(([o, c]) => <Stop key={o} offset={o} stopColor={c} />)}
          </RadialGradient>
        ))}
        <RadialGradient id="soft-gloss" cx=".5" cy=".5" r=".5">
          <Stop offset="0" stopColor="#fff" stopOpacity={0.95} /><Stop offset=".55" stopColor="#fff" stopOpacity={0.35} /><Stop offset="1" stopColor="#fff" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {shapes.map((s, i) => <Shape key={i} s={s} />)}
      {name === 'today' && day != null ? <SvgText x={TODAY_DIGIT.x} y={TODAY_DIGIT.y} textAnchor="middle" fontSize={TODAY_DIGIT.size} fontWeight="800" fill={TODAY_DIGIT.fill}>{day}</SvgText> : null}
    </Svg>
  )
})
