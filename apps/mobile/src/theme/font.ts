// 44 §3.2 · 20 §2: 휴대폰 글꼴 = Pretendard(SIL OFL 1.1, 데스크톱과 같은 가족). 원본·라이선스 = assets/fonts/.
// - 글꼴 파일은 app.json의 expo-font 설정 플러그인이 앱 안에 넣는다(prebuild 때 — 실행 중 불러오기·스플래시 대기 없음).
//   iOS: UIAppFonts + 리소스, 가족 이름 "Pretendard" 아래 굵기 5개 → RN이 fontWeight로 가장 가까운 면을 고른다.
//   Android: res/font xml 가족 "Pretendard"(400·500·600·700·800) + ReactFontManager.addCustomFont → fontWeight가 면을 고른다.
//   그래서 화면 코드는 굵기마다 다른 이름을 쓸 필요 없이 지금처럼 fontWeight만 쓴다.
// - 전역 적용: 이 파일을 앱 진입점(index.ts) 맨 처음에 불러, react-native의 Text·TextInput을 "맨 앞에 { fontFamily } 하나를 붙이는"
//   얇은 부품으로 바꿔 둔다. 화면이 import { Text } 하기 전에 바뀌므로 화면 파일은 그대로다.
//   렌더마다 하는 일 = 고정 객체 하나를 style 배열 앞에 두는 것뿐(스타일 펼치기·상태·컨텍스트 없음 — 39 §11.4).
//   화면이 fontFamily를 직접 주면 그쪽이 이긴다(뒤에 오므로).
// - 글꼴이 안 들어간 옛 네이티브 빌드(prebuild 전)에서는 iOS·Android 모두 모르는 가족 이름 → 시스템 글꼴로 조용히 돌아간다.
import { createElement } from 'react'

export const FONT_FAMILY = 'Pretendard'
const BASE = { fontFamily: FONT_FAMILY } as const

type AnyComponent = ((props: Record<string, unknown>) => unknown) & Record<string, unknown>

function withFont(Base: AnyComponent, name: string): AnyComponent {
  // React 19: ref는 props로 들어오므로 펼치면 그대로 넘어간다.
  const Wrapped = ((props: Record<string, unknown>) =>
    createElement(Base as never, { ...props, style: props.style == null ? BASE : [BASE, props.style] })) as AnyComponent
  Object.assign(Wrapped, Base) // TextInput.State 같은 정적 값
  Wrapped.displayName = name
  ;(Wrapped as Record<string, unknown>).__sproutFont = true
  return Wrapped
}

function install(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require('react-native') as Record<string, AnyComponent>
  for (const name of ['Text', 'TextInput'] as const) {
    const Base = RN[name]
    if (!Base || Base.__sproutFont) continue // 빠른 새로 고침으로 두 번 불려도 한 번만
    const Wrapped = withFont(Base, name)
    Object.defineProperty(RN, name, { configurable: true, enumerable: true, get: () => Wrapped })
  }
}

install()
