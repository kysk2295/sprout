// iOS formSheet(react-native-screens 4.x)는 시트 크기가 정해질 때마다(열릴 때·끌어 올려 전체·키보드로 커짐) 화면 안 ScrollView를
// 찾아 frame을 고친다(RNSScreen.mm applyFrameCorrectionForDescendantScrollView). 찾는 길은 두 가지:
//  ① 내용 래퍼의 바로 아래 자식이 ScrollView면 크기만 맞춘다(문제없음).
//  ② 아니면 "첫 자식 → 첫 자식 …" 줄을 따라 내려가 처음 만난 ScrollView의 frame을 **화면 frame(원점 포함)**으로 덮어쓴다.
// 우리 시트 화면은 모두 "루트 View(배경색) → ScrollView" 모양이라 ②를 탄다 → ScrollView가 시트 높이만큼 아래로 밀려 내용이
// 시트 밖으로 나가고 **시트가 하얗게 빈다**(태그·이동 시트는 열자마자, 상세·날짜는 크기가 바뀔 때).
// 첫 자식 줄 맨 앞에 0 높이 View를 두면 ②의 탐색이 거기서 멈춘다. ScrollView 크기는 RN 레이아웃(flex)이 이미 시트에 맞춘다.
//
// 화면마다 넣다 빠뜨리지 않게 스택에서 한 번에 건다: formSheet로 뜨는 모든 화면을 <View flex 1>[가드, 화면]으로 감싼다.
//   <Stack screenLayout={sheetScreenLayout}> — 뿌리(app/_layout)·일기(app/diary/_layout) 스택에 달려 있다.
// formSheet를 띄우는 스택(작업 지도 app/map/_layout 등)을 만들거나 고치면 같은 screenLayout을 단다. 화면 안에 따로 넣을 필요 없다.
import type { ReactElement } from 'react'
import { View } from 'react-native'

export function SheetScrollGuard() {
  return <View collapsable={false} pointerEvents="none" style={{ height: 0 }} />
}

export function sheetScreenLayout({ children, options }: { children: ReactElement; options: { presentation?: string } }): ReactElement {
  if (options.presentation !== 'formSheet') return children
  return (
    <View collapsable={false} style={{ flex: 1 }}>
      <SheetScrollGuard />
      {children}
    </View>
  )
}
